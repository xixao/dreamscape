'use client';

import { Editor } from '@craftjs/core';
import { useState } from 'react';
import { emptyLayoutJson, resolver } from '@/components/blocks/registry';
import { ComponentTray } from './component-tray';
import { Inspector } from './inspector/inspector';
import { useWorkbenchKeyboard } from './keyboard';
import { NodeIndicator } from './node-indicator';
import { useZoneRedirect } from './selection';
import { Stage } from './stage';
import { StageProvider } from './stage-context';
import { Topbar } from './topbar';

export function Workbench() {
  const [initialLayout] = useState(() => emptyLayoutJson());

  return (
    <Editor
      resolver={resolver}
      onRender={NodeIndicator}
      indicator={{ success: 'var(--acc)', error: 'var(--bad)' }}
    >
      <StageProvider>
        <WorkbenchShell initialLayout={initialLayout} />
      </StageProvider>
    </Editor>
  );
}

function WorkbenchShell({ initialLayout }: { initialLayout: string }) {
  useZoneRedirect();
  useWorkbenchKeyboard();

  return (
    <div className="grid h-screen grid-cols-[280px_1fr_320px] grid-rows-[auto_1fr] gap-3 bg-background p-3">
      <Topbar onNew={() => {}} />
      <ComponentTray />
      <Stage data={initialLayout} />
      <Inspector />
    </div>
  );
}
