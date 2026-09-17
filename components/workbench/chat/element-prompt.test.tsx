import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
