import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

describe('globals.css shadow tokens', () => {
  it('does not declare Tailwind\'s own --shadow or --shadow-lg, so SF2 values cannot collide with them', () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(dir, 'globals.css'), 'utf8');
    expect(source).not.toMatch(/^\s*--shadow(-lg)?:/m);
  });

  it('keeps the SF2 shadow values available under their own namespaced names', () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(dir, 'globals.css'), 'utf8');
    expect(source).toMatch(/^\s*--sf-shadow:/m);
    expect(source).toMatch(/^\s*--sf-shadow-lg:/m);
    expect(source).toMatch(/--shadow-panel:\s*var\(--sf-shadow\);/);
    expect(source).toMatch(/--shadow-panel-lg:\s*var\(--sf-shadow-lg\);/);
  });
});
