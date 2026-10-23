import { inArray, ne, and } from 'drizzle-orm';
import { db } from '../db';
import { notifications, users, type Drive, type Notification } from '../db/schema';
import { emitToUser } from '../realtime';
import type { NotifyAudience } from './driveNotifier';

export type InboxType = 'DRIVE_SCHEDULED' | 'USER_JOINED' | 'TREE_PLANTED';

interface NewNotice {
  type: InboxType;
  title: string;
  body?: string | null;
  link?: string | null;
}

/** What the app gets for one notification (the same shape as the inbox list). */
export const toClient = (n: Notification) => ({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, readAt: n.readAt, createdAt: n.createdAt });

const CHUNK = 500;

/**
 * Puts a notification in each person's bell and pushes it live to anyone online (their app plays a sound).
 * Never throws: a notification failing must not break what caused it.
 */
export async function notifyUsers(userIds: string[], notice: NewNotice): Promise<void> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  try {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const rows = await db
        .insert(notifications)
        .values(ids.slice(i, i + CHUNK).map((userId) => ({ userId, type: notice.type, title: notice.title.slice(0, 255), body: notice.body ?? null, link: notice.link ?? null })))
        .returning();
      for (const row of rows) emitToUser(row.userId, 'notification', toClient(row));
    }
  } catch (err) {
    console.error('Could not create notifications:', err);
  }
}

/** Admins and super admins, apart from whoever caused it. */
export async function notifyAdmins(notice: NewNotice, exceptUserId?: string): Promise<void> {
  try {
    const where = exceptUserId
      ? and(inArray(users.role, ['ADMIN', 'SUPER_ADMIN']), ne(users.id, exceptUserId))
      : inArray(users.role, ['ADMIN', 'SUPER_ADMIN']);
    const admins = await db.select({ id: users.id }).from(users).where(where);
    await notifyUsers(admins.map((a) => a.id), notice);
  } catch (err) {
    console.error('Could not notify admins:', err);
  }
}

/** "14:30" as "2:30 pm". */
const clock12 = (time: string | null | undefined): string => {
  const m = /^(\d{1,2}):(\d{2})/.exec(time ?? '');
  if (!m) return time ?? '';
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'am' : 'pm'}`;
};

/**
 * A new drive goes into the bell of the people the admin chose to tell (the same choice as for email and push):
 * team members and admins, or everyone. Nobody is told when the admin chose not to send.
 */
export async function notifyDriveScheduled(drive: Drive, audience: NotifyAudience, scheduledBy?: string): Promise<void> {
  if (audience === 'NONE') return;
  try {
    const roles = audience === 'TEAM' ? ['TEAM_MEMBER', 'ADMIN', 'SUPER_ADMIN'] : null;
    const where = roles
      ? scheduledBy
        ? and(inArray(users.role, roles), ne(users.id, scheduledBy))
        : inArray(users.role, roles)
      : scheduledBy
        ? ne(users.id, scheduledBy)
        : undefined;
    const people = await db.select({ id: users.id }).from(users).where(where);
    const kind = drive.type === 'CLEANUP' ? 'clean-up drive' : 'plantation drive';
    await notifyUsers(
      people.map((p) => p.id),
      {
        type: 'DRIVE_SCHEDULED',
        title: `New ${kind}: ${drive.title}`,
        body: [`${drive.date} at ${clock12(drive.time)}`, drive.address].filter(Boolean).join(' · '),
        link: `/?drive=${drive.id}`,
      }
    );
  } catch (err) {
    console.error('Could not notify about the drive:', err);
  }
}
