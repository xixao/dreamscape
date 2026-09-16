import type { ReactNode } from 'react';
import type { FieldSchema } from '@/components/blocks/schema';
import { LABEL } from '../chrome';

const isPaddingSide = (field: FieldSchema) => /^padding(Top|Right|Bottom|Left)Px$/.test(field.prop);

export function FieldLayout({ fields, renderField }: { fields: readonly FieldSchema[]; renderField: (field: FieldSchema) => ReactNode }) {
  const sides = fields.filter(isPaddingSide);
  return <div className="flex flex-col gap-3">{fields.map(field => {
    if (field.row) {
      const row = fields.filter(item => item.row === field.row);
      if (field !== row[0]) return null;
      return <div key={field.row} className="grid grid-cols-2 gap-2">{row.map(item => <div key={item.prop} className="min-w-0">{renderField(item)}</div>)}</div>;
    }
    if (!isPaddingSide(field)) return <div key={field.prop}>{renderField(field)}</div>;
    if (field !== sides[0]) return null;
    return <fieldset key="padding-sides" className="min-w-0"><legend className={`${LABEL} mb-2`}>Padding</legend>
      <div className="grid grid-cols-2 gap-x-2 gap-y-2">{sides.map(side => <div key={side.prop} className="min-w-0">{renderField({ ...side, label: side.label.replace(/^Padding /i, '').replace(/^./, letter => letter.toUpperCase()) })}</div>)}</div>
    </fieldset>;
  })}</div>;
}
