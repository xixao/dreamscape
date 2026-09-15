import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SpacingInput } from './spacing-input';
import { SPACING_OPTIONS } from '@/lib/classes';
const options = SPACING_OPTIONS.map(value => ({ value, label: `${value} px` }));
function Harness({ onCommit = () => {}, max, integer }: { onCommit?: (value: number) => void; max?: number; integer?: boolean }) {
  const [value, setValue] = useState(16);
  return <><SpacingInput id="padding" label="Padding" value={value} options={options} max={max} integer={integer}
    onChange={next => { setValue(next); onCommit(next); }} /><button>Outside</button></>;
}
describe('editable spacing input', () => {
  it('shows the current value, opens presets on focus, and picks a preset without moving focus', async () => {
    const user = userEvent.setup(); const change = vi.fn(); render(<Harness onCommit={change} />);
    const input = screen.getByRole('combobox', { name: 'Padding' }); expect(input).toHaveValue('16');
    await user.click(input);
    expect(screen.getByRole('listbox', { name: 'Padding presets' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: '32 px' }));
    expect(input).toHaveValue('32'); expect(change).toHaveBeenCalledWith(32); expect(input).toHaveFocus();
  });
  it('accepts custom and fractional pixels on Enter or blur without snapping', async () => {
    const user = userEvent.setup(); const change = vi.fn(); render(<Harness onCommit={change} />);
    const input = screen.getByRole('combobox');
    await user.clear(input); await user.type(input, '13.5px{Enter}'); expect(change).toHaveBeenLastCalledWith(13.5);
    expect(input).toHaveValue('13.5');
    await user.clear(input); await user.type(input, '101'); await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(change).toHaveBeenLastCalledWith(101); expect(input).toHaveValue('101');
  });
  it('supports keyboard presets and cancels typed edits with Escape', async () => {
    const user = userEvent.setup(); render(<Harness />); const input = screen.getByRole('combobox');
    await user.click(input); await user.keyboard('{ArrowDown}{ArrowDown}{Enter}'); expect(input).toHaveValue('8');
    await user.clear(input); await user.type(input, '123{Escape}'); expect(input).toHaveValue('8');
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });
  it('rejects negative, empty, nonnumeric and out-of-range values without changing the saved value', async () => {
    const user = userEvent.setup(); const change = vi.fn(); render(<Harness onCommit={change} max={200} integer />);
    const input = screen.getByRole('combobox');
    for (const text of ['-2', 'abc', '201', '2.5', '']) {
      await user.clear(input); if (text) await user.type(input, text); await user.keyboard('{Enter}');
      expect(input).toHaveValue('16'); expect(screen.getByRole('alert')).toBeInTheDocument();
    }
    expect(change).not.toHaveBeenCalled();
  });
});
