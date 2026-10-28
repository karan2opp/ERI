import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { trees } from '../db/schema';

/**
 * How many verified trees are on the map: `fresh` are trees planted since the app started (they add to the
 * public count), `old` are trees planted before it that are being marked on the map one by one (they are already
 * part of the starting number, so marking them must not add to the count).
 */
export async function countVerifiedTrees(): Promise<{ fresh: number; old: number }> {
  const [row] = await db
    .select({
      fresh: sql<number>`count(*) filter (where not ${trees.isOld})`,
      old: sql<number>`count(*) filter (where ${trees.isOld})`,
    })
    .from(trees)
    .where(eq(trees.verificationStatus, 'VERIFIED'));
  return { fresh: Number(row.fresh), old: Number(row.old) };
}

/**
 * The number of trees shown on the home page: the larger of the starting number and the old trees marked so far
 * (so once every old tree is marked, or the starting number is set to 0, the marked old trees are simply counted),
 * plus the new trees.
 */
export const publicTreeCount = (baselineTrees: number, counts: { fresh: number; old: number }) => Math.max(baselineTrees, counts.old) + counts.fresh;
