import { describe, expect, it } from 'vitest';
import { artifactTypes, capabilities, canUse, loadReview, reviewSchema, saveReview, screenArtifact, searchArtifacts } from './model';

describe('review metadata', () => {
  it('supports every artifact without copying source layouts', () => {
    for (const type of artifactTypes) {
      const artifact = { ...screenArtifact({ id: 's1', name: 'Income' }), type };
      expect(reviewSchema.parse({ version: 1, artifacts: [artifact] }).artifacts[0].screenIds).toEqual(['s1']);
      expect(artifact).not.toHaveProperty('layout');
    }
  });
  it('finds requirements and rationale as well as titles', () => {
    const artifact = screenArtifact({ id: 's1', name: 'Income' });
    artifact.context.requirement = 'Reduce incomplete applications';
    expect(searchArtifacts([artifact], 'income incomplete')).toEqual([artifact]);
    expect(searchArtifacts([artifact], 'missing')).toEqual([]);
  });
  it('preserves file-scoped context through save and reload', () => {
    const artifact = screenArtifact({ id: 's1', name: 'Income' });
    artifact.context.rationale = 'Clarify the next action';
    saveReview(localStorage, 'fileA', { version: 1, artifacts: [artifact] });
    expect(loadReview(localStorage, 'fileA').artifacts[0].context).toEqual(artifact.context);
    expect(loadReview(localStorage, 'fileB').artifacts).toEqual([]);
  });
  it('rejects malformed stored data and surfaces storage failure', () => {
    expect(() => loadReview({ getItem: () => '{broken' }, 'f')).toThrow();
    expect(() => saveReview({ setItem: () => { throw new Error('Quota'); } }, 'f', { version: 1, artifacts: [] })).toThrow('Quota');
  });
  it('never elevates permissions by changing presets', () => {
    expect(canUse([], 'design', 'vote.manage')).toBe(false);
    expect(canUse(capabilities, 'business', 'context.edit')).toBe(false);
    for (const capability of capabilities) expect(canUse(capabilities, 'design', capability)).toBe(true);
  });
});

it('validates saved review settings and rejects unsupported recipient grants', async () => {
  const { sharedReviewSchema } = await import('./model');
  const review = { version: 1, preset: 'research', start: 's1', navigation: true, capabilities: ['context.read'], artifacts: [], approval: 'off', comments: {}, approvals: {} };
  expect(sharedReviewSchema.safeParse(review).success).toBe(true);
  expect(sharedReviewSchema.safeParse({ ...review, capabilities: ['context.edit'] }).success).toBe(false);
  expect(sharedReviewSchema.safeParse({ ...review, capabilities: ['vote'] }).success).toBe(false);
  const artifact = screenArtifact({ id: 's1', name: 'Screen' });
  expect(sharedReviewSchema.safeParse({ ...review, artifacts: [artifact, artifact] }).success).toBe(false);
});
