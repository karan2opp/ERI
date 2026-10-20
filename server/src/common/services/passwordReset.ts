import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { passwordResetCodes } from '../db/schema';
import { env } from '../config/env';
import { sendEmails, emailEnabled } from './emailService';

/** A reset code is good for this long, and for this many wrong guesses. */
export const CODE_MINUTES = 10;
export const MAX_WRONG_TRIES = 5;
/** One code per person per minute, so the email can't be used to flood an inbox. */
export const RESEND_AFTER_SECONDS = 60;

// Codes are stored as a keyed hash, never as the code itself
const hashCode = (userId: string, code: string) => createHmac('sha256', env.CLERK_SECRET_KEY || 'dev-only-secret').update(`${userId}:${code}`).digest('hex');

const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export type SendOutcome = { ok: true } | { ok: false; reason: 'email-off' | 'too-soon' | 'send-failed'; waitSeconds?: number };

/** Makes a fresh code for this person (replacing any earlier one) and emails it. */
export async function sendResetCode(userId: string, email: string, name: string | null): Promise<SendOutcome> {
  if (!emailEnabled()) return { ok: false, reason: 'email-off' };

  const [existing] = await db.select().from(passwordResetCodes).where(eq(passwordResetCodes.userId, userId));
  if (existing) {
    const wait = RESEND_AFTER_SECONDS - (Date.now() - existing.lastSentAt.getTime()) / 1000;
    if (wait > 0) return { ok: false, reason: 'too-soon', waitSeconds: Math.ceil(wait) };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = new Date(Date.now() + CODE_MINUTES * 60_000);
  const values = { userId, codeHash: hashCode(userId, code), expiresAt, attempts: 0, lastSentAt: new Date() };
  await db.insert(passwordResetCodes).values(values).onConflictDoUpdate({ target: passwordResetCodes.userId, set: values });

  const hello = name ? `Hi ${escapeHtml(name.split(' ')[0])},` : 'Hi,';
  const result = await sendEmails([
    {
      to: email,
      subject: `Your Earth Revival Initiative code: ${code}`,
      html: `<!doctype html><html><body style="margin:0;background:#f3f7ee;font-family:Arial,Helvetica,sans-serif;color:#133c16">
<div style="max-width:520px;margin:0 auto;padding:24px 16px">
  <p style="font-size:13px;letter-spacing:2px;color:#2c691c;margin:0 0 16px"><strong>EARTH REVIVAL INITIATIVE</strong></p>
  <div style="background:#ffffff;border-radius:16px;padding:24px">
    <p style="margin:0 0 8px;color:#567256">${hello}</p>
    <h1 style="font-size:20px;margin:0 0 12px">Your password reset code</h1>
    <p style="margin:0 0 16px;line-height:1.5">Enter this code in the app to choose a new password:</p>
    <p style="margin:0 0 16px;font-size:32px;letter-spacing:8px;font-weight:bold">${code}</p>
    <p style="margin:0;line-height:1.5;color:#567256">It works for ${CODE_MINUTES} minutes. If you didn't ask for this, you can ignore this email: your password hasn't changed.</p>
  </div>
</div></body></html>`,
      text: `${hello}\n\nYour password reset code: ${code}\n\nEnter it in the app to choose a new password. It works for ${CODE_MINUTES} minutes. If you didn't ask for this, ignore this email: your password hasn't changed.`,
    },
  ]);
  if (result.sent !== 1) {
    // Nothing was delivered: forget the code so a retry isn't held up by the one-minute wait
    await db.delete(passwordResetCodes).where(eq(passwordResetCodes.userId, userId));
    return { ok: false, reason: 'send-failed' };
  }
  return { ok: true };
}

export type CheckOutcome = { ok: true } | { ok: false; reason: 'wrong' | 'expired' | 'locked' | 'none'; triesLeft?: number };

/**
 * Checks a code. A right code is used up at once. A wrong one counts against the limit, and after
 * MAX_WRONG_TRIES the code is dead even if it is guessed later.
 */
export async function checkResetCode(userId: string, code: string): Promise<CheckOutcome> {
  const [row] = await db.select().from(passwordResetCodes).where(eq(passwordResetCodes.userId, userId));
  if (!row) return { ok: false, reason: 'none' };
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(passwordResetCodes).where(eq(passwordResetCodes.userId, userId));
    return { ok: false, reason: 'expired' };
  }
  if (row.attempts >= MAX_WRONG_TRIES) return { ok: false, reason: 'locked' };

  if (!sameHash(row.codeHash, hashCode(userId, code))) {
    const attempts = row.attempts + 1;
    await db.update(passwordResetCodes).set({ attempts }).where(eq(passwordResetCodes.userId, userId));
    return { ok: false, reason: attempts >= MAX_WRONG_TRIES ? 'locked' : 'wrong', triesLeft: Math.max(0, MAX_WRONG_TRIES - attempts) };
  }
  await db.delete(passwordResetCodes).where(eq(passwordResetCodes.userId, userId));
  return { ok: true };
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
