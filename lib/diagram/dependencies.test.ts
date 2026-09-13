// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Confirms the diagram feature (spec docs/superpowers/specs/2026-09-13-
// diagrams-design.md: "zero external dependencies... an in-repo port of
// React Flow's architecture") never actually installed a diagramming
// library - lib/diagram/geometry.ts and store.ts are original code, not a
// wrapped package. Read fresh from disk (not imported) so this reflects
// today's real package.json, not a cached module.
describe('the diagram feature adds no new dependency', () => {
  function packageJson(): { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } {
    return JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
  }

  it('never installed a flowchart/diagramming library', () => {
    const { dependencies = {}, devDependencies = {} } = packageJson();
    const allNames = [...Object.keys(dependencies), ...Object.keys(devDependencies)];

    const knownDiagramLibraries = [
      'reactflow',
      '@xyflow/react',
      '@xyflow/system',
      'tldraw',
      '@tldraw/tldraw',
      'excalidraw',
      '@excalidraw/excalidraw',
      'jointjs',
      'quickdraw',
      'gojs',
      'konva',
      'react-konva',
      'maxgraph',
      'reaflow',
      'react-diagrams',
      '@projectstorm/react-diagrams',
      'drawnix',
      'plait',
    ];

    for (const forbidden of knownDiagramLibraries) {
      expect(allNames, `package.json should not depend on "${forbidden}"`).not.toContain(forbidden);
    }
  });
});
