'use client';

import { Editor, useEditor } from '@craftjs/core';
import { useEffect, useState } from 'react';
import { KNOWN_TYPES, emptyLayoutJson, resolver } from '@/components/blocks/registry';
import { debounce, loadLayout, loadStageWidth, saveLayout, saveStageWidth } from '@/lib/persistence';
import { STAGE_PRESETS } from '@/lib/stage';
import { ComponentTray } from './component-tray';
import { Inspector } from './inspector/inspector';
import { useWorkbenchKeyboard } from './keyboard';
import { NewLayoutDialog } from './new-layout-dialog';
import { NodeIndicator } from './node-indicator';
import { useZoneRedirect } from './selection';
import { Stage } from './stage';
import { StageErrorBoundary } from './stage-error-boundary';
import { StageProvider } from './stage-context';
import { Topbar } from './topbar';

export function Workbench() {
  const [initialLayout] = useState(() => loadLayout(KNOWN_TYPES) ?? emptyLayoutJson());
  const [initialWidth] = useState(() => loadStageWidth() ?? STAGE_PRESETS.desktop);
  // Lazy useState (not useMemo) so each debounced saver is created exactly once
  // and holds its own pending-write timer across renders, the same guarantee a
  // ref would give; useMemo is not guaranteed to preserve identity across
  // renders (React may discard and recreate a memoized value), which could
  // orphan a pending write.
  const [save] = useState(() => debounce((json: string) => saveLayout(json), 500));
  const [saveWidth] = useState(() => debounce(saveStageWidth, 500));

  useEffect(
    () => () => {
      save.flush();
      saveWidth.flush();
    },
    [save, saveWidth],
  );

  return (
    <Editor
      resolver={resolver}
      onRender={NodeIndicator}
      indicator={{ success: 'var(--acc)', error: 'var(--bad)' }}
      onNodesChange={(query) => save(query.serialize())}
    >
      <StageProvider initialWidth={initialWidth} onWidthChange={saveWidth}>
        <WorkbenchShell initialLayout={initialLayout} />
      </StageProvider>
    </Editor>
  );
}

function WorkbenchShell({ initialLayout }: { initialLayout: string }) {
  useZoneRedirect();
  useWorkbenchKeyboard();
  const { actions } = useEditor();
  const [newOpen, setNewOpen] = useState(false);

  return (
    <div className="grid h-screen grid-cols-[280px_1fr_320px] grid-rows-[auto_1fr] gap-3 bg-background p-3">
      <Topbar onNew={() => setNewOpen(true)} />
      <ComponentTray />
      <StageErrorBoundary fallback={<Stage data={emptyLayoutJson()} />}>
        <Stage data={initialLayout} />
      </StageErrorBoundary>
      <Inspector />
      <NewLayoutDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onConfirm={() => {
          actions.selectNode();
          actions.deserialize(emptyLayoutJson());
          actions.history.clear();
        }}
      />
    </div>
  );
}
