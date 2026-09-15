'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { FieldOption } from '@/components/blocks/schema';
import { CHIP, CHIP_INPUT, MENU_POPOVER } from '../chrome';

/** Editable pixel value with optional presets; commits once on Enter or blur. */
export function SpacingInput({ id, label, value, options, max, integer = false, onChange }: {
  id: string; label: string; value: number; options: readonly FieldOption[];
  max?: number; integer?: boolean; onChange: (value: number) => void;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [previous, setPrevious] = useState(value);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState(false);
  if (previous !== value) {
    setPrevious(value); setDraft(String(value)); setError(false); setActive(-1);
  }
  useEffect(() => {
    if (open && active >= 0) document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active, listId]);
  const validOptions = options.filter(option => typeof option.value === 'number' && (max === undefined || option.value <= max));
  function commit(text: string) {
    const raw = text.trim().replace(/\s*px$/i, '');
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isFinite(number) || number < 0 || (max !== undefined && number > max) || (integer && !Number.isInteger(number))) {
      setDraft(String(value)); setError(true); return;
    }
    setDraft(String(value)); setError(false);
    if (number !== value) onChange(number);
  }
  function choose(index: number) {
    const option = validOptions[index]; if (!option) return;
    commit(String(option.value)); setOpen(false); setActive(-1);
  }
  return <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
    <PopoverPrimitive.Anchor asChild>
      <div ref={anchorRef} className={CHIP}>
        <Input ref={inputRef} id={id} role="combobox" aria-label={label} aria-autocomplete="list"
          aria-expanded={open} aria-controls={open ? listId : undefined}
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          aria-invalid={error || undefined} aria-describedby={error ? `${listId}-error` : undefined}
          inputMode={integer ? 'numeric' : 'decimal'} autoComplete="off" value={draft} className={CHIP_INPUT}
          onFocus={event => { setOpen(true); setError(false); event.currentTarget.select(); }}
          onClick={() => setOpen(true)}
          onChange={event => { setDraft(event.target.value); setActive(-1); setError(false); setOpen(true); }}
          onBlur={() => { commit(draft); setOpen(false); setActive(-1); }}
          onKeyDown={event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault(); event.stopPropagation(); setOpen(true);
              if (!validOptions.length) return;
              setActive(index => event.key === 'ArrowDown' ? (index + 1) % validOptions.length : (index <= 0 ? validOptions.length - 1 : index - 1));
            } else if (event.key === 'Enter') {
              event.preventDefault(); event.stopPropagation();
              if (open && active >= 0) choose(active); else { commit(draft); setOpen(false); }
            } else if (event.key === 'Escape') {
              event.preventDefault(); event.stopPropagation(); setDraft(String(value)); setError(false); setActive(-1); setOpen(false);
            }
          }} />
        <span aria-hidden className="text-[11px] text-muted-foreground">px</span>
        <button type="button" aria-label={`Show ${label.toLowerCase()} presets`} tabIndex={-1}
          className="text-muted-foreground hover:text-foreground" onMouseDown={event => event.preventDefault()}
          onClick={() => { if (open) setOpen(false); else { inputRef.current?.focus(); setOpen(true); } }}><ChevronDown className="size-3.5" /></button>
      </div>
    </PopoverPrimitive.Anchor>
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content align="start" sideOffset={4} className={`${MENU_POPOVER} z-[110] w-[var(--radix-popover-trigger-width)] min-w-36 max-h-64 overflow-auto`}
        onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()}
        onInteractOutside={event => { if (anchorRef.current?.contains(event.target as Node)) event.preventDefault(); }}>
        <div id={listId} role="listbox" aria-label={`${label} presets`}>
          {validOptions.map((option, index) => <div key={String(option.value)} id={`${listId}-${index}`} role="option"
            aria-selected={active === index || (active < 0 && option.value === value)}
            className={`cursor-pointer rounded px-3 py-1.5 font-mono text-xs hover:bg-accent ${active === index ? 'bg-accent' : ''}`}
            onMouseDown={event => event.preventDefault()} onClick={() => choose(index)}>{option.label}</div>)}
        </div>
        <p className="border-t border-line-soft px-3 pt-2 pb-1 text-[10px] text-muted-foreground">Or type a custom value</p>
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
    {error && <p id={`${listId}-error`} role="alert" className="text-xs text-bad">Enter {integer ? 'a whole number' : 'a number'} {max === undefined ? 'of 0 or more' : `from 0 to ${max}`}.</p>}
  </PopoverPrimitive.Root>;
}
