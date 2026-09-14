# Dreamscape: Flow chart diagrams on the canvas

Date: 2026-09-13
Status: requested by Matt (2026-09-12: "another major feature is the ability for the designer to add a flow chart diagram to the canvas (outside of a Page/Frame)... look at figjam"); decision: use the best open-source engine as the base but with zero external dependencies, so this is an in-repo port of React Flow's architecture (MIT; attribution in `lib/diagram/README.md`), not an npm package. Research: `docs/research/2026-09-12-diagram-libraries.md`. Runs after Pages, because diagrams live on a page's canvas between the frames.

## 1. What it delivers

FigJam-style flow charts drawn directly on the infinite canvas, next to and between the frames: shapes with text, connectors with arrowheads and labels, drag to move, drag from a shape's edge to connect, select and delete, and the same pan and zoom as everything else. A designer documents a user flow ("Login → Dashboard → Settings") around the actual screens, and a connector can point at a frame as well as at a shape.

## 2. Model

Per page (stored in the page's JSON next to its screens): `diagram: { nodes: DiagramNode[], edges: DiagramEdge[] }`.

- `DiagramNode { id; kind: 'rect' | 'rounded' | 'decision' | 'terminal' | 'text' | 'note'; x; y; width; height; text; color: 'neutral' | 'blue' | 'green' | 'amber' | 'red' | 'violet' }` in canvas coordinates (integers; 8 px snapping on move and resize).
- `DiagramEdge { id; source: { nodeId | screenId, side?: 'top' | 'right' | 'bottom' | 'left' }; target: same; kind: 'straight' | 'step' | 'curve'; arrow: 'end' | 'both' | 'none'; label? }`. A frame (screen) can be a source or target; its anchor is the frame box.
- Validation in `lib/files/validate.ts`: ids unique, edges reference existing nodes or screens on the same page, sizes positive; the whole diagram is optional (files without one keep working).

## 3. Behaviour

- Tool: a "Diagram" button in the top bar (lucide `Workflow`, `aria-label="Diagram tool"`, shortcut `Shift+D`; `D` alone switches to the Design tab) opens a small floating palette on the canvas: Rectangle, Rounded, Decision (diamond), Terminal (pill), Text, Note (sticky), and Connector. Click a shape in the palette, then click on the canvas to place it (or drag to size); Escape returns to the pointer. Double-click a shape to edit its text inline (Enter commits, Shift+Enter breaks a line, Escape cancels, max 500 chars).
- Connecting: hovering a shape or a frame shows four small handles on its sides; drag from a handle to another shape or frame to create a connector (the target side is chosen by the drop position; the connection is refused with no edge if source and target are the same node). Connector kind defaults to `step` (orthogonal, FigJam style); the Design panel for a selected connector switches kind, arrowheads and the label.
- Selection: click selects a shape or connector (SF2 accent outline, 8 px handles for resize on shapes); Shift+click adds; drag selected shapes together; Delete removes shapes and their connectors; Cmd+D duplicates with an 16 px offset; arrow keys nudge by 1 px (Shift: 8 px; Matt, 2026-09-13). Clicking empty canvas clears the selection.
- Design panel: when a diagram element is selected, the Design tab shows its fields (kind, colour, text, size, connector kind, arrows, label) using the same field components as blocks.
- Rendering: one SVG layer inside the canvas transform layer, above the frames (`pointer-events: none` on the SVG root, `pointer-events: all` on shapes, edges and handles), so hit-testing works at every zoom. Edge paths: straight lines, orthogonal step paths with rounded corners, and cubic bezier curves; arrowheads as markers in the accent colour; labels as small SF2 chips on the path midpoint.
- Undo and redo: the diagram keeps its own history stack (per page, in memory, 100 steps) merged into Cmd+Z / Shift+Cmd+Z: when a diagram element is selected, undo applies to the diagram; otherwise to the focused frame, as today. (Multiplayer later replaces both with per-user document undo.)
- Play mode ignores diagrams. Comments can pin to diagram shapes (`anchorNodeId` with a `diagram:` prefix); pins keep working since they are canvas coordinates.

## 4. Code (in-repo port of React Flow's architecture, zero dependencies)

- `lib/diagram/geometry.ts`: `getBezierPath`, `getSmoothStepPath` (with corner radius), `getStraightPath`, handle positions per side, `snapToGrid`, hit tests for paths (distance from point to segment or sampled bezier), box intersection for connector anchors on frames. Ported from React Flow's `@xyflow/system` path utilities with attribution; pure functions, fully unit tested.
- `lib/diagram/store.ts`: reducer over `{ nodes, edges, selection, history }` with actions add/move/resize/setText/connect/disconnect/delete/duplicate/undo/redo and `validateConnection`.
- `components/workbench/diagram/diagram-layer.tsx`: the SVG layer inside `Canvas`, drawing nodes, edges, handles, selection and the connection-in-progress preview line; `diagram-palette.tsx`: the floating palette; `diagram-fields.tsx`: the Design panel fields.
- `components/workbench/canvas.tsx`: hosts the layer, forwards the pointer tool state (pointer / diagram shape / connector), and includes diagram bounds in Zoom to fit.
- Persistence: `diagram` inside the page JSON through `validateScreens`' sibling `validateDiagram`, the repository and the zod bodies; saved through the existing saver.

## 5. Tests

Geometry (paths start and end at the handles, step paths are axis-aligned with the expected corner count, hit-testing tolerance), store reducer (every action, connection validation, undo/redo bounds), palette placement (click and drag-to-size, Escape), connecting by dragging between two shapes and from a shape to a frame, selection and delete, inline text editing, the Design panel fields, persistence round trip, Zoom to fit including diagram bounds, Play unaffected.

## 6. Browser check

Production: on a page with two frames, add a Decision shape between them, connect Login frame → Decision → Dashboard frame with step connectors, label one "yes", drag the decision and watch the connectors follow, zoom and pan, reload and everything is still there, Present still works.

## 7. Follow-ups (Matt, 2026-09-13)

"in diagram: need ability to option drag to duplicate a shape. need ability to change shape using a right click menu of options. shapes need automatic hover circles that show you can add another shape on any side."

- Option-drag duplicates: holding Option (Alt) when a drag starts on a selected shape (or on the whole selection) leaves the originals in place and drags copies (new ids, same kind, colour, size and text, 8 px snapping as usual); the copies become the selection; one history step. The cursor shows the copy affordance (`cursor: copy`) while Option is held over a shape. Connectors are not duplicated unless both ends are in the selection.
- Right-click menu: a context menu (shadcn `ContextMenu`, SF2 MENU_* classes) on a shape with "Change shape" (a submenu listing Rectangle, Rounded, Decision, Terminal, Text, Note, the current one checked), "Colour" (submenu of the six colours, current checked), "Edit text", "Duplicate" (Cmd+D), "Bring to front" and "Send to back", and "Delete" (Delete). On a connector: "Connector" kind submenu (Straight, Step, Curve), "Arrowheads" submenu (End, Both, None), "Edit label", "Delete". Right-clicking an unselected element selects it first. Changing the kind keeps id, position, size, text, colour and connectors.
- Quick-add circles: hovering a shape shows four small circles with a plus, centred on each side just outside the box (distinct from the connector handles, which remain the drag targets): clicking a circle creates a new shape of the same kind and colour, empty text, placed on that side with a 64 px gap and aligned on the other axis, connected from the hovered shape to the new one with a step connector, selects the new shape and opens its text editor; Escape or clicking elsewhere hides the circles; they never show during a drag or on a connector.
- Persistence: everything goes through the existing diagram reducer and the page's `diagram`; new store actions: `duplicate` gains an offset argument, `setKind` exists, `reorder` (bring to front / send to back), `quickAdd(sourceId, side)`.
- Tests: the reducer actions; Option-drag leaves the originals and moves copies; the context menu items and their effects for a shape and a connector; the quick-add circles appear on hover, add a connected shape on each side with the gap and alignment, and hide during drags; keyboard reachability of the menu (Shift+F10 opens it on the selected element).
- Align and distribute (Matt, 2026-09-13: "i also need alignment options when selecting multiple shapes."): with two or more shapes selected, the right-click menu's "Align" submenu and the Design panel's alignment row offer Left, Center, Right, Top, Middle, Bottom (to the selection's bounding box) and, with three or more, Distribute horizontally / vertically (equal gaps, first and last stay); store actions `align` and `distribute`, one history step each, results exact with no grid snapping (shapes can sit off-grid since arrows nudge by 1 px; the layer's rule is that what the preview shows is what lands, so every action applies its values exactly, `quickAdd` included, with centre and distribute results rounded to integers); connectors follow their shapes.
- Live connector redraw (Matt, 2026-09-13: "make the connector line redraw itself during the drag... it redraws / reconnects itself after you stop moving the object, but that's not enough."): edges attached to a shape being dragged, resized or Option-drag-duplicated follow the shape's rendered box on every pointer move, label and fallback anchor included; the store is still written once at pointer up.

## 8. Select all and export (Matt, 2026-09-13)

Request: "i'd also like the ability to select all of the elements in a diagram and export it as a png or svg."

- **Select all.** With the diagram tool active, or with any diagram shape or connector selected, Cmd+A selects every shape and connector on the current page's diagram (registered in `lib/shortcuts.ts` as "Select all diagram elements"; the README table and its drift test follow). Escape clears the selection as today.
- **Export scope.** Export acts on the current selection; Cmd+A then Export is the whole diagram. A connector is exported when it is selected and both ends resolve, when both of its shapes are exported, or when one end is an exported shape and the other attaches to a frame (so selecting two connected shapes exports their connector without selecting it). Frames are not rasterised (they are live HTML): a frame that an exported connector attaches to is drawn as a 1 px outline rectangle carrying the frame's name, nothing else.
- **Where.** "Export as PNG" and "Export as SVG" in the shape/connector right-click menu and, when a diagram selection exists, in the Design panel under the alignment row. The browser download is named after the page (`<file name> - <page name>.png|svg`).
- **Look.** The export mirrors the canvas exactly (review 2026-09-13 settled the open readings this way): a background rectangle in the canvas surface colour (`--canvas`, #14121B), 32 px padding around the bounds of everything drawn including curved connector extents and label chips, the same shape geometry (rect, rounded 12 px, decision diamond, terminal pill, note 2 px, text without a box), the same fills and strokes translated to hex, 1.5 px strokes, connectors with the same straight/step/curve paths, arrowheads in the accent colour, edge labels as the same chip, text at the canvas's 1.45 line height, connectors drawn beneath shapes. Text is native SVG `<text>`/`<tspan>` (never `foreignObject`, which PNG rasterisation and most viewers drop), 13 px centred, wrapped to the shape's inner width with a pluggable text measurer (canvas `measureText` in the browser, a deterministic stub in tests), using the app's font stack with generic fallbacks; no font files are embedded.
- **PNG.** Rendered from the SVG string through an `Image` and a `canvas` at 2x, transparent nowhere (the background rectangle is part of the drawing).
- **Module split.** `lib/diagram/export.ts` is pure and fully unit-tested (`renderDiagramSvg` returns the SVG string plus width and height; `svgToPngBlob` is the thin browser wrapper). The UI hookup (Cmd+A, menu entries, Design panel buttons, download) is a follow-on task after the diagram follow-ups and grid branches merge, so it lands on the final right-click menu and alignment row.

## 9. Shape text styling (Matt, 2026-09-13)

Request: "give the diagram shapes a font selection like small, medium, large. as well as a monospaced font, a serif font, and a sans serif font? also let me change the color of the fonts independently from the shape's colors."

- Each shape carries `textSize` (five steps — small 16 px, medium 24 px, large 40 px, xlarge 64 px, huge 96 px, labelled Small/Medium/Large/Extra Large/Huge; widened 2026-09-14 to this five-value scale, replacing two earlier three-value scales — 11/13/16, then briefly 10/14/20 — that Matt found too close together to read as distinct), `textFont` (sans = the tool's sans stack, serif = a system serif stack, mono = the tool's mono stack) and `textColor` (default white, or any of the six diagram colours at full strength, or black), all optional in the stored data so existing files read unchanged.
- The Design panel's diagram fields gain three fields, Text size, Font and Text color, next to the existing Color; with several shapes selected they apply to every selected shape as one history step (`setTextStyle` action). Text size has five options, past the panel's own ≤3-options ToggleGroup threshold, so it renders as a Select; Font and Text color stay at three options each and render as a ToggleGroup.
- The right-click menu gets a "Text" submenu with the same three groups as radio items.
- Rendering on the canvas, in the Option-drag ghost and in the PNG/SVG export all honour the three; the export's font stacks and the text measurer use the chosen family and size.

## 10. Marquee selection and groups (Matt, 2026-09-13)

Request: "for diagram, i need to be able to drag to select multiple items, group them, and also move them around."

- **Marquee.** With the pointer tool, dragging on empty canvas inside the diagram (not on a shape, connector, handle or frame) draws the same selection box the frame marquee uses and, on release, selects every shape and connector whose box or path intersects it (Shift keeps the existing selection and adds). A plain click still clears. The marquee never starts over a frame (that remains the frame marquee's job) and never while Space is held.
- **Groups.** Cmd+G groups the selected shapes (two or more) under a new `groupId` stored on each node; Cmd+Shift+G ungroups the selected group. Clicking any member selects the whole group (all members plus connectors between them); double-clicking a member enters the group and selects just that shape until the selection leaves the group. A selected group shows one dashed outline around its members' bounds. Nested groups are not supported (grouping a selection that contains grouped shapes regroups them all into one flat group).
- **Moving.** Dragging any selected shape moves the whole selection (already true) and therefore whole groups; arrow nudges, align, distribute, duplicate, delete, Option-drag and export treat a group as its members. Quick-add on a grouped shape adds the new shape outside the group.
- **Data and history.** `groupId` is optional on nodes (old files unchanged); `group` and `ungroup` are one history step each; `duplicate` gives copies a fresh group id; `validateDiagram` accepts the field. Registered shortcuts: `diagram-group` (Cmd+G) and `diagram-ungroup` (Shift+Cmd+G), README rows included.
- Order: after section 9 (text styling) merges, since both edit the store and the layer.

## 11. Text tool shortcut (Matt, 2026-09-13)

"if i wanted to add text outside of a frame on the canvas, how can i do that?" Free text on the canvas is the diagram's Text shape. Add `diagram-text-tool` (T, area Tools, "Text on the canvas"): opens the diagram palette if closed and arms the Text shape, so the next click places a text block and opens its editor; Escape returns to the pointer as today. README row and drift test; gated like the other single-letter tool shortcuts (never while typing). Order: after section 10 merges.

## 12. Reconnecting a connector's ends (Matt, 2026-09-14)

Request: "select a connector line and reconnect either end to a different point on a shape. right now, it's not movable."

- A selected connector shows a round handle at each end (SF2 accent, sized like the resize handles, 1/zoom). Dragging a handle detaches that end: a dashed preview follows the pointer from the fixed end; releasing over a shape or frame attaches to it on the side nearest the pointer (same resolution as drawing a new connector), releasing over a different side of the same shape moves the end to that side, releasing over empty canvas or pressing Escape leaves the connector unchanged. The other end never moves.
- Store: `reconnect({ id, end: 'source' | 'target', endpoint })`, one history step, no-op when nothing changes, refused when the result would be a self-loop or duplicate a connector that already exists (same rule as `connect`). Labels, kind and arrowheads stay.
- Frames are valid targets exactly as for a new connector. Undo restores the previous end.
- Tests: handle presence only when selected, the drag preview, attach to another shape, move to another side, drop on empty canvas, Escape, self-loop refusal, undo.

## 13. Diagram elements in the Elements panel (Matt, 2026-09-14)

"you added components in the tool palette on right column when closed, but not open. i want the open version of the panel to have all of the diagramming elements displayed in there."

- The Elements tab gets a "Diagram" group (after the existing element groups) listing every diagram tool the floating palette offers: Rectangle, Rounded, Decision, Terminal, Text, Note and Connector, with the same icons and labels. Clicking one arms that tool exactly as the palette button does (the next canvas click places it; the palette opens if it was closed so the arming is visible; Escape returns to the pointer); the armed item shows the pressed state. The search filters them like any other element; the "i" documentation button applies to them with short docs entries.
- The minimized rail's Diagram icon keeps toggling the palette; the palette itself is unchanged.
- Tests: the group renders all seven, clicking arms the tool and shows pressed, search matches, docs entries exist.

## 14. Connector line style: solid or dashed (Matt, 2026-09-14)

Request: "i'd also like a connector style - dashed, solid, 90 degree, curved." The shape of the connector (90 degree = Step, curved = Curve, plus Straight) already exists as `ConnectorKind` and is already settable in the Design panel and the right-click "Connector" submenu. The one new piece is the LINE style, independent of shape.

- `DiagramEdge` gains an optional `lineStyle: 'solid' | 'dashed'` (`LINE_STYLES` tuple, `LineStyle` type, `LINE_STYLE_LABELS`), absent meaning solid so old files are unchanged; a `setLineStyle({ id, lineStyle })` reducer action, one history step, mirroring `setArrow` exactly (single edge id, no no-op guard needed since it is only ever dispatched from an explicit user choice).
- Design panel: a "Line" select next to Kind and Arrows in the connector's field group (Solid/Dashed).
- Right-click menu: the existing "Connector" submenu (which already lists Straight/Step/Curve as radio items) gains a second, sibling submenu "Line" with Solid/Dashed as radio items, same position/chrome as "Arrowheads".
- Rendering: the visible edge path (not the invisible hit-path) gets `strokeDasharray` `${4 / zoom} ${3 / zoom}` when dashed, matching the dash pattern already used for every in-progress drag preview in the layer, so a dashed connector and an in-progress connector preview read consistently; the Option-drag ghost edge and the export renderer (`lib/diagram/export.ts`) both honour it too.
- Validation: `validateDiagram` accepts the two listed values, rejects anything else, same shape as `ConnectorKind`'s own check.
