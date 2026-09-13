"use client";

import { Editor, Frame, useEditor, type EditorState } from "@craftjs/core";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { resolver } from "@/components/blocks/registry";
import type { Screen } from "@/lib/files/repository";
import type { Viewport } from "@/lib/canvas/viewport";
import { toArtboardPoint, type Rect } from "@/lib/comments/geometry";
import { capturePointer, releasePointer } from "@/lib/dom";
import { stackUnder, type LayerStackNode } from "@/lib/layer-stack";
import { ARTBOARD_MIN_HEIGHT } from "@/lib/stage";
import {
  MAX_STAGE_HEIGHT,
  MAX_STAGE_WIDTH,
  MIN_STAGE_HEIGHT,
  MIN_STAGE_WIDTH,
} from "@/lib/stage/size";
import { cn } from "@/lib/utils";
import { CanvasFrame, useCanvasDocument } from "./canvas-frame";
import {
  CommentLayer,
  DEFAULT_STAGE_COMMENTS,
  type StageCommentsProps,
} from "./comments/comment-layer";
import { LayoutGridOverlay, resolveLayoutGrid } from "./layout-grid";
import type { CanvasDocument } from "./stage-context";
import { StageProvider, useStage } from './stage-context';

const ARTBOARD_SELECTOR = "[data-artboard]";

// The innermost node under `target` (deepest first, zone nodes excluded),
// read from Craft's own node DOM map - the same technique
// layer-stack-menu.tsx's flattenNodes/stackUnder pair uses to find the
// layer stack under a press point. Kept as the new pin's anchorNodeId so a
// real backend can use it later (spec section 2's "Pin anchoring" row).
function innermostNodeId(
  nodes: EditorState["nodes"],
  target: Node | null,
): string | undefined {
  if (!target) return undefined;
  const flat: Record<string, LayerStackNode> = {};
  for (const [id, node] of Object.entries(nodes)) {
    flat[id] = {
      id,
      dom: node.dom,
      parent: node.data.parent,
      name: node.data.name,
      displayName: node.data.displayName || node.data.name,
    };
  }
  return stackUnder(flat, target)[0]?.id;
}

// Every arrow-key press on any handle moves that axis by this many unscaled
// content pixels (spec docs/superpowers/specs/2026-09-12-responsive-canvas-
// design.md #3).
const ARROW_STEP = 8;

type HandleAxis = "width" | "height" | "corner";

const HANDLE_META: Record<
  HandleAxis,
  {
    label: string;
    orientation: "horizontal" | "vertical";
    className: string;
    barClassName: string;
  }
> = {
  width: {
    label: "Resize width",
    orientation: "vertical",
    className:
      "top-0 -right-2 h-full w-4 cursor-col-resize items-center justify-center",
    barClassName: "h-10 w-1 rounded-full",
  },
  height: {
    label: "Resize height",
    orientation: "horizontal",
    className:
      "left-0 -bottom-2 w-full h-4 cursor-row-resize items-center justify-center",
    barClassName: "h-1 w-10 rounded-full",
  },
  corner: {
    label: "Resize frame",
    orientation: "vertical",
    className:
      "-right-1.5 -bottom-1.5 size-3 cursor-nwse-resize items-center justify-center",
    barClassName: "size-2 rounded-full",
  },
};

/**
 * One Figma-style resize handle - the right edge (width only), the bottom
 * edge (height only) or the bottom-right corner (both). All three share the
 * same pointer-capture drag, keyboard-arrow stepping and live readout;
 * `axis` decides which value(s) they read, report and step.
 *
 * The width axis reports through `onWidthChange` (wired to the context's
 * `setWidth`, matching the pre-existing single-grip behaviour and its
 * `onWidthChange` callback all the way to workbench.tsx). The height and
 * corner axes report through `onResize`, always with a COMPLETE
 * `{ width, height }` pair - not two separate single-value callbacks -
 * because a corner drag changes both from the same pointer delta in the
 * same event; calling two independent setters back to back would have the
 * second one overwrite the first with the axis it doesn't own, since each
 * closes over the render's pre-drag value for whichever field it is not
 * updating itself.
 */
function ResizeHandle({
  axis,
  width,
  height,
  zoom,
  onWidthChange,
  onResize,
  onDoubleClick,
}: {
  axis: HandleAxis;
  width: number;
  // The current effective height in unscaled px - always a concrete number,
  // even when the frame's own height is "auto" (Stage passes the measured
  // content height from CanvasFrame's onContentHeightChange in that case),
  // so a height/corner drag or arrow-key press always has a real value to
  // start from.
  height: number;
  zoom: number;
  onWidthChange?: (width: number) => void;
  onResize?: (next: { width: number; height: number }) => void;
  onDoubleClick?: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const start = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const meta = HANDLE_META[axis];
  const affectsWidth = axis === "width" || axis === "corner";
  const affectsHeight = axis === "height" || axis === "corner";

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    start.current = null;
    setDragging(false);
    releasePointer(event.currentTarget, event.pointerId);
  };

  function applyDelta(dx: number, dy: number) {
    if (!start.current) return;
    const nextWidth = affectsWidth
      ? start.current.width + dx / zoom
      : start.current.width;
    const nextHeight = affectsHeight
      ? start.current.height + dy / zoom
      : start.current.height;
    if (axis === "width") onWidthChange?.(nextWidth);
    else onResize?.({ width: nextWidth, height: nextHeight });
  }

  const valueNow = axis === "height" ? height : width;
  const valueMin = axis === "height" ? MIN_STAGE_HEIGHT : MIN_STAGE_WIDTH;
  const valueMax = axis === "height" ? MAX_STAGE_HEIGHT : MAX_STAGE_WIDTH;

  return (
    <div
      role="separator"
      aria-orientation={meta.orientation}
      aria-label={meta.label}
      aria-valuenow={Math.round(valueNow)}
      aria-valuemin={valueMin}
      aria-valuemax={valueMax}
      aria-valuetext={`${Math.round(width)} × ${Math.round(height)}`}
      tabIndex={0}
      data-testid={`resize-handle-${axis}`}
      className={cn("absolute flex touch-none select-none", meta.className)}
      onPointerDown={(event) => {
        event.preventDefault();
        capturePointer(event.currentTarget, event.pointerId);
        start.current = { x: event.clientX, y: event.clientY, width, height };
        setDragging(true);
      }}
      onPointerMove={(event) => {
        if (!start.current) return;
        applyDelta(
          event.clientX - start.current.x,
          event.clientY - start.current.y,
        );
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onDoubleClick}
      onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (
          event.key !== "ArrowRight" &&
          event.key !== "ArrowLeft" &&
          event.key !== "ArrowDown" &&
          event.key !== "ArrowUp"
        ) {
          return;
        }
        event.preventDefault();
        // Stops the same keydown from also reaching keyboard.tsx's
        // window-level listener: with a diagram element selected, that
        // listener's diagram-nudge-* shortcut would otherwise ALSO fire on
        // this exact arrow press - this handle already fully owns it once
        // focused. keyboard.tsx's own isSeparatorTarget check is a second,
        // independent guard against the same conflict, not a replacement
        // for this one.
        event.stopPropagation();
        const widthStep =
          event.key === "ArrowRight"
            ? ARROW_STEP
            : event.key === "ArrowLeft"
              ? -ARROW_STEP
              : 0;
        const heightStep =
          event.key === "ArrowDown"
            ? ARROW_STEP
            : event.key === "ArrowUp"
              ? -ARROW_STEP
              : 0;
        if (axis === "width" && widthStep !== 0)
          onWidthChange?.(width + widthStep);
        else if (axis === "height" && heightStep !== 0)
          onResize?.({ width, height: height + heightStep });
        else if (axis === "corner" && (widthStep !== 0 || heightStep !== 0)) {
          onResize?.({ width: width + widthStep, height: height + heightStep });
        }
      }}
    >
      <div
        className={cn(meta.barClassName, dragging ? "bg-acc" : "bg-border")}
      />
      {dragging && (
        <span
          data-testid="resize-readout"
          className="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 rounded-sm bg-primary px-1.5 py-0.5 font-mono text-[10px] font-semibold whitespace-nowrap text-white"
        >
          {Math.round(width)} × {Math.round(height)}
        </span>
      )}
    </div>
  );
}

/**
 * The focused frame: the one live Craft editing session, hosting the actual
 * three resize handles, the comment cover and the drop-cache bridge (through
 * CanvasFrame). Sized in plain, UNSCALED canvas px (`width`/`effectiveHeight`,
 * no `* zoom`) - components/workbench/canvas.tsx positions and scales every
 * frame, focused or not, from one ancestor transform, so nothing at this
 * level pre-scales its own box the way the old fit-to-column stage did.
 * `viewport` is read only to force the artboardRect re-measure effect below
 * to re-run on pan/zoom (an ancestor CSS transform change fires neither a
 * ResizeObserver nor a window resize/scroll event on its own); the actual
 * zoom VALUE used for handle math and comment placement still comes from
 * useStage().zoom, which canvas.tsx keeps in sync with the viewport.
 *
 * Wrapped in memo() below (as StageImpl here) - the focused frame host,
 * alongside FramePreview - so that an unrelated re-render of an ancestor
 * with otherwise-unchanged props does not cascade into this frame's own
 * CanvasFrame. `viewport` itself still changes on every pan/zoom tick (it
 * has to - see the comment above on why this component needs it), so memo
 * alone does not stop THIS component's own body from re-running then; what
 * it stops is CanvasFrame underneath it doing the same, since that
 * component is separately memoized (canvas-frame.tsx) and every OTHER prop
 * passed to it here - including its `children`, via the useMemo below - is
 * unaffected by viewport changing at all.
 */
function StageImpl({
  screen,
  viewport,
  comments = DEFAULT_STAGE_COMMENTS,
  onMeasuredHeight,
}: {
  screen: Screen;
  viewport: Viewport;
  // Everything the comments placeholder needs (spec
  // docs/superpowers/specs/2026-09-12-folders-and-comments-design.md section 5);
  // optional so callers written before comments existed keep rendering an
  // inert, empty comment layer unchanged.
  comments?: StageCommentsProps;
  // Review fix wave item 8: relays this frame's real, current height (the
  // exact same value contentHeight below tracks for the artboard's own
  // sizing) up to canvas.tsx's measuredHeights map, so an auto-height
  // frame's actual content height - not just ARTBOARD_MIN_HEIGHT - reaches
  // snapping, the frame alignment row, distribute and the marquee's hit
  // test. Optional so callers written before this existed keep working.
  onMeasuredHeight?: (id: string, height: number) => void;
}) {
  const { width, height, zoom, setWidth, setSize } = useStage();
  const { query } = useEditor();
  const canvas = useCanvasDocument();
  const artboardRef = useRef<HTMLDivElement>(null);
  const [artboardRect, setArtboardRect] = useState<Rect | null>(null);
  // The frame's real, current unscaled height, whether that comes from a
  // manual/device height or - when height is "auto" - from CanvasFrame's own
  // content measurement. Always a concrete number so the height/corner
  // handles and the wrapper's own reserved layout space never need to guess.
  const [contentHeight, setContentHeight] = useState(ARTBOARD_MIN_HEIGHT);
  const effectiveHeight = height ?? contentHeight;

  // Review fix wave item 8: relays this frame's real, current height up to
  // canvas.tsx's measuredHeights map - a SEPARATE effect from the
  // CanvasFrame below (rather than folded into its own onContentHeightChange
  // callback) specifically so that callback's identity stays exactly
  // `setContentHeight` (a stable setState reference) and CanvasFrame's own
  // memoization is untouched; onMeasuredHeight is deliberately not a
  // dependency for the same reason CanvasFrame's own effect excludes it
  // (canvas-frame.tsx) - canvas.tsx's caller already keeps it stable via
  // useStableCallback, but this must not re-fire for the same height even
  // if some future caller does not.
  useEffect(() => {
    onMeasuredHeight?.(screen.id, effectiveHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen.id, effectiveHeight]);

  // Feeds CommentLayer's pin/popover positioning (toScreenPoint). A plain
  // ResizeObserver plus window resize/scroll only catch a same-document size
  // or scroll change; viewport.x/y/zoom are added purely to force a
  // re-measure on every pan or zoom too (see this function's own doc comment
  // above) since neither of those fires any of the events above.
  useLayoutEffect(() => {
    const artboardEl = artboardRef.current;
    if (!artboardEl) return;
    const update = () => {
      const rect = artboardRef.current?.getBoundingClientRect();
      if (rect) setArtboardRect(rect);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(artboardEl);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
    };
  }, [width, effectiveHeight, viewport.x, viewport.y, viewport.zoom]);

  // Comment mode (spec section 5): a press on the artboard places a pin
  // instead of selecting a layer. The cover element rendered over the iframe
  // while the tool is active keeps the press in the parent document; these
  // capture handlers on the wrapper stop it there for both event types
  // (they fire as two independent events for one physical click).
  function interceptForCommentMode(
    event: ReactMouseEvent<HTMLDivElement>,
  ): boolean {
    if (!comments.commentMode) return false;
    const target = event.target as HTMLElement;
    if (!target.closest(ARTBOARD_SELECTOR)) return false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  function handleArtboardMouseDownCapture(
    event: ReactMouseEvent<HTMLDivElement>,
  ): void {
    if (!interceptForCommentMode(event)) return;
    const artboardEl = artboardRef.current;
    if (!artboardEl) return;
    // Measured fresh here rather than read from `artboardRect` state: a click
    // should always use the box's exact position right now.
    const rect = artboardEl.getBoundingClientRect();
    const point = toArtboardPoint(event.clientX, event.clientY, rect, zoom);
    // The layer under the point lives in the frame's document, so ask that
    // document rather than the event target (which is the cover).
    const frameDocument = canvas?.document;
    const inFrame =
      frameDocument && typeof frameDocument.elementFromPoint === 'function'
        ? frameDocument.elementFromPoint(point.x, point.y)
        : (event.target as Node);
    const anchorNodeId = innermostNodeId(query.getState().nodes, inFrame);
    comments.onPlacePin(point.x, point.y, anchorNodeId);
  }

  // Memoized as ONE combined value (not two separate ones each interpolated
  // as its own `{...}` in the JSX below) so CanvasFrame's own `children`
  // prop stays referentially stable across a viewport-only re-render of
  // this component (StageImpl's own body re-runs on every pan/zoom tick -
  // see the comment on it above). Two sibling `{a}{b}` expressions inside
  // <CanvasFrame> would make React build a brand new `[a, b]` array for
  // `children` on every such render even when `a`/`b` are themselves each
  // individually memoized - a plain JS array literal is never `===` to the
  // previous render's own, which defeats CanvasFrame's memoization
  // (canvas-frame.tsx) just as surely as an unstable child element would;
  // wrapping both in one Fragment and memoizing THAT is what actually
  // fixes it - canvas-preview-memoization.test.tsx catches this specifically.
  const frameChildren = useMemo(
    () => (
      <>
        <Frame key={screen.id} data={screen.layout} />
        <LayoutGridOverlay grid={resolveLayoutGrid(screen.layoutGrid)} />
      </>
    ),
    [screen.id, screen.layout, screen.layoutGrid],
  );

  return (
    <div
      data-artboard
      data-testid="artboard-zoom"
      className={cn(
        "relative shrink-0",
        comments.commentMode && "cursor-crosshair",
      )}
      onMouseDownCapture={handleArtboardMouseDownCapture}
      onClickCapture={interceptForCommentMode}
    >
      <div
        ref={artboardRef}
        data-testid="artboard"
        className="theme-basic relative overflow-hidden border border-line-strong bg-background shadow-panel-lg"
        style={{ width, height: effectiveHeight }}
      >
        <CanvasFrame
          width={width}
          height={height}
          // Always 1, never the viewport zoom: canvas.tsx's single ancestor
          // transform already scales this whole frame (position and size
          // together, along with every other frame) - scaling the iframe a
          // second time here would double-apply it. Resize-handle math and
          // comment placement below still use the real zoom, from
          // useStage() (kept in sync with the viewport by canvas.tsx).
          zoom={1}
          onContentHeightChange={setContentHeight}
        >
          {frameChildren}
        </CanvasFrame>
        {/*
          Comment mode: the frame lives in its own document, so a click on
          it would never reach the parent's handlers and Craft would select
          whatever is under the pointer. This transparent cover sits above
          the iframe while the tool is active, so the press lands in the
          parent document and the capture handlers on the wrapper turn it
          into a pin.
        */}
        {comments.commentMode && (
          <div
            data-testid="comment-cover"
            className="absolute inset-0 cursor-crosshair"
            aria-hidden
          />
        )}
        <ResizeHandle
          axis="width"
          width={width}
          height={effectiveHeight}
          zoom={zoom}
          onWidthChange={setWidth}
        />
        <ResizeHandle
          axis="height"
          width={width}
          height={effectiveHeight}
          zoom={zoom}
          onResize={setSize}
          onDoubleClick={() => setSize({ width, height: null })}
        />
        <ResizeHandle
          axis="corner"
          width={width}
          height={effectiveHeight}
          zoom={zoom}
          onResize={setSize}
        />
      </div>
      {/* Draws pins and popovers at fixed screen coordinates from artboardRect and zoom. */}
      <CommentLayer {...comments} zoom={zoom} artboardRect={artboardRect} />
    </div>
  );
}

export const Stage = memo(StageImpl);

/**
 * A non-focused frame: a read-only preview of a screen that is not currently
 * being edited (spec: "reuse the Play renderer approach"), rendered through a
 * second, disabled Craft `Editor` - no selection outlines, no handles, no
 * comments. Pressing anywhere inside it focuses that screen (the click is
 * swallowed; selecting normally on the canvas only ever happens on a LATER
 * click, once this frame is the focused one and the real, enabled `Stage`
 * above is what is actually mounted there) - UNLESS Space is already held
 * (or the press is a middle-mouse click), in which case it pans the canvas
 * instead, without changing focus or selection at all (spec section 3).
 *
 * Deliberately does not go through the shared StageContext.canvasDocument
 * slot (CanvasFrame's `reportDocument={false}`) - that slot is scoped to the
 * one focused frame. `onCanvasDocument` gives this component its OWN, local
 * reference to its iframe's document/window instead, just for the
 * click-to-focus/pan/wheel listeners below (a plain onPointerDown on the wrapper
 * catches a press that lands on the border/background around the iframe,
 * but not one that lands on the iframe's own rendered content - a separate
 * document, per lib/craft-positioner.ts's explanation of why every
 * cross-frame listener in this codebase is doubled up the same way).
 *
 * Wrapped in memo() below (as FramePreviewImpl here): there can be many of
 * these on screen at once, one per non-focused screen, and canvas.tsx
 * re-renders on every pan/zoom tick (it has to, to update the viewport
 * transform) - without memoization, every one of them would re-run its own
 * body, and so recreate its `<Editor>`/`<Frame>` children, on every such
 * tick even though nothing about any of them actually changed. This only
 * pays off because every prop canvas.tsx passes here is itself stable
 * across a pure viewport change: `onFocusScreen` is passed straight through
 * unchanged (see the comment where this is rendered), and `shouldStartPan`/
 * `onPanPointerDown`/`onPanPointerMove`/`onPanPointerUp`/`onMeasuredHeight`
 * are each wrapped in `useStableCallback` there - a fresh closure for any
 * one of them would defeat this the same way an unstable object prop would.
 */
function FramePreviewImpl({
  screen,
  onFocusScreen,
  shouldStartPan,
  onPanPointerDown,
  onPanPointerMove,
  onPanPointerUp,
  onFrameWheel,
  onMeasuredHeight,
}: {
  screen: Screen;
  // Takes the screen id (rather than a plain, no-argument `onFocus`) so
  // canvas.tsx can pass its own onFocusScreen prop straight through
  // unchanged - already stable across a pure viewport re-render, since it
  // comes from a parent that does not itself re-render on one (see the
  // comment there) - instead of needing a per-screen-id cache of pre-bound
  // closures, which can only be populated by writing to a ref during
  // render, unsafe under React's own rules (react-hooks/refs).
  onFocusScreen: (id: string) => void;
  // Space+drag (plus middle mouse) must pan the canvas from a non-focused
  // preview too, not just the focused frame - without changing focus or
  // selection (spec docs/superpowers/specs/2026-09-12-infinite-canvas-
  // design.md section 3). All five (including onFrameWheel below) come from
  // canvas.tsx, stable across renders (see the comment there), so wiring
  // them here never needs to re-subscribe the effect below just because
  // Canvas re-rendered for an unrelated reason such as a pan/zoom tick.
  shouldStartPan: (button: number) => boolean;
  onPanPointerDown: (event: PointerEvent) => void;
  onPanPointerMove: (event: PointerEvent) => void;
  onPanPointerUp: (event: PointerEvent) => void;
  // The same wheel bridge the focused frame gets (canvas.tsx's frameWheel,
  // via its stable callback): plain wheel pans, Cmd/Ctrl+wheel zooms around
  // the pointer, and a frame that can still scroll its own content keeps
  // that native scroll instead (spec section 3 - pan/zoom are general
  // canvas interactions, not carved out for whichever frame is focused).
  // Takes this preview's own frameWindow explicitly, the same reason
  // onPanPointerDown/Move/Up don't need it: canvas.tsx's shared handler
  // measures the exact iframe box to convert the event's frame-document
  // clientX/clientY into a window-space point for zoom-around-pointer, and
  // only the caller - not the event itself - knows which iframe that is.
  onFrameWheel: (event: WheelEvent, frameWindow: Window) => void;
  // Review fix wave item 8: the same relay Stage does above - a
  // non-focused, auto-height frame had NO content-height tracking of its
  // own at all before this (its wrapper below just hardcoded
  // ARTBOARD_MIN_HEIGHT), so other frames could never snap to, align
  // against, or marquee-select it by its real bottom edge.
  onMeasuredHeight?: (id: string, height: number) => void;
}) {
  const [frameDocument, setFrameDocument] = useState<CanvasDocument | null>(null);
  // Mirrors Stage's own contentHeight/effectiveHeight above: CanvasFrame's
  // ResizeObserver-backed measurement when this frame has no fixed height
  // of its own, otherwise the fixed height itself.
  const [contentHeight, setContentHeight] = useState(ARTBOARD_MIN_HEIGHT);
  const effectiveHeight = screen.stageHeight ?? contentHeight;

  useEffect(() => {
    onMeasuredHeight?.(screen.id, effectiveHeight);
    // Same reasoning as Stage's identical effect: onMeasuredHeight is
    // deliberately not a dependency, so an unstable caller can never make
    // this re-fire for the same height.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen.id, effectiveHeight]);

  useEffect(() => {
    if (!frameDocument) return;
    function onPointerDown(event: PointerEvent) {
      if (shouldStartPan(event.button)) {
        onPanPointerDown(event);
        return;
      }
      event.preventDefault();
      onFocusScreen(screen.id);
    }
    // TS narrowing of `frameDocument` above does not persist into this
    // nested function declaration (same limitation canvas.tsx's own
    // onWheel wrapper notes), hence the assertion.
    function onWheel(event: WheelEvent) {
      onFrameWheel(event, frameDocument!.window);
    }
    frameDocument.window.addEventListener("pointerdown", onPointerDown, { capture: true });
    // Forwarded unconditionally (not gated on shouldStartPan here) - the
    // pan itself already checks canvas.tsx's own panRef for a matching
    // pointerId before doing anything, the same guard the focused frame's
    // identical wiring already relies on, so a move/up that has nothing to
    // do with a pan started elsewhere is always a no-op.
    frameDocument.window.addEventListener("pointermove", onPanPointerMove);
    frameDocument.window.addEventListener("pointerup", onPanPointerUp);
    frameDocument.window.addEventListener("pointercancel", onPanPointerUp);
    // Attached to the document, not the window (matching canvas.tsx's
    // identical choice for the focused frame) - wheel bubbles from the
    // target up through the document to the window, so listening on both
    // would fire this handler twice per gesture.
    frameDocument.document.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      frameDocument.window.removeEventListener("pointerdown", onPointerDown, { capture: true });
      frameDocument.window.removeEventListener("pointermove", onPanPointerMove);
      frameDocument.window.removeEventListener("pointerup", onPanPointerUp);
      frameDocument.window.removeEventListener("pointercancel", onPanPointerUp);
      frameDocument.document.removeEventListener("wheel", onWheel);
    };
  }, [
    frameDocument,
    screen.id,
    onFocusScreen,
    shouldStartPan,
    onPanPointerDown,
    onPanPointerMove,
    onPanPointerUp,
    onFrameWheel,
  ]);

  // Same reasoning as Stage's own frameChildren above: this component is
  // already outer-memoized (`export const FramePreview = memo(...)` below),
  // so a pure viewport tick never re-runs this function body at all - but a
  // genuine re-render for an unrelated screen change should still hand
  // CanvasFrame ONE stable children value, not a fresh `[a, b]` array.
  const previewChildren = useMemo(
    () => (
      <>
        {/* Every block resolves its responsive breakpoint through useStage(),
            and the nearest provider above a preview used to be the
            workbench-level one, whose width is the FOCUSED frame's - so a
            1440 px preview next to a focused 375 px frame laid itself out with
            its mobile props (Matt, 2026-09-13: "the other frame resizes its
            content to fill the width of the frame"). A preview therefore
            carries its own provider, seeded from its own size; the key
            re-seeds it if the size changes while the frame stays previewed
            (StageProvider only reads initialWidth on mount). Nothing inside a
            disabled Editor writes back through this provider, and
            reportDocument stays false so the shared canvasDocument slot is
            still the focused frame's alone. */}
        <StageProvider
          key={`${screen.stageWidth}x${screen.stageHeight ?? 'auto'}`}
          initialWidth={screen.stageWidth}
          initialHeight={screen.stageHeight ?? null}
          initialDeviceName={screen.deviceName ?? null}
        >
          <Editor resolver={resolver} enabled={false}>
            <Frame data={screen.layout} />
          </Editor>
        </StageProvider>
        <LayoutGridOverlay grid={resolveLayoutGrid(screen.layoutGrid)} />
      </>
    ),
    [screen.stageWidth, screen.stageHeight, screen.deviceName, screen.layout, screen.layoutGrid],
  );

  return (
    <div
      data-testid="artboard-preview"
      className="theme-basic relative overflow-hidden border border-line-strong bg-background shadow-panel-lg"
      style={{ width: screen.stageWidth, height: effectiveHeight }}
      onPointerDown={(event) => {
        event.preventDefault();
        onFocusScreen(screen.id);
      }}
    >
      <CanvasFrame
        width={screen.stageWidth}
        height={screen.stageHeight ?? null}
        zoom={1}
        reportDocument={false}
        onCanvasDocument={setFrameDocument}
        onContentHeightChange={setContentHeight}
      >
        {previewChildren}
      </CanvasFrame>
    </div>
  );
}

export const FramePreview = memo(FramePreviewImpl);
