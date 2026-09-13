import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { AlignableFrame } from '@/lib/canvas/align';
import {
  AlignmentFields,
  type AlignmentContext,
  type DiagramAlignmentContext,
  type FrameAlignmentContext,
  type LayoutAlignmentContext,
} from './alignment-fields';

const A: AlignableFrame = { id: 'a', x: 0, y: 0, width: 100, height: 50 };
const B: AlignableFrame = { id: 'b', x: 200, y: 80, width: 50, height: 150 };
const C: AlignableFrame = { id: 'c', x: 400, y: 40, width: 80, height: 20 };

// AlignmentFields' own Tooltip triggers require a TooltipProvider ancestor,
// the same as every other icon button in the inspector - inspector.tsx
// supplies one at the panel root in real use.
function renderFields(context: AlignmentContext) {
  return render(
    <TooltipProvider>
      <AlignmentFields context={context} />
    </TooltipProvider>,
  );
}

function frameContext(overrides: Partial<FrameAlignmentContext> = {}): FrameAlignmentContext {
  return { type: 'frames', frames: [A, B, C], onAlign: vi.fn(), ...overrides };
}

function layoutContext(overrides: Partial<LayoutAlignmentContext> = {}): LayoutAlignmentContext {
  return {
    type: 'layout',
    direction: 'row',
    align: 'stretch',
    justify: 'start',
    onChange: vi.fn(),
    distributeGapPx: 24,
    ...overrides,
  };
}

function diagramContext(overrides: Partial<DiagramAlignmentContext> = {}): DiagramAlignmentContext {
  return { type: 'diagram', count: 3, onAlign: vi.fn(), onDistribute: vi.fn(), ...overrides };
}

function positionsById(onAlign: ReturnType<typeof vi.fn>): Record<string, { x: number; y: number }> {
  const [positions] = onAlign.mock.calls.at(-1) as [{ id: string; x: number; y: number }[]];
  return Object.fromEntries(positions.map((p) => [p.id, { x: p.x, y: p.y }]));
}

describe('AlignmentFields - frame selection context', () => {
  it('renders every align, distribute and tidy up button', () => {
    renderFields(frameContext());
    for (const label of [
      'Align left',
      'Align horizontal centers',
      'Align right',
      'Align top',
      'Align vertical centers',
      'Align bottom',
      'Distribute horizontal spacing',
      'Distribute vertical spacing',
      'Tidy up',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('Align left moves every frame to the leftmost edge', () => {
    const context = frameContext();
    renderFields(context);
    fireEvent.click(screen.getByRole('button', { name: 'Align left' }));
    expect(positionsById(context.onAlign as ReturnType<typeof vi.fn>).a).toEqual({ x: 0, y: 0 });
    expect(positionsById(context.onAlign as ReturnType<typeof vi.fn>).b).toEqual({ x: 0, y: 80 });
  });

  it('Align horizontal centers centres every frame on the bounds midpoint', () => {
    const context = frameContext();
    renderFields(context);
    fireEvent.click(screen.getByRole('button', { name: 'Align horizontal centers' }));
    expect(positionsById(context.onAlign as ReturnType<typeof vi.fn>).a).toEqual({ x: 190, y: 0 });
  });

  it('Align right moves every frame to the rightmost edge', () => {
    const context = frameContext();
    renderFields(context);
    fireEvent.click(screen.getByRole('button', { name: 'Align right' }));
    expect(positionsById(context.onAlign as ReturnType<typeof vi.fn>).a).toEqual({ x: 380, y: 0 });
  });

  it('Align top moves every frame to the topmost edge', () => {
    const context = frameContext();
    renderFields(context);
    fireEvent.click(screen.getByRole('button', { name: 'Align top' }));
    expect(positionsById(context.onAlign as ReturnType<typeof vi.fn>).b).toEqual({ x: 200, y: 0 });
  });

  it('Align vertical centers aligns every frame on the bounds midpoint', () => {
    const context = frameContext();
    renderFields(context);
    fireEvent.click(screen.getByRole('button', { name: 'Align vertical centers' }));
    expect(positionsById(context.onAlign as ReturnType<typeof vi.fn>).a).toEqual({ x: 0, y: 90 });
  });

  it('Align bottom moves every frame to the bottommost edge', () => {
    const context = frameContext();
    renderFields(context);
    fireEvent.click(screen.getByRole('button', { name: 'Align bottom' }));
    expect(positionsById(context.onAlign as ReturnType<typeof vi.fn>).c).toEqual({ x: 400, y: 210 });
  });

  it('Distribute horizontal spacing spaces the gaps evenly on x', () => {
    const context = frameContext();
    renderFields(context);
    fireEvent.click(screen.getByRole('button', { name: 'Distribute horizontal spacing' }));
    expect(positionsById(context.onAlign as ReturnType<typeof vi.fn>).b).toEqual({ x: 225, y: 80 });
  });

  it('Distribute vertical spacing spaces the gaps evenly on y', () => {
    const context = frameContext();
    renderFields(context);
    fireEvent.click(screen.getByRole('button', { name: 'Distribute vertical spacing' }));
    expect(positionsById(context.onAlign as ReturnType<typeof vi.fn>).c).toEqual({ x: 400, y: 55 });
  });

  it('Tidy up lays every frame into a single row with 200px gaps in x order', () => {
    const context = frameContext();
    renderFields(context);
    fireEvent.click(screen.getByRole('button', { name: 'Tidy up' }));
    const positions = positionsById(context.onAlign as ReturnType<typeof vi.fn>);
    expect(positions.a).toEqual({ x: 0, y: 0 });
    expect(positions.b).toEqual({ x: 300, y: 0 });
    expect(positions.c).toEqual({ x: 550, y: 0 });
  });

  it('disables every align button and Tidy up with fewer than two frames', () => {
    renderFields(frameContext({ frames: [A] }));
    expect(screen.getByRole('button', { name: 'Align left' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Tidy up' })).toBeDisabled();
  });

  it('disables the distribute buttons with fewer than three frames', () => {
    renderFields(frameContext({ frames: [A, B] }));
    expect(screen.getByRole('button', { name: 'Distribute horizontal spacing' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Distribute vertical spacing' })).toBeDisabled();
    // Plain align still works with just two.
    expect(screen.getByRole('button', { name: 'Align left' })).not.toBeDisabled();
  });
});

describe('AlignmentFields - Auto layout context', () => {
  it('renders the six align buttons and only the on-axis distribute button, no Tidy up', () => {
    renderFields(layoutContext({ direction: 'row' }));
    expect(screen.queryByRole('button', { name: 'Tidy up' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Align left' })).toBeInTheDocument();
  });

  it('for a row container, the horizontal icons set justify and the vertical icons set align', () => {
    const context = layoutContext({ direction: 'row' });
    renderFields(context);

    fireEvent.click(screen.getByRole('button', { name: 'Align left' }));
    expect(context.onChange).toHaveBeenLastCalledWith({ justify: 'start' });
    fireEvent.click(screen.getByRole('button', { name: 'Align horizontal centers' }));
    expect(context.onChange).toHaveBeenLastCalledWith({ justify: 'center' });
    fireEvent.click(screen.getByRole('button', { name: 'Align right' }));
    expect(context.onChange).toHaveBeenLastCalledWith({ justify: 'end' });
    fireEvent.click(screen.getByRole('button', { name: 'Align top' }));
    expect(context.onChange).toHaveBeenLastCalledWith({ align: 'start' });
    fireEvent.click(screen.getByRole('button', { name: 'Align vertical centers' }));
    expect(context.onChange).toHaveBeenLastCalledWith({ align: 'center' });
    fireEvent.click(screen.getByRole('button', { name: 'Align bottom' }));
    expect(context.onChange).toHaveBeenLastCalledWith({ align: 'end' });
  });

  it('for a column container, the vertical icons set justify and the horizontal icons set align', () => {
    const context = layoutContext({ direction: 'column' });
    renderFields(context);

    fireEvent.click(screen.getByRole('button', { name: 'Align left' }));
    expect(context.onChange).toHaveBeenLastCalledWith({ align: 'start' });
    fireEvent.click(screen.getByRole('button', { name: 'Align right' }));
    expect(context.onChange).toHaveBeenLastCalledWith({ align: 'end' });
    fireEvent.click(screen.getByRole('button', { name: 'Align top' }));
    expect(context.onChange).toHaveBeenLastCalledWith({ justify: 'start' });
    fireEvent.click(screen.getByRole('button', { name: 'Align bottom' }));
    expect(context.onChange).toHaveBeenLastCalledWith({ justify: 'end' });
  });

  it('Distribute horizontally is enabled and sets gapPx for a row container', () => {
    const context = layoutContext({ direction: 'row', distributeGapPx: 24 });
    renderFields(context);

    const horizontal = screen.getByRole('button', { name: 'Distribute horizontal spacing' });
    const vertical = screen.getByRole('button', { name: 'Distribute vertical spacing' });
    expect(horizontal).not.toBeDisabled();
    expect(vertical).toBeDisabled();

    fireEvent.click(horizontal);
    expect(context.onChange).toHaveBeenLastCalledWith({ gapPx: 24 });
  });

  it('Distribute vertically is enabled and sets gapPx for a column container', () => {
    const context = layoutContext({ direction: 'column', distributeGapPx: 16 });
    renderFields(context);

    const horizontal = screen.getByRole('button', { name: 'Distribute horizontal spacing' });
    const vertical = screen.getByRole('button', { name: 'Distribute vertical spacing' });
    expect(horizontal).toBeDisabled();
    expect(vertical).not.toBeDisabled();

    fireEvent.click(vertical);
    expect(context.onChange).toHaveBeenLastCalledWith({ gapPx: 16 });
  });

  it('disables the on-axis distribute button when distributeGapPx is null (fewer than two children)', () => {
    renderFields(layoutContext({ direction: 'row', distributeGapPx: null }));
    expect(screen.getByRole('button', { name: 'Distribute horizontal spacing' })).toBeDisabled();
  });

  // Review fix wave item 7: only this context has a persisted align/justify
  // to reflect - frames and diagram selections are one-shot actions with
  // nothing to toggle (covered below, in their own describe blocks).
  describe('aria-pressed reflects the container\'s current align/justify (review fix wave item 7)', () => {
    it('marks the buttons matching the current justify (main axis) and align (cross axis) for a row', () => {
      renderFields(layoutContext({ direction: 'row', align: 'center', justify: 'end' }));

      // Main axis (x, justify='end'): only Align right matches.
      expect(screen.getByRole('button', { name: 'Align left' })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('button', { name: 'Align horizontal centers' })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('button', { name: 'Align right' })).toHaveAttribute('aria-pressed', 'true');
      // Cross axis (y, align='center'): only Align vertical centers matches.
      expect(screen.getByRole('button', { name: 'Align top' })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('button', { name: 'Align vertical centers' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Align bottom' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('flips main/cross axis for a column, the same way handleAlign itself does', () => {
      renderFields(layoutContext({ direction: 'column', align: 'end', justify: 'center' }));

      // Cross axis for a column is x (align='end'): only Align right matches.
      expect(screen.getByRole('button', { name: 'Align left' })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('button', { name: 'Align right' })).toHaveAttribute('aria-pressed', 'true');
      // Main axis for a column is y (justify='center'): only Align vertical centers matches.
      expect(screen.getByRole('button', { name: 'Align top' })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('button', { name: 'Align vertical centers' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('never pressed for a one-shot frames context', () => {
      renderFields(frameContext());
      expect(screen.getByRole('button', { name: 'Align left' })).not.toHaveAttribute('aria-pressed');
    });

    it('never pressed for a one-shot diagram context', () => {
      renderFields(diagramContext());
      expect(screen.getByRole('button', { name: 'Align left' })).not.toHaveAttribute('aria-pressed');
    });
  });

  // Review fix wave item 7: Stretch (align: 'stretch', the cross axis) and
  // Space between (justify: 'between', the main axis) fill out the two
  // flexbox values the row previously had no button for at all.
  describe('Stretch and Space between (review fix wave item 7)', () => {
    it('Stretch sets align to stretch and reflects it in aria-pressed', () => {
      const context = layoutContext({ align: 'start' });
      renderFields(context);
      const stretch = screen.getByRole('button', { name: 'Stretch' });
      expect(stretch).toHaveAttribute('aria-pressed', 'false');

      fireEvent.click(stretch);
      expect(context.onChange).toHaveBeenLastCalledWith({ align: 'stretch' });
    });

    it('Stretch reads pressed when the container is already stretched', () => {
      renderFields(layoutContext({ align: 'stretch' }));
      expect(screen.getByRole('button', { name: 'Stretch' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('Space between sets justify to between and reflects it in aria-pressed', () => {
      const context = layoutContext({ justify: 'start' });
      renderFields(context);
      const spaceBetween = screen.getByRole('button', { name: 'Space between' });
      expect(spaceBetween).toHaveAttribute('aria-pressed', 'false');

      fireEvent.click(spaceBetween);
      expect(context.onChange).toHaveBeenLastCalledWith({ justify: 'between' });
    });

    it('Space between reads pressed when the container already justifies with space-between', () => {
      renderFields(layoutContext({ justify: 'between' }));
      expect(screen.getByRole('button', { name: 'Space between' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('renders for both row and column containers', () => {
      const { unmount } = renderFields(layoutContext({ direction: 'row' }));
      expect(screen.getByRole('button', { name: 'Stretch' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Space between' })).toBeInTheDocument();
      unmount();

      renderFields(layoutContext({ direction: 'column' }));
      expect(screen.getByRole('button', { name: 'Stretch' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Space between' })).toBeInTheDocument();
    });
  });
});

describe('AlignmentFields - diagram selection context', () => {
  it('calls onAlign with the mode for each align button, using a fake dispatch', () => {
    const onAlign = vi.fn();
    const context = diagramContext({ onAlign });
    render(
      <TooltipProvider>
        <AlignmentFields context={context} />
      </TooltipProvider>,
    );

    const cases: [string, string][] = [
      ['Align left', 'left'],
      ['Align horizontal centers', 'centerX'],
      ['Align right', 'right'],
      ['Align top', 'top'],
      ['Align vertical centers', 'centerY'],
      ['Align bottom', 'bottom'],
    ];
    for (const [label, mode] of cases) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(onAlign).toHaveBeenLastCalledWith(mode);
    }
  });

  it('calls onDistribute with the axis for each distribute button', () => {
    const onDistribute = vi.fn();
    renderFields(diagramContext({ onDistribute }));

    fireEvent.click(screen.getByRole('button', { name: 'Distribute horizontal spacing' }));
    expect(onDistribute).toHaveBeenLastCalledWith('horizontal');
    fireEvent.click(screen.getByRole('button', { name: 'Distribute vertical spacing' }));
    expect(onDistribute).toHaveBeenLastCalledWith('vertical');
  });

  it('renders no Tidy up button', () => {
    renderFields(diagramContext());
    expect(screen.queryByRole('button', { name: 'Tidy up' })).toBeNull();
  });

  it('disables every align button with fewer than two shapes selected', () => {
    renderFields(diagramContext({ count: 1 }));
    expect(screen.getByRole('button', { name: 'Align left' })).toBeDisabled();
  });

  it('disables the distribute buttons with fewer than three shapes selected', () => {
    renderFields(diagramContext({ count: 2 }));
    expect(screen.getByRole('button', { name: 'Distribute horizontal spacing' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Distribute vertical spacing' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Align left' })).not.toBeDisabled();
  });

  it('enables align and distribute with three or more shapes selected', () => {
    renderFields(diagramContext({ count: 3 }));
    expect(screen.getByRole('button', { name: 'Align left' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Distribute horizontal spacing' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Distribute vertical spacing' })).not.toBeDisabled();
  });
});
