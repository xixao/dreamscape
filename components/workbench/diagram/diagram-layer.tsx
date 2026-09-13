'use client';

// This file stays one composition root for the fix wave in
// task-diagram-followups-review.md, but it has outgrown that shape - the
// review's proposed split (not done here, to keep this wave's diff
// reviewable) is:
//   - use-diagram-gestures.ts  (drag/resize/connect/place state machine)
//   - use-diagram-hover.ts     (hover tracking + quick-add circle targeting)
//   - diagram-paths.ts         (edge path/anchor math shared by render + hit-testing)
//   - diagram-node.tsx / diagram-edge.tsx   (per-shape rendering, incl. ghosts)
//   - diagram-node-menu.tsx / diagram-edge-menu.tsx  (the two ContextMenu bodies)
// leaving DiagramLayer itself as a ~250-line component that wires the above
// together.

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { nanoid } from 'nanoid';
import { Plus } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  anchorOnBox,
  getBezierPath,
  getHandlePosition,
  getSmoothStepPath,
  getStraightPath,
  sideFromPoint,
  snapToGrid,
  type Box,
  type Point,
  type Side,
} from '@/lib/diagram/geometry';
import {
  ALIGN_MODES,
  ARROW_KINDS,
  CONNECTOR_KINDS,
  DIAGRAM_COLORS,
  duplicatePairs,
  MAX_TEXT_LENGTH,
  MIN_SIZE,
  NODE_KINDS,
  TEXT_COLORS,
  TEXT_FONTS,
  TEXT_SIZES,
  type AlignMode,
  type ArrowKind,
  type ConnectorKind,
  type DiagramAction,
  type DiagramColor,
  type DiagramEdge,
  type DiagramNode,
  type DiagramNodeKind,
  type DiagramSelection,
  type DiagramState,
  type EdgeEndpoint,
  type TextColor,
  type TextFont,
  type TextSize,
} from '@/lib/diagram/store';
import type { Viewport } from '@/lib/canvas/viewport';
import { capturePointer, releasePointer } from '@/lib/dom';
import { cn } from '@/lib/utils';
import { CHIP, MENU_HINT, MENU_POPOVER, MENU_ROW } from '../chrome';
// Read-only import (review finding 3) - keyboard.tsx/lib/shortcuts.ts
// themselves belong to a different branch and are not touched here.
import { isEditableTarget } from '@/lib/dom';
import {
  ARROW_LABELS,
  CONNECTOR_LABELS,
  COLOR_LABELS,
  KIND_LABELS,
  TEXT_COLOR_LABELS,
  TEXT_FONT_LABELS,
  TEXT_SIZE_LABELS,
} from './diagram-fields';

// Build step 3's Align submenu (Left, Center, Right, Top, Middle, Bottom) -
// labelled distinctly from KIND_LABELS/COLOR_LABELS et al since these are
// one-shot actions, not a persisted field with a "current" value.
const ALIGN_LABELS: Record<AlignMode, string> = {
  left: 'Left',
  centerX: 'Center',
  right: 'Right',
  top: 'Top',
  centerY: 'Middle',
  bottom: 'Bottom',
};

// The tool the diagram palette (diagram-palette.tsx) put the canvas in:
// plain selection, about to place a specific shape kind, or about to draw a
// connector. Owned by whoever renders both DiagramPalette and DiagramLayer
// (components/workbench/canvas.tsx / workbench.tsx), not by this layer
// itself, since the top bar's Diagram tool button and Shift+D need to reach
// the very same state.
export type DiagramTool = { kind: 'pointer' } | { kind: 'shape'; shape: DiagramNodeKind } | { kind: 'connector' };

export const POINTER_TOOL: DiagramTool = { kind: 'pointer' };

export interface DiagramFrameBox extends Box {
  id: string;
}

export interface DiagramLayerProps {
  diagram: DiagramState;
  dispatch: (action: DiagramAction) => void;
  // The current page's frames, in canvas-space - a connector can anchor to
  // one of these the same way it anchors to a diagram node (spec: "a frame
  // can be a source or target; its anchor is the frame box").
  frames: readonly DiagramFrameBox[];
  viewport: Viewport;
  tool: DiagramTool;
  // Called once a shape has actually been placed (click or drag-to-size) or
  // a placement/connect gesture is cancelled - the caller (WorkbenchShell)
  // returns the tool to pointer, same as Escape/V already do.
  onToolConsumed: () => void;
  // Called when exporting the selection to PNG or SVG via the context menu
  onExport?: (format: 'png' | 'svg') => void;
}

const DEFAULT_SIZE: Record<DiagramNodeKind, { width: number; height: number }> = {
  rect: { width: 160, height: 80 },
  rounded: { width: 160, height: 80 },
  decision: { width: 160, height: 100 },
  terminal: { width: 140, height: 56 },
  text: { width: 140, height: 40 },
  note: { width: 140, height: 100 },
};

// Screen-px, not canvas-px: a placement click that moves less than this
// counts as a plain click (place at the default size) rather than a
// drag-to-size, regardless of zoom.
const PLACEMENT_CLICK_THRESHOLD = 4;
// Screen-px radius of a connect/hover handle - kept in screen space (divided
// by zoom before use) so handles stay a constant, easy-to-hit size at any
// zoom level, the same reasoning lib/canvas/viewport.ts's own padding
// constants document elsewhere.
const HANDLE_RADIUS = 5;
const RESIZE_HANDLE_SIZE = 8;
// Build step 4's quick-add circles: 20px diameter (radius 10), centered
// 20px beyond the box edge - far enough out that its own edge clears the
// connect handle's (radius 5, sitting AT the box edge) with room to spare,
// so the two never overlap. Screen-px, same convention as HANDLE_RADIUS/
// RESIZE_HANDLE_SIZE above (divided by zoom before use).
const QUICK_ADD_RADIUS = 10;
const QUICK_ADD_ICON_SIZE = 12;
const QUICK_ADD_GAP_SCREEN = 20;

const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];

// Review nit 18: replaces a redundant `type Side as StoreSide` re-import
// plus an `as StoreSide` cast at the one call site that checked an
// EdgeEndpoint's optional `side` against SIDES - `(SIDES as readonly
// string[]).includes(...)` does not by itself narrow TypeScript's type for
// `endpoint.side` (a plain `readonly string[]` check never narrows to a
// literal union), which was the actual reason for the cast; a real type
// guard does, with no cast and no second import of the same type needed.
function isSide(value: string): value is Side {
  return (SIDES as readonly string[]).includes(value);
}

const COLOR_CLASSES: Record<DiagramNode['color'], { fill: string; stroke: string }> = {
  neutral: { fill: 'fill-white/10', stroke: 'stroke-white/50' },
  blue: { fill: 'fill-blue-500/25', stroke: 'stroke-blue-400' },
  green: { fill: 'fill-green-500/25', stroke: 'stroke-green-400' },
  amber: { fill: 'fill-amber-500/25', stroke: 'stroke-amber-400' },
  red: { fill: 'fill-red-500/25', stroke: 'stroke-red-400' },
  violet: { fill: 'fill-violet-500/25', stroke: 'stroke-violet-400' },
};

// Spec section 9 (Build step 2): "sizes 11/13/16 px" / the tool's sans and
// mono stacks plus a system serif / "each diagram colour at full strength
// (the *-400 text tones used elsewhere)... and black" - applied verbatim
// (medium/sans/default when a field is absent, i.e. exactly today's fixed
// 13px white sans render) in the on-screen text div, the inline editor
// textarea and the Option-drag ghost (renderGhosts), so the three can never
// drift from one another.
const TEXT_SIZE_CLASSES: Record<TextSize, string> = {
  small: 'text-[11px]',
  medium: 'text-[13px]',
  large: 'text-[16px]',
};
const TEXT_FONT_CLASSES: Record<TextFont, string> = {
  sans: 'font-sans',
  serif: 'font-serif',
  mono: 'font-mono',
};
const TEXT_COLOR_CLASSES: Record<TextColor, string> = {
  default: 'text-white',
  neutral: 'text-neutral-400',
  blue: 'text-blue-400',
  green: 'text-green-400',
  amber: 'text-amber-400',
  red: 'text-red-400',
  violet: 'text-violet-400',
  black: 'text-black',
};

function textStyleClasses(node: DiagramNode): string {
  return cn(
    TEXT_SIZE_CLASSES[node.textSize ?? 'medium'],
    TEXT_FONT_CLASSES[node.textFont ?? 'sans'],
    TEXT_COLOR_CLASSES[node.textColor ?? 'default'],
  );
}

function boxContains(box: Box, point: Point): boolean {
  return point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;
}

function isSelected(selection: DiagramSelection, type: 'node' | 'edge', id: string): boolean {
  return selection.some((item) => item.type === type && item.id === id);
}

/** A quick-add circle's own center: `box`'s side-midpoint, nudged QUICK_ADD_GAP_SCREEN further out along that side's axis. */
function quickAddPosition(box: Box, side: Side, zoom: number): Point {
  const base = getHandlePosition(box, side);
  const offset = QUICK_ADD_GAP_SCREEN / zoom;
  switch (side) {
    case 'top':
      return { x: base.x, y: base.y - offset };
    case 'bottom':
      return { x: base.x, y: base.y + offset };
    case 'left':
      return { x: base.x - offset, y: base.y };
    case 'right':
      return { x: base.x + offset, y: base.y };
  }
}

// A quick-add circle sits just outside its shape's own box, across a
// screen-space gap - a naive "am I over the shape's box, or over one of its
// four (small, individually-placed) circles" hover check leaves that gap,
// and the far side of each circle, covered by neither: the pointer crossing
// it reads as having left the shape, hiding the circles before the cursor
// ever reaches one (the actual bug: reported as "I can't reach them, they
// disappear because I'm not 'over' the shape anymore"). `quickAddHaloBox`
// covers the whole gap-plus-circle zone, on all four sides at once, with a
// single expanded rectangle - simpler than four individual circle
// hit-tests, and deliberately generous rather than exact (it only ever
// EXTENDS how long a hover survives past `box`'s own edge; the box hit-test
// itself, above, is untouched and still wins immediately over any halo).
const QUICK_ADD_HALO_SLACK_SCREEN = 4;
const QUICK_ADD_HALO_MARGIN_SCREEN = QUICK_ADD_GAP_SCREEN + QUICK_ADD_RADIUS * 2 + QUICK_ADD_HALO_SLACK_SCREEN;

/** `box` expanded by the quick-add halo margin on every side, in canvas units (screen px / zoom, like every other quick-add constant here). */
function quickAddHaloBox(box: Box, zoom: number): Box {
  const margin = QUICK_ADD_HALO_MARGIN_SCREEN / zoom;
  return { x: box.x - margin, y: box.y - margin, width: box.width + margin * 2, height: box.height + margin * 2 };
}

type HoverTarget = { type: 'node' | 'frame'; id: string } | null;

// Every in-flight gesture keeps the element pointer capture was taken on
// (`target`), so Escape (review finding 5) can release it explicitly from a
// plain `window` keydown handler, which has no pointer event of its own to
// read a capture target off.
// `duplicate: true` marks an Option-drag (review finding 1): the originals
// stay put (renderedNodeBox only offsets a plain drag), a ghost previews
// the copies (renderGhosts), and endDrag mints and dispatches the actual
// `duplicate` only once, at pointer up, instead of writing anything here.
type DragState = { pointerId: number; ids: string[]; start: Point; target: SVGElement; duplicate?: boolean } | null;
type ResizeState = {
  pointerId: number;
  id: string;
  corner: 'nw' | 'ne' | 'sw' | 'se';
  start: Point;
  box: Box;
  target: SVGElement;
} | null;
type ConnectSource = { type: 'node' | 'frame'; id: string; side: Side };
type ConnectState = {
  pointerId: number;
  source: ConnectSource;
  anchor: Point;
  current: Point;
  target: SVGElement;
} | null;
type PlaceState = { pointerId: number; start: Point; current: Point; target: SVGElement } | null;
type EditState = { id: string; draft: string } | null;

function endpointFor(target: { type: 'node' | 'frame'; id: string }, side: Side): EdgeEndpoint {
  return target.type === 'node' ? { nodeId: target.id, side } : { screenId: target.id, side };
}

/**
 * The one SVG layer that draws every diagram shape and connector inside the
 * canvas transform layer (spec docs/superpowers/specs/2026-09-13-diagrams-
 * design.md section 3), rendered by components/workbench/canvas.tsx as a
 * sibling of the frames, after them in DOM order so it paints above them.
 * Sits at canvas-space (0,0) with no size of its own (`overflow: visible`),
 * so every coordinate below is a plain canvas-space number - the parent's
 * own CSS transform (pan/zoom) already does the rest, the same trick
 * frame-title.tsx and the frame wrappers in canvas.tsx already rely on.
 *
 * The root's pointer-events flips to `auto` only while a placement tool is
 * active (`tool.kind !== 'pointer'`): idle, it is `none` so every click
 * still reaches the frames beneath it untouched (spec: "pointer-events:
 * none on the SVG root, pointer-events: all on shapes, edges and handles"),
 * but placing a shape needs the WHOLE canvas clickable, not just existing
 * shapes/handles.
 */
export function DiagramLayer({ diagram, dispatch, frames, viewport, tool, onToolConsumed, onExport }: DiagramLayerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  // The single active inline editor (a node's text or a connector's label -
  // at most one at a time, `editing.id` says which). Given a ref rather than
  // relying on `autoFocus` alone when the editor was opened from a context
  // menu item: Radix returns focus to the menu's own trigger the moment it
  // finishes closing (its `onCloseAutoFocus`), which would otherwise steal
  // focus right back off the textarea/input `autoFocus` just gave it - same
  // race, and the same fix, as screens-strip.tsx's RenameInput/
  // onCloseAutoFocus for the chevron-menu Rename item.
  const editInputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  // "Edit text"/"Edit label" reached from the right-click menu queue their
  // request here rather than calling setEditing directly - see
  // queueEditFromMenu's own comment below for why.
  const pendingMenuEditRef = useRef<{ id: string; text: string } | null>(null);
  const [hover, setHover] = useState<HoverTarget>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number } | null>(null);
  const [resize, setResize] = useState<ResizeState>(null);
  const [resizeBox, setResizeBox] = useState<Box | null>(null);
  const [connect, setConnect] = useState<ConnectState>(null);
  const [place, setPlace] = useState<PlaceState>(null);
  const [editing, setEditing] = useState<EditState>(null);
  // Option/Alt-drag duplicate's cursor affordance (Build step 2: "the cursor
  // shows copy while Option is held over a shape"): tracked globally via
  // keydown/keyup rather than read off each pointer event, since the key can
  // go up or down while the pointer sits still over a shape. Window-level
  // only - this component has no reference to a responsive-preview frame's
  // own iframe window (canvas.tsx/canvas-frame.tsx own that), so Alt held
  // while the cursor is over an iframe's own document will not be seen here;
  // narrow, and called out in this task's report.
  const [altHeld, setAltHeld] = useState(false);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Alt') setAltHeld(true);
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.key === 'Alt') setAltHeld(false);
    }
    // Belt-and-suspenders: if the window loses focus while Alt is physically
    // held (switching apps, a devtools panel stealing focus), no keyup ever
    // arrives - without this the copy cursor/affordance would stay stuck on.
    function onBlur() {
      setAltHeld(false);
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // Shift+F10 and the Menu key open the right-click menu for any non-empty
  // selection (Build step 3; review finding 3 widened this from exactly
  // one - the Align submenu needs two selected shapes and Distribute
  // three, so a keyboard user could never reach either under the old
  // one-only guard), anchored on the LAST selected item, the standard
  // keyboard equivalent of a right click: real browsers already translate
  // them into a native `contextmenu` event targeting the focused element,
  // but jsdom does not, and this layer does not otherwise give any shape/
  // connector DOM focus to target - so this synthesizes exactly that event
  // directly on the selected element's own node, found the same way the
  // option-drag/menu code elsewhere here already identifies "the DOM
  // element for id X" (its own data-testid). isEditableTarget (read-only
  // import from keyboard.tsx, which is not otherwise touched here) stops
  // this from also running while focus is in an editable target - the
  // Design panel's own text fields, for one - which used to hijack the
  // browser's own Shift+F10 there. Harmless alongside a real browser's
  // native translation, if any ever reaches here too: opening an already-
  // open ContextMenu a second time at the same point is a no-op.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (editing || tool.kind !== 'pointer') return;
      const isMenuKey = event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey);
      if (!isMenuKey) return;
      if (diagram.selection.length === 0 || isEditableTarget(event.target)) return;
      const item = diagram.selection[diagram.selection.length - 1];
      const target = svgRef.current?.querySelector(`[data-testid="diagram-${item.type}-${item.id}"]`);
      if (!target) return;
      event.preventDefault();
      const rect = target.getBoundingClientRect();
      target.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left, clientY: rect.top }),
      );
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editing, tool.kind, diagram.selection]);

  // Escape cancels any in-flight gesture (review finding 5) - drag, resize,
  // connect, place, and an Option-drag's ghost among them, since it is just
  // a `drag` with `duplicate: true` and, like every other gesture here,
  // writes nothing to the store until its own end handler runs - and hides
  // the quick-add circles (Build step 4); clearing hover covers the
  // latter, since they only ever render for the currently-hovered node.
  // cancelDrag/cancelResize/cancelConnect/cancelPlace (below) reset state
  // and release pointer capture WITHOUT dispatching, unlike the endX
  // handlers a real pointerup/pointercancel calls.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      cancelDrag();
      cancelResize();
      cancelConnect();
      cancelPlace();
      setHover((current) => (current === null ? current : null));
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, resize, connect, place]);

  // Right-clicking (or Shift+F10-ing) a shape or connector that is NOT
  // already part of the current selection replaces the selection with just
  // it (spec follow-up: "Right-clicking an unselected element selects it
  // first"); one that IS already selected - including as part of a larger
  // multi-selection - is left exactly as it is, so "Duplicate"/"Bring to
  // front"/"Send to back"/"Delete"/Align/Distribute below can act on that
  // whole selection rather than collapsing it to the one element under the
  // cursor.
  function ensureSelected(type: 'node' | 'edge', id: string): void {
    if (!isSelected(diagram.selection, type, id)) {
      dispatch({ type: 'select', selection: [{ type, id }] });
    }
  }

  // A quick-add circle (Build step 4): mints the new node/edge ids here
  // (this module's own "caller mints ids" convention) and opens the new
  // shape's text editor directly - no context menu involved in this
  // gesture, so none of queueEditFromMenu's close-focus race applies here.
  function handleQuickAdd(source: DiagramNode, side: Side): void {
    const newNodeId = nanoid(10);
    const newEdgeId = nanoid(10);
    dispatch({ type: 'quickAdd', sourceId: source.id, side, newNodeId, newEdgeId });
    setEditing({ id: newNodeId, draft: '' });
    // Review nit 15: hides the circles immediately once one has fired, so
    // the second half of an accidental double-click (two separate `click`
    // events - the dblclick itself is stopped from bubbling further up
    // above) does not land on a circle that is still there and create a
    // second, stacked shape. The pointer has not moved, so nothing else
    // would otherwise clear hover.
    setHover(null);
  }

  // The context menu's "Duplicate" item - review finding 7: this exact
  // "mint a pair per id, plus an edgePair for a connector wholly inside the
  // set" computation used to be hand-copied here, in startOptionDrag's own
  // dispatch below, and in workbench.tsx's Cmd+D handler. All three now go
  // through the one pure, tested lib/diagram/store.ts helper.
  function duplicateSelection(ids: string[]): void {
    const { pairs, edgePairs } = duplicatePairs(diagram, ids, () => nanoid(10));
    dispatch({ type: 'duplicate', pairs, edgePairs });
  }

  // Every context-menu item that acts on "the selection" (Duplicate, Bring
  // to front, Send to back, Delete, Align, Distribute) reads these rather
  // than just the one right-clicked element - ensureSelected above
  // guarantees whichever element opened the menu is already a member of
  // one of these, so there is never a need to fall back to `[id]` alone.
  const selectedNodeIds = diagram.selection.filter((item) => item.type === 'node').map((item) => item.id);
  const selectedIds = diagram.selection.map((item) => item.id);

  function renderNodeMenuContent(node: DiagramNode): ReactNode {
    return (
      <>
        <ContextMenuSub>
          <ContextMenuSubTrigger className={MENU_ROW}>Change shape</ContextMenuSubTrigger>
          <ContextMenuSubContent className={MENU_POPOVER}>
            <ContextMenuRadioGroup
              value={node.kind}
              onValueChange={(value) => dispatch({ type: 'setKind', id: node.id, kind: value as DiagramNodeKind })}
            >
              {NODE_KINDS.map((kind) => (
                <ContextMenuRadioItem key={kind} value={kind} className={cn(MENU_ROW, 'pr-7')}>
                  {KIND_LABELS[kind]}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger className={MENU_ROW}>Color</ContextMenuSubTrigger>
          <ContextMenuSubContent className={MENU_POPOVER}>
            <ContextMenuRadioGroup
              value={node.color}
              onValueChange={(value) => dispatch({ type: 'setColor', id: node.id, color: value as DiagramColor })}
            >
              {DIAGRAM_COLORS.map((color) => (
                <ContextMenuRadioItem key={color} value={color} className={cn(MENU_ROW, 'pr-7')}>
                  {COLOR_LABELS[color]}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>

        {/* Spec section 9: "the right-click menu gets a 'Text' submenu with
            the same three groups as radio items" - one nested ContextMenuSub
            per group (Size/Font/Text color), the same shape as "Change
            shape"/"Color" above; only the single right-clicked shape is
            restyled, the same single-`node.id` scope those two already use
            (Align/Duplicate/etc. below are the only items here that act on
            the whole `selectedNodeIds`). */}
        <ContextMenuSub>
          <ContextMenuSubTrigger className={MENU_ROW}>Text</ContextMenuSubTrigger>
          <ContextMenuSubContent className={MENU_POPOVER}>
            <ContextMenuSub>
              <ContextMenuSubTrigger className={MENU_ROW}>Text size</ContextMenuSubTrigger>
              <ContextMenuSubContent className={MENU_POPOVER}>
                <ContextMenuRadioGroup
                  value={node.textSize ?? 'medium'}
                  onValueChange={(value) => dispatch({ type: 'setTextStyle', ids: [node.id], textSize: value as TextSize })}
                >
                  {TEXT_SIZES.map((size) => (
                    <ContextMenuRadioItem key={size} value={size} className={cn(MENU_ROW, 'pr-7')}>
                      {TEXT_SIZE_LABELS[size]}
                    </ContextMenuRadioItem>
                  ))}
                </ContextMenuRadioGroup>
              </ContextMenuSubContent>
            </ContextMenuSub>

            <ContextMenuSub>
              <ContextMenuSubTrigger className={MENU_ROW}>Font</ContextMenuSubTrigger>
              <ContextMenuSubContent className={MENU_POPOVER}>
                <ContextMenuRadioGroup
                  value={node.textFont ?? 'sans'}
                  onValueChange={(value) => dispatch({ type: 'setTextStyle', ids: [node.id], textFont: value as TextFont })}
                >
                  {TEXT_FONTS.map((font) => (
                    <ContextMenuRadioItem key={font} value={font} className={cn(MENU_ROW, 'pr-7')}>
                      {TEXT_FONT_LABELS[font]}
                    </ContextMenuRadioItem>
                  ))}
                </ContextMenuRadioGroup>
              </ContextMenuSubContent>
            </ContextMenuSub>

            <ContextMenuSub>
              <ContextMenuSubTrigger className={MENU_ROW}>Text color</ContextMenuSubTrigger>
              <ContextMenuSubContent className={MENU_POPOVER}>
                <ContextMenuRadioGroup
                  value={node.textColor ?? 'default'}
                  onValueChange={(value) => dispatch({ type: 'setTextStyle', ids: [node.id], textColor: value as TextColor })}
                >
                  {TEXT_COLORS.map((color) => (
                    <ContextMenuRadioItem key={color} value={color} className={cn(MENU_ROW, 'pr-7')}>
                      {TEXT_COLOR_LABELS[color]}
                    </ContextMenuRadioItem>
                  ))}
                </ContextMenuRadioGroup>
              </ContextMenuSubContent>
            </ContextMenuSub>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger className={MENU_ROW}>Align</ContextMenuSubTrigger>
          <ContextMenuSubContent className={MENU_POPOVER}>
            {ALIGN_MODES.map((mode) => (
              <ContextMenuItem
                key={mode}
                className={MENU_ROW}
                disabled={selectedNodeIds.length < 2}
                onSelect={() => dispatch({ type: 'align', ids: selectedNodeIds, mode })}
              >
                {ALIGN_LABELS[mode]}
              </ContextMenuItem>
            ))}
            <ContextMenuSeparator />
            <ContextMenuItem
              className={MENU_ROW}
              disabled={selectedNodeIds.length < 3}
              onSelect={() => dispatch({ type: 'distribute', ids: selectedNodeIds, axis: 'horizontal' })}
            >
              Distribute horizontally
            </ContextMenuItem>
            <ContextMenuItem
              className={MENU_ROW}
              disabled={selectedNodeIds.length < 3}
              onSelect={() => dispatch({ type: 'distribute', ids: selectedNodeIds, axis: 'vertical' })}
            >
              Distribute vertically
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuItem className={MENU_ROW} onSelect={() => queueEditFromMenu(node.id, node.text)}>
          Edit text
        </ContextMenuItem>
        <ContextMenuItem className={MENU_ROW} onSelect={() => duplicateSelection(selectedNodeIds)}>
          Duplicate
          <span aria-hidden className={cn(MENU_HINT, 'ml-auto')}>
            ⌘D
          </span>
        </ContextMenuItem>
        <ContextMenuItem className={MENU_ROW} onSelect={() => dispatch({ type: 'reorder', ids: selectedNodeIds, to: 'front' })}>
          Bring to front
        </ContextMenuItem>
        <ContextMenuItem className={MENU_ROW} onSelect={() => dispatch({ type: 'reorder', ids: selectedNodeIds, to: 'back' })}>
          Send to back
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem className={MENU_ROW} onSelect={() => onExport?.('png')}>
          Export as PNG
        </ContextMenuItem>
        <ContextMenuItem className={MENU_ROW} onSelect={() => onExport?.('svg')}>
          Export as SVG
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem
          variant="destructive"
          className={MENU_ROW}
          onSelect={() => dispatch({ type: 'delete', ids: selectedIds })}
        >
          Delete
          <span aria-hidden className={cn(MENU_HINT, 'ml-auto')}>
            Delete
          </span>
        </ContextMenuItem>
      </>
    );
  }

  function renderEdgeMenuContent(edgeItem: DiagramEdge): ReactNode {
    return (
      <>
        <ContextMenuSub>
          <ContextMenuSubTrigger className={MENU_ROW}>Connector</ContextMenuSubTrigger>
          <ContextMenuSubContent className={MENU_POPOVER}>
            <ContextMenuRadioGroup
              value={edgeItem.kind}
              onValueChange={(value) => dispatch({ type: 'setKind', id: edgeItem.id, kind: value as ConnectorKind })}
            >
              {CONNECTOR_KINDS.map((kind) => (
                <ContextMenuRadioItem key={kind} value={kind} className={cn(MENU_ROW, 'pr-7')}>
                  {CONNECTOR_LABELS[kind]}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger className={MENU_ROW}>Arrowheads</ContextMenuSubTrigger>
          <ContextMenuSubContent className={MENU_POPOVER}>
            <ContextMenuRadioGroup
              value={edgeItem.arrow}
              onValueChange={(value) => dispatch({ type: 'setArrow', id: edgeItem.id, arrow: value as ArrowKind })}
            >
              {ARROW_KINDS.map((arrow) => (
                <ContextMenuRadioItem key={arrow} value={arrow} className={cn(MENU_ROW, 'pr-7')}>
                  {ARROW_LABELS[arrow]}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuItem className={MENU_ROW} onSelect={() => queueEditFromMenu(edgeItem.id, edgeItem.label ?? '')}>
          Edit label
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem className={MENU_ROW} onSelect={() => onExport?.('png')}>
          Export as PNG
        </ContextMenuItem>
        <ContextMenuItem className={MENU_ROW} onSelect={() => onExport?.('svg')}>
          Export as SVG
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem
          variant="destructive"
          className={MENU_ROW}
          onSelect={() => dispatch({ type: 'delete', ids: selectedIds })}
        >
          Delete
          <span aria-hidden className={cn(MENU_HINT, 'ml-auto')}>
            Delete
          </span>
        </ContextMenuItem>
      </>
    );
  }

  // Both context menus share this: prevent Radix returning focus to the
  // menu's own trigger once it finishes closing when an "Edit text"/"Edit
  // label" selection is what closed it - see editInputRef's own comment.
  function onMenuCloseAutoFocus(event: Event): void {
    const pending = pendingMenuEditRef.current;
    if (pending) {
      pendingMenuEditRef.current = null;
      event.preventDefault();
      setEditing({ id: pending.id, draft: pending.text });
      return;
    }
    if (!editing) return;
    event.preventDefault();
    editInputRef.current?.focus();
    editInputRef.current?.select();
  }

  function clientToCanvas(clientX: number, clientY: number): Point {
    const rect = svgRef.current?.getBoundingClientRect();
    const left = rect?.left ?? 0;
    const top = rect?.top ?? 0;
    return { x: (clientX - left) / viewport.zoom, y: (clientY - top) / viewport.zoom };
  }

  function boxFor(target: { type: 'node' | 'frame'; id: string }): Box | null {
    if (target.type === 'node') return diagram.nodes.find((n) => n.id === target.id) ?? null;
    return frames.find((f) => f.id === target.id) ?? null;
  }

  // Hover is tracked from a window-level pointermove rather than per-shape
  // listeners: the handles it reveals must appear for a FRAME too, and a
  // frame's own DOM (Stage/FramePreview, in canvas.tsx) is not this
  // component's to attach listeners to - reading the pointer's own position
  // against the known node/frame boxes works identically for both, and
  // costs nothing extra since this component already re-renders on every
  // diagram/viewport change.
  useEffect(() => {
    function onMove(event: PointerEvent) {
      // Skip while a gesture owns the pointer - a drag/resize/connect
      // already fully determines what is relevant, and hovering a
      // different shape mid-drag must not fire this shape's own hover
      // handles.
      if (drag || resize || connect || place) return;
      const point = clientToCanvas(event.clientX, event.clientY);
      // findLast, not find (review finding 4): nodes paint in array order,
      // so the LAST one is on top - find would resolve an overlap to
      // whichever shape happens to be first in the array (the bottom-most
      // on screen), hiding hover/quick-add/handles for the shape the user
      // can actually see and click.
      const node = diagram.nodes.findLast((n) => boxContains(n, point));
      if (node) {
        setHover((current) => (current?.type === 'node' && current.id === node.id ? current : { type: 'node', id: node.id }));
        return;
      }
      // Quick-add circles (Build step 4) sit just outside their shape's own
      // box - without this, the pointer crossing the gap on its way to one
      // of its own circles (or landing on the circle itself) would read as
      // having left the shape and hide them before a click ever reaches
      // them (spec: hide "when the pointer leaves the shape AND ITS
      // CIRCLES", not before it even gets there). findLast, same as the box
      // check above: the nearest (top-most by array order) node whose halo
      // contains the point wins where two shapes' halos overlap.
      const haloNode = diagram.nodes.findLast((n) => boxContains(quickAddHaloBox(n, viewport.zoom), point));
      if (haloNode) {
        setHover((current) => (current?.type === 'node' && current.id === haloNode.id ? current : { type: 'node', id: haloNode.id }));
        return;
      }
      const frame = frames.find((f) => boxContains(f, point));
      if (frame) {
        setHover((current) => (current?.type === 'frame' && current.id === frame.id ? current : { type: 'frame', id: frame.id }));
        return;
      }
      setHover((current) => (current === null ? current : null));
    }
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
    // svgRef/clientToCanvas/boxFor are stable-shaped closures re-created
    // every render on purpose (they read live props) - re-subscribing each
    // render is cheap and keeps them always current, the same trade-off
    // canvas.tsx's own root wheel effect makes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagram.nodes, frames, viewport, drag, resize, connect, place]);

  // Escape/V (handled by keyboard.tsx, driving the `tool` prop this layer
  // only reads) can change the tool away from 'shape' while a rubber-band
  // placement drag is already in progress - without this, `place` would
  // keep tracking the pointer and still add a shape on the eventual
  // pointerup, ignoring that the tool already left placement mode. Adjusted
  // during render (React's own documented alternative to a setState-in-
  // effect for "reset state when a prop changes") rather than an effect,
  // the same pattern topbar.tsx's FileNameField and workbench.tsx's
  // lastSelectedNodeId already use for the identical "did a prop I do not
  // own just change" comparison.
  const [lastToolKind, setLastToolKind] = useState(tool.kind);
  if (tool.kind !== lastToolKind) {
    setLastToolKind(tool.kind);
    if (tool.kind !== 'shape' && place !== null) setPlace(null);
  }

  function commitPendingEdit(commit: boolean): void {
    if (!editing) return;
    if (commit) dispatch({ type: 'setText', id: editing.id, text: editing.draft });
    setEditing(null);
  }

  // --- Selection --------------------------------------------------------

  function selectShape(type: 'node' | 'edge', id: string, additive: boolean): void {
    if (additive) {
      const already = isSelected(diagram.selection, type, id);
      const next = already
        ? diagram.selection.filter((item) => !(item.type === type && item.id === id))
        : [...diagram.selection, { type, id }];
      dispatch({ type: 'select', selection: next });
    } else {
      dispatch({ type: 'select', selection: [{ type, id }] });
    }
  }

  // --- Node pointer handling (select, drag, or start a connector) -------

  // Review finding 2: a right button pointerdown must never also start a
  // drag/connect/resize/placement or change the selection - in a real
  // browser it is followed by its own separate `contextmenu` event, which
  // `ensureSelected` (on the ContextMenuTrigger) already handles correctly;
  // this guard just stops the plain left-click gesture logic below from
  // ALSO running for it. Same first line on every pointer-down handler in
  // this file.
  function handleNodePointerDown(node: DiagramNode, event: ReactPointerEvent<SVGElement>): void {
    if (event.button !== 0) return;
    if (editing && editing.id !== node.id) commitPendingEdit(true);
    event.stopPropagation();

    if (tool.kind === 'connector') {
      startConnect({ type: 'node', id: node.id }, sideFromPoint(node, clientToCanvas(event.clientX, event.clientY)), event);
      return;
    }
    if (tool.kind === 'shape') return;

    const additive = event.shiftKey;
    if (additive) {
      selectShape('node', node.id, true);
      return;
    }
    const alreadyMultiSelected = isSelected(diagram.selection, 'node', node.id) && diagram.selection.length > 1;
    const ids = alreadyMultiSelected
      ? diagram.selection.filter((item) => item.type === 'node').map((item) => item.id)
      : [node.id];

    // A plain click (no Alt) replaces the selection with just this shape,
    // unless it is already part of a larger one, exactly as before. Option-
    // drag (review nits 11/12: Figma drags/duplicates ANY shape under the
    // pointer, selected or not - not just an already-selected one) needs
    // this same selection settled BEFORE it decides which ids to drag, so
    // it always runs, alt or not.
    if (!alreadyMultiSelected) selectShape('node', node.id, false);

    if (event.altKey) {
      startOptionDrag(ids, event);
      return;
    }

    capturePointer(event.currentTarget, event.pointerId);
    setDrag({ pointerId: event.pointerId, ids, start: clientToCanvas(event.clientX, event.clientY), target: event.currentTarget });
  }

  // Review finding 1 (blocker): starts a drag flagged `duplicate: true` and
  // dispatches NOTHING - the originals are never touched (renderedNodeBox
  // below only offsets a plain, non-duplicate drag) and a ghost of each
  // dragged shape (renderGhosts) previews where the copies would land.
  // endDrag mints the copies and dispatches exactly one `duplicate`, with
  // the final snapped offset, only once the gesture actually ends with real
  // movement - so an Option-click, an Option-right-click, or Escape/
  // pointercancel mid-drag write nothing at all, and a real drag is one
  // history step instead of a duplicate-at-pointer-down plus a move-at-
  // pointer-up.
  function startOptionDrag(ids: string[], event: ReactPointerEvent<SVGElement>): void {
    capturePointer(event.currentTarget, event.pointerId);
    setDrag({
      pointerId: event.pointerId,
      ids,
      start: clientToCanvas(event.clientX, event.clientY),
      target: event.currentTarget,
      duplicate: true,
    });
  }

  function handleDragMove(event: ReactPointerEvent<SVGElement>): void {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = clientToCanvas(event.clientX, event.clientY);
    setDragOffset({ dx: point.x - drag.start.x, dy: point.y - drag.start.y });
  }

  // Review finding 10 (Matt's nudge rule): move no longer snaps its own
  // delta (lib/diagram/store.ts), so the drag snaps its pointer delta HERE,
  // once, right before dispatching - the single source of truth for both
  // the final dispatch and (via renderedNodeBox/renderGhosts, which apply
  // the exact same snapToGrid(dragOffset.dx/dy)) the live preview, so what
  // the user sees moving is always exactly what gets written.
  function endDrag(event: ReactPointerEvent<SVGElement>): void {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (dragOffset) {
      const dx = snapToGrid(dragOffset.dx);
      const dy = snapToGrid(dragOffset.dy);
      if (dx !== 0 || dy !== 0) {
        if (drag.duplicate) {
          const { pairs, edgePairs } = duplicatePairs(diagram, drag.ids, () => nanoid(10));
          if (pairs.length > 0) dispatch({ type: 'duplicate', pairs, edgePairs, offset: { x: dx, y: dy } });
        } else {
          dispatch({ type: 'move', ids: drag.ids, dx, dy });
        }
      }
    }
    setDrag(null);
    setDragOffset(null);
  }

  // Review finding 5: resets the gesture WITHOUT dispatching (unlike endX
  // above, which a real pointerup/pointercancel calls) and releases pointer
  // capture - called with no pointerId from the Escape handler (cancel
  // whatever is active, regardless of which pointer owns it) and with the
  // event's own pointerId from onPointerCancel (only cancel if it is really
  // THIS gesture's pointer that got cancelled).
  function cancelDrag(pointerId?: number): void {
    if (!drag || (pointerId !== undefined && drag.pointerId !== pointerId)) return;
    releasePointer(drag.target, drag.pointerId);
    setDrag(null);
    setDragOffset(null);
  }

  function renderedNodeBox(node: DiagramNode): Box {
    if (drag && !drag.duplicate && drag.ids.includes(node.id) && dragOffset) {
      return { ...node, x: node.x + snapToGrid(dragOffset.dx), y: node.y + snapToGrid(dragOffset.dy) };
    }
    if (resize && resize.id === node.id && resizeBox) return resizeBox;
    return node;
  }

  // --- Resize -------------------------------------------------------------

  const CORNERS: { key: 'nw' | 'ne' | 'sw' | 'se'; dx: 0 | 1; dy: 0 | 1 }[] = [
    { key: 'nw', dx: 0, dy: 0 },
    { key: 'ne', dx: 1, dy: 0 },
    { key: 'sw', dx: 0, dy: 1 },
    { key: 'se', dx: 1, dy: 1 },
  ];

  function handleResizePointerDown(node: DiagramNode, corner: 'nw' | 'ne' | 'sw' | 'se', event: ReactPointerEvent<SVGElement>): void {
    if (event.button !== 0) return;
    event.stopPropagation();
    capturePointer(event.currentTarget, event.pointerId);
    setResize({
      pointerId: event.pointerId,
      id: node.id,
      corner,
      start: clientToCanvas(event.clientX, event.clientY),
      box: node,
      target: event.currentTarget,
    });
  }

  function handleResizeMove(event: ReactPointerEvent<SVGElement>): void {
    if (!resize || resize.pointerId !== event.pointerId) return;
    const point = clientToCanvas(event.clientX, event.clientY);
    // Re-review finding 21: the delta is snapped here, once, same as a
    // drag snaps its own dx/dy before ever setting the live preview - the
    // reducer now stores exactly whatever box this preview (and endResize
    // below) hands it, so there is nowhere left for the preview and the
    // landing box to disagree. Quantizing the DELTA rather than the
    // resulting absolute width/height/x/y is what keeps an off-grid box
    // (e.g. one nudged 1px) off-grid by the same amount after a resize,
    // instead of snapping it back to an absolute grid line.
    const dx = snapToGrid(point.x - resize.start.x);
    const dy = snapToGrid(point.y - resize.start.y);
    const { box, corner } = resize;
    const growsRight = corner === 'ne' || corner === 'se';
    const growsDown = corner === 'sw' || corner === 'se';
    const width = Math.max(MIN_SIZE, growsRight ? box.width + dx : box.width - dx);
    const height = Math.max(MIN_SIZE, growsDown ? box.height + dy : box.height - dy);
    const x = growsRight ? box.x : box.x + box.width - width;
    const y = growsDown ? box.y : box.y + box.height - height;
    setResizeBox({ x, y, width, height });
  }

  function endResize(event: ReactPointerEvent<SVGElement>): void {
    if (!resize || resize.pointerId !== event.pointerId) return;
    if (resizeBox) {
      // A resize from the top or left edge (nw/ne/sw) also moves the box's
      // top-left corner - reported in this SAME dispatch (store.ts's
      // `resize` snaps x/y the same way `move` already snaps a dx/dy) so
      // undo/redo treats the whole drag as one history entry. Omitted
      // entirely, not just equal to the pre-drag value, when the corner
      // (se) never moves the box at all.
      const moved = resizeBox.x !== resize.box.x || resizeBox.y !== resize.box.y;
      dispatch({
        type: 'resize',
        id: resize.id,
        width: resizeBox.width,
        height: resizeBox.height,
        ...(moved ? { x: resizeBox.x, y: resizeBox.y } : {}),
      });
    }
    setResize(null);
    setResizeBox(null);
  }

  // Review finding 5: resets the resize WITHOUT dispatching - same
  // no-arg-cancels-regardless / pointerId-checks-it-is-this-gesture split
  // as cancelDrag above.
  function cancelResize(pointerId?: number): void {
    if (!resize || (pointerId !== undefined && resize.pointerId !== pointerId)) return;
    releasePointer(resize.target, resize.pointerId);
    setResize(null);
    setResizeBox(null);
  }

  // --- Connect ------------------------------------------------------------

  function startConnect(source: { type: 'node' | 'frame'; id: string }, side: Side, event: ReactPointerEvent<SVGElement>): void {
    if (event.button !== 0) return;
    const box = boxFor(source);
    if (!box) return;
    event.stopPropagation();
    capturePointer(event.currentTarget, event.pointerId);
    const anchor = getHandlePosition(box, side);
    setConnect({
      pointerId: event.pointerId,
      source: { ...source, side },
      anchor,
      current: clientToCanvas(event.clientX, event.clientY),
      target: event.currentTarget,
    });
  }

  function handleConnectMove(event: ReactPointerEvent<SVGElement>): void {
    if (!connect || connect.pointerId !== event.pointerId) return;
    setConnect({ ...connect, current: clientToCanvas(event.clientX, event.clientY) });
  }

  function endConnect(event: ReactPointerEvent<SVGElement>): void {
    if (!connect || connect.pointerId !== event.pointerId) return;
    const point = connect.current;
    // findLast (review finding 4): a connector dropped on an overlap must
    // attach to the top-most shape, same reasoning as the hover effect.
    const targetNode = diagram.nodes.findLast((n) => n.id !== connect.source.id && boxContains(n, point));
    const targetFrame = !targetNode ? frames.find((f) => boxContains(f, point)) : null;
    const target = targetNode ? { type: 'node' as const, id: targetNode.id } : targetFrame ? { type: 'frame' as const, id: targetFrame.id } : null;

    if (target) {
      const targetBox = boxFor(target)!;
      const targetSide = sideFromPoint(targetBox, point);
      dispatch({
        type: 'connect',
        edge: {
          id: nanoid(10),
          source: endpointFor(connect.source, connect.source.side),
          target: endpointFor(target, targetSide),
          kind: 'step',
          arrow: 'end',
        },
      });
    }
    setConnect(null);
    if (tool.kind === 'connector') onToolConsumed();
  }

  // Review finding 5: resets the connector drag WITHOUT dispatching, same
  // pattern as cancelDrag/cancelResize above.
  function cancelConnect(pointerId?: number): void {
    if (!connect || (pointerId !== undefined && connect.pointerId !== pointerId)) return;
    releasePointer(connect.target, connect.pointerId);
    setConnect(null);
  }

  // --- Placement (palette shape tool) --------------------------------------

  function handlePlacePointerDown(event: ReactPointerEvent<SVGElement>): void {
    if (event.button !== 0 || tool.kind !== 'shape') return;
    capturePointer(event.currentTarget, event.pointerId);
    const point = clientToCanvas(event.clientX, event.clientY);
    setPlace({ pointerId: event.pointerId, start: point, current: point, target: event.currentTarget });
  }

  function handlePlaceMove(event: ReactPointerEvent<SVGElement>): void {
    if (!place || place.pointerId !== event.pointerId) return;
    setPlace({ ...place, current: clientToCanvas(event.clientX, event.clientY) });
  }

  function endPlace(event: ReactPointerEvent<SVGElement>): void {
    if (!place || place.pointerId !== event.pointerId || tool.kind !== 'shape') return;
    const dxScreen = (place.current.x - place.start.x) * viewport.zoom;
    const dyScreen = (place.current.y - place.start.y) * viewport.zoom;
    const dragged = Math.hypot(dxScreen, dyScreen) >= PLACEMENT_CLICK_THRESHOLD;
    const kind = tool.shape;
    const defaultSize = DEFAULT_SIZE[kind];

    let box: Box;
    if (dragged) {
      const x = Math.min(place.start.x, place.current.x);
      const y = Math.min(place.start.y, place.current.y);
      const width = Math.max(MIN_SIZE, Math.abs(place.current.x - place.start.x));
      const height = Math.max(MIN_SIZE, Math.abs(place.current.y - place.start.y));
      box = { x: snapToGrid(x), y: snapToGrid(y), width: snapToGrid(width), height: snapToGrid(height) };
    } else {
      box = {
        x: snapToGrid(place.start.x - defaultSize.width / 2),
        y: snapToGrid(place.start.y - defaultSize.height / 2),
        width: defaultSize.width,
        height: defaultSize.height,
      };
    }

    dispatch({
      type: 'add',
      node: { id: nanoid(10), kind, x: box.x, y: box.y, width: box.width, height: box.height, text: '', color: 'neutral' },
    });
    setPlace(null);
    onToolConsumed();
  }

  // Review finding 5: resets an in-progress placement WITHOUT adding a
  // shape, same pattern as cancelDrag/cancelResize/cancelConnect above.
  function cancelPlace(pointerId?: number): void {
    if (!place || (pointerId !== undefined && place.pointerId !== pointerId)) return;
    releasePointer(place.target, place.pointerId);
    setPlace(null);
  }

  // --- Edge pointer handling ------------------------------------------------

  function handleEdgePointerDown(edge: DiagramEdge, event: ReactPointerEvent<SVGElement>): void {
    if (event.button !== 0 || tool.kind !== 'pointer') return;
    event.stopPropagation();
    selectShape('edge', edge.id, event.shiftKey);
  }

  // --- Inline text editing --------------------------------------------------

  function beginEditing(node: DiagramNode): void {
    if (tool.kind !== 'pointer') return;
    setEditing({ id: node.id, draft: node.text });
  }

  // "Edit text"/"Edit label" reached from the right-click menu (rather than
  // beginEditing's own double-click path - a connector has no double-click-
  // to-edit gesture of its own, only the menu) cannot call setEditing
  // synchronously from the menu item's onSelect: Radix's Content
  // is still mid-teardown at that point and its own focus handling steals
  // focus right back off a freshly-autoFocus-ed textarea/input a moment
  // later, firing that element's own onBlur and immediately committing an
  // unedited value before the user has typed anything (confirmed by
  // instrumenting this - onSelect fires, the input mounts and is focused,
  // then something inside Radix's OWN close sequence blurs it, and only
  // AFTER that does onCloseAutoFocus itself run). Queuing the request here
  // and only calling setEditing from onCloseAutoFocus below - the one point
  // guaranteed to run after Radix's own focus shuffling is completely done -
  // means the inline editor does not even exist yet while that shuffling
  // happens, so there is nothing for it to steal focus from.
  function queueEditFromMenu(id: string, text: string): void {
    pendingMenuEditRef.current = { id, text };
  }

  // --- Rendering helpers ------------------------------------------------

  // Routed through renderedNodeBox (not the raw node) so an edge attached to
  // a node mid-drag or mid-resize follows the shape on every pointer move,
  // not just once the gesture ends and the store is actually written -
  // renderNode already applies the exact same live-preview box to the shape
  // itself, so this just keeps the connector consistent with what is on
  // screen. Both `pathFor`'s direct resolution and its no-side fallback
  // (which also reads the OTHER endpoint's box, below) benefit automatically
  // since both go through this one function.
  function endpointBox(endpoint: EdgeEndpoint): Box | null {
    if (endpoint.nodeId) {
      const node = diagram.nodes.find((n) => n.id === endpoint.nodeId);
      return node ? renderedNodeBox(node) : null;
    }
    if (endpoint.screenId) return frames.find((f) => f.id === endpoint.screenId) ?? null;
    return null;
  }

  // `otherBox` is the OTHER endpoint's box (pathFor below resolves both
  // boxes up front so each call can hand the far one in) - used only by the
  // no-side fallback further down, so a side-less edge anchors toward
  // wherever the far end of the connector actually is.
  function resolveEndpoint(endpoint: EdgeEndpoint, otherBox: Box | null): { box: Box; side: Side } | null {
    const box = endpointBox(endpoint);
    if (!box) return null;
    const anchorForOther = (other: Box) => anchorOnBox(box, { x: other.x + other.width / 2, y: other.y + other.height / 2 });
    if (endpoint.side && isSide(endpoint.side)) {
      return { box, side: endpoint.side };
    }
    // No stored side: face whichever side of `box` points toward the OTHER
    // endpoint - `otherBox`, not `box` itself. Passing `box` here (the bug
    // this fixes) made `anchorForOther` always measure toward its own
    // center, which sideFromPoint's own dx=0/dy=0 tie-break resolves to
    // "bottom" every time, regardless of where the other end of the edge
    // actually was. Falls back to `box` only when there truly is no other
    // endpoint to resolve, which pathFor below never actually hits (every
    // edge has both a source and a target).
    return { box, side: sideFromPoint(box, anchorForOther(otherBox ?? box)) };
  }

  function pathFor(edge: DiagramEdge): { path: string; labelX: number; labelY: number; sourcePoint: Point; targetPoint: Point } | null {
    const sourceResolved = resolveEndpoint(edge.source, endpointBox(edge.target));
    const targetResolved = resolveEndpoint(edge.target, endpointBox(edge.source));
    if (!sourceResolved || !targetResolved) return null;
    const sourcePoint = getHandlePosition(sourceResolved.box, sourceResolved.side);
    const targetPoint = getHandlePosition(targetResolved.box, targetResolved.side);
    const result =
      edge.kind === 'straight'
        ? getStraightPath(sourcePoint, targetPoint)
        : edge.kind === 'curve'
          ? getBezierPath(sourcePoint, sourceResolved.side, targetPoint, targetResolved.side)
          : getSmoothStepPath(sourcePoint, sourceResolved.side, targetPoint, targetResolved.side);
    return { ...result, sourcePoint, targetPoint };
  }

  function renderHandles(target: { type: 'node' | 'frame'; id: string }, box: Box): ReactNode {
    const visible = (hover?.type === target.type && hover.id === target.id) || connect?.source.id === target.id;
    return SIDES.map((side) => {
      const point = getHandlePosition(box, side);
      return (
        <circle
          key={side}
          data-testid={`diagram-handle-${target.type}-${target.id}-${side}`}
          cx={point.x}
          cy={point.y}
          r={HANDLE_RADIUS / viewport.zoom}
          className="fill-(--acc) stroke-white"
          style={{ strokeWidth: 1 / viewport.zoom, opacity: visible ? 1 : 0, pointerEvents: visible ? 'all' : 'none', cursor: 'crosshair' }}
          onPointerDown={(event) => startConnect(target, side, event)}
          onPointerMove={handleConnectMove}
          onPointerUp={endConnect}
          onPointerCancel={(event) => cancelConnect(event.pointerId)}
        />
      );
    });
  }

  // Build step 4: four hover circles just outside `box`'s sides, each
  // creating a connected same-kind/colour/size neighbour on click. Only for
  // the currently-hovered node (never a frame, and never while any gesture
  // owns the pointer - `hover` itself already freezes during one, but a
  // drag/resize dispatched from a DIFFERENT shape than the one last hovered
  // could otherwise leave this one's circles visibly stuck on top of a live
  // drag), and only in the plain pointer tool.
  function renderQuickAddCircles(node: DiagramNode, box: Box): ReactNode {
    const visible = tool.kind === 'pointer' && !drag && !resize && !connect && !place && hover?.type === 'node' && hover.id === node.id;
    if (!visible) return null;
    const radius = QUICK_ADD_RADIUS / viewport.zoom;
    const iconSize = QUICK_ADD_ICON_SIZE / viewport.zoom;
    return SIDES.map((side) => {
      const center = quickAddPosition(box, side, viewport.zoom);
      return (
        <g
          key={side}
          transform={`translate(${center.x}, ${center.y})`}
          // Review nit 16: role="button" with no tabIndex/keyboard path was
          // an unfocusable button, promising keyboard access this never
          // had - dropped rather than adding a full keyboard path.
          aria-label={`Add a shape to the ${side}`}
          data-testid={`diagram-quick-add-${node.id}-${side}`}
          style={{ cursor: 'pointer', pointerEvents: 'all' }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            handleQuickAdd(node, side);
          }}
          // Review nit 15: without this, a double-click's dblclick bubbled
          // to the shape's own onDoubleClick and moved the editor onto the
          // SOURCE shape instead of the new one.
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <circle r={radius} className="fill-(--acc) stroke-white" style={{ strokeWidth: 1 / viewport.zoom }} />
          <Plus aria-hidden x={-iconSize / 2} y={-iconSize / 2} width={iconSize} height={iconSize} className="stroke-white" />
        </g>
      );
    });
  }

  // Review finding 1: extracted out of renderNode so renderGhosts (below)
  // can draw the exact same shape body - fill, stroke, decision diamond/
  // terminal pill/rounded-rect/plain-rect switch - at an offset box, with
  // no interactive wrapper, foreignObject text, selection outline, resize
  // handles, connect handles or quick-add circles (a ghost is a preview,
  // never a target for any of those).
  function renderShapeBody(node: DiagramNode, box: Box): ReactNode {
    const colors = COLOR_CLASSES[node.color];
    const strokeWidth = 1.5 / viewport.zoom;
    if (node.kind === 'decision') {
      const points = [
        `${box.x + box.width / 2},${box.y}`,
        `${box.x + box.width},${box.y + box.height / 2}`,
        `${box.x + box.width / 2},${box.y + box.height}`,
        `${box.x},${box.y + box.height / 2}`,
      ].join(' ');
      return <polygon points={points} className={`${colors.fill} ${colors.stroke}`} style={{ strokeWidth }} />;
    }
    if (node.kind === 'terminal') {
      return (
        <rect
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          rx={box.height / 2}
          className={`${colors.fill} ${colors.stroke}`}
          style={{ strokeWidth }}
        />
      );
    }
    if (node.kind === 'text') {
      return <rect x={box.x} y={box.y} width={box.width} height={box.height} fill="transparent" />;
    }
    return (
      <rect
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        rx={node.kind === 'rounded' ? 12 : node.kind === 'note' ? 2 : 0}
        className={`${colors.fill} ${colors.stroke}`}
        style={{ strokeWidth }}
      />
    );
  }

  // Review finding 1: the Option-drag preview - a translucent copy of each
  // dragged shape's body at the snapped offset, plus the edges wholly
  // inside the dragged set (so a connector between two ghosts previews
  // exactly what duplicatePairs/endDrag will actually create). Resolves
  // sides independently of pathFor/resolveEndpoint, which read the REAL,
  // un-offset diagram state - a ghost's box only ever exists here, never in
  // `diagram` itself, until endDrag actually dispatches.
  function renderGhosts(): ReactNode {
    if (!drag?.duplicate || !dragOffset) return null;
    const dx = snapToGrid(dragOffset.dx);
    const dy = snapToGrid(dragOffset.dy);
    if (dx === 0 && dy === 0) return null;
    const idSet = new Set(drag.ids);
    const ghostBox = (id: string): Box | null => {
      const source = diagram.nodes.find((n) => n.id === id);
      return source ? { ...source, x: source.x + dx, y: source.y + dy } : null;
    };
    const ghostEdges = diagram.edges.filter(
      (e) => !!e.source.nodeId && idSet.has(e.source.nodeId) && !!e.target.nodeId && idSet.has(e.target.nodeId),
    );
    return (
      <g data-testid="diagram-option-drag-ghosts" aria-hidden style={{ opacity: 0.6, pointerEvents: 'none' }}>
        {ghostEdges.map((e) => {
          const sourceBox = ghostBox(e.source.nodeId!);
          const targetBox = ghostBox(e.target.nodeId!);
          if (!sourceBox || !targetBox) return null;
          const targetCenter = { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height / 2 };
          const sourceCenter = { x: sourceBox.x + sourceBox.width / 2, y: sourceBox.y + sourceBox.height / 2 };
          const sourceSide = e.source.side && isSide(e.source.side) ? e.source.side : sideFromPoint(sourceBox, targetCenter);
          const targetSide = e.target.side && isSide(e.target.side) ? e.target.side : sideFromPoint(targetBox, sourceCenter);
          const sourcePoint = getHandlePosition(sourceBox, sourceSide);
          const targetPoint = getHandlePosition(targetBox, targetSide);
          const result =
            e.kind === 'straight'
              ? getStraightPath(sourcePoint, targetPoint)
              : e.kind === 'curve'
                ? getBezierPath(sourcePoint, sourceSide, targetPoint, targetSide)
                : getSmoothStepPath(sourcePoint, sourceSide, targetPoint, targetSide);
          return (
            <g key={e.id}>
              <path d={result.path} fill="none" className="stroke-white/60" style={{ strokeWidth: 1.5 / viewport.zoom }} />
              {/* Re-review finding 23: the ghost edge's own label chip, so
                  the preview matches the eventual copy exactly, not just
                  its path. */}
              {e.label && (
                <foreignObject x={result.labelX - 40} y={result.labelY - 12} width={80} height={24}>
                  <div className={`${CHIP} min-h-0 justify-center px-2 py-0.5 text-center font-mono text-[10.5px]`}>{e.label}</div>
                </foreignObject>
              )}
            </g>
          );
        })}
        {drag.ids.map((id) => {
          const source = diagram.nodes.find((n) => n.id === id);
          const box = ghostBox(id);
          if (!source || !box) return null;
          return (
            <g key={id}>
              {renderShapeBody(source, box)}
              {/* Re-review finding 23: the ghost's own text, so the
                  preview matches the eventual copy exactly, not just the
                  shape's fill/stroke. Spec section 9: the ghost also
                  honours the source's own text size/font/color. */}
              <foreignObject x={box.x} y={box.y} width={box.width} height={box.height}>
                <div className={cn('flex size-full items-center justify-center overflow-hidden p-1.5 text-center break-words whitespace-pre-wrap', textStyleClasses(source))}>
                  {source.text}
                </div>
              </foreignObject>
            </g>
          );
        })}
      </g>
    );
  }

  function renderNode(rawNode: DiagramNode): ReactNode {
    const box = renderedNodeBox(rawNode);
    const selected = isSelected(diagram.selection, 'node', rawNode.id);
    const shape = renderShapeBody(rawNode, box);
    const isEditing = editing?.id === rawNode.id;
    // Build step 2's cursor affordance ("the cursor shows copy while Option
    // is held over a shape") - review nits 11/12: Figma shows it (and lets
    // Option-drag act) on ANY hovered shape, not only an already-selected
    // one, matching startOptionDrag above (which no longer requires the
    // shape be pre-selected either). A literal Tailwind class (not an
    // inline style) so it can win over the inline `cursor` style below,
    // which is omitted whenever this applies.
    const showCopyCursor = altHeld && hover?.type === 'node' && hover.id === rawNode.id;

    return (
      <ContextMenu key={rawNode.id}>
        {/* Review nit 17: unlike the Shift+F10 path, this had no tool.kind
            guard, so the menu also opened mid-connector-tool/placement. */}
        <ContextMenuTrigger
          asChild
          disabled={tool.kind !== 'pointer'}
          // Re-review finding 24: Radix still calls a disabled trigger's own
          // onContextMenu straight through - disabling only stops ITS content
          // from opening, so this must gate itself the same way the Trigger
          // is gated, or a right-click in the connector/shape tools silently
          // changes the selection with no menu ever appearing.
          onContextMenu={() => {
            if (tool.kind === 'pointer') ensureSelected('node', rawNode.id);
          }}
        >
          <g
            data-testid={`diagram-node-${rawNode.id}`}
            data-diagram-kind={rawNode.kind}
            data-selected={selected || undefined}
            className={showCopyCursor ? 'cursor-copy' : undefined}
            style={{
              pointerEvents: tool.kind === 'pointer' || tool.kind === 'connector' ? 'all' : 'none',
              cursor: showCopyCursor ? undefined : tool.kind === 'connector' ? 'crosshair' : 'move',
            }}
            onPointerDown={(event) => handleNodePointerDown(rawNode, event)}
            onPointerMove={handleDragMove}
            onPointerUp={endDrag}
            onPointerCancel={(event) => cancelDrag(event.pointerId)}
            onDoubleClick={() => beginEditing(rawNode)}
          >
            {shape}
            <foreignObject x={box.x} y={box.y} width={box.width} height={box.height} style={{ pointerEvents: isEditing ? 'all' : 'none' }}>
              {isEditing ? (
                <textarea
                  // Entering inline edit mode is itself the user's request for
                  // focus here.
                  autoFocus
                  ref={(el) => {
                    editInputRef.current = el;
                  }}
                  data-testid={`diagram-text-input-${rawNode.id}`}
                  value={editing.draft}
                  maxLength={MAX_TEXT_LENGTH}
                  className={cn('size-full resize-none border-0 bg-transparent p-1 text-center outline-none', textStyleClasses(rawNode))}
                  onChange={(event) => setEditing({ id: rawNode.id, draft: event.target.value })}
                  onFocus={(event) => event.currentTarget.select()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      commitPendingEdit(true);
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      commitPendingEdit(false);
                    }
                  }}
                  onBlur={() => commitPendingEdit(true)}
                />
              ) : (
                <div className={cn('flex size-full items-center justify-center overflow-hidden p-1.5 text-center break-words whitespace-pre-wrap', textStyleClasses(rawNode))}>
                  {rawNode.text}
                </div>
              )}
            </foreignObject>
            {selected && (
              <>
                <rect
                  x={box.x - 3}
                  y={box.y - 3}
                  width={box.width + 6}
                  height={box.height + 6}
                  fill="none"
                  className="stroke-(--acc)"
                  style={{ strokeWidth: 1.5 / viewport.zoom, strokeDasharray: `${4 / viewport.zoom} ${3 / viewport.zoom}` }}
                />
                {CORNERS.map(({ key, dx, dy }) => {
                  const x = box.x + dx * box.width;
                  const y = box.y + dy * box.height;
                  const size = RESIZE_HANDLE_SIZE / viewport.zoom;
                  return (
                    <rect
                      key={key}
                      data-testid={`diagram-resize-${rawNode.id}-${key}`}
                      x={x - size / 2}
                      y={y - size / 2}
                      width={size}
                      height={size}
                      className="fill-(--acc) stroke-white"
                      style={{ strokeWidth: 1 / viewport.zoom, cursor: `${key}-resize`, pointerEvents: 'all' }}
                      onPointerDown={(event) => handleResizePointerDown(rawNode, key, event)}
                      onPointerMove={handleResizeMove}
                      onPointerUp={endResize}
                      onPointerCancel={(event) => cancelResize(event.pointerId)}
                    />
                  );
                })}
              </>
            )}
            {renderHandles({ type: 'node', id: rawNode.id }, box)}
            {renderQuickAddCircles(rawNode, box)}
          </g>
        </ContextMenuTrigger>
        <ContextMenuContent className={MENU_POPOVER} onCloseAutoFocus={onMenuCloseAutoFocus}>
          {renderNodeMenuContent(rawNode)}
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  function renderEdge(edge: DiagramEdge): ReactNode {
    const resolved = pathFor(edge);
    if (!resolved) return null;
    const selected = isSelected(diagram.selection, 'edge', edge.id);
    const isEditingLabel = editing?.id === edge.id;

    return (
      <ContextMenu key={edge.id}>
        <ContextMenuTrigger
          asChild
          disabled={tool.kind !== 'pointer'}
          // Re-review finding 24: same guard as the node trigger above.
          onContextMenu={() => {
            if (tool.kind === 'pointer') ensureSelected('edge', edge.id);
          }}
        >
          <g data-testid={`diagram-edge-${edge.id}`}>
            {/* A fat, invisible stroke carries the click/hover target so a thin
                connector line is still easy to select - the visible path below
                has pointer-events disabled so it never competes with this one. */}
            <path
              data-testid={`diagram-edge-hit-${edge.id}`}
              d={resolved.path}
              fill="none"
              stroke="transparent"
              strokeWidth={16 / viewport.zoom}
              style={{ pointerEvents: tool.kind === 'pointer' ? 'stroke' : 'none', cursor: 'pointer' }}
              onPointerDown={(event) => handleEdgePointerDown(edge, event)}
            />
            <path
              d={resolved.path}
              fill="none"
              className={selected ? 'stroke-(--acc)' : 'stroke-white/60'}
              style={{ strokeWidth: (selected ? 2 : 1.5) / viewport.zoom, pointerEvents: 'none' }}
              markerEnd={edge.arrow === 'end' || edge.arrow === 'both' ? 'url(#diagram-arrowhead)' : undefined}
              markerStart={edge.arrow === 'both' ? 'url(#diagram-arrowhead)' : undefined}
            />
            {isEditingLabel ? (
              <foreignObject x={resolved.labelX - 40} y={resolved.labelY - 12} width={80} height={24}>
                <input
                  // Same "entering edit mode is itself the focus request" as
                  // a node's own inline textarea above.
                  autoFocus
                  ref={(el) => {
                    editInputRef.current = el;
                  }}
                  data-testid={`diagram-text-input-${edge.id}`}
                  value={editing.draft}
                  maxLength={MAX_TEXT_LENGTH}
                  className={`${CHIP} min-h-0 w-full justify-center border-0 bg-transparent px-2 py-0.5 text-center font-mono text-[10.5px] text-white outline-none`}
                  onChange={(event) => setEditing({ id: edge.id, draft: event.target.value })}
                  onFocus={(event) => event.currentTarget.select()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitPendingEdit(true);
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      commitPendingEdit(false);
                    }
                  }}
                  onBlur={() => commitPendingEdit(true)}
                />
              </foreignObject>
            ) : (
              edge.label && (
                <foreignObject x={resolved.labelX - 40} y={resolved.labelY - 12} width={80} height={24} style={{ pointerEvents: 'none' }}>
                  <div className={`${CHIP} min-h-0 justify-center px-2 py-0.5 text-center font-mono text-[10.5px]`}>{edge.label}</div>
                </foreignObject>
              )
            )}
          </g>
        </ContextMenuTrigger>
        <ContextMenuContent className={MENU_POPOVER} onCloseAutoFocus={onMenuCloseAutoFocus}>
          {renderEdgeMenuContent(edge)}
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  const placementActive = tool.kind === 'shape';

  return (
    <svg
      ref={svgRef}
      data-testid="diagram-layer"
      aria-label="Diagram"
      width={0}
      height={0}
      style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: placementActive ? 'auto' : 'none' }}
    >
      <defs>
        <marker
          id="diagram-arrowhead"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" className="fill-(--acc)" />
        </marker>
      </defs>

      {placementActive && (
        <rect
          data-testid="diagram-placement-surface"
          x={-100000}
          y={-100000}
          width={200000}
          height={200000}
          fill="transparent"
          style={{ pointerEvents: 'all', cursor: 'crosshair' }}
          onPointerDown={handlePlacePointerDown}
          onPointerMove={handlePlaceMove}
          onPointerUp={endPlace}
          onPointerCancel={(event) => cancelPlace(event.pointerId)}
        />
      )}

      {diagram.edges.map(renderEdge)}
      {diagram.nodes.map(renderNode)}
      {frames.map((frame) => (
        <g key={frame.id}>{renderHandles({ type: 'frame', id: frame.id }, frame)}</g>
      ))}
      {renderGhosts()}

      {connect && (
        <path
          d={getStraightPath(connect.anchor, connect.current).path}
          fill="none"
          className="stroke-(--acc)"
          style={{ strokeWidth: 1.5 / viewport.zoom, strokeDasharray: `${4 / viewport.zoom} ${3 / viewport.zoom}`, pointerEvents: 'none' }}
        />
      )}
      {place && (place.start.x !== place.current.x || place.start.y !== place.current.y) && tool.kind === 'shape' && (
        <rect
          x={Math.min(place.start.x, place.current.x)}
          y={Math.min(place.start.y, place.current.y)}
          width={Math.abs(place.current.x - place.start.x)}
          height={Math.abs(place.current.y - place.start.y)}
          fill="none"
          className="stroke-(--acc)"
          style={{ strokeWidth: 1 / viewport.zoom, strokeDasharray: `${4 / viewport.zoom} ${3 / viewport.zoom}`, pointerEvents: 'none' }}
        />
      )}
    </svg>
  );
}
