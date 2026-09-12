import { useNode, type UserComponent } from '@craftjs/core';
import { Input as UiInput } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePlay } from '@/components/play/play-context';
import { type GrowProps, blockClasses } from '@/lib/classes';
import { getInteraction, interactionHandler } from '@/lib/interactions';
import { cn } from '@/lib/utils';
import { GROW_FIELD, type BlockSchema } from './schema';

export type InputType = 'text' | 'email' | 'password' | 'number';

export interface InputBlockProps extends GrowProps {
  label: string;
  placeholder: string;
  type: InputType;
  disabled: boolean;
}

export const INPUT_DEFAULTS: InputBlockProps = {
  label: '',
  placeholder: 'Placeholder',
  type: 'text',
  disabled: false,
  grow: false,
};

export const Input: UserComponent<Partial<InputBlockProps>> = (props) => {
  const merged: InputBlockProps = { ...INPUT_DEFAULTS, ...props };
  const play = usePlay();
  const {
    connectors: { connect, drag },
    custom,
  } = useNode((node) => ({ custom: node.data.custom }));
  const isPlay = play.mode === 'play';
  const onClick = isPlay ? interactionHandler(getInteraction({ data: { custom } }), play) : undefined;

  return (
    <div
      ref={(element) => {
        if (element) connect(drag(element));
      }}
      data-block="Input"
      className={cn('flex flex-col gap-2', blockClasses(merged))}
      onClick={onClick}
    >
      {merged.label !== '' && <Label>{merged.label}</Label>}
      <UiInput
        type={merged.type}
        placeholder={merged.placeholder}
        readOnly={!isPlay}
        tabIndex={isPlay ? undefined : -1}
        disabled={isPlay ? merged.disabled : undefined}
        aria-disabled={!isPlay && merged.disabled ? true : undefined}
        className={cn(!isPlay && 'pointer-events-none', merged.disabled && 'opacity-50')}
      />
    </div>
  );
};

Input.craft = {
  displayName: 'Input',
  props: INPUT_DEFAULTS,
};

export const inputSchema: BlockSchema = {
  type: 'Input',
  fields: [
    { prop: 'label', label: 'Label', kind: 'text', section: 'Content' },
    { prop: 'placeholder', label: 'Placeholder', kind: 'text', section: 'Content' },
    {
      prop: 'type',
      label: 'Type',
      kind: 'select',
      section: 'Style',
      options: [
        { value: 'text', label: 'Text' },
        { value: 'email', label: 'Email' },
        { value: 'password', label: 'Password' },
        { value: 'number', label: 'Number' },
      ],
    },
    { prop: 'disabled', label: 'Disabled', kind: 'boolean', section: 'Style' },
    GROW_FIELD,
  ],
};
