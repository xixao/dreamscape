import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getElementDoc } from '@/components/blocks/docs';
import { schemaFor, trayItems } from '@/components/blocks/registry';
import { WIDE_DIALOG_CONTENT } from './chrome';
import { ElementDocsDialog, propertyRows } from './element-docs-dialog';

function renderDialog(type: string, open = true) {
  const onOpenChange = vi.fn();
  const utils = render(<ElementDocsDialog type={type} open={open} onOpenChange={onOpenChange} />);
  return { ...utils, onOpenChange };
}

// The DialogHeader: the title (an h2) and, beside it, the group caption.
// Scoped because a group name can also be a field label (Frame's "Layout").
function header(dialog: HTMLElement, name: string): HTMLElement {
  return within(dialog).getByRole('heading', { name }).parentElement!;
}

function propNames(table: HTMLElement): string[] {
  return within(table)
    .getAllByRole('row')
    .slice(1) // the header row
    .map((row) => within(row).getAllByRole('cell')[0].querySelector('code')?.textContent ?? '');
}

describe('ElementDocsDialog', () => {
  it('names the dialog after the element, captions its group, and shows the Summary and Usage paragraphs', () => {
    renderDialog('Button');
    const dialog = screen.getByRole('dialog', { name: 'Button' });

    expect(within(header(dialog, 'Button')).getByText('Forms')).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Summary' })).toBeInTheDocument();
    expect(within(dialog).getByText(getElementDoc('Button').summary)).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Usage' })).toBeInTheDocument();
    expect(within(dialog).getByText(getElementDoc('Button').usage)).toBeInTheDocument();
    // The stub note (spec section 2).
    expect(within(dialog).getByText('Full documentation is coming soon.')).toBeInTheDocument();
  });

  it('is described by the summary for assistive technology', () => {
    renderDialog('Button');
    expect(screen.getByRole('dialog', { name: 'Button' })).toHaveAccessibleDescription(
      getElementDoc('Button').summary,
    );
  });

  it('lists the schema props in a Properties table: name in a key-cap, type or options, default', () => {
    renderDialog('Button');
    const dialog = screen.getByRole('dialog', { name: 'Button' });
    expect(within(dialog).getByRole('heading', { name: 'Properties' })).toBeInTheDocument();
    const table = within(dialog).getByRole('table', { name: 'Properties' });

    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Property',
      'Type',
      'Default',
    ]);
    expect(propNames(table)).toEqual(['label', 'variant', 'size', 'disabled', 'grow']);

    const variantRow = within(table).getByText('variant').closest('tr')!;
    const variantCells = within(variantRow).getAllByRole('cell');
    expect(variantCells[1]).toHaveTextContent('Default, Destructive, Outline, Secondary, Ghost, Link');
    expect(variantCells[2]).toHaveTextContent('Default');

    const labelRow = within(table).getByText('label').closest('tr')!;
    const labelCells = within(labelRow).getAllByRole('cell');
    expect(labelCells[1]).toHaveTextContent('Text');
    expect(labelCells[2]).toHaveTextContent('Button');

    const disabledRow = within(table).getByText('disabled').closest('tr')!;
    const disabledCells = within(disabledRow).getAllByRole('cell');
    expect(disabledCells[1]).toHaveTextContent('Boolean');
    expect(disabledCells[2]).toHaveTextContent('Off');
  });

  it('skips editor-only props (Dialog\'s "Show content on canvas")', () => {
    renderDialog('Dialog');
    const table = screen.getByRole('table', { name: 'Properties' });
    expect(propNames(table)).toEqual(['triggerLabel', 'title', 'description', 'grow']);
    expect(within(table).queryByText('previewOpen')).toBeNull();
  });

  it('uses the shared wide dialog width', () => {
    renderDialog('Card');
    const classes = screen.getByRole('dialog', { name: 'Card' }).className.split(/\s+/);
    for (const widthClass of WIDE_DIALOG_CONTENT.split(' ')) {
      expect(classes).toContain(widthClass);
    }
  });

  it('Escape closes it through onOpenChange', async () => {
    const { onOpenChange } = renderDialog('Button');
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Button' }), { key: 'Escape' });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('the close button closes it through onOpenChange', async () => {
    const { onOpenChange } = renderDialog('Button');
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Button' })).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('renders nothing when open is false', () => {
    renderDialog('Button', false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('falls back to the type as the name, the generic doc and no properties for an unknown type', () => {
    renderDialog('Mystery');
    const dialog = screen.getByRole('dialog', { name: 'Mystery' });
    expect(within(dialog).getByText(getElementDoc('Mystery').summary)).toBeInTheDocument();
    expect(within(dialog).queryByRole('table')).toBeNull();
    expect(within(dialog).getByText('This element has no properties.')).toBeInTheDocument();
  });

  it('renders a dialog for every tray item, with at least one property row each', () => {
    for (const item of trayItems) {
      const { unmount } = renderDialog(item.type);
      const dialog = screen.getByRole('dialog', { name: item.label });
      expect(within(header(dialog, item.label)).getByText(item.group)).toBeInTheDocument();
      expect(propNames(within(dialog).getByRole('table', { name: 'Properties' })).length).toBeGreaterThan(0);
      unmount();
    }
  });
});

describe('propertyRows', () => {
  it('turns the schema into rows with the option labels as the type and the default mapped to its label', () => {
    expect(propertyRows('Textarea')).toEqual([
      { prop: 'label', label: 'Label', type: 'Text', defaultValue: 'Empty' },
      { prop: 'placeholder', label: 'Placeholder', type: 'Text', defaultValue: 'Placeholder' },
      { prop: 'rows', label: 'Rows', type: '2, 3, 4, 5, 6', defaultValue: '3' },
      { prop: 'disabled', label: 'Disabled', type: 'Boolean', defaultValue: 'Off' },
      { prop: 'grow', label: 'Fill container', type: 'Boolean', defaultValue: 'Off' },
    ]);
  });

  it('shows a responsive default per breakpoint, or once when both breakpoints agree', () => {
    const rows = propertyRows('LayoutBox');
    const byProp = Object.fromEntries(rows.map((row) => [row.prop, row]));
    expect(byProp.direction.defaultValue).toBe('Vertical (mobile), Horizontal (desktop)');
    expect(byProp.columns.defaultValue).toBe('1 (mobile), 3 (desktop)');
    expect(byProp.align.defaultValue).toBe('Stretch');
  });

  it('keeps the schema order and drops editor-only fields', () => {
    const schema = schemaFor('Dialog')!;
    expect(propertyRows('Dialog').map((row) => row.prop)).toEqual(
      schema.fields.filter((field) => !field.editorOnly).map((field) => field.prop),
    );
  });

  it('returns no rows for a type without a schema', () => {
    expect(propertyRows('Mystery')).toEqual([]);
  });
});
