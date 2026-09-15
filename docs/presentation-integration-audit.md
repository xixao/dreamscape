# Presentation integration audit

This audit defines the boundary for the presentation mode on
`presentation-integration`. Dreamscape remains the source application. The
presentation layer composes its existing systems and does not create parallel
data or rendering paths.

## Existing systems to reuse

| Concern | Dreamscape owner | Presentation usage |
| --- | --- | --- |
| File, page, and screen data | `lib/files/repository.ts` and file APIs | Load the saved `FileRecord`; carry file, page, and screen IDs in the Play URL |
| Component rendering | Craft `Editor`/`Frame` and `components/blocks/registry.tsx` | Render the same layout with editing disabled |
| Prototype behavior | `components/play/player.tsx`, `PlayProvider`, reducer, resolver | Reuse navigation, dialogs, overlays, forms, and reset behavior |
| Design persistence | `lib/persistence.ts` and existing PATCH route | Flush and confirm pending saves before opening Play |
| Comments | `lib/comments/store.ts` and `components/workbench/comments/*` | Reuse pins, composers, threads, replies, resolve, and screen context |
| Visual language | `app/globals.css`, Dreamscape tokens, existing blocks | Presentation chrome uses Dreamscape surfaces, typography, borders, and accent colors |
| Routing | `/f/[id]` and `/f/[id]/play` | Open a separate Play tab and return to the exact editor screen |

## Presentation-owned behavior

- Compact presentation toolbar and read-only boundary.
- Viewport selection, zoom, fit, reset, and fullscreen controls.
- Presentation review panel with Screens, Comments, and Details views.
- Presentation-only comment placement context.
- A shareable Play URL once access rules are defined.

Presentation state must remain transient. Changing a viewport, zoom level,
form field, dialog, or overlay must never PATCH the source file.

## Redundancy to avoid

- Do not copy Tone’s component library into Dreamscape.
- Do not add a second renderer or interaction engine.
- Do not create a second file, page, or screen schema.
- Do not create a second comment model; extend the existing thread context only.
- Do not move component styling into presentation-specific CSS.
- Do not add an independent authentication system as part of this POC.

## Connection checks

The integration is considered connected when these checks pass:

1. Present waits for a confirmed save and opens `/play` with the selected file,
   page, and screen IDs.
2. Play renders the same Craft layout and resolver as the editor.
3. Existing navigation, forms, dialogs, drawers, toasts, and overlays work in
   Play without changing the saved file.
4. A comment placed in Play carries the file, page, and screen context and is
   visible when returning to the editor in the same browser.
5. Exit returns to the source editor and selected screen.
6. A missing or invalid target fails visibly instead of silently attaching to a
   different screen.

## Deferred backend work

The current POC comment store is browser-local. Shared comments require an
authenticated, file-scoped server store. Multi-writer file editing also needs an
atomic expected-version update in the repository. Neither should be solved by
adding another client-side store in the presentation layer.

## Build order after this audit

1. Replace separate viewport buttons with one compact viewport menu.
2. Add Screens and Details views beside the existing Comments view.
3. Add fit-to-window and responsive bottom-sheet behavior.
4. Add prototype-only sharing and access control.
5. Replace browser-local comments with the server-backed implementation.
