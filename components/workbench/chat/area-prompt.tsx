'use client';
import { layerLabel } from '@/lib/layer-label';
import { useEffect, useRef, useState } from 'react';
import { useEditor } from '@craftjs/core';
import { X } from 'lucide-react';
import { PANEL } from '../chrome';
import { lassoEncloses, type Point } from './lasso';
import { useCanvasViewport } from '../canvas';
import { setChatSelection, useSelectionOutline } from './selection-chip';
type Box = { left: number; top: number; width: number; height: number };
export function screenBox(dom: HTMLElement): Box {
  const r = dom.getBoundingClientRect(); const frame = dom.ownerDocument.defaultView?.frameElement as HTMLElement | null;
  if (!frame) return r;
  const f = frame.getBoundingClientRect(); const scale = f.width / (frame.offsetWidth || f.width);
  return { left: f.left + r.left * scale, top: f.top + r.top * scale, width: r.width * scale, height: r.height * scale };
}
export function AreaPrompt({ fileId, onCapture }: { fileId: string; onCapture: () => void }) {
  const { query } = useEditor();
  const { viewport } = useCanvasViewport();
  const outline = useSelectionOutline(fileId);
  const [active, setActive] = useState(false);
  const stroke = useRef<Point[]>([]);
  const pointer = useRef<number | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [empty, setEmpty] = useState(false);
  const [highlightIds, setHighlightIds] = useState<string[]>([]);
  const [highlights, setHighlights] = useState<Box[]>([]);
  useEffect(() => { const show = (e: Event) => setHighlightIds((e as CustomEvent<string[]>).detail); window.addEventListener('dreamscape:highlight-chat-selection', show); return () => window.removeEventListener('dreamscape:highlight-chat-selection', show); }, []);
  useEffect(() => { if (!highlightIds.length) { setHighlights([]); return; } let raf: number; const update = () => { const nodes = query.getNodes(); setHighlights(highlightIds.flatMap(id => nodes[id]?.dom?.isConnected ? [screenBox(nodes[id].dom!)] : [])); raf = requestAnimationFrame(update); }; update(); return () => cancelAnimationFrame(raf); }, [highlightIds, query]);
  useEffect(() => { const start = () => { setActive(true); stroke.current = []; pointer.current = null; setPoints([]); setEmpty(false); }; window.addEventListener('dreamscape:ask-area', start); return () => window.removeEventListener('dreamscape:ask-area', start); }, []);
  useEffect(() => { if (!active) return; const key = (e:KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); setActive(false); } }; window.addEventListener('keydown', key, true); return () => window.removeEventListener('keydown', key, true); }, [active]);
  if (!active) return <>{outline.length > 2 && <svg aria-hidden data-testid="pending-lasso-highlight" className="pointer-events-none fixed inset-0 z-[9] h-full w-full text-primary"><polygon points={outline.map(p=>`${p.x * viewport.zoom + viewport.x},${p.y * viewport.zoom + viewport.y}`).join(' ')} fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>}{highlights.map((r, i) => <div key={i} style={r} className="pointer-events-none fixed z-40 border-2 border-primary bg-primary/10" />)}</>;
  return <div className="fixed inset-0 z-[90] cursor-crosshair" aria-label="Select an area for AI" onPointerDown={e => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button,[data-lasso-help]')) return;
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
    pointer.current = e.pointerId; stroke.current = [{x:e.clientX,y:e.clientY}]; setPoints([...stroke.current]); setEmpty(false);
  }} onPointerMove={e => {
    if (pointer.current !== e.pointerId) return;
    const samples = e.nativeEvent.getCoalescedEvents?.() || [e.nativeEvent];
    for (const sample of samples.length ? samples : [e.nativeEvent]) {
      const last=stroke.current[stroke.current.length-1];
      if (Math.hypot(sample.clientX-last.x,sample.clientY-last.y)>=2) stroke.current.push({x:sample.clientX,y:sample.clientY});
    }
    setPoints([...stroke.current]);
  }} onPointerCancel={() => { pointer.current=null; stroke.current=[]; setPoints([]); }} onPointerUp={e => {
    if (pointer.current !== e.pointerId) return;
    pointer.current=null;
    const polygon=[...stroke.current,{x:e.clientX,y:e.clientY}];

    const matches = Object.values(query.getNodes()).filter(n => n.dom?.isConnected && lassoEncloses(polygon,screenBox(n.dom)));
    if (!matches.length) { setEmpty(true); return; }
    setChatSelection(fileId, matches.map(n => ({id:n.id,name:layerLabel(n.data)})), polygon.map(p => ({x:(p.x-viewport.x)/viewport.zoom,y:(p.y-viewport.y)/viewport.zoom})));
    setActive(false); onCapture();
  }}>
    <div data-lasso-help className={`${PANEL} absolute top-20 left-1/2 -translate-x-1/2 px-3 py-2 text-xs flex items-center gap-3`}>{empty ? 'No components enclosed. Circle them again.' : 'Circle components to ask AI. Release to finish. Escape cancels.'}<button aria-label="Cancel area prompt" onClick={()=>setActive(false)}><X className="size-4" /></button></div>
    {points.length > 1 && <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-primary"><polyline points={points.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d={`M ${points[points.length-1].x} ${points[points.length-1].y} L ${points[0].x} ${points[0].y}`} fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" opacity="0.5" /></svg>}
  </div>;
}
