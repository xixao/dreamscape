'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { useEditor } from '@craftjs/core';
import type { Screen } from '@/lib/files/repository';
import {
  fitAll,
  frameRect,
  panBy,
  snapBoxFor,
  toCanvasPoint,
  toWindowPoint,
  zoomAround,
  type FrameRect,
  type Size,
  type Viewport,
} from '@/lib/canvas/viewport';
import { loadViewport, saveViewport } from '@/lib/canvas/viewport-store';
import type { SnapDistance, SnapGuide } from '@/lib/canvas/snap';
import { createInitialDiagramState, type DiagramAction, type DiagramState } from '@/lib/diagram/store';
import { canScrollInDirection, capturePointer, isElementLike } from '@/lib/dom';
import { cn } from '@/lib/utils';
import { useCanvasDocument } from './canvas-frame';
import type { StageCommentsProps } from './comments/comment-layer';
import { DiagramLayer, POINTER_TOOL, type DiagramTool } from './diagram/diagram-layer';
import { FrameTitle } from './frame-title';
import { isEditableTarget } from './keyboard';
import { SnapGuides } from './snap-guides';
import { FramePreview, Stage } from './stage';
import { useStage } from './stage-context';

// Canvas.test.tsx (and any harness built before diagrams existed) never
// passes the diagram-related props below - these defaults keep every such
// render an inert, empty, no-op diagram layer, the same "keep old callers
// working" precedent components/workbench/comments/comment-layer.tsx's own
// DEFAULT_STAGE_COMMENTS already set. workbench.tsx, which actually owns a
// page's live diagram state, always passes the real values.
const DEFAULT_DIAGRAM_STATE: DiagramState = createInitialDiagramState();
function noopDiagramDispatch(): void {}
function noop(): void {}
function noopIds(): void {}
// Canvas.test.tsx (and any harness predating multi-select) never passes a
// frame selection - an empty, stable set keeps every such render exactly as
// selection-free as before (see DEFAULT_DIAGRAM_STATE's own comment above
// for the identical "keep old callers working" precedent).
const DEFAULT_FRAME_SELECTION: ReadonlySet<string> = new Set();
// Same precedent, for callers predating item 8's measured-height plumbing.
const DEFAULT_MEASURED_HEIGHTS: ReadonlyMap<string, number> = new Map();
function noopMeasuredHeight(): void {}

export type ViewportSize = Size;

interface CanvasViewportContextValue {
  viewport: Viewport;
  setViewport: (update: Viewport | ((current: Viewport) => Viewport)) => void;
  viewportSize: ViewportSize;
  // Eases the viewport to `target` over `durationMs` (spec: clicking a
  // screens tab animates to fit that frame, 200ms ease-out) - cancelled the
  // instant anything calls the plain setViewport above instead (any pan or
  // zoom input), per the spec's "cancelled by any pan/zoom input".
  animateTo: (target: Viewport, durationMs: number) => void;
}

const CanvasViewportContext = createContext<CanvasViewportContextValue | null>(null);

/**
 * Exposes the canvas's `{ viewport, setViewport, viewportSize }` to anything
 * that needs to convert canvas-space coordinates to window coordinates, or
 * change the viewport, without measuring the DOM itself - the top bar's zoom
 * menu, keyboard shortcuts, frame titles, the layer stack menu, and any
 * future overlay (spec docs/superpowers/specs/2026-09-12-infinite-canvas-
 * design.md section 5). `useCanvasViewportController` below is the one real
 * owner of this state; WorkbenchShell calls it once and wraps this provider
 * around Canvas and every sibling that needs the same context, so all of
 * them share one instance rather than each computing their own.
 */
export function CanvasViewportProvider({
  viewport,
  setViewport,
  viewportSize,
  animateTo,
  children,
}: CanvasViewportContextValue & { children: ReactNode }) {
  const value = useMemo(
    () => ({ viewport, setViewport, viewportSize, animateTo }),
    [viewport, setViewport, viewportSize, animateTo],
  );
  return <CanvasViewportContext.Provider value={value}>{children}</CanvasViewportContext.Provider>;
}

export function useCanvasViewport(): CanvasViewportContextValue {
  const context = useContext(CanvasViewportContext);
  if (!context) throw new Error('useCanvasViewport must be used inside CanvasViewportProvider');
  return context;
}

// frameRect/snapBoxFor moved to lib/canvas/viewport.ts (review fix wave nit
// 15, beside the FrameRect shape they return) - imported above, alongside
// this file's other viewport helpers, rather than defined here.

/** Whether two canvas-space boxes overlap at all - the marquee's own hit test (spec section 3: "selects every frame whose box intersects the marquee"). */
function rectsIntersect(a: FrameRect, b: FrameRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * Owns the canvas viewport's state: per-file localStorage persistence
 * (lib/canvas/viewport-store.ts), measuring the canvas's own on-screen size
 * (`rootRef` - the caller attaches it to whatever element fills the window),
 * and the one-time "fit every frame" default for a file with nothing saved
 * yet (spec: "default: fit all frames"). Called once, by WorkbenchShell -
 * not by Canvas itself - so the same viewport/setViewport/viewportSize can
 * be shared, through CanvasViewportProvider, with everything that needs it:
 * Canvas, the top bar's zoom menu, keyboard shortcuts and the layer stack
 * menu alike.
 */
// Clicking a screens tab animates to fit that frame over this long, eased
// out (spec docs/superpowers/specs/2026-09-12-infinite-canvas-design.md
// section 5's "200 ms ease-out").
const TAB_FOCUS_ANIMATION_MS = 200;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function useCanvasViewportController({
  fileId,
  pageId,
  frames,
}: {
  fileId: string;
  // Scopes the per-page viewport storage key (lib/canvas/viewport-store.ts).
  // This one controller instance stays mounted for the whole file (see the
  // pageId-change check right below `viewportSize`, further down): a page
  // switch does not remount it (WorkbenchShell needs its own direct,
  // un-keyed access to setViewport/viewportSize/animateTo for the top bar
  // and keyboard shortcuts), so the controller instead notices `pageId`
  // itself changed and swaps to that page's own remembered viewport (or a
  // fresh fit-all when it has none) the same render.
  pageId: string;
  frames: readonly FrameRect[];
}): {
  viewport: Viewport;
  setViewport: (update: Viewport | ((current: Viewport) => Viewport)) => void;
  viewportSize: ViewportSize;
  rootRef: RefObject<HTMLDivElement | null>;
  animateTo: (target: Viewport, durationMs?: number) => void;
} {
  const rootRef = useRef<HTMLDivElement>(null);
  // Frames change constantly (a resize, a rename, a new screen) but the
  // default-viewport computation below must only ever run once, the first
  // time this canvas learns its own on-screen size - re-running it on every
  // frames change would silently reset a pan/zoom the user has already set.
  // A ref sidesteps that without needing frames as an effect dependency.
  // Synced through an effect, never written during render (refs are for
  // event handlers and effects, not render - see the measurement effect
  // below for why an effect here still races correctly against it).
  const framesRef = useRef(frames);
  useEffect(() => {
    framesRef.current = frames;
  }, [frames]);

  const [initialViewport] = useState(() => loadViewport(window.localStorage, fileId, pageId));
  const [viewport, setViewportState] = useState<Viewport>(initialViewport ?? { x: 0, y: 0, zoom: 1 });
  const [viewportSize, setViewportSize] = useState<ViewportSize>({ width: 0, height: 0 });
  const hasFitRef = useRef(initialViewport !== null);
  const viewportRef = useRef(viewport);
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  // The in-flight tab-focus animation, if any - a plain mutable token
  // (rather than state) since cancelling it must never itself trigger a
  // render; `cancelled` is read by the animation's own rAF loop (animateTo,
  // below) and set by the public setViewport (any direct pan/zoom input
  // cancels whatever animation is running - spec: "cancelled by any pan/
  // zoom input").
  const animationRef = useRef<{ cancelled: boolean } | null>(null);

  // Detects a page switch (pageId changed since the previous commit) and
  // swaps straight to that page's own remembered viewport, or a fresh
  // fit-all over its frames when it has none. A layout effect (runs
  // synchronously after DOM mutations, before the browser paints - same
  // reason the measurement effect below is one too), not the "adjust
  // during render" pattern workbench.tsx's own lastSelectedNodeId and
  // topbar.tsx's syncedFileName use elsewhere: this block also needs to
  // mutate animationRef/hasFitRef, and only an effect may touch a ref
  // (react-hooks/refs) - a plain state comparison during render may not.
  // Still paints the new page's viewport on the very first frame it is
  // visible, same as those render-phase patterns achieve for state.
  // viewportSize is already a real, non-zero measurement by the time a user
  // can switch pages at all (the canvas root never unmounts across a
  // switch), so fitAll below has real data without waiting for another
  // ResizeObserver firing. framesRef (not the raw `frames` param) so this
  // effect's own dependency array does not fire on every unrelated frames
  // change (a resize, a rename, a new screen) - only on an actual pageId
  // change; framesRef is kept current by its own effect above, which runs
  // first in every commit that changes both at once.
  const previousPageIdRef = useRef(pageId);
  useLayoutEffect(() => {
    if (pageId === previousPageIdRef.current) return;
    previousPageIdRef.current = pageId;
    if (animationRef.current) animationRef.current.cancelled = true;
    const loaded = loadViewport(window.localStorage, fileId, pageId);
    const hasMeasurement = viewportSize.width > 0 && viewportSize.height > 0;
    setViewportState(loaded ?? (hasMeasurement ? fitAll(framesRef.current, viewportSize) : { x: 0, y: 0, zoom: 1 }));
    // Either branch above already resolved a concrete viewport for this
    // page, so the measurement effect's own "first fit" below must not
    // recompute and override it the next time it runs (a later resize, say).
    hasFitRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, fileId]);

  const setViewport = useCallback((update: Viewport | ((current: Viewport) => Viewport)) => {
    if (animationRef.current) animationRef.current.cancelled = true;
    setViewportState(update);
  }, []);

  const animateTo = useCallback((target: Viewport, durationMs: number = TAB_FOCUS_ANIMATION_MS) => {
    const token = { cancelled: false };
    animationRef.current = token;
    const from = viewportRef.current;
    let startTime: number | null = null;
    function tick(timestamp: number) {
      if (token.cancelled) return;
      if (startTime === null) startTime = timestamp;
      const t = durationMs <= 0 ? 1 : Math.min(1, (timestamp - startTime) / durationMs);
      const eased = easeOutCubic(t);
      // The internal setter, deliberately not the public setViewport above:
      // the animation's own frames must never cancel themselves.
      setViewportState({
        x: from.x + (target.x - from.x) * eased,
        y: from.y + (target.y - from.y) * eased,
        zoom: from.zoom + (target.zoom - from.zoom) * eased,
      });
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        animationRef.current = null;
      }
    }
    requestAnimationFrame(tick);
  }, []);

  // Measures the root's own size once (and on every resize); the very first
  // measurement also supplies the default viewport (fit every frame) when
  // nothing was saved for this file yet.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    function update() {
      const rect = root!.getBoundingClientRect();
      const size = { width: rect.width, height: rect.height };
      setViewportSize(size);
      // A zero-size measurement is not real information to fit anything
      // against (fitAll would zoom all the way to MIN_ZOOM trying to cram
      // every frame into a 0x0 box) - it means the canvas has not actually
      // been laid out yet (a real browser lays out an `absolute inset-0`
      // element before any script can observe it, so in practice this only
      // ever happens in a test environment with no real layout engine).
      // Left at the plain `{ x: 0, y: 0, zoom: 1 }` default until a genuine
      // size comes in, same as the pre-infinite-canvas Stage's own
      // computeZoom, which returned 1 outright for the same "nothing to
      // measure yet" case.
      if (!hasFitRef.current && size.width > 0 && size.height > 0) {
        hasFitRef.current = true;
        setViewportState(fitAll(framesRef.current, size));
      }
    }
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  // Persists on every change, keyed per file and page (lib/canvas/viewport-
  // store.ts).
  useEffect(() => {
    saveViewport(window.localStorage, fileId, pageId, viewport);
  }, [fileId, pageId, viewport]);

  return { viewport, setViewport, viewportSize, rootRef, animateTo };
}

// The dot grid fades out below this zoom (spec section 3) - dots that close
// together are visual noise, not a useful reference, once zoomed out this far.
const GRID_FADE_ZOOM = 0.25;
const GRID_SPACING = 8;

// `visible` is the pixel grid's own per-browser toggle (spec docs/
// superpowers/specs/2026-09-13-grid-snapping-alignment-design.md section 5,
// Cmd+', lib/canvas/pixel-grid-store.ts) - defaults to true so every
// existing caller/test that predates the toggle keeps seeing exactly what
// the canvas always showed.
function dotGridStyle(viewport: Viewport, visible: boolean): CSSProperties {
  if (!visible || viewport.zoom < GRID_FADE_ZOOM) return {};
  const spacing = GRID_SPACING * viewport.zoom;
  return {
    backgroundImage: 'radial-gradient(circle, var(--line-soft) 1px, transparent 0)',
    backgroundSize: `${spacing}px ${spacing}px`,
    backgroundPosition: `${viewport.x}px ${viewport.y}px`,
  };
}

const MIDDLE_MOUSE_BUTTON = 1;
// Wheel-to-zoom sensitivity: exp() keeps repeated small deltaY ticks
// (trackpad pinch, mostly) composing multiplicatively rather than linearly,
// which is what keeps the point under the pointer exactly fixed regardless
// of how many ticks a single gesture is split into.
const WHEEL_ZOOM_SENSITIVITY = 0.01;

/**
 * Returns a function with a permanently stable identity that always calls
 * through to the LATEST `fn` passed in - the standard "useEvent" pattern
 * (the ref is synced by an effect after every render, and the returned
 * callback only ever reads it, never writes anything else) - for a plain
 * callback that must be handed to a memoized child (FramePreview below) as
 * a prop without defeating that memoization, but whose own implementation
 * is not itself safe to wrap directly in `useCallback`.
 *
 * That last part is the reason this exists rather than a plain
 * `useCallback` at each call site: `shouldStartPan`/`startFramePan`/
 * `moveFramePan`/`endFramePan` in Canvas below all read or write
 * `panRef.current`, deliberately kept as ordinary, freshly-defined-per-
 * render functions (matching every other pointer handler in this file).
 * Wrapping one of THEM directly in `useCallback` makes React Compiler's
 * static analysis treat `panRef` as reachable from a memoized value used
 * as an effect dependency, and it then flags every OTHER plain mutation of
 * that same ref (handleRootPointerDown, handleRootPointerMove) as unsafe.
 * This hook's own ref (`fnRef`) is private to each call site and never
 * touches `panRef` itself, so it carries none of that baggage - it only
 * ever forwards to whichever plain function is current.
 */
function useStableCallback<Args extends unknown[], R>(fn: (...args: Args) => R): (...args: Args) => R {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  return useCallback((...args: Args) => fnRef.current(...args), []);
}

/**
 * The infinite canvas (spec docs/superpowers/specs/2026-09-12-infinite-
 * canvas-design.md): a full-window pannable, zoomable surface with every
 * screen of the file rendered as an absolutely positioned frame inside one
 * transformed layer. The focused screen hosts the real, interactive Stage
 * (Craft's live editing session, the resize handles, comments); every other
 * screen is a read-only FramePreview that focuses itself on the first press
 * inside it. A controlled component: the viewport itself is owned by
 * useCanvasViewportController above (called once, by WorkbenchShell) and
 * read here through useCanvasViewport(), not computed locally - the same
 * context the top bar's zoom menu, keyboard shortcuts and the layer stack
 * menu all share.
 */
export function Canvas({
  screens,
  focusedScreenId,
  onFocusScreen,
  onRenameScreen,
  onMoveScreen,
  onMoveScreens = noopIds,
  comments,
  rootRef,
  diagram = DEFAULT_DIAGRAM_STATE,
  onDiagramAction = noopDiagramDispatch,
  diagramTool = POINTER_TOOL,
  onDiagramToolConsumed = noop,
  onDeselectDiagram = noop,
  selectedFrameIds = DEFAULT_FRAME_SELECTION,
  onToggleFrameSelection = noop,
  onSetFrameSelection = noopIds,
  onClearFrameSelection = noop,
  pixelGridVisible = true,
  measuredHeights = DEFAULT_MEASURED_HEIGHTS,
  onMeasuredHeight = noopMeasuredHeight,
}: {
  screens: Screen[];
  focusedScreenId: string;
  onFocusScreen: (id: string) => void;
  onRenameScreen: (id: string, name: string) => void;
  onMoveScreen: (id: string, position: { x: number; y: number }) => void;
  // A multi-frame drag (spec docs/superpowers/specs/2026-09-13-grid-
  // snapping-alignment-design.md section 3: "saves every moved x, y in one
  // patch") - every selected frame's new position, applied together.
  onMoveScreens?: (updates: { id: string; x: number; y: number }[]) => void;
  comments: StageCommentsProps;
  rootRef: RefObject<HTMLDivElement | null>;
  // The current page's diagram (spec docs/superpowers/specs/2026-09-13-
  // diagrams-design.md): owned by WorkbenchShell, forwarded here purely to
  // host DiagramLayer inside the same transformed layer the frames live in.
  diagram?: DiagramState;
  onDiagramAction?: (action: DiagramAction) => void;
  diagramTool?: DiagramTool;
  onDiagramToolConsumed?: () => void;
  // Clicking empty canvas clears the diagram selection the same way it
  // already deselects whatever Craft node was selected (spec: "clicking
  // empty canvas clears the selection") - called from the same branch,
  // below, that already calls actions.selectNode().
  onDeselectDiagram?: () => void;
  // The canvas-level selection of frames (spec section 3), independent of
  // Craft's own node selection inside a frame - owned by WorkbenchShell so
  // the Design panel's alignment row (inspector.tsx) can read it too.
  selectedFrameIds?: ReadonlySet<string>;
  // Shift+click a frame title (spec: "adds to the selection" - toggles, so
  // shift-clicking an already-selected title removes it).
  onToggleFrameSelection?: (id: string) => void;
  // A marquee drag's result, or Shift+marquee's union with the existing
  // selection - canvas.tsx itself computes which frames intersect, this is
  // just where the resulting id list lands.
  onSetFrameSelection?: (ids: string[]) => void;
  onClearFrameSelection?: () => void;
  // The canvas's own pixel grid (spec section 5, Cmd+', lib/canvas/pixel-
  // grid-store.ts) - a per-browser toggle owned by WorkbenchShell, not
  // canvas.tsx itself, the same split every other per-browser UI flag here
  // already has (chatOpen, panelMode, ...).
  pixelGridVisible?: boolean;
  // Review fix wave item 8: an auto-height frame's real, current height -
  // owned by WorkbenchShell (Inspector needs the same map for alignment/
  // distribute), fed here purely to resolve frameRect/snapBoxFor's own
  // fallback for snapping and the marquee's hit test.
  measuredHeights?: ReadonlyMap<string, number>;
  // CanvasFrame's own ResizeObserver-backed content measurement, relayed
  // up through Stage/FramePreview (below) to WorkbenchShell's map above.
  onMeasuredHeight?: (id: string, height: number) => void;
}) {
  const { actions } = useEditor();
  const setStageZoom = useStage().setZoom;
  const focusedCanvasDocument = useCanvasDocument();
  const { viewport, setViewport } = useCanvasViewport();

  // The guides/distances a frame's own drag last reported (spec docs/
  // superpowers/specs/2026-09-13-grid-snapping-alignment-design.md section
  // 2), keyed by which frame is being dragged so the SnapGuides overlay
  // below can anchor its distance chips to that frame's own (already
  // resolved) box. FrameTitle itself reports empty arrays right before its
  // own onDragEnd (see frame-title.tsx's endDrag), so this needs no
  // separate "drag ended" handling of its own to clear the overlay.
  const [snapResult, setSnapResult] = useState<{ frameId: string; guides: SnapGuide[]; distances: SnapDistance[] } | null>(
    null,
  );

  // Every selected frame's own x/y at the start of the CURRENT drag gesture
  // (spec section 3: "dragging any selected title moves all selected
  // frames together"), snapshotted lazily on that drag's first move (see
  // handleFrameMove below) and cleared on FrameTitle's own onDragEnd - a
  // plain ref, not state, since writing it must never itself trigger a
  // render (the same reasoning panRef/marqueeRef above are refs, not state).
  const multiDragStartRef = useRef<Map<string, { x: number; y: number }> | null>(null);

  // Routes one frame's drag: a solo drag (the dragged frame is not part of
  // a 2+ frame selection) saves through the existing single-screen path
  // unchanged; dragging a frame that IS part of a multi-selection instead
  // applies the SAME delta to every other selected frame's own drag-start
  // position and saves the whole batch in one patch (onMoveScreens) -
  // `delta` already reflects wherever resolveSnap put the dragged frame
  // (frame-title.tsx), so the rest of the selection moves in lockstep with
  // it, snap included, rather than being snapped independently themselves.
  function handleFrameMove(id: string, position: { x: number; y: number }, delta: { dx: number; dy: number }): void {
    if (selectedFrameIds.size > 1 && selectedFrameIds.has(id)) {
      if (!multiDragStartRef.current) {
        multiDragStartRef.current = new Map(
          screens
            .filter((screen) => selectedFrameIds.has(screen.id))
            .map((screen) => [screen.id, { x: screen.x ?? 0, y: screen.y ?? 0 }]),
        );
      }
      const startPositions = multiDragStartRef.current;
      // Review fix wave item 2 (blocker): an id with no recorded start
      // position (e.g. a stale selection entry for a screen that is no
      // longer on this page, or was deleted mid-drag) must be left out of
      // the batch entirely - defaulting it to {x:0,y:0} above used to send
      // that frame flying to the canvas origin the instant any OTHER
      // selected frame moved.
      const updates = Array.from(selectedFrameIds).flatMap((selectedId) => {
        if (selectedId === id) return [{ id: selectedId, x: position.x, y: position.y }];
        const start = startPositions.get(selectedId);
        if (!start) return [];
        return [{ id: selectedId, x: start.x + delta.dx, y: start.y + delta.dy }];
      });
      onMoveScreens(updates);
      return;
    }
    onMoveScreen(id, position);
  }
  // Read from event handlers and listener callbacks only (applyPanDelta,
  // onFrameWheel) - never during render, so synced through an effect rather
  // than assigned directly in the render body.
  const viewportRef = useRef(viewport);
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  // Keeps the focused Stage's own resize-handle math and the comment layer's
  // zoom-based positioning (both read useStage().zoom, unchanged from before
  // the infinite canvas) in sync with the viewport that now actually owns
  // zoom.
  useEffect(() => {
    setStageZoom(viewport.zoom);
  }, [viewport.zoom, setStageZoom]);

  // Space-to-pan key tracking, on the parent window and the focused frame's
  // own window (a keydown inside that iframe never reaches the parent - see
  // keyboard.tsx's identical reasoning). Not attached to every non-focused
  // preview's iframe: those are disabled/read-only and pressing into one
  // focuses it first (see FramePreview), which is the more natural way to
  // start panning from over a frame that was not already focused.
  const [spaceDown, setSpaceDown] = useState(false);

  // The active pan gesture, if any: which pointer started it, the last
  // point seen IN SCREEN SPACE (event.screenX/screenY - anchored to the
  // physical display, so it stays correct even while the frame the pan
  // started in is itself moving on screen under a pointer that hasn't
  // moved, and stays consistent if the gesture later hands off from a
  // frame's document to the parent or vice versa - see applyPanDelta
  // below), whether the gesture started inside a frame (moveFramePan/
  // startFramePan below ignore events for a pan that did not start in a
  // frame, and vice versa - one gesture has exactly one owner for its whole
  // duration), and whether Space (rather than the middle mouse button) is
  // what started it - releasing Space only ends a pan it started itself
  // (see the keyup handler below).
  const panRef = useRef<{
    pointerId: number;
    lastScreenX: number;
    lastScreenY: number;
    inFrame: boolean;
    viaSpace: boolean;
  } | null>(null);
  const [panning, setPanning] = useState(false);

  // The active marquee-selection gesture, if any (spec docs/superpowers/
  // specs/2026-09-13-grid-snapping-alignment-design.md section 3): a plain
  // (non-Space, non-middle-mouse) press that starts on empty canvas.
  // rootLeft/rootTop are cached once at pointerdown (same reasoning
  // frameWheel's own iframe-rect read documents) purely to convert a raw
  // clientX/Y into a root-relative screen point at each subsequent event.
  //
  // startX/Y and currentX/Y are CANVAS-space (review fix wave nit 16),
  // converted via toCanvasPoint the moment each point is captured
  // (pointerdown for start, each pointermove for current) using the
  // viewport THEN current - not deferred to pointerup, which used to
  // reinterpret both corners through whatever viewport happened to be
  // current at release time. A wheel-pan mid-drag changes what canvas-space
  // point a given screen pixel corresponds to; converting late meant the
  // start corner (captured under the OLD viewport) got silently
  // re-mapped to the wrong canvas location by the time endMarquee ran.
  //
  // start/currentScreenX/Y are the same two points kept in root-relative
  // SCREEN px instead, purely for MARQUEE_CLICK_THRESHOLD's "was this
  // really just a click" check below - that threshold is a fixed physical
  // mouse-movement amount and must stay zoom-independent, unlike the
  // canvas-space pair above.
  const marqueeRef = useRef<{
    pointerId: number;
    shiftKey: boolean;
    rootLeft: number;
    rootTop: number;
    startScreenX: number;
    startScreenY: number;
    currentScreenX: number;
    currentScreenY: number;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const [marqueeBox, setMarqueeBox] = useState<{ left: number; top: number; width: number; height: number } | null>(
    null,
  );

  // Every function below that touches panRef.current is a deliberately
  // plain, freshly-defined-per-render function (never useCallback) - see
  // useStableCallback's own doc comment above for why mixing that ref with
  // useCallback trips React Compiler's static analysis.
  function shouldStartPan(button: number): boolean {
    return spaceDown || button === MIDDLE_MOUSE_BUTTON;
  }

  // dx/dy are always a screen-space delta (event.screenX/screenY, diffed
  // against the pan's own last reading - see panRef's doc comment above),
  // which maps 1:1 onto the root canvas's own unscaled translation
  // regardless of which document produced it or how zoomed in the canvas
  // is. Unlike the old clientX/Y-based math this replaces, no zoom scaling
  // is needed here: that scaling existed only to correct for clientX/Y
  // being read inside a zoomed iframe's own internal coordinate space, a
  // problem screen space never has.
  function applyPanDelta(dx: number, dy: number): void {
    setViewport((current) => panBy(current, dx, dy));
  }

  function endPan(): void {
    panRef.current = null;
    setPanning(false);
  }

  // Review fix wave nit 12: Escape cancels an in-progress marquee (a plain
  // discard, no selection change) - the pointer button may still be
  // physically down when this fires, but marqueeRef going null makes every
  // later pointermove/pointerup for this gesture a no-op via their own
  // existing guards, so no further cleanup is needed here.
  function cancelMarquee(): void {
    if (!marqueeRef.current) return;
    marqueeRef.current = null;
    setMarqueeBox(null);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code === 'Space' && !isEditableTarget(event.target)) setSpaceDown(true);
      if (event.key === 'Escape') cancelMarquee();
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.code !== 'Space') return;
      setSpaceDown(false);
      // Releasing Space ends the pan immediately (spec section 3), same as
      // releasing the pointer - but only for a pan Space itself started; a
      // middle-mouse pan keeps going regardless of Space's state.
      if (panRef.current?.viaSpace) endPan();
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    focusedCanvasDocument?.window.addEventListener('keydown', onKeyDown);
    focusedCanvasDocument?.window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      focusedCanvasDocument?.window.removeEventListener('keydown', onKeyDown);
      focusedCanvasDocument?.window.removeEventListener('keyup', onKeyUp);
    };
  }, [focusedCanvasDocument]);

  // A pointerup can be lost entirely if the window loses focus mid-drag -
  // the user alt-tabs away, or a native dialog steals focus - which would
  // otherwise leave panRef stuck "active" forever and (per the one-owner
  // guards above) silently swallowing every pan gesture after it. A blur of
  // the top-level window catches this regardless of whether the gesture is
  // currently owned by the root or by some frame. A marquee (review fix
  // wave nit 12) is exactly the same kind of gesture-with-no-guaranteed-end
  // and gets the identical treatment - discarded, not turned into a
  // selection, the same as Escape above.
  useEffect(() => {
    function onBlur() {
      panRef.current = null;
      setPanning(false);
      cancelMarquee();
    }
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, []);

  function handleRootPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!shouldStartPan(event.button)) {
      // Clicking empty canvas (not a frame, not while starting a pan)
      // deselects and keeps the focused frame (spec section 3) - a press
      // on a frame itself is handled by that frame's own Stage/FramePreview,
      // both descendants of this element, so by the time a plain click
      // reaches all the way out here nothing under the pointer claimed it.
      if (event.target === event.currentTarget) {
        actions.selectNode();
        onDeselectDiagram();
        // Shift held keeps whatever frame selection already exists (this
        // is the start of a Shift+marquee, which UNIONS with it instead -
        // see endMarquee below) - a plain click/marquee start clears it
        // immediately, matching the deselect above, so a click with no
        // drag at all still clears with no further action needed.
        if (!event.shiftKey) onClearFrameSelection();
        // Review fix wave nit 12: only a primary (left) button press starts
        // a marquee - a right-click or other button on empty canvas still
        // deselects (above) but must not begin tracking a drag gesture.
        if (event.button === 0) {
          capturePointer(event.currentTarget, event.pointerId);
          const rect = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const y = event.clientY - rect.top;
          // Canvas-space from the very start (review fix wave nit 16) - see
          // marqueeRef's own doc comment above.
          const canvasPoint = toCanvasPoint({ x, y }, viewport);
          marqueeRef.current = {
            pointerId: event.pointerId,
            shiftKey: event.shiftKey,
            rootLeft: rect.left,
            rootTop: rect.top,
            startScreenX: x,
            startScreenY: y,
            currentScreenX: x,
            currentScreenY: y,
            startX: canvasPoint.x,
            startY: canvasPoint.y,
            currentX: canvasPoint.x,
            currentY: canvasPoint.y,
          };
          // Review re-review R4: the box itself is not painted until a
          // pointermove actually crosses MARQUEE_CLICK_THRESHOLD (below) -
          // setting it here unconditionally used to flash a visible 1px-
          // bordered 0x0 box under the cursor on every plain click.
        }
      }
      return;
    }
    event.preventDefault();
    // One gesture has one owner: a pan already in progress - started here
    // or, per startFramePan below, inside some frame - keeps exclusive
    // control of panRef until it ends; a second pointer must never hijack
    // it out from under the first.
    if (panRef.current) return;
    capturePointer(event.currentTarget, event.pointerId);
    panRef.current = {
      pointerId: event.pointerId,
      lastScreenX: event.screenX,
      lastScreenY: event.screenY,
      inFrame: false,
      viaSpace: event.button !== MIDDLE_MOUSE_BUTTON,
    };
    setPanning(true);
  }

  function handleRootPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const marquee = marqueeRef.current;
    if (marquee && marquee.pointerId === event.pointerId) {
      const x = event.clientX - marquee.rootLeft;
      const y = event.clientY - marquee.rootTop;
      marquee.currentScreenX = x;
      marquee.currentScreenY = y;
      // Canvas-space, converted now under the CURRENT viewport (review fix
      // wave nit 16) - see marqueeRef's own doc comment above.
      const canvasPoint = toCanvasPoint({ x, y }, viewport);
      marquee.currentX = canvasPoint.x;
      marquee.currentY = canvasPoint.y;
      // Review re-review R4: the box paints only once the gesture has
      // actually moved past the click threshold - the same screen-space
      // dx/dy check endMarquee itself uses to decide "was this really just
      // a click." Painting an immediate 0x0 box at pointerdown used to
      // flash a visible 1px-bordered dot under the cursor on every plain
      // click, gone again by pointerup.
      const dx = Math.abs(marquee.currentScreenX - marquee.startScreenX);
      const dy = Math.abs(marquee.currentScreenY - marquee.startScreenY);
      if (dx < MARQUEE_CLICK_THRESHOLD && dy < MARQUEE_CLICK_THRESHOLD) return;
      // The visual box stays screen-space (drawn outside the transformed
      // canvas-layer) - the start corner is re-projected through the
      // CURRENT viewport every move, so a pan since pointerdown still
      // renders it in the right place; the current corner is simply this
      // move's own already-screen-space point, no round trip needed.
      const startScreen = toWindowPoint({ x: marquee.startX, y: marquee.startY }, viewport);
      setMarqueeBox({
        left: Math.min(startScreen.x, x),
        top: Math.min(startScreen.y, y),
        width: Math.abs(x - startScreen.x),
        height: Math.abs(y - startScreen.y),
      });
      return;
    }
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    // No `inFrame` check here, deliberately: a pan that started inside a
    // frame (startFramePan below) is just as free to keep being driven from
    // this root handler once the pointer's physical position moves past the
    // frame's edge into the parent document - the screen-space delta below
    // is exactly as valid coming from here as from moveFramePan, so the
    // gesture keeps tracking the pointer with no jump at the handoff.
    applyPanDelta(event.screenX - pan.lastScreenX, event.screenY - pan.lastScreenY);
    pan.lastScreenX = event.screenX;
    pan.lastScreenY = event.screenY;
  }

  // Screen-px movement below which a marquee gesture is really just a plain
  // click - matches diagram-layer.tsx's own PLACEMENT_CLICK_THRESHOLD
  // precedent. Below this, handleRootPointerDown's own immediate clear
  // already stands as the final state; at or above it, this replaces (or,
  // Shift held, unions with) the selection using whichever frames the
  // marquee box actually intersects.
  const MARQUEE_CLICK_THRESHOLD = 4;

  function endMarquee(event: { pointerId: number }): void {
    const marquee = marqueeRef.current;
    if (!marquee || marquee.pointerId !== event.pointerId) return;
    marqueeRef.current = null;
    setMarqueeBox(null);

    // Screen-space threshold check (review fix wave nit 16): stays
    // zoom-independent, unlike the canvas-space pair below.
    const dx = Math.abs(marquee.currentScreenX - marquee.startScreenX);
    const dy = Math.abs(marquee.currentScreenY - marquee.startScreenY);
    if (dx < MARQUEE_CLICK_THRESHOLD && dy < MARQUEE_CLICK_THRESHOLD) return;

    // Already canvas-space, resolved incrementally as each point was
    // captured (review fix wave nit 16) - no toCanvasPoint call here
    // anymore, and critically, nothing left to re-interpret through
    // whatever viewport happens to be current now (a wheel-pan mid-drag
    // used to silently shift the resulting rectangle by reconverting both
    // corners through the SAME, now-stale-for-one-of-them viewport).
    const marqueeCanvasRect: FrameRect = {
      x: Math.min(marquee.startX, marquee.currentX),
      y: Math.min(marquee.startY, marquee.currentY),
      width: Math.abs(marquee.currentX - marquee.startX),
      height: Math.abs(marquee.currentY - marquee.startY),
    };
    const matchedIds = screens
      .filter((candidate) => rectsIntersect(marqueeCanvasRect, frameRect(candidate, measuredHeights)))
      .map((candidate) => candidate.id);
    onSetFrameSelection(marquee.shiftKey ? Array.from(new Set([...selectedFrameIds, ...matchedIds])) : matchedIds);
  }

  // Starts a pan gesture that began inside a frame's own document - the
  // focused frame (wired below) or, per the fix here, any non-focused
  // preview too (wired where FramePreview is rendered further down): a
  // frame document is a separate browsing context, so a plain click never
  // bubbles out to this component's own pointer handlers on canvas-root.
  function startFramePan(event: PointerEvent): void {
    if (!shouldStartPan(event.button)) return;
    event.preventDefault();
    // One gesture has one owner - see handleRootPointerDown's identical
    // guard above.
    if (panRef.current) return;
    // Captures on the pressed element itself (duck-typed via isElementLike,
    // since it lives in the frame's own realm) rather than some fixed
    // ancestor: keeps pointermove/pointerup arriving at this frame's own
    // document for the rest of the gesture even once the physical pointer
    // strays outside the frame's on-screen box - over the floating chrome,
    // say - the same reason handleRootPointerDown above captures on the
    // canvas root.
    if (isElementLike(event.target)) capturePointer(event.target, event.pointerId);
    panRef.current = {
      pointerId: event.pointerId,
      lastScreenX: event.screenX,
      lastScreenY: event.screenY,
      inFrame: true,
      viaSpace: event.button !== MIDDLE_MOUSE_BUTTON,
    };
    setPanning(true);
  }

  function moveFramePan(event: PointerEvent): void {
    const pan = panRef.current;
    // `!pan.inFrame` matters here, unlike handleRootPointerMove above: a
    // pan owned by the root (not started in any frame) must never be
    // touched by a frame's own move handler, even if a stray event for the
    // same pointerId reaches it (see "a pan started on the root ignores
    // frame events for its duration").
    if (!pan || pan.pointerId !== event.pointerId || !pan.inFrame) return;
    applyPanDelta(event.screenX - pan.lastScreenX, event.screenY - pan.lastScreenY);
    pan.lastScreenX = event.screenX;
    pan.lastScreenY = event.screenY;
  }

  function endFramePan(event: PointerEvent): void {
    if (panRef.current?.pointerId === event.pointerId) endPan();
  }

  // The wheel bridge shared by every frame document, focused or previewed
  // (spec docs/superpowers/specs/2026-09-12-infinite-canvas-design.md
  // section 3 describes pan/zoom as general canvas interactions, not carved
  // out for whichever frame happens to be focused - two-finger scroll and
  // pinch must work anywhere over the canvas). `frameWindow` is the specific
  // iframe's own window - not derived from `event` itself, since nothing
  // about a wheel event's own target identifies which on-screen iframe box
  // to measure for the pointer-to-window conversion below - so each caller
  // (the focused-frame effect further down, and FramePreview through
  // stableFrameWheel) passes its own.
  function frameWheel(event: WheelEvent, frameWindow: Window): void {
    const iframeElement = frameWindow.frameElement as HTMLElement | null;
    const iframeRect = iframeElement?.getBoundingClientRect();
    const zoom = viewportRef.current.zoom;
    const point = iframeRect
      ? { x: iframeRect.left + event.clientX * zoom, y: iframeRect.top + event.clientY * zoom }
      : { x: event.clientX, y: event.clientY };
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY);
      setViewport((current) => zoomAround(current, point, factor));
      return;
    }
    // Scroll-first rule (lib/dom.ts's canScrollInDirection): a frame that
    // can still scroll its own content in this gesture's direction keeps
    // that native scroll instead of panning the canvas - the same rule for
    // a preview as for the focused frame.
    if (canScrollInDirection(event.target, event.deltaX, event.deltaY)) return;
    event.preventDefault();
    setViewport((current) => panBy(current, -event.deltaX, -event.deltaY));
  }

  // Stable (permanently-unchanging-identity) versions of the five functions
  // above that FramePreview needs as props - there can be many of them, one
  // per non-focused screen, and this component re-renders on every pan/zoom
  // tick to update the viewport transform. See useStableCallback's own doc
  // comment (top of file) for why this indirection exists instead of
  // useCallback directly on shouldStartPan/startFramePan/moveFramePan/
  // endFramePan/frameWheel themselves.
  const stableShouldStartPan = useStableCallback(shouldStartPan);
  const stableStartFramePan = useStableCallback(startFramePan);
  const stableMoveFramePan = useStableCallback(moveFramePan);
  const stableEndFramePan = useStableCallback(endFramePan);
  const stableFrameWheel = useStableCallback(frameWheel);
  // Review fix wave item 8: wrapped the same way as the pan/wheel callbacks
  // above - onMeasuredHeight is a plain prop this component received (not
  // necessarily already stable the way onFocusScreen's own WorkbenchShell
  // origin already is), and Stage/FramePreview need a stable reference to
  // stay memoized across a pure viewport re-render.
  const stableOnMeasuredHeight = useStableCallback(onMeasuredHeight);

  // The focused frame's own iframe is a separate document: neither the root
  // pointer handlers above nor a plain wheel listener on the root element
  // ever see an event that originates inside it. Space+drag and wheel pan/
  // zoom are mirrored onto that one document so panning and zooming also
  // work while the pointer is over the frame actually being edited, not
  // only over the empty canvas around it. Every non-focused preview gets
  // the same wiring too - both the pan callbacks and frameWheel above, via
  // stableFrameWheel - directly against its own frame document (wired where
  // FramePreview is rendered further down): a non-focused preview otherwise
  // only focuses itself on a press, per FramePreview, and pressing while
  // Space is down must pan instead, not steal focus; a wheel/pinch over it
  // must scroll or pan/zoom the canvas the same as over the focused frame
  // or the empty canvas around it, not do nothing.
  useEffect(() => {
    const frameWindow = focusedCanvasDocument?.window;
    const frameDocument = focusedCanvasDocument?.document;
    if (!frameWindow || !frameDocument) return;

    // Thin wrapper so this effect can pass ITS OWN frame's window through to
    // the shared frameWheel above, while still holding a single stable
    // function reference to add and later remove the listener with. TS
    // narrowing of frameWindow above does not persist into a nested function
    // declaration, hence the assertion.
    function onWheel(event: WheelEvent) {
      stableFrameWheel(event, frameWindow!);
    }

    frameDocument.addEventListener('pointerdown', stableStartFramePan);
    frameWindow.addEventListener('pointermove', stableMoveFramePan);
    frameWindow.addEventListener('pointerup', stableEndFramePan);
    frameWindow.addEventListener('pointercancel', stableEndFramePan);
    // Attached to the document, not the window (also true for every
    // preview's identical wiring in FramePreview) - so a gesture is only
    // ever handled once: `wheel` bubbles from the target up through the
    // document to the window, and registering the same handler on both
    // would fire it twice per event.
    frameDocument.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      frameDocument.removeEventListener('pointerdown', stableStartFramePan);
      frameWindow.removeEventListener('pointermove', stableMoveFramePan);
      frameWindow.removeEventListener('pointerup', stableEndFramePan);
      frameWindow.removeEventListener('pointercancel', stableEndFramePan);
      frameDocument.removeEventListener('wheel', onWheel);
    };
    // stableFrameWheel is listed below even though it is stable, matching
    // stableStartFramePan/stableMoveFramePan/stableEndFramePan above - see
    // useStableCallback's own doc comment (top of file) for why.
  }, [focusedCanvasDocument, stableStartFramePan, stableMoveFramePan, stableEndFramePan, stableFrameWheel]);

  // The root's own wheel handling: a non-passive listener (React's onWheel
  // is passive by default in modern browsers, which would make
  // preventDefault a no-op) so plain wheel/two-finger-scroll pans and
  // Cmd/Ctrl+wheel zooms around the pointer without ever scrolling or
  // zooming the actual page.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const rect = root!.getBoundingClientRect();
        const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY);
        setViewport((current) => zoomAround(current, point, factor));
      } else {
        setViewport((current) => panBy(current, -event.deltaX, -event.deltaY));
      }
    }
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  }, [rootRef, setViewport]);

  // The frame snapResult last reported for, resolved against the current
  // screens prop so SnapGuides always anchors its distance chips to that
  // frame's own up-to-date box (see snapResult's own doc comment above).
  const snappingScreen = snapResult ? screens.find((screen) => screen.id === snapResult.frameId) : undefined;

  return (
    <div
      ref={rootRef}
      data-testid="canvas-root"
      className={cn(
        'absolute inset-0 overflow-hidden bg-canvas',
        spaceDown && !panning && 'cursor-grab',
        panning && 'cursor-grabbing',
      )}
      style={dotGridStyle(viewport, pixelGridVisible)}
      onPointerDown={handleRootPointerDown}
      onPointerMove={handleRootPointerMove}
      onPointerUp={(event) => {
        if (panRef.current?.pointerId === event.pointerId) {
          endPan();
          return;
        }
        endMarquee(event);
      }}
      onPointerCancel={(event) => {
        if (panRef.current?.pointerId === event.pointerId) {
          endPan();
          return;
        }
        endMarquee(event);
      }}
    >
      {marqueeBox && (
        <div
          data-testid="marquee-selection"
          className="pointer-events-none absolute border border-acc bg-acc/10"
          style={{ left: marqueeBox.left, top: marqueeBox.top, width: marqueeBox.width, height: marqueeBox.height }}
        />
      )}
      <div
        data-testid="canvas-layer"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {screens.map((screen) => {
          const focused = screen.id === focusedScreenId;
          const selected = selectedFrameIds.has(screen.id);
          // Every OTHER frame on this page, to snap against - excludes this
          // frame itself, and, when it is part of a multi-selection, every
          // co-selected frame too, so a selection never snaps against its
          // own members while moving together (spec section 3).
          const otherFrames = screens
            .filter((candidate) => candidate.id !== screen.id && !(selected && selectedFrameIds.has(candidate.id)))
            .map((candidate) => snapBoxFor(candidate, measuredHeights));
          return (
            <div
              key={screen.id}
              data-frame
              data-testid={`frame-${screen.id}`}
              data-selected={selected || undefined}
              className={cn(selected && 'outline-2 outline-acc outline-offset-2')}
              style={{ position: 'absolute', left: screen.x ?? 0, top: screen.y ?? 0 }}
            >
              <FrameTitle
                screen={screen}
                focused={focused}
                zoom={viewport.zoom}
                // Review re-review R1: the same measured-height-aware box
                // otherFrames (above) is already built from, so the DRAGGED
                // frame's own snap box for an auto-height screen matches
                // every other frame's instead of lagging a step behind.
                height={frameRect(screen, measuredHeights).height}
                onRename={(name) => onRenameScreen(screen.id, name)}
                onMove={(position, delta) => handleFrameMove(screen.id, position, delta)}
                onShiftSelect={() => onToggleFrameSelection(screen.id)}
                otherFrames={otherFrames}
                onSnapGuides={(result) => setSnapResult({ frameId: screen.id, ...result })}
                onDragEnd={() => {
                  multiDragStartRef.current = null;
                }}
              />
              {focused ? (
                <Stage screen={screen} viewport={viewport} comments={comments} onMeasuredHeight={stableOnMeasuredHeight} />
              ) : (
                <FramePreview
                  screen={screen}
                  // onFocusScreen is the prop this component itself
                  // received, passed straight through: already stable
                  // across a pure viewport re-render (it comes from
                  // WorkbenchShell/Workbench, neither of which re-renders
                  // just because THIS component's viewport context does),
                  // so no per-screen wrapping is needed here - FramePreview
                  // calls it with its own screen.id itself. onMeasuredHeight
                  // (review fix wave item 8) is the same shape and gets the
                  // same treatment, just wrapped in useStableCallback below
                  // since it originates as a plain prop THIS component
                  // received, not necessarily already stable itself.
                  onFocusScreen={onFocusScreen}
                  shouldStartPan={stableShouldStartPan}
                  onPanPointerDown={stableStartFramePan}
                  onPanPointerMove={stableMoveFramePan}
                  onPanPointerUp={stableEndFramePan}
                  onFrameWheel={stableFrameWheel}
                  onMeasuredHeight={stableOnMeasuredHeight}
                />
              )}
            </div>
          );
        })}
        {/*
          The diagram lives on the same page's canvas as the frames, drawn
          above them (spec docs/superpowers/specs/2026-09-13-diagrams-
          design.md section 3) - rendered last (of this transformed layer's
          children) so it paints on top, but the SVG root's own
          pointer-events stays `none` outside of an active placement tool,
          so a frame beneath it keeps receiving clicks normally (see
          diagram-layer.tsx's own doc comment).
        */}
        <DiagramLayer
          diagram={diagram}
          dispatch={onDiagramAction}
          frames={screens.map((screen) => ({ id: screen.id, ...frameRect(screen, measuredHeights) }))}
          viewport={viewport}
          tool={diagramTool}
          onToolConsumed={onDiagramToolConsumed}
        />
        <SnapGuides
          guides={snapResult?.guides ?? []}
          distances={snapResult?.distances ?? []}
          movingFrame={snappingScreen ? snapBoxFor(snappingScreen, measuredHeights) : null}
          zoom={viewport.zoom}
        />
      </div>
    </div>
  );
}
