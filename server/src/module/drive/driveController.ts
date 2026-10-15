import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../common/db';
import { drives } from '../../common/db/schema';
import { and, asc, desc, eq, gte, ilike, like, lt, sql, type SQL } from 'drizzle-orm';
import { isUuid } from '../../common/utils/validation';
import { DRIVE_TYPES, DRIVE_VISIBILITIES, canSeeTeamDrives } from '../../common/auth/roles';
import type { AuthenticatedRequest } from '../../common/middlewares/authMiddleware';

const httpUrl = z.string().max(1000).url().refine(u => /^https?:\/\//i.test(u), 'Must be an http(s) URL');

const createDriveSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().min(1).max(5000),
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  time: z.string().trim().regex(/^\d{1,2}:\d{2}$/, 'Use HH:MM'),
  // JSON body, so real numbers only (no coercion of "" or null to 0)
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  address: z.string().trim().max(500).optional(),
  googleMapsUrl: httpUrl.optional().or(z.literal('').transform(() => undefined)),
  type: z.enum(DRIVE_TYPES).default('PLANTATION'),
  // Team only unless the admin says otherwise, so a drive is never public by accident
  visibility: z.enum(DRIVE_VISIBILITIES).default('TEAM'),
});

export const createDrive = async (req: Request, res: Response) => {
  const parsed = createDriveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    });
  }

  try {
    const newDrive = await db.insert(drives).values(parsed.data).returning();
    res.status(201).json({ success: true, data: newDrive[0] });
  } catch (err) {
    console.error('Error creating drive:', err);
    res.status(500).json({ success: false, error: 'Failed to create drive' });
  }
};

/** PATCH /drives/:id  { type?, visibility? }: an admin changes what kind of drive it is or who can see it. */
export const updateDriveSettings = async (req: Request, res: Response) => {
  const parsed = z
    .object({ type: z.enum(DRIVE_TYPES).optional(), visibility: z.enum(DRIVE_VISIBILITIES).optional() })
    .refine((v) => v.type || v.visibility, 'Send a type or a visibility')
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'type must be PLANTATION or CLEANUP, visibility must be ALL or TEAM' });
  }
  const { id } = req.params;
  if (!isUuid(id)) return res.status(404).json({ success: false, error: 'Drive not found' });
  try {
    const [updated] = await db.update(drives).set(parsed.data).where(eq(drives.id, id)).returning();
    if (!updated) return res.status(404).json({ success: false, error: 'Drive not found' });
    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    console.error('Error updating drive:', err);
    res.status(500).json({ success: false, error: 'Failed to update the drive' });
  }
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

// Escape LIKE wildcards so a search for "%" or "_" matches literally
const likePattern = (search: string) => `%${search.replace(/[\\%_]/g, '\\$&')}%`;

/** Today as YYYY-MM-DD: the caller's local date if it sent a valid one, otherwise the server's. */
const todayFrom = (value: unknown) => (typeof value === 'string' && DATE.test(value) ? value : new Date().toLocaleDateString('en-CA'));

/**
 * Which drives this person may see. Team members and admins see everything; everyone else
 * (normal users and signed-out visitors) sees only drives marked for everyone.
 */
const visibleTo = (req: Request): SQL | undefined =>
  canSeeTeamDrives((req as AuthenticatedRequest).userRole) ? undefined : eq(drives.visibility, 'ALL');

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().max(200).optional(),
  date: z.string().regex(DATE).optional(),
  when: z.enum(['upcoming', 'past', 'all']).default('upcoming'),
  today: z.string().optional(),
  // Narrow by kind of drive, and (team members and admins only) by visibility
  type: z.enum(DRIVE_TYPES).optional(),
  visibility: z.enum(DRIVE_VISIBILITIES).optional(),
});

/**
 * GET /drives
 * Without `page`: every drive this person may see (what the map uses).
 * With `page`: one page filtered by title search, an exact date, upcoming/past/all, type and visibility,
 * plus how many upcoming and past drives exist in total for the filters that aren't search/date/when.
 * Dates are stored as YYYY-MM-DD strings, so comparing them as text is comparing them by date.
 */
export const getDrives = async (req: Request, res: Response) => {
  try {
    const scope = visibleTo(req);

    if (req.query.page === undefined) {
      const allDrives = await db.select().from(drives).where(scope).orderBy(desc(drives.createdAt));
      return res.status(200).json({ success: true, data: allDrives });
    }

    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid filters' });
    }
    const { page, limit, search, date, when, type, visibility } = parsed.data;
    const today = todayFrom(parsed.data.today);

    // What this person is allowed to see, narrowed by the type/visibility they asked for
    const base: SQL[] = [];
    if (scope) base.push(scope);
    if (type) base.push(eq(drives.type, type));
    if (visibility) base.push(eq(drives.visibility, visibility));
    const baseWhere = base.length ? and(...base) : undefined;

    const filters: SQL[] = [...base];
    if (search) filters.push(ilike(drives.title, likePattern(search)));
    if (date) filters.push(eq(drives.date, date));
    if (when === 'upcoming') filters.push(gte(drives.date, today));
    if (when === 'past') filters.push(lt(drives.date, today));
    const where = filters.length ? and(...filters) : undefined;

    // Upcoming: soonest first. Past and all: most recent first.
    const order = when === 'upcoming' ? [asc(drives.date), asc(drives.time)] : [desc(drives.date), desc(drives.time)];

    const [rows, [{ total }], [counts]] = await Promise.all([
      db.select().from(drives).where(where).orderBy(...order).limit(limit).offset((page - 1) * limit),
      db.select({ total: sql<number>`count(*)` }).from(drives).where(where),
      db
        .select({
          upcoming: sql<number>`count(*) filter (where ${drives.date} >= ${today})`,
          past: sql<number>`count(*) filter (where ${drives.date} < ${today})`,
        })
        .from(drives)
        .where(baseWhere),
    ]);

    res.status(200).json({
      success: true,
      data: rows,
      total: Number(total),
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(Number(total) / limit)),
      counts: { upcoming: Number(counts.upcoming), past: Number(counts.past) },
    });
  } catch (err) {
    console.error('Error fetching drives:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch drives' });
  }
};

/** GET /drives/calendar?month=YYYY-MM: the days in that month that have drives this person may see, and how many. */
export const getDriveCalendar = async (req: Request, res: Response) => {
  const month = req.query.month;
  if (typeof month !== 'string' || !MONTH.test(month)) {
    return res.status(400).json({ success: false, error: 'month must look like 2026-10' });
  }
  try {
    const scope = visibleTo(req);
    const days = await db
      .select({ date: drives.date, count: sql<number>`count(*)` })
      .from(drives)
      .where(scope ? and(like(drives.date, `${month}-%`), scope) : like(drives.date, `${month}-%`))
      .groupBy(drives.date)
      .orderBy(asc(drives.date));
    res.status(200).json({ success: true, data: days.map((d) => ({ date: d.date, count: Number(d.count) })) });
  } catch (err) {
    console.error('Error fetching drive calendar:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch drive calendar' });
  }
};

/**
 * GET /drives/:id. Drives for everyone are open to anyone. A team-only drive answers 401 to a
 * signed-out visitor ("sign in") and 403 to a signed-in user who isn't on the team.
 */
export const getDriveById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(404).json({ success: false, error: 'Drive not found' });
    }
    const [drive] = await db.select().from(drives).where(eq(drives.id, id));
    if (!drive) {
      return res.status(404).json({ success: false, error: 'Drive not found' });
    }
    if (drive.visibility === 'TEAM') {
      const r = req as AuthenticatedRequest;
      if (!r.userId) return res.status(401).json({ success: false, error: 'Sign in to see this drive' });
      if (!canSeeTeamDrives(r.userRole)) {
        return res.status(403).json({ success: false, error: 'This drive is for team members and admins' });
      }
    }
    res.status(200).json({ success: true, data: drive });
  } catch (err) {
    console.error('Error fetching drive by id:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch drive' });
  }
};
