import { Editor, Frame, ROOT_NODE, useEditor, type Indicator } from '@craftjs/core';
import { useEffect } from 'react';
import { act, fireEvent, render, createEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/blocks/button';
import { Card } from '@/components/blocks/card';
import { emptyLayoutJson, resolver } from '@/components/blocks/registry';
import { StageProvider } from './stage-context';
import { useDropPlaceholder } from './drop-placeholder';
type Handle = Pick<ReturnType<typeof useEditor>, 'store' | 'actions' | 'query'>;
function Probe({ onReady }: {
    onReady: (handle: Handle) => void;
}) {
    // Selection-driven renders must never cancel an in-progress drag.
    const { store, actions, query } = useEditor(state => ({ selectedCount: state.events.selected.size }));
    const ui = useDropPlaceholder();
    useEffect(() => onReady({ store, actions, query }));
    return ui;
}
function setup() {
    let handle: Handle | null = null;
    const utils = render(<Editor resolver={resolver} enabled indicator={{ success: 'transparent', error: 'red' }}><StageProvider><Probe onReady={h => { handle = h; }}/><Frame data={emptyLayoutJson()}/></StageProvider></Editor>);
    const get = () => { if (!handle)
        throw new Error('Editor not mounted'); return handle; };
    const root = get().query.node(ROOT_NODE).get().dom!;
    root.style.display = 'flex';
    root.style.flexDirection = 'row';
    return { ...utils, handle: get };
}
function addButton(h: Handle, label: string) { const tree = h.query.parseReactElement(<Button label={label}/>).toNodeTree(); act(() => h.actions.addNodeTree(tree, ROOT_NODE)); return tree.rootNodeId; }
const rects = new WeakMap<Element, Partial<DOMRect>>();
function setRect(el: Element, rect: Partial<DOMRect>) { rects.set(el, rect); }
beforeEach(() => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) { return { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}), ...rects.get(this) }; });
});
afterEach(() => vi.restoreAllMocks());
function validIndicator(h: Handle, index: number, where: string, currentId: string | null): Indicator { return { placement: { parent: h.query.node(ROOT_NODE).get(), currentNode: currentId ? h.query.node(currentId).get() : null, index, where } } as Indicator; }
describe('stable drag previews', () => {
    function dragOver(el: HTMLElement, init: Record<string, unknown>) {
        const event = createEvent.dragOver(el, init);
        Object.defineProperties(event, { clientX: { value: init.clientX }, clientY: { value: init.clientY } });
        fireEvent(el, event);
    }
    const dataTransfer = () => ({ setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '', dropEffect: '' });
    function arrangement() {
        const { handle, ...utils } = setup();
        const h = handle();
        const a = addButton(h, 'A'), b = addButton(h, 'B'), c = addButton(h, 'C');
        const root = h.query.node(ROOT_NODE).get().dom!;
        setRect(root, { left: 0, top: 0, width: 300, height: 80 });
        [a, b, c].forEach((id, i) => setRect(h.query.node(id).get().dom!, { left: i * 100, top: 0, width: 90, height: 60 }));
        return { h, a, b, c, root, ...utils };
    }
    it('preserves the layout during drag; commits once on drop and undoes', () => {
        const { h, a, b, c, root } = arrangement();
        const dom = h.query.node(a).get().dom!;
        const before = root.innerHTML;
        const dt = dataTransfer();
        fireEvent.dragStart(dom, { dataTransfer: dt });
        dragOver(h.query.node(c).get().dom!, { clientX: 295, clientY: 30, dataTransfer: dt });
        expect(root.innerHTML).toBe(before);
        expect(h.query.node(ROOT_NODE).get().data.nodes).toEqual([a, b, c]);
        expect(document.querySelector<HTMLElement>('[data-drop-placeholder]')!.style.display).toBe('block');
        fireEvent.drop(h.query.node(c).get().dom!, { dataTransfer: dt });
        expect(h.query.node(ROOT_NODE).get().data.nodes).toEqual([b, c, a]);
        expect(dom.style.visibility).not.toBe('hidden');
        expect([...h.query.getState().events.selected]).toEqual([a]);
        act(() => h.actions.history.undo());
        expect(h.query.node(ROOT_NODE).get().data.nodes).toEqual([a, b, c]);
    });
    it('uses the actual component preview and restores source styles after cancellation', async () => {
        const { h, a, b, c } = arrangement();
        const dom = h.query.node(a).get().dom!;
        const panel = document.createElement('aside');
        document.body.append(panel);
        dom.style.opacity = '0.8';
        dom.style.outline = '2px solid red';
        const dt = dataTransfer();
        fireEvent.dragStart(dom, { dataTransfer: dt });
        const preview = dt.setDragImage.mock.calls[0][0] as HTMLElement;
        expect(preview.querySelector('button')?.textContent).toBe('A');
        expect(panel.hasAttribute('data-drag-obscured')).toBe(false);
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
        expect(dom.style.opacity).toBe('0.35');
        expect(panel.getAttribute('data-drag-obscured')).toBe('true');
        expect(h.query.node(ROOT_NODE).get().data.nodes).toEqual([a, b, c]);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(dom.style.opacity).toBe('0.8');
        expect(dom.style.outline).toBe('2px solid red');
        expect(preview.isConnected).toBe(false);
        expect(panel.hasAttribute('data-drag-obscured')).toBe(false);
        panel.remove();
    });
    it('keeps a trailing-edge footprint within the receiving container', () => {
        const { h, a, c } = arrangement();
        const dt = dataTransfer();
        fireEvent.dragStart(h.query.node(a).get().dom!, { dataTransfer: dt });
        dragOver(h.query.node(c).get().dom!, { clientX: 295, clientY: 30, dataTransfer: dt });
        const footprint = document.querySelector<HTMLElement>('[data-drop-footprint]')!;
        expect(footprint.style.display).toBe('block');
        expect(parseFloat(footprint.style.left) + parseFloat(footprint.style.width)).toBeLessThanOrEqual(300);
        fireEvent.keyDown(document, { key: 'Escape' });
    });
    it('Escape and invalid drops leave the tree untouched', () => {
        const { h, a, b, c } = arrangement();
        const dt = dataTransfer();
        fireEvent.dragStart(h.query.node(a).get().dom!, { dataTransfer: dt });
        dragOver(h.query.node(c).get().dom!, { clientX: 295, clientY: 30, dataTransfer: dt });
        fireEvent.keyDown(document, { key: 'Escape' });
        fireEvent.drop(h.query.node(c).get().dom!, { dataTransfer: dt });
        expect(h.query.node(ROOT_NODE).get().data.nodes).toEqual([a, b, c]);
        fireEvent.dragStart(h.query.node(a).get().dom!, { dataTransfer: dt });
        dragOver(document.body, { clientX: 1000, clientY: 1000, dataTransfer: dt });
        fireEvent.drop(document.body, { dataTransfer: dt });
        expect(h.query.node(ROOT_NODE).get().data.nodes).toEqual([a, b, c]);
    });
    it('moves multiselection in tree order, preserving selection and one-step undo', () => {
        const { h, a, b, c } = arrangement();
        act(() => h.actions.selectNode([b, a]));
        const dt = dataTransfer();
        fireEvent.dragStart(h.query.node(a).get().dom!, { dataTransfer: dt });
        dragOver(h.query.node(c).get().dom!, { clientX: 295, clientY: 30, dataTransfer: dt });
        expect(document.querySelector('[data-drop-placeholder]')!.textContent).toContain('2 components');
        fireEvent.drop(h.query.node(c).get().dom!, { dataTransfer: dt });
        expect(h.query.node(ROOT_NODE).get().data.nodes).toEqual([c, a, b]);
        act(() => h.actions.history.undo());
        expect(h.query.node(ROOT_NODE).get().data.nodes).toEqual([a, b, c]);
    });
    it('requires a deliberate pause before nesting into another card', () => {
        const { h, a } = arrangement();
        const tree = h.query.parseReactElement(<Card />).toNodeTree();
        act(() => h.actions.addNodeTree(tree, ROOT_NODE));
        const card = h.query.node(tree.rootNodeId).get(), slot = card.data.linkedNodes.content;
        setRect(h.query.node(ROOT_NODE).get().dom!, { left: 0, top: 0, width: 650, height: 200 });
        setRect(card.dom!, { left: 400, top: 0, width: 200, height: 150 });
        setRect(h.query.node(slot).get().dom!, { left: 410, top: 40, width: 180, height: 90 });
        let now = 100;
        vi.spyOn(performance, 'now').mockImplementation(() => now);
        const dt = dataTransfer();
        fireEvent.dragStart(h.query.node(a).get().dom!, { dataTransfer: dt });
        dragOver(card.dom!, { clientX: 450, clientY: 80, dataTransfer: dt });
        expect(document.querySelector('[data-drop-placeholder]')!.textContent).not.toContain('Move into');
        now += 500;
        dragOver(card.dom!, { clientX: 450, clientY: 80, dataTransfer: dt });
        expect(document.querySelector('[data-drop-placeholder]')!.textContent).toContain('Move into');
        expect(h.query.node(a).get().data.parent).toBe(ROOT_NODE);
        fireEvent.drop(card.dom!, { dataTransfer: dt });
        expect(h.query.node(a).get().data.parent).toBe(slot);
        act(() => h.actions.history.undo());
        expect(h.query.node(a).get().data.parent).toBe(ROOT_NODE);
    });
    it('keeps new tray previews outside the layout and removes overlays on unmount', () => {
        const { h, a, root, unmount } = arrangement();
        const before = root.innerHTML;
        act(() => h.actions.setIndicator(validIndicator(h, 0, 'before', a)));
        expect(root.innerHTML).toBe(before);
        expect(root.querySelector('[data-drop-placeholder]')).toBeNull();
        expect(document.querySelector<HTMLElement>('[data-drop-placeholder]')!.style.display).toBe('block');
        unmount();
        expect(document.querySelector('[data-drop-placeholder]')).toBeNull();
    });
});
