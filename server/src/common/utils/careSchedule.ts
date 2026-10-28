import { sql } from 'drizzle-orm';
import { trees } from '../db/schema';

/**
 * A tree needs water once it has gone longer than its own watering interval without being watered
 * (or has never been watered). Compared in UTC because the database stores timestamps without a zone.
 */
export const needsWater = sql`(${trees.lastWateredAt} IS NULL OR ${trees.lastWateredAt} + (${trees.waterEveryDays} * interval '1 day') < (now() AT TIME ZONE 'utc'))`;

/** Fertiliser is due once its interval has passed since the last time, or since planting if it never happened. */
export const needsFertilizer = sql`(coalesce(${trees.lastFertilizedAt}, ${trees.plantedAt}) + (${trees.fertilizeEveryDays} * interval '1 day') < (now() AT TIME ZONE 'utc'))`;

/** Same for removing the grass around the tree. */
export const needsWeeding = sql`(coalesce(${trees.lastWeededAt}, ${trees.plantedAt}) + (${trees.weedEveryDays} * interval '1 day') < (now() AT TIME ZONE 'utc'))`;

/** Needs any of the three. A tree that needs none of them is "healthy". */
export const needsCare = sql`(${needsWater} OR ${needsFertilizer} OR ${needsWeeding})`;

/** The tree filters: every status the map, lists and Admin can ask for. */
export const TREE_STATUSES = ['all', 'thirsty', 'fertilize', 'weed', 'healthy'] as const;
export type TreeStatusFilter = (typeof TREE_STATUSES)[number];

/** The condition for one status filter, or null for "all". */
export const statusCondition = (status: TreeStatusFilter) =>
  status === 'thirsty' ? needsWater : status === 'fertilize' ? needsFertilizer : status === 'weed' ? needsWeeding : status === 'healthy' ? sql`NOT ${needsCare}` : null;

/**
 * The one thing a map pin shows when a tree needs several: water first, then fertiliser, then grass.
 * When the map is filtered to one need, every tree shows that need.
 */
export const topNeed = (status: TreeStatusFilter) =>
  status === 'thirsty' || status === 'fertilize' || status === 'weed'
    ? sql<'thirsty' | 'fertilize' | 'weed'>`${sql.raw(`'${status}'`)}`
    : sql<'thirsty' | 'fertilize' | 'weed' | null>`(case when ${needsWater} then 'thirsty' when ${needsFertilizer} then 'fertilize' when ${needsWeeding} then 'weed' end)`;
