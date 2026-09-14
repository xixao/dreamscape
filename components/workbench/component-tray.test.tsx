import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { trayItems, type TrayGroup, type TrayItem } from '@/components/blocks/registry';
import { renderInEditor } from '@/test/craft-harness';
import { ComponentTray, filterTrayItems } from './component-tray';
import { POINTER_TOOL, type DiagramTool } from './diagram/diagram-layer';
import { DIAGRAM_TOOL_ITEMS } from './diagram/diagram-palette';

const GROUP_ORDER: TrayGroup[] = ['Layout', 'Text and media', 'Forms', 'Feedback', 'Data'];
const DIAGRAM_TOOL_LABELS = DIAGRAM_TOOL_ITEMS.map((item) => item.label);

describe('ComponentTray', () => {
  it('shows every tray item by its label', () => {
    const { container } = renderInEditor(<ComponentTray />);
    for (const item of trayItems) {
      // Scoped by data-tray-item (unique per Craft type) rather than a
      // global getByText: the Elements tab's own Diagram group (spec
      // docs/superpowers/specs/2026-09-13-diagrams-design.md section 13)
      // renders alongside this and can show a row with the very same
      // visible label (its Text shape tool is labelled "Text", same as the
      // Text block here), so a bare getByText(item.label) would be
      // ambiguous once that group is present.
      const row = container.querySelector(`[data-tray-item="${item.type}"]`);
      expect(row, `no row for tray item "${item.type}"`).not.toBeNull();
      expect(within(row as HTMLElement).getByText(item.label)).toBeInTheDocument();
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

  // Dialog itself no longer carries the 'modal'/'popup' keywords (removed
  // from the tray entirely - see the "Elements tray" describe block below),
  // so this exercises the keyword-matching mechanism itself against a
  // synthetic item rather than a real, current tray entry.
  it('filterTrayItems matches an item\'s extra keywords, case-insensitively', () => {
    const withKeywords: TrayItem[] = [
      { ...trayItems[0], type: 'Button', label: 'Button', keywords: undefined },
      { ...trayItems[0], type: 'Card', label: 'Card', keywords: ['modal', 'popup'] },
    ];
    const labels = (query: string) => filterTrayItems(withKeywords, query).map((item) => item.label);
    expect(labels('modal')).toEqual(['Card']);
    expect(labels('Popup')).toEqual(['Card']);
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

    await userEvent.type(input, 'avatar');
    const matched = container.querySelectorAll('[data-tray-item]');
    expect(matched).toHaveLength(1);
    expect(matched[0]).toHaveAttribute('data-tray-item', 'Avatar');

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

// Overlay frames (spec docs/superpowers/specs/2026-09-13-overlay-frames-
// design.md section 5, phase 2): Dialog is removed from the tray (it stays
// in the resolver, so an existing layout that already has one keeps
// rendering - registry.test.tsx/docs.test.ts cover that side). Searching
// for what used to find it now finds nothing and points at the Frames chip
// instead.
describe('ComponentTray: modals are overlay frames now', () => {
  it('no longer lists Dialog in the tray at all', () => {
    renderInEditor(<ComponentTray />);
    expect(screen.queryByText('Dialog')).not.toBeInTheDocument();
    expect(document.querySelector('[data-tray-item="Dialog"]')).toBeNull();
  });

  it.each(['modal', 'popup', 'overlay', 'dialog', 'Modal', 'DIALOG'])(
    'shows a hint pointing at the Frames chip when searching "%s" finds nothing',
    async (query) => {
      renderInEditor(<ComponentTray />);
      await userEvent.type(screen.getByLabelText('Search elements'), query);

      expect(screen.queryByText('No elements match.')).not.toBeInTheDocument();
      expect(
        screen.getByText('Modals are overlay frames: Frames chip → New overlay → Dialog'),
      ).toBeInTheDocument();
    },
  );

  it('matches a partial word too, since the search already filters live as you type', async () => {
    renderInEditor(<ComponentTray />);
    await userEvent.type(screen.getByLabelText('Search elements'), 'dial');

    expect(screen.getByText('Modals are overlay frames: Frames chip → New overlay → Dialog')).toBeInTheDocument();
  });

  it('shows the plain "No elements match." for an unrelated query with no results', async () => {
    renderInEditor(<ComponentTray />);
    await userEvent.type(screen.getByLabelText('Search elements'), 'zzz');

    expect(screen.getByText('No elements match.')).toBeInTheDocument();
    expect(screen.queryByText(/Frames chip/)).not.toBeInTheDocument();
  });

  it('shows neither message once a real element matches again', async () => {
    renderInEditor(<ComponentTray />);
    const input = screen.getByLabelText('Search elements');
    await userEvent.type(input, 'dialog');
    expect(screen.getByText(/Frames chip/)).toBeInTheDocument();

    await userEvent.clear(input);
    await userEvent.type(input, 'button');

    expect(screen.queryByText(/Frames chip/)).not.toBeInTheDocument();
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
    const { container } = renderInEditor(<ComponentTray />);
    for (const item of trayItems) {
      // Scoped to the item's own row: the Elements tab's Diagram group
      // (spec docs/superpowers/specs/2026-09-13-diagrams-design.md section
      // 13) gives its own Text shape tool the same "About Text" button
      // label as the Craft Text block here, so an unscoped query by that
      // one name is ambiguous once that group is present.
      const row = container.querySelector(`[data-tray-item="${item.type}"]`)!.closest('li')!;
      const button = within(row).getByRole('button', { name: `About ${item.label}` });
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

// The Elements tab's Diagram group (spec docs/superpowers/specs/2026-09-13-
// diagrams-design.md section 13): every tool the floating palette offers,
// as plain buttons rather than Craft drag sources.
describe('ComponentTray: Diagram group (Elements tab)', () => {
  it('renders a Diagram group heading after every existing group heading', () => {
    const { container } = renderInEditor(<ComponentTray />);
    const headings = Array.from(
      container.querySelectorAll<HTMLElement>('[data-tray-group], [data-diagram-tray-group]'),
    ).map((el) => el.textContent);
    expect(headings).toEqual(['Layout', 'Text and media', 'Forms', 'Feedback', 'Data', 'Diagram']);
  });

  it('lists all seven diagram tools, in the palette\'s own order', () => {
    const { container } = renderInEditor(<ComponentTray />);
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-diagram-tray-item]'));
    expect(rows.map((row) => row.textContent)).toEqual(DIAGRAM_TOOL_LABELS);
  });

  it('clicking a shape row calls onSelectDiagramTool with that shape', async () => {
    const onSelectDiagramTool = vi.fn();
    renderInEditor(<ComponentTray diagramTool={POINTER_TOOL} onSelectDiagramTool={onSelectDiagramTool} />);

    await userEvent.click(screen.getByRole('button', { name: 'Decision' }));

    expect(onSelectDiagramTool).toHaveBeenCalledTimes(1);
    expect(onSelectDiagramTool).toHaveBeenCalledWith({ kind: 'shape', shape: 'decision' });
  });

  it('clicking the Connector row calls onSelectDiagramTool with the connector tool', async () => {
    const onSelectDiagramTool = vi.fn();
    renderInEditor(<ComponentTray diagramTool={POINTER_TOOL} onSelectDiagramTool={onSelectDiagramTool} />);

    await userEvent.click(screen.getByRole('button', { name: 'Connector' }));

    expect(onSelectDiagramTool).toHaveBeenCalledWith({ kind: 'connector' });
  });

  it('does nothing (never throws) on click when onSelectDiagramTool is not passed', async () => {
    renderInEditor(<ComponentTray />);
    await expect(userEvent.click(screen.getByRole('button', { name: 'Note' }))).resolves.not.toThrow();
  });

  it("shows only the armed tool's row as aria-pressed", () => {
    const diagramTool: DiagramTool = { kind: 'shape', shape: 'note' };
    renderInEditor(<ComponentTray diagramTool={diagramTool} />);

    expect(screen.getByRole('button', { name: 'Note' })).toHaveAttribute('aria-pressed', 'true');
    for (const label of DIAGRAM_TOOL_LABELS) {
      if (label === 'Note') continue;
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('the armed tool follows the connector tool too', () => {
    renderInEditor(<ComponentTray diagramTool={{ kind: 'connector' }} />);
    expect(screen.getByRole('button', { name: 'Connector' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Rectangle' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('defaults to the plain pointer (nothing pressed) when diagramTool is not passed', () => {
    renderInEditor(<ComponentTray />);
    for (const label of DIAGRAM_TOOL_LABELS) {
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('search "arrow" finds only Connector', async () => {
    renderInEditor(<ComponentTray />);
    await userEvent.type(screen.getByLabelText('Search elements'), 'arrow');

    expect(screen.getByRole('button', { name: 'Connector' })).toBeInTheDocument();
    for (const label of DIAGRAM_TOOL_LABELS) {
      if (label === 'Connector') continue;
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
  });

  it.each(['diagram', 'flow', 'shape', 'DIAGRAM'])('search "%s" finds every diagram tool', async (query) => {
    renderInEditor(<ComponentTray />);
    await userEvent.type(screen.getByLabelText('Search elements'), query);

    for (const label of DIAGRAM_TOOL_LABELS) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('hides the Diagram group entirely when the search matches none of its tools', async () => {
    const { container } = renderInEditor(<ComponentTray />);
    await userEvent.type(screen.getByLabelText('Search elements'), 'avatar');

    expect(container.querySelector('[data-diagram-tray-group]')).toBeNull();
    expect(container.querySelector('[data-diagram-tray-item]')).toBeNull();
    // The Craft-only match still shows: the two groups are independent.
    expect(screen.getByRole('button', { name: 'About Avatar' })).toBeInTheDocument();
  });

  it('shows "No elements match." only once both the Craft list and the Diagram list are empty', async () => {
    renderInEditor(<ComponentTray />);
    await userEvent.type(screen.getByLabelText('Search elements'), 'zzz');
    expect(screen.getByText('No elements match.')).toBeInTheDocument();
  });

  it('diagram rows carry no drag attributes and are not counted as Craft tray items', () => {
    const { container } = renderInEditor(<ComponentTray />);
    for (const label of DIAGRAM_TOOL_LABELS) {
      const button = screen.getByRole('button', { name: label });
      expect(button).not.toHaveAttribute('draggable');
      expect(button).not.toHaveAttribute('data-tray-item');
      expect(button.closest('[data-tray-item]')).toBeNull();
    }
    // The Craft-only count (relied on elsewhere in this file) is unchanged.
    expect(container.querySelectorAll('[data-tray-item]')).toHaveLength(trayItems.length);
  });

  it('every diagram row also gets an "About <label>" docs button, hidden until hover or focus like any other row', () => {
    const { container } = renderInEditor(<ComponentTray />);
    // Scoped to the Diagram section: "About Text" also exists on the Craft
    // Text block's own row (see the regression test below), so an unscoped
    // query by that one name would be ambiguous.
    const diagramSection = container.querySelector<HTMLElement>('[data-diagram-tray-section="Diagram"]')!;
    for (const label of DIAGRAM_TOOL_LABELS) {
      const button = within(diagramSection).getByRole('button', { name: `About ${label}` });
      expect(button).toHaveAttribute('draggable', 'false');
      expect(button.className.split(/\s+/)).toEqual(
        expect.arrayContaining([
          'opacity-0',
          'group-hover:opacity-100',
          'focus-visible:opacity-100',
          'group-focus-within:opacity-100',
        ]),
      );
    }
  });

  it('the "i" button opens the Connector\'s own docs, distinct from any Craft block', async () => {
    renderInEditor(<ComponentTray />);
    await userEvent.click(screen.getByRole('button', { name: 'About Connector' }));

    const dialog = screen.getByRole('dialog', { name: 'Connector' });
    expect(within(dialog).getByText('Diagram')).toBeInTheDocument();
  });

  it('the "i" button on the diagram Text row opens a DIFFERENT dialog than the Craft Text block\'s (regression: same label, different element)', async () => {
    const { container } = renderInEditor(<ComponentTray />);
    const diagramSection = container.querySelector<HTMLElement>('[data-diagram-tray-section="Diagram"]')!;

    await userEvent.click(within(diagramSection).getByRole('button', { name: 'About Text' }));
    const diagramDialog = screen.getByRole('dialog', { name: 'Text' });
    expect(within(diagramDialog).getByText('Diagram')).toBeInTheDocument();
    expect(within(diagramDialog).getByText(/diagram canvas/)).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const craftTextRow = container.querySelector('[data-tray-item="Text"]')!.closest('li')!;
    await userEvent.click(within(craftTextRow).getByRole('button', { name: 'About Text' }));
    const craftDialog = screen.getByRole('dialog', { name: 'Text' });
    expect(within(craftDialog).getByText('Text and media')).toBeInTheDocument();
  });
});
