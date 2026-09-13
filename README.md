# Assembly Workbench

An internal proof of concept of a Figma-like page builder built on shadcn/ui. Present (top bar) opens the current file in Play mode, where wired buttons navigate between screens and open dialogs. Designers drag components onto a responsive frame, tune them in a Design panel for the mobile and desktop breakpoints, add screens, wire buttons to other screens in the Prototype panel, and present the result in Play mode. Files live in a shared Neon Postgres database on Vercel, so a link can be passed around without sign-in (the app is meant for an internal network).

Production: https://shadcn-assembly-workbench.vercel.app

## Run it locally

```bash
npm install
```

The app needs a `DATABASE_URL`. Pull the one Vercel manages (you must be signed in to the Vercel CLI as a member of the team that owns the project):

```bash
npx vercel env pull .env.local
```

Any other Postgres connection string works too; put it in `.env.local` as `DATABASE_URL=...`. Then:

```bash
npm run dev
```

Open http://localhost:3000. The Files page lists every file and folder; open one to edit it.

`.env.local` and `.vercel/` are git-ignored. Never commit them and never paste the connection string into a chat or a commit.

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

| Keys | Action |
| --- | --- |
| Cmd+\ (Ctrl+\ on Windows) | Show or hide the top bar and both panels |
| Cmd+J (Ctrl+J on Windows) | Open or close the Chat panel |
| Cmd+Z, Shift+Cmd+Z | Undo, redo (history is per screen) |
| Escape | Deselect |
| Delete or Backspace | Delete the selected layer (the root frame and the content zones cannot be deleted) |
| Press and hold on the canvas | Layer stack menu listing every layer under the pointer |
| Escape in Play mode | Leave the presentation and return to the editor on the screen you were viewing |

## Chat panel

The Chat button in the top bar (or Cmd+J) opens a chat conversation UI docked to the right of the editor. It is a placeholder: sending a message always gets a fixed "not connected yet" reply, and nothing ever reaches the network. See `docs/chat-integration.md` for the `ChatTransport` interface a real assistant integration implements and where it plugs in.

## Where things are

- `app/`: routes. `/` and `/folders/[id]` are the Files pages, `/f/[id]` is the editor, `/f/[id]/play` is Play mode, `/api/files` and `/api/folders` are the JSON APIs.
- `components/workbench/`: the editor chrome (top bar, Components panel, canvas, layers, Design and Prototype panels, Chat panel). Its styling follows the SF2 design system spec; shared class tables live in `components/workbench/chrome.ts`.
- `components/blocks/`: the components that can be placed on the frame. They render plain shadcn/ui as a placeholder for the product design systems that will replace it later. `components/blocks/registry.tsx` lists them for the Components panel.
- `components/ui/`: shadcn/ui primitives. Do not hand-edit them; add new ones with `npx shadcn@latest add <name>`.
- `components/files/` and `components/play/`: the Files pages and Play mode.
- `lib/`: files repository and validation, the autosave client, examples, interactions, spacing and class helpers, device presets, the chat placeholder's transport contract and per-file storage (`lib/chat/`, see `docs/chat-integration.md`).
- `db/` and `drizzle/`: database client, schema and migrations.
- `docs/superpowers/specs/` and `docs/superpowers/plans/`: the design specs and implementation plans for each sub-project. `docs/research/` holds the research notes (diagram libraries, Figma device presets).
