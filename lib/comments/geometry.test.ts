import { describe, expect, it } from 'vitest';
import type { Viewport } from '@/lib/canvas/viewport';
import { frameToWindowPoint, toArtboardPoint, toScreenPoint, windowToFramePoint, type Rect } from './geometry';

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

// The pure, DOM-free equivalent of measuring a frame's rendered rect and
// calling toScreenPoint/toArtboardPoint against it (what CommentLayer and
// Stage actually do, live, via getBoundingClientRect) - spec docs/
// superpowers/specs/2026-09-12-infinite-canvas-design.md section 7:
// "convert frame coordinates through the frame's position, the viewport
// transform and the iframe rect."
describe('frameToWindowPoint', () => {
  const FRAME = { x: 300, y: 100 };

  it('adds the frame origin at zoom 1 with no pan', () => {
    const viewport: Viewport = { x: 0, y: 0, zoom: 1 };
    expect(frameToWindowPoint({ x: 50, y: 70 }, FRAME, viewport)).toEqual({ x: 350, y: 170 });
  });

  it('scales by zoom and offsets by pan at a fractional zoom', () => {
    const viewport: Viewport = { x: 20, y: -10, zoom: 0.5 };
    // Canvas point: (300+50, 100+70) = (350, 170); window: 350*0.5+20=195, 170*0.5-10=75.
    expect(frameToWindowPoint({ x: 50, y: 70 }, FRAME, viewport)).toEqual({ x: 195, y: 75 });
  });

  it('follows a pan: the same frame-local point moves by exactly the pan delta', () => {
    const before = frameToWindowPoint({ x: 50, y: 70 }, FRAME, { x: 0, y: 0, zoom: 1 });
    const after = frameToWindowPoint({ x: 50, y: 70 }, FRAME, { x: 40, y: -15, zoom: 1 });
    expect(after.x - before.x).toBe(40);
    expect(after.y - before.y).toBe(-15);
  });
});

describe('windowToFramePoint', () => {
  const FRAME = { x: 300, y: 100 };

  it('is the inverse of frameToWindowPoint at zoom 1', () => {
    const viewport: Viewport = { x: 0, y: 0, zoom: 1 };
    const windowPoint = frameToWindowPoint({ x: 50, y: 70 }, FRAME, viewport);
    expect(windowToFramePoint(windowPoint, FRAME, viewport)).toEqual({ x: 50, y: 70 });
  });

  it('is the inverse of frameToWindowPoint at a fractional zoom with pan', () => {
    const viewport: Viewport = { x: 20, y: -10, zoom: 0.5 };
    const point = { x: 50, y: 70 };
    const windowPoint = frameToWindowPoint(point, FRAME, viewport);
    const back = windowToFramePoint(windowPoint, FRAME, viewport);
    expect(back.x).toBeCloseTo(point.x);
    expect(back.y).toBeCloseTo(point.y);
  });
});
