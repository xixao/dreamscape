import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DiagramPalette } from './diagram-palette';
import { POINTER_TOOL, type DiagramTool } from './diagram-layer';

function renderPalette(overrides: { open?: boolean; tool?: DiagramTool } = {}) {
  const onSelectTool = vi.fn();
  const props = { open: true, tool: POINTER_TOOL, onSelectTool, ...overrides };
  const result = render(<DiagramPalette {...props} />);
  return { ...result, onSelectTool };
}

describe('DiagramPalette', () => {
  it('renders nothing when closed', () => {
    renderPalette({ open: false });
    expect(screen.queryByRole('toolbar', { name: 'Diagram palette' })).not.toBeInTheDocument();
  });

  it('renders every shape and the connector when open', () => {
    renderPalette();
    for (const label of ['Rectangle', 'Rounded', 'Decision', 'Terminal', 'Text', 'Note', 'Connector']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('arms a shape tool on click', async () => {
    const { onSelectTool } = renderPalette();
    await userEvent.click(screen.getByRole('button', { name: 'Decision' }));

    expect(onSelectTool).toHaveBeenCalledWith({ kind: 'shape', shape: 'decision' });
  });

  it('arms the connector tool on click', async () => {
    const { onSelectTool } = renderPalette();
    await userEvent.click(screen.getByRole('button', { name: 'Connector' }));

    expect(onSelectTool).toHaveBeenCalledWith({ kind: 'connector' });
  });

  it('marks the active tool with aria-pressed', () => {
    renderPalette({ tool: { kind: 'shape', shape: 'note' } });
    expect(screen.getByRole('button', { name: 'Note' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Rectangle' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking the already-armed tool returns to the pointer', async () => {
    const { onSelectTool } = renderPalette({ tool: { kind: 'shape', shape: 'note' } });
    await userEvent.click(screen.getByRole('button', { name: 'Note' }));

    expect(onSelectTool).toHaveBeenCalledWith(POINTER_TOOL);
  });
});
