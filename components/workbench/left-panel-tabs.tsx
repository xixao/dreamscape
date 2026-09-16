'use client';
import { createContext, useContext, type ReactNode } from 'react';
import { Layers, Sparkles, MessageCircle } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { SEG_GROUP, SEG_ITEM } from './chrome';
export const LeftPanelContext = createContext<{ chatOpen: boolean; setChatOpen: (open: boolean) => void; notesOpen?: boolean; setNotesOpen?: (open: boolean) => void; collapsed?: boolean; setCollapsed?: (collapsed: boolean) => void } | null>(null);
export function LeftPanelTabs({ compact = false }: { compact?: boolean }) {
  const context = useContext(LeftPanelContext);
  if (!context) return null;
  return <ToggleGroup type="single" aria-label="Left panel mode" value={context.notesOpen ? 'notes' : context.chatOpen ? 'chat' : 'layers'} onValueChange={value => { if (value) { context.setChatOpen(value === 'chat'); context.setNotesOpen?.(value === 'notes'); context.setCollapsed?.(false); } }} className={`${SEG_GROUP} ${compact ? 'flex-col' : 'flex-1'}`}>
    <ToggleGroupItem value="layers" aria-label="Layers" title="Layers" className={SEG_ITEM}><Layers className="size-4" aria-hidden /></ToggleGroupItem>
    <ToggleGroupItem value="chat" aria-label="Chat" title="Chat" className={SEG_ITEM}><Sparkles className="size-4" aria-hidden /></ToggleGroupItem>
    {context.setNotesOpen && <ToggleGroupItem value="notes" aria-label="Notes" title="Notes" className={SEG_ITEM}><MessageCircle className="size-4" aria-hidden /></ToggleGroupItem>}
  </ToggleGroup>;
}

export function LeftPanelHeader({ action }: { action: ReactNode }) {
  return <div className="grid h-[50px] shrink-0 grid-cols-[minmax(0,1fr)_32px] items-center gap-2 border-b border-line-soft px-3">
    <LeftPanelTabs />
    <div className="flex size-8 items-center justify-center">{action}</div>
  </div>;
}
