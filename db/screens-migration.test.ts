// @vitest-environment node
//
// A dedicated, from-scratch test for migration 0002's backfill: it applies
// only 0000 and 0001 to a fresh PGlite (the pre-screens `files` shape, with
// `layout`/`stage_width` columns), inserts a legacy-shaped row through raw
// SQL (db/client.ts's normal PGlite branch always runs every migration in
// ./drizzle before a test ever touches the database, so there is no other
// way to see the pre-0002 table shape), then applies 0002 on top and
// asserts the row now has exactly the one screen the plan specifies.
//
// This intentionally does not use db/client.ts's getDb()/resetDbForTests():
// those always run the full, current migration chain against one memoized
// PGlite instance, which is the right thing for every other test but wrong
// here, where the whole point is to control which migrations have been
// applied at each step.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

const DRIZZLE_DIR = path.join(process.cwd(), 'drizzle');
const MIGRATION_0002_TAG = '0002_store_screens_per_file';

function journal(entries: Array<{ idx: number; tag: string; when: number }>): string {
  return JSON.stringify({
    version: '7',
    dialect: 'postgresql',
    entries: entries.map((entry) => ({ ...entry, version: '7', breakpoints: true })),
  });
}

function copyMigrationInto(tag: string, destDir: string): void {
  fs.copyFileSync(path.join(DRIZZLE_DIR, `${tag}.sql`), path.join(destDir, `${tag}.sql`));
}

function writeJournal(destDir: string, entries: Array<{ idx: number; tag: string; when: number }>): void {
  fs.mkdirSync(path.join(destDir, 'meta'), { recursive: true });
  fs.writeFileSync(path.join(destDir, 'meta', '_journal.json'), journal(entries));
}

/** Postgres's jsonb round-trips through PGlite's wire protocol as a JS value already; tolerate either that or a raw string, since which one happens is an implementation detail this test should not depend on. */
function parseJsonbColumn(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

describe('migration 0002 (screens backfill)', () => {
  let tmpDir: string | undefined;
  let client: PGlite | undefined;

  afterEach(async () => {
    await client?.close();
    client = undefined;
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  // A generous timeout: this spins up a real PGlite (WASM Postgres) engine,
  // which is fast in isolation but can take several seconds under the CPU
  // contention of the full suite running many test files in parallel, each
  // with their own PGlite instance.
  it('turns a legacy layout/stage_width row into one screen named "Frame 1"', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'assembly-workbench-0002-'));

    // Step 1: a fresh PGlite with only the pre-screens migrations applied,
    // i.e. exactly the `files` shape migration 0002 starts from.
    copyMigrationInto('0000_colossal_tony_stark', tmpDir);
    copyMigrationInto('0001_careful_rockslide', tmpDir);
    writeJournal(tmpDir, [
      { idx: 0, tag: '0000_colossal_tony_stark', when: 1 },
      { idx: 1, tag: '0001_careful_rockslide', when: 2 },
    ]);

    client = new PGlite();
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: tmpDir });

    // Step 2: a legacy row, inserted through raw SQL because the *current*
    // db/schema.ts (and the `files` Drizzle table object it exports) no
    // longer has `layout`/`stage_width` columns to insert through.
    const legacyLayout = JSON.stringify({
      ROOT: { type: { resolvedName: 'LayoutBox' }, isCanvas: true, nodes: [], parent: null },
    });
    await client.query('INSERT INTO files (id, name, layout, stage_width) VALUES ($1, $2, $3::jsonb, $4)', [
      'legacyfile1',
      'Legacy file',
      legacyLayout,
      999,
    ]);

    // Step 3: add migration 0002 to the same folder and apply it on top.
    // migrate() re-reads the whole journal every call and only runs
    // migrations it has not already recorded as applied in this PGlite
    // instance, so 0000/0001 are skipped and only 0002 actually runs.
    copyMigrationInto(MIGRATION_0002_TAG, tmpDir);
    writeJournal(tmpDir, [
      { idx: 0, tag: '0000_colossal_tony_stark', when: 1 },
      { idx: 1, tag: '0001_careful_rockslide', when: 2 },
      { idx: 2, tag: MIGRATION_0002_TAG, when: 3 },
    ]);
    await migrate(db, { migrationsFolder: tmpDir });

    const result = await client.query<{ id: string; name: string; screens: unknown }>(
      'SELECT id, name, screens FROM files WHERE id = $1',
      ['legacyfile1'],
    );
    expect(result.rows).toHaveLength(1);

    const row = result.rows[0];
    const screens = parseJsonbColumn(row.screens) as Array<Record<string, unknown>>;
    const expectedScreenId = crypto.createHash('md5').update('legacyfile1').digest('hex').slice(0, 10);

    expect(screens).toEqual([
      {
        id: expectedScreenId,
        name: 'Frame 1',
        layout: JSON.parse(legacyLayout),
        stageWidth: 999,
      },
    ]);

    // The old columns are really gone, not just unused.
    await expect(client.query('SELECT layout FROM files LIMIT 1')).rejects.toThrow();
    await expect(client.query('SELECT stage_width FROM files LIMIT 1')).rejects.toThrow();
  }, 20000);
});
