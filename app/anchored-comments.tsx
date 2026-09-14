"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import type { Comment } from "@/lib/model";
import CommentReactions from "./comment-reactions";
import CommentAvatar from "@/components/comment-avatar";
import { Button } from "@/components/ui/button";
export default function AnchoredComments({
  comments,
  busy,
  onAction,
  onOpen,
}: {
  comments: Comment[];
  busy: boolean;
  onAction: (data: Record<string, unknown>) => Promise<boolean>;
  onOpen: (c: Comment) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<
    Record<string, { top: number; anchor: number }>
  >({});
  useLayoutEffect(() => {
    const root = ref.current,
      device = root?.parentElement;
    if (!root || !device) return;
    const measure = () => {
      const deviceRect = device.getBoundingClientRect();
      const scale = deviceRect.width / device.offsetWidth || 1;
      let bottom = 0;
      const next: Record<string, { top: number; anchor: number }> = {};
      for (const c of comments) {
        const target = device.querySelector<HTMLElement>(
          `[data-component-id="${c.anchor}"]`,
        );
        const card = root.querySelector<HTMLElement>(
          `[data-comment-id="${c.id}"]`,
        );
        if (!target || !target.getClientRects().length || !card) continue;
        const anchor =
          (target.getBoundingClientRect().top - deviceRect.top) / scale + 16;
        const top = Math.max(anchor, bottom);
        next[c.id] = { top, anchor };
        bottom = top + card.offsetHeight + 12;
      }
      setPositions((old) =>
        JSON.stringify(old) === JSON.stringify(next) ? old : next,
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(device);
    root.querySelectorAll("article").forEach((el) => observer.observe(el));
    measure();
    return () => observer.disconnect();
  }, [comments]);
  return (
    <div ref={ref} className="anchored-comments" aria-label="Placed comments">
      {comments.map((c) => {
        const p = positions[c.id];
        return (
          <article
            key={c.id}
            data-comment-id={c.id}
            data-canvas-interactive
            className="placed-comment"
            style={{ top: p?.top ?? 0, visibility: p ? "visible" : "hidden" }}
          >
            <svg
              className="comment-connector"
              width="22"
              height={Math.max(24, (p?.top ?? 0) - (p?.anchor ?? 0) + 24)}
              style={{ top: (p?.anchor ?? 0) - (p?.top ?? 0) }}
              aria-hidden="true"
            >
              <path
                d={`M 0 0 L 10 0 L 10 ${(p?.top ?? 0) - (p?.anchor ?? 0) + 20} L 22 ${(p?.top ?? 0) - (p?.anchor ?? 0) + 20}`}
                fill="none"
                stroke="currentColor"
              />
              <circle cx="2" cy="2" r="2" fill="currentColor" />
            </svg>
            <div className="comment-entry">
              <CommentAvatar name={c.author} variant="comment" />
              <div className="comment-entry-main">
                <header><strong>{c.author}</strong></header>
                <p className="comment-entry-text">{c.text}</p>
                <footer className="comment-feedback">
                  <CommentReactions comment={c} busy={busy} onAction={onAction} />
                  <Button
                    variant="bare"
                    size="auto"
                    title="Open comment thread"
                    aria-label={`Reply to ${c.author}`}
                    onClick={() => onOpen(c)}
                  >
                    <MessageSquare size={15} />
                  </Button>
                </footer>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
