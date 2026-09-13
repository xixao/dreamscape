"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  GripVertical,
  Plus,
  Route,
  Save,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { request } from "@/lib/client";
import {
  journeySchema,
  moveJourneyStep,
  type Journey,
  type JourneyStep,
  type SavedJourney,
} from "@/lib/journey";
import type { Workspace, Revision, UploadState } from "@/lib/model";
import { demoJourney } from "@/lib/demo/journey";

const linkLabels = {
  none: "Not connected",
  ready: "Uploader · Ready",
  failed: "Uploader · Error",
  complete: "Uploader · Received",
};
export default function JourneyView({
  data,
  revision,
  editable,
  onDirty,
  onReview,
  onTest,
  onResults,
}: {
  data: Workspace;
  revision: Revision;
  editable: boolean;
  onDirty: (dirty: boolean) => void;
  onReview: (state: UploadState) => void;
  onTest: (step: JourneyStep) => void;
  onResults: () => void;
}) {
  const [saved, setSaved] = useState<SavedJourney | null>(null);
  const [draft, setDraft] = useState<Journey>(demoJourney);
  const [selected, setSelected] = useState("demo-recovery");
  const [mode, setMode] = useState("planned");
  const [sessionId, setSessionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const pending = useRef(false);
  const dirty =
    !!saved && JSON.stringify(saved.journey) !== JSON.stringify(draft);
  const disabled = !editable || !saved || busy;
  const step = draft.steps.find((s) => s.id === selected) ?? draft.steps[0];
  const index = draft.steps.findIndex((s) => s.id === step.id);
  const session =
    data.sessions.find((s) => s.id === sessionId) ?? data.sessions[0];
  const comments = data.comments.filter(
    (c) => c.revisionId === revision.id && c.state === step.link && !c.parentId,
  );

  useEffect(() => {
    let active = true;
    request<SavedJourney>("/api/journey")
      .then((value) => {
        if (active) {
          setSaved(value);
          setDraft(value.journey);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    onDirty(dirty || busy);
  }, [dirty, busy, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);

  async function save() {
    if (disabled || pending.current) return;
    const parsed = journeySchema.safeParse(draft);
    if (!parsed.success) {
      setError("Give the journey and every step a title before saving.");
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const value = await request<SavedJourney>("/api/journey", {
        journey: parsed.data,
        version: saved!.version,
      });
      setSaved(value);
      setDraft(value.journey);
      setNotice("Journey saved");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function reload() {
    if (dirty || busy) return;
    setBusy(true);
    setError("");
    try {
      const value = await request<SavedJourney>("/api/journey");
      setSaved(value);
      setDraft(value.journey);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function edit(patch: Partial<JourneyStep>) {
    setDraft((j) => ({
      ...j,
      steps: j.steps.map((s) => (s.id === step.id ? { ...s, ...patch } : s)),
    }));
    setNotice("");
  }
  function move(from: number, to: number) {
    if (disabled) return;
    setDraft((j) => ({ ...j, steps: moveJourneyStep(j.steps, from, to) }));
    setNotice(`Step moved to position ${to + 1}`);
  }
  return (
    <section className="journey-view" aria-label="User journey">
      <header className="journey-heading">
        <div>
          <p className="eyebrow">USER JOURNEY</p>
          <h2>{draft.title || "Untitled journey"}</h2>
          <p>
            {dirty
              ? "Unsaved changes"
              : saved
                ? saved.version
                  ? "Saved journey"
                  : "Sample journey · Not saved yet"
                : "Loading journey..."}
          </p>
        </div>
        <div className="journey-actions">
          <Button
            variant="outline"
            disabled={disabled || draft.steps.length >= 12}
            onClick={() => {
              const id = crypto.randomUUID();
              setDraft((j) => ({
                ...j,
                steps: [
                  ...j.steps,
                  {
                    id,
                    title: "New step",
                    goal: "",
                    action: "",
                    notes: "",
                    link: "none",
                  },
                ],
              }));
              setSelected(id);
              setMode("planned");
            }}
          >
            <Plus size={16} />
            Add step
          </Button>
          <Button
            disabled={disabled || (!!saved?.version && !dirty)}
            onClick={save}
          >
            <Save size={16} />
            {busy ? "Saving..." : "Save journey"}
          </Button>
          {dirty && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setDraft(saved!.journey);
                setError("");
                setNotice("Changes discarded");
              }}
            >
              Discard changes
            </Button>
          )}
        </div>
      </header>
      {error && (
        <div role="alert" className="journey-error">
          {error}{" "}
          {!dirty && (
            <Button variant="outline" disabled={busy} onClick={reload}>
              Reload saved journey
            </Button>
          )}
        </div>
      )}
      <div className="journey-mode" role="group" aria-label="Journey view">
        <Button
          variant={mode === "planned" ? "secondary" : "ghost"}
          aria-pressed={mode === "planned"}
          onClick={() => setMode("planned")}
        >
          Planned journey
        </Button>
        <Button
          variant={mode === "observed" ? "secondary" : "ghost"}
          aria-pressed={mode === "observed"}
          onClick={() => setMode("observed")}
        >
          Recorded test path
        </Button>
        <span role="status">{notice}</span>
      </div>
      {mode === "planned" ? (
        <>
          <ol className="journey-track" aria-label="Journey steps">
            {draft.steps.map((s, i) => (
              <li
                key={s.id}
                className={`journey-step ${s.id === step.id ? "selected" : ""} ${over === s.id ? "drop-target" : ""}`}
                data-journey-step={s.id}
              >
                <div className="journey-step-tools">
                  <span className="journey-number">{i + 1}</span>
                  <button
                    className="journey-grip"
                    disabled={disabled}
                    aria-label={`Drag ${s.title}`}
                    title="Drag to reorder; arrow buttons also move this step"
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      setDragged(s.id);
                    }}
                    onPointerMove={(event) => {
                      if (
                        !event.currentTarget.hasPointerCapture(event.pointerId)
                      )
                        return;
                      const target = document
                        .elementFromPoint(event.clientX, event.clientY)
                        ?.closest("[data-journey-step]")
                        ?.getAttribute("data-journey-step");
                      setOver(target ?? null);
                    }}
                    onPointerUp={(event) => {
                      if (
                        !event.currentTarget.hasPointerCapture(event.pointerId)
                      )
                        return;
                      event.currentTarget.releasePointerCapture(
                        event.pointerId,
                      );
                      const target = document
                        .elementFromPoint(event.clientX, event.clientY)
                        ?.closest("[data-journey-step]")
                        ?.getAttribute("data-journey-step");
                      if (target && dragged)
                        move(
                          draft.steps.findIndex((item) => item.id === dragged),
                          draft.steps.findIndex((item) => item.id === target),
                        );
                      setDragged(null);
                      setOver(null);
                    }}
                    onPointerCancel={() => {
                      setDragged(null);
                      setOver(null);
                    }}
                  >
                    <GripVertical size={18} />
                  </button>
                </div>
                <button
                  className="journey-step-select"
                  onClick={() => setSelected(s.id)}
                  aria-pressed={s.id === step.id}
                >
                  <strong>{s.title || "Untitled step"}</strong>
                  <span>{s.goal || "Goal not defined"}</span>
                  <small>{linkLabels[s.link]}</small>
                </button>
                <div className="journey-step-tools">
                  <button
                    disabled={disabled || i === 0}
                    aria-label={`Move ${s.title} earlier`}
                    title="Move earlier"
                    onClick={() => move(i, i - 1)}
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <button
                    disabled={disabled || i === draft.steps.length - 1}
                    aria-label={`Move ${s.title} later`}
                    title="Move later"
                    onClick={() => move(i, i + 1)}
                  >
                    <ArrowRight size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <div className="journey-detail">
            <section className="journey-editor" aria-label="Edit selected step">
              <div className="journey-section-title">
                <h3>Step {index + 1}</h3>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Delete selected step"
                  title="Delete step"
                  disabled={disabled || draft.steps.length === 1}
                  onClick={() => {
                    setDraft((j) => ({
                      ...j,
                      steps: j.steps.filter((s) => s.id !== step.id),
                    }));
                    setSelected(draft.steps[index === 0 ? 1 : index - 1].id);
                    setNotice(
                      "Step removed from draft. Discard changes to restore it.",
                    );
                  }}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
              <label>
                Journey name
                <input
                  maxLength={100}
                  value={draft.title}
                  disabled={disabled}
                  onChange={(e) =>
                    setDraft((j) => ({ ...j, title: e.target.value }))
                  }
                />
              </label>
              <label>
                Step name
                <input
                  maxLength={80}
                  value={step.title}
                  disabled={disabled}
                  onChange={(e) => edit({ title: e.target.value })}
                />
              </label>
              <label>
                User goal
                <textarea
                  maxLength={250}
                  value={step.goal}
                  disabled={disabled}
                  onChange={(e) => edit({ goal: e.target.value })}
                />
              </label>
              <label>
                Expected action
                <textarea
                  maxLength={250}
                  value={step.action}
                  disabled={disabled}
                  onChange={(e) => edit({ action: e.target.value })}
                />
              </label>
              <label>
                Linked component state
                <select
                  value={step.link}
                  disabled={disabled}
                  onChange={(e) =>
                    edit({ link: e.target.value as JourneyStep["link"] })
                  }
                >
                  {Object.entries(linkLabels).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Open questions / missing states
                <textarea
                  maxLength={300}
                  value={step.notes}
                  disabled={disabled}
                  onChange={(e) => edit({ notes: e.target.value })}
                />
              </label>
            </section>
            <section
              className="journey-context"
              aria-label="Step review context"
            >
              <h3 className="icon-title">
                <Route size={24} aria-hidden="true" />
                <span>{linkLabels[step.link]}</span>
              </h3>
              {step.link === "none" ? (
                <p>No prototype is connected to this step.</p>
              ) : (
                <>
                  <p>
                    Document uploader · v{revision.number}
                    {" · "}
                    {comments.length} review comments in this state
                  </p>
                  <div className="journey-actions">
                    <Button onClick={() => onReview(step.link as UploadState)}>
                      Review step
                      <ArrowRight size={16} />
                    </Button>
                    <Button
                      variant="outline"
                      disabled={
                        !editable ||
                        (step.link === "failed" &&
                          !revision.config.retryEnabled)
                      }
                      onClick={() => onTest(step)}
                    >
                      Set up step test
                    </Button>
                  </div>
                  {step.link === "failed" && !revision.config.retryEnabled && (
                    <p>
                      Save a version with Retry enabled before testing recovery.
                    </p>
                  )}
                  <h4>Feedback on this state</h4>
                  {comments.length ? (
                    comments.slice(-3).map((c) => (
                      <blockquote key={c.id}>
                        <strong>{c.author}</strong>
                        <p>{c.text}</p>
                      </blockquote>
                    ))
                  ) : (
                    <p>No review comments on this state yet.</p>
                  )}
                </>
              )}
              <h4>Open questions</h4>
              <p>{step.notes || "No questions recorded."}</p>
              <p className="muted">
                Connections use the selected saved version. Only the document
                uploader is instrumented; other journey steps are planning
                context.
              </p>
            </section>
          </div>
        </>
      ) : (
        <section className="journey-observed">
          <h3>Recorded actions, not inferred intent</h3>
          <p>
            These tests cover the uploader only, not the entire planned journey.
          </p>
          {session ? (
            <>
              <label>
                Test session
                <select
                  value={session.id}
                  onChange={(e) => setSessionId(e.target.value)}
                >
                  {data.sessions.map((s, i) => (
                    <option key={s.id} value={s.id}>
                      Session {data.sessions.length - i} ·{" "}
                      {s.testSetup?.title || "Upload test"} · {s.outcome}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                Version{" "}
                {data.revisions.find((r) => r.id === session.revisionId)
                  ?.number ?? "unavailable"}{" "}
                ·{" "}
                {session.outcome === "started"
                  ? "Still open"
                  : session.outcome === "complete"
                    ? "Completed"
                    : "Abandoned"}
              </p>
              <ol className="journey-event-list">
                {session.events.length ? (
                  session.events.map((event, i) => (
                    <li key={`${i}-${event.type}`}>
                      <span>{i + 1}</span>
                      <strong>{event.type.replaceAll("_", " ")}</strong>
                      <small>{Math.round(event.at / 1000)} s</small>
                    </li>
                  ))
                ) : (
                  <li>No task actions recorded.</li>
                )}
              </ol>
              <p>{session.interactions.length} recorded prototype clicks</p>
              {session.feedback && <blockquote>{session.feedback}</blockquote>}
              <Button variant="outline" onClick={onResults}>
                Open test results
                <ArrowRight size={16} />
              </Button>
            </>
          ) : (
            <p>
              No test sessions yet. Set up and run a test on a connected step.
            </p>
          )}
        </section>
      )}
    </section>
  );
}
