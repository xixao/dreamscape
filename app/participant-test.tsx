"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Flag, Play, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { request } from "@/lib/client";
import type { Revision, UploadState } from "@/lib/model";
import DocumentUploader from "@/app/demo/document-uploader";
import { defaultTestSetup } from "@/lib/demo/test-setup";
import { type TestSetup } from "@/lib/test-setup";

function storedSession(key: string) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function rememberSession(key: string, id: string) {
  try { window.localStorage.setItem(key, id); } catch { /* Session still works until this page closes. */ }
}
function forgetSession(key: string) {
  try { window.localStorage.removeItem(key); } catch { /* Storage may be disabled. */ }
}

export default function ParticipantTest({
  token,
  revision,
  onReturn,
  setup,
}: {
  token: string;
  revision: Pick<Revision, "id" | "number" | "config">;
  onReturn?: () => void;
  setup?: TestSetup;
}) {
  const [consent, setConsent] = useState(false),
    [sessionId, setSessionId] = useState("");
  const [restoring, setRestoring] = useState(true);
  const [state, setState] = useState<UploadState>("ready"),
    [outcome, setOutcome] = useState("started");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [comment, setComment] = useState(""),
    [rating, setRating] = useState<number | null>(null),
    [fuego, setFuego] = useState(false),
    [saved, setSaved] = useState(false),
    [closed, setClosed] = useState(false);
  const started = useRef(0),
    pending = useRef(false),
    chain = useRef<Promise<unknown>>(Promise.resolve());
  const path = `/api/share/${token}`;
  const sessionKey = `flow-review:participant:${token}`;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [sessionId, outcome, restoring]);
  useEffect(() => {
    let active = true;
    const id = storedSession(sessionKey);
    if (!id) {
      queueMicrotask(() => { if (active) setRestoring(false); });
      return () => { active = false; };
    }
    void request<{
      id: string;
      outcome: string;
      events: { type: string }[];
      createdAt: string;
      feedback: string;
      rating: number | null;
      fuego: boolean;
    }>(path, { action: "resume", sessionId: id }).then((session) => {
      if (!active) return;
      const last = session.events.at(-1)?.type;
      setSessionId(session.id);
      setOutcome(session.outcome);
      setState(last === "upload_attempt" ? "failed" : last === "upload_success" || last === "retry_success" || last === "continue" ? "complete" : "ready");
      started.current = new Date(session.createdAt).getTime();
      setComment(session.feedback);
      setRating(session.rating);
      setFuego(session.fuego);
      setSaved(!!(session.feedback || session.rating || session.fuego));
    }).catch(() => {
      if (!active) return;
      forgetSession(sessionKey);
      setError("Your previous test could not be resumed. You may start a new one.");
    }).finally(() => {
      if (active) setRestoring(false);
    });
    return () => { active = false; };
  }, [path, sessionKey]);
  const settings = setup ?? {
    ...defaultTestSetup,
    scenario: revision.config.retryEnabled ? "recovery" : "success",
  };
  function enqueue<T>(payload: Record<string, unknown>): Promise<T> {
    const next = chain.current
      .catch(() => undefined)
      .then(() => request<T>(path, payload));
    chain.current = next;
    return next;
  }
  async function begin() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const r = await request<{ id: string }>(path, {
        action: "start",
        consent,
      });
      setSessionId(r.id);
      rememberSession(sessionKey, r.id);
      started.current = Date.now();
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function capture(e: React.MouseEvent<HTMLDivElement>) {
    if (!sessionId || outcome !== "started") return;
    const target = (e.target as Element).closest<HTMLElement>(
      "[data-test-action]",
    );
    const interaction = {
      id: crypto.randomUUID(),
      target: target?.dataset.testAction ?? "non_action",
      state,
      available:
        !!target &&
        target.getAttribute("aria-disabled") !== "true" &&
        !pending.current,
      at: Math.min(86400000, Math.max(0, Math.round(Date.now() - started.current))),
    };
    void enqueue({ action: "interaction", sessionId, interaction }).catch(() =>
      setError(
        "Some interaction details could not be saved. You can still finish or abandon the test.",
      ),
    );
  }
  async function act(next: UploadState, event: string) {
    if (pending.current || outcome !== "started") return;
    pending.current = true;
    setBusy(true);
    try {
      const result = await enqueue<{ outcome: string }>({
        action: "event",
        sessionId,
        event,
      });
      setState(next);
      setOutcome(result.outcome);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function feedback(nextFuego = fuego) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await enqueue({
        action: "feedback",
        sessionId,
        feedback: comment,
        rating,
        fuego: nextFuego,
      });
      setSaved(true);
      setFuego(nextFuego);
      forgetSession(sessionKey);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function finishWithoutFeedback() {
    forgetSession(sessionKey);
    setClosed(true);
  }
  return (
    <div
      className={`tester-shell ${!sessionId || outcome !== "started" ? "test-centered" : "test-active"}`}
    >
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {restoring ? (
        <main className="consent-screen"><h1>Opening your test…</h1></main>
      ) : !sessionId ? (
        <main className="consent-screen">
          <span className="badge">
            {settings.audience} TEST · v{revision.number}
          </span>
          <h1 ref={heading} tabIndex={-1}>
            {settings.title}
          </h1>
          <p className="test-instructions">{settings.instructions}</p>
          <div className="consent-details">
            <h2>Before you begin</h2>
            <p>
              This is a fictional prototype. Do not provide real documents or
              personal information.
            </p>
            <p>
              We record clicks inside the prototype, unavailable controls,
              repeated attempts, task progress, elapsed time, and feedback you
              submit. We do not record your screen, camera, microphone, or
              keystrokes.
            </p>
            <p>
              You may abandon the test at any time. Your progress and feedback
              are available to the designer.
            </p>
          </div>
          <label className="consent-check">
            <Checkbox
              checked={consent}
              onCheckedChange={(v) => setConsent(v === true)}
            />
            <span>
              I agree to this test and the information recorded above.
            </span>
          </label>
          <Button disabled={!consent || busy} onClick={() => void begin()}>
            <Play size={16} />
            {busy ? "Starting…" : "Begin test"}
          </Button>
          {onReturn && (
            <Button variant="ghost" onClick={onReturn}>
              Back to designer
            </Button>
          )}
        </main>
      ) : outcome === "started" ? (
        <>
          <header className="tester-task">
            <Flag size={18} aria-hidden="true" />
            <div className="tester-task-copy">
              <h1 ref={heading} tabIndex={-1}>
                Participant test · Your task
              </h1>
              <p id="active-test-task">{settings.task}</p>
              <details className="tester-instructions" open>
                <summary>Test instructions</summary>
                <p className="test-instructions">{settings.instructions}</p>
              </details>
            </div>
            <div className="tester-task-actions">
              {settings.focus === "component" && state === "complete" && (
                <Button disabled={busy} onClick={() => void act(state, "continue")}>
                  Complete Test
                </Button>
              )}
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void act(state, "gave_up")}
              >
                Abandon Test
              </Button>
            </div>
          </header>
          <main
            className="tester-stage"
            aria-label="Test prototype"
            aria-describedby="active-test-task"
          >
            <div
              className={`tester-product ${settings.viewport === "mobile" ? "tester-mobile" : ""}`}
              onClickCapture={capture}
            >
              <DocumentUploader
                config={revision.config}
                state={state}
                playing={!busy}
                observeDisabled
                focus={settings.focus}
                compact={settings.viewport === "mobile"}
                simulateFailure={settings.scenario === "recovery"}
                onState={(s, e) => void act(s, e)}
              />
            </div>
          </main>
        </>
      ) : (
        <main className="test-finish tester-feedback">
          <h1 ref={heading} tabIndex={-1} className="icon-title">
            <CheckCircle2 size={28} aria-hidden="true" />
            <span>
              {outcome === "complete"
                ? "Test complete. Thank you!"
                : "Test abandoned. Thank you for trying."}
            </span>
          </h1>
          <p>{closed ? "Your progress has been recorded." : "Your progress has been recorded. How was the experience?"}</p>
          {!closed && <>
          <div
            className="tester-stars"
            role="group"
            aria-label="Rate your experience"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <Button
                key={n}
                variant="ghost"
                size="icon"
                title={`${n} star${n === 1 ? "" : "s"}`}
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                aria-pressed={rating === n}
                disabled={busy}
                onClick={() => {
                  setRating(n);
                  setSaved(false);
                }}
              >
                <Star
                  size={25}
                  fill={rating && n <= rating ? "currentColor" : "none"}
                />
              </Button>
            ))}
            <Button
              className="tester-fuego"
              variant="ghost"
              size="icon"
              title="Fuego"
              aria-label="Fuego"
              disabled={busy}
              aria-pressed={fuego}
              onClick={() => {
                const next = !fuego;
                setFuego(next);
                setSaved(false);
                if (next) toast("Fuego", {
                  className: "fuego-toast",
                  icon: <span className="magic-fire">🔥</span>,
                  position: "bottom-center",
                  duration: 1800,
                });
              }}
            >
              <span aria-hidden="true">🔥</span>
            </Button>
            <span>{rating ? `${rating} / 5` : "Not rated"}</span>
          </div>
          <label htmlFor="participant-comment">
            What worked, or what got in your way?
          </label>
          <Textarea
            id="participant-comment"
            maxLength={1500}
            value={comment}
            onChange={(e) => {
              setComment(e.target.value);
              setSaved(false);
            }}
            placeholder="Optional comment. Leave out personal information."
            disabled={busy}
          />
          <Button
            disabled={busy || saved || (!comment.trim() && !rating && !fuego)}
            onClick={() => void feedback()}
          >
            {saved ? "Feedback saved" : "Send feedback"}
          </Button>
          {saved && (
            <p role="status">Thank you. Your feedback is with the designer.</p>
          )}
          {!saved && <Button variant="ghost" disabled={busy} onClick={finishWithoutFeedback}>Finish without feedback</Button>}
          </>}
          {onReturn ? (
            <Button variant="ghost" onClick={onReturn}>
              View results as designer
            </Button>
          ) : (
            <p>You can close this page whenever you are ready.</p>
          )}
        </main>
      )}
    </div>
  );
}
