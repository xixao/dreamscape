'use client';
import { Editor, Frame, useEditor } from '@craftjs/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Undo2, Redo2, Search, PenLine, X } from 'lucide-react';
import { resolver } from '@/components/blocks/registry';
import type { Page, Screen } from '@/lib/files/repository';
import type { SaveState } from '@/lib/persistence';
import { CompactRootContext, StageProvider } from '../stage-context';
import { PANEL, PANEL_HEADER, LABEL } from '../chrome';
import { Button } from '@/components/ui/button';
import { WriterContext } from './context';
import { WriterNode } from './node';
import { placeWriterPopover } from './placement';
import { updateWriterField, writerTargets, type WriterTarget } from './model';

function SyncLayout({ layout }: { layout: string }) {
  const { actions, query } = useEditor();
  const previous = useRef(layout);
  useEffect(() => {
    if (previous.current === layout) return;
    const before = JSON.parse(previous.current); const after = JSON.parse(layout);
    previous.current = layout;
    for (const id of Object.keys(after)) {
      if (!before[id] || JSON.stringify(before[id].props) === JSON.stringify(after[id].props)) continue;
      if (!query.getState().nodes[id]) continue;
      actions.history.ignore().setProp(id, props => { for (const key of Object.keys(props)) delete props[key]; Object.assign(props, after[id].props); });
    }
  }, [actions, query, layout]);
  return null;
}
function CopyField({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const cancel = useRef(false);
  return <label className="flex flex-col gap-2"><span className={LABEL}>{label}</span>
    <textarea aria-label={label} rows={3} className="w-full resize-y rounded-md border border-border bg-muted p-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={() => { if (!cancel.current) onCommit(draft); cancel.current = false; }}
      onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === 'Escape') { cancel.current = true; setDraft(value); e.currentTarget.blur(); } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
  </label>;
}
interface Edit { screenId: string; before: string; after: string }
export function WriterWorkspace({ fileName, pages, screens, screenId, pageId, appearance, saveState, onSelectScreen, onSelectPage, onChange, onClose, onRetry }: {
  fileName: string; pages: Page[]; screens: Screen[]; screenId: string; pageId: string;
  appearance: string; saveState: SaveState;
  onSelectScreen: (id: string) => void; onSelectPage: (id: string) => void;
  onChange: (screenId: string, layout: string) => void; onClose: () => void; onRetry: () => void;
}) {
  const screen = screens.find(s => s.id === screenId);
  const [selected, setSelected] = useState<string | null>(null);
  const [statePreview, setStatePreview] = useState<{ key: string; state: string } | null>(null);
  const [search, setSearch] = useState('');
  const [missingOnly, setMissingOnly] = useState(false);
  const [history, setHistory] = useState<Edit[]>([]);
  const [future, setFuture] = useState<Edit[]>([]);
  const [preview, setPreview] = useState(0);
  const [zoom, setZoom] = useState(0);
  const [availableWidth, setAvailableWidth] = useState(800);
  const historyRef = useRef<Edit[]>([]);
  const futureRef = useRef<Edit[]>([]);
  const [overflow, setOverflow] = useState(false);
  const canvas = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLElement>(null);
  const [placement, setPlacement] = useState<ReturnType<typeof placeWriterPopover>>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const select = (key: string) => { setSelected(key); setDismissed(null); };
  const targets = useMemo(() => screen ? writerTargets(screen.layout) : [], [screen]);
  const target = targets.find(t => t.key === selected);
  const change = (key: string, prop: string, value: unknown) => {
    if (!screen || saveState === 'conflict') return;
    const after = updateWriterField(screen.layout, key, prop, value);
    if (after === screen.layout) return;
    historyRef.current = [...historyRef.current, { screenId, before: screen.layout, after }]; futureRef.current = [];
    setHistory(historyRef.current); setFuture([]);
    onChange(screenId, after);
  };
  const undo = () => { const edit = historyRef.current.at(-1); if (!edit) return; onChange(edit.screenId, edit.before); if (screenId !== edit.screenId) onSelectScreen(edit.screenId); historyRef.current = historyRef.current.slice(0, -1); futureRef.current = [...futureRef.current, edit]; setHistory(historyRef.current); setFuture(futureRef.current); };
  const redo = () => { const edit = futureRef.current.at(-1); if (!edit) return; onChange(edit.screenId, edit.after); if (screenId !== edit.screenId) onSelectScreen(edit.screenId); futureRef.current = futureRef.current.slice(0, -1); historyRef.current = [...historyRef.current, edit]; setFuture(futureRef.current); setHistory(historyRef.current); };
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (saveState !== 'conflict') { if (e.shiftKey) redo(); else undo(); } }
    };
    window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener);
  });
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const node = Array.from(canvas.current?.querySelectorAll<HTMLElement>('[data-writer-node]') ?? []).find(el => el.dataset.writerNode === selected)?.firstElementChild as HTMLElement | undefined;
      let clipped = false;
      for (let el: HTMLElement | null | undefined = node; el && el !== canvas.current; el = el.parentElement) {
        const style = getComputedStyle(el);
        if ((el.scrollWidth > el.clientWidth + 2 && ['hidden','clip'].includes(style.overflowX)) || (el.scrollHeight > el.clientHeight + 2 && ['hidden','clip'].includes(style.overflowY))) clipped = true;
      }
      setOverflow(clipped);
    }); return () => cancelAnimationFrame(frame);
  }, [selected, screen?.layout, preview, zoom]);
  const locate = (item: WriterTarget) => {
    select(item.key);
    const element = Array.from(canvas.current?.querySelectorAll<HTMLElement>('[data-writer-node]') ?? []).find(el => el.dataset.writerNode === item.key)?.firstElementChild;
    element?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  const visible = targets.filter(t => (!missingOnly || t.missing) && `${t.name} ${t.type} ${t.fields.map(f => t.props[f.prop]).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  useEffect(() => {
    const element = canvas.current; if (!element) return;
    const update = () => setAvailableWidth(Math.max(100, element.clientWidth - 32));
    const observer = new ResizeObserver(update); observer.observe(element); update();
    const finish = () => { (document.activeElement as HTMLElement | null)?.blur?.(); };
    window.addEventListener('beforeunload', finish);
    return () => { observer.disconnect(); window.removeEventListener('beforeunload', finish); };
  }, []);
  useEffect(() => {
    let raf: number;
    const update = () => {
      const host = Array.from(canvas.current?.querySelectorAll<HTMLElement>('[data-writer-node]') ?? []).find(el => el.dataset.writerNode === selected);
      const element = host?.firstElementChild as HTMLElement | undefined;
      if (!element || !target) { setPlacement(null); } else {
        const inline = Array.from(host!.querySelectorAll<HTMLElement>('[data-writer-prop]')).filter(el => el.closest('[data-writer-node]') === host).map(el => el.dataset.writerProp);
        const fields = target.fields.filter(f => !inline.includes(f.prop)).map(f => f.prop);
        setHidden(old => JSON.stringify(old) === JSON.stringify(fields) ? old : fields);
        const bounds = element.getBoundingClientRect();
        const viewport = canvas.current!.getBoundingClientRect();
        const visible = bounds.bottom > viewport.top && bounds.top < viewport.bottom && bounds.right > viewport.left && bounds.left < viewport.right;
        const obstacles = Array.from(document.querySelectorAll<HTMLElement>('[data-writer-panel]')).filter(el => el !== popover.current).map(el => el.getBoundingClientRect()).filter(r => r.width && r.height);
        const next = visible ? placeWriterPopover({ left: 12, top: 12, right: window.innerWidth - 12, bottom: window.innerHeight - 12 }, bounds, obstacles, Math.min(480, (popover.current?.scrollHeight ?? 300))) : null;
        setPlacement(old => JSON.stringify(old) === JSON.stringify(next) ? old : next);
      }
      raf = requestAnimationFrame(update);
    };
    update(); return () => cancelAnimationFrame(raf);
  }, [selected, target]);
  const width = preview || screen?.stageWidth || 1440;
  const scale = zoom ? zoom / 100 : Math.min(1, availableWidth / width);
  return <div className="fixed inset-0 bg-background text-foreground" data-testid="writer-workspace">
    <header data-writer-panel className={`${PANEL} absolute inset-x-3 top-3 z-20 flex min-h-12 items-center gap-3 px-3 py-2`}>
      <Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft className="size-4" />Design</Button>
      <span className="flex items-center gap-2 text-sm font-semibold"><PenLine className="size-4" />Writer</span>
      <span className="max-w-[calc(50%-320px)] truncate text-sm text-muted-foreground">{fileName}</span>
      <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap text-xs">
        <label>Preview <select aria-label="Writer viewport" className="rounded border bg-card p-2" value={preview} onChange={e => setPreview(Number(e.target.value))}><option value={0}>Saved width</option><option value={375}>Mobile · 375 px</option><option value={768}>Tablet · 768 px</option><option value={1440}>Desktop · 1440 px</option></select></label>
        <label>Zoom <select aria-label="Writer zoom" className="rounded border bg-card p-2" value={zoom} onChange={e => setZoom(Number(e.target.value))}><option value={0}>Fit width</option>{[25,50,75,100,125,150].map(z => <option key={z} value={z}>{z}%</option>)}</select></label>
      </div>
      {target && hidden.length > 0 && dismissed !== target.key && !placement && <span className="text-xs text-muted-foreground">Zoom out to show content details.</span>}
      {overflow && <span className="text-xs text-amber-400">Content may be clipped. Review in Design.</span>}
      {statePreview && <button className="text-xs text-primary" onClick={() => setStatePreview(null)}>Previewing {statePreview.state} · Back to default</button>}
      <span role="status" className="ml-auto text-xs">{saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving…' : saveState === 'conflict' ? 'Newer changes exist. Your local copy is retained; reload after resolving the conflict.' : 'Could not save. Keep this window open.'}</span>
      {saveState === 'error' && <Button size="sm" onClick={onRetry}>Retry saving</Button>}
      <Button variant="ghost" size="icon" aria-label="Undo content edit" disabled={!history.length || saveState === 'conflict'} onClick={undo}><Undo2 className="size-4" /></Button>
      <Button variant="ghost" size="icon" aria-label="Redo content edit" disabled={!future.length || saveState === 'conflict'} onClick={redo}><Redo2 className="size-4" /></Button>
    </header>
    <aside data-writer-panel aria-label="Writer content" className={`${PANEL} absolute left-3 top-[76px] bottom-3 z-10 flex w-64 flex-col`}>
      <div className={`${PANEL_HEADER} flex-col items-stretch gap-2`}>
        <label className="text-xs">Page<select aria-label="Writer page" className="mt-1 w-full rounded border bg-muted p-2" value={pageId} onChange={e => { setSelected(null); onSelectPage(e.target.value); }} >{pages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="text-xs">Screen<select aria-label="Writer screen" className="mt-1 w-full rounded border bg-muted p-2" value={screenId} onChange={e => { setSelected(null); onSelectScreen(e.target.value); }}>{screens.filter(s => s.pageId === pageId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="flex items-center gap-2 rounded border bg-muted p-2"><Search className="size-4" /><input className="min-w-0 flex-1 bg-transparent text-sm" aria-label="Search content" placeholder="Find content…" value={search} onChange={e => setSearch(e.target.value)} /></label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={missingOnly} onChange={e => setMissingOnly(e.target.checked)} />Missing accessibility text ({targets.filter(t => t.missing).length})</label>
      </div>
      <div className="flex-1 overflow-auto p-2">
        <details className="mb-3 rounded border p-2" open><summary className="cursor-pointer text-sm font-medium">States &amp; messages</summary>
          {targets.filter(t => ['Table','Input'].includes(t.type)).map(item => <div key={item.key} className="mt-2"><p className="text-xs text-muted-foreground">{item.name}</p>{(item.type === 'Table' ? ['empty','noResults','loading','error'] : ['error']).map(state => <button key={state} className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-muted" onClick={() => { locate(item); setStatePreview({key:item.key,state}); }}>{({empty:'Empty',noResults:'No results',loading:'Loading',error:'Error'})[state]}</button>)}</div>)}
          {screens.filter(s => s.kind === 'overlay' && screen?.layout.includes(s.id)).map(s => <button key={s.id} className="mt-2 block w-full text-left text-xs hover:bg-muted" onClick={() => { setStatePreview(null); setSelected(null); onSelectScreen(s.id); }}>{s.name}</button>)}
        </details>
{visible.map(item => <button key={item.key} aria-pressed={selected === item.key} onClick={() => locate(item)} className={`mb-1 w-full rounded-md p-2 text-left text-sm hover:bg-muted ${selected === item.key ? 'bg-accent' : ''}`}>
        <span className="block font-medium">{item.name}</span><span className="block truncate text-xs text-muted-foreground">{item.innerId ? 'This instance · ' : ''}{String(item.props.text || item.props.label || item.props.title || item.props.alt || item.type)}</span>
        {item.missing && <span className="text-xs text-amber-400">Needs accessibility text</span>}
      </button>)}{!visible.length && <p className="p-3 text-sm text-muted-foreground">{screen ? 'No matching content.' : 'No screens on this page. Add a frame in Design.'}</p>}</div>
    </aside>
    <main aria-label="Writer canvas" className="absolute left-[280px] right-3 top-[76px] bottom-3 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4" ref={canvas}>
        {screen && <WriterContext.Provider value={{ selected, select, edit: change, renderer: WriterNode, statePreview }}>
          <CompactRootContext.Provider value={screen.kind === 'overlay'}><StageProvider key={`${screen.id}-${width}`} initialWidth={width} initialHeight={screen.stageHeight ?? null}>
            <div className="theme-basic relative bg-background text-foreground" data-appearance={screen.appearance ?? appearance} style={{ width, minHeight: screen.stageHeight ?? (screen.kind === 'overlay' ? 0 : 640), ...(screen.stageHeight ? { height: screen.stageHeight, overflow: 'auto' } : {}), zoom: scale }}
              onDragStart={e => e.preventDefault()} onDrop={e => e.preventDefault()} onContextMenu={e => e.preventDefault()}>
              <Editor enabled={false} resolver={resolver} onRender={WriterNode}><Frame data={screen.layout} /><SyncLayout layout={screen.layout} /></Editor>
            </div>
          </StageProvider></CompactRootContext.Provider>
        </WriterContext.Provider>}
      </div>
    </main>
    {target && hidden.length > 0 && dismissed !== target.key && placement && <section ref={popover} role="dialog" aria-label={`Edit ${target.name} details`} style={placement} className={`${PANEL} fixed z-30 overflow-auto p-4`} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setDismissed(target.key); } }}>
      <div className="mb-3 flex items-center gap-3"><h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{target.name}</h2><button aria-label="Close content details" onClick={() => setDismissed(target.key)} className="rounded p-1 hover:bg-muted"><X className="size-4" /></button></div>
      {target.innerId && <p className="mb-3 text-xs text-muted-foreground">Changes apply to this instance.</p>}
      <fieldset disabled={saveState === 'conflict'} className="flex flex-col gap-3">
        {target.fields.filter(f => hidden.includes(f.prop)).map(field => field.kind === 'boolean' ? <label key={field.prop} className="flex gap-2 text-sm"><input type="checkbox" checked={!!target.props[field.prop]} onChange={e => change(target.key, field.prop, e.target.checked)} />{field.label}</label> : <CopyField key={`${target.key}:${field.prop}:${String(target.props[field.prop] ?? '')}`} label={field.label} value={String(target.props[field.prop] ?? '')} onCommit={value => change(target.key, field.prop, value)} />)}
      </fieldset>
    </section>}
  </div>;
}
