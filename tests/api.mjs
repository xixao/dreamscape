import assert from "node:assert/strict";

const origin = process.argv[2] ?? "http://localhost:5185";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))
  throw Error("Tests are local-only");
const owner = `test-${crypto.randomUUID()}`;
const headers = {
  "oai-authenticated-user-id": owner,
  "oai-authenticated-user-email": "local-test@example.test",
};
let count = 0;
async function api(path, payload, auth = headers, expected = 200) {
  const response = await fetch(origin + path, {
    method: payload ? "POST" : "GET",
    headers: {
      ...auth,
      ...(payload
        ? { "Content-Type": "application/json", Origin: origin }
        : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = await response.json();
  assert.equal(response.status, expected, JSON.stringify(data));
  count++;
  return data;
}
const w = await api("/api/workspace");
assert.equal(w.revisions.length, 1);
const first = w.revisions[0];
assert.equal(first.config.retryEnabled, false);
await api("/api/workspace", null, {}, 401);
const bad = await api(
  "/api/workspace",
  {
    action: "revision",
    baseId: first.id,
    config: { ...first.config, title: "" },
    note: "Invalid",
  },
  headers,
  400,
);
assert.ok(bad.error);
const added = await api("/api/workspace", {
  action: "comment",
  revisionId: first.id,
  text: "Need a recovery action",
  state: "failed",
  viewport: "desktop",
  anchor: "upload-error",
});
await api("/api/workspace", {
  action: "comment",
  revisionId: first.id,
  parentId: added.id,
  text: "Agreed",
  state: "failed",
  viewport: "desktop",
  anchor: "upload-error",
});
await api("/api/workspace", { action: "reaction", id: added.id, liked: true });
await api("/api/workspace", { action: "reaction", id: added.id, liked: true });
await api("/api/workspace", {
  action: "assign",
  id: added.id,
  assignee: "Engineer",
});
await api("/api/workspace", {
  action: "resolve",
  id: added.id,
  resolved: true,
});
const w2 = await api("/api/workspace");
assert.equal(w2.comments.length, 2);
assert.equal(w2.comments[0].likes, 1);
assert.equal(w2.comments[0].resolved, true);
assert.equal(w2.comments[0].assignee, "Engineer");
const fixed = await api("/api/workspace", {
  action: "revision",
  baseId: first.id,
  config: {
    ...first.config,
    error: "Your upload was interrupted. Try again.",
    retryEnabled: true,
    announceError: true,
  },
  note: "Scripted fix",
});
assert.equal(fixed.revision.number, 2);
const share = await api("/api/workspace", {
  action: "share",
  revisionId: fixed.revision.id,
  audience: "participant",
});
const token = share.token;
const publicData = await api(`/api/share/${token}`, null, {});
assert.deepEqual(Object.keys(publicData).sort(), ["audience", "revision"]);
assert.equal(publicData.revision.note, undefined);
assert.equal(publicData.revision.id, fixed.revision.id);
await api(
  `/api/share/${token}`,
  {
    action: "comment",
    revisionId: fixed.revision.id,
    text: "Forbidden",
    state: "failed",
    viewport: "desktop",
    anchor: "upload-error",
  },
  {},
  400,
);
await api(`/api/share/${token}`, { action: "start", consent: false }, {}, 400);
const session = await api(
  `/api/share/${token}`,
  { action: "start", consent: true },
  {},
);
await api(
  `/api/share/${token}`,
  { action: "event", sessionId: session.id, event: "continue" },
  {},
  409,
);
for (const event of ["upload_attempt", "retry_success", "continue"])
  await api(
    `/api/share/${token}`,
    { action: "event", sessionId: session.id, event },
    {},
  );
await api(
  `/api/share/${token}`,
  { action: "event", sessionId: session.id, event: "continue" },
  {},
  409,
);
await api(
  `/api/share/${token}`,
  { action: "feedback", sessionId: session.id, feedback: "Recovery was clear" },
  {},
);
const after = await api("/api/workspace");
assert.equal(after.sessions[0].outcome, "complete");
assert.equal(after.sessions[0].events.length, 3);
assert.equal(after.sessions[0].feedback, "Recovery was clear");
const original = await api("/api/workspace", {
  action: "share",
  revisionId: first.id,
  audience: "participant",
});
const started = await api(
  `/api/share/${original.token}`,
  { action: "start", consent: true },
  {},
);
await api(
  `/api/share/${original.token}`,
  { action: "event", sessionId: started.id, event: "upload_attempt" },
  {},
);
await api(
  `/api/share/${original.token}`,
  { action: "event", sessionId: started.id, event: "retry_success" },
  {},
  409,
);
await api(
  `/api/share/${original.token}`,
  { action: "event", sessionId: started.id, event: "gave_up" },
  {},
);
const review = await api("/api/workspace", {
  action: "share",
  revisionId: first.id,
  audience: "po",
});
const reviewed = await api(`/api/share/${review.token}`, null, {});
assert.equal(reviewed.comments.length, 2);
assert.equal(reviewed.sessions, undefined);
await api(
  `/api/share/${review.token}`,
  { action: "revision", config: first.config },
  {},
  403,
);
await api(
  `/api/share/${review.token}`,
  {
    action: "comment",
    revisionId: fixed.revision.id,
    text: "Wrong version",
    state: "failed",
    viewport: "desktop",
    anchor: "upload-error",
  },
  {},
  403,
);
const other = {
  "oai-authenticated-user-id": "another-local-test",
  "oai-authenticated-user-email": "other@example.test",
};
await api(
  "/api/workspace",
  { action: "resolve", id: added.id, resolved: false },
  other,
  404,
);
await api("/api/workspace", {
  action: "preferences",
  value: { comments: false, revisions: true, tests: false },
});
assert.equal((await api("/api/workspace")).preferences.comments, false);
await api("/api/workspace", { action: "revoke", token });
await api(`/api/share/${token}`, null, {}, 404);
console.log(
  `${count} API assertions passed, plus payload, identity, persistence, and state checks.`,
);
