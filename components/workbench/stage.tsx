'use client';

import { Frame, useEditor } from '@craftjs/core';
import { ARTBOARD_MIN_HEIGHT, STAGE_PADDING } from '@/lib/stage';
import { useStage } from './stage-context';

export function Stage({ data }: { data: string }) {
  const { width } = useStage();
  const { actions } = useEditor();

  return (
    <div
      data-testid="stage-column"
      className="min-w-0 overflow-auto rounded-xl bg-canvas"
      onPointerDown={(event) => {
        const target = event.target as HTMLElement;
        if (!target.closest('[data-artboard]')) actions.selectNode();
      }}
    >
      <div className="flex justify-center" style={{ padding: STAGE_PADDING }}>
        <div
          data-artboard
          data-testid="artboard"
          className="theme-basic shrink-0 border border-line-strong bg-background font-sans text-foreground shadow-panel-lg"
          style={{ width, minHeight: ARTBOARD_MIN_HEIGHT }}
        >
          <Frame data={data} />
        </div>
      </div>
    </div>
  );
}
