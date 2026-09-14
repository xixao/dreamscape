import { describe, expect, it } from 'vitest';
import { KNOWN_TYPES } from '@/components/blocks/known-types';
import loginScreen from '@/lib/examples/login-screen.json';
import {
  OVERLAY_DEFAULT_WIDTHS,
  OVERLAY_MIN_HEIGHT,
  createOverlayScreen,
  isDefaultOverlayName,
  isOverlay,
  nextOverlayDefaultName,
  overlayBadgeLabel,
  wouldStrandPage,
} from './screens';
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

describe('isDefaultOverlayName / nextOverlayDefaultName', () => {
  function overlay(id: string, type: 'dialog' | 'sheet' | 'toast', name: string): Screen {
    return createOverlayScreen({ type, id, name, pageId: 'page000001', x: 0, y: 0 });
  }

  describe('isDefaultOverlayName', () => {
    it('is true for the exact "<Type> <N>" shape, any N', () => {
      expect(isDefaultOverlayName('Dialog 1', 'dialog')).toBe(true);
      expect(isDefaultOverlayName('Dialog 42', 'dialog')).toBe(true);
      expect(isDefaultOverlayName('Sheet 3', 'sheet')).toBe(true);
      expect(isDefaultOverlayName('Toast 7', 'toast')).toBe(true);
    });

    it('is false for a user-renamed name, a different type\'s prefix, or a malformed number', () => {
      expect(isDefaultOverlayName('Confirm delete', 'dialog')).toBe(false);
      expect(isDefaultOverlayName('Sheet 3', 'dialog')).toBe(false);
      expect(isDefaultOverlayName('Dialog', 'dialog')).toBe(false);
      expect(isDefaultOverlayName('Dialog 1 ', 'dialog')).toBe(false);
      expect(isDefaultOverlayName('Dialog 1.5', 'dialog')).toBe(false);
      expect(isDefaultOverlayName('My Dialog 1', 'dialog')).toBe(false);
    });
  });

  describe('nextOverlayDefaultName', () => {
    it('is "<Type> 1" when the file has no overlay of that type yet', () => {
      expect(nextOverlayDefaultName([], 'dialog')).toBe('Dialog 1');
      const onlyASheet = [overlay('o1', 'sheet', 'Sheet 1')];
      expect(nextOverlayDefaultName(onlyASheet, 'dialog')).toBe('Dialog 1');
    });

    it('is one past the highest existing default number for that type', () => {
      const screens = [overlay('o1', 'dialog', 'Dialog 1'), overlay('o2', 'dialog', 'Dialog 2')];
      expect(nextOverlayDefaultName(screens, 'dialog')).toBe('Dialog 3');
    });

    it('ignores a gap left by a renamed-away overlay - the count is by NAME, not by how many exist', () => {
      // "Dialog 1" was renamed to "Confirm delete"; only "Dialog 2" still
      // looks like a default. The spec review's own finding 2: counting by
      // current presentation.type (or by how many overlays of a type exist)
      // instead of by name is exactly the bug this function fixes.
      const screens = [overlay('o1', 'dialog', 'Confirm delete'), overlay('o2', 'dialog', 'Dialog 2')];
      expect(nextOverlayDefaultName(screens, 'dialog')).toBe('Dialog 3');
    });

    it('ignores a plain screen that happens to share a default-looking name', () => {
      const screens: Screen[] = [{ id: 's1', name: 'Dialog 5', layout: '{}', stageWidth: 1440, pageId: 'p1' }];
      expect(nextOverlayDefaultName(screens, 'dialog')).toBe('Dialog 1');
    });

    it('a switched-type overlay\'s name still blocks a NEW one from reusing it - no duplicate names', () => {
      // "Dialog 2" became a sheet without being renamed (the review's own
      // failing-input scenario). A brand new dialog must not also become
      // "Dialog 2" - that exact collision (two overlays both showing
      // "Dialog 2") is the bug finding 2 describes - so dialog numbering
      // skips past it to "Dialog 3".
      const screens = [overlay('o1', 'dialog', 'Dialog 1'), overlay('o2', 'sheet', 'Dialog 2')];
      expect(nextOverlayDefaultName(screens, 'dialog')).toBe('Dialog 3');
      // Sheet numbering is unaffected by a name that merely looks like a
      // dialog default: nothing is named "Sheet N" yet, so the first real
      // sheet still gets "Sheet 1" (exactly the name the Design panel's
      // presentation-type switch, tested separately, would rename this
      // very overlay to).
      expect(nextOverlayDefaultName(screens, 'sheet')).toBe('Sheet 1');
    });
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

describe('wouldStrandPage', () => {
  const plainA: Screen = { id: 'a', name: 'Login', layout: '{}', stageWidth: 1440, pageId: 'p1' };
  const plainB: Screen = { id: 'b', name: 'Settings', layout: '{}', stageWidth: 1440, pageId: 'p1' };
  const overlay = createOverlayScreen({ type: 'dialog', id: 'o1', name: 'Dialog 1', pageId: 'p1', x: 0, y: 0 });

  it('is true for the last plain screen of a page that also has an overlay', () => {
    expect(wouldStrandPage(plainA, [plainA, overlay])).toBe(true);
  });

  it('is false for a plain screen when another plain screen would remain', () => {
    expect(wouldStrandPage(plainA, [plainA, plainB, overlay])).toBe(false);
  });

  it('is false for a plain screen when the page has no overlay at all, even as the only screen', () => {
    expect(wouldStrandPage(plainA, [plainA])).toBe(false);
  });

  it('is always false for an overlay itself, even as the page\'s only overlay', () => {
    expect(wouldStrandPage(overlay, [plainA, overlay])).toBe(false);
  });
});
