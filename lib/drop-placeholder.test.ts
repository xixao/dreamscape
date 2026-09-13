import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FALLBACK_HEIGHT,
  TRANSITION_MS,
  flipDeltas,
  insertionIndex,
  placeholderSize,
  reducedMotion,
} from './drop-placeholder';

describe('insertionIndex', () => {
  it('is the placement index unchanged for "before"', () => {
    expect(insertionIndex({ index: 2, where: 'before' })).toBe(2);
  });

  it('is the placement index plus one for "after"', () => {
    expect(insertionIndex({ index: 2, where: 'after' })).toBe(3);
  });

  it('is 0 for an empty container (Craft reports index 0, where "before")', () => {
    expect(insertionIndex({ index: 0, where: 'before' })).toBe(0);
  });

  it('is the child count for "after" the last child (append at the end of the list)', () => {
    // Three children (indices 0-2); hovering past the last one reports
    // index 2, where "after" - the real Craft.js Positioner behavior this
    // mirrors (see lib/craft-positioner.ts's own header comment).
    expect(insertionIndex({ index: 2, where: 'after' })).toBe(3);
  });
});

describe('placeholderSize', () => {
  const hint = { width: 120, height: 36 };

  describe('kind "existing" (a moved layer, sized exactly like its own measured box)', () => {
    it('uses the exact measured width and height in a row container', () => {
      expect(placeholderSize('existing', hint, 'row')).toEqual({ width: 120, height: 36 });
    });

    it('uses the exact measured width and height in a column container', () => {
      expect(placeholderSize('existing', hint, 'column')).toEqual({ width: 120, height: 36 });
    });

    it('takes one cell (no explicit size) in a grid container', () => {
      expect(placeholderSize('existing', hint, 'grid')).toEqual({ width: null, height: null });
    });
  });

  describe('kind "new" (a tray component, sized from its previewSize hint)', () => {
    it('row: width is the hint, height stretches (null)', () => {
      expect(placeholderSize('new', hint, 'row')).toEqual({ width: 120, height: null });
    });

    it('column: height is the hint, width stretches (null)', () => {
      expect(placeholderSize('new', hint, 'column')).toEqual({ width: null, height: 36 });
    });

    it('grid: takes one cell (no explicit size) regardless of the hint', () => {
      expect(placeholderSize('new', hint, 'grid')).toEqual({ width: null, height: null });
    });

    it('row without a hint falls back to 40px tall and full width', () => {
      expect(placeholderSize('new', null, 'row')).toEqual({ width: null, height: FALLBACK_HEIGHT });
    });

    it('column without a hint falls back to 40px tall and full width', () => {
      expect(placeholderSize('new', null, 'column')).toEqual({ width: null, height: FALLBACK_HEIGHT });
    });

    it('grid without a hint still takes one cell', () => {
      expect(placeholderSize('new', null, 'grid')).toEqual({ width: null, height: null });
    });
  });

  it('FALLBACK_HEIGHT is 40', () => {
    expect(FALLBACK_HEIGHT).toBe(40);
  });
});

describe('flipDeltas', () => {
  it('returns the inverse (before minus after) translate delta for an element present in both snapshots', () => {
    const before = { a: { top: 100, left: 0 } };
    const after = { a: { top: 150, left: 0 } };
    expect(flipDeltas(before, after)).toEqual({ a: { dx: 0, dy: -50 } });
  });

  it('computes independent deltas per element, on both axes', () => {
    const before = { a: { top: 0, left: 0 }, b: { top: 40, left: 40 } };
    const after = { a: { top: 0, left: 60 }, b: { top: 40, left: 0 } };
    expect(flipDeltas(before, after)).toEqual({
      a: { dx: -60, dy: 0 },
      b: { dx: 40, dy: 0 },
    });
  });

  it('omits an element that has no "before" snapshot (it is new, not moved)', () => {
    const before = { a: { top: 0, left: 0 } };
    const after = { a: { top: 0, left: 0 }, placeholder: { top: 0, left: 0 } };
    expect(flipDeltas(before, after)).toEqual({ a: { dx: 0, dy: 0 } });
  });

  it('omits an element that no longer exists after (it left the container)', () => {
    const before = { a: { top: 0, left: 0 }, gone: { top: 10, left: 10 } };
    const after = { a: { top: 0, left: 0 } };
    expect(flipDeltas(before, after)).toEqual({ a: { dx: 0, dy: 0 } });
  });

  it('returns an empty object for two empty snapshots', () => {
    expect(flipDeltas({}, {})).toEqual({});
  });
});

describe('TRANSITION_MS', () => {
  it('is 150', () => {
    expect(TRANSITION_MS).toBe(150);
  });
});

describe('reducedMotion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is true when the browser reports prefers-reduced-motion: reduce', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    expect(reducedMotion()).toBe(true);
  });

  it('is false when the browser does not report reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(reducedMotion()).toBe(false);
  });

  it('is false when matchMedia is unavailable rather than throwing', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(() => reducedMotion()).not.toThrow();
    expect(reducedMotion()).toBe(false);
  });
});
