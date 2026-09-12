import { getRepository } from '@/lib/files/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  const repository = await getRepository();
  const folders = await repository.listFolders();
  return Response.json({ folders });
}
