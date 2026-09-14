"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Plus,
  Route,
  Save,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import LabeledField from "@/components/labeled-field";
import WorkspacePageHeading from "@/components/workspace-page-heading";
import JourneyCanvas from "./journey-canvas";
import { request } from "@/lib/client";
import {
  journeySchema,
  moveJourneyStep,
  type Journey,
  type JourneyStep,
  type JourneyPosition,
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
      <WorkspacePageHeading
        title={draft.title || "Untitled journey"}
        detail={dirty
          ? "Unsaved changes"
          : saved
            ? saved.version
              ? "Saved journey"
              : "Sample journey · Not saved yet"
            : "Loading journey..."}
        actions={<>
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
        </>}
      />
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
          <div className="journey-workspace">
            <div className="journey-map-column">
          <div className="journey-layout-controls" role="group" aria-label="Journey layout">
            <span>Layout</span>
            <Button variant={draft.layout === "manual" ? "secondary" : "ghost"} size="sm" aria-pressed={draft.layout === "manual"} onClick={() => setDraft((journey) => ({ ...journey, layout: "manual" }))}>Manual</Button>
            <Button
              variant={draft.layout !== "manual" ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={draft.layout !== "manual"}
              onClick={() => {
                setDraft((journey) => {
                  const next = { ...journey };
                  delete next.layout;
                  next.steps = journey.steps.map((item) => {
                    const step = { ...item };
                    delete step.position;
                    return step;
                  });
                  return next;
                });
                setNotice("Journey auto synced");
              }}
            >
              Auto sync
            </Button>
          </div>
          <JourneyCanvas
            steps={draft.steps}
            selected={step.id}
            layout={draft.layout === "manual" ? "manual" : "auto"}
            disabled={disabled}
            onSelect={setSelected}
            onReorder={move}
            onPositionChange={(id, position: JourneyPosition, autoPositions) => {
              setDraft((journey) => ({
                ...journey,
                layout: "manual",
                steps: journey.steps.map((item) => ({
                  ...item,
                  position: item.id === id ? position : item.position ?? autoPositions[item.id],
                })),
              }));
              setNotice("");
            }}
            onMoveEnd={() => setNotice("Step position updated")}
          />
            </div>
          <div className="journey-detail">
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
            <section className="journey-editor" aria-label="Edit selected step">
              <LabeledField label="Journey name">
                <Input
                  maxLength={100}
                  value={draft.title}
                  disabled={disabled}
                  onChange={(e) =>
                    setDraft((j) => ({ ...j, title: e.target.value }))
                  }
                />
              </LabeledField>
              <LabeledField label="Step name">
                <Input
                  maxLength={80}
                  value={step.title}
                  disabled={disabled}
                  onChange={(e) => edit({ title: e.target.value })}
                />
              </LabeledField>
              <LabeledField label="User goal">
                <Textarea
                  maxLength={250}
                  value={step.goal}
                  disabled={disabled}
                  onChange={(e) => edit({ goal: e.target.value })}
                />
              </LabeledField>
              <LabeledField label="Expected action">
                <Textarea
                  maxLength={250}
                  value={step.action}
                  disabled={disabled}
                  onChange={(e) => edit({ action: e.target.value })}
                />
              </LabeledField>
              <LabeledField label="Linked component state">
                <NativeSelect
                  value={step.link}
                  disabled={disabled}
                  onChange={(e) =>
                    edit({ link: e.target.value as JourneyStep["link"] })
                  }
                >
                  {Object.entries(linkLabels).map(([value, label]) => (
                    <NativeSelectOption value={value} key={value}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </LabeledField>
              <LabeledField label="Open questions / missing states">
                <Textarea
                  maxLength={300}
                  value={step.notes}
                  disabled={disabled}
                  onChange={(e) => edit({ notes: e.target.value })}
                />
              </LabeledField>
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
                  <div className="journey-actions action-group">
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
              <LabeledField label="Test session">
                <NativeSelect
                  value={session.id}
                  onChange={(e) => setSessionId(e.target.value)}
                >
                  {data.sessions.map((s, i) => (
                    <NativeSelectOption key={s.id} value={s.id}>
                      Session {data.sessions.length - i} ·{" "}
                      {s.testSetup?.title || "Upload test"} · {s.outcome}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </LabeledField>
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
