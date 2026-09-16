export type BlockType =
  | 'LayoutBox'
  | 'Button'
  | 'Input'
  | 'Card'
  | 'Dialog'
  | 'Text'
  | 'Image'
  | 'Textarea'
  | 'Select'
  | 'Checkbox'
  | 'RadioGroup'
  | 'Switch'
  | 'Slider'
  | 'Badge'
  | 'Avatar'
  | 'Alert'
  | 'Separator'
  | 'Progress'
  | 'Tabs'
  | 'Table';

export type ZoneType = 'CardContent' | 'DialogContent' | 'TabsContent';

export type FieldKind = 'select' | 'text' | 'boolean' | 'spacing' | 'color' | 'border' | 'width-limit' | 'image-source' | 'image-size';

export type SectionName = 'Layout' | 'Content' | 'Style' | 'State' | 'Advanced' | 'Editor';

export interface FieldOption {
  value: string | number;
  label: string;
}

export interface FieldSchema {
  prop: string;
  label: string;
  kind: FieldKind;
  section: SectionName;
  options?: readonly FieldOption[];
  max?: number;
  integer?: boolean;
  responsive?: boolean;
  editorOnly?: boolean;
  row?: string;
  control?: 'dropdown';
  showWhen?: (props: Record<string, unknown>) => boolean;
}

export interface BlockSchema {
  type: BlockType;
  fields: readonly FieldSchema[];
  inspectorSections?: readonly { section: SectionName; title: string; collapsed?: boolean }[];
}

export const GROW_FIELD: FieldSchema = {
  prop: 'grow',
  label: 'Fill container',
  kind: 'boolean',
  section: 'Layout',
};
