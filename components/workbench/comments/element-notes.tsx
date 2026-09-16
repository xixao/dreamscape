'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { useEditor } from '@craftjs/core';
import type { Rect } from '@/lib/comments/geometry';
import { CommentLayer } from './comment-layer';
import type { CanvasNotes } from './use-canvas-notes';
export const BuilderNotesContext = createContext<{ notes: CanvasNotes; portal: HTMLElement | null } | null>(null);

export function ElementNotes({ frame, scale }: { frame: HTMLElement | null; scale: number }) {
  const context = useContext(BuilderNotesContext);
  const { query } = useEditor();
  const [rect, setRect] = useState<Rect | null>(null);
  useEffect(() => {
    if (!frame || !context) return;
    let handle = 0; let previous = '';
    function measure() {
      const bounds = frame!.getBoundingClientRect();
      const next = { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height };
      const signature = JSON.stringify(next);
      if (signature !== previous) { previous = signature; setRect(next); }
      handle = requestAnimationFrame(measure);
    }
    measure(); return () => cancelAnimationFrame(handle);
  }, [frame, Boolean(context)]);
  if (!context) return null;
  const { notes, portal } = context;
  return <>
    {notes.commentMode && <div data-testid="component-note-cover" className="absolute inset-0 z-20 cursor-crosshair" onPointerDown={event => {
      event.preventDefault(); event.stopPropagation();
      if (event.button !== 0 || !frame) return;
      const bounds = frame.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / scale, y = (event.clientY - bounds.top) / scale;
      const nodes = query.getState().nodes;
      const doc = nodes.ROOT?.dom?.ownerDocument;
      const hit = doc?.elementFromPoint?.(x, y);
      const candidates = Object.entries(nodes).filter(([, node]) => hit && node.dom?.contains(hit));
      const depth = (id: string) => { let count = 0; let parent = nodes[id]?.data.parent; const visited = new Set<string>(); while (parent && !visited.has(parent)) { visited.add(parent); count++; parent = nodes[parent]?.data.parent; } return count; };
      candidates.sort(([a], [b]) => depth(b) - depth(a));
      const [id, node] = candidates[0] ?? ['ROOT', nodes.ROOT];
      const target = node?.dom?.getBoundingClientRect();
      const local = target && node?.dom?.ownerDocument === document ? { left: (target.left - bounds.left) / scale, top: (target.top - bounds.top) / scale, width: target.width / scale, height: target.height / scale } : target;
      notes.commentsProps.onPlacePin(x, y, id, { anchorLabel: node?.data.displayName || 'Component', ...(local ? { anchorOffset: { x: Math.max(0, Math.min(1, (x - local.left) / (local.width || 1))), y: Math.max(0, Math.min(1, (y - local.top) / (local.height || 1))) } } : {}) });
    }} onClick={event => event.stopPropagation()} />}
    <CommentLayer {...notes.commentsProps} artboardRect={rect} zoom={scale} portalContainer={portal} resolveAnchor={thread => {
      const dom = thread.anchorNodeId ? query.getState().nodes[thread.anchorNodeId]?.dom : null;
      if (!dom || !rect) return null;
      const target = dom.getBoundingClientRect();
      return dom.ownerDocument === document ? target : { left: rect.left + target.left * scale, top: rect.top + target.top * scale, width: target.width * scale, height: target.height * scale };
    }} />
  </>;
}
