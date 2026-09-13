import { useState, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ARTBOARD_MIN_HEIGHT } from '@/lib/stage';
import { invalidateDropCache } from '@/lib/craft-positioner';
import { StageProvider, useStage } from './stage-context';
import { CanvasFrame, useCanvasDocument } from './canvas-frame';

// CanvasFrame clears Craft's drop-target cache directly (see
// lib/craft-positioner.ts) rather than dispatching a synthetic window
// `scroll` - mock the module so the tests below can spy on that call
// without needing a real Craft `<Editor>`/drag in progress.
vi.mock('@/lib/craft-positioner', () => ({
  invalidateDropCache: vi.fn(),
}));

// Installs a fake global ResizeObserver and returns a `trigger()` that
// invokes whichever callback the code under test registered - a plain `let`
// reassigned from the fake's constructor confuses TypeScript's narrowing
// across the `await`s below (it infers `never` for the reassigned variable),
// so the callback lives on a mutable ref object instead.
function installFakeResizeObserver(): { trigger: () => void } {
  const ref: { current: ResizeObserverCallback | null } = { current: null };
  class FakeResizeObserver {
    constructor(cb: ResizeObserverCallback) {
      ref.current = cb;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  return { trigger: () => ref.current?.([], {} as ResizeObserver) };
}

function renderFrame(ui: ReactElement, { width = 800, height = null as number | null, zoom = 1 } = {}) {
  function Wrapper() {
    return (
      <CanvasFrame width={width} height={height} zoom={zoom}>
        {ui}
      </CanvasFrame>
    );
  }
  return render(
    <StageProvider>
      <Wrapper />
    </StageProvider>,
  );
}

describe('CanvasFrame', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders an iframe titled Frame, sized in unscaled px, scaled with a CSS transform', () => {
    renderFrame(<div>hello</div>, { width: 900, height: 500, zoom: 0.5 });
    const iframe = screen.getByTestId('canvas-frame');
    expect(iframe.tagName).toBe('IFRAME');
    expect(iframe).toHaveAttribute('title', 'Frame');
    expect(iframe).toHaveStyle({ width: '900px', height: '500px' });
    expect(iframe.style.transform).toBe('scale(0.5)');
    expect(iframe.style.transformOrigin).toBe('top left');
  });

  it('portals children into the iframe body', async () => {
    renderFrame(<button type="button">Inside frame</button>);
    const iframe = screen.getByTestId('canvas-frame') as HTMLIFrameElement;
    await waitFor(() => {
      const found = iframe.contentDocument?.body.querySelector('button');
      expect(found).not.toBeNull();
    });
    expect(iframe.contentDocument?.body.textContent).toContain('Inside frame');
  });

  it('sets theme-basic, margin and color-scheme on the iframe body', async () => {
    renderFrame(<div>hi</div>);
    const iframe = screen.getByTestId('canvas-frame') as HTMLIFrameElement;
    await waitFor(() => expect(iframe.contentDocument?.body.className).toBe('theme-basic'));
    expect(iframe.contentDocument?.body.style.margin).toBe('0px');
  });

  it('copies the parent html class list onto the iframe html element', async () => {
    document.documentElement.classList.add('font-a-variable', 'font-b-variable');
    try {
      renderFrame(<div>hi</div>);
      const iframe = screen.getByTestId('canvas-frame') as HTMLIFrameElement;
      await waitFor(() => {
        expect(iframe.contentDocument?.documentElement.classList.contains('font-a-variable')).toBe(true);
      });
      expect(iframe.contentDocument?.documentElement.classList.contains('font-b-variable')).toBe(true);
    } finally {
      document.documentElement.classList.remove('font-a-variable', 'font-b-variable');
    }
  });

  it('copies parent stylesheets into the iframe head and stays in sync via MutationObserver', async () => {
    const style = document.createElement('style');
    style.textContent = '.probe-marker { color: red; }';
    document.head.appendChild(style);
    try {
      renderFrame(<div>hi</div>);
      const iframe = screen.getByTestId('canvas-frame') as HTMLIFrameElement;
      await waitFor(() => {
        const copied = iframe.contentDocument?.head.querySelector('style[data-canvas-sync]');
        expect(copied?.textContent).toContain('probe-marker');
      });

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://example.test/late.css';
      document.head.appendChild(link);

      await waitFor(() => {
        const copiedLink = iframe.contentDocument?.head.querySelector('link[data-canvas-sync]');
        expect(copiedLink).not.toBeNull();
      });
      link.remove();
    } finally {
      style.remove();
    }
  });

  it('re-copies a stylesheet when an existing link href or style text is rewritten in place (HMR), not just on add/remove', async () => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://example.test/original.css';
    document.head.appendChild(link);

    const style = document.createElement('style');
    const styleText = document.createTextNode('.original-marker { color: blue; }');
    style.appendChild(styleText);
    document.head.appendChild(style);

    try {
      renderFrame(<div>hi</div>);
      const iframe = screen.getByTestId('canvas-frame') as HTMLIFrameElement;
      await waitFor(() => {
        expect(iframe.contentDocument?.head.querySelector('link[data-canvas-sync][href$="original.css"]')).not.toBeNull();
      });

      // In-place attribute change on the existing <link> node (no node
      // added or removed) - only `attributes` observation catches this.
      link.setAttribute('href', 'https://example.test/updated.css');
      // In-place characterData change on the existing text node inside
      // <style> (no node added or removed) - only `characterData`
      // observation catches this.
      styleText.data = '.updated-marker { color: green; }';

      await waitFor(() => {
        expect(iframe.contentDocument?.head.querySelector('link[data-canvas-sync][href$="updated.css"]')).not.toBeNull();
      });
      await waitFor(() => {
        const copiedStyles = Array.from(iframe.contentDocument?.head.querySelectorAll('style[data-canvas-sync]') ?? []);
        expect(copiedStyles.some((node) => node.textContent?.includes('updated-marker'))).toBe(true);
      });
    } finally {
      link.remove();
      style.remove();
    }
  });

  it('updates the iframe size and the zoom transform when props change', async () => {
    function Resizable() {
      const [zoom, setZoom] = useState(1);
      return (
        <CanvasFrame width={600} height={400} zoom={zoom}>
          <button type="button" onClick={() => setZoom(0.25)}>
            shrink
          </button>
        </CanvasFrame>
      );
    }
    render(
      <StageProvider>
        <Resizable />
      </StageProvider>,
    );
    const iframe = screen.getByTestId('canvas-frame') as HTMLIFrameElement;
    expect(iframe.style.transform).toBe('scale(1)');
    // The button is portaled into the iframe's own document, not the outer
    // one `screen` queries - find it there instead.
    const frameBody = await waitFor(() => {
      const body = iframe.contentDocument?.body;
      if (!body?.querySelector('button')) throw new Error('not portaled yet');
      return body;
    });
    fireEvent.click(within(frameBody).getByRole('button', { name: 'shrink' }));
    expect(iframe.style.transform).toBe('scale(0.25)');
  });

  it('sizes to content (min ARTBOARD_MIN_HEIGHT) when height is null', async () => {
    const resizeObserver = installFakeResizeObserver();

    renderFrame(<div>hi</div>, { width: 800, height: null });
    const iframe = screen.getByTestId('canvas-frame') as HTMLIFrameElement;
    await waitFor(() => expect(iframe.contentDocument?.body).toBeTruthy());
    expect(iframe.style.height).toBe(`${ARTBOARD_MIN_HEIGHT}px`);

    Object.defineProperty(iframe.contentDocument!.body, 'scrollHeight', { value: 1200, configurable: true });
    resizeObserver.trigger();
    await waitFor(() => expect(iframe.style.height).toBe('1200px'));
  });

  it('never shrinks the auto height below ARTBOARD_MIN_HEIGHT', async () => {
    const resizeObserver = installFakeResizeObserver();

    renderFrame(<div>hi</div>, { width: 800, height: null });
    const iframe = screen.getByTestId('canvas-frame') as HTMLIFrameElement;
    await waitFor(() => expect(iframe.contentDocument?.body).toBeTruthy());

    Object.defineProperty(iframe.contentDocument!.body, 'scrollHeight', { value: 50, configurable: true });
    resizeObserver.trigger();
    await waitFor(() => expect(iframe.style.height).toBe(`${ARTBOARD_MIN_HEIGHT}px`));
  });

  it('reports the applied (unscaled) content height through onContentHeightChange, for a fixed height and for auto', async () => {
    const resizeObserver = installFakeResizeObserver();
    const onContentHeightChange = vi.fn();

    function Wrapper({ height }: { height: number | null }) {
      return (
        <CanvasFrame width={800} height={height} zoom={1} onContentHeightChange={onContentHeightChange}>
          <div>hi</div>
        </CanvasFrame>
      );
    }
    const { rerender } = render(
      <StageProvider>
        <Wrapper height={500} />
      </StageProvider>,
    );
    await waitFor(() => expect(onContentHeightChange).toHaveBeenLastCalledWith(500));

    rerender(
      <StageProvider>
        <Wrapper height={null} />
      </StageProvider>,
    );
    await waitFor(() => expect(onContentHeightChange).toHaveBeenLastCalledWith(ARTBOARD_MIN_HEIGHT));

    const iframe = screen.getByTestId('canvas-frame') as HTMLIFrameElement;
    Object.defineProperty(iframe.contentDocument!.body, 'scrollHeight', { value: 900, configurable: true });
    resizeObserver.trigger();
    await waitFor(() => expect(onContentHeightChange).toHaveBeenLastCalledWith(900));
  });

  it('re-prepares into a replaced iframe document on load (WebKit can swap the initial document) and stops updating the old one', async () => {
    const beforeSwapStyle = document.createElement('style');
    beforeSwapStyle.textContent = '.before-swap-marker { color: blue; }';
    document.head.appendChild(beforeSwapStyle);

    try {
      renderFrame(<div data-testid="probe">hello</div>);
      const iframe = screen.getByTestId('canvas-frame') as HTMLIFrameElement;

      const oldDoc = await waitFor(() => {
        const doc = iframe.contentDocument;
        if (!doc?.body.querySelector('[data-testid="probe"]')) throw new Error('not ready yet');
        return doc;
      });
      await waitFor(() => {
        expect(oldDoc.head.querySelector('style[data-canvas-sync]')?.textContent).toContain('before-swap-marker');
      });

      // Simulate WebKit replacing the iframe's initial about:blank document
      // with a fresh one after this component already latched onto the
      // first one synchronously on mount - `contentDocument` now returns a
      // different Document instance, the same as after a real
      // navigation/reopen.
      const newDoc = document.implementation.createHTMLDocument('');
      Object.defineProperty(iframe, 'contentDocument', { value: newDoc, configurable: true });
      fireEvent.load(iframe);

      await waitFor(() => {
        expect(newDoc.body.querySelector('[data-testid="probe"]')).not.toBeNull();
      });
      // Prepared into the new document too (styles copied, not just the
      // portal moved).
      expect(newDoc.head.querySelector('style[data-canvas-sync]')?.textContent).toContain('before-swap-marker');
      // The portal re-targeted rather than duplicated: gone from the old
      // document.
      expect(oldDoc.body.querySelector('[data-testid="probe"]')).toBeNull();

      // A style change after the swap must sync into the new document only
      // - the old document's MutationObserver was torn down, not left
      // running against a document nothing renders into anymore.
      const afterSwapStyle = document.createElement('style');
      afterSwapStyle.textContent = '.after-swap-marker { color: red; }';
      document.head.appendChild(afterSwapStyle);
      try {
        await waitFor(() => {
          const copied = Array.from(newDoc.head.querySelectorAll('style[data-canvas-sync]'));
          expect(copied.some((node) => node.textContent?.includes('after-swap-marker'))).toBe(true);
        });
        const oldCopied = Array.from(oldDoc.head.querySelectorAll('style[data-canvas-sync]'));
        expect(oldCopied.some((node) => node.textContent?.includes('after-swap-marker'))).toBe(false);
      } finally {
        afterSwapStyle.remove();
      }
    } finally {
      beforeSwapStyle.remove();
    }
  });

  it('does not re-prepare when load fires but contentDocument is unchanged (idempotent)', async () => {
    renderFrame(<div data-testid="probe">hello</div>);
    const iframe = screen.getByTestId('canvas-frame') as HTMLIFrameElement;
    await waitFor(() => {
      if (!iframe.contentDocument?.body.querySelector('[data-testid="probe"]')) throw new Error('not ready yet');
    });

    const disconnectSpy = vi.spyOn(MutationObserver.prototype, 'disconnect');
    fireEvent.load(iframe);
    // Re-running prepare for the SAME document must not tear down and
    // recreate the style-sync observer.
    expect(disconnectSpy).not.toHaveBeenCalled();
  });

  it("clears Craft's drop cache when the iframe document scrolls, instead of bridging to the parent window", async () => {
    renderFrame(<div>hi</div>);
    const iframe = screen.getByTestId('canvas-frame') as HTMLIFrameElement;
    await waitFor(() => expect(iframe.contentDocument?.body).toBeTruthy());

    const onWindowScroll = vi.fn();
    window.addEventListener('scroll', onWindowScroll);
    try {
      fireEvent.scroll(iframe.contentDocument!);
      // Craft's Positioner only clears its cache from its own window-level
      // listener (see lib/craft-positioner.ts for why that listener can
      // never fire for this) - a scroll inside the frame must invalidate
      // the cache directly instead.
      expect(invalidateDropCache).toHaveBeenCalledTimes(1);
      // No synthetic window scroll dispatch left behind: Craft's Positioner
      // would never act on it anyway (window is not an Element, and even a
      // parent-document Element could never `.contains()` a node whose DOM
      // lives inside the iframe document), so it was pure dead weight.
      expect(onWindowScroll).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('scroll', onWindowScroll);
    }
  });

  it('prevents default on dragover anywhere inside the iframe document, so drops are allowed everywhere (matching Craft.js in the parent)', async () => {
    renderFrame(<div>hi</div>);
    const iframe = screen.getByTestId('canvas-frame') as HTMLIFrameElement;
    await waitFor(() => expect(iframe.contentDocument?.body).toBeTruthy());

    const notCanceled = fireEvent.dragOver(iframe.contentDocument!.body);
    expect(notCanceled).toBe(false);
  });

  it('tears down the scroll/dragover bridge on unmount', async () => {
    const { unmount } = renderFrame(<div>hi</div>);
    const iframe = screen.getByTestId('canvas-frame') as HTMLIFrameElement;
    const frameDoc = await waitFor(() => {
      if (!iframe.contentDocument?.body) throw new Error('not ready yet');
      return iframe.contentDocument;
    });

    unmount();
    vi.mocked(invalidateDropCache).mockClear();

    fireEvent.scroll(frameDoc);
    expect(invalidateDropCache).not.toHaveBeenCalled();
  });
});

describe('useCanvasDocument', () => {
  it('is null outside a CanvasFrame', () => {
    function Probe() {
      const canvasDocument = useCanvasDocument();
      return <output data-testid="probe">{canvasDocument ? 'set' : 'none'}</output>;
    }
    render(
      <StageProvider>
        <Probe />
      </StageProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('none');
  });

  it('resolves to the iframe document and window once CanvasFrame is ready', async () => {
    function Probe() {
      const canvasDocument = useCanvasDocument();
      return <output data-testid="probe">{canvasDocument ? 'set' : 'none'}</output>;
    }
    render(
      <StageProvider>
        <CanvasFrame width={800} height={null} zoom={1}>
          <Probe />
        </CanvasFrame>
      </StageProvider>,
    );
    // Probe is portaled into the iframe's own document, not the outer one
    // `screen` queries.
    const iframe = screen.getByTestId('canvas-frame') as HTMLIFrameElement;
    await waitFor(() => {
      const probe = iframe.contentDocument?.body.querySelector('[data-testid="probe"]');
      expect(probe).toHaveTextContent('set');
    });
  });

  it('reports canvasDocument through useStage too, for consumers outside the frame', async () => {
    function OutsideProbe() {
      const { canvasDocument } = useStage();
      return <output data-testid="outside-probe">{canvasDocument ? 'set' : 'none'}</output>;
    }
    render(
      <StageProvider>
        <CanvasFrame width={800} height={null} zoom={1}>
          <div>content</div>
        </CanvasFrame>
        <OutsideProbe />
      </StageProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('outside-probe')).toHaveTextContent('set'));
  });
});
