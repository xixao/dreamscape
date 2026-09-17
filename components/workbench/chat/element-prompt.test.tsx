import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ElementPrompt } from './element-prompt';
const state = vi.hoisted(() => ({ id: undefined as string | undefined, node: undefined as unknown, dragging: false }));
vi.mock('@craftjs/core', () => ({ useEditor: () => state }));
afterEach(() => { state.id = undefined; state.node = undefined; state.dragging = false; });
describe('element AI prompt stub', () => {
  it('stays unobtrusive until an element is selected', () => {
    const close = vi.fn(); render(<ElementPrompt fileId="test-ai" onClose={close} />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' }); expect(close).not.toHaveBeenCalled();
  });
  it('hides during a drag and restores the draft after dropping', () => {
    state.id = 'button'; state.node = { dom: document.body, data: { custom: {}, displayName: 'Button' } };
    const close = vi.fn(); const view = render(<ElementPrompt fileId="test-ai" onClose={close} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Make it wider' } });
    state.dragging = true;
    view.rerender(<ElementPrompt fileId="test-ai" onClose={close} />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    state.dragging = false;
    view.rerender(<ElementPrompt fileId="test-ai" onClose={close} />);
    expect(screen.getByRole('textbox')).toHaveValue('Make it wider');
  });
  it('shares the targeted request and stub reply with the file conversation', async () => {
    state.id = 'button'; state.node = { dom: document.body, data: { custom: { layerName: 'Submit button' }, displayName: 'Button' } };
    const close = vi.fn(); const view = render(<ElementPrompt fileId="test-ai" onClose={close} />);
    expect(screen.getByRole('region', { name: 'AI edit Submit button' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send request' })).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Make it wider' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem('assembly-workbench:chat:test-ai') || '[]')).toHaveLength(2));
    expect(JSON.parse(localStorage.getItem('assembly-workbench:chat:test-ai') || '[]')[0].text).toBe('Submit button: Make it wider');
    state.id = 'card'; state.node = { dom: document.body, data: { custom: {}, displayName: 'Card' } };
    view.rerender(<ElementPrompt fileId="test-ai" onClose={close} />);
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' }); expect(close).toHaveBeenCalledOnce();
  });
});


describe('canvas prompt avoids editor panels', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.querySelectorAll('[data-prompt-test]').forEach(node => node.remove()); });
  function setup(leftEdge: number, rightEdge: number, selectionTop = 200, selectionBottom = 300) {
    vi.stubGlobal('innerWidth', 1200); vi.stubGlobal('innerHeight', 800);
    const rect = (left: number, top: number, width: number, height: number) => ({ left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON() {} });
    const leftPanel = document.createElement('aside'); const rightPanel = document.createElement('aside'); const element = document.createElement('div');
    for (const node of [leftPanel, rightPanel, element]) { node.dataset.promptTest = ''; document.body.appendChild(node); }
    vi.spyOn(leftPanel, 'getBoundingClientRect').mockImplementation(() => rect(12, 76, leftEdge - 12, 700));
    const rightBounds = vi.spyOn(rightPanel, 'getBoundingClientRect').mockImplementation(() => rect(rightEdge, 76, 1200 - rightEdge - 12, 700));
    vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => rect(850, selectionTop, 200, selectionBottom - selectionTop));
    state.id = 'card'; state.node = { dom: element, data: { custom: {}, displayName: 'Card' } };
    let tick: FrameRequestCallback = () => {};
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { tick = callback; return 1; });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    render(<ElementPrompt fileId="placement" onClose={() => {}} />);
    return { prompt: screen.getByRole('region', { name: 'AI edit Card' }), collapseRight: () => { rightBounds.mockImplementation(() => rect(1148, 76, 40, 700)); act(() => tick(0)); } };
  }
  it('clears the inspector by 12px and follows its collapsed width', () => {
    const { prompt, collapseRight } = setup(260, 880);
    expect(prompt).toHaveStyle({ left: '548px', width: '320px', top: '310px' });
    collapseRight();
    expect(prompt).toHaveStyle({ left: '816px', width: '320px' });
  });
  it('shrinks to fit between both panels', () => {
    const { prompt } = setup(600, 880);
    expect(prompt).toHaveStyle({ left: '612px', width: '256px' });
  });
  it('moves above the selected element near the bottom edge', () => {
    const { prompt } = setup(260, 880, 700, 770);
    expect(prompt).toHaveStyle({ left: '548px', top: '634px' });
  });
});
