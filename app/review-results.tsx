"use client";
import { useRef, useState } from "react";
import ResultsSummary from "./results-summary";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import LabeledField from "@/components/labeled-field";
import WorkspacePageHeading from "@/components/workspace-page-heading";
import type { Workspace, Session } from "@/lib/model";
import { RotateCcw, ArrowRight, Download } from "lucide-react";
import SessionSignals from "./session-signals";
import { download } from "@/lib/client";
import {
  eventLabels,
  outcomeLabels,
  sessionFacts,
  summarizeResults,
} from "@/lib/results";
import { testAudiences } from "@/lib/test-setup";
export default function ReviewResults({
  data,
  loaded,
  loadError,
  revisionId,
  refresh,
  onReviewEvidence,
}: {
  data: Workspace;
  loaded: boolean;
  loadError?: string;
  revisionId: string;
  refresh: () => Promise<unknown>;
  onReviewEvidence: (session: Session) => void;
}) {
  const [version, setVersion] = useState(revisionId),
    [cohort, setCohort] = useState("all"),
    [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [evidenceIds, setEvidenceIds] = useState<string[] | null>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  function showEvidence(sessions: Session[]) {
    setEvidenceIds(sessions.map((session) => session.id));
    setFilter("all");
    setSelected(sessions[0]?.id ?? "");
    setDetailsOpen(true);
    requestAnimationFrame(() => {
      detailsRef.current?.scrollIntoView({ block: "start" });
      detailsRef.current
        ?.querySelector("summary")
        ?.focus({ preventScroll: true });
    });
  }
  const [refreshing, setRefreshing] = useState(false),
    [error, setError] = useState("");
  const scoped = data.sessions.filter(
    (s) =>
      (version === "all" || s.revisionId === version) &&
      (cohort === "all" || s.testSetup?.audience === cohort),
  );
  const visible = scoped.filter(
    (s) =>
      (!evidenceIds || evidenceIds.includes(s.id)) &&
      (filter === "all" ||
        (filter === "attention"
          ? sessionFacts(s).attention
          : s.outcome === filter)),
  );
  const session = visible.find((s) => s.id === selected) ?? visible[0];
  const facts = session ? sessionFacts(session) : null;
  const label = (s: Session) =>
    `Session ${data.sessions.length - data.sessions.findIndex((item) => item.id === s.id)}`;
  return (
    <main className="results-workspace">
      <WorkspacePageHeading title="Participant outcomes" actions={<>
          <Button
            variant="outline"
            disabled={!loaded || !scoped.length}
            onClick={() => {
              const summary = summarizeResults(scoped);
              const scope =
                version === "all"
                  ? "All versions"
                  : `Version ${data.revisions.find((r) => r.id === version)?.number ?? "unknown"}`;
              download(
                "flow-review-results-summary.md",
                [
                  "# Test results",
                  scope + " / " + (cohort === "all" ? "All groups" : cohort),
                  `${summary.total} sessions from the latest 100 available. Sessions are not unique participants.`,
                  `Completed: ${summary.complete}; abandoned: ${summary.abandoned}; still open: ${summary.open}.`,
                  `Unavailable actions: ${summary.blocked} sessions.`,
                  `Rating: ${summary.average ?? "Not rated"} / 5 (${summary.ratingCount} responses).`,
                  "## Findings",
                  ...summary.findings.map(
                    (finding) =>
                      `### ${finding.title}\n${finding.sessions.length} sessions. ${finding.observation}\nEvidence: ${finding.sessions.map((session) => session.id).join(", ")}`,
                  ),
                  "## Suggested next step",
                  summary.next,
                  "Observations are not proof of cause. A session can appear in multiple findings.",
                ].join("\n\n"),
                "text/markdown",
              );
            }}
          >
            <Download size={16} />
            Export summary
          </Button>
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
      </>} />
      {error && <p role="alert">{error}</p>}
      {!loaded && loadError ? (
        <section className="results-no-match" role="status">
          <h3>Results unavailable</h3>
          <p>{loadError}</p>
        </section>
      ) : (
        <>
      <div className="results-filters">
        <LabeledField label="Design version">
          <NativeSelect
            value={version}
            onChange={(e) => {
              setVersion(e.target.value);
              setEvidenceIds(null);
              setFilter("all");
              setSelected("");
            }}
          >
            <NativeSelectOption value="all">All versions</NativeSelectOption>
            {data.revisions.map((r) => (
              <NativeSelectOption key={r.id} value={r.id}>
                Version {r.number}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </LabeledField>
        <LabeledField label="Participant group">
          <NativeSelect
            value={cohort}
            onChange={(e) => {
              setCohort(e.target.value);
              setEvidenceIds(null);
              setFilter("all");
              setSelected("");
            }}
          >
            <NativeSelectOption value="all">All groups</NativeSelectOption>
            {testAudiences.map((c) => (
              <NativeSelectOption key={c}>{c}</NativeSelectOption>
            ))}
          </NativeSelect>
        </LabeledField>
        <span role="status" aria-live="polite">
          {scoped.length} sessions · Latest 100 available
        </span>
      </div>
      <ResultsSummary
        sessions={scoped}
        loaded={loaded}
        onEvidence={showEvidence}
        onReview={onReviewEvidence}
        sessionLabel={label}
      />
      <details
        className="results-session-disclosure"
        ref={detailsRef}
        open={detailsOpen}
        onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
      >
        <summary>
          <strong>Participant sessions</strong>
          <span>
            {scoped.length} sessions · Timelines, clicks and individual feedback
          </span>
          <span>{detailsOpen ? "Hide details" : "Show details"}</span>
        </summary>
        <div className="results-detail-controls">
          <p role="status">
            {visible.length} of {scoped.length} sessions shown
            {evidenceIds ? " · Selected finding" : ""}
          </p>
          {evidenceIds && (
            <Button
              variant="outline"
              onClick={() => {
                setEvidenceIds(null);
                setFilter("all");
                setSelected("");
              }}
            >
              Clear finding selection
            </Button>
          )}
        </div>
        <div
          className="result-outcome-filter"
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
                setEvidenceIds(null);
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
                setEvidenceIds(null);
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
                <Button variant="bare" size="auto"
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
                    {data.revisions.find((r) => r.id === s.revisionId)
                      ?.number ?? "?"}{" "}
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
                </Button>
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
                    {new Date(session.createdAt).toLocaleString()} · Time
                    includes idle time
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
                    {session.rating
                      ? `${session.rating} / 5 stars`
                      : "Not rated"}
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
            Includes designer-run tests after consent. Participant identities
            are not collected. This is a convenience sample, not a usability
            score.
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
      </details>
      <p className="results-sample-note">
        Sessions are not unique participants. Includes designer-run tests after
        consent; no participant identities are collected.
      </p>
        </>
      )}
    </main>
  );
}
