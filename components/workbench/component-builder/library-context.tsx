'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { SaveState } from '@/lib/persistence';
import type { ComponentDefinition } from '@/lib/custom-components/model';
import { componentDefinitionSchema, newComponent } from '@/lib/custom-components/model';
import { ComponentBuilder } from './component-builder';

export interface LibraryValue {
  create?: (definition: ComponentDefinition) => void;
  components: ComponentDefinition[];
  open: (definition?: ComponentDefinition, sourceId?: string) => void;
  remove: (definition: ComponentDefinition) => void;
  duplicate: (definition: ComponentDefinition) => void;
  count: (id: string) => number;
}
const Library = createContext<LibraryValue | null>(null);
export const useComponentLibrary = () => useContext(Library);
export function ComponentLibraryProvider({ fileId, components, onSave, onRemove, count, children, saveState }: {
  saveState?: SaveState; fileId: string; components: ComponentDefinition[]; onSave: (definition: ComponentDefinition, sourceId?: string) => void;
  onRemove: (definition: ComponentDefinition) => void; count: (id: string) => number; children: ReactNode;
}) {
  const [editing, setEditing] = useState<ComponentDefinition | null>(null);
  const [sourceId, setSourceId] = useState<string | undefined>();
  const [deleting, setDeleting] = useState<ComponentDefinition | null>(null);
  function open(definition?: ComponentDefinition, origin?: string) {
    setSourceId(origin);
    let initial = definition ?? newComponent();
    try {
      const raw = localStorage.getItem(`assembly-workbench:component-draft:${fileId}:${definition?.id ?? 'new'}`);
      if (raw && !origin) { const parsed = componentDefinitionSchema.safeParse(JSON.parse(raw)); if (parsed.success) initial = parsed.data; }
    } catch { /* An unavailable browser store does not block creation. */ }
    setEditing(initial);
  }
  return <Library.Provider value={{ components, create: definition => onSave(definition), open, remove: setDeleting, count,
    duplicate: definition => onSave({ ...definition, id: newComponent().id, name: `${definition.name} copy`.slice(0, 120) }),
  }}>
    <div inert={editing !== null || deleting !== null}>{children}</div>
    {editing && <ComponentBuilder key={editing.id} fileId={fileId} initial={editing}
      existing={components.some(item => item.id === editing.id)} instances={count(editing.id)}
      saveState={saveState} onClose={() => setEditing(null)} onSave={definition => { onSave(definition, sourceId); if (!components.some(item => item.id === editing.id)) setEditing(null); }} />}
    {deleting && <div role="dialog" aria-modal="true" aria-label="Delete component" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
      <div className="w-96 rounded-xl border bg-card p-6 shadow-panel-lg"><h2 className="text-lg font-semibold">Delete {deleting.name}?</h2>
        <p className="my-4 text-sm text-muted-foreground">{count(deleting.id)} instances will become ordinary components. Their appearance and content will be preserved.</p>
        <div className="flex justify-end gap-3"><button autoFocus onClick={() => setDeleting(null)}>Cancel</button>
          <button className="rounded-md bg-destructive px-3 py-2 text-white" onClick={() => { onRemove(deleting); setDeleting(null); }}>Detach instances and delete</button></div>
      </div>
    </div>}
  </Library.Provider>;
}
