'use client';
import { Editor, Frame, useEditor, useNode, type NodeId, type NodeTree } from '@craftjs/core';
import { useCallback, useEffect, useReducer, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Blocks, Undo2, Redo2, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { resolver, schemaFor, trayItems } from '@/components/blocks/registry';
import { componentDefinitionSchema, type ComponentDefinition, type Tree } from '@/lib/custom-components/model';
import { canonicalLayout } from '@/lib/files/validate';
import { isResponsive, resolve, type Breakpoint } from '@/lib/responsive';
import { StageProvider, useStage } from '../stage-context';
import { CanvasFrame } from '../canvas-frame';
import { Field } from '../inspector/field';
import { WidthControl } from './width-control';
import { FieldLayout } from '../inspector/field-layout';
import { LayersPanel } from '../layers-panel';
import { bindCanvasDelete } from './delete-key';
import { SelectPortalContainer } from '@/components/ui/select';
import { useSettledEditorState } from '../use-settled-editor-state';
import { useDropPlaceholder } from '../drop-placeholder';
import { NodeIndicator } from '../node-indicator';
import { ResizeHandle } from '../stage';
import { clampHeight } from '@/lib/stage/size';
import { NodeBreadcrumb } from '../inspector/breadcrumb';
import { clampWidth } from '@/lib/stage';
import { ElementPicker } from './element-picker';
import { PRIMARY_BUTTON, LABEL, PANEL } from '../chrome';
import { nextZoomStep, MIN_ZOOM, MAX_ZOOM } from '@/lib/canvas/viewport';
import type { SaveState } from '@/lib/persistence';
import { PanelResize, useLeftPanelWidth } from '../panel-resize';
import { LeftPanelContext } from '../left-panel-tabs';
import { ChatPanel } from '../chat/chat-panel';
import { SaveIndicator } from '../topbar';
import { bindPreviewZoom, type PreviewZoomChange } from './preview-zoom';

const SIZES: { id: Breakpoint; width: number; label: string }[] = [
  { id: 'mobile', width: 320, label: 'Narrow' }, { id: 'tablet', width: 768, label: 'Medium' }, { id: 'desktop', width: 1024, label: 'Wide' },
];
const WIDTH_RANGES = { mobile: 'under 768px', tablet: '768–1023px', desktop: '1024px and up' };
const BLOCK_MIME = 'application/x-dreamscape-element';
type History = { layout: string; past: string[]; future: string[] };
function historyReducer(state: History, action: { type: 'edit'; layout: string } | { type: 'undo' | 'redo' }): History {
  if (action.type === 'edit') {
    if (canonicalLayout(action.layout) === canonicalLayout(state.layout)) return state;
    return { layout: action.layout, past: [...state.past, state.layout].slice(-100), future: [] };
  }
  if (action.type === 'undo' && state.past.length) return { layout: state.past.at(-1)!, past: state.past.slice(0, -1), future: [state.layout, ...state.future] };
  if (action.type === 'redo' && state.future.length) return { layout: state.future[0], past: [...state.past, state.layout], future: state.future.slice(1) };
  return state;
}
function BuilderIndicator({ render }: { render: ReactElement }) {
  const { id, dom } = useNode(node => ({ dom: node.dom }));
  useEffect(() => {
    if (!dom) return;
    dom.setAttribute('data-builder-node', id);
    return () => { dom.removeAttribute('data-builder-node'); };
  }, [dom, id]);
  return <NodeIndicator render={render} />;
}

export function ComponentBuilder({ fileId, initial, existing, instances, onClose, onSave, saveState }: {
  saveState?: SaveState; fileId: string; initial: ComponentDefinition; existing: boolean; instances: number;
  onClose: () => void; onSave: (definition: ComponentDefinition) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [zoom, setZoom] = useState(1);
  const [history, dispatch] = useReducer(historyReducer, { layout: initial.layout, past: [], future: [] });
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [leftWidth, setLeftWidth] = useLeftPanelWidth();
  const [chatOpen, setChatOpen] = useState(false);
  const [view, setView] = useState<'all' | 'component'>('component');
  const [widths, setWidths] = useState({ desktop: 1024, tablet: 768, mobile: 320 });
  const [fitHeights, setFitHeights] = useState({ desktop: true, tablet: true, mobile: true });
  const [heights, setHeights] = useState({ desktop: 400, tablet: 400, mobile: 400 });
  const [active, setActive] = useState<Breakpoint>('mobile');
  const [selected, setSelected] = useState('ROOT');
  const [scope, setScope] = useState<'all' | 'size'>('all');
  const [layers, setLayers] = useState<HTMLElement | null>(null);
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const [draftError, setDraftError] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const [menuContainer, setMenuContainer] = useState<HTMLDivElement | null>(null);
  const attachRoot = useCallback((element: HTMLDivElement | null) => {
    root.current = element;
    setMenuContainer(element);
  }, []);
  const draftKey = `assembly-workbench:component-draft:${fileId}:${existing ? initial.id : 'new'}`;
  useEffect(() => {
    try { localStorage.setItem(draftKey, JSON.stringify({ id: initial.id, name, layout: history.layout })); }
    catch { queueMicrotask(() => setDraftError(true)); }
  }, [draftKey, initial.id, name, history.layout]);
  useEffect(() => { root.current?.focus(); }, []);
  useEffect(() => {
    if (root.current) return bindPreviewZoom(root.current, setZoom);
  }, []);
  const change = useCallback((layout: string) => dispatch({ type: 'edit', layout }), []);
  const valid = componentDefinitionSchema.safeParse({ id: initial.id, name, layout: history.layout });
  const lastQueued = useRef<string | null>(null);
  useEffect(() => {
    if (!existing) return;
    const parsed = componentDefinitionSchema.safeParse({ id: initial.id, name, layout: history.layout });
    if (!parsed.success) return;
    const serialized = JSON.stringify(parsed.data);
    if (lastQueued.current === serialized) return;
    lastQueued.current = serialized;
    onSave(parsed.data);
  }, [existing, initial.id, name, history.layout, onSave]);
  const hasContent = (JSON.parse(history.layout) as Tree).ROOT.nodes.length > 0;
  return <LeftPanelContext.Provider value={{ chatOpen, setChatOpen, collapsed: leftCollapsed, setCollapsed: setLeftCollapsed }}><SelectPortalContainer.Provider value={menuContainer}><div ref={attachRoot} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Component Builder"
    className="fixed inset-0 z-[80] bg-canvas outline-none"
    onKeyDown={event => {
      event.stopPropagation();
      const target = event.target as HTMLElement;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !target.matches('input,textarea,[contenteditable=true]')) {
        event.preventDefault(); dispatch({ type: event.shiftKey ? 'redo' : 'undo' });
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && !target.matches('input,textarea,[contenteditable=true]')) {
        event.preventDefault(); window.dispatchEvent(new Event('dreamscape-builder-delete'));
      }
      if (event.key === 'Tab') {
        const focusable = Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,iframe,[tabindex="0"]') ?? []).filter(element => !element.closest('[hidden]'));
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
    <header className={`${PANEL} absolute top-3 right-3 left-3 z-20 flex h-[52px] items-center gap-4 px-5`}>
      <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" onClick={onClose}><ArrowLeft className="size-4" />Back to file</button>
      <span className="h-5 border-l border-line-soft" /><Blocks className="size-5 text-acc" />
      <input aria-label="Component name" maxLength={120} value={name} onChange={e => setName(e.target.value)} className="w-60 rounded-md bg-transparent px-2 py-1 font-semibold focus:bg-muted focus:outline-none" />
      {existing && valid.success && saveState ? <SaveIndicator saveState={saveState} /> : <span className="text-xs text-muted-foreground">{draftError ? 'Draft could not be saved in this browser' : existing && !valid.success ? 'Enter a component name to sync changes' : 'Draft saved on this device'}</span>}
      {existing && <span className="text-xs text-muted-foreground">Used in {instances} {instances === 1 ? 'place' : 'places'}</span>}
      <div className="flex-1" />
      <button title="Undo" aria-label="Undo component edit" disabled={!history.past.length} className="disabled:opacity-30" onClick={() => dispatch({ type: 'undo' })}><Undo2 className="size-4" /></button>
      <button title="Redo" aria-label="Redo component edit" disabled={!history.future.length} className="disabled:opacity-30" onClick={() => dispatch({ type: 'redo' })}><Redo2 className="size-4" /></button>
      {!existing && <button className={`${PRIMARY_BUTTON} disabled:opacity-40`} disabled={!valid.success || !hasContent} onClick={() => {
        if (!valid.success) return;
        onSave(valid.data); try { localStorage.removeItem(draftKey); } catch { /* Saving the file still succeeds. */ }
      }}>Add to Components</button>}
    </header>
    {chatOpen && <ChatPanel left={12} width={leftWidth} onWidthChange={setLeftWidth} fileId={fileId} onClose={() => setChatOpen(false)} className="absolute top-[76px] left-3 bottom-3 z-30 w-64" />}
    <div className="contents group/layers-shell">
      <aside aria-label="Layers panel" style={{ display: chatOpen ? 'none' : undefined, '--left-width': `${leftWidth}px` } as React.CSSProperties} ref={setLayers} className={`${PANEL} absolute top-[76px] left-3 bottom-3 z-10 group/left-panel w-[var(--left-width)] has-[[data-layers-collapsed=true]]:w-10 min-h-0 overflow-hidden`}><PanelResize width={leftWidth} onChange={setLeftWidth} /></aside>
      <main style={{ '--left-padding': `${leftCollapsed ? 64 : leftWidth + 24}px` } as React.CSSProperties} onClick={event => {
        const target = event.target as HTMLElement;
        // React portal events bubble here from the iframe and side panels.
        // Only actual DOM descendants of the workspace can be blank canvas.
        if (!event.currentTarget.contains(target)) return;
        if (!target.closest('[data-component-frame],button,input,select,label,[role="separator"]')) setSelected('');
      }} className={`absolute inset-0 flex min-w-0 flex-col bg-canvas pt-[76px] pr-[344px] pb-3 pl-[var(--left-padding)] ${chatOpen ? '' : 'group-has-[[data-layers-collapsed=true]]/layers-shell:pl-16'}`}>
        <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-4"><button aria-pressed={view === 'all'} className="rounded-md border border-line-soft px-3 py-2 text-xs" onClick={() => setView(current => current === 'all' ? 'component' : 'all')}>{view === 'all' ? 'Single frame' : 'Compare widths'}</button>
          <div role="group" aria-label="Preview zoom" className="flex shrink-0 items-center gap-2 text-xs">
            <button aria-label="Zoom out" disabled={zoom <= MIN_ZOOM} className="rounded border px-2 py-1 disabled:opacity-30" onClick={() => setZoom(current => nextZoomStep(current, 'out'))}>−</button>
            <span className="min-w-12 text-center tabular-nums" title="Zoom relative to fitted previews">{Math.round(zoom * 100)}%</span>
            <button aria-label="Zoom in" disabled={zoom >= MAX_ZOOM} className="rounded border px-2 py-1 disabled:opacity-30" onClick={() => setZoom(current => nextZoomStep(current, 'in'))}>+</button>
            <button className="rounded border px-2 py-1" onClick={() => setZoom(1)}>Fit</button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 gap-4 overflow-auto px-5 pb-6">
          {SIZES.map(size => <Preview key={size.id} size={size} compact={view === 'component'} visible={view === 'all' || active === size.id} fitHeight={fitHeights[size.id]} onFitHeightChange={fit => setFitHeights(current => ({ ...current, [size.id]: fit }))} height={heights[size.id]} onResize={next => { setFitHeights(current => ({ ...current, [size.id]: false })); setWidths(current => ({ ...current, [size.id]: clampWidth(next.width) })); setHeights(current => ({ ...current, [size.id]: clampHeight(next.height) })); }} width={widths[size.id]} onWidthChange={width => setWidths(current => ({ ...current, [size.id]: clampWidth(width) }))} layout={history.layout} onChange={change}
            active={active === size.id} onActivate={() => setActive(size.id)} selected={selected} onSelect={setSelected}
            layers={layers} panel={panel} scope={scope} setScope={setScope} zoom={zoom} onZoom={setZoom} />)}
        </div>
      </main>
      <div className={`${PANEL} absolute top-[76px] right-3 bottom-3 z-10 flex w-80 min-h-0 flex-col overflow-hidden`}>
        <ElementPicker />
        <aside aria-label="Builder design" className="min-h-0 flex-1 overflow-auto" ref={setPanel} />
      </div>
    </div>
  </div></SelectPortalContainer.Provider></LeftPanelContext.Provider>;
}

function Preview({ size, fitHeight, onFitHeightChange, compact, height, onResize, visible, width, onWidthChange, layout, onChange, active, onActivate, selected, onSelect, layers, panel, scope, setScope, zoom, onZoom }: {
  fitHeight: boolean; onFitHeightChange: (fit: boolean) => void;
  compact: boolean; height: number; onResize: (next: { width: number; height: number }) => void;
  visible: boolean; width: number; onWidthChange: (width: number) => void;
  zoom: number; onZoom: PreviewZoomChange;
  size: typeof SIZES[number]; layout: string; onChange: (layout: string) => void; active: boolean; onActivate: () => void;
  selected: string; onSelect: (id: string) => void; layers: HTMLElement | null; panel: HTMLElement | null; scope: 'all' | 'size'; setScope: (scope: 'all' | 'size') => void;
}) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [available, setAvailable] = useState(230);
  const lastRef = useRef<string | null>(null);
  const activeRef = useRef(active);
  const pendingRef = useRef(false);
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => {
    if (!host) return;
    const observer = new ResizeObserver(entries => { if (entries[0].contentRect.width > 0) setAvailable(entries[0].contentRect.width); });
    observer.observe(host); return () => observer.disconnect();
  }, [host]);
  const scale = Math.min(1, Math.max(1, available - 24) / (compact ? 320 : size.width)) * zoom;
  const activate = () => { activeRef.current = true; onActivate(); };
  return <section hidden={!visible} className={`${visible ? 'flex' : 'hidden'} min-w-[200px] flex-1 flex-col rounded-xl border ${active ? 'border-acc/70' : 'border-line-soft'} bg-card/40`} onPointerDownCapture={activate} onDragEnter={activate}>
    <div className="flex items-center gap-2 px-3 py-3"><button onClick={activate} className="text-xs font-semibold capitalize">{compact ? 'Component' : size.label}</button></div>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 pb-3 text-xs"><WidthControl label={`${size.label} width`} value={width} onChange={onWidthChange} /><div className="flex items-center gap-1"><label>Height <select aria-label={`${size.label} height mode`} value={fitHeight ? 'fit' : 'fixed'} onChange={event => onFitHeightChange(event.target.value === 'fit')} className="rounded border bg-background p-1"><option value="fit">Fit content</option><option value="fixed">Fixed</option></select></label>{!fitHeight && <input aria-label={`${size.label} height`} type="number" value={height} onChange={event => { if (event.target.value) onResize({ width, height: Number(event.target.value) }); }} className="w-16 rounded border bg-background px-1" />}</div></div>
    <div ref={setHost} className="component-builder-preview min-h-0 flex-1 overflow-auto rounded-b-xl p-3 flex items-center">
      <Editor resolver={resolver} onRender={BuilderIndicator} indicator={{ success: '#8C97DB', error: '#E05D5D' }} onNodesChange={query => {
        const next = query.serialize();
        if (activeRef.current && lastRef.current !== null && canonicalLayout(next) !== canonicalLayout(lastRef.current) && !pendingRef.current) {
          // Linked content zones are created during Craft's render. Wait for the
          // completed tree before publishing it to the other two editors.
          pendingRef.current = true;
          queueMicrotask(() => { pendingRef.current = false; onChange(query.serialize()); });
        }
        lastRef.current = next;
      }}>
        <StageProvider initialWidth={width}>
          <PreviewBody layout={layout} lastRef={lastRef} width={width} height={height} fitHeight={fitHeight} onResize={onResize} onWidthChange={onWidthChange} scale={scale} title={size.id} active={active} onActivate={activate}
            selected={selected} onSelect={onSelect} layers={layers} panel={panel} scope={scope} setScope={setScope} onZoom={onZoom} />
        </StageProvider>
      </Editor>
    </div>
  </section>;
}
function PreviewBody({ layout, lastRef, width, height, fitHeight, onResize, onWidthChange, scale, title, active, onActivate, selected, onSelect, layers, panel, scope, setScope, onZoom }: {
  fitHeight: boolean; height: number; onResize: (next: { width: number; height: number }) => void;
  onZoom: PreviewZoomChange; onWidthChange: (width: number) => void;
  layout: string; lastRef: { current: string | null }; width: number; scale: number; title: string; active: boolean; onActivate: () => void;
  selected: string; onSelect: (id: string) => void; layers: HTMLElement | null; panel: HTMLElement | null; scope: 'all' | 'size'; setScope: (scope: 'all' | 'size') => void;
}) {
  useDropPlaceholder();
  const { actions, query, selectedId } = useEditor(state => ({ selectedId: [...state.events.selected][0] }));
  const { setWidth, setZoom, canvasDocument } = useStage();
  const appliedLayoutRef = useRef(layout);
  const [naturalHeight, setNaturalHeight] = useState(400);
  const effectiveHeight = fitHeight ? naturalHeight : height;
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!content) return;
    const growToContent = () => {
      // Drag placeholders temporarily enlarge the layout. Only size the
      // frame from settled content, after the shared drag cleanup runs.
      if (query.getState().events.dragged.size || content.querySelector('[data-drop-placeholder]')) return;
      const needed = Math.ceil(Math.max(content.scrollHeight, content.getBoundingClientRect().height));
      setNaturalHeight(needed > 20 ? needed : 400);
    };
    const observer = new ResizeObserver(growToContent);
    observer.observe(content);
    let pending: number | undefined;
    const afterDrop = () => { cancelAnimationFrame(pending ?? 0); pending = requestAnimationFrame(growToContent); };
    content.ownerDocument.addEventListener('dragend', afterDrop);
    content.ownerDocument.addEventListener('drop', afterDrop);
    growToContent();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(pending ?? 0);
      content.ownerDocument.removeEventListener('dragend', afterDrop);
      content.ownerDocument.removeEventListener('drop', afterDrop);
    };
  }, [content, height, width, onResize, query, layout]);
  useEffect(() => {
    if (canvasDocument?.document) return bindPreviewZoom(canvasDocument.document, onZoom);
  }, [canvasDocument, onZoom]);
  useEffect(() => { lastRef.current = query.serialize(); }, [lastRef, query]);
  useEffect(() => { setWidth(width); setZoom(scale); }, [width, scale, setWidth, setZoom]);
  useEffect(() => {
    if (appliedLayoutRef.current === layout) return;
    appliedLayoutRef.current = layout;
    if (canonicalLayout(query.serialize()) === canonicalLayout(layout)) return;
    lastRef.current = null;
    actions.history.ignore().deserialize(layout);
    lastRef.current = query.serialize();
    if (query.getNodes()[selected] && !query.node(selected).get().events.selected) actions.selectNode(selected);
  }, [layout, actions, query, lastRef, selected]);
  useEffect(() => { if (selected === '') actions.selectNode(); }, [selected, actions]);
  useEffect(() => { if (active && selectedId) onSelect(selectedId); }, [active, selectedId, onSelect]);
  useEffect(() => { if (!active && query.getNodes()[selected] && !query.node(selected).get().events.selected) actions.selectNode(selected); }, [active, selected, actions, query]);
  const add = useCallback((type: string, target?: string, position?: number) => {
    const item = trayItems.find(entry => entry.type === type); if (!item) return;
    let parent: NodeId = target ?? [...query.getState().events.selected][0] ?? selected;
    while (query.getNodes()[parent] && !query.node(parent).get().data.isCanvas) {
      const node = query.node(parent).get();
      parent = node.data.linkedNodes.content ?? node.data.parent ?? 'ROOT';
    }
    if (!query.getNodes()[parent]) parent = 'ROOT';
    const tree: NodeTree = query.parseReactElement(item.create()).toNodeTree();
    actions.addNodeTree(tree, parent, position); actions.selectNode(tree.rootNodeId);
    window.dispatchEvent(new Event('dreamscape-builder-added'));
  }, [actions, query, selected]);
  useEffect(() => {
    if (!active) return;
    const handler = (event: Event) => add((event as CustomEvent<string>).detail);
    const remove = () => { const id = [...query.getState().events.selected][0]; if (id && query.node(id).isDeletable()) { actions.delete(id); actions.selectNode('ROOT'); } };
    const unbindDelete = canvasDocument?.document ? bindCanvasDelete(canvasDocument.document, remove) : undefined;
    window.addEventListener('dreamscape-builder-add', handler);
    window.addEventListener('dreamscape-builder-delete', remove);
    return () => { unbindDelete?.(); window.removeEventListener('dreamscape-builder-add', handler); window.removeEventListener('dreamscape-builder-delete', remove); };
  }, [active, add, actions, query, canvasDocument]);
  useEffect(() => {
    const doc = canvasDocument?.document; if (!doc) return;
    const dragOver = (event: DragEvent) => { if (event.dataTransfer?.types.includes(BLOCK_MIME)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } };
    const drop = (event: DragEvent) => {
      const type = event.dataTransfer?.getData(BLOCK_MIME); if (!type) return;
      event.preventDefault(); event.stopPropagation(); onActivate();
      const target = (event.target as HTMLElement).closest('[data-builder-node]')?.getAttribute('data-builder-node') ?? 'ROOT';
      add(type, target);
    };
    doc.addEventListener('dragover', dragOver); doc.addEventListener('drop', drop);
    return () => { doc.removeEventListener('dragover', dragOver); doc.removeEventListener('drop', drop); };
  }, [canvasDocument, add, onActivate]);
  return <>
    <div data-component-frame style={{ width: width * scale, height: effectiveHeight * scale, position: 'relative', flexShrink: 0, margin: 'auto' }}>
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
    <CanvasFrame width={width} height={effectiveHeight} zoom={scale} minHeight={0} title={`${title} component preview`}>
      <div ref={setContent} className="component-builder-preview"><Frame data={layout} /></div>
    </CanvasFrame>
    </div>
    <ResizeHandle axis="width" width={width} height={effectiveHeight} zoom={scale} onWidthChange={onWidthChange} />
    <ResizeHandle axis="height" width={width} height={effectiveHeight} zoom={scale} onResize={onResize} />
    <ResizeHandle axis="corner" width={width} height={effectiveHeight} zoom={scale} onResize={onResize} />
    </div>
    {active && layers && createPortal(<LayersPanel onAddElement={add} />, layers)}
    {active && panel && createPortal(<BuilderFields deselected={selected === ''} scope={scope} setScope={setScope} />, panel)}
  </>;
}

function BuilderFields({ scope, setScope, deselected }: { deselected: boolean; scope: 'all' | 'size'; setScope: (scope: 'all' | 'size') => void }) {
  const { breakpoint } = useStage();
  const { actions, query } = useEditor();
  const state = useSettledEditorState();
  const id = [...state.events.selected][0] ?? 'ROOT';
  const node = state.nodes[id];
  if (deselected || !node) return <div className="p-4 text-center text-xs text-muted-foreground"><p className="font-semibold">Nothing selected</p><p className="mt-2">Select a layer on the canvas to edit it.</p></div>;
  const props = node.data.props as Record<string, unknown>;
  const fields = schemaFor(node.data.name)?.fields ?? [];
  const layoutBox = node.data.name === 'LayoutBox';
  const sizeStyles = props.sizeStyles as Record<string, Record<string, unknown>> | undefined;
  return <div className="p-4"><h2 className={`${LABEL} mb-4`}>Design</h2>
    <NodeBreadcrumb /><h3 className="mb-3 font-semibold">{node.data.displayName}</h3>
    <div className="mb-4 rounded-lg border border-line-soft bg-muted/40 p-2"><span className="mb-2 block text-xs text-muted-foreground">Apply changes to</span>
      <div className="flex gap-1">{(['all', 'size'] as const).map(value => <button key={value} aria-pressed={scope === value} onClick={() => setScope(value)} className={`flex-1 rounded px-2 py-1.5 text-xs ${scope === value ? 'bg-accent text-foreground' : 'text-muted-foreground'}`}>{value === 'all' ? 'All widths' : 'This width range'}</button>)}</div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{scope === 'all' ? 'Layout changes apply at every component width. You can undo any change.' : `Layout changes apply only when this component is ${WIDTH_RANGES[breakpoint]}. Content stays shared.`}</p>
    </div>
    <FieldLayout fields={fields.filter(field => !field.showWhen || field.showWhen(props))} renderField={field => {
      const responsive = field.responsive || (layoutBox && (field.section === 'Layout' || field.section === 'Style'));
      const base = field.kind === 'width-limit' ? props.maxWidth ?? { value: props.maxWidthPx ?? 0, unit: 'px' } : field.kind === 'border' ? props.border ?? { width: props.borderWidth ?? (['Card', 'Textarea'].includes(node.data.name) ? 1 : 0), color: props.borderColor } : props[field.prop];
      const value = sizeStyles?.[breakpoint]?.[field.prop] ?? resolve(base, breakpoint);
      const overridden = sizeStyles?.[breakpoint]?.[field.prop] !== undefined || (isResponsive(base) && base[breakpoint] !== ((props.componentShared as Record<string, unknown> | undefined)?.[field.prop] ?? base.mobile));
      return <div key={field.prop}><Field field={{ ...field, responsive: false }} value={value} breakpoint={breakpoint} onChange={next => {
        actions.setProp(id, p => {
          if (responsive && scope === 'size') {
            if (field.responsive) {
              if (p.componentShared?.[field.prop] === undefined) p.componentShared = { ...p.componentShared, [field.prop]: resolve(base, 'mobile') };
              p[field.prop] = { mobile: resolve(base, 'mobile'), tablet: resolve(base, 'tablet'), desktop: resolve(base, 'desktop'), [breakpoint]: next };
            }
            else p.sizeStyles = { ...p.sizeStyles, [breakpoint]: { ...p.sizeStyles?.[breakpoint], [field.prop]: next } };
          } else {
            p[field.prop] = field.responsive ? { mobile: next } : next;
            if (p.componentShared) delete p.componentShared[field.prop];
            for (const size of Object.keys(p.sizeStyles ?? {})) delete p.sizeStyles[size][field.prop];
          }
        });
      }} />{responsive && overridden && <button className="mt-1 text-[10px] text-acc" onClick={() => actions.setProp(id, p => {
        if (p.sizeStyles?.[breakpoint]) delete p.sizeStyles[breakpoint][field.prop];
        if (isResponsive(p[field.prop])) {
          if (p.componentShared?.[field.prop] !== undefined) { p[field.prop][breakpoint] = p.componentShared[field.prop]; }
          else if (breakpoint !== 'mobile') delete p[field.prop][breakpoint];
        }
      })}>Use shared value</button>}</div>;
    }} />
    {id !== 'ROOT' && <div className="my-5 flex gap-3 border-t border-line-soft pt-3">
      {([-1, 1] as const).map(direction => <button key={direction} aria-label={direction < 0 ? 'Move element earlier' : 'Move element later'} onClick={() => {
        const parent = node.data.parent; if (!parent) return;
        const siblings = query.node(parent).get().data.nodes; const index = siblings.indexOf(id); const next = index + direction;
        if (index >= 0 && next >= 0 && next < siblings.length) actions.move(id, parent, direction > 0 ? next + 1 : next);
      }}>{direction < 0 ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}</button>)}
      <button aria-label="Delete element" className="ml-auto text-bad" onClick={() => { if (query.node(id).isDeletable()) { actions.delete(id); actions.selectNode('ROOT'); } }}><Trash2 className="size-4" /></button>
    </div>}
  </div>;
}
