import type { ReactNode } from 'react';
import type { BlockSchema, FieldSchema } from '@/components/blocks/schema';
import { SECTION, SECTION_TITLE } from '../chrome';
import { FieldLayout } from './field-layout';

/** Shared section presentation for the page and custom-component inspectors. */
export function SchemaSections({ schema, props, renderField }: {
  schema: BlockSchema;
  props: Record<string, unknown>;
  renderField: (field: FieldSchema) => ReactNode;
}) {
  return <>{schema.inspectorSections?.map(({ section, title, collapsed }) => {
    const fields = schema.fields.filter(field => field.section === section && (!field.showWhen || field.showWhen(props)));
    if (!fields.length) return null;
    const content = <FieldLayout fields={fields} renderField={renderField} />;
    return collapsed ? <details key={section} className={SECTION}>
      <summary className={`${SECTION_TITLE} cursor-pointer select-none focus-visible:outline-2 focus-visible:outline-ring`}>{title}</summary>
      {content}
    </details> : <section key={section} className={SECTION} aria-label={title}>
      <h3 className={SECTION_TITLE}>{title}</h3>{content}
    </section>;
  })}</>;
}
