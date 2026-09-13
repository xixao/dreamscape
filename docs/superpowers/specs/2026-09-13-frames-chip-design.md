# Frames chip replaces the screens strip; diagram palette docks at the bottom

Date: 2026-09-13. Matt: "UI problem. need new solution for the horizontal row of frames. why show this list at the same time? also the collision of the diagram tools with that row is not good. find a better solution for the frame row."

## 1. Decision

The horizontal row of frame chips under the top bar is removed. Frames are already on the infinite canvas with draggable, renamable titles, so the row only duplicated them and took the strip of space the diagram palette also floated in.

- **Frames chip.** A chip in the top bar right after the Page chip, styled like it, showing the focused frame's name and the page's frame count in mono ("Login · 9"). Clicking opens a menu (SF2 `MENU_POPOVER`/`MENU_ROW` chrome) listing the page's frames in canvas order: the focused one marked; clicking a frame focuses it and zooms to it (the same motion as Shift+2 on that frame); each row has a rename (inline field, Enter commits, Escape cancels), Duplicate and Delete (confirm when the frame has content), the same actions the old chips' menus offered; "New frame" at the end (Shift+N stays); overlay frames (spec 2026-09-13-overlay-frames-design.md) list with their badge and the "New overlay" entries land here in phase 2. Keyboard: the menu is a Radix dropdown, arrow keys move, type-ahead by name.
- **Diagram palette.** Docks at the bottom centre of the canvas as a floating toolbar (FigJam placement): 16 px above the canvas bottom, centred, same `PANEL` chrome, hidden with Cmd+\ like the other chrome, above the canvas layer and below dialogs. Shift+D toggles it as today; its close button stays.
- **Pages chip** stays where it is. Nothing else in the top bar moves.

## 2. Removed

`components/workbench/screens-strip.tsx` and its tests; the strip's keyboard focus order; the strip-related layout offsets in `workbench.tsx` (the canvas chrome no longer reserves the row's height). The `hashchange` screen switching note in the ledger stays a follow-up.

## 3. Tests

Chip shows the focused frame and count; menu lists frames in order and marks the focused one; clicking focuses and zooms; rename/duplicate/delete/new behave as the old chip menus did (port the strip's tests); the palette renders at the bottom centre with the right classes and hides with Cmd+\; README mentions of the screens strip updated; shortcuts registry unchanged.

## 4. Order

After the grid-snapping and diagram-followups merges (both edit `workbench.tsx` and the top bar), before the export hookup and overlay frames phase 2, which build on the chip and the palette's new home.
