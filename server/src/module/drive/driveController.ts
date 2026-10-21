import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../common/db';
import { drivePhotos, drives, type Drive } from '../../common/db/schema';
import { and, asc, desc, eq, gte, ilike, like, lt, ne, or, sql, type SQL } from 'drizzle-orm';
import { isUuid } from '../../common/utils/validation';
import { DRIVE_TYPES, DRIVE_VISIBILITIES, canSeeTeamDrives, isAdminRole } from '../../common/auth/roles';
import type { AuthenticatedRequest } from '../../common/middlewares/authMiddleware';
import { CloudinaryService } from '../../common/services/cloudinaryService';
import { getSettings } from '../../common/services/settingsService';
import { NOTIFY_AUDIENCES, deliverDriveNotification, resolveRecipients, type NotifyAudience, type Recipients } from '../../common/services/driveNotifier';

const httpUrl = z.string().max(1000).url().refine(u => /^https?:\/\//i.test(u), 'Must be an http(s) URL');

const driveFields = {
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().min(1).max(5000),
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  time: z.string().trim().regex(/^\d{1,2}:\d{2}$/, 'Use HH:MM'),
  // JSON body, so real numbers only (no coercion of "" or null to 0)
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string().trim().max(500),
  googleMapsUrl: httpUrl.or(z.literal('')),
  type: z.enum(DRIVE_TYPES),
  visibility: z.enum(DRIVE_VISIBILITIES),
};

const createDriveSchema = z.object({
  title: driveFields.title,
  description: driveFields.description,
  date: driveFields.date,
  time: driveFields.time,
  latitude: driveFields.latitude.optional(),
  longitude: driveFields.longitude.optional(),
  address: driveFields.address.optional(),
  googleMapsUrl: driveFields.googleMapsUrl.optional().transform((v) => v || undefined),
  type: driveFields.type.default('PLANTATION'),
  // Team only unless the admin says otherwise, so a drive is never public by accident
  visibility: driveFields.visibility.default('TEAM'),
  // Who is told about it by email and push notification
  notify: z.enum(NOTIFY_AUDIENCES).default('TEAM'),
});

// Everyone can only be told about a drive that everyone can see
const audienceProblem = (visibility: string, notify: string) =>
  notify === 'EVERYONE' && visibility === 'TEAM' ? 'A team-only drive can only be announced to team members. Make it visible to everyone first.' : null;

/** What the admin sees after saving: how many people are being told. */
const notifying = (notify: NotifyAudience, r: Recipients) => ({ audience: notify, emails: r.emails.length, devices: r.subscriptions.length });

/**
 * A drive as this person may see it. The summary of a drive that isn't completed yet is a draft
 * only admins can read.
 */
export const present = (drive: Drive, req: Request): Drive =>
  drive.status === 'COMPLETED' || isAdminRole((req as AuthenticatedRequest).userRole) ? drive : { ...drive, summary: null };

/** Why this person can't open this drive, if they can't: a team-only drive needs a team member or admin. */
export const accessProblem = (drive: Drive, req: Request): { status: number; error: string } | null => {
  if (drive.visibility !== 'TEAM') return null;
  const r = req as AuthenticatedRequest;
  if (!r.userId) return { status: 401, error: 'Sign in to see this drive' };
  if (!canSeeTeamDrives(r.userRole)) return { status: 403, error: 'This drive is for team members and admins' };
  return null;
};

export const createDrive = async (req: Request, res: Response) => {
  const parsed = createDriveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    });
  }
  const { notify, ...fields } = parsed.data;
  const problem = audienceProblem(fields.visibility, notify);
  if (problem) return res.status(400).json({ success: false, error: problem });

  try {
    const [newDrive] = await db.insert(drives).values(fields).returning();
    const recipients = await resolveRecipients(notify, (req as AuthenticatedRequest).userId);
    res.status(201).json({ success: true, data: newDrive, notifying: notifying(notify, recipients) });
    // After answering: a big audience takes a while
    void deliverDriveNotification('CREATED', newDrive, recipients);
  } catch (err) {
    console.error('Error creating drive:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Failed to create drive' });
  }
};

const updateDriveSchema = z
  .object({
    title: driveFields.title,
    description: driveFields.description,
    date: driveFields.date,
    time: driveFields.time,
    latitude: driveFields.latitude,
    longitude: driveFields.longitude,
    address: driveFields.address,
    googleMapsUrl: driveFields.googleMapsUrl,
    type: driveFields.type,
    visibility: driveFields.visibility,
    // The write-up of how the drive went; empty clears it
    summary: z.string().trim().max(5000),
  })
  .partial()
  .extend({ notify: z.enum(NOTIFY_AUDIENCES).default('NONE') })
  .refine((v) => Object.keys(v).some((k) => k !== 'notify'), 'Send at least one thing to change');

/**
 * PATCH /drives/:id: an admin changes anything about a drive (title, description, date, time, place,
 * type, visibility). `notify` (NONE, TEAM or EVERYONE) tells people about the change.
 */
export const updateDrive = async (req: Request, res: Response) => {
  const parsed = updateDriveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
  }
  const { id } = req.params;
  if (!isUuid(id)) return res.status(404).json({ success: false, error: 'Drive not found' });
  const { notify, ...changes } = parsed.data;

  try {
    const [before] = await db.select().from(drives).where(eq(drives.id, id));
    if (!before) return res.status(404).json({ success: false, error: 'Drive not found' });

    const visibility = changes.visibility ?? before.visibility;
    const problem = audienceProblem(visibility, notify);
    if (problem) return res.status(400).json({ success: false, error: problem });

    // A completed drive keeps its summary: it can be rewritten but not emptied
    if (changes.summary === '' && before.status === 'COMPLETED') {
      return res.status(400).json({ success: false, error: 'A completed drive needs a summary. Write a new one instead of clearing it.' });
    }

    const values = {
      ...changes,
      googleMapsUrl: changes.googleMapsUrl === '' ? null : changes.googleMapsUrl,
      summary: changes.summary === '' ? null : changes.summary,
    };
    const [updated] = await db.update(drives).set(values).where(eq(drives.id, id)).returning();

    const recipients = await resolveRecipients(notify, (req as AuthenticatedRequest).userId);
    res.status(200).json({ success: true, data: updated, notifying: notifying(notify, recipients) });
    void deliverDriveNotification('UPDATED', updated, recipients);
  } catch (err) {
    console.error('Error updating drive:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Failed to update the drive' });
  }
};

/** DELETE /drives/:id?notify=NONE|TEAM|EVERYONE: an admin removes a drive and can tell people it is cancelled. */
export const deleteDrive = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(404).json({ success: false, error: 'Drive not found' });
  const asked = z.enum(NOTIFY_AUDIENCES).default('NONE').safeParse(req.query.notify ?? undefined);
  if (!asked.success) return res.status(400).json({ success: false, error: 'notify must be NONE, TEAM or EVERYONE' });
  const notify = asked.data;

  try {
    const [drive] = await db.select().from(drives).where(eq(drives.id, id));
    if (!drive) return res.status(404).json({ success: false, error: 'Drive not found' });
    const problem = audienceProblem(drive.visibility, notify);
    if (problem) return res.status(400).json({ success: false, error: problem });

    const pictures = await db.select({ publicId: drivePhotos.publicId }).from(drivePhotos).where(eq(drivePhotos.driveId, id));
    await db.delete(drives).where(eq(drives.id, id)); // its picture rows go with it
    void Promise.all(pictures.map((p) => CloudinaryService.deleteImage(p.publicId ?? undefined)));
    const recipients = await resolveRecipients(notify, (req as AuthenticatedRequest).userId);
    res.status(200).json({ success: true, data: { id, removed: true }, notifying: notifying(notify, recipients) });
    void deliverDriveNotification('CANCELLED', drive, recipients);
  } catch (err) {
    console.error('Error deleting drive:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Failed to delete the drive' });
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
      return res.status(200).json({ success: true, data: allDrives.map((d) => present(d, req)) });
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
    // A completed drive is history, even if its date is today
    if (when === 'upcoming') filters.push(gte(drives.date, today), ne(drives.status, 'COMPLETED'));
    if (when === 'past') filters.push(or(lt(drives.date, today), eq(drives.status, 'COMPLETED'))!);
    const where = filters.length ? and(...filters) : undefined;

    // Upcoming: soonest first. Past and all: most recent first.
    const order = when === 'upcoming' ? [asc(drives.date), asc(drives.time)] : [desc(drives.date), desc(drives.time)];

    const [rows, [{ total }], [counts]] = await Promise.all([
      db.select().from(drives).where(where).orderBy(...order).limit(limit).offset((page - 1) * limit),
      db.select({ total: sql<number>`count(*)` }).from(drives).where(where),
      db
        .select({
          upcoming: sql<number>`count(*) filter (where ${drives.date} >= ${today} and ${drives.status} <> 'COMPLETED')`,
          past: sql<number>`count(*) filter (where ${drives.date} < ${today} or ${drives.status} = 'COMPLETED')`,
        })
        .from(drives)
        .where(baseWhere),
    ]);

    res.status(200).json({
      success: true,
      data: rows.map((d) => present(d, req)),
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
    const problem = accessProblem(drive, req);
    if (problem) return res.status(problem.status).json({ success: false, error: problem.error });
    res.status(200).json({ success: true, data: present(drive, req) });
  } catch (err) {
    console.error('Error fetching drive by id:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch drive' });
  }
};
