# Shared Files on Vercel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the workbench to Vercel with designs stored in a Neon Postgres database, a Files page, per-file links, autosave with conflict detection, and a seeded "Login screen" example.

**Architecture:** One `files` table accessed through a Drizzle repository that takes any Postgres-flavoured Drizzle instance (Neon over HTTP in production, PGlite in tests). Thin Next.js route handlers expose it; the Files page and the workbench page read it directly as server components. The workbench replaces its localStorage persistence with a debounced `createFileSaver` that PATCHes the file and tracks `updatedAt` for last-write-wins conflict detection.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle ORM, `@neondatabase/serverless`, `@electric-sql/pglite`, `drizzle-kit`, `nanoid`, `zod`, Vitest, Vercel CLI 59.

Spec: `docs/superpowers/specs/2026-09-12-shared-files-design.md`. Read it first. The foundation spec (`docs/superpowers/specs/2026-09-11-foundation-design.md`) describes the existing app; the Figma vocabulary in section 4.13 applies to every new string.

## Global Constraints

- Working directory `/Users/m3dteammember/Documents/shadcn-assembly-workbench`, branch `main`. Commit after every task; messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Never commit `.superpowers/`, `.env*`, `.vercel/`, `AGENTS.md`, `CLAUDE.md`.
- `components/ui/*` is never edited. Chrome styling only through `components/workbench/chrome.ts` constants and the SF2 spec (`/Users/m3dteammember/Downloads/screenfuture/SF2-UI-DESIGN-SYSTEM-SPEC.md`); the one SF2 primary gradient button in the app is "+ New file" on the Files page. Tailwind classes literal. No em dashes in any string. Figma vocabulary: file, frame, layer, canvas, Assets, Design.
- Tests first for every behavior; pristine output; `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` all exit 0 before each commit.
- Repository and API tests run on PGlite with `// @vitest-environment node` at the top of the file. No test touches the network or Neon.
- Route handlers in Next 16 receive `params` as a Promise: `{ params }: { params: Promise<{ id: string }> }` and must `await params`.
- Layout strings are validated with `validateLayout` before they are stored or mounted; invalid layouts are rejected with 400, never saved.
- Storage keys `assembly-workbench:layout:v1` and `assembly-workbench:stage-width` are retired; nothing reads or writes localStorage after Task 5.
- Debounce 800 ms for saves; retry after 5 s on network failure; conflict stops saving until reload.
- Ids: `nanoid(10)`. Stage width clamped to [320, 1920] on write.

## File map

| File | Responsibility |
|---|---|
| `drizzle.config.ts` | drizzle-kit config: dialect postgresql, schema `db/schema.ts`, out `drizzle/` |
| `db/schema.ts` | `files` table |
| `db/client.ts` | `getDb()`: Neon when `DATABASE_URL` is set, PGlite otherwise; `Db` type |
| `drizzle/0000_*.sql` + `drizzle/meta/*` | generated migration, applied by tests (PGlite migrator) and by `npm run db:migrate` (Neon) |
| `lib/files/validate.ts` | `validateLayout(json, knownTypes)` (moved from persistence) |
| `lib/files/repository.ts` | `createFilesRepository(db)` |
| `lib/files/repository.test.ts` | PGlite tests |
| `lib/files/http.ts` | `getRepository()` for route handlers and pages |
| `lib/examples/login-screen.json`, `lib/examples/index.ts` | bundled examples |
| `lib/time.ts` | `relativeTime(iso, now)` |
| `scripts/seed.ts` | seeds "Login screen" when the table is empty |
| `app/api/files/route.ts`, `app/api/files/[id]/route.ts`, `app/api/files/[id]/duplicate/route.ts` | API |
| `app/api/files/files.test.ts` | route handler tests |
| `lib/persistence.ts` | `createFileSaver`, `debounce` (localStorage functions removed) |
| `app/page.tsx`, `components/files/files-page.tsx`, `components/files/files-table.tsx` | Files page |
| `app/f/[id]/page.tsx`, `app/f/[id]/not-found.tsx` | workbench page per file |
| `components/workbench/workbench-loader.tsx`, `workbench.tsx`, `topbar.tsx`, `stage-error-boundary.tsx` | wired to a file |
| `README.md` | deploy notes |

---

### Task 1: Database layer and repository

**Files:** create `drizzle.config.ts`, `db/schema.ts`, `db/client.ts`, `lib/files/validate.ts`, `lib/files/repository.ts`, `lib/files/repository.test.ts`, `drizzle/` (generated); modify `package.json`, `lib/persistence.ts` (import `validateLayout` from the new module so nothing breaks yet), `vitest.config.mts` (nothing unless PGlite needs `server.deps`).

**Interfaces produced:**
```ts
// db/schema.ts
export const files = pgTable('files', {
  id: text('id').primaryKey(),
  name: text('name').notNull().default('Untitled'),
  layout: jsonb('layout').notNull(),
  stageWidth: integer('stage_width').notNull().default(1440),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});
// db/client.ts
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export function getDb(): Promise<Db>;          // memoized; PGlite branch runs the migrations in ./drizzle once
export function resetDbForTests(): Promise<void>; // PGlite only: truncate files
// lib/files/validate.ts
export function validateLayout(json: string, knownTypes: ReadonlySet<string>): { ok: true; tree: Record<string, unknown> } | { ok: false; reason: string };
// lib/files/repository.ts
export type FileSummary = { id: string; name: string; createdAt: string; updatedAt: string };
export type FileRecord = FileSummary & { layout: string; stageWidth: number };
export type SaveInput = { name?: string; layout?: string; stageWidth?: number; baseUpdatedAt?: string };
export type SaveResult = { ok: true; updatedAt: string } | { ok: false; conflict: true; updatedAt: string } | { ok: false; notFound: true } | { ok: false; invalid: string };
export function createFilesRepository(db: Db): { list(): Promise<FileSummary[]>; get(id: string): Promise<FileRecord | null>; create(input?: { name?: string; layout?: string; stageWidth?: number }): Promise<FileRecord>; save(id: string, input: SaveInput): Promise<SaveResult>; duplicate(id: string): Promise<FileRecord | null>; remove(id: string): Promise<boolean> };
```

- [ ] Install: `npm i drizzle-orm @neondatabase/serverless nanoid zod` and `npm i -D drizzle-kit @electric-sql/pglite tsx`.
- [ ] Write `db/schema.ts` as above. Write `drizzle.config.ts` (`defineConfig({ dialect: 'postgresql', schema: './db/schema.ts', out: './drizzle', dbCredentials: { url: process.env.DATABASE_URL ?? '' } })`). Run `npx drizzle-kit generate` and commit the generated `drizzle/` folder.
- [ ] Write `db/client.ts`: if `process.env.DATABASE_URL` is set, `drizzle(neon(url), { schema })` from `drizzle-orm/neon-http`; otherwise `new PGlite()` + `drizzle(client, { schema })` from `drizzle-orm/pglite` and `await migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') })` from `drizzle-orm/pglite/migrator`. Memoize the promise. `resetDbForTests` truncates `files`.
- [ ] Move the validation loop out of `lib/persistence.ts` into `lib/files/validate.ts` as `validateLayout` (same rules: valid JSON, object with `ROOT`, every node's resolved type in `knownTypes`; return the parsed tree on success). Make `loadLayout` call it so existing tests still pass this task.
- [ ] Tests first (`lib/files/repository.test.ts`, node environment, `beforeEach(resetDbForTests)`): create with defaults (name Untitled, layout equals `emptyLayoutJson()` when parsed, stageWidth 1440, ids 10 chars, timestamps ISO); create with the login example layout; list is newest-updated first; get missing is null; save name only; save layout returns a newer updatedAt; save with matching baseUpdatedAt succeeds; save with a stale baseUpdatedAt returns conflict with the current updatedAt and changes nothing; save invalid layout returns `{ ok: false, invalid }` and changes nothing; stageWidth 10 clamps to 320 and 5000 to 1920; duplicate makes "<name> copy" with the same layout and width; remove returns true then false; save on a missing id returns notFound.
- [ ] Implement the repository. `layout` is stored parsed (jsonb) and returned as `JSON.stringify(row.layout)`. Writes set `updatedAt: new Date()` explicitly (millisecond precision, so the ISO string round-trips exactly). Conflict check: `baseUpdatedAt !== undefined && new Date(baseUpdatedAt).getTime() !== row.updatedAt.getTime()`.
- [ ] `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`; commit "Add the files table, Drizzle client and repository".

---

### Task 2: Examples, time helper, seed script

**Files:** create `lib/examples/index.ts`, `lib/examples/index.test.ts`, `lib/time.ts`, `lib/time.test.ts`, `scripts/seed.ts`; modify `package.json` scripts.

- [ ] `lib/examples/index.ts`: `import loginScreen from './login-screen.json'` (enable `resolveJsonModule` if needed; it is on by default in Next's tsconfig), export `type Example = { slug: 'login'; name: string; layout: string; stageWidth: number }` and `EXAMPLES: Example[]` with `{ slug: 'login', name: 'Login screen', layout: JSON.stringify(loginScreen), stageWidth: 1440 }`, plus `findExample(slug)`. Test: the login example passes `validateLayout` with `KNOWN_TYPES`, contains 6 blocks, `findExample('nope')` is undefined.
- [ ] `lib/time.ts`: `relativeTime(iso: string, now = Date.now()): string` returning "just now" (< 60 s), "N minutes ago", "N hours ago", "yesterday", "N days ago", then the date as "Sep 12, 2026" beyond 30 days. Tests for each band and singular forms ("1 minute ago").
- [ ] `scripts/seed.ts`: `loadEnvConfig(process.cwd())` from `@next/env`, `getDb()`, repository, if `list()` is empty create the login example file named "Login screen"; print the id. Scripts: `"db:generate": "drizzle-kit generate"`, `"db:migrate": "drizzle-kit migrate"`, `"db:seed": "tsx scripts/seed.ts"`, `"deploy": "vercel --prod --yes"`.
- [ ] Verify, commit "Add the login screen example, relative time and the seed script".

---

### Task 3: API route handlers

**Files:** create `lib/files/http.ts`, `app/api/files/route.ts`, `app/api/files/[id]/route.ts`, `app/api/files/[id]/duplicate/route.ts`, `app/api/files/files.test.ts`.

- [ ] `lib/files/http.ts`: `export async function getRepository() { return createFilesRepository(await getDb()); }` and zod schemas: `createBody = z.object({ name: z.string().trim().min(1).max(120).optional(), example: z.enum(['login']).optional() })`, `saveBody = z.object({ name: ..optional(), layout: z.string().optional(), stageWidth: z.number().int().optional(), baseUpdatedAt: z.string().datetime().optional() }).refine(b => b.name !== undefined || b.layout !== undefined || b.stageWidth !== undefined, 'empty patch')`.
- [ ] Tests first (`app/api/files/files.test.ts`, node env, `resetDbForTests` in `beforeEach`), importing the handler functions and calling them with `new Request('http://x/api/files', { method, body: JSON.stringify(...) })` and `{ params: Promise.resolve({ id }) }`: GET list; POST create default 201; POST with `example: 'login'` has the example layout and name "Login screen"; POST invalid body 400; GET one 200 / 404; PATCH name 200 with `updatedAt`; PATCH stale `baseUpdatedAt` 409 with `updatedAt`; PATCH invalid layout 400; PATCH empty body 400; PATCH missing 404; duplicate 201 / 404; DELETE 204 / 404.
- [ ] Implement the handlers (thin: parse with zod → `safeParse`, 400 with `{ error }` on failure; map repository results to status codes; `Response.json(...)`; `new Response(null, { status: 204 })`). All handlers `export const dynamic = 'force-dynamic'`.
- [ ] Verify, commit "Add the files API".

---

### Task 4: The file saver

**Files:** modify `lib/persistence.ts`, `lib/persistence.test.ts`.

**Interface:**
```ts
export type SaveState = 'saved' | 'saving' | 'error' | 'conflict';
export type FilePatch = { layout?: string; stageWidth?: number; name?: string };
export function createFileSaver(options: {
  fileId: string;
  initialUpdatedAt: string;
  delayMs?: number;          // default 800
  retryMs?: number;          // default 5000
  fetchImpl?: typeof fetch;  // default globalThis.fetch
  onState?: (state: SaveState, detail?: { updatedAt?: string }) => void;
}): { queue(patch: FilePatch): void; flush(): Promise<void>; getState(): SaveState; getUpdatedAt(): string; dispose(): void };
```

- [ ] Tests first with fake timers and a fake `fetchImpl` recording calls: two `queue` calls within 800 ms merge into one PATCH whose body has both fields plus `baseUpdatedAt`; the response `updatedAt` is adopted and sent as `baseUpdatedAt` on the next save; state transitions saved → saving → saved; a 409 sets `conflict`, adopts nothing, and later `queue` calls send nothing; a network error sets `error` and retries after 5 s with the merged patch, then `saved`; `flush()` sends immediately with `keepalive: true` and resolves after the response; `dispose()` cancels timers.
- [ ] Implement. Remove `saveLayout`, `loadLayout`, `saveStageWidth`, `loadStageWidth`, `LAYOUT_STORAGE_KEY`, `WIDTH_STORAGE_KEY` and their tests; keep `debounce` if still used, otherwise remove it too. Nothing else imports them after Task 5, so do Tasks 4 and 5 in one branch of work if the build breaks in between (the plan allows the two commits to land together).
- [ ] Verify, commit "Replace browser persistence with a debounced file saver".

---

### Task 5: Workbench wired to a file, file page, error boundary

**Files:** create `app/f/[id]/page.tsx`, `app/f/[id]/not-found.tsx`; modify `components/workbench/workbench-loader.tsx`, `workbench.tsx`, `topbar.tsx`, `stage-error-boundary.tsx`, `stage-context.tsx` (no change expected), tests `workbench.test.tsx`, `topbar.test.tsx`; modify `app/layout.tsx` (`robots: { index: false }`); delete `app/page.tsx`'s workbench mount (Task 6 replaces the page).

- [ ] `app/f/[id]/page.tsx` (server component, `dynamic = 'force-dynamic'`): `const { id } = await params; const file = await (await getRepository()).get(id); if (!file) notFound();` then validate the layout with `validateLayout`; if invalid, pass `layout: emptyLayoutJson()` and `layoutInvalid: true`. Render `<WorkbenchLoader file={file} layoutInvalid={...} />`. `not-found.tsx`: SF2 empty state "This file does not exist" with a link "Back to files" (`/`).
- [ ] `WorkbenchLoader({ file, layoutInvalid })` forwards to `Workbench` (still `ssr: false`).
- [ ] `Workbench({ file, layoutInvalid })`: `initialLayout = file.layout`; `StageProvider initialWidth={file.stageWidth} onWidthChange={(w) => saver.queue({ stageWidth: w })}`; the saver is created once with `useState(() => createFileSaver({ fileId: file.id, initialUpdatedAt: file.updatedAt, onState }))` and disposed on unmount after `flush()`; `pagehide` listener flushes; `onNodesChange={(query) => saver.queue({ layout: query.serialize() })}`; a `saveState` state drives the topbar. When `layoutInvalid`, show a one-line notice in the topbar readout area: "The saved design could not be read; this file starts empty." and do not queue a save until the user changes something.
- [ ] Topbar: props `{ fileName, onRename(name), saveState, onNew }`. Add a ghost icon link to `/` with lucide `ArrowLeft` and `aria-label="Files"` before the product name; after the product name a mono chevron and the file name as a chip text field (`CHIP`/`CHIP_INPUT`, `aria-label="File name"`, commits on Enter and blur, Escape reverts, max 120 chars, empty reverts). After the readout, `data-testid="save-state"` in `font-mono text-[11px]`: "Saved" (`text-muted-foreground`), "Saving" , "Save failed, retrying" (`text-warn`), or for conflict "Someone else changed this file." (`text-bad`) followed by a ghost button "Reload" that calls `location.reload()`.
- [ ] `StageErrorBoundary`: keep catching and warning; remove the localStorage removal; fallback prop replaced by an internal fallback: SF2 empty state inside the stage column with "This file could not be opened." plus a link "Back to files" and a danger-treatment button "Reset file" which PATCHes `{ layout: emptyLayoutJson() }` (no `baseUpdatedAt`) and then reloads.
- [ ] Tests: `workbench.test.tsx`: renders the file's layout ("Sign in" button appears when given the login example as `file.layout`); a `setProp` change results in one PATCH (mock `fetch`) whose body contains the serialized layout and `baseUpdatedAt`; a 409 response shows "Someone else changed this file."; width change PATCHes `stageWidth`; New frame still clears. `topbar.test.tsx`: name field commits on Enter, reverts on Escape, save state texts. Remove the localStorage-based tests.
- [ ] Verify (`npm run build` must pass with `app/page.tsx` temporarily rendering a placeholder if Task 6 is not done yet), commit "Open a file by link and autosave it to the server".

---

### Task 6: Files page

**Files:** create `components/files/files-page.tsx` (server), `components/files/files-table.tsx` (client), `components/files/files-table.test.tsx`; modify `app/page.tsx`.

- [ ] `app/page.tsx`: `dynamic = 'force-dynamic'`; loads `list()` and renders `<FilesPage files={files} />`.
- [ ] `FilesPage`: SF2 §3 shell (max-width 1420, padding), the SF2 topbar treatment reused for a slim header with the product name, then §4 page head: H1 "Files", mono count ("1 file" / "N files"), spacer, secondary `Button` "New from example: Login screen" (SF2 `.btn` look: `bg-muted border rounded-[9px] text-[13px] font-medium`), and the primary gradient button "+ New file" (`bg-[image:var(--grad)] text-white font-semibold border-0 rounded-[9px] px-[15px] py-[9px] hover:brightness-[1.08]`). Below, `FilesTable`.
- [ ] `FilesTable` (client): SF2 §7 table (`bg-card border border-line-soft rounded-xl overflow-hidden`; `th` mono label treatment; `td` 13.5 px; row hover `bg-white/[.02]`). Columns: Name (link to `/f/<id>`, `font-medium`), Updated (`relativeTime`, mono 12 px, `text-muted-foreground`, `title` = full ISO), Actions (ghost icon buttons with tooltips: Duplicate `Copy`, Rename `Pencil`, Delete `Trash2` with `DANGER_GHOST`). Empty state (SF2 §4): "No files yet" / "Create your first file to get started." Actions call the API with `fetch` then `router.refresh()`; New file / New from example POST then `router.push('/f/<id>')`; Rename swaps the name cell for a `CHIP` input (Enter saves via PATCH with `baseUpdatedAt`, Escape cancels; on 409 show "Someone else changed this file. Reload." inline); Delete opens an `AlertDialog` ("Delete <name>?", "This removes the file for everyone. Undo will not bring it back.", Cancel, "Delete" with the SF2 danger treatment).
- [ ] Tests (RTL, jsdom, mocked `fetch` and a mocked `next/navigation` router): renders rows with names and relative times; empty state; New file POSTs and pushes to the new id; Rename inline commits with Enter and PATCHes; Delete asks then DELETEs and refreshes; Duplicate POSTs and pushes.
- [ ] Verify, commit "Add the Files page".

---

### Task 7: Provision, migrate, seed, deploy, verify

Depends on Matt having accepted Neon's marketplace terms (the controller confirms before dispatch).

- [ ] `npx vercel integration add neon -n workbench-db --scope matts-projects-a87298a1 --non-interactive` (connects `DATABASE_URL` to production, preview and development and pulls env). Then `npx vercel env pull .env.local --yes` and confirm `DATABASE_URL` is present (never print its value).
- [ ] `npm run db:migrate` (creates `files` in Neon), `npm run db:seed` (prints the seeded id).
- [ ] `npm run deploy` (`vercel --prod --yes`). Record the production URL in the report.
- [ ] Browser check on the production URL (preview tool `preview_start` with `url`): walk spec section 6 steps 1 to 5. Take screenshots of the Files page and the opened Login screen. Check `npx vercel logs <url>` for errors.
- [ ] README: replace the create-next-app boilerplate with: what the app is, `npm run dev`, tests, the deploy steps above, and where the data lives.
- [ ] Commit "Document deployment and seed the production database" (only README and any config; `.env.local` and `.vercel/` stay ignored).

---

### Task 8: Final review and fix wave

Controller-driven: whole-branch review of the range since `3728719`, one fix wave, re-deploy, re-verify on the production URL.
