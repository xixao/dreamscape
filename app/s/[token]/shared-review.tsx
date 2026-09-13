"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Layers3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Comment, Revision, UploadState } from "@/lib/model";
import { request } from "@/lib/client";
import Uploader from "@/app/demo/document-upload";
import Feedback from "@/app/feedback";
import ParticipantTest from "@/app/participant-test";
import type { TestSetup } from "@/lib/test-setup";
type SharedData =
  | {
      audience: "po";
      revision: Revision;
      comments: Comment[];
    }
  | {
      audience: "participant";
      revision: Pick<Revision, "id" | "number" | "config">;
      testSetup?: TestSetup;
    };
export default function SharedReview({ token }: { token: string }) {
  return <SharedReviewContent key={token} token={token} />;
}
function SharedReviewContent({ token }: { token: string }) {
  const [data, setData] = useState<SharedData | null>(null),
    [state, setState] = useState<UploadState>("ready");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [anchor, setAnchor] = useState("document-uploader");
  const actor = useRef("");
  const pending = useRef(false);
  const sequence = useRef(0);
  const path = `/api/share/${token}`;
  const load = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const next = await request<SharedData>(`${path}?actor=${actor.current}`);
      if (sequence.current !== current) return;
      setData(next);
      setError("");
    } catch (e) {
      if (sequence.current !== current) return;
      setError((e as Error).message);
    }
  }, [path]);
  useEffect(() => {
    actor.current = crypto.randomUUID();
    void load();
    const invalidate = () => {
      sequence.current++;
    };
    return invalidate;
  }, [load]);
  async function reviewAction(payload: Record<string, unknown>) {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    try {
      await request(path, { ...payload, actor: actor.current });
      await load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      pending.current = false;
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
  if (data.audience === "participant")
    return (
      <ParticipantTest
        key={token}
        token={token}
        revision={data.revision}
        setup={data.testSetup}
      />
    );
  return (
    <div className="shared-page">
      <header className="studio-header">
        <span className="studio-brand">
          <Layers3 />
          Flow Review
        </span>
        <span className="breadcrumb">Homepath · Document upload</span>
        <span className="badge">Product review · v{data.revision.number}</span>
      </header>
      {error && (
        <div className="error-banner" role="alert">
          <AlertCircle size={16} />
          {error}
        </div>
      )}
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
              onState={setState}
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
            canModerate={false}
            onAction={reviewAction}
            onJump={(c) => {
              setAnchor(c.anchor);
              setState(c.state);
            }}
          />
        </aside>
      </main>
    </div>
  );
}
