'use client';

import { Editor, useEditor } from '@craftjs/core';
import { nanoid } from 'nanoid';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { defaultScreen } from '@/components/blocks/known-types';
import { emptyLayoutJson, resolver } from '@/components/blocks/registry';
import { fitAll, stepZoom, zoomTo, zoomToRect, type FrameRect } from '@/lib/canvas/viewport';
import { createCommentStore, getAuthorName, setAuthorName } from '@/lib/comments/store';
import { layoutMissingPositions } from '@/lib/files/layout';
import { canonicalLayout } from '@/lib/files/validate';
import type { FileRecord, Screen } from '@/lib/files/repository';
import { loadChatPanelOpen, saveChatPanelOpen } from '@/lib/chat/store';
import { placeholderTransport } from '@/lib/chat/transport';
import { createFileSaver, type FilePatch, type SaveState } from '@/lib/persistence';
import {
  loadPanelCollapsed,
  loadPanelMode,
  savePanelCollapsed,
  savePanelMode,
} from '@/lib/workbench/panel-store';
import { Canvas, CanvasViewportProvider, frameRect, useCanvasViewportController } from './canvas';
import { ChatPanel } from './chat/chat-panel';
import { ChatTransportProvider } from './chat/chat-transport-context';
import type { PendingPin, StageCommentsProps } from './comments/comment-layer';
import { Inspector, type PanelMode } from './inspector/inspector';
import { useWorkbenchKeyboard } from './keyboard';
import { LayerStackMenu } from './layer-stack-menu';
import { NewLayoutDialog } from './new-layout-dialog';
import { NodeIndicator } from './node-indicator';
import { PrototypeProvider } from './prototype-context';
import { ScreensStrip } from './screens-strip';
import { selectedIdFrom, useSelectedNode, useZoneRedirect } from './selection';
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

// A file always has at least one screen by the time it reaches this
// component in real use (the repository's create()/save() both run every
// screens array through validateScreens, which rejects zero screens) - this
// is only a fallback for the optional `screens` field's own precedent (see
// the comment on FileRecord in lib/files/repository.ts), e.g. an older test
// fixture that predates screens.
function resolveInitialScreens(file: FileRecord): Screen[] {
  return file.screens && file.screens.length > 0 ? file.screens : [defaultScreen()];
}

// The current screen id is remembered in the URL hash (#s=<id>) so a reload
// keeps it; falls back to the first screen when the hash names no screen of
// this file (missing, stale after a delete, or simply absent on first load).
function screenIdFromHash(hash: string, screens: Screen[]): string {
  const match = /[#&]s=([^&]+)/.exec(hash);
  const id = match?.[1];
  return id && screens.some((screen) => screen.id === id) ? id : screens[0].id;
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
  // A screen predating this feature has no x/y yet; layoutMissingPositions
  // (lib/files/layout.ts) fills them in left to right, in screen order, the
  // moment the file loads - so the canvas always has a concrete position for
  // every frame, without ever queuing a save purely from loading the file
  // (that only happens on the next real change, once these computed
  // positions are already part of `screens` and so ride along with it).
  const [screens, setScreens] = useState<Screen[]>(() => layoutMissingPositions(resolveInitialScreens(file)));
  const [currentScreenId, setCurrentScreenId] = useState<string>(() =>
    screenIdFromHash(window.location.hash, resolveInitialScreens(file)),
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

  function switchScreen(id: string): void {
    if (id === currentScreenId) return;
    void saver.flush();
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
    const current = screens.find((screen) => screen.id === currentScreenId) ?? screens[0];
    const newScreen: Screen = {
      id: nanoid(10),
      name: `Frame ${screens.length + 1}`,
      layout: emptyLayoutJson(),
      stageWidth: current.stageWidth,
      // Copies the source screen's device, same as duplicateScreen's plain
      // spread already does - a new frame starts out matching the one it
      // was added from, device included, not just its width.
      stageHeight: current.stageHeight ?? null,
      deviceName: current.deviceName ?? null,
      // No position yet: appended at the end of the array with x/y left
      // unset, layoutMissingPositions places it to the right of the last
      // frame (spec: "new screens are placed to the right of the last
      // frame") - every existing screen already has a position by this
      // point (the initial-load computation above), so this only ever fills
      // in the new one.
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

  function duplicateScreen(id: string): void {
    const index = screens.findIndex((screen) => screen.id === id);
    if (index === -1) return;
    // x/y explicitly cleared, not inherited from the plain spread: the copy
    // must not land exactly on top of its source. Placed right after the
    // source in the array (below), so layoutMissingPositions resolves its
    // position relative to the source specifically (spec: "duplicates go
    // right of the source"), not the last frame overall.
    const copy: Screen = { ...screens[index], id: nanoid(10), name: `${screens[index].name} copy`, x: null, y: null };
    lastSavedLayoutsRef.current = { ...lastSavedLayoutsRef.current, [copy.id]: copy.layout };
    const next = layoutMissingPositions([...screens.slice(0, index + 1), copy, ...screens.slice(index + 1)]);
    screensRef.current = next;
    setScreens(next);
    queuePatch({ screens: next });
    switchScreen(copy.id);
  }

  function deleteScreen(id: string): void {
    if (screens.length <= 1) return;
    const next = screens.filter((screen) => screen.id !== id);
    delete lastSavedLayoutsRef.current[id];
    screensRef.current = next;
    setScreens(next);
    queuePatch({ screens: next });
    if (id === currentScreenId) switchScreen(next[0].id);
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
      indicator={{ success: 'var(--acc)', error: 'var(--bad)' }}
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
          screens={screens}
          currentScreenId={currentScreenId}
          onSelectScreen={switchScreen}
          onAddScreen={addScreen}
          onRenameScreen={renameScreen}
          onDuplicateScreen={duplicateScreen}
          onDeleteScreen={deleteScreen}
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
  screens,
  currentScreenId,
  onSelectScreen,
  onAddScreen,
  onRenameScreen,
  onDuplicateScreen,
  onDeleteScreen,
}: {
  fileId: string;
  folderId: string | null;
  fileName: string;
  onRename: (name: string) => void;
  saveState: SaveState;
  notice?: string;
  screens: Screen[];
  currentScreenId: string;
  onSelectScreen: (id: string) => void;
  onAddScreen: () => void;
  onRenameScreen: (id: string, name: string) => void;
  onDuplicateScreen: (id: string) => void;
  onDeleteScreen: (id: string) => void;
}) {
  useZoneRedirect();
  const [uiHidden, setUiHidden] = useState(false);
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

  // The canvas viewport (spec docs/superpowers/specs/2026-09-12-infinite-
  // canvas-design.md): owned here, one level above Canvas itself, so the
  // same instance can be shared - through CanvasViewportProvider, below -
  // with the top bar's zoom menu and the keyboard shortcuts wired just
  // after this, neither of which is a descendant of Canvas.
  const { viewport, setViewport, viewportSize, rootRef } = useCanvasViewportController({
    fileId,
    frames: screens.map(frameRect),
  });

  // Shift+2: zooms to the selected layer's own bounds when something is
  // selected, else the focused frame's bounds - the DOM node's
  // getBoundingClientRect() is already in canvas-space-compatible unscaled
  // px (it lives inside the focused frame's own iframe, whose internal
  // layout is untouched by the canvas's ancestor pan/zoom transform - see
  // canvas.tsx's own comments on this), so only the frame's own x/y needs
  // adding to place it in canvas space.
  function zoomToSelectionOrFocusedFrame(): void {
    const focused = screens.find((screen) => screen.id === currentScreenId);
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
  // Components tab is showing jumps the panel to Design, the same way
  // Figma does when you select something while its Assets panel is open.
  // Adjusted during render (the same pattern FileNameField in topbar.tsx
  // uses for syncedFileName) rather than in an effect: comparing against a
  // mirrored `lastSelectedNodeId` is how this tells "the selection itself
  // just changed" apart from "this component merely re-rendered" (e.g.
  // because panelMode changed). That distinction is exactly why this
  // cannot be an effect keyed on panelMode too - choosing Prototype or
  // Components is always explicit, and reacting to panelMode here would
  // immediately switch a just-chosen Components tab back to Design the
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
    onZoomIn: () => setViewport((current) => stepZoom(current, viewportCenter, 'in')),
    onZoomOut: () => setViewport((current) => stepZoom(current, viewportCenter, 'out')),
    onZoomReset: () => setViewport((current) => zoomTo(current, viewportCenter, 1)),
    onZoomToFit: () => setViewport(fitAll(screens.map(frameRect), viewportSize)),
    onZoomToSelection: zoomToSelectionOrFocusedFrame,
  });

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
        <CanvasViewportProvider viewport={viewport} setViewport={setViewport} viewportSize={viewportSize}>
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
                currentScreenId={currentScreenId}
                chatOpen={chatOpen}
                onToggleChat={() => setChatOpen((open) => !open)}
                commentMode={commentMode}
                onToggleCommentMode={toggleCommentMode}
                commentCount={threads.length}
                onZoomIn={() => setViewport((current) => stepZoom(current, viewportCenter, 'in'))}
                onZoomOut={() => setViewport((current) => stepZoom(current, viewportCenter, 'out'))}
                onZoomToFit={() => setViewport(fitAll(screens.map(frameRect), viewportSize))}
                onZoomToSelection={zoomToSelectionOrFocusedFrame}
              />
            )}
            <StageErrorBoundary key="stage" fileId={fileId} screens={screens} currentScreenId={currentScreenId}>
              <Canvas
                screens={screens}
                focusedScreenId={currentScreenId}
                onFocusScreen={onSelectScreen}
                comments={commentsProps}
                rootRef={rootRef}
              />
              {!uiHidden && (
                <div className="absolute top-[76px] left-3 z-10 flex items-center rounded-lg border border-line-soft bg-canvas/95 px-1 py-1 shadow-panel">
                  <ScreensStrip
                    screens={screens}
                    currentScreenId={currentScreenId}
                    onSelect={onSelectScreen}
                    onAdd={onAddScreen}
                    onRename={onRenameScreen}
                    onDuplicate={onDuplicateScreen}
                    onDelete={onDeleteScreen}
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
          </div>
        </CanvasViewportProvider>
      </PrototypeProvider>
    </ChatTransportProvider>
  );
}
