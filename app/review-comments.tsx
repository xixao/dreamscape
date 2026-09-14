"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Check, MessageSquare, Send } from "lucide-react";
import CommentReactions from "./comment-reactions";
import CommentAvatar from "@/components/comment-avatar";
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
import { isDecisionRecord } from "@/lib/review";

export default function ReviewComments({
  comments,
  revision,
  state,
  viewport,
  anchor,
  onAction,
  onJump,
  busy,
  canModerate = true,
  focusComposerRequest = 0,
  onComposerFocusHandled,
}: {
  comments: Comment[];
  revision: Revision;
  state: UploadState;
  viewport: string;
  anchor: string;
  busy: boolean;
  canModerate?: boolean;
  focusComposerRequest?: number;
  onComposerFocusHandled?: () => void;
  onAction: (data: Record<string, unknown>) => Promise<boolean>;
  onJump?: (comment: Comment) => void;
}) {
  const [text, setText] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const composerId = useId();
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const sending = useRef(false);
  useEffect(() => {
    if (focusComposerRequest > 0) {
      composerRef.current?.focus();
      onComposerFocusHandled?.();
    }
  }, [focusComposerRequest, onComposerFocusHandled]);
  const current = comments.filter((c) => c.revisionId === revision.id && !isDecisionRecord(c)),
    roots = current.filter((c) => !c.parentId);
  async function send(parent?: Comment) {
    if (sending.current || busy) return;
    sending.current = true;
    try {
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
    } finally {
      sending.current = false;
    }
  }
  return (
    <div className="feedback-content">
      <div className="comments-summary">
        <strong>{roots.filter((c) => !c.resolved).length} open comments</strong>
        <span>Version {revision.number}</span>
      </div>
      <form
        className="comment-compose"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label htmlFor={composerId}>
          {anchor === "upload-error" ? "Error message" : "Upload component"}{" "}
          <span className="muted">
            · {state} · v{revision.number}
          </span>
        </label>
        <Textarea
          ref={composerRef}
          id={composerId}
          disabled={busy}
          value={text}
          maxLength={1500}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a comment..."
          required
        />
        <div className="comment-compose-actions">
          <Button type="submit" size="sm" disabled={!text.trim() || busy}>
            <Send size={13} />
            Post
          </Button>
        </div>
      </form>
      {roots.length === 0 && (
        <Empty className="empty-state">
          <strong className="icon-title">
            <MessageSquare size={23} aria-hidden="true" />
            <span>No comments on v{revision.number}</span>
          </strong>
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
          <div className="comment-entry">
            <CommentAvatar name={c.author} variant="comment" />
            <div className="comment-entry-main">
              <div className="comment-author">
                <strong>{c.author}</strong>
                {c.resolved && (
                  <span className="badge green">
                    <Check size={10} />
                    Resolved
                  </span>
                )}
                {canModerate && (
                  <Select
                    value={c.assignee}
                    onValueChange={(assignee) =>
                      void onAction({ action: "assign", id: c.id, assignee })
                    }
                    disabled={busy}
                  >
                    <SelectTrigger aria-label={`Assign comment by ${c.author}`} size="sm" className="assignment">
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
              </div>
              <p className="comment-entry-text">{c.text}</p>
              <Button variant="bare" size="auto" className="comment-context" onClick={() => onJump?.(c)}>
                {c.anchor === "upload-error" ? "Error message" : "Uploader"} ·{" "}
                {c.state} · {c.viewport}
              </Button>
              <div className="comment-actions comment-feedback">
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
                {canModerate && (
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
            </div>
          </div>
          {current
            .filter((r) => r.parentId === c.id)
            .map((r) => (
              <div className="reply" key={r.id}>
                <div className="comment-entry">
                  <CommentAvatar name={r.author} variant="comment" />
                  <div className="comment-entry-main">
                    <strong>{r.author}</strong>
                    <p className="comment-entry-text">{r.text}</p>
                    <div className="comment-feedback"><CommentReactions comment={r} busy={busy} onAction={onAction} /></div>
                  </div>
                </div>
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
                disabled={busy}
                aria-label="Reply"
                value={replyText}
                maxLength={1500}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write a reply..."
                autoFocus
                required
              />
              <div className="reply-compose-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setReply(null);
                    setReplyText("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  disabled={busy || !replyText.trim()}
                  size="sm"
                  type="submit"
                >
                  <Send size={13} />
                  Post reply
                </Button>
              </div>
            </form>
          )}
        </article>
      ))}
    </div>
  );
}
