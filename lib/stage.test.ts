import { describe, expect, it } from 'vitest';
import { MAX_STAGE_WIDTH, MIN_STAGE_WIDTH, STAGE_PRESETS, clampWidth, presetForWidth } from './stage';

describe('presets', () => {
  it('are the PRD widths', () => {
    expect(STAGE_PRESETS).toEqual({ mobile: 375, tablet: 768, desktop: 1440 });
  });
});

describe('clampWidth', () => {
  it('keeps widths inside 120 to 3840 and rounds', () => {
    expect(MIN_STAGE_WIDTH).toBe(120);
    expect(MAX_STAGE_WIDTH).toBe(3840);
    expect(clampWidth(100)).toBe(120);
    expect(clampWidth(5000)).toBe(3840);
    expect(clampWidth(700.4)).toBe(700);
    expect(clampWidth(700.6)).toBe(701);
    expect(clampWidth(Number.NaN)).toBe(120);
  });
});

describe('presetForWidth', () => {
  it('matches exact preset widths only', () => {
    expect(presetForWidth(375)).toBe('mobile');
    expect(presetForWidth(768)).toBe('tablet');
    expect(presetForWidth(1440)).toBe('desktop');
    expect(presetForWidth(1439)).toBeNull();
    expect(presetForWidth(900)).toBeNull();
  });
});
