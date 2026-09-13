"use client";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Session } from "@/lib/model";
import { summarizeResults } from "@/lib/results";

export default function ResultsSummary({
  sessions,
  loaded,
  onEvidence,
  onReview,
  sessionLabel,
}: {
  sessions: Session[];
  loaded: boolean;
  onEvidence: (sessions: Session[]) => void;
  onReview: (session: Session) => void;
  sessionLabel: (session: Session) => string;
}) {
  const summary = summarizeResults(sessions);
  return (
    <>
      <div className="outcome-summary" aria-label="Testing summary">
        <div className="outcome-stat success">
          <CheckCircle2 aria-hidden="true" />
          <strong>
            {loaded ? `${summary.complete} of ${summary.total}` : "..."}
          </strong>
          <span>Completed the task</span>
          <small>
            {summary.abandoned} abandoned · {summary.open} still open
          </small>
        </div>
        <div className="outcome-stat warning">
          <AlertTriangle aria-hidden="true" />
          <strong>
            {loaded ? `${summary.blocked} of ${summary.total}` : "..."}
          </strong>
          <span>Encountered unavailable actions</span>
          <small>Counted once per session</small>
        </div>
        <div className="outcome-stat">
          <MessageSquare aria-hidden="true" />
          <strong>
            {summary.average ? `${summary.average} / 5` : "Not rated"}
          </strong>
          <span>Participant rating</span>
          <small>{summary.ratingCount} responses</small>
        </div>
      </div>
      <section className="results-key-findings" aria-label="Key findings">
        <header>
          <h3>What needs attention</h3>
          <span>{summary.findings.length} findings</span>
        </header>
        {!loaded ? (
          <p role="status">Loading test results...</p>
        ) : !summary.findings.length ? (
          <p>
            {summary.total
              ? "No abandonment or unavailable-control attempts recorded. Written feedback and individual sessions are available below."
              : "No test sessions in this scope. Choose another version or group, or set up a test."}
          </p>
        ) : (
          summary.findings.map((finding) => {
            const quoted = finding.sessions.find((s) => s.feedback.trim());
            return (
              <article className="results-finding-row" key={finding.id}>
                <div>
                  <h4 className="icon-title">
                    <AlertTriangle size={18} aria-hidden="true" />
                    <span>{finding.title}</span>
                  </h4>
                  <p className="results-finding-count">
                    {finding.sessions.length} of {summary.total} sessions
                  </p>
                  <p>{finding.observation}</p>
                  {quoted && (
                    <blockquote>
                      <p>
                        {quoted.feedback.slice(0, 180)}
                        {quoted.feedback.length > 180 ? "..." : ""}
                      </p>
                      <cite>{sessionLabel(quoted)} · Participant feedback</cite>
                      {quoted.feedback.length > 180 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEvidence([quoted])}
                        >
                          Read full feedback <ArrowRight size={14} />
                        </Button>
                      )}
                    </blockquote>
                  )}
                </div>
                <div className="results-finding-actions">
                  <Button
                    variant="outline"
                    onClick={() => onReview(finding.sessions[0])}
                  >
                    View affected design
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`See evidence: ${finding.title}`}
                    onClick={() => onEvidence(finding.sessions)}
                  >
                    See evidence <ArrowRight size={16} />
                  </Button>
                </div>
              </article>
            );
          })
        )}
        {loaded && (
          <div className="results-next-step">
            <strong>Suggested next step</strong>
            <p>{summary.next}</p>
          </div>
        )}
        {summary.findings.length > 1 && (
          <p className="results-sample-note">
            A session can appear in more than one finding. Findings describe
            observations, not their cause.
          </p>
        )}
      </section>
    </>
  );
}
