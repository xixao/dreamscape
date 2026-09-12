import { notFound } from 'next/navigation';
import { FilesPage } from '@/components/files/files-page';
import { getRepository } from '@/lib/files/http';

export const dynamic = 'force-dynamic';

export default async function FolderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repository = await getRepository();

  const path = await repository.folderPath(id);
  if (path === null) notFound();

  const { folders, files } = await repository.listChildren(id);
  return <FilesPage path={path} folders={folders} files={files} folderId={id} />;
}
