import { exampleToScreens, findExample } from '@/lib/examples';
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

  const { name, example, folderId, screens } = parsed.data;
  const repository = await getRepository();

  // Unlike layout (below, always the bundled example's, already
  // known-good), folderId comes straight from the client here, so it needs
  // its own explicit 400 rather than falling through to create()'s
  // defensive throw-on-a-bad-folderId (see the comment on create() in
  // lib/files/repository.ts), which Next would otherwise turn into an
  // uncaught 500.
  if (folderId !== undefined && folderId !== null) {
    const path = await repository.folderPath(folderId);
    if (path === null) {
      return Response.json({ error: 'Folder does not exist' }, { status: 400 });
    }
  }

  // create() throws on an invalid layout (see lib/files/repository.ts), but
  // the only layout this route ever passes via `example` is the bundled
  // example's, which is already known-good (lib/examples/index.test.tsx
  // asserts it validates). So a throw here is not a client input problem to
  // map to 400; it is an infrastructure failure (bundling regressed, the
  // database is unreachable, ...), and should propagate to Next's default
  // 500 rather than being echoed back as a 400.
  if (example !== undefined) {
    const found = findExample(example);
    const file = await repository.create({
      name: name ?? found?.name,
      screens: found ? exampleToScreens(found) : undefined,
      folderId,
    });
    return Response.json({ file }, { status: 201 });
  }

  const file = await repository.create({ name, screens, folderId });
  return Response.json({ file }, { status: 201 });
}
