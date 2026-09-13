import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Element, Frame, ROOT_NODE } from '@craftjs/core';
import { Button } from '@/components/blocks/button';
import { LayoutBox } from '@/components/blocks/layout-box';
import { renderInEditor } from '@/test/craft-harness';
import { CanvasFrame } from './canvas-frame';
import { isEditableTarget, useWorkbenchKeyboard } from './keyboard';

type KeysOptions = {
  onToggleUi?: () => void;
  onToggleChat?: () => void;
  onTogglePanelCollapsed?: () => void;
  onToggleCommentMode?: () => void;
  commentMode?: boolean;
  onExitCommentMode?: () => void;
  onDiagramTool?: () => void;
  diagramToolActive?: boolean;
  onExitDiagramTool?: () => void;
  diagramSelectionActive?: boolean;
  onDeselectDiagram?: () => void;
  onDiagramDelete?: () => void;
  onDiagramDuplicate?: () => void;
  onDiagramNudge?: (direction: 'up' | 'down' | 'left' | 'right', big: boolean) => void;
  onDiagramUndo?: () => void;
  onDiagramRedo?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
  onZoomToFit?: () => void;
  onZoomToSelection?: () => void;
  onSelectPanelTab?: (mode: 'design' | 'prototype' | 'components') => void;
  onPointerTool?: () => void;
  onPresent?: () => void;
  onAddScreen?: () => void;
  onOpenShortcuts?: () => void;
};

function Keys({
  onToggleUi,
  onToggleChat,
  onTogglePanelCollapsed,
  onToggleCommentMode,
  commentMode,
  onExitCommentMode,
  onDiagramTool,
  diagramToolActive,
  onExitDiagramTool,
  diagramSelectionActive,
  onDeselectDiagram,
  onDiagramDelete,
  onDiagramDuplicate,
  onDiagramNudge,
  onDiagramUndo,
  onDiagramRedo,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onZoomToFit,
  onZoomToSelection,
  onSelectPanelTab,
  onPointerTool,
  onPresent,
  onAddScreen,
  onOpenShortcuts,
}: KeysOptions) {
  useWorkbenchKeyboard({
    onToggleUi,
    onToggleChat,
    onTogglePanelCollapsed,
    onToggleCommentMode,
    commentMode,
    onExitCommentMode,
    onDiagramTool,
    diagramToolActive,
    onExitDiagramTool,
    diagramSelectionActive,
    onDeselectDiagram,
    onDiagramDelete,
    onDiagramDuplicate,
    onDiagramNudge,
    onDiagramUndo,
    onDiagramRedo,
    onZoomIn,
    onZoomOut,
    onZoomReset,
    onZoomToFit,
    onZoomToSelection,
    onSelectPanelTab,
    onPointerTool,
    onPresent,
    onAddScreen,
    onOpenShortcuts,
  });
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
// below), optionally followed by `onToggleChat`, or a full options object
// (for the comment-mode options), so adding options here never has to touch
// existing call sites.
function mount(optionsOrOnToggleUi?: (() => void) | KeysOptions, onToggleChat?: () => void) {
  const base: KeysOptions =
    typeof optionsOrOnToggleUi === 'function' ? { onToggleUi: optionsOrOnToggleUi } : (optionsOrOnToggleUi ?? {});
  const options: KeysOptions = onToggleChat ? { ...base, onToggleChat } : base;
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

describe('useWorkbenchKeyboard onToggleCommentMode', () => {
  it('toggles the comment tool with Shift+C (spec: C alone now opens the chat panel)', async () => {
    const onToggleCommentMode = vi.fn();
    mount({ onToggleCommentMode });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: 'c', shiftKey: true });
    expect(onToggleCommentMode).toHaveBeenCalledTimes(1);
  });

  it('is case-insensitive and ignores Cmd/Ctrl+Shift+C', async () => {
    const onToggleCommentMode = vi.fn();
    mount({ onToggleCommentMode });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: 'C', shiftKey: true });
    expect(onToggleCommentMode).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'c', shiftKey: true, metaKey: true });
    fireEvent.keyDown(window, { key: 'c', shiftKey: true, ctrlKey: true });
    expect(onToggleCommentMode).toHaveBeenCalledTimes(1);
  });

  it('no longer toggles on a bare "c"', async () => {
    const onToggleCommentMode = vi.fn();
    mount({ onToggleCommentMode });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: 'c' });
    expect(onToggleCommentMode).not.toHaveBeenCalled();
  });

  it('ignores Shift+C while typing in a field', async () => {
    const onToggleCommentMode = vi.fn();
    mount({ onToggleCommentMode });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(screen.getByLabelText('typing'), { key: 'c', shiftKey: true });
    expect(onToggleCommentMode).not.toHaveBeenCalled();
  });

  it('does nothing when onToggleCommentMode is not provided', async () => {
    mount();
    await screen.findByRole('button', { name: 'Doomed' });
    expect(() => fireEvent.keyDown(window, { key: 'c', shiftKey: true })).not.toThrow();
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

describe('useWorkbenchKeyboard onDiagramTool', () => {
  it('opens the diagram palette with Shift+D', async () => {
    const onDiagramTool = vi.fn();
    mount({ onDiagramTool });
    await screen.findByRole('button', { name: 'Doomed' });

    const notCancelled = fireEvent.keyDown(window, { key: 'd', shiftKey: true });
    expect(onDiagramTool).toHaveBeenCalledTimes(1);
    expect(notCancelled).toBe(false);
  });

  it('is distinct from the bare "d" panel-tab shortcut', async () => {
    const onDiagramTool = vi.fn();
    const onSelectPanelTab = vi.fn();
    mount({ onDiagramTool, onSelectPanelTab });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: 'd' });
    expect(onDiagramTool).not.toHaveBeenCalled();
    expect(onSelectPanelTab).toHaveBeenCalledWith('design');
  });

  it('ignores Shift+D while typing in a field', async () => {
    const onDiagramTool = vi.fn();
    mount({ onDiagramTool });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(screen.getByLabelText('typing'), { key: 'd', shiftKey: true });
    expect(onDiagramTool).not.toHaveBeenCalled();
  });

  it('does nothing when onDiagramTool is not provided', async () => {
    mount();
    await screen.findByRole('button', { name: 'Doomed' });
    expect(() => fireEvent.keyDown(window, { key: 'd', shiftKey: true })).not.toThrow();
  });
});

describe('useWorkbenchKeyboard diagram selection routing', () => {
  it('Escape leaves an active diagram tool before deselecting', async () => {
    const onExitDiagramTool = vi.fn();
    const { editor } = mount({ diagramToolActive: true, onExitDiagramTool });
    await screen.findByRole('button', { name: 'Doomed' });
    const buttonId = editor().query.node(ROOT_NODE).get().data.nodes[0];
    editor().actions.selectNode(buttonId);
    await waitFor(() => expect(editor().query.getEvent('selected').contains(buttonId)).toBe(true));

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onExitDiagramTool).toHaveBeenCalledTimes(1);
    expect(editor().query.getEvent('selected').contains(buttonId)).toBe(true);
  });

  it('Escape clears the diagram selection when no tool is active', async () => {
    const onDeselectDiagram = vi.fn();
    mount({ diagramSelectionActive: true, onDeselectDiagram });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onDeselectDiagram).toHaveBeenCalledTimes(1);
  });

  it('Delete calls onDiagramDelete instead of deleting the Craft selection', async () => {
    const onDiagramDelete = vi.fn();
    const { editor } = mount({ diagramSelectionActive: true, onDiagramDelete });
    await screen.findByRole('button', { name: 'Doomed' });
    const buttonId = editor().query.node(ROOT_NODE).get().data.nodes[0];
    editor().actions.selectNode(buttonId);
    await waitFor(() => expect(editor().query.getEvent('selected').contains(buttonId)).toBe(true));

    fireEvent.keyDown(window, { key: 'Delete' });

    expect(onDiagramDelete).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Doomed' })).toBeInTheDocument();
  });

  it('Cmd+D duplicates the diagram selection only while one is active', async () => {
    const onDiagramDuplicate = vi.fn();
    mount({ diagramSelectionActive: false, onDiagramDuplicate });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: 'd', metaKey: true });
    expect(onDiagramDuplicate).not.toHaveBeenCalled();
  });

  it('Cmd+D duplicates the diagram selection when one is active', async () => {
    const onDiagramDuplicate = vi.fn();
    mount({ diagramSelectionActive: true, onDiagramDuplicate });
    await screen.findByRole('button', { name: 'Doomed' });

    const notCancelled = fireEvent.keyDown(window, { key: 'd', metaKey: true });

    expect(onDiagramDuplicate).toHaveBeenCalledTimes(1);
    expect(notCancelled).toBe(false);
  });

  it('arrow keys nudge the diagram selection, reporting Shift for a bigger nudge', async () => {
    const onDiagramNudge = vi.fn();
    mount({ diagramSelectionActive: true, onDiagramNudge });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: 'ArrowUp' });
    fireEvent.keyDown(window, { key: 'ArrowDown', shiftKey: true });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });

    expect(onDiagramNudge).toHaveBeenNthCalledWith(1, 'up', false);
    expect(onDiagramNudge).toHaveBeenNthCalledWith(2, 'down', true);
    expect(onDiagramNudge).toHaveBeenNthCalledWith(3, 'left', false);
    expect(onDiagramNudge).toHaveBeenNthCalledWith(4, 'right', false);
  });

  it('ignores arrow keys with no diagram selection (so text cursor movement is untouched)', async () => {
    const onDiagramNudge = vi.fn();
    mount({ diagramSelectionActive: false, onDiagramNudge });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(onDiagramNudge).not.toHaveBeenCalled();
  });

  it('ignores arrow keys while typing in a field even with a diagram selection', async () => {
    const onDiagramNudge = vi.fn();
    mount({ diagramSelectionActive: true, onDiagramNudge });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(screen.getByLabelText('typing'), { key: 'ArrowUp' });
    expect(onDiagramNudge).not.toHaveBeenCalled();
  });

  it('routes Cmd+Z/Shift+Cmd+Z to the diagram history instead of Craft while a diagram element is selected', async () => {
    const onDiagramUndo = vi.fn();
    const onDiagramRedo = vi.fn();
    const { editor } = mount({ diagramSelectionActive: true, onDiagramUndo, onDiagramRedo });
    await screen.findByRole('button', { name: 'Doomed' });
    const buttonId = editor().query.node(ROOT_NODE).get().data.nodes[0];
    editor().actions.selectNode(buttonId);
    await waitFor(() => expect(editor().query.getEvent('selected').contains(buttonId)).toBe(true));
    act(() => editor().actions.setProp(buttonId, (props: Record<string, unknown>) => (props.label = 'Changed')));
    await waitFor(() => expect(editor().query.node(buttonId).get().data.props.label).toBe('Changed'));

    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    fireEvent.keyDown(window, { key: 'z', metaKey: true, shiftKey: true });

    expect(onDiagramUndo).toHaveBeenCalledTimes(1);
    expect(onDiagramRedo).toHaveBeenCalledTimes(1);
    // The Craft edit made above is untouched - undo went to the diagram instead.
    expect(editor().query.node(buttonId).get().data.props.label).toBe('Changed');
  });
});

describe('useWorkbenchKeyboard onToggleChat', () => {
  it('calls onToggleChat and prevents default for Cmd+J', async () => {
    const onToggleChat = vi.fn();
    mount(undefined, onToggleChat);
    await screen.findByRole('button', { name: 'Doomed' });

    const notCancelled = fireEvent.keyDown(window, { key: 'j', metaKey: true });
    expect(onToggleChat).toHaveBeenCalledTimes(1);
    expect(notCancelled).toBe(false);
  });

  it('calls onToggleChat for Ctrl+J', async () => {
    const onToggleChat = vi.fn();
    mount(undefined, onToggleChat);
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: 'j', ctrlKey: true });
    expect(onToggleChat).toHaveBeenCalledTimes(1);
  });

  it('fires even when the target is an input', async () => {
    const onToggleChat = vi.fn();
    mount(undefined, onToggleChat);
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(screen.getByLabelText('typing'), { key: 'j', metaKey: true });
    expect(onToggleChat).toHaveBeenCalledTimes(1);
  });

  it('fires even when a popup or dialog owns the interaction', async () => {
    const onToggleChat = vi.fn();
    mount(undefined, onToggleChat);
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(screen.getByRole('button', { name: 'Clear frame' }), { key: 'j', metaKey: true });
    expect(onToggleChat).toHaveBeenCalledTimes(1);
  });

  it('does not call onToggleChat for other keys or a bare j', async () => {
    const onToggleChat = vi.fn();
    mount(undefined, onToggleChat);
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: 'j' });
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(onToggleChat).not.toHaveBeenCalled();
  });

  it('does not call onToggleUi for Cmd+J or onToggleChat for Cmd+\\', async () => {
    const onToggleUi = vi.fn();
    const onToggleChat = vi.fn();
    mount(onToggleUi, onToggleChat);
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: 'j', metaKey: true });
    expect(onToggleChat).toHaveBeenCalledTimes(1);
    expect(onToggleUi).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: '\\', metaKey: true });
    expect(onToggleUi).toHaveBeenCalledTimes(1);
    expect(onToggleChat).toHaveBeenCalledTimes(1);
  });

  it('does nothing when onToggleChat is not provided', async () => {
    mount();
    await screen.findByRole('button', { name: 'Doomed' });
    expect(() => fireEvent.keyDown(window, { key: 'j', metaKey: true })).not.toThrow();
  });

  it('also toggles chat with a bare "c", case-insensitively, unlike Cmd+J it is ignored while typing', async () => {
    const onToggleChat = vi.fn();
    mount(undefined, onToggleChat);
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: 'c' });
    expect(onToggleChat).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'C' });
    expect(onToggleChat).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(screen.getByLabelText('typing'), { key: 'c' });
    expect(onToggleChat).toHaveBeenCalledTimes(2);
  });

  it('ignores Cmd/Ctrl+C and Shift+C (the comment tool) for the chat toggle', async () => {
    const onToggleChat = vi.fn();
    mount(undefined, onToggleChat);
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: 'c', metaKey: true });
    fireEvent.keyDown(window, { key: 'c', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'c', shiftKey: true });
    expect(onToggleChat).not.toHaveBeenCalled();
  });
});

describe('useWorkbenchKeyboard onTogglePanelCollapsed', () => {
  it('calls onTogglePanelCollapsed and prevents default for Cmd+.', async () => {
    const onTogglePanelCollapsed = vi.fn();
    mount({ onTogglePanelCollapsed });
    await screen.findByRole('button', { name: 'Doomed' });

    const notCancelled = fireEvent.keyDown(window, { key: '.', metaKey: true });
    expect(onTogglePanelCollapsed).toHaveBeenCalledTimes(1);
    expect(notCancelled).toBe(false);
  });

  it('calls onTogglePanelCollapsed for Ctrl+.', async () => {
    const onTogglePanelCollapsed = vi.fn();
    mount({ onTogglePanelCollapsed });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: '.', ctrlKey: true });
    expect(onTogglePanelCollapsed).toHaveBeenCalledTimes(1);
  });

  it('fires even when the target is an input', async () => {
    const onTogglePanelCollapsed = vi.fn();
    mount({ onTogglePanelCollapsed });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(screen.getByLabelText('typing'), { key: '.', metaKey: true });
    expect(onTogglePanelCollapsed).toHaveBeenCalledTimes(1);
  });

  it('fires even when a popup or dialog owns the interaction', async () => {
    const onTogglePanelCollapsed = vi.fn();
    mount({ onTogglePanelCollapsed });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(screen.getByRole('button', { name: 'Clear frame' }), { key: '.', metaKey: true });
    expect(onTogglePanelCollapsed).toHaveBeenCalledTimes(1);
  });

  it('does not call onTogglePanelCollapsed for other keys or a bare period', async () => {
    const onTogglePanelCollapsed = vi.fn();
    mount({ onTogglePanelCollapsed });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: '.' });
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(onTogglePanelCollapsed).not.toHaveBeenCalled();
  });

  it('does not fire for Cmd+\\ or Cmd+J, and those do not fire it', async () => {
    const onToggleUi = vi.fn();
    const onToggleChat = vi.fn();
    const onTogglePanelCollapsed = vi.fn();
    mount({ onToggleUi, onToggleChat, onTogglePanelCollapsed });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: '\\', metaKey: true });
    expect(onToggleUi).toHaveBeenCalledTimes(1);
    expect(onTogglePanelCollapsed).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'j', metaKey: true });
    expect(onToggleChat).toHaveBeenCalledTimes(1);
    expect(onTogglePanelCollapsed).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: '.', metaKey: true });
    expect(onTogglePanelCollapsed).toHaveBeenCalledTimes(1);
    expect(onToggleUi).toHaveBeenCalledTimes(1);
    expect(onToggleChat).toHaveBeenCalledTimes(1);
  });

  it('does nothing when onTogglePanelCollapsed is not provided', async () => {
    mount();
    await screen.findByRole('button', { name: 'Doomed' });
    expect(() => fireEvent.keyDown(window, { key: '.', metaKey: true })).not.toThrow();
  });
});

describe('useWorkbenchKeyboard zoom shortcuts', () => {
  it('calls onZoomIn and prevents default for Cmd+=', async () => {
    const onZoomIn = vi.fn();
    mount({ onZoomIn });
    await screen.findByRole('button', { name: 'Doomed' });

    const notCancelled = fireEvent.keyDown(window, { key: '=', code: 'Equal', metaKey: true });
    expect(onZoomIn).toHaveBeenCalledTimes(1);
    expect(notCancelled).toBe(false);
  });

  it('calls onZoomIn for Ctrl+= and for the shifted "+" key', async () => {
    const onZoomIn = vi.fn();
    mount({ onZoomIn });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: '=', code: 'Equal', ctrlKey: true });
    fireEvent.keyDown(window, { key: '+', code: 'Equal', metaKey: true, shiftKey: true });
    expect(onZoomIn).toHaveBeenCalledTimes(2);
  });

  it('calls onZoomIn for the numpad Add key', async () => {
    const onZoomIn = vi.fn();
    mount({ onZoomIn });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: '+', code: 'NumpadAdd', metaKey: true });
    expect(onZoomIn).toHaveBeenCalledTimes(1);
  });

  it('fires onZoomIn even when the target is an input (the browser must never zoom the page instead)', async () => {
    const onZoomIn = vi.fn();
    mount({ onZoomIn });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(screen.getByLabelText('typing'), { key: '=', code: 'Equal', metaKey: true });
    expect(onZoomIn).toHaveBeenCalledTimes(1);
  });

  it('calls onZoomOut and prevents default for Cmd+-, Cmd+_ and the numpad Subtract key', async () => {
    const onZoomOut = vi.fn();
    mount({ onZoomOut });
    await screen.findByRole('button', { name: 'Doomed' });

    const notCancelled = fireEvent.keyDown(window, { key: '-', code: 'Minus', metaKey: true });
    fireEvent.keyDown(window, { key: '_', code: 'Minus', metaKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: '-', code: 'NumpadSubtract', metaKey: true });
    expect(onZoomOut).toHaveBeenCalledTimes(3);
    expect(notCancelled).toBe(false);
  });

  it('calls onZoomReset and prevents default for Cmd+0, even from an input', async () => {
    const onZoomReset = vi.fn();
    mount({ onZoomReset });
    await screen.findByRole('button', { name: 'Doomed' });

    const notCancelled = fireEvent.keyDown(window, { key: '0', metaKey: true });
    expect(onZoomReset).toHaveBeenCalledTimes(1);
    expect(notCancelled).toBe(false);

    fireEvent.keyDown(screen.getByLabelText('typing'), { key: '0', ctrlKey: true });
    expect(onZoomReset).toHaveBeenCalledTimes(2);
  });

  it('calls onZoomToFit and prevents default for Shift+1', async () => {
    const onZoomToFit = vi.fn();
    mount({ onZoomToFit });
    await screen.findByRole('button', { name: 'Doomed' });

    const notCancelled = fireEvent.keyDown(window, { code: 'Digit1', shiftKey: true });
    expect(onZoomToFit).toHaveBeenCalledTimes(1);
    expect(notCancelled).toBe(false);
  });

  it('calls onZoomToSelection and prevents default for Shift+2', async () => {
    const onZoomToSelection = vi.fn();
    mount({ onZoomToSelection });
    await screen.findByRole('button', { name: 'Doomed' });

    const notCancelled = fireEvent.keyDown(window, { code: 'Digit2', shiftKey: true });
    expect(onZoomToSelection).toHaveBeenCalledTimes(1);
    expect(notCancelled).toBe(false);
  });

  it('ignores Shift+1/Shift+2 while typing in a field (so "!" and "@" still type normally)', async () => {
    const onZoomToFit = vi.fn();
    const onZoomToSelection = vi.fn();
    mount({ onZoomToFit, onZoomToSelection });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(screen.getByLabelText('typing'), { code: 'Digit1', shiftKey: true });
    fireEvent.keyDown(screen.getByLabelText('typing'), { code: 'Digit2', shiftKey: true });
    expect(onZoomToFit).not.toHaveBeenCalled();
    expect(onZoomToSelection).not.toHaveBeenCalled();
  });

  it('does not call any zoom callback for an unrelated key', async () => {
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();
    const onZoomReset = vi.fn();
    const onZoomToFit = vi.fn();
    const onZoomToSelection = vi.fn();
    mount({ onZoomIn, onZoomOut, onZoomReset, onZoomToFit, onZoomToSelection });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: 'a', metaKey: true });
    fireEvent.keyDown(window, { key: '1', shiftKey: false });
    expect(onZoomIn).not.toHaveBeenCalled();
    expect(onZoomOut).not.toHaveBeenCalled();
    expect(onZoomReset).not.toHaveBeenCalled();
    expect(onZoomToFit).not.toHaveBeenCalled();
    expect(onZoomToSelection).not.toHaveBeenCalled();
  });

  it('does nothing when no zoom callback is provided', async () => {
    mount();
    await screen.findByRole('button', { name: 'Doomed' });
    expect(() => {
      fireEvent.keyDown(window, { key: '=', code: 'Equal', metaKey: true });
      fireEvent.keyDown(window, { key: '-', code: 'Minus', metaKey: true });
      fireEvent.keyDown(window, { key: '0', metaKey: true });
      fireEvent.keyDown(window, { code: 'Digit1', shiftKey: true });
      fireEvent.keyDown(window, { code: 'Digit2', shiftKey: true });
    }).not.toThrow();
  });
});

describe('useWorkbenchKeyboard onSelectPanelTab', () => {
  it('calls onSelectPanelTab with design, prototype and components for D, P and E', async () => {
    const onSelectPanelTab = vi.fn();
    mount({ onSelectPanelTab });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: 'd' });
    fireEvent.keyDown(window, { key: 'p' });
    fireEvent.keyDown(window, { key: 'e' });

    expect(onSelectPanelTab.mock.calls).toEqual([['design'], ['prototype'], ['components']]);
  });

  it('is case-insensitive and ignores the letters with a modifier or shift held', async () => {
    const onSelectPanelTab = vi.fn();
    mount({ onSelectPanelTab });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: 'D' });
    fireEvent.keyDown(window, { key: 'd', metaKey: true });
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'e', shiftKey: true });

    expect(onSelectPanelTab).toHaveBeenCalledTimes(1);
    expect(onSelectPanelTab).toHaveBeenCalledWith('design');
  });

  it('ignores D/P/E while typing in a field and while a popup or dialog owns the interaction', async () => {
    const onSelectPanelTab = vi.fn();
    mount({ onSelectPanelTab });
    await screen.findByRole('button', { name: 'Doomed' });

    for (const key of ['d', 'p', 'e']) {
      fireEvent.keyDown(screen.getByLabelText('typing'), { key });
      fireEvent.keyDown(screen.getByRole('button', { name: 'Clear frame' }), { key });
    }
    expect(onSelectPanelTab).not.toHaveBeenCalled();
  });

  it('does nothing when onSelectPanelTab is not provided', async () => {
    mount();
    await screen.findByRole('button', { name: 'Doomed' });
    expect(() => {
      fireEvent.keyDown(window, { key: 'd' });
      fireEvent.keyDown(window, { key: 'p' });
      fireEvent.keyDown(window, { key: 'e' });
    }).not.toThrow();
  });
});

describe('useWorkbenchKeyboard onPointerTool', () => {
  it('calls onPointerTool for the "v" key, case-insensitively', async () => {
    const onPointerTool = vi.fn();
    mount({ onPointerTool });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: 'v' });
    fireEvent.keyDown(window, { key: 'V' });
    expect(onPointerTool).toHaveBeenCalledTimes(2);
  });

  it('ignores V with a modifier held, while typing, and while a popup or dialog owns the interaction', async () => {
    const onPointerTool = vi.fn();
    mount({ onPointerTool });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: 'v', metaKey: true });
    fireEvent.keyDown(screen.getByLabelText('typing'), { key: 'v' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Clear frame' }), { key: 'v' });
    expect(onPointerTool).not.toHaveBeenCalled();
  });

  it('does nothing when onPointerTool is not provided', async () => {
    mount();
    await screen.findByRole('button', { name: 'Doomed' });
    expect(() => fireEvent.keyDown(window, { key: 'v' })).not.toThrow();
  });
});

describe('useWorkbenchKeyboard onPresent', () => {
  it('calls onPresent and prevents default for Cmd+R', async () => {
    const onPresent = vi.fn();
    mount({ onPresent });
    await screen.findByRole('button', { name: 'Doomed' });

    const notCancelled = fireEvent.keyDown(window, { key: 'r', metaKey: true });
    expect(onPresent).toHaveBeenCalledTimes(1);
    expect(notCancelled).toBe(false);
  });

  it('calls onPresent for Ctrl+R', async () => {
    const onPresent = vi.fn();
    mount({ onPresent });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: 'r', ctrlKey: true });
    expect(onPresent).toHaveBeenCalledTimes(1);
  });

  it('fires even when the target is an input, or a popup or dialog owns the interaction', async () => {
    const onPresent = vi.fn();
    mount({ onPresent });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(screen.getByLabelText('typing'), { key: 'r', metaKey: true });
    expect(onPresent).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Clear frame' }), { key: 'r', metaKey: true });
    expect(onPresent).toHaveBeenCalledTimes(2);
  });

  it('does not fire for Cmd+Shift+R, so the browser hard-reload still works', async () => {
    const onPresent = vi.fn();
    mount({ onPresent });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: 'r', metaKey: true, shiftKey: true });
    expect(onPresent).not.toHaveBeenCalled();
  });

  it('does not call onPresent for a bare r', async () => {
    const onPresent = vi.fn();
    mount({ onPresent });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: 'r' });
    expect(onPresent).not.toHaveBeenCalled();
  });

  it('does nothing when onPresent is not provided', async () => {
    mount();
    await screen.findByRole('button', { name: 'Doomed' });
    expect(() => fireEvent.keyDown(window, { key: 'r', metaKey: true })).not.toThrow();
  });
});

describe('useWorkbenchKeyboard onAddScreen', () => {
  it('calls onAddScreen for Shift+N', async () => {
    const onAddScreen = vi.fn();
    mount({ onAddScreen });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: 'n', shiftKey: true });
    expect(onAddScreen).toHaveBeenCalledTimes(1);
  });

  it('is case-insensitive', async () => {
    const onAddScreen = vi.fn();
    mount({ onAddScreen });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: 'N', shiftKey: true });
    expect(onAddScreen).toHaveBeenCalledTimes(1);
  });

  it('ignores a bare n, and Shift+N while typing or while a popup or dialog owns the interaction', async () => {
    const onAddScreen = vi.fn();
    mount({ onAddScreen });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: 'n' });
    fireEvent.keyDown(screen.getByLabelText('typing'), { key: 'n', shiftKey: true });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Clear frame' }), { key: 'n', shiftKey: true });
    expect(onAddScreen).not.toHaveBeenCalled();
  });

  it('does nothing when onAddScreen is not provided', async () => {
    mount();
    await screen.findByRole('button', { name: 'Doomed' });
    expect(() => fireEvent.keyDown(window, { key: 'n', shiftKey: true })).not.toThrow();
  });
});

describe('useWorkbenchKeyboard onOpenShortcuts', () => {
  it('calls onOpenShortcuts for a bare "?"', async () => {
    const onOpenShortcuts = vi.fn();
    mount({ onOpenShortcuts });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(window, { key: '?', shiftKey: true });
    expect(onOpenShortcuts).toHaveBeenCalledTimes(1);
  });

  it('ignores "?" while typing or while a popup or dialog owns the interaction', async () => {
    const onOpenShortcuts = vi.fn();
    mount({ onOpenShortcuts });
    await screen.findByRole('button', { name: 'Doomed' });

    fireEvent.keyDown(screen.getByLabelText('typing'), { key: '?', shiftKey: true });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Clear frame' }), { key: '?', shiftKey: true });
    expect(onOpenShortcuts).not.toHaveBeenCalled();
  });

  it('does nothing when onOpenShortcuts is not provided', async () => {
    mount();
    await screen.findByRole('button', { name: 'Doomed' });
    expect(() => fireEvent.keyDown(window, { key: '?', shiftKey: true })).not.toThrow();
  });
});
