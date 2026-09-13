import type { Session } from "@/lib/model";
import { sessionFacts } from "@/lib/results";
export default function SessionSignals({ session }: { session: Session }) {
  const clicks = session.interactions ?? [];
  const { unavailable, repeated } = sessionFacts(session);
  const outside = clicks.filter((c) => c.target === "non_action");
  return (
    <div className="session-signals">
      {session.testSetup && (
        <p>
          <strong>{session.testSetup.title}</strong> ·{" "}
          {session.testSetup.audience} · {session.testSetup.viewport} ·{" "}
          {session.testSetup.scenario}
        </p>
      )}
      <div className="signal-summary">
        <span>{clicks.length} prototype clicks</span>
        <span>{unavailable.length} unavailable-control attempts</span>
        <span>{outside.length} non-action clicks</span>
        <span>
          {session.rating ? `${session.rating}/5 stars` : "Not rated"}
        </span>
        {session.fuego && <span>🔥 Fuego</span>}
      </div>
      {repeated.map(([target, count]) => (
        <p className="signal-warning" key={target}>
          {count} clicks on unavailable {target}; no action could run.
        </p>
      ))}
      {!!clicks.length && (
        <details>
          <summary>Inspect interaction timeline</summary>
          <ol>
            {clicks.map((c) => (
              <li key={c.id}>
                <time>{(c.at / 1000).toFixed(1)}s</time>
                <strong>{c.target.replaceAll("_", " ")}</strong>
                <span>
                  {c.state} ·{" "}
                  {c.available
                    ? "Action available"
                    : c.target === "non_action"
                      ? "No action assigned"
                      : "Unavailable / waiting"}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
      {!!clicks.length && (
        <p className="footnote">
          Click signals are observations, not proof of confusion. Compare
          available actions with the task events above.
        </p>
      )}
    </div>
  );
}
