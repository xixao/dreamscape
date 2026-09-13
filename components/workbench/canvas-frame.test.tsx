import { useState, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ARTBOARD_MIN_HEIGHT } from '@/lib/stage';
import { StageProvider, useStage } from './stage-context';
import { CanvasFrame, useCanvasDocument } from './canvas-frame';

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
