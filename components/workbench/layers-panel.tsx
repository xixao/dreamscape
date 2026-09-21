'use client';

import { layerLabel } from '@/lib/layer-label';
import { useEditor, type NodeTree } from '@craftjs/core';
import { CanvasMinimap } from './canvas-minimap';
import { SectionsList } from './sections/section-tools';
import { LeftPanelContext, LeftPanelTabs, LeftPanelHeader, LeftPanelFooter } from './left-panel-tabs';
import { DRAG_TARGET } from './drag-surfaces';
import { useContext, useState, useEffect, useRef } from 'react';
import { nanoid } from 'nanoid';
import { ChevronDown, ChevronRight, ChevronLeft, Layers, Command, Copy, Trash2 } from 'lucide-react';
import { useSettledEditorState } from './use-settled-editor-state';
import { LABEL } from './chrome';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';

export function LayersPanel({ onAddElement, onOpenShortcuts, showSections = false, rootFrame }: { rootFrame?: { name: string; duplicate: () => void; delete: () => void; deleteDisabled: boolean }; showSections?: boolean; onOpenShortcuts?: () => void; onAddElement?: (type: string, parent: string, index: number) => void }) {
  const panelMode = useContext(LeftPanelContext);
  const { actions, query } = useEditor();
  const state = useSettledEditorState();
  const [localCollapsed, setLocalCollapsed] = useState(false);
  const panelCollapsed = panelMode?.collapsed ?? localCollapsed;
  const setPanelCollapsed = panelMode?.setCollapsed ?? setLocalCollapsed;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dropHint, setDropHint] = useState<{ id: string; placement: string } | null>(null);
  const temporaryExpanded = useRef<Set<string>>(new Set());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let currentParent: string | null = null;
    const target = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.complete) { clearTimeout(timer); currentParent=null; temporaryExpanded.current.clear(); setDropHint(null); return; }
      if (!detail) {
        clearTimeout(timer); currentParent=null;
        setDropHint(null);
        const restore=[...temporaryExpanded.current];
        setCollapsed(previous => new Set([...previous, ...restore]));
        temporaryExpanded.current.clear();
        return;
      }
      if (!detail.parent) return;
      const children = query.getState().nodes[detail.parent]?.data.nodes ?? [];
      const child = children[detail.index] ?? children.at(-1);
      setDropHint({ id: detail.inside || !child ? detail.parent : child, placement: detail.inside || !child ? 'inside' : detail.index >= children.length ? 'after' : 'before' });
      if (currentParent === detail.parent) return;
      currentParent=detail.parent;clearTimeout(timer);
      timer = setTimeout(() => setCollapsed(previous => {
        if (!previous.has(detail.parent)) return previous;
        temporaryExpanded.current.add(detail.parent);
        const next = new Set(previous); next.delete(detail.parent); return next;
      }), 450);
    };
    window.addEventListener(DRAG_TARGET, target);
    return () => { clearTimeout(timer); window.removeEventListener(DRAG_TARGET, target); };
  }, []);
  const selected = [...state.events.selected][0];
  useEffect(() => {
    if (!selected) return;
    const ancestors: string[] = [];
    let parent=query.getState().nodes[selected]?.data.parent;
    while(parent){ancestors.push(parent);parent=query.getState().nodes[parent]?.data.parent;}
    setCollapsed(previous=>new Set([...previous].filter(id=>!ancestors.includes(id))));
    const raf=requestAnimationFrame(()=>{
      const row=Array.from(document.querySelectorAll<HTMLElement>('[data-drag-layer]')).find(el=>el.dataset.dragLayer===selected);
      const tree=row?.closest('[role=tree]');
      if(row && tree){const r=row.getBoundingClientRect(),t=tree.getBoundingClientRect();if(r.top<t.top||r.bottom>t.bottom)tree.scrollTop+=r.top-t.top;}
    });
    return()=>cancelAnimationFrame(raf);
  },[selected]);
  function attempt(operation: () => void) {
    try { operation(); setError(''); } catch { setError('That layer cannot be moved into this location.'); }
  }
  function move(id: string, parent: string, position: number) {
    attempt(() => actions.move(id, parent, position));
  }
  function duplicate(target: string) {
    const node = query.node(target).get();
    const parent = node.data.parent;
    if (!parent) return;
    const index = query.node(parent).get().data.nodes.indexOf(target);
    if (index < 0) return;
    const original = query.node(target).toNodeTree();
    const ids = Object.fromEntries(Object.keys(original.nodes).map(id => [id, nanoid()]));
    const serialized = query.getSerializedNodes();
    const tree: NodeTree = { rootNodeId: ids[target], nodes: {} };
    for (const id of Object.keys(original.nodes)) {
      const copy = query.parseSerializedNode(JSON.parse(JSON.stringify(serialized[id]))).toNode();
      copy.id = ids[id];
      copy.data.parent = ids[copy.data.parent ?? ''] ?? copy.data.parent;
      copy.data.nodes = copy.data.nodes.map(child => ids[child]);
      copy.data.linkedNodes = Object.fromEntries(Object.entries(copy.data.linkedNodes).map(([key, child]) => [key, ids[child]]));
      tree.nodes[copy.id] = copy;
    }
    attempt(() => { actions.addNodeTree(tree, node.data.parent!, index + 1); actions.selectNode(tree.rootNodeId); });
  }
  function commitName() {
    if (renaming && name.trim()) actions.setCustom(renaming, custom => { custom.layerName = name.trim(); custom.layerNameExplicit = true; });
    setRenaming(null);
  }
  function rows(id: string, depth: number): React.ReactNode {
    const item = state.nodes[id]; if (!item) return null;
    const children = [...Object.values(item.data.linkedNodes), ...item.data.nodes];
    const label = id === 'ROOT' ? String(item.data.custom.layerName || 'Frame') : layerLabel(item.data);
    const movable = !!item.data.parent && state.nodes[item.data.parent]?.data.nodes.includes(id);
    return <div key={id} role="treeitem" aria-label={label} aria-selected={state.events.selected.has(id)} aria-expanded={children.length ? !collapsed.has(id) : undefined}>
      <div className={`group/layer flex items-center gap-1 rounded-md py-1.5 pr-2 text-xs ${state.events.selected.has(id) ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'}`}
        data-drag-layer={id}
        draggable={movable && renaming !== id}
        onDragStart={event => { event.stopPropagation(); event.dataTransfer.setData('application/x-dreamscape-layer', id); event.dataTransfer.effectAllowed = 'move'; }}
        data-drop-placement={dropHint?.id === id ? dropHint.placement : undefined}
        style={{ paddingLeft: 8 + depth * 12, boxShadow: dropHint?.id !== id ? undefined : dropHint.placement === 'inside' ? 'inset 0 0 0 2px var(--acc)' : `inset 0 ${dropHint.placement === 'before' ? '2px' : '-2px'} 0 var(--acc)` }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropHint(null); }}
        onDragEnd={() => setDropHint(null)}
        onDragOver={event => {
          const element = onAddElement && event.dataTransfer.types.includes('application/x-dreamscape-element');
          if (!element && !event.dataTransfer.types.includes('application/x-dreamscape-layer')) return;
          event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = element ? 'copy' : 'move';
          const rect = event.currentTarget.getBoundingClientRect();
          const fraction = (event.clientY - rect.top) / rect.height;
          const container = item.data.isCanvas ? id : item.data.linkedNodes.content;
          setDropHint({ id, placement: container && (id === 'ROOT' || (fraction > .25 && fraction < .75)) ? 'inside' : fraction < .5 ? 'before' : 'after' });
        }}
        onDrop={event => {
          const source = event.dataTransfer.getData('application/x-dreamscape-layer');
          const element = onAddElement && event.dataTransfer.getData('application/x-dreamscape-element');
          if (!source && !element) return;
          event.preventDefault(); event.stopPropagation(); setDropHint(null);
          const rect = event.currentTarget.getBoundingClientRect();
          const fraction = (event.clientY - rect.top) / rect.height;
          const container = item.data.isCanvas ? id : item.data.linkedNodes.content;
          const inside = container && (id === 'ROOT' || (fraction > .25 && fraction < .75));
          const parent = inside ? container : movable ? item.data.parent : null;
          if (!parent) return;
          const position = inside ? state.nodes[parent].data.nodes.length : state.nodes[parent].data.nodes.indexOf(id) + (fraction >= .5 ? 1 : 0);
          if (element) attempt(() => onAddElement!(element, parent, position));
          else move(source, parent, position);
          setCollapsed(previous => { const next = new Set(previous); next.delete(id); next.delete(parent); return next; });
        }}>
        <button className="size-4 shrink-0" aria-label={`${collapsed.has(id) ? 'Expand' : 'Collapse'} ${label}`} disabled={!children.length}
          onClick={() => setCollapsed(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; })}>
          {children.length > 0 && (collapsed.has(id) ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />)}
        </button>
        {renaming === id ? <input autoFocus aria-label="Layer name" className="min-w-0 flex-1 rounded border bg-background px-1 text-xs" value={name} onChange={event => setName(event.target.value)} onBlur={commitName}
          onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') commitName(); if (event.key === 'Escape') setRenaming(null); }} /> :
          <button className="min-w-0 flex-1 truncate text-left" onClick={event => {
            const current = query.getEvent('selected').all();
            actions.selectNode(event.shiftKey || event.metaKey || event.ctrlKey
              ? current.includes(id) ? current.filter(value => value !== id) : [...current, id]
              : id);
          }} onDoubleClick={() => { setRenaming(id); setName(label); }}>{label}</button>}
        {(movable || (id === 'ROOT' && rootFrame)) && <div className="flex shrink-0 opacity-0 group-hover/layer:opacity-100 group-focus-within/layer:opacity-100">
          <button title={id === 'ROOT' ? 'Duplicate frame' : 'Duplicate layer'} aria-label={id === 'ROOT' ? 'Duplicate frame' : 'Duplicate layer'} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => id === 'ROOT' ? rootFrame?.duplicate() : duplicate(id)}><Copy className="size-3.5" /></button>
          <button title={id === 'ROOT' ? rootFrame?.deleteDisabled ? 'Keep at least one screen on this page' : 'Delete frame' : 'Delete layer'} aria-label={id === 'ROOT' ? 'Delete frame' : 'Delete layer'} disabled={id === 'ROOT' && rootFrame?.deleteDisabled} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-40 disabled:cursor-not-allowed" onClick={() => id === 'ROOT' ? setConfirmDelete(true) : attempt(() => { actions.delete(id); actions.selectNode(item.data.parent!); })}><Trash2 className="size-3.5" /></button>
        </div>}
      </div>
      {children.length > 0 && !collapsed.has(id) && <div role="group">{children.map(child => rows(child, depth + 1))}</div>}
    </div>;
  }
  const utilities = onOpenShortcuts && <div className={`border-t border-line-soft p-2 ${panelCollapsed ? 'mt-auto flex flex-col items-center' : 'flex flex-col gap-1'}`}>
    <button type="button" title="Keyboard shortcuts" aria-label="Keyboard shortcuts" className="flex items-center gap-2 rounded p-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground" onClick={onOpenShortcuts}><Command className="size-4 shrink-0" />{!panelCollapsed && 'Keyboard shortcuts'}</button>
  </div>;
  if (panelCollapsed) return <div data-layers-collapsed="true" className="flex h-full flex-col items-center gap-1 py-2">
    <button aria-label="Expand layers panel" aria-expanded={false} title="Expand layers panel" className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => setPanelCollapsed(false)}><ChevronRight className="size-4" /></button>
    <div className="my-1 h-px w-6 bg-border" />
    {panelMode && <LeftPanelTabs compact />}
    <button aria-label="Show layers" title="Layers" className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => setPanelCollapsed(false)}><Layers className="size-4" /></button>
    {utilities}
    <LeftPanelFooter />
  </div>;
  return <div className="flex h-full min-h-0 flex-col" onKeyDown={event => {
      event.stopPropagation();
      if ((event.key === 'Delete' || event.key === 'Backspace') && !event.ctrlKey && !event.metaKey && !event.altKey && !(event.target as HTMLElement).closest('input, textarea, [contenteditable="true"]') && query.getEvent('selected').contains('ROOT') && rootFrame && !rootFrame.deleteDisabled) {
        event.preventDefault(); setConfirmDelete(true);
      }
    }}>
    {panelMode ? <LeftPanelHeader action={<button aria-label="Minimize layers panel" aria-expanded={true} title="Minimize layers panel" className="flex size-8 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => setPanelCollapsed(true)}><ChevronLeft className="size-4" /></button>} /> : <div className="flex items-center gap-2 border-b border-line-soft p-4"><Layers className="size-4 text-muted-foreground" /><h2 className={LABEL}>Layers</h2><button aria-label="Minimize layers panel" aria-expanded={true} title="Minimize layers panel" className="ml-auto rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => setPanelCollapsed(true)}><ChevronLeft className="size-4" /></button></div>}

    {panelMode?.pageSelector && (showSections ? <CanvasMinimap>{panelMode.pageSelector}</CanvasMinimap> : <div className="border-b border-line-soft p-3">{panelMode.pageSelector}</div>)}
    {showSections && <SectionsList />}
    <div role="tree" aria-label="Layers" aria-multiselectable="true" className="min-h-0 flex-1 overflow-auto p-2">{rows('ROOT', 0)}</div>
    {error && <p role="alert" className="px-3 text-xs text-destructive">{error}</p>}
    {utilities}
    <LeftPanelFooter />
    <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Delete {rootFrame?.name}?</AlertDialogTitle><AlertDialogDescription>This removes the frame for everyone. Undo will not bring it back.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { rootFrame?.delete(); setConfirmDelete(false); }}>Delete</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
