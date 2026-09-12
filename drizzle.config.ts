import { loadEnvConfig } from '@next/env';
import { defineConfig } from 'drizzle-kit';

// Load .env.local (pulled from Vercel with `npx vercel env pull .env.local`)
// so `npm run db:migrate` and `npm run db:generate` see DATABASE_URL without
// exporting it by hand. Tests never load this file: they run against PGlite
// and require DATABASE_URL to be unset.
loadEnvConfig(process.cwd());

export default defineConfig({
  dialect: 'postgresql',
  schema: './db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
