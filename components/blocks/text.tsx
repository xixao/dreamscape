import { useNode, type UserComponent } from '@craftjs/core';
import { usePlay } from '@/components/play/play-context';
import { type GrowProps, blockClasses } from '@/lib/classes';
import { getInteraction, interactionHandler } from '@/lib/interactions';
import { type Breakpoint, resolve } from '@/lib/responsive';
import { cn } from '@/lib/utils';
import { useStage } from '@/components/workbench/stage-context';
import { GROW_FIELD, type BlockSchema } from './schema';

export type TextRole = 'heading1' | 'heading2' | 'heading3' | 'paragraph' | 'caption';
export type TextAlign = 'start' | 'center' | 'end';

export interface TextBlockProps extends GrowProps {
  text: string;
  role: TextRole;
  align: { mobile: TextAlign; desktop?: TextAlign };
  muted: boolean;
}

export const TEXT_DEFAULTS: TextBlockProps = {
  text: 'Text',
  role: 'paragraph',
  align: { mobile: 'start', desktop: 'start' },
  muted: false,
  grow: false,
};

const ROLE_TAG: Record<TextRole, 'h1' | 'h2' | 'h3' | 'p'> = {
  heading1: 'h1',
  heading2: 'h2',
  heading3: 'h3',
  paragraph: 'p',
  caption: 'p',
};

const ROLE_CLASSES: Record<TextRole, string> = {
  heading1: 'text-4xl font-bold tracking-tight',
  heading2: 'text-2xl font-semibold',
  heading3: 'text-lg font-semibold',
  paragraph: 'text-base',
  caption: 'text-sm text-muted-foreground',
};

const ALIGN_CLASSES: Record<TextAlign, string> = {
  start: 'text-left',
  center: 'text-center',
  end: 'text-right',
};

export const Text: UserComponent<Partial<TextBlockProps>> = (props) => {
  const merged: TextBlockProps = { ...TEXT_DEFAULTS, ...props };
  const { breakpoint } = useStage();
  const play = usePlay();
  const {
    connectors: { connect, drag },
    custom,
  } = useNode((node) => ({ custom: node.data.custom }));
  const Tag = ROLE_TAG[merged.role];
  const align = resolve<TextAlign>(merged.align, breakpoint as Breakpoint);
  const onClick = play.mode === 'play' ? interactionHandler(getInteraction({ data: { custom } }), play) : undefined;

  return (
    <Tag
      ref={(element) => {
        if (element) connect(drag(element));
      }}
      data-block="Text"
      className={cn(
        ROLE_CLASSES[merged.role],
        ALIGN_CLASSES[align],
        merged.muted && 'text-muted-foreground',
        blockClasses(merged),
      )}
      onClick={onClick}
    >
      {merged.text}
    </Tag>
  );
};

Text.craft = {
  displayName: 'Text',
  props: TEXT_DEFAULTS,
};

export const textSchema: BlockSchema = {
  type: 'Text',
  fields: [
    { prop: 'text', label: 'Text', kind: 'text', section: 'Content' },
    {
      prop: 'role',
      label: 'Role',
      kind: 'select',
      section: 'Style',
      options: [
        { value: 'heading1', label: 'Heading 1' },
        { value: 'heading2', label: 'Heading 2' },
        { value: 'heading3', label: 'Heading 3' },
        { value: 'paragraph', label: 'Paragraph' },
        { value: 'caption', label: 'Caption' },
      ],
    },
    {
      prop: 'align',
      label: 'Align',
      kind: 'select',
      section: 'Style',
      responsive: true,
      options: [
        { value: 'start', label: 'Start' },
        { value: 'center', label: 'Center' },
        { value: 'end', label: 'End' },
      ],
    },
    { prop: 'muted', label: 'Muted', kind: 'boolean', section: 'Style' },
    GROW_FIELD,
  ],
};
