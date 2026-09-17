'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Lasso, X } from 'lucide-react';
import { CHIP, PANEL } from '../chrome';
export type ChatTarget = { id: string; name: string };
type Outline = { x: number; y: number }[];
const outlines = new Map<string, Outline>();
const pendingOutlines = new Map<string, { token: object; points: Outline }>();
const drafts = new Map<string, ChatTarget[]>();
const empty: ChatTarget[] = [];
const listeners = new Set<() => void>();
export function setChatSelection(fileId: string, targets: ChatTarget[], outline?: Outline) {
  if (outline) outlines.set(fileId, outline);
  if (!targets.length) outlines.delete(fileId);
  if (targets.length) drafts.set(fileId, targets); else drafts.delete(fileId);
  listeners.forEach(fn => fn());
}
export function useChatSelection(fileId: string) {
  return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => drafts.get(fileId) || empty, () => empty);
}
// Transfer the drawn boundary from the composer to the in-flight request.
export function beginSelectionRequest(fileId: string) {
  const token = {};
  const points = outlines.get(fileId);
  if (points) pendingOutlines.set(fileId, {token, points});
  listeners.forEach(fn => fn());
  return () => {
    if (pendingOutlines.get(fileId)?.token === token) {
      pendingOutlines.delete(fileId); listeners.forEach(fn => fn());
    }
  };
}
const noOutline: Outline = [];
export function useSelectionOutline(fileId: string) {
  return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => outlines.get(fileId) || pendingOutlines.get(fileId)?.points || noOutline, () => noOutline);
}
function highlight(targets: ChatTarget[]) { window.dispatchEvent(new CustomEvent('dreamscape:highlight-chat-selection', { detail: targets.map(t => t.id) })); }
export function SelectionChip({ targets, onRemove }: { targets: ChatTarget[]; onRemove?: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => () => highlight([]), []);
  if (!targets.length) return null;
  return <div className="relative mb-2 max-w-full" onMouseEnter={() => highlight(targets)} onMouseLeave={() => highlight([])} onFocus={() => highlight(targets)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) highlight([]); }}>
    <div className={`${CHIP} w-fit max-w-full text-xs`}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-w-0 items-center gap-1.5 py-1"><Lasso className="size-3.5 shrink-0" /><span className="truncate">Selected area · {targets.length} {targets.length === 1 ? 'component' : 'components'}</span></button>
      {onRemove && <button type="button" aria-label="Remove selected area" onClick={() => { highlight([]); onRemove(); }} className="rounded p-1 hover:bg-accent"><X className="size-3" /></button>}
    </div>
    {open && <div className={`${PANEL} absolute bottom-full left-0 z-50 mb-1 w-60 max-h-48 overflow-y-auto p-2 text-xs`}><ul aria-label="Components in selected area">{targets.map(t => <li className="truncate px-2 py-1" key={t.id} title={t.name}>{t.name}</li>)}</ul></div>}
  </div>;
}
