// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDbForTests } from '@/db/client';
import { getRepository } from '@/lib/files/http';
import { DELETE, PATCH } from './[id]/route';
import { GET as LIST_ALL } from './all/route';
import { GET, POST } from './route';

function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function malformedJsonRequest(url: string, method: string): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: '{not valid json',
  });
}

function withId(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  return text.length > 0 ? JSON.parse(text) : undefined;
}

describe('folders API route handlers', () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  describe('GET /api/folders', () => {
    it('returns the top level when parent is omitted', async () => {
      const repository = await getRepository();
      await repository.createFolder({ name: 'Marketing' });
      await repository.create({ name: 'Top file' });

      const response = await GET(new Request('http://x/api/folders'));
      const body = (await readBody(response)) as {
        path: unknown[];
        folders: Array<{ name: string }>;
        files: Array<{ name: string }>;
      };

      expect(response.status).toBe(200);
      expect(body.path).toEqual([]);
      expect(body.folders.map((folder) => folder.name)).toEqual(['Marketing']);
      expect(body.files.map((file) => file.name)).toEqual(['Top file']);
    });

    it('treats an empty parent value the same as omitting it', async () => {
      const response = await GET(new Request('http://x/api/folders?parent='));
      const body = (await readBody(response)) as { path: unknown[] };

      expect(response.status).toBe(200);
      expect(body.path).toEqual([]);
    });

    it('returns the breadcrumb path (root first, including the folder itself) and its children', async () => {
      const repository = await getRepository();
      const parentResult = await repository.createFolder({ name: 'Marketing' });
      if (!parentResult.ok) throw new Error('expected createFolder to succeed');
      const childResult = await repository.createFolder({ name: 'Q4', parentId: parentResult.folder.id });
      if (!childResult.ok) throw new Error('expected createFolder to succeed');
      await repository.create({ name: 'Plan', folderId: childResult.folder.id });

      const response = await GET(new Request(`http://x/api/folders?parent=${childResult.folder.id}`));
      const body = (await readBody(response)) as {
        path: Array<{ name: string }>;
        folders: unknown[];
        files: Array<{ name: string }>;
      };

      expect(response.status).toBe(200);
      expect(body.path.map((folder) => folder.name)).toEqual(['Marketing', 'Q4']);
      expect(body.folders).toEqual([]);
      expect(body.files.map((file) => file.name)).toEqual(['Plan']);
    });

    it('returns 404 for an unknown parent', async () => {
      const response = await GET(new Request('http://x/api/folders?parent=doesnotexist'));

      expect(response.status).toBe(404);
      expect(await readBody(response)).toEqual({ error: 'Not found' });
    });
  });

  describe('POST /api/folders', () => {
    it('creates a top-level folder and returns 201', async () => {
      const response = await POST(jsonRequest('http://x/api/folders', 'POST', { name: 'Marketing' }));
      const body = (await readBody(response)) as { folder: { name: string; parentId: string | null } };

      expect(response.status).toBe(201);
      expect(body.folder.name).toBe('Marketing');
      expect(body.folder.parentId).toBeNull();
    });

    it('creates a nested folder', async () => {
      const repository = await getRepository();
      const parent = await repository.createFolder({ name: 'Marketing' });
      if (!parent.ok) throw new Error('expected createFolder to succeed');

      const response = await POST(
        jsonRequest('http://x/api/folders', 'POST', { name: 'Q4', parentId: parent.folder.id }),
      );
      const body = (await readBody(response)) as { folder: { name: string; parentId: string | null } };

      expect(response.status).toBe(201);
      expect(body.folder.parentId).toBe(parent.folder.id);
    });

    it('returns 404 for a missing parent', async () => {
      const response = await POST(
        jsonRequest('http://x/api/folders', 'POST', { name: 'Orphan', parentId: 'doesnotexist' }),
      );

      expect(response.status).toBe(404);
      expect(await readBody(response)).toEqual({ error: 'Not found' });
    });

    it('returns 400 for a blank name', async () => {
      const response = await POST(jsonRequest('http://x/api/folders', 'POST', { name: '   ' }));
      const body = (await readBody(response)) as { error: string };

      expect(response.status).toBe(400);
      expect(typeof body.error).toBe('string');
    });

    it('returns 400 for a missing name', async () => {
      const response = await POST(jsonRequest('http://x/api/folders', 'POST', {}));

      expect(response.status).toBe(400);
    });

    it('rejects an unparsable body with 400 Invalid JSON', async () => {
      const response = await POST(malformedJsonRequest('http://x/api/folders', 'POST'));

      expect(response.status).toBe(400);
      expect(await readBody(response)).toEqual({ error: 'Invalid JSON' });
    });
  });

  describe('GET /api/folders/all', () => {
    it('lists every folder regardless of nesting', async () => {
      const repository = await getRepository();
      const parent = await repository.createFolder({ name: 'Marketing' });
      if (!parent.ok) throw new Error('expected createFolder to succeed');
      await repository.createFolder({ name: 'Q4', parentId: parent.folder.id });

      const response = await LIST_ALL();
      const body = (await readBody(response)) as { folders: Array<{ name: string; parentId: string | null }> };

      expect(response.status).toBe(200);
      expect(body.folders.map((folder) => folder.name)).toEqual(['Marketing', 'Q4']);
    });

    it('returns an empty list when there are no folders', async () => {
      const response = await LIST_ALL();

      expect(response.status).toBe(200);
      expect(await readBody(response)).toEqual({ folders: [] });
    });
  });

  describe('PATCH /api/folders/[id]', () => {
    it('renames a folder', async () => {
      const repository = await getRepository();
      const created = await repository.createFolder({ name: 'Old' });
      if (!created.ok) throw new Error('expected createFolder to succeed');

      const response = await PATCH(
        jsonRequest(`http://x/api/folders/${created.folder.id}`, 'PATCH', { name: 'New' }),
        withId(created.folder.id),
      );
      const body = (await readBody(response)) as { folder: { name: string } };

      expect(response.status).toBe(200);
      expect(body.folder.name).toBe('New');
    });

    it('moves a folder to a new parent', async () => {
      const repository = await getRepository();
      const a = await repository.createFolder({ name: 'A' });
      const b = await repository.createFolder({ name: 'B' });
      if (!a.ok || !b.ok) throw new Error('expected createFolder to succeed');

      const response = await PATCH(
        jsonRequest(`http://x/api/folders/${b.folder.id}`, 'PATCH', { parentId: a.folder.id }),
        withId(b.folder.id),
      );
      const body = (await readBody(response)) as { folder: { parentId: string | null } };

      expect(response.status).toBe(200);
      expect(body.folder.parentId).toBe(a.folder.id);
    });

    it('moves a folder to the top level with parentId null', async () => {
      const repository = await getRepository();
      const a = await repository.createFolder({ name: 'A' });
      if (!a.ok) throw new Error('expected createFolder to succeed');
      const b = await repository.createFolder({ name: 'B', parentId: a.folder.id });
      if (!b.ok) throw new Error('expected createFolder to succeed');

      const response = await PATCH(
        jsonRequest(`http://x/api/folders/${b.folder.id}`, 'PATCH', { parentId: null }),
        withId(b.folder.id),
      );
      const body = (await readBody(response)) as { folder: { parentId: string | null } };

      expect(response.status).toBe(200);
      expect(body.folder.parentId).toBeNull();
    });

    it('renames and moves in the same request', async () => {
      const repository = await getRepository();
      const a = await repository.createFolder({ name: 'A' });
      const b = await repository.createFolder({ name: 'B' });
      if (!a.ok || !b.ok) throw new Error('expected createFolder to succeed');

      const response = await PATCH(
        jsonRequest(`http://x/api/folders/${b.folder.id}`, 'PATCH', { name: 'B renamed', parentId: a.folder.id }),
        withId(b.folder.id),
      );
      const body = (await readBody(response)) as { folder: { name: string; parentId: string | null } };

      expect(response.status).toBe(200);
      expect(body.folder.name).toBe('B renamed');
      expect(body.folder.parentId).toBe(a.folder.id);
    });

    it('returns 400 Cannot move a folder into itself when parentId is its own id', async () => {
      const repository = await getRepository();
      const created = await repository.createFolder({ name: 'A' });
      if (!created.ok) throw new Error('expected createFolder to succeed');

      const response = await PATCH(
        jsonRequest(`http://x/api/folders/${created.folder.id}`, 'PATCH', { parentId: created.folder.id }),
        withId(created.folder.id),
      );

      expect(response.status).toBe(400);
      expect(await readBody(response)).toEqual({ error: 'Cannot move a folder into itself' });
    });

    it('returns 400 Cannot move a folder into itself for a cycle through a descendant', async () => {
      const repository = await getRepository();
      const a = await repository.createFolder({ name: 'A' });
      if (!a.ok) throw new Error('expected createFolder to succeed');
      const b = await repository.createFolder({ name: 'B', parentId: a.folder.id });
      if (!b.ok) throw new Error('expected createFolder to succeed');

      const response = await PATCH(
        jsonRequest(`http://x/api/folders/${a.folder.id}`, 'PATCH', { parentId: b.folder.id }),
        withId(a.folder.id),
      );

      expect(response.status).toBe(400);
      expect(await readBody(response)).toEqual({ error: 'Cannot move a folder into itself' });
    });

    it('returns 404 for a missing folder', async () => {
      const response = await PATCH(
        jsonRequest('http://x/api/folders/missing', 'PATCH', { name: 'X' }),
        withId('missing'),
      );

      expect(response.status).toBe(404);
      expect(await readBody(response)).toEqual({ error: 'Not found' });
    });

    it('returns 404 when moving into a missing parent', async () => {
      const repository = await getRepository();
      const created = await repository.createFolder({ name: 'A' });
      if (!created.ok) throw new Error('expected createFolder to succeed');

      const response = await PATCH(
        jsonRequest(`http://x/api/folders/${created.folder.id}`, 'PATCH', { parentId: 'doesnotexist' }),
        withId(created.folder.id),
      );

      expect(response.status).toBe(404);
      expect(await readBody(response)).toEqual({ error: 'Not found' });
    });

    it('returns 400 for an empty patch body', async () => {
      const repository = await getRepository();
      const created = await repository.createFolder({ name: 'A' });
      if (!created.ok) throw new Error('expected createFolder to succeed');

      const response = await PATCH(
        jsonRequest(`http://x/api/folders/${created.folder.id}`, 'PATCH', {}),
        withId(created.folder.id),
      );

      expect(response.status).toBe(400);
      expect(await readBody(response)).toEqual({ error: 'empty patch' });
    });

    it('returns 400 for a blank name', async () => {
      const repository = await getRepository();
      const created = await repository.createFolder({ name: 'A' });
      if (!created.ok) throw new Error('expected createFolder to succeed');

      const response = await PATCH(
        jsonRequest(`http://x/api/folders/${created.folder.id}`, 'PATCH', { name: '   ' }),
        withId(created.folder.id),
      );

      expect(response.status).toBe(400);
    });

    it('rejects an unparsable body with 400 Invalid JSON', async () => {
      const repository = await getRepository();
      const created = await repository.createFolder({ name: 'A' });
      if (!created.ok) throw new Error('expected createFolder to succeed');

      const response = await PATCH(
        malformedJsonRequest(`http://x/api/folders/${created.folder.id}`, 'PATCH'),
        withId(created.folder.id),
      );

      expect(response.status).toBe(400);
      expect(await readBody(response)).toEqual({ error: 'Invalid JSON' });
    });
  });

  describe('DELETE /api/folders/[id]', () => {
    it('deletes an empty folder and returns 204 with no body', async () => {
      const repository = await getRepository();
      const created = await repository.createFolder({ name: 'A' });
      if (!created.ok) throw new Error('expected createFolder to succeed');

      const response = await DELETE(
        new Request(`http://x/api/folders/${created.folder.id}`, { method: 'DELETE' }),
        withId(created.folder.id),
      );

      expect(response.status).toBe(204);
      expect(await response.text()).toBe('');
      expect(await repository.listFolders()).toHaveLength(0);
    });

    it('returns 409 Folder is not empty when it has a subfolder', async () => {
      const repository = await getRepository();
      const a = await repository.createFolder({ name: 'A' });
      if (!a.ok) throw new Error('expected createFolder to succeed');
      await repository.createFolder({ name: 'B', parentId: a.folder.id });

      const response = await DELETE(
        new Request(`http://x/api/folders/${a.folder.id}`, { method: 'DELETE' }),
        withId(a.folder.id),
      );

      expect(response.status).toBe(409);
      expect(await readBody(response)).toEqual({ error: 'Folder is not empty' });
    });

    it('returns 409 Folder is not empty when it has a file', async () => {
      const repository = await getRepository();
      const a = await repository.createFolder({ name: 'A' });
      if (!a.ok) throw new Error('expected createFolder to succeed');
      await repository.create({ folderId: a.folder.id });

      const response = await DELETE(
        new Request(`http://x/api/folders/${a.folder.id}`, { method: 'DELETE' }),
        withId(a.folder.id),
      );

      expect(response.status).toBe(409);
      expect(await readBody(response)).toEqual({ error: 'Folder is not empty' });
    });

    it('returns 404 for a missing folder', async () => {
      const response = await DELETE(
        new Request('http://x/api/folders/missing', { method: 'DELETE' }),
        withId('missing'),
      );

      expect(response.status).toBe(404);
      expect(await readBody(response)).toEqual({ error: 'Not found' });
    });
  });
});
