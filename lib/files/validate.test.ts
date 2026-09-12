import { describe, expect, it } from 'vitest';
import { canonicalLayout, validateLayout, validateScreens, type ScreenInput } from './validate';

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

  it('accepts one valid screen and normalizes it, defaulting stageHeight/deviceName to null', () => {
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
    expect(low.screens[0].stageWidth).toBe(320);
    expect(high.screens[0].stageWidth).toBe(1920);
  });
});
