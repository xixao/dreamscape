// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, resetDbForTests } from '@/db/client';
import { createFilesRepository } from '@/lib/files/repository';
import { newComponent, replaceSelection, componentFromSelection, type Tree, isComponentLayout } from './model';
describe('file component library persistence', () => {
  beforeEach(resetDbForTests);
  it('saves and duplicates the library with the file and rejects malformed definitions', async () => {
    const repo = createFilesRepository(await getDb()); const file = await repo.create();
    const definition = newComponent();
    expect(await repo.save(file.id, { components: [definition], baseUpdatedAt: file.updatedAt })).toMatchObject({ ok: true });
    expect((await repo.get(file.id))?.components).toEqual([definition]);
    expect((await repo.duplicate(file.id))?.components).toEqual([definition]);
    expect(await repo.save(file.id, { components: [{ ...definition, layout: '{}' }] })).toMatchObject({ ok: false });
  });
  it('converts an existing root frame into a component while keeping a valid screen root', () => {
    const definition = newComponent();
    const selected = componentFromSelection(definition.layout, 'ROOT');
    const page = JSON.parse(replaceSelection(definition.layout, 'ROOT', selected)) as Tree;
    expect(page.ROOT.type.resolvedName).toBe('LayoutBox');
    expect(page[page.ROOT.nodes[0]].props.componentId).toBe(selected.id);
    expect(isComponentLayout(selected.layout)).toBe(true);
  });
});
