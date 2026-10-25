import { Request, Response } from 'express';
import { db } from '../../common/db';
import { users, trees, careLogs } from '../../common/db/schema';
import { and, asc, desc, eq, gte, ilike, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { CloudinaryService } from '../../common/services/cloudinaryService';
import { isUuid } from '../../common/utils/validation';
import { z } from 'zod';
import { normalizePhone } from '../../common/utils/phone';
import { ROLES, isAdminRole } from '../../common/auth/roles';
import { DRIVE_PHOTO_LIMIT_MAX, DRIVE_PHOTO_LIMIT_MIN, IMPACT_MAX, getSettings, updateSettings } from '../../common/services/settingsService';
import { needsWater } from '../../common/utils/careSchedule';
import type { AuthenticatedRequest } from '../../common/middlewares/authMiddleware';

// Access is enforced by requireAuth + requireAdmin in adminRoutes.

const parsePaging = (req: Request) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
  const search = typeof req.query.search === 'string' ? req.query.search : '';
  return { page, limit, search, offset: (page - 1) * limit };
};

// Escape LIKE wildcards so a search for "%" or "_" matches literally.
const likePattern = (search: string) => `%${search.replace(/[\\%_]/g, '\\$&')}%`;

export const getAdminStats = async (req: Request, res: Response) => {
  try {
    const userCountResult = await db.select({ count: sql<number>`count(*)` }).from(users);
    const treeCountResult = await db.select({ count: sql<number>`count(*)` }).from(trees).where(eq(trees.verificationStatus, 'VERIFIED'));
    const [{ pending }] = await db.select({ pending: sql<number>`count(*)` }).from(trees).where(eq(trees.verificationStatus, 'PENDING'));

    res.status(200).json({
      success: true,
      stats: {
        totalUsers: Number(userCountResult[0].count),
        totalTrees: Number(treeCountResult[0].count),
        // Trees whose photo an admin still has to check
        pendingTrees: Number(pending)
      }
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
};

export const getAdminUsers = async (req: Request, res: Response) => {
  try {
    const { page, limit, search, offset } = parsePaging(req);

    // Name, email or phone (phones are stored without spaces, so ignore formatting in what was typed)
    const digits = search.replace(/[\s\-().]/g, '');
    const whereClause = search
      ? or(
          ilike(users.name, likePattern(search)),
          ilike(users.email, likePattern(search)),
          digits ? ilike(users.phone, likePattern(digits)) : undefined
        )
      : undefined;

    const data = await db.select().from(users)
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await db.select({ count: sql<number>`count(*)` }).from(users).where(whereClause);
    const total = Number(countResult[0].count);

    res.status(200).json({ success: true, data, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('Error fetching admin users:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
};

const treeFilters = z.object({
  // Which date the from/to range applies to
  dateField: z.enum(['planted', 'watered', 'cared']).default('planted'),
  // Range as timestamps: the client sends the start of its local "from" day and the end of its "to" day
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  status: z.enum(['all', 'thirsty', 'healthy']).default('all'),
  // Only trees planted by this user
  userId: z.string().max(255).optional(),
});

/**
 * GET /admin/trees
 * Search by name/species, filter by a date range on when trees were planted, last watered or
 * last cared for, and by needs-water/healthy. Sorted by the chosen date, newest first.
 */
export const getAdminTrees = async (req: Request, res: Response) => {
  try {
    const { page, limit, search, offset } = parsePaging(req);
    const parsed = treeFilters.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid filters' });
    }
    const { dateField, from, to, status, userId } = parsed.data;
    const column = dateField === 'planted' ? trees.plantedAt : dateField === 'watered' ? trees.lastWateredAt : trees.lastCaredAt;

    // Trees waiting for review are in the Review tab, not here
    const filters: SQL[] = [eq(trees.verificationStatus, 'VERIFIED')];
    if (search) {
      filters.push(or(ilike(trees.name, likePattern(search)), ilike(trees.species, likePattern(search)), ilike(trees.address, likePattern(search)))!);
    }
    if (userId) filters.push(eq(trees.userId, userId));
    if (from) filters.push(gte(column, from));
    if (to) filters.push(lt(column, to));
    // Each tree is judged against its own watering interval
    if (status === 'thirsty') filters.push(needsWater);
    if (status === 'healthy') filters.push(sql`NOT ${needsWater}`);
    const where = filters.length ? and(...filters) : undefined;

    const [rows, [{ count }]] = await Promise.all([
      db
        .select({ tree: trees, ownerName: users.name })
        .from(trees)
        .leftJoin(users, eq(users.id, trees.userId))
        .where(where)
        // Newest first by the chosen date; trees never watered/cared for go last
        .orderBy(sql`${column} desc nulls last`, desc(trees.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(trees).where(where),
    ]);

    const total = Number(count);
    res.status(200).json({
      success: true,
      data: rows.map((r) => ({ ...r.tree, ownerName: r.ownerName })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    console.error('Error fetching admin trees:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch trees' });
  }
};

/**
 * PATCH /admin/users/:id/role  { role: "USER" | "TEAM_MEMBER" | "ADMIN" | "SUPER_ADMIN" }
 * Admins promote and demote people between user and team member. Making someone an admin or super
 * admin, or changing one, needs a super admin. You can't change your own role, so there is always
 * someone left at the top.
 */
export const setUserRole = async (req: AuthenticatedRequest, res: Response) => {
  const parsed = z.object({ role: z.enum(ROLES) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: `role must be one of ${ROLES.join(', ')}` });
  }
  const { id } = req.params;
  if (id === req.userId) {
    return res.status(400).json({ success: false, error: "You can't change your own role" });
  }
  try {
    const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, id));
    if (!target) return res.status(404).json({ success: false, error: 'User not found' });
    if ((isAdminRole(parsed.data.role) || isAdminRole(target.role)) && req.userRole !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, error: 'Only a super admin can make someone an admin or change an admin' });
    }
    const [updated] = await db.update(users).set({ role: parsed.data.role, updatedAt: new Date() }).where(eq(users.id, id)).returning();
    if (!updated) return res.status(404).json({ success: false, error: 'User not found' });
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error('Error changing user role:', error);
    res.status(500).json({ success: false, error: 'Failed to change the role' });
  }
};

/**
 * GET /admin/users/:id: one user's full profile for admins: their details (including phone, which is
 * not verified) and a summary of what they've done: trees planted and care actions by type.
 */
export const getAdminUser = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const [[planted], byType] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(trees).where(eq(trees.userId, id)),
      db
        .select({ actionType: careLogs.actionType, count: sql<number>`count(*)`, last: sql<Date | null>`max(${careLogs.performedAt})` })
        .from(careLogs)
        .where(eq(careLogs.userId, id))
        .groupBy(careLogs.actionType),
    ]);

    const careByType: Record<string, number> = {};
    let careTotal = 0;
    let lastActiveAt: Date | null = null;
    for (const row of byType) {
      careByType[row.actionType] = Number(row.count);
      careTotal += Number(row.count);
      const last = row.last ? new Date(row.last) : null;
      if (last && (!lastActiveAt || last > lastActiveAt)) lastActiveAt = last;
    }

    res.status(200).json({
      success: true,
      data: { user, stats: { treesPlanted: Number(planted.count), careTotal, careByType, lastActiveAt } },
    });
  } catch (error) {
    console.error('Error fetching admin user:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch the user' });
  }
};

/** GET /admin/users/:id/care?page=1&limit=10: a user's care actions, newest first, with the tree each was on. */
export const getAdminUserCare = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { page, limit, offset } = parsePaging(req);
  try {
    const [rows, [{ count }]] = await Promise.all([
      db
        .select({ log: careLogs, treeName: trees.name, treeId: trees.id })
        .from(careLogs)
        .innerJoin(trees, eq(trees.id, careLogs.treeId))
        .where(eq(careLogs.userId, id))
        .orderBy(desc(careLogs.performedAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(careLogs).where(eq(careLogs.userId, id)),
    ]);
    const total = Number(count);
    res.status(200).json({
      success: true,
      data: rows.map((r) => ({ ...r.log, treeName: r.treeName, treeId: r.treeId })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    console.error('Error fetching user care activity:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch care activity' });
  }
};

/**
 * GET /admin/trees/pending: trees whose photo the automatic check wasn't sure about, oldest first,
 * for an admin to approve or reject.
 */
export const getPendingTrees = async (req: Request, res: Response) => {
  try {
    const { page, limit, offset } = parsePaging(req);
    const where = eq(trees.verificationStatus, 'PENDING');
    const [rows, [{ count }]] = await Promise.all([
      db
        .select({ tree: trees, ownerName: users.name, ownerEmail: users.email })
        .from(trees)
        .leftJoin(users, eq(users.id, trees.userId))
        .where(where)
        .orderBy(asc(trees.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(trees).where(where),
    ]);
    const total = Number(count);
    res.status(200).json({
      success: true,
      data: rows.map((r) => ({ ...r.tree, ownerName: r.ownerName, ownerEmail: r.ownerEmail })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    console.error('Error fetching pending trees:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch trees to review' });
  }
};

/** POST /admin/trees/:id/review  { decision: 'APPROVE' | 'REJECT' }: approve puts the tree on the map, reject removes it and its photo. */
export const reviewTree = async (req: Request, res: Response) => {
  const parsed = z.object({ decision: z.enum(['APPROVE', 'REJECT']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'decision must be APPROVE or REJECT' });
  const { id } = req.params;
  if (!isUuid(id)) return res.status(404).json({ success: false, error: 'Tree not found' });

  try {
    const [tree] = await db.select().from(trees).where(eq(trees.id, id));
    if (!tree) return res.status(404).json({ success: false, error: 'Tree not found' });
    if (tree.verificationStatus !== 'PENDING') {
      return res.status(409).json({ success: false, error: 'This tree has already been reviewed' });
    }

    if (parsed.data.decision === 'APPROVE') {
      const [approved] = await db
        .update(trees)
        .set({ verificationStatus: 'VERIFIED', verificationNote: null, updatedAt: new Date() })
        .where(and(eq(trees.id, id), eq(trees.verificationStatus, 'PENDING')))
        .returning();
      return res.status(200).json({ success: true, data: approved });
    }

    await db.delete(trees).where(and(eq(trees.id, id), eq(trees.verificationStatus, 'PENDING')));
    await CloudinaryService.deleteImage(tree.photoPublicId ?? undefined);
    res.status(200).json({ success: true, data: { id, removed: true } });
  } catch (error) {
    console.error('Error reviewing tree:', error);
    res.status(500).json({ success: false, error: 'Failed to review the tree' });
  }
};

/** GET /admin/settings: the app-wide switches (admins and super admins only). */
export const getAppSettings = async (_req: Request, res: Response) => {
  try {
    res.status(200).json({ success: true, data: await getSettings() });
  } catch (error) {
    console.error('Error loading settings:', error);
    res.status(500).json({ success: false, error: 'Failed to load the settings' });
  }
};

/** An https:// link, or empty. */
const httpsOrEmpty = (message: string) =>
  z.union([z.literal(''), z.string().trim().max(1000).refine((u) => /^https:\/\/[^\s.]+\.\S+$/i.test(u), { message })]);

/** A phone number with its country code (tidied to "+919876543210"), or empty. */
const phoneOrEmpty = (message: string) =>
  z
    .string()
    .trim()
    .max(40)
    .transform((v, ctx) => {
      if (!v) return '';
      const phone = normalizePhone(v);
      if (!phone) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message });
        return z.NEVER;
      }
      return phone;
    });

/** PATCH /admin/settings  { verifyUserPhotos?, verifyTeamPhotos?, drivePhotoLimit?, baselineTrees?, baselinePlantationDrives?, baselineCleanupDrives?, baselineWasteKg?, joinTeamFormUrl? }: whose tree photos are checked, how many pictures a drive can have, the home page's starting numbers and the "Join the team" form link. */
export const setAppSettings = async (req: AuthenticatedRequest, res: Response) => {
  const parsed = z
    .object({
      verifyUserPhotos: z.boolean().optional(),
      verifyTeamPhotos: z.boolean().optional(),
      drivePhotoLimit: z.number().int().min(DRIVE_PHOTO_LIMIT_MIN).max(DRIVE_PHOTO_LIMIT_MAX).optional(),
      // The starting numbers on the home page (what was done before the app)
      baselineTrees: z.number().int().min(0).max(IMPACT_MAX).optional(),
      baselinePlantationDrives: z.number().int().min(0).max(IMPACT_MAX).optional(),
      baselineCleanupDrives: z.number().int().min(0).max(IMPACT_MAX).optional(),
      baselineWasteKg: z.number().int().min(0).max(IMPACT_MAX).optional(),
      // A secure web address (the Google Form), or empty to take the button away
      joinTeamFormUrl: httpsOrEmpty('The join form link must start with https://').optional(),
      // Footer and Donate page details: each can be emptied again
      instagramUrl: httpsOrEmpty('The Instagram link must start with https://').optional(),
      youtubeUrl: httpsOrEmpty('The YouTube link must start with https://').optional(),
      contactEmail: z.union([z.literal(''), z.string().trim().max(200).email('That contact email does not look right')]).optional(),
      contactPhone: phoneOrEmpty('That contact phone number does not look right. Include the country code, like +91 98765 43210.').optional(),
      donateWhatsapp: phoneOrEmpty('That WhatsApp number does not look right. Include the country code, like +91 98765 43210.').optional(),
    })
    .refine((v) => Object.values(v).some((x) => x !== undefined), 'Send at least one setting')
    .safeParse(req.body);
  if (!parsed.success) {
    // The first problem, in words the admin can act on
    const issue = parsed.error.issues[0];
    const friendly = issue && issue.code === 'custom' ? issue.message : issue ? `${issue.path.join('.') || 'settings'}: ${issue.message}` : 'Send at least one setting';
    return res.status(400).json({ success: false, error: friendly });
  }
  try {
    res.status(200).json({ success: true, data: await updateSettings(parsed.data, req.userId!) });
  } catch (error) {
    console.error('Error saving settings:', error);
    res.status(500).json({ success: false, error: 'Failed to save the settings' });
  }
};
