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

## Diagram insertion

Click a shape in the right panel's Diagrams tab or the floating palette (Shift+D) to add it in empty space nearest the visible canvas center, clear of floating panels, frames, and other diagram shapes. If no visible space fits, the canvas pans to reveal the nearest clear spot. Drag a shape from either palette to place it at the drop location, including over a frame. Shapes stay on the page canvas, outside the frame's component hierarchy. Connector connects existing shapes or frames; T still supports click/drag placement for diagram text. Diagram changes autosave and support toolbar and keyboard undo/redo.

## Canvas sections

Sections organize root frames on a page without changing their component layout or prototype behavior. Use the top bar's Section tool (Shift+S) to draw a region, or select frame titles and choose **Wrap in new section** from a frame title's right-click menu. The Section dropdown also wraps the selected frames, falling back to the focused frame.

Select a section and choose **Highlight color** in the Design inspector for a solid title label and a matching 10% background tint. **None** restores the neutral appearance. Colors autosave and support undo/redo.

Double-click a section title to rename it. Drag the title or background to move contained frames, diagram objects, annotations, and nested sections together. Resize from any side or corner, or use the Design inspector; resizing never scales contents. A frame joins or leaves a section when its full bounds move inside or outside it. In overlapping regions, the smallest containing section owns a frame. Nested section regions move with their containing section.

The Layers panel lists each section and its frames. Clicking a section focuses its bounds between the floating panels. **Resize to Fit** adds space around all fully contained objects and is disabled for an empty section. **Remove Section (keep objects)** removes only the organizational region; **Delete** removes the section and contained objects. If all root frames are deleted, a fresh empty frame preserves the current file requirement. Delete/Backspace retains the existing region-only removal behavior. Section edits and grouped moves share the editor's Undo/Redo history.

Sections persist in `pages[].sections` through the file autosaver and API, using the existing JSON page column (no database migration). Page and file duplication preserve their geometry with new IDs. They are exclusive to the main editor and do not render in prototypes or the custom component builder.

## Canvas notes

The main editor and Component Builder support Comments, Annotations, and Accessibility notes. Choose a type from the note tool dropdown in the top bar, then click a target. The left Notes tab filters both the list and canvas markers by type and status. Notes can be edited, replied to, and deleted. Comments and accessibility Questions/Issues can be resolved and reopened; annotations and accessibility Requirements remain persistent documentation.

The top-nav note menu can hide/show all note pins and annotation-library objects. Drag a note pin to reposition it; click to open its thread, or press Escape to cancel a drag.

Notes attach to components using their Craft node ID and a normalized position, so markers follow movement and resizing. Main-editor notes belong to a frame or to empty canvas on a page; Component Builder notes belong to that component definition. Opening a main-editor note from the list focuses its page/frame. Legacy comments without frame IDs appear on the first frame.

Storage remains browser-local (`assembly-workbench:comments:<fileId>`); component notes use `<fileId>:component:<componentId>`. Notes are not included in shared prototypes, synchronized to other users, or governed by reviewer permissions yet. Backend persistence and collaboration are separate integration work.

## Spacing controls

Gap, padding, layout-grid gutter, and layout-grid margin use editable pixel fields. Focus or click a field to choose an 8 px preset, or type a custom value. Enter or leaving the field applies it; Escape cancels the edit. Gap and padding accept nonnegative fractional pixels, including values beyond the preset list. Grid gutter and margin retain their existing whole-pixel limits (200 px and 400 px). Custom spacing persists with the design and works in Component Builder and Play mode.

## Keyboard shortcuts in the editor

Generated from `lib/shortcuts.ts`, the single registry every shortcut handler, the top bar's zoom menu and the shortcuts dialog (the ⌘ button in the top bar, or "?") all read from (`lib/shortcuts.test.ts` fails if this table and the registry ever disagree). A bare letter or Shift+letter is ignored while typing in a text field or while a menu or dialog is open; the rest work everywhere, including from inside the chat composer.

| Area | Keys | Action |
| --- | --- | --- |
| Panels | D | Design tab |
| Panels | P | Prototype tab |
| Panels | E | Components tab |
| Panels | G | Diagrams tab |
| Panels | C or ⌘J | Open or close the chat panel |
| Panels | ⌘. | Minimize or expand the right panel |
| Panels | ⌘\ | Show or hide all panels |
| Present | ⌘R | Present the focused screen |
| Tools | ⇧S | Section tool |
| Tools | ⇧T | Draw a table |
| Tools | V | Pointer |
| Tools | ⇧C | Comment tool |
| Tools | ⇧D | Diagram palette |
| Tools | T | Text on the canvas |
| Canvas | Hold Space + drag or Middle mouse drag | Pan the canvas |
| Canvas | ⌘= | Zoom in |
| Canvas | ⌘- | Zoom out |
| Canvas | ⌘0 | Zoom to 100% |
| Canvas | ⇧1 | Zoom to fit |
| Canvas | ⇧2 | Zoom to selection |
| Canvas | ⇧G | Toggle the layout grid |
| Canvas | ⌘' | Toggle the pixel grid |
| Screens | ⇧N | New screen |
| Screens | ⇧O | New overlay (dialog) |
| Screens | ⌘⇧] | Next page |
| Screens | ⌘⇧[ | Previous page |
| Edit | ⌘Z | Undo |
| Edit | ⇧⌘Z | Redo |
| Edit | ⌘C | Copy selected components |
| ⌘X | Cut selected components |
| ⌘V | Paste into selection or after it |
| ⌘⇧C | Copy selection as PNG |
| ⌘⌥K | Create Custom Component |
| ⌘⌥X | Detach component instance |
| ⌥H | Center horizontally in layout |
| ⌥V | Center vertically in layout |
| ⌘M | Open minimap at cursor |
| Hold Z + drag | Zoom into a region |
| Enter | Select child layers |
| ⇧Enter | Select parent layer |
| Tab | Select next sibling on canvas |
| ⇧Tab | Select previous sibling on canvas |
| F | Wrap selection in a frame |
| Edit | Delete | Delete the selected layer |
| Edit | ⌘D | Duplicate the selection |
| Edit | ⌘A | Select all diagram elements |
| Edit | ⌘G | Group the selected shapes |
| Edit | ⇧⌘G | Ungroup |
| Edit | ⇧F10 | Open the menu for the diagram selection |
| Canvas | ↑ or ↓ or ← or → | Reorder components; nudge frames or diagrams 1 px |
| Canvas | ⇧↑ or ⇧↓ or ⇧← or ⇧→ | Nudge the selection 8 px |
| Edit | Escape | Deselect, leave a tool, close a menu |
| Help | ? | Shortcuts dialog |

Cmd+R deliberately takes over the browser's own reload shortcut inside the editor; Cmd+Shift+R still hard-reloads. The root frame and the content zones cannot be deleted.

A few things outside the registry above, since they are not single keyboard chords: press and hold on the canvas opens the layer stack menu listing every layer under the pointer; Escape in Play mode leaves the presentation and returns to the editor on the screen you were viewing.

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

On the canvas, arrow keys along a frame’s layout direction move selected components one position earlier or later. Right-click a component or frame and choose **View Code** for a copyable React preview of its current subtree.

Chat: press Up in an empty composer to recall a sent prompt, then Up/Down to browse. Typing exits history navigation.
