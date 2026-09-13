# Overlay frames (modals, sheets, toasts as their own frames)

Date: 2026-09-13. Requested by Matt: "should a modal be in the same frame as the requesting frame, or is it in its own frame and called by the prototype? i kind of think it should be separate... programmatically the latter makes more sense." Approved: "love it. go".

## 1. Decision

A modal-type overlay is its own frame, opened by the prototype. Overlay frames cover the dialog, alert dialog, sheet or drawer, command palette and toast cases. Anchored micro-overlays (a select's list, popover, dropdown menu, tooltip) stay part of their element; the rule is whether the thing positions itself relative to a trigger.

Why: one design reused from many screens; honest sizing (an overlay has its own width and its components respond to that width, not the page's, which the per-frame iframe canvas already gives us); one-to-one with how a front-end developer structures the component; overlays become their own nodes in flow charts and carry their own comments.

The existing inline Dialog element (designed inside the requesting screen, previewed inline in the layout flow, opened by "Open dialog...") was the placeholder. It is retired from the Elements tray once overlay frames land; existing layouts that contain it keep rendering and keep their "Open dialog..." interaction.

## 2. Model (additive, no migration; `files.screens` is jsonb)

```ts
type OverlayPresentation =
  | { type: 'dialog'; dismissible: boolean }                       // alert dialog = dismissible false
  | { type: 'sheet'; side: 'left' | 'right' | 'top' | 'bottom'; dismissible: boolean }
  | { type: 'toast'; position: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right' };

Screen.kind?: 'screen' | 'overlay';      // absent means 'screen'
Screen.presentation?: OverlayPresentation; // required when kind is 'overlay', rejected otherwise
```

- `stageWidth` is the overlay's width. Defaults on creation: dialog 512, sheet 400 (left/right; top/bottom sheets ignore the width in Play and span the viewport), toast 360. `stageHeight` null means hug content (the artboard minimum height for an overlay is 120, not the screen minimum). Device presets do not apply to overlays.
- Validation (`lib/files/validate.ts`): `kind` must be one of the two values; `presentation` must match the union exactly; a `kind: 'overlay'` without a valid presentation, or a presentation on a screen, is a 400. Helpers in `lib/files/screens.ts`: `isOverlay(screen)`, `createOverlayScreen({ type, ... })` returning the default screen (name "Dialog", "Sheet", "Toast" numbered per file like screens, layout = a ROOT `LayoutBox` in column flex with `paddingPx` 24 for dialog/sheet and 16 for toast, `gapPx` 16).

## 3. Interactions (`lib/interactions.ts`)

- New actions: `{ action: 'openOverlay'; targetScreenId }` and `{ action: 'closeOverlay' }`. `navigate`, `back` and the legacy `openDialog` stay.
- `back` closes the top overlay when one is open, otherwise navigates back in history. `navigate` closes every open overlay before switching screens. `openOverlay` of an overlay already in the stack is a no-op (no loops). Opening an overlay that is a screen, or a missing id, is a no-op.
- Canvas tags (`describeInteraction`): "→ Overlay: <name>", "× Close overlay". Existing tags unchanged.

## 4. Play mode (`components/play/player.tsx`)

- State gains `overlayStack: string[]` (screen ids, bottom to top). Reducer actions `openOverlay`, `closeOverlay` (pops the top), `navigate` and `back` per section 3.
- Rendering: the current screen renders as today. Each overlay in the stack renders after it as a sibling of the screen's Craft `Editor`, in its own `StageProvider` (initial width = the overlay's `stageWidth`) and its own disabled `Editor` + `Frame` with the overlay's layout, wrapped by the presentation:
  - dialog: shadcn `Dialog` (open, modal) with `DialogContent` at the overlay's width (`style={{ width }}`, max width `calc(100vw - 2rem)`, `p-0` so the layout's own padding is the padding, the default close button kept); `onOpenChange(false)` closes the overlay when dismissible; when not dismissible, outside pointer down and Escape are prevented and the close button is hidden.
  - sheet: shadcn `Sheet` + `SheetContent side` (add the primitive with `npx shadcn@latest add sheet`; never hand-edit `components/ui/*`), width = `stageWidth` for left/right, `p-0`, same dismissible rules.
  - toast: a fixed card at the given position (16 px from the edges, z above the screen, 1 px border, 8 px radius, shadow) with no backdrop; no auto-dismiss; a small close button in the corner closes it.
  - The stack renders in order so later overlays sit above earlier ones (Radix layering handles dialog/sheet; toasts use z-index above them).
- Escape: when the stack is not empty, Escape closes the top overlay if dismissible and otherwise does nothing; Play exits on Escape only with an empty stack (extends today's dialog rule, which stays for legacy inline dialogs).
- Interactions inside an overlay run through the same runner (a button in a sheet can open a dialog on top, navigate, or close).
- Present (Cmd+R) while an overlay frame is focused starts Play on the first screen of that page with the overlay open on top (phase 2 wires the entry point; the Player accepts an optional initial overlay id).

## 5. Editor UI

- Screens strip "+" and Shift+N stay "New screen". A new "New overlay" menu (Dialog, Sheet, Toast) next to it and Shift+O (new dialog overlay) in the shortcuts registry; README table and drift test follow.
- Canvas: an overlay frame renders like any frame (iframe, draggable title, resizable width) with a mono badge after its name: "Dialog", "Sheet · Right", "Toast". The frame chrome draws the presentation's surface around the iframe (dialog and toast: 1 px border, 8 px radius, shadow; sheet: 1 px border on the attached side only, no radius) so what is designed matches Play, whose wrappers use `p-0` and the layout's own padding.
- Design panel with an overlay frame focused and nothing inside selected: an "Overlay" section with Presentation (Dialog / Sheet / Toast), Side (sheet), Position (toast), Dismissible (dialog, sheet). The device chip is hidden for overlays; width editing stays.
- Prototype panel: "Open overlay..." is offered when the file has at least one overlay frame on any page; its target select lists overlay frames grouped by page. "Close overlay" is always offered. "Open dialog..." keeps its current rule (only when a Dialog element exists on the canvas).
- Elements tray: Dialog removed from the tray; it stays in the resolver.
- Diagram connectors can already target frames by id, so overlay frames work as flow chart nodes with no change. Pages, comments, multi-select and grid snapping treat overlays as frames.

## 6. Build order

Phase 1 (branch `overlay-frames`, starts immediately, no overlap with the grid or diagram branches): sections 2, 3 and 4 with tests, plus the `sheet` primitive. Files: `lib/files/validate.ts`, `lib/files/screens.ts` (new), `lib/interactions.ts`, `components/play/player.tsx`, `components/play/player-loader.tsx` if the initial overlay id needs plumbing, `components/ui/sheet.tsx` via the CLI, tests beside each.

Phase 2 (after the grid branch merges, since both edit `workbench.tsx`, the inspector and the canvas frames): section 5 plus the Present entry point.

## 7. Out of scope now

Anchored overlays as element states, auto-dismiss timing for toasts, backdrop styling options, animation choices, converting an existing inline Dialog into an overlay frame (a "Detach to overlay" command can come later).
