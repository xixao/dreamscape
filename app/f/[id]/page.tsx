import { notFound } from 'next/navigation';
// Imported from known-types.ts, not registry.tsx: registry.tsx pulls in
// @craftjs/core and the shadcn/Radix-based block components, which breaks
// Next's server bundling for a server component ("X.createContext is not a
// function" while "Collecting page data"). See known-types.ts for the full
// explanation.
import { KNOWN_TYPES, emptyLayoutJson } from '@/components/blocks/known-types';
import { WorkbenchLoader } from '@/components/workbench/workbench-loader';
import { getRepository } from '@/lib/files/http';
import { validateLayout } from '@/lib/files/validate';

export const dynamic = 'force-dynamic';

// Task S1 (see docs/superpowers/plans/2026-09-12-screens-prototype-play.md)
// replaced a file's single layout/stageWidth with a `screens` array, but
// WorkbenchLoader/Workbench are not rewired to it until Task S2 - until
// then they still read `file.layout`/`file.stageWidth`, and FileRecord
// keeps those two fields as a temporary mirror of `screens[0]` (see the
// comment on FileRecord in lib/files/repository.ts) so this page needs no
// change of its own to keep working: it renders the file's first screen
// only, exactly the old single-screen behavior, and a second screen (once
// something can create one) is invisible here until Task S2 lands.
export default async function FilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repository = await getRepository();
  const file = await repository.get(id);
  if (!file) notFound();

  const validated = validateLayout(file.layout, KNOWN_TYPES);
  const layoutInvalid = !validated.ok;

  return (
    <WorkbenchLoader
      file={layoutInvalid ? { ...file, layout: emptyLayoutJson() } : file}
      layoutInvalid={layoutInvalid}
    />
  );
}
