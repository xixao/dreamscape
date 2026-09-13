import { describe, expect, it } from 'vitest';
import {
  alignBottom,
  alignHorizontalCenters,
  alignLeft,
  alignRight,
  alignTop,
  alignVerticalMiddles,
  distributeHorizontally,
  distributeVertically,
  tidyUp,
  type AlignableFrame,
} from './align';

const A: AlignableFrame = { id: 'a', x: 0, y: 0, width: 100, height: 50 };
const B: AlignableFrame = { id: 'b', x: 200, y: 80, width: 50, height: 150 };
const C: AlignableFrame = { id: 'c', x: 400, y: 40, width: 80, height: 20 };

function byId(positions: { id: string; x: number; y: number }[]): Record<string, { x: number; y: number }> {
  return Object.fromEntries(positions.map((position) => [position.id, { x: position.x, y: position.y }]));
}

describe('alignLeft / alignRight', () => {
  it('aligns every frame to the leftmost edge, keeping y', () => {
    const result = byId(alignLeft([A, B, C]));
    expect(result.a).toEqual({ x: 0, y: 0 });
    expect(result.b).toEqual({ x: 0, y: 80 });
    expect(result.c).toEqual({ x: 0, y: 40 });
  });

  it('aligns every frame to the rightmost edge, keeping y', () => {
    // right = max(100, 250, 480) = 480
    const result = byId(alignRight([A, B, C]));
    expect(result.a).toEqual({ x: 380, y: 0 });
    expect(result.b).toEqual({ x: 430, y: 80 });
    expect(result.c).toEqual({ x: 400, y: 40 });
  });
});

describe('alignTop / alignBottom', () => {
  it('aligns every frame to the topmost edge, keeping x', () => {
    const result = byId(alignTop([A, B, C]));
    expect(result.a).toEqual({ x: 0, y: 0 });
    expect(result.b).toEqual({ x: 200, y: 0 });
    expect(result.c).toEqual({ x: 400, y: 0 });
  });

  it('aligns every frame to the bottommost edge, keeping x', () => {
    // bottom = max(50, 230, 60) = 230
    const result = byId(alignBottom([A, B, C]));
    expect(result.a).toEqual({ x: 0, y: 180 });
    expect(result.b).toEqual({ x: 200, y: 80 });
    expect(result.c).toEqual({ x: 400, y: 210 });
  });
});

describe('alignHorizontalCenters / alignVerticalMiddles', () => {
  it('centres every frame on the horizontal midpoint of the selection bounds', () => {
    // bounds left 0, right 480 -> centre 240
    const result = byId(alignHorizontalCenters([A, B, C]));
    expect(result.a).toEqual({ x: 190, y: 0 });
    expect(result.b).toEqual({ x: 215, y: 80 });
    expect(result.c).toEqual({ x: 200, y: 40 });
  });

  it('centres every frame on the vertical midpoint of the selection bounds', () => {
    // bounds top 0, bottom 230 -> centre 115
    const result = byId(alignVerticalMiddles([A, B, C]));
    expect(result.a).toEqual({ x: 0, y: 90 });
    expect(result.b).toEqual({ x: 200, y: 40 });
    expect(result.c).toEqual({ x: 400, y: 105 });
  });

  it('rounds a fractional centre to the nearest integer px', () => {
    const d: AlignableFrame = { id: 'd', x: 0, y: 0, width: 50, height: 1 };
    const e: AlignableFrame = { id: 'e', x: 100, y: 0, width: 51, height: 1 };
    // bounds left 0, right 151 -> centre 75.5; d: 75.5 - 25 = 50.5 -> 51
    const result = byId(alignHorizontalCenters([d, e]));
    expect(result.d.x).toBe(51);
    expect(result.e.x).toBe(50);
  });
});

describe('distributeHorizontally / distributeVertically', () => {
  it('spaces the gaps between every frame evenly, keeping the outermost frames put', () => {
    const result = byId(distributeHorizontally([A, B, C]));
    // span (0 to 480) minus total width (230) over 2 gaps = 125 each.
    expect(result.a).toEqual({ x: 0, y: 0 });
    expect(result.b).toEqual({ x: 225, y: 80 });
    expect(result.c).toEqual({ x: 400, y: 40 });
  });

  it('sorts by current position first, regardless of array order', () => {
    const result = byId(distributeHorizontally([C, A, B]));
    expect(result.a).toEqual({ x: 0, y: 0 });
    expect(result.b).toEqual({ x: 225, y: 80 });
    expect(result.c).toEqual({ x: 400, y: 40 });
  });

  it('leaves frames unchanged (aside from rounding) when there are fewer than three', () => {
    const result = byId(distributeHorizontally([A, B]));
    expect(result.a).toEqual({ x: 0, y: 0 });
    expect(result.b).toEqual({ x: 200, y: 80 });
  });

  it('distributes vertically, sorting and spacing on the y axis', () => {
    // sorted by y: A(0), C(40), B(80); span (0 to 230) minus total height
    // (220) over 2 gaps = 5 each.
    const result = byId(distributeVertically([A, B, C]));
    expect(result.a).toEqual({ x: 0, y: 0 });
    expect(result.c).toEqual({ x: 400, y: 55 });
    expect(result.b).toEqual({ x: 200, y: 80 });
  });
});

describe('tidyUp', () => {
  it('lays frames out in a single row in current x order with 200px gaps by default', () => {
    const result = byId(tidyUp([A, B, C]));
    expect(result.a).toEqual({ x: 0, y: 0 });
    expect(result.b).toEqual({ x: 300, y: 0 });
    expect(result.c).toEqual({ x: 550, y: 0 });
  });

  it('puts every frame on the row of whichever one is leftmost in x, regardless of array order', () => {
    const p: AlignableFrame = { id: 'p', x: 300, y: 10, width: 20, height: 5 };
    const q: AlignableFrame = { id: 'q', x: 0, y: 99, width: 30, height: 5 };
    const result = byId(tidyUp([p, q]));
    expect(result.q).toEqual({ x: 0, y: 99 });
    expect(result.p).toEqual({ x: 230, y: 99 });
  });

  it('accepts a custom gap', () => {
    const result = byId(tidyUp([A, B, C], 50));
    expect(result.a).toEqual({ x: 0, y: 0 });
    expect(result.b).toEqual({ x: 150, y: 0 });
    expect(result.c).toEqual({ x: 250, y: 0 });
  });
});
