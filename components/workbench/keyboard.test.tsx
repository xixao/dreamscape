import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Element, Frame, ROOT_NODE } from '@craftjs/core';
import { Button } from '@/components/blocks/button';
import { LayoutBox } from '@/components/blocks/layout-box';
import { renderInEditor } from '@/test/craft-harness';
import { isEditableTarget, useWorkbenchKeyboard } from './keyboard';

function Keys() {
  useWorkbenchKeyboard();
  return (
    <>
      <input aria-label="typing" />
      <div role="alertdialog">
        <button type="button">Clear frame</button>
      </div>
    </>
  );
}

function mount() {
  const utils = renderInEditor(
    <>
      <Frame>
        <Element is={LayoutBox} canvas>
          <Button label="Doomed" />
        </Element>
      </Frame>
      <Keys />
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
