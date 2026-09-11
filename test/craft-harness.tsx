import { Editor, Frame, useEditor } from '@craftjs/core';
import { render } from '@testing-library/react';
import { useEffect, type ReactElement } from 'react';
import { resolver } from '@/components/blocks/registry';
import { StageProvider } from '@/components/workbench/stage-context';

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
  const result = render(
    <Editor resolver={resolver} enabled>
      <StageProvider initialWidth={width}>
        <EditorProbe onRender={(handle) => (latest = handle)} />
        {ui}
      </StageProvider>
    </Editor>,
  );
  const editor = (): EditorHandle => {
    if (!latest) throw new Error('editor not mounted');
    return latest;
  };
  return { ...result, editor };
}

export function renderTree(
  rootElement: ReactElement,
  { width = 1440, data }: { width?: number; data?: string } = {},
) {
  return renderInEditor(<Frame data={data}>{rootElement}</Frame>, { width });
}
