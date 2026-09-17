'use client';
import { useContext, useMemo, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Play, Plus } from 'lucide-react';
import type { Page, Screen } from '@/lib/files/repository';
import { collectPrototypes } from '@/lib/prototypes';
import { PANEL } from './chrome';
import { LeftPanelContext, LeftPanelHeader, LeftPanelTabs, LeftPanelFooter } from './left-panel-tabs';
import { PanelResize } from './panel-resize';

export function PrototypesPanel({ visible, fileId, screens, pages, currentScreenId, width, onWidthChange, onFocus, onName, onHandoff }: {
  visible: boolean; fileId: string; screens: Screen[]; pages: Page[]; currentScreenId: string; width: number;
  onWidthChange: (width: number) => void; onFocus: (id: string) => void;
  onName: (id: string, name: string) => void; onHandoff: (id: string) => void;
}) {
  const context = useContext(LeftPanelContext);
  const flows = useMemo(() => collectPrototypes(screens), [screens]);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [start, setStart] = useState(currentScreenId);
  const flow = flows.find(item => item.id === selected);
  const collapsed = context?.collapsed;
  const field = 'w-full rounded-md border border-line-soft bg-muted/40 px-2.5 py-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-acc';
  return <aside aria-label="Prototypes panel" style={{ display: visible ? undefined : 'none', width: collapsed ? 40 : width }} className={`${PANEL} absolute top-[76px] bottom-3 left-3 z-10 flex min-h-0 flex-col overflow-hidden`}>
    {collapsed ? <><LeftPanelTabs compact /><button aria-label="Expand prototypes panel" className="p-2" onClick={() => context?.setCollapsed?.(false)}><ChevronRight className="size-4" /></button></> : <>
      <PanelResize width={width} onChange={onWidthChange} />
      <LeftPanelHeader action={<button aria-label="Minimize prototypes panel" onClick={() => context?.setCollapsed?.(true)}><ChevronLeft className="size-4" /></button>} />
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {flow && !creating ? <>
          <button className="mb-4 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setSelected(null)}><ArrowLeft className="size-3" />All prototypes</button>
          <label className="block text-xs text-muted-foreground">Prototype name<input key={`${flow.id}:${flow.name}`} aria-label="Prototype name" className={`${field} mt-1 text-foreground`} defaultValue={flow.name} maxLength={80} onBlur={event => { if (event.target.value.trim() && event.target.value.trim() !== flow.name) onName(flow.id, event.target.value); else event.target.value = flow.name; }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>
          <div className="my-3 flex gap-2"><a aria-label={`Play ${flow.name}`} className="flex flex-1 items-center justify-center gap-1 rounded-md border border-line-soft px-2 py-2 text-xs hover:bg-accent" href={`/f/${fileId}/play?page=${flow.screens[0].pageId ?? pages[0]?.id ?? ''}&screen=${flow.id}`}><Play className="size-3" />Play</a><button className="flex-1 rounded-md border border-line-soft px-2 py-2 text-xs hover:bg-accent" onClick={() => onHandoff(flow.id)}>Handoff</button></div>
          <h2 className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Screens · {flow.screens.length}</h2>
          {flow.screens.map((screen, index) => <button key={screen.id} aria-label={`${screen.name} ${pages.find(page => page.id === screen.pageId)?.name ?? 'Page 1'}${index === 0 ? ' · Starting screen' : screen.kind === 'overlay' ? ' · Overlay' : ''}`} onClick={() => onFocus(screen.id)} aria-current={screen.id === currentScreenId ? 'true' : undefined} className={`mb-1 w-full rounded-md px-2 py-2 text-left hover:bg-accent ${screen.id === currentScreenId ? 'bg-accent' : ''}`}><span className="block truncate text-xs">{screen.name}</span><span className="block truncate text-[10px] text-muted-foreground">{pages.find(page => page.id === screen.pageId)?.name ?? 'Page 1'}{index === 0 ? ' · Starting screen' : screen.kind === 'overlay' ? ' · Overlay' : ''}</span></button>)}
        </> : creating ? <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (!name.trim() || !screens.some(screen => screen.id === start && screen.kind !== 'overlay')) return; onName(start, name); setSelected(start); setCreating(false); }}>
          <h2 className="text-sm font-medium">New prototype</h2>
          <label className="block text-xs">Name<input autoFocus required maxLength={80} className={`${field} mt-1`} value={name} onChange={event => setName(event.target.value)} /></label>
          <label className="block text-xs">Starting screen<select className={`${field} mt-1`} value={start} onChange={event => setStart(event.target.value)}>{screens.filter(screen => screen.kind !== 'overlay').map(screen => <option key={screen.id} value={screen.id}>{screen.name} · {pages.find(page => page.id === screen.pageId)?.name ?? 'Page 1'}</option>)}</select></label>
          <p className="text-xs text-muted-foreground">Connected screens are included automatically, even on other Pages. A starting screen has one prototype name.</p>
          <div className="flex gap-2"><button type="submit" className="rounded-md bg-accent px-3 py-2 text-xs">Create</button><button type="button" className="px-3 py-2 text-xs" onClick={() => setCreating(false)}>Cancel</button></div>
        </form> : <>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-medium">All prototypes</h2><button title="New prototype" aria-label="New prototype" onClick={() => { setStart(screens.find(screen => screen.id === currentScreenId && screen.kind !== 'overlay')?.id ?? screens.find(screen => screen.kind !== 'overlay')?.id ?? ''); setName(''); setCreating(true); }} className="rounded p-1 hover:bg-accent"><Plus className="size-4" /></button></div>
          <input aria-label="Search prototypes" placeholder="Find a prototype…" className={`${field} mb-3`} value={search} onChange={event => setSearch(event.target.value)} />
          {flows.filter(flow => flow.name.toLowerCase().includes(search.toLowerCase())).map(flow => <button key={flow.id} aria-label={`${flow.name} ${flow.screens.length} screens${!flow.named ? ' · Connected flow' : ''}`} onClick={() => { setSelected(flow.id); onFocus(flow.id); }} className="mb-1 flex w-full items-center gap-2 rounded-md p-2 text-left hover:bg-accent"><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{flow.name}</span><span className="text-[10px] text-muted-foreground">{flow.screens.length} screens{!flow.named ? ' · Connected flow' : ''}</span></span><ChevronRight className="size-3" /></button>)}
          {!flows.length && <p className="py-3 text-xs text-muted-foreground">Create a prototype by choosing its starting screen. Connect screens in Prototype mode to build the flow.</p>}
          {!!flows.length && !flows.some(flow => flow.name.toLowerCase().includes(search.toLowerCase())) && <p className="text-xs text-muted-foreground">No matching prototypes.</p>}
        </>}
      </div>
    </>}
    <LeftPanelFooter />
  </aside>;
}
