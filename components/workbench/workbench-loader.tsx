'use client';

import dynamic from 'next/dynamic';
import type { FileRecord } from '@/lib/files/repository';

const Workbench = dynamic(() => import('./workbench').then((m) => m.Workbench), {
  ssr: false,
});

export function WorkbenchLoader({ file }: { file: FileRecord }) {
  // Keyed by file id so navigating between two /f/[id] pages that Next.js
  // treats as the same route (identical segment shape) still mounts a fresh
  // Workbench: the screens array, the saver's fileId/initialUpdatedAt and
  // the name state are all seeded once from props via lazy useState, so
  // reusing the instance across files would keep showing the first file's
  // content.
  return <Workbench key={file.id} file={file} />;
}
