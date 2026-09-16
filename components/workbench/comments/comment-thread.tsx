'use client';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { canResolve, type CommentThread, type NoteDetails } from '@/lib/comments/store';
import { relativeTime } from '@/lib/time';
import { PANEL, SECONDARY_BUTTON } from '../chrome';
import { NoteForm, notePopoverStyle } from './comment-composer';
import { NOTE_META } from './note-meta';
export function CommentThreadPopover({ thread, number, anchor, authorName, onClose, onResolve, onReply, onEdit, onDelete, onReopen, portalContainer }: {
  thread: CommentThread; number: number; anchor: { x: number; y: number }; authorName: string | null;
  onClose: () => void; onResolve: () => void; onReply: (input: { author: string; text: string }) => void;
  onEdit?: (patch: NoteDetails & { text: string }) => void; onDelete?: () => void; onReopen?: () => void; portalContainer?: HTMLElement | null;
}) {
  const [replyText, setReply] = useState('');
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const kind = thread.kind ?? 'comment'; const meta = NOTE_META[kind]; const Icon = meta.icon;
  function reply() { if (replyText.trim() && (authorName ?? name).trim()) { onReply({ author: (authorName ?? name).trim(), text: replyText.trim() }); setReply(''); } }
  if (typeof document === 'undefined') return null;
  return createPortal(<div role="dialog" aria-label={`${meta.label} ${number}`} data-testid="comment-thread" className={`${PANEL} pointer-events-auto fixed z-[100] flex flex-col gap-3 overflow-y-auto p-3`} style={notePopoverStyle(anchor)} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); onClose(); } }}>
    <div className="flex items-center gap-2"><Icon className={`size-4 ${meta.text}`} /><span className="flex-1 text-xs font-semibold">{meta.label} #{number}</span><Button variant="ghost" size="icon-xs" aria-label="Close" onClick={onClose}><X className="size-4" /></Button></div>
    {thread.anchorLabel && <p className="text-[10px] text-muted-foreground">Attached to {thread.anchorLabel}</p>}
    {kind === 'accessibility' && <span className="self-start rounded bg-muted px-2 py-1 text-xs capitalize">{thread.accessibilityKind ?? 'requirement'}</span>}
    {editing ? <NoteForm kind={kind} authorName={thread.author} initial={thread} onCancel={() => setEditing(false)} onSubmit={input => { onEdit?.({ title: input.title, text: input.text, accessibilityKind: input.accessibilityKind }); setEditing(false); }} /> : <>
      {thread.title && <h3 className="break-words text-sm font-semibold">{thread.title}</h3>}
      {[thread, ...thread.replies].map(message => <article key={message.id} className="min-w-0"><div className="flex gap-2 text-xs"><strong>{message.author}</strong><span className="text-muted-foreground" title={message.createdAt}>{relativeTime(message.createdAt)}</span></div><p className="mt-1 whitespace-pre-wrap break-words text-sm">{message.text}</p></article>)}
      <div className="flex flex-wrap gap-1 border-t border-line-soft pt-2">
        {onEdit && <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Edit note</Button>}
        {canResolve(thread) && <Button variant="ghost" size="sm" onClick={thread.resolvedAt ? onReopen : onResolve}>{thread.resolvedAt ? 'Reopen' : 'Resolve'}</Button>}
        {onDelete && <Button variant="ghost" size="sm" onClick={() => setDeleting(true)}>Delete note</Button>}
      </div>
      {deleting && <div className="rounded border p-2 text-xs"><p>Delete this note and its replies?</p><div className="mt-2 flex gap-2"><Button size="sm" variant="destructive" onClick={onDelete}>Delete permanently</Button><Button size="sm" variant="ghost" onClick={() => setDeleting(false)}>Keep note</Button></div></div>}
      {!authorName && <Input aria-label="Your name" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} />}
      <Textarea aria-label="Reply" placeholder="Reply" rows={2} value={replyText} maxLength={10000} onChange={e => setReply(e.target.value)} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); reply(); } }} className="bg-(--chip) text-sm" />
      <button type="button" disabled={!replyText.trim() || !(authorName ?? name).trim()} className={`${SECONDARY_BUTTON} self-end disabled:opacity-40`} onClick={reply}>Reply</button>
    </>}
  </div>, portalContainer ?? document.body);
}
