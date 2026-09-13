import { describe, expect, it } from 'vitest';
import {
  MAX_STAGE_HEIGHT,
  MAX_STAGE_WIDTH,
  MIN_STAGE_HEIGHT,
  MIN_STAGE_WIDTH,
  clampSize,
  readoutFor,
} from './size';

describe('constants', () => {
  it('match the spec range', () => {
    expect(MIN_STAGE_WIDTH).toBe(120);
    expect(MAX_STAGE_WIDTH).toBe(3840);
    expect(MIN_STAGE_HEIGHT).toBe(120);
    expect(MAX_STAGE_HEIGHT).toBe(8192);
  });
});

describe('clampSize', () => {
  it('clamps width into range and rounds', () => {
    expect(clampSize({ width: 100, height: null })).toEqual({ width: 120, height: null });
    expect(clampSize({ width: 5000, height: null })).toEqual({ width: 3840, height: null });
    expect(clampSize({ width: 700.4, height: null })).toEqual({ width: 700, height: null });
    expect(clampSize({ width: 700.6, height: null })).toEqual({ width: 701, height: null });
    expect(clampSize({ width: Number.NaN, height: null })).toEqual({ width: 120, height: null });
  });

  it('leaves height null (auto) untouched', () => {
    expect(clampSize({ width: 1440, height: null })).toEqual({ width: 1440, height: null });
  });

  it('clamps a numeric height into range and rounds', () => {
    expect(clampSize({ width: 1440, height: 50 })).toEqual({ width: 1440, height: 120 });
    expect(clampSize({ width: 1440, height: 9000 })).toEqual({ width: 1440, height: 8192 });
    expect(clampSize({ width: 1440, height: 700.4 })).toEqual({ width: 1440, height: 700 });
    expect(clampSize({ width: 1440, height: 700.6 })).toEqual({ width: 1440, height: 701 });
  });
});

describe('readoutFor', () => {
  it('reads width, breakpoint and zoom for a plain auto-height frame', () => {
    expect(readoutFor({ width: 1440, height: null, deviceName: null, zoom: 1 })).toBe('1440 px · desktop · 100%');
    expect(readoutFor({ width: 375, height: null, deviceName: null, zoom: 1 })).toBe('375 px · mobile · 100%');
    expect(readoutFor({ width: 1440, height: null, deviceName: null, zoom: 0.23 })).toBe(
      '1440 px · desktop · 23%',
    );
  });

  it('reads width x height with no breakpoint for a manual fixed height', () => {
    expect(readoutFor({ width: 1024, height: 768, deviceName: null, zoom: 1 })).toBe('1024 × 768 · 100%');
    expect(readoutFor({ width: 1024, height: 768, deviceName: null, zoom: 0.5 })).toBe('1024 × 768 · 50%');
  });

  it('leads with the device name and its exact dimensions for a device', () => {
    expect(readoutFor({ width: 402, height: 874, deviceName: 'iPhone 16 & 17 Pro', zoom: 1 })).toBe(
      'iPhone 16 & 17 Pro · 402 × 874 · 100%',
    );
    expect(readoutFor({ width: 402, height: 874, deviceName: 'iPhone 16 & 17 Pro', zoom: 0.63 })).toBe(
      'iPhone 16 & 17 Pro · 402 × 874 · 63%',
    );
  });

  it('always appends the zoom percentage, even at exactly 100% or above - zoom is user controlled now', () => {
    expect(readoutFor({ width: 1440, height: null, deviceName: null, zoom: 1 })).toMatch(/100%$/);
    expect(readoutFor({ width: 1440, height: null, deviceName: null, zoom: 1.5 })).toMatch(/150%$/);
    expect(readoutFor({ width: 1440, height: null, deviceName: null, zoom: 4 })).toMatch(/400%$/);
  });
});
