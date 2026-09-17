import { expect, it } from 'vitest';
import type { SerializedNodes } from '@craftjs/core';
import { emptyLayoutJson } from '@/components/blocks/known-types';
import { transferElements, movableRoots, canMoveInto, insertionAt } from './drag-model';
function tree() {
    const n = JSON.parse(emptyLayoutJson()) as SerializedNodes;
    n.ROOT.nodes = ['card', 'other'];
    n.card = { ...structuredClone(n.ROOT), parent: 'ROOT', nodes: [], linkedNodes: { content: 'slot' }, type: { resolvedName: 'Card' } };
    n.slot = { ...structuredClone(n.ROOT), parent: 'card', nodes: ['text'], type: { resolvedName: 'CardContent' } };
    n.text = { ...structuredClone(n.ROOT), parent: 'slot', nodes: [], isCanvas: false, props: { text: 'Keep me' } };
    n.other = { ...structuredClone(n.ROOT), parent: 'ROOT', nodes: [] };
    return n;
}
it('transfers linked content and descendants atomically without changing props or IDs', () => {
    const a = tree(), b = JSON.parse(emptyLayoutJson());
    const before = JSON.stringify(a);
    const result = transferElements(a, b, ['text', 'card'], 'ROOT', 0)!;
    expect(result.source.ROOT.nodes).toEqual(['other']);
    expect(result.source.text).toBeUndefined();
    expect(result.target.ROOT.nodes).toEqual(['card']);
    expect(result.target.text.props.text).toBe('Keep me');
    expect(result.target.slot.parent).toBe('card');
    expect(JSON.stringify(a)).toBe(before);
});
it('rejects linked-slot movement, cycles, missing targets, and ID collisions', () => {
    const a = tree();
    expect(movableRoots(a, ['slot'])).toEqual([]);
    expect(canMoveInto(a, ['card'], 'slot')).toBe(false);
    expect(transferElements(a, a, ['card'], 'ROOT', 0)).toBeNull();
    expect(transferElements(a, {}, ['card'], 'missing', 0)).toBeNull();
});
it('orders bundles by tree order and targets tiny gaps by midpoint', () => {
    expect(movableRoots(tree(), ['other', 'card', 'text'])).toEqual(['card', 'other']);
    expect(insertionAt([{ left: 0, top: 0, width: 100, height: 50 }, { left: 102, top: 0, width: 100, height: 50 }], 95, 25, 'row')).toBe(1);
});
