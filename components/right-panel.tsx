import type { HTMLAttributes, ReactNode } from "react";

type Variant = "review" | "properties" | "design" | "discussion";

export default function RightPanel({
  variant,
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  variant: Variant;
  children: ReactNode;
}) {
  return (
    <aside
      className={`right-panel right-panel--${variant} ${className}`.trim()}
      {...props}
    >
      {children}
    </aside>
  );
}
