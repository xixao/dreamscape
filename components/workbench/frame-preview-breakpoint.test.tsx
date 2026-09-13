import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import loginScreen from '@/lib/examples/login-screen.json';
import type { Screen } from '@/lib/files/repository';
import { renderInEditor } from '@/test/craft-harness';
import { FramePreview } from './stage';

// Regression for the bug Matt reported on 2026-09-13: "i click on one frame,
// and the other frame resizes its content to fill the width of the frame".
// Every block resolves its responsive breakpoint through useStage(), and a
// non-focused FramePreview used to render its Craft tree straight under the
// workbench-level StageProvider - whose width is the FOCUSED frame's - so a
// 1440 px preview next to a focused 375 px frame laid itself out with the
// mobile props (the login example's root is align stretch on mobile, center
// on desktop). A preview must resolve breakpoints from its own size.

function noPanProps() {
  return {
    shouldStartPan: () => false,
    onPanPointerDown: vi.fn(),
    onPanPointerMove: vi.fn(),
    onPanPointerUp: vi.fn(),
    onFrameWheel: vi.fn(),
  };
}

async function previewRoot(): Promise<HTMLElement> {
  return waitFor(() => {
    const iframe = screen.getByTestId('canvas-frame') as HTMLIFrameElement;
    const root = iframe.contentDocument?.body.querySelector<HTMLElement>('[data-block="LayoutBox"]');
    if (!root) throw new Error('preview root not ready');
    return root;
  });
}

const layout = JSON.stringify(loginScreen);

describe('FramePreview resolves breakpoints from its own size, not the focused frame', () => {
  it('lays a 1440 px preview out with its desktop props while the focused frame is 375 px', async () => {
    const preview: Screen = { id: 'desktop', name: 'Login', layout, stageWidth: 1440 };
    renderInEditor(<FramePreview screen={preview} onFocusScreen={vi.fn()} {...noPanProps()} />, { width: 375 });
    const root = await previewRoot();
    expect(root).toHaveClass('items-center');
    expect(root).not.toHaveClass('items-stretch');
  });

  it('lays a 375 px preview out with its mobile props while the focused frame is 1440 px', async () => {
    const preview: Screen = { id: 'mobile', name: 'Login', layout, stageWidth: 375 };
    renderInEditor(<FramePreview screen={preview} onFocusScreen={vi.fn()} {...noPanProps()} />, { width: 1440 });
    const root = await previewRoot();
    expect(root).toHaveClass('items-stretch');
    expect(root).not.toHaveClass('items-center');
  });
});
