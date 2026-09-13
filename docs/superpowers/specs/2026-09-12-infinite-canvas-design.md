# Assembly Workbench: Infinite canvas

Date: 2026-09-12
Status: requested by Matt ("remember everything beneath the floating panels is an infinite canvas. i need to be able to hold space bar and pan around it."). Supersedes section 3 (canvas zoom) of `2026-09-12-panels-and-zoom-design.md` and the older "multiple screens on one canvas" queue item; the flow chart diagrams build on this canvas.

## 1. What it delivers

The editor works like Figma: the whole window is one endless canvas, the top bar and the right panel float above it, and every screen of the file is a frame placed on that canvas. Hold Space and drag to pan, scroll with two fingers to pan, pinch or Cmd+scroll to zoom around the pointer, Shift+1 to see everything. Frames can be dragged by their title to arrange a flow left to right. Later, flow chart diagrams are drawn on the same canvas between the frames.

## 2. Model

- Viewport per file per browser: `{ x, y, zoom }` in `localStorage` (`assembly-workbench:viewport:<fileId>`), default: fit all frames.
- Frame position in the file: each screen gains `x` and `y` (canvas px, integers, default laid out left to right with a 200 px gap in screen order; existing files get positions on first load and save them on the next change). Stored in the screens JSON with `stageWidth`, `stageHeight`, `deviceName`.
- Canvas layer: one element with `transform: translate(x, y) scale(zoom)` and `transform-origin: 0 0` containing every frame (each frame is its own iframe from the responsive canvas work, positioned absolutely at its `x, y` and sized to its own width and height; a frame without a fixed height sizes to its content). The canvas background is the SF2 `--canvas` colour with a faint 8 px dot grid that moves with the pan and fades out below 25 % zoom.
- Focused frame: the screen the Design and Prototype panels, Undo history, Present and the screens strip act on. Clicking inside a frame focuses it; clicking a tab in the screens strip focuses that screen and animates the viewport to fit it (200 ms ease-out). The frame title (Figma style, above the top-left corner: mono `text-[11px]`, `text-t2` when focused) doubles as the drag handle to move the frame (8 px snapping) and, on double-click, renames the screen inline.

## 3. Interactions

- Pan: Space held plus drag anywhere (cursor `grab`/`grabbing`, Space alone shows `grab`); two-finger scroll / wheel without modifiers pans; middle mouse drag pans. Panning never scrolls the page.
- Zoom: pinch or Cmd+wheel zooms around the pointer (10 % to 400 %, continuous); Cmd+= / Cmd+- step through 10, 25, 50, 75, 100, 125, 150, 200, 300, 400 around the viewport centre (both `preventDefault` so the browser never zooms the page); Cmd+0 sets 100 %; Shift+1 zooms to fit all frames; Shift+2 zooms to the selected layer or the focused frame. The percentage in the top bar opens a menu with these items and their shortcuts in mono.
- Selection: clicking empty canvas deselects and keeps the focused frame; a marquee is out of scope for now.
- Drop from the Components tab: works into any frame; Craft's drop indicator draws inside that frame.
- Comments: pins keep their frame-relative coordinates; the comment layer positions them through the viewport transform, so pins follow pan and zoom.
- The layer stack menu, selection outlines and the interaction tags convert frame coordinates to window coordinates through the viewport transform.

## 4. Floating chrome

Matt (2026-09-12): "when the chat panel is opened, the canvas that holds the frames (pages) should not scale up or down." Opening or closing any panel (chat, the right panel, minimize, Cmd+\) never changes the viewport's zoom or pan: the panels float over the canvas and cover part of it, and the frames stay exactly where they are at the same size. Fit-to-width on panel changes, which the current column layout does, goes away with this work; zoom only changes when the user zooms (or picks Fit / a screen tab).

- The top bar floats over the canvas (full width, `absolute top-3 left-3 right-3`, SF2 panel surface with `shadow-panel-lg`); the right panel floats at `right-3 top-[76px] bottom-3` with the same surface; the chat column, when open, floats to the right of it. The canvas element fills the viewport (`inset-0`). Cmd+\ hides both.
- The screens strip stays at the top of the canvas area beneath the top bar as a floating chip row.

## 5. Code

- `lib/canvas/viewport.ts` (pure, tested): `panBy`, `zoomAround(point, factor)`, `zoomToRect(rect, viewportSize, padding)`, `fitAll(frames)`, `nextZoomStep(zoom, direction)`, `toCanvasPoint`/`toWindowPoint`, clamps.
- `components/workbench/canvas.tsx`: the pannable layer, the Space/drag state machine (`keydown`/`keyup` for Space on both the parent and every frame window, pointer capture for the drag), the non-passive `wheel` listener, the dot grid, and `CanvasViewportProvider` exposing the viewport to overlays.
- `components/workbench/frame-title.tsx`: title, drag-to-move, double-click rename (reuses the screens strip rename logic).
- `components/workbench/stage.tsx` becomes the multi-frame host: one `CanvasFrame` per screen, the focused one receiving the Craft `Frame` editing session; non-focused frames render read-only previews through the same `CanvasFrame` with a second, disabled Craft `Editor` per frame (the Play module already renders a disabled editor per screen; reuse that renderer).
- `components/workbench/workbench.tsx`: `focusedScreenId` replaces `currentScreenId` semantics (same state, renamed for clarity), viewport store, floating layout.
- Persistence: `x`, `y` per screen through `validateScreens` and the repository (integers; both or neither).

## 6. Tests

Viewport maths (zoom around a pointer keeps the point fixed; fit-all covers every frame with padding; steps); Space+drag pans and releases on keyup or pointer up; wheel pans, Cmd+wheel zooms and `preventDefault` is called; keyboard shortcuts; clicking a screens tab focuses and calls zoom-to-fit for that frame; frame drag updates `x, y` with 8 px snapping and saves; pins and outlines transform with the viewport; persistence round trip of `x, y`; the floating chrome hides with Cmd+\.

## 7. Browser check

Production: open the Dashboard file, hold Space and drag: the canvas pans; two-finger scroll pans; pinch zooms around the pointer; Shift+1 fits every frame; add a screen: it appears to the right of the last frame; drag a frame title to move it; click a tab: the viewport animates to that frame; drop a Button into a frame at 50 % zoom: it lands where dropped; add a comment pin, pan and zoom: the pin stays on its spot.

## Order

After the responsive canvas merges. The flow chart diagrams (zero external dependencies; in-repo port of React Flow's architecture) follow immediately on this canvas: nodes and edges are canvas objects between frames, sharing the viewport, selection and pan/zoom.
