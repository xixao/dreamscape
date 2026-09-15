'use client';
import { useEditor } from '@craftjs/core';
import { schemaFor } from '@/components/blocks/registry';
import { detachInstance, type Tree, type ContentOverrides } from '@/lib/custom-components/model';
import { Field } from '../inspector/field';
import { useComponentLibrary } from './library-context';
export function InstanceFields({ id, props }: { id: string; props: Record<string, unknown> }) {
  const { actions, query } = useEditor();
  const library = useComponentLibrary();
  const definition = library?.components.find(item => item.id === props.componentId);
  const tree = JSON.parse(props.layout as string) as Tree;
  const overrides = (props.overrides ?? {}) as ContentOverrides;
  return <div className="flex flex-col gap-4"><h3 className="font-semibold">{String(props.name)}</h3>
    <p className="text-xs text-muted-foreground">Content belongs to this instance. Layout follows the shared component.</p>
    <div className="flex gap-3 text-xs text-acc">{definition && <button onClick={() => library?.open(definition)}>Edit component</button>}
      <button onClick={() => { const layout = JSON.parse(query.serialize()) as Tree; detachInstance(layout, id); actions.deserialize(JSON.stringify(layout)); actions.selectNode(id); }}>Detach</button>
    </div>
    {Object.entries(tree).map(([nodeId, node]) => {
      const fields = schemaFor(node.type.resolvedName)?.fields.filter(field => field.section === 'Content') ?? [];
      if (!fields.length) return null;
      return <section key={nodeId} className="flex flex-col gap-3 border-t border-line-soft pt-3"><h4 className="text-xs text-muted-foreground">{node.displayName}</h4>
        {fields.map(field => <Field key={field.prop} field={{ ...field, responsive: false }} breakpoint="desktop"
          value={overrides[nodeId]?.[field.prop] ?? node.props[field.prop]}
          onChange={value => actions.setProp(id, p => { p.overrides = { ...p.overrides, [nodeId]: { ...p.overrides?.[nodeId], [field.prop]: value } }; })} />)}
      </section>;
    })}
  </div>;
}
