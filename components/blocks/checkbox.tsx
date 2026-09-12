import { useNode, type UserComponent } from '@craftjs/core';
import { Checkbox as UiCheckbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { type GrowProps, blockClasses } from '@/lib/classes';
import { cn } from '@/lib/utils';
import { GROW_FIELD, type BlockSchema } from './schema';

export interface CheckboxBlockProps extends GrowProps {
  label: string;
  checked: boolean;
  disabled: boolean;
}

export const CHECKBOX_DEFAULTS: CheckboxBlockProps = {
  label: 'Accept the terms',
  checked: false,
  disabled: false,
  grow: false,
};

// The Label is not associated to the checkbox (no htmlFor/id): clicking it
// must not toggle the control natively, only select the block, the same
// reasoning behind pointer-events-none on the checkbox itself.
export const Checkbox: UserComponent<Partial<CheckboxBlockProps>> = (props) => {
  const merged: CheckboxBlockProps = { ...CHECKBOX_DEFAULTS, ...props };
  const {
    connectors: { connect, drag },
  } = useNode();

  return (
    <div
      ref={(element) => {
        if (element) connect(drag(element));
      }}
      data-block="Checkbox"
      className={cn('flex items-center gap-2', blockClasses(merged))}
    >
      <UiCheckbox
        checked={merged.checked}
        onCheckedChange={() => {}}
        tabIndex={-1}
        aria-disabled={merged.disabled || undefined}
        className={cn('pointer-events-none', merged.disabled && 'opacity-50')}
      />
      <Label>{merged.label}</Label>
    </div>
  );
};

Checkbox.craft = {
  displayName: 'Checkbox',
  props: CHECKBOX_DEFAULTS,
};

export const checkboxSchema: BlockSchema = {
  type: 'Checkbox',
  fields: [
    { prop: 'label', label: 'Label', kind: 'text', section: 'Content' },
    { prop: 'checked', label: 'Checked', kind: 'boolean', section: 'Style' },
    { prop: 'disabled', label: 'Disabled', kind: 'boolean', section: 'Style' },
    GROW_FIELD,
  ],
};
