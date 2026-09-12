# Folders, Comments Placeholder and Layer Stack Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After the first Vercel deploy, add nestable folders to the Files page, a comments placeholder UI in the editor, and the press-and-hold layer stack menu, then redeploy.

**Architecture:** Folders are a second table with a self-referencing parent; the repository and API grow folder operations and `folderId` on files; the Files page renders one level per route. Comments are a browser-only store per file with a pin layer inside the artboard's zoom wrapper and two popovers. The layer stack menu is a hold-timer on the stage column that computes the stack from Craft's node DOM map.

**Tech Stack:** as the shared-files plan, plus shadcn `dialog` (already installed) for Move to.

Specs: `docs/superpowers/specs/2026-09-12-folders-and-comments-design.md` and `docs/superpowers/specs/2026-09-12-layer-stack-menu-design.md`. Global Constraints from `docs/superpowers/plans/2026-09-12-shared-files.md` apply unchanged (tests first, pristine output, SF2 chrome via `chrome.ts`, Figma vocabulary, no em dashes, `components/ui/*` untouched, server code imports `components/blocks/known-types` not `registry`, commit trailer).

---

### Task 9: Folders in the database, repository and API

**Files:** modify `db/schema.ts`, `lib/files/repository.ts`, `lib/files/repository.test.ts`, `lib/files/http.ts`, `app/api/files/route.ts`, `app/api/files/[id]/route.ts`, `app/api/files/files.test.ts`; create `drizzle/0001_*.sql` (generated), `app/api/folders/route.ts`, `app/api/folders/all/route.ts`, `app/api/folders/[id]/route.ts`, `app/api/folders/folders.test.ts`.

- [ ] Schema per spec section 3 (`folders` table; `files.folderId`), `npx drizzle-kit generate`, commit the migration. The PGlite test client applies all migrations in order.
- [ ] Repository: tests first for every case in spec section 6 (repository list), then implement `FolderSummary`, `listChildren`, `folderPath`, `createFolder`, `renameFolder`, `moveFolder` (cycle check walks the target's ancestors), `removeFolder` (empty-only), `moveFile`, `listFolders`, `folderId` on `create`/`duplicate`, `FileSummary.folderId`.
- [ ] API: zod schemas for folder bodies; routes per spec section 3 with the same status mapping style as the files API; tests for each route and for `folderId` on files. Cycle → 400 `{ error: 'Cannot move a folder into itself' }`; not empty → 409 `{ error: 'Folder is not empty' }`.
- [ ] Commit "Add nestable folders to the files model and API".

### Task 10: Files page with folders

**Files:** modify `app/page.tsx`, `components/files/files-page.tsx`, `files-table.tsx`, `files-actions.tsx`, their tests, `components/workbench/topbar.tsx` (back link target) and `workbench.tsx` (pass `folderId`); create `app/folders/[id]/page.tsx`, `app/folders/[id]/not-found.tsx`, `components/files/move-dialog.tsx`, `components/files/new-folder-row.tsx`, tests.

- [ ] Both routes load `folderPath` and `listChildren` through the repository and render `FilesPage({ path, folders, files, folderId })`.
- [ ] Spec section 4 in full: title and breadcrumb, count "N folders, M files", New folder inline row, folder rows with Rename/Move to/Delete (disabled + tooltip when not empty; the client knows emptiness from a `childCount` the API includes in `FolderSummary`... add `fileCount` and `folderCount` to `listChildren`'s folder rows in Task 9 if not present), file rows with Move to, Move dialog with the disabled-descendants rule computed client-side from `GET /api/folders/all`, empty states, back link from the workbench to the folder level.
- [ ] Tests per spec section 6 (Files page list).
- [ ] Commit "Organize files in nestable folders".

### Task 11: Comments placeholder

**Files:** create `lib/comments/store.ts`, `lib/comments/store.test.ts`, `components/workbench/comments/comment-layer.tsx`, `comment-composer.tsx`, `comment-thread.tsx`, `comments.test.tsx`; modify `components/workbench/workbench.tsx`, `stage.tsx` (render the layer inside the zoom wrapper and expose the artboard rect/zoom), `topbar.tsx` (comment tool button with count), `keyboard.tsx` (`C` and Escape handling through options), tests.

- [ ] Store first (spec section 5) with tests through a fake storage.
- [ ] Comment mode, pin placement, composer, thread and reply per spec section 5; author name prompt once; the placeholder note in the composer footer.
- [ ] Tests per spec section 6 (comments).
- [ ] Commit "Add the comments placeholder UI".

### Task 12: Layer stack menu

Per `docs/superpowers/specs/2026-09-12-layer-stack-menu-design.md` sections 2 to 5: `lib/layer-stack.ts` (+ tests), `components/workbench/layer-stack-menu.tsx` (+ tests), wiring in `WorkbenchShell`. Commit "Add the press-and-hold layer stack menu".

### Task 13: Migrate, redeploy, verify

`npm run db:migrate` against Neon, `npm run deploy`, walk spec section 6's browser check and the layer stack spec's browser check on the production URL, note results in the ledger.
