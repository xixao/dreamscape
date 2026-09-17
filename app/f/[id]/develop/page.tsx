import { notFound } from 'next/navigation';
import { KNOWN_TYPES, emptyLayoutJson } from '@/components/blocks/known-types';
import { PlayerLoader } from '@/components/play/player-loader';
import { getRepository } from '@/lib/files/http';
import { normalizeLayout, validateLayout } from '@/lib/files/validate';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Develop — Dreamscape' };
export default async function DevelopPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ screen?: string; page?: string }>;
}) {
  const { id } = await params;
  const file = await (await getRepository()).get(id);
  if (!file) notFound();
  const search = await searchParams;
  const screens = (file.screens ?? []).map(screen => {
    const normalized = normalizeLayout(screen.layout);
    return { ...screen, layout: validateLayout(normalized, KNOWN_TYPES).ok ? normalized : emptyLayoutJson() };
  });
  return <PlayerLoader developer file={{ ...file, screens }} initialScreenId={search.screen} initialPageId={search.page} />;
}
