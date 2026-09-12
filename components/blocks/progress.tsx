import { useNode, type UserComponent } from '@craftjs/core';
import { Progress as UiProgress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { usePlay } from '@/components/play/play-context';
import { type GrowProps, blockClasses } from '@/lib/classes';
import { getInteraction, interactionHandler } from '@/lib/interactions';
import { cn } from '@/lib/utils';
import { GROW_FIELD, type BlockSchema } from './schema';
import { clampPercent } from '@/lib/lists';

export interface ProgressBlockProps extends GrowProps {
  value: string;
  label: string;
}

export const PROGRESS_DEFAULTS: ProgressBlockProps = {
  value: '50',
  label: '',
  grow: false,
};

export { clampPercent };

export const Progress: UserComponent<Partial<ProgressBlockProps>> = (props) => {
  const merged: ProgressBlockProps = { ...PROGRESS_DEFAULTS, ...props };
  const play = usePlay();
  const {
    connectors: { connect, drag },
    custom,
  } = useNode((node) => ({ custom: node.data.custom }));
  const onClick = play.mode === 'play' ? interactionHandler(getInteraction({ data: { custom } }), play) : undefined;

  return (
    <div
      ref={(element) => {
        if (element) connect(drag(element));
      }}
      data-block="Progress"
      className={cn('flex w-full flex-col gap-2', blockClasses(merged))}
      onClick={onClick}
    >
      {merged.label !== '' && <Label>{merged.label}</Label>}
      <UiProgress value={clampPercent(merged.value)} />
    </div>
  );
};

Progress.craft = {
  displayName: 'Progress',
  props: PROGRESS_DEFAULTS,
};

export const progressSchema: BlockSchema = {
  type: 'Progress',
  fields: [
    { prop: 'value', label: 'Value', kind: 'text', section: 'Content' },
    { prop: 'label', label: 'Label', kind: 'text', section: 'Content' },
    GROW_FIELD,
  ],
};
