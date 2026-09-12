import { describe, expect, it } from 'vitest';
import { KNOWN_TYPES, emptyLayoutJson } from '@/components/blocks/known-types';
import type { Screen } from '@/lib/files/repository';
import { resolveClientScreens } from './page';

function makeScreen(overrides: Partial<Screen> = {}): Screen {
  return { id: 'screen0001', name: 'Frame 1', layout: emptyLayoutJson(), stageWidth: 1440, ...overrides };
}

// resolveClientScreens is the pure derivation FilePage (a server component
// that also talks to the database via getRepository()) delegates to, kept
// as its own export precisely so this logic is testable without mocking
// the repository - see the comment above it in page.tsx.
describe('resolveClientScreens', () => {
  it('passes through a screen whose layout already validates, reporting no invalid ids', () => {
    const screen = makeScreen();
    const { screens, invalidScreenIds } = resolveClientScreens([screen], KNOWN_TYPES);

    expect(invalidScreenIds).toEqual([]);
    expect(screens).toEqual([screen]);
  });

  it('replaces a screen whose layout is not valid JSON with an empty layout and reports its id', () => {
    const badScreen = makeScreen({ id: 'bad000001', layout: '{not valid json' });
    const { screens, invalidScreenIds } = resolveClientScreens([badScreen], KNOWN_TYPES);

    expect(invalidScreenIds).toEqual(['bad000001']);
    expect(screens[0].layout).toBe(emptyLayoutJson());
    // Every other field (name, stageWidth, ...) is preserved - only the
    // unreadable layout itself is replaced.
    expect(screens[0].id).toBe('bad000001');
  });

  it('replaces a screen whose layout uses an unknown block type and reports its id', () => {
    const badScreen = makeScreen({
      id: 'bad000002',
      layout: JSON.stringify({ ROOT: { type: { resolvedName: 'NotARealBlock' }, props: {}, nodes: [] } }),
    });
    const { invalidScreenIds } = resolveClientScreens([badScreen], KNOWN_TYPES);
    expect(invalidScreenIds).toEqual(['bad000002']);
  });

  it('only reports the screens that actually fail, not every screen in the file', () => {
    const good = makeScreen({ id: 'good00001' });
    const bad = makeScreen({ id: 'bad000001', layout: '{not valid json' });
    const { screens, invalidScreenIds } = resolveClientScreens([good, bad], KNOWN_TYPES);

    expect(invalidScreenIds).toEqual(['bad000001']);
    expect(screens[0]).toEqual(good);
    expect(screens[1].layout).toBe(emptyLayoutJson());
  });

  it('returns no invalid ids for an empty screens array', () => {
    expect(resolveClientScreens([], KNOWN_TYPES)).toEqual({ screens: [], invalidScreenIds: [] });
  });
});
