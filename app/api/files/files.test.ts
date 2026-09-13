// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDbForTests } from '@/db/client';
import { getRepository } from '@/lib/files/http';
import { DELETE, GET as GET_FILE, PATCH } from './[id]/route';
import { POST as DUPLICATE } from './[id]/duplicate/route';
import { GET as LIST, POST as CREATE } from './route';

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

describe('files API route handlers', () => {
  beforeAll(() => {
    // This checkout has a real DATABASE_URL in .env.local, but Vitest never
    // loads .env.local. If this ever fails, getDb() would be talking to
    // production Neon instead of the in-memory PGlite test database.
    expect(process.env.DATABASE_URL).toBeUndefined();
  });

  beforeEach(async () => {
    await resetDbForTests();
  });

  describe('GET /api/files', () => {
    it('returns an empty list when there are no files', async () => {
      const response = await LIST();

      expect(response.status).toBe(200);
      expect(await readBody(response)).toEqual({ files: [] });
    });

    it('lists files newest updated first', async () => {
      const repository = await getRepository();
      await repository.create({ name: 'First' });
      await repository.create({ name: 'Second' });

      const response = await LIST();
      const body = (await readBody(response)) as { files: Array<{ name: string }> };

      expect(response.status).toBe(200);
      expect(body.files.map((file) => file.name)).toEqual(['Second', 'First']);
    });
  });

  describe('POST /api/files', () => {
    it('creates a default file with one default screen and returns 201', async () => {
      const response = await CREATE(jsonRequest('http://x/api/files', 'POST', {}));
      const body = (await readBody(response)) as {
        file: { name: string; screenCount: number; screens: Array<{ name: string; stageWidth: number; layout: string }> };
      };

      expect(response.status).toBe(201);
      expect(body.file.name).toBe('Untitled');
      expect(body.file.screenCount).toBe(1);
      expect(body.file.screens).toHaveLength(1);
      expect(body.file.screens[0].name).toBe('Frame 1');
      expect(body.file.screens[0].stageWidth).toBe(1440);
      expect(JSON.parse(body.file.screens[0].layout)).toHaveProperty('ROOT');
    });

    it('creates a file with a given name', async () => {
      const response = await CREATE(jsonRequest('http://x/api/files', 'POST', { name: 'My design' }));
      const body = (await readBody(response)) as { file: { name: string } };

      expect(response.status).toBe(201);
      expect(body.file.name).toBe('My design');
    });

    it('creates a file with explicitly given screens', async () => {
      const response = await CREATE(
        jsonRequest('http://x/api/files', 'POST', {
          screens: [
            { id: 'aaaaaaaaaa', name: 'Frame 1', layout: JSON.stringify({ ROOT: { type: 'LayoutBox' } }), stageWidth: 375 },
            { id: 'bbbbbbbbbb', name: 'Frame 2', layout: JSON.stringify({ ROOT: { type: 'LayoutBox' } }), stageWidth: 768 },
          ],
        }),
      );
      const body = (await readBody(response)) as {
        file: { screenCount: number; screens: Array<{ id: string; name: string; stageWidth: number }> };
      };

      expect(response.status).toBe(201);
      expect(body.file.screenCount).toBe(2);
      expect(body.file.screens.map((s) => s.name)).toEqual(['Frame 1', 'Frame 2']);
      expect(body.file.screens.map((s) => s.stageWidth)).toEqual([375, 768]);
    });

    it('round-trips a screen given an explicit stageHeight and deviceName, and defaults them to null otherwise', async () => {
      const response = await CREATE(
        jsonRequest('http://x/api/files', 'POST', {
          screens: [
            {
              id: 'aaaaaaaaaa',
              name: 'Frame 1',
              layout: JSON.stringify({ ROOT: { type: 'LayoutBox' } }),
              stageWidth: 402,
              stageHeight: 874,
              deviceName: 'iPhone 16 & 17 Pro',
            },
            {
              id: 'bbbbbbbbbb',
              name: 'Frame 2',
              layout: JSON.stringify({ ROOT: { type: 'LayoutBox' } }),
              stageWidth: 1440,
            },
          ],
        }),
      );
      const body = (await readBody(response)) as {
        file: { screens: Array<{ stageWidth: number; stageHeight: number | null; deviceName: string | null }> };
      };

      expect(response.status).toBe(201);
      expect(body.file.screens[0]).toMatchObject({ stageWidth: 402, stageHeight: 874, deviceName: 'iPhone 16 & 17 Pro' });
      expect(body.file.screens[1]).toMatchObject({ stageWidth: 1440, stageHeight: null, deviceName: null });
    });

    it('creates from the login example with the example name and layout when no name is given', async () => {
      const response = await CREATE(jsonRequest('http://x/api/files', 'POST', { example: 'login' }));
      const body = (await readBody(response)) as {
        file: { name: string; screens: Array<{ name: string; stageWidth: number; layout: string }> };
      };

      expect(response.status).toBe(201);
      expect(body.file.name).toBe('Login screen');
      expect(body.file.screens).toHaveLength(1);
      expect(body.file.screens[0].name).toBe('Login screen');
      expect(body.file.screens[0].stageWidth).toBe(1440);
      expect(Object.keys(JSON.parse(body.file.screens[0].layout))).toHaveLength(7);
    });

    it('creates from the login example but keeps a given file name (the screen keeps the example name)', async () => {
      const response = await CREATE(jsonRequest('http://x/api/files', 'POST', { name: 'Custom', example: 'login' }));
      const body = (await readBody(response)) as { file: { name: string; screens: Array<{ name: string; layout: string }> } };

      expect(response.status).toBe(201);
      expect(body.file.name).toBe('Custom');
      expect(body.file.screens[0].name).toBe('Login screen');
      expect(Object.keys(JSON.parse(body.file.screens[0].layout))).toHaveLength(7);
    });

    it('rejects an unknown example with 400', async () => {
      const response = await CREATE(jsonRequest('http://x/api/files', 'POST', { example: 'not-a-real-example' }));
      const body = (await readBody(response)) as { error: string };

      expect(response.status).toBe(400);
      expect(typeof body.error).toBe('string');
    });

    it('rejects an unparsable body with 400 Invalid JSON', async () => {
      const response = await CREATE(malformedJsonRequest('http://x/api/files', 'POST'));

      expect(response.status).toBe(400);
      expect(await readBody(response)).toEqual({ error: 'Invalid JSON' });
    });

    it('creates a file inside a folder', async () => {
      const repository = await getRepository();
      const folder = await repository.createFolder({ name: 'Target' });
      if (!folder.ok) throw new Error('expected createFolder to succeed');

      const response = await CREATE(
        jsonRequest('http://x/api/files', 'POST', { name: 'In folder', folderId: folder.folder.id }),
      );
      const body = (await readBody(response)) as { file: { folderId: string | null } };

      expect(response.status).toBe(201);
      expect(body.file.folderId).toBe(folder.folder.id);
    });

    it('returns 400 Folder does not exist when creating in an unknown folder', async () => {
      const response = await CREATE(
        jsonRequest('http://x/api/files', 'POST', { name: 'X', folderId: 'doesnotexist' }),
      );

      expect(response.status).toBe(400);
      expect(await readBody(response)).toEqual({ error: 'Folder does not exist' });
    });
  });

  describe('GET /api/files/[id]', () => {
    it('returns the file', async () => {
      const repository = await getRepository();
      const file = await repository.create({ name: 'Alpha' });

      const response = await GET_FILE(new Request(`http://x/api/files/${file.id}`), withId(file.id));
      const body = (await readBody(response)) as { file: { id: string; name: string } };

      expect(response.status).toBe(200);
      expect(body.file.id).toBe(file.id);
      expect(body.file.name).toBe('Alpha');
    });

    it('returns 404 for a missing file', async () => {
      const response = await GET_FILE(new Request('http://x/api/files/missing'), withId('missing'));

      expect(response.status).toBe(404);
      expect(await readBody(response)).toEqual({ error: 'Not found' });
    });
  });

  describe('PATCH /api/files/[id]', () => {
    it('saves a name change and returns updatedAt', async () => {
      const repository = await getRepository();
      const file = await repository.create();

      const response = await PATCH(
        jsonRequest(`http://x/api/files/${file.id}`, 'PATCH', { name: 'Renamed' }),
        withId(file.id),
      );
      const body = (await readBody(response)) as { updatedAt: string };

      expect(response.status).toBe(200);
      expect(typeof body.updatedAt).toBe('string');

      const stored = await repository.get(file.id);
      expect(stored?.name).toBe('Renamed');
    });

    it('returns 409 with the current updatedAt on a stale baseUpdatedAt', async () => {
      const repository = await getRepository();
      const file = await repository.create();
      await repository.save(file.id, { name: 'Changed elsewhere' });

      const response = await PATCH(
        jsonRequest(`http://x/api/files/${file.id}`, 'PATCH', {
          name: 'Mine',
          baseUpdatedAt: file.updatedAt,
        }),
        withId(file.id),
      );
      const body = (await readBody(response)) as { updatedAt: string };

      expect(response.status).toBe(409);
      expect(typeof body.updatedAt).toBe('string');
      expect(body.updatedAt).not.toBe(file.updatedAt);

      const stored = await repository.get(file.id);
      expect(stored?.name).toBe('Changed elsewhere');
    });

    it('saves a device onto a screen, then clears it again on a later save', async () => {
      const repository = await getRepository();
      const file = await repository.create();
      const screenId = file.screens![0].id;

      await PATCH(
        jsonRequest(`http://x/api/files/${file.id}`, 'PATCH', {
          screens: [
            {
              id: screenId,
              name: 'Frame 1',
              layout: file.screens![0].layout,
              stageWidth: 402,
              stageHeight: 874,
              deviceName: 'iPhone 16 & 17 Pro',
            },
          ],
        }),
        withId(file.id),
      );
      const withDevice = await repository.get(file.id);
      expect(withDevice?.screens?.[0]).toMatchObject({ stageWidth: 402, stageHeight: 874, deviceName: 'iPhone 16 & 17 Pro' });

      await PATCH(
        jsonRequest(`http://x/api/files/${file.id}`, 'PATCH', {
          screens: [{ id: screenId, name: 'Frame 1', layout: file.screens![0].layout, stageWidth: 1440 }],
        }),
        withId(file.id),
      );
      const cleared = await repository.get(file.id);
      expect(cleared?.screens?.[0]).toMatchObject({ stageWidth: 1440, stageHeight: null, deviceName: null });
    });

    it('returns 400 for an invalid layout inside a screen', async () => {
      const repository = await getRepository();
      const file = await repository.create();

      const response = await PATCH(
        jsonRequest(`http://x/api/files/${file.id}`, 'PATCH', {
          screens: [
            { id: file.screens![0].id, name: 'Frame 1', layout: JSON.stringify({ noRootHere: true }), stageWidth: 1440 },
          ],
        }),
        withId(file.id),
      );
      const body = (await readBody(response)) as { error: string };

      expect(response.status).toBe(400);
      expect(typeof body.error).toBe('string');

      const stored = await repository.get(file.id);
      expect(stored?.screens).toEqual(file.screens);
    });

    it('returns 400 for a stageHeight that is not a positive integer, and changes nothing', async () => {
      const repository = await getRepository();
      const file = await repository.create();

      const response = await PATCH(
        jsonRequest(`http://x/api/files/${file.id}`, 'PATCH', {
          screens: [
            { id: file.screens![0].id, name: 'Frame 1', layout: file.screens![0].layout, stageWidth: 402, stageHeight: -5 },
          ],
        }),
        withId(file.id),
      );
      const body = (await readBody(response)) as { error: string };

      expect(response.status).toBe(400);
      expect(typeof body.error).toBe('string');

      const stored = await repository.get(file.id);
      expect(stored?.screens).toEqual(file.screens);
    });

    it('returns 400 for a deviceName longer than 80 characters, and changes nothing', async () => {
      const repository = await getRepository();
      const file = await repository.create();

      const response = await PATCH(
        jsonRequest(`http://x/api/files/${file.id}`, 'PATCH', {
          screens: [
            {
              id: file.screens![0].id,
              name: 'Frame 1',
              layout: file.screens![0].layout,
              stageWidth: 402,
              deviceName: 'x'.repeat(81),
            },
          ],
        }),
        withId(file.id),
      );
      const body = (await readBody(response)) as { error: string };

      expect(response.status).toBe(400);
      expect(typeof body.error).toBe('string');

      const stored = await repository.get(file.id);
      expect(stored?.screens).toEqual(file.screens);
    });

    it('returns 400 for a screens array with zero screens', async () => {
      const repository = await getRepository();
      const file = await repository.create();

      const response = await PATCH(
        jsonRequest(`http://x/api/files/${file.id}`, 'PATCH', { screens: [] }),
        withId(file.id),
      );

      expect(response.status).toBe(400);
    });

    it('returns 400 for an empty patch body', async () => {
      const repository = await getRepository();
      const file = await repository.create();

      const response = await PATCH(jsonRequest(`http://x/api/files/${file.id}`, 'PATCH', {}), withId(file.id));

      expect(response.status).toBe(400);
      expect(await readBody(response)).toEqual({ error: 'empty patch' });
    });

    it('returns 400 for a badly formatted baseUpdatedAt', async () => {
      const repository = await getRepository();
      const file = await repository.create();

      const response = await PATCH(
        jsonRequest(`http://x/api/files/${file.id}`, 'PATCH', { name: 'X', baseUpdatedAt: 'not-a-date' }),
        withId(file.id),
      );
      const body = (await readBody(response)) as { error: string };

      expect(response.status).toBe(400);
      expect(typeof body.error).toBe('string');
    });

    it('rejects an unparsable body with 400 Invalid JSON', async () => {
      const repository = await getRepository();
      const file = await repository.create();

      const response = await PATCH(malformedJsonRequest(`http://x/api/files/${file.id}`, 'PATCH'), withId(file.id));

      expect(response.status).toBe(400);
      expect(await readBody(response)).toEqual({ error: 'Invalid JSON' });
    });

    it('returns 404 for a missing file', async () => {
      const response = await PATCH(
        jsonRequest('http://x/api/files/missing', 'PATCH', { name: 'X' }),
        withId('missing'),
      );

      expect(response.status).toBe(404);
      expect(await readBody(response)).toEqual({ error: 'Not found' });
    });

    it('clamps a screen stageWidth, visible through a subsequent GET', async () => {
      const repository = await getRepository();
      const file = await repository.create();
      const original = file.screens![0];

      const patchResponse = await PATCH(
        jsonRequest(`http://x/api/files/${file.id}`, 'PATCH', {
          screens: [{ id: original.id, name: original.name, layout: original.layout, stageWidth: 5000 }],
        }),
        withId(file.id),
      );
      expect(patchResponse.status).toBe(200);

      const getResponse = await GET_FILE(new Request(`http://x/api/files/${file.id}`), withId(file.id));
      const body = (await readBody(getResponse)) as { file: { screens: Array<{ stageWidth: number }> } };

      expect(body.file.screens[0].stageWidth).toBe(1920);
    });

    it('moves a file into a folder', async () => {
      const repository = await getRepository();
      const folder = await repository.createFolder({ name: 'Target' });
      if (!folder.ok) throw new Error('expected createFolder to succeed');
      const file = await repository.create();

      const response = await PATCH(
        jsonRequest(`http://x/api/files/${file.id}`, 'PATCH', { folderId: folder.folder.id }),
        withId(file.id),
      );

      expect(response.status).toBe(200);
      expect((await repository.get(file.id))?.folderId).toBe(folder.folder.id);
    });

    it('moves a file back to the top level with folderId null', async () => {
      const repository = await getRepository();
      const folder = await repository.createFolder({ name: 'Target' });
      if (!folder.ok) throw new Error('expected createFolder to succeed');
      const file = await repository.create({ folderId: folder.folder.id });

      const response = await PATCH(
        jsonRequest(`http://x/api/files/${file.id}`, 'PATCH', { folderId: null }),
        withId(file.id),
      );

      expect(response.status).toBe(200);
      expect((await repository.get(file.id))?.folderId).toBeNull();
    });

    it('returns 400 Folder does not exist when moving into an unknown folder', async () => {
      const repository = await getRepository();
      const file = await repository.create();

      const response = await PATCH(
        jsonRequest(`http://x/api/files/${file.id}`, 'PATCH', { folderId: 'doesnotexist' }),
        withId(file.id),
      );

      expect(response.status).toBe(400);
      expect(await readBody(response)).toEqual({ error: 'Folder does not exist' });
    });
  });

  describe('POST /api/files/[id]/duplicate', () => {
    it('duplicates a file and returns 201', async () => {
      const repository = await getRepository();
      const file = await repository.create({ name: 'Original' });

      const response = await DUPLICATE(
        new Request(`http://x/api/files/${file.id}/duplicate`, { method: 'POST' }),
        withId(file.id),
      );
      const body = (await readBody(response)) as {
        file: { id: string; name: string; screens: Array<{ id: string; layout: string }> };
      };

      expect(response.status).toBe(201);
      expect(body.file.id).not.toBe(file.id);
      expect(body.file.name).toBe('Original copy');
      expect(body.file.screens[0].layout).toBe(file.screens![0].layout);
      expect(body.file.screens[0].id).not.toBe(file.screens![0].id);
    });

    it('returns 404 for a missing file', async () => {
      const response = await DUPLICATE(
        new Request('http://x/api/files/missing/duplicate', { method: 'POST' }),
        withId('missing'),
      );

      expect(response.status).toBe(404);
      expect(await readBody(response)).toEqual({ error: 'Not found' });
    });
  });

  describe('DELETE /api/files/[id]', () => {
    it('deletes a file and returns 204 with no body', async () => {
      const repository = await getRepository();
      const file = await repository.create();

      const response = await DELETE(new Request(`http://x/api/files/${file.id}`, { method: 'DELETE' }), withId(file.id));

      expect(response.status).toBe(204);
      expect(await response.text()).toBe('');
      expect(await repository.get(file.id)).toBeNull();
    });

    it('returns 404 for a missing file', async () => {
      const response = await DELETE(new Request('http://x/api/files/missing', { method: 'DELETE' }), withId('missing'));

      expect(response.status).toBe(404);
      expect(await readBody(response)).toEqual({ error: 'Not found' });
    });
  });
});
