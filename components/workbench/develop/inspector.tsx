'use client';

import { useEditor } from '@craftjs/core';
import { useCallback, useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Code2, Copy, Search, X } from 'lucide-react';
import { resolver } from '@/components/blocks/registry';
import { getElementDoc } from '@/components/blocks/docs';
import { usePlay } from '@/components/play/play-context';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { FileRecord, Screen } from '@/lib/files/repository';
import { isResponsive, resolve, breakpointForWidth } from '@/lib/responsive';
import { PANEL } from '../chrome';
import { SegmentedControl, SegmentedItem } from '../segmented-control';
import { DevelopNotes } from './notes';
import { useSettledEditorState } from '../use-settled-editor-state';
import { copySelectionPng } from '../copy-selection-png';
import { selectionCode } from '../selection-code';
import { componentName, componentPath, componentType, findComponents, isTyping, matchingCommands } from './model';

type Box = { x: number; y: number; width: number; height: number };
type Measurement = { box: Box; css: Record<string, string> };
const cssKeys = ['display', 'flexDirection', 'justifyContent', 'alignItems', 'gap', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'flexGrow', 'flexShrink', 'flexBasis', 'boxSizing'] as const;
function measure(dom: HTMLElement): Measurement {
  const rect = dom.getBoundingClientRect(); const style = getComputedStyle(dom);
  return { box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, css: Object.fromEntries(cssKeys.map(key => [key, style[key]])) };
}
const format = (value: unknown) => JSON.stringify(value, null, 2);
const displayProps = (value: unknown) => JSON.stringify(value, (_key, item) => {
  if (typeof item !== 'string') return item;
  if (item.startsWith('data:')) return `[Embedded ${item.slice(5, item.indexOf(';'))} · full data included when copied]`;
  if (item.length > 500) return `${item.slice(0, 250)}… [full value included when copied]`;
  return item;
}, 2);

/** Lives only in the disabled, independent Player editor. Never mutates Craft or the file. */
export function DevelopInspector({ file, screen }: { file: FileRecord; screen: Screen }) {
  const { query } = useEditor();
  const snapshot = useSettledEditorState();
  // Linked slots may be added by Craft during render; observe only settled snapshots.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const nodes = useMemo(() => query.getSerializedNodes(), [query, snapshot]);
  const play = usePlay();
  const [inspect, setInspect] = useState(true);
  const [layout, setLayout] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(() => new URLSearchParams(window.location.search).get('node'));
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [childBoxes, setChildBoxes] = useState<Box[]>([]);
  const [palette, setPalette] = useState(false);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(0);
  const [result, setResult] = useState<{ title: string; text: string; ids?: string[] } | null>(null);
  const [panelSize, setPanelSize] = useState<{ width: number; height?: number }>({ width: 480 });
  const [position, setPosition] = useState({ x: 24, y: 100 });
  const [toast, setToast] = useState<{ message: string; retry?: () => void } | null>(null);
  const target = selected && nodes[selected] ? selected : hover;
  const node = target ? nodes[target] : undefined;
  const commands: Array<readonly [string, string]> = [...matchingCommands(search)];
  if (search.startsWith('/props ') && node) {
    const prefix = search.slice(7).toLowerCase();
    commands.unshift(...Object.keys(node.props).filter(key => key.toLowerCase().startsWith(prefix)).map(key => [`/props ${key}`, 'Inspect this property'] as const));
  }
  const matches = findComponents(nodes, search);
  const commandMode = search.startsWith('/');
  const choices = commandMode ? commands.map(([id, description]) => ({ id, label: id, description })) : matches.map(id => ({ id, label: componentName(nodes[id]), description: componentPath(nodes, id).join(' / ') }));
  const index = Math.min(active, Math.max(0, choices.length - 1));

  const focusNode = useCallback((id: string) => {
    setSelected(id); setHover(null); setResult(null); setInspect(true);
    query.getNodes()[id]?.dom?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  }, [query]);

  useEffect(() => {
    if (!toast || toast.retry) return;
    const timer = setTimeout(() => setToast(null), 3000); return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === '/') { event.preventDefault(); setPalette(true); setSearch(''); setActive(0); }
      if (event.key === 'Escape' && !palette) { event.preventDefault(); setSelected(null); setHover(null); setResult(null); }
    };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [palette]);

  useEffect(() => {
    if (!inspect || palette) return;
    let timer: ReturnType<typeof setTimeout>;
    const find = (event: MouseEvent) => {
      const element = event.target as HTMLElement;
      if (element.closest('[data-develop-ui]')) return null;
      const entries = Object.entries(query.getNodes()).filter(([, n]) => n.dom?.contains(element));
      entries.sort((a, b) => a[1].dom === b[1].dom ? 0 : a[1].dom?.contains(b[1].dom) ? 1 : -1);
      return entries[0]?.[0] ?? null;
    };
    const move = (event: MouseEvent) => { clearTimeout(timer); const id = find(event); timer = setTimeout(() => setHover(id), 180); };
    const click = (event: MouseEvent) => {
      const id = find(event); if (!id) return;
      event.preventDefault(); event.stopImmediatePropagation(); setSelected(id); setHover(null); setResult(null);
    };
    const preventFocus = (event: MouseEvent) => { if (find(event)) event.preventDefault(); };
    document.addEventListener('mousedown', preventFocus, true);
    document.addEventListener('mousemove', move);
    document.addEventListener('click', click, true);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', preventFocus, true); document.removeEventListener('mousemove', move); document.removeEventListener('click', click, true); };
  }, [inspect, palette, query]);

  useEffect(() => {
    if (!target || !inspect) return;
    const dom = query.getNodes()[target]?.dom; if (!dom) return;
    const update = () => {
      setMeasurement(measure(dom));
      const current = query.getNodes()[target];
      setChildBoxes([...current.data.nodes, ...Object.values(current.data.linkedNodes)].flatMap(id => {
        const child = query.getNodes()[id]?.dom; return child ? [measure(child).box] : [];
      }));
    };
    update(); const observer = new ResizeObserver(update); observer.observe(dom);
    window.addEventListener('resize', update); window.addEventListener('scroll', update, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [target, inspect, query, snapshot]);

  async function copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); setToast({ message: `${label} copied` }); }
    catch { setToast({ message: 'Couldn’t copy. Try again.', retry: () => { void copy(text, label); } }); }
  }
  async function copyImage() {
    const dom = target ? query.getNodes()[target]?.dom : null;
    if (!dom) { setToast({ message: 'This component is not visible in the current state.' }); return; }
    try { await copySelectionPng([dom]); setToast({ message: 'Component image copied' }); }
    catch { setToast({ message: 'Couldn’t copy the image. Try again.', retry: () => { void copyImage(); } }); }
  }
  function props(all = false) {
    if (!node) return {};
    const component: { craft?: { props?: object } } = resolver[componentType(node) as keyof typeof resolver] ?? {};
    return all ? { ...component.craft?.props, ...node.props } : node.props;
  }
  function execute(command: string) {
    if (command === '/layout') { if (!target) setSelected('ROOT'); setLayout(value => !value); setInspect(true); setPalette(false); return; }
    if (!node || !target) { setToast({ message: 'Select a component first, or search for one.' }); return; }
    setSelected(target); setInspect(true);
    const title = componentName(node); const type = componentType(node);
    if (command === '/parent') { if (node.parent) focusNode(node.parent); else setToast({ message: 'This is the root frame.' }); }
    else if (command === '/children' || command === '/instances') {
      const ids = command === '/children' ? [...node.nodes, ...Object.values(node.linkedNodes)] : Object.keys(nodes).filter(id => componentType(nodes[id]) === type && (type !== 'CustomComponent' || nodes[id].props.componentId === node.props.componentId));
      setResult({ title: command === '/children' ? 'Direct children' : 'Instances in this screen', ids, text: ids.map(id => `${componentPath(nodes, id).join(' / ')} [${id}]`).join('\n') || 'None' });
    } else if (command === '/props' || command === '/props all') setResult({ title: command === '/props' ? 'Configured props' : 'Props including registered defaults', text: format(props(command.endsWith(' all'))) });
    else if (command.startsWith('/props ')) setResult({ title: command.slice(7), text: format(node.props[command.slice(7)]) ?? 'Property not configured' });
    else if (command === '/overrides') {
      const component: { craft?: { props?: Record<string, unknown> } } = resolver[type as keyof typeof resolver] ?? {};
      setResult({ title: 'Different from registered defaults', text: format(Object.fromEntries(Object.entries(node.props).filter(([key, value]) => format(value) !== format(component.craft?.props?.[key])))) });
    } else if (command === '/docs') { const doc = getElementDoc(type); setResult({ title: `${title} — local reference`, text: `${doc.summary}\n\n${doc.usage}\n\nThis is the local placeholder reference. Live Dream Docs is not connected.` }); }
    else if (command === '/definition') setResult({ title: 'Saved custom component definition', text: typeof node.props.layout === 'string' ? format(JSON.parse(node.props.layout)) : 'Source-file mappings are not connected for this component. Use /usage for a runnable Dreamscape preview.' });
    else if (command.startsWith('/why ')) {
      const dimension = command.slice(5);
      const dom = query.getNodes()[target]?.dom; const live = dom ? measure(dom) : null;
      const bp = breakpointForWidth(screen.stageWidth);
      const configured = Object.fromEntries(Object.entries(node.props).filter(([key]) => new RegExp(`${dimension}|flex|fill`, 'i').test(key)).map(([key, value]) => [key, isResponsive(value) ? resolve(value, bp) : value]));
      setResult({ title: `How ${dimension} is set`, text: `Screen: ${screen.stageWidth}px (${bp})\n\nConfigured at this breakpoint:\n${format(configured)}\n\nBrowser layout (CSS px):\n${format(live?.css ?? {})}\n\nParent: ${node.parent ? componentName(nodes[node.parent]) : 'Screen'}\nParent padding, flex/grid rules and content also constrain the result. Browser values are computed, not design-token provenance.` });
    } else if (command === '/usage') setResult({ title: 'Preview code — Dreamscape runtime required', text: selectionCode(nodes, target) });
    else if (command === '/copy image') void copyImage();
    else if (command === '/copy props') void copy(format(props()), 'Props');
    else if (command === '/copy usage') void copy(selectionCode(nodes, target), 'Preview code');
    else if (command === '/copy context') void copy(`${title}\n${componentPath(nodes, target).join(' / ')}\nScreen: ${screen.name} (${screen.stageWidth}px)\nConfigured props:\n${format(props())}\nComputed layout (CSS px):\n${format(query.getNodes()[target]?.dom ? measure(query.getNodes()[target].dom!).css : {})}\nPreview code (Dreamscape runtime required):\n${selectionCode(nodes, target)}`, 'Component context');
    else if (command === '/copy link') { const url = new URL(`/f/${file.id}/develop`, window.location.origin); url.searchParams.set('screen', screen.id); url.searchParams.set('node', target); void copy(url.href, 'Component link'); }
    setPalette(false);
  }
  function resizePanel(event: ReactPointerEvent<HTMLElement>, corner: boolean) {
    event.preventDefault(); event.stopPropagation();
    const handle = event.currentTarget;
    const rect = handle.closest('section')!.getBoundingClientRect();
    const startX = event.clientX; const startY = event.clientY;
    handle.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => setPanelSize({
      width: Math.min(Math.max(320, rect.width + e.clientX - startX), window.innerWidth - rect.left - 8),
      height: corner ? Math.min(Math.max(208, rect.height + e.clientY - startY), window.innerHeight - rect.top - 8) : panelSize.height,
    });
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      handle.removeEventListener('lostpointercapture', end);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    handle.addEventListener('lostpointercapture', end);
  }
  function choose(id: string) { if (commandMode) execute(id); else { focusNode(id); setPalette(false); } }
  const box = measurement?.box;
  const currentStyle = measurement?.css;
  // Portalled chrome inherits the editor palette, never the prototype's theme.
  return createPortal(<div data-develop-ui className="text-foreground">
    <nav aria-label="Develop toolbar" className={`${PANEL} fixed top-3 left-1/2 z-40 flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-2 p-2`}>
      <a href={`/f/${file.id}#s=${screen.id}`} className="flex items-center gap-1 px-2 text-sm"><ArrowLeft size={14} /> Design</a>
      <span className="px-2 text-sm font-semibold">Develop</span>
      <select aria-label="Develop screen" value={screen.id} onChange={event => play.navigate(event.target.value)} className="max-w-44 rounded-md border bg-card p-1.5 text-sm">
        {(file.screens ?? []).filter(s => s.kind !== 'overlay').map(s => <option key={s.id} value={s.id}>{file.pages?.find(p => p.id === s.pageId)?.name} / {s.name}</option>)}
      </select>
      <SegmentedControl aria-label="Developer mode" value={inspect ? 'inspect' : 'interact'} onValueChange={value => { if (value) { setInspect(value === 'inspect'); setHover(null); } }} className="!w-auto shrink-0">
        <SegmentedItem value="inspect" className="px-3">Inspect</SegmentedItem>
        <SegmentedItem value="interact" className="px-3">Interact</SegmentedItem>
      </SegmentedControl>
      <Button variant={layout ? 'secondary' : 'ghost'} aria-pressed={layout} onClick={() => { setInspect(true); if (!target) setSelected('ROOT'); setLayout(!layout); }}>Show layout</Button>
      <Button variant="ghost" onClick={() => { setSearch(''); setActive(0); setPalette(true); }}><Search size={14} /> Find <kbd>/</kbd></Button>
      <DevelopNotes file={file} screen={screen} inspecting={inspect} onInspect={focusNode} />
    </nav>
    {inspect && node && box && <>
      <div aria-hidden className="pointer-events-none fixed z-30 border-2 border-violet-400" style={{ left: box.x, top: box.y, width: box.width, height: box.height }} />
      {layout && <>
        {childBoxes.map((rect, i) => <div key={i} aria-hidden className="pointer-events-none fixed z-30 border border-dashed border-cyan-400" style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }} />)}
        <div aria-hidden className="pointer-events-none fixed z-30 border-emerald-400/20" style={{ left: box.x, top: box.y, width: box.width, height: box.height, borderTopWidth: currentStyle?.paddingTop, borderRightWidth: currentStyle?.paddingRight, borderBottomWidth: currentStyle?.paddingBottom, borderLeftWidth: currentStyle?.paddingLeft }} />
      </>}
      {!selected && <div className={`${PANEL} pointer-events-none fixed z-40 max-w-80 p-3 text-xs`} style={{ left: Math.max(8, Math.min(box.x, window.innerWidth - 328)), top: Math.max(76, Math.min(box.y + box.height + 8, window.innerHeight - 110)) }}>
        <strong>{componentName(node)}</strong> · {Math.round(box.width)} × {Math.round(box.height)} px
        <p className="mt-1 text-muted-foreground">{currentStyle?.display} · {currentStyle?.flexDirection} · gap {currentStyle?.gap}</p><p className="mt-1 truncate text-muted-foreground">{Object.entries(node.props).filter(([key, value]) => ['label', 'variant', 'size', 'widthMode', 'role'].includes(key) && typeof value !== 'object').slice(0, 3).map(([key, value]) => `${key}: ${value}`).join(' · ')}</p><p className="mt-1">Click to inspect · / to search</p>
      </div>}
    </>}
    {inspect && selected && node && <section aria-label="Component details" className={`${PANEL} fixed z-40 flex min-h-52 flex-col overflow-hidden text-sm`} style={{ left: position.x, top: position.y, width: panelSize.width, height: panelSize.height, maxWidth: `calc(100vw - ${position.x + 8}px)`, maxHeight: `calc(100vh - ${position.y + 8}px)` }}>
      <header className="flex shrink-0 cursor-move touch-none items-center gap-2 border-b p-3" onPointerDown={event => {
        if ((event.target as HTMLElement).closest('button')) return;
        const start = { x: event.clientX, y: event.clientY, ...{ left: position.x, top: position.y } };
        const element = event.currentTarget; element.setPointerCapture(event.pointerId);
        const move = (e: PointerEvent) => setPosition({ x: Math.max(8, Math.min(window.innerWidth - Math.min(panelSize.width, window.innerWidth - 16) - 8, start.left + e.clientX - start.x)), y: Math.max(76, Math.min(window.innerHeight - 120, start.top + e.clientY - start.y)) });
        const up = () => { element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', up); element.removeEventListener('pointercancel', up); };
        element.addEventListener('pointermove', move); element.addEventListener('pointerup', up); element.addEventListener('pointercancel', up);
      }}><Code2 size={16} /><strong className="flex-1 truncate">{componentName(node)}</strong><Button size="icon" variant="ghost" aria-label="Close details" onClick={() => { setSelected(null); setResult(null); }}><X size={15} /></Button></header>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4 pb-6">
        <p className="break-words text-xs text-muted-foreground">{componentPath(nodes, selected).join(' / ')}</p>
        <div className="flex flex-wrap gap-1"><Button size="sm" variant="secondary" disabled={!node.parent} onClick={() => node.parent && focusNode(node.parent)}>Parent</Button><Button size="sm" variant="secondary" onClick={() => execute('/usage')}>Preview code</Button><Button size="sm" variant="secondary" onClick={() => execute('/copy props')}><Copy size={12} /> Props</Button><Button size="sm" variant="secondary" onClick={() => execute('/copy context')}>Copy context</Button></div>
        {[...node.nodes, ...Object.values(node.linkedNodes)].length > 0 && <div className="flex flex-wrap gap-1">{[...node.nodes, ...Object.values(node.linkedNodes)].map(id => <Button key={id} variant="outline" size="sm" onClick={() => focusNode(id)}>{componentName(nodes[id])}</Button>)}</div>}
        {result ? <><div className="flex items-center gap-2"><strong className="flex-1">{result.title}</strong><Button size="sm" variant="ghost" onClick={() => void copy(result.text, 'Details')}>Copy</Button><Button size="sm" variant="ghost" onClick={() => setResult(null)}>Back</Button></div><div className="flex flex-wrap gap-1">{result.ids?.map(id => <Button key={id} size="sm" variant="outline" onClick={() => focusNode(id)}>{componentName(nodes[id])} · {id}</Button>)}</div><pre className="whitespace-pre-wrap break-all text-xs">{result.text}</pre></> : <>
          <div><strong>Rendered size</strong><p className="mt-1 text-muted-foreground">{box ? `${Math.round(box.width)} × ${Math.round(box.height)} CSS px` : 'Not visible in this state'}</p></div>
          <div><strong>Configured props</strong><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">{displayProps(props())}</pre></div>
          {layout && <div><strong>Computed layout</strong><p className="my-2 text-xs text-muted-foreground">Purple: selected · cyan: children · green: padding</p><pre className="whitespace-pre-wrap text-xs">{format(currentStyle)}</pre></div>}
        </>}
      </div>
      <div role="separator" aria-label="Resize details width" aria-orientation="vertical" aria-valuemin={320} aria-valuemax={Math.max(320, window.innerWidth - position.x - 8)} aria-valuenow={Math.round(panelSize.width)} tabIndex={0}
        className="absolute right-0 top-14 bottom-5 z-10 w-2 cursor-ew-resize touch-none hover:bg-violet-400/30 focus-visible:bg-violet-400/30 focus-visible:outline-none"
        onPointerDown={event => resizePanel(event, false)} onKeyDown={event => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault(); const delta = (event.shiftKey ? 50 : 10) * (event.key === 'ArrowRight' ? 1 : -1);
          setPanelSize(size => ({ ...size, width: Math.min(Math.max(320, size.width + delta), window.innerWidth - position.x - 8) }));
        }} />
      <div aria-hidden="true" title="Drag to resize" className="absolute bottom-0 right-0 z-20 flex size-6 cursor-nwse-resize touch-none items-center justify-center rounded-br-xl bg-card text-muted-foreground hover:text-foreground" onPointerDown={event => resizePanel(event, true)}><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor"><path d="M3 11L11 3M7 11L11 7" /></svg></div>
    </section>}
    {!node && inspect && <p className={`${PANEL} pointer-events-none fixed bottom-5 left-1/2 z-30 -translate-x-1/2 px-4 py-2 text-sm`}>Hover to inspect · click to pin · / to find a component</p>}
    <Dialog open={palette} onOpenChange={setPalette}><DialogContent data-develop-ui className="top-[38%] sm:max-w-2xl" aria-describedby="develop-search-help">
      <DialogTitle>Find components or run a command</DialogTitle>
      <DialogDescription id="develop-search-help">{node ? `Target: ${componentName(node)}` : 'Search this screen by component name or text.'}</DialogDescription>
      <input autoFocus role="combobox" aria-label="Developer command" aria-expanded="true" aria-controls="develop-results" aria-autocomplete="list" aria-activedescendant={choices.length ? `dev-result-${index}` : undefined} value={search} placeholder="Search components, or type / for commands" className="w-full rounded-md border bg-muted px-3 py-3 text-base outline-none focus:ring-2 focus:ring-ring" onChange={event => { setSearch(event.target.value); setActive(0); }} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActive((index + (event.key === 'ArrowDown' ? 1 : -1) + Math.max(1, choices.length)) % Math.max(1, choices.length)); }
        if (event.key === 'Enter' && choices[index]) { event.preventDefault(); choose(choices[index].id); }
        if (event.key === 'Tab' && commandMode && choices[index]) { event.preventDefault(); setSearch(choices[index].id); setActive(0); }
      }} />
      <div id="develop-results" role="listbox" aria-label="Suggestions" className="max-h-72 overflow-auto">{choices.map((choice, i) => <div id={`dev-result-${i}`} key={choice.id} role="option" aria-selected={i === index} onMouseDown={event => event.preventDefault()} onClick={() => choose(choice.id)} className={`cursor-pointer rounded-md px-3 py-2 ${i === index ? 'bg-accent' : 'hover:bg-muted'}`}><div className="font-medium">{choice.label}</div><p className="truncate text-xs text-muted-foreground">{choice.description}</p></div>)}{!choices.length && <p className="p-3 text-muted-foreground">No matches in this screen.</p>}</div>
      <p className="text-xs text-muted-foreground">↑ ↓ Navigate · Tab Complete command · Enter Open · Esc Close</p>
    </DialogContent></Dialog>
    {toast && <div role={toast.retry ? 'alert' : 'status'} className={`${PANEL} fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-3 px-4 py-3 text-sm`}><span>{toast.message}</span>{toast.retry && <><Button size="sm" onClick={toast.retry}>Retry</Button><Button size="sm" variant="ghost" onClick={() => setToast(null)}>Dismiss</Button></>}</div>}
  </div>, document.body);
}
