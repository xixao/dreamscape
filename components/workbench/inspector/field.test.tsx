import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FieldSchema } from '@/components/blocks/schema';
import { Field } from './field';

const direction: FieldSchema = {
  prop: 'direction',
  label: 'Direction',
  kind: 'select',
  section: 'Layout',
  responsive: true,
  options: [
    { value: 'row', label: 'Row' },
    { value: 'column', label: 'Column' },
  ],
};

describe('Field', () => {
  it('renders a text field and reports every keystroke', async () => {
    const onChange = vi.fn();
    render(
      <Field
        field={{ prop: 'label', label: 'Label', kind: 'text', section: 'Content' }}
        value="Hi"
        breakpoint="desktop"
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText('Label');
    expect(input).toHaveValue('Hi');
    await userEvent.type(input, '!');
    expect(onChange).toHaveBeenLastCalledWith('Hi!');
  });

  it('renders a switch for booleans', async () => {
    const onChange = vi.fn();
    render(
      <Field
        field={{ prop: 'disabled', label: 'Disabled', kind: 'boolean', section: 'Style' }}
        value={false}
        breakpoint="desktop"
        onChange={onChange}
      />,
    );
    const toggle = screen.getByRole('switch', { name: 'Disabled' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);
    expect(onChange).toHaveBeenLastCalledWith(true);
  });

  it('renders up to three options as a segmented control and keeps numeric values numeric', async () => {
    const onChange = vi.fn();
    render(
      <Field
        field={{
          prop: 'columns',
          label: 'Columns',
          kind: 'select',
          section: 'Layout',
          options: [
            { value: 1, label: '1' },
            { value: 2, label: '2' },
            { value: 3, label: '3' },
          ],
        }}
        value={1}
        breakpoint="desktop"
        onChange={onChange}
      />,
    );
    expect(screen.getByText('1').closest('button')).toHaveAttribute('data-state', 'on');
    await userEvent.click(screen.getByText('3'));
    expect(onChange).toHaveBeenLastCalledWith(3);
  });

  it('renders four or more options as a select showing the current label', () => {
    render(
      <Field
        field={{
          prop: 'variant',
          label: 'Variant',
          kind: 'select',
          section: 'Style',
          options: [
            { value: 'default', label: 'Default' },
            { value: 'destructive', label: 'Destructive' },
            { value: 'outline', label: 'Outline' },
            { value: 'secondary', label: 'Secondary' },
          ],
        }}
        value="outline"
        breakpoint="desktop"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Variant' })).toHaveTextContent('Outline');
  });

  it('edits the current breakpoint of a responsive value and shows the other one', async () => {
    const onChange = vi.fn();
    const jump = vi.fn();
    render(
      <Field
        field={direction}
        value={{ mobile: 'column', desktop: 'row' }}
        breakpoint="mobile"
        onChange={onChange}
        onJumpToBreakpoint={jump}
      />,
    );
    expect(screen.getByText('mobile')).toBeInTheDocument();
    expect(screen.getByText('Column').closest('button')).toHaveAttribute('data-state', 'on');
    const caption = screen.getByTestId('breakpoint-caption');
    expect(caption).toHaveTextContent('desktop: row');

    await userEvent.click(screen.getByText('Row'));
    expect(onChange).toHaveBeenLastCalledWith({ mobile: 'row', desktop: 'row' });

    await userEvent.click(caption);
    expect(jump).toHaveBeenCalledWith('desktop');
  });

  it('falls back to the mobile value when desktop is unset', () => {
    render(
      <Field field={direction} value={{ mobile: 'column' }} breakpoint="desktop" onChange={() => {}} />,
    );
    expect(screen.getByText('Column').closest('button')).toHaveAttribute('data-state', 'on');
    expect(screen.getByTestId('breakpoint-caption')).toHaveTextContent('mobile: column');
  });
});

it('opens the fill color token menu and applies a selected variable', async () => {
  const { APPEARANCE_FIELDS, designStyle } = await import('@/components/blocks/design-controls');
  const onChange = vi.fn();
  render(<Field field={APPEARANCE_FIELDS.find(field => field.prop === 'fillColor')!} value="" breakpoint="desktop" onChange={onChange} />);
  await userEvent.click(screen.getByRole('combobox', { name: 'Fill color' }));
  await userEvent.click(screen.getByRole('option', { name: '--primary' }));
  expect(onChange).toHaveBeenCalledWith('var(--primary)');
  expect(designStyle({ fillColor: 'var(--primary)' })).toMatchObject({ backgroundColor: 'var(--primary)' });
});
