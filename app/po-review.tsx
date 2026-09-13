"use client";
import { useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  MessageSquare,
  MonitorPlay,
  Moon,
  Play,
  RotateCcw,
  Sun,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Comment, Revision, Session, UploadState } from "@/lib/model";
import { sessionFacts } from "@/lib/results";
import Uploader from "./demo/document-upload";
import Feedback from "./feedback";

const sections = ["Update", "Experience", "Findings", "Decisions"] as const;
const states: UploadState[] = ["ready", "failed", "complete"];
const stateNames = {
  ready: "Before upload",
  failed: "Upload interrupted",
  complete: "Document received",
};

export default function POReview({
  revision,
  previous,
  sessions,
  comments,
  busy,
  error,
  onAction,
  onBack,
  dark,
  onTheme,
}: {
  revision: Revision;
  previous?: Revision;
  sessions?: Session[];
  comments: Comment[];
  busy: boolean;
  error?: string;
  onAction: (payload: Record<string, unknown>) => Promise<boolean>;
  onBack?: () => void;
  dark?: boolean;
  onTheme?: () => void;
}) {
  const [section, setSection] = useState(0),
    [presenting, setPresenting] = useState(false);
  const [discussion, setDiscussion] = useState(false),
    [state, setState] = useState<UploadState>("ready");
  const [anchor, setAnchor] = useState("document-uploader"),
    [completed, setCompleted] = useState(false);
  const [decision, setDecision] = useState("Request changes"),
    [reason, setReason] = useState("");
  const [owner, setOwner] = useState(""),
    [nextStep, setNextStep] = useState(""),
    [saved, setSaved] = useState("");
  const sending = useRef(false),
    heading = useRef<HTMLHeadingElement>(null);
  const content = useRef<HTMLElement>(null);
  const scoped = sessions?.filter((s) => s.revisionId === revision.id);
  const finished = scoped?.filter((s) => s.outcome === "complete").length ?? 0;
  const abandoned = scoped?.filter((s) => s.outcome === "gave_up").length ?? 0;
  const open = scoped?.filter((s) => s.outcome === "started").length ?? 0;
  const flagged = scoped?.filter((s) => sessionFacts(s).attention) ?? [];
  const quotes = scoped?.filter((s) => s.feedback.trim()) ?? [];
  const unresolved = comments.filter(
    (c) => c.revisionId === revision.id && !c.parentId && !c.resolved,
  );
  const changes = previous
    ? (
        [
          "title",
          "helper",
          "error",
          "button",
          "retryEnabled",
          "announceError",
        ] as const
      ).filter((k) => previous.config[k] !== revision.config[k])
    : [];
  const names = {
    title: "Upload heading",
    helper: "Document instructions",
    error: "Recovery message",
    button: "Upload action",
    retryEnabled: "Retry action",
    announceError: "Error announcement",
  };
  function navigate(index: number) {
    setSection(index);
    requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      content.current?.scrollTo({ top: 0 });
    });
  }
  function showState(next: UploadState) {
    setState(next);
    setCompleted(false);
  }
  return (
    <div
      className={`po-review ${presenting ? "po-presenting" : ""}`}
      onKeyDown={(e) => {
        if (e.key === "Escape" && presenting) {
          setPresenting(false);
          return;
        }
        if (
          !presenting ||
          (e.target as HTMLElement).closest(
            "input,textarea,select,button,[contenteditable=true]",
          )
        )
          return;
        if (e.key === "ArrowRight" && section < 3) {
          e.preventDefault();
          navigate(section + 1);
        }
        if (e.key === "ArrowLeft" && section > 0) {
          e.preventDefault();
          navigate(section - 1);
        }
      }}
    >
      <header className="po-header">
        <div className="po-context">
          {onBack && !presenting && (
            <Button variant="ghost" onClick={onBack}>
              <ArrowLeft />
              Designer review
            </Button>
          )}
          <span>Homepath / Document upload</span>
          <strong>Update & decisions</strong>
          <span className="badge">Saved v{revision.number}</span>
        </div>
        <div className="po-actions">
          {onTheme && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={dark ? "Use light mode" : "Use dark mode"}
              onClick={onTheme}
            >
              {dark ? <Sun /> : <Moon />}
            </Button>
          )}
          <Button
            variant="outline"
            aria-pressed={discussion}
            onClick={() => setDiscussion(!discussion)}
          >
            <MessageSquare />
            Discussion ({unresolved.length})
          </Button>
          <Button
            variant={presenting ? "outline" : "default"}
            onClick={() => {
              setPresenting(!presenting);
              setDiscussion(false);
            }}
          >
            {presenting ? <X /> : <MonitorPlay />}
            {presenting ? "Exit presentation" : "Present update"}
          </Button>
        </div>
      </header>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      <nav className="po-navigation" aria-label="Product update sections">
        {sections.map((label, i) => (
          <button
            key={label}
            aria-current={section === i ? "step" : undefined}
            onClick={() => navigate(i)}
          >
            <span>{i + 1}</span>
            {label}
          </button>
        ))}
      </nav>
      <div className={`po-layout ${discussion ? "with-discussion" : ""}`}>
        <main ref={content} className="po-content">
          <div className="po-section-title">
            <p className="eyebrow">Product owner update · {section + 1} of 4</p>
            <h1 ref={heading} tabIndex={-1}>
              {
                [
                  "What changed, and what needs a decision?",
                  "Walk through the experience",
                  "What did testing show?",
                  "Record the decision and next step",
                ][section]
              }
            </h1>
          </div>
          {section === 0 && (
            <>
              <section className="po-update-note">
                <h2>Version update</h2>
                <p>
                  {previous
                    ? changes.length
                      ? `Updated: ${changes.map((k) => names[k].toLowerCase()).join(", ")}.`
                      : "No component configuration changes since the previous version."
                    : "Document upload: a saved experience ready for review."}
                </p>
                <small>
                  Saved with version {revision.number} ·{" "}
                  {new Date(revision.createdAt).toLocaleDateString()}
                </small>
                <details className="po-saved-note">
                  <summary>Saved designer note</summary>
                  <p>
                    {revision.note ||
                      "No update note was supplied for this version."}
                  </p>
                </details>
              </section>
              <div className="po-summary-columns">
                <section>
                  <h2>What changed</h2>
                  {previous ? (
                    <>
                      <p>Compared with saved version {previous.number}.</p>
                      {changes.length ? (
                        <ul className="po-changes">
                          {changes.map((k) => (
                            <li key={k}>
                              <strong>{names[k]}</strong>
                              <del>
                                {typeof previous.config[k] === "boolean"
                                  ? previous.config[k]
                                    ? "Enabled"
                                    : "Not enabled"
                                  : previous.config[k]}
                              </del>
                              <span>
                                {typeof revision.config[k] === "boolean"
                                  ? revision.config[k]
                                    ? "Enabled"
                                    : "Not enabled"
                                  : revision.config[k]}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>
                          No component configuration changes between these
                          versions.
                        </p>
                      )}
                    </>
                  ) : (
                    <p>
                      No earlier version is available in this view. Review this
                      version as the baseline; no before-and-after claim is
                      being made.
                    </p>
                  )}
                </section>
                <section>
                  <h2>Decision requested</h2>
                  <p>
                    Is this upload experience ready for another participant
                    test, or what needs to change first?
                  </p>
                  <p className="po-disclosure">
                    Review question: agree on the next step using this
                    version&apos;s changes and evidence.
                  </p>
                  <Button onClick={() => navigate(3)}>
                    Go to decision
                    <ArrowRight />
                  </Button>
                  <h3>Evidence available</h3>
                  <p>
                    {scoped
                      ? `${scoped.length} participant sessions for this version.`
                      : "Participant results are not included in this shared link."}{" "}
                    {unresolved.length} unresolved review{" "}
                    {unresolved.length === 1 ? "comment" : "comments"}.
                  </p>
                </section>
              </div>
            </>
          )}
          {section === 1 && (
            <>
              <p className="po-intro">
                Can someone provide their document, recover from an
                interruption, and understand what happens next?
              </p>
              <div className="po-prototype-controls">
                <div className="po-actions">
                  <Button
                    variant="outline"
                    aria-label="Previous design state"
                    disabled={state === "ready"}
                    onClick={() => showState(states[states.indexOf(state) - 1])}
                  >
                    <ArrowLeft />
                  </Button>
                  <strong aria-live="polite">{stateNames[state]}</strong>
                  <Button
                    variant="outline"
                    aria-label="Next design state"
                    disabled={state === "complete"}
                    onClick={() => showState(states[states.indexOf(state) + 1])}
                  >
                    <ArrowRight />
                  </Button>
                </div>
                <Button variant="outline" onClick={() => showState("ready")}>
                  <Play />
                  Play from start
                </Button>
              </div>
              <div className="po-prototype">
                <Uploader
                  config={revision.config}
                  state={state}
                  onState={(next, event) => {
                    setState(next);
                    if (event === "continue") setCompleted(true);
                  }}
                  annotate={discussion}
                  onAnchor={(a) => {
                    setAnchor(a);
                    setDiscussion(true);
                  }}
                />
              </div>
              {completed && (
                <p className="po-complete" role="status">
                  <CheckCircle2 />
                  Walkthrough complete. No participant test was recorded.
                  <Button variant="ghost" onClick={() => showState("ready")}>
                    <RotateCcw />
                    Restart
                  </Button>
                </p>
              )}
              <p className="po-disclosure">
                Version {revision.number} walkthrough · Participant outcomes are
                reported separately in Findings.
              </p>
            </>
          )}
          {section === 2 && (
            <>
              {scoped ? (
                <>
                  <div className="po-outcomes">
                    <div>
                      <strong>{finished}</strong>
                      <span>Completed</span>
                    </div>
                    <div>
                      <strong>{abandoned}</strong>
                      <span>Abandoned</span>
                    </div>
                    <div>
                      <strong>{open}</strong>
                      <span>Still open</span>
                    </div>
                  </div>
                  <p className="po-disclosure">
                    {scoped.length} sessions on v{revision.number} from the
                    latest 100 available. Includes designer-run tests after
                    consent. Open sessions are not counted as failures.
                  </p>
                  <section>
                    <h2>Observations worth discussing</h2>
                    {flagged.length ? (
                      <ul className="po-findings">
                        {flagged.map((s, i) => (
                          <li key={s.id}>
                            <strong>
                              {s.testSetup?.audience ?? "Participant"} session{" "}
                              {i + 1}
                            </strong>
                            <p>{sessionFacts(s).finding}</p>
                            <small>
                              {s.testSetup?.task ??
                                "No task instructions captured"}
                            </small>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>
                        {scoped.length
                          ? "No abandonment or unavailable-control attempts were recorded. Completion alone does not establish ease of use."
                          : "No tests are recorded for this version yet."}
                      </p>
                    )}
                  </section>
                  <section>
                    <h2>Participant voices</h2>
                    {quotes.length ? (
                      quotes.map((s) => (
                        <blockquote className="po-quote" key={s.id}>
                          <p>{s.feedback}</p>
                          <cite>
                            {s.testSetup?.audience ?? "Participant"} ·{" "}
                            {s.rating ? `${s.rating}/5 stars` : "Not rated"}
                          </cite>
                        </blockquote>
                      ))
                    ) : (
                      <p>No written participant feedback for this version.</p>
                    )}
                  </section>
                </>
              ) : (
                <section>
                  <h2>Results are not included in this link</h2>
                  <p>
                    This shared view contains the saved design and review
                    discussion. Ask the designer to present the version&apos;s
                    participant findings; no results are inferred here.
                  </p>
                </section>
              )}
              <p className="po-disclosure">
                Observations are not proof of cause, improvement, accessibility,
                or production readiness.
              </p>
            </>
          )}
          {section === 3 && (
            <div className="po-summary-columns">
              <section>
                <h2>What do you recommend?</h2>
                <form
                  className="po-decision-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (
                      sending.current ||
                      busy ||
                      !reason.trim() ||
                      !owner.trim() ||
                      !nextStep.trim()
                    )
                      return;
                    sending.current = true;
                    setSaved("");
                    try {
                      const ok = await onAction({
                        action: "comment",
                        revisionId: revision.id,
                        state,
                        viewport: "desktop",
                        anchor: "document-uploader",
                        parentId: null,
                        text: `PO decision: ${decision}\nRationale: ${reason.trim()}\nOwner: ${owner.trim()}\nNext step: ${nextStep.trim()}`,
                      });
                      if (ok) {
                        setSaved(
                          "Decision saved to this version's discussion.",
                        );
                        setReason("");
                        setNextStep("");
                      }
                    } finally {
                      sending.current = false;
                    }
                  }}
                >
                  <label>
                    Decision
                    <select
                      value={decision}
                      onChange={(e) => setDecision(e.target.value)}
                      disabled={busy}
                    >
                      <option>Request changes</option>
                      <option>Ready for another test</option>
                      <option>Needs clarification</option>
                    </select>
                  </label>
                  <label>
                    Rationale
                    <textarea
                      required
                      maxLength={700}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                  <label>
                    Owner
                    <input
                      required
                      maxLength={100}
                      value={owner}
                      onChange={(e) => setOwner(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                  <label>
                    Next step
                    <textarea
                      required
                      maxLength={400}
                      value={nextStep}
                      onChange={(e) => setNextStep(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                  <Button type="submit" disabled={busy}>
                    {busy ? "Saving..." : "Record decision"}
                    <CheckCircle2 />
                  </Button>
                  <p role="status">{saved}</p>
                </form>
              </section>
              <section>
                <h2>Discussion & follow-through</h2>
                <p>
                  {unresolved.length} unresolved review{" "}
                  {unresolved.length === 1 ? "comment" : "comments"} on this
                  version.
                </p>
                <p>
                  Decisions are saved with rationale, an owner, and a next step
                  in the version discussion. They do not change the prototype or
                  mark it production-ready.
                </p>
                <Button variant="outline" onClick={() => setDiscussion(true)}>
                  <MessageSquare />
                  Open discussion
                </Button>
                <h3>Before closing the review</h3>
                <ul>
                  <li>Agree what needs to change.</li>
                  <li>Name who will follow up.</li>
                  <li>Define what the next test should establish.</li>
                </ul>
              </section>
            </div>
          )}
          <footer className="po-section-footer">
            <Button
              variant="outline"
              disabled={section === 0}
              onClick={() => navigate(section - 1)}
            >
              <ArrowLeft />
              Previous
            </Button>
            <span>
              {sections[section]} · {section + 1}/4
            </span>
            <Button
              disabled={section === 3}
              onClick={() => navigate(section + 1)}
            >
              Next
              <ArrowRight />
            </Button>
          </footer>
        </main>
        {discussion && (
          <aside className="po-discussion" aria-label="Version discussion">
            <div className="po-discussion-heading">
              <strong>Version {revision.number} discussion</strong>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close discussion"
                onClick={() => setDiscussion(false)}
              >
                <X />
              </Button>
            </div>
            <Feedback
              comments={comments}
              revision={revision}
              state={state}
              viewport="desktop"
              anchor={anchor}
              onAction={onAction}
              busy={busy}
              canModerate={false}
              onJump={(c) => {
                setAnchor(c.anchor);
                showState(c.state);
                navigate(1);
              }}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
