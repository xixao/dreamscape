"use client";
import { useState } from "react";
import { ArrowRight, ChevronDown, Flag, MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Comment, Revision, Session } from "@/lib/model";
import { sessionFacts } from "@/lib/results";
export type EvidenceContext = {
  session: Session;
  source: Revision;
  updated?: Revision;
};
export default function EvidenceTrail({
  evidence,
  comments,
  onReview,
  onVersion,
  onClose,
  busy,
}: {
  evidence: EvidenceContext;
  comments: Comment[];
  onReview: () => void;
  onVersion: (revision: Revision) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const { session, source, updated } = evidence;
  const feedback = comments.filter(
    (c) => c.revisionId === source.id && !c.parentId,
  );
  const unavailable = sessionFacts(session).unavailable.length;
  return (
    <section className="evidence-trail" aria-label="Evidence to decision">
      <header>
        <Flag size={16} />
        <strong>Evidence to decision</strong>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Toggle evidence details"
          title="Toggle evidence details"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronDown size={16} />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Close evidence"
          title="Close evidence"
          onClick={onClose}
        >
          <X size={16} />
        </Button>
      </header>
      {!expanded && (
        <p>
          v{source.number}
          {updated
            ? ` → v${updated.number} saved · Human review required`
            : " · Test evidence linked"}
        </p>
      )}
      {expanded && (
        <>
          <ol>
            <li>
              <span className="evidence-step">1</span>
              <div>
                <strong>Observation · v{source.number}</strong>
                <p>
                  {session.outcome === "complete"
                    ? "Task completed"
                    : session.outcome === "gave_up"
                      ? "Test abandoned"
                      : "Test still open"}{" "}
                  · {unavailable} unavailable-control attempts
                </p>
                {session.feedback && (
                  <blockquote>{session.feedback}</blockquote>
                )}
              </div>
            </li>
            <li>
              <span className="evidence-step">2</span>
              <div>
                <strong className="icon-title">
                  <MessageSquare size={14} aria-hidden="true" />
                  <span>Feedback on v{source.number}</span>
                </strong>
                {feedback.length ? (
                  feedback.slice(-2).map((c) => (
                    <p key={c.id}>
                      <b>{c.author}:</b> {c.text}
                    </p>
                  ))
                ) : (
                  <p>No review comments on this version.</p>
                )}
              </div>
            </li>
            <li>
              <span className="evidence-step">3</span>
              <div>
                <strong>
                  {updated ? "Change saved" : "Review a possible change"}
                </strong>
                {updated ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => onVersion(updated)}
                  >
                    Open v{updated.number}
                    <ArrowRight size={14} />
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setExpanded(false);
                      onReview();
                    }}
                  >
                    Review recovery
                    <ArrowRight size={14} />
                  </Button>
                )}
                <p>
                  {updated
                    ? "The change still needs human review and a new test."
                    : "The assistant suggests a change; you decide whether to apply it."}
                </p>
              </div>
            </li>
          </ol>
          <p className="muted">
            Observed behavior is not proof of cause or improvement.
          </p>
        </>
      )}
    </section>
  );
}
