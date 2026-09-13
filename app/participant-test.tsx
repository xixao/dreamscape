"use client";
import { useRef, useState } from "react";
import { CheckCircle2, Flag, Play, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { request } from "@/lib/client";
import type { Revision, UploadState } from "@/lib/model";
import Uploader from "./uploader";

export default function ParticipantTest({
  token,
  revision,
  onReturn,
}: {
  token: string;
  revision: Revision;
  onReturn?: () => void;
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
          icon: <span className="magic-fire">🔥</span>,
          position: "bottom-center",
        });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="tester-shell">
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {!sessionId ? (
        <main className="consent-screen">
          <span className="badge">PROTOTYPE TEST · v{revision.number}</span>
          <h1>Try a document upload.</h1>
          <p>
            Imagine you are getting a home application ready. Upload the sample
            pay statement, then continue. If you get stuck, try what feels
            natural.
          </p>
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
            <Flag size={18} />
            <p>
              Upload the sample pay statement and continue. You can stop if you
              cannot finish.
            </p>
            <Button
              variant="outline"
              onClick={() =>
                void chain.current
                  .catch(() => undefined)
                  .then(() => act(state, "gave_up"))
              }
            >
              Abandon Test
            </Button>
          </header>
          <main className="tester-product" onClickCapture={capture}>
            <Uploader
              config={revision.config}
              state={state}
              playing={!busy}
              observeDisabled
              onState={(s, e) => void act(s, e)}
            />
          </main>
        </>
      ) : (
        <main className="test-finish tester-feedback">
          <CheckCircle2 size={34} />
          <h1>
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
            <span>{rating ? `${rating} / 5` : "Not rated"}</span>
          </div>
          <Button
            className="tester-fuego"
            variant="outline"
            disabled={busy}
            aria-pressed={fuego}
            onClick={() => void feedback(!fuego)}
          >
            <span aria-hidden="true">🔥</span> Fuego
          </Button>
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
