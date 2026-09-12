# Assembly Workbench, Sub-project 2: Shared files on Vercel

Date: 2026-09-12
Status: approved in conversation (Matt, 2026-09-12); technical choices delegated to Claude

## 1. What this sub-project delivers

The workbench deployed on Vercel at a link Matt can send to coworkers on Monday 2026-09-14. Designs are stored in a database on Vercel, not in the browser, so a file opened from the link is the same file for everyone. A Files page lists every file, creates new ones (empty or from the login-screen example), and opens, renames, duplicates and deletes them. Each file has its own link. There is no sign-in: the app runs on the internal network and anyone with the link can edit.

Out of scope, deliberately: accounts and permissions (Matt: handled by the internal network), real-time co-editing and presence (PRD sub-project 4), multiple screens per file (next sub-project, with the Figma layout pass), version history beyond "last saved".

## 2. Decisions

| Decision | Choice |
|---|---|
| Hosting | Vercel project `shadcn-assembly-workbench` under team `matts-projects-a87298a1` (already linked from the repo with `vercel link`) |
| Database | Neon Postgres through the Vercel Marketplace, free plan, resource `workbench-db`, env `DATABASE_URL`. Matt accepts Neon's marketplace terms once; the CLI then provisions it |
| Data access | Drizzle ORM. Production uses `@neondatabase/serverless` over HTTP; tests use PGlite (in-process Postgres) with the same schema, no network |
| Ids | 10-character URL-safe ids from `nanoid`, in the path `/f/<id>` |
| Sharing model | No sign-in. Anyone with a file link can edit it. The Files page shows every file |
| Concurrency | Last write wins. Every save carries the `updatedAt` the client last saw; a save against a newer row is rejected and the client shows "Someone else changed this file. Reload to see it." Duplicate is the safe way to riff on someone else's file |
| Autosave | Debounced 800 ms after the last change, flushed when leaving the page; the topbar shows Saved / Saving / Save failed |
| Stage width | Stored per file, so a file opens at the width it was left at |
| Examples | "Login screen" (the layout built through the tool on 2026-09-12) is bundled in the app; the Files page offers "New from example". The first deploy seeds one "Login screen" file |
| Error handling | The stage error boundary never deletes anything any more; it shows "This file could not be opened" with Back to files and an explicit Reset file action |

## 3. Stack additions

- `drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless`, `@electric-sql/pglite`, `nanoid`, `zod`
- Vercel CLI 59 (signed in as `matt-2096`), `vercel --prod` from the local checkout; no GitHub in the loop

## 4. Architecture

### 4.1 Database

One table.

```
files
  id           text primary key            nanoid(10)
  name         text not null               default 'Untitled'
  layout       jsonb not null              Craft.js serialized tree (same shape as today's localStorage value)
  stage_width  integer not null            default 1440, clamped 320..1920 on write
  created_at   timestamptz not null        default now()
  updated_at   timestamptz not null        default now(), set on every update
```

`db/schema.ts` declares it with Drizzle. `db/client.ts` exports `getDb()`: with `DATABASE_URL` set it returns a Neon HTTP Drizzle instance (memoized); without it (tests) it returns a PGlite in-memory instance created once per process, with the schema applied through `drizzle-kit`'s generated SQL or `pushSchema`. Schema changes reach production with `npx drizzle-kit push` run locally against the pulled `DATABASE_URL`.

### 4.2 Repository

`lib/files/repository.ts` exports `createFilesRepository(db)` returning:

```ts
type FileSummary = { id: string; name: string; updatedAt: string; createdAt: string };
type FileRecord = FileSummary & { layout: string; stageWidth: number };   // layout is the JSON string the workbench consumes
type SaveInput = { name?: string; layout?: string; stageWidth?: number; baseUpdatedAt?: string };
type SaveResult = { ok: true; updatedAt: string } | { ok: false; conflict: true; updatedAt: string } | { ok: false; notFound: true };

list(): Promise<FileSummary[]>                                  // newest updated first
get(id): Promise<FileRecord | null>
create(input: { name?: string; layout?: string; stageWidth?: number }): Promise<FileRecord>   // layout defaults to emptyLayoutJson()
save(id, input: SaveInput): Promise<SaveResult>                 // conflict when baseUpdatedAt is given and differs from the row
duplicate(id): Promise<FileRecord | null>                       // name becomes "<name> copy"
remove(id): Promise<boolean>
```

`layout` is validated on the way in with the same rules as today's `loadLayout` (valid JSON, has ROOT, every node type known); invalid input is rejected with a 400 by the API, never stored.

### 4.3 API (Next.js route handlers, `app/api/files/...`)

| Route | Body | Response |
|---|---|---|
| `GET /api/files` | | `{ files: FileSummary[] }` |
| `POST /api/files` | `{ name?, example?: 'login' }` | 201 `{ file: FileRecord }` |
| `GET /api/files/[id]` | | `{ file: FileRecord }` or 404 |
| `PATCH /api/files/[id]` | `SaveInput` (zod-validated) | `{ updatedAt }`, 409 `{ updatedAt }` on conflict, 404, 400 |
| `POST /api/files/[id]/duplicate` | | 201 `{ file: FileRecord }` or 404 |
| `DELETE /api/files/[id]` | | 204 or 404 |

Route handlers are thin: parse, call the repository, map results to status codes. Pages read through the repository directly (server components), not through their own API.

### 4.4 Pages

- `/` Files page (server component, `dynamic = 'force-dynamic'`). SF2 §4 page head: H1 "Files", mono count ("3 files"), spacer, "New from example" (secondary button with a menu of examples; one example today so a plain button "New from example: Login screen"), and the one primary gradient action "+ New file". Below, an SF2 §7 table: Name (link to `/f/<id>`), Updated (relative, "4 minutes ago"), and a right-aligned actions cluster with ghost buttons Duplicate, Rename, Delete. Empty state (SF2 §4): "No files yet" / "Create your first file to get started." Rename is inline (the name becomes a chip input; Enter saves, Escape cancels). Delete opens the SF2 confirm modal ("Delete <name>?", "This removes the file for everyone. Undo will not bring it back.", Cancel, Delete with the danger treatment). New file and New from example create the file and navigate to it.
- `/f/[id]` Workbench page (server component): loads the file; 404 page "This file does not exist" with a link to Files if missing. Renders `<WorkbenchLoader file={...} />`.
- Topbar changes: a "Files" ghost link (lucide `ArrowLeft`) before the product name; the file name after the product name as an inline-editable chip (Enter saves, blur saves, Escape reverts); the save indicator after the readout in mono: "Saved", "Saving", "Save failed, retrying", or the conflict message with a Reload button. "New frame" stays and clears the frame of this file.
- `app/layout.tsx` metadata gets `robots: { index: false }`.

### 4.5 Workbench persistence

`Workbench` receives `file: FileRecord` and keeps `fileId`, `name`, `updatedAt` in state. `lib/persistence.ts` loses the localStorage layout and width functions and gains:

```ts
createFileSaver({ fileId, initialUpdatedAt, fetchImpl?, onState }): {
  queue(patch: { layout?: string; stageWidth?: number; name?: string }): void;  // merges patches, debounced 800 ms
  flush(): Promise<void>;                                                       // sends now (used on unmount and pagehide)
  state: 'saved' | 'saving' | 'error' | 'conflict';
}
```

It PATCHes `/api/files/<id>` with the merged patch plus `baseUpdatedAt`; on success it stores the returned `updatedAt`; on 409 it enters `conflict` and stops saving until the page is reloaded; on network failure it retries after 5 s (state `error`). `flush()` on `pagehide` uses `fetch(..., { keepalive: true })`. The Craft `onNodesChange` queues `{ layout: query.serialize() }`; width changes queue `{ stageWidth }`; the topbar name field queues `{ name }` on commit.

`loadLayout`'s validation function stays (renamed `validateLayout(json, knownTypes): string | null`) and is used by the API and by the workbench page before mounting.

### 4.6 Example files

`lib/examples/login-screen.json` (checked in) and `lib/examples/index.ts` exporting `EXAMPLES: { slug: 'login'; name: 'Login screen'; layout: string; stageWidth: 1440 }[]`. `scripts/seed.ts` (run with `npx tsx scripts/seed.ts`, needs `DATABASE_URL`) creates the "Login screen" file if the table is empty.

### 4.7 Error boundary

`StageErrorBoundary` keeps catching, warns, and renders a fallback with "This file could not be opened.", a "Back to files" link and a "Reset file" button that PATCHes an empty layout and reloads. It no longer touches storage on its own.

### 4.8 Deployment

1. Matt accepts Neon's marketplace terms (browser). 2. `vercel integration add neon -n workbench-db` (non-interactive) provisions the database and adds `DATABASE_URL` to all environments. 3. `vercel env pull .env.local`. 4. `npx drizzle-kit push` creates the table in Neon. 5. `npx tsx scripts/seed.ts`. 6. `vercel --prod`. 7. Browser check on the production URL: Files page, open the seeded file, edit, reload, second tab conflict, duplicate, delete. Repeat steps 4 to 6 for later deploys (`npm run deploy` wraps 6).

## 5. Testing

- Repository tests on PGlite (`// @vitest-environment node`): create defaults, list order, get missing, save success and conflict and not found, duplicate name, remove, layout validation rejects bad input, stage width clamped.
- Route handler tests calling the exported handlers with `Request` objects against the PGlite-backed repository: status codes and bodies for every row of the table in 4.3, zod rejection of a bad PATCH body.
- `createFileSaver` tests with a fake `fetchImpl` and fake timers: debounce and merge, `baseUpdatedAt` sent, `updatedAt` adopted, 409 to conflict and no further sends, network error retry, flush sends immediately.
- Files page component test (RTL, jsdom) with mocked fetch for actions: renders rows, empty state, rename inline, delete confirm.
- Workbench test: initial layout from the `file` prop, a change results in a PATCH with the serialized layout, conflict shows the message.
- Existing tests keep passing; the localStorage persistence tests are replaced.

## 6. Verification in the running app (production URL)

1. Files page lists "Login screen". New file opens an empty frame at `/f/<id>`; back on Files it is listed as Untitled.
2. Open Login screen, change a label, see Saving then Saved, reload: the change is there. Change width to 768, reload: 768.
3. Same file in two tabs: edit in A (Saved), edit in B: B shows the conflict message; Reload in B shows A's change.
4. Duplicate creates "Login screen copy"; rename it inline; delete it after the confirm.
5. Deploy has no console errors on a clean load; the Vercel function logs show no errors.
