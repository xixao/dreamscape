"use client";

import { Bell, MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import type { Comment, Revision } from "@/lib/model";

export default function FeedbackNotifications({
  comments,
  revision,
  onClose,
  onOpen,
}: {
  comments: Comment[];
  revision: Revision;
  onClose: () => void;
  onOpen: (c: Comment) => void;
}) {
  const items = comments
    .filter((c) => c.revisionId === revision.id)
    .slice()
    .reverse();
  return (
    <aside className="feedback-notifications" aria-label="On-screen feedback">
      <header>
        <Bell size={16} />
        <strong>Feedback</strong>
        <span className="badge">v{revision.number}</span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Hide on-screen feedback"
          title="Hide on-screen feedback"
          onClick={onClose}
        >
          <X size={16} />
        </Button>
      </header>
      <div
        className="feedback-notification-list"
        aria-live="polite"
        aria-relevant="additions"
      >
        {!items.length && (
          <Empty className="notification-empty">
            <MessageSquare size={22} />
            <strong>No comments on this version</strong>
          </Empty>
        )}
        {items.map((c) => (
          <button
            className="feedback-notification"
            key={c.id}
            onClick={() => onOpen(c)}
          >
            <span className="notification-author">
              <span className="avatar">{c.author.charAt(0).toUpperCase()}</span>
              <strong>{c.author}</strong>
            </span>
            <span className="notification-body">{c.text}</span>
            <span className="notification-context">
              {c.parentId ? "Reply" : "Comment"} · {c.state} · {c.viewport}
              {c.resolved ? " · Resolved" : ""}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
