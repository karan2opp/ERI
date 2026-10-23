import { and, ne, sql } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';

/** Longest name we keep (the column is wider, this leaves room for a " 12" on the end). */
export const MAX_NAME = 100;

/** Single spaces, no ends, not too long. */
export const normalizeName = (raw: string | null | undefined): string => (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);

/** "Ravi Kumar Singh" becomes first "Ravi" and last "Kumar Singh", the way Clerk keeps names. */
export const splitName = (full: string): { firstName: string; lastName: string } => {
  const [firstName = '', ...rest] = normalizeName(full).split(' ');
  return { firstName, lastName: rest.join(' ') };
};

const escapeLike = (s: string) => s.replace(/[\%_]/g, '\$&');

/** Names that are the same as, or start with, this one (lower case). Only used to find the next free number. */
async function similarNames(base: string, exceptUserId?: string): Promise<Set<string>> {
  const where = and(
    sql`lower(${users.name}) like ${escapeLike(base.toLowerCase()) + '%'}`,
    exceptUserId ? ne(users.id, exceptUserId) : undefined
  );
  const rows = await db.select({ name: users.name }).from(users).where(where);
  return new Set(rows.map((r) => (r.name ?? '').toLowerCase()));
}

/** Does someone else already have this name? Capital letters don't matter. */
export async function nameTaken(name: string, exceptUserId?: string): Promise<boolean> {
  const clean = normalizeName(name);
  if (!clean) return false;
  return (await similarNames(clean, exceptUserId)).has(clean.toLowerCase());
}

/** The name itself when it is free; otherwise "Name 2", "Name 3" and so on, the first one nobody has. */
export async function uniqueName(wanted: string, exceptUserId?: string): Promise<string> {
  const base = normalizeName(wanted).slice(0, MAX_NAME - 6) || 'Volunteer';
  const taken = await similarNames(base, exceptUserId);
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/** Postgres "unique violation", however the driver wraps it. */
export const isUniqueViolation = (err: unknown): boolean => {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === '23505' || e?.cause?.code === '23505';
};
