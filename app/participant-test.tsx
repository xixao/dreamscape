"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Flag, Play, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { request } from "@/lib/client";
import type { Revision, UploadState } from "@/lib/model";
import Uploader from "@/app/demo/document-upload";
import { defaultTestSetup } from "@/lib/demo/test-setup";
import { type TestSetup } from "@/lib/test-setup";

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
  const [state, setState] = useState<UploadState>("ready"),
    [outcome, setOutcome] = useState("started");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [comment, setComment] = useState(""),
    [rating, setRating] = useState<number | null>(null),
    [fuego, setFuego] = useState(false),
    [saved, setSaved] = useState(false);
  const started = useRef(0),
    pending = useRef(false),
    chain = useRef<Promise<unknown>>(Promise.resolve());
  const path = `/api/share/${token}`;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [sessionId, outcome]);
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
      started.current = performance.now();
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
      at: Math.round(performance.now() - started.current),
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
      if (nextFuego && !fuego)
        toast("Fuego", {
          className: "fuego-toast",
          icon: <span className="magic-fire">🔥</span>,
          position: "bottom-center",
        });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
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
      {!sessionId ? (
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
                Your task
              </h1>
              <p id="active-test-task">{settings.task}</p>
              <details className="tester-instructions" open>
                <summary>Test instructions</summary>
                <p className="test-instructions">{settings.instructions}</p>
              </details>
            </div>
            <div className="tester-task-actions">
              {state === "complete" && (
                <Button
                  disabled={busy}
                  onClick={() => void act(state, "continue")}
                >
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
              <Uploader
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
          <CheckCircle2 size={34} />
          <h1 ref={heading} tabIndex={-1}>
            {outcome === "complete"
              ? "Test complete. Thank you!"
              : "Test abandoned. Thank you for trying."}
          </h1>
          <p>Your progress has been recorded. How was the experience?</p>
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
              onClick={() => void feedback(!fuego)}
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
