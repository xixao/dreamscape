import { notFound } from 'next/navigation';
// Imported from known-types.ts, not registry.tsx: registry.tsx pulls in
// @craftjs/core and the shadcn/Radix-based block components, which breaks
// Next's server bundling for a server component ("X.createContext is not a
// function" while "Collecting page data"). See known-types.ts for the full
// explanation.
import { KNOWN_TYPES, emptyLayoutJson } from '@/components/blocks/known-types';
import { WorkbenchLoader } from '@/components/workbench/workbench-loader';
import { getRepository } from '@/lib/files/http';
import { normalizeLayout, validateLayout } from '@/lib/files/validate';

export const dynamic = 'force-dynamic';

// Every screen's layout is run through normalizeLayout (rewrites any
// pre-8px-scale legacy gap/padding into gapPx/paddingPx, see
// lib/files/validate.ts) and then validateLayout before the file ever
// reaches the client Workbench: a screen that still fails validation after
// normalizing (unparsable JSON, or a block type this build no longer knows)
// gets an empty stand-in instead, the same recovery a single-layout file
// always had, just scoped to the one screen that needed it rather than the
// whole file. StageErrorBoundary remains the last-resort net for anything
// Craft itself refuses to deserialize that this shallow check cannot see.
export default async function FilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repository = await getRepository();
  const file = await repository.get(id);
  if (!file) notFound();

  const screens = (file.screens ?? []).map((screen) => {
    const normalized = normalizeLayout(screen.layout);
    const validated = validateLayout(normalized, KNOWN_TYPES);
    return { ...screen, layout: validated.ok ? normalized : emptyLayoutJson() };
  });

  return <WorkbenchLoader file={{ ...file, screens }} />;
}
