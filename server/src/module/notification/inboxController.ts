import { Response } from 'express';
import { z } from 'zod';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../common/db';
import { notifications } from '../../common/db/schema';
import type { AuthenticatedRequest } from '../../common/middlewares/authMiddleware';
import { isUuid } from '../../common/utils/validation';
import { toClient } from '../../common/services/inbox';

const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const unreadCount = async (userId: string) => {
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(n);
};

/** GET /notifications/inbox?page=&limit=: your notifications, newest first, 10 a page, with how many are unread. */
export const getInbox = async (req: AuthenticatedRequest, res: Response) => {
  const parsed = pageQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid page' });
  const { page, limit } = parsed.data;
  const userId = req.userId!;
  try {
    const [rows, [{ total }], unread] = await Promise.all([
      db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(limit).offset((page - 1) * limit),
      db.select({ total: sql<number>`count(*)` }).from(notifications).where(eq(notifications.userId, userId)),
      unreadCount(userId),
    ]);
    res.status(200).json({
      success: true,
      data: rows.map(toClient),
      total: Number(total),
      unread,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(Number(total) / limit)),
    });
  } catch (err) {
    console.error('Error loading notifications:', err);
    res.status(500).json({ success: false, error: 'Failed to load your notifications' });
  }
};

/** GET /notifications/inbox/unread-count: just the number on the bell. */
export const getUnreadCount = async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.status(200).json({ success: true, data: { unread: await unreadCount(req.userId!) } });
  } catch (err) {
    console.error('Error counting notifications:', err);
    res.status(500).json({ success: false, error: 'Failed to count your notifications' });
  }
};

/** POST /notifications/inbox/:id/read: marks one of your own notifications as read. */
export const markRead = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(404).json({ success: false, error: 'Notification not found' });
  try {
    const [row] = await db
      .update(notifications)
      .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
      .where(and(eq(notifications.id, id), eq(notifications.userId, req.userId!)))
      .returning();
    if (!row) return res.status(404).json({ success: false, error: 'Notification not found' });
    res.status(200).json({ success: true, data: toClient(row), unread: await unreadCount(req.userId!) });
  } catch (err) {
    console.error('Error marking a notification read:', err);
    res.status(500).json({ success: false, error: 'Failed to update the notification' });
  }
};

/** POST /notifications/inbox/read-all */
export const markAllRead = async (req: AuthenticatedRequest, res: Response) => {
  try {
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, req.userId!), isNull(notifications.readAt)));
    res.status(200).json({ success: true, data: { unread: 0 } });
  } catch (err) {
    console.error('Error marking notifications read:', err);
    res.status(500).json({ success: false, error: 'Failed to update your notifications' });
  }
};
