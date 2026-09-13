export const STAGE_PRESETS = { mobile: 375, tablet: 768, desktop: 1440 } as const;

export type StagePreset = keyof typeof STAGE_PRESETS;

export const STAGE_PRESET_ORDER: readonly StagePreset[] = ['mobile', 'tablet', 'desktop'];

export const MIN_STAGE_WIDTH = 120;
export const MAX_STAGE_WIDTH = 1920;
export const STAGE_PADDING = 24;
export const ARTBOARD_MIN_HEIGHT = 640;

export function clampWidth(width: number): number {
  if (!Number.isFinite(width)) return MIN_STAGE_WIDTH;
  return Math.min(MAX_STAGE_WIDTH, Math.max(MIN_STAGE_WIDTH, Math.round(width)));
}

export function presetForWidth(width: number): StagePreset | null {
  for (const preset of STAGE_PRESET_ORDER) {
    if (STAGE_PRESETS[preset] === width) return preset;
  }
  return null;
}

export function computeZoom(available: number, width: number): number {
  if (available <= 0 || width <= 0) return 1;
  if (available >= width) return 1;
  return Math.max(0.1, available / width);
}
