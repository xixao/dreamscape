import { FilesPage } from '@/components/files/files-page';
import { getRepository } from '@/lib/files/http';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const repository = await getRepository();
  const [path, { folders, files }] = await Promise.all([
    repository.folderPath(null),
    repository.listChildren(null),
  ]);

  return <FilesPage path={path ?? []} folders={folders} files={files} folderId={null} />;
}
