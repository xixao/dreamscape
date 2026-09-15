'use client';
import { useEffect, useId, useState } from 'react';
import { Blocks } from 'lucide-react';
import { trayItems } from '@/components/blocks/registry';
import { LABEL } from '../chrome';

const COMMON = new Set(['LayoutBox', 'Text', 'Button', 'Input', 'Card', 'Image']);
export function ElementPicker() {
  const [filter, setFilter] = useState('');
  const [browse, setBrowse] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const listId = useId();
  const query = filter.trim().toLowerCase();
  const results = trayItems.filter(item => query ? item.label.toLowerCase().includes(query) : browse || COMMON.has(item.type));
  const index = Math.min(highlight, Math.max(0, results.length - 1));
  useEffect(() => {
    const reset = () => { setFilter(''); setHighlight(0); setBrowse(false); };
    window.addEventListener('dreamscape-builder-added', reset);
    return () => window.removeEventListener('dreamscape-builder-added', reset);
  }, []);
  const insert = (type: string) => window.dispatchEvent(new CustomEvent('dreamscape-builder-add', { detail: type }));
  return <aside aria-label="Builder elements" className="flex shrink-0 flex-col border-b border-line-soft pb-3">
    <h2 className={`${LABEL} flex items-center gap-2 px-4 pt-4 pb-3`}><Blocks className="size-4" />Elements</h2>
    <input role="combobox" aria-label="Add an element" placeholder="Add an element…" aria-autocomplete="list" aria-expanded={true} aria-controls={listId}
      aria-activedescendant={results.length ? `${listId}-${index}` : undefined}
      value={filter} onChange={event => { setFilter(event.target.value); setHighlight(0); }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); event.stopPropagation();
          const next = results.length ? (index + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length : 0;
          setHighlight(next);
          document.getElementById(`${listId}-${next}`)?.scrollIntoView?.({ block: 'nearest' });
        } else if (event.key === 'Enter') {
          event.preventDefault(); event.stopPropagation(); if (results[index]) insert(results[index].type);
        } else if (event.key === 'Escape') {
          event.preventDefault(); event.stopPropagation(); setFilter(''); setHighlight(0); setBrowse(false);
        }
      }} className="mx-3 mb-2 rounded-md border bg-muted px-3 py-2 text-sm outline-none focus:border-acc" />
    <div id={listId} role="listbox" aria-label="Elements to add" className="max-h-44 overflow-y-auto px-2">
      {results.map((item, position) => <button key={item.type} id={`${listId}-${position}`} role="option" aria-selected={position === index}
        draggable onDragStart={event => { event.dataTransfer.setData('application/x-dreamscape-element', item.type); event.dataTransfer.effectAllowed = 'copy'; }}
        onClick={() => insert(item.type)} className={`flex w-full cursor-grab items-center gap-3 rounded-md px-3 py-2 text-left text-[13px] hover:bg-accent ${position === index ? 'bg-accent' : ''}`}>
        <item.icon className="size-4 text-acc" />{item.label}
      </button>)}
    </div>
    {!results.length && <p role="status" className="px-4 py-2 text-xs text-muted-foreground">No matching elements.</p>}
    {!query && <button onClick={() => { setBrowse(current => !current); setHighlight(0); }} className="mx-4 mt-2 self-start text-xs text-acc">{browse ? 'Show common elements' : 'Browse all'}</button>}
  </aside>;
}
