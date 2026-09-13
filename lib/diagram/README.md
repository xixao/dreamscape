# Diagram maths: attribution

`geometry.ts` in this directory (the straight/bezier/orthogonal-step edge
path construction, the per-side handle positions, and the box-anchor and
hit-testing helpers built on top of them) is an in-repo, zero-dependency
port of the architecture and path maths used by **React Flow**'s
`@xyflow/system` package (https://github.com/xyflow/xyflow). No code was
copied verbatim and no package from that project is installed anywhere in
this app (see `package.json`); this is a clean-room reimplementation of the
same general approach (control points offset outward from each handle's
side for a bezier curve, a midpoint-routed orthogonal polyline with rounded
corners for a step connector, and so on), adapted to this app's own shape
set and written from scratch for this codebase. `lib/diagram/store.ts` (the
reducer over nodes/edges/selection/history) and everything under
`components/workbench/diagram/` are original code with no such counterpart.

`@xyflow/system` is published under the MIT License:

```
MIT License

Copyright (c) 2019-2025 webkid GmbH

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

# Export

`export.ts` turns a page's diagram (or the selected part of it) into a
standalone SVG, and rasterises that to PNG in the browser (spec section 8).

- `renderDiagramSvg({ nodes, edges, frames, selection?, measureText, padding? })`
  is pure and returns `{ svg, width, height }`, or `null` when nothing is
  exportable. With no `selection` everything is exported; with one, the
  selected shapes plus the selected connectors whose two ends are each a
  selected shape or a frame. A frame a connector attaches to is drawn as a
  1 px outline with its name (frames are live HTML and never rasterised).
  The drawing mirrors `diagram-layer.tsx`: `#1B1922` background, 32 px
  padding, the same shape geometry, 1.5 px strokes, the same straight/step/
  curve paths from `geometry.ts` and the same arrowhead marker (white in the
  export). Text is native `<text>`/`<tspan>`, wrapped to the shape's inner
  width with the supplied `measureText` (canvas `measureText` in the
  browser, a fixed-width stub in tests); no font files are embedded.
- `DIAGRAM_EXPORT_COLORS` maps each `DiagramColor` to the concrete fill and
  stroke the Tailwind classes resolve to on screen: white at 10% / 50% for
  neutral, and Tailwind 4's `*-500` at 25% alpha / `*-400` for the rest. The
  hex values are the sRGB rendering of the oklch tokens in
  `node_modules/tailwindcss/theme.css` (converted once, hard-coded with the
  source token named beside each entry).
- `svgToPngBlob(svg, { scale = 2 })` is the browser-only wrapper: object URL
  → `Image` → `canvas` at `scale` x → `canvas.toBlob('image/png')`, always
  revoking the URL and rejecting with a clear error when the image fails to
  load.

The UI hookup (Cmd+A, the right-click menu and Design panel entries, the
download itself) is a separate task; nothing in `export.ts` imports React or
reads the store.
