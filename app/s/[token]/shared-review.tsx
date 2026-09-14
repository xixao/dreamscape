"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Layers3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Comment, ReviewDecision, Revision, Session } from "@/lib/model";
import { request } from "@/lib/client";
import POReview from "@/app/po-review";
import ParticipantTest from "@/app/participant-test";
import type { TestSetup } from "@/lib/test-setup";
type SharedData =
  | {
      audience: "po";
      revision: Revision;
      comments: Comment[];
      decisions: ReviewDecision[];
      sessions: Session[];
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
  const [data, setData] = useState<SharedData | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
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
        <h1 className="icon-title">
          <Layers3 size={26} aria-hidden="true" />
          <span>{error ? "Link unavailable" : "Opening prototype..."}</span>
        </h1>
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
    <POReview
      revision={data.revision}
      comments={data.comments ?? []}
      decisions={data.decisions ?? []}
      sessions={data.sessions ?? []}
      busy={busy}
      error={error}
      onAction={reviewAction}
    />
  );
}
