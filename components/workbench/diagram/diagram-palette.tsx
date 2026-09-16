'use client';

import { Diamond, Pill, Spline, Square, Squircle, StickyNote, Table2, Type, type LucideIcon, X } from 'lucide-react';
import type { DiagramNodeKind } from '@/lib/diagram/store';
import { startDiagramDrag, endDiagramDrag } from '@/lib/diagram/insertion';
import { cn } from '@/lib/utils';
import { PANEL } from '../chrome';
import { POINTER_TOOL, type DiagramTool } from './diagram-layer';

export const SHAPE_ITEMS: { kind: DiagramNodeKind; label: string; icon: LucideIcon }[] = [
  { kind: 'rect', label: 'Rectangle', icon: Square },
  { kind: 'rounded', label: 'Rounded', icon: Squircle },
  { kind: 'decision', label: 'Decision', icon: Diamond },
  { kind: 'terminal', label: 'Terminal', icon: Pill },
  { kind: 'text', label: 'Text', icon: Type },
  { kind: 'note', label: 'Note', icon: StickyNote },
  { kind: 'table', label: 'Table', icon: Table2 },
];

export function toolsEqual(a: DiagramTool, b: DiagramTool): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === 'shape' && b.kind === 'shape' ? a.shape === b.shape : true;
}

export interface DiagramToolItem {
  tool: DiagramTool;
  label: string;
  icon: LucideIcon;
}

// All seven diagram tools the floating palette offers, in the same order it
// renders them below (the six shapes, then the connector) - shared with the
// Components tab's "Diagram" group (component-tray.tsx, spec docs/superpowers/
// specs/2026-09-13-diagrams-design.md section 13) so the two lists can never
// drift apart: both read the tools, icons and labels from this single
// source of truth instead of keeping their own copies.
export const DIAGRAM_TOOL_ITEMS: DiagramToolItem[] = [
  ...SHAPE_ITEMS.map(({ kind, label, icon }): DiagramToolItem => ({ tool: { kind: 'shape', shape: kind }, label, icon })),
  { tool: { kind: 'connector' }, label: 'Connector', icon: Spline },
];

// The components/blocks/docs.ts lookup key for a diagram tool (docs.test.ts
// enforces an entry for every one of DIAGRAM_TOOL_ITEMS, keyed this way): a
// shape's own DiagramNodeKind, or 'connector' - lowercase, and deliberately
// never the tool's display label. A label can collide with an unrelated
// BlockType's own label (the diagram Text shape and the Craft Text block are
// both labelled "Text"), but docs.ts keys BlockType entries by their
// capitalised type name, so the lowercase id here never collides with one.
export function diagramToolDocKey(tool: DiagramTool): string {
  return tool.kind === 'shape' ? tool.shape : tool.kind;
}

function PaletteButton({
  label,
  icon: Icon,
  active,
  onClick,
  shape,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
  shape?: DiagramNodeKind;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      draggable={!!shape}
      onDragStart={event => { if (shape) startDiagramDrag(event.dataTransfer, shape); }}
      onDragEnd={endDiagramDrag}
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

/** Shapes insert on click or drag; Connector arms the connection tool. */
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
    onSelectTool(next.kind === 'connector' && toolsEqual(tool, next) ? POINTER_TOOL : next);
  }

  return (
    <div
      role="toolbar"
      aria-label="Diagram palette"
      className={cn(PANEL, 'fixed bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 p-1')}
    >
      {SHAPE_ITEMS.map(({ kind, label, icon }) => (
        <PaletteButton
          key={kind}
          shape={kind}
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
