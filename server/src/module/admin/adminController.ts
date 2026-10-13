import { Request, Response } from 'express';
import { db } from '../../common/db';
import { users, trees } from '../../common/db/schema';
import { and, desc, eq, gte, ilike, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

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

    const whereClause = search
      ? or(ilike(users.name, likePattern(search)), ilike(users.email, likePattern(search)))
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

// A tree needs water once it has gone this long without watering (same rule as the app)
const THIRSTY_AFTER_MS = 48 * 60 * 60 * 1000;

const treeFilters = z.object({
  // Which date the from/to range applies to
  dateField: z.enum(['planted', 'watered', 'cared']).default('planted'),
  // Range as timestamps: the client sends the start of its local "from" day and the end of its "to" day
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  status: z.enum(['all', 'thirsty', 'healthy']).default('all'),
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
    const { dateField, from, to, status } = parsed.data;
    const column = dateField === 'planted' ? trees.plantedAt : dateField === 'watered' ? trees.lastWateredAt : trees.lastCaredAt;

    const filters: SQL[] = [];
    if (search) {
      filters.push(or(ilike(trees.name, likePattern(search)), ilike(trees.species, likePattern(search)), ilike(trees.address, likePattern(search)))!);
    }
    if (from) filters.push(gte(column, from));
    if (to) filters.push(lt(column, to));
    const thirstyBefore = new Date(Date.now() - THIRSTY_AFTER_MS);
    if (status === 'thirsty') filters.push(or(isNull(trees.lastWateredAt), lt(trees.lastWateredAt, thirstyBefore))!);
    if (status === 'healthy') filters.push(gte(trees.lastWateredAt, thirstyBefore));
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
