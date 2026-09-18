import { useId as useAccessibilityId } from 'react';
import { useEffect, useRef, useId } from 'react';
import { designStyle, SIZE_DEFAULTS, SIZE_FIELDS, type DesignProps } from './design-controls';
import { useNode, type UserComponent } from '@craftjs/core';
import { Textarea as UiTextarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { usePlay } from '@/components/play/play-context';
import { type GrowProps, blockClasses } from '@/lib/classes';
import { getInteraction, interactionHandler } from '@/lib/interactions';
import { cn } from '@/lib/utils';
import { GROW_FIELD, type BlockSchema } from './schema';

export type TextareaRows = 2 | 3 | 4 | 5 | 6;

export interface TextareaBlockProps extends GrowProps, DesignProps {
  borderless?: boolean; autoGrow?: boolean; previewText?: string;
  label: string;
  accessibleLabel?: string;
  helpText?: string;
  placeholder: string;
  rows: TextareaRows;
  disabled: boolean;
}

export const TEXTAREA_DEFAULTS: TextareaBlockProps = {
  accessibleLabel: '',
  helpText: '',
  ...SIZE_DEFAULTS, borderless: false, autoGrow: false, previewText: '',
  label: '',
  placeholder: 'Placeholder',
  rows: 3,
  disabled: false,
  grow: false,
};

export const Textarea: UserComponent<Partial<TextareaBlockProps>> = (props) => {
  const merged: TextareaBlockProps = { ...TEXTAREA_DEFAULTS, ...props };
  const play = usePlay();
  const accessibilityId = useAccessibilityId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();
  useEffect(() => {
    const input = inputRef.current;
    if (!input || !merged.autoGrow) return;
    const resize = () => {
      input.style.height = 'auto';
      const min = merged.minHeightPx ?? 64;
      const max = Math.max(min, merged.maxHeightPx || 10000);
      const measured = input.scrollHeight + input.offsetHeight - input.clientHeight;
      input.style.height = `${Math.min(max, Math.max(min, measured))}px`;
      input.style.overflowY = measured > max ? 'auto' : 'hidden';
    };
    resize();
    input.addEventListener('input', resize);
    let lastWidth = input.parentElement?.clientWidth;
    const observer = new ResizeObserver(() => {
      const width = input.parentElement?.clientWidth;
      if (width !== lastWidth) { lastWidth = width; resize(); }
    });
    // Observe the wrapper width: observing the textarea would react to our own height write.
    if (input.parentElement) observer.observe(input.parentElement);
    return () => { input.removeEventListener('input', resize); observer.disconnect(); input.style.height = ''; input.style.overflowY = ''; };
  }, [merged.autoGrow, merged.minHeightPx, merged.maxHeightPx, merged.previewText]);
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
      style={{ width: designStyle(merged).width, minWidth: designStyle(merged).minWidth, maxWidth: designStyle(merged).maxWidth }}
      className={cn('flex flex-col gap-2', blockClasses(merged))}
      onClick={onClick}
    >
      {merged.label !== '' && <Label data-writer-prop="label" htmlFor={inputId}>{merged.label}</Label>}
      <UiTextarea
        ref={inputRef} id={inputId} aria-label={merged.label ? undefined : merged.accessibleLabel || undefined}
        aria-describedby={merged.helpText ? `${accessibilityId}-help` : undefined}
        value={!isPlay ? merged.previewText ?? '' : undefined}
        defaultValue={isPlay ? merged.previewText : undefined}
        style={{ ...designStyle({ ...merged, widthMode: 'fill' }), ...(merged.borderless ? { border: 0, boxShadow: 'none', background: 'transparent' } : {}), ...(merged.autoGrow ? { resize: 'none', fieldSizing: 'fixed' } : {}) }}
        placeholder={merged.placeholder}
        rows={merged.rows}
        readOnly={!isPlay}
        tabIndex={isPlay ? undefined : -1}
        disabled={isPlay ? merged.disabled : undefined}
        aria-disabled={!isPlay && merged.disabled ? true : undefined}
        className={cn(!isPlay && 'pointer-events-none', merged.disabled && 'opacity-50')}
      />
      {merged.helpText && <p id={`${accessibilityId}-help`} className="text-sm text-muted-foreground">{merged.helpText}</p>}
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
    { prop: 'helpText', label: 'Help text', kind: 'text', section: 'Content' },
    { prop: 'accessibleLabel', label: 'Accessible name', kind: 'text', section: 'Accessibility', showWhen: p => !p.label },
    ...SIZE_FIELDS,
    { prop: 'borderless', label: 'Borderless', kind: 'boolean', section: 'Style' },
    { prop: 'autoGrow', label: 'Auto-grow', kind: 'boolean', section: 'Layout' },
    { prop: 'previewText', label: 'Preview text', kind: 'text', section: 'Content' },
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
