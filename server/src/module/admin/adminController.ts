import { Request, Response } from 'express';
import { db } from '../../common/db';
import { users, trees, careLogs } from '../../common/db/schema';
import { and, desc, eq, gte, ilike, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { ROLES } from '../../common/auth/roles';
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
    const treeCountResult = await db.select({ count: sql<number>`count(*)` }).from(trees);

    res.status(200).json({
      success: true,
      stats: {
        totalUsers: Number(userCountResult[0].count),
        totalTrees: Number(treeCountResult[0].count)
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

    const filters: SQL[] = [];
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
 * PATCH /admin/users/:id/role  { role: "USER" | "TEAM_MEMBER" | "ADMIN" }
 * Admins promote and demote people here. You can't change your own role, so there is always
 * at least one admin left.
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
