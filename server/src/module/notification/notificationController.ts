import { Response, Request } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../common/db';
import { pushSubscriptions, users } from '../../common/db/schema';
import { env } from '../../common/config/env';
import { pushEnabled } from '../../common/services/pushService';
import { emailEnabled } from '../../common/services/emailService';
import type { AuthenticatedRequest } from '../../common/middlewares/authMiddleware';

/** GET /notifications/config: whether push and email are set up, and the public key a browser needs to subscribe. */
export const getNotificationConfig = (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: { push: pushEnabled(), publicKey: pushEnabled() ? env.VAPID_PUBLIC_KEY : null, email: emailEnabled() },
  });
};

const subscribeSchema = z.object({
  endpoint: z.string().url().max(2000).refine((u) => u.startsWith('https://'), 'Push endpoints are https'),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
});

/** POST /notifications/push/subscribe: this browser or phone gets push notifications for the signed-in person. */
export const subscribePush = async (req: AuthenticatedRequest, res: Response) => {
  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'That is not a valid push subscription' });
  const { endpoint, keys } = parsed.data;
  try {
    // The same browser can be used by different people over time: the latest sign-in owns the subscription
    await db
      .insert(pushSubscriptions)
      .values({ userId: req.userId!, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: (req.get('user-agent') ?? '').slice(0, 255) })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: req.userId!, p256dh: keys.p256dh, auth: keys.auth } });
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error saving push subscription:', err);
    res.status(500).json({ success: false, error: 'Could not turn on notifications' });
  }
};

/** POST /notifications/push/unsubscribe { endpoint }: stop push notifications on this browser. */
export const unsubscribePush = async (req: AuthenticatedRequest, res: Response) => {
  const parsed = z.object({ endpoint: z.string().max(2000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'endpoint is required' });
  try {
    await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, parsed.data.endpoint), eq(pushSubscriptions.userId, req.userId!)));
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error removing push subscription:', err);
    res.status(500).json({ success: false, error: 'Could not turn off notifications' });
  }
};

/** GET /notifications/preferences: your email choice, and how many of your devices get push. */
export const getPreferences = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [{ devices }] = await db.select({ devices: sql<number>`count(*)` }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, req.userId!));
    res.status(200).json({ success: true, data: { emailDrives: req.user!.emailDrives, pushDevices: Number(devices) } });
  } catch (err) {
    console.error('Error loading notification preferences:', err);
    res.status(500).json({ success: false, error: 'Could not load your notification settings' });
  }
};

/** PUT /notifications/preferences { emailDrives } */
export const setPreferences = async (req: AuthenticatedRequest, res: Response) => {
  const parsed = z.object({ emailDrives: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'emailDrives must be true or false' });
  try {
    await db.update(users).set({ emailDrives: parsed.data.emailDrives, updatedAt: new Date() }).where(eq(users.id, req.userId!));
    res.status(200).json({ success: true, data: { emailDrives: parsed.data.emailDrives } });
  } catch (err) {
    console.error('Error saving notification preferences:', err);
    res.status(500).json({ success: false, error: 'Could not save your notification settings' });
  }
};
