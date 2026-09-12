"use client";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Flag, Layers3, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import type { Comment, Revision, UploadState } from "@/lib/model";
import { request } from "@/lib/client";
import Uploader from "@/app/uploader";
import Feedback from "@/app/feedback";

type SharedData = {
  audience: "po" | "participant";
  revision: Revision;
  comments?: Comment[];
};
export default function SharedReview({ token }: { token: string }) {
  const [data, setData] = useState<SharedData | null>(null);
  const [state, setState] = useState<UploadState>("ready");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [outcome, setOutcome] = useState("started");
  const [feedback, setFeedback] = useState("");
  const [saved, setSaved] = useState(false);
  const [anchor, setAnchor] = useState("document-uploader");
  const actor = useRef("");
  const path = `/api/share/${token}`;
  async function load() {
    try {
      setData(await request<SharedData>(`${path}?actor=${actor.current}`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    actor.current = crypto.randomUUID();
    void load();
  }, [token]);
  async function reviewAction(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      await request(path, { ...payload, actor: actor.current });
      await load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    setBusy(true);
    try {
      const r = await request<{ id: string }>(path, {
        action: "start",
        consent,
      });
      setSessionId(r.id);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function event(next: UploadState, eventName: string) {
    if (data?.audience === "po") {
      setState(next);
      return;
    }
    if (busy || !sessionId || outcome !== "started") return;
    setBusy(true);
    setError("");
    try {
      const result = await request<{ outcome: string }>(path, {
        action: "event",
        sessionId,
        event: eventName,
      });
      setState(next);
      setOutcome(result.outcome);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submitFeedback() {
    setBusy(true);
    try {
      await request(path, { action: "feedback", sessionId, feedback });
      setSaved(true);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <main className="shared-loading">
        <Layers3 size={26} />
        <h1>{error ? "Link unavailable" : "Opening prototype..."}</h1>
        {error && (
          <>
            <p role="alert">{error}</p>
            <Button variant="outline" onClick={() => void load()}>
              Try again
            </Button>
          </>
        )}
      </main>
    );
  const participant = data.audience === "participant";
  return (
    <div className="shared-page">
      <header className="studio-header">
        <span className="studio-brand">
          <Layers3 />
          Flow Review
        </span>
        <span className="breadcrumb">Homepath · Document upload</span>
        <span className="badge">
          {participant ? "Participant test" : "Product review"} · v
          {data.revision.number}
        </span>
      </header>
      {error && (
        <div className="error-banner" role="alert">
          <AlertCircle size={16} />
          {error}
        </div>
      )}
      {participant && !sessionId ? (
        <main className="consent-screen">
          <span className="badge">PROTOTYPE STUDY</span>
          <h1>Try a document upload.</h1>
          <p>
            You are getting a home application ready. Upload the sample pay
            statement and continue as far as you can.
          </p>
          <div className="consent-details">
            <h2>Before you start</h2>
            <p>
              This is a fictional prototype. No real documents or personal
              application details are needed.
            </p>
            <p>
              We record task actions, elapsed time, completion, and any feedback
              you choose to submit. We do not record your screen, camera, or
              microphone.
            </p>
            <p>
              You can stop at any time. Results are available to the workspace
              owner.
            </p>
          </div>
          <label className="consent-check">
            <Checkbox
              checked={consent}
              onCheckedChange={(v) => setConsent(v === true)}
            />
            <span>
              I agree to this prototype session and the information recorded
              above.
            </span>
          </label>
          <Button disabled={!consent || busy} onClick={() => void start()}>
            <Play size={16} />
            {busy ? "Starting..." : "Start task"}
          </Button>
        </main>
      ) : participant ? (
        <main className="participant-test">
          {outcome === "started" ? (
            <>
              <div className="task-banner">
                <Flag size={17} />
                <span>Upload the sample pay statement and continue.</span>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void event(state, "gave_up")}
                >
                  End task
                </Button>
              </div>
              <Uploader
                config={data.revision.config}
                state={state}
                playing={!busy}
                onState={(s, e) => void event(s, e)}
              />
            </>
          ) : (
            <div className="test-finish">
              <CheckCircle2 size={34} />
              <h1>Thank you for trying it.</h1>
              <p>Your session has ended.</p>
              <label htmlFor="test-feedback">
                What, if anything, made this task difficult?
              </label>
              <Textarea
                id="test-feedback"
                value={feedback}
                maxLength={1500}
                disabled={saved}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Optional feedback. Please leave out personal information."
              />
              <Button
                disabled={busy || saved || !feedback.trim()}
                onClick={() => void submitFeedback()}
              >
                {saved ? "Feedback received" : "Send feedback"}
              </Button>
              <p className="footnote">You can close this page now.</p>
            </div>
          )}
        </main>
      ) : (
        <>
          <div className="workspace-heading">
            <div>
              <p className="eyebrow">PRODUCT OWNER REVIEW</p>
              <h1>Document upload</h1>
              <p>
                Version {data.revision.number} · {data.revision.note}
              </p>
            </div>
            <Button variant="outline" onClick={() => setState("ready")}>
              Restart scenario
            </Button>
          </div>
          <main className="preview-grid">
            <div className="stage">
              <div className="stage-body">
                <Uploader
                  config={data.revision.config}
                  state={state}
                  onState={(s, e) => void event(s, e)}
                  annotate
                  onAnchor={setAnchor}
                />
              </div>
            </div>
            <aside className="review-panel">
              <Feedback
                comments={data.comments ?? []}
                revision={data.revision}
                state={state}
                viewport="desktop"
                anchor={anchor}
                busy={busy}
                readOnly
                onAction={reviewAction}
                onJump={(c) => {
                  setAnchor(c.anchor);
                  setState(c.state);
                }}
              />
            </aside>
          </main>
        </>
      )}
    </div>
  );
}
