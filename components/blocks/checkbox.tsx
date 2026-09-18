import { useId as useAccessibilityId } from 'react';
import { useNode, type UserComponent } from '@craftjs/core';
import { useState } from 'react';
import { Checkbox as UiCheckbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { usePlay } from '@/components/play/play-context';
import { type GrowProps, blockClasses } from '@/lib/classes';
import { getInteraction, interactionHandler } from '@/lib/interactions';
import { cn } from '@/lib/utils';
import { GROW_FIELD, type BlockSchema } from './schema';

export interface CheckboxBlockProps extends GrowProps {
  label: string;
  accessibleLabel?: string;
  checked: boolean;
  disabled: boolean;
}

export const CHECKBOX_DEFAULTS: CheckboxBlockProps = {
  accessibleLabel: '',
  label: 'Accept the terms',
  checked: false,
  disabled: false,
  grow: false,
};

// The Label is not associated to the checkbox (no htmlFor/id): clicking it
// must not toggle the control natively, only select the block, the same
// reasoning behind pointer-events-none on the checkbox itself. Play mode
// (see usePlay()) makes it a real, toggleable checkbox instead.
export const Checkbox: UserComponent<Partial<CheckboxBlockProps>> = (props) => {
  const merged: CheckboxBlockProps = { ...CHECKBOX_DEFAULTS, ...props };
  const play = usePlay();
  const accessibilityId = useAccessibilityId();
  const {
    connectors: { connect, drag },
    custom,
  } = useNode((node) => ({ custom: node.data.custom }));
  const isPlay = play.mode === 'play';
  const [checked, setChecked] = useState(merged.checked);
  const onClick = isPlay ? interactionHandler(getInteraction({ data: { custom } }), play) : undefined;

  return (
    <div
      ref={(element) => {
        if (element) connect(drag(element));
      }}
      data-block="Checkbox"
      className={cn('flex items-center gap-2', blockClasses(merged))}
      onClick={onClick}
    >
      <UiCheckbox
        id={accessibilityId} aria-label={merged.label ? undefined : merged.accessibleLabel || undefined}
        checked={isPlay ? checked : merged.checked}
        onCheckedChange={isPlay ? (value) => setChecked(value === true) : () => {}}
        disabled={isPlay ? merged.disabled : undefined}
        tabIndex={isPlay ? undefined : -1}
        aria-disabled={!isPlay && merged.disabled ? true : undefined}
        className={cn(!isPlay && 'pointer-events-none', merged.disabled && 'opacity-50')}
      />
      <Label data-writer-prop="label" htmlFor={accessibilityId}>{merged.label}</Label>
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
    { prop: 'accessibleLabel', label: 'Accessible name', kind: 'text', section: 'Accessibility', showWhen: p => !p.label },
    { prop: 'label', label: 'Label', kind: 'text', section: 'Content' },
    { prop: 'checked', label: 'Checked', kind: 'boolean', section: 'Style' },
    { prop: 'disabled', label: 'Disabled', kind: 'boolean', section: 'Style' },
    GROW_FIELD,
  ],
};
