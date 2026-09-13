// SF2 §7 card + §10.1 bevel, used for the tray, inspector and topbar surfaces.
export const PANEL =
  'bg-card border border-(color:--bevel-line) rounded-xl shadow-[var(--bevel-hi),var(--sf-shadow-lg)]';

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
  'flex items-center gap-1.5 min-h-[30px] px-2 rounded-md bg-(--chip) border border-(color:--bevel-line) shadow-[var(--bevel-hi),var(--bevel-drop)] focus-within:border-acc';
export const CHIP_INPUT =
  'h-auto min-w-0 w-full border-0 bg-transparent px-0 py-1.5 font-mono text-[12.5px] font-medium text-foreground shadow-none rounded-none focus-visible:ring-0 focus-visible:border-0';

// SF2 §10.4 segmented control: recessed track, raised active item.
export const SEG_GROUP =
  'flex w-full gap-0.5 rounded-md p-0.5 bg-black/25 border border-white/5 shadow-[inset_0_1px_2px_rgba(0,0,0,.4)]';
export const SEG_ITEM =
  'flex-1 h-auto min-w-0 rounded-sm border-0 bg-transparent px-0 py-[5px] text-[11.5px] font-medium text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground data-[state=on]:bg-white/[.13] data-[state=on]:text-foreground data-[state=on]:shadow-[inset_0_1px_0_rgba(255,255,255,.09),0_1px_2px_rgba(0,0,0,.35)]';

// SF2 §10.4 grouped section: hairline runs the full panel width.
export const SECTION = 'border-t border-line-soft -mx-4 px-4 pt-3 mb-3.5';
export const SECTION_TITLE = 'text-[12.5px] font-semibold text-foreground mb-2.5';

// SF2 §4 empty state.
export const EMPTY =
  'border border-dashed border-line-strong rounded-xl p-11 text-center text-[13.5px] text-muted-foreground';
export const EMPTY_TITLE = 'block text-[15px] font-semibold text-t2 mb-1.5';

// SF2 §5 search field.
export const SEARCH =
  'flex items-center gap-2 rounded-[9px] border bg-muted px-3 py-2 focus-within:border-acc';
export const SEARCH_INPUT =
  'h-auto min-w-0 w-full border-0 bg-transparent p-0 text-[13px] text-foreground shadow-none rounded-none focus-visible:ring-0 focus-visible:border-0 placeholder:text-t4';

// SF2 §5 .btn look: secondary and primary buttons. The single shared
// definition for the Files-page actions (components/files/files-actions.tsx)
// and the comments composer's "Comment" button and thread's "Reply" button -
// previously the composer kept its own near-duplicate with different
// padding, which is exactly what let it drift out of sync with this one.
// h-auto overrides the shadcn Button's fixed h-8 so the literal padding here
// drives the box height, the same override CHIP_INPUT/SEARCH_INPUT/SEG_ITEM
// already apply above when fully re-skinning a primitive.
export const SECONDARY_BUTTON =
  'h-auto bg-muted border border-border rounded-[9px] px-3.5 py-2 text-[13px] font-medium text-foreground hover:bg-accent';
export const PRIMARY_BUTTON =
  'h-auto text-[13px] bg-[image:var(--grad)] text-white font-semibold border-0 rounded-[9px] px-[15px] py-[9px] hover:brightness-[1.08] hover:text-white';

// SF2 §5 .btn.danger: red text at rest, 12% wash on hover. The trailing `!`
// forces these to win even when a consumer mixes this into a Radix `Slot`
// (e.g. an AlertDialogAction with asChild): Slot concatenates its own
// variant's className with the child's rather than running them through
// tailwind-merge, so a plain (unmarked) hover:bg-bad/12 can lose the cascade
// to a ghost/outline variant's own hover:bg-muted. Confirmed live: without
// `!`, the New frame dialog's "Clear frame" button showed the plain ghost
// grey hover instead of the red wash.
export const DANGER_GHOST = 'text-bad hover:text-bad! hover:bg-bad/12!';

// SF2 popover, used by the press-and-hold layer stack menu (spec 2026-09-12,
// section 3). MENU_ROW's own `hover:bg-accent` gives mouse hover feedback;
// the keyboard-active row gets the same `bg-accent` applied conditionally,
// since arrow-key navigation does not trigger a CSS :hover.
export const MENU_POPOVER =
  'bg-card border border-(color:--bevel-line) rounded-md shadow-panel-lg p-1 min-w-44';
export const MENU_ROW =
  'flex items-center gap-2 rounded-sm px-2 py-1.5 text-[12.5px] hover:bg-accent';
export const MENU_HINT = 'font-mono text-[10px] text-t4';
export const MENU_SELECTED_CHIP = 'font-mono text-[10px] text-t4';

// Shortcuts overlay/dialog (spec docs/superpowers/specs/2026-09-12-
// shortcuts-overlay-design.md section 4). OVERLAY_SURFACE is only used by
// the display-only, hold-triggered presentation (shortcuts-overlay.tsx),
// which has no Radix primitive of its own to inherit chrome from; the
// dialog presentation reuses components/ui/dialog's own surface and only
// takes the group/row/key-cap treatment below, so the two never show
// different shortcut content even though their outer chrome differs.
export const OVERLAY_SURFACE =
  'w-[1240px] max-w-[calc(100vw-4rem)] rounded-2xl border border-line-strong bg-card p-8 shadow-panel-lg';
export const OVERLAY_TITLE = 'text-[20px] font-semibold text-foreground';
export const OVERLAY_CAPTION = 'font-mono text-[12px] text-muted-foreground';
export const OVERLAY_GRID = 'grid grid-cols-1 gap-x-12 gap-y-7 md:grid-cols-2 xl:grid-cols-3';
export const OVERLAY_GROUP_TITLE = 'mb-3 font-mono text-[12px] font-semibold tracking-[0.08em] text-muted-foreground uppercase';
export const OVERLAY_ROW_LABEL = 'text-[15px] leading-6 whitespace-nowrap text-t2';
export const OVERLAY_KEY_CAP =
  'rounded-sm border border-border bg-muted px-2 py-0.5 font-mono text-[13px] whitespace-nowrap shadow-[var(--bevel-hi),var(--bevel-drop)]';
