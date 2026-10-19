import { Request, Response } from 'express';
import { getAuth } from '@clerk/express';
import { and, asc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../common/db';
import { trees } from '../../common/db/schema';
import { needsWater } from '../../common/utils/careSchedule';
import { latitudeSchema, longitudeSchema } from '../../common/utils/validation';

/** At this zoom and closer, the map gets one pin per tree; further out it gets clusters. */
export const CLUSTER_BELOW_ZOOM = 14;
/** At most this many individual pins in one answer; past it the answer is clusters instead. */
export const MAX_PINS = 500;
/** Roughly how wide (in screen pixels) one cluster cell is. */
const CLUSTER_CELL_PX = 80;

const bboxSchema = z
  .string()
  .transform((s) => s.split(',').map(Number))
  .refine((n) => n.length === 4 && n.every(Number.isFinite), 'bbox must be west,south,east,north')
  .refine(([w, s, e, n]) => w >= -180 && e <= 180 && s >= -90 && n <= 90 && w < e && s < n, 'bbox is out of range');

const pinsQuery = z
  .object({
    // The visible map area, used when there is no radius
    bbox: bboxSchema.optional(),
    zoom: z.coerce.number().int().min(0).max(22).default(16),
    // Or: every tree within `radius` metres of you (the 100 m / 500 m / 1 km filters)
    lat: latitudeSchema.optional(),
    lng: longitudeSchema.optional(),
    radius: z.coerce.number().positive().max(5000).optional(),
    status: z.enum(['all', 'thirsty', 'healthy']).default('all'),
    mine: z.enum(['true', 'false']).optional(),
  })
  .refine((q) => q.bbox || (q.lat !== undefined && q.lng !== undefined && q.radius), 'Send a bbox, or lat, lng and radius');

/** Metres from (lat, lng) to each tree (haversine), worked out in the database. */
const distanceFrom = (lat: number, lng: number) =>
  sql<number>`(6371000 * 2 * asin(sqrt(
    power(sin(radians(${trees.latitude} - ${lat}::double precision) / 2), 2) +
    cos(radians(${lat}::double precision)) * cos(radians(${trees.latitude})) *
    power(sin(radians(${trees.longitude} - ${lng}::double precision) / 2), 2)
  )))`;

/**
 * GET /trees/pins: what the map needs to draw, and nothing more.
 *
 * - With `bbox` and `zoom`: the trees in the visible area. Zoomed in (zoom >= 14) it returns one small
 *   row per tree (id, position, name, needs water). Zoomed out it returns clusters: one row per grid
 *   cell with a count, so a whole city is a few dozen rows.
 * - With `lat`, `lng` and `radius`: every tree within that many metres (the distance filters), nearest first.
 * - If more than 500 trees would come back, the answer is clusters instead, so every tree is still counted.
 *
 * Filters: status (needs water / healthy) and mine. Only verified trees, like the rest of the map.
 * Answers can be reused by the browser for 30 seconds.
 */
export const getTreePins = async (req: Request, res: Response) => {
  const parsed = pinsQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues.map((i) => i.message).join('; ') });
  }
  const q = parsed.data;

  let userId: string | null = null;
  if (q.mine === 'true') {
    userId = getAuth(req).userId ?? null;
    if (!userId) return res.status(401).json({ success: false, error: 'Sign in to see your trees' });
  }

  try {
    const filters: SQL[] = [eq(trees.verificationStatus, 'VERIFIED')];
    if (userId) filters.push(eq(trees.userId, userId));
    if (q.status === 'thirsty') filters.push(needsWater);
    if (q.status === 'healthy') filters.push(sql`NOT ${needsWater}`);

    const radiusMode = q.radius !== undefined && q.lat !== undefined && q.lng !== undefined;
    let distance: SQL<number> | null = null;
    if (radiusMode) {
      // A box around the circle first (uses the location index), then the exact distance. The box uses
      // the same Earth radius as the distance formula, plus 1%, so it always contains the whole circle.
      const metresPerDegree = (6_371_000 * Math.PI) / 180;
      const dLat = (q.radius! / metresPerDegree) * 1.01;
      const dLng = (q.radius! / (metresPerDegree * Math.max(Math.cos((q.lat! * Math.PI) / 180), 0.01))) * 1.01;
      filters.push(gte(trees.latitude, q.lat! - dLat), lte(trees.latitude, q.lat! + dLat));
      filters.push(gte(trees.longitude, q.lng! - dLng), lte(trees.longitude, q.lng! + dLng));
      distance = distanceFrom(q.lat!, q.lng!);
      filters.push(sql`${distance} <= ${q.radius}`);
    } else {
      const [w, s, e, n] = q.bbox!;
      filters.push(gte(trees.latitude, s), lte(trees.latitude, n), gte(trees.longitude, w), lte(trees.longitude, e));
    }
    const where = and(...filters);

    res.setHeader('Cache-Control', 'private, max-age=30');

    // ---- Zoomed in, or a distance filter: one row per tree, unless there are too many to draw
    if (radiusMode || q.zoom >= CLUSTER_BELOW_ZOOM) {
      const rows = await db
        .select({ id: trees.id, lat: trees.latitude, lng: trees.longitude, name: trees.name, needsWater: sql<boolean>`${needsWater}` })
        .from(trees)
        .where(where)
        .orderBy(distance ? asc(distance) : asc(trees.id))
        .limit(MAX_PINS + 1);
      if (rows.length <= MAX_PINS) {
        return res.status(200).json({ success: true, kind: 'trees', data: rows, empty: rows.length === 0 ? await noTreesAtAll() : false });
      }
      // More than 500 in view (a dense area): fall through to clusters, so every tree is still counted
    }

    // ---- Zoomed out, or too many trees in view: clusters
    const clusters = await clusterRows(where, q.zoom);
    res.status(200).json({ success: true, kind: 'clusters', data: clusters, empty: clusters.length === 0 ? await noTreesAtAll() : false });
  } catch (err) {
    console.error('Error loading tree pins:', err);
    res.status(500).json({ success: false, error: 'Failed to load the map' });
  }
};

/** Groups the matching trees into grid cells about 80 screen pixels wide at this zoom. */
async function clusterRows(where: SQL | undefined, zoom: number) {
  // The cell size is a number we compute from the zoom, never user text
  const cell = sql.raw(String(((360 / 2 ** zoom) * CLUSTER_CELL_PX) / 256));
  const cellX = sql`floor(${trees.longitude} / ${cell})`;
  const cellY = sql`floor(${trees.latitude} / ${cell})`;
  const rows = await db
    .select({
      lat: sql<number>`avg(${trees.latitude})`,
      lng: sql<number>`avg(${trees.longitude})`,
      count: sql<number>`count(*)`,
      thirsty: sql<number>`count(*) filter (where ${needsWater})`,
      // A cell with a single tree is drawn as that tree's pin
      id: sql<string | null>`case when count(*) = 1 then min(${trees.id}::text) end`,
      name: sql<string | null>`case when count(*) = 1 then min(${trees.name}) end`,
    })
    .from(trees)
    .where(where)
    .groupBy(cellX, cellY)
    .limit(2000);
  return rows.map((r) => ({
    lat: Number(r.lat),
    lng: Number(r.lng),
    count: Number(r.count),
    thirsty: Number(r.thirsty),
    ...(r.id ? { id: r.id, name: r.name } : {}),
  }));
}

/** True when there are no verified trees anywhere yet (the app then shows sample trees). */
async function noTreesAtAll(): Promise<boolean> {
  const [row] = await db.select({ id: trees.id }).from(trees).where(eq(trees.verificationStatus, 'VERIFIED')).limit(1);
  return !row;
}
