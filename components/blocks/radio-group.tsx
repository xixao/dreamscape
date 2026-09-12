import { useNode, type UserComponent } from '@craftjs/core';
import { useState } from 'react';
import { RadioGroup as UiRadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { usePlay } from '@/components/play/play-context';
import { type GrowProps, blockClasses } from '@/lib/classes';
import { getInteraction, interactionHandler } from '@/lib/interactions';
import { parseList } from '@/lib/lists';
import { cn } from '@/lib/utils';
import { GROW_FIELD, type BlockSchema } from './schema';

export interface RadioGroupBlockProps extends GrowProps {
  label: string;
  options: string;
  selected: 1 | 2 | 3 | 4;
  disabled: boolean;
}

export const RADIO_GROUP_DEFAULTS: RadioGroupBlockProps = {
  label: '',
  options: 'Option A, Option B',
  selected: 1,
  disabled: false,
  grow: false,
};

/** Clamps the 1-based `selected` index to a valid position in the parsed list, defaulting to the first option. */
function selectedValue(options: readonly string[], selected: number): string {
  if (options.length === 0) return '';
  const index = Math.min(Math.max(selected, 1), options.length) - 1;
  return options[index];
}

// Every item is pointer-events-none and untabbable, and its Label carries no
// htmlFor, so a click anywhere in the group selects the block instead of
// changing the selection, the same reasoning as Checkbox and Switch. Play
// mode (see usePlay()) makes it a real, selectable radio group instead.
export const RadioGroup: UserComponent<Partial<RadioGroupBlockProps>> = (props) => {
  const merged: RadioGroupBlockProps = { ...RADIO_GROUP_DEFAULTS, ...props };
  const play = usePlay();
  const {
    connectors: { connect, drag },
    custom,
  } = useNode((node) => ({ custom: node.data.custom }));
  const isPlay = play.mode === 'play';
  const options = parseList(merged.options);
  const defaultValue = selectedValue(options, merged.selected);
  const [value, setValue] = useState(defaultValue);
  const onClick = isPlay ? interactionHandler(getInteraction({ data: { custom } }), play) : undefined;

  return (
    <div
      ref={(element) => {
        if (element) connect(drag(element));
      }}
      data-block="RadioGroup"
      className={cn('flex flex-col gap-3', blockClasses(merged))}
      onClick={onClick}
    >
      {merged.label !== '' && <Label>{merged.label}</Label>}
      <UiRadioGroup
        value={isPlay ? value : defaultValue}
        onValueChange={isPlay ? setValue : () => {}}
        disabled={isPlay ? merged.disabled : undefined}
        aria-disabled={!isPlay && merged.disabled ? true : undefined}
        className={cn('gap-2', !isPlay && 'pointer-events-none', merged.disabled && 'opacity-50')}
      >
        {options.map((option) => (
          <div key={option} className="flex items-center gap-2">
            <RadioGroupItem value={option} tabIndex={isPlay ? undefined : -1} />
            <Label>{option}</Label>
          </div>
        ))}
      </UiRadioGroup>
    </div>
  );
};

RadioGroup.craft = {
  displayName: 'Radio group',
  props: RADIO_GROUP_DEFAULTS,
};

export const radioGroupSchema: BlockSchema = {
  type: 'RadioGroup',
  fields: [
    { prop: 'label', label: 'Label', kind: 'text', section: 'Content' },
    { prop: 'options', label: 'Options', kind: 'text', section: 'Content' },
    {
      prop: 'selected',
      label: 'Selected',
      kind: 'select',
      section: 'Content',
      options: [1, 2, 3, 4].map((value) => ({ value, label: String(value) })),
    },
    { prop: 'disabled', label: 'Disabled', kind: 'boolean', section: 'Style' },
    GROW_FIELD,
  ],
};
