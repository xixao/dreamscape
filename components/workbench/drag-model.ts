import type { SerializedNodes } from '@craftjs/core';
import { selectionRoots } from './selection-shortcuts';
/** Order bundles by the tree, never by the order they were clicked. */
export function movableRoots(nodes: SerializedNodes, selected: string[]) {
    const wanted = new Set(selectionRoots(nodes, selected));
    const result: string[] = [];
    const visit = (id: string) => {
        const node = nodes[id];
        if (!node)
            return;
        if (wanted.has(id) && node.parent && nodes[node.parent]?.nodes.includes(id))
            result.push(id);
        else
            [...node.nodes, ...Object.values(node.linkedNodes)].forEach(visit);
    };
    visit('ROOT');
    return result;
}
export function canMoveInto(nodes: SerializedNodes, ids: string[], parent: string) {
    if (!nodes[parent]?.isCanvas || !ids.length)
        return false;
    let cursor: string | null | undefined = parent;
    while (cursor) {
        if (ids.includes(cursor))
            return false;
        cursor = nodes[cursor]?.parent;
    }
    return true;
}
export function transferElements(source: SerializedNodes, target: SerializedNodes, ids: string[], parent: string, index: number) {
    const roots = movableRoots(source, ids);
    if (!roots.length || !target[parent]?.isCanvas)
        return null;
    const from = structuredClone(source), to = structuredClone(target);
    const moved: string[] = [];
    const collect = (id: string) => { moved.push(id); [...source[id].nodes, ...Object.values(source[id].linkedNodes)].forEach(collect); };
    roots.forEach(collect);
    // Keeping IDs preserves prototype links and anchored notes. A collision is
    // rejected rather than silently changing another component's identity.
    if (moved.some(id => to[id]))
        return null;
    for (const id of moved) {
        to[id] = from[id];
        delete from[id];
    }
    for (const id of roots) {
        from[source[id].parent!].nodes = from[source[id].parent!].nodes.filter(child => child !== id);
        to[id].parent = parent;
    }
    to[parent].nodes.splice(Math.max(0, Math.min(index, to[parent].nodes.length)), 0, ...roots);
    return { source: from, target: to, selected: roots };
}
export type Box = {
    left: number;
    top: number;
    width: number;
    height: number;
};
/** Midpoint targeting gives even tiny gaps a generous hit area. */
export function insertionAt(boxes: Box[], x: number, y: number, direction: 'row' | 'column' | 'grid') {
    const index = boxes.findIndex(box => direction === 'row' ? x < box.left + box.width / 2 : direction === 'column' ? y < box.top + box.height / 2 : y < box.top || (y <= box.top + box.height && x < box.left + box.width / 2));
    return index < 0 ? boxes.length : index;
}
