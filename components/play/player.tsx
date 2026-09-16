'use client';
import { exitPreview } from './exit-preview';

import { Editor, Frame } from '@craftjs/core';
import { XIcon, MoreHorizontalIcon, PanelRightIcon, ChevronDownIcon, MaximizeIcon, MinimizeIcon, MonitorIcon, SmartphoneIcon, SlidersHorizontalIcon } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { resolver } from '@/components/blocks/registry';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { CanvasFrame } from '@/components/workbench/canvas-frame';
import { StageProvider } from '@/components/workbench/stage-context';
import { CommentLayer, type PendingPin } from '@/components/workbench/comments/comment-layer';
import { createCommentStore, getAuthorName, setAuthorName } from '@/lib/comments/store';
import { toArtboardPoint, type Rect } from '@/lib/comments/geometry';
import type { FileRecord, OverlayPresentation, OverlayScreen, Screen, ToastPosition } from '@/lib/files/repository';
import { OVERLAY_MIN_HEIGHT, isOverlay } from '@/lib/files/screens';
import { ARTBOARD_MIN_HEIGHT } from '@/lib/stage';
import { DEVICE_PRESET_GROUPS, type DevicePreset } from '@/lib/stage/device-presets';
import { cn } from '@/lib/utils';
import { PlayProvider, usePlay, type PlayContextValue } from './play-context';
import { FocusLayer } from './focus-layer';
import { PresentationHandlers } from './presentation-handlers';
import { ReviewContextEditor } from './review-context';
import {
  PRESENTATION_ZOOM_LEVELS,
  PresentationLayoutPanel,
  type PresentationComposition,
  type PresentationScale,
  type PresentationView,
  type PresentationViewport,
} from './presentation-layout-panel';
import { capabilities, canUse, loadReview, presets, saveReview, screenArtifact, searchArtifacts, type Capability, type Preset, type ReviewArtifact } from '@/lib/presentation/model';

interface PlayState {
  currentScreenId: string;
  // A real stack (spec: "a history stack for back"): every screen navigated
  // away from, most recent last, so `back` can pop it.
  history: string[];
  openDialogIds: ReadonlySet<string>;
  // Overlay frames open on top of the current screen, bottom to top (spec
  // docs/superpowers/specs/2026-09-13-overlay-frames-design.md section 4).
  // Screen ids, every one of them an overlay frame of this file: Player's
  // openOverlay callback is what checks that before dispatching, the
  // reducer itself only knows ids.
  overlayStack: string[];
}

type PlayAction =
  | { type: 'navigate'; screenId: string }
  | { type: 'back' }
  | { type: 'openDialog'; nodeId: string }
  | { type: 'closeDialog'; nodeId: string }
  | { type: 'openOverlay'; screenId: string }
  // Without a screenId: the top of the stack (a `closeOverlay` interaction
  // run from the screen itself, or Escape). With one: exactly that overlay,
  // wherever it sits in the stack (its own close button or backdrop, or a
  // Close overlay interaction fired from inside it).
  | { type: 'closeOverlay'; screenId?: string }
  | { type: 'reset'; screenId: string };

// A plain reducer (rather than a ref-juggled useCallback, as
// components/workbench/workbench.tsx uses for its own not-quite-comparable
// onNodesChange) so `navigate`/`back` never need to read a ref to see the
// screen they are currently leaving: the previous `state.currentScreenId`
// is simply the argument the reducer already has. Navigating or going back
// closes every open dialog: a dialog belongs to the screen it was opened
// from, so carrying its open state across a screen change would let it
// reappear if the visitor returns to that screen later. Overlay frames
// follow the same rule for `navigate` (spec section 3: "navigate closes
// every open overlay before switching screens"), while `back` closes just
// the top overlay when one is open and only navigates back in history when
// none is.
function playReducer(state: PlayState, action: PlayAction): PlayState {
  switch (action.type) {
    case 'navigate': {
      if (action.screenId === state.currentScreenId) {
        // Staying put still closes whatever overlays are open: a "go home"
        // button inside a dialog opened from the home screen should still
        // dismiss that dialog.
        return state.overlayStack.length === 0 && state.openDialogIds.size === 0
          ? state
          : { ...state, overlayStack: [], openDialogIds: new Set() };
      }
      return {
        currentScreenId: action.screenId,
        history: [...state.history, state.currentScreenId],
        openDialogIds: new Set(),
        overlayStack: [],
      };
    }
    case 'back': {
      if (state.overlayStack.length > 0) {
        return { ...state, overlayStack: state.overlayStack.slice(0, -1) };
      }
      if (state.history.length === 0) return state;
      const previous = state.history[state.history.length - 1];
      return {
        currentScreenId: previous,
        history: state.history.slice(0, -1),
        openDialogIds: new Set(),
        overlayStack: [],
      };
    }
    case 'openDialog': {
      if (state.openDialogIds.has(action.nodeId)) return state;
      return { ...state, openDialogIds: new Set(state.openDialogIds).add(action.nodeId) };
    }
    case 'closeDialog': {
      if (!state.openDialogIds.has(action.nodeId)) return state;
      const next = new Set(state.openDialogIds);
      next.delete(action.nodeId);
      return { ...state, openDialogIds: next };
    }
    case 'openOverlay': {
      // Already open: a no-op, never a second copy (spec section 3: "no
      // loops" - an overlay's own button opening itself does nothing).
      if (state.overlayStack.includes(action.screenId)) return state;
      return { ...state, overlayStack: [...state.overlayStack, action.screenId] };
    }
    case 'closeOverlay': {
      if (state.overlayStack.length === 0) return state;
      if (action.screenId === undefined) {
        return { ...state, overlayStack: state.overlayStack.slice(0, -1) };
      }
      if (!state.overlayStack.includes(action.screenId)) return state;
      return { ...state, overlayStack: state.overlayStack.filter((id) => id !== action.screenId) };
    }
    case 'reset':
      return {
        currentScreenId: action.screenId,
        history: [],
        openDialogIds: new Set(),
        overlayStack: [],
      };
    default:
      return state;
  }
}

/**
 * The screen Play actually starts on (spec docs/superpowers/specs/2026-09-
 * 12-pages-design.md section 4: "resolve the page and start on its first
 * screen (or the given one)"): an explicit, valid `initialScreenId` always
 * wins outright, regardless of `initialPageId` (a caller naming a specific
 * screen means exactly that screen); otherwise the given page's own first
 * screen (array order), when it has one; otherwise the first screen (array
 * order) of the first page - in `pages` order - that has any screen at all;
 * otherwise plain array order, for a file with no `pages` of its own yet
 * (an older fixture, or a page.tsx caller that never looked one up).
 *
 * `screens` here is the file's plain screens only - Player passes the
 * overlay frames out before calling this, so Play never stands ON an
 * overlay: one only ever opens on top of a screen (`initialOverlayId`, or
 * an openOverlay interaction), and an initialScreenId that names an
 * overlay falls through to the page/first-screen resolution like any other
 * unknown id.
 */
function resolveInitialScreenId(
  screens: Screen[],
  pages: FileRecord['pages'],
  initialScreenId: string | undefined,
  initialPageId: string | undefined,
): string | undefined {
  if (initialScreenId && screens.some((screen) => screen.id === initialScreenId)) return initialScreenId;
  if (initialPageId) {
    const onPage = screens.find((screen) => screen.pageId === initialPageId);
    if (onPage) return onPage.id;
  }
  for (const page of pages ?? []) {
    const found = screens.find((screen) => screen.pageId === page.id);
    if (found) return found.id;
  }
  return screens[0]?.id;
}

// Whether Escape, the backdrop and the close button can close an overlay:
// a dialog or sheet says so itself (an alert dialog is `dismissible:
// false`), a toast always can (its corner close button is the only way it
// ever goes away, there being no auto-dismiss).
function isDismissible(presentation: OverlayPresentation): boolean {
  return presentation.type === 'toast' || presentation.dismissible;
}

// Radix's DismissableLayer counts any pointer down or focus outside its
// content as "outside" - including one on a toast overlay sitting above a
// dialog (a toast is not a Radix layer). Pressing a toast's own close
// button must not also dismiss the dialog beneath it.
function isInsideToastOverlay(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-overlay-toast]') !== null;
}

// Compile-time exhaustiveness for OverlayHost's presentation switch: a
// fourth presentation type added to the union must get its own wrapper
// before this file compiles again, rather than silently rendering nothing.
function assertNever(value: never): never {
  throw new Error(`Unhandled overlay presentation: ${JSON.stringify(value)}`);
}

/**
 * Runs a file's screens full-window with Craft disabled and every block's
 * real (non-design-mode) behavior live: the wired Button navigates, dialogs
 * open for real, inputs are typeable. Loaded only through
 * components/play/player-loader.tsx's client-only dynamic import - see that
 * file for why (importing components/blocks/registry, and so
 * @craftjs/core, from a module Next.js can reach while rendering a Server
 * Component crashes the same way known-types.ts documents for a route
 * handler; app/f/[id]/page.tsx's own components/workbench/workbench-loader.tsx
 * sidesteps it the same way for the design-mode editor). initialScreenId/
 * initialPageId are both optional and both raw, unvalidated caller input
 * (app/f/[id]/play/page.tsx passes the `screen`/`page` query params
 * straight through) - resolveInitialScreenId above is what actually makes
 * sense of them. initialOverlayId (overlay frames spec section 4: "the
 * Player accepts an optional initial overlay id") seeds the overlay stack
 * with that one overlay frame, open on top of the initial screen, and is
 * ignored unless it names an overlay frame of this file.
 */
export function Player({
  shared = false,
  closeTab = false,
  file,
  initialScreenId,
  initialPageId,
  initialOverlayId,
  grantedCapabilities = capabilities,
}: {
  shared?: boolean;
  closeTab?: boolean;
  file: FileRecord;
  initialScreenId?: string;
  initialPageId?: string;
  initialOverlayId?: string;
  grantedCapabilities?: readonly Capability[];
}) {
  const sharedConfig = shared ? file.sharedReview : undefined;
  const showReview = !shared || !!sharedConfig;
  const showNavigation = shared && !!sharedConfig?.navigation;
  const startScreenId = sharedConfig?.start ?? initialScreenId;
  const screens = useMemo(() => file.screens ?? [], [file.screens]);
  // Overlay frames are never the screen Play stands on, and never a
  // navigate target: they open on top of the current screen (any overlay
  // in the file, whichever page it lives on, is a valid target) and are
  // left out of every screen resolution below.
  const baseScreens = useMemo(() => screens.filter((screen) => !isOverlay(screen)), [screens]);
  const validScreenIds = useMemo(() => new Set(baseScreens.map((screen) => screen.id)), [baseScreens]);
  const overlaysById = useMemo(
    () => new Map<string, OverlayScreen>(screens.filter(isOverlay).map((screen) => [screen.id, screen])),
    [screens],
  );
  const [state, dispatch] = useReducer(playReducer, {
    currentScreenId: resolveInitialScreenId(baseScreens, file.pages, startScreenId, initialPageId) ?? '',
    history: [],
    openDialogIds: new Set<string>(),
    overlayStack: !shared && initialOverlayId !== undefined && overlaysById.has(initialOverlayId) ? [initialOverlayId] : [],
  });
  const [devicePreset, setDevicePreset] = useState<DevicePreset | null>(null);
  const [presentationZoom, setPresentationZoom] = useState(1);
  const [fitView, setFitView] = useState(true);
  const [displayPanelOpen, setDisplayPanelOpen] = useState(false);
  const [presentationView, setPresentationView] = useState<PresentationView>('design');
  const [composition, setComposition] = useState<PresentationComposition>('single');
  const [presentationViewport, setPresentationViewport] = useState<PresentationViewport>('desktop');
  const [canvasBackground, setCanvasBackground] = useState('#18161f');
  const [showDeviceFrame, setShowDeviceFrame] = useState(false);
  const [showScreenLabel, setShowScreenLabel] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const [overviewTitle, setOverviewTitle] = useState(file.name);
  const [saveMessage, setSaveMessage] = useState('');
  const [playbackKey, setPlaybackKey] = useState(0);
  const [commentStore] = useState(() => createCommentStore(file.id));
  const allThreads = useSyncExternalStore(commentStore.subscribe, commentStore.list, () => []);
  const [commentMode, setCommentMode] = useState(false);
  const [commentsPanelOpen, setCommentsPanelOpen] = useState(false);
  const [reviewPanelTab, setReviewPanelTab] = useState<'screens' | 'comments' | 'overview' | 'context'>('screens');
  const [overviewNotes, setOverviewNotes] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const [pendingPin, setPendingPin] = useState<PendingPin | null>(null);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [authorName, setAuthorNameState] = useState<string | null>(() => getAuthorName());
  const artboardRef = useRef<HTMLDivElement>(null);
  const [artboardRect, setArtboardRect] = useState<Rect | null>(null);
  const preset: Preset = sharedConfig?.preset ?? 'design';
  const displayTitle = sharedConfig?.title || overviewTitle;
  const allowed = (capability: Capability) => shared
    ? sharedConfig
      ? canUse(sharedConfig.capabilities.filter(cap => grantedCapabilities.includes(cap)), sharedConfig.preset, capability) && (showNavigation || capability !== 'search')
      : capability === 'prototype' && grantedCapabilities.includes(capability)
    : canUse(grantedCapabilities, preset, capability);
  const [reviewLoad] = useState(() => {
    if (shared) return { document: { version: 1 as const, artifacts: [] }, error: '' };
    try { return { document: loadReview(localStorage, file.id), error: '' }; }
    catch { return { document: { version: 1 as const, artifacts: [] }, error: 'Saved context could not be loaded. Existing storage has been preserved.' }; }
  });
  const [reviewArtifacts, setReviewArtifacts] = useState<ReviewArtifact[]>(reviewLoad.document.artifacts);
  const [contextStatus, setContextStatus] = useState(reviewLoad.error);
  const [pinnedContextId, setPinnedContextId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [focusEnabled, setFocusEnabled] = useState(false);
  const [prototypeEnabled, setPrototypeEnabled] = useState(true);
  const [compareScreenId, setCompareScreenId] = useState('');

  const visibleReviewArtifacts = shared && allowed('context.read') ? sharedConfig?.artifacts ?? [] : [];
  const artifacts = [...baseScreens.map(screen => visibleReviewArtifacts.find(artifact => artifact.id === `screen:${screen.id}`) ?? screenArtifact(screen)), ...visibleReviewArtifacts.filter(artifact => !artifact.id.startsWith('screen:'))];
  const currentArtifact = artifacts.find(artifact => artifact.id === activeArtifactId) ?? artifacts.find(artifact => artifact.id === `screen:${state.currentScreenId}`) ?? artifacts[0];
  const contextArtifact = artifacts.find(artifact => artifact.id === pinnedContextId) ?? currentArtifact;
  const comparisonId = compareScreenId === '__none' ? undefined : compareScreenId || (currentArtifact?.type === 'comparison' ? currentArtifact.screenIds.find(id => id !== state.currentScreenId) : undefined);
  const comparisonScreen = allowed('compare') ? baseScreens.find(screen => screen.id === comparisonId && screen.id !== state.currentScreenId) : undefined;
  const filteredArtifacts = searchArtifacts(artifacts, searchQuery);
  const updateArtifact = (artifact: ReviewArtifact) => {
    if (!allowed('context.edit')) return;
    setReviewArtifacts(previous => [...previous.filter(item => item.id !== artifact.id), artifact]);
    if (artifact.id === currentArtifact?.id && !artifact.screenIds.includes(state.currentScreenId)) {
      const source = artifact.screenIds.find(id => validScreenIds.has(id));
      if (source) dispatch({ type: 'navigate', screenId: source });
    }
    setContextStatus('Unsaved context');
  };
  const persistContext = () => {
    if (!allowed('context.edit')) return;
    if (reviewLoad.error) { setContextStatus('Saved context needs recovery before it can be overwritten. Your draft is still here.'); return; }
    try { saveReview(localStorage, file.id, { version: 1, artifacts: reviewArtifacts }); setContextStatus('Context saved in this browser.'); }
    catch { setContextStatus('Could not save context. Your draft is still here.'); }
  };


  // Ignores a navigate interaction whose stored targetScreenId names a
  // screen that no longer exists (deleted in the editor after the
  // interaction was set up): state is left exactly as it was, rather than
  // dispatching and letting the render-time `?? baseScreens[0]` fallback
  // below silently teleport to screen 1 while history/closeHref keep
  // pointing at the now-invalid id. An overlay frame's id is not a valid
  // target either.
  const navigate = useCallback(
    (screenId: string) => {
      if (!validScreenIds.has(screenId)) return;
      setActiveArtifactId(null);
      dispatch({ type: 'navigate', screenId });
    },
    [validScreenIds],
  );
  const back = useCallback(() => dispatch({ type: 'back' }), []);
  const openDialog = useCallback((nodeId: string) => dispatch({ type: 'openDialog', nodeId }), []);
  const closeDialog = useCallback((nodeId: string) => dispatch({ type: 'closeDialog', nodeId }), []);
  const isDialogOpen = useCallback((nodeId: string) => state.openDialogIds.has(nodeId), [state.openDialogIds]);
  // Same guard as navigate's, for the other two no-op cases the spec names
  // (section 3: "Opening an overlay that is a screen, or a missing id, is a
  // no-op"); "already in the stack" is the reducer's own check.
  const openOverlay = useCallback(
    (screenId: string) => {
      if (!overlaysById.has(screenId)) return;
      dispatch({ type: 'openOverlay', screenId });
    },
    [overlaysById],
  );
  const closeOverlay = useCallback(() => dispatch({ type: 'closeOverlay' }), []);
  const closeOverlayById = useCallback((screenId: string) => dispatch({ type: 'closeOverlay', screenId }), []);

  const play = useMemo<PlayContextValue>(
    () => ({ mode: 'play', navigate, back, openDialog, closeDialog, isDialogOpen, openOverlay, closeOverlay }),
    [navigate, back, openDialog, closeDialog, isDialogOpen, openOverlay, closeOverlay],
  );

  const currentScreen = baseScreens.find((screen) => screen.id === state.currentScreenId) ?? baseScreens[0];
  const secondaryScreen = comparisonScreen ?? baseScreens.find((screen) => screen.id !== currentScreen?.id);
  const savedLayoutCode = useMemo(() => {
    if (!currentScreen) return '';
    try {
      return JSON.stringify(JSON.parse(currentScreen.layout), null, 2);
    } catch {
      return currentScreen.layout;
    }
  }, [currentScreen]);
  const businessSummary = currentArtifact?.body || overviewNotes || 'No summary has been added yet.';
  const textArtifact = ['slide', 'requirement', 'decision', 'journey', 'flow'].includes(currentArtifact?.type);
  const closeHref = `/f/${file.id}#s=${state.currentScreenId}`;
  const topOverlay = state.overlayStack.length > 0 ? overlaysById.get(state.overlayStack[state.overlayStack.length - 1]) : undefined;
  const exitAboveOverlays = topOverlay !== undefined && !isDismissible(topOverlay.presentation);

  // Read by the Escape handler below instead of closing over
  // state.openDialogIds / state.overlayStack directly: that effect is only
  // re-subscribed when closeHref changes (a screen switch), not on every
  // dialog or overlay open/close, so a plain closure would go stale the
  // moment one opens or closes without a screen change.
  const openDialogIdsRef = useRef(state.openDialogIds);
  useEffect(() => {
    openDialogIdsRef.current = state.openDialogIds;
  }, [state.openDialogIds]);
  const overlayStackRef = useRef(state.overlayStack);
  useEffect(() => {
    overlayStackRef.current = state.overlayStack;
  }, [state.overlayStack]);

  // Written by an overlay wrapper's onEscapeKeyDown - Radix's own document-
  // level, capture-phase Escape listener, which runs before the window-
  // level bubble-phase one below - so that handler can tell "the Radix
  // layer that saw this Escape is one of OUR overlay frames" apart from
  // "it is a legacy inline Dialog block, which Radix has just dismissed on
  // its own". Both leave event.defaultPrevented true; only the former
  // should also touch the overlay stack. The event instance itself, not a
  // boolean: the window handler compares it with the event it is given, so
  // a keypress that never reaches window (something between stopping its
  // propagation) can never leave a stale flag behind for the next one.
  const escapeEventRef = useRef<KeyboardEvent | null>(null);
  const markEscapeSeenByOverlay = useCallback((event: KeyboardEvent) => {
    escapeEventRef.current = event;
  }, []);

  // Re-subscribed whenever closeHref changes (a screen switch) so the
  // handler always closes over the current link, rather than a ref written
  // during render - see workbench.tsx's own comment on why the latter trips
  // the react-hooks/refs lint rule and can even read stale in some cases.
  //
  // Escape with overlay frames open (spec section 4): closes the top
  // overlay if it is dismissible and otherwise does nothing - Play exits on
  // Escape only once the stack is empty. The overlay wrappers below prevent
  // Radix's own Escape dismiss (OverlayHost's onEscapeKeyDown) so this one
  // handler decides for the whole stack, whichever kind of overlay is on
  // top (a toast, which is no Radix layer at all, included).
  //
  // With the stack empty, today's rule for legacy inline dialogs stays:
  // Radix's Dialog dismisses on Escape via DismissableLayer's own
  // document-level, capture-phase listener, which runs before this
  // window-level bubble-phase one and calls event.preventDefault() when it
  // dismisses (see @radix-ui/react-dismissable-layer) - so on the very
  // keypress that closes a dialog, event.defaultPrevented is already true
  // by the time this handler sees it. openDialogIdsRef is a second,
  // independent check for any dialog left open by a path that did not
  // preventDefault. Either way, the first Escape closes only the dialog;
  // Play itself only exits once no dialog is open.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (isExpanded) {
        event.preventDefault();
        setIsExpanded(false);
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        requestAnimationFrame(() => expandButtonRef.current?.focus());
        return;
      }
      if (!event.defaultPrevented && focusEnabled) { setFocusEnabled(false); return; }
      const seenByOverlay = escapeEventRef.current === event;
      escapeEventRef.current = null;

      const stack = overlayStackRef.current;
      if (stack.length > 0) {
        // A legacy inline Dialog block (inside the screen, or inside an
        // overlay's own layout) that Radix just dismissed on this same
        // keypress was the top-most layer: leave the overlay stack alone.
        if (event.defaultPrevented && !seenByOverlay) return;
        const top = overlaysById.get(stack[stack.length - 1]);
        if (top && isDismissible(top.presentation)) dispatch({ type: 'closeOverlay' });
        return;
      }

      if (event.defaultPrevented || openDialogIdsRef.current.size > 0) return;
      if (!shared) exitPreview(closeHref, closeTab);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeHref, overlaysById, isExpanded, focusEnabled, shared, closeTab]);

  useEffect(() => {
    if (shared) return;
    try {
      const saved = JSON.parse(localStorage.getItem(`dreamscape:presentation-overview:${file.id}`) ?? 'null');
      if (saved && typeof saved.title === 'string' && typeof saved.notes === 'string') {
        // Hydrate browser-only metadata after SSR; subsequent edits stay in draft state.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOverviewTitle(saved.title); setOverviewNotes(saved.notes);
      }
    } catch { setSaveMessage('Saved overview could not be loaded.'); }
  }, [file.id, shared]);
  useEffect(() => {
    const update = () => {
      if (!document.fullscreenElement) {
        setIsExpanded(false);
        requestAnimationFrame(() => expandButtonRef.current?.focus());
      }
    };
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  const presentationWidth = devicePreset?.width ?? (presentationViewport === 'mobile' ? 390 : (currentScreen?.stageWidth ?? 0));
  const changeZoom = (value: number) => { setFitView(false); setPresentationZoom(Math.max(.1, Math.min(2, value))); };
  const presentationScale: PresentationScale = fitView ? 'fit' : String(presentationZoom) as PresentationScale;
  const changePresentationScale = (value: PresentationScale) => {
    if (value === 'fit') setFitView(true);
    else changeZoom(Number(value));
  };
  const changePresentationViewport = (value: PresentationViewport) => {
    setPresentationViewport(value);
    setDevicePreset(null);
    if (value === 'both') setComposition('side-by-side');
    setFitView(true);
  };
  const changePresentationDevice = (name: string) => {
    if (name === 'none') {
      setDevicePreset(null);
      setFitView(true);
      return;
    }
    const group = DEVICE_PRESET_GROUPS.find((candidate) => candidate.devices.some((device) => device.name === name));
    const device = group?.devices.find((candidate) => candidate.name === name);
    if (!device) return;
    setDevicePreset(device);
    const mobile = group?.group === 'Phone' || group?.group === 'Tablet';
    setPresentationViewport(mobile ? 'mobile' : 'desktop');
    setFitView(true);
  };
  const changeComposition = (value: PresentationComposition) => {
    setComposition(value);
    if (value === 'side-by-side' && !comparisonScreen && secondaryScreen) setCompareScreenId(secondaryScreen.id);
    if (value !== 'side-by-side') setCompareScreenId('__none');
    setFitView(true);
  };
  useLayoutEffect(() => {
    const host = previewRef.current;
    if (!host || !fitView) return;
    const secondaryWidth = composition === 'side-by-side'
      ? presentationViewport === 'both'
        ? 390
        : secondaryScreen?.stageWidth ?? 0
      : 0;
    const contentWidth = presentationWidth + secondaryWidth + Number(secondaryWidth > 0) * 32;
    const measure = () => setPresentationZoom(Math.max(.1, Math.min(1, (host.clientWidth - 64) / Math.max(1, contentWidth), (host.clientHeight - 64) / (devicePreset?.height ?? currentScreen?.stageHeight ?? ARTBOARD_MIN_HEIGHT))));
    const observer = new ResizeObserver(measure);
    observer.observe(host); measure();
    return () => observer.disconnect();
  }, [fitView, presentationWidth, devicePreset, currentScreen, commentsPanelOpen, displayPanelOpen, composition, presentationView, presentationViewport, secondaryScreen]);
  const resetPresentation = () => {
    dispatch({ type: 'reset', screenId: resolveInitialScreenId(baseScreens, file.pages, startScreenId, initialPageId) ?? currentScreen.id });
    setPresentationViewport('desktop');
    setDevicePreset(null);
    setPresentationView('design');
    setComposition('single');
    setCanvasBackground('#18161f');
    setShowDeviceFrame(false);
    setShowScreenLabel(false);
    setPresentationZoom(1); setFitView(true); setPlaybackKey((key) => key + 1);
    setCommentMode(false);
    setFocusEnabled(false); setCompareScreenId(''); setPrototypeEnabled(true);
    setPendingPin(null);
    setOpenThreadId(null);
  };
  const toggleExpanded = async () => {
    if (isExpanded) {
      setIsExpanded(false);
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      requestAnimationFrame(() => expandButtonRef.current?.focus());
    } else {
      setIsExpanded(true);
      // Embedded browsers may not support native fullscreen; expanded view still works.
      await document.documentElement.requestFullscreen?.().catch(() => {});
    }
  };
  const visibleThreads = (shared ? [] : allThreads).filter((thread) => !thread.screenId || thread.screenId === currentScreen.id);
  useLayoutEffect(() => {
    const element = artboardRef.current;
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      setArtboardRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, [state.currentScreenId, presentationViewport, presentationZoom, commentsPanelOpen, displayPanelOpen, devicePreset]);

  // Only reachable for a file whose screens array is empty (or holds
  // nothing but overlay frames), which validateScreens never allows in a
  // real saved file. The hook above must remain unconditional.
  if (!currentScreen) return null;
  const comparisonPreview = composition !== 'side-by-side'
    ? null
    : presentationViewport === 'both'
      ? {
          ariaLabel: `${currentScreen.name} mobile preview`,
          label: `${currentScreen.name} · Mobile`,
          screen: currentScreen,
          width: 390,
        }
      : secondaryScreen
        ? {
            ariaLabel: `Comparison: ${secondaryScreen.name}`,
            label: secondaryScreen.name,
            screen: secondaryScreen,
            width: secondaryScreen.stageWidth,
          }
        : null;
  const selectArtifact = (artifact: ReviewArtifact) => {
    setActiveArtifactId(artifact.id);
    const source = artifact.screenIds.find(id => validScreenIds.has(id));
    if (source) dispatch({ type: 'navigate', screenId: source });
    setFocusEnabled(false); setPendingPin(null); setOpenThreadId(null);
  };
  const artifactIndex = artifacts.indexOf(currentArtifact);
  const placeComment = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!commentMode || !allowed('comment') || !artboardRef.current) return;
    const rect = artboardRef.current.getBoundingClientRect();
    const point = toArtboardPoint(event.clientX, event.clientY, rect, presentationZoom);
    setPendingPin({ x: point.x, y: point.y });
  };

  return (
    <PlayProvider value={play}>
      <TooltipProvider delayDuration={300}>
      <div className="presentation-stage relative flex h-dvh flex-col overflow-hidden bg-canvas font-sans text-foreground">
        {showReview && !isExpanded && <header className="sticky top-0 z-[80] flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-line-soft bg-card/95 px-4 py-2 shadow-panel backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <div className="flex min-w-0 items-center gap-3">
            {shared ? <>
              <span className="hidden shrink-0 rounded-full border border-line-strong bg-(color:--chip) px-2.5 py-1 text-[11px] font-medium sm:inline-flex">{presets[preset].name}</span>
              <span className="min-w-0 truncate text-sm font-semibold tracking-tight">{displayTitle}</span>
              {currentScreen.name !== displayTitle && <span className="hidden truncate text-xs text-muted-foreground md:block">{currentScreen.name}</span>}
            </> : <>
              <span className="sr-only">Preview</span>
              <span className="min-w-0 truncate text-sm font-semibold tracking-tight">{currentScreen.name}</span>
              <span className="hidden text-sm text-muted-foreground sm:inline">· Presenting</span>
              <span className="hidden shrink-0 rounded-md border border-line-strong bg-(color:--chip) px-2 py-1 text-[11px] text-muted-foreground md:inline-flex">Read-only</span>
            </>}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1" aria-label="Presentation controls">
            <Tooltip><TooltipTrigger asChild><Button type="button" variant={presentationViewport === 'desktop' ? 'secondary' : 'ghost'} size="icon" aria-label="Desktop preview" aria-pressed={presentationViewport === 'desktop'} onClick={() => changePresentationViewport('desktop')}><MonitorIcon aria-hidden="true" /></Button></TooltipTrigger><TooltipContent className="z-[110]">Desktop preview</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button type="button" variant={presentationViewport === 'mobile' ? 'secondary' : 'ghost'} size="icon" aria-label="Mobile preview" aria-pressed={presentationViewport === 'mobile'} onClick={() => changePresentationViewport('mobile')}><SmartphoneIcon aria-hidden="true" /></Button></TooltipTrigger><TooltipContent className="z-[110]">Mobile preview</TooltipContent></Tooltip>
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" aria-label="Scale">{fitView ? 'Fit' : `${Math.round(presentationZoom * 100)}%`} <ChevronDownIcon className="size-3" aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent className="z-[100] min-w-40" align="end"><DropdownMenuItem onSelect={() => setFitView(true)}>Fit to window</DropdownMenuItem>{PRESENTATION_ZOOM_LEVELS.map((zoom) => <DropdownMenuItem key={zoom} onSelect={() => changeZoom(zoom)}>{zoom * 100}%</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Presentation options"><MoreHorizontalIcon aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent className="z-[100] min-w-52" align="end"><DropdownMenuItem onSelect={resetPresentation}>Restart walkthrough</DropdownMenuItem>
              {allowed('focus') && <DropdownMenuItem onSelect={() => { setFocusEnabled(value => !value); setCommentMode(false); }}>{focusEnabled ? 'Exit Focus' : 'Focus component'}</DropdownMenuItem>}
              {allowed('prototype') && <DropdownMenuItem onSelect={() => setPrototypeEnabled(value => !value)}>{prototypeEnabled ? 'Pause prototype' : 'Resume prototype'}</DropdownMenuItem>}
              {allowed('compare') && baseScreens.length > 1 && <><DropdownMenuSeparator /><DropdownMenuLabel>Compare with</DropdownMenuLabel>{comparisonScreen && <DropdownMenuItem onSelect={() => setCompareScreenId('__none')}>Stop comparing</DropdownMenuItem>}{baseScreens.filter(screen => screen.id !== currentScreen.id).map(screen => <DropdownMenuItem key={screen.id} onSelect={() => setCompareScreenId(screen.id)}>{screen.name}</DropdownMenuItem>)}</>}
              {showNavigation && allowed('prototype') && baseScreens.length > 1 && <><DropdownMenuSeparator /><DropdownMenuLabel>Go to screen</DropdownMenuLabel>{baseScreens.filter(screen => screen.id !== currentScreen.id).map(screen => <DropdownMenuItem key={screen.id} onSelect={() => navigate(screen.id)}>{screen.name}</DropdownMenuItem>)}</>}</DropdownMenuContent></DropdownMenu>
            {shared && allowed('context.read') && <Button size="sm" variant="ghost" onClick={() => { setReviewPanelTab('context'); setCommentsPanelOpen(true); }}>Context</Button>}
            {shared && showNavigation && artifacts.length > 1 && <Button type="button" variant={commentsPanelOpen ? 'secondary' : 'ghost'} size="sm" onClick={() => { setCommentsPanelOpen((value) => !value); }} aria-pressed={commentsPanelOpen}>
              <PanelRightIcon className="size-4" aria-hidden="true" /> Browse
            </Button>}
            {!shared && <Tooltip><TooltipTrigger asChild><Button type="button" variant={displayPanelOpen ? 'secondary' : 'ghost'} size="icon" aria-label="Display and layout" aria-pressed={displayPanelOpen} onClick={() => setDisplayPanelOpen((value) => !value)}><SlidersHorizontalIcon aria-hidden="true" /></Button></TooltipTrigger><TooltipContent className="z-[110]">Display &amp; layout</TooltipContent></Tooltip>}
            <Tooltip><TooltipTrigger asChild><Button ref={expandButtonRef} type="button" variant="ghost" size="icon" aria-label="Expand presentation" onClick={() => void toggleExpanded()}><MaximizeIcon aria-hidden="true" /></Button></TooltipTrigger><TooltipContent className="z-[110]">Expand presentation</TooltipContent></Tooltip>
            {!shared && <a href={closeHref} onClick={event => { event.preventDefault(); exitPreview(closeHref, closeTab); }} className={cn("ml-1 rounded border px-3 py-1.5 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", exitAboveOverlays && "pointer-events-auto")}>Exit</a>}
          </div>
        </header>}
        {showReview && isExpanded && <Button autoFocus type="button" variant="secondary" size="sm" className="pointer-events-auto absolute right-4 top-4 z-[110] gap-2 border shadow-lg" aria-label="Exit expanded view" onClick={() => void toggleExpanded()}><MinimizeIcon aria-hidden="true" className="size-4" /> Back to presentation</Button>}
        {showReview && !isExpanded && (focusEnabled || comparisonScreen || !prototypeEnabled) && <div className="relative z-[80] flex flex-wrap items-center gap-2 border-b bg-card px-4 py-2 text-xs">{focusEnabled && <Button size="sm" variant="outline" onClick={() => setFocusEnabled(false)}>Exit Focus</Button>}{comparisonScreen && <Button size="sm" variant="outline" onClick={() => setCompareScreenId('__none')}>Close comparison</Button>}{!prototypeEnabled && allowed('prototype') && <Button size="sm" variant="outline" onClick={() => setPrototypeEnabled(true)}>Resume prototype</Button>}</div>}
        {showReview && !isExpanded && saveMessage && <div role="status" className="px-4 py-2 text-xs text-muted-foreground">{saveMessage}</div>}
        <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1 overflow-auto p-4 sm:p-8" style={{ backgroundColor: canvasBackground }} aria-label="Presentation preview">
          {composition === 'flow' || composition === 'grid' ? (
            <section className="m-auto w-full max-w-6xl" aria-label={`${composition === 'flow' ? 'Flow' : 'Grid'} layout`}>
              <div className={cn(composition === 'grid' ? 'grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-5' : 'flex items-start gap-5 overflow-x-auto pb-4')}>
                {baseScreens.map((screen, index) => (
                  <button key={screen.id} type="button" className={cn('min-w-64 rounded-lg border bg-card p-3 text-left shadow-panel transition-colors hover:border-ring', screen.id === currentScreen.id ? 'border-ring' : 'border-line-soft')} onClick={() => { navigate(screen.id); setComposition('single'); }}>
                    <span className="mb-2 block text-xs text-muted-foreground">{composition === 'flow' ? `${index + 1}. ` : ''}{screen.name}</span>
                    <ScreenThumbnail screen={screen} fileAppearance={file.appearance ?? 'light'} />
                  </button>
                ))}
              </div>
            </section>
          ) : <>
          <div className="flex h-full w-full min-w-0 max-w-full items-stretch gap-8 overflow-hidden">
            {presentationView === 'business' && (
              <aside className="w-72 shrink-0 rounded-lg border border-line-soft bg-card p-6 shadow-panel" aria-label="Business summary">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{currentArtifact?.type ?? 'screen'}</p>
                <h1 className="mt-2 text-2xl font-semibold">{currentScreen.name}</h1>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{businessSummary}</p>
              </aside>
            )}
            <div ref={previewRef} className="flex min-w-0 flex-1 items-center overflow-auto">
            <div className="mx-auto flex w-max shrink-0 items-start gap-8" style={{ zoom: presentationZoom }}>
            {textArtifact && <article className="max-w-2xl space-y-4 rounded border bg-card p-8" aria-label={`${currentArtifact.type} content`}><p className="text-sm capitalize text-muted-foreground">{currentArtifact.type}</p><h1 className="text-2xl font-semibold">{currentArtifact.title}</h1><p className="whitespace-pre-wrap">{currentArtifact.body || (shared ? 'No content provided.' : 'Add content in Context.')}</p><ol className="space-y-2">{currentArtifact.screenIds.map(id => { const source = baseScreens.find(screen => screen.id === id); return <li key={id}>{source ? <Button variant="outline" onClick={() => navigate(id)}>{source.name}</Button> : <span>Source unavailable: {id}</span>}</li>; })}</ol></article>}
            {!textArtifact && !currentArtifact.screenIds.includes(currentScreen.id) && <p className="rounded border bg-card p-6">{shared ? 'Referenced source is unavailable.' : 'Source unavailable. Choose a related screen in Context.'}</p>}
            <div hidden={!currentArtifact.screenIds.includes(currentScreen.id)}>
            {showScreenLabel && <p className="mb-2 text-sm font-medium text-white/80">{currentScreen.name}</p>}
            <StageProvider key={`${state.currentScreenId}-${presentationViewport}-${playbackKey}`} initialWidth={presentationWidth}>
              <div
                ref={artboardRef}
                data-testid="artboard"
                data-appearance={currentScreen.appearance ?? file.appearance ?? 'light'}
                className={cn('theme-basic relative shrink-0 bg-background text-foreground shadow-panel-lg ring-1 ring-line-strong', showDeviceFrame && 'rounded-2xl ring-8 ring-black', (devicePreset?.height ?? currentScreen.stageHeight) != null && 'overflow-auto')}
                style={
                  (devicePreset?.height ?? currentScreen.stageHeight) != null
                    ? { width: presentationWidth, height: devicePreset?.height ?? currentScreen.stageHeight ?? undefined }
                    : { width: presentationWidth, minHeight: ARTBOARD_MIN_HEIGHT }
                }
                inert={(!prototypeEnabled || !allowed('prototype')) && !(focusEnabled && allowed('focus')) && !(commentMode && allowed('comment'))}
                onClickCapture={(event) => {
                  if (commentMode && allowed('comment')) { event.preventDefault(); event.stopPropagation(); }
                  placeComment(event);
                }}
              >
                <Editor resolver={resolver} enabled={false} handlers={store => new PresentationHandlers({ store, removeHoverOnMouseleave: false })}>
                  <Frame key={state.currentScreenId} data={currentScreen.layout} />
                  {focusEnabled && allowed('focus') && <FocusLayer key={`${state.currentScreenId}-${presentationZoom}`} />}
                </Editor>
              </div>
            </StageProvider>
            </div>
            {comparisonPreview && (
              <StaticScreenPreview
                key={`${comparisonPreview.screen.id}-${comparisonPreview.width}`}
                {...comparisonPreview}
                fileAppearance={file.appearance ?? 'light'}
                showDeviceFrame={showDeviceFrame}
                showScreenLabel={showScreenLabel}
              />
            )}
            </div>
            </div>
            {presentationView === 'development' && (
              <aside className="flex w-[40%] min-w-72 max-w-xl shrink-0 flex-col overflow-hidden rounded-lg border border-line-soft bg-[#111018] shadow-panel" aria-label="Code">
                <div className="border-b border-line-soft px-4 py-3">
                  <h2 className="text-sm font-semibold">Code</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Saved Dreamscape component structure</p>
                </div>
                <pre className="min-h-0 flex-1 overflow-auto p-4 text-xs leading-5 text-[#d6d0ff]"><code>{savedLayoutCode}</code></pre>
              </aside>
            )}
          </div>
          {!shared && <CommentLayer
            commentMode={commentMode && allowed('comment') && !textArtifact}
            threads={allowed('comment') && !textArtifact ? visibleThreads : []}
            pendingPin={allowed('comment') ? pendingPin : null}
            openThreadId={allowed('comment') ? openThreadId : null}
            authorName={authorName}
            zoom={presentationZoom}
            artboardRect={artboardRect}
            onPlacePin={() => {}}
            onCancelPending={() => setPendingPin(null)}
            onSubmitComment={({ author, text }) => {
              if (!pendingPin || !allowed('comment')) return;
              if (!authorName) { setAuthorName(author); setAuthorNameState(author); }
              commentStore.add({ x: pendingPin.x, y: pendingPin.y, pageId: currentScreen.pageId, screenId: currentScreen.id, author, text });
              setPendingPin(null);
              setCommentMode(false);
            }}
            onPinClick={(id) => { setPendingPin(null); setOpenThreadId(id); }}
            onCloseThread={() => setOpenThreadId(null)}
            onSubmitReply={(threadId, { author, text }) => { commentStore.reply(threadId, { author, text }); }}
            onResolveThread={(threadId) => { commentStore.resolve(threadId); setOpenThreadId(null); }}
          />}
          </>}
        {/* Overlay frames, bottom to top, each a sibling of the screen's
            Editor (never inside it) with its own StageProvider and Editor.
            Array order is stacking order: Radix layers dialogs and sheets
            in mount order, toasts sit above both by z-index. */}
        {state.overlayStack.map((id) => {
          const overlay = overlaysById.get(id);
          return overlay ? (
            <OverlayHost
              fileAppearance={file.appearance ?? 'light'}
              key={id}
              overlay={overlay}
              closeOverlayById={closeOverlayById}
              onEscapeKeyDown={markEscapeSeenByOverlay}
            />
          ) : null;
        })}
        </main>
        {!shared && displayPanelOpen && !isExpanded && (
          <PresentationLayoutPanel
            background={canvasBackground}
            composition={composition}
            deviceGroups={DEVICE_PRESET_GROUPS}
            deviceName={devicePreset?.name ?? 'none'}
            onBackgroundChange={setCanvasBackground}
            onClose={() => setDisplayPanelOpen(false)}
            onCompositionChange={changeComposition}
            onDeviceChange={changePresentationDevice}
            onReset={resetPresentation}
            onScaleChange={changePresentationScale}
            onScreenChange={navigate}
            onShowDeviceFrameChange={setShowDeviceFrame}
            onShowScreenLabelChange={setShowScreenLabel}
            onViewChange={setPresentationView}
            onViewportChange={changePresentationViewport}
            scale={presentationScale}
            screenId={currentScreen.id}
            screens={baseScreens}
            showDeviceFrame={showDeviceFrame}
            showScreenLabel={showScreenLabel}
            view={presentationView}
            viewport={presentationViewport}
          />
        )}
        {shared && showReview && commentsPanelOpen && !isExpanded && (
          <aside className="fixed inset-x-0 bottom-0 z-[85] max-h-[72dvh] overflow-y-auto rounded-t-2xl border border-line-soft bg-card p-5 shadow-xl lg:static lg:z-auto lg:max-h-none lg:w-96 lg:rounded-none lg:border-0 lg:border-l lg:shadow-none" aria-label={shared ? 'Review context' : 'Review'}>
            <div className="sticky top-0 z-10 mb-4 flex items-start justify-between gap-3 bg-card pb-2">
              <div>
                <h2 className="whitespace-nowrap text-sm font-semibold">{shared ? 'Context' : 'Review'}</h2>
                <p className="mt-1 whitespace-nowrap text-xs text-muted-foreground">{presets[preset].name}</p>
              </div>
              {reviewPanelTab === 'comments' && allowed('comment') && <Button type="button" variant={commentMode ? 'secondary' : 'outline'} size="sm" onClick={() => { setCommentMode((value) => !value); setPendingPin(null); }} aria-pressed={commentMode}>
                {commentMode ? 'Cancel pin' : 'Place comment'}
              </Button>}
              <Button variant="ghost" size="icon" aria-label="Close review panel" onClick={() => setCommentsPanelOpen(false)}><XIcon /></Button>
            </div>
            {sharedConfig?.introduction && <p className="mb-4 whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">{sharedConfig.introduction}</p>}
            {(!shared || showNavigation) && <div className="mb-4 flex flex-wrap gap-1 rounded-md bg-(color:--chip) p-1" role="group" aria-label="Review panel">
              {([...(showNavigation ? ['screens' as const] : []), ...(allowed('comment') ? ['comments' as const] : []), ...(allowed('context.read') ? [...(!shared ? ['overview' as const] : []), 'context' as const] : [])] as const).map((tab) => (
                <button key={tab} type="button" aria-pressed={reviewPanelTab === tab} className={cn('rounded px-2 py-1.5 text-[11px] capitalize', reviewPanelTab === tab ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')} onClick={() => setReviewPanelTab(tab)}>{tab}</button>
              ))}
            </div>}
            {reviewPanelTab === 'context' && allowed('context.read') ? <ReviewContextEditor shared={shared} preset={preset} pinnable={artifacts.length > 1} sources={baseScreens} artifact={contextArtifact} editable={allowed('context.edit')} pinned={pinnedContextId !== null} onPin={() => setPinnedContextId(pinnedContextId ? null : contextArtifact.id)} onChange={updateArtifact} onSave={persistContext} status={contextStatus} /> : reviewPanelTab === 'screens' && showNavigation ? (
              <div className="space-y-2">
                {allowed('search') && <label className="block text-xs">Search content and context<input type="search" className="mt-1 w-full rounded border bg-background p-2" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} /></label>}
                {filteredArtifacts.length === 0 && <p role="status">No matching content.</p>}
                {allowed('context.edit') && <Button size="sm" variant="outline" onClick={() => {
                  const artifact = { ...screenArtifact({ id: currentScreen.id, name: 'New review content' }), id: `artifact:${crypto.randomUUID()}`, type: 'slide' as const, screenIds: [] };
                  updateArtifact(artifact); setActiveArtifactId(artifact.id); setReviewPanelTab('context');
                }}>Add content</Button>}
                {filteredArtifacts.filter(artifact => !artifact.id.startsWith('screen:')).map(artifact => <Button key={artifact.id} className="w-full justify-start" variant="outline" onClick={() => selectArtifact(artifact)}>{artifact.title} · {artifact.type}</Button>)}
                {(file.pages?.length ? file.pages : [{ id: undefined, name: 'Screens' }]).map((page) => <section key={page.id ?? 'screens'} className="space-y-2"><h3 className="pt-3 text-xs font-medium text-muted-foreground">{page.name}</h3>{baseScreens.filter((screen) => (!page.id || screen.pageId === page.id) && filteredArtifacts.some(artifact => artifact.screenIds.includes(screen.id))).map((screen) => <button key={screen.id} type="button" className={cn('w-full rounded-md border p-3 text-left text-sm', screen.id === currentScreen.id ? 'border-ring bg-accent' : 'border-line-soft bg-(color:--chip)')} onClick={() => selectArtifact(artifacts.find(artifact => artifact.id === `screen:${screen.id}`)!)}><ScreenThumbnail screen={screen} fileAppearance={file.appearance ?? 'light'} /><span className="mt-3 block font-medium">{screen.name}</span><span className="mt-1 block text-xs text-muted-foreground">{screen.stageWidth} px{screen.id === currentScreen.id ? ' · Viewing now' : ' · Open screen'}</span></button>)}</section>)}
              </div>
            ) : reviewPanelTab === 'overview' && !shared ? (
              <div className="space-y-3 text-xs"><label className="block"><span className="text-t4">Presentation title</span><input className="mt-1 h-9 w-full rounded-md border border-line-soft bg-(color:--chip) px-2 text-t2" readOnly={!allowed('context.edit')} value={overviewTitle} onChange={(event) => setOverviewTitle(event.target.value)} /></label><label className="block"><span className="text-t4">Presenter notes</span><textarea readOnly={!allowed('context.edit')} value={overviewNotes} onChange={(event) => setOverviewNotes(event.target.value)} placeholder="Add context for reviewers…" className="mt-1 min-h-24 w-full rounded-md border border-line-soft bg-(color:--chip) p-2 text-t2" /></label><dl className="space-y-3 border-t border-line-soft pt-3"><div><dt className="text-t4">Page</dt><dd className="mt-1 text-t2">{file.pages?.find((page) => page.id === currentScreen.pageId)?.name ?? 'Page 1'}</dd></div><div><dt className="text-t4">Screen</dt><dd className="mt-1 text-t2">{currentScreen.name}</dd></div><div><dt className="text-t4">Viewport</dt><dd className="mt-1 text-t2">{presentationWidth} px · {devicePreset?.name ?? presentationViewport}</dd></div><div><dt className="text-t4">Status</dt><dd className="mt-1 text-ok">Read-only</dd></div></dl><Button disabled={!allowed('context.edit')} type="button" size="sm" onClick={() => { if (!allowed('context.edit')) return; try { localStorage.setItem(`dreamscape:presentation-overview:${file.id}`, JSON.stringify({ title: overviewTitle, notes: overviewNotes })); setSaveMessage('Overview saved in this browser.'); } catch { setSaveMessage('Could not save overview. Your draft is still here.'); } }}>Save overview</Button><p className="text-muted-foreground">Saved on this browser. Shared viewers do not receive these notes.</p></div>
            ) : shared ? (<p className="text-sm text-muted-foreground">Select Context to read shared notes. Page navigation is disabled for this review.</p>) : visibleThreads.length === 0 ? (
              <div className="rounded-md border border-dashed border-line-strong p-4 text-xs text-t4">
                No comments on this screen yet.
              </div>
            ) : (
              <div className="space-y-3">
                {visibleThreads.map((thread) => (
                  <button key={thread.id} type="button" className="w-full rounded-md border border-line-soft bg-(color:--chip) p-3 text-left hover:border-line-strong" onClick={() => setOpenThreadId(thread.id)}>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-t4"><span>{thread.author}</span><span>{new Date(thread.createdAt).toLocaleDateString()}</span></div>
                    <p className="mt-1 line-clamp-3 text-sm text-t2">{thread.text}</p>
                    {thread.replies.length > 0 && <span className="mt-2 block text-[11px] text-t4">{thread.replies.length} {thread.replies.length === 1 ? 'reply' : 'replies'}</span>}
                  </button>
                ))}
              </div>
            )}
          </aside>
        )}
        </div>
        {showNavigation && artifacts.length > 1 && !isExpanded && <nav aria-label="Story navigation" className="relative z-[80] flex shrink-0 items-center justify-center gap-3 border-t bg-card p-2"><Button size="sm" variant="ghost" disabled={artifactIndex <= 0} onClick={() => selectArtifact(artifacts[artifactIndex - 1])}>Previous</Button><span className="text-xs">{artifactIndex + 1} / {artifacts.length}</span><Button size="sm" variant="ghost" disabled={artifactIndex >= artifacts.length - 1} onClick={() => selectArtifact(artifacts[artifactIndex + 1])}>Next</Button></nav>}
      </div>
      </TooltipProvider>
    </PlayProvider>
  );
}

// 16 px from the edges (Tailwind's 4 = 1rem), centred variants pulled back
// by half their own width.
const TOAST_POSITION_CLASSES: Record<ToastPosition, string> = {
  'top-left': 'top-4 left-4',
  'top-center': 'top-4 left-1/2 -translate-x-1/2',
  'top-right': 'top-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
  'bottom-right': 'bottom-4 right-4',
};

/**
 * One open overlay frame (spec section 4): the overlay's layout in its own
 * StageProvider (initial width = the overlay's stageWidth, so its blocks
 * respond to THAT width, not the screen's) and its own disabled Editor +
 * Frame, wrapped by the presentation - a shadcn Dialog, a shadcn Sheet on
 * its side, or a fixed toast card. Every wrapper uses `p-0` so the layout's
 * own ROOT padding is the overlay's padding, exactly as designed.
 *
 * Interactions inside the overlay run through the same runner as the
 * screen's, with one rebinding: a Close overlay interaction fired from in
 * here closes THIS overlay, not whatever happens to be top of the stack
 * (a toast shown above a dialog must not swallow the dialog's own Cancel).
 */
function OverlayHost({
  fileAppearance,
  overlay,
  closeOverlayById,
  onEscapeKeyDown,
}: {
  fileAppearance: 'light' | 'dark';
  overlay: OverlayScreen;
  closeOverlayById: (screenId: string) => void;
  onEscapeKeyDown: (event: KeyboardEvent) => void;
}) {
  const play = usePlay();
  const close = useCallback(() => closeOverlayById(overlay.id), [closeOverlayById, overlay.id]);
  const boundPlay = useMemo<PlayContextValue>(() => ({ ...play, closeOverlay: close }), [play, close]);

  const presentation = overlay.presentation;
  const dismissible = isDismissible(presentation);

  // Radix handles Escape on its top-most layer itself; the Player's window
  // listener decides what Escape does to the overlay STACK (see
  // markEscapeSeenByOverlay there), so every dialog/sheet overlay flags the
  // event for it and prevents Radix's own dismiss - dismissible or not.
  const handleEscapeKeyDown = (event: KeyboardEvent) => {
    onEscapeKeyDown(event);
    event.preventDefault();
  };
  // A pointer down or focus outside closes a dismissible overlay (Radix
  // then calls onOpenChange(false)) and is ignored by a non-dismissible one.
  // Either way, one that lands on a toast overlay sitting above this one is
  // not "outside" in any sense the visitor means - see isInsideToastOverlay.
  // onInteractOutside alone covers both the pointer and the focus case
  // (Radix fires it right after onPointerDownOutside for a pointer).
  const handleInteractOutside = (event: Event) => {
    if (!dismissible || isInsideToastOverlay(event.target)) event.preventDefault();
  };
  const handleOpenChange = (open: boolean) => {
    if (!open && dismissible) close();
  };

  const artboard = (
    <StageProvider initialWidth={overlay.stageWidth}>
      <div
        data-testid={`overlay-artboard-${overlay.id}`}
        className={cn('relative w-full bg-background text-foreground', overlay.stageHeight != null && 'overflow-auto')}
        style={overlay.stageHeight != null ? { height: overlay.stageHeight } : { minHeight: OVERLAY_MIN_HEIGHT }}
      >
        <Editor resolver={resolver} enabled={false}>
          <Frame data={overlay.layout} />
        </Editor>
      </div>
    </StageProvider>
  );

  let content: ReactNode;
  switch (presentation.type) {
    case 'sheet': {
      // Left/right sheets take the overlay's width, capped at the window
      // (replacing the primitive's own sm:max-w-sm, and capped below sm
      // too, where it has no cap at all); top/bottom sheets ignore the
      // width and span the viewport (spec section 2).
      const horizontal = presentation.side === 'left' || presentation.side === 'right';
      content = (
        <Sheet open modal onOpenChange={handleOpenChange}>
          <SheetContent
            side={presentation.side}
            data-overlay-id={overlay.id}
            data-appearance={overlay.appearance ?? fileAppearance}
            className={cn(
              'theme-basic gap-0 overflow-auto p-0 text-foreground',
              horizontal &&
                'data-[side=left]:max-w-full data-[side=left]:sm:max-w-full data-[side=right]:max-w-full data-[side=right]:sm:max-w-full',
            )}
            style={horizontal ? { width: overlay.stageWidth } : undefined}
            showCloseButton={dismissible}
            aria-describedby={undefined}
            onEscapeKeyDown={handleEscapeKeyDown}
            onInteractOutside={handleInteractOutside}
          >
            <SheetTitle className="sr-only">{overlay.name}</SheetTitle>
            {artboard}
          </SheetContent>
        </Sheet>
      );
      break;
    }
    case 'toast': {
      content = (
        <div
          role="status"
          aria-label={overlay.name}
          data-overlay-toast="true"
          data-overlay-id={overlay.id}
            data-appearance={overlay.appearance ?? fileAppearance}
          className={cn(
            'theme-basic pointer-events-auto fixed z-[60] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border bg-background text-foreground shadow-lg',
            TOAST_POSITION_CLASSES[presentation.position],
          )}
          style={{ width: overlay.stageWidth }}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close overlay"
            className="absolute top-2 right-2 z-10"
            onClick={close}
          >
            <XIcon />
          </Button>
          {artboard}
        </div>
      );
      break;
    }
    case 'dialog': {
      // Capped at the window on both axes and scrolling inside itself: a
      // hug-content dialog taller than the window could not be reached
      // otherwise, since Radix locks the page behind a modal.
      content = (
        <Dialog open modal onOpenChange={handleOpenChange}>
          <DialogContent
            data-overlay-id={overlay.id}
            data-appearance={overlay.appearance ?? fileAppearance}
            className="theme-basic max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] gap-0 overflow-y-auto p-0 text-foreground sm:max-w-[calc(100vw-2rem)]"
            style={{ width: overlay.stageWidth }}
            showCloseButton={dismissible}
            aria-describedby={undefined}
            onEscapeKeyDown={handleEscapeKeyDown}
            onInteractOutside={handleInteractOutside}
          >
            <DialogTitle className="sr-only">{overlay.name}</DialogTitle>
            {artboard}
          </DialogContent>
        </Dialog>
      );
      break;
    }
    default:
      content = assertNever(presentation);
  }

  return <PlayProvider value={boundPlay}>{content}</PlayProvider>;
}


function StaticScreenPreview({
  ariaLabel,
  fileAppearance,
  label,
  screen,
  showDeviceFrame,
  showScreenLabel,
  width,
}: {
  ariaLabel: string;
  fileAppearance: 'light' | 'dark';
  label: string;
  screen: Screen;
  showDeviceFrame: boolean;
  showScreenLabel: boolean;
  width: number;
}) {
  return (
    <section aria-label={ariaLabel} className="shrink-0">
      {showScreenLabel && <h2 className="mb-2 text-sm font-semibold text-white/80">{label}</h2>}
      <div inert>
        <StageProvider initialWidth={width}>
          <div
            className={cn(
              'theme-basic bg-background shadow-panel-lg ring-1 ring-line-strong',
              showDeviceFrame && 'rounded-2xl ring-8 ring-black',
            )}
            data-appearance={screen.appearance ?? fileAppearance}
            style={{ width, minHeight: screen.stageHeight ?? ARTBOARD_MIN_HEIGHT }}
          >
            <Editor resolver={resolver} enabled={false}>
              <Frame data={screen.layout} />
            </Editor>
          </div>
        </StageProvider>
      </div>
    </section>
  );
}

/** Reuses the editor canvas so responsive styles use the screen dimensions. */
function ScreenThumbnail({ screen, fileAppearance }: { screen: Screen; fileAppearance: 'light' | 'dark' }) {
  const width = Math.max(1, screen.stageWidth);
  const height = screen.stageHeight ?? ARTBOARD_MIN_HEIGHT;
  const scale = Math.min(272 / width, 144 / Math.max(1, height));
  return (
    <span aria-hidden="true" inert className="pointer-events-none flex h-36 w-full items-center justify-center overflow-hidden rounded border border-white/10 bg-white/5">
      <span className="block shrink-0 overflow-hidden" style={{ width: width * scale, height: height * scale }}>
        <StageProvider initialWidth={width}>
          <Editor resolver={resolver} enabled={false}>
            <CanvasFrame appearance={screen.appearance ?? fileAppearance} width={width} height={height} zoom={scale} reportDocument={false} title={`Preview of ${screen.name}`}>
              <Frame data={screen.layout} />
            </CanvasFrame>
          </Editor>
        </StageProvider>
      </span>
    </span>
  );
}
