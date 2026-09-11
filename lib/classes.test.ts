import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  BACKGROUND_CLASSES,
  CLASS_TABLES,
  COLUMN_OPTIONS,
  GAP_CLASSES,
  GAP_OPTIONS,
  LAYOUT_BOX_DEFAULTS,
  PADDING_CLASSES,
  PADDING_OPTIONS,
  ROOT_LAYOUT_PROPS,
  blockClasses,
  layoutBoxClasses,
} from './classes';

describe('layoutBoxClasses', () => {
  it('renders the default box as a column on mobile and a row on desktop', () => {
    expect(layoutBoxClasses(LAYOUT_BOX_DEFAULTS, 'mobile')).toBe(
      'w-full min-w-0 flex flex-col justify-start items-stretch gap-4 p-4',
    );
    expect(layoutBoxClasses(LAYOUT_BOX_DEFAULTS, 'desktop')).toBe(
      'w-full min-w-0 flex flex-row justify-start items-stretch gap-4 p-4',
    );
  });

  it('renders grid mode with the resolved column count', () => {
    const grid = { ...LAYOUT_BOX_DEFAULTS, mode: 'grid' as const };
    expect(layoutBoxClasses(grid, 'mobile')).toBe(
      'w-full min-w-0 grid grid-cols-1 items-stretch gap-4 p-4',
    );
    expect(layoutBoxClasses(grid, 'desktop')).toBe(
      'w-full min-w-0 grid grid-cols-3 items-stretch gap-4 p-4',
    );
    for (const columns of COLUMN_OPTIONS) {
      const out = layoutBoxClasses(
        { ...grid, columns: { mobile: columns } },
        'mobile',
      );
      expect(out).toContain(`grid-cols-${columns}`);
    }
  });

  it('applies align, justify, gap, padding and background', () => {
    const props = {
      ...LAYOUT_BOX_DEFAULTS,
      align: { mobile: 'center' as const, desktop: 'end' as const },
      justify: { mobile: 'between' as const, desktop: 'center' as const },
      gap: 8 as const,
      padding: 0 as const,
      background: 'card' as const,
    };
    expect(layoutBoxClasses(props, 'mobile')).toBe(
      'w-full min-w-0 flex flex-col justify-between items-center gap-8 p-0 bg-card border rounded-lg',
    );
    expect(layoutBoxClasses(props, 'desktop')).toBe(
      'w-full min-w-0 flex flex-row justify-center items-end gap-8 p-0 bg-card border rounded-lg',
    );
    expect(layoutBoxClasses({ ...props, background: 'muted' }, 'mobile')).toContain(
      'bg-muted rounded-lg',
    );
  });

  it('has a class for every gap and padding option', () => {
    for (const gap of GAP_OPTIONS) expect(GAP_CLASSES[gap]).toBe(`gap-${gap}`);
    for (const padding of PADDING_OPTIONS) expect(PADDING_CLASSES[padding]).toBe(`p-${padding}`);
    expect(BACKGROUND_CLASSES.none).toBe('');
  });

  it('keeps the root as a column at both breakpoints with padding 6', () => {
    expect(layoutBoxClasses(ROOT_LAYOUT_PROPS, 'desktop')).toBe(
      'w-full min-w-0 flex flex-col justify-start items-stretch gap-4 p-6',
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
