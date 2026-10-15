import { sql } from 'drizzle-orm';
import { trees } from '../db/schema';

/**
 * A tree needs water once it has gone longer than its own watering interval without being watered
 * (or has never been watered). Compared in UTC because the database stores timestamps without a zone.
 */
export const needsWater = sql`(${trees.lastWateredAt} IS NULL OR ${trees.lastWateredAt} + (${trees.waterEveryDays} * interval '1 day') < (now() AT TIME ZONE 'utc'))`;
