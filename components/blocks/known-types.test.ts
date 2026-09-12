import { describe, expect, it } from 'vitest';
import { ROOT_LAYOUT_PROPS } from '@/lib/classes';
import { emptyLayoutJson, KNOWN_TYPES } from './known-types';
import { resolver } from './registry';

describe('KNOWN_TYPES', () => {
  it('matches the block resolver exactly, so this server-safe copy cannot silently drift from registry.tsx', () => {
    expect([...KNOWN_TYPES].sort()).toEqual(Object.keys(resolver).sort());
  });
});

describe('emptyLayoutJson', () => {
  it('is a single root LayoutBox with the root defaults', () => {
    const tree = JSON.parse(emptyLayoutJson()) as {
      ROOT: { type: unknown; isCanvas: boolean; nodes: unknown[]; parent: unknown; props: unknown };
    };

    expect(Object.keys(tree)).toEqual(['ROOT']);
    expect(tree.ROOT.type).toEqual({ resolvedName: 'LayoutBox' });
    expect(tree.ROOT.isCanvas).toBe(true);
    expect(tree.ROOT.nodes).toEqual([]);
    expect(tree.ROOT.parent).toBeNull();
    expect(tree.ROOT.props).toEqual(ROOT_LAYOUT_PROPS);
  });
});
