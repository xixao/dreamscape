import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function WorkspaceHeader({
  title,
  context,
  back,
  actions,
  className,
}: {
  title: string;
  context: string;
  back?: { label: string; onClick: () => void };
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("workspace-shell-header", className)}>
      <div className="workspace-shell-context">
        {back && (
          <Button variant="ghost" size="sm" aria-label={back.label} title={back.label} onClick={back.onClick}>
            <ArrowLeft size={16} aria-hidden="true" />
            <span className="workspace-back-label">{back.label}</span>
          </Button>
        )}
        <div className="workspace-shell-identity">
          <h1>{title}</h1>
          <span>{context}</span>
        </div>
      </div>
      {actions && <div className="workspace-shell-actions">{actions}</div>}
    </header>
  );
}
