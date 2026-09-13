# Dreamscape

Formerly "Assembly Workbench"; the Vercel project, package name and browser-storage keys keep the old name on purpose so nothing stored by coworkers is lost.

An internal proof of concept of a Figma-like page builder built on shadcn/ui. Present (top bar) opens the current file in Play mode, where wired buttons navigate between screens and open dialogs. Designers drag components onto a responsive frame, tune them in a Design panel for the mobile and desktop breakpoints, add screens, organize them into pages (a file's own separate infinite canvases, for keeping versions like v1/v2 apart), wire buttons to other screens in the Prototype panel, and present the result in Play mode. Files live in a shared Neon Postgres database on Vercel, so a link can be passed around without sign-in (the app is meant for an internal network).

Production: https://dreamscape-design.vercel.app (also https://shadcn-assembly-workbench.vercel.app)

## Run it locally

```bash
npm install
```

The app needs a `DATABASE_URL`. Pull the one Vercel manages (you must be signed in to the Vercel CLI as a member of the team that owns the project):

```bash
npx vercel env pull .env.local
```

Any other Postgres connection string works too; put it in `.env.local` as `DATABASE_URL=...`. For local work without a database at all (a coworker on a work computer, say), leave `DATABASE_URL` unset: the app then runs on an in-memory database that starts empty and resets whenever the server restarts. Then:

```bash
npm run dev
```

Open http://localhost:3000. The Files page lists every file and folder; open one to edit it.

`.env.local` and `.vercel/` are git-ignored. Never commit them and never paste the connection string into a chat or a commit.

## Download the product

The download icon next to "Dreamscape" on the Files page (and "Download source" in the editor's More menu) links straight to `/dreamscape-source.zip`, a full copy of this repository's source. It is rebuilt from the deployed sources on every `npm run build` - including every Vercel build - by `scripts/pack-source.mjs`, so production always serves the archive for what's actually live. The build excludes `node_modules`, `.next`, `.git`, `.vercel`, every `.env*` file and anything else that could carry a secret, so the ZIP never contains one. After unzipping, `npm install` then `npm run dev` runs it with no database, exactly as described above.

## Checks

```bash
npm test
```

Vitest runs the unit and component tests. Database tests use an in-memory PGlite database and apply the migrations in `drizzle/` themselves, so `DATABASE_URL` must be unset in the test environment (the test setup refuses to reset a real database).

Before a deploy, also run the type check, the linter and a production build:

```bash
npx tsc --noEmit && npm run lint && npm run build
```

## Database

- Schema: `db/schema.ts` (Drizzle ORM). Tables: `files` (name, screens as JSON, folder) and `folders` (nestable, deletable only when empty).
- Migrations: `drizzle/*.sql`, generated with `npm run db:generate` after a schema change. Commit the generated SQL and the `drizzle/meta` snapshot together.
- `npm run db:migrate` applies pending migrations to the database in `DATABASE_URL` (loaded from `.env.local`).
- `npm run db:seed` creates the "Login screen" example file when the `files` table is empty and does nothing otherwise, so it is safe to run on every deploy.

## Deploy

The production deployment is the Vercel project `shadcn-assembly-workbench`.

```bash
npm run deploy
```

That runs `vercel --prod --yes`, which builds on Vercel and switches production to the new build. Order of operations when a release includes a migration:

1. Run the checks above.
2. If the migration only adds columns or tables, run `npm run db:migrate` first, then `npm run deploy`.
3. If the migration drops or renames columns the current production code still reads, run `npm run deploy` first and `npm run db:migrate` the moment the deploy reports ready. The old code keeps working until the switch, and the new code needs the new columns immediately after it.
4. Run `npm run db:seed` if the database is new.
5. Click through the production URL: open a file, edit, reload, and confirm the edit persisted.

## Keyboard shortcuts in the editor

Generated from `lib/shortcuts.ts`, the single registry every shortcut handler, the top bar's zoom menu and the shortcuts dialog (the ⌘ button in the top bar, or "?") all read from (`lib/shortcuts.test.ts` fails if this table and the registry ever disagree). A bare letter or Shift+letter is ignored while typing in a text field or while a menu or dialog is open; the rest work everywhere, including from inside the chat composer.

| Area | Keys | Action |
| --- | --- | --- |
| Panels | D | Design tab |
| Panels | P | Prototype tab |
| Panels | E | Elements tab |
| Panels | C or ⌘J | Open or close the chat panel |
| Panels | ⌘. | Minimize or expand the right panel |
| Panels | ⌘\ | Show or hide all panels |
| Present | ⌘R | Present the focused screen |
| Tools | V | Pointer |
| Tools | ⇧C | Comment tool |
| Tools | ⇧D | Diagram palette |
| Canvas | Hold Space + drag or Middle mouse drag | Pan the canvas |
| Canvas | ⌘= | Zoom in |
| Canvas | ⌘- | Zoom out |
| Canvas | ⌘0 | Zoom to 100% |
| Canvas | ⇧1 | Zoom to fit |
| Canvas | ⇧2 | Zoom to selection |
| Canvas | ⇧G | Toggle the layout grid |
| Canvas | ⌘' | Toggle the pixel grid |
| Screens | ⇧N | New screen |
| Screens | ⌘⇧] | Next page |
| Screens | ⌘⇧[ | Previous page |
| Edit | ⌘Z | Undo |
| Edit | ⇧⌘Z | Redo |
| Edit | Delete | Delete the selected layer |
| Edit | ⌘D | Duplicate the diagram selection |
| Edit | ⌘A | Select all diagram elements |
| Edit | ⌘G | Group the selected shapes |
| Edit | ⇧⌘G | Ungroup |
| Edit | ⇧F10 | Open the menu for the diagram selection |
| Canvas | ↑ or ↓ or ← or → | Nudge the selection 1 px |
| Canvas | ⇧↑ or ⇧↓ or ⇧← or ⇧→ | Nudge the selection 8 px |
| Edit | Escape | Deselect, leave a tool, close a menu |
| Help | ? | Shortcuts dialog |

Cmd+R deliberately takes over the browser's own reload shortcut inside the editor; Cmd+Shift+R still hard-reloads. The root frame and the content zones cannot be deleted.

A few things outside the registry above, since they are not single keyboard chords: press and hold on the canvas opens the layer stack menu listing every layer under the pointer; Escape in Play mode leaves the presentation and returns to the editor on the screen you were viewing.

## Chat panel

The Chat button in the top bar (or Cmd+J) opens a chat conversation UI docked to the right of the editor. It is a placeholder: sending a message always gets a fixed "not connected yet" reply, and nothing ever reaches the network. See `docs/chat-integration.md` for the `ChatTransport` interface a real assistant integration implements and where it plugs in.

## Where things are

- `app/`: routes. `/` and `/folders/[id]` are the Files pages, `/f/[id]` is the editor, `/f/[id]/play` is Play mode, `/api/files` and `/api/folders` are the JSON APIs.
- `components/workbench/`: the editor chrome (top bar, Elements panel, canvas, layers, Design and Prototype panels, Chat panel). Its styling follows the SF2 design system spec; shared class tables live in `components/workbench/chrome.ts`.
- `components/blocks/`: the components that can be placed on the frame. They render plain shadcn/ui as a placeholder for the product design systems that will replace it later. `components/blocks/registry.tsx` lists them for the Elements panel.
- `components/ui/`: shadcn/ui primitives. Do not hand-edit them; add new ones with `npx shadcn@latest add <name>`.
- `components/files/` and `components/play/`: the Files pages and Play mode.
- `lib/`: files repository and validation, the autosave client, examples, interactions, spacing and class helpers, device presets, the chat placeholder's transport contract and per-file storage (`lib/chat/`, see `docs/chat-integration.md`).
- `db/` and `drizzle/`: database client, schema and migrations.
- `docs/superpowers/specs/` and `docs/superpowers/plans/`: the design specs and implementation plans for each sub-project. `docs/research/` holds the research notes (diagram libraries, Figma device presets).
