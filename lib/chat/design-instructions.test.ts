import { describe, expect, it, vi } from 'vitest';
import { DESIGN_INSTRUCTIONS, sendDesignRequest } from './design-instructions';

describe('design guidance envelope', () => {
  it('attaches the same guidance to initial and follow-up requests for any transport', async () => {
    const transport = { send: vi.fn().mockResolvedValue('response') };
    const signal = new AbortController().signal;
    await sendDesignRequest(transport, [], 'Create variations', signal);
    await sendDesignRequest(transport, [], 'Refine the layout', signal);
    for (const [history, text, passedSignal] of transport.send.mock.calls) {
      expect(history).toEqual([]);
      expect(text).toContain(DESIGN_INSTRUCTIONS);
      expect(passedSignal).toBe(signal);
    }
    expect(transport.send.mock.calls[1][1]).toContain('Refine the layout');
  });
});
