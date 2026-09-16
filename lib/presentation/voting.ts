/** Transport-independent lifecycle. The storage adapter must execute mutations
 * atomically and derive actor/capabilities from trusted session data. */
export type Ballot = {
  id: string; artifactId: string; question: string; options: { id: string; label: string }[];
  phase: 'private' | 'locked' | 'revealed'; votes: Record<string, string>;
};
export type VoteAction =
  | { type: 'cast'; optionId: string }
  | { type: 'lock' }
  | { type: 'reveal' };
export type VoteActor = { id: string; canVote: boolean; canManage: boolean };
export function applyVote(ballot: Ballot, action: VoteAction, actor: VoteActor): Ballot {
  if (!actor.id.trim()) throw new Error('A reviewer identity is required.');
  if (action.type === 'cast') {
    if (!actor.canVote) throw new Error('Voting is not permitted.');
    if (ballot.phase !== 'private') throw new Error('Voting is locked.');
    if (!ballot.options.some(option => option.id === action.optionId)) throw new Error('Unknown option.');
    return { ...ballot, votes: { ...ballot.votes, [actor.id]: action.optionId } };
  }
  if (!actor.canManage) throw new Error('Managing this vote is not permitted.');
  if (action.type === 'lock' && ballot.phase === 'private') return { ...ballot, phase: 'locked' };
  if (action.type === 'reveal' && ballot.phase === 'locked') return { ...ballot, phase: 'revealed' };
  throw new Error('Invalid voting transition.');
}
/** Never send raw ballots to a client. Results exist only after reveal. */
export function ballotForReviewer(ballot: Ballot, actorId: string) {
  return {
    id: ballot.id, artifactId: ballot.artifactId, question: ballot.question,
    options: ballot.options, phase: ballot.phase, ownVote: ballot.votes[actorId] ?? null,
    ...(ballot.phase === 'revealed' ? { results: ballot.options.map(option => ({
      ...option, count: Object.values(ballot.votes).filter(vote => vote === option.id).length,
    })) } : {}),
  };
}
export type CapturedDecision = {
  id: string; artifactId: string; ballotId: string | null; selectedOptionId: string | null;
  rationale: string; owner: string; nextStep: string; actorId: string; createdAt: string;
};
export function captureDecision(input: CapturedDecision, canCapture: boolean, ballot?: Ballot): CapturedDecision {
  if (!canCapture) throw new Error('Decision capture is not permitted.');
  if (![input.id, input.artifactId, input.rationale, input.owner, input.nextStep, input.actorId].every(value => value.trim()))
    throw new Error('Decision, rationale, owner and next step are required.');
  if (!Number.isFinite(Date.parse(input.createdAt))) throw new Error('Invalid timestamp.');
  if (input.ballotId !== null) {
    if (!ballot || ballot.id !== input.ballotId || ballot.artifactId !== input.artifactId || ballot.phase !== 'revealed')
      throw new Error('Reveal the matching vote before capturing its decision.');
    if (!ballot.options.some(option => option.id === input.selectedOptionId)) throw new Error('Choose a valid option.');
  } else if (input.selectedOptionId !== null) throw new Error('An option requires a vote reference.');
  return { ...input };
}
