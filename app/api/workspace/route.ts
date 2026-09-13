import { z } from "zod";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import {
  addComment,
  body,
  configSchema,
  db,
  ensure,
  fail,
  getComments,
  getRevision,
  now,
  prefSchema,
  react,
  revision,
  safe,
  uuid,
} from "@/lib/server";

async function user() {
  const u = await getChatGPTUser();
  if (!u) fail("Sign in to save your workspace", 401);
  return u;
}
export async function GET() {
  return safe(async () => {
    const u = await user();
    await ensure(u.userId);
    const r = await db()
      .prepare("SELECT * FROM revisions WHERE owner=? ORDER BY number DESC")
      .bind(u.userId)
      .all();
    const s = await db()
      .prepare(
        "SELECT * FROM sessions WHERE owner=? ORDER BY created_at DESC LIMIT 100",
      )
      .bind(u.userId)
      .all();
    const p = await db()
      .prepare("SELECT value FROM preferences WHERE owner=?")
      .bind(u.userId)
      .first();
    const links = await db()
      .prepare(
        "SELECT token,revision_id AS revisionId,audience,revoked FROM shares WHERE owner=? ORDER BY created_at DESC LIMIT 30",
      )
      .bind(u.userId)
      .all();
    return {
      name: u.displayName,
      revisions: r.results.map(revision),
      comments: await getComments(u.userId, u.userId),
      preferences: p
        ? JSON.parse(p.value as string)
        : { comments: true, revisions: true, tests: true },
      sessions: s.results.map((row) => ({
        id: row.id,
        revisionId: row.revision_id,
        outcome: row.outcome,
        duration: row.duration,
        feedback: row.feedback,
        events: JSON.parse(row.events as string),
        interactions: JSON.parse(row.interactions as string),
        rating: row.rating,
        fuego: !!row.fuego,
        createdAt: row.created_at,
      })),
      links: links.results,
    };
  });
}
export async function POST(request: Request) {
  return safe(async () => {
    const u = await user();
    const data = await body(request);
    const owner = u.userId;
    switch (data.action) {
      case "revision": {
        const config = configSchema.parse(data.config),
          note = z.string().trim().min(1).max(200).parse(data.note),
          baseId = z.string().uuid().parse(data.baseId);
        await getRevision(owner, baseId);
        const id = uuid();
        await db()
          .prepare(
            "INSERT INTO revisions (id,owner,number,config,note,created_at) SELECT ?,?,COALESCE(MAX(number),0)+1,?,?,? FROM revisions WHERE owner=?",
          )
          .bind(id, owner, JSON.stringify(config), note, now(), owner)
          .run();
        return { revision: await getRevision(owner, id) };
      }
      case "comment":
        return addComment(owner, u.displayName, data);
      case "reaction":
        return react(
          owner,
          owner,
          z.string().uuid().parse(data.id),
          z.boolean().parse(data.liked),
          undefined,
          z.enum(["like", "dislike", "fuego"]).default("like").parse(data.kind),
        );
      case "resolve":
      case "assign": {
        const id = z.string().uuid().parse(data.id);
        const result =
          data.action === "resolve"
            ? await db()
                .prepare(
                  "UPDATE comments SET resolved=? WHERE id=? AND owner=?",
                )
                .bind(z.boolean().parse(data.resolved) ? 1 : 0, id, owner)
                .run()
            : await db()
                .prepare(
                  "UPDATE comments SET assignee=? WHERE id=? AND owner=?",
                )
                .bind(
                  z
                    .enum([
                      "Unassigned",
                      "Designer",
                      "Product owner",
                      "Engineer",
                    ])
                    .parse(data.assignee),
                  id,
                  owner,
                )
                .run();
        if (!result.meta.changes) fail("Comment not found", 404);
        return { ok: true };
      }
      case "preferences": {
        const value = prefSchema.parse(data.value);
        await db()
          .prepare(
            "INSERT INTO preferences (owner,value) VALUES (?,?) ON CONFLICT(owner) DO UPDATE SET value=excluded.value",
          )
          .bind(owner, JSON.stringify(value))
          .run();
        return { ok: true };
      }
      case "share": {
        const id = z.string().uuid().parse(data.revisionId);
        await getRevision(owner, id);
        const audience = z.enum(["po", "participant"]).parse(data.audience);
        const token = uuid() + uuid();
        await db()
          .prepare(
            "INSERT INTO shares (token,owner,revision_id,audience,created_at) VALUES (?,?,?,?,?)",
          )
          .bind(token, owner, id, audience, now())
          .run();
        return { path: `/s/${token}`, token };
      }
      case "revoke": {
        await db()
          .prepare("UPDATE shares SET revoked=1 WHERE token=? AND owner=?")
          .bind(z.string().max(100).parse(data.token), owner)
          .run();
        return { ok: true };
      }
      default:
        fail("Unknown action");
    }
  });
}
