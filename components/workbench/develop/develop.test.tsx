import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { SerializedNodes } from '@craftjs/core';
import { createCommentStore } from '@/lib/comments/store';
import { createAnnotation, createDesignerAnnotation } from '@/lib/accessibility/kit';
import { Player } from '@/components/play/player';
import type { FileRecord } from '@/lib/files/repository';
import { componentPath, findComponents, matchingCommands, isTyping } from './model';

const nodes: SerializedNodes = {
  ROOT: { type: { resolvedName: 'LayoutBox' }, isCanvas: true, props: {}, displayName: 'Frame', custom: {}, hidden: false, nodes: ['button', 'input'], linkedNodes: {}, parent: null },
  button: { type: { resolvedName: 'Button' }, isCanvas: false, props: { label: 'Continue' }, displayName: 'Button', custom: { layerName: 'Primary action', interactions: [{ id: 'go', trigger: 'click', action: 'navigate', targetScreenId: 'two' }] }, hidden: false, nodes: [], linkedNodes: {}, parent: 'ROOT' },
  input: { type: { resolvedName: 'Input' }, isCanvas: false, props: { placeholder: 'Type here' }, displayName: 'Input', custom: {}, hidden: false, nodes: [], linkedNodes: {}, parent: 'ROOT' },
};
const file: FileRecord = { id: 'dev-test', name: 'Test', createdAt: '', updatedAt: '', screens: [
  { id: 'one', pageId: 'page', name: 'First', layout: JSON.stringify(nodes), stageWidth: 800, stageHeight: 600 },
  { id: 'two', pageId: 'page', name: 'Second', layout: JSON.stringify({ ROOT: { ...nodes.ROOT, nodes: [] } }), stageWidth: 800, stageHeight: 600 },
] };
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); });
async function selectButton() {
  await waitFor(() => expect(screen.getByRole('navigation', { name: 'Develop toolbar' })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(screen.getByRole('region', { name: 'Component details' })).toBeInTheDocument());
}
describe('Develop experience', () => {
  it('finds components by layer name and content; prioritizes exact commands', () => {
    expect(findComponents(nodes, 'primary')).toEqual(['button']);
    expect(findComponents(nodes, 'continue')).toEqual(['button']);
    expect(componentPath(nodes, 'button')).toEqual(['Frame', 'Primary action']);
    expect(matchingCommands('/copy props')[0][0]).toBe('/copy props');
    const input = document.createElement('input'); expect(isTyping(input)).toBe(true);
  });
  it('pins props without firing navigation; Interact uses the real prototype', async () => {
    const original = JSON.stringify(file);
    render(<Player developer file={file} />);
    await selectButton();
    expect(screen.getByRole('combobox', { name: 'Develop screen' })).toHaveValue('one');
    expect(screen.getByRole('region', { name: 'Component details' })).toHaveTextContent('Continue');
    fireEvent.click(screen.getByRole('radio', { name: 'Interact' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Develop screen' })).toHaveValue('two'));
    expect(JSON.stringify(file)).toBe(original);
  });
  it('supports slash, autocomplete, enter, clipboard and three-second status dismissal', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<Player developer file={file} />); await selectButton();
    fireEvent.keyDown(document.body, { key: '/' });
    const field = screen.getByRole('combobox', { name: 'Developer command' });
    fireEvent.change(field, { target: { value: '/copy p' } });
    fireEvent.keyDown(field, { key: 'Tab' });
    expect(field).toHaveValue('/copy props');
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Props copied'));
    expect(JSON.parse(writeText.mock.calls[0][0]).label).toBe('Continue');
    // The browser timer, rather than an animation callback, dismisses the message.
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument(), { timeout: 3500 });
  });
  it('keeps slash in text fields and reports clipboard failure with retry', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<Player developer file={file} />); await selectButton();
    fireEvent.keyDown(screen.getByPlaceholderText('Type here'), { key: '/' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('region', { name: 'Component details' })).getByRole('button', { name: 'Props' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t copy'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    writeText.mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Props copied'));
  });
  it('shows layout and navigates to a parent without modifying the document', async () => {
    render(<Player developer file={file} />); await selectButton();
    fireEvent.click(screen.getByRole('button', { name: 'Show layout' }));
    expect(screen.getByText('Computed layout')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Parent' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Parent' })).toBeDisabled());
  });
  it('exposes all note types, replies and library items without editing them', async () => {
    const store = createCommentStore(file.id);
    const comment = store.add({ screenId: 'one', anchorNodeId: 'button', x: 10, y: 10, author: 'Reviewer', text: 'Review this action', kind: 'comment' });
    store.reply(comment.id, { author: 'Designer', text: 'Reply for the developer' });
    store.add({ screenId: 'one', x: 20, y: 20, author: 'Designer', text: 'Designer rationale', kind: 'annotation' });
    store.add({ screenId: 'one', x: 30, y: 30, author: 'A11y', text: 'Keyboard requirement', kind: 'accessibility' });
    store.add({ screenId: 'two', x: 10, y: 10, author: 'Reviewer', text: 'Other screen only' });
    const a11y = createAnnotation('heading', 'card', { x: 100, y: 100 });
    const designer = createDesignerAnnotation('note', 'sticky', { x: 300, y: 100 });
    const annotatedFile = { ...file, pages: [{ id: 'page', name: 'Page', diagram: { nodes: [a11y, designer], edges: [] } }] };
    const saved = localStorage.getItem(`assembly-workbench:comments:${file.id}`);
    render(<Player developer file={annotatedFile} />);
    await selectButton();
    fireEvent.click(screen.getByRole('button', { name: 'Comments and annotations' }));
    const panel = screen.getByRole('complementary', { name: 'Developer notes' });
    expect(panel).toHaveTextContent('Review this action');
    expect(panel).toHaveTextContent('Reply for the developer');
    expect(panel).toHaveTextContent('Designer rationale');
    expect(panel).toHaveTextContent('Keyboard requirement');
    expect(panel).toHaveTextContent('Accessibility annotation');
    expect(panel).toHaveTextContent('Designer annotation');
    expect(panel).not.toHaveTextContent('Other screen only');
    fireEvent.click(within(panel).getByRole('button', { name: 'Accessibility' }));
    expect(panel).toHaveTextContent('Keyboard requirement');
    expect(panel).not.toHaveTextContent('Review this action');
    expect(panel).not.toHaveTextContent('Designer rationale');
    expect(localStorage.getItem(`assembly-workbench:comments:${file.id}`)).toBe(saved);
  });
  it('refreshes threads when Design saves in another tab', async () => {
    render(<Player developer file={file} />); await selectButton();
    fireEvent.click(screen.getByRole('button', { name: 'Comments and annotations' }));
    act(() => {
      createCommentStore(file.id).add({ screenId: 'one', x: 0, y: 0, author: 'Reviewer', text: 'Added from design' });
      window.dispatchEvent(new StorageEvent('storage', { key: `assembly-workbench:comments:${file.id}` }));
    });
    await waitFor(() => expect(screen.getByRole('complementary', { name: 'Developer notes' })).toHaveTextContent('Added from design'));
  });

});
