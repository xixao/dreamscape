'use client';
import { useEffect, type RefObject } from 'react';
import { DRAG_POINTER, DRAG_PANNED } from './drag-surfaces';
import type { Viewport } from '@/lib/canvas/viewport';

export function edgeVelocity(position: number, start: number, end: number): number {
  if (![position, start, end].every(Number.isFinite) || position < start || position > end || end <= start) return 0;
  const band = Math.min(56, (end - start) / 4);
  if (position < start + band) return 420 * ((start + band - position) / band) ** 2;
  if (position > end - band) return -420 * ((position - end + band) / band) ** 2;
  return 0;
}

export function useDragEdgePan(root: RefObject<HTMLDivElement | null>, setViewport: (update: (current: Viewport) => Viewport) => void) {
  useEffect(() => {
    let point: { x: number; y: number; at: number } | null = null;
    let raf = 0, previous = 0;
    const stop = () => { point = null; cancelAnimationFrame(raf); raf = 0; previous = 0; };
    const tick = (now: number) => {
      raf = 0;
      if (!point || now - point.at > 600 || !root.current) { stop(); return; }
      const bounds = root.current.getBoundingClientRect();
      let left = bounds.left, right = bounds.right, top = bounds.top, bottom = bounds.bottom;
      for (const panel of document.querySelectorAll<HTMLElement>('aside, header, [role="dialog"], [role="menu"]')) {
        if (panel.hasAttribute('data-drag-obscured')) continue;
        const r = panel.getBoundingClientRect();
        if (!r.width || !r.height || getComputedStyle(panel).visibility === 'hidden') continue;
        if (point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom) { stop(); return; }
        if (r.height > bounds.height / 3) {
          if (r.left < (bounds.left + bounds.right) / 2) left = Math.max(left, r.right);
          else right = Math.min(right, r.left);
        } else if (r.top < bounds.top + 100) top = Math.max(top, r.bottom);
      }
      if (point.x < left || point.x > right || point.y < top || point.y > bottom) { stop(); return; }
      const dt = previous ? Math.min(32, now - previous) / 1000 : 0;
      previous = now;
      const dx = edgeVelocity(point.x, left, right) * dt;
      const dy = edgeVelocity(point.y, top, bottom) * dt;
      if (dx || dy) {
        setViewport(v => ({ ...v, x: v.x + dx, y: v.y + dy }));
        window.dispatchEvent(new Event(DRAG_PANNED));
      }
      raf = requestAnimationFrame(tick);
    };
    const move = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail || !Number.isFinite(detail.x) || !Number.isFinite(detail.y)) { stop(); return; }
      point = { ...detail, at: performance.now() };
      if (!raf) raf = requestAnimationFrame(tick);
    };
    window.addEventListener(DRAG_POINTER, move);
    window.addEventListener('blur', stop);
    return () => { stop(); window.removeEventListener(DRAG_POINTER, move); window.removeEventListener('blur', stop); };
  }, [root, setViewport]);
}
