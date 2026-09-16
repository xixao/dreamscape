import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useCanvasNotes } from './use-canvas-notes';

it('hides both canvas and frame notes, cancels placement, and restores visibility when starting a note', () => {
  const { result } = renderHook(() => useCanvasNotes('visibility-test', 'frame1', 'frame1', 'page1'));
  act(() => result.current.start('accessibility'));
  act(() => result.current.commentsProps.onPlacePin(10, 20, undefined));
  expect(result.current.commentsProps.pendingPin).not.toBeNull();
  act(() => result.current.toggleVisibility());
  expect(result.current.commentsProps.visible).toBe(false);
  expect(result.current.canvasComments.visible).toBe(false);
  expect(result.current.commentMode).toBe(false);
  expect(result.current.commentsProps.pendingPin).toBeNull();
  act(() => result.current.start('annotation'));
  expect(result.current.commentsProps.visible).toBe(true);
  expect(result.current.canvasComments.visible).toBe(true);
});
