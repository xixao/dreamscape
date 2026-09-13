// Pure canvas snapping maths (spec docs/superpowers/specs/2026-09-13-grid-
// snapping-alignment-design.md sections 3-4): candidate lines from the 8 px
// grid and from other frames' edges and centres, nearest-line resolution
// within a tolerance given in screen px (converted to canvas px by the
// current zoom, the same conversion lib/canvas/viewport.ts's own toCanvasPoint
// applies to a point), and equal-spacing candidates between two neighbours.
// Kept free of any DOM read, same discipline as viewport.ts and
// lib/diagram/geometry.ts, so it is exhaustively unit-testable;
// components/workbench/frame-title.tsx is the only caller that feeds it a
// real drag.

// A frame's box in canvas-space (unscaled) px, with its id so a caller can
// tell which other frame a guide or distance came from - the same shape
// lib/canvas/viewport.ts's FrameRect uses, plus `id`.
export interface SnapBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type SnapGuideKind = 'grid' | 'edge' | 'spacing';

/**
 * One guide line (or, for `kind: 'spacing'`, one gap tick) to draw in the
 * canvas overlay (components/workbench/snap-guides.tsx).
 *
 * For `'grid'`/`'edge'`: `orientation` is the direction the line itself
 * runs - `'vertical'` for an x-axis snap (a line running top-to-bottom at a
 * given x), `'horizontal'` for a y-axis snap (running left-to-right at a
 * given y). `position` is the line's coordinate on the perpendicular axis
 * (x for a vertical line, y for a horizontal one); `from`/`to` is the
 * line's own extent along the direction it runs (a y-range for a vertical
 * line, an x-range for a horizontal one) - the union of the moving box's
 * and the matched other box's extents there, so the drawn line visibly
 * connects both.
 *
 * For `'spacing'`: the guide marks the gap between the moving box and one
 * neighbour, drawn as a short tick along the axis being spaced rather than
 * a full cross-axis line - `position` is the cross-axis coordinate to draw
 * the tick at (the shared overlap band's midpoint), `from`/`to` is the
 * gap's own span along the spaced axis, and `distance` is the (rounded)
 * gap width shown in the chip - always present for this kind, since an
 * unlabelled spacing tick would be meaningless.
 */
export interface SnapGuide {
  orientation: 'vertical' | 'horizontal';
  kind: SnapGuideKind;
  position: number;
  from: number;
  to: number;
  distance?: number;
}

export type SnapSide = 'left' | 'right' | 'top' | 'bottom';

/** One nearest-neighbour measurement (Alt-held, spec section 1/3), independent of whether anything actually snapped. */
export interface SnapDistance {
  side: SnapSide;
  value: number;
}

export interface ResolveSnapOptions {
  // Cmd held: snapping is off entirely, the moving box keeps its raw
  // position and no guides or distances are produced.
  disabled?: boolean;
  // Alt held: report the gap to the nearest overlapping neighbour on each
  // side even when nothing snaps - a plain hover measurement, not a guide.
  showDistances?: boolean;
}

export interface SnapResolution {
  position: { x: number; y: number };
  guides: SnapGuide[];
  distances: SnapDistance[];
}

export const SNAP_GRID = 8;
export const SNAP_TOLERANCE_SCREEN_PX = 6;

function nearestGrid(value: number): number {
  return Math.round(value / SNAP_GRID) * SNAP_GRID;
}

function overlaps(aStart: number, aSize: number, bStart: number, bSize: number): boolean {
  return aStart < bStart + bSize && bStart < aStart + aSize;
}

// One axis's worth of accessors into a SnapBox, so resolveAxis below runs
// the identical algorithm for x and y rather than duplicating it - the two
// axes differ only in which fields they read and which side names they use
// for the nearest-neighbour distances.
interface Axis {
  orientation: 'vertical' | 'horizontal';
  start: (box: SnapBox) => number;
  size: (box: SnapBox) => number;
  crossStart: (box: SnapBox) => number;
  crossSize: (box: SnapBox) => number;
  lowSide: SnapSide;
  highSide: SnapSide;
}

const X_AXIS: Axis = {
  orientation: 'vertical',
  start: (box) => box.x,
  size: (box) => box.width,
  crossStart: (box) => box.y,
  crossSize: (box) => box.height,
  lowSide: 'left',
  highSide: 'right',
};

const Y_AXIS: Axis = {
  orientation: 'horizontal',
  start: (box) => box.y,
  size: (box) => box.height,
  crossStart: (box) => box.x,
  crossSize: (box) => box.width,
  lowSide: 'top',
  highSide: 'bottom',
};

function edgesOf(axis: Axis, box: SnapBox): { start: number; center: number; end: number } {
  const start = axis.start(box);
  const size = axis.size(box);
  return { start, center: start + size / 2, end: start + size };
}

interface AxisCandidate {
  distance: number;
  // The resulting axis.start(moving) value this candidate produces.
  start: number;
  guides: SnapGuide[];
}

function gridCandidate(axis: Axis, moving: SnapBox): AxisCandidate {
  const start = axis.start(moving);
  const snapped = nearestGrid(start);
  return {
    distance: Math.abs(snapped - start),
    start: snapped,
    guides: [
      {
        orientation: axis.orientation,
        kind: 'grid',
        position: snapped,
        from: axis.crossStart(moving),
        to: axis.crossStart(moving) + axis.crossSize(moving),
      },
    ],
  };
}

/** Every moving-edge-to-other-edge match (left/center/right, or top/middle/bottom) within reach, one candidate per pair. */
function edgeCandidates(axis: Axis, moving: SnapBox, others: readonly SnapBox[]): AxisCandidate[] {
  const movingEdges = edgesOf(axis, moving);
  const movingValues = [movingEdges.start, movingEdges.center, movingEdges.end];
  const movingStart = axis.start(moving);
  const candidates: AxisCandidate[] = [];

  for (const other of others) {
    const otherEdges = edgesOf(axis, other);
    const otherValues = [otherEdges.start, otherEdges.center, otherEdges.end];
    for (const movingValue of movingValues) {
      for (const otherValue of otherValues) {
        const delta = otherValue - movingValue;
        candidates.push({
          distance: Math.abs(delta),
          start: movingStart + delta,
          guides: [
            {
              orientation: axis.orientation,
              kind: 'edge',
              position: otherValue,
              from: Math.min(axis.crossStart(moving), axis.crossStart(other)),
              to: Math.max(
                axis.crossStart(moving) + axis.crossSize(moving),
                axis.crossStart(other) + axis.crossSize(other),
              ),
            },
          ],
        });
      }
    }
  }
  return candidates;
}

/**
 * The candidate that makes the moving box sit at an equal gap from its
 * nearest neighbour on each side (the closest overlapping-on-the-cross-axis
 * other box centred before the moving box, and the closest one centred
 * after it) - Figma's "equal spacing" guide. `null` when there is no
 * neighbour on one side or the other (nothing to equalize against).
 */
function equalSpacingCandidate(axis: Axis, moving: SnapBox, others: readonly SnapBox[]): AxisCandidate | null {
  const movingCrossStart = axis.crossStart(moving);
  const movingCrossSize = axis.crossSize(moving);
  const movingSize = axis.size(moving);
  const movingCenter = axis.start(moving) + movingSize / 2;

  const overlapping = others.filter((other) =>
    overlaps(movingCrossStart, movingCrossSize, axis.crossStart(other), axis.crossSize(other)),
  );

  let left: SnapBox | null = null;
  let right: SnapBox | null = null;
  for (const other of overlapping) {
    const otherCenter = axis.start(other) + axis.size(other) / 2;
    if (otherCenter <= movingCenter) {
      if (!left || axis.start(other) + axis.size(other) > axis.start(left) + axis.size(left)) left = other;
    } else if (!right || axis.start(other) < axis.start(right)) {
      right = other;
    }
  }
  if (!left || !right) return null;

  const leftEnd = axis.start(left) + axis.size(left);
  const rightStart = axis.start(right);
  const start = (leftEnd + rightStart - movingSize) / 2;
  const gap = Math.round(start - leftEnd);
  const distance = Math.abs(start - axis.start(moving));

  const bandStart = Math.max(movingCrossStart, axis.crossStart(left), axis.crossStart(right));
  const bandEnd = Math.min(
    movingCrossStart + movingCrossSize,
    axis.crossStart(left) + axis.crossSize(left),
    axis.crossStart(right) + axis.crossSize(right),
  );
  const tickPosition = (bandStart + bandEnd) / 2;

  return {
    distance,
    start,
    guides: [
      { orientation: axis.orientation, kind: 'spacing', position: tickPosition, from: leftEnd, to: start, distance: gap },
      {
        orientation: axis.orientation,
        kind: 'spacing',
        position: tickPosition,
        from: start + movingSize,
        to: rightStart,
        distance: gap,
      },
    ],
  };
}

/** Resolves one axis: the nearest candidate (grid, an edge match, or equal spacing) within `tolerance`, or the raw position when nothing is close enough. */
function resolveAxis(
  axis: Axis,
  moving: SnapBox,
  others: readonly SnapBox[],
  tolerance: number,
): { start: number; guides: SnapGuide[] } {
  const candidates: AxisCandidate[] = [gridCandidate(axis, moving), ...edgeCandidates(axis, moving, others)];
  const spacing = equalSpacingCandidate(axis, moving, others);
  if (spacing) candidates.push(spacing);

  let winner: AxisCandidate | null = null;
  for (const candidate of candidates) {
    if (candidate.distance > tolerance) continue;
    if (!winner || candidate.distance < winner.distance) winner = candidate;
  }

  return winner ? { start: winner.start, guides: winner.guides } : { start: axis.start(moving), guides: [] };
}

function nearestBefore(boxes: readonly SnapBox[], edge: (box: SnapBox) => number, limit: number): SnapBox | null {
  let best: SnapBox | null = null;
  for (const candidate of boxes) {
    const value = edge(candidate);
    if (value <= limit && (!best || value > edge(best))) best = candidate;
  }
  return best;
}

function nearestAfter(boxes: readonly SnapBox[], edge: (box: SnapBox) => number, limit: number): SnapBox | null {
  let best: SnapBox | null = null;
  for (const candidate of boxes) {
    const value = edge(candidate);
    if (value >= limit && (!best || value < edge(best))) best = candidate;
  }
  return best;
}

/** Every side's gap to its nearest overlapping neighbour (Alt-held distances), regardless of the snap tolerance. */
function nearestNeighbourDistances(moving: SnapBox, others: readonly SnapBox[]): SnapDistance[] {
  const distances: SnapDistance[] = [];

  const besideX = others.filter((other) => overlaps(moving.y, moving.height, other.y, other.height));
  const before = nearestBefore(besideX, (box) => box.x + box.width, moving.x);
  if (before) distances.push({ side: X_AXIS.lowSide, value: moving.x - (before.x + before.width) });
  const after = nearestAfter(besideX, (box) => box.x, moving.x + moving.width);
  if (after) distances.push({ side: X_AXIS.highSide, value: after.x - (moving.x + moving.width) });

  const besideY = others.filter((other) => overlaps(moving.x, moving.width, other.x, other.width));
  const above = nearestBefore(besideY, (box) => box.y + box.height, moving.y);
  if (above) distances.push({ side: Y_AXIS.lowSide, value: moving.y - (above.y + above.height) });
  const below = nearestAfter(besideY, (box) => box.y, moving.y + moving.height);
  if (below) distances.push({ side: Y_AXIS.highSide, value: below.y - (moving.y + moving.height) });

  return distances;
}

/**
 * Resolves where `moving` should actually land while being dragged, given
 * every `other` frame on the same page and the canvas's current `zoom`
 * (spec section 3): snaps to the 8 px grid, to another frame's left/centre/
 * right or top/middle/bottom, or to the x/y that puts it at equal spacing
 * from two neighbours, whichever is nearest and within 6 screen px
 * (converted to canvas px by dividing by `zoom`, so the same-looking gap on
 * screen snaps the same way at any zoom level). `options.disabled` (Cmd
 * held) turns snapping off entirely; `options.showDistances` (Alt held)
 * additionally reports the gap to the nearest neighbour on every side, even
 * when nothing actually snaps.
 */
export function resolveSnap(
  moving: SnapBox,
  others: readonly SnapBox[],
  zoom: number,
  options: ResolveSnapOptions = {},
): SnapResolution {
  // Every returned position is rounded to a whole canvas px (review fix
  // wave item 1): validateScreens rejects a non-integer x/y outright, and
  // the moving box handed in here is itself often already fractional
  // (frame-title.tsx divides a screen-px drag delta by zoom before this
  // ever runs) - both the disabled (Cmd/Ctrl) passthrough below and every
  // resolved axis must round, or a drag can silently produce a save the
  // API 400s on.
  if (options.disabled) {
    return { position: { x: Math.round(moving.x), y: Math.round(moving.y) }, guides: [], distances: [] };
  }

  const tolerance = SNAP_TOLERANCE_SCREEN_PX / zoom;
  const resolvedX = resolveAxis(X_AXIS, moving, others, tolerance);
  const resolvedY = resolveAxis(Y_AXIS, moving, others, tolerance);
  const position = { x: Math.round(resolvedX.start), y: Math.round(resolvedY.start) };

  const distances = options.showDistances
    ? nearestNeighbourDistances({ ...moving, x: position.x, y: position.y }, others)
    : [];

  return { position, guides: [...resolvedX.guides, ...resolvedY.guides], distances };
}
