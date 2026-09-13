# Dreamscape: Pages

Date: 2026-09-12
Status: requested by Matt ("yes i would like that, just because it makes it easier for designers to organize their work. they tend to make pages for versions of a product."). Builds on the infinite canvas; runs right after it.

## 1. What it delivers

A file has pages, like Figma. Each page is its own infinite canvas with its own frames (screens), its own viewport and its own comment pins. Designers use pages to keep versions apart (v1, v2, explorations) inside one file. Every file has at least one page; existing files get a single page called "Page 1" holding everything they have today.

## 2. Model and persistence

- `files.pages` (jsonb): ordered list of `{ id, name }` (nanoid, name up to 80 chars). Migration `0003_pages`: add the column, backfill `[{ id: <derived>, name: 'Page 1' }]` per file, and stamp every existing screen with that page id.
- Each screen gains `pageId` in the screens JSON (required after the migration; `validateScreens` rejects a screen whose `pageId` is not in `pages`).
- `FilePatch` gains `pages?`; `PATCH /api/files/[id]` validates pages and screens together (a screen can never point at a missing page; deleting a page removes its screens in the same patch; the last page cannot be deleted).
- The Files page and Play read the first page's first screen by default; Present carries `?page=`; `#s=<screen>` in the editor URL implies the page.
- Interactions (Navigate to) may target a screen on any page of the file; Play switches page implicitly.
- Viewport per page per browser: `assembly-workbench:viewport:<fileId>:<pageId>`. Comments stay keyed by screen, so they move with their page.

## 3. UI

- Top bar: after the file name, a page chip (SF2 `CHIP`, lucide `Layers2` icon, the current page name, a chevron) opens the pages menu: the list of pages with the current one checked, then "Rename", "Duplicate page", "Delete page" (disabled on the last page; confirm dialog naming how many screens it removes), "Move up / Move down", and "New page" at the bottom. Switching pages swaps the canvas (frames, viewport, pins) and clears the Craft history, the same way switching screens does today.
- The screens strip shows only the current page's screens; "New screen" adds to the current page. Moving a screen to another page: "Move to page" in the screen's chevron menu (submenu listing the pages).
- Breadcrumb in the top bar reads `Files › <file> › <page>`; the page name is editable inline from the menu's Rename (Enter commits, Escape cancels, empty reverts, max 80).
- Keyboard: Cmd+Shift+] / Cmd+Shift+[ go to the next / previous page (guarded so they never fire inside a text field).

## 4. Code

- `db/schema.ts`, `drizzle/0003_pages.sql`, `db/pages-migration.test.ts` (backfill and stamping through the PGlite migrator).
- `lib/files/validate.ts`: `validatePages`, `pageId` on screens, cross checks; `lib/files/repository.ts` and `http.ts`: pages in the record, the patch and the zod bodies.
- `components/workbench/pages-menu.tsx` (+ tests): the chip and menu; `workbench.tsx`: `currentPageId` state (hash or first page), page CRUD funnelled through the saver, `switchPage` clearing history; `screens-strip.tsx`: filter by page plus "Move to page"; `canvas.tsx`: frames of the current page only; `player.tsx`: page-aware screen lookup.
- `lib/examples`: examples create one page.

## 5. Tests

Migration backfill; validation of pages and `pageId`; last page undeletable; delete removes that page's screens in one patch; the menu (list, check mark, rename, duplicate copies the screens with new ids, reorder, new page); switching pages swaps frames and clears history; "Move to page"; the keyboard shortcuts; Present and Play with `?page=`; the Files page still opens the first screen; viewport memory per page.

## 6. Browser check

Production: open a file, add "v2" from the pages menu, add two screens on it, drag them apart, switch back to Page 1 (its frames and pan are where they were), move a screen from Page 1 to v2, rename v2 to "Version 2", delete an empty page, and Present from v2.
