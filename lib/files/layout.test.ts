import { describe, expect, it } from 'vitest';
import { FRAME_GAP, layoutMissingPositions } from './layout';
import type { Screen } from './validate';

function screen(overrides: Partial<Screen> = {}): Screen {
  return { id: '1234567890', name: 'Frame 1', layout: '{}', stageWidth: 1440, ...overrides };
}

describe('layoutMissingPositions', () => {
  it('places a single screen with no position at the origin', () => {
    const [result] = layoutMissingPositions([screen()]);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it('leaves a screen that already has both x and y untouched', () => {
    const [result] = layoutMissingPositions([screen({ x: 500, y: 300 })]);
    expect(result.x).toBe(500);
    expect(result.y).toBe(300);
  });

  it('lays out several screens with no positions left to right with a 200px gap, measured from the previous frame\'s right edge', () => {
    const screens = [
      screen({ id: 'aaaaaaaaaa', stageWidth: 1440 }),
      screen({ id: 'bbbbbbbbbb', stageWidth: 375 }),
      screen({ id: 'cccccccccc', stageWidth: 768 }),
    ];

    const result = layoutMissingPositions(screens);

    expect(result[0]).toMatchObject({ x: 0, y: 0 });
    expect(result[1]).toMatchObject({ x: 1440 + FRAME_GAP, y: 0 });
    expect(result[2]).toMatchObject({ x: 1440 + FRAME_GAP + 375 + FRAME_GAP, y: 0 });
  });

  it('chains off an existing position rather than the origin, when an earlier screen already has one', () => {
    const screens = [
      screen({ id: 'aaaaaaaaaa', x: 500, y: 300, stageWidth: 1000 }),
      screen({ id: 'bbbbbbbbbb' }),
    ];

    const result = layoutMissingPositions(screens);

    expect(result[1]).toMatchObject({ x: 500 + 1000 + FRAME_GAP, y: 300 });
  });

  it('only fills in screens that are missing a position, leaving the rest exactly as given', () => {
    const screens = [
      screen({ id: 'aaaaaaaaaa', x: 10, y: 20 }),
      screen({ id: 'bbbbbbbbbb' }),
      screen({ id: 'cccccccccc', x: 900, y: 900 }),
    ];

    const result = layoutMissingPositions(screens);

    expect(result[0]).toMatchObject({ x: 10, y: 20 });
    expect(result[2]).toMatchObject({ x: 900, y: 900 });
  });

  it('treats a screen with only one of x/y set as needing layout (both or neither is the invariant)', () => {
    const screens = [screen({ id: 'aaaaaaaaaa', x: 500, y: null, stageWidth: 1000 })];
    const result = layoutMissingPositions(screens);
    expect(result[0].x).toBe(0);
    expect(result[0].y).toBe(0);
  });

  it('places an unpositioned screen to the right of the rightmost positioned frame, even when that frame is not adjacent to it in the array', () => {
    const screens = [
      screen({ id: 'aaaaaaaaaa', x: 0, y: 0, stageWidth: 1440 }),
      screen({ id: 'bbbbbbbbbb' }), // no position - chaining off the previous element alone would land this on 'cccccccccc' below
      screen({ id: 'cccccccccc', x: 1000, y: 50, stageWidth: 2000 }), // the true rightmost frame, right edge 3000
    ];

    const result = layoutMissingPositions(screens);

    // 3000 (cccccccccc's right edge) + 200 - not 1440 (aaaaaaaaaa's right
    // edge, the previous array element) + 200, which is where the old
    // "chain off the previous element only" bug would have placed it,
    // landing it exactly on top of cccccccccc.
    expect(result[1]).toMatchObject({ x: 3000 + 200, y: 0 });
  });

  it('does not mutate the input array or its screens', () => {
    const input = [screen()];
    const frozen = Object.freeze([...input]);
    expect(() => layoutMissingPositions(frozen)).not.toThrow();
  });

  it('returns an empty array for an empty input', () => {
    expect(layoutMissingPositions([])).toEqual([]);
  });

  describe('pages', () => {
    it('positions each page\'s unpositioned screens independently, not chained off another page\'s frames', () => {
      const screens = [
        screen({ id: 'aaaaaaaaaa', pageId: 'page000001', x: 0, y: 0, stageWidth: 1440 }),
        // Page 2's screen has no position: it must land near the origin of
        // its OWN page, not to the right of page 1's already-positioned
        // frame - the two pages are separate infinite canvases, never
        // rendered together, so their coordinate spaces are independent.
        screen({ id: 'bbbbbbbbbb', pageId: 'page000002' }),
      ];

      const result = layoutMissingPositions(screens);

      expect(result.find((s) => s.id === 'bbbbbbbbbb')).toMatchObject({ x: 0, y: 0 });
    });

    it('chains several unpositioned screens on the same page left to right, independently per page', () => {
      const screens = [
        screen({ id: 'aaaaaaaaaa', pageId: 'page000001', stageWidth: 1000 }),
        screen({ id: 'bbbbbbbbbb', pageId: 'page000001', stageWidth: 500 }),
        screen({ id: 'cccccccccc', pageId: 'page000002', stageWidth: 2000 }),
      ];

      const result = layoutMissingPositions(screens);

      expect(result.find((s) => s.id === 'aaaaaaaaaa')).toMatchObject({ x: 0, y: 0 });
      expect(result.find((s) => s.id === 'bbbbbbbbbb')).toMatchObject({ x: 1000 + FRAME_GAP, y: 0 });
      // Page 2's own first (and only) screen starts fresh at its own
      // origin, unaffected by page 1 having two screens spanning further.
      expect(result.find((s) => s.id === 'cccccccccc')).toMatchObject({ x: 0, y: 0 });
    });

    it('chains off the rightmost ALREADY-positioned frame on the same page only', () => {
      const screens = [
        screen({ id: 'aaaaaaaaaa', pageId: 'page000001', x: 5000, y: 0, stageWidth: 200 }),
        // Same page as aaaaaaaaaa: must chain off its right edge (5200).
        screen({ id: 'bbbbbbbbbb', pageId: 'page000001' }),
        // A different page, positioned far to the right: must have zero
        // effect on page000001's own layout above.
        screen({ id: 'cccccccccc', pageId: 'page000002', x: 9000, y: 0, stageWidth: 200 }),
        screen({ id: 'dddddddddd', pageId: 'page000002' }),
      ];

      const result = layoutMissingPositions(screens);

      expect(result.find((s) => s.id === 'bbbbbbbbbb')).toMatchObject({ x: 5200 + FRAME_GAP, y: 0 });
      expect(result.find((s) => s.id === 'dddddddddd')).toMatchObject({ x: 9200 + FRAME_GAP, y: 0 });
    });

    it('treats a missing pageId as its own group, same as any other shared pageId value', () => {
      const screens = [screen({ id: 'aaaaaaaaaa' }), screen({ id: 'bbbbbbbbbb' })];
      const result = layoutMissingPositions(screens);
      expect(result[0]).toMatchObject({ x: 0, y: 0 });
      expect(result[1]).toMatchObject({ x: 1440 + FRAME_GAP, y: 0 });
    });
  });
});
