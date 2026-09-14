import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export default function WorkspacePageHeading({
  title,
  detail,
  actions,
  className,
}: {
  title: string;
  detail?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("workspace-page-heading", className)}>
      <div>
        <h2>{title}</h2>
        {detail && <p>{detail}</p>}
      </div>
      {actions && <div className="workspace-page-actions">{actions}</div>}
    </header>
  );
}
