import { describe, expect, it } from 'vitest';
import { firstSearchParam } from './page';

// firstSearchParam is the pure extraction PlayPage (a server component
// that also talks to the database via getRepository()) delegates to for
// each of its three raw searchParams (screen/page/overlay) - kept as its
// own export precisely so this logic is testable without mocking the
// repository, the same reason app/f/[id]/page.tsx's resolveClientScreens
// is.
describe('firstSearchParam', () => {
  it('returns a plain string value unchanged', () => {
    expect(firstSearchParam('screen0001')).toBe('screen0001');
  });

  it('returns the first entry when the key repeats in the URL', () => {
    expect(firstSearchParam(['first', 'second'])).toBe('first');
  });

  it('returns undefined when the param is absent', () => {
    expect(firstSearchParam(undefined)).toBeUndefined();
  });
});
