import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Element, Frame, ROOT_NODE } from '@craftjs/core';
import { Button } from '@/components/blocks/button';
import { LayoutBox } from '@/components/blocks/layout-box';
import { renderInEditor } from '@/test/craft-harness';
import { CanvasFrame } from './canvas-frame';
import { isEditableTarget, useWorkbenchKeyboard } from './keyboard';

function Keys({ onToggleUi }: { onToggleUi?: () => void }) {
  useWorkbenchKeyboard({ onToggleUi });
  return (
    <>
      <input aria-label="typing" />
      <div role="alertdialog">
        <button type="button">Clear frame</button>
      </div>
    </>
  );
}

function mount(onToggleUi?: () => void) {
  const utils = renderInEditor(
    <>
      <Frame>
        <Element is={LayoutBox} canvas>
          <Button label="Doomed" />
        </Element>
      </Frame>
      <Keys onToggleUi={onToggleUi} />
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

  it('is true for an input from a different document/realm (an iframe), not just instanceof the parent HTMLElement', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const iframeInput = iframe.contentDocument!.createElement('input');
    iframe.contentDocument!.body.appendChild(iframeInput);

    expect(iframeInput instanceof HTMLElement).toBe(false);
    expect(isEditableTarget(iframeInput)).toBe(true);

    iframe.remove();
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

describe('useWorkbenchKeyboard with a CanvasFrame', () => {
  // Keys is a sibling of the CanvasFrame here, exactly like the real tree
  // (useWorkbenchKeyboard is called from WorkbenchShell, a sibling of Stage
  // in workbench.tsx) - it still sees the canvas document because
  // useCanvasDocument() reads it from StageContext, not from a context
  // scoped to CanvasFrame's own children.
  function mountInFrame(onToggleUi?: () => void) {
    return renderInEditor(
      <>
        <CanvasFrame width={800} height={null} zoom={1}>
          <Frame>
            <Element is={LayoutBox} canvas>
              <Button label="Doomed" />
            </Element>
          </Frame>
        </CanvasFrame>
        <Keys onToggleUi={onToggleUi} />
      </>,
    );
  }

  async function frameBody(): Promise<HTMLElement> {
    return waitFor(() => {
      const iframe = screen.getByTestId('canvas-frame') as HTMLIFrameElement;
      const body = iframe.contentDocument?.body;
      if (!body?.querySelector('button')) throw new Error('not ready');
      return body;
    });
  }

  it('a keydown dispatched on the iframe window fires the shortcut', async () => {
    const onToggleUi = vi.fn();
    mountInFrame(onToggleUi);
    const body = await frameBody();

    fireEvent.keyDown(body, { key: '\\', metaKey: true });
    expect(onToggleUi).toHaveBeenCalledTimes(1);
  });

  it('Delete on a selected block dispatched from inside the iframe deletes it', async () => {
    const utils = mountInFrame();
    const body = await frameBody();
    const buttonId = utils.editor().query.node(ROOT_NODE).get().data.nodes[0];
    utils.editor().actions.selectNode(buttonId);
    await waitFor(() => expect(utils.editor().query.getEvent('selected').contains(buttonId)).toBe(true));

    fireEvent.keyDown(body, { key: 'Delete' });
    await waitFor(() => expect(body.querySelector('button')).toBeNull());
  });

  it('ignores Delete while typing into an input that lives inside the iframe', async () => {
    const utils = mountInFrame();
    const body = await frameBody();
    const buttonId = utils.editor().query.node(ROOT_NODE).get().data.nodes[0];
    utils.editor().actions.selectNode(buttonId);
    await waitFor(() => expect(utils.editor().query.getEvent('selected').contains(buttonId)).toBe(true));

    const iframeInput = body.ownerDocument.createElement('input');
    body.appendChild(iframeInput);

    fireEvent.keyDown(iframeInput, { key: 'Delete' });
    expect(body.querySelector('button')).not.toBeNull();
  });
});
