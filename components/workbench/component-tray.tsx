'use client';

import { createTrayElement } from './create-tray-element';
import { useComponentLibrary } from './component-builder/library-context';
import { CreateComponentCard, CustomTray } from './component-builder/custom-tray';
import { useRef, useState } from 'react';
import { useEditor } from '@craftjs/core';
import { useSettledEditorState } from './use-settled-editor-state';
import { Info, Search } from 'lucide-react';
import { trayItems, type TrayGroup, type TrayItem } from '@/components/blocks/registry';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { INFO_BUTTON, LABEL, SEARCH, SEARCH_INPUT } from './chrome';
import { ElementDocsDialog } from './element-docs-dialog';

// Render order for the group headings; within a group, trayItems' own order wins.
const GROUP_ORDER: readonly TrayGroup[] = ['Layout', 'Text and media', 'Forms', 'Feedback', 'Data'];

export function filterTrayItems(items: TrayItem[], query: string): TrayItem[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return items;
  return items.filter((item) =>
    [item.label, item.type, ...(item.keywords ?? [])].some((field) => field.toLowerCase().includes(trimmed)),
  );
}

// Dialog left the tray for an overlay frame (spec docs/superpowers/specs/
// 2026-09-13-overlay-frames-design.md section 5, phase 2), so a search for
// any of the words a designer would still reach for now matches nothing -
// this is what tells that specific empty state apart from a genuine
// "no such element" search, so the fallback below can point at the Frames
// chip instead of the generic "No components match.". A live, as-you-type
// search naturally means the QUERY is a prefix of one of these words while
// it's still being typed ("dial" while typing "dialog"), not the other
// direction - matching the same `.includes` shape filterTrayItems itself
// uses, just with the two operands swapped.
const OVERLAY_HINT_WORDS = ['modal', 'popup', 'overlay', 'dialog'];
const OVERLAY_HINT_MESSAGE = 'Modals are overlay frames: Frames chip → New overlay → Dialog';

function matchesOverlayHint(query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return false;
  return OVERLAY_HINT_WORDS.some((word) => word.includes(trimmed));
}

// The Components tab's content: search field, grouped list, Craft drag
// sources (`connectors.create`) - Craft blocks only (spec docs/superpowers/
// specs/2026-09-14-panel-tabs-icons-design.md: the diagram tools that used
// to sit in a Diagram group at the bottom of this list now have their own
// Diagrams tab, diagram/diagram-tool-tray.tsx). Rendered inside the right
// panel's own <aside> by Inspector, which already owns that panel's chrome
// and header (the Design/Prototype/Elements/Diagrams tabs) - this renders
// no landmark or title of its own, so the two are never nested or
// duplicated (see docs/superpowers/specs/2026-09-12-panels-and-zoom-
// design.md section 1).
export function ComponentTray() {
  const library = useComponentLibrary();
  const { connectors, query, actions } = useEditor();
  const hasRoot = !!useSettledEditorState().nodes.ROOT;
  const dragged = useRef(false);
  const [filter, setFilter] = useState('');
  // One Component documentation dialog for the whole tray. The type outlives
  // `open` so the dialog's closing animation keeps showing the element it
  // was opened for instead of flashing the fallback doc.
  const [docsType, setDocsType] = useState<string | null>(null);
  const [docsOpen, setDocsOpen] = useState(false);
  // The "i" button that opened the dialog; the dialog returns focus to it
  // when it closes (see ElementDocsDialog's openerRef).
  const docsOpenerRef = useRef<HTMLElement | null>(null);
  const filteredItems = filterTrayItems(trayItems, filter);

  function add(item: TrayItem): void {
    if (dragged.current || !query.getNodes().ROOT) return;
    let parent = [...query.getState().events.selected][0] ?? 'ROOT';
    while (query.getNodes()[parent] && !query.node(parent).get().data.isCanvas) {
      const node = query.node(parent).get();
      parent = node.data.linkedNodes.content ?? node.data.parent ?? 'ROOT';
    }
    if (!query.getNodes()[parent]) parent = 'ROOT';
    const tree = query.parseReactElement(createTrayElement(item, query.getOptions().resolver)).toNodeTree();
    actions.addNodeTree(tree, parent);
    actions.selectNode(tree.rootNodeId);
  }

  function openDocs(type: string, opener: HTMLElement): void {
    docsOpenerRef.current = opener;
    setDocsType(type);
    setDocsOpen(true);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CreateComponentCard />
      <div className="px-2 pt-2">
        <div className={SEARCH}>
          <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search components"
            aria-label="Search components"
            className={SEARCH_INPUT}
          />
        </div>
      </div>
      <div className="flex flex-col overflow-y-auto pb-2">
        <CustomTray filter={filter} />
        {GROUP_ORDER.map((group) => {
          const items = filteredItems.filter((item) => item.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} data-tray-section={group}>
              <div data-tray-group={group} className={cn(LABEL, 'px-3 pt-3 pb-1')}>
                {group}
              </div>
              <ul className="flex flex-col gap-1 px-2">
                {items.map((item) => (
                  <li
                    key={item.type}
                    className="group flex items-center rounded-lg border border-transparent transition-[border-color] duration-150 hover:border-line-strong hover:bg-accent focus-within:border-line-strong focus-within:bg-accent"
                  >
                    {/* The drag surface: connectors.create marks it draggable
                    and attaches Craft's native dragstart/dragend listeners,
                    and data-tray-item sits on this exact element so a raw
                    dragstart on it names the TrayItem (drop-placeholder.tsx).
                    The "i" button below is its sibling, not a descendant -
                    an HTML drag starts from the nearest draggable ancestor
                    of the pointer, so a press on the button can never become
                    this item's drag. */}
                    <button
                      type="button"
                      aria-label={`Add ${item.label}`}
                      disabled={!hasRoot}
                      data-tray-item={item.type}
                      onPointerDown={() => { dragged.current = false; }}
                      onKeyDown={() => { dragged.current = false; }}
                      onClick={() => add(item)}
                      onDragStart={event => { dragged.current = true; event.dataTransfer.setData('application/x-dreamscape-element', item.type); }}
                      ref={(element) => {
                        if (element) connectors.create(element, () => createTrayElement(item, query.getOptions().resolver));
                      }}
                      className="flex min-w-0 flex-1 cursor-grab items-center gap-3 rounded-lg py-2 pr-2 pl-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-40 active:cursor-grabbing"
                    >
                      <item.icon className="size-4 shrink-0 text-acc2" aria-hidden />
                      <span className="text-[13px] font-medium text-foreground">{item.label}</span>
                    </button>
                    {/* The press bubbles like any other: the layer stack
                    menu dismisses on a document click and Radix's non-modal
                    layers detect outside presses the same way, so no
                    stopPropagation here. Being outside the drag surface is
                    what keeps it from starting a drag. */}
                    <button
                      type="button"
                      aria-label={`About ${item.label}`}
                      draggable={false}
                      className={INFO_BUTTON}
                      onClick={(event) => openDocs(item.type, event.currentTarget)}
                    >
                      <Info className="size-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {filteredItems.length === 0 && !library?.components.some(item => item.name.toLowerCase().includes(filter.trim().toLowerCase())) && (
        <p className="px-3 py-4 text-[12.5px] text-muted-foreground">
          {matchesOverlayHint(filter) ? OVERLAY_HINT_MESSAGE : 'No components match.'}
        </p>
      )}
      {/* Follow-up (after the grid merge, which owns workbench.tsx): hoist
      this beside ShortcutsOverlay in WorkbenchShell, with the tray taking an
      onShowDocs(type, opener) prop. Cmd+\ (toggle-ui, `always: true`) hides
      every panel including this tray, so while the dialog is open it
      unmounts mid-open: no exit animation, and focus lands on <body>
      because the opener is detached. Radix's cleanups clear the modal
      state, which component-tray.test.tsx pins. */}
      {docsType !== null && (
        <ElementDocsDialog type={docsType} open={docsOpen} onOpenChange={setDocsOpen} openerRef={docsOpenerRef} />
      )}
    </div>
  );
}
