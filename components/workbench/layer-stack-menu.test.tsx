import { useEffect, useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ROOT_NODE } from '@craftjs/core';
import { Button } from '@/components/blocks/button';
import { Card } from '@/components/blocks/card';
import { emptyLayoutJson } from '@/components/blocks/registry';
import type { Viewport } from '@/lib/canvas/viewport';
import { HOLD_MS } from '@/lib/layer-stack';
import type { Screen } from '@/lib/files/repository';
import { renderInEditor } from '@/test/craft-harness';
import { CanvasViewportProvider } from './canvas';
import { LayerStackMenu } from './layer-stack-menu';
import { Stage } from './stage';
import { useStage } from './stage-context';

const ONE_SCREEN: Screen = { id: 's1', name: 'Frame 1', layout: emptyLayoutJson(), stageWidth: 1440 };

// Stage no longer computes its own fit-to-column zoom (that lived in the
// pre-infinite-canvas Stage; zoom now belongs to the canvas viewport,
// components/workbench/canvas.tsx, which keeps useStage().zoom in sync with
// it) - a test that needs a non-1 zoom sets it directly through the same
// context instead of faking a column width.
function ZoomSetter({ zoom }: { zoom: number }) {
  const { setZoom } = useStage();
  useEffect(() => {
    setZoom(zoom);
  }, [zoom, setZoom]);
  return null;
}

// Craft's rendered tree now lives inside the CanvasFrame iframe (stage.tsx),
// a separate document `screen` (bound to the outer one) cannot see into -
// waits for the iframe and returns its body so callers can query inside it.
// Scoped inside [data-testid="artboard"] rather than a bare getByTestId:
// the infinite canvas can have more than one [data-testid="canvas-frame"]
// on screen (components/workbench/canvas.tsx mounts one per screen, and one
// test below deliberately adds a decoy to prove a fix), but only the
// focused frame's own lives inside an "artboard" wrapper.
async function frameBody(): Promise<HTMLElement> {
  return waitFor(() => {
    const iframe = document.querySelector('[data-testid="artboard"] [data-testid="canvas-frame"]') as
      | HTMLIFrameElement
      | null;
    const body = iframe?.contentDocument?.body;
    if (!body) throw new Error('canvas frame body not ready');
    return body;
  });
}

// LayerStackMenu closes itself when the shared canvas viewport changes (it
// used to close on the stage column's own `scroll` event, which no longer
// fires now that panning is a CSS transform - see canvas.tsx) - so it now
// reads useCanvasViewport(), which throws outside a CanvasViewportProvider.
// This harness wraps every setup() render in one with a real, settable
// viewport (rather than a static literal) so the one test that actually
// needs to change it after the menu opens can, through the exposed
// `setViewport`; every other test in this file never touches it and is
// unaffected by the wrapper being there.
function ViewportHarness({
  children,
  onViewportSetter,
}: {
  children: ReactNode;
  onViewportSetter: (setViewport: (viewport: Viewport) => void) => void;
}) {
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  useEffect(() => {
    onViewportSetter(setViewport);
  }, [onViewportSetter]);
  return (
    <CanvasViewportProvider viewport={viewport} setViewport={setViewport} viewportSize={{ width: 1000, height: 800 }} animateTo={() => {}}>
      {children}
    </CanvasViewportProvider>
  );
}

// Builds ROOT(Frame) -> Card -> CardContent(zone) -> Button("Sign in"), the
// exact tree the spec's own harness example uses, via the same
// query.parseReactElement/actions.addNodeTree technique as
// components/blocks/card.test.tsx and dialog.test.tsx (Card's own render
// never reads a `children` prop, so JSX nesting under <Card> would not
// actually place a node in its content zone).
async function setup(zoom = 1) {
  let setSharedViewport: ((viewport: Viewport) => void) | null = null;
  const utils = renderInEditor(
    <ViewportHarness
      onViewportSetter={(setViewport) => {
        setSharedViewport = setViewport;
      }}
    >
      {/*
        data-testid="canvas-root" stands in for the real infinite canvas's
        own root element (components/workbench/canvas.tsx) - the only thing
        LayerStackMenu's press-and-hold gesture detection needs from an
        ancestor, queried by that test id rather than received as a prop.
      */}
      <div data-testid="canvas-root">
        <ZoomSetter zoom={zoom} />
        <Stage screen={ONE_SCREEN} viewport={{ x: 0, y: 0, zoom }} />
      </div>
      <LayerStackMenu />
    </ViewportHarness>,
  );
  const body = await frameBody();
  await within(body).findByText('This frame is empty');
  const { actions, query } = utils.editor();

  act(() => {
    const cardTree = query.parseReactElement(<Card title="" description="" />).toNodeTree();
    actions.addNodeTree(cardTree, ROOT_NODE);
  });
  await waitFor(() => expect(body.querySelector('[data-zone="CardContent"]')).not.toBeNull());
  const cardId = query.node(ROOT_NODE).get().data.nodes[0];
  const zoneId = query.node(cardId).get().data.linkedNodes.content as string;

  act(() => {
    const buttonTree = query.parseReactElement(<Button label="Sign in" />).toNodeTree();
    actions.addNodeTree(buttonTree, zoneId);
  });
  const button = await within(body).findByRole('button', { name: 'Sign in' });

  // Fake timers only from here on: everything above needs the real timers
  // RTL's findBy/waitFor polling relies on, and switching before they
  // settle hangs the whole setup instead of failing fast.
  vi.useFakeTimers();

  function setViewport(viewport: Viewport): void {
    if (!setSharedViewport) throw new Error('viewport setter not ready');
    act(() => setSharedViewport!(viewport));
  }

  return { button, cardId, query, actions, setViewport };
}

function press(target: Element, x = 100, y = 100) {
  fireEvent.pointerDown(target, { button: 0, clientX: x, clientY: y });
}

// The hold timer fires from a plain setTimeout, not a React event, so the
// resulting setState is not automatically batched/flushed the way RTL flushes
// updates from fireEvent. Wrapping the advance in `act` forces React to
// commit before the assertions below inspect the DOM.
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('LayerStackMenu', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    // Craft's real drag connector (engaged by the dragstart test below)
    // appends a "drag-shadow" clone straight to document.body outside
    // React's tree, so RTL's own cleanup() never removes it; left behind it
    // would give a later test's "Sign in" button a duplicate match.
    document.querySelectorAll('.drag-shadow').forEach((el) => el.remove());
  });

  it('does nothing before the hold completes', async () => {
    const { button } = await setup();
    press(button);
    expect(screen.queryByRole('menu')).toBeNull();
    await advance(HOLD_MS - 1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens after a 350 ms hold listing Button, Card, Frame innermost first', async () => {
    const { button } = await setup();
    press(button);
    await advance(HOLD_MS);

    const menu = screen.getByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Button');
    expect(items[1]).toHaveTextContent('Card');
    expect(items[2]).toHaveTextContent('Frame');
  });

  it('cancels the hold when the pointer drifts more than 4 px', async () => {
    const { button } = await setup();
    press(button, 100, 100);
    fireEvent.pointerMove(button, { clientX: 111, clientY: 100 });
    await advance(HOLD_MS);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('does not cancel the hold for a drift within the 4 px tolerance', async () => {
    const { button } = await setup();
    press(button, 100, 100);
    fireEvent.pointerMove(button, { clientX: 102, clientY: 100 });
    await advance(HOLD_MS);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('cancels the hold on pointerup before it fires', async () => {
    const { button } = await setup();
    press(button);
    fireEvent.pointerUp(button, { clientX: 100, clientY: 100 });
    await advance(HOLD_MS);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('cancels the hold on pointercancel or dragstart before it fires', async () => {
    const { button } = await setup();
    press(button);
    fireEvent.pointerCancel(button);
    await advance(HOLD_MS);
    expect(screen.queryByRole('menu')).toBeNull();

    press(button);
    // jsdom has no real DataTransfer; Craft's own drag connector calls
    // dataTransfer.setDragImage on a real dragstart, so it needs a stub or
    // it throws (unrelated to the code under test here).
    fireEvent.dragStart(button, {
      dataTransfer: { setDragImage: () => {}, setData: () => {}, effectAllowed: '' },
    });
    await advance(HOLD_MS);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('cancels the hold on Escape before it fires', async () => {
    const { button } = await setup();
    press(button);
    fireEvent.keyDown(button, { key: 'Escape' });
    await advance(HOLD_MS);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('sets the Craft hovered event on the Card node when hovering its row, and clears it on leave', async () => {
    const { button, cardId, query } = await setup();
    press(button);
    await advance(HOLD_MS);

    const cardRow = screen.getByRole('menuitem', { name: /Card/ });
    fireEvent.pointerOver(cardRow);
    expect(query.node(cardId).isHovered()).toBe(true);

    fireEvent.pointerOut(screen.getByRole('menu'));
    expect(query.node(cardId).isHovered()).toBe(false);
  });

  it('clicking a row selects that node and closes the menu', async () => {
    const { button, cardId, query } = await setup();
    press(button);
    await advance(HOLD_MS);

    fireEvent.click(screen.getByRole('menuitem', { name: /Card/ }));

    expect(query.getEvent('selected').contains(cardId)).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('navigates with the arrow keys and commits with Enter', async () => {
    const { button, cardId, query } = await setup();
    press(button);
    await advance(HOLD_MS);

    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    fireEvent.keyDown(menu, { key: 'Enter' });

    expect(query.getEvent('selected').contains(cardId)).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on Escape', async () => {
    const { button } = await setup();
    press(button);
    await advance(HOLD_MS);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on a click outside the menu without swallowing it', async () => {
    const { button } = await setup();
    press(button);
    await advance(HOLD_MS);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.pointerUp(button, { clientX: 100, clientY: 100 });
    fireEvent.click(button); // the swallowed click from this same hold
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.click(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes when the canvas viewport changes (pan or zoom)', async () => {
    const { button, setViewport } = await setup();
    press(button);
    await advance(HOLD_MS);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    setViewport({ x: 50, y: 0, zoom: 1 });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('does not close from a viewport change while it is not open', async () => {
    const { button, setViewport } = await setup();
    setViewport({ x: 50, y: 0, zoom: 1 });

    press(button);
    await advance(HOLD_MS);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('swallows the click that follows a completed hold, exactly once', async () => {
    const { button } = await setup();
    const clickSpy = vi.fn();
    button.addEventListener('click', clickSpy);

    press(button);
    await advance(HOLD_MS);
    fireEvent.pointerUp(button, { clientX: 100, clientY: 100 });
    fireEvent.click(button);
    expect(clickSpy).not.toHaveBeenCalled();

    // Menu is still open (the swallowed click does not close it), still
    // listing the same stack, and a distinct later click on the button
    // behaves normally again.
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.click(button);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('does not leak the swallow flag past an intervening pointerdown elsewhere', async () => {
    const { button, cardId, query } = await setup();
    const clickSpy = vi.fn();
    button.addEventListener('click', clickSpy);

    press(button);
    await advance(HOLD_MS);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    // The trailing click from this hold never arrives (the release landed
    // outside the column, or nothing else consumed it), so the swallow flag
    // is still armed. A pointerdown on a completely different node - a new,
    // unrelated gesture - must still disarm it, so the click that follows
    // is not eaten.
    const cardDom = query.node(cardId).get().dom as HTMLElement;
    fireEvent.pointerDown(cardDom, { button: 0, clientX: 200, clientY: 200 });
    fireEvent.click(button);

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('shows the hint for only the first three opens in a session', async () => {
    const { button } = await setup();
    const hint = 'Hold on a layer to open this menu';

    for (let i = 0; i < 3; i++) {
      press(button);
      await advance(HOLD_MS);
      expect(screen.getByText(hint)).toBeInTheDocument();
      fireEvent.keyDown(window, { key: 'Escape' });
    }

    press(button);
    await advance(HOLD_MS);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.queryByText(hint)).toBeNull();
  });

  describe('flips to stay inside the window', () => {
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;

    function setViewport(innerWidth: number, innerHeight: number) {
      Object.defineProperty(window, 'innerWidth', { value: innerWidth, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: innerHeight, configurable: true });
    }

    beforeEach(() => {
      // The popover's real size only exists once it is rendered and
      // measured, which is exactly what the component reads via
      // `getBoundingClientRect` to decide whether to flip - stub it to a
      // fixed size so the math is predictable in jsdom (same technique as
      // node-indicator.test.tsx's re-measurement test).
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
        () =>
          ({
            width: 200,
            height: 160,
            top: 0,
            left: 0,
            right: 200,
            bottom: 160,
            x: 0,
            y: 0,
            toJSON() {},
          }) as DOMRect,
      );
    });

    afterEach(() => {
      vi.restoreAllMocks();
      setViewport(originalInnerWidth, originalInnerHeight);
    });

    it('flips left of the cursor when the naive placement would overflow the right edge', async () => {
      setViewport(400, 800);
      const { button } = await setup();
      press(button, 390, 50);
      await advance(HOLD_MS);

      expect(screen.getByRole('menu')).toHaveStyle({ left: `${390 - 8 - 200}px` });
    });

    it('flips above the cursor when the naive placement would overflow the bottom edge', async () => {
      setViewport(1000, 400);
      const { button } = await setup();
      press(button, 50, 390);
      await advance(HOLD_MS);

      expect(screen.getByRole('menu')).toHaveStyle({ top: `${390 - 8 - 160}px` });
    });

    it('keeps the naive offset placement when the popover already fits', async () => {
      setViewport(1000, 800);
      const { button } = await setup();
      press(button, 50, 50);
      await advance(HOLD_MS);

      expect(screen.getByRole('menu')).toHaveStyle({ left: '58px', top: '58px' });
    });
  });

  describe('converts iframe coordinates to parent coordinates', () => {
    // Every other test in this file happens to run at zoom 1 with the
    // iframe flush against the parent document's origin, so the anchor
    // conversion (iframeRect.left/top + point * zoom) is indistinguishable
    // from identity there. This test forces a real offset and a non-1 zoom
    // to prove the formula itself, not just that presses inside the frame
    // are detected at all.
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('offsets and scales the anchor by the iframe rect and the current zoom', async () => {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        if (this.dataset.testid === 'canvas-frame') {
          return { left: 100, top: 40, width: 720, height: 320, right: 820, bottom: 360, x: 100, y: 40, toJSON() {} } as DOMRect;
        }
        // The popover's own measured size (flipToFit's width/height), kept
        // tiny and fully inside the (real) window so no flip complicates
        // the math this test is actually checking.
        return { left: 0, top: 0, width: 40, height: 20, right: 40, bottom: 20, x: 0, y: 0, toJSON() {} } as DOMRect;
      });

      const { button } = await setup(0.5);
      // Pressing at (10, 20) inside the frame, whose rect is offset by
      // (100, 40) in the parent document and currently rendered at zoom
      // 0.5, must anchor the menu at (100 + 10*0.5, 40 + 20*0.5) = (105, 50)
      // before flipToFit's own MENU_OFFSET(8)/clamping is applied.
      press(button, 10, 20);
      await advance(HOLD_MS);

      expect(screen.getByRole('menu')).toHaveStyle({ left: `${105 + 8}px`, top: `${50 + 8}px` });
    });

    // The infinite canvas (components/workbench/canvas.tsx) mounts one
    // CanvasFrame per screen at once, so more than one [data-testid=
    // "canvas-frame"] iframe can exist simultaneously - a plain
    // document.querySelector(that selector) could resolve to a DIFFERENT
    // frame's iframe than the one actually pressed. The fix reads
    // canvasDocument.window.frameElement instead (the exact iframe hosting
    // THIS press), which this decoy iframe - present, matching the same
    // test id, but not the one the press happened in - proves.
    it('still anchors to the frame the press actually happened in, even with another canvas-frame iframe present', async () => {
      const decoy = document.createElement('iframe');
      decoy.setAttribute('data-testid', 'canvas-frame');
      document.body.insertBefore(decoy, document.body.firstChild);

      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        if (this === decoy) {
          // A wildly different rect: if this one is ever used, the anchor
          // below would come out nowhere near the assertion.
          return { left: 900, top: 900, width: 10, height: 10, right: 910, bottom: 910, x: 900, y: 900, toJSON() {} } as DOMRect;
        }
        if (this.dataset.testid === 'canvas-frame') {
          return { left: 100, top: 40, width: 720, height: 320, right: 820, bottom: 360, x: 100, y: 40, toJSON() {} } as DOMRect;
        }
        return { left: 0, top: 0, width: 40, height: 20, right: 40, bottom: 20, x: 0, y: 0, toJSON() {} } as DOMRect;
      });

      try {
        const { button } = await setup(0.5);
        press(button, 10, 20);
        await advance(HOLD_MS);

        expect(screen.getByRole('menu')).toHaveStyle({ left: `${105 + 8}px`, top: `${50 + 8}px` });
      } finally {
        decoy.remove();
      }
    });
  });
});
