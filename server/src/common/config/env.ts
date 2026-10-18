import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  PORT: z.string().default('5000'),
  NODE_ENV: z.string().default('development'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@127.0.0.1:5555/plantree_db'),
  // Comma-separated list of allowed browser origins, e.g. https://app.example.com,http://localhost:5173
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  // Number of reverse-proxy hops in front of the server (for correct client IPs in rate limiting). Unset = none.
  TRUST_PROXY: z.string().optional(),
  
  // Clerk Auth
  CLERK_PUBLISHABLE_KEY: z.string().optional(),
  CLERK_SECRET_KEY: z.string().optional(),

  // Cloudinary Image Storage
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // OpenAI: checks that an uploaded photo is a tree or plant. Without a key every new tree waits for manual review.
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),

  // Google Maps API
  GOOGLE_MAP_API: z.string().optional(),
});

export const env = envSchema.parse(process.env);
