import { getRepository, saveBody } from '@/lib/files/http';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repository = await getRepository();
  const file = await repository.get(id);

  if (!file) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  return Response.json({ file });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = saveBody.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
  }

  const repository = await getRepository();
  const result = await repository.save(id, parsed.data);

  if (result.ok) {
    return Response.json({ updatedAt: result.updatedAt });
  }
  if ('conflict' in result) {
    return Response.json({ updatedAt: result.updatedAt }, { status: 409 });
  }
  if ('notFound' in result) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  return Response.json({ error: result.invalid }, { status: 400 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repository = await getRepository();
  const removed = await repository.remove(id);

  if (!removed) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
