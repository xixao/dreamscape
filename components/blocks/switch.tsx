import { useId as useAccessibilityId } from 'react';
import { useNode, type UserComponent } from '@craftjs/core';
import { useState } from 'react';
import { Switch as UiSwitch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { usePlay } from '@/components/play/play-context';
import { type GrowProps, blockClasses } from '@/lib/classes';
import { getInteraction, interactionHandler } from '@/lib/interactions';
import { cn } from '@/lib/utils';
import { GROW_FIELD, type BlockSchema } from './schema';

export interface SwitchBlockProps extends GrowProps {
  label: string;
  accessibleLabel?: string;
  checked: boolean;
  disabled: boolean;
}

export const SWITCH_DEFAULTS: SwitchBlockProps = {
  accessibleLabel: '',
  label: 'Enable notifications',
  checked: false,
  disabled: false,
  grow: false,
};

export const Switch: UserComponent<Partial<SwitchBlockProps>> = (props) => {
  const merged: SwitchBlockProps = { ...SWITCH_DEFAULTS, ...props };
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
      data-block="Switch"
      className={cn('flex items-center justify-between gap-3', blockClasses(merged))}
      onClick={onClick}
    >
      <Label data-writer-prop="label" htmlFor={accessibilityId}>{merged.label}</Label>
      <UiSwitch
        id={accessibilityId} aria-label={merged.label ? undefined : merged.accessibleLabel || undefined}
        checked={isPlay ? checked : merged.checked}
        onCheckedChange={isPlay ? setChecked : () => {}}
        disabled={isPlay ? merged.disabled : undefined}
        tabIndex={isPlay ? undefined : -1}
        aria-disabled={!isPlay && merged.disabled ? true : undefined}
        className={cn(!isPlay && 'pointer-events-none', merged.disabled && 'opacity-50')}
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
    { prop: 'accessibleLabel', label: 'Accessible name', kind: 'text', section: 'Accessibility', showWhen: p => !p.label },
    { prop: 'label', label: 'Label', kind: 'text', section: 'Content' },
    { prop: 'checked', label: 'Checked', kind: 'boolean', section: 'Style' },
    { prop: 'disabled', label: 'Disabled', kind: 'boolean', section: 'Style' },
    GROW_FIELD,
  ],
};
