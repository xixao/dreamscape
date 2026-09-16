import type { SerializedNodes } from '@craftjs/core';
import { nanoid } from 'nanoid';

export function selectionRoots(nodes: SerializedNodes, selected: string[]) {
  return selected.filter(id => nodes[id] && !selected.some(other => {
    let parent = nodes[id].parent;
    while (parent) { if (parent === other) return true; parent = nodes[parent]?.parent; }
    return false;
  }));
}
export function duplicateSelection(nodes: SerializedNodes, selected: string[]) {
  const next = structuredClone(nodes);
  const copies: string[] = [];
  const clone = (id: string, parent: string): string => {
    const copy = nanoid();
    next[copy] = { ...structuredClone(nodes[id]), parent, nodes: [], linkedNodes: {} };
    next[copy].nodes = nodes[id].nodes.map(child => clone(child, copy));
    next[copy].linkedNodes = Object.fromEntries(Object.entries(nodes[id].linkedNodes).map(([slot, child]) => [slot, clone(child, copy)]));
    return copy;
  };
  for (const id of selectionRoots(nodes, selected)) {
    const parent = nodes[id].parent;
    if (!parent || !nodes[parent].nodes.includes(id)) continue;
    const copy = clone(id, parent);
    next[parent].nodes.splice(next[parent].nodes.indexOf(id) + 1, 0, copy);
    copies.push(copy);
  }
  return { nodes: next, selected: copies };
}
export function reorderSelection(nodes: SerializedNodes, selected: string[], delta: number) {
  const roots = selectionRoots(nodes, selected);
  const parent = nodes[roots[0]]?.parent;
  if (!parent || !roots.length || roots.some(id => nodes[id].parent !== parent || !nodes[parent].nodes.includes(id))) return null;
  const siblings = [...nodes[parent].nodes];
  const indices = roots.map(id => siblings.indexOf(id)).sort((a, b) => a - b);
  if ((delta < 0 && indices[0] === 0) || (delta > 0 && indices.at(-1) === siblings.length - 1)) return null;
  for (const index of delta < 0 ? indices : indices.reverse()) {
    [siblings[index], siblings[index + delta]] = [siblings[index + delta], siblings[index]];
  }
  const next = structuredClone(nodes);
  next[parent].nodes = siblings;
  return next;
}
