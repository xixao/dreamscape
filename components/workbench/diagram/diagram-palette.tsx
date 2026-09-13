'use client';

import { Diamond, Pill, Spline, Square, Squircle, StickyNote, Type, type LucideIcon, X } from 'lucide-react';
import type { DiagramNodeKind } from '@/lib/diagram/store';
import { cn } from '@/lib/utils';
import { PANEL } from '../chrome';
import { POINTER_TOOL, type DiagramTool } from './diagram-layer';

const SHAPE_ITEMS: { kind: DiagramNodeKind; label: string; icon: LucideIcon }[] = [
  { kind: 'rect', label: 'Rectangle', icon: Square },
  { kind: 'rounded', label: 'Rounded', icon: Squircle },
  { kind: 'decision', label: 'Decision', icon: Diamond },
  { kind: 'terminal', label: 'Terminal', icon: Pill },
  { kind: 'text', label: 'Text', icon: Type },
  { kind: 'note', label: 'Note', icon: StickyNote },
];

function toolsEqual(a: DiagramTool, b: DiagramTool): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === 'shape' && b.kind === 'shape' ? a.shape === b.shape : true;
}

function PaletteButton({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground',
        active && 'bg-muted text-foreground',
      )}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

/**
 * The small floating palette the top bar's Diagram tool button or Shift+D
 * opens (spec docs/superpowers/specs/2026-09-13-diagrams-design.md section
 * 3): Rectangle, Rounded, Decision, Terminal, Text, Note and Connector.
 * Clicking a tool arms it in `tool` (owned by whoever renders both this and
 * DiagramLayer, components/workbench/workbench.tsx) so DiagramLayer's own
 * canvas pointer handling knows what to place or draw next; clicking the
 * already-armed tool again returns to the plain pointer, the same toggle
 * behavior the top bar's own Comment/Chat buttons already use.
 */
export function DiagramPalette({
  open,
  tool,
  onSelectTool,
  onClose,
}: {
  open: boolean;
  tool: DiagramTool;
  onSelectTool: (tool: DiagramTool) => void;
  onClose: () => void;
}) {
  if (!open) return null;

  function toggle(next: DiagramTool): void {
    onSelectTool(toolsEqual(tool, next) ? POINTER_TOOL : next);
  }

  return (
    <div
      role="toolbar"
      aria-label="Diagram palette"
      className={cn(PANEL, 'absolute top-[76px] left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 p-1')}
    >
      {SHAPE_ITEMS.map(({ kind, label, icon }) => (
        <PaletteButton
          key={kind}
          label={label}
          icon={icon}
          active={tool.kind === 'shape' && tool.shape === kind}
          onClick={() => toggle({ kind: 'shape', shape: kind })}
        />
      ))}
      <div className="mx-0.5 h-6 w-px bg-border" aria-hidden />
      <PaletteButton
        label="Connector"
        icon={Spline}
        active={tool.kind === 'connector'}
        onClick={() => toggle({ kind: 'connector' })}
      />
      <div className="mx-0.5 h-6 w-px bg-border" aria-hidden />
      <PaletteButton label="Close diagram palette" icon={X} active={false} onClick={onClose} />
    </div>
  );
}
