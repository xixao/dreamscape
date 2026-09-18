import { useId as useAccessibilityId } from 'react';
import { useNode, type UserComponent } from '@craftjs/core';
import {
  Select as UiSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { usePlay } from '@/components/play/play-context';
import { type GrowProps, blockClasses } from '@/lib/classes';
import { getInteraction, interactionHandler } from '@/lib/interactions';
import { parseList } from '@/lib/lists';
import { cn } from '@/lib/utils';
import { GROW_FIELD, type BlockSchema } from './schema';

export interface SelectBlockProps extends GrowProps {
  label: string;
  accessibleLabel?: string;
  helpText?: string;
  placeholder: string;
  options: string;
  disabled: boolean;
}

export const SELECT_DEFAULTS: SelectBlockProps = {
  accessibleLabel: '',
  helpText: '',
  label: '',
  placeholder: 'Select an option',
  options: 'Option 1, Option 2, Option 3',
  disabled: false,
  grow: false,
};

// Design mode renders only the trigger with its placeholder, never the
// dropdown: `options` is stored for later (code generation, real preview in
// a play mode) but is not read here. pointer-events-none keeps the trigger
// from ever opening, so a click always falls through to the block for
// selection, matching the Input block's read-only treatment. Play mode (see
// usePlay()) renders the real dropdown with `options` parsed into items.
export const Select: UserComponent<Partial<SelectBlockProps>> = (props) => {
  const merged: SelectBlockProps = { ...SELECT_DEFAULTS, ...props };
  const play = usePlay();
  const accessibilityId = useAccessibilityId();
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
      data-block="Select"
      className={cn('flex flex-col gap-2', blockClasses(merged))}
      onClick={onClick}
    >
      {merged.label !== '' && <Label data-writer-prop="label" htmlFor={accessibilityId}>{merged.label}</Label>}
      {isPlay ? (
        <UiSelect disabled={merged.disabled}>
          <SelectTrigger id={accessibilityId} aria-label={merged.label ? undefined : merged.accessibleLabel || undefined} aria-describedby={merged.helpText ? `${accessibilityId}-help` : undefined} className="w-full">
            <SelectValue placeholder={merged.placeholder} />
          </SelectTrigger>
          <SelectContent>
            {parseList(merged.options).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </UiSelect>
      ) : (
        <UiSelect>
          <SelectTrigger id={accessibilityId} aria-label={merged.label ? undefined : merged.accessibleLabel || undefined} aria-describedby={merged.helpText ? `${accessibilityId}-help` : undefined}
            tabIndex={-1}
            aria-disabled={merged.disabled || undefined}
            className={cn('pointer-events-none w-full', merged.disabled && 'opacity-50')}
          >
            <SelectValue placeholder={merged.placeholder} />
          </SelectTrigger>
        </UiSelect>
      )}
      {merged.helpText && <p id={`${accessibilityId}-help`} className="text-sm text-muted-foreground">{merged.helpText}</p>}
    </div>
  );
};

Select.craft = {
  displayName: 'Select',
  props: SELECT_DEFAULTS,
};

export const selectSchema: BlockSchema = {
  type: 'Select',
  fields: [
    { prop: 'helpText', label: 'Help text', kind: 'text', section: 'Content' },
    { prop: 'accessibleLabel', label: 'Accessible name', kind: 'text', section: 'Accessibility', showWhen: p => !p.label },
    { prop: 'label', label: 'Label', kind: 'text', section: 'Content' },
    { prop: 'placeholder', label: 'Placeholder', kind: 'text', section: 'Content' },
    { prop: 'options', label: 'Options', kind: 'text', section: 'Content' },
    { prop: 'disabled', label: 'Disabled', kind: 'boolean', section: 'Style' },
    GROW_FIELD,
  ],
};
