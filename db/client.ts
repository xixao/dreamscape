import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let dbPromise: Promise<Db> | null = null;

async function createDb(): Promise<Db> {
  const url = process.env.DATABASE_URL;

  if (url) {
    const client = neon(url);
    // NeonHttpDatabase<Schema> extends PgDatabase<NeonHttpQueryResultHKT, Schema>,
    // and NeonHttpQueryResultHKT extends the generic PgQueryResultHKT that `Db`
    // is declared with, so this returns as `Db` with no cast needed.
    return drizzleNeon(client, { schema });
  }

  const client = new PGlite();
  const db = drizzlePglite(client, { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
  // Same rationale as the Neon branch: PgliteDatabase<Schema> extends
  // PgDatabase<PgliteQueryResultHKT, Schema>, which unifies with `Db`.
  return db;
}

export function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = createDb();
  }
  return dbPromise;
}

export async function resetDbForTests(): Promise<void> {
  if (process.env.DATABASE_URL) {
    throw new Error('resetDbForTests() only works against the PGlite test database, and DATABASE_URL is set.');
  }
  const db = await getDb();
  await db.delete(schema.files);
}
