// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, resetDbForTests } from '@/db/client';
import { emptyLayoutJson } from '@/components/blocks/registry';
import loginScreenLayout from '@/lib/examples/login-screen.json';
import { createFilesRepository } from './repository';

const LOGIN_SCREEN_JSON = JSON.stringify(loginScreenLayout);

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isIsoString(value: string): boolean {
  return typeof value === 'string' && new Date(value).toISOString() === value;
}

describe('files repository', () => {
  let repo: ReturnType<typeof createFilesRepository>;

  beforeEach(async () => {
    await resetDbForTests();
    repo = createFilesRepository(await getDb());
  });

  describe('create', () => {
    it('creates a file with defaults', async () => {
      const file = await repo.create();

      expect(file.name).toBe('Untitled');
      expect(JSON.parse(file.layout)).toEqual(JSON.parse(emptyLayoutJson()));
      expect(file.stageWidth).toBe(1440);
      expect(file.id).toHaveLength(10);
      expect(isIsoString(file.createdAt)).toBe(true);
      expect(isIsoString(file.updatedAt)).toBe(true);
    });

    it('creates a file with the login example layout', async () => {
      const file = await repo.create({ name: 'Login screen', layout: LOGIN_SCREEN_JSON });

      expect(file.name).toBe('Login screen');
      expect(JSON.parse(file.layout)).toEqual(JSON.parse(LOGIN_SCREEN_JSON));
      expect(file.stageWidth).toBe(1440);
    });

    it('clamps stage width to the valid range', async () => {
      const low = await repo.create({ stageWidth: 10 });
      expect(low.stageWidth).toBe(320);

      const high = await repo.create({ stageWidth: 5000 });
      expect(high.stageWidth).toBe(1920);
    });

    it('refuses to create a file with an invalid layout', async () => {
      await expect(repo.create({ layout: '{not json' })).rejects.toThrow();
      expect(await repo.list()).toHaveLength(0);
    });
  });

  describe('list', () => {
    it('lists newest-updated first', async () => {
      const a = await repo.create({ name: 'A' });
      await wait(5);
      const b = await repo.create({ name: 'B' });
      await wait(5);
      // Touch "a" again so its updatedAt is now newer than "b"'s.
      await repo.save(a.id, { name: 'A renamed' });

      const list = await repo.list();
      expect(list.map((file) => file.id)).toEqual([a.id, b.id]);
    });
  });

  describe('get', () => {
    it('returns null for a missing id', async () => {
      expect(await repo.get('doesnotexist')).toBeNull();
    });

    it('returns the file for a known id', async () => {
      const created = await repo.create({ name: 'Findable' });
      expect(await repo.get(created.id)).toEqual(created);
    });
  });

  describe('save', () => {
    it('updates the name only, leaving layout and width untouched', async () => {
      const created = await repo.create({ stageWidth: 800 });

      const result = await repo.save(created.id, { name: 'Renamed' });
      expect(result).toEqual({ ok: true, updatedAt: expect.any(String) });

      const after = await repo.get(created.id);
      expect(after?.name).toBe('Renamed');
      expect(after?.stageWidth).toBe(800);
      expect(JSON.parse(after!.layout)).toEqual(JSON.parse(emptyLayoutJson()));
    });

    it('returns a newer updatedAt when the layout changes', async () => {
      const created = await repo.create();
      await wait(5);

      const result = await repo.save(created.id, { layout: LOGIN_SCREEN_JSON });

      expect(result.ok).toBe(true);
      expect(result).toMatchObject({ updatedAt: expect.any(String) });
      if (result.ok) {
        expect(new Date(result.updatedAt).getTime()).toBeGreaterThan(new Date(created.updatedAt).getTime());
      }

      const after = await repo.get(created.id);
      expect(JSON.parse(after!.layout)).toEqual(JSON.parse(LOGIN_SCREEN_JSON));
    });

    it('clamps stage width to the valid range', async () => {
      const created = await repo.create();

      await repo.save(created.id, { stageWidth: 10 });
      expect((await repo.get(created.id))?.stageWidth).toBe(320);

      await repo.save(created.id, { stageWidth: 5000 });
      expect((await repo.get(created.id))?.stageWidth).toBe(1920);
    });

    it('succeeds when baseUpdatedAt matches the current row', async () => {
      const created = await repo.create();

      const result = await repo.save(created.id, { name: 'Matched', baseUpdatedAt: created.updatedAt });
      expect(result).toEqual({ ok: true, updatedAt: expect.any(String) });
    });

    it('returns a conflict and changes nothing when baseUpdatedAt is stale', async () => {
      const created = await repo.create();
      await wait(5);
      await repo.save(created.id, { name: 'First writer' });
      const current = await repo.get(created.id);

      const result = await repo.save(created.id, {
        name: 'Second writer',
        baseUpdatedAt: created.updatedAt,
      });

      expect(result).toEqual({ ok: false, conflict: true, updatedAt: current?.updatedAt });
      expect((await repo.get(created.id))?.name).toBe('First writer');
    });

    it('rejects an invalid layout and changes nothing', async () => {
      const created = await repo.create();

      const result = await repo.save(created.id, { layout: '{not json' });
      expect(result).toEqual({ ok: false, invalid: expect.any(String) });

      const after = await repo.get(created.id);
      expect(JSON.parse(after!.layout)).toEqual(JSON.parse(emptyLayoutJson()));
      expect(after?.updatedAt).toBe(created.updatedAt);
    });

    it('returns notFound for a missing id', async () => {
      const result = await repo.save('doesnotexist', { name: 'X' });
      expect(result).toEqual({ ok: false, notFound: true });
    });
  });

  describe('duplicate', () => {
    it('copies the file with the name suffixed " copy"', async () => {
      const created = await repo.create({ name: 'Original', layout: LOGIN_SCREEN_JSON, stageWidth: 768 });

      const copy = await repo.duplicate(created.id);

      expect(copy?.name).toBe('Original copy');
      expect(copy?.id).not.toBe(created.id);
      expect(copy?.stageWidth).toBe(768);
      expect(JSON.parse(copy?.layout ?? '')).toEqual(JSON.parse(created.layout));
      expect(await repo.list()).toHaveLength(2);
    });

    it('returns null for a missing id', async () => {
      expect(await repo.duplicate('doesnotexist')).toBeNull();
    });
  });

  describe('remove', () => {
    it('returns true then false', async () => {
      const created = await repo.create();

      expect(await repo.remove(created.id)).toBe(true);
      expect(await repo.remove(created.id)).toBe(false);
      expect(await repo.get(created.id)).toBeNull();
    });
  });
});
