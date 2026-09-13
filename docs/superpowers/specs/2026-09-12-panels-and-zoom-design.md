# Assembly Workbench: Right panel tabs, panel minimize, canvas zoom

Date: 2026-09-12
Status: requested by Matt ("i need to be able to zoom in on the canvas. right now it just scales the whole window up. also, i need a minimize on the components panel. also combine the components list into the design / prototype panel as another tab called Components.")

## 1. Components becomes a tab of the right panel

- The right panel's mode switch becomes three tabs: Design, Prototype, Components (same ToggleGroup, `aria-label="Panel mode"`). The Components tab holds the current Components panel content unchanged: the search field, the grouped list with SF2 mono group headings, the drag sources (Craft `connectors.create`). Dragging from the tab onto the canvas works exactly as before.
- The left column goes away; the workbench grid becomes `grid-cols-[1fr_320px]` (plus `360px` when the chat panel is open) and the canvas takes the space. Cmd+\ still hides everything.
- The panel remembers its tab per browser (`assembly-workbench:panel-mode`); selecting a layer while on Components switches to Design (the way Figma jumps to Design when you pick a layer), and choosing Prototype or Components is explicit.
- Tests: three tabs; Components tab renders the tray with search and groups; a layer selection switches to Design; the grid has no left column; the chat column still appends; keyboard focus order.

## 2. Minimize the right panel

- A chevron button in the panel header (`aria-label="Minimize panel"` / `"Expand panel"`, `aria-expanded`) collapses the right panel to a 40 px rail showing the three tab icons stacked (Design: lucide `SlidersHorizontal`, Prototype: `Workflow`, Components: `LayoutGrid`); clicking a rail icon expands the panel on that tab. The grid uses `40px` for the collapsed column. State per browser (`assembly-workbench:panel-collapsed`). Shortcut: Cmd+. (Ctrl+. elsewhere) toggles it, registered next to Cmd+\ and Cmd+J.
- Tests: collapse and expand through the button and the shortcut; the rail icon expands on the right tab; state persists across a remount.

## 3. Canvas zoom (Figma style)

Today the frame is fit to the column width and the readout shows the resulting percentage; the browser's own zoom (Cmd+=) scales the whole page. Replace with a real canvas zoom:

- State: `zoom` in the stage context becomes user-controlled with a `fit` flag. `fit` (default on) keeps the current fit-to-width behaviour and recomputes on resize; any manual zoom turns `fit` off until the user picks Fit again.
- Controls: Cmd+= zooms in, Cmd+- zooms out (both `preventDefault` so the browser does not zoom the page), Cmd+0 sets 100%, Shift+1 (Figma's Zoom to fit) sets Fit; pinch and Cmd+wheel over the canvas zoom around the pointer position (a non-passive `wheel` listener on the stage column that calls `preventDefault` when `ctrlKey` or `metaKey` is set); plain wheel scrolls; Space held plus drag pans (cursor `grab`/`grabbing`). Zoom steps: 25, 50, 75, 100, 125, 150, 200, 300, 400 percent for the shortcuts; pinch is continuous between 10 and 400 percent.
- The readout (`iPhone 16 & 17 Pro · 402 × 874 · 82%`) becomes a menu: clicking the percentage opens Zoom in, Zoom out, Zoom to 50%, 100%, 200%, Zoom to fit, with the shortcuts listed on the right in mono.
- Zoom applies as a CSS transform on the frame (the iframe once the responsive canvas lands: `transform: scale(zoom)` with `transform-origin: top left`, the scroll container sized to the scaled box so scrolling reaches every edge). Selection outlines, the layer stack menu and comment pins keep working at every zoom because they measure the DOM.
- Per screen: zoom is remembered per screen in the browser (`assembly-workbench:zoom:<fileId>:<screenId>`), not in the file.
- Tests: shortcut handling (including `preventDefault`), the step table, pinch maths (the point under the pointer stays fixed after a zoom change), Fit restoring on resize, the readout menu, per-screen memory. Browser check: Cmd+= on the production URL zooms the frame and not the page; pinch on the trackpad zooms around the pointer; Shift+1 fits.

## Order

Right after the comments UI merges: section 1 and 2 together (one task, they change the same panel code). Section 3 after the responsive canvas lands, because zoom and the iframe share the frame scaling code.
