import { describe, expect, it } from 'vitest';
import { applyVote, ballotForReviewer, captureDecision, type Ballot } from './voting';
const initial: Ballot = { id: 'v1', artifactId: 'a1', question: 'Which direction?', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], phase: 'private', votes: {} };
const manager = { id: 'host', canVote: true, canManage: true };
const reviewer = { id: 'guest', canVote: true, canManage: false };
describe('private voting lifecycle', () => {
  it('allows one current vote per reviewer, conceals results, locks then reveals', () => {
    const first = applyVote(initial, { type: 'cast', optionId: 'a' }, reviewer);
    const changed = applyVote(first, { type: 'cast', optionId: 'b' }, reviewer);
    expect(Object.keys(changed.votes)).toHaveLength(1);
    expect(ballotForReviewer(changed, manager.id)).not.toHaveProperty('results');
    expect(ballotForReviewer(changed, manager.id)).not.toHaveProperty('votes');
    expect(ballotForReviewer(changed, manager.id).ownVote).toBeNull();
    const locked = applyVote(changed, { type: 'lock' }, manager);
    expect(() => applyVote(locked, { type: 'cast', optionId: 'a' }, reviewer)).toThrow('locked');
    expect(ballotForReviewer(locked, manager.id)).not.toHaveProperty('results');
    const revealed = applyVote(locked, { type: 'reveal' }, manager);
    expect(ballotForReviewer(revealed, manager.id).results?.map(option => option.count)).toEqual([0, 1]);
    expect(initial.votes).toEqual({});
  });
  it('rejects unauthorized actions, unknown options and skipped phases', () => {
    expect(() => applyVote(initial, { type: 'lock' }, reviewer)).toThrow('not permitted');
    expect(() => applyVote(initial, { type: 'reveal' }, manager)).toThrow('transition');
    expect(() => applyVote(initial, { type: 'cast', optionId: 'missing' }, reviewer)).toThrow('Unknown');
    expect(() => applyVote(initial, { type: 'cast', optionId: 'a' }, { ...reviewer, canVote: false })).toThrow('not permitted');
  });
  it('requires revealed matching votes and a rationale for decision capture', () => {
    const input = { id: 'd1', artifactId: 'a1', ballotId: 'v1', selectedOptionId: 'b', rationale: 'Clearer next action', owner: 'UX', nextStep: 'Test', actorId: 'host', createdAt: '2026-09-15T12:00:00Z' };
    expect(() => captureDecision(input, true, initial)).toThrow('Reveal');
    expect(captureDecision(input, true, { ...initial, phase: 'revealed' })).toEqual(input);
    expect(() => captureDecision(input, false, { ...initial, phase: 'revealed' })).toThrow('not permitted');
    expect(() => captureDecision({ ...input, rationale: '' }, true, { ...initial, phase: 'revealed' })).toThrow('required');
  });
});
