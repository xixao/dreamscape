import { ChevronDown, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { NoteKind } from '@/lib/comments/store';
import { NOTE_KINDS, NOTE_META } from './note-meta';
export function NoteTool({ visible = true, onToggleVisibility, libraries = false, active, kind = 'comment', count = 0, onToggle, onStart, onBrowse, label = 'Comment tool', menuLabel = 'Note tools' }: {
  visible?: boolean; onToggleVisibility?: () => void;
  libraries?: boolean; label?: string; menuLabel?: string; active: boolean; kind?: NoteKind; count?: number; onToggle: () => void; onStart: (kind: NoteKind) => void; onBrowse?: () => void;
}) {
  const Icon = NOTE_META[kind].icon;
  return <div className="flex items-center rounded-md border border-line-soft">
    <Button variant="ghost" size="icon" aria-label={label} title={active ? `Finish placing ${NOTE_META[kind].label.toLowerCase()}` : 'Add comment'} aria-pressed={active} onClick={onToggle}>
      <Icon className="size-4" aria-hidden />{count > 0 && <span className="text-[10px] tabular-nums">{count}</span>}
    </Button>
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-xs" aria-label={menuLabel}><ChevronDown className="size-3" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-max min-w-60 whitespace-nowrap">{NOTE_KINDS.map(type => { const TypeIcon = NOTE_META[type].icon; return <DropdownMenuItem key={type} onSelect={() => onStart(type)}><TypeIcon className={`size-4 ${NOTE_META[type].text}`} />{libraries && type !== 'comment' ? type === 'annotation' ? 'Designer annotations' : 'Accessibility annotations' : `Add ${NOTE_META[type].label.toLowerCase()}`}</DropdownMenuItem>; })}
        {onToggleVisibility && <><DropdownMenuSeparator /><DropdownMenuItem onSelect={onToggleVisibility}>{visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}{visible ? 'Hide all comments and annotations' : 'Show all comments and annotations'}</DropdownMenuItem></>}
        {onBrowse && <DropdownMenuItem onSelect={onBrowse}>Open Notes panel</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}
