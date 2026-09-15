'use client';
import { useEffect, useRef, useState } from 'react';
const KEY = 'dreamscape:left-panel-width';
export const clampPanelWidth = (value: number) => Math.max(256, Math.min(400, Number.isFinite(value) ? value : 256));
export function useLeftPanelWidth() {
  const read = () => { try { return clampPanelWidth(Number(localStorage.getItem(KEY) ?? 256)); } catch { return 256; } };
  const [width, update] = useState(read);
  useEffect(() => { const sync = () => update(read()); window.addEventListener(KEY, sync); return () => window.removeEventListener(KEY, sync); }, []);
  const setWidth = (value: number) => { const next = clampPanelWidth(value); update(next); try { localStorage.setItem(KEY, String(next)); window.dispatchEvent(new Event(KEY)); } catch { /* Keep resizing usable without storage. */ } };
  return [width, setWidth] as const;
}
export function PanelResize({ width, onChange }: { width: number; onChange: (width: number) => void }) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  return <div role="separator" aria-label="Resize left panel" aria-orientation="vertical" aria-valuemin={256} aria-valuemax={400} aria-valuenow={width} tabIndex={0}
    className="absolute inset-y-2 right-0 z-40 w-1.5 cursor-col-resize touch-none rounded hover:bg-acc/40 focus-visible:bg-acc/40 focus-visible:outline-none group-has-[[data-layers-collapsed=true]]/left-panel:hidden"
    onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); drag.current = { x: event.clientX, width }; event.currentTarget.setPointerCapture(event.pointerId); }}
    onPointerMove={event => { if (drag.current) { event.preventDefault(); onChange(drag.current.width + event.clientX - drag.current.x); } }}
    onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
    onDoubleClick={() => onChange(256)}
    onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); onChange(event.key === 'Home' ? 256 : event.key === 'End' ? 400 : width + (event.key === 'ArrowRight' ? 8 : -8)); } }} />;
}
