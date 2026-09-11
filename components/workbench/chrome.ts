// SF2 §7 card + §10.1 bevel, used for the tray, inspector and topbar surfaces.
export const PANEL =
  'bg-card border border-(color:--bevel-line) rounded-xl shadow-[var(--bevel-hi),var(--shadow-lg)]';

// SF2 §10.2 grip header of a vertical panel.
export const PANEL_HEADER =
  'flex items-center gap-2 px-3 pt-[9px] pb-[7px] border-b border-line-soft';

// SF2 §10.2 panel title and §2 mono field label.
export const PANEL_TITLE =
  'font-mono text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground';
export const LABEL =
  'font-mono text-[10.5px] font-semibold uppercase tracking-[.1em] text-muted-foreground';

// SF2 §10.4 icon-prefixed chip. CHIP wraps; CHIP_INPUT is for the shadcn Input or SelectTrigger inside it.
export const CHIP =
  'flex items-center gap-1.5 min-h-[30px] px-2 rounded-lg bg-(--chip) border border-(color:--bevel-line) shadow-[var(--bevel-hi),var(--bevel-drop)] focus-within:border-acc';
export const CHIP_INPUT =
  'h-auto min-w-0 w-full border-0 bg-transparent px-0 py-1.5 font-mono text-[12.5px] font-medium text-foreground shadow-none rounded-none focus-visible:ring-0 focus-visible:border-0 dark:bg-transparent';

// SF2 §10.4 segmented control: recessed track, raised active item.
export const SEG_GROUP =
  'flex w-full gap-0.5 rounded-lg p-0.5 bg-black/25 border border-white/5 shadow-[inset_0_1px_2px_rgba(0,0,0,.4)]';
export const SEG_ITEM =
  'flex-1 h-auto min-w-0 rounded-md border-0 bg-transparent px-2 py-[5px] text-[11.5px] font-medium text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground data-[state=on]:bg-white/[.13] data-[state=on]:text-foreground data-[state=on]:shadow-[inset_0_1px_0_rgba(255,255,255,.09),0_1px_2px_rgba(0,0,0,.35)]';

// SF2 §10.4 grouped section: hairline runs the full panel width.
export const SECTION = 'border-t border-line-soft -mx-4 px-4 pt-3 mb-3.5';
export const SECTION_TITLE = 'text-[12.5px] font-semibold text-foreground mb-2.5';

// SF2 §4 empty state.
export const EMPTY =
  'border border-dashed border-line-strong rounded-xl px-5 py-11 text-center text-[13.5px] text-muted-foreground';
export const EMPTY_TITLE = 'block text-[15px] font-semibold text-t2 mb-1.5';

// SF2 §5 .btn.danger: red text at rest, 12% wash on hover.
export const DANGER_GHOST = 'text-bad hover:text-bad hover:bg-bad/12';
