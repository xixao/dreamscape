'use client';

import { useRef, useState } from 'react';
import { Info, Search } from 'lucide-react';
import { startDiagramDrag, endDiagramDrag } from '@/lib/diagram/insertion';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { INFO_BUTTON, SEARCH, SEARCH_INPUT } from '../chrome';
import { ElementDocsDialog } from '../element-docs-dialog';
import { POINTER_TOOL, type DiagramTool } from './diagram-layer';
import { DIAGRAM_TOOL_ITEMS, diagramToolDocKey, toolsEqual, type DiagramToolItem } from './diagram-palette';

// The Diagrams tab's own rows (spec docs/superpowers/specs/2026-09-14-panel-
// tabs-icons-design.md section 1): every tool the floating palette offers,
// read from DIAGRAM_TOOL_ITEMS (diagram-palette.tsx) so the two lists can
// never drift apart, decorated with the search keywords a designer is
// likely to type instead of a tool's own name - "shape", "diagram" and
// "flow" describe the group as a whole, "arrow" and "line" describe what a
// connector actually looks like. Moved here from component-tray.tsx's now-
// removed Diagram group (spec docs/superpowers/specs/2026-09-13-diagrams-
// design.md section 13), since this tab is the tools' new home - the
// Components tab goes back to Craft blocks only.
const DIAGRAM_SHARED_KEYWORDS = ['shape', 'diagram', 'flow'];
const DIAGRAM_CONNECTOR_KEYWORDS = ['connector', 'arrow', 'line'];

type DiagramTrayRow = DiagramToolItem & { keywords: string[] };

const DIAGRAM_TRAY_ITEMS: DiagramTrayRow[] = DIAGRAM_TOOL_ITEMS.map((item) => ({
  ...item,
  keywords: [...DIAGRAM_SHARED_KEYWORDS, ...(item.tool.kind === 'connector' ? DIAGRAM_CONNECTOR_KEYWORDS : [])],
}));

// component-tray.tsx's filterTrayItems sibling: same blank/whitespace and
// case-insensitive substring rules, over a row's label and keywords instead
// of a TrayItem's label/type/keywords (a diagram tool has no BlockType).
export function filterDiagramToolItems(items: DiagramTrayRow[], query: string): DiagramTrayRow[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return items;
  return items.filter((item) =>
    [item.label, ...item.keywords].some((field) => field.toLowerCase().includes(trimmed)),
  );
}

/** The right panel shares insertion and connector tools with the floating palette. */
export function DiagramToolTray({
  diagramTool = POINTER_TOOL,
  onSelectDiagramTool,
}: {
  // The tab's own armed tool: the same state workbench.tsx feeds the
  // floating palette's own `tool` prop, used only to derive each row's
  // aria-pressed. Defaults to the plain pointer (nothing pressed) for a
  // caller/test that does not care, the same "keep old callers working"
  // precedent every other optional prop in this panel already follows.
  diagramTool?: DiagramTool;
  // Inserts a shape or arms the connector, the same as clicking it in the
  // floating palette. Optional/no-op so a caller that never passes it still
  // renders every row without throwing on click.
  onSelectDiagramTool?: (tool: DiagramTool) => void;
} = {}) {
  const [filter, setFilter] = useState('');
  // One Component documentation dialog for the whole tab (see
  // component-tray.tsx's own identical precedent for why this outlives
  // `open`: the dialog's closing animation keeps showing the tool it was
  // opened for instead of flashing the fallback doc).
  const [docsType, setDocsType] = useState<string | null>(null);
  const [docsOpen, setDocsOpen] = useState(false);
  // The "i" button that opened the dialog; the dialog returns focus to it
  // when it closes (see ElementDocsDialog's openerRef).
  const docsOpenerRef = useRef<HTMLElement | null>(null);
  const filteredItems = filterDiagramToolItems(DIAGRAM_TRAY_ITEMS, filter);

  function openDocs(type: string, opener: HTMLElement): void {
    docsOpenerRef.current = opener;
    setDocsType(type);
    setDocsOpen(true);
  }

  return (
    <div className="flex flex-col gap-3.5 overflow-y-auto p-4">
      <div className={SEARCH}>
        <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <Input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Search tools"
          aria-label="Search tools"
          className={SEARCH_INPUT}
        />
      </div>
      {filteredItems.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2">
          {filteredItems.map((item) => {
            const docKey = diagramToolDocKey(item.tool);
            return (
              <li
                key={docKey}
                className="group relative flex rounded-lg border border-transparent transition-[border-color] duration-150 hover:border-line-strong hover:bg-accent focus-within:border-line-strong focus-within:bg-accent"
              >
                <button
                  type="button"
                  data-diagram-tool-item={docKey}
                  aria-pressed={toolsEqual(diagramTool, item.tool)}
                  aria-label={item.label}
                  title={item.tool.kind === 'shape' ? `${item.label} — click to add or drag onto canvas` : 'Connect two shapes or frames'}
                  draggable={item.tool.kind === 'shape'}
                  onDragStart={event => { if (item.tool.kind === 'shape') startDiagramDrag(event.dataTransfer, item.tool.shape); }}
                  onDragEnd={endDiagramDrag}
                  onClick={() => onSelectDiagramTool?.(item.tool)}
                  className="flex w-full items-center justify-center rounded-lg px-2 py-8"
                >
                  <item.icon className="size-8 shrink-0 text-acc2" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`About ${item.label}`}
                  draggable={false}
                  className={cn(INFO_BUTTON, 'absolute top-1 right-1 mr-0')}
                  onClick={(event) => openDocs(docKey, event.currentTarget)}
                >
                  <Info className="size-3.5" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-1 py-2 text-[12.5px] text-muted-foreground">No tools match.</p>
      )}
      {docsType !== null && (
        <ElementDocsDialog type={docsType} open={docsOpen} onOpenChange={setDocsOpen} openerRef={docsOpenerRef} />
      )}
    </div>
  );
}
