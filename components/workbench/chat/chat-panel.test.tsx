import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chatStorageKey } from '@/lib/chat/store';
import type { ChatTransport } from '@/lib/chat/transport';
import { PLACEHOLDER_REPLY_TEXT } from '@/lib/chat/transport';
import { ChatTransportProvider } from './chat-transport-context';
import { ChatPanel } from './chat-panel';

function renderPanel(
  { fileId = 'file1', onClose = vi.fn() }: { fileId?: string; onClose?: () => void } = {},
  transport?: ChatTransport,
) {
  const ui = <ChatPanel fileId={fileId} onClose={onClose} />;
  const utils = transport
    ? render(<ChatTransportProvider transport={transport}>{ui}</ChatTransportProvider>)
    : render(ui);
  return { ...utils, onClose };
}

async function sendMessage(text: string) {
  const composer = screen.getByLabelText('Message');
  await userEvent.type(composer, text);
  await userEvent.keyboard('{Enter}');
}

describe('ChatPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is a labeled panel with a title, a disabled Clear action and a close button', () => {
    renderPanel();
    expect(screen.getByRole('complementary', { name: 'Chat' })).toBeInTheDocument();
    expect(screen.getByText('Chat')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear conversation' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close chat' })).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    renderPanel({ onClose });
    await userEvent.click(screen.getByRole('button', { name: 'Close chat' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state with two example prompts when there is no history', () => {
    renderPanel();
    expect(screen.getByText('Ask about this design')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suggest a layout for this screen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Which components could replace this card?' })).toBeInTheDocument();
    expect(screen.queryByRole('log')).toBeNull();
  });

  it('an example prompt fills the composer and focuses it', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Suggest a layout for this screen' }));

    const composer = screen.getByLabelText('Message') as HTMLTextAreaElement;
    expect(composer).toHaveValue('Suggest a layout for this screen');
    expect(composer).toHaveFocus();
  });

  it('the Send button is disabled for empty input and enabled once text is typed', async () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Message'), 'Hi');
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('does not send an empty or whitespace-only message', async () => {
    renderPanel();
    await sendMessage('   ');

    expect(screen.queryByRole('log')).toBeNull();
    expect(screen.getByText('Ask about this design')).toBeInTheDocument();
  });

  it('Shift+Enter inserts a newline and does not send', async () => {
    renderPanel();
    const composer = screen.getByLabelText('Message') as HTMLTextAreaElement;
    await userEvent.type(composer, 'line one');
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    await userEvent.type(composer, 'line two');

    expect(composer).toHaveValue('line one\nline two');
    expect(screen.queryByRole('log')).toBeNull();
  });

  it('Escape in the composer blurs it', () => {
    renderPanel();
    const composer = screen.getByLabelText('Message');
    composer.focus();
    expect(composer).toHaveFocus();

    // A raw DOM event (not userEvent) so this exercises the component's own
    // keydown handler directly rather than relying on jsdom's own (partial)
    // Escape semantics.
    composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(composer).not.toHaveFocus();
  });

  it('Enter sends the message; it appears in the log and the assistant reply follows', async () => {
    renderPanel();
    await sendMessage('Hello there');

    expect(screen.getByRole('log')).toHaveTextContent('Hello there');
    expect(await screen.findByText(PLACEHOLDER_REPLY_TEXT, undefined, { timeout: 2000 })).toBeInTheDocument();
  });

  it('shows a "Thinking" indicator while the reply is pending, then removes it', async () => {
    renderPanel();
    await sendMessage('Hello there');

    expect(screen.getByRole('status', { name: 'Assistant is typing' })).toBeInTheDocument();
    await waitFor(
      () => expect(screen.queryByRole('status', { name: 'Assistant is typing' })).toBeNull(),
      { timeout: 2000 },
    );
  });

  it('persists the conversation to localStorage keyed by file id', async () => {
    renderPanel({ fileId: 'fileXYZ' });
    await sendMessage('Remember me');
    await screen.findByText(PLACEHOLDER_REPLY_TEXT, undefined, { timeout: 2000 });

    const raw = localStorage.getItem(chatStorageKey('fileXYZ'));
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw ?? '[]');
    expect(stored).toHaveLength(2);
    expect(stored[0]).toMatchObject({ role: 'user', text: 'Remember me' });
    expect(stored[1]).toMatchObject({ role: 'assistant', text: PLACEHOLDER_REPLY_TEXT });
  });

  it('a rejecting transport shows the error message instead of crashing', async () => {
    const transport: ChatTransport = { send: () => Promise.reject(new Error('boom')) };
    renderPanel({}, transport);
    await sendMessage('Hello there');

    expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument();
  });

  it('never calls fetch, even after a full send/receive round trip', async () => {
    renderPanel();
    await sendMessage('Hello there');
    await screen.findByText(PLACEHOLDER_REPLY_TEXT, undefined, { timeout: 2000 });

    expect(fetch).not.toHaveBeenCalled();
  });
});
