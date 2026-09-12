'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { placeholderTransport, type ChatTransport } from '@/lib/chat/transport';

const ChatTransportContext = createContext<ChatTransport>(placeholderTransport);

/**
 * The integration seam: mounted once in components/workbench/workbench.tsx
 * around WorkbenchShell with `transport={placeholderTransport}`. A real
 * assistant integration (GitHub Copilot or any other API) swaps that one
 * prop for a ChatTransport backed by a real call - ChatPanel itself never
 * changes. See docs/chat-integration.md for the full contract.
 */
export function ChatTransportProvider({
  transport,
  children,
}: {
  transport: ChatTransport;
  children: ReactNode;
}) {
  return <ChatTransportContext.Provider value={transport}>{children}</ChatTransportContext.Provider>;
}

export function useChatTransport(): ChatTransport {
  return useContext(ChatTransportContext);
}
