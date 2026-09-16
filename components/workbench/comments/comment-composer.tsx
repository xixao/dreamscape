'use client';
import { useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { AccessibilityKind, NoteDetails, NoteKind } from '@/lib/comments/store';
import { CHIP, CHIP_INPUT, PANEL, SECONDARY_BUTTON } from '../chrome';
import { NOTE_META } from './note-meta';

export type NoteInput = NoteDetails & { author: string; text: string };
export function NoteForm({ kind, authorName, initial, onCancel, onSubmit }: {
  kind: NoteKind; authorName: string | null; initial?: NoteDetails & { text: string };
  onCancel: () => void; onSubmit: (input: NoteInput) => void;
}) {
  const [name, setName] = useState('');
  const [text, setText] = useState(initial?.text ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [category, setCategory] = useState<AccessibilityKind>(initial?.accessibilityKind ?? 'requirement');
  const meta = NOTE_META[kind];
  const valid = Boolean(text.trim() && (authorName ?? name).trim() && (kind === 'comment' || title.trim()));
  function submit() { if (valid) onSubmit({ author: (authorName ?? name).trim(), text: text.trim(), ...(kind !== 'comment' ? { title: title.trim() } : {}), ...(kind === 'accessibility' ? { accessibilityKind: category } : {}) }); }
  function keyDown(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); onCancel(); }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); submit(); }
  }
  return <div className="flex flex-col gap-3" onKeyDown={keyDown}>
    {!authorName && <div className={CHIP}><Input autoFocus aria-label="Your name" placeholder="Your name" value={name} maxLength={100} onChange={e => setName(e.target.value)} className={CHIP_INPUT} /></div>}
    {kind !== 'comment' && <div className={CHIP}><Input autoFocus={!!authorName} aria-label="Note title" placeholder="Short title" maxLength={160} value={title} onChange={e => setTitle(e.target.value)} className={CHIP_INPUT} /></div>}
    {kind === 'accessibility' && <label className="flex items-center justify-between text-xs">Type<select aria-label="Accessibility note type" value={category} onChange={e => setCategory(e.target.value as AccessibilityKind)} className="rounded border bg-card px-2 py-1.5"><option value="requirement">Requirement</option><option value="question">Question</option><option value="issue">Issue</option></select></label>}
    <Textarea autoFocus={!!authorName && kind === 'comment'} aria-label={kind === 'comment' ? 'Add a comment' : 'Note details'} placeholder={kind === 'comment' ? 'Add a comment' : kind === 'annotation' ? 'Explain the design intent or implementation…' : 'Describe the expected behavior, question, or issue…'} rows={4} maxLength={10000} value={text} onChange={e => setText(e.target.value)} className="bg-(--chip) text-sm" />
    <div className="flex justify-end gap-2"><Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button><button type="button" disabled={!valid} className={`${SECONDARY_BUTTON} disabled:opacity-40`} onClick={submit}>{initial ? 'Save changes' : kind === 'comment' ? 'Comment' : `Add ${meta.label.toLowerCase()}`}</button></div>
  </div>;
}
export function notePopoverStyle(anchor: { x: number; y: number }) {
  return { left: Math.max(12, Math.min(anchor.x, window.innerWidth - 348)), top: Math.max(12, Math.min(anchor.y, window.innerHeight - 440)), maxHeight: 'calc(100vh - 24px)', width: 'min(336px, calc(100vw - 24px))' };
}
export function CommentComposer({ anchor, authorName, kind = 'comment', onCancel, onSubmit, portalContainer }: {
  anchor: { x: number; y: number }; authorName: string | null; kind?: NoteKind;
  onCancel: () => void; onSubmit: (input: NoteInput) => void; portalContainer?: HTMLElement | null;
}) {
  if (typeof document === 'undefined') return null;
  const meta = NOTE_META[kind]; const Icon = meta.icon;
  return createPortal(<div role="dialog" aria-label={`New ${meta.label.toLowerCase()}`} data-testid="comment-composer" className={`${PANEL} pointer-events-auto fixed z-[100] space-y-3 overflow-y-auto p-3`} style={notePopoverStyle(anchor)} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); onCancel(); } }} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
    <h3 className="flex items-center gap-2 text-sm font-semibold"><Icon className={`size-4 ${meta.text}`} />{meta.label}</h3>
    <NoteForm kind={kind} authorName={authorName} onCancel={onCancel} onSubmit={onSubmit} />
    <p className="text-[10px] text-muted-foreground">Saved in this browser only for now.</p>
  </div>, portalContainer ?? document.body);
}
