import { notFound } from 'next/navigation';
// Imported from known-types.ts, not registry.tsx: registry.tsx pulls in
// @craftjs/core and the shadcn/Radix-based block components, which breaks
// Next's server bundling for a server component ("X.createContext is not a
// function" while "Collecting page data"). See known-types.ts for the full
// explanation.
import { KNOWN_TYPES, emptyLayoutJson } from '@/components/blocks/known-types';
import { WorkbenchLoader } from '@/components/workbench/workbench-loader';
import type { Screen } from '@/lib/files/repository';
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
//
// Kept as its own export (rather than inlined in FilePage below) so this
// derivation is unit-testable without mocking getRepository()/getDb() -
// FilePage itself stays a thin data-fetching wrapper around it. The ids of
// whichever screens fell back to empty are returned alongside, not just
// swallowed: Workbench uses them to show a per-screen notice instead of
// silently pretending nothing was lost (see page.test.tsx and
// components/workbench/workbench.tsx's own invalidScreenIds prop).
export function resolveClientScreens(
  screens: Screen[],
  knownTypes: ReadonlySet<string>,
): { screens: Screen[]; invalidScreenIds: string[] } {
  const invalidScreenIds: string[] = [];
  const resolved = screens.map((screen) => {
    const normalized = normalizeLayout(screen.layout);
    const validated = validateLayout(normalized, knownTypes);
    if (!validated.ok) invalidScreenIds.push(screen.id);
    return { ...screen, layout: validated.ok ? normalized : emptyLayoutJson() };
  });
  return { screens: resolved, invalidScreenIds };
}

export default async function FilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repository = await getRepository();
  const file = await repository.get(id);
  if (!file) notFound();

  const { screens, invalidScreenIds } = resolveClientScreens(file.screens ?? [], KNOWN_TYPES);

  return <WorkbenchLoader file={{ ...file, screens }} invalidScreenIds={invalidScreenIds} />;
}
