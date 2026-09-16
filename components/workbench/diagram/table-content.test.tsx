import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createDiagramNode } from '@/lib/diagram/insertion';
import { TableContent } from './table-content';
import { TableFields } from './table-fields';

describe('diagram table editing', () => {
  it('commits a cell on Enter and discards an edit on Escape', async () => {
    const onChange = vi.fn();
    render(<TableContent node={createDiagramNode('table', { x: 0, y: 0 })} onChange={onChange} />);
    await userEvent.dblClick(screen.getByText('Column 1'));
    const input = screen.getByRole('textbox', { name: 'Row 1, column 1' });
    await userEvent.clear(input); await userEvent.type(input, 'Status{Enter}');
    expect(onChange.mock.calls[0][0][0][0]).toBe('Status');
    onChange.mockClear();
    await userEvent.dblClick(screen.getByText('Column 2'));
    await userEvent.type(screen.getByRole('textbox', { name: 'Row 1, column 2' }), 'Discard{Escape}');
    expect(onChange).not.toHaveBeenCalled();
  });
  it('changes dimensions and edits cell text in the inspector', async () => {
    const onChange = vi.fn();
    render(<TableFields node={createDiagramNode('table', { x: 0, y: 0 })} onChange={onChange} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Rows' }), { target: { value: '4' } });
    expect(onChange.mock.calls[0][0]).toHaveLength(4);
    const cell = screen.getByRole('textbox', { name: 'Row 2, column 1' });
    await userEvent.type(cell, 'Example'); fireEvent.blur(cell);
    expect(onChange.mock.calls.at(-1)?.[0][1][0]).toBe('Example');
  });
});
