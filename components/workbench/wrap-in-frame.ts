import type { SerializedNodes } from '@craftjs/core';
import { LAYOUT_BOX_DEFAULTS } from '@/lib/classes';
import { SIZE_DEFAULTS, APPEARANCE_DEFAULTS } from '@/components/blocks/design-controls';

/** Wrap selected movable nodes, preserving document order and all node data. */
export function wrapInFrame(nodes: SerializedNodes, selected: string[], frameId: string, direction: 'row' | 'column'): SerializedNodes | null {
  if (!selected.length || selected.includes('ROOT') || nodes[frameId]) return null;
  const ancestors = (id: string) => { const result: string[] = []; let parent = nodes[id]?.parent; while (parent && nodes[parent] && !result.includes(parent)) { result.push(parent); parent = nodes[parent].parent; } return result; };
  const roots = selected.filter(id => nodes[id] && !ancestors(id).some(parent => selected.includes(parent)));
  if (!roots.length || roots.some(id => !nodes[nodes[id].parent!]?.nodes.includes(id))) return null;
  const parent = ancestors(roots[0]).find(id => nodes[id].isCanvas && roots.every(child => ancestors(child).includes(id)));
  if (!parent) return null;
  const order: string[] = [];
  const visit = (id: string) => { order.push(id); for (const child of [...nodes[id].nodes, ...Object.values(nodes[id].linkedNodes)]) visit(child); };
  visit('ROOT'); roots.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const branches = roots.map(id => { let branch = id; while (nodes[branch].parent !== parent) branch = nodes[branch].parent!; return branch; });
  const insertion = Math.min(...branches.map(id => nodes[parent].nodes.indexOf(id)).filter(index => index >= 0));
  if (!Number.isFinite(insertion)) return null;
  const next = JSON.parse(JSON.stringify(nodes)) as SerializedNodes;
  for (const id of roots) {
    const oldParent = next[id].parent!;
    next[oldParent].nodes = next[oldParent].nodes.filter(child => child !== id);
    next[id].parent = frameId;
  }
  next[frameId] = { type: { resolvedName: 'LayoutBox' }, isCanvas: true, props: { ...LAYOUT_BOX_DEFAULTS, ...SIZE_DEFAULTS, ...APPEARANCE_DEFAULTS, direction: { mobile: direction } }, displayName: 'Frame', custom: {}, parent, nodes: roots, linkedNodes: {}, hidden: false };
  next[parent].nodes.splice(insertion, 0, frameId);
  return next;
}
