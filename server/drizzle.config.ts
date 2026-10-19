import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, './.env') });

export default defineConfig({
  schema: './src/common/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // Schema changes need a direct connection; with Neon, put the non-pooled address in DATABASE_URL_DIRECT
    url: process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5555/plantree_db',
  },
});
