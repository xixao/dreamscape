import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Screen } from '@/lib/files/repository';
import type { SnapBox } from '@/lib/canvas/snap';
import { createOverlayScreen } from '@/lib/files/screens';
import { ARTBOARD_MIN_HEIGHT } from '@/lib/stage';
import { FrameTitle } from './frame-title';

const SCREEN: Screen = { id: 's1', name: 'Frame 1', layout: '{}', stageWidth: 400, x: 100, y: 200 };

function renderTitle(overrides: Partial<Omit<ComponentProps<typeof FrameTitle>, 'onRename' | 'onMove'>> = {}) {
  const onRename = vi.fn();
  const onMove = vi.fn();
  const onSnapGuides = vi.fn();
  const onDragEnd = vi.fn();
  const props: ComponentProps<typeof FrameTitle> = {
    screen: SCREEN,
    focused: true,
    zoom: 1,
    // SCREEN has no stageHeight of its own - ARTBOARD_MIN_HEIGHT is what
    // the real caller (canvas.tsx, via frameRect) would resolve for it too
    // absent a fed measured height, matching this suite's previous
    // (pre-R1) implicit default.
    height: ARTBOARD_MIN_HEIGHT,
    onRename,
    onMove,
    onSnapGuides,
    onDragEnd,
    ...overrides,
  };
  return { ...render(<FrameTitle {...props} />), onRename, onMove, onSnapGuides, onDragEnd };
}

describe('FrameTitle', () => {
  it('renders the screen name in mono', () => {
    renderTitle();
    expect(screen.getByText('Frame 1')).toBeInTheDocument();
  });

  it('is text-t2 when focused, text-t4 otherwise', () => {
    const { rerender } = render(
      <FrameTitle screen={SCREEN} focused zoom={1} height={ARTBOARD_MIN_HEIGHT} onRename={vi.fn()} onMove={vi.fn()} />,
    );
    expect(screen.getByText('Frame 1')).toHaveClass('text-t2');

    rerender(
      <FrameTitle screen={SCREEN} focused={false} zoom={1} height={ARTBOARD_MIN_HEIGHT} onRename={vi.fn()} onMove={vi.fn()} />,
    );
    expect(screen.getByText('Frame 1')).toHaveClass('text-t4');
  });

  it('shows no badge after a plain screen\'s name', () => {
    renderTitle();
    expect(screen.queryByText('Dialog')).toBeNull();
    expect(screen.queryByText(/Sheet|Toast/)).toBeNull();
  });

  describe('overlay badge', () => {
    it('shows the mono presentation badge after an overlay frame\'s name', () => {
      const overlay = createOverlayScreen({ type: 'sheet', side: 'left', id: 'o1', name: 'Filters', pageId: 'p1', x: 0, y: 0 });
      renderTitle({ screen: overlay });

      expect(screen.getByText('Filters')).toBeInTheDocument();
      expect(screen.getByText('Sheet · Left')).toBeInTheDocument();
    });

    it('names a dialog and a toast badge with just their type', () => {
      const dialog = createOverlayScreen({ type: 'dialog', id: 'o2', name: 'Confirm', pageId: 'p1', x: 0, y: 0 });
      const { unmount } = renderTitle({ screen: dialog });
      expect(screen.getByText('Dialog')).toBeInTheDocument();
      unmount();

      const toast = createOverlayScreen({ type: 'toast', id: 'o3', name: 'Saved', pageId: 'p1', x: 0, y: 0 });
      renderTitle({ screen: toast });
      expect(screen.getByText('Toast')).toBeInTheDocument();
    });

    it('hides the badge while renaming', () => {
      const overlay = createOverlayScreen({ type: 'toast', id: 'o4', name: 'Saved', pageId: 'p1', x: 0, y: 0 });
      renderTitle({ screen: overlay });
      fireEvent.doubleClick(screen.getByText('Saved'));

      expect(screen.queryByText('Toast')).toBeNull();
    });
  });

  describe('drag to move', () => {
    it('moves the frame by the pointer delta, snapped to the 8px grid, dividing by the current zoom', () => {
      const { onMove } = renderTitle({ zoom: 1 });
      const title = screen.getByText('Frame 1');

      fireEvent.pointerDown(title, { pointerId: 1, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(title, { pointerId: 1, clientX: 20, clientY: 30 });

      // start (100,200) + (20,30) = (120,230), grid-snapped to (120,232).
      expect(onMove).toHaveBeenLastCalledWith({ x: 120, y: 232 }, { dx: 20, dy: 32 });
    });

    // Review re-review R1: the dragged frame's own box used to always use
    // screen.stageHeight ?? ARTBOARD_MIN_HEIGHT internally, one step behind
    // otherFrames (which canvas.tsx already builds with a fed measured
    // height) - for an auto-height frame taller than ARTBOARD_MIN_HEIGHT,
    // its own bottom/middle snaps landed 640px too high. A fed `height`
    // prop fixes this: the frame's real height (1000) is what its bottom
    // edge is measured from, not the 640px fallback.
    it('uses the fed height prop for the dragged frame\'s own box, not ARTBOARD_MIN_HEIGHT', () => {
      const other: SnapBox = { id: 'other', x: 0, y: 0, width: 400, height: 1004 };
      const { onMove } = renderTitle({ height: 1000, otherFrames: [other] });
      const title = screen.getByText('Frame 1');

      // start y=200; drag to raw y=5 (clientY delta -195) - the moving
      // frame's raw bottom (5+1000=1005) sits 1px from other's bottom
      // (1004), well within tolerance and nearer than the grid's own
      // candidate (nearestGrid(5)=8, distance 3).
      fireEvent.pointerDown(title, { pointerId: 1, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(title, { pointerId: 1, clientX: 4, clientY: -195 });

      // Bottom-to-bottom edge match resolves y to 1004-1000=4 regardless of
      // exactly how close the raw position was - ARTBOARD_MIN_HEIGHT (640)
      // would have put the raw bottom at 5+640=645, nowhere near other's
      // 1004, and the grid (8) would have won instead.
      expect(onMove).toHaveBeenLastCalledWith({ x: 104, y: 4 }, { dx: 4, dy: -196 });
    });

    it('divides the screen-pixel delta by the current zoom before snapping', () => {
      const { onMove } = renderTitle({ zoom: 0.5 });
      const title = screen.getByText('Frame 1');

      fireEvent.pointerDown(title, { pointerId: 1, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(title, { pointerId: 1, clientX: 20, clientY: 0 });

      // 20 screen px / 0.5 zoom = 40 canvas px; 100 + 40 = 140, grid-snapped to 144.
      expect(onMove).toHaveBeenLastCalledWith({ x: 144, y: 200 }, { dx: 44, dy: 0 });
    });

    it('requests pointer capture on pointerdown', () => {
      renderTitle();
      const title = screen.getByText('Frame 1') as HTMLElement;
      const setPointerCapture = vi.fn();
      title.setPointerCapture = setPointerCapture;

      fireEvent.pointerDown(title, { pointerId: 7, clientX: 0, clientY: 0 });

      expect(setPointerCapture).toHaveBeenCalledWith(7);
    });

    it('stops moving the frame after pointerup', () => {
      const { onMove } = renderTitle();
      const title = screen.getByText('Frame 1');

      fireEvent.pointerDown(title, { pointerId: 1, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(title, { pointerId: 1, clientX: 8, clientY: 0 });
      fireEvent.pointerUp(title, { pointerId: 1, clientX: 8, clientY: 0 });
      onMove.mockClear();

      fireEvent.pointerMove(title, { pointerId: 1, clientX: 100, clientY: 0 });

      expect(onMove).not.toHaveBeenCalled();
    });

    it('stops moving the frame after pointercancel', () => {
      const { onMove } = renderTitle();
      const title = screen.getByText('Frame 1');

      fireEvent.pointerDown(title, { pointerId: 1, clientX: 0, clientY: 0 });
      fireEvent.pointerCancel(title, { pointerId: 1, clientX: 0, clientY: 0 });
      onMove.mockClear();

      fireEvent.pointerMove(title, { pointerId: 1, clientX: 100, clientY: 0 });

      expect(onMove).not.toHaveBeenCalled();
    });

    it('ignores a pointermove from an unrelated pointerId', () => {
      const { onMove } = renderTitle();
      const title = screen.getByText('Frame 1');

      fireEvent.pointerDown(title, { pointerId: 1, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(title, { pointerId: 2, clientX: 100, clientY: 100 });

      expect(onMove).not.toHaveBeenCalled();
    });
  });

  describe('snapping to other frames', () => {
    const OTHER: SnapBox = { id: 's2', x: 500, y: 200, width: 100, height: 100 };

    it('snaps to another frame edge when it is nearer than the grid', () => {
      // start (100,200) + drag (401,0) -> raw (501,200). The grid's own
      // nearest line (504) is 3px away; the other frame's left edge (500)
      // is only 1px away and wins.
      const { onMove } = renderTitle({ otherFrames: [OTHER] });
      const title = screen.getByText('Frame 1');

      fireEvent.pointerDown(title, { pointerId: 1, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(title, { pointerId: 1, clientX: 401, clientY: 0 });

      expect(onMove).toHaveBeenLastCalledWith({ x: 500, y: 200 }, { dx: 400, dy: 0 });
    });

    // One of the review's named missing tests (task-grid-review.md): the
    // existing "snaps to another frame edge" case above only ever ran at
    // the default zoom of 1 - this confirms the screen-px-delta/zoom
    // division (already proven for the plain 8px grid by "divides the
    // screen-pixel delta by the current zoom" above) also happens BEFORE
    // matching against another frame's edge, not just before the grid.
    it('snaps to another frame edge at a zoom other than 1, dividing the screen-px delta by zoom first', () => {
      // 802 screen px / zoom 2 = 401 canvas px; start (100,200) + (401,0) =
      // raw (501,200) - the same raw position (and so the same result) as
      // the zoom-1 case above, reached with double the screen-px delta.
      const { onMove } = renderTitle({ zoom: 2, otherFrames: [OTHER] });
      const title = screen.getByText('Frame 1');

      fireEvent.pointerDown(title, { pointerId: 1, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(title, { pointerId: 1, clientX: 802, clientY: 0 });

      expect(onMove).toHaveBeenLastCalledWith({ x: 500, y: 200 }, { dx: 400, dy: 0 });
    });

    it('reports the resulting guides through onSnapGuides on every move', () => {
      const { onSnapGuides } = renderTitle({ otherFrames: [OTHER] });
      const title = screen.getByText('Frame 1');

      fireEvent.pointerDown(title, { pointerId: 1, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(title, { pointerId: 1, clientX: 401, clientY: 0 });

      expect(onSnapGuides).toHaveBeenLastCalledWith(
        expect.objectContaining({ guides: expect.arrayContaining([expect.objectContaining({ kind: 'edge' })]) }),
      );
    });

    it('clears the guides and calls onDragEnd on pointerup', () => {
      const { onSnapGuides, onDragEnd } = renderTitle({ otherFrames: [OTHER] });
      const title = screen.getByText('Frame 1');

      fireEvent.pointerDown(title, { pointerId: 1, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(title, { pointerId: 1, clientX: 401, clientY: 0 });
      onSnapGuides.mockClear();
      fireEvent.pointerUp(title, { pointerId: 1, clientX: 401, clientY: 0 });

      expect(onSnapGuides).toHaveBeenLastCalledWith({ guides: [], distances: [] });
      expect(onDragEnd).toHaveBeenCalledTimes(1);
    });

    it('clears the guides and calls onDragEnd on pointercancel', () => {
      const { onSnapGuides, onDragEnd } = renderTitle({ otherFrames: [OTHER] });
      const title = screen.getByText('Frame 1');

      fireEvent.pointerDown(title, { pointerId: 1, clientX: 0, clientY: 0 });
      fireEvent.pointerCancel(title, { pointerId: 1, clientX: 0, clientY: 0 });

      expect(onSnapGuides).toHaveBeenLastCalledWith({ guides: [], distances: [] });
      expect(onDragEnd).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cmd disables snapping', () => {
    it('moves freely (no grid rounding) while Cmd is held', () => {
      const { onMove } = renderTitle();
      const title = screen.getByText('Frame 1');

      fireEvent.pointerDown(title, { pointerId: 1, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(title, { pointerId: 1, clientX: 23, clientY: 5, metaKey: true });

      // Raw (123, 205), no grid snap applied.
      expect(onMove).toHaveBeenLastCalledWith({ x: 123, y: 205 }, { dx: 23, dy: 5 });
    });

    it('also disables via Ctrl (the Windows/Linux Mod key)', () => {
      const { onMove } = renderTitle();
      const title = screen.getByText('Frame 1');

      fireEvent.pointerDown(title, { pointerId: 1, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(title, { pointerId: 1, clientX: 23, clientY: 5, ctrlKey: true });

      expect(onMove).toHaveBeenLastCalledWith({ x: 123, y: 205 }, { dx: 23, dy: 5 });
    });

    // Review fix wave item 1 (blocker): a Cmd-held drag still runs the
    // screen-px-delta-divided-by-zoom math (just skipping the snap step
    // itself), and at a zoom that doesn't divide evenly the result is
    // fractional - validateScreens rejects a non-integer x/y outright, so
    // this must still land on a whole canvas px even with snapping off.
    it('still rounds to a whole canvas px at a zoom that divides unevenly, even with Cmd held', () => {
      const { onMove } = renderTitle({ zoom: 0.75 });
      const title = screen.getByText('Frame 1');

      fireEvent.pointerDown(title, { pointerId: 1, clientX: 0, clientY: 0 });
      // 23 screen px / 0.75 zoom = 30.6666...; start.x 100 + that = 130.6666...
      fireEvent.pointerMove(title, { pointerId: 1, clientX: 23, clientY: 0, metaKey: true });

      expect(onMove).toHaveBeenLastCalledWith({ x: 131, y: 200 }, { dx: 31, dy: 0 });
    });
  });

  describe('Alt shows distances to the nearest neighbours', () => {
    it('reports distances through onSnapGuides even when nothing snaps', () => {
      const other: SnapBox = { id: 's2', x: -400, y: 200, width: 100, height: 100 };
      const { onSnapGuides } = renderTitle({ otherFrames: [other] });
      const title = screen.getByText('Frame 1');

      fireEvent.pointerDown(title, { pointerId: 1, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(title, { pointerId: 1, clientX: 3, clientY: 0, altKey: true });

      expect(onSnapGuides).toHaveBeenLastCalledWith(
        expect.objectContaining({ distances: expect.arrayContaining([expect.objectContaining({ side: 'left' })]) }),
      );
    });
  });

  describe('double-click to rename', () => {
    it('opens an inline input with the current name, focused and selected', () => {
      renderTitle();
      fireEvent.doubleClick(screen.getByText('Frame 1'));

      const input = screen.getByRole('textbox', { name: 'Frame name' }) as HTMLInputElement;
      expect(input).toHaveValue('Frame 1');
      expect(input).toHaveFocus();
    });

    it('commits a trimmed name on Enter', () => {
      const { onRename } = renderTitle();
      fireEvent.doubleClick(screen.getByText('Frame 1'));

      const input = screen.getByRole('textbox', { name: 'Frame name' });
      fireEvent.change(input, { target: { value: '  Renamed  ' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onRename).toHaveBeenCalledWith('Renamed');
      expect(screen.queryByRole('textbox', { name: 'Frame name' })).toBeNull();
    });

    it('cancels on Escape without calling onRename', () => {
      const { onRename } = renderTitle();
      fireEvent.doubleClick(screen.getByText('Frame 1'));

      const input = screen.getByRole('textbox', { name: 'Frame name' });
      fireEvent.change(input, { target: { value: 'Discarded' } });
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(onRename).not.toHaveBeenCalled();
      expect(screen.queryByRole('textbox', { name: 'Frame name' })).toBeNull();
      expect(screen.getByText('Frame 1')).toBeInTheDocument();
    });

    it('does not commit on blur (matching the screens strip)', () => {
      const { onRename } = renderTitle();
      fireEvent.doubleClick(screen.getByText('Frame 1'));

      const input = screen.getByRole('textbox', { name: 'Frame name' });
      fireEvent.change(input, { target: { value: 'Ignored' } });
      fireEvent.blur(input);

      expect(onRename).not.toHaveBeenCalled();
    });

    it('does not call onRename when the name is unchanged or emptied', () => {
      const { onRename } = renderTitle();
      fireEvent.doubleClick(screen.getByText('Frame 1'));
      let input = screen.getByRole('textbox', { name: 'Frame name' });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onRename).not.toHaveBeenCalled();

      fireEvent.doubleClick(screen.getByText('Frame 1'));
      input = screen.getByRole('textbox', { name: 'Frame name' });
      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onRename).not.toHaveBeenCalled();
    });
  });
});
