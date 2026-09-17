'use client';
import { DRAG_MOVE_TO } from './drag-surfaces';
import { startAreaPrompt } from './chat/canvas-prompt-controls';
import { useEditor } from '@craftjs/core';
import { useEffect, useState } from 'react';
import { nanoid } from 'nanoid';
import { isElementLike } from '@/lib/dom';
import { resolve } from '@/lib/responsive';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useCanvasDocument } from './canvas-frame';
import { useStage } from './stage-context';
import { MENU_POPOVER, MENU_ROW } from './chrome';
import { duplicateSelection, reorderSelection, selectionRoots } from './selection-shortcuts';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { selectionCode } from './selection-code';
import { copyElements, readElements, pasteElements, ELEMENT_CLIPBOARD_TYPE } from './element-clipboard';
import { copySelectionPng } from './copy-selection-png';
import { componentFromSelection, detachInstance, isComponentLayout, replaceSelection, type ComponentDefinition, type Tree } from '@/lib/custom-components/model';
import { useComponentLibrary } from './component-builder/library-context';
import { buildLayoutAlignmentContext } from './inspector/inspector';
import type { LayoutBoxProps } from '@/lib/classes';
import { wrapInFrame } from './wrap-in-frame';

const SELECTION_MENU_ROW = `${MENU_ROW} grid grid-cols-[minmax(0,1fr)_48px_12px] whitespace-nowrap [&>svg]:col-start-3 [&>svg]:ml-0 [&>svg]:size-3`;
const SELECTION_MENU_KEY = 'col-start-2 justify-self-end rounded border border-line-soft bg-muted px-1 text-[10px] leading-4 font-sans text-muted-foreground';

export function FrameSelectionActions({ active = true, builder = false, alignmentScope = 'all', onZoomSelection }: { active?: boolean; builder?: boolean; alignmentScope?: 'all' | 'size'; onZoomSelection?: () => void }) {
  const { actions, query } = useEditor();
  const canvas = useCanvasDocument();
  const library = useComponentLibrary();
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState<{ definition: ComponentDefinition; layout: string; source: string } | null>(null);
  function createComponent() {
    if (!library?.create) return;
    let nodes = query.getSerializedNodes();
    const ids = selectionRoots(nodes, [...query.getState().events.selected]);
    if (!ids.length) return;
    let source = ids[0];
    if (ids.length > 1) {
      source = nanoid();
      const parent = nodes[ids[0]].parent;
      const direction = parent ? resolve(nodes[parent].props.direction, breakpoint) : 'column';
      const wrapped = wrapInFrame(nodes, ids, source, direction === 'row' ? 'row' : 'column');
      if (!wrapped) return;
      nodes = wrapped;
    }
    const definition = componentFromSelection(JSON.stringify(nodes), source);
    const tree = JSON.parse(definition.layout) as Tree;
    for (const [id, node] of Object.entries(tree)) if (node.type.resolvedName === 'CustomComponent') detachInstance(tree, id);
    definition.layout = JSON.stringify(tree);
    if (!isComponentLayout(definition.layout)) { setNotice('This selection cannot become a component.'); return; }
    setCreating({ definition, source, layout: JSON.stringify(nodes) });
  }
  function detach() {
    const tree = query.getSerializedNodes() as Tree;
    const ids = [...query.getState().events.selected].filter(id => tree[id]?.type.resolvedName === 'CustomComponent');
    if (!ids.length) return;
    ids.forEach(id => detachInstance(tree, id));
    actions.deserialize(JSON.stringify(tree)); actions.selectNode(ids);
  }
  function copyPng() {
    const nodes = query.getSerializedNodes();
    const elements = selectionRoots(nodes, [...query.getState().events.selected]).map(id => query.node(id).get().dom).filter((el): el is HTMLElement => !!el);
    setNotice('Copying PNG…');
    void copySelectionPng(elements).then(() => setNotice('PNG copied'), () => setNotice('Could not copy PNG. Check clipboard permission and image access.'));
  }
  const { breakpoint } = useStage();
  const [menu, setMenu] = useState<{ x: number; y: number; docsName: string | null } | null>(null);
  const [code, setCode] = useState<{ name: string; text: string } | null>(null);
  const [dreamDocs, setDreamDocs] = useState<string | null>(null);
  const [componentCode, setComponentCode] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState('Copy code');
  function wrap(direction?: 'row' | 'column') {
    const selected = [...query.getState().events.selected];
    const nodes = query.getSerializedNodes();
    const parent = nodes[selected[0]]?.parent;
    const inherited = parent ? resolve(nodes[parent]?.props.direction, breakpoint) : 'column';
    const id = nanoid();
    const next = wrapInFrame(nodes, selected, id, direction ?? (inherited === 'row' ? 'row' : 'column'));
    if (!next) return;
    actions.deserialize(JSON.stringify(next));
    actions.selectNode(id);
    setMenu(null);
  }
  useEffect(() => {
    if (!active) return;
    const docs = [...new Set([document, ...(canvas?.document ? [canvas.document] : [])])];
    const blocked = () => (!builder && !!document.querySelector('[aria-label="Component Builder"]')) || !!document.querySelector('[role="dialog"]:not([aria-label="Component Builder"]), [role="alertdialog"], [role="menu"]');
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || blocked() || !query.getOptions().enabled) return;
      const target = isElementLike(event.target) ? event.target : null;
      if (target?.closest('input,textarea,select,[contenteditable="true"],[contenteditable=""],[role="combobox"],[role="listbox"],[role="separator"]')) return;
      const ids = [...query.getState().events.selected];
      const nodes = query.getSerializedNodes();
      const mod = event.metaKey || event.ctrlKey;
      const consume = () => { event.preventDefault(); event.stopPropagation(); };
      if (builder && event.shiftKey && !mod && (event.code === 'Digit2' || event.key === '@')) { consume(); onZoomSelection?.(); return; }
      if (!ids.length) return;
      const keyName = event.key.toLowerCase();
      if (mod && event.altKey && !event.shiftKey && (event.code === 'KeyK' || keyName === 'k')) { consume(); createComponent(); return; }
      if (mod && event.altKey && !event.shiftKey && (event.code === 'KeyX' || keyName === 'x')) { consume(); detach(); return; }
      if (mod && event.shiftKey && !event.altKey && keyName === 'c') { consume(); copyPng(); return; }
      if (event.altKey && !mod && !event.shiftKey && ['KeyH', 'KeyV'].includes(event.code)) {
        const candidate = [ids[0], nodes[ids[0]]?.parent].find(id => id && typeof nodes[id]?.type === 'object' && nodes[id].type.resolvedName === 'LayoutBox' && nodes[id].props.mode !== 'grid');
        if (candidate) {
          consume();
          const context = buildLayoutAlignmentContext({ query, actions, breakpoint, layoutContainer: { id: candidate, props: nodes[candidate].props as LayoutBoxProps, childCount: nodes[candidate].nodes.length } });
          const main = (event.code === 'KeyH') === (context.direction === 'row');
          const prop = main ? 'justify' : 'align';
          if (builder) actions.setProp(candidate, p => {
            if (alignmentScope === 'all') {
              p[prop] = { mobile: 'center' };
              if (p.componentShared) delete p.componentShared[prop];
              for (const size of Object.keys(p.sizeStyles ?? {})) delete p.sizeStyles[size][prop];
            } else {
              const base = p[prop];
              if (p.componentShared?.[prop] === undefined) p.componentShared = { ...p.componentShared, [prop]: resolve(base, 'mobile') };
              p[prop] = { mobile: resolve(base, 'mobile'), tablet: resolve(base, 'tablet'), desktop: resolve(base, 'desktop'), [breakpoint]: 'center' };
            }
          });
          else context.onChange({ [prop]: 'center' });
        }
        return;
      }
      if (event.altKey) return;
      if (mod && !event.shiftKey && event.key.toLowerCase() === 'd') {
        const copy = duplicateSelection(nodes, ids);
        if (copy.selected.length) { consume(); actions.deserialize(JSON.stringify(copy.nodes)); actions.selectNode(copy.selected); }
        return;
      }
      if (mod) return;
      if (event.key === 'Escape') { consume(); actions.selectNode(); return; }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const removable = selectionRoots(nodes, ids).filter(id => query.node(id).isDeletable());
        if (removable.length) { consume(); actions.delete(removable); }
        return;
      }
      // Keep toolbar and inspector buttons keyboard accessible; navigation owns the canvas only.
      const canvasFocus = target?.ownerDocument === canvas?.document || !target || ['BODY', 'HTML'].includes(target.tagName);
      if (canvasFocus && (event.key === 'Enter' || event.key === 'Tab')) {
        const id = ids[0], node = nodes[id];
        let next: string[] = [];
        if (event.key === 'Enter') next = event.shiftKey ? (node.parent ? [node.parent] : []) : [...Object.values(node.linkedNodes), ...node.nodes];
        else if (node.parent) {
          const parent = nodes[node.parent];
          const siblings = [...Object.values(parent.linkedNodes), ...parent.nodes];
          const index = siblings.indexOf(id);
          next = [siblings[(index + (event.shiftKey ? -1 : 1) + siblings.length) % siblings.length]];
        }
        if (next.length) { consume(); actions.selectNode(next); }
        return;
      }
      if (canvasFocus && !event.shiftKey && event.key.startsWith('Arrow')) {
        const parent = nodes[ids[0]]?.parent;
        const horizontal = parent && resolve(nodes[parent].props.direction, breakpoint) === 'row';
        const delta = event.key === (horizontal ? 'ArrowLeft' : 'ArrowUp') ? -1 : event.key === (horizontal ? 'ArrowRight' : 'ArrowDown') ? 1 : 0;
        if (delta) {
          consume();
          const next = reorderSelection(nodes, ids, delta);
          if (next) { actions.deserialize(JSON.stringify(next)); actions.selectNode(ids); }
        }
        return;
      }
      if (!event.repeat && !event.shiftKey && event.key.toLowerCase() === 'f' && wrapInFrame(nodes, ids, '__frame_check__', 'column')) { consume(); wrap(); }
    };
    const context = (event: MouseEvent) => {
      if (blocked() || !query.getOptions().enabled || !isElementLike(event.target)) return;
      const state = query.getState();
      const hit = Object.values(state.nodes).filter(node => node.dom?.contains(event.target as Node)).sort((a, b) => a.dom?.contains(b.dom) ? 1 : -1)[0];
      if (!hit) return;
      if (![...state.events.selected].some(id => state.nodes[id]?.dom?.contains(event.target as Node))) actions.selectNode(hit.id);
      event.preventDefault(); event.stopPropagation();
      const frame = event.view?.frameElement as HTMLIFrameElement | null;
      const rect = frame?.getBoundingClientRect();
      const sx = frame && rect ? rect.width / frame.clientWidth : 1;
      const sy = frame && rect ? rect.height / frame.clientHeight : 1;
      setMenu({ docsName: hit.id === 'ROOT' || hit.data.name === 'LayoutBox' ? null : String(hit.data.custom.layerName || hit.data.props.name || hit.data.displayName), x: (rect?.left ?? 0) + event.clientX * sx, y: (rect?.top ?? 0) + event.clientY * sy });
    };
    const clipboard = (event: ClipboardEvent) => {
      if (blocked() || !query.getOptions().enabled || !event.clipboardData) return;
      const target = isElementLike(event.target) ? event.target : null;
      if (target?.closest('input,textarea,select,[contenteditable="true"],[contenteditable=""],[role="combobox"]')) return;
      const nodes = query.getSerializedNodes(), ids = [...query.getState().events.selected];
      if (event.type === 'paste') {
        const data = readElements(event.clipboardData.getData(ELEMENT_CLIPBOARD_TYPE) || event.clipboardData.getData('text/plain'));
        if (!data) return;
        const next = pasteElements(nodes, data, ids, builder);
        if (!next) return;
        event.preventDefault(); event.stopPropagation();
        actions.deserialize(JSON.stringify(next.nodes)); actions.selectNode(next.selected);
      } else if (ids.length) {
        const removable = selectionRoots(nodes, ids).filter(id => query.node(id).isDeletable());
        if (event.type === 'cut' && !removable.length) return;
        const data = copyElements(nodes, event.type === 'cut' ? removable : ids);
        event.clipboardData.setData(ELEMENT_CLIPBOARD_TYPE, data);
        event.clipboardData.setData('text/plain', data);
        event.preventDefault(); event.stopPropagation();
        if (event.type === 'cut') actions.delete(removable);
      }
    };
    docs.forEach(doc => { doc.addEventListener('keydown', key, true); doc.addEventListener('contextmenu', context, true); for (const type of ['copy', 'cut', 'paste']) doc.addEventListener(type, clipboard as EventListener, true); });
    return () => docs.forEach(doc => { doc.removeEventListener('keydown', key, true); doc.removeEventListener('contextmenu', context, true); for (const type of ['copy', 'cut', 'paste']) doc.removeEventListener(type, clipboard as EventListener, true); });
  });
  return <><DropdownMenu open={!!menu} onOpenChange={open => { if (!open) setMenu(null); }} modal={false}>
    <DropdownMenuTrigger asChild><button tabIndex={-1} aria-hidden style={{ position: 'fixed', left: menu?.x ?? 0, top: menu?.y ?? 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} /></DropdownMenuTrigger>
    <DropdownMenuContent className={`${MENU_POPOVER} z-[100] w-72`} onCloseAutoFocus={event => event.preventDefault()}><DropdownMenuSub><DropdownMenuSubTrigger disabled={!wrapInFrame(query.getSerializedNodes(), [...query.getState().events.selected], "__frame_check__", "column")} className={SELECTION_MENU_ROW}>Frame<kbd className={SELECTION_MENU_KEY}>F</kbd></DropdownMenuSubTrigger><DropdownMenuSubContent className={`${MENU_POPOVER} z-[100]`}><DropdownMenuItem className={MENU_ROW} onSelect={() => wrap('row')}>Horizontal</DropdownMenuItem><DropdownMenuItem className={MENU_ROW} onSelect={() => wrap('column')}>Vertical</DropdownMenuItem></DropdownMenuSubContent></DropdownMenuSub><DropdownMenuItem className={SELECTION_MENU_ROW} onSelect={() => {
      const id = [...query.getState().events.selected][0];
      const nodes = query.getSerializedNodes();
      if (id && nodes[id]) { setComponentCode(nodes[id].type && typeof nodes[id].type === 'object' && nodes[id].type.resolvedName === 'CustomComponent' ? nodes[id].props.layout : null); setCode({ name: nodes[id].custom.layerName || nodes[id].displayName, text: selectionCode(nodes, id) }); setCopyStatus('Copy code'); }
    }}>View Code</DropdownMenuItem><DropdownMenuItem className={SELECTION_MENU_ROW} onSelect={copyPng}>Copy as PNG<kbd className={SELECTION_MENU_KEY}>⌘⇧C</kbd></DropdownMenuItem>
    <DropdownMenuItem className={SELECTION_MENU_ROW} onSelect={() => window.dispatchEvent(new Event(DRAG_MOVE_TO))}>Move to…</DropdownMenuItem>
    <DropdownMenuItem className={SELECTION_MENU_ROW} onSelect={startAreaPrompt}>Ask AI about an area</DropdownMenuItem>
    {library?.create && <DropdownMenuItem className={SELECTION_MENU_ROW} onSelect={createComponent}>Create Custom Component</DropdownMenuItem>}
    {[...query.getState().events.selected].some(id => query.node(id).get().data.name === 'CustomComponent') && <DropdownMenuItem className={SELECTION_MENU_ROW} onSelect={detach}>Detach instance</DropdownMenuItem>}{menu?.docsName && <DropdownMenuItem className={SELECTION_MENU_ROW} onSelect={() => setDreamDocs(menu.docsName)}>View Dream Docs</DropdownMenuItem>}</DropdownMenuContent>
  </DropdownMenu><Dialog open={!!code} onOpenChange={open => { if (!open) setCode(null); }}><DialogContent className="z-[100] w-[min(960px,90vw)] sm:max-w-none max-h-[85vh] bg-card shadow-panel-lg">
      <DialogTitle>{code?.name} — Code</DialogTitle>
      <DialogDescription>React preview using Dreamscape components. Includes current properties, responsive values, and nested components.</DialogDescription>
      {componentCode && <button className={MENU_ROW} onClick={() => { setCode({ name: 'Component definition', text: selectionCode(JSON.parse(componentCode), 'ROOT') }); setComponentCode(null); setCopyStatus('Copy code'); }}>Open component code</button>}
      <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">React / TSX</span><button className={MENU_ROW} onClick={async () => { try { await navigator.clipboard.writeText(code?.text ?? ''); setCopyStatus('Copied'); } catch { setCopyStatus('Select and copy the code below'); } }}>{copyStatus}</button></div>
      <pre tabIndex={0} className="max-h-[60vh] overflow-auto rounded-lg border bg-background p-4 text-xs"><code>{code?.text.split(/("(?:[^"\\]|\\.)*"|'[^'\n]*'|\b(?:import|from|const|export|default|function|return|true|false|null)\b)/g).map((part, index) => <span key={index} className={/^["']/.test(part) ? 'text-emerald-600 dark:text-emerald-300' : /^(import|from|const|export|default|function|return|true|false|null)$/.test(part) ? 'text-violet-600 dark:text-violet-300' : undefined}>{part}</span>)}</code></pre>
    </DialogContent></Dialog>
    <Dialog open={!!dreamDocs} onOpenChange={open => { if (!open) setDreamDocs(null); }}>
      <DialogContent className="z-[100] flex max-h-[85vh] w-[min(720px,90vw)] flex-col overflow-hidden bg-card shadow-panel-lg sm:max-w-none">
        <div className="shrink-0 space-y-2 pr-8">
          <span className="text-xs font-medium text-muted-foreground">Dream Docs · Preview</span>
          <DialogTitle>{dreamDocs}</DialogTitle>
          <DialogDescription>Explore how to use the {dreamDocs} component in your designs.</DialogDescription>
        </div>
        <div tabIndex={0} role="region" aria-label="Component documentation" className="min-h-0 overflow-y-auto overscroll-contain pr-2 text-sm leading-7 text-muted-foreground">
          <p>This is placeholder documentation for {dreamDocs}. Use this component as part of a larger interface, combining it with other components to create a clear and consistent experience. Its appearance and behavior can be adjusted in the inspector to suit the surrounding design. This space will describe the component’s purpose, common use cases, and the choices available to designers.</p>
          <p className="mt-4">When adding {dreamDocs} to a layout, consider its relationship to nearby content. Give it enough space to be understood, check how it behaves at different container widths, and choose styles that match your design system. Future Dream Docs will include practical examples, accessibility guidance, supported properties, and recommendations for handing the component off to development. The content shown here is a preview of that documentation experience.</p>
        </div>
      </DialogContent>
    </Dialog>
    <Dialog open={!!creating} onOpenChange={open => { if (!open) setCreating(null); }}><DialogContent className="z-[100] bg-card">
      <DialogTitle>Create Custom Component</DialogTitle><DialogDescription>{builder ? 'Save a reusable copy of this selection to Custom. Your current component stays editable.' : 'Name your component. The selection will become an instance in this frame.'}</DialogDescription>
      <input aria-label="Component name" autoFocus maxLength={120} className="rounded border bg-background p-2" value={creating?.definition.name ?? ''} onChange={event => setCreating(current => current && ({ ...current, definition: { ...current.definition, name: event.target.value } }))} />
      <button className="rounded bg-primary p-2 text-primary-foreground disabled:opacity-40" disabled={!creating?.definition.name.trim()} onClick={() => {
        if (!creating || !library?.create) return;
        const definition = { ...creating.definition, name: creating.definition.name.trim() };
        library.create(definition);
        if (!builder) actions.deserialize(replaceSelection(creating.layout, creating.source, definition));
        setCreating(null); setNotice('Component added to Custom');
      }}>Create component</button>
    </DialogContent></Dialog>
    {notice && <div role="status" className="fixed bottom-5 left-1/2 z-[110] -translate-x-1/2 rounded-lg border bg-card px-4 py-2 text-sm shadow-panel-lg">{notice}<button aria-label="Dismiss notification" className="ml-4" onClick={() => setNotice('')}>×</button></div>}
    </>;
}
