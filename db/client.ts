import path from 'node:path';
import migrationJournal from '../drizzle/meta/_journal.json';
import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

// In `next dev`, Turbopack evaluates each route's server bundle with its own
// module instances, so a module-level cache alone gives the Files page, the
// editor page and the API routes separate in-memory PGlite databases when
// DATABASE_URL is unset (a file created through /api/files then 404s in
// /f/[id]). Outside tests the promise is cached on globalThis so every route
// in the process shares one database. Tests keep the module-level cache: each
// test file expects a fresh database.
type DbGlobal = typeof globalThis & { __assemblyWorkbenchDb?: Promise<Db>; __assemblyWorkbenchMigrationVersion?: number };

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
  if (process.env.NODE_ENV === 'test') {
    if (!dbPromise) {
      dbPromise = createDb();
    }
    return dbPromise;
  }
  const shared = globalThis as DbGlobal;
  if (!shared.__assemblyWorkbenchDb) {
    shared.__assemblyWorkbenchDb = createDb();
    shared.__assemblyWorkbenchMigrationVersion = migrationJournal.entries.length;
  }
  // Apply newly added local migrations after HMR without losing in-memory files.
  // Hosted databases continue to require an explicit migration command.
  if (process.env.NODE_ENV === 'development' && !process.env.DATABASE_URL && shared.__assemblyWorkbenchMigrationVersion !== migrationJournal.entries.length) {
    shared.__assemblyWorkbenchDb = shared.__assemblyWorkbenchDb.then(async db => {
      await migrate(db as Parameters<typeof migrate>[0], { migrationsFolder: path.join(process.cwd(), 'drizzle') });
      return db;
    });
    shared.__assemblyWorkbenchMigrationVersion = migrationJournal.entries.length;
  }
  return shared.__assemblyWorkbenchDb;
}

export async function resetDbForTests(): Promise<void> {
  if (process.env.DATABASE_URL) {
    throw new Error('resetDbForTests() only works against the PGlite test database, and DATABASE_URL is set.');
  }
  const db = await getDb();

  // files first: files.folder_id references folders.id with onDelete
  // restrict, so a folder row cannot be removed while a file still points
  // at it.
  await db.delete(schema.files);
  await db.delete(schema.folders);
}
