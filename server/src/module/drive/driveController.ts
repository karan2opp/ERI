import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../common/db';
import { drives } from '../../common/db/schema';
import { and, asc, desc, eq, gte, ilike, like, lt, sql, type SQL } from 'drizzle-orm';
import { isUuid } from '../../common/utils/validation';

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

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

// Escape LIKE wildcards so a search for "%" or "_" matches literally
const likePattern = (search: string) => `%${search.replace(/[\\%_]/g, '\\$&')}%`;

/** Today as YYYY-MM-DD: the caller's local date if it sent a valid one, otherwise the server's. */
const todayFrom = (value: unknown) => (typeof value === 'string' && DATE.test(value) ? value : new Date().toLocaleDateString('en-CA'));

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().max(200).optional(),
  date: z.string().regex(DATE).optional(),
  when: z.enum(['upcoming', 'past', 'all']).default('upcoming'),
  today: z.string().optional(),
});

/**
 * GET /drives
 * Without `page`: every drive (what the map uses).
 * With `page`: one page of drives filtered by title search, an exact date and upcoming/past/all,
 * plus how many upcoming and past drives exist in total (for the history counts).
 * Dates are stored as YYYY-MM-DD strings, so comparing them as text is comparing them by date.
 */
export const getDrives = async (req: Request, res: Response) => {
  try {
    if (req.query.page === undefined) {
      const allDrives = await db.select().from(drives).orderBy(desc(drives.createdAt));
      return res.status(200).json({ success: true, data: allDrives });
    }

    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid filters' });
    }
    const { page, limit, search, date, when } = parsed.data;
    const today = todayFrom(parsed.data.today);

    const filters: SQL[] = [];
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
        .from(drives),
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

/** GET /drives/calendar?month=YYYY-MM: the days in that month that have drives, and how many. */
export const getDriveCalendar = async (req: Request, res: Response) => {
  const month = req.query.month;
  if (typeof month !== 'string' || !MONTH.test(month)) {
    return res.status(400).json({ success: false, error: 'month must look like 2026-10' });
  }
  try {
    const days = await db
      .select({ date: drives.date, count: sql<number>`count(*)` })
      .from(drives)
      .where(like(drives.date, `${month}-%`))
      .groupBy(drives.date)
      .orderBy(asc(drives.date));
    res.status(200).json({ success: true, data: days.map((d) => ({ date: d.date, count: Number(d.count) })) });
  } catch (err) {
    console.error('Error fetching drive calendar:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch drive calendar' });
  }
};

export const getDriveById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(404).json({ success: false, error: 'Drive not found' });
    }
    const drive = await db.select().from(drives).where(eq(drives.id, id));
    if (!drive || drive.length === 0) {
      return res.status(404).json({ success: false, error: 'Drive not found' });
    }
    res.status(200).json({ success: true, data: drive[0] });
  } catch (err) {
    console.error('Error fetching drive by id:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch drive' });
  }
};
