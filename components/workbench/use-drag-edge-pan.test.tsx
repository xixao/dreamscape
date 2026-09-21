import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { edgeVelocity, useDragEdgePan } from './use-drag-edge-pan';
import { DRAG_POINTER } from './drag-surfaces';

afterEach(() => vi.restoreAllMocks());
describe('drag edge panning', () => {
  it('accelerates toward the edge and never pans beyond bounds or with invalid coordinates', () => {
    expect(edgeVelocity(500, 0, 1000)).toBe(0);
    expect(edgeVelocity(10, 0, 1000)).toBeGreaterThan(edgeVelocity(40, 0, 1000));
    expect(edgeVelocity(990, 0, 1000)).toBeLessThan(0);
    expect(edgeVelocity(-1, 0, 1000)).toBe(0);
    expect(edgeVelocity(NaN, 0, 1000)).toBe(0);
  });
  it('stops immediately on cancellation and excludes floating panels', () => {
    let callback: FrameRequestCallback | undefined;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(fn => { callback = fn; return 1; });
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => { callback = undefined; });
    const root = document.createElement('div');
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 } as DOMRect);
    const update = vi.fn();
    const { unmount } = renderHook(() => useDragEdgePan({ current: root }, update));
    act(() => { window.dispatchEvent(new CustomEvent(DRAG_POINTER, { detail: { x: 990, y: 400 } })); });
    act(() => { callback?.(performance.now()); callback?.(performance.now() + 16); });
    expect(update).toHaveBeenCalled();
    act(() => { window.dispatchEvent(new CustomEvent(DRAG_POINTER, { detail: null })); });
    expect(cancel).toHaveBeenCalled();
    expect(callback).toBeUndefined();
    update.mockClear();
    const panel = document.createElement('aside'); document.body.append(panel);
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({ left: 800, right: 1000, top: 0, bottom: 800, width: 200, height: 800 } as DOMRect);
    act(() => { window.dispatchEvent(new CustomEvent(DRAG_POINTER, { detail: { x: 990, y: 400 } })); callback?.(performance.now()); });
    expect(update).not.toHaveBeenCalled();
    panel.remove(); unmount();
  });
});
