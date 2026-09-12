import { desc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { Db } from '@/db/client';
import { files } from '@/db/schema';
// Imported from known-types.ts, not registry.tsx: registry.tsx pulls in
// @craftjs/core and the block components, which breaks when this
// repository is loaded from a plain server module such as a files API
// route handler (see known-types.ts for the full explanation).
import { KNOWN_TYPES, emptyLayoutJson } from '@/components/blocks/known-types';
import { clampWidth } from '@/lib/stage';
import { validateLayout } from './validate';

export type FileSummary = { id: string; name: string; createdAt: string; updatedAt: string };
export type FileRecord = FileSummary & { layout: string; stageWidth: number };
export type SaveInput = { name?: string; layout?: string; stageWidth?: number; baseUpdatedAt?: string };
export type SaveResult =
  | { ok: true; updatedAt: string }
  | { ok: false; conflict: true; updatedAt: string }
  | { ok: false; notFound: true }
  | { ok: false; invalid: string };

type FileRow = typeof files.$inferSelect;

function toSummary(row: FileRow): FileSummary {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toRecord(row: FileRow): FileRecord {
  return {
    ...toSummary(row),
    layout: JSON.stringify(row.layout),
    stageWidth: row.stageWidth,
  };
}

export function createFilesRepository(db: Db) {
  async function list(): Promise<FileSummary[]> {
    const rows = await db.select().from(files).orderBy(desc(files.updatedAt));
    return rows.map(toSummary);
  }

  async function get(id: string): Promise<FileRecord | null> {
    const [row] = await db.select().from(files).where(eq(files.id, id)).limit(1);
    return row ? toRecord(row) : null;
  }

  async function create(input: { name?: string; layout?: string; stageWidth?: number } = {}): Promise<FileRecord> {
    const layoutJson = input.layout ?? emptyLayoutJson();
    const validated = validateLayout(layoutJson, KNOWN_TYPES);
    if (!validated.ok) {
      throw new Error(`Cannot create a file: layout ${validated.reason}.`);
    }

    const [row] = await db
      .insert(files)
      .values({
        id: nanoid(10),
        name: input.name ?? 'Untitled',
        layout: validated.tree,
        stageWidth: input.stageWidth !== undefined ? clampWidth(input.stageWidth) : 1440,
      })
      .returning();

    return toRecord(row);
  }

  async function save(id: string, input: SaveInput): Promise<SaveResult> {
    const [row] = await db.select().from(files).where(eq(files.id, id)).limit(1);
    if (!row) return { ok: false, notFound: true };

    if (
      input.baseUpdatedAt !== undefined &&
      new Date(input.baseUpdatedAt).getTime() !== row.updatedAt.getTime()
    ) {
      return { ok: false, conflict: true, updatedAt: row.updatedAt.toISOString() };
    }

    // Plain `new Date()` truncates to the millisecond, so two saves in the
    // same millisecond would otherwise produce equal `updatedAt` values and
    // a `baseUpdatedAt` conflict check against the earlier one could never
    // detect the change. Force strictly-increasing timestamps per row by
    // never going backward (or sideways) relative to what's already stored.
    const now = new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1));
    const patch: Partial<typeof files.$inferInsert> = { updatedAt: now };
    if (input.name !== undefined) patch.name = input.name;
    if (input.stageWidth !== undefined) patch.stageWidth = clampWidth(input.stageWidth);
    if (input.layout !== undefined) {
      const validated = validateLayout(input.layout, KNOWN_TYPES);
      if (!validated.ok) return { ok: false, invalid: validated.reason };
      patch.layout = validated.tree;
    }

    const [updated] = await db.update(files).set(patch).where(eq(files.id, id)).returning();
    return { ok: true, updatedAt: updated.updatedAt.toISOString() };
  }

  async function duplicate(id: string): Promise<FileRecord | null> {
    const [row] = await db.select().from(files).where(eq(files.id, id)).limit(1);
    if (!row) return null;

    const [copy] = await db
      .insert(files)
      .values({
        id: nanoid(10),
        name: `${row.name} copy`,
        layout: row.layout,
        stageWidth: row.stageWidth,
      })
      .returning();

    return toRecord(copy);
  }

  async function remove(id: string): Promise<boolean> {
    const deleted = await db.delete(files).where(eq(files.id, id)).returning({ id: files.id });
    return deleted.length > 0;
  }

  return { list, get, create, save, duplicate, remove };
}
