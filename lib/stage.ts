// The width/height range itself lives in lib/stage/size.ts (clampSize,
// MIN/MAX_STAGE_WIDTH, MIN/MAX_STAGE_HEIGHT, readoutFor) - re-exported here
// so every pre-existing import of `clampWidth`/`MIN_STAGE_WIDTH`/
// `MAX_STAGE_WIDTH` from '@/lib/stage' keeps working unchanged. One source
// of truth: never redefine these constants in this file.
export { MIN_STAGE_WIDTH, MAX_STAGE_WIDTH, clampWidth } from './stage/size';

export const STAGE_PRESETS = { mobile: 375, tablet: 768, desktop: 1440 } as const;

export type StagePreset = keyof typeof STAGE_PRESETS;

export const STAGE_PRESET_ORDER: readonly StagePreset[] = ['mobile', 'tablet', 'desktop'];

export const ARTBOARD_MIN_HEIGHT = 640;

export function presetForWidth(width: number): StagePreset | null {
  for (const preset of STAGE_PRESET_ORDER) {
    if (STAGE_PRESETS[preset] === width) return preset;
  }
  return null;
}
