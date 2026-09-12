'use client';

import { Editor, useEditor } from '@craftjs/core';
import { useEffect, useRef, useState } from 'react';
import { emptyLayoutJson, resolver } from '@/components/blocks/registry';
import { canonicalLayout } from '@/lib/files/validate';
import type { FileRecord } from '@/lib/files/repository';
import { createFileSaver, type FilePatch, type SaveState } from '@/lib/persistence';
import { ComponentTray } from './component-tray';
import { Inspector } from './inspector/inspector';
import { useWorkbenchKeyboard } from './keyboard';
import { LayerStackMenu } from './layer-stack-menu';
import { NewLayoutDialog } from './new-layout-dialog';
import { NodeIndicator } from './node-indicator';
import { useZoneRedirect } from './selection';
import { Stage } from './stage';
import { StageErrorBoundary } from './stage-error-boundary';
import { StageProvider } from './stage-context';
import { Topbar } from './topbar';

export const INVALID_LAYOUT_NOTICE = 'The saved design could not be read; this file starts empty.';

export function Workbench({ file, layoutInvalid }: { file: FileRecord; layoutInvalid: boolean }) {
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [notice, setNotice] = useState<string | undefined>(
    layoutInvalid ? INVALID_LAYOUT_NOTICE : undefined,
  );
  const [fileName, setFileName] = useState(file.name);

  // Lazy useState (not useMemo) so the saver is created exactly once and holds
  // its own pending-write timer across renders, the same guarantee a ref would
  // give; useMemo is not guaranteed to preserve identity across renders (React
  // may discard and recreate a memoized value), which could orphan a pending
  // write.
  const [saver] = useState(() =>
    createFileSaver({
      fileId: file.id,
      initialUpdatedAt: file.updatedAt,
      onState: setSaveState,
    }),
  );

  // The very first onNodesChange fires from Craft's own initial deserialize of
  // the frame, not a user edit. For an invalid layout that first firing is
  // deserializing the empty stand-in this component was handed instead of the
  // unreadable original, so it must not overwrite the stored (corrupted)
  // layout before the user has actually changed anything.
  const skipNextNodesChange = useRef(layoutInvalid);

  // Craft's own store notifies onNodesChange unconditionally the first time
  // it fires after mount (nothing to compare that firing's content against
  // yet), which happens on the first store change of any kind - including a
  // plain selection click, not just an edit. Comparing against the layout we
  // know is already saved (rather than trusting every firing to mean "save
  // this") keeps a second tab's read-only open, or the owning tab's own first
  // click, from queuing a no-op write that only serves to bump updatedAt and
  // hand the next real editor a conflict nobody caused. Compared canonically,
  // not by raw string equality: Postgres's jsonb column doesn't preserve
  // object key order on round-trip, and Craft's own parse-then-serialize
  // doesn't reliably reproduce the exact key order it was given either.
  const lastSavedLayout = useRef(file.layout);

  useEffect(() => {
    const onPageHide = () => {
      void saver.flush();
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [saver]);

  // Flush only, no dispose(): React's development StrictMode intentionally
  // mounts every component twice, running this cleanup once synchronously
  // right after the first mount and then running the effect again. `saver`
  // is created once via useState and survives that synthetic
  // mount/cleanup/mount cycle, so calling dispose() here would permanently
  // turn every later queue()/flush() into a no-op the moment the page loads
  // in development, silently breaking autosave (confirmed live: a rename
  // never reached the server). flush() alone is idempotent and safe to run
  // from both the synthetic and the real unmount.
  useEffect(
    () => () => {
      void saver.flush();
    },
    [saver],
  );

  function queuePatch(patch: FilePatch): void {
    setNotice(undefined);
    saver.queue(patch);
  }

  return (
    <Editor
      resolver={resolver}
      onRender={NodeIndicator}
      indicator={{ success: 'var(--acc)', error: 'var(--bad)' }}
      onNodesChange={(query) => {
        if (skipNextNodesChange.current) {
          skipNextNodesChange.current = false;
          return;
        }
        const json = query.serialize();
        if (canonicalLayout(json) === canonicalLayout(lastSavedLayout.current)) {
          return;
        }
        lastSavedLayout.current = json;
        queuePatch({ layout: json });
      }}
    >
      <StageProvider initialWidth={file.stageWidth} onWidthChange={(width) => queuePatch({ stageWidth: width })}>
        <WorkbenchShell
          initialLayout={file.layout}
          fileId={file.id}
          fileName={fileName}
          onRename={(name) => {
            setFileName(name);
            queuePatch({ name });
          }}
          saveState={saveState}
          notice={notice}
        />
      </StageProvider>
    </Editor>
  );
}

function WorkbenchShell({
  initialLayout,
  fileId,
  fileName,
  onRename,
  saveState,
  notice,
}: {
  initialLayout: string;
  fileId: string;
  fileName: string;
  onRename: (name: string) => void;
  saveState: SaveState;
  notice?: string;
}) {
  useZoneRedirect();
  const [uiHidden, setUiHidden] = useState(false);
  useWorkbenchKeyboard({ onToggleUi: () => setUiHidden((hidden) => !hidden) });
  const { actions } = useEditor();
  const [newOpen, setNewOpen] = useState(false);

  return (
    <div
      className={
        uiHidden
          ? 'grid h-screen grid-cols-[1fr] grid-rows-[1fr] gap-3 bg-background p-3'
          : 'grid h-screen grid-cols-[280px_1fr_320px] grid-rows-[auto_1fr] gap-3 bg-background p-3'
      }
    >
      {!uiHidden && (
        <Topbar
          key="topbar"
          fileName={fileName}
          onRename={onRename}
          saveState={saveState}
          notice={notice}
          onNew={() => setNewOpen(true)}
        />
      )}
      {!uiHidden && <ComponentTray key="tray" />}
      <StageErrorBoundary key="stage" fileId={fileId}>
        <Stage data={initialLayout} />
      </StageErrorBoundary>
      {!uiHidden && <Inspector key="inspector" />}
      <NewLayoutDialog
        key="new-dialog"
        open={newOpen}
        onOpenChange={setNewOpen}
        onConfirm={() => {
          actions.selectNode();
          actions.deserialize(emptyLayoutJson());
          actions.history.clear();
        }}
      />
      <LayerStackMenu key="layer-stack-menu" />
    </div>
  );
}
