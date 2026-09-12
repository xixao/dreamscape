// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { nanoid } from 'nanoid';
import { getDb, resetDbForTests } from '@/db/client';
import { emptyLayoutJson } from '@/components/blocks/registry';
import loginScreenLayout from '@/lib/examples/login-screen.json';
import { createFilesRepository, type Screen } from './repository';

const LOGIN_SCREEN_JSON = JSON.stringify(loginScreenLayout);

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isIsoString(value: string): boolean {
  return typeof value === 'string' && new Date(value).toISOString() === value;
}

function screen(overrides: Partial<Screen> = {}): Screen {
  return { id: nanoid(10), name: 'Frame 1', layout: emptyLayoutJson(), stageWidth: 1440, ...overrides };
}

describe('files repository', () => {
  let repo: ReturnType<typeof createFilesRepository>;

  beforeEach(async () => {
    await resetDbForTests();
    repo = createFilesRepository(await getDb());
  });

  describe('create', () => {
    it('creates a file with one default screen', async () => {
      const file = await repo.create();

      expect(file.name).toBe('Untitled');
      expect(file.screens).toHaveLength(1);
      expect(file.screens?.[0]).toMatchObject({
        name: 'Frame 1',
        stageWidth: 1440,
        stageHeight: null,
        deviceName: null,
      });
      expect(JSON.parse(file.screens![0].layout)).toEqual(JSON.parse(emptyLayoutJson()));
      expect(file.screens![0].id).toHaveLength(10);
      expect(file.screenCount).toBe(1);
      expect(file.id).toHaveLength(10);
      expect(isIsoString(file.createdAt)).toBe(true);
      expect(isIsoString(file.updatedAt)).toBe(true);
      expect(file.folderId).toBeNull();
    });

    it('creates a file with the given screens, in order', async () => {
      const file = await repo.create({
        name: 'Login screen',
        screens: [screen({ name: 'Login', layout: LOGIN_SCREEN_JSON }), screen({ name: 'Frame 2' })],
      });

      expect(file.name).toBe('Login screen');
      expect(file.screenCount).toBe(2);
      expect(file.screens?.map((s) => s.name)).toEqual(['Login', 'Frame 2']);
      expect(JSON.parse(file.screens![0].layout)).toEqual(JSON.parse(LOGIN_SCREEN_JSON));
    });

    it('clamps every screen stage width to the valid range', async () => {
      const file = await repo.create({ screens: [screen({ stageWidth: 10 }), screen({ stageWidth: 5000 })] });

      expect(file.screens?.[0].stageWidth).toBe(320);
      expect(file.screens?.[1].stageWidth).toBe(1920);
    });

    it('refuses to create a file with an invalid layout in a screen', async () => {
      await expect(repo.create({ screens: [screen({ layout: '{not json' })] })).rejects.toThrow();
      expect(await repo.list()).toHaveLength(0);
    });

    it('refuses to create a file with zero screens', async () => {
      await expect(repo.create({ screens: [] })).rejects.toThrow();
      expect(await repo.list()).toHaveLength(0);
    });

    it('refuses to create a file with duplicate screen ids', async () => {
      const dupeId = nanoid(10);
      await expect(
        repo.create({ screens: [screen({ id: dupeId }), screen({ id: dupeId, name: 'Frame 2' })] }),
      ).rejects.toThrow();
      expect(await repo.list()).toHaveLength(0);
    });

    it('creates a file inside a folder', async () => {
      const folder = await repo.createFolder({ name: 'Target' });
      if (!folder.ok) throw new Error('expected createFolder to succeed');

      const file = await repo.create({ folderId: folder.folder.id });
      expect(file.folderId).toBe(folder.folder.id);
    });

    it('refuses to create a file in a folder that does not exist', async () => {
      await expect(repo.create({ folderId: 'doesnotexist' })).rejects.toThrow();
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

    it('returns every screen layout as a JSON string', async () => {
      const created = await repo.create({ name: 'Findable', screens: [screen(), screen({ name: 'Frame 2' })] });

      const found = await repo.get(created.id);
      for (const s of found?.screens ?? []) {
        expect(typeof s.layout).toBe('string');
        expect(() => JSON.parse(s.layout)).not.toThrow();
      }
      expect(found?.screens).toHaveLength(2);
    });
  });

  describe('save', () => {
    it('updates the name only, leaving screens untouched', async () => {
      const created = await repo.create({ screens: [screen({ stageWidth: 800 })] });

      const result = await repo.save(created.id, { name: 'Renamed' });
      expect(result).toEqual({ ok: true, updatedAt: expect.any(String) });

      const after = await repo.get(created.id);
      expect(after?.name).toBe('Renamed');
      expect(after?.screens?.[0].stageWidth).toBe(800);
      expect(JSON.parse(after!.screens![0].layout)).toEqual(JSON.parse(emptyLayoutJson()));
    });

    it('returns a newer updatedAt when the screens change', async () => {
      const created = await repo.create();
      await wait(5);

      const result = await repo.save(created.id, { screens: [screen({ layout: LOGIN_SCREEN_JSON })] });

      expect(result.ok).toBe(true);
      expect(result).toMatchObject({ updatedAt: expect.any(String) });
      if (result.ok) {
        expect(new Date(result.updatedAt).getTime()).toBeGreaterThan(new Date(created.updatedAt).getTime());
      }

      const after = await repo.get(created.id);
      expect(JSON.parse(after!.screens![0].layout)).toEqual(JSON.parse(LOGIN_SCREEN_JSON));
    });

    it('replaces the whole screens array, including adding or removing screens', async () => {
      const created = await repo.create();

      await repo.save(created.id, { screens: [screen({ name: 'Frame 1' }), screen({ name: 'Frame 2' })] });
      const withTwo = await repo.get(created.id);
      expect(withTwo?.screenCount).toBe(2);

      await repo.save(created.id, { screens: [screen({ name: 'Solo' })] });
      const withOne = await repo.get(created.id);
      expect(withOne?.screenCount).toBe(1);
      expect(withOne?.screens?.[0].name).toBe('Solo');
    });

    it('clamps stage width to the valid range, per screen', async () => {
      const created = await repo.create();

      await repo.save(created.id, { screens: [screen({ stageWidth: 10 })] });
      expect((await repo.get(created.id))?.screens?.[0].stageWidth).toBe(320);

      await repo.save(created.id, { screens: [screen({ stageWidth: 5000 })] });
      expect((await repo.get(created.id))?.screens?.[0].stageWidth).toBe(1920);
    });

    it('succeeds when baseUpdatedAt matches the current row', async () => {
      const created = await repo.create();

      const result = await repo.save(created.id, { name: 'Matched', baseUpdatedAt: created.updatedAt });
      expect(result).toEqual({ ok: true, updatedAt: expect.any(String) });
    });

    it('keeps updatedAt strictly increasing across back-to-back saves, so a stale baseUpdatedAt still conflicts', async () => {
      // No wait() between these two saves (unlike the other conflict tests
      // below): both can land in the same wall-clock millisecond, which is
      // exactly the case a plain `new Date()` in `save()` cannot tell apart.
      const created = await repo.create();
      const first = await repo.save(created.id, { name: 'First writer' });
      const second = await repo.save(created.id, { name: 'Second writer' });

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) throw new Error('expected both saves to succeed');
      expect(new Date(second.updatedAt).getTime()).toBeGreaterThan(new Date(first.updatedAt).getTime());

      // A base from before the first save is stale relative to the row now
      // (at second.updatedAt), even though it was captured in the same
      // millisecond the first save landed in.
      const stale = await repo.save(created.id, {
        name: 'Third writer',
        baseUpdatedAt: created.updatedAt,
      });
      expect(stale).toEqual({ ok: false, conflict: true, updatedAt: second.updatedAt });
      expect((await repo.get(created.id))?.name).toBe('Second writer');
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

    it('rejects an invalid layout inside a screen and changes nothing', async () => {
      const created = await repo.create();

      const result = await repo.save(created.id, { screens: [screen({ layout: '{not json' })] });
      expect(result).toEqual({ ok: false, invalid: expect.any(String) });

      const after = await repo.get(created.id);
      expect(JSON.parse(after!.screens![0].layout)).toEqual(JSON.parse(emptyLayoutJson()));
      expect(after?.updatedAt).toBe(created.updatedAt);
    });

    it('rejects a screens patch with zero screens, changing nothing', async () => {
      const created = await repo.create();

      const result = await repo.save(created.id, { screens: [] });
      expect(result).toEqual({ ok: false, invalid: expect.any(String) });
      expect((await repo.get(created.id))?.screenCount).toBe(1);
    });

    it('rejects a screens patch with duplicate screen ids, changing nothing', async () => {
      const created = await repo.create();
      const dupeId = nanoid(10);

      const result = await repo.save(created.id, {
        screens: [screen({ id: dupeId }), screen({ id: dupeId, name: 'Frame 2' })],
      });
      expect(result).toEqual({ ok: false, invalid: expect.any(String) });
      expect((await repo.get(created.id))?.screenCount).toBe(1);
    });

    it('returns notFound for a missing id', async () => {
      const result = await repo.save('doesnotexist', { name: 'X' });
      expect(result).toEqual({ ok: false, notFound: true });
    });

    it('moves the file into a folder', async () => {
      const folder = await repo.createFolder({ name: 'Target' });
      if (!folder.ok) throw new Error('expected createFolder to succeed');
      const created = await repo.create();

      const result = await repo.save(created.id, { folderId: folder.folder.id });
      expect(result.ok).toBe(true);
      expect((await repo.get(created.id))?.folderId).toBe(folder.folder.id);
    });

    it('rejects moving a file into a folder that does not exist, changing nothing', async () => {
      const created = await repo.create();

      const result = await repo.save(created.id, { folderId: 'doesnotexist' });
      expect(result).toEqual({ ok: false, invalid: 'Folder does not exist' });
      expect((await repo.get(created.id))?.folderId).toBeNull();
    });
  });

  describe('duplicate', () => {
    it('copies the file with the name suffixed " copy"', async () => {
      const created = await repo.create({
        name: 'Original',
        screens: [screen({ layout: LOGIN_SCREEN_JSON, stageWidth: 768 })],
      });

      const copy = await repo.duplicate(created.id);

      expect(copy?.name).toBe('Original copy');
      expect(copy?.id).not.toBe(created.id);
      expect(copy?.screens?.[0].stageWidth).toBe(768);
      expect(JSON.parse(copy?.screens?.[0].layout ?? '')).toEqual(JSON.parse(created.screens![0].layout));
      expect(await repo.list()).toHaveLength(2);
    });

    it('gives every screen a new id, keeping name, layout and count the same', async () => {
      const created = await repo.create({
        screens: [screen({ name: 'Frame 1' }), screen({ name: 'Frame 2', layout: LOGIN_SCREEN_JSON })],
      });

      const copy = await repo.duplicate(created.id);

      expect(copy?.screens).toHaveLength(2);
      expect(copy?.screens?.map((s) => s.name)).toEqual(['Frame 1', 'Frame 2']);
      expect(copy?.screens?.map((s) => s.id)).not.toEqual(created.screens?.map((s) => s.id));
      const copyIds = new Set(copy?.screens?.map((s) => s.id));
      expect(copyIds.size).toBe(2);
      for (const id of copyIds) expect(id).toHaveLength(10);
      expect(JSON.parse(copy!.screens![1].layout)).toEqual(JSON.parse(LOGIN_SCREEN_JSON));
    });

    it('returns null for a missing id', async () => {
      expect(await repo.duplicate('doesnotexist')).toBeNull();
    });

    it('keeps the same folder as the original', async () => {
      const folder = await repo.createFolder({ name: 'Target' });
      if (!folder.ok) throw new Error('expected createFolder to succeed');
      const created = await repo.create({ name: 'Original', folderId: folder.folder.id });

      const copy = await repo.duplicate(created.id);
      expect(copy?.folderId).toBe(folder.folder.id);
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

  describe('folders', () => {
    describe('createFolder', () => {
      it('creates a top-level folder', async () => {
        const result = await repo.createFolder({ name: 'Marketing' });

        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('expected ok');
        expect(result.folder).toMatchObject({ name: 'Marketing', parentId: null, fileCount: 0, folderCount: 0 });
        expect(result.folder.id).toHaveLength(10);
        expect(isIsoString(result.folder.createdAt)).toBe(true);
        expect(isIsoString(result.folder.updatedAt)).toBe(true);
      });

      it('creates a nested folder under an existing parent', async () => {
        const parent = await repo.createFolder({ name: 'Marketing' });
        if (!parent.ok) throw new Error('expected ok');

        const child = await repo.createFolder({ name: 'Q4', parentId: parent.folder.id });
        expect(child).toMatchObject({ ok: true, folder: { name: 'Q4', parentId: parent.folder.id } });
      });

      it('trims the name', async () => {
        const result = await repo.createFolder({ name: '  Spaced  ' });
        if (!result.ok) throw new Error('expected ok');
        expect(result.folder.name).toBe('Spaced');
      });

      it('returns notFound for a missing parent', async () => {
        const result = await repo.createFolder({ name: 'Orphan', parentId: 'doesnotexist' });
        expect(result).toEqual({ ok: false, notFound: true });
      });

      it('rejects an empty or too-long name', async () => {
        await expect(repo.createFolder({ name: '   ' })).rejects.toThrow();
        await expect(repo.createFolder({ name: 'x'.repeat(121) })).rejects.toThrow();
      });
    });

    describe('renameFolder', () => {
      it('renames an existing folder', async () => {
        const created = await repo.createFolder({ name: 'Old name' });
        if (!created.ok) throw new Error('expected ok');

        const result = await repo.renameFolder(created.folder.id, 'New name');
        expect(result).toMatchObject({ ok: true, folder: { name: 'New name' } });
      });

      it('returns notFound for a missing folder', async () => {
        const result = await repo.renameFolder('doesnotexist', 'New name');
        expect(result).toEqual({ ok: false, notFound: true });
      });
    });

    describe('moveFolder', () => {
      it('moves a folder to a new parent', async () => {
        const a = await repo.createFolder({ name: 'A' });
        const b = await repo.createFolder({ name: 'B' });
        if (!a.ok || !b.ok) throw new Error('expected ok');

        const result = await repo.moveFolder(b.folder.id, a.folder.id);
        expect(result).toMatchObject({ ok: true, folder: { parentId: a.folder.id } });
      });

      it('moves a folder to the top level with a null parentId', async () => {
        const a = await repo.createFolder({ name: 'A' });
        if (!a.ok) throw new Error('expected ok');
        const b = await repo.createFolder({ name: 'B', parentId: a.folder.id });
        if (!b.ok) throw new Error('expected ok');

        const result = await repo.moveFolder(b.folder.id, null);
        expect(result).toMatchObject({ ok: true, folder: { parentId: null } });
      });

      it('rejects moving a folder into itself', async () => {
        const a = await repo.createFolder({ name: 'A' });
        if (!a.ok) throw new Error('expected ok');

        const result = await repo.moveFolder(a.folder.id, a.folder.id);
        expect(result).toEqual({ ok: false, invalid: 'cycle' });
      });

      it('rejects moving a folder into its own descendant, directly or transitively', async () => {
        const a = await repo.createFolder({ name: 'A' });
        if (!a.ok) throw new Error('expected ok');
        const b = await repo.createFolder({ name: 'B', parentId: a.folder.id });
        if (!b.ok) throw new Error('expected ok');
        const c = await repo.createFolder({ name: 'C', parentId: b.folder.id });
        if (!c.ok) throw new Error('expected ok');

        expect(await repo.moveFolder(a.folder.id, b.folder.id)).toEqual({ ok: false, invalid: 'cycle' });
        expect(await repo.moveFolder(a.folder.id, c.folder.id)).toEqual({ ok: false, invalid: 'cycle' });
      });

      it('returns notFound when the folder being moved does not exist', async () => {
        const target = await repo.createFolder({ name: 'Target' });
        if (!target.ok) throw new Error('expected ok');

        const result = await repo.moveFolder('doesnotexist', target.folder.id);
        expect(result).toEqual({ ok: false, notFound: true });
      });

      it('returns notFound when the target parent does not exist', async () => {
        const a = await repo.createFolder({ name: 'A' });
        if (!a.ok) throw new Error('expected ok');

        const result = await repo.moveFolder(a.folder.id, 'doesnotexist');
        expect(result).toEqual({ ok: false, notFound: true });
      });
    });

    describe('removeFolder', () => {
      it('removes an empty folder', async () => {
        const a = await repo.createFolder({ name: 'A' });
        if (!a.ok) throw new Error('expected ok');

        expect(await repo.removeFolder(a.folder.id)).toEqual({ ok: true });
        expect(await repo.listFolders()).toHaveLength(0);
      });

      it('returns notFound for a missing folder', async () => {
        expect(await repo.removeFolder('doesnotexist')).toEqual({ ok: false, notFound: true });
      });

      it('refuses to remove a folder that still has a subfolder', async () => {
        const a = await repo.createFolder({ name: 'A' });
        if (!a.ok) throw new Error('expected ok');
        await repo.createFolder({ name: 'B', parentId: a.folder.id });

        expect(await repo.removeFolder(a.folder.id)).toEqual({ ok: false, notEmpty: true });
      });

      it('refuses to remove a folder that still has a file', async () => {
        const a = await repo.createFolder({ name: 'A' });
        if (!a.ok) throw new Error('expected ok');
        await repo.create({ folderId: a.folder.id });

        expect(await repo.removeFolder(a.folder.id)).toEqual({ ok: false, notEmpty: true });
      });
    });

    describe('listChildren', () => {
      it('lists top-level folders (by name) before files (by updated desc)', async () => {
        await repo.createFolder({ name: 'Zeta' });
        await repo.createFolder({ name: 'Alpha' });
        const f1 = await repo.create({ name: 'File one' });
        await wait(5);
        const f2 = await repo.create({ name: 'File two' });

        const { folders: topFolders, files: topFiles } = await repo.listChildren(null);
        expect(topFolders.map((folder) => folder.name)).toEqual(['Alpha', 'Zeta']);
        expect(topFiles.map((file) => file.id)).toEqual([f2.id, f1.id]);
      });

      it('lists only the direct children of a folder, with counts', async () => {
        const parent = await repo.createFolder({ name: 'Parent' });
        if (!parent.ok) throw new Error('expected ok');
        const child = await repo.createFolder({ name: 'Child', parentId: parent.folder.id });
        if (!child.ok) throw new Error('expected ok');
        await repo.createFolder({ name: 'Grandchild', parentId: child.folder.id });
        const fileInParent = await repo.create({ name: 'In parent', folderId: parent.folder.id });
        await repo.create({ name: 'In child', folderId: child.folder.id });

        const { folders: children, files: parentFiles } = await repo.listChildren(parent.folder.id);
        expect(children.map((folder) => folder.name)).toEqual(['Child']);
        expect(children[0]).toMatchObject({ fileCount: 1, folderCount: 1 });
        expect(parentFiles.map((file) => file.id)).toEqual([fileInParent.id]);
      });

      it('returns empty arrays for an unknown folder id', async () => {
        expect(await repo.listChildren('doesnotexist')).toEqual({ folders: [], files: [] });
      });
    });

    describe('folderPath', () => {
      it('is empty for the top level', async () => {
        expect(await repo.folderPath(null)).toEqual([]);
      });

      it('is null for an unknown folder', async () => {
        expect(await repo.folderPath('doesnotexist')).toBeNull();
      });

      it('returns the chain from the root down to the folder itself, root first', async () => {
        const a = await repo.createFolder({ name: 'A' });
        if (!a.ok) throw new Error('expected ok');
        const b = await repo.createFolder({ name: 'B', parentId: a.folder.id });
        if (!b.ok) throw new Error('expected ok');
        const c = await repo.createFolder({ name: 'C', parentId: b.folder.id });
        if (!c.ok) throw new Error('expected ok');

        const path = await repo.folderPath(c.folder.id);
        expect(path?.map((folder) => folder.name)).toEqual(['A', 'B', 'C']);
      });

      it('is a single entry for a top-level folder', async () => {
        const a = await repo.createFolder({ name: 'A' });
        if (!a.ok) throw new Error('expected ok');

        const path = await repo.folderPath(a.folder.id);
        expect(path?.map((folder) => folder.id)).toEqual([a.folder.id]);
      });
    });

    describe('listFolders', () => {
      it('lists every folder by name, regardless of nesting', async () => {
        const a = await repo.createFolder({ name: 'Bravo' });
        if (!a.ok) throw new Error('expected ok');
        await repo.createFolder({ name: 'Alpha', parentId: a.folder.id });

        const all = await repo.listFolders();
        expect(all.map((folder) => folder.name)).toEqual(['Alpha', 'Bravo']);
      });
    });

    describe('moveFile', () => {
      it('moves a file into a folder, with a newer updatedAt', async () => {
        const folder = await repo.createFolder({ name: 'Target' });
        if (!folder.ok) throw new Error('expected ok');
        const file = await repo.create({ name: 'Movable' });
        await wait(5);

        const result = await repo.moveFile(file.id, folder.folder.id);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(new Date(result.updatedAt).getTime()).toBeGreaterThan(new Date(file.updatedAt).getTime());
        }
        expect((await repo.get(file.id))?.folderId).toBe(folder.folder.id);
      });

      it('moves a file back to the top level with a null folderId', async () => {
        const folder = await repo.createFolder({ name: 'Target' });
        if (!folder.ok) throw new Error('expected ok');
        const file = await repo.create({ name: 'Movable', folderId: folder.folder.id });

        await repo.moveFile(file.id, null);
        expect((await repo.get(file.id))?.folderId).toBeNull();
      });

      it('returns notFound for a missing file', async () => {
        expect(await repo.moveFile('doesnotexist', null)).toEqual({ ok: false, notFound: true });
      });

      it('returns an invalid folder result for an unknown target folder', async () => {
        const file = await repo.create();
        expect(await repo.moveFile(file.id, 'doesnotexist')).toEqual({ ok: false, invalid: 'folder' });
      });
    });
  });
});
