import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Screen } from '@/lib/files/repository';
import { FrameTitle } from './frame-title';

const SCREEN: Screen = { id: 's1', name: 'Frame 1', layout: '{}', stageWidth: 400, x: 100, y: 200 };

function renderTitle(overrides: Partial<Omit<ComponentProps<typeof FrameTitle>, 'onRename' | 'onMove'>> = {}) {
  const onRename = vi.fn();
  const onMove = vi.fn();
  const props: ComponentProps<typeof FrameTitle> = {
    screen: SCREEN,
    focused: true,
    zoom: 1,
    onRename,
    onMove,
    ...overrides,
  };
  return { ...render(<FrameTitle {...props} />), onRename, onMove };
}

describe('FrameTitle', () => {
  it('renders the screen name in mono', () => {
    renderTitle();
    expect(screen.getByText('Frame 1')).toBeInTheDocument();
  });

  it('is text-t2 when focused, text-t4 otherwise', () => {
    const { rerender } = render(<FrameTitle screen={SCREEN} focused zoom={1} onRename={vi.fn()} onMove={vi.fn()} />);
    expect(screen.getByText('Frame 1')).toHaveClass('text-t2');

    rerender(<FrameTitle screen={SCREEN} focused={false} zoom={1} onRename={vi.fn()} onMove={vi.fn()} />);
    expect(screen.getByText('Frame 1')).toHaveClass('text-t4');
  });

  describe('drag to move', () => {
    it('moves the frame by the pointer delta, snapped to 8px, dividing by the current zoom', () => {
      const { onMove } = renderTitle({ zoom: 1 });
      const title = screen.getByText('Frame 1');

      fireEvent.pointerDown(title, { pointerId: 1, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(title, { pointerId: 1, clientX: 20, clientY: 30 });

      // start (100,200) + (20,30) = (120,230), snapped to the nearest 8: 120, 232.
      expect(onMove).toHaveBeenLastCalledWith({ x: 120, y: 232 });
    });

    it('divides the screen-pixel delta by the current zoom before snapping', () => {
      const { onMove } = renderTitle({ zoom: 0.5 });
      const title = screen.getByText('Frame 1');

      fireEvent.pointerDown(title, { pointerId: 1, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(title, { pointerId: 1, clientX: 20, clientY: 0 });

      // 20 screen px / 0.5 zoom = 40 canvas px; 100 + 40 = 140, snapped to 144.
      expect(onMove).toHaveBeenLastCalledWith({ x: 144, y: 200 });
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

  describe('double-click to rename', () => {
    it('opens an inline input with the current name, focused and selected', () => {
      renderTitle();
      fireEvent.doubleClick(screen.getByText('Frame 1'));

      const input = screen.getByRole('textbox', { name: 'Screen name' }) as HTMLInputElement;
      expect(input).toHaveValue('Frame 1');
      expect(input).toHaveFocus();
    });

    it('commits a trimmed name on Enter', () => {
      const { onRename } = renderTitle();
      fireEvent.doubleClick(screen.getByText('Frame 1'));

      const input = screen.getByRole('textbox', { name: 'Screen name' });
      fireEvent.change(input, { target: { value: '  Renamed  ' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onRename).toHaveBeenCalledWith('Renamed');
      expect(screen.queryByRole('textbox', { name: 'Screen name' })).toBeNull();
    });

    it('cancels on Escape without calling onRename', () => {
      const { onRename } = renderTitle();
      fireEvent.doubleClick(screen.getByText('Frame 1'));

      const input = screen.getByRole('textbox', { name: 'Screen name' });
      fireEvent.change(input, { target: { value: 'Discarded' } });
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(onRename).not.toHaveBeenCalled();
      expect(screen.queryByRole('textbox', { name: 'Screen name' })).toBeNull();
      expect(screen.getByText('Frame 1')).toBeInTheDocument();
    });

    it('does not commit on blur (matching the screens strip)', () => {
      const { onRename } = renderTitle();
      fireEvent.doubleClick(screen.getByText('Frame 1'));

      const input = screen.getByRole('textbox', { name: 'Screen name' });
      fireEvent.change(input, { target: { value: 'Ignored' } });
      fireEvent.blur(input);

      expect(onRename).not.toHaveBeenCalled();
    });

    it('does not call onRename when the name is unchanged or emptied', () => {
      const { onRename } = renderTitle();
      fireEvent.doubleClick(screen.getByText('Frame 1'));
      let input = screen.getByRole('textbox', { name: 'Screen name' });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onRename).not.toHaveBeenCalled();

      fireEvent.doubleClick(screen.getByText('Frame 1'));
      input = screen.getByRole('textbox', { name: 'Screen name' });
      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onRename).not.toHaveBeenCalled();
    });
  });
});
