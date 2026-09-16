import type { SerializedNodes } from '@craftjs/core';
import { nanoid } from 'nanoid';
import { KNOWN_TYPES } from '@/components/blocks/known-types';
import { detachInstance, isComponentLayout, type Tree } from '@/lib/custom-components/model';
import { selectionRoots } from './selection-shortcuts';

export const ELEMENT_CLIPBOARD_TYPE = 'application/x-dreamscape-elements';
type ClipboardElements = { kind: 'dreamscape-elements'; version: 1; roots: string[]; nodes: SerializedNodes };
export function copyElements(nodes: SerializedNodes, ids: string[]): string {
  const selected = new Set(selectionRoots(nodes, ids));
  const roots: string[] = [], copied: SerializedNodes = {};
  const copy = (id: string) => {
    copied[id] = structuredClone(nodes[id]);
    [...nodes[id].nodes, ...Object.values(nodes[id].linkedNodes)].forEach(copy);
  };
  const visit = (id: string) => {
    if (selected.has(id)) { roots.push(id); copy(id); }
    else [...nodes[id].nodes, ...Object.values(nodes[id].linkedNodes)].forEach(visit);
  };
  visit('ROOT');
  return JSON.stringify({ kind: 'dreamscape-elements', version: 1, roots, nodes: copied });
}
export function readElements(raw: string): ClipboardElements | null {
  if (raw.length > 20_000_000) return null;
  try {
    const data = JSON.parse(raw) as ClipboardElements;
    if (data.kind !== 'dreamscape-elements' || data.version !== 1 || !Array.isArray(data.roots) || !data.roots.length || !data.nodes || typeof data.nodes !== 'object') return null;
    const visited = new Set<string>();
    const visit = (id: string, parent?: string): boolean => {
      if (typeof id !== 'string' || !Object.hasOwn(data.nodes, id) || visited.has(id)) return false;
      const n = data.nodes[id];
      if (!n || typeof n.type !== 'object' || !KNOWN_TYPES.has(n.type.resolvedName) || !Array.isArray(n.nodes) || !n.linkedNodes || typeof n.linkedNodes !== 'object' || !n.props || typeof n.props !== 'object' || (parent && n.parent !== parent)) return false;
      if (n.type.resolvedName === 'CustomComponent' && !isComponentLayout(n.props.layout)) return false;
      visited.add(id);
      return [...n.nodes, ...Object.values(n.linkedNodes)].every(child => visit(child, id));
    };
    return data.roots.every(id => visit(id)) && visited.size === Object.keys(data.nodes).length ? data : null;
  } catch { return null; }
}
export function pasteElements(nodes: SerializedNodes, data: ClipboardElements, selected: string[], builder = false) {
  const target = selected[0] ?? 'ROOT';
  const node = nodes[target];
  if (!node) return null;
  const zone = node.linkedNodes.content;
  const parent = zone && nodes[zone]?.isCanvas ? zone : node.isCanvas ? target : node.parent;
  if (!parent || !nodes[parent]?.isCanvas) return null;
  const next = structuredClone(nodes);
  const source = structuredClone(data.nodes);
  if (builder) for (const [id, n] of Object.entries(source)) {
    if (typeof n.type === 'object' && n.type.resolvedName === 'CustomComponent') detachInstance(source as Tree, id);
  }
  const ids = Object.fromEntries(Object.keys(source).map(id => [id, nanoid()]));
  for (const [id, n] of Object.entries(source)) next[ids[id]] = {
    ...n, parent: data.roots.includes(id) ? parent : ids[n.parent!],
    nodes: n.nodes.map(child => ids[child]),
    linkedNodes: Object.fromEntries(Object.entries(n.linkedNodes).map(([slot, child]) => [slot, ids[child]])),
  };
  const inserted = data.roots.map(id => ids[id]);
  const index = parent === node.parent ? next[parent].nodes.indexOf(target) + 1 : next[parent].nodes.length;
  next[parent].nodes.splice(index, 0, ...inserted);
  return { nodes: next, selected: inserted };
}
