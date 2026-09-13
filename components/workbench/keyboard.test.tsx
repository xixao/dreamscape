import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Element, Frame, ROOT_NODE } from '@craftjs/core';
import { Button } from '@/components/blocks/button';
import { LayoutBox } from '@/components/blocks/layout-box';
import { renderInEditor } from '@/test/craft-harness';
import { isEditableTarget, useWorkbenchKeyboard } from './keyboard';

type KeysOptions = {
  onToggleUi?: () => void;
  onToggleCommentMode?: () => void;
  commentMode?: boolean;
  onExitCommentMode?: () => void;
};

function Keys({ onToggleUi, onToggleCommentMode, commentMode, onExitCommentMode }: KeysOptions) {
  useWorkbenchKeyboard({ onToggleUi, onToggleCommentMode, commentMode, onExitCommentMode });
  return (
    <>
      <input aria-label="typing" />
      <div role="alertdialog">
        <button type="button">Clear frame</button>
      </div>
    </>
  );
}

// Accepts either a bare `onToggleUi` callback (every pre-existing call site
// below) or a full options object (for the newer comment-mode options), so
// adding options here never has to touch those existing call sites.
function mount(optionsOrOnToggleUi?: (() => void) | KeysOptions) {
  const options: KeysOptions =
    typeof optionsOrOnToggleUi === 'function' ? { onToggleUi: optionsOrOnToggleUi } : (optionsOrOnToggleUi ?? {});
  const utils = renderInEditor(
    <>
      <Frame>
        <Element is={LayoutBox} canvas>
          <Button label="Doomed" />
        </Element>
      </Frame>
      <Keys {...options} />
    </>,
  );
  return utils;
}

describe('isEditableTarget', () => {
  it('is true for inputs, textareas, selects and contenteditable', () => {
    render(
      <div>
        <input aria-label="i" />
        <textarea aria-label="t" />
        <select aria-label="s" />
        <div contentEditable data-testid="c" />
        <p data-testid="p">text</p>
      </div>,
    );
    expect(isEditableTarget(screen.getByLabelText('i'))).toBe(true);
    expect(isEditableTarget(screen.getByLabelText('t'))).toBe(true);
    expect(isEditableTarget(screen.getByLabelText('s'))).toBe(true);
    expect(isEditableTarget(screen.getByTestId('c'))).toBe(true);
    expect(isEditableTarget(screen.getByTestId('p'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });

  it('is true for an element inside a listbox, dialog, alertdialog, menu, combobox or radix popper wrapper', () => {
    render(
      <div>
        <div role="listbox">
          <button type="button" data-testid="option">
            Option
          </button>
        </div>
        <div role="alertdialog">
          <button type="button" data-testid="alert-action">
            Clear frame
          </button>
        </div>
      </div>,
    );
    expect(isEditableTarget(screen.getByTestId('option'))).toBe(true);
    expect(isEditableTarget(screen.getByTestId('alert-action'))).toBe(true);
  });
});

describe('useWorkbenchKeyboard', () => {
  it('deletes the selected block with Delete and Backspace, never the root', async () => {
    const { editor } = mount();
    await screen.findByRole('button', { name: 'Doomed' });
    const buttonId = editor().query.node(ROOT_NODE).get().data.nodes[0];

    editor().actions.selectNode(ROOT_NODE);
    await waitFor(() => expect(editor().query.getEvent('selected').contains(ROOT_NODE)).toBe(true));
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(screen.getByRole('button', { name: 'Doomed' })).toBeInTheDocument();

    editor().actions.selectNode(buttonId);
    await waitFor(() => expect(editor().query.getEvent('selected').contains(buttonId)).toBe(true));
    fireEvent.keyDown(window, { key: 'Backspace' });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Doomed' })).toBeNull());
  });

  it('ignores Delete while typing in a field', async () => {
    const { editor } = mount();
    await screen.findByRole('button', { name: 'Doomed' });
    const buttonId = editor().query.node(ROOT_NODE).get().data.nodes[0];
    editor().actions.selectNode(buttonId);
    await waitFor(() => expect(editor().query.getEvent('selected').contains(buttonId)).toBe(true));

    fireEvent.keyDown(screen.getByLabelText('typing'), { key: 'Delete' });
    expect(screen.getByRole('button', { name: 'Doomed' })).toBeInTheDocument();
  });

  it('ignores Delete while a popup or dialog owns the interaction', async () => {
    const { editor } = mount();
    await screen.findByRole('button', { name: 'Doomed' });
    const buttonId = editor().query.node(ROOT_NODE).get().data.nodes[0];
    editor().actions.selectNode(buttonId);
    await waitFor(() => expect(editor().query.getEvent('selected').contains(buttonId)).toBe(true));

    fireEvent.keyDown(screen.getByRole('button', { name: 'Clear frame' }), { key: 'Delete' });
    expect(screen.getByRole('button', { name: 'Doomed' })).toBeInTheDocument();
  });

  it('deselects with Escape and undoes with Cmd+Z', async () => {
    const { editor } = mount();
    await screen.findByRole('button', { name: 'Doomed' });
    const buttonId = editor().query.node(ROOT_NODE).get().data.nodes[0];
    editor().actions.selectNode(buttonId);
    await waitFor(() => expect(editor().query.getEvent('selected').contains(buttonId)).toBe(true));

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(editor().query.getEvent('selected').contains(buttonId)).toBe(false));

    editor().actions.selectNode(buttonId);
    await waitFor(() => expect(editor().query.getEvent('selected').contains(buttonId)).toBe(true));
    fireEvent.keyDown(window, { key: 'Delete' });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Doomed' })).toBeNull());

    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(await screen.findByRole('button', { name: 'Doomed' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'z', metaKey: true, shiftKey: true });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Doomed' })).toBeNull());
  });
});

describe('useWorkbenchKeyboard onToggleUi', () => {
  it('calls onToggleUi and prevents default for Cmd+\\', async () => {
    const onToggleUi = vi.fn();
    mount(onToggleUi);
    await screen.findByRole('button', { name: 'Doomed' });

    const notCancelled = fireEvent.keyDown(window, { key: '\\', metaKey: true });
    expect(onToggleUi).toHaveBeenCalledTimes(1);
    expect(notCancelled).toBe(false);
  });

  it('calls onToggleUi for Ctrl+\\', async () => {
    const onToggleUi = vi.fn();
    mount(onToggleUi);
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: '\\', ctrlKey: true });
    expect(onToggleUi).toHaveBeenCalledTimes(1);
  });

  it('fires even when the target is an input', async () => {
    const onToggleUi = vi.fn();
    mount(onToggleUi);
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(screen.getByLabelText('typing'), { key: '\\', metaKey: true });
    expect(onToggleUi).toHaveBeenCalledTimes(1);
  });

  it('fires even when a popup or dialog owns the interaction', async () => {
    const onToggleUi = vi.fn();
    mount(onToggleUi);
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(screen.getByRole('button', { name: 'Clear frame' }), { key: '\\', metaKey: true });
    expect(onToggleUi).toHaveBeenCalledTimes(1);
  });

  it('does not call onToggleUi for other keys or a bare backslash', async () => {
    const onToggleUi = vi.fn();
    mount(onToggleUi);
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: 'a', metaKey: true });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: '\\' });
    expect(onToggleUi).not.toHaveBeenCalled();
  });

  it('does nothing when onToggleUi is not provided', async () => {
    mount();
    await screen.findByRole('button', { name: 'Doomed' });
    expect(() => fireEvent.keyDown(window, { key: '\\', metaKey: true })).not.toThrow();
  });
});


describe('useWorkbenchKeyboard onToggleCommentMode', () => {
  it('toggles comment mode with the "c" key', async () => {
    const onToggleCommentMode = vi.fn();
    mount({ onToggleCommentMode });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: 'c' });
    expect(onToggleCommentMode).toHaveBeenCalledTimes(1);
  });

  it('is case-insensitive and ignores Cmd/Ctrl+C (copy)', async () => {
    const onToggleCommentMode = vi.fn();
    mount({ onToggleCommentMode });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: 'C' });
    expect(onToggleCommentMode).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'c', metaKey: true });
    fireEvent.keyDown(window, { key: 'c', ctrlKey: true });
    expect(onToggleCommentMode).toHaveBeenCalledTimes(1);
  });

  it('ignores "c" while typing in a field', async () => {
    const onToggleCommentMode = vi.fn();
    mount({ onToggleCommentMode });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(screen.getByLabelText('typing'), { key: 'c' });
    expect(onToggleCommentMode).not.toHaveBeenCalled();
  });

  it('does nothing when onToggleCommentMode is not provided', async () => {
    mount();
    await screen.findByRole('button', { name: 'Doomed' });
    expect(() => fireEvent.keyDown(window, { key: 'c' })).not.toThrow();
  });

  it('calls onExitCommentMode instead of deselecting when Escape is pressed in comment mode', async () => {
    const onExitCommentMode = vi.fn();
    const { editor } = mount({ commentMode: true, onExitCommentMode });
    await screen.findByRole('button', { name: 'Doomed' });
    const buttonId = editor().query.node(ROOT_NODE).get().data.nodes[0];
    editor().actions.selectNode(buttonId);
    await waitFor(() => expect(editor().query.getEvent('selected').contains(buttonId)).toBe(true));

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onExitCommentMode).toHaveBeenCalledTimes(1);
    // Selection is untouched - Escape's job in comment mode is to leave the
    // tool, not to touch the canvas selection.
    expect(editor().query.getEvent('selected').contains(buttonId)).toBe(true);
  });

  it('deselects as usual with Escape when not in comment mode', async () => {
    const onExitCommentMode = vi.fn();
    const { editor } = mount({ commentMode: false, onExitCommentMode });
    await screen.findByRole('button', { name: 'Doomed' });
    const buttonId = editor().query.node(ROOT_NODE).get().data.nodes[0];
    editor().actions.selectNode(buttonId);
    await waitFor(() => expect(editor().query.getEvent('selected').contains(buttonId)).toBe(true));

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onExitCommentMode).not.toHaveBeenCalled();
    await waitFor(() => expect(editor().query.getEvent('selected').contains(buttonId)).toBe(false));
  });
});
