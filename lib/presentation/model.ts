import { z } from 'zod';

export const artifactTypes = ['screen', 'slide', 'prototype', 'journey', 'flow', 'comparison', 'requirement', 'component', 'decision'] as const;
export const capabilities = ['context.read', 'context.edit', 'focus', 'compare', 'prototype', 'search', 'comment', 'vote', 'vote.manage', 'decision.capture'] as const;
export type Capability = typeof capabilities[number];
export const presets = {
  business: { name: 'Stakeholder Review', capabilities: ['context.read', 'search', 'prototype', 'compare', 'comment', 'vote', 'decision.capture'] },
  design: { name: 'Design Review', capabilities: [...capabilities] },
  research: { name: 'Research Review', capabilities: ['context.read', 'search', 'prototype', 'compare'] },
  development: { name: 'Development Handoff', capabilities: ['context.read', 'search', 'focus', 'compare', 'prototype', 'comment'] },
} satisfies Record<string, { name: string; capabilities: Capability[] }>;
export type Preset = keyof typeof presets;

/** Presets only reduce granted capabilities. They never grant access. */
export function canUse(granted: readonly Capability[], preset: Preset, capability: Capability) {
  return granted.includes(capability) && (presets[preset].capabilities as readonly Capability[]).includes(capability);
}

const text = z.string().max(10000);
export const contextSchema = z.object({
  problem: text.default(''), requirement: text.default(''), rationale: text.default(''),
  evidence: text.default(''), constraints: text.default(''), accessibility: text.default(''),
  questions: text.default(''),
  decision: text.default(''), owner: text.default(''), nextStep: text.default(''),
  interactions: text.default(''), components: text.default(''),
});
export type ReviewContext = z.infer<typeof contextSchema>;
export const contextLabels: Record<keyof ReviewContext, string> = {
  problem: 'User problem', requirement: 'Business requirement', rationale: 'Design rationale',
  evidence: 'Evidence', constraints: 'Constraints', accessibility: 'Accessibility', questions: 'Open questions',
  decision: 'Decision summary (manual)', owner: 'Decision owner', nextStep: 'Next step',
  interactions: 'Interactions and states', components: 'Component references',
};
export const presetContextFields: Record<Preset, (keyof ReviewContext)[]> = {
  business: ['problem', 'requirement', 'rationale', 'questions', 'decision', 'owner', 'nextStep'],
  design: Object.keys(contextLabels) as (keyof ReviewContext)[],
  research: ['problem', 'questions', 'evidence', 'constraints', 'rationale', 'nextStep'],
  development: ['requirement', 'interactions', 'components', 'accessibility', 'constraints', 'questions', 'decision', 'owner', 'nextStep'],
};

export const artifactSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.enum(artifactTypes),
  title: z.string().trim().min(1).max(200),
  body: text.default(''),
  // Stable references; never copy a Craft layout into review metadata.
  screenIds: z.array(z.string().min(1).max(200)).max(100),
  context: contextSchema,
});
export type ReviewArtifact = z.infer<typeof artifactSchema>;
export const reviewSchema = z.object({
  version: z.literal(1),
  artifacts: z.array(artifactSchema).max(500),
}).superRefine((review, ctx) => {
  if (new Set(review.artifacts.map(a => a.id)).size !== review.artifacts.length)
    ctx.addIssue({ code: 'custom', message: 'Artifact IDs must be unique.' });
});
export type ReviewDocument = z.infer<typeof reviewSchema>;
export function screenArtifact(screen: { id: string; name: string }): ReviewArtifact {
  return { id: `screen:${screen.id}`, type: 'screen', title: screen.name, body: '', screenIds: [screen.id], context: contextSchema.parse({}) };
}
export function searchArtifacts(artifacts: ReviewArtifact[], query: string) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return artifacts.filter(a => {
    const haystack = [a.title, a.type, a.body, ...Object.values(a.context)].join(' ').toLocaleLowerCase();
    return terms.every(term => haystack.includes(term));
  });
}

/** Explicit save: callers retain their draft on storage failure. */
export function saveReview(storage: Pick<Storage, 'setItem'>, fileId: string, review: ReviewDocument) {
  const validated = reviewSchema.parse(review);
  storage.setItem(`dreamscape:review:${fileId}`, JSON.stringify(validated));
}
export function loadReview(storage: Pick<Storage, 'getItem'>, fileId: string): ReviewDocument {
  const raw = storage.getItem(`dreamscape:review:${fileId}`);
  return raw ? reviewSchema.parse(JSON.parse(raw)) : { version: 1, artifacts: [] };
}

/** Recipient settings are saved with the file; local notes require explicit selection. */
export const sharedCapabilities = ['context.read', 'focus', 'compare', 'prototype', 'search'] as const;
export const sharedReviewSchema = z.object({
  version: z.literal(1),
  title: z.string().trim().max(200).default(''),
  introduction: text.default(''),
  preset: z.enum(['business', 'design', 'research', 'development']),
  start: z.string().max(200),
  navigation: z.boolean(),
  capabilities: z.array(z.enum(sharedCapabilities)).max(sharedCapabilities.length),
  artifacts: reviewSchema.shape.artifacts,
  approval: z.enum(['off', 'prototype', 'screen']),
  comments: z.record(z.string().max(200), z.boolean()),
  approvals: z.record(z.string().max(200), z.boolean()),
}).superRefine((review, ctx) => {
  if (new Set(review.artifacts.map(a => a.id)).size !== review.artifacts.length)
    ctx.addIssue({ code: 'custom', message: 'Artifact IDs must be unique.' });
});
export type SharedReview = z.infer<typeof sharedReviewSchema>;
export type SaveSharedReview = (review: SharedReview) => Promise<void>;
