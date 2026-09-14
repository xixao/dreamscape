import type { ReactNode } from "react";

export default function LabeledField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`form-field ${className}`.trim()}>
      <span className="form-field-label">{label}</span>
      {children}
    </label>
  );
}
