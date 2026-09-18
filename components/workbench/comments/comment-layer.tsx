'use client';
import { useEffect, useRef, useState } from 'react';
import { capturePointer } from '@/lib/dom';
import { createPortal } from 'react-dom';
import type { CommentThread, NoteAnchor, NoteDetails, NoteKind } from '@/lib/comments/store';
import { toArtboardPoint, toScreenPoint, type Rect } from '@/lib/comments/geometry';
import { CommentComposer, type NoteInput } from './comment-composer';
import { CommentThreadPopover } from './comment-thread';
import { NOTE_META } from './note-meta';
export interface PendingPin extends NoteAnchor { x: number; y: number; }
export interface StageCommentsProps {
  visible?: boolean;
  portalContainer?: HTMLElement | null;
  commentMode: boolean; noteKind?: NoteKind; threads: CommentThread[]; pendingPin: PendingPin | null;
  openThreadId: string | null; authorName: string | null;
  onPlacePin: (x: number, y: number, anchorNodeId: string | undefined, anchor?: NoteAnchor) => void;
  onCancelPending: () => void; onSubmitComment: (input: NoteInput) => void;
  onPinClick: (id: string) => void; onCloseThread: () => void;
  onSubmitReply: (id: string, input: { author: string; text: string }) => void;
  onResolveThread: (id: string) => void;
  onReopenThread?: (id: string) => void;
  onEditThread?: (id: string, patch: NoteDetails & { text: string }) => void;
  onMovePin?: (id: string, position: { x: number; y: number; anchorOffset?: { x: number; y: number } }) => void;
  onDeleteThread?: (id: string) => void;
}
export const DEFAULT_STAGE_COMMENTS: StageCommentsProps = {
  commentMode: false, threads: [], pendingPin: null, openThreadId: null, authorName: null,
  onPlacePin: () => {}, onCancelPending: () => {}, onSubmitComment: () => {}, onPinClick: () => {}, onCloseThread: () => {}, onSubmitReply: () => {}, onResolveThread: () => {},
};
export function CommentLayer(props: StageCommentsProps & {
  zoom: number; artboardRect: Rect | null; portalContainer?: HTMLElement | null;
  resolveAnchor?: (thread: NoteAnchor) => Rect | null;
}) {
  const { threads, pendingPin, artboardRect, zoom } = props;
  const drag = useRef<{ id: string; pointerId: number; startX: number; startY: number; x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef<string | null>(null);
  const [preview, setPreview] = useState<{id: string; x: number; y: number} | null>(null);
  useEffect(() => {
    const cancel = () => { if (drag.current?.moved) suppressClick.current = drag.current.id; drag.current = null; setPreview(null); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel(); };
    window.addEventListener('blur', cancel); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('blur', cancel); window.removeEventListener('keydown', key); };
  }, []);
  const [measuredAnchors, setAnchors] = useState<Record<string, Rect>>({});
  const hasAnchors = !!props.resolveAnchor && threads.some(thread => thread.anchorNodeId);
  const anchors = hasAnchors ? measuredAnchors : {};
  const [hovered, setHovered] = useState<string | null>(null);
  useEffect(() => {
    // An empty layer derives an empty map in render. Never schedule a state
    // update from an effect just to clear already-unused measurements.
    if (!hasAnchors) return;
    let frame = 0;
    function measure() {
      const next: Record<string, Rect> = {};
      for (const thread of threads) {
        const rect = props.resolveAnchor?.(thread);
        if (rect) next[thread.id] = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      }
      const signature = JSON.stringify(next);
      // Compare against committed geometry, including across effect restarts.
      setAnchors(previous => JSON.stringify(previous) === signature ? previous : next);
      frame = requestAnimationFrame(measure);
    }
    // Panning changes the resolver/threads frequently. Measuring synchronously
    // here creates a nested effect -> state -> commit chain during navigation.
    // Sample once per animation frame instead, and cancel stale measurements.
    frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [hasAnchors, threads, props.resolveAnchor]);
  if (props.visible === false || !artboardRect || typeof document === 'undefined') return null;
  function point(thread: PendingPin | CommentThread) {
    if ('id' in thread && preview?.id === thread.id) return preview;
    const rect = 'id' in thread ? anchors[thread.id] : undefined;
    if (rect && thread.anchorOffset) return { x: rect.left + rect.width * thread.anchorOffset.x, y: rect.top + rect.height * thread.anchorOffset.y };
    return toScreenPoint(thread.x, thread.y, artboardRect!, zoom);
  }
  const open = threads.find(t => t.id === props.openThreadId);
  const highlight = anchors[hovered ?? props.openThreadId ?? ''];
  const portalContainer = props.portalContainer ?? document.body;
  return createPortal(<>
    {highlight && <div aria-hidden className="pointer-events-none fixed z-[5] rounded-sm border-2 border-violet-400 bg-violet-400/10" style={{ left: highlight.left, top: highlight.top, width: highlight.width, height: highlight.height }} />}
    <div className="pointer-events-none fixed inset-0 z-[90]" data-note-layer>
    {threads.map((thread, index) => {
      const position = point(thread); const meta = NOTE_META[thread.kind ?? 'comment']; const Icon = meta.icon;
      return <button key={thread.id} type="button" aria-label={`${meta.label} ${thread.number ?? index + 1}`} title={`${meta.label} · ${thread.author}
${thread.title || thread.text}`} onPointerEnter={() => setHovered(thread.id)} onPointerLeave={() => setHovered(null)} onFocus={() => setHovered(thread.id)} onBlur={() => setHovered(null)} onPointerDown={e => {
        e.stopPropagation();
        if (e.button !== 0 || !props.onMovePin) return;
        e.preventDefault(); suppressClick.current = null;
        capturePointer(e.currentTarget, e.pointerId);
        drag.current = {id:thread.id,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,x:position.x,y:position.y,moved:false};
      }} onPointerMove={e => {
        const current = drag.current;
        if (!current || current.pointerId !== e.pointerId) return;
        e.stopPropagation();
        const dx=e.clientX-current.startX,dy=e.clientY-current.startY;
        if (!current.moved && Math.hypot(dx,dy)<4) return;
        if (!current.moved) props.onCloseThread();
        current.moved=true;
        setPreview({id:thread.id,x:current.x+dx,y:current.y+dy});
      }} onPointerUp={e => {
        const current=drag.current;
        if (!current || current.pointerId !== e.pointerId) return;
        e.stopPropagation(); drag.current=null;
        if (current.moved) {
          suppressClick.current=thread.id;
          const x=current.x+e.clientX-current.startX,y=current.y+e.clientY-current.startY;
          const anchor=anchors[thread.id];
          const inside=anchor && anchor.width>0 && anchor.height>0 && x>=anchor.left && x<=anchor.left+anchor.width && y>=anchor.top && y<=anchor.top+anchor.height;
          props.onMovePin?.(thread.id,{...toArtboardPoint(x,y,artboardRect,zoom),anchorOffset:inside?{x:(x-anchor.left)/anchor.width,y:(y-anchor.top)/anchor.height}:undefined});
        }
        setPreview(null);
      }} onPointerCancel={() => { if(drag.current?.moved)suppressClick.current=thread.id;drag.current=null;setPreview(null); }} onClick={e => { e.stopPropagation(); if(suppressClick.current===thread.id){suppressClick.current=null;return;} props.onPinClick(thread.id); }} className={`pointer-events-auto touch-none select-none fixed flex h-7 min-w-9 items-center justify-center gap-1 rounded-lg rounded-bl-none px-1.5 text-[10px] font-semibold text-white shadow-md ${meta.pin} ${thread.resolvedAt ? 'opacity-60' : ''}`} style={{ left: position.x, top: position.y - 28, cursor: props.onMovePin ? preview?.id === thread.id ? 'grabbing' : 'grab' : undefined }}><Icon className="size-3.5" aria-hidden /><span>{thread.number ?? index + 1}</span></button>;
    })}
    {pendingPin && <CommentComposer key={`${props.noteKind}:${pendingPin.x}:${pendingPin.y}`} kind={props.noteKind} anchor={{ x: point(pendingPin).x + 10, y: point(pendingPin).y + 10 }} authorName={props.authorName} onCancel={props.onCancelPending} onSubmit={props.onSubmitComment} portalContainer={portalContainer} />}
    {open && <CommentThreadPopover key={open.id} thread={open} number={open.number ?? threads.indexOf(open) + 1} anchor={{ x: point(open).x + 10, y: point(open).y + 10 }} authorName={props.authorName} onClose={props.onCloseThread} onResolve={() => props.onResolveThread(open.id)} onReply={input => props.onSubmitReply(open.id, input)} onReopen={() => props.onReopenThread?.(open.id)} onEdit={props.onEditThread ? patch => props.onEditThread?.(open.id, patch) : undefined} onDelete={props.onDeleteThread ? () => props.onDeleteThread?.(open.id) : undefined} portalContainer={portalContainer} />}
  </div></>, portalContainer);
}
