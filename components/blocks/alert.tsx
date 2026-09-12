import { useNode, type UserComponent } from '@craftjs/core';
import { Alert as UiAlert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { usePlay } from '@/components/play/play-context';
import { type GrowProps, blockClasses } from '@/lib/classes';
import { getInteraction, interactionHandler } from '@/lib/interactions';
import { cn } from '@/lib/utils';
import { GROW_FIELD, type BlockSchema } from './schema';

export type AlertVariant = 'default' | 'destructive';

export interface AlertBlockProps extends GrowProps {
  title: string;
  description: string;
  variant: AlertVariant;
}

export const ALERT_DEFAULTS: AlertBlockProps = {
  title: 'Heads up',
  description: 'You can add components to this alert.',
  variant: 'default',
  grow: false,
};

export const Alert: UserComponent<Partial<AlertBlockProps>> = (props) => {
  const merged: AlertBlockProps = { ...ALERT_DEFAULTS, ...props };
  const play = usePlay();
  const {
    connectors: { connect, drag },
    custom,
  } = useNode((node) => ({ custom: node.data.custom }));
  const onClick = play.mode === 'play' ? interactionHandler(getInteraction({ data: { custom } }), play) : undefined;

  return (
    <UiAlert
      ref={(element) => {
        if (element) connect(drag(element));
      }}
      data-block="Alert"
      variant={merged.variant}
      className={cn(blockClasses(merged))}
      onClick={onClick}
    >
      <AlertTitle>{merged.title}</AlertTitle>
      {merged.description !== '' && <AlertDescription>{merged.description}</AlertDescription>}
    </UiAlert>
  );
};

Alert.craft = {
  displayName: 'Alert',
  props: ALERT_DEFAULTS,
};

export const alertSchema: BlockSchema = {
  type: 'Alert',
  fields: [
    { prop: 'title', label: 'Title', kind: 'text', section: 'Content' },
    { prop: 'description', label: 'Description', kind: 'text', section: 'Content' },
    {
      prop: 'variant',
      label: 'Variant',
      kind: 'select',
      section: 'Style',
      options: [
        { value: 'default', label: 'Default' },
        { value: 'destructive', label: 'Destructive' },
      ],
    },
    GROW_FIELD,
  ],
};
