import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { LayoutGrid } from '@/lib/files/repository';
import { DEFAULT_LAYOUT_GRID, LayoutGridOverlay, resolveLayoutGrid } from './layout-grid';

function grid(overrides: Partial<LayoutGrid> = {}): LayoutGrid {
  return { columns: 12, gutter: 24, margin: 32, visible: true, ...overrides };
}

describe('resolveLayoutGrid', () => {
  it('returns the default (12/24/32/false) when the screen has none', () => {
    expect(resolveLayoutGrid(undefined)).toEqual(DEFAULT_LAYOUT_GRID);
    expect(DEFAULT_LAYOUT_GRID).toEqual({ columns: 12, gutter: 24, margin: 32, visible: false });
  });

  it('returns the screen\'s own grid unchanged when it has one', () => {
    const own = grid({ columns: 6 });
    expect(resolveLayoutGrid(own)).toEqual(own);
  });
});

describe('LayoutGridOverlay', () => {
  it('renders nothing when the grid is not visible', () => {
    render(<LayoutGridOverlay grid={grid({ visible: false })} />);
    expect(screen.queryByTestId('layout-grid')).toBeNull();
  });

  it('renders one column div per grid.columns when visible', () => {
    render(<LayoutGridOverlay grid={grid({ columns: 6, visible: true })} />);
    const overlay = screen.getByTestId('layout-grid');
    expect(overlay.children).toHaveLength(6);
  });

  it('is fixed, pointer-events-none and inert to layout (aria-hidden)', () => {
    render(<LayoutGridOverlay grid={grid()} />);
    const overlay = screen.getByTestId('layout-grid');
    expect(overlay).toHaveClass('fixed');
    expect(overlay).toHaveClass('pointer-events-none');
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
  });

  it('applies margin as padding and gutter as the gap between columns', () => {
    render(<LayoutGridOverlay grid={grid({ margin: 40, gutter: 16 })} />);
    const overlay = screen.getByTestId('layout-grid');
    expect(overlay).toHaveStyle({ paddingLeft: '40px', paddingRight: '40px', gap: '16px' });
  });

  it('tints each column with the accent colour at 10% opacity', () => {
    render(<LayoutGridOverlay grid={grid({ columns: 1 })} />);
    const column = screen.getByTestId('layout-grid').children[0];
    expect(column).toHaveClass('bg-acc/10');
  });
});
