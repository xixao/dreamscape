import { describe, expect, it } from 'vitest';
import { toArtboardPoint, toScreenPoint, type Rect } from './geometry';

const RECT: Rect = { left: 100, top: 50, width: 400, height: 800 };

describe('toArtboardPoint', () => {
  it('subtracts the artboard origin at zoom 1', () => {
    expect(toArtboardPoint(150, 120, RECT, 1)).toEqual({ x: 50, y: 70 });
  });

  it('divides by zoom to undo scaling', () => {
    expect(toArtboardPoint(300, 250, RECT, 0.5)).toEqual({ x: 400, y: 400 });
  });

  it('is the inverse of toScreenPoint at a fractional zoom', () => {
    const point = toArtboardPoint(322, 214, RECT, 0.75);
    const back = toScreenPoint(point.x, point.y, RECT, 0.75);
    expect(back.x).toBeCloseTo(322);
    expect(back.y).toBeCloseTo(214);
  });
});

describe('toScreenPoint', () => {
  it('adds the artboard origin at zoom 1', () => {
    expect(toScreenPoint(50, 70, RECT, 1)).toEqual({ x: 150, y: 120 });
  });

  it('multiplies by zoom to apply scaling', () => {
    expect(toScreenPoint(400, 400, RECT, 0.5)).toEqual({ x: 300, y: 250 });
  });

  it('is the inverse of toArtboardPoint at zoom 1', () => {
    const screen = toScreenPoint(12, 34, RECT, 1);
    expect(toArtboardPoint(screen.x, screen.y, RECT, 1)).toEqual({ x: 12, y: 34 });
  });
});
