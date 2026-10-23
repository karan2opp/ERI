import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { pushSubscriptions, users } from '../db/schema';
import { env } from '../config/env';
import { isAdminRole } from '../auth/roles';
import { sendEmails, type EmailMessage } from './emailService';
import { sendPush } from './pushService';

/** Who hears about a drive: nobody, team members and admins, or every user. */
export const NOTIFY_AUDIENCES = ['NONE', 'TEAM', 'EVERYONE'] as const;
export type NotifyAudience = (typeof NOTIFY_AUDIENCES)[number];

export type DriveEvent = 'CREATED' | 'UPDATED' | 'CANCELLED';

interface DriveInfo {
  id: string;
  title: string;
  date: string;
  time: string;
  address?: string | null;
  type: string;
}

export interface Recipients {
  /** Users who get an email (they haven't turned drive emails off) */
  emails: { id: string; email: string; name: string | null }[];
  /** Every browser or phone that turned push on, for the audience */
  subscriptions: { id: string; endpoint: string; p256dh: string; auth: string }[];
}

const TEAM_ROLES = ['TEAM_MEMBER', 'ADMIN', 'SUPER_ADMIN'];

/** The first allowed browser origin is the app's address, used for links in emails and notifications. */
export const appUrl = () => (env.APP_URL || env.CLIENT_ORIGIN.split(',')[0]).trim().replace(/\/$/, '');

export async function resolveRecipients(audience: NotifyAudience, exceptUserId?: string): Promise<Recipients> {
  if (audience === 'NONE') return { emails: [], subscriptions: [] };

  const people = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role, emailDrives: users.emailDrives })
    .from(users);
  const chosen = people.filter((u) => u.id !== exceptUserId && (audience === 'EVERYONE' || TEAM_ROLES.includes(u.role) || isAdminRole(u.role)));

  const emails = chosen.filter((u) => u.emailDrives && u.email).map((u) => ({ id: u.id, email: u.email, name: u.name }));
  const ids = chosen.map((u) => u.id);
  const subscriptions = ids.length
    ? await db
        .select({ id: pushSubscriptions.id, endpoint: pushSubscriptions.endpoint, p256dh: pushSubscriptions.p256dh, auth: pushSubscriptions.auth })
        .from(pushSubscriptions)
        .where(inArray(pushSubscriptions.userId, ids))
    : [];
  return { emails, subscriptions };
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const TYPE_LABEL: Record<string, string> = { PLANTATION: 'Plantation drive', CLEANUP: 'Clean-up drive' };

/** "14:30" as "2:30 pm": every time people see is 12-hour. Done by hand so it doesn't depend on the server's locale. */
const clock12 = (time: string | null | undefined): string => {
  const m = /^(\d{1,2}):(\d{2})/.exec(time ?? '');
  if (!m) return time ?? '';
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'am' : 'pm'}`;
};

const whenWhere = (d: DriveInfo) => [d.date, clock12(d.time)].filter(Boolean).join(' at ') + (d.address ? `, ${d.address}` : '');

function content(event: DriveEvent, d: DriveInfo) {
  const kind = TYPE_LABEL[d.type] ?? 'Drive';
  if (event === 'CREATED') return { subject: `New ${kind.toLowerCase()}: ${d.title}`, headline: `New ${kind.toLowerCase()}`, line: whenWhere(d), button: 'See the drive' };
  if (event === 'UPDATED') return { subject: `Updated: ${d.title}`, headline: 'This drive was updated', line: `Now: ${whenWhere(d)}`, button: 'See what changed' };
  return { subject: `Cancelled: ${d.title}`, headline: 'This drive was cancelled', line: `It was planned for ${d.date}${d.time ? ' at ' + clock12(d.time) : ''}.`, button: 'Open the app' };
}

function buildEmail(event: DriveEvent, d: DriveInfo, to: { email: string; name: string | null }): EmailMessage {
  const c = content(event, d);
  const link = event === 'CANCELLED' ? appUrl() : `${appUrl()}/?drive=${d.id}`;
  const hello = to.name ? `Hi ${escapeHtml(to.name.split(' ')[0])},` : 'Hi,';
  const html = `<!doctype html><html><body style="margin:0;background:#f3f7ee;font-family:Arial,Helvetica,sans-serif;color:#133c16">
<div style="max-width:520px;margin:0 auto;padding:24px 16px">
  <p style="font-size:13px;letter-spacing:2px;color:#2c691c;margin:0 0 16px"><strong>EARTH REVIVAL INITIATIVE</strong></p>
  <div style="background:#ffffff;border-radius:16px;padding:24px">
    <p style="margin:0 0 8px;color:#567256">${hello}</p>
    <h1 style="font-size:20px;margin:0 0 4px">${escapeHtml(c.headline)}</h1>
    <h2 style="font-size:18px;margin:0 0 12px">${escapeHtml(d.title)}</h2>
    <p style="margin:0 0 20px;line-height:1.5">${escapeHtml(c.line)}</p>
    <a href="${escapeHtml(link)}" style="display:inline-block;background:#2c691c;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:bold">${escapeHtml(c.button)}</a>
  </div>
  <p style="font-size:12px;color:#567256;margin:16px 0 0;line-height:1.5">You get this because you have an Earth Revival Initiative account. To stop drive emails, open the app, then Account, then Notifications.</p>
</div></body></html>`;
  const text = `${hello}\n\n${c.headline}: ${d.title}\n${c.line}\n\n${c.button}: ${link}\n\nTo stop drive emails, open the app, then Account, then Notifications.`;
  return { to: to.email, subject: c.subject, html, text };
}

export interface NotifyOutcome {
  emailsSent: number;
  emailsFailed: number;
  pushSent: number;
  pushFailed: number;
}

/**
 * Tells the audience about a drive by email and push. Run it without waiting for it (a big audience
 * takes a while): it logs problems itself and never throws.
 */
export async function deliverDriveNotification(event: DriveEvent, drive: DriveInfo, recipients: Recipients): Promise<NotifyOutcome> {
  const outcome: NotifyOutcome = { emailsSent: 0, emailsFailed: 0, pushSent: 0, pushFailed: 0 };
  try {
    const c = content(event, drive);
    const [emailResult, pushResult] = await Promise.all([
      sendEmails(recipients.emails.map((r) => buildEmail(event, drive, r))),
      sendPush(recipients.subscriptions, {
        title: c.subject,
        body: c.line,
        url: event === 'CANCELLED' ? '/' : `/?drive=${drive.id}`,
        tag: `drive-${drive.id}`,
      }),
    ]);
    outcome.emailsSent = emailResult.sent;
    outcome.emailsFailed = emailResult.failed;
    outcome.pushSent = pushResult.sent;
    outcome.pushFailed = pushResult.failed;
  } catch (err) {
    console.error('Drive notification failed:', err instanceof Error ? err.message : err);
  }
  return outcome;
}

// Used by tests
export const _internal = { buildEmail, content };
