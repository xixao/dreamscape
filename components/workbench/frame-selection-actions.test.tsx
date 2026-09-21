import { ComponentLibraryProvider } from './component-builder/library-context';
import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { it, expect, vi } from 'vitest';
import { Element, Frame } from '@craftjs/core';
import { renderInEditor } from '@/test/craft-harness';
import { LayoutBox } from '@/components/blocks/layout-box';
import { Button } from '@/components/blocks/button';
import { FrameSelectionActions } from './frame-selection-actions';
function setup() {
  return renderInEditor(<><Frame><Element is={LayoutBox} canvas direction={{ mobile: 'row' }}><Button label="First" /><Button label="Second" /><Button label="Last" /></Element></Frame><FrameSelectionActions /><input aria-label="Typing" /></>);
}
it('F wraps a reversed multi-selection in document order and supports single-step undo/redo', () => {
  const { editor } = setup();
  const ids = editor().query.node('ROOT').get().data.nodes;
  act(() => { editor().actions.selectNode([ids[1], ids[0]]); editor().actions.history.clear(); });
  fireEvent.keyDown(document.body, { key: 'f' });
  const wrapper = editor().query.node('ROOT').get().data.nodes[0];
  expect(editor().query.node(wrapper).get().data.nodes).toEqual(ids.slice(0, 2));
  expect(editor().query.node(wrapper).get().data.props.direction).toEqual({ mobile: 'row' });
  expect(editor().query.node('ROOT').get().data.nodes).toEqual([wrapper, ids[2]]);
  act(() => editor().actions.history.undo());
  expect(editor().query.node('ROOT').get().data.nodes).toEqual(ids);
  expect(editor().query.history.canUndo()).toBe(false);
  act(() => editor().actions.history.redo());
  expect(editor().query.node(wrapper).get().data.nodes).toEqual(ids.slice(0, 2));
});
it('does not wrap while typing or when the root is selected', () => {
  const { editor } = setup();
  const ids = editor().query.node('ROOT').get().data.nodes;
  act(() => editor().actions.selectNode(ids[0]));
  fireEvent.keyDown(screen.getByLabelText('Typing'), { key: 'f' });
  expect(editor().query.node('ROOT').get().data.nodes).toEqual(ids);
  act(() => editor().actions.selectNode('ROOT'));
  fireEvent.keyDown(document.body, { key: 'f' });
  expect(editor().query.node('ROOT').get().data.nodes).toEqual(ids);
});
it('offers a Frame submenu with Horizontal and Vertical and preserves multi-selection on right click', async () => {
  const { editor } = setup();
  const ids = editor().query.node('ROOT').get().data.nodes;
  act(() => editor().actions.selectNode(ids.slice(0, 2)));
  fireEvent.contextMenu(screen.getByRole('button', { name: 'First' }), { clientX: 30, clientY: 30 });
  const menu = await screen.findByRole('menuitem', { name: /Frame/ });
  await userEvent.click(menu);
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Vertical' }));
  const wrapper = editor().query.node('ROOT').get().data.nodes[0];
  expect(editor().query.node(wrapper).get().data.nodes).toEqual(ids.slice(0, 2));
  expect(editor().query.node(wrapper).get().data.props.direction).toEqual({ mobile: 'column' });
});
it('wraps one right-clicked element horizontally without changing its content', async () => {
  const { editor } = setup();
  const ids = editor().query.node('ROOT').get().data.nodes;
  fireEvent.contextMenu(screen.getByRole('button', { name: 'Second' }), { clientX: 30, clientY: 30 });
  await userEvent.click(await screen.findByRole('menuitem', { name: /Frame/ }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Horizontal' }));
  const children = editor().query.node('ROOT').get().data.nodes;
  const wrapper = editor().query.node(children[1]).get().data;
  expect(children).toEqual([ids[0], children[1], ids[2]]);
  expect(wrapper.nodes).toEqual([ids[1]]);
  expect(wrapper.props.direction).toEqual({ mobile: 'row' });
  expect(editor().query.node(ids[1]).get().data.props.label).toBe('Second');
});
it('duplicates a multi-selection with one-step undo and keeps original content', () => {
  const { editor } = setup();
  const ids = editor().query.node('ROOT').get().data.nodes;
  act(() => { editor().actions.selectNode(ids.slice(0, 2)); editor().actions.history.clear(); });
  fireEvent.keyDown(document.body, { key: 'd', metaKey: true });
  const children = editor().query.node('ROOT').get().data.nodes;
  expect(children).toHaveLength(5);
  expect(editor().query.node(children[1]).get().data.props.label).toBe('First');
  expect(editor().query.node(children[3]).get().data.props.label).toBe('Second');
  act(() => editor().actions.history.undo());
  expect(editor().query.node('ROOT').get().data.nodes).toEqual(ids);
  expect(editor().query.history.canUndo()).toBe(false);
});
it('navigates children, parents and siblings and reorders along the layout axis', () => {
  const { editor } = setup();
  const ids = editor().query.node('ROOT').get().data.nodes;
  act(() => editor().actions.selectNode(ids[0]));
  fireEvent.keyDown(document.body, { key: 'Tab' });
  expect([...editor().query.getState().events.selected]).toEqual([ids[1]]);
  fireEvent.keyDown(document.body, { key: 'Tab', shiftKey: true });
  expect([...editor().query.getState().events.selected]).toEqual([ids[0]]);
  fireEvent.keyDown(document.body, { key: 'ArrowRight' });
  expect(editor().query.node('ROOT').get().data.nodes).toEqual([ids[1], ids[0], ids[2]]);
  fireEvent.keyDown(document.body, { key: 'Enter', shiftKey: true });
  expect([...editor().query.getState().events.selected]).toEqual(['ROOT']);
  fireEvent.keyDown(document.body, { key: 'Enter' });
  expect([...editor().query.getState().events.selected]).toEqual([ids[1], ids[0], ids[2]]);
  fireEvent.keyDown(document.body, { key: 'Escape' });
  expect([...editor().query.getState().events.selected]).toEqual([]);
});
it('deletes multiple selected elements together and does not intercept text editing', () => {
  const { editor } = setup();
  const ids = editor().query.node('ROOT').get().data.nodes;
  act(() => editor().actions.selectNode(ids.slice(0, 2)));
  fireEvent.keyDown(screen.getByLabelText('Typing'), { key: 'd', metaKey: true });
  fireEvent.keyDown(screen.getByLabelText('Typing'), { key: 'Backspace' });
  expect(editor().query.node('ROOT').get().data.nodes).toEqual(ids);
  fireEvent.keyDown(document.body, { key: 'Backspace' });
  expect(editor().query.node('ROOT').get().data.nodes).toEqual([ids[2]]);
  act(() => editor().actions.history.undo());
  expect(editor().query.node('ROOT').get().data.nodes).toEqual(ids);
});
it('opens View Code for the selected subtree', async () => {
  setup();
  fireEvent.contextMenu(screen.getByRole('button', { name: 'Second' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'View Code' }));
  expect(await screen.findByRole('dialog')).toHaveTextContent('React / TSX');
  expect(screen.getByRole('dialog')).toHaveTextContent('"label": "Second"');
  expect(screen.getByRole('dialog')).not.toHaveTextContent('"label": "First"');
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('handles F and duplicate inside the CC dialog without changing the underlying editor', () => {
  const { editor } = renderInEditor(<div role="dialog" aria-label="Component Builder"><Frame><Element is={LayoutBox} canvas><Button label="Inside builder" /></Element></Frame><FrameSelectionActions builder /><div data-testid="builder-surface" /></div>);
  const id = editor().query.node('ROOT').get().data.nodes[0];
  act(() => editor().actions.selectNode(id));
  fireEvent.keyDown(screen.getByTestId('builder-surface'), { key: 'f' });
  const frame = editor().query.node('ROOT').get().data.nodes[0];
  expect(editor().query.node(frame).get().data.nodes).toEqual([id]);
  fireEvent.keyDown(screen.getByTestId('builder-surface'), { key: 'd', metaKey: true });
  expect(editor().query.node('ROOT').get().data.nodes).toHaveLength(2);
});
it('copies multiple elements, pastes into a frame, and undoes the paste in one step', () => {
  const { editor } = setup();
  const ids = editor().query.node('ROOT').get().data.nodes;
  const data: Record<string, string> = {};
  const clipboardData = { setData: (type: string, value: string) => { data[type] = value; }, getData: (type: string) => data[type] ?? '' };
  act(() => editor().actions.selectNode([ids[1], ids[0]]));
  fireEvent.copy(document.body, { clipboardData });
  act(() => { editor().actions.selectNode('ROOT'); editor().actions.history.clear(); });
  fireEvent.paste(document.body, { clipboardData });
  const children = editor().query.node('ROOT').get().data.nodes;
  expect(children).toHaveLength(5);
  expect(editor().query.node(children[3]).get().data.props.label).toBe('First');
  expect(editor().query.node(children[4]).get().data.props.label).toBe('Second');
  act(() => editor().actions.history.undo());
  expect(editor().query.node('ROOT').get().data.nodes).toEqual(ids);
  expect(editor().query.history.canUndo()).toBe(false);
});
it('cuts selected elements without intercepting normal input copy', () => {
  const { editor } = setup();
  const ids = editor().query.node('ROOT').get().data.nodes;
  const data: Record<string, string> = {};
  const clipboardData = { setData: (type: string, value: string) => { data[type] = value; }, getData: (type: string) => data[type] ?? '' };
  act(() => editor().actions.selectNode(ids[0]));
  fireEvent.cut(screen.getByLabelText('Typing'), { clipboardData });
  expect(data).toEqual({});
  fireEvent.cut(document.body, { clipboardData });
  expect(editor().query.node('ROOT').get().data.nodes).toEqual(ids.slice(1));
  expect(data['text/plain']).toContain('First');
  act(() => editor().actions.history.undo());
  expect(editor().query.node('ROOT').get().data.nodes).toEqual(ids);
});
it('centers using the same responsive parent layout properties as the inspector', () => {
  const { editor } = setup();
  act(() => editor().actions.selectNode(editor().query.node('ROOT').get().data.nodes[0]));
  fireEvent.keyDown(document.body, { key: '˙', code: 'KeyH', altKey: true });
  expect(editor().query.node('ROOT').get().data.props.justify.desktop).toBe('center');
  fireEvent.keyDown(document.body, { key: '√', code: 'KeyV', altKey: true });
  expect(editor().query.node('ROOT').get().data.props.align.desktop).toBe('center');
});
it('creates a named reusable component from selection and detaches its instance with content intact', async () => {
  const saved = vi.fn();
  const { editor } = renderInEditor(<ComponentLibraryProvider fileId="shortcuts-test" components={[]} onSave={saved} onRemove={() => {}} count={() => 0}>
    <Frame><Element is={LayoutBox} canvas><Button label="Keep this label" /></Element></Frame><FrameSelectionActions />
  </ComponentLibraryProvider>);
  const id = editor().query.node('ROOT').get().data.nodes[0];
  act(() => editor().actions.selectNode(id));
  fireEvent.keyDown(document.body, { key: '˚', code: 'KeyK', metaKey: true, altKey: true });
  await userEvent.clear(screen.getByLabelText('Component name'));
  await userEvent.type(screen.getByLabelText('Component name'), 'My action');
  await userEvent.click(screen.getByRole('button', { name: 'Create component' }));
  expect(saved).toHaveBeenCalledWith(expect.objectContaining({ name: 'My action' }));
  expect(editor().query.node(id).get().data.name).toBe('CustomComponent');
  act(() => editor().actions.selectNode(id));
  fireEvent.keyDown(document.body, { key: '≈', code: 'KeyX', metaKey: true, altKey: true });
  const detached = editor().query.node(id).get();
  expect(detached.data.name).toBe('LayoutBox');
  expect(editor().query.node(detached.data.nodes[0]).get().data.props.label).toBe('Keep this label');
});

it('reorders from a layer row and preserves selection with one-step undo', () => {
  const { editor } = setup();
  const ids = editor().query.node('ROOT').get().data.nodes;
  act(() => { editor().actions.selectNode(ids[1]); editor().actions.history.clear(); });
  const row = document.createElement('button');
  row.setAttribute('data-drag-layer', ids[1]); document.body.append(row);
  fireEvent.keyDown(row, { key: 'ArrowRight' });
  expect(editor().query.node('ROOT').get().data.nodes).toEqual([ids[0], ids[2], ids[1]]);
  expect([...editor().query.getState().events.selected]).toEqual([ids[1]]);
  fireEvent.keyDown(row, { key: 'ArrowRight' });
  expect(editor().query.node('ROOT').get().data.nodes).toEqual([ids[0], ids[2], ids[1]]);
  act(() => editor().actions.history.undo());
  expect(editor().query.node('ROOT').get().data.nodes).toEqual(ids);
  expect(editor().query.history.canUndo()).toBe(false);
  row.remove();
});
it('moves an entire nested row below its next sibling in a vertical layout', () => {
  const { editor } = renderInEditor(<><Frame><Element is={LayoutBox} canvas direction={{ mobile: 'column' }}><Element is={LayoutBox} canvas direction={{ mobile: 'row' }}><Button label="Card one" /><Button label="Card two" /></Element><Button label="Table placeholder" /></Element></Frame><FrameSelectionActions /></>);
  const ids = editor().query.node('ROOT').get().data.nodes;
  const children = editor().query.node(ids[0]).get().data.nodes;
  act(() => { editor().actions.selectNode(ids[0]); editor().actions.history.clear(); });
  fireEvent.keyDown(document.body, { key: 'ArrowDown' });
  expect(editor().query.node('ROOT').get().data.nodes).toEqual([ids[1], ids[0]]);
  expect(editor().query.node(ids[0]).get().data.nodes).toEqual(children);
  act(() => editor().actions.history.undo());
  expect(editor().query.node('ROOT').get().data.nodes).toEqual(ids);
});

it('uses the rendered horizontal grid rather than its unused column direction', () => {
  const { editor } = setup();
  const root = editor().query.node('ROOT').get();
  const ids = root.data.nodes;
  act(() => { editor().actions.setProp('ROOT', p => { p.mode = 'grid'; p.direction = { mobile: 'column' }; }); editor().actions.selectNode(ids[0]); });
  const spies = ids.map((id, i) => vi.spyOn(editor().query.node(id).get().dom!, 'getBoundingClientRect').mockReturnValue({ left: i * 110, right: i * 110 + 100, top: 0, bottom: 80, width: 100, height: 80 } as DOMRect));
  fireEvent.keyDown(document.body, { key: 'ArrowRight' });
  expect(editor().query.node('ROOT').get().data.nodes).toEqual([ids[1], ids[0], ids[2]]);
  spies.forEach(spy => spy.mockRestore());
});
