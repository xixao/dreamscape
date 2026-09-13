"use client";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Layers3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Comment, Revision, UploadState } from "@/lib/model";
import { request } from "@/lib/client";
import Uploader from "@/app/uploader";
import Feedback from "@/app/feedback";
import ParticipantTest from "@/app/participant-test";
import type { TestSetup } from "@/lib/test-setup";
type SharedData = {
  audience: "po" | "participant";
  revision: Revision;
  comments?: Comment[];
  testSetup?: TestSetup;
};
export default function SharedReview({ token }: { token: string }) {
  const [data, setData] = useState<SharedData | null>(null),
    [state, setState] = useState<UploadState>("ready");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [anchor, setAnchor] = useState("document-uploader");
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
            readOnly
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
