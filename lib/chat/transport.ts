// The integration seam for the chat panel placeholder. A real assistant
// (GitHub Copilot or any other API) implements ChatTransport and is wired in
// through ChatTransportProvider (components/workbench/chat/chat-transport-
// context.tsx), which components/workbench/workbench.tsx mounts around the
// workbench. See docs/chat-integration.md for the full contract.

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: string;
  targets?: { id: string; name: string; props?: Record<string, unknown> }[];
}

export interface ChatTransport {
  send(history: ChatMessage[], text: string, signal?: AbortSignal): Promise<string>;
}

export const PLACEHOLDER_REPLY_DELAY_MS = 600;
export const PLACEHOLDER_REPLY_TEXT =
  'The assistant is not connected yet. This panel is a placeholder for the conversation feature.';

// Never calls fetch or touches the network - it only waits, so the panel can
// show a realistic "Thinking" delay before answering with a fixed notice.
// Honors `signal` so a caller that aborts (e.g. ChatPanel unmounting) gets a
// rejected promise instead of a reply that arrives after no one is listening.
export const placeholderTransport: ChatTransport = {
  send(_history, _text, signal) {
    return new Promise<string>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      const timer = setTimeout(() => resolve(PLACEHOLDER_REPLY_TEXT), PLACEHOLDER_REPLY_DELAY_MS);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
  },
};
