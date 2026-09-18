'use client';

import { useState, type CSSProperties } from 'react';
import { Check, ChevronDown, Copy, Layers, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { SegmentedControl, SegmentedItem } from '@/components/workbench/segmented-control';
import { CHIP, CHIP_INPUT, LABEL, MENU_POPOVER, MENU_ROW, PANEL, PANEL_HEADER, PANEL_TITLE, PRIMARY_BUTTON, SEARCH, SEARCH_INPUT, SECONDARY_BUTTON, SECTION_TITLE } from '@/components/workbench/chrome';
import { themeVariables, type UITheme } from '@/lib/ui-theme';
import { cn } from '@/lib/utils';

/** Real chrome primitives with local-only state: never changes a design file. */
export function ThemePanelPreview({ theme }: { theme: UITheme }) {
  const [tab, setTab] = useState('design');
  const [grid, setGrid] = useState(true);
  const [menu, setMenu] = useState(false);
  const [message, setMessage] = useState('All changes saved');
  return (
    <section aria-label="Interactive panel preview" style={themeVariables(theme) as CSSProperties} className="rounded-xl border border-border bg-background text-foreground" onKeyDown={event => {
      // The preview lives inside the theme form. Enter in a sample field must
      // not accidentally save the theme; buttons retain keyboard activation.
      if (event.key === 'Enter' && event.target instanceof HTMLInputElement) event.preventDefault();
    }}>
      <div className="px-4 py-3">
        <h2 className="text-sm font-semibold">Panel preview</h2>
        <p className="mt-1 text-xs text-muted-foreground">Try the tabs, fields, and buttons. These are sample controls.</p>
      </div>
      <div className="max-h-[60vh] overflow-auto rounded-b-xl bg-canvas p-4">
        <div className={cn(PANEL, 'mx-auto max-w-[340px]')}>
          <div className={cn(PANEL_HEADER, 'py-3')}>
            <SegmentedControl aria-label="Preview panel mode" value={tab} onValueChange={value => { if (value) setTab(value); }}>
              <SegmentedItem type="button" value="design">Design</SegmentedItem>
              <SegmentedItem type="button" value="prototype">Prototype</SegmentedItem>
              <SegmentedItem type="button" value="components">Components</SegmentedItem>
            </SegmentedControl>
          </div>
          <div className="space-y-4 p-4">
            <div className="flex items-center gap-2"><Layers className="size-4 text-acc"/><span className={PANEL_TITLE}>{tab === 'design' ? 'Appearance' : tab === 'prototype' ? 'Interactions' : 'Library'}</span></div>
            <div className={SEARCH}><Search className="size-4 shrink-0 text-muted-foreground"/><Input aria-label="Preview search" placeholder="Search components…" className={SEARCH_INPUT}/></div>
            <div>
              <h3 className={SECTION_TITLE}>Frame settings</h3>
              <div className="grid grid-cols-2 gap-3">
                {['Width', 'Height'].map((label, index) => <label key={label} className="min-w-0"><span className={LABEL}>{label}</span><span className={cn(CHIP, 'mt-1')}><Input aria-label={`Preview ${label.toLowerCase()}`} defaultValue={index ? '240' : '320'} className={CHIP_INPUT}/><span className="text-xs text-muted-foreground">px</span></span></label>)}
              </div>
              <p className="mt-2 text-xs text-t4">Dimensions follow the selected frame.</p>
            </div>
            <div className="flex items-center justify-between border-t border-line-soft pt-3"><label htmlFor="preview-layout-grid" className="text-[12.5px] text-t2">Show layout grid</label><Switch id="preview-layout-grid" checked={grid} onCheckedChange={setGrid}/></div>
            <div className="border-t border-line-soft pt-3">
              <Button type="button" variant="ghost" className="w-full justify-between" aria-expanded={menu} onClick={() => setMenu(!menu)}>Frame actions<ChevronDown className="size-4"/></Button>
              {menu && <div className={cn(MENU_POPOVER, 'mt-2')} aria-label="Sample frame actions">
                <button type="button" className={cn(MENU_ROW, 'w-full')} onClick={() => { setMessage('Sample frame duplicated'); setMenu(false); }}><Copy className="size-3.5"/>Duplicate<span className="ml-auto font-mono text-[10px] text-t4">⌘D</span></button>
                <button type="button" className={cn(MENU_ROW, 'w-full text-bad')} onClick={() => { setMessage('Sample frame removed'); setMenu(false); }}><Trash2 className="size-3.5"/>Delete</button>
              </div>}
            </div>
            <div className="flex gap-2"><Button type="button" className={cn(PRIMARY_BUTTON, 'flex-1')} onClick={() => setMessage('Sample changes applied')}>Apply changes</Button><Button type="button" className={SECONDARY_BUTTON} onClick={() => { setGrid(true); setMessage('All changes saved'); }}>Reset</Button></div>
            <div className="space-y-2 border-t border-line-soft pt-3 text-xs">
              <p className="flex items-center gap-1.5 text-ok" role="status"><Check className="size-3.5"/>{message}</p>
              <p className="text-warn">Warning · Check your contrast</p>
              <p className="text-bad">Error · A required value is missing</p>
              <span className="block text-acc2">Secondary accent</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
