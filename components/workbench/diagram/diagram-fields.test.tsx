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

    expect(onAction).toHaveBeenCalledWith({ type: 'setColor', id: 'node000001', color: 'blue' });
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
