'use client';

export function WidthControl({ value, onChange, label = 'Component width' }: {
  value: number; onChange: (width: number) => void; label?: string;
}) {
  return <label className="flex items-center gap-1 text-xs">Width<input aria-label={label} type="number" min={240} max={3840} value={value} onChange={event => { if (event.target.value) onChange(Number(event.target.value)); }} className="w-16 rounded border bg-background px-1 py-0.5 font-mono" />px</label>;
}
