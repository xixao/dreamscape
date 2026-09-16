'use client';

import { ComponentLibraryProvider } from './component-builder/library-context';
import { createTrayElement } from './create-tray-element';
import { trayItems } from '@/components/blocks/registry';
import { AppearanceContext } from './appearance-context';
import { countInstances, updateInstances, replaceSelection, type ComponentDefinition } from '@/lib/custom-components/model';
import { Editor, useEditor } from '@craftjs/core';
import { nanoid } from 'nanoid';
import { placeDiagramShape } from '@/lib/diagram/placement';
import { AnnotationLibrary } from './accessibility/annotation-library';
import type { DesignerKind } from '@/lib/accessibility/designer-kit';
import { createDesignerAnnotation, createAnnotation, type Category, type Annotation } from '@/lib/accessibility/kit';
import { createDiagramNode } from '@/lib/diagram/insertion';
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { defaultScreen } from '@/components/blocks/known-types';
import { emptyLayoutJson, resolver } from '@/components/blocks/registry';
import { fitAll, frameRect, stepZoom, zoomTo, zoomToRect, type FrameRect } from '@/lib/canvas/viewport';
import { loadPixelGridVisible, savePixelGridVisible } from '@/lib/canvas/pixel-grid-store';
import { useCanvasNotes } from './comments/use-canvas-notes';
import { NotesPanel } from './comments/notes-panel';
import { bounds as diagramBounds } from '@/lib/diagram/geometry';
import {
  createInitialDiagramState,
  diagramReducer,
  duplicatePairs,
  pruneEdgesForScreen,
  selectedGroupId,
  type DiagramData,
  type DiagramNode,
  cloneDiagram,
} from '@/lib/diagram/store';
import { layoutMissingPositions } from '@/lib/files/layout';
import { canonicalLayout, hasRootNode } from '@/lib/files/validate';
import type { FileRecord, LayoutGrid, OverlayPresentation, OverlayPresentationType, Page, Screen } from '@/lib/files/repository';
import { createOverlayScreen, isOverlay, nextOverlayDefaultName, wouldStrandPage } from '@/lib/files/screens';
import { loadChatPanelOpen, saveChatPanelOpen } from '@/lib/chat/store';
import { placeholderTransport } from '@/lib/chat/transport';
import { createFileSaver, type FilePatch, type SaveState } from '@/lib/persistence';
import { STAGE_PRESETS } from '@/lib/stage';
import { cn } from '@/lib/utils';
import {
  loadPanelCollapsed,
  loadPanelMode,
  savePanelCollapsed,
  savePanelMode,
} from '@/lib/workbench/panel-store';
import type { SectionChange } from '@/lib/canvas/sections';
import { SectionsContext } from './sections/section-context';
import { useSectionsController } from './sections/use-sections';
import { Canvas, CanvasViewportProvider, useCanvasViewportController } from './canvas';
import { PanelResize, useLeftPanelWidth } from './panel-resize';
import { LeftPanelContext } from './left-panel-tabs';
import { ChatPanel } from './chat/chat-panel';
import { ChatTransportProvider } from './chat/chat-transport-context';
import { CHIP, PANEL } from './chrome';
import { LayersPanel } from './layers-panel';
import type { CommentThread } from '@/lib/comments/store';
import { DiagramPalette } from './diagram/diagram-palette';
import { POINTER_TOOL, type DiagramTool } from './diagram/diagram-layer';
import type { DiagramFieldsSelection } from './diagram/diagram-fields';
import { exportDiagram } from './diagram/export-actions';
import { useDropPlaceholder } from './drop-placeholder';
import type { AlignMode, DiagramAlignmentContext, DistributeAxis } from './inspector/alignment-fields';
import { Inspector, type PanelMode } from './inspector/inspector';
import { useWorkbenchKeyboard } from './keyboard';
import { FrameSelectionActions } from './frame-selection-actions';
import { LayerStackMenu } from './layer-stack-menu';
import { DEFAULT_LAYOUT_GRID, resolveLayoutGrid } from './layout-grid';
import { NewLayoutDialog } from './new-layout-dialog';
import { NodeIndicator } from './node-indicator';
import { PrototypeProvider } from './prototype-context';
import { selectedIdFrom, useSelectedNode, useZoneRedirect } from './selection';
import { ShortcutsOverlay } from './shortcuts-overlay';
import { StageErrorBoundary } from './stage-error-boundary';
import { StageProvider, useStage } from './stage-context';
import { Topbar, presentHrefFor } from './topbar';

// Screen-px padding Shift+2 (zoom to selection/focused frame) leaves around
// the target rect - the same idea as lib/canvas/viewport.ts's own
// FIT_ALL_PADDING for Shift+1, kept as a separate, smaller constant here
// since zooming to one layer or frame should not breathe as much as fitting
// the whole file.
const SELECTION_ZOOM_PADDING = 48;

// Shown in the topbar's save-state slot for a screen whose saved layout
// failed validation and was silently started empty (see the invalidScreenIds
// prop below and app/f/[id]/page.tsx, which computes it).
const INVALID_LAYOUT_NOTICE = 'The saved design of this screen could not be read; it starts empty.';

// A file always has at least one page by the time it reaches this component
// in real use (validatePages rejects zero pages, and migration 0003
// backfilled one onto every pre-pages file) - this is only a fallback for
// the optional `pages` field's own precedent (see the comment on FileRecord
// in lib/files/repository.ts), e.g. an older test fixture that predates
// pages. A fresh nanoid(10) every call, same rationale as defaultScreen():
// two files opened without pages back to back must not collide, though in
// practice this only ever runs once per mount (see initialPages below).
function resolveInitialPages(file: FileRecord): Page[] {
  return file.pages && file.pages.length > 0 ? file.pages : [{ id: nanoid(10), name: 'Page 1' }];
}

// A file always has at least one screen by the time it reaches this
// component in real use (the repository's create()/save() both run every
// screens array through validateScreens, which rejects zero screens) - this
// is only a fallback for the optional `screens` field's own precedent (see
// the comment on FileRecord in lib/files/repository.ts), e.g. an older test
// fixture that predates screens. Every screen is then stamped with `pages`'
// own first page when it does not already name one - the same convenience
// stampMissingPageId gives a create()/save() caller that has not adopted
// pages yet (lib/files/repository.ts) - so an older fixture with screens
// but no pageId still ends up on the one page resolveInitialPages resolved
// for it, instead of being invisible on every page's own filtered view.
function resolveInitialScreens(file: FileRecord, pages: Page[]): Screen[] {
  const screens: Screen[] = file.screens && file.screens.length > 0 ? file.screens : [defaultScreen()];
  const fallbackPageId = pages[0].id;
  return screens.map((screen) => (screen.pageId ? screen : { ...screen, pageId: fallbackPageId }));
}

// The current page id is remembered in the URL hash: explicitly, as
// `#p=<id>`, when the current page has no screen to derive it from (an
// empty page); implicitly otherwise, via whichever screen `#s=<id>` names
// (switchScreen only ever writes `#s=`, never `#p=`, when the target page
// has a screen - see switchScreen and switchPage below). `#p=` wins when
// both are present and valid, matching the spec's own stated precedence;
// falls back to the file's first page when neither names anything real.
function pageIdFromHash(hash: string, screens: Screen[], pages: Page[]): string {
  const pageMatch = /[#&]p=([^&]+)/.exec(hash)?.[1];
  if (pageMatch && pages.some((page) => page.id === pageMatch)) return pageMatch;
  const screenMatch = /[#&]s=([^&]+)/.exec(hash)?.[1];
  if (screenMatch) {
    const screen = screens.find((candidate) => candidate.id === screenMatch);
    if (screen?.pageId && pages.some((page) => page.id === screen.pageId)) return screen.pageId;
  }
  return pages[0].id;
}

// The screen to focus for a given (already-resolved) page id: the one named
// by `#s=<id>` in the hash when it actually belongs to this page, else the
// first screen on this page in array order, else '' when the page has no
// screen at all - an empty page shows the canvas with its own "no screens
// yet" chip rather than a Stage for a screen that does not exist.
function screenIdForPage(hash: string, screens: Screen[], pageId: string): string {
  const screenMatch = /[#&]s=([^&]+)/.exec(hash)?.[1];
  if (screenMatch) {
    const screen = screens.find((candidate) => candidate.id === screenMatch && candidate.pageId === pageId);
    if (screen) return screen.id;
  }
  return firstScreenIdForPage(screens, pageId);
}

// Shared by screenIdForPage above and switchPage/deleteScreen/
// moveScreenToPage further down: the first screen (array order) belonging
// to `pageId`, or '' when that page currently has none.
function firstScreenIdForPage(screens: Screen[], pageId: string): string {
  return screens.find((screen) => screen.pageId === pageId)?.id ?? '';
}

// Shared by deleteScreen and moveScreenToPage (below): once a screen has
// left `pageId` (deleted outright, or moved to a different page), any
// diagram edge on THAT page that connected to it is now dangling -
// lib/files/validate.ts's validateDiagramReferences rejects a save for
// exactly that, and lib/persistence.ts's saver never retries a non-409/5xx
// response, so left uncleaned the file is stuck 400ing on every future
// autosave. Pruned here, in the SAME patch as the screens array, via
// lib/diagram/store.ts's own pruneEdgesForScreen. deletePage needs no
// equivalent call: it removes a page's own diagram along with every one of
// its screens together, and a diagram edge's screenId can only ever
// reference a screen on that SAME page, so there is no other page's
// diagram it could have left dangling. Returns `pages` itself, unchanged,
// when the affected page has no diagram or nothing on it referenced the
// screen, so callers can cheaply skip touching `pages` state - and the
// patch - at all when nothing needs saving.
function pruneScreenFromPages(pages: Page[], pageId: string | undefined, screenId: string): Page[] {
  if (!pageId) return pages;
  const page = pages.find((candidate) => candidate.id === pageId);
  if (!page?.diagram) return pages;
  const pruned = pruneEdgesForScreen(page.diagram, screenId);
  if (pruned === page.diagram) return pages;
  return pages.map((candidate) => (candidate.id === pageId ? { ...candidate, diagram: pruned } : candidate));
}

// Defensive counterpart to pruneScreenFromPages above, applied to a page's
// diagram wherever it is about to be READ (WorkbenchShell's own hydration,
// further down) or WRITTEN (updatePageDiagram, below): drops any edge whose
// screenId does not belong to `validScreenIds`, the current page's own
// screens. pruneScreenFromPages already keeps `pages` clean the moment a
// screen leaves through this file's own deleteScreen/moveScreenToPage, but
// this is the backstop for a dangling reference that reached here some
// other way - most plausibly a file saved before that fix existed - so
// hydrating a stale diagram (or writing one straight back out unchanged, as
// updatePageDiagram's own sync effect otherwise would on the very next
// UNRELATED edit) never keeps it around. Only ever drops edges, never a
// node, and returns `diagram` itself, unchanged, when nothing needed it.
function sanitizeDiagram(diagram: DiagramData, validScreenIds: ReadonlySet<string>): DiagramData {
  const referencedScreenIds = new Set<string>();
  for (const edge of diagram.edges) {
    if (edge.source.screenId) referencedScreenIds.add(edge.source.screenId);
    if (edge.target.screenId) referencedScreenIds.add(edge.target.screenId);
  }
  let sanitized = diagram;
  for (const screenId of referencedScreenIds) {
    if (!validScreenIds.has(screenId)) sanitized = pruneEdgesForScreen(sanitized, screenId);
  }
  return sanitized;
}

// Shared by onDiagramNudge and onFrameNudge below (spec docs/superpowers/
// specs/2026-09-13-grid-snapping-alignment-design.md section 4, updated
// 2026-09-13: 1 px plain, 8 px with Shift - dropped the earlier 8/64 px
// split so a nudge always lands on the canvas's own 8 px grid).
const NUDGE_PX = 1;
const NUDGE_PX_SHIFT = 8;

function nudgeDelta(direction: 'up' | 'down' | 'left' | 'right', big: boolean): [number, number] {
  const amount = big ? NUDGE_PX_SHIFT : NUDGE_PX;
  switch (direction) {
    case 'up':
      return [0, -amount];
    case 'down':
      return [0, amount];
    case 'left':
      return [-amount, 0];
    case 'right':
      return [amount, 0];
  }
}

// Diagram align({ids, mode}) / distribute({ids, axis}) (Matt, 2026-09-13:
// "i also need alignment options when selecting multiple shapes") are being
// added to lib/diagram/store.ts's own DiagramAction union on a separate
// branch (diagram-followups) - this branch does not own that file, so
// these two shapes are dispatched through a narrow, explicitly-typed
// adapter instead of widening DiagramAction here. When the branches merge,
// only this cast needs reconciling with whatever the real action types
// turn out to be, not every call site.

type MinimalQuery = { serialize: () => string };

type EditorActions = ReturnType<typeof useEditor>['actions'];

// Craft's actions are only reachable via useEditor() from a descendant of
// <Editor>, but switchScreen (below, in Workbench) needs to call
// actions.history.clear() and Workbench is <Editor>'s own parent, not its
// descendant. This is the bridge: a child that does nothing but keep a ref
// to the latest actions in sync, so switchScreen can reach them
// synchronously without itself becoming a descendant. Written into the ref
// from an effect (never during render) per the react-hooks/refs rule - by
// the time a user can trigger switchScreen, this has always already run.
function EditorActionsBridge({ actionsRef }: { actionsRef: { current: EditorActions | null } }) {
  const { actions } = useEditor();
  useEffect(() => {
    actionsRef.current = actions;
  }, [actions, actionsRef]);
  return null;
}

export function Workbench({
  file,
  invalidScreenIds = [],
}: {
  file: FileRecord;
  // Screen ids whose saved layout failed validation server-side and was
  // replaced with an empty one before this component ever saw it (see
  // app/f/[id]/page.tsx's resolveClientScreens). Drives the topbar notice
  // below - purely a hint for that notice, never re-validated here.
  invalidScreenIds?: string[];
}) {
  const [components, setComponents] = useState<ComponentDefinition[]>(file.components ?? []);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [appearance, setAppearance] = useState<'light' | 'dark' | 'internal-light' | 'internal-dark'>(file.appearance ?? 'light');
  const [fileName, setFileName] = useState(file.name);
  // Computed once, up front, and reused by every state initializer below
  // rather than each calling resolveInitialPages/resolveInitialScreens
  // itself: resolveInitialPages can mint a fresh random id (its own
  // pre-pages-fixture fallback), and calling it more than once per mount
  // would hand different initializers different ids for what must be the
  // exact same implicit page - screens and pages would then disagree about
  // which page is "the first one". React only ever consumes a useState
  // initializer's return value from the FIRST render anyway, so recomputing
  // these on later renders (cheap, and here harmless even in the fallback
  // case, since nothing reads them again) costs nothing real.
  const initialPages = resolveInitialPages(file);
  // A screen predating this feature has no x/y yet; layoutMissingPositions
  // (lib/files/layout.ts) fills them in left to right, per page, the moment
  // the file loads - so the canvas always has a concrete position for every
  // frame, without ever queuing a save purely from loading the file (that
  // only happens on the next real change, once these computed positions are
  // already part of `screens` and so ride along with it).
  const initialScreens = layoutMissingPositions(resolveInitialScreens(file, initialPages));
  const initialPageId = pageIdFromHash(window.location.hash, initialScreens, initialPages);

  const [pages, setPagesState] = useState<Page[]>(() => initialPages);
  const pagesRef = useRef(pages);
  function setPages(next: Page[]) { pagesRef.current = next; setPagesState(next); }
  const [sectionSession] = useState(() => nanoid());
  const appliedSectionChange = useRef<string | null>(null);
  const [screens, setScreens] = useState<Screen[]>(() => initialScreens);
  const [currentPageId, setCurrentPageId] = useState<string>(() => initialPageId);
  const [currentScreenId, setCurrentScreenId] = useState<string>(() =>
    screenIdForPage(window.location.hash, initialScreens, initialPageId),
  );
  // Screens the user has actually changed this session (a real edit, per
  // onNodesChange's own canonical-layout comparison below - not merely
  // selecting something on it). Only used to clear the invalid-layout
  // notice for a screen once it no longer describes that screen's state.
  const [editedScreenIds, setEditedScreenIds] = useState<ReadonlySet<string>>(() => new Set());
  const editorActionsRef = useRef<EditorActions | null>(null);

  // Lazy useState (not useMemo) so the saver is created exactly once and holds
  // its own pending-write timer across renders, the same guarantee a ref would
  // give; useMemo is not guaranteed to preserve identity across renders (React
  // may discard and recreate a memoized value), which could orphan a pending
  // write.
  const [saver] = useState(() =>
    createFileSaver({
      fileId: file.id,
      initialUpdatedAt: file.updatedAt,
      onState: setSaveState,
    }),
  );

  function queuePatch(patch: FilePatch): void {
    saver.queue(patch);
  }

  // Craft.js's <Editor> reads its onNodesChange (and resolver/onRender/etc.)
  // exactly once, at its own first mount, via an internal useRef(props) -
  // never re-reading it on later renders (confirmed against the installed
  // 0.2.12 bundle: `const n = useRef(t)` in the Editor component, where `t`
  // is its own props). A plain inline closure would therefore keep
  // referencing whichever `screens`/`currentScreenId` were current the
  // moment this component first rendered, silently going stale the first
  // time the user switches or adds a screen.
  //
  // These refs are how the stable callback below still always resolves
  // "which screen is this for" and "what did we last save for it" without
  // itself closing over state that could go stale. Every place that changes
  // `screens` or `currentScreenId` (switchScreen and friends, further down)
  // updates the matching ref itself, synchronously in the same event
  // handler, right alongside the state setter - not here during render,
  // which both trips the react-hooks/refs lint rule and, for
  // currentScreenIdRef specifically, would update too late anyway:
  // switching screens remounts Craft's <Frame> (the key on StageProvider
  // below), and Frame's own mount calls Craft's deserialize() synchronously
  // inside its render function body, re-triggering this very subscription
  // before any effect from this render has had a chance to run.
  const screensRef = useRef(screens);
  const currentScreenIdRef = useRef(currentScreenId);
  // Per screen id, the layout JSON string last known to match what the
  // server has, so a plain selection click (which still fires Craft's own
  // onNodesChange) is not mistaken for an edit worth saving - the same
  // canonical-compare guard the single-screen editor always had, now keyed
  // per screen instead of assuming there is only one.
  const lastSavedLayoutsRef = useRef<Record<string, string>>(
    Object.fromEntries(screens.map((screen) => [screen.id, screen.layout])),
  );
  // Screens whose baseline is Craft's OWN serialisation. The stored layout
  // text is not comparable with what Craft serialises after deserialising
  // it: Craft fills in block prop defaults and node fields that the stored
  // JSON may lack (files created from the examples, or saved before a block
  // gained a new default prop), so a text comparison against the stored
  // layout reported a change the moment such a file opened and saved it
  // untouched, which fought other tabs with 409s. Instead, the first
  // onNodesChange after a screen's <Frame> mounts (initial load, or a
  // screen switch, which remounts Frame) is recorded as that screen's
  // baseline and never saved; only later firings are compared against it.
  const baselinedScreenIdsRef = useRef<Set<string>>(new Set());

  // A stable function identity (useCallback with an empty dependency array,
  // rather than the ref-holds-a-reassigned-closure pattern), because Craft
  // only ever reads this prop once (see above) - passing a fresh closure
  // every render here would only ever be seen once anyway, and reassigning a
  // ref during render to fake "freshness" is exactly what the rule above
  // guards against. This works because the body below only ever reads the
  // refs declared above (never a plain state variable, by design, so it
  // never goes stale) and calls `saver`/`setScreens`, both stable across
  // every render - so capturing this one closure forever is correct, not
  // just permitted.
  const onNodesChange = useCallback((query: MinimalQuery) => {
    const screenId = currentScreenIdRef.current;
    const json = query.serialize();
    // Craft's store notifies before the screen's <Frame> has deserialised
    // anything (the frame now lives in an iframe whose document is ready a
    // moment after mount), and that firing serialises an empty tree. An
    // empty tree is never something the user did (New frame produces a
    // ROOT node), so it is never a baseline and never saved: persisting it
    // would wipe the screen on the server.
    if (!hasRootNode(json)) return;
    if (!baselinedScreenIdsRef.current.has(screenId)) {
      // First firing after this screen's Frame mounted: Craft's own
      // serialisation of what it just deserialised. Record it and stop; see
      // baselinedScreenIdsRef above.
      appliedSectionChange.current = JSON.parse(json).ROOT?.custom?.canvasSections?.revision ?? null;
      baselinedScreenIdsRef.current.add(screenId);
      lastSavedLayoutsRef.current = { ...lastSavedLayoutsRef.current, [screenId]: json };
      return;
    }
    const previous = lastSavedLayoutsRef.current[screenId];
    if (previous !== undefined && canonicalLayout(json) === canonicalLayout(previous)) return;
    lastSavedLayoutsRef.current = { ...lastSavedLayoutsRef.current, [screenId]: json };
    const sectionPatch = JSON.parse(json).ROOT?.custom?.canvasSections;
    const restoreSections = sectionPatch?.session === sectionSession && sectionPatch.revision !== appliedSectionChange.current && pagesRef.current.some(page => page.id === sectionPatch.pageId);
    let nextPages: Page[] | undefined;
    if (restoreSections) {
      appliedSectionChange.current = sectionPatch.revision;
      nextPages = pagesRef.current.map(page => page.id === sectionPatch.pageId ? { ...page, sections: sectionPatch.sections } : page);
      pagesRef.current = nextPages;
    }
    const frameSize = JSON.parse(json).ROOT?.custom?.frameSize;
    const inspectorScreens = JSON.parse(json).ROOT?.custom?.inspectorScreens;
    const sectionScreens = restoreSections && sectionPatch.screens ? [...screensRef.current.filter(s=>s.pageId!==sectionPatch.pageId),...sectionPatch.screens] as Screen[] : screensRef.current;
    const next = sectionScreens.map(screen => {
      const patch = inspectorScreens?.owner === screenId ? inspectorScreens.patches?.[screen.id] : undefined;
      const restored = patch ? Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, value === null ? undefined : value])) : {};
      const position = restoreSections && screen.pageId === sectionPatch.pageId ? sectionPatch.positions.find((p: {id:string}) => p.id === screen.id) : undefined;
      return { ...screen, ...restored, ...(position ? { x: position.x, y: position.y } : {}), ...(screen.id === screenId ? { ...(frameSize ? { stageWidth: frameSize.width, stageHeight: frameSize.height, deviceName: frameSize.deviceName } : {}), layout: json } : {}) };
    });
    screensRef.current = next;
    // Deferred to a microtask rather than called inline: this firing can
    // happen synchronously from INSIDE another component's render phase.
    // Switching (or adding/duplicating) a screen remounts Craft's <Frame>,
    // and Frame's own mount - a library internal, not an effect - calls
    // Craft's deserialize() right in its render function body, which
    // synchronously re-triggers this very subscription. Calling setScreens
    // directly from there updates Workbench (a different, already-mounted
    // component) while Frame is still rendering, which React warns about
    // and which was observed to occasionally double- or under-count the
    // resulting save depending on unrelated timing elsewhere in the tree. A
    // microtask runs after the current render/commit finishes, which is
    // indistinguishable from synchronous for anything a user or a test can
    // observe.
    queueMicrotask(() => {
      setScreens(next);
      if (nextPages) setPagesState(nextPages);
      saver.queue({ screens: next, ...(nextPages ? { pages: nextPages } : {}) });
      setEditedScreenIds((prev) => (prev.has(screenId) ? prev : new Set(prev).add(screenId)));
    });
    // Deliberately empty: see the comment above this callback for why every
    // value it needs comes from a ref or a value stable for this
    // component's whole lifetime, and none of it needs to trigger a new
    // closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onPageHide = () => {
      void saver.flush();
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [saver]);

  // Flush only, no dispose(): React's development StrictMode intentionally
  // mounts every component twice, running this cleanup once synchronously
  // right after the first mount and then running the effect again. `saver`
  // is created once via useState and survives that synthetic
  // mount/cleanup/mount cycle, so calling dispose() here would permanently
  // turn every later queue()/flush() into a no-op the moment the page loads
  // in development, silently breaking autosave (confirmed live: a rename
  // never reached the server). flush() alone is idempotent and safe to run
  // from both the synthetic and the real unmount.
  useEffect(
    () => () => {
      void saver.flush();
    },
    [saver],
  );

  // Switches the focused page: flushes the saver, clears Craft history (same
  // as switchScreen below - Craft's <Editor> stays mounted across the whole
  // file, so its undo stack is one shared stack unless cleared on every
  // switch) and moves to the target page's first screen, in array order, if
  // it has one. Deliberately does NOT create a screen when the target page
  // is empty (spec: "creating a screen when the page is empty is NOT
  // automatic") - WorkbenchShell/Canvas render a "This page has no screens
  // yet" chip instead; the Frames chip's own "New frame" item (it still
  // renders at zero frames) is the only way to add one. currentScreenId
  // becomes '' in that case: nothing in `screens` has that id, so every
  // consumer (Canvas, the Frames chip) simply shows nothing focused - the
  // same fallback resolveInitialScreens/screenIdForPage already rely on
  // elsewhere.
  function switchPage(pageId: string): void {
    if (pageId === currentPageId) return;
    void saver.flush();
    editorActionsRef.current?.selectNode();
    editorActionsRef.current?.history.clear();
    const firstScreenId = firstScreenIdForPage(screensRef.current, pageId);
    setCurrentPageId(pageId);
    if (firstScreenId) {
      baselinedScreenIdsRef.current.delete(firstScreenId);
      currentScreenIdRef.current = firstScreenId;
      setCurrentScreenId(firstScreenId);
      window.history.replaceState(null, '', `#s=${firstScreenId}`);
    } else {
      currentScreenIdRef.current = '';
      setCurrentScreenId('');
      // With no mounted Frame, Craft will otherwise retain the previous page's tree.
      baselinedScreenIdsRef.current.delete('');
      editorActionsRef.current?.selectNode();
      editorActionsRef.current?.history.ignore().deserialize({});
      window.history.replaceState(null, '', `#p=${pageId}`);
    }
  }

  // Cmd+Shift+]/[ (lib/shortcuts.ts): cycles to the next/previous page in
  // `pages` order, wrapping around at either end.
  function switchToAdjacentPage(direction: 'next' | 'previous'): void {
    const index = pages.findIndex((page) => page.id === currentPageId);
    if (index === -1) return;
    const delta = direction === 'next' ? 1 : -1;
    const target = pages[(index + delta + pages.length) % pages.length];
    switchPage(target.id);
  }

  function addPage(): void {
    const newPage: Page = { id: nanoid(10), name: `Page ${pages.length + 1}` };
    const newScreen: Screen = {
      id: nanoid(10), name: 'Frame 1', pageId: newPage.id, layout: emptyLayoutJson(),
      stageWidth: STAGE_PRESETS.desktop, stageHeight: null, deviceName: null, x: 0, y: 0,
    };
    const nextPages = [...pages, newPage];
    const nextScreens = [...screensRef.current, newScreen];
    lastSavedLayoutsRef.current = { ...lastSavedLayoutsRef.current, [newScreen.id]: newScreen.layout };
    screensRef.current = nextScreens;
    setScreens(nextScreens);
    setPages(nextPages);
    queuePatch({ pages: nextPages, screens: nextScreens });
    switchPage(newPage.id);
  }

  function renamePage(id: string, name: string): void {
    const next = pages.map((page) => (page.id === id ? { ...page, name } : page));
    setPages(next);
    queuePatch({ pages: next });
  }

  // Persists a page's own diagram (spec docs/superpowers/specs/2026-09-13-
  // diagrams-design.md): called by WorkbenchShell whenever its live diagram
  // reducer's nodes/edges actually change - the reducer's own selection and
  // history stay in WorkbenchShell, only the persisted `{ nodes, edges }`
  // shape ever reaches here, the same split screens/layout already has
  // between Craft's live editing state and what queuePatch saves.
  function updatePageDiagram(pageId: string, diagram: DiagramData): void {
    // Defensive (see sanitizeDiagram's own doc comment above): every real
    // diagram edit funnels through here, so this is also where a dangling
    // screenId reference that slipped past deleteScreen/moveScreenToPage's
    // own pruning - most plausibly data saved before that fix existed -
    // gets cleaned up, rather than being written straight back out.
    const validScreenIds = new Set(
      screens.filter((screen) => screen.pageId === pageId).map((screen) => screen.id),
    );
    const sanitized = sanitizeDiagram(diagram, validScreenIds);
    const next = pages.map((page) => (page.id === pageId ? { ...page, diagram: sanitized } : page));
    setPages(next);
    queuePatch({ pages: next });
  }

  // Copies a page's own screens onto the copy with fresh ids and positions
  // (layoutMissingPositions places them relative to the copy's own,
  // initially-empty page - see its own doc comment), the same "new,
  // independent identity" treatment duplicateScreen already gives a single
  // screen. Switches to the copy, matching duplicateScreen's own
  // switch-to-the-copy convention.
  function duplicatePage(id: string): void {
    const index = pages.findIndex((page) => page.id === id);
    if (index === -1) return;
    const newPageId = nanoid(10);
    const screenIdMap: Record<string, string> = {};
    const copiedScreens: Screen[] = screens
      .filter((screen) => screen.pageId === id)
      .map((screen) => {
        const copyId = nanoid(10);
        screenIdMap[screen.id] = copyId;
        return { ...screen, id: copyId, pageId: newPageId, ...(pages[index].sections?.length ? {} : { x: null, y: null }) };
      });
    // The page's flow chart comes along too, re-pointed at the copied
    // screens, so a duplicated page is a complete, independent copy.
    const sourceDiagram = pages[index].diagram;
    const newPage: Page = {
      id: newPageId,
      name: `${pages[index].name} copy`,
      ...(pages[index].sections ? { sections: pages[index].sections.map(section => ({ ...section, id: nanoid(10) })) } : {}),
      ...(sourceDiagram ? { diagram: cloneDiagram(sourceDiagram, screenIdMap, () => nanoid(10)) } : {}),
    };
    const nextPages = [...pages.slice(0, index + 1), newPage, ...pages.slice(index + 1)];

    for (const copy of copiedScreens) {
      lastSavedLayoutsRef.current = { ...lastSavedLayoutsRef.current, [copy.id]: copy.layout };
    }
    const nextScreens = layoutMissingPositions([...screens, ...copiedScreens]);

    screensRef.current = nextScreens;
    setPages(nextPages);
    setScreens(nextScreens);
    queuePatch({ pages: nextPages, screens: nextScreens });
    switchPage(newPageId);
  }

  // The last page cannot be deleted (guarded here the same way deleteScreen
  // guards the file's last screen - lib/files/validate.ts's validatePages
  // enforces this server-side too, since "at least one page" is its own
  // rejection rule). Removes the page and every one of its screens in the
  // same patch (spec: "deleting a page removes its screens in the same
  // patch") - the two arrays are validated together server-side precisely
  // so a page can never end up pointed at by a patch that forgot to also
  // drop its screens.
  function deletePage(id: string): void {
    if (pages.length <= 1) return;
    const nextPages = pages.filter((page) => page.id !== id);
    const nextScreens = screens.filter((screen) => screen.pageId !== id);
    for (const screen of screens) {
      if (screen.pageId === id) delete lastSavedLayoutsRef.current[screen.id];
    }
    screensRef.current = nextScreens;
    setPages(nextPages);
    setScreens(nextScreens);
    // No pruneScreenFromPages call needed here, unlike deleteScreen/
    // moveScreenToPage below: this removes page `id`'s own diagram along
    // with every one of its screens in the very same patch, and a diagram
    // edge's screenId can only ever reference a screen on that SAME page
    // (validateDiagramReferences) - there is no OTHER page's diagram that
    // could have pointed at one of them.
    queuePatch({ pages: nextPages, screens: nextScreens });
    if (id === currentPageId) switchPage(nextPages[0].id);
  }

  function movePage(id: string, direction: 'up' | 'down'): void {
    const index = pages.findIndex((page) => page.id === id);
    if (index === -1) return;
    const swapWith = direction === 'up' ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= pages.length) return;
    const next = [...pages];
    [next[index], next[swapWith]] = [next[swapWith], next[index]];
    setPages(next);
    queuePatch({ pages: next });
  }

  function switchScreen(id: string): void {
    if (id === currentScreenId) return;
    void saver.flush();
    // The target screen's <Frame> is about to (re)mount and deserialise, so
    // its next onNodesChange is a fresh baseline, not an edit.
    baselinedScreenIdsRef.current.delete(id);
    // Undo/redo history is per screen, not global: Craft's <Editor> stays
    // mounted across every screen (only the <Frame> below it remounts, keyed
    // by screen id), so its history is one shared stack unless cleared here.
    // Left alone, Undo on the screen just switched to would replay the
    // PREVIOUS screen's inverse patches against this screen's own nodes
    // (same ids, e.g. ROOT) - silently corrupting it, or throwing mid-apply
    // for a non-root id the new tree doesn't have. Ordered after the saver
    // flush and before the state update below, per the same synchronous
    // ordering the ref updates already depend on.
    editorActionsRef.current?.history.clear();
    // Updated synchronously here, in the same event handler as the state
    // setter (not during render - see the comment on currentScreenIdRef's
    // declaration above): by the time this returns, Craft's <Frame> for the
    // new screen is guaranteed not to have mounted yet, so the ref is always
    // correct before its render-phase deserialize() can re-trigger
    // onNodesChange.
    currentScreenIdRef.current = id;
    setCurrentScreenId(id);
    window.history.replaceState(null, '', `#s=${id}`);
  }

  function addScreen(): void {
    const pageScreens = screens.filter((screen) => screen.pageId === currentPageId);
    // Never templates off a focused OVERLAY (phase 2 review finding 3): an
    // overlay is an ordinary entry in pageScreens, so the focused-screen
    // lookup below excludes one explicitly, falling back to the page's own
    // most recently added plain screen (last in array order among this
    // page's own screens - new/duplicated screens are always appended, so
    // this is also "most recently added") - or, when the page has no plain
    // screen at all (every entry on it is an overlay, or it is empty), a
    // plain desktop default rather than reaching into some unrelated page's
    // own screens[0] (that fallback predates overlays and could just as
    // easily have picked an overlay from a different page entirely).
    const focused = pageScreens.find((screen) => screen.id === currentScreenId);
    const mostRecentPlainOnPage = [...pageScreens].reverse().find((screen) => !isOverlay(screen));
    const current: Pick<Screen, 'stageWidth' | 'stageHeight' | 'deviceName'> =
      (focused && !isOverlay(focused) ? focused : undefined) ??
      mostRecentPlainOnPage ??
      { stageWidth: STAGE_PRESETS.desktop, stageHeight: null, deviceName: null };
    const newScreen: Screen = {
      id: nanoid(10),
      name: `Frame ${pageScreens.length + 1}`,
      layout: emptyLayoutJson(),
      stageWidth: current.stageWidth,
      // Copies the source screen's device, same as duplicateScreen's plain
      // spread already does - a new frame starts out matching the one it
      // was added from, device included, not just its width.
      stageHeight: current.stageHeight ?? null,
      deviceName: current.deviceName ?? null,
      pageId: currentPageId,
      // No position yet: appended at the end of the array with x/y left
      // unset, layoutMissingPositions places it to the right of the
      // RIGHTMOST already-positioned frame on ITS OWN page, not merely the
      // last one in array order (spec: "a new or duplicated screen is
      // placed to the right of the rightmost frame in the file, never
      // overlapping" - "the file" there predates pages splitting one canvas
      // into several; layoutMissingPositions itself now scopes this per
      // page, see lib/files/layout.ts) - every existing screen already has
      // a position by this point (the initial-load computation above), so
      // this only ever fills in the new one.
      x: null,
      y: null,
    };
    lastSavedLayoutsRef.current = { ...lastSavedLayoutsRef.current, [newScreen.id]: newScreen.layout };
    const next = layoutMissingPositions([...screens, newScreen]);
    screensRef.current = next;
    setScreens(next);
    queuePatch({ screens: next });
    switchScreen(newScreen.id);
  }

  // The Frames chip's "New overlay" menu and Shift+O (spec docs/superpowers/
  // specs/2026-09-13-overlay-frames-design.md section 5): creates a new
  // overlay frame with createOverlayScreen's own defaults for the given
  // type (a dismissible dialog, a dismissible right sheet, or a bottom-
  // right toast - side/position are always the helper's defaults, never
  // offered at creation time, matching "default sizes/presentation from
  // the helper"), placed right of the rightmost frame ON THE CURRENT PAGE
  // exactly like addScreen above (layoutMissingPositions, x/y left null so
  // it resolves the position itself), and focused. Named "<Dialog|Sheet|
  // Toast> N" numbered per file, per type (OVERLAY_DEFAULT_NAMES' own doc
  // comment: "numbering per file is the caller's job, same as it is for a
  // new screen's 'Frame N'") - counted across every page, unlike addScreen's
  // own per-PAGE "Frame N", since an overlay's name identifies which kind
  // of overlay it is file-wide, not its place on one page's strip.
  // nextOverlayDefaultName (not a plain count of screens whose CURRENT
  // presentation.type matches - phase 2 review finding 2) scans existing
  // overlay NAMES instead, so a name is never reused: an overlay renamed
  // away from its default no longer reserves its number, and one whose
  // type was switched WITHOUT a rename (updateScreenPresentation, below)
  // still occupies its old name, so a brand new overlay of that same old
  // type does not collide with it.
  function addOverlay(type: OverlayPresentationType): void {
    const newOverlay: Screen = {
      ...createOverlayScreen({
        type,
        id: nanoid(10),
        name: nextOverlayDefaultName(screens, type),
        pageId: currentPageId,
        // x/y placeholders: createOverlayScreen requires numbers, but
        // layoutMissingPositions (below) only resolves a screen missing
        // BOTH - overwritten with null right after, same as addScreen's own
        // literal Screen object does directly.
        x: 0,
        y: 0,
      }),
      x: null,
      y: null,
    };
    lastSavedLayoutsRef.current = { ...lastSavedLayoutsRef.current, [newOverlay.id]: newOverlay.layout };
    const next = layoutMissingPositions([...screens, newOverlay]);
    screensRef.current = next;
    setScreens(next);
    queuePatch({ screens: next });
    switchScreen(newOverlay.id);
  }

  function renameScreen(id: string, name: string): void {
    const next = screens.map((screen) => (screen.id === id ? { ...screen, name } : screen));
    screensRef.current = next;
    setScreens(next);
    queuePatch({ screens: next });
  }

  // Dragging a frame's title (components/workbench/frame-title.tsx) moves
  // it - saved through this same path (spec docs/superpowers/specs/2026-09-
  // 12-infinite-canvas-design.md section 6: "saves x, y through the existing
  // save path"), debounced exactly like every other screen edit.
  function recordInspectorScreens(updates: { id: string; patch: Record<string, unknown> }[]): void {
    const actions = editorActionsRef.current;
    if (!actions) return;
    const owner = currentScreenIdRef.current;
    const before: Record<string, Record<string, unknown>> = {};
    const after: Record<string, Record<string, unknown>> = {};
    for (const { id, patch } of updates) {
      const screen = screensRef.current.find(screen => screen.id === id);
      if (!screen) continue;
      before[id] = Object.fromEntries(Object.keys(patch).map(key => [key, (screen as unknown as Record<string, unknown>)[key] ?? null]));
      after[id] = Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, value ?? null]));
    }
    actions.history.ignore().setCustom('ROOT', custom => {
      const patches = custom.inspectorScreens?.owner === owner ? custom.inspectorScreens.patches : {};
      custom.inspectorScreens = { owner, patches: { ...patches } };
      for (const id of Object.keys(before)) custom.inspectorScreens.patches[id] = { ...patches[id], ...before[id] };
    });
    actions.setCustom('ROOT', custom => {
      for (const id of Object.keys(after)) Object.assign(custom.inspectorScreens.patches[id], after[id]);
    });
  }

  function updateSections(pageId: string, change: SectionChange): void {
    const page = pagesRef.current.find(p => p.id === pageId);
    const actions = editorActionsRef.current;
    if (!page || !actions) return;
    // Files currently require at least one root frame. If deletion removes the
    // last one, keep a fresh empty frame rather than retaining deleted content.
    if (change.screens && !change.screens.length && screensRef.current.every(s=>s.pageId===pageId)) {
      change = {...change,screens:[{...defaultScreen(),pageId,x:0,y:0}]};
    }
    const before = { ...(change.screens ? {screens:screensRef.current.filter(s=>s.pageId===pageId)} : {}), ...(change.diagram ? {diagram:page.diagram??{nodes:[],edges:[]}} : {}), diagramPositions: change.diagramPositions?.flatMap(position => { const node=page.diagram?.nodes.find(n=>n.id===position.id);return node?[{id:node.id,x:node.x,y:node.y}]:[]; }), sections: page.sections ?? [], positions: change.positions.flatMap(position => {
      const screen = screensRef.current.find(s => s.id === position.id && s.pageId === pageId);
      return screen ? [{id:screen.id,x:screen.x ?? 0,y:screen.y ?? 0}] : [];
    }) };
    actions.history.ignore().setCustom('ROOT', custom => {
      custom.canvasSections = { ...before, pageId, session: sectionSession, revision: nanoid() };
    });
    actions.setCustom('ROOT', custom => {
      custom.canvasSections = { ...change, pageId, session: sectionSession, revision: nanoid() };
      // Frame-position history must agree with the new section positions, so
      // an unrelated inspector edit cannot restore an older drag location.
      for (const position of change.positions) {
        if (custom.inspectorScreens?.patches?.[position.id]) Object.assign(custom.inspectorScreens.patches[position.id], {x:position.x,y:position.y});
      }
    });
  }

  function moveScreen(id: string, position: { x: number; y: number }): void {
    // Review fix wave item 1 (blocker): validateScreens rejects a
    // non-integer x/y with a 400 that lib/persistence.ts never retries, so
    // this is a defensive second Math.round on top of resolveSnap's own -
    // a caller that skips snap.ts entirely (or a future one) still can't
    // wedge autosave with a fractional position.
    const next = screens.map((screen) =>
      screen.id === id ? { ...screen, x: Math.round(position.x), y: Math.round(position.y) } : screen,
    );
    screensRef.current = next;
    setScreens(next);
    queuePatch({ screens: next });
  }

  // The multi-frame counterpart to moveScreen above (spec docs/superpowers/
  // specs/2026-09-13-grid-snapping-alignment-design.md section 3: "saves
  // every moved x, y in one patch") - a dragged multi-selection
  // (canvas.tsx) and the alignment/distribute/tidy up actions (the
  // inspector's alignment fields) both move several frames at once and
  // must land in one save, not one per frame.
  function moveScreens(updates: { id: string; x: number; y: number }[]): void {
    recordInspectorScreens(updates.map(update => ({ id: update.id, patch: { x: Math.round(update.x), y: Math.round(update.y) } })));
  }

  // The Design panel's Frame section (columns/gutter/margin fields and the
  // "Show layout grid" switch, inspector.tsx) and Shift+G (onToggleLayoutGrid,
  // below) both merge a partial change into whichever layoutGrid the target
  // screen already has - defaulting to DEFAULT_LAYOUT_GRID (12/24/32/false)
  // first, same as components/workbench/layout-grid.tsx's own
  // resolveLayoutGrid, so toggling visibility on a screen that has never
  // been customized still produces a complete, valid LayoutGrid rather than
  // a half-filled patch.
  function updateLayoutGrid(id: string, patch: Partial<LayoutGrid>): void {
    const screen = screensRef.current.find(screen => screen.id === id);
    recordInspectorScreens([{ id, patch: { layoutGrid: { ...DEFAULT_LAYOUT_GRID, ...screen?.layoutGrid, ...patch } } }]);
  }

  // The Design panel's Overlay section (inspector.tsx, spec section 5):
  // replaces an overlay frame's whole presentation object, never merges a
  // patch into it - the contract phase 1 left for phase 2 ("the editor
  // must always write a presentation that matches its type exactly:
  // switching Presentation means rebuilding the object ... never adding a
  // key to the old one, or the next autosave is a 400"). The panel itself
  // builds the replacement (Presentation/Side/Position/Dismissible each
  // rebuild the whole object); this only ever writes what it is given.
  //
  // `name` (phase 2 review finding 2/3) is optional and, unlike
  // `presentation`, a PATCH rather than a replacement: inspector.tsx's
  // handlePresentationTypeChange passes it only when the screen's old name
  // was still that old type's own auto-generated default, and omits the
  // argument entirely otherwise (never an explicit `undefined`) - so a
  // custom name is left untouched here exactly by this function never
  // being told to change it.
  function updateScreenPresentation(id: string, presentation: OverlayPresentation, name?: string): void {
    recordInspectorScreens([{ id, patch: { presentation, ...(name !== undefined ? { name } : {}) } }]);
  }

  function duplicateScreen(id: string): void {
    const index = screens.findIndex((screen) => screen.id === id);
    if (index === -1) return;
    // x/y explicitly cleared, not inherited from the plain spread: the copy
    // must not land exactly on top of its source. Placed right after the
    // source in the array (below); layoutMissingPositions resolves its
    // actual position from the RIGHTMOST already-positioned frame on the
    // same page (spec: "a new or duplicated screen is placed to the right
    // of the rightmost frame in the file, never overlapping"; scoped per
    // page by layoutMissingPositions, see lib/files/layout.ts), not from
    // wherever the source itself happens to sit - a source that is not
    // already the rightmost frame on its page must not have its copy land
    // on whatever frame comes after it. pageId comes along with the plain
    // spread, same page as its source.
    const copy: Screen = { ...screens[index], id: nanoid(10), name: `${screens[index].name} copy`, x: null, y: null };
    lastSavedLayoutsRef.current = { ...lastSavedLayoutsRef.current, [copy.id]: copy.layout };
    const next = layoutMissingPositions([...screens.slice(0, index + 1), copy, ...screens.slice(index + 1)]);
    screensRef.current = next;
    setScreens(next);
    queuePatch({ screens: next });
    switchScreen(copy.id);
  }

  // Disabled in the UI (a frame row's own Delete item in the Frames chip,
  // frames-chip.tsx) once a page is down to one screen, the same way it
  // always disabled Delete at one screen file-wide
  // before pages existed - now scoped to the screen's OWN page rather than
  // the whole file, since a page emptying out entirely is a real, supported
  // state (reached instead through "Move to page", or a page that started
  // empty), just not one Delete itself produces. Also refuses the last
  // PLAIN screen of a page that has an overlay (phase 2 review finding 1:
  // Present has nowhere sensible to land otherwise) - wouldStrandPage
  // (lib/files/screens.ts) is the same check the Frames chip's own
  // disabled-with-tooltip UI already uses, so the two can never disagree;
  // this is the data-layer backstop for any caller that reaches here some
  // other way.
  function deleteScreen(id: string): void {
    const target = screens.find((screen) => screen.id === id);
    if (!target) return;
    const pageScreens = screens.filter((screen) => screen.pageId === target.pageId);
    if (pageScreens.length <= 1) return;
    if (wouldStrandPage(target, pageScreens)) return;
    const next = screens.filter((screen) => screen.id !== id);
    delete lastSavedLayoutsRef.current[id];
    screensRef.current = next;
    setScreens(next);
    // The screen just left its page - see pruneScreenFromPages' own doc
    // comment above for why any diagram edge that connected to it must be
    // cleaned up in this SAME patch.
    const nextPages = pruneScreenFromPages(pages, target.pageId, id);
    const patch: FilePatch = { screens: next };
    if (nextPages !== pages) {
      setPages(nextPages);
      patch.pages = nextPages;
    }
    queuePatch(patch);
    if (id === currentScreenId) switchScreen(firstScreenIdForPage(next, target.pageId!));
  }

  // "Move to page" (a frame row's own submenu in the Frames chip,
  // frames-chip.tsx): keeps the screen's
  // layout, comments (comments are keyed by screen id, not page - see
  // lib/comments/store.ts - so they simply travel with it) and everything
  // else, only repointing pageId and clearing its position so
  // layoutMissingPositions places it fresh on the target page rather than
  // possibly on top of one of that page's existing frames. If the screen
  // being moved is the one currently focused, follows deleteScreen's own
  // convention for "this screen is no longer part of the current page's
  // view": pick another screen still on the ORIGIN page, or show that page
  // empty - moving never jumps the editor's view to the destination page.
  // Also refuses to move away the last PLAIN screen of an origin page that
  // has an overlay (phase 2 review finding 1, same wouldStrandPage check
  // deleteScreen and the Frames chip's own UI use) - moving away the last
  // screen of a page that has NO overlay still empties it, exactly as
  // before; only the overlays-but-no-plain-screen state is new and refused.
  function moveScreenToPage(id: string, targetPageId: string): void {
    const target = screens.find((screen) => screen.id === id);
    if (!target || target.pageId === targetPageId) return;
    const originPageId = target.pageId;
    const originPageScreens = screens.filter((screen) => screen.pageId === originPageId);
    if (wouldStrandPage(target, originPageScreens)) return;
    // Re-splice rather than map in place: the moved screen joins the target
    // page AFTER that page's existing screens in strip order, instead of
    // keeping its old file-wide index (which could put it ahead of them).
    const moved: Screen = { ...target, pageId: targetPageId, x: null, y: null };
    const without = screens.filter((screen) => screen.id !== id);
    let insertAt = without.length;
    for (let i = without.length - 1; i >= 0; i -= 1) {
      if (without[i].pageId === targetPageId) {
        insertAt = i + 1;
        break;
      }
    }
    const next = layoutMissingPositions([...without.slice(0, insertAt), moved, ...without.slice(insertAt)]);
    screensRef.current = next;
    setScreens(next);
    // The screen just left originPageId - see pruneScreenFromPages' own doc
    // comment above and deleteScreen's identical treatment just above this
    // function. Only the ORIGIN page's diagram can have a now-dangling
    // edge; landing on targetPageId never invalidates anything already
    // there.
    const nextPages = pruneScreenFromPages(pages, originPageId, id);
    const patch: FilePatch = { screens: next };
    if (nextPages !== pages) {
      setPages(nextPages);
      patch.pages = nextPages;
    }
    queuePatch(patch);
    if (id === currentScreenId) {
      const remainingId = firstScreenIdForPage(next, originPageId!);
      if (remainingId) {
        switchScreen(remainingId);
      } else {
        currentScreenIdRef.current = '';
        setCurrentScreenId('');
        baselinedScreenIdsRef.current.delete('');
        editorActionsRef.current?.selectNode();
        editorActionsRef.current?.history.ignore().deserialize({});
        editorActionsRef.current?.history.clear();
        window.history.replaceState(null, '', `#p=${originPageId}`);
      }
    }
  }

  // Handles every manual, deviceless size change on the current screen: a
  // plain width (the width handle, the Mobile/Tablet/Desktop segments, or
  // arrow keys on the width handle - always height: null, deviceName: null),
  // a fixed height set by the height handle (width unchanged, deviceName
  // still null), or both from the corner handle. One function because
  // StageContext's setWidth and setSize both ultimately mean the same thing
  // to a saved screen - "the user set an explicit size by hand, so whatever
  // device it had is gone" - and both always clear deviceName the same way.
  function handleSizeChange(next: { width: number; height: number | null; deviceName: string | null }): void {
    const current = screensRef.current.find(screen => screen.id === currentScreenIdRef.current);
    if (!current || (current.stageWidth === next.width && (current.stageHeight ?? null) === next.height && (current.deviceName ?? null) === next.deviceName)) return;
    const actions = editorActionsRef.current;
    if (actions) {
      // Seed the pre-resize dimensions without adding an undo step. The
      // subsequent change shares Craft's history with inspector/node edits.
      actions.history.ignore().setCustom('ROOT', custom => { custom.frameSize = { width: current.stageWidth, height: current.stageHeight ?? null, deviceName: current.deviceName ?? null }; });
      actions.history.throttle(300).setCustom('ROOT', custom => { custom.frameSize = next; });
    } else {
      const nextScreens = screensRef.current.map(screen => screen.id === current.id ? { ...screen, stageWidth: next.width, stageHeight: next.height, deviceName: next.deviceName } : screen);
      screensRef.current = nextScreens; setScreens(nextScreens); queuePatch({ screens: nextScreens });
    }
  }

  function handleDeviceChange(device: { width: number; height: number; deviceName: string }): void {
    handleSizeChange(device);
  }

  const currentScreen = screens.find((screen) => screen.id === currentScreenId) ?? screens[0];
  // Only while the current screen's own saved layout failed validation
  // (invalidScreenIds, from the server) and the user hasn't yet made a real
  // edit to it this session (editedScreenIds, from onNodesChange above) -
  // the moment either stops being true for this screen, the notice is gone
  // for good until a reload.
  const notice =
    invalidScreenIds.includes(currentScreenId) && !editedScreenIds.has(currentScreenId)
      ? INVALID_LAYOUT_NOTICE
      : undefined;

  function changeComponent(definition: ComponentDefinition, remove = false, sourceId?: string) {
    const nextComponents = remove ? components.filter(item => item.id !== definition.id)
      : [...components.filter(item => item.id !== definition.id), definition];
    const nextScreens = screensRef.current.map(screen => {
      return { ...screen, layout: updateInstances(sourceId && screen.id === currentScreenIdRef.current ? replaceSelection(screen.layout, sourceId, definition) : screen.layout, definition, remove) };
    });
    setComponents(nextComponents); setScreens(nextScreens); screensRef.current = nextScreens;
    const focused = nextScreens.find(screen => screen.id === currentScreenIdRef.current);
    if (focused) editorActionsRef.current?.deserialize(focused.layout);
    queuePatch({ components: nextComponents, screens: nextScreens });
  }

  return (
    <AppearanceContext.Provider value={{ appearance, setAppearance: next => { setAppearance(next); queuePatch({ appearance: next }); }, setFrameAppearance: (id, value) => recordInspectorScreens([{ id, patch: { appearance: value } }]) }}>
    <ComponentLibraryProvider fileId={file.id} components={components} saveState={saveState}
      onSave={(definition, sourceId) => changeComponent(definition, false, sourceId)} onRemove={definition => changeComponent(definition, true)}
      count={id => countInstances(screens.map(screen => screen.layout), id)}>
    <Editor
      resolver={resolver}
      onRender={NodeIndicator}
      // The drag placeholder (components/workbench/drop-placeholder.tsx)
      // replaces Craft's own coloured indicator bar for a valid placement -
      // success is transparent so that bar never shows; the red error bar
      // is untouched (spec docs/superpowers/specs/2026-09-12-drop-
      // placeholder-design.md section 2: "the success colour becomes
      // transparent so the green bar never shows").
      indicator={{ success: 'transparent', error: 'var(--bad)' }}
      onNodesChange={onNodesChange}
    >
      <EditorActionsBridge actionsRef={editorActionsRef} />
      {/*
        Deliberately not keyed by currentScreenId (it used to be): that keyed
        every consumer below - the topbar, tray, inspector, and WorkbenchShell's
        own uiHidden/panelMode state - for a full remount on every screen
        switch, silently resetting all of it back to defaults. Only the
        <Frame> inside Stage needs to remount per screen (it already has its
        own key there); StageProvider stays mounted for the file's whole
        session, and WorkbenchShell re-initialises its width per screen
        itself (see the effect there) without remounting anything.
      */}
      <StageProvider
        initialWidth={currentScreen.stageWidth}
        initialHeight={currentScreen.stageHeight ?? null}
        initialDeviceName={currentScreen.deviceName ?? null}
        onWidthChange={(width) => handleSizeChange({ width, height: null, deviceName: null })}
        onSizeChange={(size) => handleSizeChange({ width: size.width, height: size.height, deviceName: null })}
        onDeviceChange={handleDeviceChange}
      >
        <WorkbenchShell
          fileId={file.id}
          folderId={file.folderId ?? null}
          fileName={fileName}
          onRename={(name) => {
            setFileName(name);
            queuePatch({ name });
          }}
          saveState={saveState}
          notice={notice}
          pages={pages}
          currentPageId={currentPageId}
          onSwitchPage={switchPage}
          onSwitchToAdjacentPage={switchToAdjacentPage}
          onAddPage={addPage}
          onRenamePage={renamePage}
          onDuplicatePage={duplicatePage}
          onDeletePage={deletePage}
          onMovePage={movePage}
          onDiagramChange={updatePageDiagram}
          onUpdateSections={updateSections}
          screens={screens}
          currentScreenId={currentScreenId}
          onSelectScreen={switchScreen}
          onAddScreen={addScreen}
          onAddOverlay={addOverlay}
          onRenameScreen={renameScreen}
          onMoveScreen={moveScreen}
          onMoveScreens={moveScreens}
          onUpdateLayoutGrid={updateLayoutGrid}
          onUpdatePresentation={updateScreenPresentation}
          onDuplicateScreen={duplicateScreen}
          onDeleteScreen={deleteScreen}
          onMoveScreenToPage={moveScreenToPage}
        />
      </StageProvider>
    </Editor>
    </ComponentLibraryProvider>
    </AppearanceContext.Provider>
  );
}

function WorkbenchShell({
  fileId,
  folderId,
  fileName,
  onRename,
  saveState,
  notice,
  pages,
  currentPageId,
  onSwitchPage,
  onSwitchToAdjacentPage,
  onAddPage,
  onRenamePage,
  onDuplicatePage,
  onDeletePage,
  onMovePage,
  onDiagramChange,
  onUpdateSections,
  screens,
  currentScreenId,
  onSelectScreen,
  onAddScreen,
  onAddOverlay,
  onRenameScreen,
  onMoveScreen,
  onMoveScreens,
  onUpdateLayoutGrid,
  onUpdatePresentation,
  onDuplicateScreen,
  onDeleteScreen,
  onMoveScreenToPage,
}: {
  fileId: string;
  folderId: string | null;
  fileName: string;
  onRename: (name: string) => void;
  saveState: SaveState;
  notice?: string;
  pages: Page[];
  currentPageId: string;
  onSwitchPage: (id: string) => void;
  onSwitchToAdjacentPage: (direction: 'next' | 'previous') => void;
  onAddPage: () => void;
  onRenamePage: (id: string, name: string) => void;
  onDuplicatePage: (id: string) => void;
  onDeletePage: (id: string) => void;
  onMovePage: (id: string, direction: 'up' | 'down') => void;
  onUpdateSections: (pageId: string, change: SectionChange) => void;
  onDiagramChange: (pageId: string, diagram: DiagramData) => void;
  // The whole file's screens, every page's own - WorkbenchShell itself
  // filters to the current page's screens (pageScreens, below) for Canvas,
  // the Frames chip and the viewport controller's frames; the full array is
  // still what onMoveScreenToPage needs to reach a screen that is about to
  // leave the current page altogether.
  screens: Screen[];
  currentScreenId: string;
  onSelectScreen: (id: string) => void;
  onAddScreen: () => void;
  onAddOverlay: (type: OverlayPresentationType) => void;
  onRenameScreen: (id: string, name: string) => void;
  onMoveScreen: (id: string, position: { x: number; y: number }) => void;
  onMoveScreens: (updates: { id: string; x: number; y: number }[]) => void;
  onUpdateLayoutGrid: (id: string, patch: Partial<LayoutGrid>) => void;
  onUpdatePresentation: (id: string, presentation: OverlayPresentation, name?: string) => void;
  onDuplicateScreen: (id: string) => void;
  onDeleteScreen: (id: string) => void;
  onMoveScreenToPage: (id: string, pageId: string) => void;
}) {
  useZoneRedirect();
  const [uiHidden, setUiHidden] = useState(false);
  // The canvas-level selection of frames (spec docs/superpowers/specs/2026-
  // 09-13-grid-snapping-alignment-design.md section 3), independent of
  // Craft's own node selection inside a frame - shared with Canvas (marquee/
  // Shift+click/outline/multi-drag) and, once it exists, the Design panel's
  // alignment row (inspector.tsx), the same way diagram selection already
  // lives here for both Canvas and Inspector to read.
  const [selectedFrameIds, setSelectedFrameIds] = useState<ReadonlySet<string>>(new Set());
  function toggleFrameSelection(id: string): void {
    setSelectedFrameIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  // Review fix wave item 8: an auto-height frame's real height is not known
  // until it renders and measures its own content - snapping, the frame
  // alignment row, distribute and the marquee's hit test all used to fall
  // back to the same static ARTBOARD_MIN_HEIGHT estimate every such frame
  // starts at, which is wrong the moment its actual content is taller or
  // shorter. Fed by Stage/FramePreview (through Canvas's onMeasuredHeight,
  // itself CanvasFrame's own ResizeObserver-backed content measurement) and
  // read by both Canvas (snapping, marquee) and Inspector (alignment,
  // distribute) - lives here, not in Canvas, since both are siblings that
  // need the same map. Keyed by screen id, which stays unique across pages,
  // so a stale entry for a screen on a page you have since left is
  // harmless: nothing queries it while that page is not showing.
  const [measuredHeights, setMeasuredHeights] = useState<ReadonlyMap<string, number>>(new Map());
  const handleMeasuredHeight = useCallback((id: string, height: number) => {
    setMeasuredHeights((current) => {
      if (current.get(id) === height) return current;
      const next = new Map(current);
      next.set(id, height);
      return next;
    });
  }, []);
  // Per browser, not per file - same lazy-useState-plus-effect pattern as
  // chatOpen just below (and see lib/chat/store.ts for the precedent this
  // mirrors: lib/workbench/panel-store.ts's loadPanelMode/savePanelMode).
  const [panelMode, setPanelMode] = useState<PanelMode>(() => loadPanelMode(window.localStorage));
  useEffect(() => {
    savePanelMode(window.localStorage, panelMode);
  }, [panelMode]);
  // The right panel's minimized state, same per-browser persistence as
  // panelMode above.
  const [panelCollapsed, setPanelCollapsed] = useState(() => loadPanelCollapsed(window.localStorage));
  useEffect(() => {
    savePanelCollapsed(window.localStorage, panelCollapsed);
  }, [panelCollapsed]);
  // Per browser, not per file (unlike the chat log itself) - see
  // lib/chat/store.ts. Lazy useState so this reads localStorage exactly
  // once, the same pattern as currentScreenId's hash-derived initial value
  // above.
  const [chatOpen, setChatOpen] = useState(() => loadChatPanelOpen(window.localStorage));
  useEffect(() => {
    saveChatPanelOpen(window.localStorage, chatOpen);
  }, [chatOpen]);
  // The canvas's pixel grid (spec docs/superpowers/specs/2026-09-13-grid-
  // snapping-alignment-design.md section 5, Cmd+') - per browser, same
  // lazy-useState-plus-effect pattern as chatOpen above.
  const [pixelGridVisible, setPixelGridVisible] = useState(() => loadPixelGridVisible(window.localStorage));
  useEffect(() => {
    savePixelGridVisible(window.localStorage, pixelGridVisible);
  }, [pixelGridVisible]);
  const { actions, query, sectionMove } = useEditor(state=>({sectionMove:state.nodes.ROOT?.data.custom?.canvasSections}));
  const { setWidth, setSize, setDevice } = useStage();
  const [newOpen, setNewOpen] = useState(false);
  // "?", the top bar's ⌘ button and its overflow menu item all open the
  // shortcuts dialog (spec section 3) through this one piece of state.
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // The canvas viewport (spec docs/superpowers/specs/2026-09-12-infinite-
  // canvas-design.md): owned here, one level above Canvas itself, so the
  // same instance can be shared - through CanvasViewportProvider, below -
  // with the top bar's zoom menu and the keyboard shortcuts wired just
  // after this, neither of which is a descendant of Canvas.
  // Only the current page's own screens - Canvas, the Frames chip and the
  // viewport controller's frames all scope to this, never the whole file's
  // `screens` (the Frames chip lists only the current page's frames; spec:
  // "the canvas... frames of the current page only").
  const pageScreens = screens.filter((screen) => screen.pageId === currentPageId);

  // The current page's diagram (spec docs/superpowers/specs/2026-09-13-
  // diagrams-design.md): a fresh reducer instance for the whole file's
  // session (not remounted per page, matching every other piece of state
  // in this component), re-hydrated from `pages` whenever `currentPageId`
  // changes - "adjusted during render" the same way workbench.tsx's own
  // lastSelectedNodeId pattern already handles "a prop I do not own just
  // changed", rather than an effect, so the newly-focused page's diagram
  // paints on the very first frame it is visible.
  // sanitizeDiagram (defined above, in Workbench's own module scope) drops
  // any edge left dangling by data saved before deleteScreen/
  // moveScreenToPage pruned this themselves - defensive loading, so this
  // component never re-hydrates state it would only have to clean up again
  // on the next real edit (see that function's own doc comment).
  const pageScreenIds = new Set(pageScreens.map((screen) => screen.id));
  const [diagram, dispatchDiagram] = useReducer(diagramReducer, undefined, () =>
    createInitialDiagramState(
      sanitizeDiagram(pages.find((page) => page.id === currentPageId)?.diagram ?? { nodes: [], edges: [] }, pageScreenIds),
    ),
  );
  const [lastSectionMove, setLastSectionMove] = useState(sectionMove?.revision);
  if (sectionMove?.revision !== lastSectionMove) {
    setLastSectionMove(sectionMove?.revision);
    if (sectionMove?.pageId === currentPageId && sectionMove.diagram) dispatchDiagram({type:'load',data:sectionMove.diagram});
    else if (sectionMove?.pageId === currentPageId && sectionMove.diagramPositions?.length) dispatchDiagram({type:'sectionPositions',positions:sectionMove.diagramPositions});
  }
  const [lastDiagramPageId, setLastDiagramPageId] = useState(currentPageId);
  if (currentPageId !== lastDiagramPageId) {
    setLastDiagramPageId(currentPageId);
    dispatchDiagram({
      type: 'load',
      data: sanitizeDiagram(pages.find((page) => page.id === currentPageId)?.diagram ?? { nodes: [], edges: [] }, pageScreenIds),
    });
    // Review fix wave item 2 (blocker): a frame selection is a canvas-level
    // concept scoped to whatever page is showing - left alone across a page
    // switch, the Align row kept showing (and writing) another page's
    // frames the user could no longer see, and a multi-drag would fan its
    // delta out to those invisible frames too (see pageFrameSelection and
    // canvas.tsx's own skip-if-unknown fix below).
    setSelectedFrameIds(new Set());
  }

  // The page-scoped view of selectedFrameIds every consumer below actually
  // gets (Canvas, Inspector, frameSelectionActive) - defensive, on top of
  // the clear above, so a selection can never act on a frame that is not
  // part of the page currently showing even if some future path leaves a
  // stale id behind.
  const pageFrameSelection = new Set([...selectedFrameIds].filter((id) => pageScreenIds.has(id)));

  // Persists a real edit (onDiagramChange, ultimately queuePatch) without
  // ever saving the load a page switch/first mount itself just performed -
  // the same "first firing is a baseline, not an edit" split
  // baselinedScreenIdsRef gives onNodesChange, below, for exactly the same
  // reason: hydrating from already-saved data is not something to save
  // again. Effect (not adjusted-during-render, unlike the hydration above):
  // notifying the PARENT of a change is a side effect, not a value this
  // component itself renders with.
  const diagramBaselineRef = useRef<{ pageId: string; nodes: typeof diagram.nodes; edges: typeof diagram.edges } | null>(
    null,
  );
  useEffect(() => {
    const baseline = diagramBaselineRef.current;
    if (!baseline || baseline.pageId !== currentPageId) {
      diagramBaselineRef.current = { pageId: currentPageId, nodes: diagram.nodes, edges: diagram.edges };
      return;
    }
    if (baseline.nodes === diagram.nodes && baseline.edges === diagram.edges) return;
    diagramBaselineRef.current = { pageId: currentPageId, nodes: diagram.nodes, edges: diagram.edges };
    onDiagramChange(currentPageId, { nodes: diagram.nodes, edges: diagram.edges });
  }, [currentPageId, diagram.nodes, diagram.edges, onDiagramChange]);

  const diagramSelectionActive = diagram.selection.length > 0;

  // The Design tab's fields (inspector.tsx) show whichever diagram element
  // was selected most recently - the first entry in `selection` (a plain
  // array, not a Set, so insertion order is exactly that).
  function selectedDiagramFields(): DiagramFieldsSelection | null {
    const [first] = diagram.selection;
    if (!first) return null;
    if (first.type === 'node') {
      const node = diagram.nodes.find((candidate) => candidate.id === first.id);
      return node ? { type: 'node', node } : null;
    }
    const edge = diagram.edges.find((candidate) => candidate.id === first.id);
    return edge ? { type: 'edge', edge } : null;
  }

  // The Design panel's alignment row for a diagram selection of two or
  // more SHAPES (Matt, 2026-09-13: "i also need alignment options when
  // selecting multiple shapes") - edges are excluded, aligning a connector
  // has no meaning. Takes priority over selectedDiagramFields() above in
  // inspector.tsx's own render order, since that would otherwise still
  // point at only the first of the several selected shapes.
  const selectedDiagramNodeIds = diagram.selection.filter((item) => item.type === 'node').map((item) => item.id);
  const diagramAlignmentContext: DiagramAlignmentContext | null =
    selectedDiagramNodeIds.length >= 2
      ? {
          type: 'diagram',
          count: selectedDiagramNodeIds.length,
          onAlign: (mode: AlignMode) => dispatchDiagram({ type: 'align', ids: selectedDiagramNodeIds, mode }),
          onDistribute: (axis: DistributeAxis) => dispatchDiagram({ type: 'distribute', ids: selectedDiagramNodeIds, axis }),
          onExport: (format: 'png' | 'svg') => {
            const currentPage = pages.find((p) => p.id === currentPageId);
            if (!currentPage) return;
            exportDiagram({
              format,
              nodes: diagram.nodes,
              edges: diagram.edges,
              selection: diagram.selection,
              frames: pageScreens.map((screen) => ({
                id: screen.id,
                name: screen.name,
                x: screen.x ?? 0,
                y: screen.y ?? 0,
                width: screen.stageWidth ?? 0,
                height: screen.stageHeight ?? 0,
              })),
              fileName,
              pageName: currentPage.name,
            });
          },
        }
      : null;

  // Matt's multi-selection follow-up: the actual DiagramNode objects behind
  // diagramAlignmentContext's own `count`, for inspector.tsx's DiagramFields
  // (Color/Text size/Font/Text color, Mixed-aware) to render beneath the
  // alignment row - same >= 2 guard, so the two are always both null or
  // both populated together.
  const diagramMultiSelection: DiagramNode[] | null =
    selectedDiagramNodeIds.length >= 2
      ? diagram.nodes.filter((n) => selectedDiagramNodeIds.includes(n.id))
      : null;

  // The diagram tool/palette (diagram-palette.tsx, diagram-layer.tsx):
  // `diagramPaletteOpen` is the floating bar's own visibility, toggled by
  // Shift+D or the top bar's Diagram tool button and closed by its own
  // close button; `diagramTool` is whichever shape or the connector is
  // currently armed within it. Completing a placement or a connection
  // re-arms the plain pointer but keeps the bar open (Matt: "once i've
  // enabled that, the bar of shape options should be visible immediately
  // and closeable"), so the next shape is one click away.
  const [diagramPaletteOpen, setDiagramPaletteOpen] = useState(false);
  const [diagramTool, setDiagramTool] = useState<DiagramTool>(POINTER_TOOL);

  function closeDiagramTool(): void {
    setDiagramPaletteOpen(false);
    setDiagramTool(POINTER_TOOL);
  }

  function toggleDiagramPalette(): void {
    if (diagramPaletteOpen) closeDiagramTool();
    else setDiagramPaletteOpen(true);
  }

  // T (spec docs/superpowers/specs/2026-09-13-diagrams-design.md section 11):
  // opens the diagram palette if closed and arms the Text shape, so the next
  // click places a text block and opens its editor; Escape returns to the
  // pointer.
  function onTextTool(): void {
    setDiagramPaletteOpen(true);
    setDiagramTool({ kind: 'shape', shape: 'text' });
  }

  // A finished placement or connection only disarms the shape; the bar stays.
  function onDiagramToolConsumed(): void {
    notes.cancel();
    setDiagramPaletteOpen(true);
    setDiagramTool(POINTER_TOOL);
  }

  // Both palettes insert into the visible workspace; keyboard drawing tools
  // keep their existing click/drag-to-size behavior.
  function selectDiagramToolFromTray(tool: DiagramTool): void {
    setDiagramPaletteOpen(true);
    notes.cancel();
    sectionController.setDrawing(false);
    sectionController.select(null);
    actions.selectNode();
    setSelectedFrameIds(new Set());
    if (tool.kind !== 'shape') { setDiagramTool(tool); return; }
    // Read the mounted canvas now: its cached size can be stale after returning
    // from the component editor, where the main canvas is temporarily unmounted.
    const bounds = rootRef.current?.getBoundingClientRect();
    const width = bounds?.width || viewportSize.width || window.innerWidth;
    const height = bounds?.height || viewportSize.height || window.innerHeight;
    const left = uiHidden ? 16 : leftCollapsed ? 64 : leftWidth + 24;
    const right = Math.max(left + 1, width - (uiHidden ? 16 : panelCollapsed ? 64 : 344));
    const top = uiHidden ? 16 : 88;
    const bottom = Math.max(top + 1, height - 72);
    const available = { x: left, y: top, width: right - left, height: bottom - top };
    const visible = {
      x: (available.x - viewport.x) / viewport.zoom, y: (available.y - viewport.y) / viewport.zoom,
      width: available.width / viewport.zoom, height: available.height / viewport.zoom,
    };
    const shape = createDiagramNode(tool.shape, { x: 0, y: 0 });
    const placement = placeDiagramShape(shape, visible, [
      ...pageScreens.map(screen => frameRect(screen, measuredHeights)), ...diagram.nodes,
    ], 24 / viewport.zoom);
    const node = { ...shape, ...placement.position };
    if (placement.reveal) {
      const zoom = Math.max(0.1, Math.min(viewport.zoom, available.width / (node.width + 32), available.height / (node.height + 32)));
      setViewport({
        zoom,
        x: available.x + available.width / 2 - (node.x + node.width / 2) * zoom,
        y: available.y + available.height / 2 - (node.y + node.height / 2) * zoom,
      });
    } else {
      // Stop a pending frame-focus animation from moving the new item out of view.
      setViewport(viewport);
    }
    dispatchDiagram({ type: 'add', node });
    setDiagramTool(POINTER_TOOL);
  }

  // Shift+1/the zoom menu's "Zoom to fit" (spec: "Zoom to fit includes
  // diagram bounds") - folds the current page's diagram nodes' bounding box
  // in alongside every frame's own, when the diagram has any.
  // measuredHeights (review re-review R6): a tall auto-height frame's
  // preview now renders at its real, measured height (item 8), so fitting
  // "every frame" without the same map could crop exactly the frame this
  // is meant to fit.
  function zoomToFitTargets(): FrameRect[] {
    const targets: FrameRect[] = [...pageScreens.map((screen) => frameRect(screen, measuredHeights)), ...(pages.find(page => page.id === currentPageId)?.sections ?? [])];
    const diagramBox = diagramBounds(diagram.nodes);
    if (diagramBox) targets.push(diagramBox);
    return targets;
  }

  const { viewport, setViewport, viewportSize, rootRef, animateTo } = useCanvasViewportController({
    fileId,
    pageId: currentPageId,
    frames: pageScreens.map((screen) => frameRect(screen, measuredHeights)),
  });

  // Frames chip zoom handler: when a frame is selected in the frames chip menu,
  // animate the viewport to fit that frame (spec: "200 ms ease-out, cancelled by
  // any pan/zoom input"). The frames chip menu handles the focus switch via
  // onSelectScreen; this handler only animates the zoom.
  function handleZoomToFrame(id: string): void {
    const target = pageScreens.find((screen) => screen.id === id);
    if (target) animateTo(zoomToRect(frameRect(target, measuredHeights), viewportSize, SELECTION_ZOOM_PADDING));
  }

  // Shift+2: zooms to the selected layer's own bounds when something is
  // selected, else the focused frame's bounds - the DOM node's
  // getBoundingClientRect() is already in canvas-space-compatible unscaled
  // px (it lives inside the focused frame's own iframe, whose internal
  // layout is untouched by the canvas's ancestor pan/zoom transform - see
  // canvas.tsx's own comments on this), so only the frame's own x/y needs
  // adding to place it in canvas space.
  function zoomToSelectionOrFocusedFrame(): void {
    const section = sectionController.sections.find(s => s.id === sectionController.selected);
    if (section) { sectionController.zoomTo(section); return; }
    const focused = pageScreens.find((screen) => screen.id === currentScreenId);
    if (!focused) return;
    const state = query.getState();
    const rects = [...state.events.selected].map(id => state.nodes[id]?.dom?.getBoundingClientRect()).filter((rect): rect is DOMRect => !!rect);
    let target: FrameRect;
    if (rects.length) {
      const left = Math.min(...rects.map(rect => rect.left));
      const top = Math.min(...rects.map(rect => rect.top));
      target = { x: (focused.x ?? 0) + left, y: (focused.y ?? 0) + top, width: Math.max(...rects.map(rect => rect.right)) - left, height: Math.max(...rects.map(rect => rect.bottom)) - top };
    } else {
      target = frameRect(focused, measuredHeights);
    }
    setViewport(zoomToRect(target, viewportSize, SELECTION_ZOOM_PADDING));
  }

  // Figma's own behaviour: picking a layer on the canvas while the
  // Components tab is showing jumps the panel to Design, the same way
  // Figma does when you select something while its Assets panel is open.
  // Adjusted during render (the same pattern FileNameField in topbar.tsx
  // uses for syncedFileName) rather than in an effect: comparing against a
  // mirrored `lastSelectedNodeId` is how this tells "the selection itself
  // just changed" apart from "this component merely re-rendered" (e.g.
  // because panelMode changed). That distinction is exactly why this
  // cannot be an effect keyed on panelMode too - choosing Prototype or
  // Elements is always explicit, and reacting to panelMode here would
  // immediately switch a just-chosen Components tab back to Design the
  // moment it renders, defeating the click.
  const { id: selectedNodeId } = useSelectedNode();
  const [lastSelectedNodeId, setLastSelectedNodeId] = useState(selectedNodeId);
  if (selectedNodeId !== lastSelectedNodeId) {
    setLastSelectedNodeId(selectedNodeId);
    if (selectedNodeId && panelMode === 'components') {
      setPanelMode('design');
    }
    // Review fix wave item 6: selecting a real layer must drop whatever
    // frame selection is active, the same way Figma clears a frame
    // selection the moment you select something else entirely (spec
    // section 3 already established the reverse - clicking empty canvas
    // clears the frame selection). Left alone, the Align row and
    // arrow-key nudge kept acting on frames the user's own click had
    // already moved on from.
    if (selectedNodeId) setSelectedFrameIds(new Set());
  }

  // The diagram-selection counterpart to the Craft layer check just above -
  // diagram.selection is a wholly separate piece of state from Craft's own
  // node selection, so it needs its own "did this just change" tracker
  // (the same lastSelectedNodeId pattern) rather than piggybacking on one
  // that only ever mirrors Craft. Only the empty-to-non-empty transition
  // matters here (clicking empty canvas already clears the diagram
  // selection on its own path; that must not also fight this one).
  const [lastDiagramSelectionActive, setLastDiagramSelectionActive] = useState(diagramSelectionActive);
  if (diagramSelectionActive !== lastDiagramSelectionActive) {
    setLastDiagramSelectionActive(diagramSelectionActive);
    if (diagramSelectionActive) {
      setSelectedFrameIds(new Set());
      // Same Figma precedent as the Craft layer check above, for the tabs
      // a diagram element can actually be picked from: browsing the tools
      // grid (Diagrams) or the old Components tab both count as "browsing",
      // so selecting a real shape or connector on the canvas jumps to
      // Design the same way clicking a Craft layer does. Prototype is left
      // alone for the same reason as the Craft check: wiring up
      // interactions means clicking diagram elements on purpose while
      // staying on that tab.
      if (panelMode === 'components' || panelMode === 'diagrams') setPanelMode('design');
    }
  }

  const notes = useCanvasNotes(fileId, currentScreenId, screens[0]?.id, currentPageId);
  const sectionController = useSectionsController({
    diagramNodes: diagram.nodes, diagramEdges: diagram.edges, pageId: currentPageId, sections: pages.find(page => page.id === currentPageId)?.sections ?? [], screens: pageScreens, heights: measuredHeights,
    selectedFrameIds: pageFrameSelection, focusedScreenId: currentScreenId,
    commit: change => onUpdateSections(currentPageId, change),
    onStart: () => { setPanelMode('design'); notes.cancel(); setDiagramTool(POINTER_TOOL); dispatchDiagram({ type: 'clearSelection' }); setSelectedFrameIds(new Set()); },
    focusFrame: id => { onSelectScreen(id); handleZoomToFrame(id); },
    zoomTo: section => {
      const left = leftCollapsed ? 64 : leftWidth + 24;
      const size = {width:Math.max(240,viewportSize.width-left-344),height:Math.max(200,viewportSize.height-100)};
      const next = zoomToRect(section,size,48);
      animateTo({...next,x:next.x+left,y:next.y+76});
    },
  });
  useEffect(() => { if (diagramTool.kind !== 'pointer' || notes.commentMode) sectionController.setDrawing(false); }, [diagramTool.kind, notes.commentMode]);
  const { commentMode } = notes;
  const [annotationLibraryMode, setAnnotationLibraryMode] = useState<'accessibility' | 'designer' | null>(null);
  const selectedAnnotationNode = diagram.nodes.find(node => node.annotation && diagram.selection.some(item => item.type === 'node' && item.id === node.id));
  const [lastSelectedAnnotationId, setLastSelectedAnnotationId] = useState<string | undefined>(undefined);
  if (selectedAnnotationNode?.id !== lastSelectedAnnotationId) {
    setLastSelectedAnnotationId(selectedAnnotationNode?.id);
    if (selectedAnnotationNode) {
      setAnnotationLibraryMode(selectedAnnotationNode.annotation?.library === 'designer' ? 'designer' : 'accessibility');
      setPanelMode('design'); setPanelCollapsed(false);
    }
  }
  function startNoteOrLibrary(kind: 'comment' | 'annotation' | 'accessibility') {
    notes.setVisible(true); sectionController.setDrawing(false); sectionController.select(null); setChatOpen(false);
    if (kind === 'accessibility' || kind === 'annotation') {
      notes.cancel(); notes.setNotesOpen(false); setAnnotationLibraryMode(kind === 'accessibility' ? 'accessibility' : 'designer');
      setDiagramTool(POINTER_TOOL); setPanelMode('components'); setPanelCollapsed(false);
    } else { setAnnotationLibraryMode(null); notes.start(kind); setLeftCollapsed(false); }
  }
  function insertAnnotation(category: Category, format: Annotation['format'], template?:DesignerKind) {
    notes.cancel(); actions.selectNode(); setSelectedFrameIds(new Set());
    const rect = rootRef.current?.getBoundingClientRect();
    const left = leftCollapsed ? 64 : leftWidth + 24;
    const right = (rect?.width || viewportSize.width) - (panelCollapsed ? 64 : 344);
    const center = {x:((left + right)/2-viewport.x)/viewport.zoom,y:(((rect?.height || viewportSize.height)+76)/2-viewport.y)/viewport.zoom};
    const number = Math.min(9999, Math.max(0,...diagram.nodes.map(node=>node.annotation?.number??0))+1);
    dispatchDiagram({type:'add',node:template?createDesignerAnnotation(template,format,center,number):createAnnotation(category,format,center,number)});
    setPanelMode('design');
  }
  const commentsProps = { ...notes.commentsProps, portalContainer: rootRef.current?.closest<HTMLElement>('[data-testid=workbench-shell]') };
  const [noteToFocus, setNoteToFocus] = useState<CommentThread | null>(null);
  useEffect(() => {
    if (!noteToFocus) return;
    const target = screens.find(screen => screen.id === (noteToFocus.screenId ?? screens[0]?.id));
    const page = noteToFocus.canvas ? noteToFocus.pageId : target?.pageId;
    if (page && page !== currentPageId) { onSwitchPage(page); return; }
    if (noteToFocus.canvas) {
      setViewport(current => ({ ...current, x: viewportSize.width / 2 - noteToFocus.x * current.zoom, y: viewportSize.height / 2 - noteToFocus.y * current.zoom }));
    } else if (target) {
      if (target.id !== currentScreenId) { onSelectScreen(target.id); return; }
      handleZoomToFrame(target.id);
    }
    setNoteToFocus(null);
  // Navigation callbacks are refreshed on every editor render; only navigation state should retrigger this request.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteToFocus, currentPageId, currentScreenId]);
  const cancelPendingAndExitCommentMode = () => { notes.cancel(); setAnnotationLibraryMode(null); };
  const toggleCommentMode = () => { sectionController.setDrawing(false); sectionController.select(null); notes.toggle(); setChatOpen(false); setLeftCollapsed(false); };
  function openNote(thread: CommentThread) {
    notes.open(thread); setChatOpen(false); setLeftCollapsed(false);
    setNoteToFocus(thread);
  }

  // D/P/E (spec docs/superpowers/specs/2026-09-13-shortcuts-and-elements-
  // design.md section 2): always expands the panel, even if it was already
  // expanded on a different tab - setPanelCollapsed(false) is a no-op
  // re-render when it is already false, so this needs no separate branch for
  // "already expanded".
  function selectPanelTab(mode: PanelMode): void {
    setPanelMode(mode);
    setPanelCollapsed(false);
  }

  // Cmd+R (spec docs/superpowers/specs/2026-09-13-shortcuts-and-elements-
  // design.md section 2): the same URL, in the same new tab, as the top
  // bar's own Present link (see presentHref in topbar.tsx). Carries `page`
  // alongside `screen` (spec docs/superpowers/specs/2026-09-12-pages-
  // design.md section 2: "Present carries `?page=`") so Play starts on the
  // right page even for the rare case of a screen id that (through some
  // future bug or hand-edited link) does not actually belong to it.
  function presentFocusedScreen(): void {
    window.open(presentHrefFor(fileId, currentPageId, screens, currentScreenId), '_blank', 'noopener,noreferrer');
  }

  // The viewport centre (screen space, relative to the canvas's own origin -
  // see canvas.tsx) that Cmd+=/Cmd+-/Cmd+0 zoom around: there is no pointer
  // position for a keyboard shortcut to anchor to the way a wheel gesture
  // has one.
  const diagramHistoryActive = diagramSelectionActive || ((diagramPaletteOpen || annotationLibraryMode !== null) && !sectionController.selected && !selectedNodeId && pageFrameSelection.size === 0);
  const viewportCenter = { x: viewportSize.width / 2, y: viewportSize.height / 2 };

  useWorkbenchKeyboard({
    onToggleUi: () => setUiHidden((hidden) => !hidden),
    onToggleChat: () => setChatOpen((open) => !open),
    onTogglePanelCollapsed: () => setPanelCollapsed((collapsed) => !collapsed),
    onToggleCommentMode: toggleCommentMode,
    commentMode: commentMode || !!annotationLibraryMode,
    onExitCommentMode: cancelPendingAndExitCommentMode,
    onDiagramTool: toggleDiagramPalette,
    diagramHistoryActive,
    diagramToolActive: diagramPaletteOpen || diagramTool.kind !== 'pointer',
    onExitDiagramTool: closeDiagramTool,
    onTextTool,
    diagramSelectionActive,
    onDeselectDiagram: () => dispatchDiagram({ type: 'clearSelection' }),
    frameSelectionActive: pageFrameSelection.size > 0,
    onClearFrameSelection: () => setSelectedFrameIds(new Set()),
    onDiagramDelete: () => dispatchDiagram({ type: 'delete', ids: diagram.selection.map((item) => item.id) }),
    onDiagramDuplicate: () => {
      // Also copies a connector whose both endpoints are themselves being
      // duplicated (lib/diagram/store.ts's own re-validated edgePairs) - so
      // Cmd+D behaves exactly like the diagram layer's own "Duplicate ⌘D"
      // context-menu item and Option-drag gesture, all three of which go
      // through the very same reducer action. duplicatePairs is the same
      // helper the layer itself uses, so the two never drift apart.
      const nodeIds = diagram.selection.filter((item) => item.type === 'node').map((item) => item.id);
      const { pairs, edgePairs, groupIdMap } = duplicatePairs(diagram, nodeIds, () => nanoid(10));
      dispatchDiagram({ type: 'duplicate', pairs, edgePairs, groupIdMap });
    },
    onDiagramSelectAll: () => dispatchDiagram({ type: 'selectAll' }),
    // Cmd+G (spec docs/superpowers/specs/2026-09-13-diagrams-design.md
    // section 10): groups every currently-selected shape under a fresh
    // groupId - the reducer's own "two or more real nodes" guard (store.ts)
    // makes this a safe no-op when the selection is too small or holds no
    // shapes at all, so this handler does not need to pre-check that
    // itself, the same "reducer trusts and applies, the layer just calls
    // it" division diagram-layer.tsx's own duplicateSelection already has.
    onDiagramGroup: () => {
      const nodeIds = diagram.selection.filter((item) => item.type === 'node').map((item) => item.id);
      dispatchDiagram({ type: 'group', ids: nodeIds, groupId: nanoid(10) });
    },
    // Cmd+Shift+G: ungroups the group the current selection belongs to.
    // Review finding A: the selection is not always either a whole group
    // or nothing grouped at all - the documented double-click-to-enter
    // gesture (and a bare right-click on an unselected member, before that
    // was also fixed) deliberately selects just ONE member of a larger
    // group - so this uses the same store.ts selectedGroupId every other
    // "is this a group?" check now shares, requiring the selection to be
    // EXACTLY one group's full membership before dissolving it; a no-op
    // otherwise (e.g. while "inside" a group with just one member picked).
    onDiagramUngroup: () => {
      const groupId = selectedGroupId(diagram.nodes, diagram.selection);
      if (!groupId) return;
      dispatchDiagram({ type: 'ungroup', groupId });
    },
    onDiagramNudge: (direction, big) => {
      const ids = diagram.selection.filter((item) => item.type === 'node').map((item) => item.id);
      if (ids.length === 0) return;
      // Matt: a plain arrow key nudges by exactly 1px; Shift+arrow by 8px.
      // Mouse drags still land on the 8px grid (the layer snaps the drag's
      // own delta before dispatching move), so the grid only ever governs
      // drags, not keyboard nudges.
      const [dx, dy] = nudgeDelta(direction, big);
      dispatchDiagram({ type: 'move', ids, dx, dy });
    },
    // The frame-selection counterpart to onDiagramNudge above, firing
    // instead of it once no diagram element is selected (keyboard.tsx's own
    // dispatch decides which) - moves every selected frame by the same
    // delta and saves them together, the same "one patch" treatment a
    // dragged multi-selection already gets (canvas.tsx's onMoveScreens).
    onFrameNudge: (direction, big) => {
      if (pageFrameSelection.size === 0) return;
      const [dx, dy] = nudgeDelta(direction, big);
      const updates = pageScreens
        .filter((screen) => pageFrameSelection.has(screen.id))
        .map((screen) => ({ id: screen.id, x: (screen.x ?? 0) + dx, y: (screen.y ?? 0) + dy }));
      if (updates.length > 0) onMoveScreens(updates);
    },
    onDiagramUndo: () => dispatchDiagram({ type: 'undo' }),
    onDiagramRedo: () => dispatchDiagram({ type: 'redo' }),
    onZoomIn: () => setViewport((current) => stepZoom(current, viewportCenter, 'in')),
    onZoomOut: () => setViewport((current) => stepZoom(current, viewportCenter, 'out')),
    onZoomReset: () => setViewport((current) => zoomTo(current, viewportCenter, 1)),
    onZoomToFit: () => setViewport(fitAll(zoomToFitTargets(), viewportSize)),
    onZoomToSelection: zoomToSelectionOrFocusedFrame,
    onSelectPanelTab: selectPanelTab,
    // V (spec section 2, "Pointer: leaves the comment or diagram tool").
    onSectionTool: sectionController.start,
    onPointerTool: () => {
      sectionController.setDrawing(false); sectionController.select(null);
      cancelPendingAndExitCommentMode();
      closeDiagramTool();
    },
    onPresent: presentFocusedScreen,
    onAddScreen,
    // Shift+O always creates a dialog overlay (lib/shortcuts.ts's own
    // label: "New overlay (dialog)") - Sheet/Toast are menu-only, through
    // the Frames chip's own three-item submenu.
    onAddOverlay: () => onAddOverlay('dialog'),
    onPageNext: () => onSwitchToAdjacentPage('next'),
    onPagePrev: () => onSwitchToAdjacentPage('previous'),
    onOpenShortcuts: () => setShortcutsOpen(true),
    // Shift+G toggles the FOCUSED screen's own layout grid (spec section 5) -
    // resolveLayoutGrid supplies the 12/24/32/false default for a screen
    // that has never been customized, the same fallback the overlay itself
    // renders with.
    onToggleLayoutGrid: () => {
      const focused = screens.find((screen) => screen.id === currentScreenId);
      onUpdateLayoutGrid(currentScreenId, { visible: !resolveLayoutGrid(focused?.layoutGrid).visible });
    },
    onTogglePixelGrid: () => setPixelGridVisible((visible) => !visible),
  });

  // Make-room drag placeholder (docs/superpowers/specs/2026-09-12-drop-
  // placeholder-design.md): a bare hook, mounted here alongside
  // useWorkbenchKeyboard above and LayerStackMenu below - the same
  // "editor-wide drag/keyboard behaviour, not any one screen's" level
  // useLayerStack's own reach into the focused frame's document already
  // relies on. It renders nothing of its own; every DOM change it makes is
  // imperative (insertBefore/remove on the real artboard), never a Craft
  // node.
  useDropPlaceholder();

  // StageProvider is intentionally not remounted per screen (see the comment
  // on <StageProvider> in Workbench), so without this its width/height/
  // device/breakpoint context would keep reflecting whichever screen was
  // active before - stale for every useStage() consumer here (the topbar
  // readout and device chip, the inspector's breakpoint badge, the artboard
  // itself). Re-initialises only on an actual screen change, not on every
  // resize (handleSizeChange's/handleDeviceChange's own no-op guards also
  // keep this from queuing a spurious save). Three cases, the same ones a
  // user's own action reaches this context through: setDevice when the
  // screen has one (stageHeight is always set alongside deviceName - see
  // addScreen, duplicateScreen and validateScreens, which all keep the two
  // together; the stageHeight check here is defensive, not an expected
  // case); setSize when it has a manual fixed height with no device (the
  // height or corner handle, without ever touching a device preset) -
  // setWidth alone would silently drop that height back to auto, since
  // setWidth always clears it; setWidth otherwise. A layout effect so the
  // artboard never paints the new screen at the old width or height.
  useLayoutEffect(() => {
    const screen = screens.find((candidate) => candidate.id === currentScreenId);
    if (!screen) return;
    if (screen.deviceName && screen.stageHeight != null) {
      setDevice({ name: screen.deviceName, width: screen.stageWidth, height: screen.stageHeight });
    } else if (screen.stageHeight != null) {
      setSize({ width: screen.stageWidth, height: screen.stageHeight });
    } else {
      setWidth(screen.stageWidth);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScreenId, screens.find(screen => screen.id === currentScreenId)?.stageWidth, screens.find(screen => screen.id === currentScreenId)?.stageHeight, screens.find(screen => screen.id === currentScreenId)?.deviceName]);

  // Chat temporarily occupies the Layers panel footprint.
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [leftWidth, setLeftWidth] = useLeftPanelWidth();
  const chatPositionClass = 'left-3 w-64';

  return (
    <SectionsContext.Provider value={sectionController}><LeftPanelContext.Provider value={{ chatOpen, setChatOpen, notesOpen: notes.notesOpen, setNotesOpen: open => { notes.setNotesOpen(open); if (!open) { notes.cancel(); notes.commentsProps.onCloseThread(); } }, collapsed: leftCollapsed, setCollapsed: setLeftCollapsed }}><ChatTransportProvider transport={placeholderTransport}>
      <PrototypeProvider value={{ panelMode, screens }}>
        <CanvasViewportProvider viewport={viewport} setViewport={setViewport} viewportSize={viewportSize} animateTo={animateTo}>
          {/*
            No longer a grid (spec section 4): the canvas fills the window
            and every other piece of chrome floats above it, positioned by
            its own absolute classes - this shell just needs to be the
            positioning context they float relative to.
          */}
          <div data-testid="workbench-shell" className="relative h-screen w-screen overflow-hidden bg-background">
            {!uiHidden && (
              <Topbar
                key="topbar"
                fileName={fileName}
                onRename={onRename}
                saveState={saveState}
                notice={notice}
                onNew={() => setNewOpen(true)}
                onAddScreen={onAddScreen}
                onAddOverlay={onAddOverlay}
                fileId={fileId}
                folderId={folderId}
                pages={pages}
                currentPageId={currentPageId}
                screens={screens}
                onSwitchPage={onSwitchPage}
                onAddPage={onAddPage}
                onRenamePage={onRenamePage}
                onDuplicatePage={onDuplicatePage}
                onDeletePage={onDeletePage}
                onMovePage={onMovePage}
                currentScreenId={currentScreenId}
                onSwitchScreen={onSelectScreen}
                onRenameScreen={onRenameScreen}
                onDuplicateScreen={onDuplicateScreen}
                onDeleteScreen={onDeleteScreen}
                onMoveScreenToPage={onMoveScreenToPage}
                onZoomToFrame={handleZoomToFrame}
                chatOpen={chatOpen}
                onToggleChat={() => setChatOpen((open) => !open)}
                commentMode={commentMode || !!annotationLibraryMode}
                onToggleCommentMode={() => { if (annotationLibraryMode) setAnnotationLibraryMode(null); else toggleCommentMode(); }}
                commentCount={notes.threads.filter(t => !t.resolvedAt).length}
                noteKind={annotationLibraryMode === 'designer' ? 'annotation' : annotationLibraryMode === 'accessibility' ? 'accessibility' : notes.kind}
                onStartNote={startNoteOrLibrary}
                notesVisible={notes.visible}
                onToggleNotesVisibility={() => {
                  notes.toggleVisibility();
                  if (notes.visible) {
                    setAnnotationLibraryMode(null);
                    dispatchDiagram({ type: 'select', selection: diagram.selection.filter(item => item.type !== 'node' || !diagram.nodes.find(node => node.id === item.id)?.annotation) });
                  }
                }}
                onBrowseNotes={() => { notes.setNotesOpen(true); setChatOpen(false); setLeftCollapsed(false); }}
                onZoomIn={() => setViewport((current) => stepZoom(current, viewportCenter, 'in'))}
                onZoomOut={() => setViewport((current) => stepZoom(current, viewportCenter, 'out'))}
                onZoomToFit={() => setViewport(fitAll(zoomToFitTargets(), viewportSize))}
                onZoomToSelection={zoomToSelectionOrFocusedFrame}
                historyOverride={diagramHistoryActive ? {
                  canUndo: diagram.history.past.length > 0, canRedo: diagram.history.future.length > 0,
                  undo: () => dispatchDiagram({ type: 'undo' }), redo: () => dispatchDiagram({ type: 'redo' }),
                } : undefined}
                onOpenShortcuts={() => setShortcutsOpen(true)}
              />
            )}
            <StageErrorBoundary key="stage" fileId={fileId} screens={screens} currentScreenId={currentScreenId}>
              <Canvas
                screens={pageScreens}
                focusedScreenId={currentScreenId}
                onFocusScreen={onSelectScreen}
                onRenameScreen={onRenameScreen}
                onMoveScreen={onMoveScreen}
                onMoveScreens={onMoveScreens}
                comments={commentsProps}
                canvasComments={{ ...notes.canvasComments, portalContainer: commentsProps.portalContainer }}
                rootRef={rootRef}
                diagram={notes.visible ? diagram : {
                  ...diagram,
                  nodes: diagram.nodes.filter(node => !node.annotation),
                  edges: diagram.edges.filter(edge => !diagram.nodes.some(node => node.annotation && (edge.source.nodeId === node.id || edge.target.nodeId === node.id))),
                }}
                onDiagramAction={dispatchDiagram}
                diagramTool={diagramTool}
                onDiagramToolConsumed={onDiagramToolConsumed}
                onDeselectDiagram={() => dispatchDiagram({ type: 'clearSelection' })}
                onDiagramExport={(format) => {
                  const currentPage = pages.find((p) => p.id === currentPageId);
                  if (!currentPage) return;
                  exportDiagram({
                    format,
                    nodes: diagram.nodes,
                    edges: diagram.edges,
                    selection: diagram.selection,
                    frames: pageScreens.map((screen) => ({
                      id: screen.id,
                      name: screen.name,
                      x: screen.x ?? 0,
                      y: screen.y ?? 0,
                      width: screen.stageWidth ?? 0,
                      height: screen.stageHeight ?? 0,
                    })),
                    fileName,
                    pageName: currentPage.name,
                  });
                }}
                selectedFrameIds={pageFrameSelection}
                onToggleFrameSelection={toggleFrameSelection}
                onSetFrameSelection={(ids) => setSelectedFrameIds(new Set(ids))}
                onClearFrameSelection={() => setSelectedFrameIds(new Set())}
                diagramPaletteOpen={diagramPaletteOpen}
                pixelGridVisible={pixelGridVisible}
                measuredHeights={measuredHeights}
                onMeasuredHeight={handleMeasuredHeight}
              />
              {!uiHidden && (
                <DiagramPalette
                  open={diagramPaletteOpen}
                  tool={diagramTool}
                  onSelectTool={selectDiagramToolFromTray}
                  onClose={closeDiagramTool}
                />
              )}
              {/* Existing pages may still be empty after their frames are moved away. */}
              {pageScreens.length === 0 && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                  <div className={cn(CHIP, 'px-3')}>
                    <span className="text-[12.5px] text-muted-foreground">This page has no screens yet</span>
                    <button type="button" className="pointer-events-auto ml-2 rounded border border-line-soft px-2 py-1 text-xs hover:bg-muted" onClick={onAddScreen}>Add frame</button>
                  </div>
                </div>
              )}
              <LayerStackMenu />
              <FrameSelectionActions />
            </StageErrorBoundary>
            {!uiHidden && <aside aria-label="Layers panel" style={{ display: chatOpen || notes.notesOpen ? 'none' : undefined, '--left-width': `${leftWidth}px` } as React.CSSProperties} className={cn(PANEL, 'absolute top-[76px] left-3 bottom-3 z-10 group/left-panel w-[var(--left-width)] has-[[data-layers-collapsed=true]]:w-10')}><PanelResize width={leftWidth} onChange={setLeftWidth} /><LayersPanel showSections onAddElement={(type, parent, index) => { const item = trayItems.find(item => item.type === type); if (!item) return; const tree = query.parseReactElement(createTrayElement(item, query.getOptions().resolver)).toNodeTree(); actions.addNodeTree(tree, parent, index); actions.selectNode(tree.rootNodeId); }} onOpenShortcuts={() => setShortcutsOpen(true)} /></aside>}
            {!uiHidden && (
              <Inspector
                key="inspector"
                screens={screens}
                currentScreenId={currentScreenId}
                pages={pages}
                panelMode={panelMode}
                onPanelModeChange={setPanelMode}
                collapsed={panelCollapsed}
                onToggleCollapsed={() => setPanelCollapsed((collapsed) => !collapsed)}
                annotationLibrary={annotationLibraryMode ? <AnnotationLibrary key={annotationLibraryMode} library={annotationLibraryMode} onInsert={insertAnnotation} onClose={() => setAnnotationLibraryMode(null)} onNote={() => {setAnnotationLibraryMode(null);notes.start(annotationLibraryMode === 'designer' ? 'annotation' : 'accessibility');}} /> : undefined}
                diagramSelection={selectedDiagramFields()}
                onDiagramAction={dispatchDiagram}
                selectedFrameIds={pageFrameSelection}
                onAlignFrames={onMoveScreens}
                diagramAlignment={diagramAlignmentContext}
                diagramMultiSelection={diagramMultiSelection}
                onUpdateLayoutGrid={onUpdateLayoutGrid}
                onUpdatePresentation={onUpdatePresentation}
                measuredHeights={measuredHeights}
                diagramTool={diagramTool}
                onSelectDiagramTool={selectDiagramToolFromTray}
              />
            )}
            {!uiHidden && chatOpen && !notes.notesOpen && (
              <ChatPanel
                key="chat-panel"
                left={12}
                width={leftWidth}
                onWidthChange={setLeftWidth}
                fileId={fileId}
                onClose={() => setChatOpen(false)}
                className={chatPositionClass}
              />
            )}
            {!uiHidden && notes.notesOpen && <NotesPanel notes={notes} onStart={startNoteOrLibrary} width={leftWidth} onWidthChange={setLeftWidth} onOpen={openNote} targetLabel={thread => thread.canvas ? 'Canvas' : `${screens.find(s => s.id === (thread.screenId ?? screens[0]?.id))?.name ?? 'Frame removed'}${thread.anchorLabel ? ` / ${thread.anchorLabel}` : ''}`} />}
            <NewLayoutDialog
              key="new-dialog"
              open={newOpen}
              onOpenChange={setNewOpen}
              onConfirm={() => {
                actions.selectNode();
                actions.deserialize(emptyLayoutJson());
                actions.history.clear();
              }}
            />
            {/*
              Never inside an !uiHidden branch (spec docs/superpowers/specs/
              2026-09-12-shortcuts-overlay-design.md section 2: "Shown in the
              workbench only ..., including when the UI is hidden with
              Cmd+\") - the dialog must still open with every other panel
              gone.
            */}
            <ShortcutsOverlay key="shortcuts-overlay" open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
          </div>
        </CanvasViewportProvider>
      </PrototypeProvider>
    </ChatTransportProvider></LeftPanelContext.Provider></SectionsContext.Provider>
  );
}
