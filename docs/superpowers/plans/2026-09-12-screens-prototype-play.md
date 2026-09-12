# Screens, Prototype Mode and Play Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A file holds several screens; the right panel has Design and Prototype tabs; a layer's "On click" navigates to another screen or opens a dialog; Play runs the prototype full-window from a shareable link.

**Architecture:** `files.screens` (jsonb array of `{ id, name, layout, stageWidth, stageHeight?, deviceName? }`) replaces `layout` and `stage_width` through migration 0002 with a backfill. The editor shows one screen at a time behind a Screens strip; the saver sends `{ screens }`. Interactions live in Craft node `custom` data inside each screen's layout. `/f/[id]/play` renders screens with Craft disabled and a `PlayContext` that blocks consult to become interactive.

**Tech Stack:** as before. Spec: `docs/superpowers/specs/2026-09-12-screens-prototype-play-design.md`. Global Constraints from `docs/superpowers/plans/2026-09-12-shared-files.md` apply (tests first, pristine output, SF2 chrome via `chrome.ts`, Figma vocabulary, no em dashes, `components/ui/*` untouched, server code imports `components/blocks/known-types`, commit trailer, no Neon writes from tasks; the controller runs migrations and deploys).

---

### Task S1: Screens in the data model, repository, API and examples

**Files:** `db/schema.ts`, `drizzle/0002_*` (generated; hand-edit the SQL to add the backfill statement before dropping the old columns), `lib/files/repository.ts` + test, `lib/files/validate.ts` (+ `validateScreens`), `lib/files/http.ts`, `app/api/files/*` + tests, `lib/examples/index.ts` (+ `exampleToScreens`), `scripts/seed.ts`, `components/blocks/known-types.ts` if it needs a screen helper (`defaultScreen(name?)`).

- [ ] Types: `Screen = { id: string; name: string; layout: string; stageWidth: number; stageHeight?: number | null; deviceName?: string | null }` (`layout` is the JSON string in the API and repository; stored parsed inside jsonb). `FileRecord.screens: Screen[]`; `FileSummary` unchanged plus `screenCount`.
- [ ] Migration 0002: add `screens jsonb not null default '[]'`; backfill `UPDATE files SET screens = jsonb_build_array(jsonb_build_object('id', substr(md5(id), 1, 10), 'name', 'Frame 1', 'layout', layout, 'stageWidth', stage_width))`; drop `layout`, `stage_width`. PGlite tests apply it after 0000 and 0001; a test inserts a legacy-shaped row through raw SQL before migrating is not possible with the migrator-at-startup design, so instead test the backfill SQL by running it against PGlite in a dedicated test that creates the pre-0002 table shape from `0000`+`0001` only (use `drizzle-orm/pglite/migrator` with a temp folder containing the first two migrations, insert a row, then apply 0002, then assert `screens`).
- [ ] Repository: `create({ name?, screens? })` (default one screen "Frame 1" with `emptyLayoutJson()` and width 1440), `save` accepts `screens` (validate every layout with `validateLayout`, names 1..80 trimmed, widths clamped, ids unique and 10 chars, at least one screen), `duplicate` gives every screen a new id, `get` returns screens with layouts as strings. Remove `layout`/`stageWidth` from `SaveInput` and the API (breaking for the old client, which is replaced in Task S2).
- [ ] API: `saveBody.screens` (zod array, min 1, max 50); `createBody.screens?`; `example` creates one screen from the example (`exampleToScreens(example)`); responses carry `screens`. Update every test.
- [ ] Commit "Store several screens per file".

### Task S2: Screens strip, Design/Prototype tabs, interactions, Present button

**Files:** `components/workbench/workbench.tsx`, `workbench-loader.tsx`, `stage.tsx`, `stage-context.tsx`, `topbar.tsx`, `inspector/inspector.tsx`, new `components/workbench/screens-strip.tsx`, `components/workbench/prototype-panel.tsx`, `components/workbench/interaction-tag.tsx`, `lib/interactions.ts` (types, `getInteraction(node)`, `setInteraction`), `lib/persistence.ts` (saver patch `{ screens }`), `app/f/[id]/page.tsx`, tests for all.

- [ ] `Workbench({ file })`: `screens` state from `file.screens`; `currentScreenId` from the URL hash `#s=<id>` or the first screen; the Craft `Frame` is keyed by the current screen id and receives that screen's layout; `onNodesChange` updates that screen's `layout` in state (canonical compare as today) and queues `{ screens }`; width changes update the screen's `stageWidth`; `StageProvider` gets `key={currentScreenId}` and the screen's width. Switching screens flushes the saver first.
- [ ] Screens strip (spec 4): SF2 segmented chips above the artboard in the stage column, `role="tablist"`, chips `role="tab"`, "+" adds "Frame N" (N = count + 1) copying the current width and switches; double-click renames inline (chip input, Enter/Escape); a chevron opens a small menu (Rename, Duplicate, Delete) built from shadcn `DropdownMenu` (install it with the CLI if missing); Delete confirms with the SF2 dialog and is disabled on the last screen.
- [ ] Right panel tabs: the panel header gets an SF2 segmented control "Design | Prototype" (`aria-label="Panel mode"`); `panelMode` state in `WorkbenchShell`. Prototype tab content per spec 4: "Interactions" section with an "On click" select (None, Navigate to, Open dialog, Back), a target select listing screens (other than the current) or Dialog layers on the current screen, and a Remove ghost action; writes with `actions.setCustom(id, (custom) => { custom.interactions = [...] })`. Empty state "Select a layer to add an interaction."
- [ ] Canvas tag: `InteractionTag` rendered by `NodeIndicator` (portal, like the outline) for every node with an interaction while `panelMode === 'prototype'`: mono `text-[10px]` chip at the node's top-right reading `→ <target name>` or `→ Dialog: <title>` or `← Back`, `bg-primary text-white`.
- [ ] Top bar: ▶ Present button (`aria-label="Present"`, lucide `Play`) opening `/f/<id>/play?screen=<currentScreenId>` in a new tab. Register no new shortcut.
- [ ] Tests (spec 6, editor list) with the harness, fake timers where the saver is involved, mocked `fetch`.
- [ ] Commit "Add screens, the Prototype tab and interactions".

### Task S3: Play

**Files:** `app/f/[id]/play/page.tsx`, `components/play/player.tsx`, `components/play/play-context.tsx` (`PlayProvider`, `usePlay()` returning `{ mode: 'design' | 'play', navigate, back, openDialog }`, default design), every block in `components/blocks/*` (read `usePlay()`; in play mode Button gets a real `onClick` from `getInteraction`, inputs and controls become interactive, Dialog renders the real shadcn `Dialog` controlled by `openDialog`/its trigger), `components/workbench/node-indicator.tsx` (no outlines in play), tests.

- [ ] `Player({ file, initialScreenId })`: `Editor resolver enabled={false}` with a `Frame` keyed by screen; a history stack for `back`; the top-right mono overlay (screen name, "Esc to exit", a close link to `/f/<id>#s=<screen>`); Escape navigates to that link; full-window `theme-basic` page with the frame centered at its width (and device height when set).
- [ ] Blocks: add `usePlay()` reads; keep design-mode behavior byte-identical when `mode === 'design'` (existing tests must pass unchanged).
- [ ] Tests (spec 6, play list): click navigates, Back returns, Open dialog shows `role="dialog"`, inputs typeable in play, outlines absent.
- [ ] Commit "Add Play mode".

### Task S4: Migrate, redeploy, verify

Controller: `npm run db:migrate` on Neon (backfill), `npm run deploy`, then the spec section 6 browser walk on production: open Login screen, add "Hello world" with a Text, wire Sign in → Hello world, Present, click, Esc.
