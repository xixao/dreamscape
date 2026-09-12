import { asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { Db } from '@/db/client';
import { files, folders } from '@/db/schema';
// Imported from known-types.ts, not registry.tsx: registry.tsx pulls in
// @craftjs/core and the block components, which breaks when this
// repository is loaded from a plain server module such as a files API
// route handler (see known-types.ts for the full explanation).
import { KNOWN_TYPES, defaultScreen } from '@/components/blocks/known-types';
import { validateScreens, type Screen } from './validate';

// Re-exported so callers only need to know about lib/files/repository.ts,
// the file-level domain module - Screen itself lives in validate.ts purely
// to avoid a repository.ts <-> validate.ts import cycle (validateScreens
// returns Screen[] and repository.ts calls it).
export type { Screen } from './validate';

export type FileSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  // Optional rather than required: a `FileRecord`/`FileSummary` literal
  // written before folders existed (components/workbench/workbench.test.tsx's
  // BASE_FILE, owned by a concurrent task and off limits here) still
  // type-checks without a folderId. The repository and API always populate
  // this field on every value they hand back, so any caller reading a real
  // file can treat an absent key the same as `null` (`file.folderId ?? null`).
  folderId?: string | null;
  // Same optionality rationale as folderId above, this time for
  // components/files/files-page.test.tsx's and files-table.test.tsx's
  // FileSummary fixtures, written before screens existed.
  screenCount?: number;
};
export type FileRecord = FileSummary & {
  // Same optionality rationale as folderId/screenCount above: workbench.tsx's
  // BASE_FILE predates screens. Real repository code always populates it.
  screens?: Screen[];
};
export type SaveInput = {
  name?: string;
  screens?: Screen[];
  baseUpdatedAt?: string;
  folderId?: string | null;
};
export type SaveResult =
  | { ok: true; updatedAt: string }
  | { ok: false; conflict: true; updatedAt: string }
  | { ok: false; notFound: true }
  | { ok: false; invalid: string };

export type FolderSummary = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  // Direct children only (not recursive), so the Files page can tell
  // whether a folder is empty - and therefore whether its Delete action
  // should be enabled - straight from a folder listing, no extra request.
  fileCount: number;
  folderCount: number;
};

export type CreateFolderResult = { ok: true; folder: FolderSummary } | { ok: false; notFound: true };
export type RenameFolderResult = { ok: true; folder: FolderSummary } | { ok: false; notFound: true };
export type MoveFolderResult =
  | { ok: true; folder: FolderSummary }
  | { ok: false; notFound: true }
  | { ok: false; invalid: 'cycle' };
export type RemoveFolderResult = { ok: true } | { ok: false; notFound: true } | { ok: false; notEmpty: true };
export type MoveFileResult =
  | { ok: true; updatedAt: string }
  | { ok: false; notFound: true }
  | { ok: false; invalid: 'folder' };

type FileRow = typeof files.$inferSelect;
type FolderRow = typeof folders.$inferSelect;

const FOLDER_NAME_MAX = 120;

function normalizeFolderName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > FOLDER_NAME_MAX) {
    throw new Error(`Folder name must be between 1 and ${FOLDER_NAME_MAX} characters.`);
  }
  return trimmed;
}

// The shape one screen takes inside the `screens` jsonb column: like
// Screen, but `layout` is the parsed tree (a plain object), not a JSON
// string, so Postgres stores it as real jsonb rather than a doubly-encoded
// string. toApiScreens/toStoredScreen convert between the two at the
// repository boundary, the same way toRecord's JSON.stringify(row.layout)
// used to for the single old `layout` column.
type StoredScreen = {
  id: string;
  name: string;
  layout: Record<string, unknown>;
  stageWidth: number;
  stageHeight?: number | null;
  deviceName?: string | null;
};

function toApiScreens(raw: unknown): Screen[] {
  return (raw as StoredScreen[]).map((screen) => ({
    id: screen.id,
    name: screen.name,
    layout: JSON.stringify(screen.layout),
    stageWidth: screen.stageWidth,
    stageHeight: screen.stageHeight ?? null,
    deviceName: screen.deviceName ?? null,
  }));
}

function toStoredScreen(screen: Screen): StoredScreen {
  return {
    id: screen.id,
    name: screen.name,
    layout: JSON.parse(screen.layout) as Record<string, unknown>,
    stageWidth: screen.stageWidth,
    stageHeight: screen.stageHeight ?? null,
    deviceName: screen.deviceName ?? null,
  };
}

function toSummary(row: FileRow): FileSummary {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    folderId: row.folderId,
    screenCount: Array.isArray(row.screens) ? row.screens.length : 0,
  };
}

function toRecord(row: FileRow): FileRecord {
  return {
    ...toSummary(row),
    screens: toApiScreens(row.screens),
  };
}

export function createFilesRepository(db: Db) {
  async function getFolderRow(id: string): Promise<FolderRow | null> {
    const [row] = await db.select().from(folders).where(eq(folders.id, id)).limit(1);
    return row ?? null;
  }

  // Turns folder rows into FolderSummary objects, with fileCount/folderCount
  // computed for all of them in two grouped queries (one for files, one for
  // subfolders) rather than two queries per row, then mapped back onto the
  // rows in the order they were given.
  async function summarizeFolders(rows: FolderRow[]): Promise<FolderSummary[]> {
    if (rows.length === 0) return [];

    const ids = rows.map((row) => row.id);
    const [fileRows, subfolderRows] = await Promise.all([
      db.select({ folderId: files.folderId }).from(files).where(inArray(files.folderId, ids)),
      db.select({ parentId: folders.parentId }).from(folders).where(inArray(folders.parentId, ids)),
    ]);

    const fileCountById = new Map<string, number>();
    for (const { folderId } of fileRows) {
      if (folderId) fileCountById.set(folderId, (fileCountById.get(folderId) ?? 0) + 1);
    }
    const folderCountById = new Map<string, number>();
    for (const { parentId } of subfolderRows) {
      if (parentId) folderCountById.set(parentId, (folderCountById.get(parentId) ?? 0) + 1);
    }

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      parentId: row.parentId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      fileCount: fileCountById.get(row.id) ?? 0,
      folderCount: folderCountById.get(row.id) ?? 0,
    }));
  }

  async function summarizeFolder(row: FolderRow): Promise<FolderSummary> {
    const [summary] = await summarizeFolders([row]);
    return summary;
  }

  async function list(): Promise<FileSummary[]> {
    const rows = await db.select().from(files).orderBy(desc(files.updatedAt));
    return rows.map(toSummary);
  }

  async function get(id: string): Promise<FileRecord | null> {
    const [row] = await db.select().from(files).where(eq(files.id, id)).limit(1);
    return row ? toRecord(row) : null;
  }

  async function create(
    input: { name?: string; screens?: Screen[]; folderId?: string | null } = {},
  ): Promise<FileRecord> {
    const screensInput = input.screens ?? [defaultScreen()];
    const validated = validateScreens(screensInput, KNOWN_TYPES);
    if (!validated.ok) {
      throw new Error(`Cannot create a file: ${validated.reason}.`);
    }

    // A folderId that names no existing folder is rejected by the
    // files.folder_id foreign key at insert time (thrown as a plain
    // error), the same way invalid screens are rejected just above: the
    // POST route pre-checks folderId with folderPath() so a real client
    // request comes back as a 400 (see app/api/files/route.ts), and this
    // throw is only ever reached if that pre-check is bypassed.
    const [row] = await db
      .insert(files)
      .values({
        id: nanoid(10),
        name: input.name ?? 'Untitled',
        screens: validated.screens.map(toStoredScreen),
        folderId: input.folderId ?? null,
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
    if (input.screens !== undefined) {
      const validated = validateScreens(input.screens, KNOWN_TYPES);
      if (!validated.ok) return { ok: false, invalid: validated.reason };
      patch.screens = validated.screens.map(toStoredScreen);
    }
    if (input.folderId !== undefined) {
      // Unlike create()'s reliance on the foreign key, save() has an
      // established contract of returning a typed `invalid` result for bad
      // input rather than throwing (that's what layout validation just
      // above does too), so folderId gets the same explicit check.
      if (input.folderId !== null && !(await getFolderRow(input.folderId))) {
        return { ok: false, invalid: 'Folder does not exist' };
      }
      patch.folderId = input.folderId;
    }

    const [updated] = await db.update(files).set(patch).where(eq(files.id, id)).returning();
    return { ok: true, updatedAt: updated.updatedAt.toISOString() };
  }

  async function duplicate(id: string): Promise<FileRecord | null> {
    const [row] = await db.select().from(files).where(eq(files.id, id)).limit(1);
    if (!row) return null;

    // Every screen gets a fresh id: a duplicated file's screens are new,
    // independent identities, not aliases of the original's (interactions
    // that target a screen by id, added in a later task, would otherwise
    // resolve across both files at once).
    const reIdScreens = (row.screens as StoredScreen[]).map((screen) => ({ ...screen, id: nanoid(10) }));

    const [copy] = await db
      .insert(files)
      .values({
        id: nanoid(10),
        name: `${row.name} copy`,
        screens: reIdScreens,
        folderId: row.folderId,
      })
      .returning();

    return toRecord(copy);
  }

  async function remove(id: string): Promise<boolean> {
    const deleted = await db.delete(files).where(eq(files.id, id)).returning({ id: files.id });
    return deleted.length > 0;
  }

  async function listChildren(folderId: string | null): Promise<{ folders: FolderSummary[]; files: FileSummary[] }> {
    const folderRows = await db
      .select()
      .from(folders)
      .where(folderId === null ? isNull(folders.parentId) : eq(folders.parentId, folderId))
      .orderBy(asc(folders.name));
    const fileRows = await db
      .select()
      .from(files)
      .where(folderId === null ? isNull(files.folderId) : eq(files.folderId, folderId))
      .orderBy(desc(files.updatedAt));

    return {
      folders: await summarizeFolders(folderRows),
      files: fileRows.map(toSummary),
    };
  }

  // Root-first chain of folders from the top level down to and including
  // `folderId` itself (so the Files page can build both the breadcrumb and
  // the current folder's own name - its H1 - from one response: see
  // GET /api/folders in app/api/folders/route.ts). `[]` for the top level,
  // `null` if `folderId` names no folder.
  async function folderPath(folderId: string | null): Promise<FolderSummary[] | null> {
    if (folderId === null) return [];

    const chain: FolderRow[] = [];
    const seen = new Set<string>();
    let cursorId: string | null = folderId;

    while (cursorId !== null) {
      // Defensive only: moveFolder() never lets a cycle form, so this
      // cannot trigger in practice, it just guarantees this loop can never
      // spin forever if the data were ever corrupted some other way.
      if (seen.has(cursorId)) break;
      seen.add(cursorId);

      const row = await getFolderRow(cursorId);
      if (!row) return null;

      chain.push(row);
      cursorId = row.parentId;
    }

    chain.reverse();
    return summarizeFolders(chain);
  }

  async function listFolders(): Promise<FolderSummary[]> {
    const rows = await db.select().from(folders).orderBy(asc(folders.name));
    return summarizeFolders(rows);
  }

  async function createFolder(input: { name: string; parentId?: string | null }): Promise<CreateFolderResult> {
    const parentId = input.parentId ?? null;
    if (parentId !== null && !(await getFolderRow(parentId))) {
      return { ok: false, notFound: true };
    }

    const name = normalizeFolderName(input.name);
    const [row] = await db.insert(folders).values({ id: nanoid(10), name, parentId }).returning();
    return { ok: true, folder: await summarizeFolder(row) };
  }

  async function renameFolder(id: string, name: string): Promise<RenameFolderResult> {
    const existing = await getFolderRow(id);
    if (!existing) return { ok: false, notFound: true };

    const normalized = normalizeFolderName(name);
    const [row] = await db
      .update(folders)
      .set({ name: normalized, updatedAt: new Date() })
      .where(eq(folders.id, id))
      .returning();
    return { ok: true, folder: await summarizeFolder(row) };
  }

  async function moveFolder(id: string, parentId: string | null): Promise<MoveFolderResult> {
    const existing = await getFolderRow(id);
    if (!existing) return { ok: false, notFound: true };

    if (parentId !== null) {
      const targetParent = await getFolderRow(parentId);
      if (!targetParent) return { ok: false, notFound: true };

      // Cycle check: walk up from the target parent through its own
      // ancestors. If `id` (the folder being moved) turns up anywhere in
      // that chain - including the target parent itself, when parentId is
      // exactly `id` - then the target is `id` or one of its descendants,
      // and moving `id` there would make it its own ancestor.
      const seen = new Set<string>();
      let cursor: FolderRow | null = targetParent;
      while (cursor !== null) {
        if (cursor.id === id || seen.has(cursor.id)) {
          return { ok: false, invalid: 'cycle' };
        }
        seen.add(cursor.id);
        cursor = cursor.parentId !== null ? await getFolderRow(cursor.parentId) : null;
      }
    }

    const [row] = await db
      .update(folders)
      .set({ parentId, updatedAt: new Date() })
      .where(eq(folders.id, id))
      .returning();
    return { ok: true, folder: await summarizeFolder(row) };
  }

  async function removeFolder(id: string): Promise<RemoveFolderResult> {
    const existing = await getFolderRow(id);
    if (!existing) return { ok: false, notFound: true };

    const [fileRow] = await db.select({ id: files.id }).from(files).where(eq(files.folderId, id)).limit(1);
    if (fileRow) return { ok: false, notEmpty: true };

    const [subfolderRow] = await db.select({ id: folders.id }).from(folders).where(eq(folders.parentId, id)).limit(1);
    if (subfolderRow) return { ok: false, notEmpty: true };

    await db.delete(folders).where(eq(folders.id, id));
    return { ok: true };
  }

  async function moveFile(id: string, folderId: string | null): Promise<MoveFileResult> {
    const [row] = await db.select().from(files).where(eq(files.id, id)).limit(1);
    if (!row) return { ok: false, notFound: true };

    if (folderId !== null && !(await getFolderRow(folderId))) {
      return { ok: false, invalid: 'folder' };
    }

    // Same strictly-increasing updatedAt treatment as save(), above.
    const now = new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1));
    const [updated] = await db.update(files).set({ folderId, updatedAt: now }).where(eq(files.id, id)).returning();
    return { ok: true, updatedAt: updated.updatedAt.toISOString() };
  }

  return {
    list,
    get,
    create,
    save,
    duplicate,
    remove,
    listChildren,
    folderPath,
    listFolders,
    createFolder,
    renameFolder,
    moveFolder,
    removeFolder,
    moveFile,
  };
}
