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

- Tool: a "Diagram" button in the top bar (lucide `Workflow`, `aria-label="Diagram tool"`, shortcut `D`) opens a small floating palette on the canvas: Rectangle, Rounded, Decision (diamond), Terminal (pill), Text, Note (sticky), and Connector. Click a shape in the palette, then click on the canvas to place it (or drag to size); Escape returns to the pointer. Double-click a shape to edit its text inline (Enter commits, Shift+Enter breaks a line, Escape cancels, max 500 chars).
- Connecting: hovering a shape or a frame shows four small handles on its sides; drag from a handle to another shape or frame to create a connector (the target side is chosen by the drop position; the connection is refused with no edge if source and target are the same node). Connector kind defaults to `step` (orthogonal, FigJam style); the Design panel for a selected connector switches kind, arrowheads and the label.
- Selection: click selects a shape or connector (SF2 accent outline, 8 px handles for resize on shapes); Shift+click adds; drag selected shapes together; Delete removes shapes and their connectors; Cmd+D duplicates with an 16 px offset; arrow keys nudge by 8 px (Shift: 64 px). Clicking empty canvas clears the selection.
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
