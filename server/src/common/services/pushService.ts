import webpush from 'web-push';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { pushSubscriptions } from '../db/schema';
import { env } from '../config/env';

export interface PushPayload {
  title: string;
  body: string;
  /** Where tapping the notification goes (a path or URL in the app) */
  url: string;
  /** A newer notification with the same tag replaces the older one */
  tag?: string;
}

export interface PushResult {
  sent: number;
  failed: number;
  /** Subscriptions the browser reported as gone, now removed */
  removed: number;
  skipped: boolean;
}

export const pushEnabled = () => Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

let configured = false;
const configure = () => {
  if (configured) return;
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
  configured = true;
};

type Subscription = { id: string; endpoint: string; p256dh: string; auth: string };

const CONCURRENCY = 10;

/**
 * Sends one push notification to each subscription (a person can have several: phone, laptop).
 * Subscriptions the push service says no longer exist (404 or 410) are deleted.
 */
export async function sendPush(subscriptions: Subscription[], payload: PushPayload): Promise<PushResult> {
  if (subscriptions.length === 0) return { sent: 0, failed: 0, removed: 0, skipped: false };
  if (!pushEnabled()) {
    console.warn(`Push is not set up (VAPID keys): ${subscriptions.length} notification(s) not sent.`);
    return { sent: 0, failed: 0, removed: 0, skipped: true };
  }
  configure();

  const body = JSON.stringify(payload);
  const result: PushResult = { sent: 0, failed: 0, removed: 0, skipped: false };

  const sendOne = async (s: Subscription) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 * 60 * 24 });
      result.sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        result.removed++;
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id)).catch(() => {});
      } else {
        result.failed++;
        console.error('Push failed:', status ?? (err instanceof Error ? err.message : err));
      }
    }
  };

  // A few at a time, so thousands of subscribers don't open thousands of connections at once
  const queue = [...subscriptions];
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let s = queue.shift(); s; s = queue.shift()) await sendOne(s);
    })
  );
  return result;
}
