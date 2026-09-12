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

### Task 12b: Keyboard shortcuts overlay

Per `docs/superpowers/specs/2026-09-12-shortcuts-overlay-design.md` sections 2 to 5: `lib/shortcuts.ts` (+ tests), `components/workbench/shortcuts-overlay.tsx` (+ tests), `HANDLED_SHORTCUTS` exported from `keyboard.tsx`, wiring in `WorkbenchShell`. Runs after Task 11 because both touch `keyboard.tsx` and `workbench.tsx`. Commit "Show the keyboard shortcuts while holding the command key".

### Task 12c: Device presets for the frame

Per the research in `docs/research/2026-09-12-figma-device-presets.md` and the data file `lib/stage/device-presets.json`: the Mobile, Tablet and Desktop buttons in the top bar each open a device list (shadcn `DropdownMenu` or `Select`, SF2-styled) grouped as Figma groups them; choosing a device sets the frame's width and height (the artboard gets a fixed height equal to the device height with content scrolling inside it, and `min-height` no longer applies); the readout shows the device name (for example `iPhone 16 Pro · 402 x 874 · 63%`); a custom width from the grip clears the device name; `MIN_STAGE_WIDTH` becomes 120 so Watch and Paper sizes fit (`clampWidth`, the grip's `aria-valuemin` and their tests follow); the file stores `deviceName` and `stageHeight` alongside `stageWidth` (schema: `stage_height integer null`, `device_name text null`, migration). Tests: the preset data validates (every entry has positive integer width and height); choosing a device sets width, height and the readout; the grip clears the device; persistence round trip through the API. Commit "Add Figma device presets to the frame sizes".

### Task 12d: Frame titles (Matt, 2026-09-12)

Like Figma, every top-level frame shows an editable title above its top-left corner on the canvas. The root LayoutBox gets a `name` prop (default "Frame 1"; when a device preset is chosen on a frame that still has the default name, the name becomes the device name, for example "iPhone 16 & 17 Pro"). The title renders in the stage column just above the artboard (chrome theme: `font-mono text-[11px] text-muted-foreground`, Figma's gray label look; turns `text-foreground` when the root is selected); double-click enters inline editing (`CHIP` input, `aria-label="Frame title"`, Enter commits, Escape cancels, empty reverts, max 80); single click selects the root. The Design panel shows a "Name" text field at the top of the Auto layout section for every LayoutBox (root and nested) bound to the same `name` prop (nested frames default to "Frame"); the breadcrumb, the selection outline tag and the layer stack menu show `name` when set, otherwise the display name. The name is part of the layout JSON, so it saves with the file and survives undo. Later, the code generator uses frame names as page names. Tests: default title renders; double-click, type, Enter renames the root through `setProp`; Escape reverts; the Design panel name field edits a nested frame and the breadcrumb follows; choosing a device preset renames an untouched default title only. Commit "Add editable frame titles".

### Task 12e: Chat panel placeholder (Matt, 2026-09-12)

A top bar button (lucide `MessageSquareText`, `aria-label="Chat"`, `aria-pressed`) and Cmd+J (Ctrl+J elsewhere; registered in `lib/shortcuts.ts` under View: "Open or close the chat panel") toggle a fourth column on the far right of the workbench grid (`grid-cols-[280px_1fr_320px_360px]` when open), an SF2 panel titled "Chat" with a close button. Inside: a message list (`role="log"`, user messages right-aligned in `bg-muted` bubbles, assistant messages left-aligned with a 24 px initials avatar "A" on the `--grad` circle, mono timestamps), an empty state ("Ask about this design", two example prompts as SF2 secondary buttons that fill the composer), and a composer at the bottom (`CHIP` textarea, auto-growing to 6 rows, placeholder "Message", Enter sends, Shift+Enter inserts a line break, a ghost send button with lucide `ArrowUp`). Sending appends the user message and, after 600 ms, one assistant message: "The assistant is not connected yet. This panel is a placeholder for the conversation feature." No network call of any kind. Conversation kept per file in `localStorage` (`assembly-workbench:chat:<fileId>`) through a small `createChatStore(fileId, storage)` mirroring the comments store; "Clear conversation" ghost action in the panel header. The panel is hidden with Cmd+\ like the others and Escape inside the composer only blurs it. Tests: the store round trip; button and Cmd+J toggle the panel; Enter sends and the placeholder reply appears after the delay (fake timers); Shift+Enter inserts a newline; empty input does not send; Clear conversation empties the log; no `fetch` is called (assert the mock is never invoked). Commit "Add the chat panel placeholder".

### Task 13: Migrate, redeploy, verify

`npm run db:migrate` against Neon, `npm run deploy`, walk spec section 6's browser check and the layer stack spec's browser check on the production URL, note results in the ledger.
