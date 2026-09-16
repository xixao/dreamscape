import { expect, it } from 'vitest';
import { emptyLayoutJson } from '@/components/blocks/known-types';
import type { SerializedNodes } from '@craftjs/core';
import { copyElements, pasteElements, readElements } from './element-clipboard';

it('preserves descendants and linked slots, remaps IDs, and rejects malformed clipboard graphs', () => {
  const nodes = JSON.parse(emptyLayoutJson()) as SerializedNodes;
  nodes.ROOT.nodes = ['card'];
  nodes.card = { ...structuredClone(nodes.ROOT), parent: 'ROOT', type: { resolvedName: 'Card' }, nodes: [], linkedNodes: { content: 'slot' } };
  nodes.slot = { ...structuredClone(nodes.ROOT), parent: 'card', nodes: ['child'], linkedNodes: {}, type: { resolvedName: 'CardContent' } };
  nodes.child = { ...structuredClone(nodes.ROOT), parent: 'slot', nodes: [], linkedNodes: {}, type: { resolvedName: 'Button' }, props: { label: 'Preserve me' } };
  const copied = readElements(copyElements(nodes, ['child', 'card']))!;
  expect(copied.roots).toEqual(['card']);
  const pasted = pasteElements(nodes, copied, ['ROOT'])!;
  const card = pasted.nodes[pasted.selected[0]];
  const slot = pasted.nodes[card.linkedNodes.content];
  expect(slot.parent).toBe(pasted.selected[0]);
  expect(pasted.nodes[slot.nodes[0]].props.label).toBe('Preserve me');
  expect(slot.nodes[0]).not.toBe('child');
  copied.nodes.child.nodes = ['card'];
  expect(readElements(JSON.stringify(copied))).toBeNull();
  expect(readElements('ordinary clipboard text')).toBeNull();
});
