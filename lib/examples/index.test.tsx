import { describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { Element } from '@craftjs/core';
import { KNOWN_TYPES } from '@/components/blocks/registry';
import { LayoutBox } from '@/components/blocks/layout-box';
import { validateLayout } from '@/lib/files/validate';
import { renderTree } from '@/test/craft-harness';
import { EXAMPLES, findExample } from './index';

type SerializedNode = { type: { resolvedName: string } };

function typesIn(layout: string): string[] {
  const result = validateLayout(layout, KNOWN_TYPES);
  if (!result.ok) throw new Error('expected a valid layout');
  return Object.values(result.tree).map((node) => (node as SerializedNode).type.resolvedName);
}

/** Deserializes a full saved layout through the real Editor/resolver and asserts nothing logged a console error. */
async function renderWithoutErrors(layout: string) {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const { container } = renderTree(<Element is={LayoutBox} canvas />, { data: layout });
    // The root LayoutBox is common to every example; wait for the deserialized
    // tree to finish painting before trusting the error spy.
    await waitFor(() => expect(container.querySelector('[data-block="LayoutBox"]')).not.toBeNull());
    expect(errorSpy).not.toHaveBeenCalled();
  } finally {
    errorSpy.mockRestore();
  }
}

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

  it('renders the login example through the harness with no console errors', async () => {
    await renderWithoutErrors(login!.layout);
  });

  it('lists exactly the four examples, login first', () => {
    expect(EXAMPLES.map((example) => example.slug)).toEqual(['login', 'dashboard', 'settings', 'signup']);
  });

  describe.each([
    { slug: 'dashboard', name: 'Dashboard' },
    { slug: 'settings', name: 'Settings' },
    { slug: 'signup', name: 'Sign up' },
  ] as const)('the $slug example', ({ slug, name }) => {
    const example = findExample(slug);

    it(`is named "${name}" at 1440px`, () => {
      expect(example).toBeDefined();
      expect(example?.name).toBe(name);
      expect(example?.stageWidth).toBe(1440);
    });

    it('passes validateLayout against the known block types', () => {
      const result = validateLayout(example!.layout, KNOWN_TYPES);
      expect(result.ok).toBe(true);
    });

    it('renders through the harness with no console errors', async () => {
      await renderWithoutErrors(example!.layout);
    });
  });

  it('builds the dashboard from a heading row, a 3-column grid of stat cards, and a table', () => {
    const types = typesIn(findExample('dashboard')!.layout);
    expect(types.filter((type) => type === 'Text')).toHaveLength(4); // 1 title + 3 captions
    expect(types.filter((type) => type === 'Badge')).toHaveLength(1);
    expect(types.filter((type) => type === 'Card')).toHaveLength(3);
    expect(types.filter((type) => type === 'CardContent')).toHaveLength(3);
    expect(types.filter((type) => type === 'Progress')).toHaveLength(3);
    expect(types.filter((type) => type === 'Table')).toHaveLength(1);
    expect(types.filter((type) => type === 'LayoutBox')).toHaveLength(3); // root + heading row + grid
    expect(types).toHaveLength(18);
  });

  it('builds settings from a heading, one card with two inputs, a select, a switch, a separator and a button row', () => {
    const types = typesIn(findExample('settings')!.layout);
    expect(types.filter((type) => type === 'Text')).toHaveLength(2); // page h1 + card intro
    expect(types.filter((type) => type === 'Card')).toHaveLength(1);
    expect(types.filter((type) => type === 'Input')).toHaveLength(2);
    expect(types.filter((type) => type === 'Select')).toHaveLength(1);
    expect(types.filter((type) => type === 'Switch')).toHaveLength(1);
    expect(types.filter((type) => type === 'Separator')).toHaveLength(1);
    expect(types.filter((type) => type === 'Button')).toHaveLength(2); // Cancel + Save
    expect(types.filter((type) => type === 'LayoutBox')).toHaveLength(2); // root + button row
    expect(types).toHaveLength(13);
  });

  it('builds sign up from a centered card with three inputs, a checkbox and two buttons', () => {
    const example = findExample('signup')!;
    const parsed = JSON.parse(example.layout) as { ROOT: { props: { align: { desktop: string } } } };
    expect(parsed.ROOT.props.align.desktop).toBe('center');

    const types = typesIn(example.layout);
    expect(types.filter((type) => type === 'Input')).toHaveLength(3);
    expect(types.filter((type) => type === 'Checkbox')).toHaveLength(1);
    expect(types.filter((type) => type === 'Button')).toHaveLength(2);
    expect(types.filter((type) => type === 'Card')).toHaveLength(1);
    expect(types).toHaveLength(9);
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
