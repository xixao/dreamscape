import { useWriter } from '@/components/workbench/writer/context';
import { useId as useAccessibilityId } from 'react';
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
  invalid?: boolean; errorText?: string;
  label: string;
  accessibleLabel?: string;
  helpText?: string;
  placeholder: string;
  type: InputType;
  disabled: boolean;
  borderless?: boolean;
}

export const INPUT_DEFAULTS: InputBlockProps = {
  invalid: false, errorText: 'Please check this value.',
  accessibleLabel: '',
  helpText: '',
  label: '',
  placeholder: 'Placeholder',
  type: 'text',
  disabled: false,
  grow: false,
  borderless: false,
};

export const Input: UserComponent<Partial<InputBlockProps>> = (props) => {
  const merged: InputBlockProps = { ...INPUT_DEFAULTS, ...props };
  const play = usePlay();
  const accessibilityId = useAccessibilityId();
  const {
    connectors: { connect, drag },
    custom, id,
  } = useNode((node) => ({ custom: node.data.custom, id: node.id }));
  const writer = useWriter();
  const writerKey = JSON.stringify([writer?.scope ?? id, writer?.scope ? id : null]);
  if (writer?.statePreview?.key === writerKey) merged.invalid = writer.statePreview.state === 'error';
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
      {merged.label !== '' && <Label data-writer-prop="label" htmlFor={accessibilityId}>{merged.label}</Label>}
      <UiInput
        id={accessibilityId}
        aria-label={merged.label ? undefined : merged.accessibleLabel || undefined}
        aria-invalid={merged.invalid || undefined}
        aria-describedby={merged.invalid ? `${accessibilityId}-error` : merged.helpText ? `${accessibilityId}-help` : undefined}
        style={merged.borderless ? { border: 0, boxShadow: 'none', background: 'transparent' } : undefined}
        type={merged.type}
        placeholder={merged.placeholder}
        readOnly={!isPlay}
        tabIndex={isPlay ? undefined : -1}
        disabled={isPlay ? merged.disabled : undefined}
        aria-disabled={!isPlay && merged.disabled ? true : undefined}
        className={cn(!isPlay && 'pointer-events-none', merged.disabled && 'opacity-50')}
      />
      {merged.invalid && <p role="alert" id={`${accessibilityId}-error`} data-writer-prop="errorText" className="text-sm text-destructive">{merged.errorText}</p>}
      {merged.helpText && <p id={`${accessibilityId}-help`} className="text-sm text-muted-foreground">{merged.helpText}</p>}
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
    { prop: 'invalid', label: 'Preview error', kind: 'boolean', section: 'State' },
    { prop: 'errorText', label: 'Error message', kind: 'text', section: 'Content' },
    { prop: 'helpText', label: 'Help text', kind: 'text', section: 'Content' },
    { prop: 'accessibleLabel', label: 'Accessible name', kind: 'text', section: 'Accessibility', showWhen: p => !p.label },
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
    { prop: 'borderless', label: 'Borderless', kind: 'boolean', section: 'Style' },
    GROW_FIELD,
  ],
};
