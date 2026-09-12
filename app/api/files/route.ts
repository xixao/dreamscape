import { findExample } from '@/lib/examples';
import { createBody, getRepository } from '@/lib/files/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  const repository = await getRepository();
  const files = await repository.list();
  return Response.json({ files });
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = createBody.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
  }

  const { name, example } = parsed.data;
  const repository = await getRepository();

  // create() throws on an invalid layout (see lib/files/repository.ts); the
  // only layout this route ever passes is the bundled example's, which is
  // already known-good (lib/examples/index.test.ts asserts it validates),
  // so this catch only guards against that invariant ever breaking.
  try {
    if (example !== undefined) {
      const found = findExample(example);
      const file = await repository.create({
        name: name ?? found?.name,
        layout: found?.layout,
        stageWidth: found?.stageWidth,
      });
      return Response.json({ file }, { status: 201 });
    }

    const file = await repository.create({ name });
    return Response.json({ file }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Invalid body' }, { status: 400 });
  }
}
