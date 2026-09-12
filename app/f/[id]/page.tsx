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
