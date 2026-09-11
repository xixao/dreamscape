import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { ROOT_NODE } from '@craftjs/core';
import { emptyLayoutJson } from '@/components/blocks/registry';
import { renderInEditor } from '@/test/craft-harness';
import { Stage } from './stage';

describe('Stage', () => {
  it('renders the artboard at the stage width in the basic theme', async () => {
    renderInEditor(<Stage data={emptyLayoutJson()} />, { width: 768 });
    const artboard = await screen.findByTestId('artboard');
    expect(artboard).toHaveClass('theme-basic');
    expect(artboard).toHaveStyle({ width: '768px', minHeight: '640px' });
    expect(await screen.findByText('Nothing on the stage yet')).toBeInTheDocument();
  });

  it('deselects when the canvas outside the artboard is pressed', async () => {
    const { editor } = renderInEditor(<Stage data={emptyLayoutJson()} />);
    await screen.findByText('Nothing on the stage yet');
    editor().actions.selectNode(ROOT_NODE);
    await waitFor(() => expect(editor().query.getEvent('selected').contains(ROOT_NODE)).toBe(true));

    fireEvent.pointerDown(screen.getByTestId('stage-column'));
    await waitFor(() => expect(editor().query.getEvent('selected').contains(ROOT_NODE)).toBe(false));
  });

  it('keeps the selection when the artboard itself is pressed', async () => {
    const { editor } = renderInEditor(<Stage data={emptyLayoutJson()} />);
    await screen.findByText('Nothing on the stage yet');
    editor().actions.selectNode(ROOT_NODE);
    await waitFor(() => expect(editor().query.getEvent('selected').contains(ROOT_NODE)).toBe(true));

    fireEvent.pointerDown(screen.getByTestId('artboard'));
    expect(editor().query.getEvent('selected').contains(ROOT_NODE)).toBe(true);
  });
});
