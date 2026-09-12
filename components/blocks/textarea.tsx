import { useNode, type UserComponent } from '@craftjs/core';
import { Textarea as UiTextarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { usePlay } from '@/components/play/play-context';
import { type GrowProps, blockClasses } from '@/lib/classes';
import { getInteraction, interactionHandler } from '@/lib/interactions';
import { cn } from '@/lib/utils';
import { GROW_FIELD, type BlockSchema } from './schema';

export type TextareaRows = 2 | 3 | 4 | 5 | 6;

export interface TextareaBlockProps extends GrowProps {
  label: string;
  placeholder: string;
  rows: TextareaRows;
  disabled: boolean;
}

export const TEXTAREA_DEFAULTS: TextareaBlockProps = {
  label: '',
  placeholder: 'Placeholder',
  rows: 3,
  disabled: false,
  grow: false,
};

export const Textarea: UserComponent<Partial<TextareaBlockProps>> = (props) => {
  const merged: TextareaBlockProps = { ...TEXTAREA_DEFAULTS, ...props };
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
      data-block="Textarea"
      className={cn('flex flex-col gap-2', blockClasses(merged))}
      onClick={onClick}
    >
      {merged.label !== '' && <Label>{merged.label}</Label>}
      <UiTextarea
        placeholder={merged.placeholder}
        rows={merged.rows}
        readOnly={!isPlay}
        tabIndex={isPlay ? undefined : -1}
        disabled={isPlay ? merged.disabled : undefined}
        aria-disabled={!isPlay && merged.disabled ? true : undefined}
        className={cn(!isPlay && 'pointer-events-none', merged.disabled && 'opacity-50')}
      />
    </div>
  );
};

Textarea.craft = {
  displayName: 'Textarea',
  props: TEXTAREA_DEFAULTS,
};

export const textareaSchema: BlockSchema = {
  type: 'Textarea',
  fields: [
    { prop: 'label', label: 'Label', kind: 'text', section: 'Content' },
    { prop: 'placeholder', label: 'Placeholder', kind: 'text', section: 'Content' },
    {
      prop: 'rows',
      label: 'Rows',
      kind: 'select',
      section: 'Style',
      options: [2, 3, 4, 5, 6].map((value) => ({ value, label: String(value) })),
    },
    { prop: 'disabled', label: 'Disabled', kind: 'boolean', section: 'Style' },
    GROW_FIELD,
  ],
};
