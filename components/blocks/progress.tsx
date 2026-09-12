import { useNode, type UserComponent } from '@craftjs/core';
import { Progress as UiProgress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { type GrowProps, blockClasses } from '@/lib/classes';
import { cn } from '@/lib/utils';
import { GROW_FIELD, type BlockSchema } from './schema';

export interface ProgressBlockProps extends GrowProps {
  value: string;
  label: string;
}

export const PROGRESS_DEFAULTS: ProgressBlockProps = {
  value: '50',
  label: '',
  grow: false,
};

export function clampPercent(raw: string): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, parsed));
}

export const Progress: UserComponent<Partial<ProgressBlockProps>> = (props) => {
  const merged: ProgressBlockProps = { ...PROGRESS_DEFAULTS, ...props };
  const {
    connectors: { connect, drag },
  } = useNode();

  return (
    <div
      ref={(element) => {
        if (element) connect(drag(element));
      }}
      data-block="Progress"
      className={cn('flex w-full flex-col gap-2', blockClasses(merged))}
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
