import { describe, expect, it } from 'vitest';
import {
  MAX_STAGE_WIDTH,
  MIN_STAGE_WIDTH,
  STAGE_PRESETS,
  clampWidth,
  computeZoom,
  presetForWidth,
} from './stage';

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

describe('computeZoom', () => {
  it('is 1 when the artboard fits', () => {
    expect(computeZoom(1000, 375)).toBe(1);
    expect(computeZoom(1440, 1440)).toBe(1);
  });

  it('scales down to fit, never below 0.1', () => {
    expect(computeZoom(720, 1440)).toBe(0.5);
    expect(computeZoom(10, 1920)).toBe(0.1);
  });

  it('is 1 when measurements are not usable yet', () => {
    expect(computeZoom(0, 1440)).toBe(1);
    expect(computeZoom(500, 0)).toBe(1);
  });
});
