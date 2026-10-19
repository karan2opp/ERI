import { env } from '../config/env';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailResult {
  sent: number;
  failed: number;
  /** True when no email provider is set up, so nothing was sent */
  skipped: boolean;
}

// Resend's batch endpoint takes up to 100 emails per request, and its free plan allows 2 requests a second
const BATCH_SIZE = 100;
const BATCH_PAUSE_MS = 600;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const emailEnabled = () => Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);

/**
 * Sends emails through Resend (https://resend.com). With no RESEND_API_KEY or EMAIL_FROM it sends
 * nothing and says so, so everything else keeps working in development.
 */
export async function sendEmails(messages: EmailMessage[]): Promise<EmailResult> {
  if (messages.length === 0) return { sent: 0, failed: 0, skipped: false };
  if (!emailEnabled()) {
    console.warn(`Email is not set up (RESEND_API_KEY / EMAIL_FROM): ${messages.length} email(s) not sent.`);
    return { sent: 0, failed: 0, skipped: true };
  }

  let sent = 0;
  let failed = 0;
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(`${env.RESEND_BASE_URL}/emails/batch`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(batch.map((m) => ({ from: env.EMAIL_FROM, to: [m.to], subject: m.subject, html: m.html, text: m.text }))),
      });
      if (res.ok) sent += batch.length;
      else {
        failed += batch.length;
        console.error('Email batch failed:', res.status, (await res.text().catch(() => '')).slice(0, 300));
      }
    } catch (err) {
      failed += batch.length;
      console.error('Email batch failed:', err instanceof Error ? err.message : err);
    }
    if (i + BATCH_SIZE < messages.length) await sleep(BATCH_PAUSE_MS);
  }
  return { sent, failed, skipped: false };
}
