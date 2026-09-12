import type { FolderSummary } from '@/lib/files/repository';
import { getRepository, updateFolderBody } from '@/lib/files/http';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = updateFolderBody.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
  }

  const repository = await getRepository();
  // updateFolderBody's refine guarantees at least one of these two is
  // present, so `folder` is always assigned by the time it is returned
  // below. Applied in this order (move, then rename) so that if the move
  // is rejected, nothing has been written yet.
  let folder: FolderSummary | undefined;

  if (parsed.data.parentId !== undefined) {
    const moveResult = await repository.moveFolder(id, parsed.data.parentId);
    if (!moveResult.ok) {
      if ('notFound' in moveResult) {
        return Response.json({ error: 'Not found' }, { status: 404 });
      }
      return Response.json({ error: 'Cannot move a folder into itself' }, { status: 400 });
    }
    folder = moveResult.folder;
  }

  if (parsed.data.name !== undefined) {
    const renameResult = await repository.renameFolder(id, parsed.data.name);
    if (!renameResult.ok) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    folder = renameResult.folder;
  }

  return Response.json({ folder });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repository = await getRepository();
  const result = await repository.removeFolder(id);

  if (result.ok) {
    return new Response(null, { status: 204 });
  }
  if ('notEmpty' in result) {
    return Response.json({ error: 'Folder is not empty' }, { status: 409 });
  }
  return Response.json({ error: 'Not found' }, { status: 404 });
}
