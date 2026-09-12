import { useNode, type UserComponent } from '@craftjs/core';
import { Select as UiSelect, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { type GrowProps, blockClasses } from '@/lib/classes';
import { cn } from '@/lib/utils';
import { GROW_FIELD, type BlockSchema } from './schema';

export interface SelectBlockProps extends GrowProps {
  label: string;
  placeholder: string;
  options: string;
  disabled: boolean;
}

export const SELECT_DEFAULTS: SelectBlockProps = {
  label: '',
  placeholder: 'Select an option',
  options: 'Option 1, Option 2, Option 3',
  disabled: false,
  grow: false,
};

// Design mode renders only the trigger with its placeholder, never the
// dropdown: `options` is stored for later (code generation, real preview in
// a play mode) but is not read here. pointer-events-none keeps the trigger
// from ever opening, so a click always falls through to the block for
// selection, matching the Input block's read-only treatment.
export const Select: UserComponent<Partial<SelectBlockProps>> = (props) => {
  const merged: SelectBlockProps = { ...SELECT_DEFAULTS, ...props };
  const {
    connectors: { connect, drag },
  } = useNode();

  return (
    <div
      ref={(element) => {
        if (element) connect(drag(element));
      }}
      data-block="Select"
      className={cn('flex flex-col gap-2', blockClasses(merged))}
    >
      {merged.label !== '' && <Label>{merged.label}</Label>}
      <UiSelect>
        <SelectTrigger
          tabIndex={-1}
          aria-disabled={merged.disabled || undefined}
          className={cn('pointer-events-none w-full', merged.disabled && 'opacity-50')}
        >
          <SelectValue placeholder={merged.placeholder} />
        </SelectTrigger>
      </UiSelect>
    </div>
  );
};

Select.craft = {
  displayName: 'Select',
  props: SELECT_DEFAULTS,
};

export const selectSchema: BlockSchema = {
  type: 'Select',
  fields: [
    { prop: 'label', label: 'Label', kind: 'text', section: 'Content' },
    { prop: 'placeholder', label: 'Placeholder', kind: 'text', section: 'Content' },
    { prop: 'options', label: 'Options', kind: 'text', section: 'Content' },
    { prop: 'disabled', label: 'Disabled', kind: 'boolean', section: 'Style' },
    GROW_FIELD,
  ],
};
