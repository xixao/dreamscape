import type { KeyboardEvent } from 'react';

export function shiftNumericStep(event: KeyboardEvent<HTMLInputElement>, value: number, onChange: (value: number) => void, min = 0, max = Infinity): boolean {
  if (!event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return false;
  event.preventDefault(); event.stopPropagation();
  const next = Math.max(min, Math.min(max, Number(((Number.isFinite(value) ? value : min) + (event.key === 'ArrowUp' ? 10 : -10)).toFixed(6))));
  if (next !== value) onChange(next);
  return true;
}
