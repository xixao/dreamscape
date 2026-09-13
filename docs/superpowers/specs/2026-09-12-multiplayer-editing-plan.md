# Dreamscape: Multiplayer editing plan

Date: 2026-09-12
Status: plan requested by Matt ("another major feature of Dreamscape should be multiplayer editing. I want you to write a plan for that before building."). No code yet. The foundation spec already reserved this as sub-project 4 ("multiplayer presence and pinned comments, Yjs vs. Liveblocks decision happens then"); this is that decision and the plan.

## 1. What multiplayer means here

Several designers open the same file and work on it at once, the way Figma does:

- Presence: who is in the file (avatars with initials and a colour in the top bar), which screen each person is on, a live cursor with a name tag on the canvas, and the outline of the layer each person has selected in their colour.
- Concurrent editing: two people can drop, move, edit and delete layers on the same screen at the same time and both see the result within a moment, without one person's save overwriting the other's (today the second writer gets a 409 conflict and has to reload).
- Shared comments: pins, threads and replies are the same for everyone and update live (today they live only in the browser that wrote them).
- Follow: click a collaborator's avatar to follow their viewport (later; needs the infinite canvas).
- History: undo only undoes your own changes, not your collaborator's.

Out of scope for the first release: accounts and permissions beyond a display name (the app runs on the internal network), version history and branching, and voice or chat between people (the chat panel is for the assistant).

## 2. The core decision: a CRDT document, with Yjs

Real-time collaborative editing needs a data structure that merges concurrent changes deterministically on every client. Two families exist: operational transformation (OT, what Google Docs uses; needs a central server that orders every operation) and CRDTs (conflict-free replicated data types; every client applies changes in any order and converges). For a design tool with a tree of nodes and props, the industry has settled on CRDTs: Figma runs its own, and nearly every recent tool (tldraw, Excalidraw, Liveblocks, Pierre, Craft-based builders) uses Yjs.

Recommendation: adopt Yjs (MIT licence, roughly 100 kB, no runtime services of its own) as the shared document, with a small WebSocket relay that Yjs's own `y-websocket` protocol speaks. Reasons:

- It is the one dependency that is not reasonable to write in-house: a correct CRDT for maps, arrays and text, with garbage collection and update compression, is years of subtle work. Matt's zero-external-dependency rule was for the diagram engine (where an in-repo port is realistic); a CRDT is a different kind of thing, and I recommend the exception explicitly.
- Undo per user (`Y.UndoManager` scoped by origin), awareness for cursors and selection, offline edits that merge on reconnect, and binary updates small enough to store in Postgres all come with it.
- Craft.js's state is a plain map of nodes; it mirrors cleanly onto `Y.Map` values (section 4), so the editor code stays what it is.

Alternatives considered:

| Option | Why not |
| --- | --- |
| Liveblocks (hosted, includes Yjs storage, presence, comments) | Fastest to ship and well made, but a paid per-user service outside the internal network; keep it as the fallback if running a relay proves a burden. |
| Cloudflare Durable Objects / PartyKit | Good fit technically (one object per file holds the connections), but adds a second platform next to Vercel and Neon; revisit if the relay needs to scale beyond one small server. |
| Building our own OT or CRDT | Correctness risk out of proportion with the value. |
| Polling the current REST API | Presence would feel laggy and concurrent edits would still conflict; it is what we have today. |

## 3. Where the realtime server runs

Vercel serverless functions cannot hold a WebSocket open, so the relay is a separate small Node service (`server/realtime`, in this repo): `y-websocket`'s server protocol plus persistence hooks, run on Fly.io or Render (either is fine; one small instance), reachable at `wss://realtime.<internal domain>`. It keeps one Yjs document per open file in memory, broadcasts updates and awareness to the file's connections, and persists.

Persistence, per file:

- `file_docs` table in Neon: `file_id`, `state` (bytea: the compacted Yjs document), `updated_at`. The relay loads the state when the first person opens a file and writes it back on every change, debounced (about a second), and on the last person leaving.
- The existing `files.screens` JSON stays the read model for the Files page and Play mode: the relay materialises the document back to the current JSON shape on the same debounce, so nothing that reads files today changes. It is also the seed: the first time a file is opened in multiplayer, its JSON becomes the initial document.
- The existing PATCH API keeps working for scripts and as the fallback when the relay is unreachable (the client shows "Working offline; changes sync when the connection is back" and queues Yjs updates locally).

## 4. Document model and the Craft.js bridge

One Yjs document per file:

```
doc
  meta:     Y.Map   name, updatedAt
  screens:  Y.Array of Y.Map  { id, name, stageWidth, stageHeight, deviceName, x, y }
  layouts:  Y.Map<screenId, Y.Map<nodeId, Y.Map>>   one node map per screen
  comments: Y.Array of Y.Map  thread { id, screenId, x, y, anchorNodeId, author, text, createdAt, replies: Y.Array }
```

Each Craft node becomes a `Y.Map` with `type`, `props` (a nested `Y.Map`, so two people editing different props of the same layer both win), `parent`, `nodes` (`Y.Array` of child ids), `linkedNodes`, `custom` (interactions), `hidden`, `displayName`.

Bridge (`lib/collab/craft-bridge.ts`):

- Local to shared: Craft's `onNodesChange` gives the new node map; a structural diff against the last mirrored state produces a minimal set of Yjs mutations (set prop, add node, move within `nodes`, delete) applied in one transaction with origin `local`.
- Shared to local: a Yjs observer on the screen's node map applies remote changes through Craft's actions inside `actions.history.ignore()` so they never enter the local undo stack: `setProp` for prop changes, `add`/`move`/`delete` for structure. A full `deserialize` is the fallback when a remote change replaces the whole screen (New frame, example load).
- Undo and redo: `Y.UndoManager` tracking origin `local` replaces Craft's history for multiplayer files; Cmd+Z undoes your own last change even if someone else edited since.
- Ordering: text edits inside props stay last-writer-wins per prop (a prop is one value), which is what Figma does for property fields; only comment text uses `Y.Text` if we ever want character-level merging there.

## 5. Presence and cursors

Yjs awareness carries, per connection: `{ name, colour, screenId, cursor: { x, y } in that screen's frame coordinates, selection: nodeId | null, viewport }`. The client updates the cursor on pointer move inside a frame (throttled to about 30 updates a second) and clears it when the pointer leaves.

UI (all SF2 chrome):

- Top bar: a row of 24 px avatars (initials on the person's colour) after the file name, up to five, then "+3"; hover shows the name and screen; click follows (later).
- Canvas: a cursor arrow in the person's colour with a name tag, positioned through the frame's rect and zoom (and, after the infinite canvas, the viewport transform); the selected layer's outline in their colour, thinner than your own.
- Screens strip: small dots on the tabs for the screens people are on.
- Identity: the name prompt the comments feature already has (`getAuthorName`) becomes the identity for presence too, plus a colour picked deterministically from the name; a small "You are Matt" chip in the top bar lets you change it. Real identity (SSO) plugs in later without changing the document.

## 6. Comments move into the document

The comments store gains a second backend: the same `createCommentStore` interface backed by the `comments` array of the shared document, so the pins, threads, replies and Resolve built today work unchanged and become shared and live. Local-only storage stays as the fallback when offline.

## 7. Phases

Each phase ships behind a per-file switch ("Live collaboration" toggle in the top bar menu; default off until the relay is stable), with tests first, a review, and a browser check with two windows side by side.

1. Relay and document: `server/realtime` (Yjs websocket server, Neon persistence, JSON materialisation), the `file_docs` migration, `lib/collab/client.ts` (connect, reconnect, offline queue), and the seed from `files.screens`. Tests: two in-memory clients converge; persistence round trip; materialised JSON equals the repository's shape.
2. Craft bridge: local to shared and shared to local diffing, per-user undo, the full-screen fallback. Tests: two editors mutate the same screen and converge; undo only reverts your own change; a remote delete of the layer you selected clears the selection cleanly.
3. Presence: awareness plumbing, avatars, cursors, selection outlines, screen dots, the identity chip. Tests: awareness updates render; throttling; stale connections disappear after the timeout.
4. Shared comments: the document-backed store and the offline fallback.
5. Screens and file name in the document: adding, renaming, reordering, resizing screens concurrently; frame positions on the infinite canvas.
6. Hardening: reconnection storms, large files (compaction), a relay health page, a load test with 20 clients, and the decision to keep self-hosting or move to Liveblocks.

## 8. Risks and how the plan handles them

- Craft.js state churn: Craft re-renders the whole tree on `deserialize`, so remote changes must be applied as targeted actions (phase 2's diffing); a bad diff shows up as flicker or lost selection, which the two-window browser check catches.
- Prop collisions: two people typing in the same text field see last-writer-wins per keystroke; acceptable for property fields, noted in the UI copy of the identity chip's help.
- The relay is a single process: fine for an internal team; the document per file is small (tens of kilobytes). If it becomes a bottleneck, Durable Objects or Liveblocks are drop-in replacements for the transport because the client only speaks the Yjs protocol.
- Offline edits and the PATCH API writing to the same file: the relay is the only writer of `files.screens` for files with live collaboration on; the PATCH API refuses with a 409 and a clear message while the file is live.

## 9. Decisions I need from Matt (batched)

1. Dependency policy: agree that Yjs is the one allowed external dependency for this feature (the zero-dependency rule stays for the diagram engine).
2. Hosting the relay: a small self-hosted service on Fly.io or Render inside the internal network (my recommendation), or Liveblocks as a hosted service.
3. Identity: the display-name prompt for now, with SSO later, or wait for SSO before shipping presence.
4. Order: this plan slots after the infinite canvas and the flow charts unless Matt wants presence (phase 3 is largely independent of phase 2) sooner as a demo piece.
