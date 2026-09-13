import { describe, expect, it } from 'vitest';
import { resolveSnap, SNAP_GRID, SNAP_TOLERANCE_SCREEN_PX, type SnapBox } from './snap';

function box(x: number, y: number, width: number, height: number, id = 'moving'): SnapBox {
  return { id, x, y, width, height };
}

describe('resolveSnap - constants', () => {
  it('exposes the 8 px grid and 6 screen px tolerance the spec calls for', () => {
    expect(SNAP_GRID).toBe(8);
    expect(SNAP_TOLERANCE_SCREEN_PX).toBe(6);
  });
});

// Review fix wave item 1 (blocker): every returned position must be an
// integer - validateScreens rejects a fractional x/y with a 400, and
// lib/persistence.ts never retries a 400, so a fractional save silently
// wedges autosave. These four reproduce the review's own cases.
describe('resolveSnap - integer positions (review fix wave item 1)', () => {
  it('rounds the disabled (Cmd/Ctrl) passthrough - a zoom-0.75 drag divides unevenly', () => {
    // 23 screen px / 0.75 zoom = 30.666...; 100 + 30.666... = 130.666...
    const result = resolveSnap(box(130.6666666666667, 200, 50, 100), [], 0.75, { disabled: true });
    expect(result.position).toEqual({ x: 131, y: 200 });
    expect(Number.isInteger(result.position.x)).toBe(true);
  });

  it('rounds a raw, unsnapped position - zoom 2 keeps it 3.5 canvas px from the grid, outside the 3 px tolerance', () => {
    const result = resolveSnap(box(131.5, 131.5, 50, 100), [], 2);
    expect(result.position).toEqual({ x: 132, y: 132 });
  });

  it('rounds a fractional centre-to-centre edge snap (an odd-width neighbour)', () => {
    const other = box(0, 0, 403, 100, 'other'); // centre 201.5
    // moving centre target: 201.5 - 200 = 1.5
    const result = resolveSnap(box(2, 0, 400, 100), [other], 1);
    expect(result.position.x).toBe(2); // Math.round(1.5) === 2
  });

  it('rounds a fractional equal-spacing target', () => {
    const left = box(0, 0, 100, 100, 'left'); // end 100
    const right = box(203, 0, 100, 100, 'right'); // start 203
    // equal-spacing x: (100 + 203 - 50) / 2 = 126.5
    const result = resolveSnap(box(127, 0, 50, 100), [left, right], 1);
    expect(result.position.x).toBe(127); // Math.round(126.5) === 127
    expect(Number.isInteger(result.position.x)).toBe(true);
  });
});

describe('resolveSnap - the 8 px grid', () => {
  it('snaps the moving box origin to the nearest grid line when within tolerance', () => {
    const result = resolveSnap(box(126, 48, 50, 100), [], 1);
    // 126 is 2px from the grid line at 128 (well within the 6 screen px / zoom 1 tolerance).
    expect(result.position).toEqual({ x: 128, y: 48 });
  });

  it('leaves an already-aligned position untouched', () => {
    const result = resolveSnap(box(200, 400, 50, 100), [], 1);
    expect(result.position).toEqual({ x: 200, y: 400 });
  });

  // Review fix wave item 3: a grid snap draws no guide - only another
  // frame's edge or an equal-spacing gap is worth a drawn line, since the
  // background grid is already visible (or, hidden, isn't something a
  // guide should invent a line for).
  it('draws no guide for a snap to the grid, on either axis', () => {
    const result = resolveSnap(box(126, 48, 50, 100), [], 1);
    expect(result.position).toEqual({ x: 128, y: 48 });
    expect(result.guides).toHaveLength(0);
  });

  it('scales the tolerance by zoom: the same 3px-from-grid offset snaps at zoom 1 but not at zoom 3', () => {
    // 107 sits 3px from the nearest grid line (104).
    const atZoom1 = resolveSnap(box(107, 107, 50, 100), [], 1);
    expect(atZoom1.position).toEqual({ x: 104, y: 104 });

    // Zoom 3 shrinks the 6 screen px tolerance to 2 canvas px, which 3px misses.
    const atZoom3 = resolveSnap(box(107, 107, 50, 100), [], 3);
    expect(atZoom3.position).toEqual({ x: 107, y: 107 });
    expect(atZoom3.guides).toHaveLength(0);
  });
});

describe('resolveSnap - other frames edges', () => {
  it("snaps to another frame's edge when it is nearer than the grid", () => {
    // moving.left=204: nearest grid is 208 (distance 4). The other frame's
    // right edge sits at 203 (distance 1) and should win.
    const other = box(100, 0, 103, 100, 'other');
    const result = resolveSnap(box(204, 0, 50, 100), [other], 1);
    expect(result.position.x).toBe(203);
  });

  it('snaps left-to-left, center-to-center and right-to-right', () => {
    const other = box(0, 0, 200, 200, 'other'); // left 0, center 100, right 200

    // moving.left (3) 3px from other's left (0); grid is tied at 0 too, and
    // both agree on the result, so this also confirms edges compete cleanly.
    expect(resolveSnap(box(3, 0, 50, 50), [other], 1).position.x).toBe(0);

    // moving.center (101, from x=76) 1px from other's center (100); the
    // grid's own nearest line (80) is 4px away, so the edge match wins.
    expect(resolveSnap(box(76, 0, 50, 50), [other], 1).position.x).toBe(75);

    // moving.right (198, from x=148) 2px from other's right (200); the
    // grid's own nearest line (152) is 4px away, so the edge match wins.
    expect(resolveSnap(box(148, 0, 50, 50), [other], 1).position.x).toBe(150);
  });

  it('snaps a touching edge (moving right to other left)', () => {
    const other = box(300, 0, 100, 100, 'other'); // left edge at 300
    // moving.right = 251+50 = 301, 1px from other's left edge (300); the
    // grid's own nearest line (248) is 3px away, so the edge match wins.
    const result = resolveSnap(box(251, 0, 50, 50), [other], 1);
    expect(result.position.x).toBe(250);
  });

  it('reports an edge guide spanning both boxes on the cross axis', () => {
    const other = box(100, 300, 103, 40, 'other');
    const result = resolveSnap(box(204, 0, 50, 100), [other], 1);
    const guide = result.guides.find((g) => g.kind === 'edge' && g.orientation === 'vertical');
    expect(guide).toBeDefined();
    expect(guide!.position).toBe(203);
    // Union of moving's [0,100] and other's [300,340] cross-axis extents.
    expect(guide!.from).toBe(0);
    expect(guide!.to).toBe(340);
  });

  it('ignores an other-frame edge outside the tolerance and falls back to the grid', () => {
    const other = box(1000, 0, 100, 100, 'other');
    const result = resolveSnap(box(126, 0, 50, 100), [other], 1);
    expect(result.position.x).toBe(128);
  });

  // Review fix wave item 3: candidates are checked edges -> spacing -> grid,
  // so an exact tie (resolveAxis's own winner search only replaces the
  // current winner on a STRICTLY smaller distance) goes to the edge, not
  // the grid.
  it('an edge match wins an exact tie against the grid', () => {
    // moving.x=4 is 4px from both the nearest grid line (8) and another
    // frame's own left edge (other.x=8) - matching widths (1000) put every
    // other moving/other edge pair (center-center, right-right) at the
    // same +4 delta too, and every non-matching pair (e.g. moving's right
    // to other's left) well outside the zoom-1 tolerance of 6.
    const other = box(8, 0, 1000, 1000, 'other');
    const result = resolveSnap(box(4, 0, 1000, 1000), [other], 1);
    expect(result.position.x).toBe(8);
    // The grid alone would have produced the same position but no guide -
    // an edge-kind guide is the only observable proof the edge (not the
    // grid) actually won.
    expect(result.guides.some((guide) => guide.kind === 'edge' && guide.orientation === 'vertical')).toBe(true);
  });
});

describe('resolveSnap - equal spacing between two neighbours', () => {
  it('snaps to the x that makes the gaps on both sides equal', () => {
    const left = box(0, 0, 97, 100, 'left'); // right edge at 97
    const right = box(203, 0, 100, 100, 'right'); // left edge at 203
    // Equal-spacing x solves (x - 97) = (203 - (x + 50)) -> x = 125, gap 28 -
    // nearer to the dragged 126 than the grid's own candidate at 128.
    const result = resolveSnap(box(126, 48, 50, 100), [left, right], 1);
    expect(result.position.x).toBe(125);
  });

  it('reports two spacing guides with the matching equal distance', () => {
    const left = box(0, 0, 97, 100, 'left');
    const right = box(203, 0, 100, 100, 'right');
    const result = resolveSnap(box(126, 0, 50, 100), [left, right], 1);
    const spacing = result.guides.filter((g) => g.kind === 'spacing');
    expect(spacing).toHaveLength(2);
    expect(spacing[0].distance).toBe(28);
    expect(spacing[1].distance).toBe(28);
  });

  it('requires the neighbours to overlap the moving box on the cross axis', () => {
    const left = box(0, 500, 97, 100, 'left'); // no y-overlap with moving
    const right = box(203, 500, 100, 100, 'right');
    const result = resolveSnap(box(126, 0, 50, 100), [left, right], 1);
    // Falls back to the grid instead (126 -> 128).
    expect(result.position.x).toBe(128);
  });

  it('does nothing on an axis with only one neighbour', () => {
    const left = box(0, 0, 97, 100, 'left');
    const result = resolveSnap(box(126, 0, 50, 100), [left], 1);
    expect(result.position.x).toBe(128); // grid, not equal-spacing
  });
});

describe('resolveSnap - Cmd disables snapping', () => {
  it('returns the raw position with no guides when disabled', () => {
    const other = box(100, 0, 103, 100, 'other');
    const result = resolveSnap(box(204, 48, 50, 100), [other], 1, { disabled: true });
    expect(result.position).toEqual({ x: 204, y: 48 });
    expect(result.guides).toHaveLength(0);
    expect(result.distances).toHaveLength(0);
  });
});

describe('resolveSnap - Alt shows distances to the nearest neighbours even without a snap', () => {
  // moving sits 3px off-grid on both axes at zoom 3 (tolerance 2 canvas px),
  // so nothing actually snaps and every reported distance reflects the raw
  // dragged position. Every neighbour is offset just enough on its own
  // cross axis to overlap moving without lining up any of its own edges
  // within the snap tolerance, so this stays a pure distance-reporting case.
  const moving = box(107, 107, 50, 50);
  const left = box(0, 110, 100, 10, 'left'); // right edge 100, y-range [110,120]
  const right = box(400, 110, 100, 10, 'right'); // left edge 400, y-range [110,120]
  const above = box(110, -300, 10, 100, 'above'); // bottom edge -200, x-range [110,120]
  const below = box(110, 500, 10, 100, 'below'); // top edge 500, x-range [110,120]

  it('reports the gap to the nearest neighbour on each side when nothing actually snaps', () => {
    const result = resolveSnap(moving, [left, right, above, below], 3, { showDistances: true });
    expect(result.position).toEqual({ x: 107, y: 107 });
    expect(result.guides).toHaveLength(0);
    const bySide = Object.fromEntries(result.distances.map((d) => [d.side, d.value]));
    expect(bySide.left).toBe(7); // 107 - 100
    expect(bySide.right).toBe(243); // 400 - 157
    expect(bySide.top).toBe(307); // 107 - (-200)
    expect(bySide.bottom).toBe(343); // 500 - 157
  });

  it('omits a side with no overlapping neighbour', () => {
    const result = resolveSnap(moving, [], 3, { showDistances: true });
    expect(result.distances).toHaveLength(0);
  });

  it('does not compute distances when showDistances is not set', () => {
    const result = resolveSnap(moving, [left], 3);
    expect(result.distances).toHaveLength(0);
  });
});
