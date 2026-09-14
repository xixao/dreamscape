type Variant = "state" | "journey" | "version" | "anchor" | "progress";

export default function NumberMarker({
  value,
  variant,
  selected = false,
  decorative = false,
}: {
  value: number | string;
  variant: Variant;
  selected?: boolean;
  decorative?: boolean;
}) {
  return (
    <span
      className={`number-marker number-marker--${variant}`}
      data-selected={selected || undefined}
      aria-hidden={decorative || undefined}
    >
      {value}
    </span>
  );
}
