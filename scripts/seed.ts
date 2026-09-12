import { loadEnvConfig } from '@next/env';
import { getDb } from '@/db/client';
import { exampleToScreens, findExample } from '@/lib/examples';
import { createFilesRepository } from '@/lib/files/repository';

type FilesRepository = ReturnType<typeof createFilesRepository>;

/**
 * Seeds the "Login screen" example as the first file when the table is
 * empty. Safe to run on every deploy: once a file exists (seeded or
 * created by a user), it does nothing.
 */
export async function seedIfEmpty(repo: FilesRepository): Promise<{ created: boolean; id?: string }> {
  const existing = await repo.list();
  if (existing.length > 0) {
    return { created: false };
  }

  const login = findExample('login');
  if (!login) {
    throw new Error('The "login" example is missing.');
  }

  const file = await repo.create({ name: login.name, screens: exampleToScreens(login) });
  return { created: true, id: file.id };
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());

  const repo = createFilesRepository(await getDb());
  const result = await seedIfEmpty(repo);

  if (result.created) {
    console.log(`Seeded "Login screen" as ${result.id}.`);
  } else {
    console.log('Files already exist; nothing to seed.');
  }
}

if (process.argv[1]?.endsWith('seed.ts')) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
