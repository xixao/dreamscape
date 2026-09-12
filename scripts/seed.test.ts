// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, resetDbForTests } from '@/db/client';
import { createFilesRepository } from '@/lib/files/repository';
import { seedIfEmpty } from './seed';

describe('seedIfEmpty', () => {
  let repo: ReturnType<typeof createFilesRepository>;

  beforeEach(async () => {
    await resetDbForTests();
    repo = createFilesRepository(await getDb());
  });

  it('creates the Login screen example when the table is empty', async () => {
    const result = await seedIfEmpty(repo);

    expect(result.created).toBe(true);
    expect(typeof result.id).toBe('string');

    const files = await repo.list();
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('Login screen');
    expect(files[0].id).toBe(result.id);
  });

  it('creates nothing on a second call', async () => {
    const first = await seedIfEmpty(repo);
    const second = await seedIfEmpty(repo);

    expect(first.created).toBe(true);
    expect(second).toEqual({ created: false });
    expect(await repo.list()).toHaveLength(1);
  });
});
