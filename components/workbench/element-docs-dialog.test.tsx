import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { BUTTON_DEFAULTS } from '@/components/blocks/button';
import { getElementDoc } from '@/components/blocks/docs';
import { schemaFor, trayItems } from '@/components/blocks/registry';
import type { BlockSchema } from '@/components/blocks/schema';
import { LABEL, OVERLAY_PARAGRAPH, WIDE_DIALOG_CONTENT } from './chrome';
import { ElementDocsDialog, propertyRows, schemaRows } from './element-docs-dialog';

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

function classesOf(element: Element): string[] {
  return (element.getAttribute('class') ?? '').split(/\s+/);
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

    const heads = within(table).getAllByRole('columnheader');
    expect(heads.map((cell) => cell.textContent)).toEqual(['Property', 'Type', 'Default']);
    // SF2 chrome only: the heads take the mono field label the tray's group
    // headings use, the cells the shared overlay paragraph.
    for (const head of heads) {
      expect(classesOf(head)).toEqual(expect.arrayContaining(LABEL.split(' ')));
    }
    expect(propNames(table)).toEqual(['label', 'variant', 'size', 'disabled', 'grow']);

    const variantRow = within(table).getByText('variant').closest('tr')!;
    const variantCells = within(variantRow).getAllByRole('cell');
    expect(variantCells[1]).toHaveTextContent('Default, Destructive, Outline, Secondary, Ghost, Link');
    expect(variantCells[2]).toHaveTextContent('Default');
    expect(classesOf(variantCells[1])).toEqual(expect.arrayContaining(OVERLAY_PARAGRAPH.split(' ')));
    expect(classesOf(variantCells[2])).toEqual(expect.arrayContaining(OVERLAY_PARAGRAPH.split(' ')));

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

  it('sets the Summary and Usage paragraphs in the shared overlay paragraph style', () => {
    renderDialog('Card');
    const dialog = screen.getByRole('dialog', { name: 'Card' });
    for (const text of [getElementDoc('Card').summary, getElementDoc('Card').usage]) {
      expect(classesOf(within(dialog).getByText(text))).toEqual(expect.arrayContaining(OVERLAY_PARAGRAPH.split(' ')));
    }
  });

  it('uses the shared wide dialog width', () => {
    renderDialog('Card');
    const classes = screen.getByRole('dialog', { name: 'Card' }).className.split(/\s+/);
    for (const widthClass of WIDE_DIALOG_CONTENT.split(' ')) {
      expect(classes).toContain(widthClass);
    }
  });

  it('scrolls the two columns inside the dialog, never the dialog itself, so the close button stays put', () => {
    renderDialog('LayoutBox');
    const dialog = screen.getByRole('dialog', { name: 'Frame' });
    // shadcn's close button is absolutely positioned inside DialogContent;
    // were DialogContent the scroll container, the button would scroll away
    // with the content.
    expect(dialog.className.split(/\s+/)).not.toContain('overflow-y-auto');
    expect(dialog.className).not.toMatch(/max-h-/);

    const scroller = dialog.querySelector('.overflow-y-auto')!;
    expect(scroller).not.toBeNull();
    // 24px window margin each side (the dialog's own footprint) plus the
    // DialogContent's 1rem padding top and bottom.
    expect(classesOf(scroller)).toContain('max-h-[calc(100vh-48px-2rem)]');
    expect(scroller.contains(within(dialog).getByRole('heading', { name: 'Summary' }))).toBe(true);
    expect(scroller.contains(within(dialog).getByRole('table', { name: 'Properties' }))).toBe(true);
    expect(scroller.contains(within(dialog).getByRole('button', { name: 'Close' }))).toBe(false);
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

  it('returns focus to the opener element on close, since a shared controlled dialog has no DialogTrigger for Radix to focus', async () => {
    const openerRef = { current: null as HTMLButtonElement | null };
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" ref={openerRef}>
            Opener
          </button>
          <ElementDocsDialog type="Button" open={open} onOpenChange={setOpen} openerRef={openerRef} />
        </>
      );
    }
    render(<Harness />);
    // Read through the ref: while the modal is open, Radix marks everything
    // outside it aria-hidden, so a role query cannot see the opener.
    const opener = openerRef.current!;
    expect(opener).not.toHaveFocus();

    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Button' }), { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());
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

describe('schemaRows', () => {
  const schema: BlockSchema = {
    type: 'Button',
    fields: [
      { prop: 'ghost', label: 'Ghost', kind: 'text', section: 'Content' },
      { prop: 'shape', label: 'Shape', kind: 'text', section: 'Style' },
      { prop: 'hidden', label: 'Hidden', kind: 'boolean', section: 'Editor', editorOnly: true },
    ],
  };

  it('reads "None" for a prop the defaults do not cover', () => {
    expect(schemaRows(schema, { shape: 'pill' })).toEqual([
      { prop: 'ghost', label: 'Ghost', type: 'Text', defaultValue: 'None' },
      { prop: 'shape', label: 'Shape', type: 'Text', defaultValue: 'pill' },
    ]);
  });

  it('renders a non-responsive object default as JSON rather than [object Object]', () => {
    const rows = schemaRows(schema, { shape: { corner: 8, sides: ['left'] } });
    expect(rows[1].defaultValue).toBe('{"corner":8,"sides":["left"]}');
  });

  it('is what propertyRows uses for a real block', () => {
    // Spread: ButtonBlockProps is an interface, which has no implicit index
    // signature for the Record<string, unknown> parameter.
    expect(propertyRows('Button')).toEqual(schemaRows(schemaFor('Button')!, { ...BUTTON_DEFAULTS }));
  });
});
