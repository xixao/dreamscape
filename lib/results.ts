import type { Session } from "./model";
export const outcomeLabels = {
  complete: "Completed",
  gave_up: "Abandoned",
  started: "Still open",
};
export const eventLabels: Record<string, string> = {
  upload_attempt: "Upload interrupted",
  upload_success: "Document received",
  retry_success: "Retry succeeded",
  continue: "Completed the task",
  gave_up: "Abandoned the test",
};
export function sessionFacts(session: Session) {
  const unavailable = session.interactions.filter(
    (c) => !c.available && c.target !== "non_action",
  );
  const counts = new Map<string, number>();
  for (const c of unavailable) {
    const key = `${c.target} · ${c.state}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const repeated = [...counts].filter(([, count]) => count >= 5);
  return {
    unavailable,
    repeated,
    attention: session.outcome === "gave_up" || unavailable.length > 0,
    finding: repeated.length
      ? `${repeated[0][1]} attempts on the same unavailable control`
      : session.outcome === "gave_up"
        ? "Participant left before completing the task"
        : unavailable.length
          ? `${unavailable.length} ${unavailable.length === 1 ? "attempt on an unavailable control" : "attempts on unavailable controls"}`
          : session.outcome === "complete"
            ? "Task completed without recorded unavailable-control attempts"
            : "No final outcome recorded",
    next: unavailable.length
      ? "Inspect control availability and feedback in the recorded state. Ask what the participant expected before deciding on a change."
      : session.outcome === "gave_up"
        ? "Review the last action and participant feedback. The reason for leaving has not been established."
        : session.outcome === "complete"
          ? "Compare feedback with the successful path. Completion alone does not establish ease of use."
          : "No final outcome is recorded. Do not count this as a failure or infer abandonment.",
  };
}
export function summarizeResults(sessions: Session[]) {
  const blocked = sessions.filter(
    (s) => sessionFacts(s).unavailable.length > 0,
  );
  const repeated = blocked.filter((s) => sessionFacts(s).repeated.length > 0);
  const otherBlocked = blocked.filter((s) => !sessionFacts(s).repeated.length);
  const abandoned = sessions.filter((s) => s.outcome === "gave_up");
  const ratings = sessions.filter((s) => s.rating !== null);
  const findings = [
    {
      id: "repeated",
      title: "Repeated clicks on unavailable controls",
      observation:
        "Five or more clicks on the same unavailable control were recorded within a session.",
      sessions: repeated,
    },
    {
      id: "blocked",
      title: "Unavailable actions need a closer look",
      observation:
        "Clicks on unavailable controls were recorded. The reason for clicking is not known.",
      sessions: otherBlocked,
    },
    {
      id: "abandoned",
      title: "Leaving early needs follow-up",
      observation:
        "These sessions were explicitly abandoned before completion. The reason is not yet confirmed.",
      sessions: abandoned,
    },
  ].filter((finding) => finding.sessions.length > 0);
  return {
    total: sessions.length,
    complete: sessions.filter((s) => s.outcome === "complete").length,
    open: sessions.filter((s) => s.outcome === "started").length,
    abandoned: abandoned.length,
    blocked: blocked.length,
    ratingCount: ratings.length,
    average: ratings.length
      ? (
          ratings.reduce((sum, s) => sum + (s.rating ?? 0), 0) / ratings.length
        ).toFixed(1)
      : null,
    findings,
    next: !sessions.length
      ? "Run a participant test to gather evidence."
      : blocked.length
        ? "Check control availability and feedback, then run another test."
        : abandoned.length
          ? "Review the final actions and ask what participants expected before changing the design."
          : "Review written feedback alongside completed and still-open sessions. Completion alone does not establish ease of use.",
  };
}
