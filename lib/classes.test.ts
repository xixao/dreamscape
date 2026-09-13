import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  ALIGN_CLASSES,
  CLASS_TABLES,
  COLUMN_OPTIONS,
  GAP_PX_CLASSES,
  JUSTIFY_CLASSES,
  LAYOUT_BOX_DEFAULTS,
  PADDING_PX_CLASSES,
  ROOT_LAYOUT_PROPS,
  SPACING_OPTIONS,
  type LayoutBoxProps,
  blockClasses,
  distributeGapPx,
  distributeGapPxFromMeasurements,
  layoutBoxClasses,
  normalizeSpacing,
  snapToSpacing,
} from './classes';

/** A LayoutBoxProps value with no gapPx/paddingPx of its own, simulating a layout saved before the 8 px scale. */
function withLegacySpacing(gap: number, padding: number): LayoutBoxProps {
  const props: Partial<LayoutBoxProps> = { ...LAYOUT_BOX_DEFAULTS };
  delete props.gapPx;
  delete props.paddingPx;
  return { ...props, gap, padding } as LayoutBoxProps;
}

describe('layoutBoxClasses', () => {
  it('renders the default box as a column on mobile and a row on desktop, with the 8 px spacing default', () => {
    expect(layoutBoxClasses(LAYOUT_BOX_DEFAULTS, 'mobile')).toBe(
      'min-w-0 flex flex-col justify-start items-stretch gap-2 p-2',
    );
    expect(layoutBoxClasses(LAYOUT_BOX_DEFAULTS, 'desktop')).toBe(
      'min-w-0 flex flex-row justify-start items-stretch gap-2 p-2',
    );
  });

  it('renders grid mode with the resolved column count', () => {
    const grid = { ...LAYOUT_BOX_DEFAULTS, mode: 'grid' as const };
    expect(layoutBoxClasses(grid, 'mobile')).toBe('min-w-0 grid grid-cols-1 items-stretch gap-2 p-2');
    expect(layoutBoxClasses(grid, 'desktop')).toBe('min-w-0 grid grid-cols-3 items-stretch gap-2 p-2');
    for (const columns of COLUMN_OPTIONS) {
      const out = layoutBoxClasses({ ...grid, columns: { mobile: columns } }, 'mobile');
      expect(out).toContain(`grid-cols-${columns}`);
    }
  });

  it('applies align, justify, gap, padding and background', () => {
    const props = {
      ...LAYOUT_BOX_DEFAULTS,
      align: { mobile: 'center' as const, desktop: 'end' as const },
      justify: { mobile: 'between' as const, desktop: 'center' as const },
      gapPx: 64 as const,
      paddingPx: 0 as const,
      background: 'card' as const,
    };
    expect(layoutBoxClasses(props, 'mobile')).toBe(
      'min-w-0 flex flex-col justify-between items-center gap-16 p-0 bg-card border rounded-lg',
    );
    expect(layoutBoxClasses(props, 'desktop')).toBe(
      'min-w-0 flex flex-row justify-center items-end gap-16 p-0 bg-card border rounded-lg',
    );
    expect(layoutBoxClasses({ ...props, background: 'muted' }, 'mobile')).toContain('bg-muted rounded-lg');
  });

  it('resolves align start and justify end', () => {
    const props = {
      ...LAYOUT_BOX_DEFAULTS,
      align: { mobile: 'start' as const },
      justify: { mobile: 'end' as const },
    };
    const out = layoutBoxClasses(props, 'mobile');
    expect(out).toContain(ALIGN_CLASSES.start);
    expect(out).toContain(JUSTIFY_CLASSES.end);
    expect(out).toBe('min-w-0 flex flex-col justify-end items-start gap-2 p-2');
  });

  it('uses the 8 px default for gap and padding on a brand-new box', () => {
    expect(LAYOUT_BOX_DEFAULTS.gapPx).toBe(8);
    expect(LAYOUT_BOX_DEFAULTS.paddingPx).toBe(8);
    const classes = layoutBoxClasses(LAYOUT_BOX_DEFAULTS, 'mobile');
    expect(classes).toContain('gap-2');
    expect(classes).toContain('p-2');
  });

  it('keeps the root as a column at both breakpoints with the default 8 px spacing', () => {
    expect(layoutBoxClasses(ROOT_LAYOUT_PROPS, 'mobile')).toBe(
      'min-w-0 flex flex-col justify-start items-stretch gap-2 p-2',
    );
    expect(layoutBoxClasses(ROOT_LAYOUT_PROPS, 'desktop')).toBe(
      'min-w-0 flex flex-col justify-start items-stretch gap-2 p-2',
    );
  });

  it('renders the converted classes for a legacy props object with no gapPx/paddingPx', () => {
    const legacy = withLegacySpacing(4, 6);
    expect(layoutBoxClasses(legacy, 'mobile')).toBe(
      'min-w-0 flex flex-col justify-start items-stretch gap-4 p-6',
    );
  });

  it('renders legacy props that need rounding, ties rounding up', () => {
    const legacy = withLegacySpacing(3, 1);
    expect(layoutBoxClasses(legacy, 'desktop')).toBe(
      'min-w-0 flex flex-row justify-start items-stretch gap-4 p-2',
    );
  });

  it('prefers gapPx/paddingPx over legacy gap/padding when both are present', () => {
    const props = { ...LAYOUT_BOX_DEFAULTS, gapPx: 32 as const, paddingPx: 0 as const, gap: 1, padding: 1 };
    expect(layoutBoxClasses(props, 'mobile')).toBe(
      'min-w-0 flex flex-col justify-start items-stretch gap-8 p-0',
    );
  });
});

describe('blockClasses', () => {
  it('adds flex-1 min-w-0 only when grow is on', () => {
    expect(blockClasses({ grow: true })).toBe('flex-1 min-w-0');
    expect(blockClasses({ grow: false })).toBe('');
    expect(blockClasses({})).toBe('');
  });
});

describe('snapToSpacing', () => {
  it('snaps a Tailwind-unit-derived pixel value to the nearest 8 px step, ties rounding up', () => {
    expect(snapToSpacing(0 * 4)).toBe(0);
    expect(snapToSpacing(1 * 4)).toBe(8);
    expect(snapToSpacing(2 * 4)).toBe(8);
    expect(snapToSpacing(3 * 4)).toBe(16);
    expect(snapToSpacing(4 * 4)).toBe(16);
    expect(snapToSpacing(6 * 4)).toBe(24);
    expect(snapToSpacing(8 * 4)).toBe(32);
  });

  it('snaps an already-on-scale value to itself', () => {
    for (const step of SPACING_OPTIONS) {
      expect(snapToSpacing(step)).toBe(step);
    }
  });

  it('clamps to the 0..64 range', () => {
    expect(snapToSpacing(-100)).toBe(0);
    expect(snapToSpacing(1000)).toBe(64);
  });
});

describe('normalizeSpacing', () => {
  it('treats gapPx/paddingPx as authoritative when present', () => {
    expect(normalizeSpacing({ gapPx: 32, paddingPx: 0, gap: 1, padding: 1 })).toEqual({
      gapPx: 32,
      paddingPx: 0,
    });
  });

  it('converts legacy gap/padding Tailwind units with snapToSpacing when gapPx/paddingPx are absent', () => {
    expect(normalizeSpacing({ gap: 4, padding: 6 })).toEqual({ gapPx: 16, paddingPx: 24 });
    expect(normalizeSpacing({ gap: 3, padding: 0 })).toEqual({ gapPx: 16, paddingPx: 0 });
    expect(normalizeSpacing({ gap: 1 })).toEqual({ gapPx: 8, paddingPx: 8 });
  });

  it('falls back to the 8 px default when neither gapPx/paddingPx nor legacy gap/padding are present', () => {
    expect(normalizeSpacing({})).toEqual({ gapPx: 8, paddingPx: 8 });
  });
});

describe('GAP_PX_CLASSES and PADDING_PX_CLASSES', () => {
  it('map every 8 px step to its literal Tailwind class', () => {
    expect(GAP_PX_CLASSES).toEqual({
      0: 'gap-0',
      8: 'gap-2',
      16: 'gap-4',
      24: 'gap-6',
      32: 'gap-8',
      40: 'gap-10',
      48: 'gap-12',
      56: 'gap-14',
      64: 'gap-16',
    });
    expect(PADDING_PX_CLASSES).toEqual({
      0: 'p-0',
      8: 'p-2',
      16: 'p-4',
      24: 'p-6',
      32: 'p-8',
      40: 'p-10',
      48: 'p-12',
      56: 'p-14',
      64: 'p-16',
    });
  });

  it('has an entry for every SPACING_OPTIONS step', () => {
    expect(SPACING_OPTIONS).toEqual([0, 8, 16, 24, 32, 40, 48, 56, 64]);
    for (const step of SPACING_OPTIONS) {
      expect(typeof GAP_PX_CLASSES[step]).toBe('string');
      expect(typeof PADDING_PX_CLASSES[step]).toBe('string');
    }
  });
});

describe('distributeGapPx', () => {
  it('computes the gap that spreads children evenly across the remaining space, snapped to the 8 px scale', () => {
    // 100 - (20+20+20) = 40 available over 2 gaps = 20 each -> snaps to 24.
    expect(distributeGapPx(100, [20, 20, 20])).toBe(24);
  });

  it('returns an already-on-scale gap unchanged', () => {
    // 100 - (30+30) = 40 available over 1 gap = 40, already on the scale.
    expect(distributeGapPx(100, [30, 30])).toBe(40);
  });

  it('floors at 0 when the children already fill or overflow the container', () => {
    expect(distributeGapPx(50, [30, 30])).toBe(0);
  });

  it('clamps to the 64 px maximum', () => {
    expect(distributeGapPx(1000, [10, 10])).toBe(64);
  });

  it('returns null with fewer than two children - nothing to distribute', () => {
    expect(distributeGapPx(100, [50])).toBeNull();
    expect(distributeGapPx(100, [])).toBeNull();
  });
});

// Review fix wave re-review R5: measureDistributeGapPx (inspector.tsx) reads
// a container's real getBoundingClientRect, the BORDER box (padding
// included) - jsdom has no real layout engine to exercise that DOM read
// itself, so this pins the pure math it feeds into instead.
describe('distributeGapPxFromMeasurements', () => {
  function child(size: number, growing = false) {
    return { size, growing };
  }

  it('subtracts the container\'s own padding before distributing, matching the un-padded case', () => {
    // 116 border-box - 8 - 8 padding = 100 content-box, same as
    // distributeGapPx(100, [20,20,20])'s own 24 above.
    const result = distributeGapPxFromMeasurements(116, 8, 8, [child(20), child(20), child(20)]);
    expect(result).toBe(24);
  });

  it('sums asymmetric start/end padding', () => {
    const result = distributeGapPxFromMeasurements(116, 4, 12, [child(20), child(20), child(20)]);
    expect(result).toBe(24);
  });

  it('treats a growing child as 0 width, but still counts it toward the gap count', () => {
    // sizes become [20, 0, 20] - available 100-40=60 over (3-1)=2 gaps = 30,
    // snapped to the nearer of 24/32 -> 32. Not measuring the growing
    // child's own rect at all (its real width, whatever it may be, would
    // just be a result of this very calculation).
    const result = distributeGapPxFromMeasurements(100, 0, 0, [child(20), child(999, true), child(20)]);
    expect(result).toBe(32);
  });

  it('floors at 0 when padding and children already fill or overflow the container', () => {
    const result = distributeGapPxFromMeasurements(50, 10, 10, [child(30), child(30)]);
    expect(result).toBe(0);
  });

  it('clamps to the 64px maximum when every child is growing (0 occupied size)', () => {
    const result = distributeGapPxFromMeasurements(100, 0, 0, [child(500, true), child(500, true)]);
    expect(result).toBe(64);
  });
});

describe('class tables', () => {
  it('contain only literal strings, so Tailwind can see every class', () => {
    for (const table of Object.values(CLASS_TABLES)) {
      for (const value of Object.values(table)) {
        expect(typeof value).toBe('string');
      }
    }
    const testDir = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(testDir, 'classes.ts'), 'utf8');
    expect(source).not.toMatch(/\$\{/);
  });
});
