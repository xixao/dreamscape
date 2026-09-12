import { useNode, type UserComponent } from '@craftjs/core';
import { Switch as UiSwitch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { type GrowProps, blockClasses } from '@/lib/classes';
import { cn } from '@/lib/utils';
import { GROW_FIELD, type BlockSchema } from './schema';

export interface SwitchBlockProps extends GrowProps {
  label: string;
  checked: boolean;
  disabled: boolean;
}

export const SWITCH_DEFAULTS: SwitchBlockProps = {
  label: 'Enable notifications',
  checked: false,
  disabled: false,
  grow: false,
};

export const Switch: UserComponent<Partial<SwitchBlockProps>> = (props) => {
  const merged: SwitchBlockProps = { ...SWITCH_DEFAULTS, ...props };
  const {
    connectors: { connect, drag },
  } = useNode();

  return (
    <div
      ref={(element) => {
        if (element) connect(drag(element));
      }}
      data-block="Switch"
      className={cn('flex items-center justify-between gap-3', blockClasses(merged))}
    >
      <Label>{merged.label}</Label>
      <UiSwitch
        checked={merged.checked}
        onCheckedChange={() => {}}
        tabIndex={-1}
        aria-disabled={merged.disabled || undefined}
        className={cn('pointer-events-none', merged.disabled && 'opacity-50')}
      />
    </div>
  );
};

Switch.craft = {
  displayName: 'Switch',
  props: SWITCH_DEFAULTS,
};

export const switchSchema: BlockSchema = {
  type: 'Switch',
  fields: [
    { prop: 'label', label: 'Label', kind: 'text', section: 'Content' },
    { prop: 'checked', label: 'Checked', kind: 'boolean', section: 'Style' },
    { prop: 'disabled', label: 'Disabled', kind: 'boolean', section: 'Style' },
    GROW_FIELD,
  ],
};
