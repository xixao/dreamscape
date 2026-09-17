'use client';
import { createContext, useContext, type ReactNode } from 'react';
import { Layers, Sparkles, MessageCircle, Settings2 } from 'lucide-react';
import { SegmentedControl, SegmentedItem } from './segmented-control';
export const LeftPanelContext = createContext<{ onOpenFileSettings?: () => void; chatOpen: boolean; setChatOpen: (open: boolean) => void; notesOpen?: boolean; setNotesOpen?: (open: boolean) => void; collapsed?: boolean; setCollapsed?: (collapsed: boolean) => void } | null>(null);
export function LeftPanelTabs({ compact = false }: { compact?: boolean }) {
  const context = useContext(LeftPanelContext);
  if (!context) return null;
  return <SegmentedControl continuityKey={context.setChatOpen} orientation={compact ? 'vertical' : 'horizontal'} aria-label="Left panel mode" value={context.notesOpen ? 'notes' : context.chatOpen ? 'chat' : 'layers'} onValueChange={value => { if (value) { context.setChatOpen(value === 'chat'); context.setNotesOpen?.(value === 'notes'); context.setCollapsed?.(false); } }} className={compact ? 'flex-col' : 'flex-1'}>
    <SegmentedItem value="layers" aria-label="Layers" title="Layers" ><Layers className="size-4" aria-hidden /></SegmentedItem>
    <SegmentedItem value="chat" aria-label="Chat" title="Chat" ><Sparkles className="size-4" aria-hidden /></SegmentedItem>
    {context.setNotesOpen && <SegmentedItem value="notes" aria-label="Notes" title="Notes" ><MessageCircle className="size-4" aria-hidden /></SegmentedItem>}
  </SegmentedControl>;
}

export function LeftPanelHeader({ action }: { action: ReactNode }) {
  return <div className="grid h-[50px] shrink-0 grid-cols-[minmax(0,1fr)_32px] items-center gap-2 border-b border-line-soft px-3">
    <LeftPanelTabs />
    <div className="flex size-8 items-center justify-center">{action}</div>
  </div>;
}

export function LeftPanelFooter() {
  const context = useContext(LeftPanelContext);
  if (!context?.onOpenFileSettings) return null;
  return <div className="mt-auto shrink-0 border-t border-line-soft p-1"><button type="button" aria-label="File settings" title="File settings" onClick={context.onOpenFileSettings} className="flex w-full items-center gap-2 rounded p-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"><Settings2 className="size-4 shrink-0" />{!context.collapsed && 'File settings'}</button></div>;
}
