import type { Screen } from './files/repository';

export type PrototypeFlow = { id: string; name: string; named: boolean; screens: Screen[] };
/** Named starting screens and connected flows, across all Pages in a file. */
export function collectPrototypes(screens: Screen[]): PrototypeFlow[] {
  const byId = new Map(screens.map(screen => [screen.id, screen]));
  const edges = new Map<string, string[]>();
  const names = new Map<string, string>();
  const incoming = new Set<string>();
  for (const screen of screens) {
    const targets: string[] = [];
    try {
      const nodes = JSON.parse(screen.layout);
      const name = nodes.ROOT?.custom?.prototypeName;
      if (typeof name === 'string' && name.trim()) names.set(screen.id, name.trim());
      for (const node of Object.values(nodes) as { custom?: { interactions?: { action: string; targetScreenId?: string }[] } }[]) {
        const interaction = node?.custom?.interactions?.[0];
        if (interaction && ['navigate', 'openOverlay'].includes(interaction.action) && interaction.targetScreenId && byId.has(interaction.targetScreenId)) {
          targets.push(interaction.targetScreenId); incoming.add(interaction.targetScreenId);
        }
      }
    } catch { /* A malformed screen must not hide the other prototypes. */ }
    edges.set(screen.id, [...new Set(targets)]);
  }
  const flows: PrototypeFlow[] = []; const covered = new Set<string>();
  const add = (start: Screen) => {
    const visited = new Set<string>(); const queue = [start.id]; const connected: Screen[] = [];
    for (let index = 0; index < queue.length; index++) {
      const id = queue[index]; if (visited.has(id)) continue;
      visited.add(id); covered.add(id); connected.push(byId.get(id)!);
      queue.push(...(edges.get(id) ?? []));
    }
    flows.push({ id: start.id, name: names.get(start.id) ?? start.name, named: names.has(start.id), screens: connected });
  };
  const eligible = screens.filter(screen => screen.kind !== 'overlay');
  for (const screen of eligible) if (names.has(screen.id)) add(screen);
  for (const screen of eligible) if (!covered.has(screen.id) && !incoming.has(screen.id) && edges.get(screen.id)?.length) add(screen);
  // Cyclic flows have no zero-incoming starting node; retain one entry for them.
  for (const screen of eligible) if (!covered.has(screen.id) && edges.get(screen.id)?.length) add(screen);
  return flows;
}
