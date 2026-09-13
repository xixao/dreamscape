'use client';

import { useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { CommentThread as CommentThreadRecord } from '@/lib/comments/store';
import { relativeTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import { SECONDARY_BUTTON } from '../chrome';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function CommentRow({ author, text, createdAt }: { author: string; text: string; createdAt: string }) {
  return (
    <div className="flex items-start gap-2">
      <div
        aria-hidden
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[image:var(--grad)] text-[11px] font-semibold text-white"
      >
        {initials(author)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[13px] font-medium">{author}</span>
          <span className="font-mono text-[10.5px] text-muted-foreground" title={createdAt}>
            {relativeTime(createdAt)}
          </span>
        </div>
        <p className="text-[13px] text-t2">{text}</p>
      </div>
    </div>
  );
}

/**
 * The popover for an existing thread: the first comment, its replies, a
 * Resolve action (removes the thread outright - there is no separate
 * "resolved" state to keep, per spec section 5) and a reply composer.
 * Opening it never requires comment mode - it is reached by clicking any
 * pin, in any tool.
 */
export function CommentThreadPopover({
  thread,
  number,
  anchor,
  authorName,
  onClose,
  onResolve,
  onReply,
}: {
  thread: CommentThreadRecord;
  number: number;
  anchor: { x: number; y: number };
  authorName: string | null;
  onClose: () => void;
  onResolve: () => void;
  onReply: (input: { author: string; text: string }) => void;
}) {
  const [replyText, setReplyText] = useState('');

  function submitReply(): void {
    const trimmed = replyText.trim();
    if (!trimmed) return;
    onReply({ author: authorName ?? 'Anonymous', text: trimmed });
    setReplyText('');
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }

  function handleReplyKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      submitReply();
    }
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-label={`Comment ${number}`}
      data-testid="comment-thread"
      className="fixed z-50 flex w-80 flex-col gap-3 rounded-md border bg-card p-3 shadow-panel-lg"
      style={{ left: anchor.x, top: anchor.y }}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[13px] font-semibold">#{number}</span>
        <div className="flex-1" />
        <Button type="button" variant="ghost" size="sm" onClick={onResolve}>
          Resolve
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
          <X className="size-4" aria-hidden />
        </Button>
      </div>
      <div className="flex flex-col gap-3">
        <CommentRow author={thread.author} text={thread.text} createdAt={thread.createdAt} />
        {thread.replies.map((reply) => (
          <CommentRow key={reply.id} author={reply.author} text={reply.text} createdAt={reply.createdAt} />
        ))}
      </div>
      <div className="flex flex-col gap-2 border-t border-line-soft pt-2.5">
        <Textarea
          aria-label="Reply"
          placeholder="Reply"
          rows={2}
          value={replyText}
          onChange={(event) => setReplyText(event.target.value)}
          onKeyDown={handleReplyKeyDown}
          className="rounded-md border border-(color:--bevel-line) bg-(--chip) text-[13px] shadow-[var(--bevel-hi),var(--bevel-drop)] focus-visible:border-acc focus-visible:ring-0"
        />
        <Button type="button" variant="ghost" className={cn(SECONDARY_BUTTON, 'self-end')} onClick={submitReply}>
          Reply
        </Button>
      </div>
    </div>,
    document.body,
  );
}
