import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { trayItems, type TrayGroup } from '@/components/blocks/registry';
import { renderInEditor } from '@/test/craft-harness';
import { ComponentTray, filterTrayItems } from './component-tray';

const GROUP_ORDER: TrayGroup[] = ['Layout', 'Text and media', 'Forms', 'Feedback', 'Data'];

describe('ComponentTray', () => {
  it('shows every tray item by its label', () => {
    renderInEditor(<ComponentTray />);
    for (const item of trayItems) {
      const row = screen.getByText(item.label).closest('[data-tray-item]');
      expect(row).toHaveAttribute('data-tray-item', item.type);
    }
  });

  // The Elements tab now renders this content inside the right panel's own
  // <aside> (Inspector owns that panel chrome and its header) - see
  // docs/superpowers/specs/2026-09-12-panels-and-zoom-design.md section 1.
  // ComponentTray must not bring a second, nested landmark or panel title of
  // its own.
  it('renders no panel chrome of its own: no landmark, no "Elements" title', () => {
    renderInEditor(<ComponentTray />);
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.queryByText('Elements')).toBeNull();
  });

  it('renders the five group headings in the spec order', () => {
    const { container } = renderInEditor(<ComponentTray />);
    const headings = Array.from(container.querySelectorAll<HTMLElement>('[data-tray-group]')).map(
      (el) => el.textContent,
    );
    expect(headings).toEqual(GROUP_ORDER);
  });

  it('lists each tray item under its own group heading, in the registry order', () => {
    const { container } = renderInEditor(<ComponentTray />);
    for (const group of GROUP_ORDER) {
      const section = container.querySelector<HTMLElement>(`[data-tray-section="${group}"]`)!;
      const itemsInSection = Array.from(section.querySelectorAll('[data-tray-item]')).map((el) =>
        el.getAttribute('data-tray-item'),
      );
      const expected = trayItems.filter((item) => item.group === group).map((item) => item.type);
      expect(itemsInSection).toEqual(expected);
    }
  });

  it('renders no hint text for any tray item', () => {
    renderInEditor(<ComponentTray />);
    // These were the old per-item hint strings; none of them should appear anywhere now.
    expect(screen.queryByText('Auto layout container')).not.toBeInTheDocument();
    expect(screen.queryByText('Header and content area')).not.toBeInTheDocument();
    expect(screen.queryByText('shadcn Button')).not.toBeInTheDocument();
    expect(screen.queryByText('Dropdown trigger')).not.toBeInTheDocument();
  });

  it('filterTrayItems keeps every item for a blank or whitespace query', () => {
    expect(filterTrayItems(trayItems, '')).toEqual(trayItems);
    expect(filterTrayItems(trayItems, '')).toHaveLength(trayItems.length);
    expect(filterTrayItems(trayItems, '   ')).toEqual(trayItems);
    expect(filterTrayItems(trayItems, '   ')).toHaveLength(trayItems.length);
  });

  it('filterTrayItems matches label or type case-insensitively, and only those two fields', () => {
    expect(filterTrayItems(trayItems, 'textarea').map((item) => item.type)).toEqual(['Textarea']);
    expect(filterTrayItems(trayItems, 'FRAME').map((item) => item.type)).toEqual(['LayoutBox']);
    expect(filterTrayItems(trayItems, 'radio').map((item) => item.type)).toEqual(['RadioGroup']);
    // "container" used to be part of LayoutBox's now-removed hint text; it must not match anymore.
    expect(filterTrayItems(trayItems, 'container')).toEqual([]);
    expect(filterTrayItems(trayItems, 'zzz')).toEqual([]);
  });

  it('hides a group entirely when the search filters out all of its items', async () => {
    const { container } = renderInEditor(<ComponentTray />);
    const input = screen.getByLabelText('Search elements');

    await userEvent.type(input, 'table');
    const sections = Array.from(container.querySelectorAll<HTMLElement>('[data-tray-section]'));
    expect(sections.map((section) => section.dataset.traySection)).toEqual(['Data']);
    expect(container.querySelectorAll('[data-tray-item]')).toHaveLength(1);
    expect(container.querySelector('[data-tray-item="Table"]')).toBeInTheDocument();
  });

  it('filters the rendered rows as the user types, and clears back to the full list', async () => {
    const { container } = renderInEditor(<ComponentTray />);
    const input = screen.getByLabelText('Search elements');

    await userEvent.type(input, 'dia');
    const matched = container.querySelectorAll('[data-tray-item]');
    expect(matched).toHaveLength(1);
    expect(matched[0]).toHaveAttribute('data-tray-item', 'Dialog');

    await userEvent.clear(input);
    await userEvent.type(input, 'zzz');
    expect(container.querySelectorAll('[data-tray-item]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-tray-section]')).toHaveLength(0);
    expect(screen.getByText('No elements match.')).toBeInTheDocument();

    await userEvent.clear(input);
    expect(container.querySelectorAll('[data-tray-item]')).toHaveLength(trayItems.length);
    expect(screen.queryByText('No elements match.')).not.toBeInTheDocument();
  });
});

// Element documentation (spec docs/superpowers/specs/2026-09-13-element-
// docs-design.md section 1): every row carries an "i" button that opens the
// docs dialog for that element and never touches the row's drag.
describe('ComponentTray: the "i" (About) button on each row', () => {
  const HIDDEN_UNTIL_HOVER_OR_FOCUS = [
    'opacity-0',
    'group-hover:opacity-100',
    'focus-visible:opacity-100',
    'group-focus-within:opacity-100',
  ];

  it('gives every item an "About <label>" button inside its own row: a real tab stop, hidden until the row is hovered or focused', () => {
    renderInEditor(<ComponentTray />);
    for (const item of trayItems) {
      const button = screen.getByRole('button', { name: `About ${item.label}` });
      expect(button.closest('li')!.querySelector('[data-tray-item]')).toHaveAttribute('data-tray-item', item.type);
      expect(button).toHaveAttribute('type', 'button');
      expect(button).toHaveAttribute('draggable', 'false');
      const classes = button.className.split(/\s+/);
      for (const className of HIDDEN_UNTIL_HOVER_OR_FOCUS) {
        expect(classes, `${item.type}: ${className}`).toContain(className);
      }
    }
  });

  it("sits outside the row's drag surface, so a press on it can never become the item's drag", () => {
    const { container } = renderInEditor(<ComponentTray />);
    for (const item of trayItems) {
      // data-tray-item marks the exact element Craft's connectors.create
      // binds to (drop-placeholder.tsx relies on that); Craft marks it
      // draggable. An HTML drag starts from the nearest draggable ancestor
      // of the pointer, so the button must not be inside that element.
      const dragSurface = container.querySelector<HTMLElement>(`[data-tray-item="${item.type}"]`)!;
      expect(dragSurface).toHaveAttribute('draggable', 'true');
      const row = dragSurface.closest('li')!;
      const button = within(row).getByRole('button', { name: `About ${item.label}` });
      expect(dragSurface.contains(button)).toBe(false);
      expect(button.closest('[draggable="true"]')).toBeNull();
    }
  });

  it('Tab from the search field reaches the first row\'s "About Frame" button', async () => {
    renderInEditor(<ComponentTray />);
    screen.getByLabelText('Search elements').focus();

    await userEvent.tab();

    expect(screen.getByRole('button', { name: 'About Frame' })).toHaveFocus();
  });

  it('opens the docs dialog for that item; the press bubbles to the document, starts no drag and inserts nothing', async () => {
    const { container, editor } = renderInEditor(<ComponentTray />);
    const dragSurface = container.querySelector<HTMLElement>('[data-tray-item="Button"]')!;
    const row = dragSurface.closest('li')!;
    const onDragStart = vi.fn();
    dragSurface.addEventListener('dragstart', onDragStart);
    // The layer stack menu (layer-stack-menu.tsx) dismisses on a bubbling
    // document click, and Radix's non-modal layers detect outside presses
    // the same way: the button must not stop the press from reaching them.
    const onDocumentClick = vi.fn();
    document.addEventListener('click', onDocumentClick);
    const nodesBefore = Object.keys(editor().query.getNodes()).length;

    const button = within(row).getByRole('button', { name: 'About Button' });
    await userEvent.click(button);

    expect(screen.getByRole('dialog', { name: 'Button' })).toBeInTheDocument();
    expect(onDocumentClick).toHaveBeenCalledTimes(1);
    expect(onDocumentClick.mock.calls[0][0].target).toBe(button);
    expect(onDragStart).not.toHaveBeenCalled();
    // A drag event fired at the button (not possible in a browser, since
    // nothing draggable contains it) still never reaches Craft's handlers on
    // the drag surface, and nothing is inserted.
    fireEvent.dragStart(button);
    fireEvent.dragEnd(button);
    expect(onDragStart).not.toHaveBeenCalled();
    expect(Object.keys(editor().query.getNodes())).toHaveLength(nodesBefore);
    document.removeEventListener('click', onDocumentClick);
  });

  it('a drag started on the row\'s label does reach the drag surface (positive control for the test above)', () => {
    const { container, editor } = renderInEditor(<ComponentTray />);
    const dragSurface = container.querySelector<HTMLElement>('[data-tray-item="Button"]')!;
    const onDragStart = vi.fn();
    dragSurface.addEventListener('dragstart', onDragStart);
    const nodesBefore = Object.keys(editor().query.getNodes()).length;

    // Craft's own dragstart handler on the surface calls
    // dataTransfer.setDragImage, which jsdom's DragEvent does not carry.
    const dataTransfer = { setDragImage: () => {}, setData: () => {}, effectAllowed: '', dropEffect: '' };
    fireEvent.dragStart(within(dragSurface.closest('li')!).getByText('Button'), { dataTransfer });
    expect(onDragStart).toHaveBeenCalledTimes(1);

    // Ends Craft's drag session; nothing was dropped on a canvas, so
    // nothing is inserted.
    fireEvent.dragEnd(dragSurface);
    expect(Object.keys(editor().query.getNodes())).toHaveLength(nodesBefore);
  });

  it('opens from the keyboard: Enter on the focused button', async () => {
    renderInEditor(<ComponentTray />);
    screen.getByRole('button', { name: 'About Input' }).focus();

    await userEvent.keyboard('{Enter}');

    expect(screen.getByRole('dialog', { name: 'Input' })).toBeInTheDocument();
  });

  it('opens from the keyboard: Space on the focused button', async () => {
    renderInEditor(<ComponentTray />);
    screen.getByRole('button', { name: 'About Switch' }).focus();

    await userEvent.keyboard('[Space]');

    expect(screen.getByRole('dialog', { name: 'Switch' })).toBeInTheDocument();
  });

  // The dialog lives inside the tray, so hiding every panel (Cmd+\, which
  // bypasses the dialog guard) while it is open unmounts it mid-open. The
  // hoist to WorkbenchShell is a follow-up after the grid merge; until then
  // this pins that the unmount is at least clean.
  it('unmounting the tray while its dialog is open throws nothing and leaves no modal residue on the document', async () => {
    const { rerenderUi } = renderInEditor(<ComponentTray />);
    await userEvent.click(screen.getByRole('button', { name: 'About Button' }));
    expect(screen.getByRole('dialog', { name: 'Button' })).toBeInTheDocument();
    // What the open modal puts on the document, so the residue assertions
    // below cannot pass vacuously.
    expect(document.body.style.pointerEvents).toBe('none');
    expect(document.body).toHaveAttribute('data-scroll-locked');
    expect(document.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);

    expect(() => rerenderUi(<div />)).not.toThrow();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.pointerEvents).toBe('');
    expect(document.body).not.toHaveAttribute('data-scroll-locked');
    expect(document.querySelectorAll('[aria-hidden="true"]')).toHaveLength(0);
  });

  it('Escape closes the dialog and returns focus to the button that opened it', async () => {
    renderInEditor(<ComponentTray />);
    const button = screen.getByRole('button', { name: 'About Card' });

    await userEvent.click(button);
    expect(screen.getByRole('dialog', { name: 'Card' })).toBeInTheDocument();
    expect(button).not.toHaveFocus();

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(button).toHaveFocus());
  });

  it("the dialog's close button closes it and returns focus the same way", async () => {
    renderInEditor(<ComponentTray />);
    const button = screen.getByRole('button', { name: 'About Tabs' });

    await userEvent.click(button);
    const dialog = screen.getByRole('dialog', { name: 'Tabs' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(button).toHaveFocus());
  });

  it('is one dialog for the whole tray: opening another item shows that item, never a second dialog', async () => {
    renderInEditor(<ComponentTray />);

    await userEvent.click(screen.getByRole('button', { name: 'About Button' }));
    expect(screen.getByRole('dialog', { name: 'Button' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await userEvent.click(screen.getByRole('button', { name: 'About Table' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Table' })).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByText('Data')).toBeInTheDocument();
  });

  it('keeps the button on a filtered row and drops it with the row', async () => {
    renderInEditor(<ComponentTray />);
    await userEvent.type(screen.getByLabelText('Search elements'), 'table');
    expect(screen.getAllByRole('button', { name: /^About / })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'About Table' })).toBeInTheDocument();
  });
});
