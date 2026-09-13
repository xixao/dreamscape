"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Workspace, Session } from "@/lib/model";
import {
  Flag,
  RotateCcw,
  ArrowRight,
  Download,
  CheckCircle2,
  AlertTriangle,
  Clock,
  MessageSquare,
} from "lucide-react";
import SessionSignals from "./session-signals";
import { download } from "@/lib/client";
import { eventLabels, outcomeLabels, sessionFacts } from "@/lib/results";
export default function ReviewResults({
  data,
  loaded,
  revisionId,
  refresh,
  onCreateTest,
  onReviewEvidence,
}: {
  data: Workspace;
  loaded: boolean;
  revisionId: string;
  refresh: () => Promise<unknown>;
  onCreateTest: () => void;
  onReviewEvidence: (session: Session) => void;
}) {
  const [version, setVersion] = useState(revisionId),
    [cohort, setCohort] = useState("all"),
    [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState("");
  const [refreshing, setRefreshing] = useState(false),
    [error, setError] = useState("");
  const scoped = data.sessions.filter(
    (s) =>
      (version === "all" || s.revisionId === version) &&
      (cohort === "all" || s.testSetup?.audience === cohort),
  );
  const complete = scoped.filter((s) => s.outcome === "complete").length,
    abandoned = scoped.filter((s) => s.outcome === "gave_up").length,
    open = scoped.filter((s) => s.outcome === "started").length;
  const attention = scoped.filter((s) => sessionFacts(s).attention);
  const visible = scoped.filter(
    (s) =>
      filter === "all" ||
      (filter === "attention"
        ? sessionFacts(s).attention
        : s.outcome === filter),
  );
  const session = visible.find((s) => s.id === selected) ?? visible[0];
  const facts = session ? sessionFacts(session) : null;
  const ratings = scoped.filter((s) => s.rating !== null);
  const average = ratings.length
    ? (
        ratings.reduce((sum, s) => sum + (s.rating ?? 0), 0) / ratings.length
      ).toFixed(1)
    : null;
  const label = (s: Session) =>
    `Session ${data.sessions.length - data.sessions.findIndex((item) => item.id === s.id)}`;
  return (
    <main className="results-workspace">
      <header className="results-heading">
        <div>
          <p className="eyebrow">PARTICIPANT EVIDENCE</p>
          <h2>What happened in testing?</h2>
          <p>Outcomes, participant feedback, and the actions behind them.</p>
        </div>
        <div className="results-actions">
          <Button
            variant="outline"
            disabled={refreshing || !loaded}
            onClick={async () => {
              setRefreshing(true);
              setError("");
              try {
                await refresh();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setRefreshing(false);
              }
            }}
          >
            <RotateCcw size={16} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </Button>
          <Button disabled={!loaded} onClick={onCreateTest}>
            <Flag size={16} />
            Set up test
          </Button>
        </div>
      </header>
      {error && <p role="alert">{error}</p>}
      <div className="results-filters">
        <label>
          Design version
          <select
            value={version}
            onChange={(e) => {
              setVersion(e.target.value);
              setSelected("");
            }}
          >
            <option value="all">All versions</option>
            {data.revisions.map((r) => (
              <option key={r.id} value={r.id}>
                Version {r.number}
              </option>
            ))}
          </select>
        </label>
        <label>
          Participant group
          <select
            value={cohort}
            onChange={(e) => {
              setCohort(e.target.value);
              setSelected("");
            }}
          >
            <option value="all">All groups</option>
            {["Teammate", "Business", "Development", "Research", "Pilot"].map(
              (c) => (
                <option key={c}>{c}</option>
              ),
            )}
          </select>
        </label>
        <span>{scoped.length} sessions in scope · Latest 100 available</span>
      </div>
      <div className="outcome-summary">
        <button
          className="outcome-stat success"
          aria-pressed={filter === "complete"}
          onClick={() => setFilter(filter === "complete" ? "all" : "complete")}
        >
          <CheckCircle2 />
          <strong>{complete}</strong>
          <span>Completed</span>
          <small>Reached the task finish</small>
        </button>
        <button
          className="outcome-stat warning"
          aria-pressed={filter === "gave_up"}
          onClick={() => setFilter(filter === "gave_up" ? "all" : "gave_up")}
        >
          <AlertTriangle />
          <strong>{abandoned}</strong>
          <span>Abandoned</span>
          <small>Explicitly ended the test</small>
        </button>
        <button
          className="outcome-stat"
          aria-pressed={filter === "started"}
          onClick={() => setFilter(filter === "started" ? "all" : "started")}
        >
          <Clock />
          <strong>{open}</strong>
          <span>Still open</span>
          <small>No final outcome recorded</small>
        </button>
        <div className="outcome-stat">
          <MessageSquare />
          <strong>{average ? `${average}/5` : "—"}</strong>
          <span>Participant rating</span>
          <small>
            {ratings.length} rated ·{" "}
            {scoped.filter((s) => s.feedback.trim()).length} written responses
          </small>
        </div>
      </div>
      <section className="findings-summary">
        <div>
          <h3>
            {attention.length
              ? `${attention.length} ${attention.length === 1 ? "session needs" : "sessions need"} closer review`
              : scoped.length
                ? "No abandonment or unavailable-control attempts recorded"
                : "No participant evidence in this scope"}
          </h3>
          <p>
            {attention.length
              ? "These sessions identify where to inspect, not why it happened. Review their actions and feedback before drawing a conclusion."
              : "A completed task is not proof of ease of use. Read participant feedback alongside the recorded path."}
          </p>
        </div>
        <Button
          variant="outline"
          disabled={!attention.length}
          onClick={() => {
            setFilter("attention");
            setSelected("");
          }}
        >
          Inspect flagged sessions
          <ArrowRight size={16} />
        </Button>
      </section>
      <div
        className="result-scope-tabs"
        role="group"
        aria-label="Session outcome filter"
      >
        {[
          ["all", "All sessions"],
          ["attention", "Needs review"],
          ["complete", "Completed"],
          ["gave_up", "Abandoned"],
          ["started", "Still open"],
        ].map(([value, name]) => (
          <Button
            key={value}
            variant={filter === value ? "secondary" : "ghost"}
            aria-pressed={filter === value}
            onClick={() => {
              setFilter(value);
              setSelected("");
            }}
          >
            {name}
          </Button>
        ))}
      </div>
      {!visible.length ? (
        <section className="results-no-match">
          <h3>
            {scoped.length
              ? "No sessions match this filter"
              : "No sessions in this scope"}
          </h3>
          <p>Choose another version or group, or run a participant test.</p>
          <Button
            variant="outline"
            onClick={() => {
              setVersion("all");
              setCohort("all");
              setFilter("all");
            }}
          >
            Show all sessions
          </Button>
        </section>
      ) : (
        <div className="results-master-detail">
          <section
            className="result-session-list"
            aria-label="Participant sessions"
          >
            {visible.map((s) => (
              <button
                key={s.id}
                className={`session-select ${session?.id === s.id ? "selected" : ""}`}
                aria-pressed={session?.id === s.id}
                onClick={() => setSelected(s.id)}
              >
                <span className="session-row-title">
                  <strong>{label(s)}</strong>
                  <span className={`outcome-label ${s.outcome}`}>
                    {outcomeLabels[s.outcome]}
                  </span>
                </span>
                <span>
                  {s.testSetup?.audience ?? "Unspecified group"} · v
                  {data.revisions.find((r) => r.id === s.revisionId)?.number ??
                    "?"}{" "}
                  · {s.testSetup?.viewport ?? "Unspecified viewport"}
                </span>
                <strong className="session-finding">
                  {sessionFacts(s).finding}
                </strong>
                <small>
                  {s.feedback
                    ? `“${s.feedback.slice(0, 110)}${s.feedback.length > 110 ? "…" : ""}”`
                    : "No written feedback"}
                </small>
              </button>
            ))}
          </section>
          {session && facts && (
            <article
              className="result-detail"
              aria-label="Selected session findings"
            >
              <header>
                <div>
                  <p className="eyebrow">
                    {label(session)} · VERSION{" "}
                    {data.revisions.find((r) => r.id === session.revisionId)
                      ?.number ?? "?"}
                  </p>
                  <h3>{outcomeLabels[session.outcome]}</h3>
                  <p>{session.testSetup?.title ?? "Document upload test"}</p>
                </div>
                <span className={`outcome-label ${session.outcome}`}>
                  {session.duration === null
                    ? "Duration not recorded"
                    : `${Math.round(session.duration / 1000)} seconds`}
                </span>
              </header>
              <section>
                <h4>Assigned task</h4>
                <p>
                  {session.testSetup?.task ??
                    "Task instructions were not captured for this older session."}
                </p>
                <small>
                  {new Date(session.createdAt).toLocaleString()} · Time includes
                  idle time
                </small>
              </section>
              <section className="participant-voice">
                <h4>What the participant said</h4>
                {session.feedback ? (
                  <blockquote>{session.feedback}</blockquote>
                ) : (
                  <p>No written feedback submitted.</p>
                )}
                <span>
                  {session.rating ? `${session.rating} / 5 stars` : "Not rated"}
                  {session.fuego ? " · Fuego reaction" : ""}
                </span>
              </section>
              <section>
                <h4>What we observed</h4>
                <strong className="finding-headline">{facts.finding}</strong>
                <p>
                  {facts.unavailable.length} unavailable-control attempts ·{" "}
                  {
                    session.interactions.filter(
                      (c) => c.target === "non_action",
                    ).length
                  }{" "}
                  clicks with no action assigned
                </p>
                <ol className="result-path">
                  {session.events.map((e, i) => (
                    <li key={`${i}-${e.type}`}>
                      <span>{i + 1}</span>
                      <strong>
                        {eventLabels[e.type] ?? e.type.replaceAll("_", " ")}
                      </strong>
                      <time>{(e.at / 1000).toFixed(1)}s</time>
                    </li>
                  ))}
                </ol>
                {!session.events.length && <p>No task actions recorded.</p>}
              </section>
              <section className="finding-followup">
                <h4>What to review next</h4>
                <p>{facts.next}</p>
                <Button onClick={() => onReviewEvidence(session)}>
                  Review linked design
                  <ArrowRight size={16} />
                </Button>
              </section>
              <details className="raw-session-details">
                <summary>Detailed clicks and technical evidence</summary>
                <SessionSignals session={session} />
              </details>
            </article>
          )}
        </div>
      )}
      <footer className="results-footer">
        <p>
          Includes designer-run tests after consent. Participant identities are
          not collected. This is a convenience sample, not a usability score.
        </p>
        <Button
          variant="outline"
          disabled={!visible.length}
          onClick={() =>
            download(
              "flow-review-filtered-sessions.json",
              JSON.stringify(visible, null, 2),
            )
          }
        >
          <Download size={16} />
          Export filtered sessions
        </Button>
      </footer>
    </main>
  );
}
