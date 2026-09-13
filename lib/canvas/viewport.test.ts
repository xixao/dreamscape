import { describe, expect, it } from 'vitest';
import type { Screen } from '@/lib/files/repository';
import { ARTBOARD_MIN_HEIGHT } from '@/lib/stage';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_STEPS,
  clampZoom,
  fitAll,
  frameRect,
  nextZoomStep,
  panBy,
  snapBoxFor,
  stepZoom,
  toCanvasPoint,
  toWindowPoint,
  zoomAround,
  zoomTo,
  zoomToRect,
} from './viewport';

describe('clampZoom', () => {
  it('clamps to the 10%..400% range', () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
    expect(clampZoom(40)).toBe(MAX_ZOOM);
    expect(clampZoom(1)).toBe(1);
  });
});

describe('panBy', () => {
  it('adds the screen-space delta to the viewport position, leaving zoom untouched', () => {
    const next = panBy({ x: 10, y: 20, zoom: 2 }, 5, -8);
    expect(next).toEqual({ x: 15, y: 12, zoom: 2 });
  });
});

describe('toWindowPoint / toCanvasPoint', () => {
  it('map a canvas point to a window point and back at zoom 1 with no pan', () => {
    const viewport = { x: 0, y: 0, zoom: 1 };
    expect(toWindowPoint({ x: 100, y: 50 }, viewport)).toEqual({ x: 100, y: 50 });
    expect(toCanvasPoint({ x: 100, y: 50 }, viewport)).toEqual({ x: 100, y: 50 });
  });

  it('scales and offsets by zoom and pan', () => {
    const viewport = { x: 40, y: -20, zoom: 2 };
    expect(toWindowPoint({ x: 10, y: 10 }, viewport)).toEqual({ x: 60, y: 0 });
  });

  it('toCanvasPoint is the inverse of toWindowPoint', () => {
    const viewport = { x: 40, y: -20, zoom: 2 };
    const canvasPoint = { x: 123, y: 45 };
    const windowPoint = toWindowPoint(canvasPoint, viewport);
    expect(toCanvasPoint(windowPoint, viewport)).toEqual(canvasPoint);
  });
});

describe('zoomAround', () => {
  it('keeps the point under the pointer fixed after zooming in', () => {
    const viewport = { x: 0, y: 0, zoom: 1 };
    const pointer = { x: 200, y: 150 };
    const before = toCanvasPoint(pointer, viewport);

    const next = zoomAround(viewport, pointer, 2);

    expect(next.zoom).toBe(2);
    const after = toCanvasPoint(pointer, next);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });

  it('keeps the point fixed after zooming out, with an existing pan offset', () => {
    const viewport = { x: 120, y: -60, zoom: 1.5 };
    const pointer = { x: 400, y: 300 };
    const before = toCanvasPoint(pointer, viewport);

    const next = zoomAround(viewport, pointer, 0.5);

    const after = toCanvasPoint(pointer, next);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });

  it('clamps the resulting zoom to the 10%..400% range', () => {
    const viewport = { x: 0, y: 0, zoom: 1 };
    const zoomedOutTooFar = zoomAround(viewport, { x: 0, y: 0 }, 0.001);
    expect(zoomedOutTooFar.zoom).toBe(MIN_ZOOM);

    const zoomedInTooFar = zoomAround(viewport, { x: 0, y: 0 }, 1000);
    expect(zoomedInTooFar.zoom).toBe(MAX_ZOOM);
  });

  it('is a no-op once already clamped at a boundary and pushed further past it', () => {
    const atMin = { x: 30, y: 30, zoom: MIN_ZOOM };
    const still = zoomAround(atMin, { x: 500, y: 500 }, 0.1);
    expect(still).toEqual(atMin);
  });
});

describe('zoomToRect', () => {
  it('centers the rect and picks the largest zoom that fits both axes within padding', () => {
    const rect = { x: 0, y: 0, width: 400, height: 200 };
    const viewportSize = { width: 1000, height: 600 };

    const viewport = zoomToRect(rect, viewportSize, 0);

    // width-constrained: 1000/400 = 2.5, height-constrained: 600/200 = 3 -> 2.5 wins.
    expect(viewport.zoom).toBe(2.5);
    // The rect's center (200,100) must land on the viewport's center (500,300).
    const center = toWindowPoint({ x: 200, y: 100 }, viewport);
    expect(center.x).toBeCloseTo(500, 10);
    expect(center.y).toBeCloseTo(300, 10);
  });

  it('accounts for padding on every side', () => {
    const rect = { x: 0, y: 0, width: 400, height: 400 };
    const viewportSize = { width: 1000, height: 1000 };

    const viewport = zoomToRect(rect, viewportSize, 100);

    // Available space is 800x800 either axis -> zoom 2.
    expect(viewport.zoom).toBe(2);
  });

  it('clamps the computed zoom to the allowed range', () => {
    const tinyRect = { x: 0, y: 0, width: 1, height: 1 };
    const viewport = zoomToRect(tinyRect, { width: 1000, height: 1000 }, 0);
    expect(viewport.zoom).toBe(MAX_ZOOM);

    const hugeRect = { x: 0, y: 0, width: 1_000_000, height: 1_000_000 };
    const viewportOut = zoomToRect(hugeRect, { width: 1000, height: 1000 }, 0);
    expect(viewportOut.zoom).toBe(MIN_ZOOM);
  });
});

describe('fitAll', () => {
  it('covers every frame, not just the first, with padding to spare', () => {
    const frames = [
      { x: 0, y: 0, width: 400, height: 300 },
      { x: 800, y: 500, width: 400, height: 300 },
    ];
    const viewportSize = { width: 1200, height: 800 };

    const viewport = fitAll(frames, viewportSize);

    for (const frame of frames) {
      const topLeft = toWindowPoint({ x: frame.x, y: frame.y }, viewport);
      const bottomRight = toWindowPoint({ x: frame.x + frame.width, y: frame.y + frame.height }, viewport);
      expect(topLeft.x).toBeGreaterThanOrEqual(-0.01);
      expect(topLeft.y).toBeGreaterThanOrEqual(-0.01);
      expect(bottomRight.x).toBeLessThanOrEqual(viewportSize.width + 0.01);
      expect(bottomRight.y).toBeLessThanOrEqual(viewportSize.height + 0.01);
    }
  });

  it('defaults to zoom 1 centered at the origin when there are no frames', () => {
    expect(fitAll([], { width: 1000, height: 800 })).toEqual({ x: 500, y: 400, zoom: 1 });
  });
});

describe('ZOOM_STEPS', () => {
  it('matches the spec\'s 10 step table, ascending', () => {
    expect(ZOOM_STEPS).toEqual([0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]);
  });
});

describe('nextZoomStep', () => {
  it('steps up to the next larger step', () => {
    expect(nextZoomStep(1, 'in')).toBe(1.25);
    expect(nextZoomStep(0.6, 'in')).toBe(0.75);
  });

  it('steps down to the next smaller step', () => {
    expect(nextZoomStep(1, 'out')).toBe(0.75);
    expect(nextZoomStep(0.6, 'out')).toBe(0.5);
  });

  it('stays at the top step when already there or beyond', () => {
    expect(nextZoomStep(4, 'in')).toBe(4);
    expect(nextZoomStep(10, 'in')).toBe(4);
  });

  it('stays at the bottom step when already there or below', () => {
    expect(nextZoomStep(0.1, 'out')).toBe(0.1);
    expect(nextZoomStep(0.01, 'out')).toBe(0.1);
  });

  it('is not thrown off by floating point drift when already exactly on a step', () => {
    // 0.1 + 0.15 has float error in plain JS; nextZoomStep must still treat
    // a value that IS a step as being exactly on it.
    const zoom = ZOOM_STEPS[4]; // 1
    expect(nextZoomStep(zoom, 'in')).toBe(ZOOM_STEPS[5]);
    expect(nextZoomStep(zoom, 'out')).toBe(ZOOM_STEPS[3]);
  });
});

describe('zoomTo', () => {
  it('sets the exact target zoom, keeping the given point fixed', () => {
    const viewport = { x: 30, y: -10, zoom: 0.75 };
    const pointer = { x: 200, y: 150 };
    const before = toCanvasPoint(pointer, viewport);

    const next = zoomTo(viewport, pointer, 1);

    expect(next.zoom).toBe(1);
    const after = toCanvasPoint(pointer, next);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });

  it('is a no-op when already at the target zoom', () => {
    const viewport = { x: 30, y: -10, zoom: 1 };
    expect(zoomTo(viewport, { x: 0, y: 0 }, 1)).toEqual(viewport);
  });
});

describe('stepZoom', () => {
  it('zooms in to the next step, keeping the point fixed', () => {
    const viewport = { x: 0, y: 0, zoom: 1 };
    const pointer = { x: 300, y: 200 };
    const before = toCanvasPoint(pointer, viewport);

    const next = stepZoom(viewport, pointer, 'in');

    expect(next.zoom).toBe(1.25);
    const after = toCanvasPoint(pointer, next);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });

  it('zooms out to the next step, keeping the point fixed', () => {
    const viewport = { x: 0, y: 0, zoom: 1 };
    const next = stepZoom(viewport, { x: 300, y: 200 }, 'out');
    expect(next.zoom).toBe(0.75);
  });

  it('stops at the top/bottom step, matching nextZoomStep', () => {
    expect(stepZoom({ x: 0, y: 0, zoom: MAX_ZOOM }, { x: 0, y: 0 }, 'in').zoom).toBe(MAX_ZOOM);
    expect(stepZoom({ x: 0, y: 0, zoom: MIN_ZOOM }, { x: 0, y: 0 }, 'out').zoom).toBe(MIN_ZOOM);
  });
});

// Review fix wave nit 15 (moved here from components/workbench/canvas.tsx)
// and item 8 (the new measuredHeights parameter).
describe('frameRect / snapBoxFor', () => {
  const AUTO_HEIGHT_SCREEN: Screen = { id: 's1', name: 'Frame 1', layout: '{}', stageWidth: 400, x: 10, y: 20 };
  const FIXED_HEIGHT_SCREEN: Screen = { id: 's2', name: 'Frame 2', layout: '{}', stageWidth: 400, stageHeight: 250, x: 0, y: 0 };

  it('falls back to ARTBOARD_MIN_HEIGHT for an auto-height screen with no measuredHeights given at all', () => {
    expect(frameRect(AUTO_HEIGHT_SCREEN)).toEqual({ x: 10, y: 20, width: 400, height: ARTBOARD_MIN_HEIGHT });
  });

  it('falls back to ARTBOARD_MIN_HEIGHT when measuredHeights has no entry for this screen yet', () => {
    const measuredHeights = new Map([['some-other-screen', 900]]);
    expect(frameRect(AUTO_HEIGHT_SCREEN, measuredHeights).height).toBe(ARTBOARD_MIN_HEIGHT);
  });

  it('uses a fed measured height for an auto-height screen', () => {
    const measuredHeights = new Map([[AUTO_HEIGHT_SCREEN.id, 612]]);
    expect(frameRect(AUTO_HEIGHT_SCREEN, measuredHeights)).toEqual({ x: 10, y: 20, width: 400, height: 612 });
  });

  it('a fixed stageHeight always wins over a fed measured height', () => {
    const measuredHeights = new Map([[FIXED_HEIGHT_SCREEN.id, 999]]);
    expect(frameRect(FIXED_HEIGHT_SCREEN, measuredHeights).height).toBe(250);
  });

  it('snapBoxFor carries the id alongside the same measured-height-aware rect', () => {
    const measuredHeights = new Map([[AUTO_HEIGHT_SCREEN.id, 612]]);
    expect(snapBoxFor(AUTO_HEIGHT_SCREEN, measuredHeights)).toEqual({
      id: 's1',
      x: 10,
      y: 20,
      width: 400,
      height: 612,
    });
  });
});
