import { Editor, Frame, ROOT_NODE, useEditor, type Indicator } from '@craftjs/core';
import { useEffect } from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/blocks/button';
import { emptyLayoutJson, resolver } from '@/components/blocks/registry';
import { StageProvider, useStage } from './stage-context';
import { useDropPlaceholder } from './drop-placeholder';

// The Editor config workbench.tsx itself will use (see workbench.tsx's
// <Editor indicator={...}>) - reproduced here rather than imported, so this
// file exercises the exact same values without depending on workbench.tsx's
// own (much heavier) render tree.
const INDICATOR_COLORS = { success: 'transparent', error: 'var(--bad)' };

type Handle = {
  store: ReturnType<typeof useEditor>['store'];
  actions: ReturnType<typeof useEditor>['actions'];
  query: ReturnType<typeof useEditor>['query'];
  setCanvasDocument: ReturnType<typeof useStage>['setCanvasDocument'];
};

// Mounts useDropPlaceholder() (the hook under test) alongside a probe that
// hands the test direct access to Craft's store/actions/query - including
// `store.actions.setNodeEvent`, which useEditor()'s own public `actions`
// deliberately omits (see @craftjs/core's WithoutPrivateActions) but which
// Craft's real `drag` connector calls internally to mark a node "dragged";
// using it here is more direct and deterministic than simulating a real
// native drag-and-drop gesture end to end in jsdom.
function Probe({ onReady }: { onReady: (handle: Handle) => void }) {
  const { store, actions, query } = useEditor();
  const { setCanvasDocument } = useStage();
  useDropPlaceholder();
  useEffect(() => {
    onReady({ store, actions, query, setCanvasDocument });
  });
  return null;
}

function setup() {
  let handle: Handle | null = null;
  const utils = render(
    <Editor resolver={resolver} enabled indicator={INDICATOR_COLORS}>
      <StageProvider>
        <Probe onReady={(h) => (handle = h)} />
        <Frame data={emptyLayoutJson()} />
      </StageProvider>
    </Editor>,
  );
  const handleFn = () => {
    if (!handle) throw new Error('editor not mounted');
    return handle;
  };
  // A flex row by default (getComputedStyle reflects real inline styles in
  // jsdom with no stubbing needed) - individual tests override this for
  // column/grid coverage.
  const root = handleFn().query.node(ROOT_NODE).get();
  root.dom!.style.display = 'flex';
  root.dom!.style.flexDirection = 'row';
  return { ...utils, handle: handleFn };
}

function addButton(handle: Handle, label: string): string {
  const tree = handle.query.parseReactElement(<Button label={label} />).toNodeTree();
  act(() => {
    handle.actions.addNodeTree(tree, ROOT_NODE);
  });
  return tree.rootNodeId;
}

function placeholderOf(root: HTMLElement): HTMLElement | null {
  return root.querySelector('[data-drop-placeholder]');
}

function placeholdersOf(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll('[data-drop-placeholder]'));
}

// --- getBoundingClientRect stubbing -----------------------------------
// jsdom has no layout engine (every real box is 0x0 at 0,0) - individual
// tests that care about a specific element's box register one here, keyed
// by the element itself so it survives being moved/reparented.
const rectMap = new WeakMap<Element, Partial<DOMRect>>();
const ZERO_RECT: DOMRect = {
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
  x: 0,
  y: 0,
  toJSON: () => ({}),
};
function setRect(element: Element, rect: Partial<DOMRect>): void {
  rectMap.set(element, rect);
}

// --- Element.prototype.animate stubbing --------------------------------
// jsdom does not implement the Web Animations API. Each call records a
// controllable fake `Animation` (a real Promise for `finished`, resolved/
// rejected explicitly by a test) so tests can assert `.animate()` was
// invoked and drive completion/cancellation deterministically.
interface FakeAnimation {
  cancel: ReturnType<typeof vi.fn>;
  finished: Promise<void>;
  resolveFinished: () => void;
}
let animateCalls: FakeAnimation[] = [];

function installStubs() {
  animateCalls = [];
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return { ...ZERO_RECT, ...rectMap.get(this) };
  });
  Element.prototype.animate = vi.fn(function () {
    let resolveFinished!: () => void;
    let rejectFinished!: (reason?: unknown) => void;
    const finished = new Promise<void>((res, rej) => {
      resolveFinished = res;
      rejectFinished = rej;
    });
    // A cancelled real Animation rejects `finished` with an AbortError -
    // matched here so the production code's `.catch(() => {})` has
    // something realistic to swallow, and so an uncaught rejection never
    // fails the test run.
    finished.catch(() => {});
    const fake: FakeAnimation = {
      cancel: vi.fn(() => rejectFinished(new DOMException('cancelled', 'AbortError'))),
      finished,
      resolveFinished,
    };
    animateCalls.push(fake);
    return fake as unknown as Animation;
  }) as unknown as typeof Element.prototype.animate;
}

beforeEach(() => {
  installStubs();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function validIndicator(handle: Handle, index: number, where: string, currentId: string | null): Indicator {
  return {
    placement: {
      parent: handle.query.node(ROOT_NODE).get(),
      index,
      where,
      currentNode: currentId ? handle.query.node(currentId).get() : null,
    },
    error: null,
  };
}

describe('useDropPlaceholder', () => {
  it('inserts one placeholder at the right DOM index for "before"', () => {
    const { handle } = setup();
    const h = handle();
    addButton(h, 'A');
    const idB = addButton(h, 'B');
    addButton(h, 'C');
    const root = h.query.node(ROOT_NODE).get().dom!;

    act(() => {
      h.actions.setIndicator(validIndicator(h, 1, 'before', idB));
    });

    expect(placeholdersOf(root)).toHaveLength(1);
    // A=0, placeholder=1, B=2, C=3 - the slot sits immediately before B.
    expect(root.children[1].hasAttribute('data-drop-placeholder')).toBe(true);
    expect(root.children[2]).toBe(h.query.node(idB).get().dom);
  });

  it('inserts one placeholder at the right DOM index for "after"', () => {
    const { handle } = setup();
    const h = handle();
    addButton(h, 'A');
    const idB = addButton(h, 'B');
    addButton(h, 'C');
    const root = h.query.node(ROOT_NODE).get().dom!;

    act(() => {
      h.actions.setIndicator(validIndicator(h, 1, 'after', idB));
    });

    expect(placeholdersOf(root)).toHaveLength(1);
    // A=0, B=1, placeholder=2, C=3 - "after" B is one past its index.
    expect(root.children[2].hasAttribute('data-drop-placeholder')).toBe(true);
  });

  it('moves the placeholder when the placement changes: the old one keeps shrinking in the DOM until its transition ends, the new one opens immediately', async () => {
    const { handle } = setup();
    const h = handle();
    const idA = addButton(h, 'A');
    addButton(h, 'B');
    const root = h.query.node(ROOT_NODE).get().dom!;

    act(() => {
      h.actions.setIndicator(validIndicator(h, 0, 'before', idA));
    });
    const firstPlaceholder = placeholderOf(root)!;
    expect(firstPlaceholder).not.toBeNull();

    act(() => {
      h.actions.setIndicator(validIndicator(h, 2, 'after', null));
    });

    // One placeholder at a time plus the one shrinking out (spec section 2).
    const both = placeholdersOf(root);
    expect(both).toHaveLength(2);
    expect(both).toContain(firstPlaceholder);
    const newPlaceholder = both.find((el) => el !== firstPlaceholder)!;
    expect(newPlaceholder).not.toBeNull();

    // The old one's shrink is a real animation, not yet finished - it must
    // not have been removed synchronously.
    expect(document.contains(firstPlaceholder)).toBe(true);

    // Finishing that animation is what actually removes it.
    await act(async () => {
      animateCalls.forEach((a) => a.resolveFinished());
      await Promise.resolve();
    });
    expect(document.contains(firstPlaceholder)).toBe(false);
    expect(document.contains(newPlaceholder)).toBe(true);
  });

  it('removes the placeholder and cancels its animation when the indicator becomes null', () => {
    const { handle } = setup();
    const h = handle();
    const idA = addButton(h, 'A');
    const root = h.query.node(ROOT_NODE).get().dom!;

    act(() => {
      h.actions.setIndicator(validIndicator(h, 0, 'before', idA));
    });
    expect(placeholderOf(root)).not.toBeNull();
    const growCall = animateCalls[animateCalls.length - 1];

    act(() => {
      h.actions.setIndicator(null);
    });

    expect(placeholderOf(root)).toBeNull();
    expect(growCall.cancel).toHaveBeenCalled();
  });

  it('removes the placeholder synchronously on a capture-phase dragend, ahead of Craft\'s own handler', () => {
    const { handle } = setup();
    const h = handle();
    const idA = addButton(h, 'A');
    const root = h.query.node(ROOT_NODE).get().dom!;

    act(() => {
      h.actions.setIndicator(validIndicator(h, 0, 'before', idA));
    });
    expect(placeholderOf(root)).not.toBeNull();

    // A bubble-phase listener on the same document, registered AFTER ours,
    // proves ours already ran (the placeholder is gone) by the time this
    // one fires - the capture-phase ordering the spec requires.
    let sawRemovedAlready = false;
    const observer = () => {
      sawRemovedAlready = placeholderOf(root) === null;
    };
    document.addEventListener('dragend', observer);
    act(() => {
      fireEvent.dragEnd(document);
    });
    document.removeEventListener('dragend', observer);

    expect(sawRemovedAlready).toBe(true);
    expect(placeholderOf(root)).toBeNull();
  });

  it('removes the placeholder synchronously on drop', () => {
    const { handle } = setup();
    const h = handle();
    const idA = addButton(h, 'A');
    const root = h.query.node(ROOT_NODE).get().dom!;

    act(() => {
      h.actions.setIndicator(validIndicator(h, 0, 'before', idA));
    });
    expect(placeholderOf(root)).not.toBeNull();

    act(() => {
      fireEvent.drop(document);
    });

    expect(placeholderOf(root)).toBeNull();
  });

  it('inserts nothing for an indicator with an error', () => {
    const { handle } = setup();
    const h = handle();
    const idA = addButton(h, 'A');
    const root = h.query.node(ROOT_NODE).get().dom!;

    act(() => {
      h.actions.setIndicator({ ...validIndicator(h, 0, 'before', idA), error: 'cannot drop here' });
    });

    expect(placeholderOf(root)).toBeNull();
  });

  it('configures the Editor so the success indicator colour is transparent (the green bar never shows) while error keeps its colour', () => {
    const { handle } = setup();
    expect(handle().query.getOptions().indicator).toEqual({ success: 'transparent', error: 'var(--bad)' });
  });

  it('opens the slot at its final size with no animation under prefers-reduced-motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    const { handle } = setup();
    const h = handle();
    const idA = addButton(h, 'A');
    const root = h.query.node(ROOT_NODE).get().dom!;

    act(() => {
      h.actions.setIndicator(validIndicator(h, 0, 'before', idA));
    });

    const placeholder = placeholderOf(root)!;
    expect(placeholder).not.toBeNull();
    expect(placeholder.style.height).toBe('40px'); // FALLBACK_HEIGHT: no tray-item hint was primed for this drag
    expect(Element.prototype.animate).not.toHaveBeenCalled();
  });

  it('attaches dragend/drop cleanup listeners to the focused frame document and removes them on unmount', () => {
    const { handle, unmount } = setup();
    const h = handle();
    const frameDocument = document.implementation.createHTMLDocument('frame');
    const addSpy = vi.spyOn(frameDocument, 'addEventListener');
    const removeSpy = vi.spyOn(frameDocument, 'removeEventListener');

    act(() => {
      h.setCanvasDocument({ document: frameDocument, window });
    });

    expect(addSpy).toHaveBeenCalledWith('dragend', expect.any(Function), true);
    expect(addSpy).toHaveBeenCalledWith('drop', expect.any(Function), true);

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('dragend', expect.any(Function), true);
    expect(removeSpy).toHaveBeenCalledWith('drop', expect.any(Function), true);
  });

  it('collapses a moved layer\'s own box one frame after it starts dragging, and restores it on dragend', () => {
    const pendingRaf: FrameRequestCallback[] = [];
    vi.stubGlobal(
      'requestAnimationFrame',
      ((cb: FrameRequestCallback) => {
        pendingRaf.push(cb);
        return pendingRaf.length;
      }) as typeof requestAnimationFrame,
    );

    const { handle } = setup();
    const h = handle();
    const idA = addButton(h, 'A');
    const idB = addButton(h, 'B');
    const domA = h.query.node(idA).get().dom!;
    setRect(domA, { width: 50, height: 20 });

    act(() => {
      h.store.actions.setNodeEvent('dragged', [idA]);
      h.actions.setIndicator(validIndicator(h, 1, 'after', idB));
    });

    // Not hidden yet - the browser still needs this frame to snapshot the
    // drag image (spec: "hidden one frame after dragstart").
    expect(domA.style.display).not.toBe('none');

    act(() => {
      pendingRaf.splice(0).forEach((cb) => cb(0));
    });
    expect(domA.style.display).toBe('none');

    act(() => {
      fireEvent.dragEnd(document);
    });
    expect(domA.style.display).not.toBe('none');
  });

  it('sizes a new tray component\'s placeholder from its previewSize hint, found via the dragged element\'s data-tray-item', () => {
    const { handle } = setup();
    const h = handle();
    const idA = addButton(h, 'A');
    const root = h.query.node(ROOT_NODE).get().dom!;

    const trayItem = document.createElement('div');
    trayItem.setAttribute('data-tray-item', 'Button');
    trayItem.setAttribute('draggable', 'true');
    document.body.appendChild(trayItem);
    fireEvent.dragStart(trayItem);
    trayItem.remove();

    act(() => {
      h.actions.setIndicator(validIndicator(h, 0, 'before', idA));
    });

    // Button's previewSize is 120x36 (components/blocks/registry.tsx); a
    // row container gives the placeholder that width and stretches height.
    const placeholder = placeholderOf(root)!;
    expect(placeholder.style.width).toBe('120px');
  });
});
