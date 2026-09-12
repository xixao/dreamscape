import { describe, expect, it } from 'vitest';
import { canonicalLayout, validateLayout } from './validate';

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
