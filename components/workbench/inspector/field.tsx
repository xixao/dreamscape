'use client';

import { BorderControl } from './border-control';
import type { BorderSettings } from '@/components/blocks/design-controls';
import { SpacingInput } from './spacing-input';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { FieldOption, FieldSchema } from '@/components/blocks/schema';
import {
  type Breakpoint,
  type Responsive,
  isResponsive,
  otherBreakpoint,
  resolve,
} from '@/lib/responsive';
import { cn } from '@/lib/utils';
import { CHIP, CHIP_INPUT, LABEL, SEG_GROUP, SEG_ITEM } from '../chrome';

export interface FieldProps {
  field: FieldSchema;
  value: unknown;
  breakpoint: Breakpoint;
  onChange: (next: unknown) => void;
  onJumpToBreakpoint?: (breakpoint: Breakpoint) => void;
}

function optionFor(options: readonly FieldOption[], raw: string): FieldOption | undefined {
  return options.find((option) => String(option.value) === raw);
}

export function Field({ field, value, breakpoint, onChange, onJumpToBreakpoint }: FieldProps) {
  const responsive = field.responsive === true;
  const current = responsive ? resolve(value as Responsive<unknown>, breakpoint) : value;
  const other =
    responsive && isResponsive<unknown>(value)
      ? (value[otherBreakpoint(breakpoint)] ?? value.mobile)
      : undefined;

  const commit = (next: unknown) => {
    if (!responsive) {
      onChange(next);
      return;
    }
    const base = isResponsive<unknown>(value) ? value : { mobile: current };
    onChange({ ...base, [breakpoint]: next });
  };

  const id = `field-${field.prop}`;
  const labelRow = (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className={LABEL}>
        {field.label}
      </Label>
      {responsive && (
        <Badge variant="outline" className="h-4 px-1 font-mono text-[9px] uppercase">
          {breakpoint}
        </Badge>
      )}
    </div>
  );
  const caption =
    responsive && other !== undefined ? (
      <button
        type="button"
        data-testid="breakpoint-caption"
        className="self-start font-mono text-[10.5px] text-muted-foreground hover:text-foreground"
        onClick={() => onJumpToBreakpoint?.(otherBreakpoint(breakpoint))}
      >
        {otherBreakpoint(breakpoint)}: {String(other)}
      </button>
    ) : null;

  if (field.kind === 'border') return <BorderControl value={current as BorderSettings} onChange={commit} />;

  if (field.kind === 'color') {
    const tokens = ['border', 'input', 'ring', 'background', 'foreground', 'card', 'card-foreground', 'primary', 'primary-foreground', 'secondary', 'secondary-foreground', 'muted', 'muted-foreground', 'accent', 'accent-foreground', 'destructive', 'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'];
    const options = [{ value: 'default', label: 'Default', color: 'var(--border)' }, ...tokens.map(token => ({ value: `var(--${token})`, label: `--${token}`, color: `var(--${token})` })), { value: 'transparent', label: 'Transparent', color: 'transparent' }];
    const selected = typeof current === 'string' && current ? current : 'default';
    if (!options.some(option => option.value === selected)) options.push({ value: selected, label: selected, color: selected });
    return <div data-field={field.prop} className="flex flex-col gap-1.5">
      {labelRow}
      <Select value={selected} onValueChange={next => commit(next === 'default' ? '' : next)}>
        <SelectTrigger id={id} aria-label={field.label} className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(option => <SelectItem key={option.value} value={option.value}><span className="inline-flex items-center gap-2"><span aria-hidden className="theme-basic inline-block size-4 shrink-0 rounded border" style={{ backgroundColor: option.color }} /><span>{option.label}</span></span></SelectItem>)}</SelectContent>
      </Select>
      {caption}
    </div>;
  }

  if (field.kind === 'spacing') {
    return <div data-field={field.prop} className="flex flex-col gap-1.5">
      {labelRow}
      <SpacingInput id={id} label={field.label} value={Number(current ?? 0)} options={field.options ?? []}
        max={field.max} integer={field.integer} onChange={commit} />
      {caption}
    </div>;
  }

  if (field.kind === 'boolean') {
    return (
      <div data-field={field.prop} className="flex items-center justify-between gap-3">
        {labelRow}
        <Switch id={id} checked={Boolean(current)} onCheckedChange={(checked) => commit(checked)} />
      </div>
    );
  }

  if (field.kind === 'text') {
    return (
      <div data-field={field.prop} className="flex flex-col gap-1.5">
        {labelRow}
        <div className={CHIP}>
          <Input
            id={id}
            value={String(current ?? '')}
            onChange={(event) => commit(event.target.value)}
            className={CHIP_INPUT}
          />
        </div>
        {caption}
      </div>
    );
  }

  const options = field.options ?? [];
  const selected = String(current);

  if (options.length <= 3) {
    return (
      <div data-field={field.prop} className="flex flex-col gap-1.5">
        {labelRow}
        <ToggleGroup
          type="single"
          id={id}
          aria-label={field.label}
          value={selected}
          onValueChange={(raw) => {
            const option = optionFor(options, raw);
            if (option) commit(option.value);
          }}
          className={SEG_GROUP}
        >
          {options.map((option) => (
            <ToggleGroupItem key={String(option.value)} value={String(option.value)} className={SEG_ITEM}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {caption}
      </div>
    );
  }

  return (
    <div data-field={field.prop} className="flex flex-col gap-1.5">
      {labelRow}
      <Select
        value={selected}
        onValueChange={(raw) => {
          const option = optionFor(options, raw);
          if (option) commit(option.value);
        }}
      >
        <SelectTrigger
          id={id}
          size="sm"
          aria-label={field.label}
          className={cn(CHIP, 'w-full font-mono text-[12.5px] font-medium text-foreground')}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={String(option.value)} value={String(option.value)}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {caption}
    </div>
  );
}
