import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/sqlite-core";

export const revisions = sqliteTable(
  "revisions",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    number: integer("number").notNull(),
    config: text("config").notNull(),
    note: text("note").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("revisions_owner_number").on(t.owner, t.number)],
);
export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    revisionId: text("revision_id").notNull(),
    parentId: text("parent_id"),
    body: text("body").notNull(),
    author: text("author").notNull(),
    state: text("state").notNull(),
    viewport: text("viewport").notNull(),
    anchor: text("anchor").notNull(),
    resolved: integer("resolved").notNull().default(0),
    assignee: text("assignee").notNull().default("Unassigned"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("comments_owner_revision").on(t.owner, t.revisionId)],
);
export const reactions = sqliteTable(
  "reactions",
  {
    commentId: text("comment_id").notNull(),
    actor: text("actor").notNull(),
    kind: text("kind").notNull().default("like"),
  },
  (t) => [primaryKey({ columns: [t.commentId, t.actor] })],
);
export const preferences = sqliteTable("preferences", {
  owner: text("owner").primaryKey(),
  value: text("value").notNull(),
});
export const shares = sqliteTable(
  "shares",
  {
    token: text("token").primaryKey(),
    owner: text("owner").notNull(),
    revisionId: text("revision_id").notNull(),
    audience: text("audience").notNull(),
    testConfig: text("test_config"),
    createdAt: text("created_at").notNull(),
    revoked: integer("revoked").notNull().default(0),
  },
  (t) => [index("shares_owner").on(t.owner)],
);
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull(),
    owner: text("owner").notNull(),
    revisionId: text("revision_id").notNull(),
    outcome: text("outcome").notNull().default("started"),
    duration: integer("duration"),
    feedback: text("feedback").notNull().default(""),
    events: text("events").notNull().default("[]"),
    interactions: text("interactions").notNull().default("[]"),
    rating: integer("rating"),
    fuego: integer("fuego").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("sessions_owner").on(t.owner)],
);
