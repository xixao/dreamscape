'use client';

import { LeftPanelContext, LeftPanelHeader, LeftPanelTabs } from '../left-panel-tabs';
import { useContext } from 'react';
import { PanelResize } from '../panel-resize';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { nanoid } from 'nanoid';
import { ArrowUp, Bot, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { createChatStore } from '@/lib/chat/store';
import type { ChatMessage } from '@/lib/chat/transport';
import { cn } from '@/lib/utils';
import { CHIP, CHIP_INPUT, EMPTY, EMPTY_TITLE, LABEL, PANEL, PANEL_HEADER, PANEL_TITLE } from '../chrome';
import { useChatTransport } from './chat-transport-context';

const ERROR_REPLY_TEXT = 'Something went wrong. Try again.';

const EXAMPLE_PROMPTS = ['Suggest a layout for this screen', 'Which components could replace this card?'] as const;

// SF2 .btn look, kept local rather than centralized in chrome.ts - the same
// choice components/files/files-actions.tsx already made for its own
// secondary actions. whitespace-normal/justify-start/text-left override the
// shadcn Button's single-line, centered defaults so a two-line prompt reads
// like a left-aligned option rather than centered, wrapped label text.
const SECONDARY_BUTTON =
  'h-auto w-full justify-start whitespace-normal text-left bg-muted border border-border rounded-[9px] px-3.5 py-2 text-[13px] font-medium text-foreground hover:bg-accent';

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function newMessage(role: ChatMessage['role'], text: string): ChatMessage {
  return { id: nanoid(10), role, text, createdAt: new Date().toISOString() };
}

function AssistantAvatar() {
  return (
    <div
      aria-hidden
      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[image:var(--grad)] text-white"
    >
      <Bot className="size-3.5" />
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div
      className={cn(
        'flex max-w-[88%] flex-col gap-1',
        isUser ? 'self-end items-end' : 'self-start items-start',
      )}
    >
      <div className={cn('flex items-start gap-2', isUser && 'flex-row-reverse')}>
        {!isUser && <AssistantAvatar />}
        <div
          className={cn(
            'text-[13px] leading-snug whitespace-pre-wrap break-words',
            isUser ? 'rounded-lg bg-muted px-3 py-2' : 'pt-0.5',
          )}
        >
          {message.text}
        </div>
      </div>
      <span className={cn(LABEL, isUser ? 'pr-0.5' : 'pl-8')}>{formatTimestamp(message.createdAt)}</span>
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex items-start gap-2 self-start">
      <AssistantAvatar />
      <div role="status" aria-label="Assistant is typing" className="flex items-center gap-1 pt-2.5">
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
      </div>
    </div>
  );
}

export function ChatPanel({
  fileId,
  onClose,
  className,
  width,
  left,
  onWidthChange,
}: {
  fileId: string;
  onClose: () => void;
  // The floating position (spec docs/superpowers/specs/2026-09-12-infinite-
  // canvas-design.md section 4): right-[336px] beside the expanded right
  // panel, right-[56px] beside its 40px rail. WorkbenchShell computes and
  // passes this (it is the one that knows whether the panel is collapsed),
  // the same literal-class-per-branch approach its own floating classes
  // already use, so the build's class scanner can see every one.
  className?: string;
  width?: number;
  left?: number;
  onWidthChange?: (width: number) => void;
}) {
  const panelMode = useContext(LeftPanelContext);
  const transport = useChatTransport();
  // Lazy useState, not useMemo, so the store is created exactly once per
  // mount - the same reasoning as the file saver in workbench.tsx.
  const [store] = useState(() => createChatStore(fileId, window.localStorage));
  const [messages, setMessages] = useState<ChatMessage[]>(() => store.load());
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // The in-flight request's controller, so a newer send can cancel a
  // stale one (ordering) and unmount can cancel whatever is left (no
  // setState after unmount, no reply arriving after no one is listening).
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  function send(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;

    const history = messages;
    setMessages(store.append(newMessage('user', trimmed)));
    setDraft('');

    // Superseding a still-pending request keeps replies in order: only the
    // newest send can ever resolve into the log, and its own `controller`
    // (captured below, not the ref) is what every guard here checks.
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setPending(true);

    transport
      .send(history, trimmed, controller.signal)
      .then((reply) => {
        if (controller.signal.aborted) return;
        setMessages(store.append(newMessage('assistant', reply)));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setMessages(store.append(newMessage('assistant', ERROR_REPLY_TEXT)));
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send(draft);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.currentTarget.blur();
    }
  }

  function fillComposer(prompt: string): void {
    setDraft(prompt);
    textareaRef.current?.focus();
  }

  if (panelMode?.collapsed) return <aside aria-label="Chat" style={{ width: 40, left }} className={cn(PANEL, 'absolute top-[76px] bottom-3 z-10 flex flex-col items-center gap-1 py-2', className)}>
    <button type="button" aria-label="Expand chat panel" aria-expanded={false} title="Expand chat panel" className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => panelMode.setCollapsed?.(false)}><ChevronRight className="size-4" /></button>
    <div className="my-1 h-px w-6 bg-border" />
    <LeftPanelTabs compact />
  </aside>;
  return (
    <aside style={{ width, left }} aria-label="Chat" className={cn(PANEL, 'absolute top-[76px] bottom-3 z-10 flex w-[360px] min-h-0 flex-col', className)}>
      {width && onWidthChange && <PanelResize width={width} onChange={onWidthChange} />}
      {panelMode ? <>
        <LeftPanelHeader action={<button type="button" aria-label="Minimize chat panel" aria-expanded={true} title="Minimize chat panel" className="flex size-8 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => panelMode.setCollapsed?.(true)}><ChevronLeft className="size-4" /></button>} />
      </> : <div className={PANEL_HEADER}>
        <span className={PANEL_TITLE}>Chat</span><div className="flex-1" />
        <Button variant="ghost" size="icon" aria-label="Close chat" onClick={onClose}><X className="size-4" aria-hidden /></Button>
      </div>}


      {messages.length === 0 ? (
        <div className={cn(EMPTY, 'm-3 flex flex-1 flex-col items-center justify-center gap-3')}>
          <b className={EMPTY_TITLE}>Ask about this design</b>
          <div className="flex w-full flex-col gap-2">
            {EXAMPLE_PROMPTS.map((prompt) => (
              <Button
                key={prompt}
                type="button"
                variant="ghost"
                className={SECONDARY_BUTTON}
                onClick={() => fillComposer(prompt)}
              >
                {prompt}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <div ref={listRef} role="log" aria-live="polite" className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {pending && <ThinkingIndicator />}
        </div>
      )}

      <div className="border-t border-line-soft p-2.5">
        <div className={cn(CHIP, 'items-end gap-1.5 py-1.5')}>
          <Textarea
            ref={textareaRef}
            value={draft}
            aria-label="Message"
            placeholder="Message"
            rows={1}
            className={cn(CHIP_INPUT, 'max-h-36 resize-none overflow-y-auto py-1')}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleComposerKeyDown}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Send"
            className="shrink-0"
            disabled={draft.trim().length === 0}
            onClick={() => send(draft)}
          >
            <ArrowUp className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </aside>
  );
}
