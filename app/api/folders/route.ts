import { createFolderBody, getRepository } from '@/lib/files/http';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parentParam = url.searchParams.get('parent');
  const parentId = parentParam && parentParam.length > 0 ? parentParam : null;

  const repository = await getRepository();
  const path = await repository.folderPath(parentId);
  if (path === null) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const { folders, files } = await repository.listChildren(parentId);
  return Response.json({ path, folders, files });
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = createFolderBody.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
  }

  const repository = await getRepository();
  const result = await repository.createFolder(parsed.data);

  if (!result.ok) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  return Response.json({ folder: result.folder }, { status: 201 });
}
