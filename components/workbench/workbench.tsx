'use client';

import { Editor, useEditor } from '@craftjs/core';
import { useEffect, useMemo, useState } from 'react';
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
import { StageProvider } from './stage-context';
import { Topbar } from './topbar';

export function Workbench() {
  const [initialLayout] = useState(() => loadLayout(KNOWN_TYPES) ?? emptyLayoutJson());
  const [initialWidth] = useState(() => loadStageWidth() ?? STAGE_PRESETS.desktop);
  const save = useMemo(() => debounce((json: string) => saveLayout(json), 500), []);

  useEffect(() => () => save.flush(), [save]);

  return (
    <Editor
      resolver={resolver}
      onRender={NodeIndicator}
      indicator={{ success: 'var(--acc)', error: 'var(--bad)' }}
      onNodesChange={(query) => save(query.serialize())}
    >
      <StageProvider initialWidth={initialWidth} onWidthChange={saveStageWidth}>
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
      <Stage data={initialLayout} />
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
