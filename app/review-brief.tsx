import { ArrowRight, ClipboardCheck, MessageSquare, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Workspace, Revision, UploadState } from "@/lib/model";
import { sessionFacts } from "@/lib/results";
import StateSelector from "@/components/state-selector";
import { uploadStateShortOptions } from "@/lib/demo/upload";
const briefs = {
  ready: {
    title: "Before the upload",
    goal: "Provide the right document with confidence.",
    decision: "Are the document requirements and next action clear?",
  },
  failed: {
    title: "When the upload fails",
    goal: "Recover without losing the selected document.",
    decision:
      "Does the error explain what happened and offer a usable next step?",
  },
  complete: {
    title: "After the upload",
    goal: "Know the document was received and continue.",
    decision: "Is success clear, and can the person finish the task?",
  },
};
export default function ReviewBrief({
  data,
  revision,
  state,
  dirty,
  onState,
  onFeedback,
  onResults,
  onChecks,
  onSuggest,
}: {
  data: Workspace;
  revision: Revision;
  state: UploadState;
  dirty: boolean;
  onState: (state: UploadState) => void;
  onFeedback: () => void;
  onResults: () => void;
  onChecks: () => void;
  onSuggest: () => void;
}) {
  const brief = briefs[state];
  const sessions = data.sessions.filter((s) => s.revisionId === revision.id);
  const flagged = sessions.filter((s) => sessionFacts(s).attention).length;
  const open = data.comments.filter(
    (c) => c.revisionId === revision.id && !c.parentId && !c.resolved,
  ).length;
  return (
    <div className="review-brief">
      <header>
        <ClipboardCheck size={18} />
        <strong>Review brief</strong>
        <span className="badge">v{revision.number}</span>
      </header>
      <section>
        <p className="eyebrow">CURRENT STATE</p>
        <h2>{brief.title}</h2>
        <p>{brief.goal}</p>
        <h3>Decision to make</h3>
        <p>{brief.decision}</p>
        <StateSelector
          className="brief-state-options"
          label="Review state"
          numbered
          value={state}
          options={uploadStateShortOptions}
          onChange={onState}
        />
      </section>
      <section>
        <h3>Evidence on this version</h3>
        <button className="brief-evidence-link" onClick={onResults}>
          <Flag size={18} />
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
        </button>
        <button className="brief-evidence-link" onClick={onFeedback}>
          <MessageSquare size={18} />
          <span>
            <strong>
              {open} open review {open === 1 ? "comment" : "comments"}
            </strong>
            <small>Designer and reviewer feedback</small>
          </span>
          <ArrowRight size={16} />
        </button>
        {!sessions.length && (
          <p className="muted">
            No participant evidence yet. Review comments are not test results.
          </p>
        )}
      </section>
      <section>
        <h3>Next decision</h3>
        <p>
          {dirty
            ? "This canvas contains an unsaved draft. Recorded evidence belongs to the saved version."
            : "Review the evidence before accepting a change. Configuration checks do not certify accessibility."}
        </p>
        <div className="brief-actions">
          <Button variant="outline" onClick={onChecks}>
            Inspect checks
          </Button>
          <Button onClick={onSuggest}>
            Suggest a change
            <ArrowRight size={15} />
          </Button>
        </div>
        <p className="muted">
          You approve changes; a new test is needed to evaluate them.
        </p>
      </section>
    </div>
  );
}
