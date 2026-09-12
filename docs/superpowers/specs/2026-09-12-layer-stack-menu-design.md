# Assembly Workbench: Layer stack menu

Date: 2026-09-12
Status: approved by Matt ("LOVE IT. LET'S DO IT"); scheduled right after the Vercel deploy

## 1. What it delivers

Press and hold on any layer on the canvas and a small menu appears beside the cursor listing every layer under the pointer, innermost first. Hovering an item lights up that layer's outline on the canvas; clicking it selects the layer and the Design panel loads it. This replaces the click-through-the-layers habit designers bring from Figma, and it is the way to reach a container that is fully covered by its children.

## 2. Behavior

- Trigger: `pointerdown` with the primary button on a layer inside the artboard. A timer starts (`HOLD_MS = 350`). The timer is cancelled by `pointerup`, `pointercancel`, a `dragstart`, Escape, or `pointermove` farther than 4 px from the press point. Craft.js still selects the innermost layer on the press, as it does today; the menu only offers the alternatives.
- When the timer fires: the menu opens at the pointer position (offset 8 px right and down, flipped to stay inside the window), listing the stack under the press point from innermost to outermost. The root frame is included last, labelled "Frame"; content zones (CardContent, DialogContent) are skipped. Each row shows the type's tray icon (the root uses the Frame icon) and the layer's display name in the Figma vocabulary; the currently selected layer is marked.
- Hovering a row calls Craft's hover event for that node so the existing hover outline highlights it on the canvas; leaving the menu clears it.
- Clicking a row selects that node (`actions.selectNode(id)`) and closes the menu. Escape, clicking anywhere outside, scrolling the stage, or pressing Cmd+\ closes it. The click that opened the menu never counts as a click on the canvas afterwards (the `click` following the hold is swallowed once).
- The stack is computed from Craft state, not from the DOM tree: every node whose `dom.contains(target)`, sorted by depth (ancestor count), deepest first.
- Nothing about dragging changes: moving before the hold completes starts the usual drag.

## 3. Look

SF2 popover: `bg-card border border-(color:--bevel-line) rounded-md shadow-panel-lg p-1 min-w-44`, rows `flex items-center gap-2 rounded-sm px-2 py-1.5 text-[12.5px]` with the icon in `text-acc2`, hover and keyboard focus `bg-accent`, the selected layer's row with a mono "selected" chip on the right. A one-line mono hint under the list, `text-[10px] text-t4`: "Hold on a layer to open this menu" (only the first three times the menu opens in a session; `sessionStorage` counter).

## 4. Code

- `components/workbench/layer-stack-menu.tsx`: `useLayerStack()` hook installed in `WorkbenchShell` that listens on the stage column (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`, `dragstart`, `keydown` Escape) and owns `{ open, x, y, entries }`; `LayerStackMenu` renders the popover through a portal to `document.body` with `role="menu"` and `menuitem`s, arrow-key navigation and Enter.
- `lib/layer-stack.ts`: pure `stackUnder(nodes, target)` given a map of `{ id, dom, parent, name, displayName }` returns the ordered entries; unit-tested without Craft.
- `HOLD_MS` and `MOVE_TOLERANCE_PX` exported constants.

## 5. Tests

- `lib/layer-stack.test.ts`: ordering deepest first, zones skipped, root last, unrelated nodes excluded.
- `layer-stack-menu.test.tsx` (harness with a Card containing a Button, fake timers): pointerdown on the Button and 350 ms later the menu lists Button, Card, Frame in that order; pointermove of 10 px before the timer cancels; pointerup before the timer cancels; hovering "Card" sets the Craft hover event on the Card node; clicking "Card" selects it and closes; Escape closes; the hint shows on the first open.
- Browser: hold on the login screen's Sign in button, pick Card, the Design panel shows Card; hold on the card body, pick Frame; drag still works.
