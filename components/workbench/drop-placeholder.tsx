'use client';
import { layerLabel } from '@/lib/layer-label';
import { useEditor, type Indicator } from '@craftjs/core';
import { useEffect, useRef, useState } from 'react';
import { cloneDragPreview } from './drag-preview';
import { useCanvasDocument } from './canvas-frame';
import { dragSurfaces, DRAG_MOVE_TO, DRAG_TARGET, DRAG_POINTER, DRAG_PANNED, type DragSurface } from './drag-surfaces';
import { canMoveInto, insertionAt, movableRoots } from './drag-model';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
export function containerDirection(style: Pick<CSSStyleDeclaration, 'display' | 'flexDirection'>): 'grid' | 'column' | 'row' {
    return style.display.includes('grid') ? 'grid' : style.flexDirection?.startsWith('column') ? 'column' : 'row';
}
type Options = {
    enabled?: boolean;
    screenId?: string;
    name?: string;
    transfer?: (target: string, ids: string[], parent: string, index: number) => void;
};
type Destination = {
    surface: DragSurface;
    parent: string;
    index: number;
};
const label = (surface: DragSurface, id: string) => {
    const n = surface.nodes()[id];
    return n ? layerLabel(n.data) : 'Frame';
};
function outerRect(element: HTMLElement) {
    const r = element.getBoundingClientRect();
    const frame = element.ownerDocument.defaultView?.frameElement as HTMLElement | null;
    if (!frame)
        return r;
    const f = frame.getBoundingClientRect(), scale = f.width / (frame.offsetWidth || f.width || 1);
    return { left: f.left + r.left * scale, top: f.top + r.top * scale, width: r.width * scale, height: r.height * scale };
}
/** Overlay-only previews: no placeholder nodes, hidden originals or layout writes. */
export function useDropPlaceholder(options: Options = {}) {
    const { actions, query, store } = useEditor();
    const canvas = useCanvasDocument();
    const latest = useRef(options);
    useEffect(() => { latest.current = options; });
    const [moveOpen, setMoveOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [message, setMessage] = useState('');
    const commitRef = useRef<(dest: Destination, ids: string[]) => void>(() => { });
    const sourceId = options.screenId ?? 'component-builder';
    useEffect(() => {
        if (options.enabled === false)
            return;
        const source: DragSurface = { id: sourceId, name: latest.current.name ?? 'Component', document: canvas?.document ?? document, nodes: () => query.getState().nodes, serialized: () => query.getSerializedNodes() };
        dragSurfaces.set(sourceId, source);
        const overlay = document.createElement('div');
        overlay.setAttribute('data-drop-placeholder', '');
        Object.assign(overlay.style, { position: 'fixed', pointerEvents: 'none', zIndex: '10000', border: '2px solid var(--acc)', borderRadius: '3px', display: 'none' });
        const caption = document.createElement('div');
        Object.assign(caption.style, { position: 'absolute', bottom: '100%', left: '0', padding: '5px 8px', background: 'var(--card)', color: 'var(--foreground)', font: '12px system-ui', whiteSpace: 'nowrap', maxWidth: 'min(560px, calc(100vw - 32px))', overflow: 'hidden', textOverflow: 'ellipsis', borderRadius: '5px', marginBottom: '6px' });
        overlay.append(caption);
        document.body.append(overlay);
        const parentOutline = document.createElement('div');
        Object.assign(parentOutline.style, { position: 'fixed', pointerEvents: 'none', zIndex: '9998', border: '1px solid color-mix(in srgb, var(--acc) 50%, transparent)', display: 'none' });
        document.body.append(parentOutline);
        const footprint = document.createElement('div');
        footprint.setAttribute('data-drop-footprint', '');
        Object.assign(footprint.style, { position: 'fixed', pointerEvents: 'none', zIndex: '9999', border: '1px dashed var(--acc)', background: 'color-mix(in srgb, var(--acc) 8%, transparent)', display: 'none' });
        document.body.append(footprint);
        let ids: string[] = [], destination: Destination | null = null, ended = false;
        let hovered = '', hoverSince = 0, ancestorOffset = 0, lastPoint = { x: 0, y: 0 }, candidateKey = '', candidateSince = 0;
        let lastOver: {
            surface: DragSurface;
            x: number;
            y: number;
            target: Element | null;
        } | null = null;
        // Set this to 'legacy' and refresh for an immediate visual rollback.
        let fluidDrag = true;
        try { fluidDrag = window.localStorage.getItem('dreamscape:drag-preview') !== 'legacy'; } catch { /* Storage may be unavailable in private sessions. */ }
        const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (fluidDrag && !reducedMotion) {
            for (const el of [footprint]) el.style.transition = 'left 100ms ease-out, top 100ms ease-out, width 100ms ease-out, height 100ms ease-out';
        }
        let ghost: HTMLElement | null = null;
        let fadedPanels: HTMLElement[] = [];
        let panelFadeFrame = 0;
        let sourceStyles: {el:HTMLElement; opacity:string; outline:string}[] = [];
        let dimTimer: ReturnType<typeof setTimeout> | null = null;
        const animations = new Set<Animation>();
        const hide = (complete = false) => { parentOutline.style.display = 'none'; overlay.style.display = 'none'; footprint.style.display = 'none'; queueMicrotask(() => window.dispatchEvent(new CustomEvent(DRAG_TARGET, { detail: complete ? { complete: true } : null }))); };
        const finish = (complete: boolean | Event = false) => { cancelAnimationFrame(panelFadeFrame); for (const panel of fadedPanels) panel.removeAttribute('data-drag-obscured'); fadedPanels = []; window.dispatchEvent(new CustomEvent(DRAG_POINTER, { detail: null })); if (ids.length)
            store.actions.setNodeEvent('dragged', []); ids = []; destination = null; ended = true; hide(complete === true); ghost?.remove(); ghost = null; if(dimTimer)clearTimeout(dimTimer); for(const saved of sourceStyles){saved.el.style.opacity=saved.opacity;saved.el.style.outline=saved.outline;} sourceStyles=[]; };
        function allowed(surface: DragSurface, parent: string) {
            if (surface.id !== sourceId)
                return !!latest.current.transfer && !!surface.nodes()[parent]?.data.isCanvas && (surface.accept?.(parent, ids.map(id => source.nodes()[id])) ?? true);
            if (!canMoveInto(query.getSerializedNodes(), ids, parent))
                return false;
            try {
                return query.node(parent).isDroppable(ids);
            }
            catch {
                return false;
            }
        }
        function show(dest: Destination, inside = false) {
            const nodes = dest.surface.nodes(), parent = nodes[dest.parent]?.dom;
            if (!parent)
                return;
            const pr = outerRect(parent), children = nodes[dest.parent].data.nodes.map(id => nodes[id]?.dom).filter((el): el is HTMLElement => !!el);
            Object.assign(parentOutline.style, { display: 'block', left: `${pr.left}px`, top: `${pr.top}px`, width: `${pr.width}px`, height: `${pr.height}px` });
            const direction = containerDirection(parent.ownerDocument.defaultView!.getComputedStyle(parent));
            const adjacent = children[dest.index] ?? children.at(-1);
            const r = adjacent ? outerRect(adjacent) : pr;
            const atEnd = dest.index >= children.length;
            Object.assign(overlay.style, { display: 'block', left: `${inside ? pr.left : direction === 'row' || direction === 'grid' ? r.left + (atEnd ? r.width : 0) : pr.left}px`, top: `${inside ? pr.top : direction === 'row' || direction === 'grid' ? r.top : r.top + (atEnd ? r.height : 0)}px`, width: `${inside ? pr.width : direction === 'row' || direction === 'grid' ? 2 : pr.width}px`, height: `${inside ? pr.height : direction === 'row' || direction === 'grid' ? r.height : 2}px` });
            const path: string[] = [];
            let cursor: string | null | undefined = dest.parent;
            while (cursor) {
                path.unshift(label(dest.surface, cursor));
                cursor = nodes[cursor]?.data.parent;
            }
            caption.textContent = `${ids.length > 1 ? `${ids.length} components · ` : ''}${dest.surface.name} › ${path.join(' › ')} · ${inside ? 'Move into container' : `Insert ${atEnd ? 'after' : 'before'} ${label(dest.surface, nodes[dest.parent].data.nodes[atEnd ? children.length - 1 : dest.index] ?? dest.parent)}`} · Alt: parent`;
            caption.style.position = 'fixed';
            caption.style.left = `${Math.max(12, Math.min(pr.left, window.innerWidth - Math.min(560, window.innerWidth - 24) - 12))}px`;
            caption.style.top = `${Math.max(12, Math.min(parseFloat(overlay.style.top) - 34, window.innerHeight - 40))}px`;
            caption.style.bottom = 'auto';
            // Outline is an estimate of the existing fill/percent sizing, never a
            // temporary change to the actual component or receiving frame.
            const first = source.nodes()[ids[0]];
            if (first?.dom) {
                const old = outerRect(first.dom), props = first.data.props;
                const css = parent.ownerDocument.defaultView!.getComputedStyle(parent);
                const scale = pr.width / (parent.getBoundingClientRect().width || 1);
                const available = Math.max(0, pr.width - (parseFloat(css.paddingLeft || '0') + parseFloat(css.paddingRight || '0')) * scale);
                const siblings = nodes[dest.parent].data.nodes.filter(id => dest.surface.id !== sourceId || !ids.includes(id));
                const gap = (parseFloat(css.columnGap) || 0) * scale;
                const fillWidth = direction === 'row' && css.flexWrap !== 'wrap' ? Math.max(1, (available - gap * siblings.length) / (siblings.length + 1)) : available;
                const width = Math.max(1, props.widthMode === 'fill' ? fillWidth : props.widthMode === 'percent' ? available * Number(props.widthPercent ?? 100) / 100 : old.width);
                const insetX = pr.left + (parseFloat(css.paddingLeft) || 0) * scale;
                const insetY = pr.top + (parseFloat(css.paddingTop) || 0) * scale;
                const x = inside || direction === 'column' ? insetX : r.left + (atEnd ? r.width : 0);
                const y = inside ? insetY : direction === 'column' ? r.top + (atEnd ? r.height : 0) : r.top;
                caption.textContent += `${dest.surface.id !== sourceId ? ' · Move to this frame' : ''} · Approx. ${Math.round(width / scale)} × ${Math.round(old.height / scale)}`;
                Object.assign(footprint.style, { display: 'block', left: `${Math.max(insetX, Math.min(x, pr.left + pr.width - Math.min(width, available)))}px`, top: `${Math.max(insetY, Math.min(y, pr.top + pr.height - Math.min(old.height, pr.height)))}px`, width: `${Math.min(width, available)}px`, height: `${Math.min(old.height, pr.height)}px` });
            }
            else
                footprint.style.display = 'none';
            window.dispatchEvent(new CustomEvent(DRAG_TARGET, { detail: { parent: dest.surface.id === sourceId ? dest.parent : null, index: dest.index, inside, active: true } }));
        }
        function commit(dest: Destination, moving: string[]) {
            try {
                if (dest.surface.id !== sourceId) {
                    const incoming = moving.map(id => source.nodes()[id]);
                    if (!incoming.length || incoming.some(n => !n) || dest.surface.accept?.(dest.parent, incoming) === false)
                        throw new Error('Invalid destination');
                    for (const parent of new Set(incoming.map(n => n.data.parent!))) {
                        const node = source.nodes()[parent];
                        if (!node.rules.canMoveOut(incoming.filter(n => n.data.parent === parent), node, query.node))
                            throw new Error('Cannot leave container');
                    }
                    latest.current.transfer?.(dest.surface.id, moving, dest.parent, dest.index);
                    setMessage(`Moved to ${dest.surface.name}. Undo restores both frames.`);
                }
                else {
                    if (!canMoveInto(query.getSerializedNodes(), moving, dest.parent) || !query.node(dest.parent).isDroppable(moving))
                        throw new Error('invalid');
                    const before = new Map(Object.entries(source.nodes()).flatMap(([id, n]) => n.dom ? [[id, { dom: n.dom, rect: outerRect(n.dom) }] as const] : []));
                    const changedParent = moving.some(id => source.nodes()[id].data.parent !== dest.parent);
                    actions.move(moving, dest.parent, dest.index);
                    actions.selectNode(moving);
                    requestAnimationFrame(() => {
                        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
                            return;
                        for (const [id, old] of before) {
                            const el = source.nodes()[id]?.dom;
                            if (!el || el !== old.dom || !el.animate)
                                continue;
                            const r = outerRect(el), scale = el.getBoundingClientRect().width ? r.width / el.getBoundingClientRect().width : 1;
                            const dx = (old.rect.left - r.left) / scale, dy = (old.rect.top - r.top) / scale;
                            if (Math.abs(dx) + Math.abs(dy) < 1)
                                continue;
                            const a = el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'translate(0,0)' }], { duration: 180, easing: 'ease-out' });
                            animations.add(a);
                            a.finished.then(() => animations.delete(a), () => animations.delete(a));
                        }
                    });
                    if (changedParent)
                        setMessage(`Moved to ${label(source, dest.parent)}. ⌘Z / Ctrl+Z to undo.`);
                }
            }
            catch {
                setMessage('That container cannot accept this selection. Nothing moved.');
            }
        }
        commitRef.current = commit;
        function start(event: DragEvent) {
            ended = false;
            const target = event.target as Element | null;
            if (!target?.closest || target.closest('[data-tray-item], input, textarea, [contenteditable=true]'))
                return;
            const layer = target.closest('[data-drag-layer]')?.getAttribute('data-drag-layer');
            const handle = target.closest('[data-drag-handle]')?.getAttribute('data-drag-handle');
            const hit = layer || handle || Object.entries(source.nodes()).filter(([, n]) => n.dom && (n.dom === target || n.dom.contains(target))).sort((a, b) => a[1].dom!.contains(b[1].dom!) ? 1 : -1)[0]?.[0];
            if (!hit)
                return;
            const selected = [...query.getState().events.selected];
            ids = movableRoots(query.getSerializedNodes(), selected.includes(hit) ? selected : [hit]);
            if (!ids.length)
                return;
            event.stopImmediatePropagation();
            ended = false;
            ancestorOffset = 0;
            hovered = '';
            candidateKey = '';
            actions.selectNode(ids);
            store.actions.setNodeEvent('dragged', ids);
            event.dataTransfer?.setData('application/x-dreamscape-layer', ids[0]);
            if (event.dataTransfer)
                event.dataTransfer.effectAllowed = 'move';
            ghost = document.createElement('div');
            ghost.textContent = ids.length > 1 ? `${ids.length} components` : label(source, ids[0]);
            Object.assign(ghost.style, { position: 'fixed', left: '-1000px', padding: '10px 16px', background: 'var(--card)', color: 'var(--foreground)', border: '1px solid var(--acc)', borderRadius: '8px', font: '13px system-ui' });
            document.body.append(ghost);
            const original = source.nodes()[ids[0]]?.dom;
            if (fluidDrag && original) {
                const rect = original.getBoundingClientRect();
                const outer = outerRect(original);
                const scale = rect.width > 0 ? outer.width / rect.width : 1;
                const visual = cloneDragPreview(original);
                Object.assign(visual.style, {position:'relative',left:'0',top:'0',margin:'0',width:`${rect.width}px`,height:`${rect.height}px`,transform:`scale(${scale})`,transformOrigin:'top left'});
                ghost.replaceChildren(visual);
                Object.assign(ghost.style,{left:`${-Math.max(1000, outer.width + 100)}px`,width:`${outer.width}px`,height:`${outer.height}px`,padding:'0',background:'transparent',border:'0',borderRadius:'0',overflow:'visible',boxShadow:'0 12px 32px rgba(0,0,0,.25)'});
                if(ids.length>1){const count=document.createElement('div');count.textContent=`${ids.length} components`;Object.assign(count.style,{position:'absolute',right:'0',top:'-24px',background:'var(--card)',color:'var(--foreground)',padding:'4px 8px',borderRadius:'5px'});ghost.append(count);}
                // Canvas drags retain the grab point. Layers-panel drags use
                // a small inset because the pointer started outside the card.
                const fromCanvas = !layer && !handle;
                const grabX = fromCanvas ? Math.max(0,Math.min(outer.width,(event.clientX-rect.left)*scale)) : 16;
                const grabY = fromCanvas ? Math.max(0,Math.min(outer.height,(event.clientY-rect.top)*scale)) : 16;
                event.dataTransfer?.setDragImage(ghost,grabX,grabY);
                dimTimer=setTimeout(()=>{if(ended)return;sourceStyles=ids.flatMap(id=>{const el=source.nodes()[id]?.dom;if(!el)return [];const saved={el,opacity:el.style.opacity,outline:el.style.outline};el.style.opacity='0.35';el.style.outline='1px dashed var(--acc)';return [saved];});},0);
            } else event.dataTransfer?.setDragImage(ghost, 20, 20);
            if (!layer) {
                fadedPanels = [...document.querySelectorAll<HTMLElement>('aside')];
                // Let the browser finish the native drag snapshot before
                // starting the same opacity transition used when panels return.
                panelFadeFrame = requestAnimationFrame(() => {
                    panelFadeFrame = requestAnimationFrame(() => {
                        if (ended) return;
                        for (const panel of fadedPanels) panel.setAttribute('data-drag-obscured', 'true');
                    });
                });
            }
            window.dispatchEvent(new CustomEvent(DRAG_TARGET, { detail: { active: true } }));
        }
        function resolveTarget(surface: DragSurface, x: number, y: number, target: Element | null) {
            const nodes = surface.nodes();
            const layer = target?.closest('[data-drag-layer]')?.getAttribute('data-drag-layer');
            let hit = layer || Object.entries(nodes).filter(([, n]) => n.dom && (() => { const r = outerRect(n.dom); return x >= r.left - 8 && x <= r.left + r.width + 8 && y >= r.top - 8 && y <= r.top + r.height + 8; })()).sort((a, b) => a[1].dom!.contains(b[1].dom!) ? 1 : -1)[0]?.[0];
            if (!hit)
                return null;
            if (!layer && surface.id === sourceId) {
                const origin = source.nodes()[ids[0]]?.data.parent;
                const originDom = origin ? nodes[origin]?.dom : null;
                if (origin && originDom) {
                    const r = outerRect(originDom);
                    if (x >= r.left - 10 && x <= r.left + r.width + 10 && y >= r.top - 10 && y <= r.top + r.height + 10) {
                        let child = hit;
                        while (nodes[child]?.data.parent && nodes[child].data.parent !== origin)
                            child = nodes[child].data.parent!;
                        if (nodes[child]?.data.parent === origin)
                            hit = child;
                    }
                }
            }
            const key = surface.id + hit;
            if (hovered !== key) {
                hovered = key;
                hoverSince = performance.now();
            }
            const node = nodes[hit], box = node.dom ? outerRect(node.dom) : null;
            const inCenter = !!box && x > box.left + Math.min(24, box.width * .2) && x < box.left + box.width - Math.min(24, box.width * .2) && y > box.top + Math.min(20, box.height * .25) && y < box.top + box.height - Math.min(20, box.height * .25);
            const ownContainer = node.data.isCanvas ? hit : node.data.linkedNodes.content;
            const row = layer ? target?.closest('[data-drag-layer]')?.getBoundingClientRect() : null;
            const center = layer ? !!row && y > row.top + row.height * .25 && y < row.top + row.height * .75 : inCenter;
            const nest = ownContainer && (hit === 'ROOT' || (center && performance.now() - hoverSince > 450));
            let parent = nest ? ownContainer : node.data.parent;
            if (!parent && node.data.isCanvas)
                parent = hit;
            if (!parent)
                return null;
            for (let i = 0; i < ancestorOffset; i++)
                parent = nodes[parent]?.data.parent ?? parent;
            while (parent && !allowed(surface, parent))
                parent = nodes[parent]?.data.parent;
            if (!parent)
                return null;
            const dom = nodes[parent].dom;
            if (!dom)
                return null;
            const children = nodes[parent].data.nodes;
            const direction = containerDirection(dom.ownerDocument.defaultView!.getComputedStyle(dom));
            const boxes = children.map(id => nodes[id]?.dom ? outerRect(nodes[id].dom!) : { left: 0, top: 0, width: 0, height: 0 });
            let index = insertionAt(boxes, x, y, direction);
            if (layer) {
                const i = children.indexOf(hit);
                if (i >= 0) {
                    const row = target!.closest('[data-drag-layer]')!.getBoundingClientRect();
                    index = i + (y > row.top + row.height / 2 ? 1 : 0);
                }
                else
                    index = children.length;
            }
            return { dest: { surface, parent, index }, inside: !!nest && parent === ownContainer };
        }
        function over(event: DragEvent) {
            if (!ids.length || ended)
                return;
            event.preventDefault();
            event.stopImmediatePropagation();
            if (event.dataTransfer)
                event.dataTransfer.dropEffect = 'move';
            const doc = (event.target as Node)?.ownerDocument ?? document;
            const surface = [...dragSurfaces.values()].find(s => s.document === doc) ?? source;
            const frame = doc.defaultView?.frameElement as HTMLElement | null;
            const fr = frame?.getBoundingClientRect(), scale = fr ? fr.width / (frame!.offsetWidth || fr.width || 1) : 1;
            const x = (fr?.left ?? 0) + event.clientX * scale, y = (fr?.top ?? 0) + event.clientY * scale;
            const travel = Math.hypot(x - lastPoint.x, y - lastPoint.y);
            lastOver = { surface, x, y, target: event.target as Element };
            window.dispatchEvent(new CustomEvent(DRAG_POINTER, { detail: { x, y } }));
            lastPoint = { x, y };
            if (doc === document && !(event.target as Element)?.closest?.('[data-drag-layer]') && source.document !== document) {
                destination = null;
                hide();
                return;
            }
            ancestorOffset = event.altKey ? (event.shiftKey ? 2 : 1) : 0;
            const result = resolveTarget(surface, x, y, event.target as Element);
            if (!result) {
                // Retain a valid target only across a small gap in the same surface.
                const parent = destination?.surface.id === surface.id ? surface.nodes()[destination.parent]?.dom : null;
                const r = parent ? outerRect(parent) : null;
                if (destination && r && x >= r.left - 12 && x <= r.left + r.width + 12 && y >= r.top - 12 && y <= r.top + r.height + 12 && allowed(surface, destination.parent)) return;
                destination = null;
                hide();
                return;
            }
            const key = `${surface.id}:${result.dest.parent}:${result.dest.index}`;
            if (key !== candidateKey) {
                candidateKey = key;
                candidateSince = performance.now();
            }
            // Stable target must persist briefly before replacing an existing one.
            if (destination && !result.inside && travel < 12 && performance.now() - candidateSince < 65)
                return;
            destination = result.dest;
            show(destination, result.inside);
        }
        function drop(event: DragEvent) {
            if (!ids.length) {
                ended = true;
                hide();
                return;
            }
            if (ended)
                return;
            event.preventDefault();
            event.stopImmediatePropagation();
            const moving = [...ids], dest = destination;
            finish(!!dest);
            if (dest)
                commit(dest, moving);
        }
        function key(event: KeyboardEvent) {
            if (!ids.length)
                return;
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopImmediatePropagation();
                finish();
            }
            if (event.key === 'Tab' && lastOver) {
                event.preventDefault();
                event.stopImmediatePropagation();
                ancestorOffset += event.shiftKey ? -1 : 1;
                ancestorOffset = Math.max(0, ancestorOffset);
                const r = resolveTarget(lastOver.surface, lastPoint.x, lastPoint.y, lastOver.target);
                if (r) {
                    destination = r.dest;
                    show(r.dest, r.inside);
                }
            }
        }
        const panned = () => {
            if (!ids.length || !lastOver) return;
            const { x, y } = lastOver;
            const hit = document.elementFromPoint(x, y);
            const surface = [...dragSurfaces.values()].find(s => s.document.defaultView?.frameElement === hit);
            if (!surface) { destination = null; hide(); return; }
            const result = resolveTarget(surface, x, y, null);
            destination = result?.dest ?? null;
            if (result) show(result.dest, result.inside); else hide();
        };
        window.addEventListener(DRAG_PANNED, panned);
        window.addEventListener('blur', finish);
        const docs = new Map<Document, () => void>();
        function bind(doc: Document) { if (docs.has(doc))
            return; doc.addEventListener('dragstart', start, true); doc.addEventListener('dragover', over, true); doc.addEventListener('drop', drop, true); doc.addEventListener('dragend', finish, true); doc.addEventListener('keydown', key, true); docs.set(doc, () => { doc.removeEventListener('dragstart', start, true); doc.removeEventListener('dragover', over, true); doc.removeEventListener('drop', drop, true); doc.removeEventListener('dragend', finish, true); doc.removeEventListener('keydown', key, true); }); }
        bind(document);
        bind(source.document);
        const discover = setInterval(() => { for (const surface of dragSurfaces.values())
            bind(surface.document); }, 150);
        // New components still use Craft's creation connector. Its indicator is
        // visualized without inserting anything into the destination's layout.
        const unsubscribe = store.subscribe(s => ({ indicator: s.indicator }), ({ indicator }) => {
            if (ids.length || ended)
                return;
            const value = indicator as Indicator | null;
            if (!value || value.error) {
                hide();
                return;
            }
            const p = value.placement;
            show({ surface: source, parent: p.parent.id, index: p.index + (p.where === 'after' ? 1 : 0) });
        });
        const preview = (event: Event) => {
            const d = (event as CustomEvent).detail;
            if (!d) {
                hide();
                return;
            }
            const surface = dragSurfaces.get(d.screen);
            if (surface)
                show({ surface, parent: d.parent, index: surface.nodes()[d.parent].data.nodes.length }, true);
        };
        window.addEventListener('dreamscape-move-preview', preview);
        const open = () => { setSearch(''); setMoveOpen(true); };
        window.addEventListener(DRAG_MOVE_TO, open);
        return () => { finish(); for (const stop of docs.values())
            stop(); clearInterval(discover); unsubscribe(); window.removeEventListener(DRAG_MOVE_TO, open); window.removeEventListener('dreamscape-move-preview', preview); window.removeEventListener(DRAG_PANNED, panned); window.removeEventListener('blur', finish); overlay.remove(); footprint.remove(); parentOutline.remove(); animations.forEach(a => a.cancel()); if (dragSurfaces.get(sourceId) === source)
            dragSurfaces.delete(sourceId); };
        // Craft returns fresh action/query wrappers on selection updates. Their
        // methods access the same store; resubscribing would end an active drag.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sourceId, canvas?.document, options.enabled]);
    useEffect(() => { if (!message)
        return; const timer = setTimeout(() => setMessage(''), 4000); return () => clearTimeout(timer); }, [message]);
    const selected = movableRoots(query.getSerializedNodes(), [...query.getState().events.selected]);
    const destinations = moveOpen ? [...dragSurfaces.values()].flatMap(surface => Object.entries(surface.nodes()).filter(([id, n]) => n.data.isCanvas && (surface.id === sourceId ? canMoveInto(query.getSerializedNodes(), selected, id) : !!options.transfer)).map(([id]) => ({ surface, parent: id, index: surface.nodes()[id].data.nodes.length }))).filter(d => `${d.surface.name} ${label(d.surface, d.parent)}`.toLowerCase().includes(search.toLowerCase())) : [];
    return <><Dialog open={moveOpen} onOpenChange={open => { setMoveOpen(open); if (!open)
        window.dispatchEvent(new CustomEvent('dreamscape-move-preview', { detail: null })); }}><DialogContent className="bg-card sm:max-w-lg"><DialogTitle>Move to…</DialogTitle><DialogDescription>Choose a frame or container for the selected components.</DialogDescription><input autoFocus aria-label="Find destination" placeholder="Search frames and containers…" className="rounded-md border bg-background p-2 text-sm" value={search} onChange={e => setSearch(e.target.value)}/><div className="max-h-80 overflow-auto">{destinations.map(d => <button key={`${d.surface.id}:${d.parent}`} className="block w-full rounded p-2 text-left text-sm hover:bg-accent focus:bg-accent" onMouseEnter={() => window.dispatchEvent(new CustomEvent('dreamscape-move-preview', { detail: { screen: d.surface.id, parent: d.parent } }))} onFocus={() => window.dispatchEvent(new CustomEvent('dreamscape-move-preview', { detail: { screen: d.surface.id, parent: d.parent } }))} onClick={() => { commitRef.current(d, selected); setMoveOpen(false); window.dispatchEvent(new CustomEvent('dreamscape-move-preview', { detail: null })); }}>{d.surface.name} › {label(d.surface, d.parent)}</button>)}{!destinations.length && <p className="p-2 text-sm text-muted-foreground">No available containers.</p>}</div></DialogContent></Dialog>{message && <div role="status" className="fixed bottom-6 left-1/2 z-[110] -translate-x-1/2 rounded-lg border bg-card px-4 py-3 text-sm text-foreground shadow-lg">{message}<button aria-label="Undo move" className="ml-3 font-medium underline underline-offset-2 disabled:opacity-40" disabled={!query.history.canUndo()} onClick={() => { actions.history.undo(); setMessage(''); }}>Undo</button></div>}</>;
}
