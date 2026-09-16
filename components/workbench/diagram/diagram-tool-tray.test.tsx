import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DiagramToolTray } from './diagram-tool-tray';
import { POINTER_TOOL, type DiagramTool } from './diagram-layer';
import { DIAGRAM_TOOL_ITEMS } from './diagram-palette';

const DIAGRAM_TOOL_LABELS = DIAGRAM_TOOL_ITEMS.map((item) => item.label);

// The Diagrams tab (spec docs/superpowers/specs/2026-09-14-panel-tabs-icons-
// design.md): the seven tools the floating palette (Shift+D) also offers,
// as this tab's own full body - moved here from component-tray.tsx's now-
// removed Elements-tab Diagram group (spec docs/superpowers/specs/2026-09-
// 13-diagrams-design.md section 13), which this test file's own describe
// block below is adapted from. Unlike ComponentTray, DiagramToolTray needs
// no Craft `<Editor>` context (no connectors.create, no drag source) - a
// plain render() is enough, the same precedent diagram-palette.test.tsx
// already set for the floating palette these rows mirror.
describe('DiagramToolTray', () => {
  it('renders no panel chrome of its own: no landmark, no "Diagrams" title', () => {
    render(<DiagramToolTray />);
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.queryByText('Diagrams')).toBeNull();
  });

  it('lists all seven diagram tools, in the palette\'s own order', () => {
    // Icon-only tiles (Matt, 2026-09-14: "designers will recognize the
    // shapes without labels, so remove those too") - each tool's name
    // lives in aria-label/title, not visible text, so this reads the
    // accessible name rather than textContent.
    const { container } = render(<DiagramToolTray />);
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-diagram-tool-item]'));
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual(DIAGRAM_TOOL_LABELS);
  });

  it('clicking a shape row calls onSelectDiagramTool with that shape', async () => {
    const onSelectDiagramTool = vi.fn();
    render(<DiagramToolTray diagramTool={POINTER_TOOL} onSelectDiagramTool={onSelectDiagramTool} />);

    await userEvent.click(screen.getByRole('button', { name: 'Decision' }));

    expect(onSelectDiagramTool).toHaveBeenCalledTimes(1);
    expect(onSelectDiagramTool).toHaveBeenCalledWith({ kind: 'shape', shape: 'decision' });
  });

  it('clicking the Connector row calls onSelectDiagramTool with the connector tool', async () => {
    const onSelectDiagramTool = vi.fn();
    render(<DiagramToolTray diagramTool={POINTER_TOOL} onSelectDiagramTool={onSelectDiagramTool} />);

    await userEvent.click(screen.getByRole('button', { name: 'Connector' }));

    expect(onSelectDiagramTool).toHaveBeenCalledWith({ kind: 'connector' });
  });

  it('does nothing (never throws) on click when onSelectDiagramTool is not passed', async () => {
    render(<DiagramToolTray />);
    await expect(userEvent.click(screen.getByRole('button', { name: 'Note' }))).resolves.not.toThrow();
  });

  it("shows only the armed tool's row as aria-pressed", () => {
    const diagramTool: DiagramTool = { kind: 'shape', shape: 'note' };
    render(<DiagramToolTray diagramTool={diagramTool} />);

    expect(screen.getByRole('button', { name: 'Note' })).toHaveAttribute('aria-pressed', 'true');
    for (const label of DIAGRAM_TOOL_LABELS) {
      if (label === 'Note') continue;
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('the armed tool follows the connector tool too', () => {
    render(<DiagramToolTray diagramTool={{ kind: 'connector' }} />);
    expect(screen.getByRole('button', { name: 'Connector' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Rectangle' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('defaults to the plain pointer (nothing pressed) when diagramTool is not passed', () => {
    render(<DiagramToolTray />);
    for (const label of DIAGRAM_TOOL_LABELS) {
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false');
    }
  });

  describe('search', () => {
    it('search "arrow" finds only Connector', async () => {
      render(<DiagramToolTray />);
      await userEvent.type(screen.getByLabelText('Search tools'), 'arrow');

      expect(screen.getByRole('button', { name: 'Connector' })).toBeInTheDocument();
      for (const label of DIAGRAM_TOOL_LABELS) {
        if (label === 'Connector') continue;
        expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
      }
    });

    it.each(['diagram', 'flow', 'shape', 'DIAGRAM'])('search "%s" finds every diagram tool', async (query) => {
      render(<DiagramToolTray />);
      await userEvent.type(screen.getByLabelText('Search tools'), query);

      for (const label of DIAGRAM_TOOL_LABELS) {
        expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
      }
    });

    it('shows "No tools match." when the search matches nothing, and clears back to the full list', async () => {
      const { container } = render(<DiagramToolTray />);
      const input = screen.getByLabelText('Search tools');

      await userEvent.type(input, 'zzz');
      expect(container.querySelectorAll('[data-diagram-tool-item]')).toHaveLength(0);
      expect(screen.getByText('No tools match.')).toBeInTheDocument();

      await userEvent.clear(input);
      expect(container.querySelectorAll('[data-diagram-tool-item]')).toHaveLength(DIAGRAM_TOOL_LABELS.length);
      expect(screen.queryByText('No tools match.')).not.toBeInTheDocument();
    });

    it('keeps every item for a blank or whitespace query', async () => {
      const { container } = render(<DiagramToolTray />);
      await userEvent.type(screen.getByLabelText('Search tools'), '   ');
      expect(container.querySelectorAll('[data-diagram-tool-item]')).toHaveLength(DIAGRAM_TOOL_LABELS.length);
    });
  });

  describe('the "i" (About) button', () => {
    it('gives every row an "About <label>" button, hidden until hover or focus like the Components tab\'s own rows', () => {
      const { container } = render(<DiagramToolTray />);
      for (const label of DIAGRAM_TOOL_LABELS) {
        const button = screen.getByRole('button', { name: `About ${label}` });
        expect(button).toHaveAttribute('type', 'button');
        expect(button).toHaveAttribute('draggable', 'false');
        const classes = button.className.split(/\s+/);
        for (const className of ['opacity-0', 'group-hover:opacity-100', 'focus-visible:opacity-100', 'group-focus-within:opacity-100']) {
          expect(classes, `${label}: ${className}`).toContain(className);
        }
      }
      expect(container).toBeInTheDocument();
    });

    it("opens that tool's own docs dialog", async () => {
      render(<DiagramToolTray />);
      await userEvent.click(screen.getByRole('button', { name: 'About Connector' }));

      const dialog = screen.getByRole('dialog', { name: 'Connector' });
      expect(within(dialog).getByText('Diagram')).toBeInTheDocument();
    });

    it('is one dialog for the whole tray: opening another tool shows that tool, never a second dialog', async () => {
      render(<DiagramToolTray />);

      await userEvent.click(screen.getByRole('button', { name: 'About Rectangle' }));
      expect(screen.getByRole('dialog', { name: 'Rectangle' })).toBeInTheDocument();
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

      await userEvent.click(screen.getByRole('button', { name: 'About Terminal' }));
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(screen.getByRole('dialog', { name: 'Terminal' })).toBeInTheDocument();
    });

    it('Escape closes the dialog and returns focus to the button that opened it', async () => {
      render(<DiagramToolTray />);
      const button = screen.getByRole('button', { name: 'About Note' });

      await userEvent.click(button);
      expect(screen.getByRole('dialog', { name: 'Note' })).toBeInTheDocument();
      expect(button).not.toHaveFocus();

      await userEvent.keyboard('{Escape}');

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await waitFor(() => expect(button).toHaveFocus());
    });

    it('keeps the button on a filtered row and drops it with the row', async () => {
      render(<DiagramToolTray />);
      await userEvent.type(screen.getByLabelText('Search tools'), 'arrow');
      expect(screen.getAllByRole('button', { name: /^About / })).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'About Connector' })).toBeInTheDocument();
    });
  });

  it('shapes are draggable without being mistaken for Craft blocks', () => {
    render(<DiagramToolTray />);
    for (const label of DIAGRAM_TOOL_LABELS) {
      const button = screen.getByRole('button', { name: label });
      expect(button).toHaveAttribute('draggable', label === 'Connector' ? 'false' : 'true');
      expect(button).not.toHaveAttribute('data-tray-item');
    }
  });
});
