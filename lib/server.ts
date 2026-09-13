import { env } from "cloudflare:workers";
import { z } from "zod";
import { baseline } from "./model";

export const configSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    helper: z.string().trim().max(180),
    error: z.string().trim().min(1).max(220),
    button: z.string().trim().min(1).max(40),
    retryEnabled: z.boolean(),
    announceError: z.boolean(),
  })
  .strict();
export const commentSchema = z.object({
  revisionId: z.string().uuid(),
  parentId: z.string().uuid().nullable().default(null),
  text: z.string().trim().min(1).max(1500),
  state: z.enum(["ready", "failed", "complete"]),
  viewport: z.enum(["desktop", "mobile", "both"]),
  anchor: z.enum(["document-uploader", "upload-error"]),
});
export const prefSchema = z
  .object({ comments: z.boolean(), revisions: z.boolean(), tests: z.boolean() })
  .strict();
export function db() {
  if (!env.DB) throw new Error("Storage is unavailable");
  return env.DB;
}
export const uuid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}
export async function body(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    fail("Request origin is not allowed", 403);
  const raw = await request.text();
  if (raw.length > 12000) fail("Request is too large", 413);
  try {
    return JSON.parse(raw);
  } catch {
    fail("Invalid request");
  }
}
export async function safe(action: () => Promise<unknown>) {
  try {
    return Response.json(await action(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        { error: "Please check the values and try again." },
        { status: 400 },
      );
    const e = error as Error & { status?: number };
    if (!e.status) console.error("Flow Review storage operation failed", e);
    return Response.json(
      {
        error: e.status
          ? e.message
          : "Could not save or load your workspace. Your draft is still here. Try again.",
      },
      { status: e.status ?? 503 },
    );
  }
}
export async function ensure(owner: string) {
  await db()
    .prepare(
      "INSERT OR IGNORE INTO revisions (id,owner,number,config,note,created_at) VALUES (?,?,1,?,?,?)",
    )
    .bind(
      uuid(),
      owner,
      JSON.stringify(baseline),
      "Original design: upload recovery needs review.",
      now(),
    )
    .run();
}
export function revision(row: Record<string, unknown>) {
  return {
    id: row.id,
    number: row.number,
    config: JSON.parse(row.config as string),
    note: row.note,
    createdAt: row.created_at,
  };
}
export async function getRevision(owner: string, id: string) {
  const row = await db()
    .prepare("SELECT * FROM revisions WHERE owner=? AND id=?")
    .bind(owner, id)
    .first();
  if (!row) fail("Version not found", 404);
  return revision(row);
}
export async function getComments(
  owner: string,
  actor: string,
  revisionId?: string,
) {
  const result = await db()
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM reactions r WHERE r.comment_id=c.id AND r.kind='like') AS likes,
      (SELECT COUNT(*) FROM reactions r WHERE r.comment_id=c.id AND r.kind='dislike') AS dislikes,
      (SELECT COUNT(*) FROM reactions r WHERE r.comment_id=c.id AND r.kind='fuego') AS fuegos,
      (SELECT kind FROM reactions r WHERE r.comment_id=c.id AND r.actor=?) AS reaction
      FROM comments c WHERE c.owner=? ${revisionId ? "AND c.revision_id=?" : ""} ORDER BY c.created_at`,
    )
    .bind(...(revisionId ? [actor, owner, revisionId] : [actor, owner]))
    .all();
  return result.results.map((r) => ({
    id: r.id,
    parentId: r.parent_id,
    text: r.body,
    author: r.author,
    revisionId: r.revision_id,
    state: r.state,
    viewport: r.viewport,
    anchor: r.anchor,
    resolved: !!r.resolved,
    assignee: r.assignee,
    likes: r.likes,
    liked: r.reaction === "like",
    dislikes: r.dislikes,
    fuegos: r.fuegos,
    reaction: r.reaction ?? null,
    createdAt: r.created_at,
  }));
}
export async function addComment(
  owner: string,
  author: string,
  input: unknown,
  allowedRevision?: string,
) {
  const c = commentSchema.parse(input);
  if (allowedRevision && c.revisionId !== allowedRevision)
    fail("This link is pinned to another version", 403);
  await getRevision(owner, c.revisionId);
  if (c.parentId) {
    const parent = await db()
      .prepare(
        "SELECT id FROM comments WHERE id=? AND owner=? AND revision_id=? AND parent_id IS NULL",
      )
      .bind(c.parentId, owner, c.revisionId)
      .first();
    if (!parent) fail("Comment not found", 404);
  }
  const id = uuid();
  await db()
    .prepare(
      "INSERT INTO comments (id,owner,revision_id,parent_id,body,author,state,viewport,anchor,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    )
    .bind(
      id,
      owner,
      c.revisionId,
      c.parentId,
      c.text,
      author,
      c.state,
      c.viewport,
      c.anchor,
      now(),
    )
    .run();
  return { id };
}
export async function react(
  owner: string,
  actor: string,
  id: string,
  liked: boolean,
  allowedRevision?: string,
  kind: "like" | "dislike" | "fuego" = "like",
) {
  const c = await db()
    .prepare("SELECT revision_id FROM comments WHERE id=? AND owner=?")
    .bind(id, owner)
    .first();
  if (!c || (allowedRevision && c.revision_id !== allowedRevision))
    fail("Comment not found", 404);
  await (
    liked
      ? db().prepare(
          "INSERT INTO reactions (comment_id,actor,kind) VALUES (?,?,?) ON CONFLICT(comment_id,actor) DO UPDATE SET kind=excluded.kind",
        )
      : db().prepare(
          "DELETE FROM reactions WHERE comment_id=? AND actor=? AND kind=?",
        )
  )
    .bind(id, actor, kind)
    .run();
  return { ok: true };
}
export async function getShare(token: string) {
  const row = await db()
    .prepare("SELECT * FROM shares WHERE token=? AND revoked=0")
    .bind(token)
    .first();
  if (!row) fail("This link is unavailable or has been revoked", 404);
  return row as unknown as {
    token: string;
    owner: string;
    revision_id: string;
    audience: "po" | "participant";
    test_config: string | null;
  };
}
