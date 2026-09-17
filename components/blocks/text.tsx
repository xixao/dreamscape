import { useLayoutEffect, useRef, useState } from 'react';
import { useEditor, useNode, type UserComponent } from '@craftjs/core';
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
  const { enabled } = useEditor(state => ({ enabled: state.options.enabled }));
  const [editing, setEditing] = useState(false);
  const elementRef = useRef<HTMLElement | null>(null);
  const activeEdit = useRef(false);
  const canEdit = enabled && play.mode === 'design';
  const {
    connectors: { connect, drag },
    custom,
    actions: { setProp },
  } = useNode((node) => ({ custom: node.data.custom }));
  const Tag = ROLE_TAG[merged.role];
  const align = resolve<TextAlign>(merged.align, breakpoint as Breakpoint);
  const onClick = play.mode === 'play' ? interactionHandler(getInteraction({ data: { custom } }), play) : undefined;

  useLayoutEffect(() => {
    if (!editing || !elementRef.current) return;
    const element = elementRef.current;
    element.focus();
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    const selection = element.ownerDocument.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [editing]);

  function finish(cancel = false) {
    if (!activeEdit.current) return;
    activeEdit.current = false;
    const element = elementRef.current;
    const text = element?.innerText ?? element?.textContent ?? '';
    if (cancel && element) element.textContent = merged.text;
    else if (text !== merged.text) setProp((props: TextBlockProps) => { props.text = text; });
    setEditing(false);
  }

  function insertPlainText(text: string) {
    const element = elementRef.current;
    const selection = element?.ownerDocument.getSelection();
    if (!element || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!element.contains(range.commonAncestorContainer)) return;
    range.deleteContents();
    const node = element.ownerDocument.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  return (
    <Tag
      ref={(element) => {
        elementRef.current = element;
        if (element) connect(drag(element));
      }}
      data-block="Text"
      contentEditable={editing}
      suppressContentEditableWarning
      title={canEdit ? 'Double-click to edit text' : undefined}
      aria-label={editing ? 'Edit text' : undefined}
      role={editing ? 'textbox' : undefined}
      aria-multiline={editing ? true : undefined}
      style={{ whiteSpace: 'pre-wrap', minHeight: '1lh', minWidth: '1ch', ...(editing ? { cursor: 'text', outline: '2px solid var(--ring)', minWidth: '1ch' } : {}) }}
      onDoubleClick={canEdit ? event => { event.stopPropagation(); activeEdit.current = true; setEditing(true); } : undefined}
      onPointerDown={event => { if (editing) event.stopPropagation(); }}
      onMouseDown={event => { if (editing) event.stopPropagation(); }}
      onDragStartCapture={event => { if (editing) { event.preventDefault(); event.stopPropagation(); } }}
      onDrop={event => { if (editing) { event.preventDefault(); event.stopPropagation(); } }}
      onBlur={() => finish()}
      onKeyDown={event => {
        if (!editing) return;
        event.stopPropagation();
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Escape') { event.preventDefault(); finish(true); event.currentTarget.blur(); }
        else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); finish(); event.currentTarget.blur(); }
      }}
      onPaste={event => { if (editing) { event.preventDefault(); insertPlainText(event.clipboardData.getData('text/plain')); } }}
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
