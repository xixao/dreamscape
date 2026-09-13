'use client';

import { Editor, useEditor } from '@craftjs/core';
import { nanoid } from 'nanoid';
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { defaultScreen } from '@/components/blocks/known-types';
import { emptyLayoutJson, resolver } from '@/components/blocks/registry';
import { fitAll, stepZoom, zoomTo, zoomToRect, type FrameRect } from '@/lib/canvas/viewport';
import { createCommentStore, getAuthorName, setAuthorName } from '@/lib/comments/store';
import { bounds as diagramBounds } from '@/lib/diagram/geometry';
import {
  createInitialDiagramState,
  diagramReducer,
  pruneEdgesForScreen,
  type DiagramAction,
  type DiagramData,
  cloneDiagram,
} from '@/lib/diagram/store';
import { layoutMissingPositions } from '@/lib/files/layout';
import { canonicalLayout, hasRootNode } from '@/lib/files/validate';
import type { FileRecord, Page, Screen } from '@/lib/files/repository';
import { loadChatPanelOpen, saveChatPanelOpen } from '@/lib/chat/store';
import { placeholderTransport } from '@/lib/chat/transport';
import { createFileSaver, type FilePatch, type SaveState } from '@/lib/persistence';
import { cn } from '@/lib/utils';
import {
  loadPanelCollapsed,
  loadPanelMode,
  savePanelCollapsed,
  savePanelMode,
} from '@/lib/workbench/panel-store';
import { Canvas, CanvasViewportProvider, frameRect, useCanvasViewportController } from './canvas';
import { ChatPanel } from './chat/chat-panel';
import { ChatTransportProvider } from './chat/chat-transport-context';
import { CHIP } from './chrome';
import type { PendingPin, StageCommentsProps } from './comments/comment-layer';
import { DiagramPalette } from './diagram/diagram-palette';
import { POINTER_TOOL, type DiagramTool } from './diagram/diagram-layer';
import type { DiagramFieldsSelection } from './diagram/diagram-fields';
import { useDropPlaceholder } from './drop-placeholder';
import type { AlignMode, DiagramAlignmentContext, DistributeAxis } from './inspector/alignment-fields';
import { Inspector, type PanelMode } from './inspector/inspector';
import { useWorkbenchKeyboard } from './keyboard';
import { LayerStackMenu } from './layer-stack-menu';
import { NewLayoutDialog } from './new-layout-dialog';
import { NodeIndicator } from './node-indicator';
import { PrototypeProvider } from './prototype-context';
import { ScreensStrip } from './screens-strip';
import { selectedIdFrom, useSelectedNode, useZoneRedirect } from './selection';
import { ShortcutsOverlay } from './shortcuts-overlay';
import { StageErrorBoundary } from './stage-error-boundary';
import { StageProvider, useStage } from './stage-context';
import { Topbar } from './topbar';

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
type DiagramAlignAction = { type: 'align'; ids: string[]; mode: AlignMode };
type DiagramDistributeAction = { type: 'distribute'; ids: string[]; axis: DistributeAxis };

function dispatchDiagramAlign(
  dispatch: (action: DiagramAction) => void,
  action: DiagramAlignAction | DiagramDistributeAction,
): void {
  dispatch(action as unknown as DiagramAction);
}

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
  const [saveState, setSaveState] = useState<SaveState>('saved');
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

  const [pages, setPages] = useState<Page[]>(() => initialPages);
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
      baselinedScreenIdsRef.current.add(screenId);
      lastSavedLayoutsRef.current = { ...lastSavedLayoutsRef.current, [screenId]: json };
      return;
    }
    const previous = lastSavedLayoutsRef.current[screenId];
    if (previous !== undefined && canonicalLayout(json) === canonicalLayout(previous)) return;
    lastSavedLayoutsRef.current = { ...lastSavedLayoutsRef.current, [screenId]: json };
    const next = screensRef.current.map((screen) => (screen.id === screenId ? { ...screen, layout: json } : screen));
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
      saver.queue({ screens: next });
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
  // yet" chip and the New screen button instead, the same one every page
  // already has. currentScreenId becomes '' in that case: nothing in
  // `screens` has that id, so every consumer (Canvas, ScreensStrip) simply
  // shows nothing focused - the same fallback resolveInitialScreens/
  // screenIdForPage already rely on elsewhere.
  function switchPage(pageId: string): void {
    if (pageId === currentPageId) return;
    void saver.flush();
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
    const next = [...pages, newPage];
    setPages(next);
    queuePatch({ pages: next });
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
        return { ...screen, id: copyId, pageId: newPageId, x: null, y: null };
      });
    // The page's flow chart comes along too, re-pointed at the copied
    // screens, so a duplicated page is a complete, independent copy.
    const sourceDiagram = pages[index].diagram;
    const newPage: Page = {
      id: newPageId,
      name: `${pages[index].name} copy`,
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
    // Falls back across the whole file (any page) only when the current
    // page has nothing of its own to size a new frame after - an empty
    // page's "New screen" still needs some starting width, and every file
    // has at least one screen somewhere (validateScreens' own invariant).
    const current = pageScreens.find((screen) => screen.id === currentScreenId) ?? pageScreens[0] ?? screens[0];
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
  function moveScreen(id: string, position: { x: number; y: number }): void {
    const next = screens.map((screen) => (screen.id === id ? { ...screen, x: position.x, y: position.y } : screen));
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
    const byId = new Map(updates.map((update) => [update.id, update]));
    const next = screens.map((screen) => {
      const update = byId.get(screen.id);
      return update ? { ...screen, x: update.x, y: update.y } : screen;
    });
    screensRef.current = next;
    setScreens(next);
    queuePatch({ screens: next });
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

  // Disabled in the UI (screens-strip.tsx) once a page is down to one
  // screen, the same way it always disabled Delete at one screen file-wide
  // before pages existed - now scoped to the screen's OWN page rather than
  // the whole file, since a page emptying out entirely is a real, supported
  // state (reached instead through "Move to page", or a page that started
  // empty), just not one Delete itself produces.
  function deleteScreen(id: string): void {
    const target = screens.find((screen) => screen.id === id);
    if (!target) return;
    const pageScreenCount = screens.filter((screen) => screen.pageId === target.pageId).length;
    if (pageScreenCount <= 1) return;
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

  // "Move to page" (screens-strip.tsx's chevron menu): keeps the screen's
  // layout, comments (comments are keyed by screen id, not page - see
  // lib/comments/store.ts - so they simply travel with it) and everything
  // else, only repointing pageId and clearing its position so
  // layoutMissingPositions places it fresh on the target page rather than
  // possibly on top of one of that page's existing frames. If the screen
  // being moved is the one currently focused, follows deleteScreen's own
  // convention for "this screen is no longer part of the current page's
  // view": pick another screen still on the ORIGIN page, or show that page
  // empty - moving never jumps the editor's view to the destination page.
  function moveScreenToPage(id: string, targetPageId: string): void {
    const target = screens.find((screen) => screen.id === id);
    if (!target || target.pageId === targetPageId) return;
    const originPageId = target.pageId;
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
    const current = screens.find((screen) => screen.id === currentScreenId);
    // No-op guard: WorkbenchShell's own size-reinit effect (below) calls
    // setWidth/setSize/setDevice whenever the screen changes, purely to make
    // StageProvider's context match a screen it didn't remount for (see the
    // comment on <StageProvider> below) - not because anything actually
    // changed. Without this, every screen switch would queue an identical,
    // pointless save. stageHeight/deviceName are compared against null (not
    // undefined) since a Screen predating this feature (or one already
    // cleared) may omit them entirely.
    if (
      current &&
      current.stageWidth === next.width &&
      (current.stageHeight ?? null) === next.height &&
      (current.deviceName ?? null) === next.deviceName
    ) {
      return;
    }
    const nextScreens = screens.map((screen) =>
      screen.id === currentScreenId
        ? { ...screen, stageWidth: next.width, stageHeight: next.height, deviceName: next.deviceName }
        : screen,
    );
    screensRef.current = nextScreens;
    setScreens(nextScreens);
    queuePatch({ screens: nextScreens });
  }

  function handleDeviceChange(device: { width: number; height: number; deviceName: string }): void {
    const current = screens.find((screen) => screen.id === currentScreenId);
    // Same no-op guard as handleSizeChange, above, and for the same
    // reason: WorkbenchShell's resync effect calls setDevice whenever the
    // screen changes and already has this exact device, purely to make the
    // stage context match it - not because anything actually changed.
    if (
      current &&
      current.stageWidth === device.width &&
      current.stageHeight === device.height &&
      current.deviceName === device.deviceName
    ) {
      return;
    }
    const next = screens.map((screen) =>
      screen.id === currentScreenId
        ? { ...screen, stageWidth: device.width, stageHeight: device.height, deviceName: device.deviceName }
        : screen,
    );
    screensRef.current = next;
    setScreens(next);
    queuePatch({ screens: next });
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

  return (
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
          screens={screens}
          currentScreenId={currentScreenId}
          onSelectScreen={switchScreen}
          onAddScreen={addScreen}
          onRenameScreen={renameScreen}
          onMoveScreen={moveScreen}
          onMoveScreens={moveScreens}
          onDuplicateScreen={duplicateScreen}
          onDeleteScreen={deleteScreen}
          onMoveScreenToPage={moveScreenToPage}
        />
      </StageProvider>
    </Editor>
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
  screens,
  currentScreenId,
  onSelectScreen,
  onAddScreen,
  onRenameScreen,
  onMoveScreen,
  onMoveScreens,
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
  onDiagramChange: (pageId: string, diagram: DiagramData) => void;
  // The whole file's screens, every page's own - WorkbenchShell itself
  // filters to the current page's screens (pageScreens, below) for Canvas,
  // ScreensStrip and the viewport controller's frames; the full array is
  // still what onMoveScreenToPage needs to reach a screen that is about to
  // leave the current page altogether.
  screens: Screen[];
  currentScreenId: string;
  onSelectScreen: (id: string) => void;
  onAddScreen: () => void;
  onRenameScreen: (id: string, name: string) => void;
  onMoveScreen: (id: string, position: { x: number; y: number }) => void;
  onMoveScreens: (updates: { id: string; x: number; y: number }[]) => void;
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
  const { actions, query } = useEditor();
  const { setWidth, setSize, setDevice } = useStage();
  const [newOpen, setNewOpen] = useState(false);
  // "?" and the top bar's overflow menu item both open the shortcuts sheet
  // as a dialog (spec section 3); the Cmd-hold presentation lives entirely
  // inside ShortcutsOverlay's own listener and never touches this state.
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // The canvas viewport (spec docs/superpowers/specs/2026-09-12-infinite-
  // canvas-design.md): owned here, one level above Canvas itself, so the
  // same instance can be shared - through CanvasViewportProvider, below -
  // with the top bar's zoom menu and the keyboard shortcuts wired just
  // after this, neither of which is a descendant of Canvas.
  // Only the current page's own screens - Canvas, ScreensStrip and the
  // viewport controller's frames all scope to this, never the whole file's
  // `screens` (spec: "the screens strip shows only the current page's
  // screens"; "the canvas... frames of the current page only").
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
  const [lastDiagramPageId, setLastDiagramPageId] = useState(currentPageId);
  if (currentPageId !== lastDiagramPageId) {
    setLastDiagramPageId(currentPageId);
    dispatchDiagram({
      type: 'load',
      data: sanitizeDiagram(pages.find((page) => page.id === currentPageId)?.diagram ?? { nodes: [], edges: [] }, pageScreenIds),
    });
  }

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
          onAlign: (mode: AlignMode) =>
            dispatchDiagramAlign(dispatchDiagram, { type: 'align', ids: selectedDiagramNodeIds, mode }),
          onDistribute: (axis: DistributeAxis) =>
            dispatchDiagramAlign(dispatchDiagram, { type: 'distribute', ids: selectedDiagramNodeIds, axis }),
        }
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

  // A finished placement or connection only disarms the shape; the bar stays.
  function onDiagramToolConsumed(): void {
    setDiagramTool(POINTER_TOOL);
  }

  // Shift+1/the zoom menu's "Zoom to fit" (spec: "Zoom to fit includes
  // diagram bounds") - folds the current page's diagram nodes' bounding box
  // in alongside every frame's own, when the diagram has any.
  function zoomToFitTargets(): FrameRect[] {
    const targets: FrameRect[] = pageScreens.map(frameRect);
    const diagramBox = diagramBounds(diagram.nodes);
    if (diagramBox) targets.push(diagramBox);
    return targets;
  }

  const { viewport, setViewport, viewportSize, rootRef, animateTo } = useCanvasViewportController({
    fileId,
    pageId: currentPageId,
    frames: pageScreens.map(frameRect),
  });

  // Clicking a screens tab still switches the focused screen (onSelectScreen,
  // from Workbench) and also animates the viewport to fit that frame (spec:
  // "200 ms ease-out, cancelled by any pan/zoom input") - wrapping it here
  // rather than in Workbench itself, since the viewport this animates is
  // owned by this component, one level below where switchScreen lives.
  // Deliberately NOT used for Canvas's own onFocusScreen (clicking a frame
  // directly on the canvas): the user is already looking at that frame, so
  // fitting it could jump the view somewhere they did not ask for.
  function handleSelectScreenTab(id: string): void {
    onSelectScreen(id);
    const target = pageScreens.find((screen) => screen.id === id);
    if (target) animateTo(zoomToRect(frameRect(target), viewportSize, SELECTION_ZOOM_PADDING));
  }

  // Shift+2: zooms to the selected layer's own bounds when something is
  // selected, else the focused frame's bounds - the DOM node's
  // getBoundingClientRect() is already in canvas-space-compatible unscaled
  // px (it lives inside the focused frame's own iframe, whose internal
  // layout is untouched by the canvas's ancestor pan/zoom transform - see
  // canvas.tsx's own comments on this), so only the frame's own x/y needs
  // adding to place it in canvas space.
  function zoomToSelectionOrFocusedFrame(): void {
    const focused = pageScreens.find((screen) => screen.id === currentScreenId);
    if (!focused) return;
    const selectedId = selectedIdFrom(query.getState());
    const dom = selectedId ? query.getState().nodes[selectedId]?.dom : null;
    let target: FrameRect;
    if (dom) {
      const local = dom.getBoundingClientRect();
      target = { x: (focused.x ?? 0) + local.left, y: (focused.y ?? 0) + local.top, width: local.width, height: local.height };
    } else {
      target = frameRect(focused);
    }
    setViewport(zoomToRect(target, viewportSize, SELECTION_ZOOM_PADDING));
  }

  // Figma's own behaviour: picking a layer on the canvas while the
  // Elements tab is showing jumps the panel to Design, the same way
  // Figma does when you select something while its Assets panel is open.
  // Adjusted during render (the same pattern FileNameField in topbar.tsx
  // uses for syncedFileName) rather than in an effect: comparing against a
  // mirrored `lastSelectedNodeId` is how this tells "the selection itself
  // just changed" apart from "this component merely re-rendered" (e.g.
  // because panelMode changed). That distinction is exactly why this
  // cannot be an effect keyed on panelMode too - choosing Prototype or
  // Elements is always explicit, and reacting to panelMode here would
  // immediately switch a just-chosen Elements tab back to Design the
  // moment it renders, defeating the click.
  const { id: selectedNodeId } = useSelectedNode();
  const [lastSelectedNodeId, setLastSelectedNodeId] = useState(selectedNodeId);
  if (selectedNodeId !== lastSelectedNodeId) {
    setLastSelectedNodeId(selectedNodeId);
    if (selectedNodeId && panelMode === 'components') {
      setPanelMode('design');
    }
  }

  // Comments placeholder (docs/superpowers/specs/2026-09-12-folders-and-comments-design.md
  // section 5): browser-only, one store per file, created once for this
  // component's whole lifetime the same way `saver` is in Workbench above.
  const [commentStore] = useState(() => createCommentStore(fileId));
  const threads = useSyncExternalStore(commentStore.subscribe, () => commentStore.list());
  const [commentMode, setCommentMode] = useState(false);
  const [pendingPin, setPendingPin] = useState<PendingPin | null>(null);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [authorName, setAuthorNameState] = useState<string | null>(() => getAuthorName());

  // Shared by the composer's own Cancel button and Escape key (comment-composer.tsx
  // handles Escape locally - focus is inside its textarea while it is open,
  // which keyboard.tsx's isEditableTarget guard would otherwise swallow -
  // see the comment there) and by Escape from useWorkbenchKeyboard below
  // when comment mode is on but no composer is open yet.
  function cancelPendingAndExitCommentMode(): void {
    setPendingPin(null);
    setCommentMode(false);
  }

  // Shared by the topbar's Comment tool button and the "c" key: turning
  // comment mode ON is a plain toggle, but turning it OFF must also cancel a
  // pending pin and close its composer, the same cleanup Escape and Cancel
  // already do via cancelPendingAndExitCommentMode - otherwise a pin placed
  // and then left mid-composer by toggling the tool off (rather than
  // pressing Escape or Cancel) stays behind, orphaned, with no tool active
  // to finish or discard it.
  function toggleCommentMode(): void {
    if (commentMode) {
      cancelPendingAndExitCommentMode();
    } else {
      setCommentMode(true);
    }
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
    window.open(
      `/f/${fileId}/play?page=${currentPageId}&screen=${currentScreenId}`,
      '_blank',
      'noopener,noreferrer',
    );
  }

  // The viewport centre (screen space, relative to the canvas's own origin -
  // see canvas.tsx) that Cmd+=/Cmd+-/Cmd+0 zoom around: there is no pointer
  // position for a keyboard shortcut to anchor to the way a wheel gesture
  // has one.
  const viewportCenter = { x: viewportSize.width / 2, y: viewportSize.height / 2 };

  useWorkbenchKeyboard({
    onToggleUi: () => setUiHidden((hidden) => !hidden),
    onToggleChat: () => setChatOpen((open) => !open),
    onTogglePanelCollapsed: () => setPanelCollapsed((collapsed) => !collapsed),
    onToggleCommentMode: toggleCommentMode,
    commentMode,
    onExitCommentMode: cancelPendingAndExitCommentMode,
    onDiagramTool: toggleDiagramPalette,
    diagramToolActive: diagramPaletteOpen || diagramTool.kind !== 'pointer',
    onExitDiagramTool: closeDiagramTool,
    diagramSelectionActive,
    onDeselectDiagram: () => dispatchDiagram({ type: 'clearSelection' }),
    frameSelectionActive: selectedFrameIds.size > 0,
    onClearFrameSelection: () => setSelectedFrameIds(new Set()),
    onDiagramDelete: () => dispatchDiagram({ type: 'delete', ids: diagram.selection.map((item) => item.id) }),
    onDiagramDuplicate: () =>
      dispatchDiagram({
        type: 'duplicate',
        pairs: diagram.selection
          .filter((item) => item.type === 'node')
          .map((item) => ({ sourceId: item.id, newId: nanoid(10) })),
      }),
    onDiagramNudge: (direction, big) => {
      const ids = diagram.selection.filter((item) => item.type === 'node').map((item) => item.id);
      if (ids.length === 0) return;
      const [dx, dy] = nudgeDelta(direction, big);
      dispatchDiagram({ type: 'move', ids, dx, dy });
    },
    // The frame-selection counterpart to onDiagramNudge above, firing
    // instead of it once no diagram element is selected (keyboard.tsx's own
    // dispatch decides which) - moves every selected frame by the same
    // delta and saves them together, the same "one patch" treatment a
    // dragged multi-selection already gets (canvas.tsx's onMoveScreens).
    onFrameNudge: (direction, big) => {
      if (selectedFrameIds.size === 0) return;
      const [dx, dy] = nudgeDelta(direction, big);
      const updates = pageScreens
        .filter((screen) => selectedFrameIds.has(screen.id))
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
    onPointerTool: () => {
      cancelPendingAndExitCommentMode();
      closeDiagramTool();
    },
    onPresent: presentFocusedScreen,
    onAddScreen,
    onPageNext: () => onSwitchToAdjacentPage('next'),
    onPagePrev: () => onSwitchToAdjacentPage('previous'),
    onOpenShortcuts: () => setShortcutsOpen(true),
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

  const commentsProps: StageCommentsProps = {
    commentMode,
    threads,
    pendingPin,
    openThreadId,
    authorName,
    onPlacePin: (x, y, anchorNodeId) => {
      setOpenThreadId(null);
      setPendingPin({ x, y, anchorNodeId });
    },
    onCancelPending: cancelPendingAndExitCommentMode,
    onSubmitComment: ({ author, text }) => {
      if (!pendingPin) return;
      if (!authorName) {
        setAuthorName(author);
        setAuthorNameState(author);
      }
      commentStore.add({ x: pendingPin.x, y: pendingPin.y, anchorNodeId: pendingPin.anchorNodeId, author, text });
      setPendingPin(null);
      setCommentMode(false);
    },
    onPinClick: (id) => {
      setPendingPin(null);
      setOpenThreadId(id);
    },
    onCloseThread: () => setOpenThreadId(null),
    onSubmitReply: (threadId, { author, text }) => {
      if (!authorName) {
        setAuthorName(author);
        setAuthorNameState(author);
      }
      commentStore.reply(threadId, { author, text });
    },
    onResolveThread: (id) => {
      commentStore.resolve(id);
      setOpenThreadId((current) => (current === id ? null : current));
    },
  };

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
  }, [currentScreenId]);

  // The chat panel floats immediately to the right of the right panel,
  // whichever width that panel currently is (spec docs/superpowers/specs/
  // 2026-09-12-infinite-canvas-design.md section 4) - a complete, literal
  // Tailwind class per branch (not built by interpolating a variable into
  // the arbitrary-value bracket) so the build's class scanner can see both.
  const chatPositionClass = panelCollapsed ? 'right-[56px]' : 'right-[336px]';

  return (
    <ChatTransportProvider transport={placeholderTransport}>
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
                chatOpen={chatOpen}
                onToggleChat={() => setChatOpen((open) => !open)}
                commentMode={commentMode}
                onToggleCommentMode={toggleCommentMode}
                commentCount={threads.length}
                diagramPaletteOpen={diagramPaletteOpen}
                onToggleDiagramPalette={toggleDiagramPalette}
                onZoomIn={() => setViewport((current) => stepZoom(current, viewportCenter, 'in'))}
                onZoomOut={() => setViewport((current) => stepZoom(current, viewportCenter, 'out'))}
                onZoomToFit={() => setViewport(fitAll(zoomToFitTargets(), viewportSize))}
                onZoomToSelection={zoomToSelectionOrFocusedFrame}
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
                rootRef={rootRef}
                diagram={diagram}
                onDiagramAction={dispatchDiagram}
                diagramTool={diagramTool}
                onDiagramToolConsumed={onDiagramToolConsumed}
                onDeselectDiagram={() => dispatchDiagram({ type: 'clearSelection' })}
                selectedFrameIds={selectedFrameIds}
                onToggleFrameSelection={toggleFrameSelection}
                onSetFrameSelection={(ids) => setSelectedFrameIds(new Set(ids))}
                onClearFrameSelection={() => setSelectedFrameIds(new Set())}
              />
              {!uiHidden && (
                <DiagramPalette
                  open={diagramPaletteOpen}
                  tool={diagramTool}
                  onSelectTool={setDiagramTool}
                  onClose={closeDiagramTool}
                />
              )}
              {/*
                Spec docs/superpowers/specs/2026-09-12-pages-design.md
                section 3: creating a screen for an empty page is never
                automatic - this chip names the state; "the New screen
                button" it refers to is the screens strip's own existing
                "+" just below (still rendered with zero tabs) - a second,
                separate button here would only duplicate it under the same
                accessible name.
              */}
              {pageScreens.length === 0 && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                  <div className={cn(CHIP, 'px-3')}>
                    <span className="text-[12.5px] text-muted-foreground">This page has no screens yet</span>
                  </div>
                </div>
              )}
              {!uiHidden && (
                <div className="absolute top-[76px] left-3 z-10 flex items-center rounded-lg border border-line-soft bg-canvas/95 px-1 py-1 shadow-panel">
                  <ScreensStrip
                    screens={pageScreens}
                    pages={pages}
                    currentScreenId={currentScreenId}
                    onSelect={handleSelectScreenTab}
                    onAdd={onAddScreen}
                    onRename={onRenameScreen}
                    onDuplicate={onDuplicateScreen}
                    onDelete={onDeleteScreen}
                    onMoveToPage={onMoveScreenToPage}
                  />
                </div>
              )}
              <LayerStackMenu />
            </StageErrorBoundary>
            {!uiHidden && (
              <Inspector
                key="inspector"
                screens={screens}
                currentScreenId={currentScreenId}
                panelMode={panelMode}
                onPanelModeChange={setPanelMode}
                collapsed={panelCollapsed}
                onToggleCollapsed={() => setPanelCollapsed((collapsed) => !collapsed)}
                diagramSelection={selectedDiagramFields()}
                onDiagramAction={dispatchDiagram}
                selectedFrameIds={selectedFrameIds}
                onAlignFrames={onMoveScreens}
                diagramAlignment={diagramAlignmentContext}
              />
            )}
            {!uiHidden && chatOpen && (
              <ChatPanel
                key="chat-panel"
                fileId={fileId}
                onClose={() => setChatOpen(false)}
                className={chatPositionClass}
              />
            )}
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
              Cmd+\") - the Cmd-hold presentation must keep working even with
              every other panel gone.
            */}
            <ShortcutsOverlay key="shortcuts-overlay" open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
          </div>
        </CanvasViewportProvider>
      </PrototypeProvider>
    </ChatTransportProvider>
  );
}
