"use client";
import { Button } from "@/components/ui/button";

export default function StateSelector<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
  appearance = "compact",
  numbered = false,
  heading,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
  appearance?: "strip" | "compact";
  numbered?: boolean;
  heading?: string;
}) {
  return (
    <div className={className} role="group" aria-label={label}>
      {heading && <span>{heading}</span>}
      {options.map((option, index) =>
        appearance === "strip" ? (
          <button
            type="button"
            key={option.value}
            className={value === option.value ? "selected" : ""}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {numbered && <span>{index + 1}</span>}
            {option.label}
          </button>
        ) : (
          <Button
            type="button"
            key={option.value}
            variant={value === option.value ? "secondary" : "ghost"}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {numbered ? `${index + 1} ` : ""}
            {option.label}
          </Button>
        ),
      )}
    </div>
  );
}
