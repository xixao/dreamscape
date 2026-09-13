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
