"use client";
import { useState } from "react";
import { Check, MessageSquare, Send } from "lucide-react";
import CommentReactions from "./comment-reactions";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Comment, Revision, UploadState } from "@/lib/model";

export default function Feedback({
  comments,
  revision,
  state,
  viewport,
  anchor,
  onAction,
  onJump,
  busy,
  readOnly = false,
}: {
  comments: Comment[];
  revision: Revision;
  state: UploadState;
  viewport: string;
  anchor: string;
  busy: boolean;
  readOnly?: boolean;
  onAction: (data: Record<string, unknown>) => Promise<boolean>;
  onJump?: (comment: Comment) => void;
}) {
  const [text, setText] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const current = comments.filter((c) => c.revisionId === revision.id),
    roots = current.filter((c) => !c.parentId);
  async function send(parent?: Comment) {
    const ok = await onAction({
      action: "comment",
      text: parent ? replyText : text,
      parentId: parent?.id ?? null,
      revisionId: revision.id,
      state: parent?.state ?? state,
      viewport: parent?.viewport ?? viewport,
      anchor: parent?.anchor ?? anchor,
    });
    if (ok) {
      if (parent) {
        setReply(null);
        setReplyText("");
      } else setText("");
    }
  }
  return (
    <div className="feedback-content">
      <div className="section-heading">
        <h3>Feedback</h3>
        <span className="badge">
          {roots.filter((c) => !c.resolved).length} open
        </span>
      </div>
      <form
        className="comment-compose"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label htmlFor="new-comment">
          {anchor === "upload-error" ? "Error message" : "Upload component"}{" "}
          <span className="muted">
            · {state} · v{revision.number}
          </span>
        </label>
        <Textarea
          id="new-comment"
          value={text}
          maxLength={1500}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add feedback..."
          required
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={!text.trim() || busy}>
            <Send size={13} />
            Post
          </Button>
        </div>
      </form>
      {roots.length === 0 && (
        <Empty className="empty-state">
          <MessageSquare size={23} />
          <strong>No feedback on v{revision.number}</strong>
          <p>
            {state === "failed"
              ? "Is the error clear? Can someone recover?"
              : "Review the component or play the scenario."}
          </p>
        </Empty>
      )}
      {roots.map((c) => (
        <article
          className={`comment ${c.resolved ? "resolved" : ""}`}
          key={c.id}
        >
          <div className="comment-author">
            <span className="avatar">{c.author.charAt(0).toUpperCase()}</span>
            <strong>{c.author}</strong>
            {c.resolved && (
              <span className="badge green">
                <Check size={10} />
                Resolved
              </span>
            )}
          </div>
          <button className="comment-context" onClick={() => onJump?.(c)}>
            {c.anchor === "upload-error" ? "Error message" : "Uploader"} ·{" "}
            {c.state} · {c.viewport}
          </button>
          <p>{c.text}</p>
          <div className="comment-actions">
            <CommentReactions comment={c} busy={busy} onAction={onAction} />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setReply(reply === c.id ? null : c.id);
                setReplyText("");
              }}
            >
              Reply
            </Button>
            {!readOnly && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void onAction({
                    action: "resolve",
                    id: c.id,
                    resolved: !c.resolved,
                  })
                }
              >
                {c.resolved ? "Reopen" : "Resolve"}
              </Button>
            )}
          </div>
          {!readOnly && (
            <Select
              value={c.assignee}
              onValueChange={(assignee) =>
                void onAction({ action: "assign", id: c.id, assignee })
              }
              disabled={busy}
            >
              <SelectTrigger aria-label="Assign comment" className="assignment">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["Unassigned", "Designer", "Product owner", "Engineer"].map(
                  (a) => (
                    <SelectItem value={a} key={a}>
                      {a}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          )}
          {current
            .filter((r) => r.parentId === c.id)
            .map((r) => (
              <div className="reply" key={r.id}>
                <strong>{r.author}</strong>
                <p>{r.text}</p>
                <CommentReactions comment={r} busy={busy} onAction={onAction} />
              </div>
            ))}
          {reply === c.id && (
            <form
              className="reply-compose"
              onSubmit={(e) => {
                e.preventDefault();
                void send(c);
              }}
            >
              <Textarea
                aria-label="Reply"
                value={replyText}
                maxLength={1500}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write a reply..."
                autoFocus
                required
              />
              <Button
                disabled={busy || !replyText.trim()}
                size="sm"
                type="submit"
              >
                <Send size={13} />
                Reply
              </Button>
            </form>
          )}
        </article>
      ))}
    </div>
  );
}
