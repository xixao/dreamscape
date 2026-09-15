'use client';
import { useRef } from 'react';
import { Editor, Frame, useEditor } from '@craftjs/core';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { componentFromSelection, isComponentLayout } from '@/lib/custom-components/model';
import { resolver } from '@/components/blocks/registry';
import { StageProvider } from '../stage-context';
import { CustomComponent } from '@/components/blocks/custom-component';
import { useComponentLibrary } from './library-context';
import { LABEL } from '../chrome';
export function CreateComponentCard() {
  const library = useComponentLibrary();
  const { query, selected } = useEditor(state => ({ selected: [...state.events.selected][0] }));
  if (!library) return null;
  return <><button onClick={() => library.open()} className="group m-2 flex shrink-0 items-center gap-3 rounded-lg border border-acc/30 bg-acc/5 p-3 text-left transition-colors hover:border-acc hover:bg-acc/10 focus-visible:ring-2 focus-visible:ring-ring">
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-acc/15 text-acc"><Plus className="size-5" /></span>
    <span><span className="block text-[13px] font-semibold">Create component</span><span className="block text-[11px] text-muted-foreground">Build a reusable component</span></span>
  </button>
  {selected && query.node(selected).get().data.name === 'LayoutBox' && <button className="mx-3 mb-2 text-left text-xs text-acc" onClick={() => {
    const definition = componentFromSelection(query.serialize(), selected);
    if (isComponentLayout(definition.layout)) library.open(definition, selected);
  }}>Create from selected frame</button>}
  </>;
}
export function CustomTray({ filter }: { filter: string }) {
  const dragged = useRef(false);
  const library = useComponentLibrary();
  const { connectors } = useEditor();
  if (!library) return null;
  const matches = library.components.filter(item => item.name.toLowerCase().includes(filter.trim().toLowerCase()));
  if (!matches.length) return null;
  return <section className="px-2 pb-2" aria-label="Custom components"><h3 className={`${LABEL} px-1 pt-3 pb-2`}>Custom</h3>
    {matches.map(item => <div key={item.id} className="group mb-1 rounded-lg border border-line-soft bg-muted/30 p-2">
      <div role="button" tabIndex={0} aria-label={`Edit ${item.name}`} title="Click to edit; drag to add to the canvas"
        onPointerDown={() => { dragged.current = false; }} onDragStart={() => { dragged.current = true; }}
        onClick={() => { if (!dragged.current) library.open(item); }}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); library.open(item); } }}
        draggable ref={el => { if (el) connectors.create(el, <CustomComponent componentId={item.id} name={item.name} layout={item.layout} />); }} className="flex cursor-grab items-center gap-2 rounded py-2 hover:text-acc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-custom-component={item.id}>
        <div className="custom-component-content pointer-events-none h-12 w-16 shrink-0 overflow-hidden rounded bg-white" aria-hidden>
          <div className="theme-basic w-[400px] origin-top-left scale-[.16]">
            <StageProvider initialWidth={400}><Editor resolver={resolver} enabled={false}><Frame key={item.layout} data={item.layout} /></Editor></StageProvider>
          </div>
        </div><span className="truncate text-[13px]">{item.name}</span>
      </div>
      <div className="flex justify-end gap-3 text-muted-foreground">
        <button title="Duplicate" aria-label={`Duplicate ${item.name}`} onClick={() => library.duplicate(item)}><Copy className="size-3.5" /></button>
        <button title="Delete" aria-label={`Delete ${item.name}`} onClick={() => library.remove(item)}><Trash2 className="size-3.5" /></button>
      </div>
    </div>)}
  </section>;
}
