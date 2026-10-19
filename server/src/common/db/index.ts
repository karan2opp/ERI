import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '../config/env';

// Neon's pooled address (host contains "-pooler") runs PgBouncer in transaction mode, which can't
// keep prepared statements between queries. Neon also closes idle connections when the database
// sleeps, so close ours first rather than reuse a dead one.
const pooled = /-pooler\./.test(env.DATABASE_URL);
const queryClient = postgres(env.DATABASE_URL, {
  max: 10,
  prepare: !pooled,
  idle_timeout: 20,
  max_lifetime: 60 * 30,
});

export const db = drizzle(queryClient, { schema });
