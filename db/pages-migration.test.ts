// @vitest-environment node
//
// A dedicated, from-scratch test for migration 0003's backfill, the same
// approach db/screens-migration.test.ts uses for migration 0002: it applies
// only 0000 through 0002 to a fresh PGlite (the pre-pages `files` shape,
// with a `screens` column but no `pages` one), inserts a legacy-shaped row
// through raw SQL, then applies 0003 on top and asserts the row now has one
// page and every one of its screens stamped with that page's id.
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
const PRE_PAGES_TAGS = ['0000_colossal_tony_stark', '0001_careful_rockslide', '0002_store_screens_per_file'];
const MIGRATION_0003_TAG = '0003_pages';

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

function derivedId(fileId: string): string {
  return crypto.createHash('md5').update(fileId).digest('hex').slice(0, 10);
}

describe('migration 0003 (pages backfill)', () => {
  let tmpDir: string | undefined;
  let client: PGlite | undefined;

  afterEach(async () => {
    await client?.close();
    client = undefined;
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  // A fresh PGlite with only the pre-pages migrations applied (0000-0002),
  // i.e. exactly the `files` shape migration 0003 starts from: a `screens`
  // column, no `pages` column yet.
  async function migrateUpToPrePages(): Promise<{ db: ReturnType<typeof drizzle>; dir: string }> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assembly-workbench-0003-'));
    PRE_PAGES_TAGS.forEach((tag) => copyMigrationInto(tag, dir));
    writeJournal(
      dir,
      PRE_PAGES_TAGS.map((tag, idx) => ({ idx, tag, when: idx + 1 })),
    );
    client = new PGlite();
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: dir });
    return { db, dir };
  }

  function applyMigration0003(dir: string): Promise<void> {
    copyMigrationInto(MIGRATION_0003_TAG, dir);
    writeJournal(dir, [
      ...PRE_PAGES_TAGS.map((tag, idx) => ({ idx, tag, when: idx + 1 })),
      { idx: PRE_PAGES_TAGS.length, tag: MIGRATION_0003_TAG, when: PRE_PAGES_TAGS.length + 1 },
    ]);
    const db = drizzle(client!);
    return migrate(db, { migrationsFolder: dir });
  }

  // A generous timeout, same rationale as db/screens-migration.test.ts's own
  // identical comment: a real PGlite (WASM Postgres) engine is fast in
  // isolation but can take several seconds under the CPU contention of the
  // full suite running many test files in parallel.
  it('backfills one page per file and stamps every existing screen with its id', async () => {
    const { dir } = await migrateUpToPrePages();
    tmpDir = dir;

    const legacyScreens = [
      { id: 'scr0000001', name: 'Frame 1', layout: { ROOT: {} }, stageWidth: 1440 },
      { id: 'scr0000002', name: 'Frame 2', layout: { ROOT: {} }, stageWidth: 375 },
    ];
    await client!.query('INSERT INTO files (id, name, screens) VALUES ($1, $2, $3::jsonb)', [
      'legacyfile1',
      'Legacy file',
      JSON.stringify(legacyScreens),
    ]);

    await applyMigration0003(dir);

    const result = await client!.query<{ id: string; pages: unknown; screens: unknown }>(
      'SELECT id, pages, screens FROM files WHERE id = $1',
      ['legacyfile1'],
    );
    expect(result.rows).toHaveLength(1);

    const row = result.rows[0];
    const pages = parseJsonbColumn(row.pages) as Array<Record<string, unknown>>;
    const screens = parseJsonbColumn(row.screens) as Array<Record<string, unknown>>;
    const expectedPageId = derivedId('legacyfile1');

    expect(pages).toEqual([{ id: expectedPageId, name: 'Page 1' }]);
    expect(screens).toEqual([
      { ...legacyScreens[0], pageId: expectedPageId },
      { ...legacyScreens[1], pageId: expectedPageId },
    ]);
    // Order preserved, not merely present: a screen's array position matters
    // for "first screen of a page" defaults elsewhere in the app.
    expect(screens.map((s) => s.id)).toEqual(['scr0000001', 'scr0000002']);
  }, 20000);

  it('backfills a page for a file with zero screens too, leaving screens empty', async () => {
    const { dir } = await migrateUpToPrePages();
    tmpDir = dir;

    await client!.query('INSERT INTO files (id, name, screens) VALUES ($1, $2, $3::jsonb)', [
      'emptyfile01',
      'No screens',
      JSON.stringify([]),
    ]);

    await applyMigration0003(dir);

    const result = await client!.query<{ pages: unknown; screens: unknown }>(
      'SELECT pages, screens FROM files WHERE id = $1',
      ['emptyfile01'],
    );
    const row = result.rows[0];
    expect(parseJsonbColumn(row.pages)).toEqual([{ id: derivedId('emptyfile01'), name: 'Page 1' }]);
    expect(parseJsonbColumn(row.screens)).toEqual([]);
  }, 20000);

  it('is idempotent: reapplying the same backfill UPDATE twice produces the same row', async () => {
    const { dir } = await migrateUpToPrePages();
    tmpDir = dir;

    await client!.query('INSERT INTO files (id, name, screens) VALUES ($1, $2, $3::jsonb)', [
      'legacyfile2',
      'Legacy file 2',
      JSON.stringify([{ id: 'scr0000003', name: 'Frame 1', layout: { ROOT: {} }, stageWidth: 1440 }]),
    ]);

    await applyMigration0003(dir);
    const first = await client!.query('SELECT id, pages, screens FROM files WHERE id = $1', ['legacyfile2']);

    // Re-running the migration file's own SQL directly (rather than through
    // migrate(), which tracks applied tags and would just skip a repeat
    // call) is what "idempotent" means for this migration's own statements:
    // running the backfill UPDATE a second time over already-migrated data
    // must be a no-op, not a corruption (e.g. double-stamping pageId).
    const sql = fs.readFileSync(path.join(DRIZZLE_DIR, `${MIGRATION_0003_TAG}.sql`), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint')) {
      const trimmed = statement.trim();
      if (trimmed.length === 0) continue;
      // The ADD COLUMN statement would fail the second time (column already
      // exists) - only the data backfill UPDATE is what idempotence is
      // actually claimed for.
      if (/^ALTER TABLE/i.test(trimmed)) continue;
      await client!.query(trimmed);
    }
    const second = await client!.query('SELECT id, pages, screens FROM files WHERE id = $1', ['legacyfile2']);

    expect(second.rows).toEqual(first.rows);
  }, 20000);
});
