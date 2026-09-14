"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquare, X } from "lucide-react";
import type { Comment } from "@/lib/model";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import NumberMarker from "@/components/number-marker";
import CommentAvatar from "@/components/comment-avatar";
import CommentReactions from "@/app/comment-reactions";

export default function CommentPin({
  number,
  label,
  className = "",
  comments,
  onAddComment,
  onOpenComment,
  onAction,
  busy = false,
}: {
  number: number;
  label: string;
  className?: string;
  comments: Comment[];
  onAddComment: () => void;
  onOpenComment?: (comment: Comment) => void;
  onAction?: (data: Record<string, unknown>) => Promise<boolean>;
  busy?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasComments = comments.length > 0;

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  function show() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (hasComments) setHovered(true);
  }

  function hideSoon() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setHovered(false), 150);
  }

  return (
    <Popover
      open={hasComments && (hovered || pinned)}
      onOpenChange={(open) => {
        if (!open) {
          setHovered(false);
          setPinned(false);
        }
      }}
    >
      <PopoverAnchor asChild>
        <Button
          ref={triggerRef}
          variant="bare"
          size="auto"
          className={`anchor-pin ${className}`.trim()}
          aria-label={hasComments ? `${label}: ${comments.length} ${comments.length === 1 ? "comment" : "comments"}` : `Add comment on ${label.toLowerCase()}`}
          aria-expanded={hasComments ? hovered || pinned : undefined}
          onPointerEnter={show}
          onPointerLeave={hideSoon}
          onFocus={show}
          onBlur={hideSoon}
          onClick={() => {
            if (hasComments) setPinned((current) => !current);
            else onAddComment();
          }}
        >
          <NumberMarker value={number} variant="anchor" decorative />
        </Button>
      </PopoverAnchor>
      {hasComments && (
        <PopoverContent
          side="right"
          align="start"
          sideOffset={8}
          className="anchor-comment-popover"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if (triggerRef.current?.contains(event.target as Node)) event.preventDefault();
          }}
          onPointerEnter={show}
          onPointerLeave={hideSoon}
          onFocusCapture={show}
          onBlurCapture={hideSoon}
        >
          <div className="anchor-comment-heading">
            <strong>{comments.length} {comments.length === 1 ? "comment" : "comments"} on {label.toLowerCase()}</strong>
            <Button variant="ghost" size="icon" aria-label="Close comment preview" title="Close comment preview" onClick={() => { setPinned(false); setHovered(false); }}>
              <X size={16} />
            </Button>
          </div>
          <div className="anchor-comment-list">
            {comments.map((comment) => (
              <div className="anchor-comment-item" key={comment.id}>
                <div className="comment-entry">
                  <CommentAvatar name={comment.author} variant="comment" />
                  <div className="comment-entry-main">
                    <div className="anchor-comment-identity">
                      <strong>{comment.author}</strong>
                      {comment.resolved && <span>Resolved</span>}
                    </div>
                    <p className="comment-entry-text">{comment.text}</p>
                    <div className="comment-feedback">
                      {onAction && <CommentReactions comment={comment} busy={busy} onAction={onAction} />}
                      {onOpenComment && (
                        <Button variant="ghost" size="sm" onClick={() => { setPinned(false); setHovered(false); onOpenComment(comment); }}>
                          <MessageSquare size={14} /> Open thread
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="anchor-comment-add" onClick={() => { setPinned(false); setHovered(false); onAddComment(); }}>
            Add comment
          </Button>
        </PopoverContent>
      )}
    </Popover>
  );
}
