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

// Next hands a repeated query key as an array, a single one as a plain
// string, and an absent one as undefined - this always resolves to the
// first value or undefined, the same "first wins" resolveInitialScreenId
// itself uses for an explicit initialScreenId. Its own export, tested
// directly, for the same reason app/f/[id]/page.tsx's resolveClientScreens
// is: the Server Component itself (getRepository, notFound) is not worth
// rendering just to exercise this one-line extraction.
export function firstSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

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
  searchParams: Promise<{ screen?: string | string[]; page?: string | string[]; overlay?: string | string[] }>;
}) {
  const { id } = await params;
  const { screen, page, overlay } = await searchParams;
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

  // Passed through raw: components/play/player.tsx's own
  // resolveInitialScreenId is what makes sense of an absent, unknown or
  // mismatched screen/page (spec docs/superpowers/specs/2026-09-12-pages-
  // design.md section 4, "resolve the page and start on its first screen
  // (or the given one)") - duplicating that fallback chain here would only
  // risk the two drifting apart. `overlay` (spec docs/superpowers/specs/
  // 2026-09-13-overlay-frames-design.md section 4 + 5's Present entry
  // point) is the same kind of raw passthrough: Player's own openOverlay
  // guard (overlaysById.has) is what decides whether it names a real
  // overlay frame, ignoring it otherwise - the two entry points that ever
  // set it (topbar.tsx's presentHrefFor, used by both the Play link and
  // workbench.tsx's Cmd+R handler) only ever do so alongside `page`, never
  // `screen`, so the Player's own page-based resolution is what actually
  // lands on the right starting screen underneath it.
  const initialScreenId = firstSearchParam(screen);
  const initialPageId = firstSearchParam(page);
  const initialOverlayId = firstSearchParam(overlay);

  return (
    <PlayerLoader
      file={{ ...file, screens }}
      initialScreenId={initialScreenId}
      initialPageId={initialPageId}
      initialOverlayId={initialOverlayId}
    />
  );
}
