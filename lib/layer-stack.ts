import { ZONE_TYPES } from '@/components/blocks/registry';

// Spec: docs/superpowers/specs/2026-09-12-layer-stack-menu-design.md #2.
// How long a press on a layer must be held before the layer stack menu opens.
export const HOLD_MS = 350;

// How far the pointer may drift from the press point before the hold is
// cancelled and the gesture reverts to a normal press (click or drag).
export const MOVE_TOLERANCE_PX = 4;

/**
 * A Craft.js node projected down to only the fields `stackUnder` needs. Kept
 * separate from `@craftjs/core`'s own `Node` type (which nests these under
 * `.data`) so this module never has to import Craft or render inside a live
 * Editor: callers (the `useLayerStack` hook) flatten `query.getState().nodes`
 * into this shape.
 */
export interface LayerStackNode {
  id: string;
  dom: Element | null;
  parent: string | null;
  name: string;
  displayName: string;
}

export interface LayerStackEntry {
  id: string;
  name: string;
  displayName: string;
}

// Ancestor count: 0 for the root (whose `parent` is null), 1 for its direct
// children, and so on. Guards against a malformed/cyclic `parent` chain by
// bailing out the first time an id is revisited instead of looping forever.
function depthOf(nodes: Record<string, LayerStackNode>, id: string): number {
  let depth = 0;
  let currentId = id;
  const seen = new Set<string>();
  while (!seen.has(currentId)) {
    seen.add(currentId);
    const parent = nodes[currentId]?.parent;
    if (!parent) return depth;
    depth++;
    currentId = parent;
  }
  return depth;
}

/**
 * Every node whose DOM contains `target`, deepest first, with zone nodes
 * (`ZONE_TYPES`, e.g. CardContent/DialogContent) skipped and the root
 * (`parent: null`) last. Pure and computed from Craft state rather than DOM
 * geometry, so it is unit-tested without rendering inside an Editor and
 * without relying on `getBoundingClientRect` (zero in jsdom).
 */
export function stackUnder(
  nodes: Record<string, LayerStackNode>,
  target: Node | null,
): LayerStackEntry[] {
  if (!target) return [];
  const matches = Object.values(nodes).filter(
    (node) => node.dom !== null && !ZONE_TYPES.has(node.name) && node.dom.contains(target),
  );
  matches.sort((a, b) => depthOf(nodes, b.id) - depthOf(nodes, a.id));
  return matches.map(({ id, name, displayName }) => ({ id, name, displayName }));
}
