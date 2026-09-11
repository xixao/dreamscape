'use client';

import { Editor } from '@craftjs/core';
import { useState } from 'react';
import { emptyLayoutJson, resolver } from '@/components/blocks/registry';
import { PANEL } from './chrome';
import { ComponentTray } from './component-tray';
import { Stage } from './stage';
import { StageProvider } from './stage-context';

export function Workbench() {
  const [initialLayout] = useState(() => emptyLayoutJson());

  return (
    <Editor resolver={resolver} indicator={{ success: 'var(--acc)', error: 'var(--bad)' }}>
      <StageProvider>
        <div className="grid h-screen grid-cols-[280px_1fr_320px] grid-rows-[auto_1fr] gap-3 bg-background p-3">
          <div className="col-span-3 h-[54px]" />
          <ComponentTray />
          <Stage data={initialLayout} />
          <aside className={PANEL} />
        </div>
      </StageProvider>
    </Editor>
  );
}
