/**
 * Parses a comma-separated text prop (e.g. "Option 1, Option 2") into a
 * trimmed list with empty entries dropped, capped at 12 items. Shared by
 * every block that stores a list as one comma-separated text field:
 * RadioGroup's options, Tabs' tabs, Table's columns, Select's options.
 */
export function parseList(text: string): string[] {
  return text
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 12);
}

/**
 * Parses a percentage text prop ("42") into a number clamped to 0..100;
 * anything that is not a finite number becomes 0. Shared by Progress and
 * Slider.
 */
export function clampPercent(raw: string): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, parsed));
}
