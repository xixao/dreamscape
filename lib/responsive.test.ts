import { describe, expect, it } from 'vitest';
import {
  BREAKPOINT_MD,
  breakpointForWidth,
  isResponsive,
  otherBreakpoint,
  resolve,
} from './responsive';

describe('breakpointForWidth', () => {
  it('is mobile below 768 and desktop from 768 up', () => {
    expect(BREAKPOINT_MD).toBe(768);
    expect(breakpointForWidth(320)).toBe('mobile');
    expect(breakpointForWidth(375)).toBe('mobile');
    expect(breakpointForWidth(767)).toBe('mobile');
    expect(breakpointForWidth(768)).toBe('desktop');
    expect(breakpointForWidth(1440)).toBe('desktop');
  });
});

describe('resolve', () => {
  it('returns the value for the requested breakpoint', () => {
    const v = { mobile: 'column', desktop: 'row' };
    expect(resolve(v, 'mobile')).toBe('column');
    expect(resolve(v, 'desktop')).toBe('row');
  });

  it('falls back to mobile when desktop is missing', () => {
    expect(resolve({ mobile: 2 }, 'desktop')).toBe(2);
  });

  it('passes plain values through', () => {
    expect(resolve('row', 'mobile')).toBe('row');
    expect(resolve(4, 'desktop')).toBe(4);
    expect(resolve(true, 'desktop')).toBe(true);
  });
});

describe('isResponsive', () => {
  it('detects only the { mobile } shape', () => {
    expect(isResponsive({ mobile: 1 })).toBe(true);
    expect(isResponsive({ mobile: 1, desktop: 2 })).toBe(true);
    expect(isResponsive(1)).toBe(false);
    expect(isResponsive('row')).toBe(false);
    expect(isResponsive(null)).toBe(false);
    expect(isResponsive({ desktop: 1 })).toBe(false);
  });
});

describe('otherBreakpoint', () => {
  it('flips between the two', () => {
    expect(otherBreakpoint('mobile')).toBe('desktop');
    expect(otherBreakpoint('desktop')).toBe('mobile');
  });
});
