import { Editor, Frame, useEditor } from '@craftjs/core';
import { render } from '@testing-library/react';
import { cloneElement, useEffect, type ReactElement } from 'react';
import { vi } from 'vitest';
import { resolver } from '@/components/blocks/registry';
import { PlayProvider, type PlayContextValue } from '@/components/play/play-context';
import { StageProvider } from '@/components/workbench/stage-context';
import { ROOT_LAYOUT_PROPS } from '@/lib/classes';

type EditorHandle = Pick<ReturnType<typeof useEditor>, 'actions' | 'query'>;

function EditorProbe({ onRender }: { onRender: (handle: EditorHandle) => void }) {
  const { actions, query } = useEditor();
  useEffect(() => {
    onRender({ actions, query });
  });
  return null;
}

export function renderInEditor(ui: ReactElement, { width = 1440 }: { width?: number } = {}) {
  let latest: EditorHandle | null = null;
  function wrap(inner: ReactElement) {
    return (
      <Editor resolver={resolver} enabled>
        <StageProvider initialWidth={width}>
          <EditorProbe onRender={(handle) => (latest = handle)} />
          {inner}
        </StageProvider>
      </Editor>
    );
  }
  const result = render(wrap(ui));
  const editor = (): EditorHandle => {
    if (!latest) throw new Error('editor not mounted');
    return latest;
  };
  // Rerenders just the inner element, re-wrapped in the same <Editor>/
  // <StageProvider> this render started with - a caller that swaps a prop
  // (e.g. a pageId, to test behavior on an already-mounted tree without a
  // full remount) would otherwise have to reconstruct that wrapper itself,
  // or lose it entirely by calling the plain RTL `rerender` with only the
  // inner element.
  const rerenderUi = (inner: ReactElement) => result.rerender(wrap(inner));
  return { ...result, editor, rerenderUi };
}

export function renderTree(
  rootElement: ReactElement,
  { width = 1440, data }: { width?: number; data?: string } = {},
) {
  const root = cloneElement(rootElement, { ...ROOT_LAYOUT_PROPS, ...(rootElement.props as object) });
  return renderInEditor(<Frame data={data}>{root}</Frame>, { width });
}

/**
 * A `PlayContextValue` with every action stubbed as a `vi.fn()` and
 * `isDialogOpen` defaulting to always-closed, for tests that only care
 * about one or two of them (they overwrite just those). Kept here rather
 * than duplicated in every block's test file.
 */
export function makePlayValue(overrides: Partial<PlayContextValue> = {}): PlayContextValue {
  return {
    mode: 'play',
    navigate: vi.fn(),
    back: vi.fn(),
    openDialog: vi.fn(),
    closeDialog: vi.fn(),
    isDialogOpen: () => false,
    ...overrides,
  };
}

/**
 * Like `renderTree`, but wrapped in a `PlayProvider` so blocks render their
 * play-mode branch (`usePlay().mode === 'play'`). Craft's `enabled` mirrors
 * `components/play/player.tsx`'s real `false` (selection/drag off) rather
 * than `renderInEditor`'s default `true`, since play-mode block behavior
 * (a real onClick, a typeable input, ...) is what these tests exercise, not
 * editor selection.
 */
export function renderPlayTree(
  rootElement: ReactElement,
  play: PlayContextValue = makePlayValue(),
  { width = 1440, data }: { width?: number; data?: string } = {},
) {
  const root = cloneElement(rootElement, { ...ROOT_LAYOUT_PROPS, ...(rootElement.props as object) });
  let latest: EditorHandle | null = null;
  const result = render(
    <PlayProvider value={play}>
      <Editor resolver={resolver} enabled={false}>
        <StageProvider initialWidth={width}>
          <EditorProbe onRender={(handle) => (latest = handle)} />
          <Frame data={data}>{root}</Frame>
        </StageProvider>
      </Editor>
    </PlayProvider>,
  );
  const editor = (): EditorHandle => {
    if (!latest) throw new Error('editor not mounted');
    return latest;
  };
  return { ...result, editor };
}
