import { describe, expect, it } from 'vitest';
import {
  anchorOnBox,
  bezierControlPoints,
  bounds,
  distanceToPath,
  distanceToPolyline,
  distanceToSegment,
  getBezierPath,
  getHandlePosition,
  getSmoothStepPath,
  getStepPoints,
  getStraightPath,
  sideFromPoint,
  snapToGrid,
  type Box,
} from './geometry';

const BOX: Box = { x: 100, y: 200, width: 80, height: 40 };

describe('snapToGrid', () => {
  it('rounds to the nearest multiple of 8 by default', () => {
    expect(snapToGrid(0)).toBe(0);
    expect(snapToGrid(3)).toBe(0);
    expect(snapToGrid(5)).toBe(8);
    expect(snapToGrid(12)).toBe(16);
    expect(snapToGrid(60)).toBe(64);
  });

  it('accepts a custom grid size', () => {
    expect(snapToGrid(24, 10)).toBe(20);
    expect(snapToGrid(26, 10)).toBe(30);
  });

  it('handles negative values', () => {
    expect(snapToGrid(-5)).toBe(-8);
    expect(snapToGrid(-20)).toBe(-16);
  });
});

describe('getHandlePosition', () => {
  it('returns the midpoint of each side', () => {
    expect(getHandlePosition(BOX, 'top')).toEqual({ x: 140, y: 200 });
    expect(getHandlePosition(BOX, 'right')).toEqual({ x: 180, y: 220 });
    expect(getHandlePosition(BOX, 'bottom')).toEqual({ x: 140, y: 240 });
    expect(getHandlePosition(BOX, 'left')).toEqual({ x: 100, y: 220 });
  });
});

describe('sideFromPoint', () => {
  it('classifies a point far to the right as "right"', () => {
    expect(sideFromPoint(BOX, { x: 500, y: 220 })).toBe('right');
  });

  it('classifies a point far to the left as "left"', () => {
    expect(sideFromPoint(BOX, { x: -500, y: 220 })).toBe('left');
  });

  it('classifies a point far above as "top"', () => {
    expect(sideFromPoint(BOX, { x: 140, y: -500 })).toBe('top');
  });

  it('classifies a point far below as "bottom"', () => {
    expect(sideFromPoint(BOX, { x: 140, y: 900 })).toBe('bottom');
  });

  it('picks the nearer axis for a diagonal point outside a non-square box', () => {
    // BOX is wider than it is tall (80x40): a point offset equally in x and y
    // from the center exits through the top/bottom edge first because the
    // box is "flatter" - the diagonal split is scaled by the box's own
    // aspect ratio, not a plain 45-degree line.
    expect(sideFromPoint(BOX, { x: 140 + 60, y: 220 + 60 })).toBe('bottom');
  });
});

describe('anchorOnBox', () => {
  it('is the handle position for whichever side sideFromPoint picks', () => {
    const external = { x: 900, y: 220 };
    expect(anchorOnBox(BOX, external)).toEqual(getHandlePosition(BOX, sideFromPoint(BOX, external)));
  });
});

describe('getStraightPath', () => {
  it('starts and ends exactly at the two points', () => {
    const source = { x: 10, y: 20 };
    const target = { x: 110, y: 220 };
    const result = getStraightPath(source, target);
    expect(result.path).toBe('M10,20 L110,220');
    expect(result.labelX).toBe(60);
    expect(result.labelY).toBe(120);
  });
});

describe('bezierControlPoints', () => {
  it('extends the control points outward from each handle side', () => {
    const source = { x: 0, y: 0 };
    const target = { x: 200, y: 0 };
    const { c1, c2 } = bezierControlPoints(source, 'right', target, 'left');
    expect(c1.x).toBeGreaterThan(source.x);
    expect(c1.y).toBe(source.y);
    expect(c2.x).toBeLessThan(target.x);
    expect(c2.y).toBe(target.y);
  });

  it('extends vertically for top/bottom sides', () => {
    const source = { x: 0, y: 0 };
    const target = { x: 0, y: 200 };
    const { c1, c2 } = bezierControlPoints(source, 'bottom', target, 'top');
    expect(c1.y).toBeGreaterThan(source.y);
    expect(c2.y).toBeLessThan(target.y);
  });
});

describe('getBezierPath', () => {
  it('starts and ends exactly at the handles', () => {
    const source = { x: 0, y: 0 };
    const target = { x: 200, y: 80 };
    const result = getBezierPath(source, 'right', target, 'left');
    expect(result.path.startsWith('M0,0 C')).toBe(true);
    expect(result.path.endsWith('200,80')).toBe(true);
  });

  it('places the label near the midpoint of the curve, between the two handles', () => {
    const source = { x: 0, y: 0 };
    const target = { x: 200, y: 0 };
    const { labelX, labelY } = getBezierPath(source, 'right', target, 'left');
    expect(labelX).toBeGreaterThan(0);
    expect(labelX).toBeLessThan(200);
    expect(labelY).toBeCloseTo(0, 5);
  });
});

describe('getStepPoints', () => {
  it('is a single left/right detour (2 corners) when both handles face horizontally and rows differ', () => {
    const source = { x: 0, y: 0 };
    const target = { x: 200, y: 100 };
    const points = getStepPoints(source, 'right', target, 'left');
    expect(points[0]).toEqual(source);
    expect(points[points.length - 1]).toEqual(target);
    expect(points.length).toBe(4);
    // Both interior points share the midpoint x (an axis-aligned Z shape).
    expect(points[1].x).toBe(points[2].x);
  });

  it('is a single up/down detour (2 corners) when both handles face vertically and columns differ', () => {
    const source = { x: 0, y: 0 };
    const target = { x: 100, y: 200 };
    const points = getStepPoints(source, 'bottom', target, 'top');
    expect(points.length).toBe(4);
    expect(points[1].y).toBe(points[2].y);
  });

  it('is a single corner (L shape) for one horizontal and one vertical handle', () => {
    const source = { x: 0, y: 0 };
    const target = { x: 100, y: 100 };
    const points = getStepPoints(source, 'right', target, 'top');
    expect(points).toEqual([source, { x: target.x, y: source.y }, target]);
  });

  it('is a single corner (L shape) the other way round too', () => {
    const source = { x: 0, y: 0 };
    const target = { x: 100, y: 100 };
    const points = getStepPoints(source, 'bottom', target, 'left');
    expect(points).toEqual([source, { x: source.x, y: target.y }, target]);
  });
});

describe('getSmoothStepPath', () => {
  it('starts and ends exactly at the handles', () => {
    const source = { x: 0, y: 0 };
    const target = { x: 200, y: 100 };
    const result = getSmoothStepPath(source, 'right', target, 'left');
    expect(result.path.startsWith('M0,0')).toBe(true);
    expect(result.path.endsWith('200,100')).toBe(true);
  });

  it('has exactly 2 rounded corners for a Z-shaped route', () => {
    const source = { x: 0, y: 0 };
    const target = { x: 200, y: 100 };
    const result = getSmoothStepPath(source, 'right', target, 'left');
    expect(result.path.match(/Q/g)?.length ?? 0).toBe(2);
  });

  it('has exactly 1 rounded corner for an L-shaped route', () => {
    const source = { x: 0, y: 0 };
    const target = { x: 100, y: 100 };
    const result = getSmoothStepPath(source, 'right', target, 'top');
    expect(result.path.match(/Q/g)?.length ?? 0).toBe(1);
  });

  it('has no corners at all when the route is already a straight line', () => {
    const source = { x: 0, y: 50 };
    const target = { x: 200, y: 50 };
    const result = getSmoothStepPath(source, 'right', target, 'left');
    expect(result.path.match(/Q/g)?.length ?? 0).toBe(0);
  });

  it('shrinks the corner radius for very short segments instead of overshooting', () => {
    const source = { x: 0, y: 0 };
    const target = { x: 10, y: 4 };
    const result = getSmoothStepPath(source, 'right', target, 'top', 8);
    expect(result.path.startsWith('M0,0')).toBe(true);
    expect(result.path.endsWith('10,4')).toBe(true);
  });
});

describe('distanceToSegment', () => {
  it('is 0 for a point on the segment', () => {
    expect(distanceToSegment({ x: 50, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBeCloseTo(0);
  });

  it('is the perpendicular distance for a point off a horizontal segment', () => {
    expect(distanceToSegment({ x: 50, y: 5 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBeCloseTo(5);
  });

  it('is the distance to the nearer endpoint when the point is beyond the segment', () => {
    expect(distanceToSegment({ x: 150, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBeCloseTo(50);
  });
});

describe('distanceToPolyline', () => {
  it('is the minimum distance across every segment', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    expect(distanceToPolyline({ x: 100, y: 50 }, points)).toBeCloseTo(0);
    expect(distanceToPolyline({ x: 50, y: 10 }, points)).toBeCloseTo(10);
  });
});

describe('distanceToPath', () => {
  it('matches distanceToSegment for a straight connector', () => {
    const source = { x: 0, y: 0 };
    const target = { x: 100, y: 0 };
    const result = distanceToPath(
      { x: 50, y: 6 },
      { kind: 'straight', source, sourceSide: 'right', target, targetSide: 'left' },
    );
    expect(result).toBeCloseTo(6);
  });

  it('is small near a step path and large far away', () => {
    const source = { x: 0, y: 0 };
    const target = { x: 200, y: 100 };
    const params = { kind: 'step' as const, source, sourceSide: 'right' as const, target, targetSide: 'left' as const };
    const onPath = distanceToPath({ x: 100, y: 0 }, params);
    const farAway = distanceToPath({ x: 100, y: 500 }, params);
    expect(onPath).toBeLessThan(2);
    expect(farAway).toBeGreaterThan(300);
  });

  it('is small near a bezier curve and large far away', () => {
    const source = { x: 0, y: 0 };
    const target = { x: 200, y: 0 };
    const params = { kind: 'curve' as const, source, sourceSide: 'right' as const, target, targetSide: 'left' as const };
    const midpoint = distanceToPath({ x: 100, y: 0 }, params);
    const farAway = distanceToPath({ x: 100, y: 500 }, params);
    expect(midpoint).toBeLessThan(5);
    expect(farAway).toBeGreaterThan(300);
  });
});

describe('bounds', () => {
  it('is null for an empty list', () => {
    expect(bounds([])).toBeNull();
  });

  it('is the bounding box of every node', () => {
    const result = bounds([
      { x: 0, y: 0, width: 40, height: 40 },
      { x: 100, y: -20, width: 20, height: 20 },
    ]);
    expect(result).toEqual({ x: 0, y: -20, width: 120, height: 60 });
  });
});
