'use client';

import dynamic from 'next/dynamic';
import type { FileRecord } from '@/lib/files/repository';

// Client-only, exactly like components/workbench/workbench-loader.tsx: Player
// imports components/blocks/registry, which imports @craftjs/core, whose
// module-scope createContext() call fails under Next's server bundling
// outside a real client render (see known-types.ts for the full
// explanation) - `ssr: false` is also only legal on a next/dynamic call made
// from inside a Client Component, which is the other reason this needs its
// own tiny file rather than being called straight from the server
// app/f/[id]/play/page.tsx.
const Player = dynamic(() => import('./player').then((m) => m.Player), {
  ssr: false,
});

// initialOverlayId (overlay frames spec docs/superpowers/specs/2026-09-13-
// overlay-frames-design.md section 4): an overlay frame to start with open
// on top of the initial screen. Plumbed through here already; phase 2's
// Present entry point (Cmd+R while an overlay frame is focused) is what
// will pass it from app/f/[id]/play/page.tsx.
export function PlayerLoader({
  shared,
  closeTab,
  file,
  initialScreenId,
  initialPageId,
  initialOverlayId,
}: {
  shared?: boolean;
  closeTab?: boolean;
  file: FileRecord;
  initialScreenId?: string;
  initialPageId?: string;
  initialOverlayId?: string;
}) {
  return (
    <Player
      shared={shared}
      closeTab={closeTab}
      file={file}
      initialScreenId={initialScreenId}
      initialPageId={initialPageId}
      initialOverlayId={initialOverlayId}
    />
  );
}
