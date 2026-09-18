'use client';
import { createContext, useContext, type ReactNode } from 'react';
import { Layers, Sparkles, Workflow, Settings2 } from 'lucide-react';
import { SegmentedControl, SegmentedItem } from './segmented-control';
export const LeftPanelContext = createContext<{ pageSelector?: ReactNode; prototypesOpen?: boolean; setPrototypesOpen?: (open: boolean) => void; onOpenFileSettings?: () => void; chatOpen: boolean; setChatOpen: (open: boolean) => void; notesOpen?: boolean; setNotesOpen?: (open: boolean) => void; collapsed?: boolean; setCollapsed?: (collapsed: boolean) => void } | null>(null);
export function LeftPanelTabs({ compact = false }: { compact?: boolean }) {
  const context = useContext(LeftPanelContext);
  if (!context) return null;
  return <SegmentedControl continuityKey={context.setChatOpen} orientation={compact ? 'vertical' : 'horizontal'} aria-label="Left panel mode" value={context.prototypesOpen ? 'prototypes' : context.chatOpen ? 'chat' : 'design'} onValueChange={value => { if (value) { context.setChatOpen(value === 'chat'); context.setPrototypesOpen?.(value === 'prototypes'); context.setCollapsed?.(false); } }} className={compact ? 'flex-col' : 'flex-1'}>
    <SegmentedItem className={compact ? undefined : 'flex-auto px-2'} value="design" aria-label="Design" title="Design" >{compact && <Layers className="size-4" aria-hidden />}{!compact && <span className="text-[11px]">Design</span>}</SegmentedItem>
    {context.setPrototypesOpen && <SegmentedItem className={compact ? undefined : 'flex-auto px-2'} value="prototypes" aria-label="Prototypes" title="Prototypes">{compact && <Workflow className="size-4" aria-hidden />}{!compact && <span className="text-[11px]">Prototypes</span>}</SegmentedItem>}
    <SegmentedItem className={compact ? undefined : 'flex-auto px-2'} value="chat" aria-label="Chat" title="Chat" >{compact && <Sparkles className="size-4" aria-hidden />}{!compact && <span className="text-[11px]">Chat</span>}</SegmentedItem>
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
