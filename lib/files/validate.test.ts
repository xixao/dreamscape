import { describe, expect, it } from 'vitest';
import {
  canonicalLayout,
  dropDanglingDiagramEdges,
  normalizeLayout,
  validateDiagram,
  validateDiagramReferences,
  validateLayout,
  validatePages,
  validateScreens,
  type DiagramInput,
  type Page,
  type PageInput,
  type Screen,
  type ScreenInput,
  hasRootNode,
} from './validate';

describe('canonicalLayout', () => {
  it('treats two encodings that differ only in object key order as equal', () => {
    const a = JSON.stringify({ ROOT: { type: 'LayoutBox', nodes: [], props: { a: 1, b: 2 } } });
    const b = JSON.stringify({ ROOT: { props: { b: 2, a: 1 }, nodes: [], type: 'LayoutBox' } });

    expect(canonicalLayout(a)).toBe(canonicalLayout(b));
  });

  it('sorts keys recursively, at every depth', () => {
    const nested = JSON.stringify({ z: { d: 1, c: { y: 1, x: 2 } }, a: 1 });

    expect(canonicalLayout(nested)).toBe('{"a":1,"z":{"c":{"x":2,"y":1},"d":1}}');
  });

  it('preserves array element order (arrays are ordered lists, not sorted)', () => {
    const withArray = JSON.stringify({ nodes: ['b', 'a', 'c'] });

    expect(canonicalLayout(withArray)).toBe('{"nodes":["b","a","c"]}');
  });

  it('still distinguishes layouts that genuinely differ, not just in key order', () => {
    const a = JSON.stringify({ ROOT: { props: { mode: 'flex' } } });
    const b = JSON.stringify({ ROOT: { props: { mode: 'grid' } } });

    expect(canonicalLayout(a)).not.toBe(canonicalLayout(b));
  });

  it('round-trips the login example layout to a stable canonical form', () => {
    const layout = JSON.stringify({ ROOT: { b: 1, a: { d: 2, c: 3 } } });

    // Canonicalizing twice must be idempotent.
    expect(canonicalLayout(canonicalLayout(layout))).toBe(canonicalLayout(layout));
  });
});

describe('validateLayout', () => {
  it('still accepts a valid layout (canonicalLayout is additive, not a replacement)', () => {
    const knownTypes = new Set(['LayoutBox']);
    const result = validateLayout(JSON.stringify({ ROOT: { type: 'LayoutBox' } }), knownTypes);

    expect(result.ok).toBe(true);
  });
});

describe('validateScreens', () => {
  const knownTypes = new Set(['LayoutBox']);
  const validLayout = JSON.stringify({ ROOT: { type: 'LayoutBox' } });

  function screen(overrides: Partial<ScreenInput> = {}): ScreenInput {
    return { id: '1234567890', name: 'Frame 1', layout: validLayout, stageWidth: 1440, ...overrides };
  }

  it('accepts one valid screen and normalizes it, defaulting stageHeight/deviceName/x/y to null', () => {
    const result = validateScreens([screen({ name: '  Frame 1  ' })], knownTypes);

    expect(result).toEqual({
      ok: true,
      screens: [
        {
          id: '1234567890',
          name: 'Frame 1',
          layout: validLayout,
          stageWidth: 1440,
          stageHeight: null,
          deviceName: null,
          x: null,
          y: null,
        },
      ],
    });
  });

  it('accepts more than one screen, in order', () => {
    const result = validateScreens(
      [screen({ id: 'aaaaaaaaaa' }), screen({ id: 'bbbbbbbbbb', name: 'Frame 2' })],
      knownTypes,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.screens.map((s) => s.id)).toEqual(['aaaaaaaaaa', 'bbbbbbbbbb']);
    expect(result.screens.map((s) => s.name)).toEqual(['Frame 1', 'Frame 2']);
  });

  it('passes stageHeight and deviceName through when given', () => {
    const result = validateScreens([screen({ stageHeight: 900, deviceName: 'iPhone 17 Pro' })], knownTypes);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.screens[0]).toMatchObject({ stageHeight: 900, deviceName: 'iPhone 17 Pro' });
  });

  it('rejects a stageHeight that is zero, negative, or not an integer', () => {
    expect(validateScreens([screen({ stageHeight: 0 })], knownTypes)).toEqual({
      ok: false,
      reason: expect.any(String),
    });
    expect(validateScreens([screen({ stageHeight: -100 })], knownTypes)).toEqual({
      ok: false,
      reason: expect.any(String),
    });
    expect(validateScreens([screen({ stageHeight: 87.5 })], knownTypes)).toEqual({
      ok: false,
      reason: expect.any(String),
    });
  });

  it('accepts a stageHeight of exactly 1 and normal device heights', () => {
    const result = validateScreens([screen({ stageHeight: 1 })], knownTypes);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.screens[0].stageHeight).toBe(1);
  });

  it('rejects a deviceName longer than 80 characters', () => {
    const result = validateScreens([screen({ deviceName: 'x'.repeat(81) })], knownTypes);
    expect(result).toEqual({ ok: false, reason: expect.any(String) });
  });

  it('accepts a deviceName at exactly the 80 character limit', () => {
    const result = validateScreens([screen({ deviceName: 'x'.repeat(80) })], knownTypes);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.screens[0].deviceName).toBe('x'.repeat(80));
  });

  it('rejects zero screens', () => {
    const result = validateScreens([], knownTypes);
    expect(result).toEqual({ ok: false, reason: expect.any(String) });
  });

  it('rejects an invalid (unparsable) layout inside a screen', () => {
    const result = validateScreens([screen({ layout: '{not json' })], knownTypes);
    expect(result).toEqual({ ok: false, reason: expect.any(String) });
  });

  it('rejects a screen whose layout uses an unknown block type', () => {
    const result = validateScreens(
      [screen({ layout: JSON.stringify({ ROOT: { type: 'NotARealBlock' } }) })],
      knownTypes,
    );
    expect(result).toEqual({ ok: false, reason: expect.any(String) });
  });

  it('rejects duplicate screen ids', () => {
    const result = validateScreens(
      [screen({ id: 'dupdupdup1' }), screen({ id: 'dupdupdup1', name: 'Frame 2' })],
      knownTypes,
    );
    expect(result).toEqual({ ok: false, reason: expect.any(String) });
  });

  it('rejects an id that is not exactly 10 characters', () => {
    expect(validateScreens([screen({ id: 'short' })], knownTypes)).toEqual({ ok: false, reason: expect.any(String) });
    expect(validateScreens([screen({ id: 'wayyyytoolongforanid' })], knownTypes)).toEqual({
      ok: false,
      reason: expect.any(String),
    });
  });

  it('trims the name and rejects one that is empty or too long after trimming', () => {
    const trimmed = validateScreens([screen({ name: '  Padded  ' })], knownTypes);
    expect(trimmed.ok).toBe(true);
    if (!trimmed.ok) throw new Error('expected ok');
    expect(trimmed.screens[0].name).toBe('Padded');

    expect(validateScreens([screen({ name: '   ' })], knownTypes)).toEqual({ ok: false, reason: expect.any(String) });
    expect(validateScreens([screen({ name: 'x'.repeat(81) })], knownTypes)).toEqual({
      ok: false,
      reason: expect.any(String),
    });
  });

  it('accepts a name at exactly the 80 character limit', () => {
    const result = validateScreens([screen({ name: 'x'.repeat(80) })], knownTypes);
    expect(result.ok).toBe(true);
  });

  it('clamps stageWidth to the valid range', () => {
    const low = validateScreens([screen({ stageWidth: 10 })], knownTypes);
    const high = validateScreens([screen({ stageWidth: 5000 })], knownTypes);

    expect(low.ok).toBe(true);
    expect(high.ok).toBe(true);
    if (!low.ok || !high.ok) throw new Error('expected ok');
    expect(low.screens[0].stageWidth).toBe(120);
    expect(high.screens[0].stageWidth).toBe(3840);
  });

  describe('frame position (x/y)', () => {
    it('defaults x and y to null when neither is given', () => {
      const result = validateScreens([screen()], knownTypes);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok');
      expect(result.screens[0].x).toBeNull();
      expect(result.screens[0].y).toBeNull();
    });

    it('passes integer x and y through when both are given', () => {
      const result = validateScreens([screen({ x: 120, y: -40 })], knownTypes);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok');
      expect(result.screens[0]).toMatchObject({ x: 120, y: -40 });
    });

    it('accepts zero and negative integers for x/y', () => {
      const result = validateScreens([screen({ x: 0, y: -1 })], knownTypes);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok');
      expect(result.screens[0]).toMatchObject({ x: 0, y: -1 });
    });

    it('rejects x without y', () => {
      const result = validateScreens([screen({ x: 100 })], knownTypes);
      expect(result).toEqual({ ok: false, reason: expect.any(String) });
    });

    it('rejects y without x', () => {
      const result = validateScreens([screen({ y: 100 })], knownTypes);
      expect(result).toEqual({ ok: false, reason: expect.any(String) });
    });

    it('rejects a non-integer x or y', () => {
      expect(validateScreens([screen({ x: 1.5, y: 2 })], knownTypes)).toEqual({
        ok: false,
        reason: expect.any(String),
      });
      expect(validateScreens([screen({ x: 1, y: 2.5 })], knownTypes)).toEqual({
        ok: false,
        reason: expect.any(String),
      });
    });
  });

  // pageId is the third, optional argument: omitting it (every test above
  // this point does) skips the cross-check entirely, so every pre-pages
  // caller and test fixture keeps validating exactly as it always did. Real
  // callers - the repository's create()/save() - always pass it, which is
  // what these tests exercise.
  describe('pageId', () => {
    const pageIds = new Set(['page000001']);

    it('passes a screen through unchanged when no pageIds set is given at all', () => {
      const result = validateScreens([screen()], knownTypes);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok');
      expect(result.screens[0].pageId).toBeUndefined();
    });

    it('accepts and normalizes a screen whose pageId names a real page', () => {
      const result = validateScreens([screen({ pageId: 'page000001' })], knownTypes, pageIds);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok');
      expect(result.screens[0].pageId).toBe('page000001');
    });

    it('rejects a screen whose pageId names no page in the given set', () => {
      const result = validateScreens([screen({ pageId: 'doesnotexist' })], knownTypes, pageIds);
      expect(result).toEqual({ ok: false, reason: expect.any(String) });
    });

    it('rejects a screen with no pageId at all once a pageIds set is given', () => {
      const result = validateScreens([screen()], knownTypes, pageIds);
      expect(result).toEqual({ ok: false, reason: expect.any(String) });
    });
  });

  // Overlay frames (spec docs/superpowers/specs/2026-09-13-overlay-frames-
  // design.md section 2): `kind` absent means a plain screen, and a
  // `presentation` is required exactly when kind is 'overlay' - never on a
  // plain screen, and matching the OverlayPresentation union exactly.
  describe('kind and presentation (overlay frames)', () => {
    it('leaves kind and presentation absent on a plain screen that never had them', () => {
      const result = validateScreens([screen()], knownTypes);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok');
      expect('kind' in result.screens[0]).toBe(false);
      expect('presentation' in result.screens[0]).toBe(false);
    });

    it('passes an explicit kind of "screen" through, still with no presentation', () => {
      const result = validateScreens([screen({ kind: 'screen' })], knownTypes);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok');
      expect(result.screens[0].kind).toBe('screen');
      expect('presentation' in result.screens[0]).toBe(false);
    });

    it.each([
      { type: 'dialog', dismissible: true },
      { type: 'dialog', dismissible: false },
      { type: 'sheet', side: 'left', dismissible: true },
      { type: 'sheet', side: 'right', dismissible: false },
      { type: 'sheet', side: 'top', dismissible: true },
      { type: 'sheet', side: 'bottom', dismissible: true },
      { type: 'toast', position: 'top-left' },
      { type: 'toast', position: 'top-center' },
      { type: 'toast', position: 'top-right' },
      { type: 'toast', position: 'bottom-left' },
      { type: 'toast', position: 'bottom-center' },
      { type: 'toast', position: 'bottom-right' },
    ])('accepts an overlay with the presentation %j and passes it through untouched', (presentation) => {
      const result = validateScreens([screen({ kind: 'overlay', presentation })], knownTypes);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok');
      expect(result.screens[0].kind).toBe('overlay');
      expect(result.screens[0].presentation).toEqual(presentation);
    });

    it('rejects a kind that is neither "screen" nor "overlay"', () => {
      expect(validateScreens([screen({ kind: 'modal' })], knownTypes)).toEqual({
        ok: false,
        reason: expect.any(String),
      });
    });

    it('rejects an overlay with no presentation at all', () => {
      expect(validateScreens([screen({ kind: 'overlay' })], knownTypes)).toEqual({
        ok: false,
        reason: expect.any(String),
      });
    });

    it('rejects a presentation on a plain screen, whether kind is absent or "screen"', () => {
      const presentation = { type: 'dialog', dismissible: true };
      expect(validateScreens([screen({ presentation })], knownTypes)).toEqual({
        ok: false,
        reason: expect.any(String),
      });
      expect(validateScreens([screen({ kind: 'screen', presentation })], knownTypes)).toEqual({
        ok: false,
        reason: expect.any(String),
      });
    });

    it.each([
      { type: 'popover', dismissible: true },
      { type: 'dialog' },
      { type: 'dialog', dismissible: 'yes' },
      { type: 'dialog', dismissible: true, side: 'left' },
      { type: 'dialog', dismissible: true, position: 'top-left' },
      { type: 'sheet', dismissible: true },
      { type: 'sheet', side: 'middle', dismissible: true },
      { type: 'sheet', side: 'left' },
      { type: 'sheet', side: 'left', dismissible: true, position: 'top-left' },
      { type: 'toast' },
      { type: 'toast', position: 'center' },
      { type: 'toast', position: 'top-left', dismissible: true },
      { type: 'toast', position: 'top-left', side: 'left' },
      { type: 'dialog', dismissible: true, extra: 1 },
    ])('rejects an overlay whose presentation does not match the union exactly: %j', (presentation) => {
      const result = validateScreens([screen({ kind: 'overlay', presentation })], knownTypes);
      expect(result).toEqual({ ok: false, reason: expect.any(String) });
    });

    it('rejects a presentation that is not an object at all', () => {
      const result = validateScreens(
        [screen({ kind: 'overlay', presentation: 'dialog' as unknown as ScreenInput['presentation'] })],
        knownTypes,
      );
      expect(result).toEqual({ ok: false, reason: expect.any(String) });
    });

    it('names the screen in the rejection reason', () => {
      const result = validateScreens([screen({ name: 'Confirm', kind: 'overlay' })], knownTypes);
      expect(result).toEqual({ ok: false, reason: expect.stringContaining('Confirm') });
    });
  });
});

describe('validatePages', () => {
  function page(overrides: Partial<PageInput> = {}): PageInput {
    return { id: 'page000001', name: 'Page 1', ...overrides };
  }

  it('accepts one valid page and trims its name', () => {
    const result = validatePages([page({ name: '  Page 1  ' })]);
    expect(result).toEqual({ ok: true, pages: [{ id: 'page000001', name: 'Page 1' }] });
  });

  it('accepts more than one page, in order', () => {
    const result = validatePages([page({ id: 'page000001' }), page({ id: 'page000002', name: 'v2' })]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.pages.map((p) => p.id)).toEqual(['page000001', 'page000002']);
    expect(result.pages.map((p) => p.name)).toEqual(['Page 1', 'v2']);
  });

  it('rejects zero pages', () => {
    expect(validatePages([])).toEqual({ ok: false, reason: expect.any(String) });
  });

  it('rejects duplicate page ids', () => {
    const result = validatePages([page({ id: 'dupdupdup1' }), page({ id: 'dupdupdup1', name: 'v2' })]);
    expect(result).toEqual({ ok: false, reason: expect.any(String) });
  });

  it('rejects an id that is not exactly 10 characters', () => {
    expect(validatePages([page({ id: 'short' })])).toEqual({ ok: false, reason: expect.any(String) });
    expect(validatePages([page({ id: 'wayyyytoolongforanid' })])).toEqual({
      ok: false,
      reason: expect.any(String),
    });
  });

  it('trims the name and rejects one that is empty or too long after trimming', () => {
    const trimmed = validatePages([page({ name: '  Padded  ' })]);
    expect(trimmed.ok).toBe(true);
    if (!trimmed.ok) throw new Error('expected ok');
    expect(trimmed.pages[0].name).toBe('Padded');

    expect(validatePages([page({ name: '   ' })])).toEqual({ ok: false, reason: expect.any(String) });
    expect(validatePages([page({ name: 'x'.repeat(81) })])).toEqual({ ok: false, reason: expect.any(String) });
  });

  it('accepts a name at exactly the 80 character limit', () => {
    const result = validatePages([page({ name: 'x'.repeat(80) })]);
    expect(result.ok).toBe(true);
  });

  describe('diagram', () => {
    function diagramNode(overrides: Partial<DiagramInput['nodes'][number]> = {}) {
      return {
        id: 'node000001',
        kind: 'rect',
        x: 0,
        y: 0,
        width: 120,
        height: 60,
        text: '',
        color: 'neutral',
        ...overrides,
      };
    }

    it('is absent from the output when a page has none', () => {
      const result = validatePages([page()]);
      expect(result).toEqual({ ok: true, pages: [{ id: 'page000001', name: 'Page 1' }] });
    });

    it('validates and carries through a page\'s diagram', () => {
      const result = validatePages([page({ diagram: { nodes: [diagramNode()], edges: [] } })]);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok');
      expect(result.pages[0].diagram).toEqual({ nodes: [diagramNode()], edges: [] });
    });

    it('rejects a page whose diagram is invalid, naming the page', () => {
      const result = validatePages([
        page({ name: 'Flows', diagram: { nodes: [diagramNode({ width: 0 })], edges: [] } }),
      ]);
      expect(result).toEqual({ ok: false, reason: expect.stringContaining('Flows') });
    });
  });
});

describe('normalizeLayout', () => {
  it('converts a LayoutBox node\'s legacy gap/padding (Tailwind units) into gapPx/paddingPx and deletes the legacy keys', () => {
    const legacy = JSON.stringify({
      ROOT: { type: { resolvedName: 'LayoutBox' }, props: { gap: 2, padding: 4 }, nodes: [] },
    });

    const normalized = JSON.parse(normalizeLayout(legacy));

    // gap: 2 Tailwind units * 4 = 8px (already on-scale); padding: 4 * 4 = 16px.
    expect(normalized.ROOT.props).toEqual({ gapPx: 8, paddingPx: 16 });
  });

  it('rounds an off-scale legacy value to the nearest 8px step, same as snapToSpacing', () => {
    const legacy = JSON.stringify({
      ROOT: { type: { resolvedName: 'LayoutBox' }, props: { gap: 3 }, nodes: [] },
    });

    // 3 units * 4 = 12px, snaps up to 16 (ties round up).
    expect(JSON.parse(normalizeLayout(legacy)).ROOT.props.gapPx).toBe(16);
  });

  it('leaves gapPx/paddingPx already present untouched and still strips the legacy keys', () => {
    const mixed = JSON.stringify({
      ROOT: { type: { resolvedName: 'LayoutBox' }, props: { gapPx: 32, gap: 1, paddingPx: 0, padding: 6 }, nodes: [] },
    });

    expect(JSON.parse(normalizeLayout(mixed)).ROOT.props).toEqual({ gapPx: 32, paddingPx: 0 });
  });

  it('is a no-op for a layout already fully on the px scale', () => {
    const modern = JSON.stringify({
      ROOT: { type: { resolvedName: 'LayoutBox' }, props: { gapPx: 8, paddingPx: 8 }, nodes: [] },
    });

    expect(JSON.parse(normalizeLayout(modern))).toEqual(JSON.parse(modern));
  });

  it('normalizes every LayoutBox node in the tree independently, by plain string or resolvedName type', () => {
    const tree = JSON.stringify({
      ROOT: { type: 'LayoutBox', props: { gap: 0, padding: 2 }, nodes: ['child'] },
      child: { type: { resolvedName: 'LayoutBox' }, props: { gap: 4 }, nodes: [] },
    });

    const normalized = JSON.parse(normalizeLayout(tree));
    expect(normalized.ROOT.props).toEqual({ gapPx: 0, paddingPx: 8 });
    expect(normalized.child.props).toEqual({ gapPx: 16 });
  });

  it('does not touch gap/padding-shaped props on a non-LayoutBox node', () => {
    const tree = JSON.stringify({
      ROOT: { type: { resolvedName: 'LayoutBox' }, props: {}, nodes: ['child'] },
      child: { type: { resolvedName: 'Button' }, props: { gap: 2, padding: 4 }, nodes: [] },
    });

    expect(JSON.parse(normalizeLayout(tree)).child.props).toEqual({ gap: 2, padding: 4 });
  });

  it('returns the input unchanged when it is not valid JSON, leaving validateLayout to reject it', () => {
    expect(normalizeLayout('{not json')).toBe('{not json');
  });

  it('leaves a node with no props alone', () => {
    const tree = JSON.stringify({ ROOT: { type: { resolvedName: 'LayoutBox' }, nodes: [] } });
    expect(normalizeLayout(tree)).toBe(tree);
  });
});

describe('hasRootNode', () => {
  it('is false for an empty tree, invalid JSON and non-objects', () => {
    expect(hasRootNode('{}')).toBe(false);
    expect(hasRootNode('not json')).toBe(false);
    expect(hasRootNode('[]')).toBe(false);
    expect(hasRootNode('null')).toBe(false);
  });

  it('is true when a ROOT node is present', () => {
    expect(hasRootNode(JSON.stringify({ ROOT: { type: { resolvedName: 'LayoutBox' }, nodes: [] } }))).toBe(true);
  });
});

describe('validateDiagram', () => {
  function diagramNode(overrides: Partial<DiagramInput['nodes'][number]> = {}) {
    return {
      id: 'node000001',
      kind: 'rect' as const,
      x: 0,
      y: 0,
      width: 120,
      height: 60,
      text: '',
      color: 'neutral' as const,
      ...overrides,
    };
  }

  function diagramEdge(overrides: Partial<DiagramInput['edges'][number]> = {}) {
    return {
      id: 'edge0000001',
      source: { nodeId: 'node000001', side: 'right' as const },
      target: { nodeId: 'node000002', side: 'left' as const },
      kind: 'step' as const,
      arrow: 'end' as const,
      ...overrides,
    };
  }

  it('accepts an empty diagram', () => {
    expect(validateDiagram({ nodes: [], edges: [] })).toEqual({ ok: true, diagram: { nodes: [], edges: [] } });
  });

  it('accepts nodes and a connecting edge', () => {
    const input: DiagramInput = {
      nodes: [diagramNode({ id: 'node000001' }), diagramNode({ id: 'node000002' })],
      edges: [diagramEdge()],
    };
    const result = validateDiagram(input);
    expect(result).toEqual({ ok: true, diagram: input });
  });

  it('rejects a duplicate id shared by two nodes', () => {
    const result = validateDiagram({
      nodes: [diagramNode({ id: 'dup0000001' }), diagramNode({ id: 'dup0000001' })],
      edges: [],
    });
    expect(result).toEqual({ ok: false, reason: expect.any(String) });
  });

  it('rejects an id shared between a node and an edge', () => {
    const result = validateDiagram({
      nodes: [diagramNode({ id: 'shared00001' })],
      edges: [diagramEdge({ id: 'shared00001', source: { nodeId: 'shared00001', side: 'right' }, target: { screenId: 'screen00001' } })],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects an unknown node kind', () => {
    const result = validateDiagram({ nodes: [diagramNode({ kind: 'triangle' as never })], edges: [] });
    expect(result).toEqual({ ok: false, reason: expect.any(String) });
  });

  it('rejects an unknown node color', () => {
    const result = validateDiagram({ nodes: [diagramNode({ color: 'chartreuse' as never })], edges: [] });
    expect(result).toEqual({ ok: false, reason: expect.any(String) });
  });

  it('rejects a non-positive width or height', () => {
    expect(validateDiagram({ nodes: [diagramNode({ width: 0 })], edges: [] }).ok).toBe(false);
    expect(validateDiagram({ nodes: [diagramNode({ height: -10 })], edges: [] }).ok).toBe(false);
  });

  it('rejects node text over 500 characters', () => {
    const result = validateDiagram({ nodes: [diagramNode({ text: 'x'.repeat(501) })], edges: [] });
    expect(result.ok).toBe(false);
  });

  it('rejects edge label over 500 characters', () => {
    const input: DiagramInput = {
      nodes: [diagramNode({ id: 'node000001' }), diagramNode({ id: 'node000002' })],
      edges: [diagramEdge({ label: 'x'.repeat(501) })],
    };
    expect(validateDiagram(input).ok).toBe(false);
  });

  it('rejects an edge referencing a node that does not exist', () => {
    const result = validateDiagram({
      nodes: [diagramNode({ id: 'node000001' })],
      edges: [diagramEdge({ target: { nodeId: 'ghost0000001' } })],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects an edge with neither a nodeId nor a screenId', () => {
    const input = {
      nodes: [diagramNode({ id: 'node000001' }), diagramNode({ id: 'node000002' })],
      edges: [diagramEdge({ source: {} })],
    };
    expect(validateDiagram(input).ok).toBe(false);
  });

  it('rejects an edge endpoint with both a nodeId and a screenId', () => {
    const input = {
      nodes: [diagramNode({ id: 'node000001' }), diagramNode({ id: 'node000002' })],
      edges: [diagramEdge({ source: { nodeId: 'node000001', screenId: 'screen00001' } })],
    };
    expect(validateDiagram(input).ok).toBe(false);
  });

  it('rejects an unknown connector kind or arrow', () => {
    const input = (overrides: Partial<DiagramInput['edges'][number]>): DiagramInput => ({
      nodes: [diagramNode({ id: 'node000001' }), diagramNode({ id: 'node000002' })],
      edges: [diagramEdge(overrides)],
    });
    expect(validateDiagram(input({ kind: 'zigzag' as never })).ok).toBe(false);
    expect(validateDiagram(input({ arrow: 'sparkles' as never })).ok).toBe(false);
  });

  it('rejects an unknown side', () => {
    const input: DiagramInput = {
      nodes: [diagramNode({ id: 'node000001' }), diagramNode({ id: 'node000002' })],
      edges: [diagramEdge({ source: { nodeId: 'node000001', side: 'diagonal' as never } })],
    };
    expect(validateDiagram(input).ok).toBe(false);
  });

  it('accepts a screenId endpoint (a connector to a frame)', () => {
    const input: DiagramInput = {
      nodes: [diagramNode({ id: 'node000001' })],
      edges: [diagramEdge({ target: { screenId: 'screen00001', side: 'left' } })],
    };
    expect(validateDiagram(input).ok).toBe(true);
  });
});

describe('validateDiagramReferences', () => {
  function screen(overrides: Partial<Screen> = {}): Screen {
    return {
      id: 'screen00001',
      name: 'Frame 1',
      layout: '{}',
      stageWidth: 375,
      pageId: 'page000001',
      ...overrides,
    };
  }

  function page(overrides: Partial<Page> = {}): Page {
    return { id: 'page000001', name: 'Page 1', ...overrides };
  }

  it('passes when there is no diagram at all', () => {
    expect(validateDiagramReferences([page()], [screen()])).toEqual({ ok: true });
  });

  it('passes when a diagram edge targets a screen on the same page', () => {
    const withDiagram = page({
      diagram: {
        nodes: [],
        edges: [
          {
            id: 'edge0000001',
            source: { screenId: 'screen00001' },
            target: { screenId: 'screen00002' },
            kind: 'step',
            arrow: 'end',
          },
        ],
      },
    });
    const screens = [screen({ id: 'screen00001' }), screen({ id: 'screen00002' })];
    expect(validateDiagramReferences([withDiagram], screens)).toEqual({ ok: true });
  });

  it('rejects a diagram edge that targets a screen belonging to a different page', () => {
    const withDiagram = page({
      id: 'page000001',
      diagram: {
        nodes: [],
        edges: [
          {
            id: 'edge0000001',
            source: { screenId: 'screen00001' },
            target: { screenId: 'screen00002' },
            kind: 'step',
            arrow: 'end',
          },
        ],
      },
    });
    const otherPage = page({ id: 'page000002', name: 'Page 2' });
    const screens = [
      screen({ id: 'screen00001', pageId: 'page000001' }),
      screen({ id: 'screen00002', pageId: 'page000002' }),
    ];
    const result = validateDiagramReferences([withDiagram, otherPage], screens);
    expect(result).toEqual({ ok: false, reason: expect.any(String) });
  });

  it('rejects a diagram edge that targets a screen that does not exist at all', () => {
    const withDiagram = page({
      diagram: {
        nodes: [],
        edges: [
          {
            id: 'edge0000001',
            source: { screenId: 'screen00001' },
            target: { screenId: 'ghost0000001' },
            kind: 'step',
            arrow: 'end',
          },
        ],
      },
    });
    const result = validateDiagramReferences([withDiagram], [screen({ id: 'screen00001' })]);
    expect(result.ok).toBe(false);
  });
});

describe('dropDanglingDiagramEdges', () => {
  function screen(overrides: Partial<Screen> = {}): Screen {
    return {
      id: 'screen00001',
      name: 'Frame 1',
      layout: '{}',
      stageWidth: 375,
      pageId: 'page000001',
      ...overrides,
    };
  }

  function page(overrides: Partial<Page> = {}): Page {
    return { id: 'page000001', name: 'Page 1', ...overrides };
  }

  function danglingEdge() {
    return {
      id: 'edge0000001',
      source: { screenId: 'screen00001' },
      target: { screenId: 'ghost0000001' },
      kind: 'step' as const,
      arrow: 'end' as const,
    };
  }

  it('is a no-op (same page objects) when nothing is dangling, including when there is no diagram at all', () => {
    const pages = [page()];
    const screens = [screen()];
    expect(dropDanglingDiagramEdges(pages, screens)).toEqual(pages);
    expect(dropDanglingDiagramEdges(pages, screens)[0]).toBe(pages[0]);
  });

  it('drops an edge referencing a screen that does not exist at all, keeping the rest of the page', () => {
    const withDiagram = page({ diagram: { nodes: [], edges: [danglingEdge()] } });
    const result = dropDanglingDiagramEdges([withDiagram], [screen({ id: 'screen00001' })]);
    expect(result[0].diagram?.edges).toEqual([]);
    // The page object itself is otherwise untouched.
    expect(result[0]).toMatchObject({ id: withDiagram.id, name: withDiagram.name });
  });

  it('drops an edge referencing a screen that belongs to a different page', () => {
    const withDiagram = page({
      diagram: {
        nodes: [],
        edges: [
          {
            id: 'edge0000001',
            source: { screenId: 'screen00001' },
            target: { screenId: 'screen00002' },
            kind: 'step' as const,
            arrow: 'end' as const,
          },
        ],
      },
    });
    const otherPage = page({ id: 'page000002', name: 'v2' });
    const screens = [
      screen({ id: 'screen00001', pageId: 'page000001' }),
      screen({ id: 'screen00002', pageId: 'page000002' }),
    ];
    const result = dropDanglingDiagramEdges([withDiagram, otherPage], screens);
    expect(result[0].diagram?.edges).toEqual([]);
  });

  it('keeps an edge whose screenId endpoints all belong to the same page', () => {
    const edge = {
      id: 'edge0000001',
      source: { screenId: 'screen00001' },
      target: { screenId: 'screen00002' },
      kind: 'step' as const,
      arrow: 'end' as const,
    };
    const withDiagram = page({ diagram: { nodes: [], edges: [edge] } });
    const screens = [screen({ id: 'screen00001' }), screen({ id: 'screen00002' })];
    const result = dropDanglingDiagramEdges([withDiagram], screens);
    expect(result[0].diagram?.edges).toEqual([edge]);
  });

  it('never touches a page with no diagram', () => {
    const plain = page();
    const result = dropDanglingDiagramEdges([plain], [screen()]);
    expect(result[0]).toBe(plain);
  });
});
