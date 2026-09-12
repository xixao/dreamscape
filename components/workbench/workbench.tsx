'use client';

import { Editor, useEditor } from '@craftjs/core';
import { nanoid } from 'nanoid';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { defaultScreen } from '@/components/blocks/known-types';
import { emptyLayoutJson, resolver } from '@/components/blocks/registry';
import { canonicalLayout } from '@/lib/files/validate';
import type { FileRecord, Screen } from '@/lib/files/repository';
import { createFileSaver, type FilePatch, type SaveState } from '@/lib/persistence';
import { ComponentTray } from './component-tray';
import { Inspector, type PanelMode } from './inspector/inspector';
import { useWorkbenchKeyboard } from './keyboard';
import { LayerStackMenu } from './layer-stack-menu';
import { NewLayoutDialog } from './new-layout-dialog';
import { NodeIndicator } from './node-indicator';
import { PrototypeProvider } from './prototype-context';
import { useZoneRedirect } from './selection';
import { Stage } from './stage';
import { StageErrorBoundary } from './stage-error-boundary';
import { StageProvider, useStage } from './stage-context';
import { Topbar } from './topbar';

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
  const [screens, setScreens] = useState<Screen[]>(() => resolveInitialScreens(file));
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
    };
    lastSavedLayoutsRef.current = { ...lastSavedLayoutsRef.current, [newScreen.id]: newScreen.layout };
    const next = [...screens, newScreen];
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
    const copy: Screen = { ...screens[index], id: nanoid(10), name: `${screens[index].name} copy` };
    lastSavedLayoutsRef.current = { ...lastSavedLayoutsRef.current, [copy.id]: copy.layout };
    const next = [...screens.slice(0, index + 1), copy, ...screens.slice(index + 1)];
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

  function handleWidthChange(width: number): void {
    const current = screens.find((screen) => screen.id === currentScreenId);
    // No-op guard: WorkbenchShell's own width-reinit effect (below) calls
    // this same setWidth whenever the screen changes and has no device,
    // purely to make StageProvider's context match a screen it didn't
    // remount for (see the comment on <StageProvider> below) - not because
    // anything actually changed. Without this, every screen switch would
    // queue an identical, pointless save. stageHeight/deviceName are
    // compared against null (not undefined) since a Screen predating this
    // feature (or one already cleared) may omit them entirely.
    if (
      current &&
      current.stageWidth === width &&
      (current.stageHeight ?? null) === null &&
      (current.deviceName ?? null) === null
    ) {
      return;
    }
    // setWidth (the grip, the Mobile/Tablet/Desktop segments) always clears
    // the frame's device in the stage context - this mirrors that onto the
    // saved screen, so a plain width change also clears a device the
    // screen previously had.
    const next = screens.map((screen) =>
      screen.id === currentScreenId ? { ...screen, stageWidth: width, stageHeight: null, deviceName: null } : screen,
    );
    screensRef.current = next;
    setScreens(next);
    queuePatch({ screens: next });
  }

  function handleDeviceChange(device: { width: number; height: number; deviceName: string }): void {
    const current = screens.find((screen) => screen.id === currentScreenId);
    // Same no-op guard as handleWidthChange, above, and for the same
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
        onWidthChange={handleWidthChange}
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
          currentScreenLayout={currentScreen.layout}
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
  currentScreenLayout,
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
  currentScreenLayout: string;
  onSelectScreen: (id: string) => void;
  onAddScreen: () => void;
  onRenameScreen: (id: string, name: string) => void;
  onDuplicateScreen: (id: string) => void;
  onDeleteScreen: (id: string) => void;
}) {
  useZoneRedirect();
  const [uiHidden, setUiHidden] = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode>('design');
  useWorkbenchKeyboard({ onToggleUi: () => setUiHidden((hidden) => !hidden) });
  const { actions } = useEditor();
  const { setWidth, setDevice } = useStage();
  const [newOpen, setNewOpen] = useState(false);

  // StageProvider is intentionally not remounted per screen (see the comment
  // on <StageProvider> in Workbench), so without this its width/height/
  // device/breakpoint context would keep reflecting whichever screen was
  // active before - stale for every useStage() consumer here (the topbar
  // readout and device chip, the inspector's breakpoint badge, the artboard
  // itself). Re-initialises only on an actual screen change, not on every
  // resize (handleWidthChange's/handleDeviceChange's own no-op guards also
  // keep this from queuing a spurious save). setDevice when the screen has
  // one (stageHeight is always set alongside deviceName - see addScreen,
  // duplicateScreen and validateScreens, which all keep the two together;
  // the stageHeight check here is defensive, not an expected case), setWidth
  // otherwise - the same two entry points a user's own action reaches this
  // context through. A layout effect so the artboard never paints the new
  // screen at the old width or height.
  useLayoutEffect(() => {
    const screen = screens.find((candidate) => candidate.id === currentScreenId);
    if (!screen) return;
    if (screen.deviceName && screen.stageHeight != null) {
      setDevice({ name: screen.deviceName, width: screen.stageWidth, height: screen.stageHeight });
    } else {
      setWidth(screen.stageWidth);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScreenId]);

  return (
    <PrototypeProvider value={{ panelMode, screens }}>
      <div
        className={
          uiHidden
            ? 'grid h-screen grid-cols-[1fr] grid-rows-[1fr] gap-3 bg-background p-3'
            : 'grid h-screen grid-cols-[280px_1fr_320px] grid-rows-[auto_1fr] gap-3 bg-background p-3'
        }
      >
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
          />
        )}
        {!uiHidden && <ComponentTray key="tray" />}
        <StageErrorBoundary key="stage" fileId={fileId} screens={screens} currentScreenId={currentScreenId}>
          <Stage
            data={currentScreenLayout}
            screens={screens}
            currentScreenId={currentScreenId}
            onSelectScreen={onSelectScreen}
            onAddScreen={onAddScreen}
            onRenameScreen={onRenameScreen}
            onDuplicateScreen={onDuplicateScreen}
            onDeleteScreen={onDeleteScreen}
          />
        </StageErrorBoundary>
        {!uiHidden && (
          <Inspector
            key="inspector"
            screens={screens}
            currentScreenId={currentScreenId}
            panelMode={panelMode}
            onPanelModeChange={setPanelMode}
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
        <LayerStackMenu key="layer-stack-menu" />
      </div>
    </PrototypeProvider>
  );
}
