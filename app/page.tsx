import { FilesPage } from '@/components/files/files-page';
import { getDb } from '@/db/client';
import { createFilesRepository } from '@/lib/files/repository';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const repo = createFilesRepository(await getDb());
  const files = await repo.list();
  return <FilesPage files={files} />;
}
