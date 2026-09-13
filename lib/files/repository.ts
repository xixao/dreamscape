import { asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { Db } from '@/db/client';
import { files, folders } from '@/db/schema';
// Imported from known-types.ts, not registry.tsx: registry.tsx pulls in
// @craftjs/core and the block components, which breaks when this
// repository is loaded from a plain server module such as a files API
// route handler (see known-types.ts for the full explanation).
import { KNOWN_TYPES, defaultScreen } from '@/components/blocks/known-types';
import {
  dropDanglingDiagramEdges,
  validateDiagramReferences,
  validatePages,
  validateScreens,
  type OverlayPresentation,
  type Page,
  type Screen,
  type ScreenInput,
  type ScreenKind,
} from './validate';

// Re-exported so callers only need to know about lib/files/repository.ts,
// the file-level domain module - Screen/Page themselves live in validate.ts
// purely to avoid a repository.ts <-> validate.ts import cycle
// (validateScreens/validatePages return Screen[]/Page[] and repository.ts
// calls them).
export type {
  OverlayPresentation,
  OverlaySide,
  Page,
  Screen,
  ScreenInput,
  ScreenKind,
  ToastPosition,
} from './validate';

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
  // Same optionality rationale again, this time for pages (migration 0003):
  // a FileRecord literal written before pages existed still type-checks
  // with no pages. Real repository code always populates it.
  pages?: Page[];
};
// `screens` is ScreenInput[], not Screen[]: save() (like create() below)
// validates and normalizes whatever it is given through validateScreens,
// and an API caller's screens (zod's shape-checked output, lib/files/
// http.ts) are exactly that pre-validation shape - an overlay frame's
// presentation in particular is only known to match the union once
// validateScreens has said so. A Screen is a ScreenInput, so every caller
// that already holds validated screens is unaffected.
export type SaveInput = {
  name?: string;
  screens?: ScreenInput[];
  pages?: Page[];
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
  x?: number | null;
  y?: number | null;
  pageId: string;
  // Overlay frames (spec docs/superpowers/specs/2026-09-13-overlay-frames-
  // design.md section 2): stored exactly as validated, and only when
  // present - a plain screen keeps neither key, so rows saved before
  // overlays existed are untouched.
  kind?: ScreenKind;
  presentation?: OverlayPresentation;
};

// The two overlay keys, carried across the storage boundary only when the
// screen actually has them (never written as an explicit undefined).
function overlayFields(screen: Pick<Screen, 'kind' | 'presentation'>): Pick<Screen, 'kind' | 'presentation'> {
  return {
    ...(screen.kind !== undefined ? { kind: screen.kind } : {}),
    ...(screen.presentation !== undefined ? { presentation: screen.presentation } : {}),
  };
}

function toApiScreens(raw: unknown): Screen[] {
  return (raw as StoredScreen[]).map((screen) => ({
    id: screen.id,
    name: screen.name,
    layout: JSON.stringify(screen.layout),
    stageWidth: screen.stageWidth,
    stageHeight: screen.stageHeight ?? null,
    deviceName: screen.deviceName ?? null,
    x: screen.x ?? null,
    y: screen.y ?? null,
    pageId: screen.pageId,
    ...overlayFields(screen),
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
    x: screen.x ?? null,
    y: screen.y ?? null,
    // Always set by this point: every screen reaching toStoredScreen has
    // already gone through validateScreens with a real pageIds cross-check
    // (create()/save() both call stampMissingPageId before validating), so
    // screen.pageId is never actually undefined here despite Screen's own
    // optional type - the non-null assertion documents that invariant
    // rather than silently writing a literal "undefined" into storage.
    pageId: screen.pageId!,
    ...overlayFields(screen),
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
    pages: row.pages as Page[],
  };
}

// A file's implicit single page when a caller (create()'s default, or an
// older save() patch that only ever knew about screens) does not mention
// pages at all - see the module comment on Screen.pageId in validate.ts.
// A fresh nanoid(10) every call, same rationale as defaultScreen(): two
// implicit default pages minted back to back must not collide.
function defaultPage(): Page {
  return { id: nanoid(10), name: 'Page 1' };
}

// Stamps any screen missing a pageId with `defaultPageId`, leaving one that
// already names a page untouched - shared by create() and save() so a
// caller that has not adopted pages yet (an existing test fixture, or a
// screens-only patch after the file already has real pages) keeps behaving
// exactly as it did before pages existed, while validateScreens itself
// stays strict (no silent defaulting inside validation, matching how it
// never silently fixes any other field either).
function stampMissingPageId(screens: ScreenInput[], defaultPageId: string): ScreenInput[] {
  return screens.map((screen) => (screen.pageId ? screen : { ...screen, pageId: defaultPageId }));
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

  // `screens` is ScreenInput[] for the same reason SaveInput's is (see the
  // comment on SaveInput above).
  async function create(
    input: { name?: string; screens?: ScreenInput[]; pages?: Page[]; folderId?: string | null } = {},
  ): Promise<FileRecord> {
    const pagesInput = input.pages ?? [defaultPage()];
    const validatedPages = validatePages(pagesInput);
    if (!validatedPages.ok) {
      throw new Error(`Cannot create a file: ${validatedPages.reason}.`);
    }
    const pageIds = new Set(validatedPages.pages.map((p) => p.id));

    const screensInput = stampMissingPageId(input.screens ?? [defaultScreen()], validatedPages.pages[0].id);
    const validatedScreens = validateScreens(screensInput, KNOWN_TYPES, pageIds);
    if (!validatedScreens.ok) {
      throw new Error(`Cannot create a file: ${validatedScreens.reason}.`);
    }

    // Only now, with both slices validated on their own terms, can a
    // diagram edge's screenId endpoint be checked against the screens that
    // actually exist on its own page (see validateDiagram's own doc comment
    // in lib/files/validate.ts for why this cannot happen any earlier).
    const diagramReferences = validateDiagramReferences(validatedPages.pages, validatedScreens.screens);
    if (!diagramReferences.ok) {
      throw new Error(`Cannot create a file: ${diagramReferences.reason}.`);
    }

    // A folderId that names no existing folder is rejected by the
    // files.folder_id foreign key at insert time (thrown as a plain
    // error), the same way invalid pages/screens are rejected just above:
    // the POST route pre-checks folderId with folderPath() so a real
    // client request comes back as a 400 (see app/api/files/route.ts), and
    // this throw is only ever reached if that pre-check is bypassed.
    const [row] = await db
      .insert(files)
      .values({
        id: nanoid(10),
        name: input.name ?? 'Untitled',
        pages: validatedPages.pages,
        screens: validatedScreens.screens.map(toStoredScreen),
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
    // Pages and screens are re-validated together whenever either changes:
    // deleting a page must remove its screens in the same patch, and a
    // page-only patch (rename, reorder) must still re-check every EXISTING
    // screen's pageId against the new pages list, since a client could send
    // a pages patch alone without adjusting screens - see validatePages/
    // validateScreens in lib/files/validate.ts for the cross-check itself.
    if (input.pages !== undefined || input.screens !== undefined) {
      const pagesInput = input.pages ?? (row.pages as Page[]);
      const validatedPages = validatePages(pagesInput);
      if (!validatedPages.ok) return { ok: false, invalid: validatedPages.reason };
      const pageIds = new Set(validatedPages.pages.map((p) => p.id));

      const screensInput = stampMissingPageId(
        input.screens ?? toApiScreens(row.screens),
        validatedPages.pages[0].id,
      );
      const validatedScreens = validateScreens(screensInput, KNOWN_TYPES, pageIds);
      if (!validatedScreens.ok) return { ok: false, invalid: validatedScreens.reason };

      // Unlike create() (which still hard-rejects through
      // validateDiagramReferences, imported above for that one remaining
      // use), a PATCH drops a dangling diagram edge instead of rejecting
      // the save - see dropDanglingDiagramEdges' own doc comment in
      // lib/files/validate.ts for why: a screen leaving this page (deleted,
      // or moved elsewhere) is routine editing, not a malformed payload,
      // and this saver's client (lib/persistence.ts) never retries a
      // non-409/5xx response - hard-rejecting here would wedge the file on
      // every future autosave instead of just cleaning up after this one.
      patch.pages = dropDanglingDiagramEdges(validatedPages.pages, validatedScreens.screens);
      patch.screens = validatedScreens.screens.map(toStoredScreen);
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

    // Every page gets a fresh id too, for the same reason every screen
    // does just below: a duplicated file's pages are new, independent
    // identities, not aliases of the original's. pageIdMap carries the
    // remapping over to each copied screen's own pageId right after.
    const pageIdMap = new Map<string, string>();
    const reIdPages = (row.pages as Page[]).map((page) => {
      const newId = nanoid(10);
      pageIdMap.set(page.id, newId);
      return { ...page, id: newId };
    });

    // Every screen gets a fresh id: a duplicated file's screens are new,
    // independent identities, not aliases of the original's (interactions
    // that target a screen by id, added in a later task, would otherwise
    // resolve across both files at once).
    const reIdScreens = (row.screens as StoredScreen[]).map((screen) => ({
      ...screen,
      id: nanoid(10),
      pageId: pageIdMap.get(screen.pageId) ?? screen.pageId,
    }));

    const [copy] = await db
      .insert(files)
      .values({
        id: nanoid(10),
        name: `${row.name} copy`,
        pages: reIdPages,
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
