// @vitest-environment node
import { beforeEach, expect, it } from 'vitest';
import { getDb, resetDbForTests } from '@/db/client';
import { createFilesRepository } from './repository';
beforeEach(resetDbForTests);
it('persists file defaults and independent frame overrides through save and duplication', async () => {
  const repo = createFilesRepository(await getDb());
  const file = await repo.create();
  expect(file.appearance).toBe('light');
  expect(await repo.save(file.id, { appearance: 'dark', screens: file.screens!.map(s => ({ ...s, appearance: 'light' })) })).toMatchObject({ ok: true });
  const saved = (await repo.get(file.id))!;
  expect(saved.appearance).toBe('dark');
  expect(saved.screens![0].appearance).toBe('light');
  const copy = (await repo.duplicate(file.id))!;
  expect(copy.appearance).toBe('dark');
  expect(copy.screens![0].appearance).toBe('light');
  await repo.save(file.id, { screens: saved.screens!.map(s => ({ ...s, appearance: undefined })) });
  expect((await repo.get(file.id))!.screens![0].appearance).toBeUndefined();
});
