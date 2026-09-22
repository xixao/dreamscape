'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Layers2, Plus, Sparkles } from 'lucide-react';
import type { Page } from '@/lib/files/repository';

export function PagesList({ pages, currentPageId, onSwitch, onAdd, onRename, pageActions, storageKey = 'dreamscape:pages-list' }: {
  pages: Page[]; currentPageId: string; onSwitch: (id: string) => void;
  onAdd?: () => void; onRename?: (id: string, name: string) => void; pageActions?: (page: Page) => ReactNode; storageKey?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  function commitName(id: string) { const value = name.trim().slice(0, 80); setEditing(null); if (value && value !== pages.find(p => p.id === id)?.name) onRename?.(id, value); }
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      setCollapsed(saved.collapsed === true);
      if (list.current && Number.isFinite(saved.height)) list.current.style.height = `${Math.max(96, Math.min(280, saved.height))}px`;
    } catch {}
  }, [storageKey]);
  function save(next: boolean) {
    try { localStorage.setItem(storageKey, JSON.stringify({ collapsed: next, height: list.current?.offsetHeight || 176 })); } catch {}
  }
  return <section aria-label="File pages" className="shrink-0 border-b border-line-soft">
    <div className="flex h-10 items-center gap-1 px-3">
      <button type="button" aria-expanded={!collapsed} aria-label={collapsed ? 'Expand pages' : 'Collapse pages'} onClick={() => { save(!collapsed); setCollapsed(!collapsed); }} className="flex min-w-0 flex-1 items-center gap-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}Pages
        {collapsed && <span className="truncate text-xs font-normal normal-case tracking-normal text-foreground">{pages.find(p => p.id === currentPageId)?.name}</span>}
      </button>
      {onAdd && <button type="button" aria-label="New page" title="New page" onClick={onAdd} className="rounded p-1.5 text-muted-foreground hover:bg-accent"><Plus className="size-3.5" /></button>}
    </div>
    <div ref={list} hidden={collapsed} onPointerUp={() => save(collapsed)} className="h-44 min-h-24 max-h-[280px] resize-y overflow-auto px-2 pb-2">
      <nav aria-label="Pages" className="space-y-0.5">
        {pages.map(page => { const Row = editing === page.id ? 'div' : 'button'; return <div key={page.id} className="group/page flex items-center rounded-md hover:bg-accent/50"><Row type="button" aria-current={page.id === currentPageId ? 'page' : undefined} onClick={() => { if (page.id === currentPageId && onRename) { setEditing(page.id); setName(page.name); } else onSwitch(page.id); }} title={`${page.name} · ${page.kind === 'variations' ? 'Variations workspace' : 'Design page'}`} className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-xs ${page.id === currentPageId ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}`}>
          {page.kind === 'variations' ? <Sparkles aria-label="Variations" className="size-4 shrink-0 text-primary" /> : <Layers2 aria-label="Design page" className="size-4 shrink-0" />}
          {editing === page.id ? <input autoFocus aria-label="Page name" maxLength={80} value={name} onFocus={e => e.currentTarget.select()} onClick={e => e.stopPropagation()} onChange={e => setName(e.target.value)} onBlur={() => commitName(page.id)} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); commitName(page.id); } if (e.key === 'Escape') { e.preventDefault(); setEditing(null); } }} className="min-w-0 w-full rounded border border-primary bg-input px-1 py-0.5 text-xs text-foreground outline-none" /> : <span className="truncate">{page.name}</span>}
        </Row>{pageActions && <div className="shrink-0 pr-1 opacity-0 group-hover/page:opacity-100 group-focus-within/page:opacity-100 has-[[data-state=open]]:opacity-100">{pageActions(page)}</div>}</div>; })}
      </nav>
    </div>
  </section>;
}
