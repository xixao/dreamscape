import { z } from 'zod';
import { getDb } from '@/db/client';
import { createFilesRepository } from './repository';

export async function getRepository() {
  return createFilesRepository(await getDb());
}

// Shared with saveBody below: same rules the repository applies to a file
// name (trimmed, non-empty, capped at 120 characters).
const nameField = z.string().trim().min(1).max(120).optional();

export const createBody = z.object({
  name: nameField,
  example: z.enum(['login']).optional(),
});

export type CreateBody = z.infer<typeof createBody>;

// zod v4 deprecates `z.string().datetime()` in favor of `z.iso.datetime()`;
// using the latter here. Its default (no `offset`/`precision` options)
// requires a `Z`-suffixed, seconds-and-up timestamp, which is exactly what
// `Date.prototype.toISOString()` (what the repository returns) produces.
export const saveBody = z
  .object({
    name: nameField,
    layout: z.string().optional(),
    stageWidth: z.number().int().optional(),
    baseUpdatedAt: z.iso.datetime().optional(),
  })
  .refine(
    (body) => body.name !== undefined || body.layout !== undefined || body.stageWidth !== undefined,
    'empty patch',
  );

export type SaveBody = z.infer<typeof saveBody>;
