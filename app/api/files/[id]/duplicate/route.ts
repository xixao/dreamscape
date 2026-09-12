import { getRepository } from '@/lib/files/http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repository = await getRepository();
  const file = await repository.duplicate(id);

  if (!file) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  return Response.json({ file }, { status: 201 });
}
