import { describe, expect, it } from 'vitest';
import { ROOT_LAYOUT_PROPS } from '@/lib/classes';
import { emptyLayoutJson, schemaFor } from './registry';

describe('emptyLayoutJson', () => {
  it('is a single root LayoutBox with the root defaults', () => {
    const tree = JSON.parse(emptyLayoutJson());
    expect(Object.keys(tree)).toEqual(['ROOT']);
    expect(tree.ROOT.type).toEqual({ resolvedName: 'LayoutBox' });
    expect(tree.ROOT.isCanvas).toBe(true);
    expect(tree.ROOT.nodes).toEqual([]);
    expect(tree.ROOT.parent).toBeNull();
    expect(tree.ROOT.props).toEqual(ROOT_LAYOUT_PROPS);
  });
});

describe('schemaFor', () => {
  it('returns the LayoutBox schema and null for unknown types', () => {
    expect(schemaFor('LayoutBox')?.type).toBe('LayoutBox');
    expect(schemaFor('Nope')).toBeNull();
  });
});
