import { describe, expect, it } from 'vitest';
import { KNOWN_TYPES } from '@/components/blocks/registry';
import { validateLayout } from '@/lib/files/validate';
import { EXAMPLES, findExample } from './index';

type SerializedNode = { type: { resolvedName: string } };

describe('EXAMPLES', () => {
  const login = findExample('login');

  it('includes a login example named "Login screen" at 1440px', () => {
    expect(login).toBeDefined();
    expect(login?.slug).toBe('login');
    expect(login?.name).toBe('Login screen');
    expect(login?.stageWidth).toBe(1440);
  });

  it('has a login layout that passes validateLayout against the known block types', () => {
    const result = validateLayout(login!.layout, KNOWN_TYPES);
    expect(result.ok).toBe(true);
  });

  it('has exactly 6 blocks (LayoutBox, Card, Input, Button) plus one CardContent zone', () => {
    const result = validateLayout(login!.layout, KNOWN_TYPES);
    if (!result.ok) throw new Error('expected the login layout to be valid');

    const types = Object.values(result.tree).map((node) => (node as SerializedNode).type.resolvedName);

    expect(types).toHaveLength(7);
    expect(types.filter((type) => type === 'CardContent')).toHaveLength(1);
    expect(types.filter((type) => ['LayoutBox', 'Card', 'Input', 'Button'].includes(type))).toHaveLength(6);
    expect([...types].sort()).toEqual(
      ['Button', 'Button', 'Card', 'CardContent', 'Input', 'Input', 'LayoutBox'].sort(),
    );
  });
});

describe('findExample', () => {
  it('returns the login example for slug "login"', () => {
    expect(findExample('login')).toBe(EXAMPLES[0]);
  });

  it('returns undefined for an unknown slug', () => {
    expect(findExample('nope')).toBeUndefined();
  });
});
