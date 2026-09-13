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

export function PlayerLoader({
  file,
  initialScreenId,
  initialPageId,
}: {
  file: FileRecord;
  initialScreenId?: string;
  initialPageId?: string;
}) {
  return <Player file={file} initialScreenId={initialScreenId} initialPageId={initialPageId} />;
}
