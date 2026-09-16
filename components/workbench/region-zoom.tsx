'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCanvasDocument } from './canvas-frame';
import { isElementLike } from '@/lib/dom';
import type { FrameRect } from '@/lib/canvas/viewport';

export function RegionZoom({ active = true, builder = false, host: explicitHost, onRegion }: {
  active?: boolean; builder?: boolean; host?: HTMLElement | null;
  onRegion: (rect: FrameRect, host: HTMLElement) => void;
}) {
  const canvas = useCanvasDocument();
  const [marker, setMarker] = useState<HTMLSpanElement | null>(null);
  const [held, setHeld] = useState(false);
  const [box, setBox] = useState<FrameRect | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const host = explicitHost ?? marker?.parentElement;
  useEffect(() => {
    if (!active) return;
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && held) { e.preventDefault(); e.stopImmediatePropagation(); cancel(); return; }
      if (e.key.toLowerCase() !== 'z' || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.isComposing) return;
      if (isElementLike(e.target) && e.target.closest('input,textarea,select,[contenteditable="true"]')) return;
      if ((!builder && document.querySelector('[aria-label="Component Builder"]')) || document.querySelector('[role="dialog"]:not([aria-label="Component Builder"]),[role="menu"]')) return;
      e.preventDefault(); setHeld(true);
    };
    const cancel = () => { setHeld(false); setBox(null); start.current = null; };
    const up = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'z' || e.key === 'Escape') cancel(); };
    const docs = [...new Set([document, ...(canvas ? [canvas.document] : [])])];
    docs.forEach(doc => { doc.addEventListener('keydown', down, true); doc.addEventListener('keyup', up, true); });
    window.addEventListener('blur', cancel);
    return () => { docs.forEach(doc => { doc.removeEventListener('keydown', down, true); doc.removeEventListener('keyup', up, true); }); window.removeEventListener('blur', cancel); };
  }, [active, builder, canvas, held]);
  const rect = host?.getBoundingClientRect();
  return <><span ref={setMarker} hidden />{active && held && host && rect && createPortal(
    <div data-testid="region-zoom" aria-label="Drag to zoom into an area" className="fixed z-[5] cursor-zoom-in touch-none" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture?.(e.pointerId); start.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }; }}
      onPointerMove={e => { if (!start.current) return; e.stopPropagation(); const x = e.clientX - rect.left, y = e.clientY - rect.top; setBox({ x: Math.min(x, start.current.x), y: Math.min(y, start.current.y), width: Math.abs(x - start.current.x), height: Math.abs(y - start.current.y) }); }}
      onPointerUp={e => { e.stopPropagation(); const origin = start.current; start.current = null; setBox(null); if (!origin) return; const x = e.clientX - rect.left, y = e.clientY - rect.top; const region = { x: Math.min(x, origin.x), y: Math.min(y, origin.y), width: Math.abs(x - origin.x), height: Math.abs(y - origin.y) }; if (region.width > 5 && region.height > 5) onRegion(region, host); }}
      onPointerCancel={() => { start.current = null; setBox(null); }}>
      <span className="absolute left-3 top-3 rounded bg-card px-2 py-1 text-xs shadow">Drag an area to zoom · Esc to cancel</span>
      {box && <div className="pointer-events-none absolute border border-acc bg-acc/10" style={{ left: box.x, top: box.y, width: box.width, height: box.height }} />}
    </div>, host)}</>;
}
