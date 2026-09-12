import { z } from "zod";
import {
  addComment,
  body,
  db,
  fail,
  getComments,
  getRevision,
  getShare,
  now,
  react,
  safe,
  uuid,
} from "@/lib/server";
type Context = { params: Promise<{ token: string }> };
export async function GET(request: Request, context: Context) {
  return safe(async () => {
    const { token } = await context.params;
    const link = await getShare(token);
    const revision = await getRevision(link.owner, link.revision_id);
    const actor = new URL(request.url).searchParams.get("actor") ?? "";
    return {
      audience: link.audience,
      revision:
        link.audience === "participant"
          ? {
              id: revision.id,
              number: revision.number,
              config: revision.config,
            }
          : revision,
      ...(link.audience === "po"
        ? {
            comments: await getComments(
              link.owner,
              `reviewer:${actor.slice(0, 80)}`,
              link.revision_id,
            ),
          }
        : {}),
    };
  });
}
export async function POST(request: Request, context: Context) {
  return safe(async () => {
    const { token } = await context.params;
    const link = await getShare(token);
    const data = await body(request);
    if (link.audience === "po") {
      if (data.action === "comment")
        return addComment(link.owner, "Reviewer", data, link.revision_id);
      if (data.action === "reaction")
        return react(
          link.owner,
          `reviewer:${z.string().uuid().parse(data.actor)}`,
          z.string().uuid().parse(data.id),
          z.boolean().parse(data.liked),
          link.revision_id,
        );
      fail("Review links cannot change the design", 403);
    }
    if (data.action === "start") {
      if (data.consent !== true) fail("Consent is required before starting");
      const id = uuid();
      await db()
        .prepare(
          "INSERT INTO sessions (id,token,owner,revision_id,created_at) VALUES (?,?,?,?,?)",
        )
        .bind(id, token, link.owner, link.revision_id, now())
        .run();
      return { id };
    }
    const id = z.string().uuid().parse(data.sessionId);
    const session = await db()
      .prepare("SELECT * FROM sessions WHERE id=? AND token=?")
      .bind(id, token)
      .first();
    if (!session) fail("Session not found", 404);
    if (data.action === "feedback") {
      const feedback = z.string().trim().max(1500).parse(data.feedback);
      await db()
        .prepare("UPDATE sessions SET feedback=? WHERE id=? AND token=?")
        .bind(feedback, id, token)
        .run();
      return { ok: true };
    }
    if (data.action !== "event") fail("Action not allowed", 403);
    if (session.outcome !== "started") fail("Session has already ended", 409);
    const event = z
      .enum(["upload_attempt", "retry_success", "continue", "gave_up"])
      .parse(data.event);
    const events = JSON.parse(session.events as string) as {
      type: string;
      at: number;
    }[];
    const prior = events.at(-1)?.type;
    const revision = await getRevision(link.owner, link.revision_id);
    if (event === "upload_attempt" && prior)
      fail("Upload already started", 409);
    if (
      event === "retry_success" &&
      (prior !== "upload_attempt" || !revision.config.retryEnabled)
    )
      fail("Retry unavailable", 409);
    if (event === "continue" && prior !== "retry_success")
      fail("Document must be received first", 409);
    const elapsed = Math.max(
      0,
      Date.now() - new Date(session.created_at as string).getTime(),
    );
    events.push({ type: event, at: elapsed });
    const outcome =
      event === "continue"
        ? "complete"
        : event === "gave_up"
          ? "gave_up"
          : "started";
    const update = await db()
      .prepare(
        "UPDATE sessions SET events=?,outcome=?,duration=? WHERE id=? AND token=? AND events=? AND outcome='started'",
      )
      .bind(
        JSON.stringify(events),
        outcome,
        outcome === "started" ? null : elapsed,
        id,
        token,
        session.events,
      )
      .run();
    if (!update.meta.changes) fail("Session changed. Please try again.", 409);
    return { ok: true, outcome };
  });
}
