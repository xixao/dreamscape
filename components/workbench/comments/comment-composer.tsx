'use client';

import { useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CHIP, CHIP_INPUT } from '../chrome';
import { cn } from '@/lib/utils';

// SF2 §5 secondary .btn look, reused verbatim from components/files/files-actions.tsx's
// own SECONDARY_BUTTON: h-auto overrides the shadcn Button's fixed h-8 so the
// literal padding here drives the box height.
const SECONDARY_BUTTON =
  'h-auto bg-muted border border-border rounded-[9px] px-3 py-1.5 text-[13px] font-medium text-foreground hover:bg-accent';

const PLACEHOLDER_NOTE = 'Comments are saved in this browser only for now.';

/**
 * The popover for a not-yet-submitted pin (spec
 * docs/superpowers/specs/2026-09-12-folders-and-comments-design.md section 5).
 * Asks for the commenter's name on the very first use only (`authorName` is
 * null until one has ever been saved); Escape and Cancel both discard the
 * pending pin, Cmd+Enter and the "Comment" button both submit it.
 */
export function CommentComposer({
  anchor,
  authorName,
  onCancel,
  onSubmit,
}: {
  anchor: { x: number; y: number };
  authorName: string | null;
  onCancel: () => void;
  onSubmit: (input: { author: string; text: string }) => void;
}) {
  const [name, setName] = useState('');
  const [text, setText] = useState('');

  function submit(): void {
    const trimmedText = text.trim();
    const trimmedAuthor = (authorName ?? name).trim();
    if (!trimmedText || !trimmedAuthor) return;
    onSubmit({ author: trimmedAuthor, text: trimmedText });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    } else if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-label="New comment"
      data-testid="comment-composer"
      className="fixed z-50 flex w-72 flex-col gap-2 rounded-md border bg-card p-3 shadow-panel-lg"
      style={{ left: anchor.x, top: anchor.y }}
      onKeyDown={handleKeyDown}
    >
      {!authorName && (
        <div className={CHIP}>
          <Input
            autoFocus
            aria-label="Your name"
            placeholder="Your name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={CHIP_INPUT}
          />
        </div>
      )}
      <Textarea
        autoFocus={!!authorName}
        aria-label="Add a comment"
        placeholder="Add a comment"
        rows={3}
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="rounded-md border border-(color:--bevel-line) bg-(--chip) text-[13px] shadow-[var(--bevel-hi),var(--bevel-drop)] focus-visible:border-acc focus-visible:ring-0"
      />
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[10.5px] text-t4">{PLACEHOLDER_NOTE}</span>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <button type="button" className={cn(SECONDARY_BUTTON)} onClick={submit}>
          Comment
        </button>
      </div>
    </div>,
    document.body,
  );
}
