import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { SnapGuide } from '@/lib/canvas/snap';
import { SnapGuides } from './snap-guides';

describe('SnapGuides', () => {
  it('renders nothing when there are no guides and no distances', () => {
    const { container } = render(<SnapGuides guides={[]} distances={[]} movingFrame={null} />);
    expect(container.querySelectorAll('[data-testid="snap-guide-line"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-testid="snap-chip"]')).toHaveLength(0);
  });

  it('draws a vertical line for a vertical grid/edge guide spanning its cross-axis extent', () => {
    const guide: SnapGuide = { orientation: 'vertical', kind: 'edge', position: 100, from: 20, to: 220 };
    render(<SnapGuides guides={[guide]} distances={[]} movingFrame={null} />);
    const line = screen.getByTestId('snap-guide-line');
    expect(line).toHaveAttribute('x1', '100');
    expect(line).toHaveAttribute('x2', '100');
    expect(line).toHaveAttribute('y1', '20');
    expect(line).toHaveAttribute('y2', '220');
  });

  it('draws a horizontal line for a horizontal grid/edge guide spanning its cross-axis extent', () => {
    const guide: SnapGuide = { orientation: 'horizontal', kind: 'grid', position: 48, from: 10, to: 90 };
    render(<SnapGuides guides={[guide]} distances={[]} movingFrame={null} />);
    const line = screen.getByTestId('snap-guide-line');
    expect(line).toHaveAttribute('y1', '48');
    expect(line).toHaveAttribute('y2', '48');
    expect(line).toHaveAttribute('x1', '10');
    expect(line).toHaveAttribute('x2', '90');
  });

  it('draws a spacing guide as a tick running along the spaced axis, plus a distance chip', () => {
    const guide: SnapGuide = { orientation: 'vertical', kind: 'spacing', position: 50, from: 0, to: 28, distance: 28 };
    render(<SnapGuides guides={[guide]} distances={[]} movingFrame={null} />);
    const line = screen.getByTestId('snap-guide-line');
    // A vertical-axis spacing tick runs horizontally: from/to are x values, position is y.
    expect(line).toHaveAttribute('x1', '0');
    expect(line).toHaveAttribute('x2', '28');
    expect(line).toHaveAttribute('y1', '50');
    expect(line).toHaveAttribute('y2', '50');
    expect(screen.getByTestId('snap-chip')).toHaveTextContent('28');
  });

  it('draws a vertical spacing tick for a horizontal-axis gap', () => {
    const guide: SnapGuide = { orientation: 'horizontal', kind: 'spacing', position: 50, from: 0, to: 24, distance: 24 };
    render(<SnapGuides guides={[guide]} distances={[]} movingFrame={null} />);
    const line = screen.getByTestId('snap-guide-line');
    expect(line).toHaveAttribute('y1', '0');
    expect(line).toHaveAttribute('y2', '24');
    expect(line).toHaveAttribute('x1', '50');
    expect(line).toHaveAttribute('x2', '50');
  });

  it('renders one line per guide and labels only the ones with a distance', () => {
    const guides: SnapGuide[] = [
      { orientation: 'vertical', kind: 'grid', position: 8, from: 0, to: 100 },
      { orientation: 'vertical', kind: 'spacing', position: 50, from: 0, to: 28, distance: 28 },
    ];
    render(<SnapGuides guides={guides} distances={[]} movingFrame={null} />);
    expect(screen.getAllByTestId('snap-guide-line')).toHaveLength(2);
    expect(screen.getAllByTestId('snap-chip')).toHaveLength(1);
  });

  it('renders a distance chip next to each reported side of the moving frame', () => {
    const movingFrame = { id: 'm', x: 100, y: 100, width: 50, height: 50 };
    render(
      <SnapGuides
        guides={[]}
        distances={[
          { side: 'left', value: 24 },
          { side: 'bottom', value: 16 },
        ]}
        movingFrame={movingFrame}
      />,
    );
    const chips = screen.getAllByTestId('snap-chip');
    expect(chips).toHaveLength(2);
    expect(chips.map((chip) => chip.textContent)).toEqual(expect.arrayContaining(['24', '16']));
  });

  it('renders no distance chips when the moving frame is not known', () => {
    render(<SnapGuides guides={[]} distances={[{ side: 'left', value: 24 }]} movingFrame={null} />);
    expect(screen.queryAllByTestId('snap-chip')).toHaveLength(0);
  });
});
