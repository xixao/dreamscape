import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
// Imported from known-types.ts, not registry.tsx: see app/f/[id]/page.tsx's
// own identical comment (registry.tsx pulls in @craftjs/core, which breaks
// Next's server bundling for a server component).
import { KNOWN_TYPES, emptyLayoutJson } from '@/components/blocks/known-types';
import { PlayerLoader } from '@/components/play/player-loader';
import { getRepository } from '@/lib/files/http';
import { normalizeLayout, validateLayout } from '@/lib/files/validate';

export const dynamic = 'force-dynamic';

// generateMetadata and PlayPage both need this file, so the lookup is
// wrapped in React's cache(): within a single request the second call reads
// the memoized result instead of hitting the repository again (a per-request
// memoization, not a cross-request cache - see
// https://react.dev/reference/react/cache). app/f/[id]/page.tsx has no
// generateMetadata of its own, so it has no matching double read to mirror
// this against.
const getFile = cache(async (id: string) => {
  const repository = await getRepository();
  return repository.get(id);
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const file = await getFile(id);
  return { title: file ? `${file.name} (Play)` : 'File not found' };
}

// Same per-screen normalizeLayout -> validateLayout treatment as
// app/f/[id]/page.tsx, for the same reason: a screen whose layout still has
// pre-8px-scale legacy gap/padding must be converted before Craft
// deserializes it (see lib/files/validate.ts), or Play would silently show
// different spacing than the Design editor does for the exact same file. A
// screen that still fails validation after normalizing gets the same empty
// stand-in the editor falls back to.
export default async function PlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ screen?: string | string[] }>;
}) {
  const { id } = await params;
  const { screen } = await searchParams;
  const file = await getFile(id);
  if (!file) notFound();

  const screens = (file.screens ?? []).map((s) => {
    const normalized = normalizeLayout(s.layout);
    const validated = validateLayout(normalized, KNOWN_TYPES);
    return { ...s, layout: validated.ok ? normalized : emptyLayoutJson() };
  });
  // A real file always has at least one screen (validateScreens rejects an
  // empty array on every create/save) - defensive, not expected in
  // production.
  if (screens.length === 0) notFound();

  const requestedScreenId = Array.isArray(screen) ? screen[0] : screen;
  const initialScreenId = screens.some((s) => s.id === requestedScreenId) ? requestedScreenId! : screens[0].id;

  return <PlayerLoader file={{ ...file, screens }} initialScreenId={initialScreenId} />;
}
