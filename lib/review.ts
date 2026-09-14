import type { Comment, Config, Revision } from "./model";

export const verificationChecks = [
  {
    status: "manual",
    title: "Accessibility verification",
    kind: "Human review",
    detail: "Check keyboard order, screen-reader behavior, zoom, contrast, and error recovery with people.",
  },
  {
    status: "unavailable",
    title: "Design System MCP",
    kind: "Integration",
    detail: "Checks use local rules. Production upload security, file validation, and backend recovery are out of scope.",
  },
] as const;

export function isDecisionRecord(comment: Comment) {
  return comment.text.startsWith("PO decision:");
}
export function discussionThreads(comments: Comment[]) {
  return comments.filter((comment) => !comment.parentId && !isDecisionRecord(comment));
}

export function sameConfig(a: Config, b: Config) {
  return (
    a.title === b.title &&
    a.helper === b.helper &&
    a.error === b.error &&
    a.button === b.button &&
    a.retryEnabled === b.retryEnabled &&
    a.announceError === b.announceError
  );
}

export function previousRevision(revisions: Revision[], current: Revision) {
  return revisions
    .filter((r) => r.number < current.number)
    .reduce<
      Revision | undefined
    >((previous, r) => (!previous || r.number > previous.number ? r : previous), undefined);
}

export function placedComments(
  comments: Comment[],
  revisionId: string,
  state: string,
  viewport: "desktop" | "mobile",
) {
  return comments.filter(
    (c) =>
      !isDecisionRecord(c) &&
      !c.parentId &&
      c.revisionId === revisionId &&
      c.state === state &&
      (c.viewport === "both" || c.viewport === viewport),
  );
}

export function createHandoff(
  revision: Revision,
  draft: Config,
  comments: Comment[],
  checks: unknown,
  demoId: string,
  states: readonly string[],
) {
  return {
    schemaVersion: 2,
    demoId,
    componentId: "document-uploader",
    source: "scripted-demo",
    productionReady: false,
    savedRevision: revision,
    inspectedDesign: {
      config: draft,
      status: sameConfig(draft, revision.config) ? "saved" : "unsaved-draft",
    },
    checks,
    states,
    comments: comments.filter((c) => c.revisionId === revision.id && !isDecisionRecord(c)),
    commentsApplyTo: "savedRevision",
  };
}
