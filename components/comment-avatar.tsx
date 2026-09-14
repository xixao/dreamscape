import { MessageSquare } from "lucide-react";

export default function CommentAvatar({ name, variant = "initials" }: { name: string; variant?: "initials" | "comment" }) {
  return (
    <span className={`avatar ${variant === "comment" ? "avatar-comment" : ""}`} aria-hidden="true">
      {variant === "comment" ? <MessageSquare size={15} /> : name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
