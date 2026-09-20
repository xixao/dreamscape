import { z } from 'zod';
import { KNOWN_TYPES } from '@/components/blocks/known-types';

// Persist plain component trees, never generated source code.
export function safeLayout(value: string): boolean {
  try {
    const tree = JSON.parse(value);
    if (!tree || Array.isArray(tree) || !tree.ROOT || Object.keys(tree).length > 2000) return false;
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const visit = (id: string, parent: string | null): boolean => {
      const node = tree[id];
      if (!node || typeof node !== 'object' || (node.parent ?? null) !== parent || visiting.has(id) || visited.has(id)) return false;
      if (!KNOWN_TYPES.has(node.type?.resolvedName) || !Array.isArray(node.nodes) || !node.linkedNodes || typeof node.linkedNodes !== 'object' || Array.isArray(node.linkedNodes) || !node.props || typeof node.props !== 'object' || Array.isArray(node.props)) return false;
      if (/"(?:dangerouslySetInnerHTML|__proto__|on[A-Z][^"]*)"\s*:|javascript:|<script/i.test(JSON.stringify(node.props))) return false;
      if (node.type.resolvedName === 'CustomComponent' && (typeof node.props.layout !== 'string' || !safeLayout(node.props.layout))) return false;
      visiting.add(id);
      for (const child of [...node.nodes, ...Object.values(node.linkedNodes)]) if (typeof child !== 'string' || !visit(child, id)) return false;
      visiting.delete(id); visited.add(id); return true;
    };
    return visit('ROOT', null) && visited.size === Object.keys(tree).length;
  } catch { return false; }
}
const text = z.string().max(12000);
export const snapshotSchema = z.object({ sourceScreenId: z.string().optional(), sourcePageId: z.string().optional(), name: z.string().min(1).max(80), layout: z.string().max(2000000).refine(safeLayout, 'Invalid component tree'), width: z.number().int().min(240).max(3840), height: z.number().int().min(1).max(100000).nullable(), appearance: z.enum(['light', 'dark', 'internal-light', 'internal-dark']).optional() });
export const rationaleSchema = z.object({ annotations: z.array(z.object({elementId:z.string(),title:z.string().max(60),text:z.string().max(650)})).max(3).optional(), recommendation: z.object({goal:z.string().max(100),reason:z.string().max(180),condition:z.string().max(180)}).optional(), summary: z.string().max(120).optional(), bestFor: text.optional(), poorFit: text.optional(), hypothesis: text, assumption: text, tradeoff: text, decisions: z.array(z.object({ title: z.string().max(90).optional(), elementIds: z.array(z.string()), explanation: text })).max(30), precedents: z.array(z.object({ title: text, url: z.string().url().refine(url => /^https?:/.test(url)).optional(), lesson: text })).max(10), test: text });
export const variationSchema = z.object({ id: z.string(), name: z.string().min(1).max(80), screens: z.array(snapshotSchema).min(1).max(8), rationale: rationaleSchema, promoted: z.object({ pageId: z.string(), screenIds: z.array(z.string()) }).optional() });
export const setSchema = z.object({ id: z.string(), parentId: z.string().nullable(), prompt: text, count: z.number().int().min(1).max(3), countFromPrompt: z.boolean().optional(), teach: z.boolean(), status: z.enum(['pending','ready','error']), error: text.optional(), variations: z.array(variationSchema).max(3) });
export const explorationSchema = z.object({ brief: text, source: z.array(snapshotSchema).max(8), selectedIds: z.array(z.string()).max(2000), sets: z.array(setSchema).max(100) }).superRefine((value, ctx) => {
  const ids = new Set<string>();
  const parents = new Set<string>();
  for (const set of value.sets) {
    if (ids.has(set.id) || (set.parentId && !parents.has(set.parentId))) ctx.addIssue({code:'custom',message:'Invalid exploration lineage'});
    ids.add(set.id);
    for (const variation of set.variations) {
      if (parents.has(variation.id)) ctx.addIssue({code:'custom',message:'Duplicate variation'});
      parents.add(variation.id);
    }
  }
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Variation = z.infer<typeof variationSchema>;
export type VariationSet = z.infer<typeof setSchema>;
export type Exploration = z.infer<typeof explorationSchema>;
export type Setup = { prompt: string; brief: string; count: number; teach: boolean };
export function parseGeneration(raw: string, count: number | undefined, source: Snapshot[], selectedIds: string[]): Variation[] {
  const clean = raw.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  const result = z.object({ variations: z.array(variationSchema.omit({id:true,promoted:true})).min(count ?? 1).max(count ?? 3) }).parse(JSON.parse(clean));
  if (selectedIds.length && source.length === 1) {
    const original = JSON.parse(source[0].layout);
    const allowed = new Set<string>();
    const walk = (id: string) => { if (allowed.has(id) || !original[id]) return; allowed.add(id); [...original[id].nodes, ...Object.values(original[id].linkedNodes)].forEach(child => walk(child as string)); };
    selectedIds.forEach(walk);
    for (const variation of result.variations) {
      if (variation.screens.length !== 1) throw new Error('Selection variations must retain their surrounding screen.');
      const tree = JSON.parse(variation.screens[0].layout);
      for (const [id, node] of Object.entries(original)) if (!allowed.has(id) && JSON.stringify(tree[id]) !== JSON.stringify(node)) throw new Error('The response changed content outside the selected scope.');
    }
  }
  return result.variations.map(variation => ({...variation, id: crypto.randomUUID()}));
}
export function generationPrompt(source: Snapshot[], selectedIds: string[], brief: string, set: VariationSet): string {
  return `Generate ${set.countFromPrompt ? "the number of meaningfully distinct coded design alternatives requested in the designer’s prompt (one if unspecified; this workspace supports one to three per request)" : `${set.count} meaningfully distinct coded design alternatives`}. Return ONLY JSON {"variations":[{"name":"...","screens":[{"name":"...","layout":"Craft JSON string","width":1440,"height":null}],"rationale":{"annotations":[{"elementId":"actual node ID","title":"Design decision","text":"Explain the UX principle, its visible application, and tradeoff or validation need in 2–4 sentences. At most 650 characters."}],"summary":"One clear design intent, at most 120 characters","bestFor":"User, task and context","poorFit":"When this direction should not be chosen","hypothesis":"...","assumption":"...","tradeoff":"...","decisions":[{"title":"Concrete design choice","elementIds":[],"explanation":"..."}],"precedents":[{"title":"...","url":"https://...","lesson":"..."}],"test":"..."}}]}.
Use only these component types: ${[...KNOWN_TYPES].join(', ')}. Each tree has ROOT, valid nodes/linkedNodes/parents and only supported component props. Never emit executable code or HTML. Preserve source IDs. When selectedIds is nonempty, change ONLY those subtrees and preserve every other node exactly. Explain & teach: ${set.teach}. ${set.teach ? 'Provide 2–3 teaching annotations anchored to actual node IDs, each up to 650 characters. Explain one UX principle through a visible design choice in plain language, then describe the tradeoff or what requires validation. Use only supplied evidence for roles and workflows; do not infer task frequency or organizational needs. Keep the summary short. Recommendations are optional and conditional on established goals. Rationale fields must distinguish observations, general principles, and hypotheses. Omit unsupported precedents.' : 'Keep rationale fields concise; precedents and decisions may be empty.'}
Brief: ${JSON.stringify(brief)}\nRequest: ${JSON.stringify(set.prompt)}\nselectedIds: ${JSON.stringify(selectedIds)}\nSource screens: ${JSON.stringify(source)}`;
}

/** An independent copy must not claim that its output has already been promoted. */
export function cloneExploration(source: Exploration): Exploration {
  const copy = structuredClone(source);
  const ids = new Map(copy.sets.flatMap(set => set.variations.map(variation => [variation.id, crypto.randomUUID()] as const)));
  copy.sets = copy.sets.map(set => ({
    ...set,
    id: crypto.randomUUID(),
    parentId: set.parentId ? ids.get(set.parentId)! : null,
    ...(set.status === 'pending' ? { status: 'error' as const, error: 'This request was copied. Retry to generate it.' } : {}),
    variations: set.variations.map(variation => { const next = { ...variation, id: ids.get(variation.id)! }; delete next.promoted; return next; }),
  }));
  return copy;
}
