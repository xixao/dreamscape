# Dreamscape: Layout grid, snapping and alignment

Date: 2026-09-13
Status: queued (Matt, 2026-09-12: "i'm also going to want a grid feature with object snapping, alignment controls, and the other typical figma layout options for the components."). Runs after the current queue; the product rule that layers live in Auto layout (no free x/y inside a frame) still holds, so snapping and alignment act on frames on the canvas and on the ordering and alignment options inside Auto layout, not on absolute positions.

## 1. What it delivers

- A layout grid overlay per frame (columns, gutter, margin) and a pixel grid on the canvas, both toggleable, like Figma's layout grids.
- Snapping while dragging frames on the canvas: to the 8 px canvas grid, to other frames' edges and centres, and to equal spacing between frames, with red guide lines and distance labels like Figma.
- Alignment controls in the Design panel for two or more selected diagram shapes (align to the selection's edges or centres, distribute with equal gaps; the actions live in the diagram store), for a selected layer inside Auto layout (align to start, centre, end on the cross axis; distribute with equal gap; "Fill container"), and for selected frames on the canvas (align left, centre, right, top, middle, bottom; distribute horizontally or vertically; tidy up into a row or grid).
- Keyboard: Shift+G toggles the layout grid, Cmd+' toggles the pixel grid, arrow keys nudge the selection (frames on the canvas, or diagram shapes) by 1 px and Shift+arrows by the 8 px grid increment (Matt, 2026-09-13), Alt held while dragging shows distances to neighbours.

## 2. Model

- Per screen: `layoutGrid?: { columns: number; gutter: number; margin: number; visible: boolean }` in the screens JSON (defaults 12 / 24 / 32, hidden). Pixel grid visibility per browser.
- Snapping is transient (no data). Alignment on frames writes `x, y`; inside Auto layout it writes the existing align, justify and gap props on the container and the `grow` prop on children, so nothing new is persisted for layers.

## 3. Behaviour

- Layout grid: drawn inside the frame's iframe as a fixed overlay (`pointer-events: none`, the accent colour at 10 % opacity) so it scales with the frame; the Design panel's Frame section gets Columns, Gutter, Margin and a Show grid switch when the root frame is selected.
- Canvas snapping: while dragging a frame by its title, candidate lines come from the 8 px grid and the other frames' left, centre, right, top, middle and bottom; snap within 6 screen px; equal-spacing candidates when a frame would sit at the same distance from two neighbours; guides render in the canvas overlay with mono distance chips; Cmd held disables snapping.
- Alignment panel: a row of icon buttons (lucide `AlignStartHorizontal` and friends) in the Design panel: for frames (root selected, or several frames selected on the canvas once multi-select exists) and for layers inside Auto layout, mapped onto the container's align and justify props; "Distribute" sets gap so the children spread evenly; Tidy up lays selected frames out in a row with 200 px gaps.
- Multi-select of frames on the canvas: Shift+click titles or drag a marquee on empty canvas (the marquee was out of scope for the infinite canvas; it lands here).

## 4. Code

- `lib/canvas/snap.ts` (+ tests): candidate generation, nearest-line resolution within the tolerance, equal-spacing detection, guide descriptions.
- `components/workbench/snap-guides.tsx`: the guide lines and distance chips in the canvas overlay.
- `components/workbench/layout-grid.tsx`: the per-frame overlay rendered inside the iframe document.
- `components/workbench/inspector/alignment-fields.tsx`: the alignment row for both contexts.
- `components/workbench/canvas.tsx`: marquee selection and multi-frame drag with snapping; `frame-title.tsx` uses the snap resolver.
- `lib/files/validate.ts`: `layoutGrid` on screens.

## 5. Tests

Snap maths (grid, edges, centres, equal spacing, tolerance, Cmd disables); marquee selection; multi-frame drag moves every selected frame and saves; alignment buttons write the expected props; layout grid fields and overlay; keyboard entries in the registry and the README; Play unaffected.

## 6. Browser check

Production: drag a frame near another and watch the red guide and the distance chip snap it flush; hold Cmd to move freely; select two frames with Shift and align tops; show the layout grid on a frame and change columns; Tidy up three frames.
