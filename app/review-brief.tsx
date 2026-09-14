import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Workspace, Revision, UploadState } from "@/lib/model";
import { sessionFacts } from "@/lib/results";
import { isDecisionRecord } from "@/lib/review";
const briefs = {
  ready: {
    title: "Ready to upload",
    question: "Can someone identify the right document and start the upload?",
  },
  failed: {
    title: "Upload interrupted",
    question: "Can someone understand the error and recover without starting over?",
  },
  complete: {
    title: "Document received",
    question: "Can someone tell the upload succeeded and continue?",
  },
};
export default function ReviewBrief({
  data,
  revision,
  state,
  dirty,
  onFeedback,
  onResults,
  onChecks,
  onSuggest,
}: {
  data: Workspace;
  revision: Revision;
  state: UploadState;
  dirty: boolean;
  onFeedback: () => void;
  onResults: () => void;
  onChecks: () => void;
  onSuggest: () => void;
}) {
  const brief = briefs[state];
  const sessions = data.sessions.filter((s) => s.revisionId === revision.id);
  const flagged = sessions.filter((s) => sessionFacts(s).attention).length;
  const open = data.comments.filter(
    (c) => c.revisionId === revision.id && !c.parentId && !c.resolved && !isDecisionRecord(c),
  ).length;
  return (
    <div className="review-brief">
      <section className="brief-question">
        <h2>{brief.title}</h2>
        <p>{brief.question}</p>
      </section>
      <section>
        <h2>Evidence</h2>
        <Button variant="bare" size="auto" className="brief-evidence-link" onClick={onResults}>
          <span>
            <strong>
              {sessions.length} participant{" "}
              {sessions.length === 1 ? "session" : "sessions"}
            </strong>
            <small>
              {flagged} with abandonment or unavailable-control attempts
            </small>
          </span>
          <ArrowRight size={16} />
        </Button>
        <Button variant="bare" size="auto" className="brief-evidence-link" onClick={onFeedback}>
          <span>
            <strong>
              {open} open review {open === 1 ? "comment" : "comments"}
            </strong>
            <small>Designer and reviewer discussion</small>
          </span>
          <ArrowRight size={16} />
        </Button>
        {!sessions.length && (
          <p className="muted">
            No participant evidence yet. Review comments are not test results.
          </p>
        )}
      </section>
      <section>
        <h2>Next action</h2>
        <p>
          {dirty
            ? "Unsaved canvas changes are not reflected in this version's evidence."
            : "Review the evidence, then decide whether to revise this design."}
        </p>
        <div className="brief-actions">
          <Button variant="outline" onClick={onChecks}>
            Review checks
          </Button>
          <Button onClick={onSuggest}>
            Suggest a change
            <ArrowRight size={15} />
          </Button>
        </div>
      </section>
    </div>
  );
}
