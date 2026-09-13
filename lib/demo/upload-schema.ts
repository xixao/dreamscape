import { z } from "zod";

export const configSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    helper: z.string().trim().max(180),
    error: z.string().trim().min(1).max(220),
    button: z.string().trim().min(1).max(40),
    retryEnabled: z.boolean(),
    announceError: z.boolean(),
  })
  .strict();

export type UploadConfig = z.infer<typeof configSchema>;
