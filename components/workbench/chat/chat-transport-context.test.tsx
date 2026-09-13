import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ChatTransport } from '@/lib/chat/transport';
import { placeholderTransport } from '@/lib/chat/transport';
import { ChatTransportProvider, useChatTransport } from './chat-transport-context';

function Probe() {
  const transport = useChatTransport();
  return <output data-testid="probe">{transport === placeholderTransport ? 'placeholder' : 'custom'}</output>;
}

describe('useChatTransport', () => {
  it('defaults to the placeholder transport when there is no provider', () => {
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('placeholder');
  });

  it('reflects the transport given to ChatTransportProvider', () => {
    const custom: ChatTransport = { send: async () => 'custom reply' };
    render(
      <ChatTransportProvider transport={custom}>
        <Probe />
      </ChatTransportProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('custom');
  });
});
