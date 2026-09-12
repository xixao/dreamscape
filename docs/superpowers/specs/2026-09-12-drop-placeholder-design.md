# Assembly Workbench: Make room while dragging

Date: 2026-09-12
Status: requested by Matt ("i'd rather the page actually animate the elements around to make room for the element"); queued right after the device presets (Task 12c)

## 1. What it delivers

While a component is dragged over the canvas, the layers in the target container slide apart to open a slot exactly where the component will land, and the slot follows the pointer as it moves. Dropping fills the slot. This replaces the coloured indicator bar Craft.js draws today (the red bar for an invalid drop stays).

## 2. Behaviour

- Trigger: any drag Craft.js already handles, from the Components panel (new component) or a layer being moved on the canvas.
- While Craft's indicator has a valid placement (parent, index, before/after), a placeholder occupies that position in the parent container. It is sized like the dragged element: a moved layer uses its own measured box; a new component uses the size hint on its tray entry (`previewSize`, width and height in px) and falls back to 40 px tall and the container's full width. In a horizontal Auto layout the placeholder's width is the size hint and its height stretches; in a vertical one the height is the hint and the width stretches; in a grid it takes one cell.
- Motion: the placeholder grows from zero along the container's main axis over 150 ms (ease-out); the siblings move with a FLIP animation (measure rects before and after the DOM change, apply the inverse transform, transition to none over 150 ms). When the placement changes, the old placeholder shrinks and is removed when its transition ends; the new one grows in. The moved layer's original box collapses for the duration of the drag (hidden one frame after dragstart so the browser keeps its drag image) and reappears on dragend if the drop is cancelled.
- End: on dragend or drop (a capture-phase listener on the document, so it runs before Craft's own dragend handler), and whenever Craft's indicator becomes null, every placeholder is removed synchronously and pending animations are cancelled. Craft then inserts or moves the real node at the same index the placeholder held.
- Invalid targets: no placeholder; Craft's error bar keeps showing (`indicator.error` colour); the success colour becomes transparent so the green bar never shows.
- Reduced motion: `prefers-reduced-motion: reduce` disables the transitions and FLIP (the slot still opens, instantly).
- Play mode and Present are untouched (no dragging there).

## 3. Code

- `lib/drop-placeholder.ts` (pure, tested): `insertionIndex(placement)` (index + 1 for `after`), `placeholderSize(kind, hint, containerDirection)`, `flipDeltas(before, after)` returning per-element translate deltas, `TRANSITION_MS = 150`.
- `components/workbench/drop-placeholder.tsx`: `useDropPlaceholder()` hook mounted in `WorkbenchShell` next to `useLayerStack`. It reads `state.indicator` and `state.events.dragged` through `useEditor`, resolves the parent container's DOM (`placement.parent.dom`) and its Craft children (`parent.data.nodes` mapped to their `dom`), and inserts a plain `div[data-drop-placeholder]` with `insertBefore` at the insertion index (not a Craft node, so Craft's own placement maths and history are untouched). It keeps one placeholder at a time (plus the shrinking one), animates through the Web Animations API, and cleans up on `dragend`/`drop` (capture) and unmount. Container direction comes from the parent's computed `flex-direction` / `display: grid`.
- `components/blocks/registry.tsx`: `TrayItem.previewSize?: { width: number; height: number }` for the blocks whose default size differs from the fallback (Button 120x36, Input 240x60 with its label, Card 320x180, Image 320x180, Table 480x160, and so on; values are hints, not contracts).
- `components/workbench/workbench.tsx`: `<Editor indicator={{ success: 'transparent', error: 'var(--bad)' }}>`.
- Craft's `dragover` keeps computing the placement from the real children's rects; the open slot belongs to no child, so a pointer inside it resolves to "before" the next child, which is the same slot. No change to Craft.

## 4. Tests

- `lib/drop-placeholder.test.ts`: insertion index for before/after and end of list; size resolution for row, column and grid with and without hints; FLIP deltas.
- `components/workbench/drop-placeholder.test.tsx` (jsdom, stubbed `getBoundingClientRect` and `getComputedStyle`): a valid indicator inserts one placeholder at the right DOM index for `before` and for `after`; changing the placement moves it; a null indicator or a dragend event removes it and cancels animations; an indicator with an error inserts nothing; the Editor's success colour is transparent; reduced motion skips animations.
- Existing Craft drag tests keep passing (the placeholder is removed before Craft's dragend handler runs, so drop indices are unchanged).

## 5. Browser check

On the production URL: drag Button from the Components panel over the Login card: the inputs slide apart to open a slot that follows the pointer; drop: the button lands in the slot with no jump. Move the Forgot password link above the Sign in button: its old slot closes, the new one opens, drop lands it there. Drag over an invalid target (a non-container): only the red bar shows. Cancel with Escape mid-drag: everything returns to its place.
