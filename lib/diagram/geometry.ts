// Pure path and hit-testing maths for the canvas diagram tool (spec
// docs/superpowers/specs/2026-09-13-diagrams-design.md section 4): the
// straight/bezier/orthogonal-step edge paths, handle positions on a shape or
// frame's four sides, 8 px grid snapping, distance-to-path hit tests and the
// bounding box every diagram node sits in. Ported from the architecture and
// path maths of React Flow's `@xyflow/system` package (MIT licensed) - see
// lib/diagram/README.md for the full attribution and license text. Kept
// free of any DOM read or app-specific type (same discipline as
// lib/canvas/viewport.ts) so it is exhaustively unit-testable and reusable
// from both lib/diagram/store.ts and the diagram layer/palette components.

export interface Point {
  x: number;
  y: number;
}

// A shape, frame or node's own box in canvas-space (unscaled) px - the same
// shape lib/canvas/viewport.ts's FrameRect uses, kept as a separate local
// type so this module stays free of any import (see the module comment
// above).
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Side = 'top' | 'right' | 'bottom' | 'left';

export interface PathResult {
  path: string;
  labelX: number;
  labelY: number;
}

export type EdgeKind = 'straight' | 'step' | 'curve';

// The corner radius getSmoothStepPath rounds to when nothing else is given -
// also the grid diagram nodes snap to (spec section 2: "8 px snapping on
// move and resize").
export const GRID_SIZE = 8;
export const DEFAULT_CORNER_RADIUS = 8;
// How many straight segments a bezier curve is sampled into for hit-testing
// (distanceToPath below) - enough to keep the polyline approximation within
// a pixel or two of the real curve for any edge this app draws.
const BEZIER_SAMPLES = 24;

/** Rounds `value` to the nearest multiple of `size` (default the 8 px grid). */
export function snapToGrid(value: number, size: number = GRID_SIZE): number {
  return Math.round(value / size) * size;
}

/** The midpoint of one side of a box - where a connector handle sits. */
export function getHandlePosition(box: Box, side: Side): Point {
  switch (side) {
    case 'top':
      return { x: box.x + box.width / 2, y: box.y };
    case 'right':
      return { x: box.x + box.width, y: box.y + box.height / 2 };
    case 'bottom':
      return { x: box.x + box.width / 2, y: box.y + box.height };
    case 'left':
      return { x: box.x, y: box.y + box.height / 2 };
  }
}

/**
 * Which side of `box` a ray from its center through `point` exits first -
 * the standard "which edge does this direction hit" test for a rectangle:
 * normalize the point's offset from center by the box's own half-width/
 * half-height, then whichever axis has the larger normalized magnitude is
 * the side the ray crosses. Used both to choose a connector's anchor side
 * from a drop position (spec: "the target side is chosen by the drop
 * position") and, via anchorOnBox below, as a frame's own anchor when no
 * side is stored for it.
 */
export function sideFromPoint(box: Box, point: Point): Side {
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const dx = point.x - centerX;
  const dy = point.y - centerY;
  const halfWidth = box.width / 2 || 1;
  const halfHeight = box.height / 2 || 1;
  const normalizedX = dx / halfWidth;
  const normalizedY = dy / halfHeight;
  if (Math.abs(normalizedX) > Math.abs(normalizedY)) {
    return normalizedX >= 0 ? 'right' : 'left';
  }
  return normalizedY >= 0 ? 'bottom' : 'top';
}

/**
 * The point on `box`'s perimeter facing `point` - a frame's own connector
 * anchor (spec section 2: "a frame (screen) can be a source or target; its
 * anchor is the frame box") when no explicit side is stored for that edge
 * endpoint, and the live preview point while dragging a connector before a
 * final side has been chosen.
 */
export function anchorOnBox(box: Box, point: Point): Point {
  return getHandlePosition(box, sideFromPoint(box, point));
}

function isHorizontalSide(side: Side): boolean {
  return side === 'left' || side === 'right';
}

function pointsEqual(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

/** The true midpoint of a polyline: half its total length along the path. */
function polylineMidpoint(points: readonly Point[]): Point {
  if (points.length === 1) return points[0];
  const segmentLengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const length = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    segmentLengths.push(length);
    total += length;
  }
  if (total === 0) return points[0];
  let remaining = total / 2;
  for (let i = 0; i < segmentLengths.length; i++) {
    const length = segmentLengths[i];
    if (remaining <= length || i === segmentLengths.length - 1) {
      const t = length === 0 ? 0 : remaining / length;
      const a = points[i];
      const b = points[i + 1];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= length;
  }
  return points[Math.floor(points.length / 2)];
}

/** `M`/`L`-only SVG path string through every point, in order. */
function polylinePath(points: readonly Point[]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ');
}

// --- Straight ---------------------------------------------------------

/** A plain straight line between the two handles. */
export function getStraightPath(source: Point, target: Point): PathResult {
  return {
    path: polylinePath([source, target]),
    labelX: (source.x + target.x) / 2,
    labelY: (source.y + target.y) / 2,
  };
}

// --- Bezier -------------------------------------------------------------

// How far a control point extends outward from its handle, as a fraction of
// the straight-line distance between the two handles - and the floor on
// that distance so two very close handles still curve visibly rather than
// collapsing to a near-straight line.
const BEZIER_CURVATURE = 0.28;
const BEZIER_MIN_OFFSET = 20;

function controlOffset(side: Side, distance: number): Point {
  const magnitude = Math.max(distance * BEZIER_CURVATURE, BEZIER_MIN_OFFSET);
  switch (side) {
    case 'top':
      return { x: 0, y: -magnitude };
    case 'bottom':
      return { x: 0, y: magnitude };
    case 'left':
      return { x: -magnitude, y: 0 };
    case 'right':
      return { x: magnitude, y: 0 };
  }
}

/**
 * The two cubic bezier control points for a curve leaving `source` on
 * `sourceSide` and arriving at `target` on `targetSide`: each extends
 * outward from its own handle in the direction that side implies, so the
 * curve always departs and arrives perpendicular to the shape it is
 * attached to instead of cutting across it.
 */
export function bezierControlPoints(
  source: Point,
  sourceSide: Side,
  target: Point,
  targetSide: Side,
): { c1: Point; c2: Point } {
  const distance = Math.hypot(target.x - source.x, target.y - source.y);
  const sourceOffset = controlOffset(sourceSide, distance);
  const targetOffset = controlOffset(targetSide, distance);
  return {
    c1: { x: source.x + sourceOffset.x, y: source.y + sourceOffset.y },
    c2: { x: target.x + targetOffset.x, y: target.y + targetOffset.y },
  };
}

/** A point on a cubic bezier at parameter `t` (0 = source, 1 = target). */
function cubicBezierPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** Samples a cubic bezier into `steps + 1` points, for hit-testing. */
function sampleBezier(p0: Point, p1: Point, p2: Point, p3: Point, steps: number): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    points.push(cubicBezierPoint(p0, p1, p2, p3, i / steps));
  }
  return points;
}

/** A cubic bezier curve leaving/arriving perpendicular to each handle's side. */
export function getBezierPath(source: Point, sourceSide: Side, target: Point, targetSide: Side): PathResult {
  const { c1, c2 } = bezierControlPoints(source, sourceSide, target, targetSide);
  const path = `M${source.x},${source.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${target.x},${target.y}`;
  const label = cubicBezierPoint(source, c1, c2, target, 0.5);
  return { path, labelX: label.x, labelY: label.y };
}

// --- Orthogonal step ------------------------------------------------------

/**
 * The polyline (unrounded) an orthogonal "step" connector follows between
 * two handles, routed from each one's own side: two handles that both face
 * along the same axis (both horizontal, or both vertical) get a Z-shaped
 * detour through the midpoint of that axis; one of each gets a single
 * L-shaped corner. Exported (not just used internally by getSmoothStepPath)
 * so hit-testing and corner-count tests can reason about the route
 * directly, independent of corner rounding.
 */
export function getStepPoints(source: Point, sourceSide: Side, target: Point, targetSide: Side): Point[] {
  const sourceHorizontal = isHorizontalSide(sourceSide);
  const targetHorizontal = isHorizontalSide(targetSide);

  let points: Point[];
  if (sourceHorizontal && targetHorizontal) {
    const midX = (source.x + target.x) / 2;
    points = [source, { x: midX, y: source.y }, { x: midX, y: target.y }, target];
  } else if (!sourceHorizontal && !targetHorizontal) {
    const midY = (source.y + target.y) / 2;
    points = [source, { x: source.x, y: midY }, { x: target.x, y: midY }, target];
  } else if (sourceHorizontal) {
    // Source leaves horizontally, target arrives vertically: one corner
    // directly below/above the target, level with the source.
    points = [source, { x: target.x, y: source.y }, target];
  } else {
    // Source leaves vertically, target arrives horizontally: the mirror of
    // the branch above.
    points = [source, { x: source.x, y: target.y }, target];
  }

  // Collapses a point that coincides with its neighbour (e.g. the two
  // midpoints above are equal whenever the handles already share a row/
  // column) and any point that is merely collinear with its neighbours
  // (the route never actually turns there) - both leave the path a real,
  // minimal corner count instead of a degenerate zero-length or
  // straight-through "corner" that would still count as one to
  // buildRoundedPath.
  return simplifyPolyline(points);
}

function simplifyPolyline(points: readonly Point[]): Point[] {
  const deduped: Point[] = [];
  for (const point of points) {
    if (deduped.length === 0 || !pointsEqual(deduped[deduped.length - 1], point)) deduped.push(point);
  }
  const simplified: Point[] = [];
  for (let i = 0; i < deduped.length; i++) {
    const point = deduped[i];
    if (simplified.length >= 2) {
      const a = simplified[simplified.length - 2];
      const b = simplified[simplified.length - 1];
      const sameVerticalLine = a.x === b.x && b.x === point.x;
      const sameHorizontalLine = a.y === b.y && b.y === point.y;
      if (sameVerticalLine || sameHorizontalLine) {
        simplified.pop();
      }
    }
    simplified.push(point);
  }
  return simplified;
}

/** The point at distance `distance` from `from`, heading toward `to`. */
function pointTowards(from: Point, to: Point, distance: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const clamped = Math.min(distance, length);
  return { x: from.x + (dx / length) * clamped, y: from.y + (dy / length) * clamped };
}

/**
 * Rounds every interior corner of a polyline to `radius` (or less, for a leg
 * too short to fit a full radius on both sides of the turn): a straight
 * line up to `radius` before the corner, a quadratic curve through the
 * corner itself, then straight again - the first and last points are never
 * touched, so the resulting path always starts and ends exactly on the
 * polyline's own endpoints.
 */
function buildRoundedPath(points: readonly Point[], radius: number): string {
  if (points.length <= 2) return polylinePath(points);

  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const corner = points[i];
    const next = points[i + 1];
    const legIn = Math.hypot(corner.x - prev.x, corner.y - prev.y);
    const legOut = Math.hypot(next.x - corner.x, next.y - corner.y);
    const r = Math.max(0, Math.min(radius, legIn / 2, legOut / 2));
    const before = pointTowards(corner, prev, r);
    const after = pointTowards(corner, next, r);
    d += ` L${before.x},${before.y} Q${corner.x},${corner.y} ${after.x},${after.y}`;
  }
  const last = points[points.length - 1];
  d += ` L${last.x},${last.y}`;
  return d;
}

/**
 * FigJam-style orthogonal connector with rounded corners (spec section 3:
 * "Connector kind defaults to step"). Built from getStepPoints above, so
 * the corner count always matches the route that function chose.
 */
export function getSmoothStepPath(
  source: Point,
  sourceSide: Side,
  target: Point,
  targetSide: Side,
  radius: number = DEFAULT_CORNER_RADIUS,
): PathResult {
  const points = getStepPoints(source, sourceSide, target, targetSide);
  const label = polylineMidpoint(points);
  return { path: buildRoundedPath(points, radius), labelX: label.x, labelY: label.y };
}

// --- Hit testing ----------------------------------------------------------

/** The shortest distance from `point` to the segment `a`-`b`. */
export function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  const projection = { x: a.x + t * dx, y: a.y + t * dy };
  return Math.hypot(point.x - projection.x, point.y - projection.y);
}

/** The shortest distance from `point` to any segment of a polyline. */
export function distanceToPolyline(point: Point, points: readonly Point[]): number {
  let min = Infinity;
  for (let i = 1; i < points.length; i++) {
    min = Math.min(min, distanceToSegment(point, points[i - 1], points[i]));
  }
  return min;
}

export interface EdgePathParams {
  kind: EdgeKind;
  source: Point;
  sourceSide: Side;
  target: Point;
  targetSide: Side;
}

/**
 * Hit-testing distance from `point` to whichever kind of connector path
 * `params` describes: exact segment distance for a straight or step
 * connector, and distance to a sampled polyline approximation for a curve
 * (spec section 5: "hit-testing tolerance"). Callers compare the result
 * against a fixed pixel tolerance (the diagram layer's own hit radius) to
 * decide whether a click landed on the edge.
 */
export function distanceToPath(point: Point, params: EdgePathParams): number {
  const { kind, source, sourceSide, target, targetSide } = params;
  if (kind === 'straight') return distanceToSegment(point, source, target);
  if (kind === 'step') return distanceToPolyline(point, getStepPoints(source, sourceSide, target, targetSide));
  const { c1, c2 } = bezierControlPoints(source, sourceSide, target, targetSide);
  return distanceToPolyline(point, sampleBezier(source, c1, c2, target, BEZIER_SAMPLES));
}

// --- Bounds -----------------------------------------------------------

/**
 * The bounding box of every given box (a diagram's nodes, typically), or
 * `null` for an empty list - the same shape lib/canvas/viewport.ts's own
 * fitAll expects for "every frame's bounding box", so a diagram's bounds
 * can be added straight into the same Zoom to fit call.
 */
export function bounds(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null;
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
