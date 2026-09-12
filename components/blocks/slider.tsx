import { useNode, type UserComponent } from '@craftjs/core';
import { useState } from 'react';
import { Slider as UiSlider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { usePlay } from '@/components/play/play-context';
import { type GrowProps, blockClasses } from '@/lib/classes';
import { getInteraction, interactionHandler } from '@/lib/interactions';
import { cn } from '@/lib/utils';
import { GROW_FIELD, type BlockSchema } from './schema';
import { clampPercent } from '@/lib/lists';

export interface SliderBlockProps extends GrowProps {
  label: string;
  value: string;
  disabled: boolean;
}

export const SLIDER_DEFAULTS: SliderBlockProps = {
  label: '',
  value: '50',
  disabled: false,
  grow: false,
};

export { clampPercent };

// pointer-events-none on the root blocks drag/click on the thumb (CSS
// pointer-events is inherited by descendants), so a click always selects
// the block. The installed Slider only forwards extra props to its Root,
// not to the thumb it renders internally, so the thumb keeps Radix's own
// tabIndex 0; that one gap is called out in the build report. Play mode
// (see usePlay()) removes pointer-events-none so the thumb is really
// draggable/keyboard-adjustable.
export const Slider: UserComponent<Partial<SliderBlockProps>> = (props) => {
  const merged: SliderBlockProps = { ...SLIDER_DEFAULTS, ...props };
  const play = usePlay();
  const {
    connectors: { connect, drag },
    custom,
  } = useNode((node) => ({ custom: node.data.custom }));
  const isPlay = play.mode === 'play';
  const defaultValue = clampPercent(merged.value);
  const [value, setValue] = useState(defaultValue);
  const onClick = isPlay ? interactionHandler(getInteraction({ data: { custom } }), play) : undefined;

  return (
    <div
      ref={(element) => {
        if (element) connect(drag(element));
      }}
      data-block="Slider"
      className={cn('flex flex-col gap-3', blockClasses(merged))}
      onClick={onClick}
    >
      {merged.label !== '' && <Label>{merged.label}</Label>}
      <UiSlider
        value={[isPlay ? value : defaultValue]}
        onValueChange={isPlay ? (next) => setValue(next[0]) : () => {}}
        disabled={isPlay ? merged.disabled : undefined}
        tabIndex={isPlay ? undefined : -1}
        aria-disabled={!isPlay && merged.disabled ? true : undefined}
        className={cn(!isPlay && 'pointer-events-none', merged.disabled && 'opacity-50')}
      />
    </div>
  );
};

Slider.craft = {
  displayName: 'Slider',
  props: SLIDER_DEFAULTS,
};

export const sliderSchema: BlockSchema = {
  type: 'Slider',
  fields: [
    { prop: 'label', label: 'Label', kind: 'text', section: 'Content' },
    { prop: 'value', label: 'Value', kind: 'text', section: 'Content' },
    { prop: 'disabled', label: 'Disabled', kind: 'boolean', section: 'Style' },
    GROW_FIELD,
  ],
};
