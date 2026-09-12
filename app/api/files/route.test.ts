// @vitest-environment node
//
// Focused on one thing: a thrown, non-validation error from the repository
// must propagate out of POST (so Next answers with its default 500)
// instead of being caught and echoed back as a 400. The rest of this
// route's behavior (real create paths, examples, malformed JSON, ...) is
// covered end-to-end against a real repository in ./files.test.ts; this
// file mocks the repository so it can force an arbitrary thrown error.
import { describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const create = vi.fn();

vi.mock('@/lib/files/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/files/http')>();
  return {
    ...actual,
    getRepository: async () => ({
      list: vi.fn(),
      get: vi.fn(),
      create,
      save: vi.fn(),
      duplicate: vi.fn(),
      remove: vi.fn(),
    }),
  };
});

function jsonRequest(body: unknown): Request {
  return new Request('http://x/api/files', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/files', () => {
  it('propagates a thrown non-validation repository error instead of turning it into a 400', async () => {
    create.mockRejectedValueOnce(new Error('connection reset'));

    await expect(POST(jsonRequest({}))).rejects.toThrow('connection reset');
  });
});
