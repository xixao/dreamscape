import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { ROOT_NODE } from '@craftjs/core';
import { emptyLayoutJson } from '@/components/blocks/registry';
import { renderInEditor } from '@/test/craft-harness';
import { Stage } from './stage';
import { useStage } from './stage-context';

describe('Stage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('resizes with the grip, dividing the pointer delta by the zoom', async () => {
    renderInEditor(<Stage data={emptyLayoutJson()} />, { width: 1000 });
    const grip = await screen.findByRole('separator', { name: 'Resize the stage' });
    expect(grip).toHaveAttribute('aria-valuenow', '1000');

    fireEvent.pointerDown(grip, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(grip, { clientX: 300, pointerId: 1 });
    expect(screen.getByTestId('artboard')).toHaveStyle({ width: '1200px' });
    fireEvent.pointerUp(grip, { clientX: 300, pointerId: 1 });

    fireEvent.pointerDown(grip, { clientX: 300, pointerId: 1 });
    fireEvent.pointerMove(grip, { clientX: -5000, pointerId: 1 });
    expect(screen.getByTestId('artboard')).toHaveStyle({ width: '320px' });
    fireEvent.pointerUp(grip, { clientX: -5000, pointerId: 1 });
  });

  it('resizes with the arrow keys, ten times faster with Shift', async () => {
    renderInEditor(<Stage data={emptyLayoutJson()} />, { width: 1000 });
    const grip = await screen.findByRole('separator', { name: 'Resize the stage' });
    fireEvent.keyDown(grip, { key: 'ArrowRight' });
    expect(screen.getByTestId('artboard')).toHaveStyle({ width: '1010px' });
    fireEvent.keyDown(grip, { key: 'ArrowRight', shiftKey: true });
    expect(screen.getByTestId('artboard')).toHaveStyle({ width: '1110px' });
    fireEvent.keyDown(grip, { key: 'ArrowLeft' });
    expect(screen.getByTestId('artboard')).toHaveStyle({ width: '1100px' });
  });

  it('scales the artboard down when the column is narrower than it', async () => {
    const spy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(768);
    function ZoomProbe() {
      return <output data-testid="zoom">{useStage().zoom}</output>;
    }
    renderInEditor(
      <>
        <Stage data={emptyLayoutJson()} />
        <ZoomProbe />
      </>,
      { width: 1440 },
    );
    await waitFor(() => expect(screen.getByTestId('zoom')).toHaveTextContent('0.5'));
    spy.mockRestore();
  });
});
