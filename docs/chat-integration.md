# Chat panel integration

The Chat panel (`components/workbench/chat/chat-panel.tsx`) is a finished UI
with no assistant behind it yet. Everything a real assistant needs to plug in
lives behind one interface, so wiring up GitHub Copilot or any other API
never touches `ChatPanel` itself.

## The seam

`lib/chat/transport.ts` defines the contract:

```ts
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string; // ISO 8601
}

export interface ChatTransport {
  send(history: ChatMessage[], text: string, signal?: AbortSignal): Promise<string>;
}
```

`send` receives the conversation so far (`history`, not including the new
turn), the new user message (`text`), and an optional `AbortSignal`. It
returns a `Promise` that resolves to the assistant's reply text, or rejects
if the request fails or is aborted.

`placeholderTransport` (also in `lib/chat/transport.ts`) is the transport
mounted today: it never calls `fetch` or touches the network, it just waits
600 ms and resolves with a fixed notice.

## Implementing a real transport

Write an object that satisfies `ChatTransport`:

```ts
import type { ChatTransport } from '@/lib/chat/transport';

export const copilotTransport: ChatTransport = {
  async send(history, text, signal) {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history, text }),
      signal,
    });
    if (!response.ok) throw new Error('chat request failed');
    const { reply } = await response.json();
    return reply;
  },
};
```

Route the request through a server route handler (`app/api/chat/route.ts` or
similar) that holds the actual Copilot/API credentials and forwards `signal`
through to whatever it calls. **No API key, token or assistant endpoint URL
belongs in client code** - the transport above only ever talks to your own
server, the same way the rest of this app's client code never sees
`DATABASE_URL`.

## Where the provider is mounted

`components/workbench/workbench.tsx` wraps `WorkbenchShell` in:

```tsx
<ChatTransportProvider transport={placeholderTransport}>
```

To go live, change that one prop to the real transport (import it in place of
`placeholderTransport` from `@/lib/chat/transport`). `ChatPanel` reads the
transport through `useChatTransport()` (`components/workbench/chat/chat-
transport-context.tsx`) and never imports a transport implementation
directly, so this is the only line that needs to change.

## What the panel guarantees

- **Ordering.** Sending a new message aborts whatever request is still in
  flight for that panel before starting the new one. Only the newest send can
  ever land a reply in the log, so replies can never arrive out of order.
- **Abort on unmount.** `ChatPanel` aborts its in-flight request when it
  unmounts (closing the panel, navigating away). A transport should treat
  abort as cancellation - `placeholderTransport` clears its timer and rejects
  with `AbortError`; a `fetch`-based transport should pass `signal` straight
  through, as in the example above.
- **The error message.** If `send` rejects for any reason other than abort,
  the panel appends one assistant message reading "Something went wrong. Try
  again." rather than throwing or leaving the conversation stuck on
  "Thinking". A transport does not need its own retry or error-formatting
  logic on top of this - throw (or reject) and the panel handles the rest.

## Conversation storage

Messages persist per file in `localStorage` under
`assembly-workbench:chat:<fileId>` (`lib/chat/store.ts`,
`createChatStore`). A real transport does not need to know about this - it
only ever sees the `history` array `ChatPanel` passes it.
