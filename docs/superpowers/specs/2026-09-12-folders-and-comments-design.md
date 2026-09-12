# Assembly Workbench, Sub-project 2b: Folders and the comments placeholder

Date: 2026-09-12
Status: approved in conversation (Matt, 2026-09-12); technical choices delegated to Claude

## 1. What this delivers

1. Files organized in nestable folders (Matt calls them projects). The Files page shows one level at a time with a breadcrumb; folders can be created, renamed, moved and deleted; files can live at the top level or in any folder and can be moved.
2. A comments placeholder in the editor: a comment tool, pins dropped on the canvas, a thread per pin with the author's name, text and timestamp, and replies. UI only; no backend. Comments are kept in the browser per file so they survive a reload, and the spec says so in the UI copy.

Order of work after the first Vercel deploy: folders, comments UI, the layer stack menu (its own spec), redeploy.

## 2. Decisions

| Decision | Choice |
|---|---|
| Folder model | `folders` table with a nullable `parent_id`; `files.folder_id` nullable. A file at the top level has no folder |
| Deleting a folder | Only when it is empty (no files, no subfolders); the Delete action is disabled with the tooltip "Empty the folder first" otherwise |
| Moving | "Move to" dialog with an indented folder list and a "Top level" option; a folder cannot be moved into itself or one of its descendants (those rows are disabled) |
| Sorting | Folders first, by name; then files by last updated, newest first |
| Comments storage | Browser only for now (`localStorage`, keyed by file id). The composer footer reads "Comments are saved in this browser only for now." |
| Author | Asked once ("Your name"), stored in the browser, editable from the composer |
| Pin anchoring | Artboard coordinates (unzoomed pixels from the artboard's top-left) plus the id of the innermost layer under the point, kept for the real backend later (the PRD pins comments to a node id) |
| Comment tool | Top bar button (lucide `MessageCircle`, shows the open thread count) and the `C` key toggle comment mode; Escape leaves it |

## 3. Database and API (folders)

```
folders
  id          text primary key      nanoid(10)
  name        text not null
  parent_id   text null references folders(id) on delete restrict
  created_at  timestamptz not null default now()
  updated_at  timestamptz not null default now()

files
  + folder_id text null references folders(id) on delete restrict
```

Repository additions (`lib/files/repository.ts`): `listChildren(folderId: string | null): Promise<{ folders: FolderSummary[]; files: FileSummary[] }>`, `folderPath(folderId: string | null): Promise<FolderSummary[]>` (root first, empty for the top level), `createFolder({ name, parentId })`, `renameFolder(id, name)`, `moveFolder(id, parentId)` (rejects cycles with `{ ok: false, invalid: 'cycle' }`), `removeFolder(id)` (`{ ok: false, notEmpty: true }` when not empty), `moveFile(id, folderId)`, `listFolders()` (every folder with `parentId`, for the picker). `create` and `duplicate` take `folderId`. `FolderSummary = { id, name, parentId, createdAt, updatedAt }`; `FileSummary` gains `folderId`.

API (`app/api/folders/...`): `GET /api/folders?parent=<id>` (omit for top level) → `{ path, folders, files }`; `POST /api/folders` `{ name, parentId? }` → 201 `{ folder }`; `PATCH /api/folders/[id]` `{ name?, parentId?: string | null }` → `{ folder }`, 400 on a cycle; `DELETE /api/folders/[id]` → 204, 409 `{ error: 'Folder is not empty' }`; `GET /api/folders/all` → `{ folders }`. `POST /api/files` and `PATCH /api/files/[id]` accept `folderId?: string | null`.

## 4. Files page with folders

- Routes: `/` is the top level, `/folders/[id]` a folder. Both render `FilesPage` for that level. A missing folder is a 404 with "This folder does not exist" and a link to Files.
- Page head: H1 is the current folder's name ("Files" at the top level); under it a breadcrumb `Files › Marketing › Q4` (shadcn `Breadcrumb`, mono 10.5 px like the Design panel's); the mono count reads "2 folders, 5 files". Actions: "New folder" (secondary), "New from example: Login screen" (secondary), "+ New file" (primary gradient). New files and folders are created in the current level.
- Table rows: folders first with lucide `Folder` in `text-acc2`, the name a link to `/folders/<id>`, Updated, actions Rename, Move to, Delete (disabled when not empty). Then files as today plus a "Move to" action (lucide `FolderInput`). Duplicate keeps the file in its folder.
- New folder: an inline chip input row at the top of the table ("Folder name", Enter creates, Escape cancels).
- Move to: an `AlertDialog`-style dialog (shadcn `Dialog`) titled "Move <name>" with a scrollable indented list (radio semantics) beginning with "Top level"; the current location is marked; the moving folder and its descendants are disabled; "Move" confirms, `router.refresh()` after.
- Empty level: "This folder is empty" / "Create a file or a folder to get started." (top level keeps "No files yet").
- The workbench top bar's back link returns to the file's folder level.

## 5. Comments placeholder (editor)

- `lib/comments/store.ts`: types `CommentThread { id; fileId; x; y; anchorNodeId?: string; author; text; createdAt; replies: CommentReply[] }`, `CommentReply { id; author; text; createdAt }`; `createCommentStore(fileId, storage = localStorage)` with `list()`, `add({ x, y, anchorNodeId, author, text })`, `reply(threadId, { author, text })`, `resolve(threadId)` (removes it), `subscribe(fn)`; storage key `assembly-workbench:comments:<fileId>`; author name in `assembly-workbench:author-name` via `getAuthorName()/setAuthorName()`.
- Comment mode: `commentMode` state in `WorkbenchShell`; the top bar button (`aria-pressed`) and the `C` key toggle it (through `useWorkbenchKeyboard`'s options, ignored while typing); Escape exits. In comment mode the artboard shows a crosshair cursor and clicks on it do not select layers; a click places a pin at `((clientX - rect.left) / zoom, (clientY - rect.top) / zoom)` relative to the artboard, records the innermost `[data-block]` under the point as `anchorNodeId` (from Craft's node DOM map), and opens the composer.
- Pins: a `CommentLayer` inside the zoom wrapper, absolutely positioned over the artboard, `pointer-events-none` except the pins. Each pin is a 24 px circle with the thread number, `bg-primary text-white font-mono text-[11px] font-semibold shadow-panel`, positioned at the thread's `x, y` with its bottom-left at the point (a small tail). Pins stay visible in every mode and when the UI is hidden.
- Composer popover (SF2 popover: `bg-card border rounded-md shadow-panel-lg p-3 w-72`): first use shows "Your name" (chip input) above the textarea; textarea "Add a comment" (`CHIP` treatment, 3 rows); footer row: the placeholder note in `text-[10.5px] text-t4`, then Cancel (ghost) and "Comment" (SF2 secondary `.btn`); Cmd+Enter submits; Escape cancels and removes the pending pin.
- Thread popover (same surface, `w-80`): header "#3" in mono plus a "Resolve" ghost button (removes the thread after no confirm; placeholder) and a close button; the first comment then replies, each row: initials avatar (24 px circle, `bg-[image:var(--grad)] text-white text-[11px] font-semibold`), name (`text-[13px] font-medium`), relative time in mono `text-[10.5px] text-muted-foreground` with the full timestamp as `title`, text (`text-[13px] text-t2`); a reply composer at the bottom ("Reply", Cmd+Enter or the Reply button). Opening a pin's thread does not require comment mode.
- Top bar: the comment tool button shows the open-thread count as a mono badge when > 0.

## 6. Tests

- Repository: folder CRUD, `listChildren` ordering, `folderPath`, cycle rejection (self and descendant), `removeFolder` empty-only, `moveFile` to a folder and back to top level, `create`/`duplicate` with `folderId`.
- API: every folders route and the `folderId` additions on files.
- Files page: breadcrumb and title per level, folder rows before file rows, New folder inline, Move to dialog (disabled rows, top level option, PATCH body), delete disabled when not empty.
- Comments store: round trip through a fake storage, reply appends, resolve removes, author name persistence.
- Comment UI: `C` and the button toggle comment mode; a click in comment mode at a known point creates a thread with the expected artboard coordinates and opens the composer; submitting shows a numbered pin; clicking the pin shows author, relative time and text; a reply appears; Resolve removes the pin; Escape exits comment mode.
- Browser (production URL after redeploy): make a folder inside a folder, move a file in, open it, add a comment and a reply, reload, both are still there in that browser.
