import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DiagramEdge, DiagramNode } from '@/lib/diagram/store';
import { DiagramFields } from './diagram-fields';

function node(overrides: Partial<DiagramNode> = {}): DiagramNode {
  return {
    id: 'node000001',
    kind: 'rect',
    x: 0,
    y: 0,
    width: 160,
    height: 80,
    text: 'Login',
    color: 'neutral',
    ...overrides,
  };
}

function edge(overrides: Partial<DiagramEdge> = {}): DiagramEdge {
  return {
    id: 'edge0000001',
    source: { nodeId: 'a', side: 'right' },
    target: { nodeId: 'b', side: 'left' },
    kind: 'step',
    arrow: 'end',
    ...overrides,
  };
}

describe('DiagramFields for a shape', () => {
  it('shows the current text, kind, color, width and height', () => {
    render(<DiagramFields selected={{ type: 'node', node: node() }} onAction={vi.fn()} />);

    expect(screen.getByLabelText('Text')).toHaveValue('Login');
    expect(screen.getByRole('combobox', { name: 'Shape' })).toHaveTextContent('Rectangle');
    expect(screen.getByRole('combobox', { name: 'Color' })).toHaveTextContent('Neutral');
    expect(screen.getByLabelText('Width')).toHaveValue('160');
    expect(screen.getByLabelText('Height')).toHaveValue('80');
  });

  it('dispatches setText when the text field changes', () => {
    const onAction = vi.fn();
    render(<DiagramFields selected={{ type: 'node', node: node({ text: '' }) }} onAction={onAction} />);

    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'Hi' } });

    expect(onAction).toHaveBeenCalledWith({ type: 'setText', id: 'node000001', text: 'Hi' });
  });

  it('dispatches setKind when a different shape is chosen', async () => {
    const onAction = vi.fn();
    render(<DiagramFields selected={{ type: 'node', node: node() }} onAction={onAction} />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Shape' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Decision' }));

    expect(onAction).toHaveBeenCalledWith({ type: 'setKind', id: 'node000001', kind: 'decision' });
  });

  it('dispatches setColor when a different color is chosen', async () => {
    const onAction = vi.fn();
    render(<DiagramFields selected={{ type: 'node', node: node() }} onAction={onAction} />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Color' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Blue' }));

    expect(onAction).toHaveBeenCalledWith({ type: 'setColor', ids: ['node000001'], color: 'blue' });
  });

  it('dispatches resize with the parsed width, keeping the current height', () => {
    const onAction = vi.fn();
    render(<DiagramFields selected={{ type: 'node', node: node({ width: 160, height: 80 }) }} onAction={onAction} />);

    fireEvent.change(screen.getByLabelText('Width'), { target: { value: '200' } });

    expect(onAction).toHaveBeenCalledWith({ type: 'resize', id: 'node000001', width: 200, height: 80 });
  });

  it('rounds a fractional width to the nearest integer (re-review 2 finding 27)', () => {
    const onAction = vi.fn();
    render(<DiagramFields selected={{ type: 'node', node: node({ width: 160, height: 80 }) }} onAction={onAction} />);

    fireEvent.change(screen.getByLabelText('Width'), { target: { value: '12.5' } });

    expect(onAction).toHaveBeenCalledWith({ type: 'resize', id: 'node000001', width: 13, height: 80 });
  });

  it('ignores a non-numeric or blank width instead of dispatching NaN or zero', () => {
    const onAction = vi.fn();
    render(<DiagramFields selected={{ type: 'node', node: node() }} onAction={onAction} />);

    const width = screen.getByLabelText('Width');
    fireEvent.change(width, { target: { value: 'abc' } });
    fireEvent.change(width, { target: { value: '' } });

    expect(onAction).not.toHaveBeenCalled();
  });
});

// Spec section 9: "give the diagram shapes a font selection like small,
// medium, large... a monospaced font, a serif font, and a sans serif
// font... let me change the color of the fonts independently". Text size
// and Font have three options each, so Field (components/workbench/
// inspector/field.tsx) renders them as a ToggleGroup (role "radio") - the
// same widget the connector's own three-option fields below already use -
// while Text color's eight options render as a Select (role "combobox"),
// like the shape's own Color field above.
describe('DiagramFields text styling', () => {
  it('defaults text size, font and color to medium/sans/default when absent', () => {
    render(<DiagramFields selected={{ type: 'node', node: node() }} onAction={vi.fn()} />);

    // Text size now has five options (small/medium/large/xlarge/huge), past
    // the Field component's own <= 3 threshold for a ToggleGroup - like
    // Text color's eight options above it, it renders as a Select.
    expect(screen.getByRole('combobox', { name: 'Text size' })).toHaveTextContent('Medium');
    expect(screen.getByRole('radio', { name: 'Sans' })).toHaveAttribute('data-state', 'on');
    expect(screen.getByRole('combobox', { name: 'Text color' })).toHaveTextContent('Default');
  });

  it('shows the shape own text size, font and color when set', () => {
    render(
      <DiagramFields
        selected={{ type: 'node', node: node({ textSize: 'huge', textFont: 'mono', textColor: 'blue' }) }}
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Text size' })).toHaveTextContent('Huge');
    expect(screen.getByRole('radio', { name: 'Mono' })).toHaveAttribute('data-state', 'on');
    expect(screen.getByRole('combobox', { name: 'Text color' })).toHaveTextContent('Blue');
  });

  it('dispatches setTextStyle when text size changes', async () => {
    const onAction = vi.fn();
    render(<DiagramFields selected={{ type: 'node', node: node() }} onAction={onAction} />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Text size' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Extra Large' }));

    expect(onAction).toHaveBeenCalledWith({ type: 'setTextStyle', ids: ['node000001'], textSize: 'xlarge' });
  });

  it('dispatches setTextStyle when font changes', async () => {
    const onAction = vi.fn();
    render(<DiagramFields selected={{ type: 'node', node: node() }} onAction={onAction} />);

    await userEvent.click(screen.getByRole('radio', { name: 'Serif' }));

    expect(onAction).toHaveBeenCalledWith({ type: 'setTextStyle', ids: ['node000001'], textFont: 'serif' });
  });

  it('dispatches setTextStyle when text color changes', async () => {
    const onAction = vi.fn();
    render(<DiagramFields selected={{ type: 'node', node: node() }} onAction={onAction} />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Text color' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Violet' }));

    expect(onAction).toHaveBeenCalledWith({ type: 'setTextStyle', ids: ['node000001'], textColor: 'violet' });
  });

  // Spec section 9: "with several shapes selected they apply to every
  // selected shape as one history step" - `nodes` is the co-selection
  // (DiagramFieldsSelection's own comment); a synthetic "Mixed" option
  // pushes Text size/Font's option count past three, so they render as a
  // Select showing the word "Mixed" here too, not a ToggleGroup with
  // nothing pressed.
  describe('with several shapes selected', () => {
    const a = node({ id: 'a', textSize: 'small', textFont: 'sans', textColor: 'default' });
    const b = node({ id: 'b', textSize: 'large', textFont: 'mono', textColor: 'red' });

    it('shows Mixed for every field the selected shapes disagree on', () => {
      render(<DiagramFields selected={{ type: 'node', node: a, nodes: [a, b] }} onAction={vi.fn()} />);

      expect(screen.getByRole('combobox', { name: 'Text size' })).toHaveTextContent('Mixed');
      expect(screen.getByRole('combobox', { name: 'Font' })).toHaveTextContent('Mixed');
      expect(screen.getByRole('combobox', { name: 'Text color' })).toHaveTextContent('Mixed');
    });

    it('shows the shared value, not Mixed, for a field the selected shapes agree on', () => {
      const c = node({ id: 'c', textSize: 'small', textFont: 'mono', textColor: 'red' });
      render(<DiagramFields selected={{ type: 'node', node: b, nodes: [b, c] }} onAction={vi.fn()} />);

      expect(screen.getByRole('combobox', { name: 'Text size' })).toHaveTextContent('Mixed');
      expect(screen.getByRole('radio', { name: 'Mono' })).toHaveAttribute('data-state', 'on');
      expect(screen.getByRole('combobox', { name: 'Text color' })).toHaveTextContent('Red');
    });

    it('dispatches setTextStyle for every selected id when choosing a value from Mixed', async () => {
      const onAction = vi.fn();
      render(<DiagramFields selected={{ type: 'node', node: a, nodes: [a, b] }} onAction={onAction} />);

      await userEvent.click(screen.getByRole('combobox', { name: 'Text size' }));
      await userEvent.click(await screen.findByRole('option', { name: 'Medium' }));

      expect(onAction).toHaveBeenCalledWith({ type: 'setTextStyle', ids: ['a', 'b'], textSize: 'medium' });
    });

    it('does not dispatch when Mixed itself is re-selected', async () => {
      const onAction = vi.fn();
      render(<DiagramFields selected={{ type: 'node', node: a, nodes: [a, b] }} onAction={onAction} />);

      await userEvent.click(screen.getByRole('combobox', { name: 'Text color' }));
      await userEvent.click(await screen.findByRole('option', { name: 'Mixed' }));

      expect(onAction).not.toHaveBeenCalled();
    });
  });
});

describe('DiagramFields for a connector', () => {
  it('shows the current connector kind, arrow and label', () => {
    render(<DiagramFields selected={{ type: 'edge', edge: edge({ label: 'yes' }) }} onAction={vi.fn()} />);

    expect(screen.getByRole('radio', { name: 'Step' })).toHaveAttribute('data-state', 'on');
    expect(screen.getByRole('radio', { name: 'End' })).toHaveAttribute('data-state', 'on');
    expect(screen.getByLabelText('Label')).toHaveValue('yes');
  });

  it('dispatches setKind for the connector kind toggle', async () => {
    const onAction = vi.fn();
    render(<DiagramFields selected={{ type: 'edge', edge: edge() }} onAction={onAction} />);

    await userEvent.click(screen.getByRole('radio', { name: 'Curve' }));

    expect(onAction).toHaveBeenCalledWith({ type: 'setKind', id: 'edge0000001', kind: 'curve' });
  });

  it('dispatches setArrow for the arrows toggle', async () => {
    const onAction = vi.fn();
    render(<DiagramFields selected={{ type: 'edge', edge: edge() }} onAction={onAction} />);

    await userEvent.click(screen.getByRole('radio', { name: 'Both' }));

    expect(onAction).toHaveBeenCalledWith({ type: 'setArrow', id: 'edge0000001', arrow: 'both' });
  });

  it('dispatches setText for the label field', () => {
    const onAction = vi.fn();
    render(<DiagramFields selected={{ type: 'edge', edge: edge({ label: '' }) }} onAction={onAction} />);

    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'no' } });

    expect(onAction).toHaveBeenCalledWith({ type: 'setText', id: 'edge0000001', text: 'no' });
  });
});
