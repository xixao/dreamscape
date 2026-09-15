import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { ComponentBuilder } from './component-builder';
import { newComponent, type Tree } from '@/lib/custom-components/model';
vi.mock('../canvas-frame', () => ({
  CanvasFrame: ({ children, title, zoom, height }: { children: ReactNode; title: string; zoom: number; height: number }) => <div aria-label={title} data-zoom={zoom} data-height={height}>{children}</div>,
  useCanvasDocument: () => null,
}));
describe('Component Builder assembly', () => {
  beforeEach(() => localStorage.clear());
  it('drops elements into Layers at the requested parent and position, with undo', async () => {
    const save = vi.fn(); const user = userEvent.setup();
    render(<ComponentBuilder fileId="layer-drop" initial={newComponent()} existing instances={0} onClose={vi.fn()} onSave={save} />);
    const tree = screen.getByRole('tree', { name: 'Layers' });
    function drop(type: string, row: HTMLElement, y: number) {
      row.getBoundingClientRect = () => ({ top: 0, height: 40 } as DOMRect);
      const dataTransfer = { types: ['application/x-dreamscape-element'], getData: (key: string) => key === 'application/x-dreamscape-element' ? type : '' };
      for (const name of ['dragover', 'drop']) {
        const event = new Event(name, { bubbles: true, cancelable: true });
        Object.defineProperties(event, { dataTransfer: { value: dataTransfer }, clientY: { value: y } });
        fireEvent(row, event);
      }
    }
    drop('Card', within(tree).getByRole('button', { name: 'Frame' }).parentElement!, 20);
    await waitFor(() => expect(within(tree).getByRole('button', { name: 'Card' })).toBeInTheDocument());
    drop('Button', within(tree).getByRole('button', { name: 'Card' }).parentElement!, 20);
    await waitFor(() => expect(within(tree).getByRole('button', { name: 'Button' })).toBeInTheDocument());
    drop('Text', within(tree).getByRole('button', { name: 'Button' }).parentElement!, 2);
    await waitFor(() => {
      const saved = JSON.parse(save.mock.lastCall![0].layout) as Tree;
      const content = Object.values(saved).find(node => node.type.resolvedName === 'CardContent')!;
      expect(content.nodes.map(id => saved[id].type.resolvedName)).toEqual(['Text', 'Button']);
    });
    await user.click(screen.getByRole('button', { name: 'Undo component edit' }));
    await waitFor(() => expect(within(tree).queryByRole('button', { name: 'Text' })).not.toBeInTheDocument());
    expect(within(tree).getByRole('button', { name: 'Button' })).toBeInTheDocument();
  });
  it('opens inspector menus inside CC and applies distribution and image ratios', async () => {
    const user = userEvent.setup(); const save = vi.fn();
    render(<ComponentBuilder fileId="menus" initial={newComponent()} existing instances={0} onClose={vi.fn()} onSave={save} />);
    const builder = screen.getByRole('dialog', { name: 'Component Builder' });
    const picker = within(screen.getByRole('listbox', { name: 'Elements to add' }));
    await user.click(picker.getByRole('option', { name: 'Card' }));
    await user.click(picker.getByRole('option', { name: 'Frame' }));
    await user.click(screen.getByRole('combobox', { name: 'Distribution' }));
    expect(builder).toContainElement(screen.getByRole('option', { name: 'Space between' }));
    await user.click(screen.getByRole('option', { name: 'Center' }));
    await waitFor(() => {
      const tree = JSON.parse(save.mock.lastCall![0].layout) as Tree;
      expect(Object.values(tree).some(node => (node.props.justify as { mobile?: string } | undefined)?.mobile === 'center')).toBe(true);
    });
    await user.click(picker.getByRole('option', { name: 'Button' }));
    await user.type(screen.getByRole('combobox', { name: 'Add an element' }), 'image');
    await user.click(picker.getByRole('option', { name: 'Image' }));
    for (const [label, value, ratio] of [['Portrait (3:4)', 'portrait', '3 / 4'], ['Wide (21:9)', 'wide', '21 / 9'], ['Square', 'square', '1 / 1']]) {
      await user.click(screen.getByRole('combobox', { name: 'Aspect ratio' }));
      expect(builder).toContainElement(screen.getByRole('option', { name: label }));
      await user.click(screen.getByRole('option', { name: label }));
      await waitFor(() => {
        const tree = JSON.parse(save.mock.lastCall![0].layout) as Tree;
        expect(Object.values(tree).some(node => node.props.aspect === value)).toBe(true);
        expect(builder.querySelector('[data-image-surface]')).toHaveStyle({ aspectRatio: ratio });
      });
    }
  });
  it('autosaves existing edits without closing and reports file save state', async () => {
    const user = userEvent.setup(); const save = vi.fn(); const close = vi.fn();
    render(<ComponentBuilder fileId="auto" initial={newComponent()} existing instances={3} saveState="saving" onClose={close} onSave={save} />);
    expect(screen.queryByRole('button', { name: /Update component|Add to Components/ })).not.toBeInTheDocument();
    expect(screen.getByText('Used in 3 places')).toBeVisible();
    await user.type(screen.getByLabelText('Component name'), ' edited');
    await waitFor(() => expect(save.mock.lastCall?.[0].name).toBe('Untitled component edited'));
    expect(close).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Button' }));
    await waitFor(() => expect(JSON.parse(save.mock.lastCall![0].layout).ROOT.nodes).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: 'Undo component edit' }));
    await waitFor(() => expect(JSON.parse(save.mock.lastCall![0].layout).ROOT.nodes).toHaveLength(0));
    await user.click(screen.getByRole('button', { name: 'Back to file' }));
    expect(close).toHaveBeenCalledOnce();
  });
  it('creates linked card content without cross-component render updates', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const user = userEvent.setup();
      render(<ComponentBuilder fileId="render-safety" initial={newComponent()} existing={false} instances={0} onClose={vi.fn()} onSave={vi.fn()} />);
      const picker = within(screen.getByRole('listbox'));
      await user.click(picker.getByRole('option', { name: 'Card' }));
      await user.click(picker.getByRole('option', { name: 'Card' }));
      await user.click(picker.getByRole('option', { name: 'Text' }));
      expect(errors.mock.calls.filter(call => String(call[0]).includes('Cannot update a component'))).toEqual([]);
    } finally { errors.mockRestore(); }
  });
  it('changes frame direction across widths without confirmation and supports undo', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    try {
      const user = userEvent.setup();
      render(<ComponentBuilder fileId="direction-copy" initial={newComponent()} existing={false} instances={0} onClose={vi.fn()} onSave={vi.fn()} />);
      await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Frame' }));
      await user.click(screen.getByRole('radio', { name: 'Horizontal' }));
      expect(confirm).not.toHaveBeenCalled();
      expect(screen.getByText('Layout changes apply at every component width. You can undo any change.')).toBeVisible();
      expect(screen.getByRole('radio', { name: 'Horizontal' })).toHaveAttribute('aria-checked', 'true');
      await user.click(screen.getByRole('button', { name: 'Undo component edit' }));
      expect(screen.getByRole('radio', { name: 'Vertical' })).toHaveAttribute('aria-checked', 'true');
    } finally { confirm.mockRestore(); }
  });
  it('filters atoms and inserts by keyboard while keeping Design visible', async () => {
    const user = userEvent.setup();
    render(<ComponentBuilder fileId="picker" initial={newComponent()} existing={false} instances={0} onClose={vi.fn()} onSave={vi.fn()} />);
    const input = screen.getByRole('combobox', { name: 'Add an element' });
    expect(screen.getByRole('complementary', { name: 'Builder design' })).toBeVisible();
    await user.type(input, 'card');
    expect(within(screen.getByRole('listbox', { name: 'Elements to add' })).getAllByRole('option')).toHaveLength(1);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(input).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Title' })).toBeVisible();
    await user.type(input, 'text');
    const results = within(screen.getByRole('listbox', { name: 'Elements to add' })).getAllByRole('option');
    if (results.length > 1) {
      await user.keyboard('{ArrowDown}');
      expect(results[1]).toHaveAttribute('aria-selected', 'true');
      await user.keyboard('{ArrowUp}');
    }
    await user.keyboard('{Enter}');
    expect(input).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Add to Components' })).toBeEnabled();
    await user.type(input, 'zzzznothing');
    expect(screen.getByRole('status')).toHaveTextContent('No matching elements');
    await user.keyboard('{Enter}{Escape}');
    expect(input).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Browse all' }));
    expect(within(screen.getByRole('listbox', { name: 'Elements to add' })).getAllByRole('option').length).toBeGreaterThan(6);
  });
  it('compares editable widths, preserves sizes, and supports fixed height', async () => {
    const user = userEvent.setup();
    render(<ComponentBuilder fileId="views" initial={newComponent()} existing={false} instances={0} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByLabelText('mobile component preview')).toBeVisible();
    expect(screen.getByLabelText('desktop component preview')).not.toBeVisible();
    expect(screen.getByLabelText('Narrow width')).toHaveValue(320);
    expect(screen.getByLabelText('Narrow height mode')).toHaveValue('fit');
    fireEvent.change(screen.getByLabelText('Narrow width'), { target: { value: '450' } });
    await user.click(screen.getByRole('button', { name: 'Compare widths' }));
    for (const size of ['desktop', 'tablet', 'mobile']) expect(screen.getByLabelText(`${size} component preview`)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Single frame' }));
    expect(screen.getByLabelText('Narrow width')).toHaveValue(450);
    fireEvent.keyDown(screen.getAllByTestId('resize-handle-height')[0], { key: 'ArrowDown' });
    expect(screen.getByLabelText('Narrow height mode')).toHaveValue('fixed');
    expect(screen.getByRole('button', { name: 'Undo component edit' })).toBeDisabled();
  });
  it('zooms all previews together without changing widths or editing history', async () => {
    const user = userEvent.setup();
    render(<ComponentBuilder fileId="zoom" initial={newComponent()} existing={false} instances={0} onClose={vi.fn()} onSave={vi.fn()} />);
    const previews = ['desktop', 'tablet', 'mobile'].map(size => screen.getByLabelText(`${size} component preview`));
    const initial = previews.map(el => Number(el.dataset.zoom));
    const widths = ['Narrow', 'Medium', 'Wide'].map(label => (screen.getByLabelText(`${label} width`) as HTMLInputElement).value);
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    previews.forEach((el, index) => expect(Number(el.dataset.zoom)).toBeCloseTo(initial[index] * 1.25));
    await user.click(screen.getByRole('button', { name: 'Zoom out' }));
    previews.forEach((el, index) => expect(Number(el.dataset.zoom)).toBeCloseTo(initial[index]));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: '=', ctrlKey: true });
    previews.forEach((el, index) => expect(Number(el.dataset.zoom)).toBeCloseTo(initial[index] * 1.25));
    await user.click(screen.getByRole('button', { name: 'Fit' }));
    previews.forEach((el, index) => expect(Number(el.dataset.zoom)).toBeCloseTo(initial[index]));
    expect(['Narrow', 'Medium', 'Wide'].map(label => (screen.getByLabelText(`${label} width`) as HTMLInputElement).value)).toEqual(widths);
    expect(screen.getByRole('button', { name: 'Undo component edit' })).toBeDisabled();
  });
  it('keeps a mobile layout override separate and resets it to the shared value', async () => {
    const user = userEvent.setup();
    render(<ComponentBuilder fileId="responsive" initial={newComponent()} existing={false} instances={0} onClose={vi.fn()} onSave={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Compare widths' }));
    await user.click(screen.getByRole('radio', { name: 'Horizontal' }));

    await user.click(screen.getByRole('button', { name: 'This width range' }));
    await user.click(screen.getByRole('radio', { name: 'Vertical' }));
    const rootFor = (size: string) => screen.getByLabelText(`${size} component preview`).querySelector('[data-block="LayoutBox"]');
    await waitFor(() => expect(rootFor('mobile')).toHaveClass('flex-col'));
    expect(rootFor('desktop')).toHaveClass('flex-row');
    expect(rootFor('tablet')).toHaveClass('flex-row');
    await user.click(screen.getByRole('button', { name: 'Use shared value' }));
    await waitFor(() => expect(rootFor('mobile')).toHaveClass('flex-row'));
  });
  it('grows the compact frame when added card content exceeds its height', async () => {
    const user = userEvent.setup();
    render(<ComponentBuilder fileId="growth" initial={newComponent()} existing={false} instances={0} onClose={vi.fn()} onSave={vi.fn()} />);
    const tray = within(screen.getByRole('complementary', { name: 'Builder elements' }));
    await user.click(tray.getByRole('option', { name: 'Card' }));
    const content = screen.getByLabelText('mobile component preview').querySelector('.component-builder-preview')!;
    Object.defineProperty(content, 'scrollHeight', { configurable: true, value: 720 });
    await user.click(tray.getByRole('option', { name: 'Text' }));
    await waitFor(() => expect(screen.getByLabelText('mobile component preview')).toHaveAttribute('data-height', '720'));
    expect(within(screen.getByLabelText('mobile component preview')).getByText('Text')).toBeVisible();
    Object.defineProperty(content, 'scrollHeight', { configurable: true, value: 200 });
    await user.click(tray.getByRole('option', { name: 'Text' }));
    await waitFor(() => expect(screen.getByLabelText('mobile component preview')).toHaveAttribute('data-height', '200'));
    await user.selectOptions(screen.getByLabelText('Narrow height mode'), 'fixed');
    Object.defineProperty(content, 'scrollHeight', { configurable: true, value: 900 });
    await user.click(tray.getByRole('option', { name: 'Text' }));
    expect(screen.getByLabelText('mobile component preview')).toHaveAttribute('data-height', '400');
  });
  it('assembles inside a card content zone and keeps the three trees identical', async () => {
    const user = userEvent.setup(); const save = vi.fn();
    render(<ComponentBuilder fileId="nested" initial={newComponent()} existing={false} instances={0} onClose={vi.fn()} onSave={save} />);
    const tray = within(screen.getByRole('complementary', { name: 'Builder elements' }));
    await user.click(tray.getByRole('option', { name: 'Card' }));
    await user.click(tray.getByRole('option', { name: 'Text' }));
    await user.click(screen.getByRole('button', { name: 'Add to Components' }));
    const tree = JSON.parse(save.mock.calls[0][0].layout) as Tree;
    expect(tree.ROOT.nodes).toHaveLength(1);
    const card = tree[tree.ROOT.nodes[0]];
    const content = tree[card.linkedNodes.content];
    expect(content.nodes.some(id => tree[id].type.resolvedName === 'Text')).toBe(true);
  });
  it('adds an element to all sizes, saves it, and undoes/redoes one shared edit', async () => {
    const user = userEvent.setup(); const save = vi.fn();
    render(<ComponentBuilder fileId="test" initial={newComponent()} existing={false} instances={0} onClose={vi.fn()} onSave={save} />);
    await user.click(within(screen.getByRole('complementary', { name: 'Builder elements' })).getByRole('option', { name: 'Button' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add to Components' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Compare widths' }));
    for (const size of ['desktop', 'tablet', 'mobile']) expect(within(screen.getByLabelText(`${size} component preview`)).getByRole('button', { name: 'Button' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo component edit' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add to Components' })).toBeDisabled());
    await user.click(screen.getByRole('button', { name: 'Redo component edit' }));
    await user.clear(screen.getByLabelText('Component name')); await user.type(screen.getByLabelText('Component name'), 'Contact card');
    await user.click(screen.getByRole('button', { name: 'Add to Components' }));
    expect(save).toHaveBeenCalledTimes(1);
    const saved = save.mock.calls[0][0]; expect(saved.name).toBe('Contact card');
    const tree = JSON.parse(saved.layout) as Tree; expect(tree.ROOT.nodes).toHaveLength(1);
    expect(tree[tree.ROOT.nodes[0]].type.resolvedName).toBe('Button');
  });
});

it('opens and closes the existing Chat panel from the builder header', async () => {
  render(<ComponentBuilder fileId="cc-chat" initial={newComponent()} existing instances={0} onClose={vi.fn()} onSave={vi.fn()} />);
  const toggle = screen.getByRole('radio', { name: 'Chat' });
  await userEvent.click(toggle);
  expect(screen.getByRole('complementary', { name: 'Chat' })).toHaveClass('left-3');
  expect(screen.queryByRole('complementary', { name: 'Layers panel' })).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Message' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Chat' })).toHaveAttribute('data-state', 'on');
  await userEvent.click(screen.getByRole('radio', { name: 'Layers' }));
  expect(screen.queryByRole('complementary', { name: 'Chat' })).not.toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Layers' })).toHaveAttribute('data-state', 'on');
  expect(screen.getByRole('complementary', { name: 'Layers panel' })).toBeInTheDocument();
});

it('switches the left panel between Layers and Chat using its tabs', async () => {
  render(<ComponentBuilder fileId="cc-tabs" initial={newComponent()} existing instances={0} onClose={vi.fn()} onSave={vi.fn()} />);
  await userEvent.click(screen.getByRole('radio', { name: 'Chat' }));
  expect(screen.getByRole('complementary', { name: 'Chat' })).toBeInTheDocument();
  expect(screen.queryByRole('complementary', { name: 'Layers panel' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('radio', { name: 'Layers' }));
  expect(screen.getByRole('complementary', { name: 'Layers panel' })).toBeInTheDocument();
  expect(screen.queryByRole('complementary', { name: 'Chat' })).not.toBeInTheDocument();
});

it('collapses Chat to a rail and expands it again', async () => {
  render(<ComponentBuilder fileId="cc-chat-collapse" initial={newComponent()} existing instances={0} onClose={vi.fn()} onSave={vi.fn()} />);
  await userEvent.click(screen.getByRole('radio', { name: 'Chat' }));
  await userEvent.click(screen.getByRole('button', { name: 'Minimize chat panel' }));
  expect(screen.getByRole('complementary', { name: 'Chat' })).toHaveStyle({ width: '40px' });
  expect(screen.queryByRole('textbox', { name: 'Message' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Expand chat panel' }));
  expect(screen.getByRole('textbox', { name: 'Message' })).toBeInTheDocument();
});
