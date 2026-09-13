import { describe, expect, it } from 'vitest';
import { KNOWN_TYPES } from '@/components/blocks/known-types';
import loginScreen from '@/lib/examples/login-screen.json';
import { OVERLAY_DEFAULT_WIDTHS, OVERLAY_MIN_HEIGHT, createOverlayScreen, isOverlay, overlayBadgeLabel } from './screens';
import { PRESENTATION_TYPES, validateLayout, validateScreens, type Screen } from './validate';

// Everything createOverlayScreen leaves to its caller (spec
// docs/superpowers/specs/2026-09-13-overlay-frames-design.md section 2: the
// name is "numbered per file like screens", the id/page/position come from
// wherever the frame is being created).
const BASE = { id: 'overlay001', name: 'Dialog 1', pageId: 'page000001', x: 100, y: 200 };

describe('isOverlay', () => {
  it('is true only for a screen whose kind is "overlay" AND that carries a presentation (absent kind means a plain screen)', () => {
    expect(isOverlay({ kind: 'overlay', presentation: { type: 'dialog', dismissible: true } })).toBe(true);
    expect(isOverlay({ kind: 'overlay' })).toBe(false);
    expect(isOverlay({ kind: 'screen' })).toBe(false);
    expect(isOverlay({})).toBe(false);
  });

  it('narrows to OverlayScreen, so a filtered list reads presentation without a guard', () => {
    const screens: Screen[] = [
      { id: 'screen0001', name: 'Login', layout: '{}', stageWidth: 1440 },
      createOverlayScreen({ type: 'sheet', side: 'top', ...BASE }),
      createOverlayScreen({ type: 'toast', ...BASE, id: 'overlay002' }),
    ];

    const overlays = screens.filter(isOverlay);

    // `.presentation.type` (no `?.`) only compiles because isOverlay is a
    // type predicate - tsc pins that, this asserts the runtime filter.
    expect(overlays.map((overlay) => overlay.presentation.type)).toEqual(['sheet', 'toast']);
    expect(overlays.map((overlay) => overlay.kind)).toEqual(['overlay', 'overlay']);
  });
});

describe('overlay constants', () => {
  it('match the spec: dialog 512, sheet 400, toast 360 wide; 120 px minimum height', () => {
    expect(OVERLAY_DEFAULT_WIDTHS).toEqual({ dialog: 512, sheet: 400, toast: 360 });
    expect(OVERLAY_MIN_HEIGHT).toBe(120);
  });

  it('cover exactly the shared presentation types, in the same order', () => {
    expect(Object.keys(OVERLAY_DEFAULT_WIDTHS)).toEqual([...PRESENTATION_TYPES]);
  });
});

describe('createOverlayScreen', () => {
  it('builds a dismissible dialog at 512 wide, hugging content, with no device', () => {
    const screen = createOverlayScreen({ type: 'dialog', ...BASE });

    expect(screen).toMatchObject({
      id: 'overlay001',
      name: 'Dialog 1',
      pageId: 'page000001',
      x: 100,
      y: 200,
      kind: 'overlay',
      presentation: { type: 'dialog', dismissible: true },
      stageWidth: 512,
      stageHeight: null,
      deviceName: null,
    });
    expect(isOverlay(screen)).toBe(true);
  });

  it('builds a dismissible sheet on the right by default, at 400 wide', () => {
    const screen = createOverlayScreen({ type: 'sheet', ...BASE });

    expect(screen.presentation).toEqual({ type: 'sheet', side: 'right', dismissible: true });
    expect(screen.stageWidth).toBe(400);
    expect(screen).toMatchObject({ kind: 'overlay', stageHeight: null, deviceName: null });
  });

  it('keeps a given sheet side', () => {
    expect(createOverlayScreen({ type: 'sheet', side: 'left', ...BASE }).presentation).toEqual({
      type: 'sheet',
      side: 'left',
      dismissible: true,
    });
    expect(createOverlayScreen({ type: 'sheet', side: 'bottom', ...BASE }).presentation).toEqual({
      type: 'sheet',
      side: 'bottom',
      dismissible: true,
    });
  });

  it('builds a toast at the bottom right by default, at 360 wide, with no dismissible flag', () => {
    const screen = createOverlayScreen({ type: 'toast', ...BASE });

    expect(screen.presentation).toEqual({ type: 'toast', position: 'bottom-right' });
    expect(screen.stageWidth).toBe(360);
    expect(screen).toMatchObject({ kind: 'overlay', stageHeight: null, deviceName: null });
  });

  it('keeps a given toast position', () => {
    expect(createOverlayScreen({ type: 'toast', position: 'top-center', ...BASE }).presentation).toEqual({
      type: 'toast',
      position: 'top-center',
    });
  });

  it('ignores a side or position that does not apply to the presentation type', () => {
    expect(createOverlayScreen({ type: 'dialog', side: 'left', position: 'top-left', ...BASE }).presentation).toEqual({
      type: 'dialog',
      dismissible: true,
    });
    expect(createOverlayScreen({ type: 'toast', side: 'left', ...BASE }).presentation).toEqual({
      type: 'toast',
      position: 'bottom-right',
    });
    expect(createOverlayScreen({ type: 'sheet', position: 'top-left', ...BASE }).presentation).toEqual({
      type: 'sheet',
      side: 'right',
      dismissible: true,
    });
  });

  describe('layout', () => {
    const loginRoot = (loginScreen as { ROOT: Record<string, unknown> }).ROOT;

    it.each(['dialog', 'sheet'] as const)(
      'gives a %s an empty column-flex ROOT with 24 px padding and a 16 px gap, shaped like the login example ROOT',
      (type) => {
        const layout = JSON.parse(createOverlayScreen({ type, ...BASE }).layout);

        expect(Object.keys(layout)).toEqual(['ROOT']);
        expect(layout.ROOT).toEqual({
          ...loginRoot,
          props: {
            mode: 'flex',
            direction: { mobile: 'column', desktop: 'column' },
            columns: { mobile: 1, desktop: 3 },
            align: { mobile: 'stretch', desktop: 'stretch' },
            justify: { mobile: 'start', desktop: 'start' },
            gapPx: 16,
            paddingPx: 24,
            background: 'none',
            grow: false,
          },
          nodes: [],
        });
      },
    );

    it('gives a toast 16 px padding instead, with the same 16 px gap', () => {
      const layout = JSON.parse(createOverlayScreen({ type: 'toast', ...BASE }).layout);

      expect(layout.ROOT.props).toMatchObject({ mode: 'flex', paddingPx: 16, gapPx: 16 });
      expect(layout.ROOT.nodes).toEqual([]);
    });

    it('validates against the known block types for every presentation type', () => {
      for (const type of ['dialog', 'sheet', 'toast'] as const) {
        expect(validateLayout(createOverlayScreen({ type, ...BASE }).layout, KNOWN_TYPES).ok).toBe(true);
      }
    });
  });

  it('produces a screen that validateScreens accepts as an overlay and passes through unchanged', () => {
    const screen = createOverlayScreen({ type: 'sheet', side: 'bottom', ...BASE });

    const result = validateScreens([screen], KNOWN_TYPES, new Set(['page000001']));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.screens[0]).toEqual(screen);
  });
});

describe('overlayBadgeLabel', () => {
  it('names a dialog "Dialog" and a toast "Toast", regardless of their own fields', () => {
    expect(overlayBadgeLabel({ type: 'dialog', dismissible: true })).toBe('Dialog');
    expect(overlayBadgeLabel({ type: 'dialog', dismissible: false })).toBe('Dialog');
    expect(overlayBadgeLabel({ type: 'toast', position: 'top-left' })).toBe('Toast');
  });

  it('names a sheet with its capitalized side', () => {
    expect(overlayBadgeLabel({ type: 'sheet', side: 'right', dismissible: true })).toBe('Sheet · Right');
    expect(overlayBadgeLabel({ type: 'sheet', side: 'left', dismissible: false })).toBe('Sheet · Left');
    expect(overlayBadgeLabel({ type: 'sheet', side: 'top', dismissible: true })).toBe('Sheet · Top');
    expect(overlayBadgeLabel({ type: 'sheet', side: 'bottom', dismissible: true })).toBe('Sheet · Bottom');
  });

  it('matches every createOverlayScreen default, for every presentation type', () => {
    for (const type of ['dialog', 'sheet', 'toast'] as const) {
      const screen = createOverlayScreen({ type, ...BASE });
      expect(() => overlayBadgeLabel(screen.presentation!)).not.toThrow();
    }
    expect(overlayBadgeLabel(createOverlayScreen({ type: 'sheet', ...BASE }).presentation!)).toBe('Sheet · Right');
  });
});
