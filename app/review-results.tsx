"use client";
import { Button } from "@/components/ui/button";
import type { Workspace, Session } from "@/lib/model";
import { Flag, RotateCcw, ArrowRight, Download } from "lucide-react";
import { Empty } from "@/components/ui/empty";
import SessionSignals from "./session-signals";
import { download } from "@/lib/client";
export default function ReviewResults({
  data,
  loaded,
  refresh,
  onCreateTest,
  onReviewEvidence,
}: {
  data: Workspace;
  loaded: boolean;
  refresh: () => Promise<unknown>;
  onCreateTest: () => void;
  onReviewEvidence: (session: Session) => void;
}) {
  return (
    <main className="wide-view">
      <div className="view-title">
        <div>
          <h2>Participant sessions</h2>
          <p>
            Recorded after consent on test links, including designer-run tests.
            Canvas previews are excluded.
          </p>
        </div>
        <Button variant="outline" onClick={() => void refresh()}>
          <RotateCcw size={14} />
          Refresh
        </Button>
      </div>
      <div className="metrics">
        <div>
          <span>Sessions</span>
          <strong>{data.sessions.length}</strong>
        </div>
        <div>
          <span>Completed</span>
          <strong>
            {data.sessions.filter((s) => s.outcome === "complete").length}
          </strong>
        </div>
        <div>
          <span>Gave up</span>
          <strong>
            {data.sessions.filter((s) => s.outcome === "gave_up").length}
          </strong>
        </div>
        <div>
          <span>Still open</span>
          <strong>
            {data.sessions.filter((s) => s.outcome === "started").length}
          </strong>
        </div>
      </div>
      {!data.sessions.length ? (
        <Empty className="results-empty">
          <Flag size={28} />
          <h3>No sessions yet</h3>
          <p>A participant link is pinned to a saved version.</p>
          <Button disabled={!loaded} onClick={onCreateTest}>
            Create test link
            <ArrowRight size={14} />
          </Button>
        </Empty>
      ) : (
        <div className="sessions-list">
          {data.sessions.map((s, i) => (
            <article key={s.id}>
              <div className="section-heading">
                <strong>
                  Session {data.sessions.length - i}{" "}
                  <span className="muted">
                    · v
                    {data.revisions.find((r) => r.id === s.revisionId)?.number}
                  </span>
                </strong>
                <span
                  className={`badge ${s.outcome === "complete" ? "green" : "amber"}`}
                >
                  {s.outcome.replace("_", " ")}
                </span>
              </div>
              <p className="session-meta">
                {new Date(s.createdAt).toLocaleString()} ·{" "}
                {s.duration === null
                  ? "Not ended"
                  : `${Math.round(s.duration / 1000)} seconds`}
              </p>
              <div className="event-trail">
                {s.events.map((e, j) => (
                  <span key={j}>
                    {e.type.replaceAll("_", " ")}{" "}
                    <small>{Math.round(e.at / 1000)}s</small>
                  </span>
                ))}
              </div>
              <SessionSignals session={s} />
              {s.feedback && <blockquote>{s.feedback}</blockquote>}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onReviewEvidence(s)}
              >
                Review this evidence
                <ArrowRight size={14} />
              </Button>
            </article>
          ))}
        </div>
      )}
      <div className="results-footer">
        <p>
          Convenience sample. Timing includes idle time; a completed task is not
          proof of usability. Latest 100 sessions shown.
        </p>
        <Button
          variant="outline"
          onClick={() =>
            download(
              "flow-review-sessions.json",
              JSON.stringify(data.sessions, null, 2),
            )
          }
        >
          <Download size={14} />
          Export sessions
        </Button>
      </div>
    </main>
  );
}
