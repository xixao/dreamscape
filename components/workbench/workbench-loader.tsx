'use client';

import dynamic from 'next/dynamic';

const Workbench = dynamic(() => import('./workbench').then((m) => m.Workbench), {
  ssr: false,
});

export function WorkbenchLoader() {
  return <Workbench />;
}
