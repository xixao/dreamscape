"use client";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Comment } from "@/lib/model";

export default function CommentReactions({
  comment,
  busy,
  onAction,
}: {
  comment: Comment;
  busy: boolean;
  onAction: (data: Record<string, unknown>) => Promise<boolean>;
}) {
  return (
    <div className="comment-reactions" aria-label="Comment reactions">
      {(["like", "dislike", "fuego"] as const).map((kind) => {
        const active = comment.reaction === kind;
        const label =
          kind === "fuego" ? "Fuego" : kind === "like" ? "Like" : "Dislike";
        return (
          <Button
            key={kind}
            variant="ghost"
            size="sm"
            disabled={busy}
            title={label}
            aria-label={`${active ? "Remove " : ""}${label} reaction`}
            aria-pressed={active}
            onClick={async () => {
              const ok = await onAction({
                action: "reaction",
                id: comment.id,
                kind,
                liked: !active,
              });
              if (ok && kind === "fuego" && !active)
                toast("Magic", {
                  icon: <span className="magic-fire">🔥</span>,
                  duration: 2400,
                });
            }}
          >
            {kind === "like" ? (
              <ThumbsUp size={14} />
            ) : kind === "dislike" ? (
              <ThumbsDown size={14} />
            ) : (
              <span aria-hidden="true">🔥</span>
            )}
            {kind === "like"
              ? comment.likes
              : kind === "dislike"
                ? comment.dislikes
                : comment.fuegos}
          </Button>
        );
      })}
    </div>
  );
}
