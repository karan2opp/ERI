import { Request, Response } from 'express';
import { db } from '../../common/db';
import { users, trees } from '../../common/db/schema';
import { desc, ilike, or, sql } from 'drizzle-orm';

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

export const getAdminTrees = async (req: Request, res: Response) => {
  try {
    const { page, limit, search, offset } = parsePaging(req);

    const whereClause = search
      ? or(ilike(trees.name, likePattern(search)), ilike(trees.species, likePattern(search)))
      : undefined;

    const data = await db.select().from(trees)
      .where(whereClause)
      .orderBy(desc(trees.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await db.select({ count: sql<number>`count(*)` }).from(trees).where(whereClause);
    const total = Number(countResult[0].count);

    res.status(200).json({ success: true, data, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('Error fetching admin trees:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch trees' });
  }
};
