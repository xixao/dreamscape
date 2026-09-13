import { z } from "zod";

export const journeySchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    steps: z
      .array(
        z
          .object({
            id: z.string().min(1).max(60),
            title: z.string().trim().min(1).max(80),
            goal: z.string().trim().max(250),
            action: z.string().trim().max(250),
            notes: z.string().trim().max(300),
            link: z.enum(["none", "ready", "failed", "complete"]),
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict()
  .refine(
    (j) => new Set(j.steps.map((s) => s.id)).size === j.steps.length,
    "Step IDs must be unique",
  );
export type Journey = z.infer<typeof journeySchema>;
export type JourneyStep = Journey["steps"][number];
export type SavedJourney = { journey: Journey; version: number };
export function moveJourneyStep(
  steps: JourneyStep[],
  from: number,
  to: number,
) {
  if (from < 0 || to < 0 || from >= steps.length || to >= steps.length)
    return steps;
  const result = [...steps];
  const [step] = result.splice(from, 1);
  result.splice(to, 0, step);
  return result;
}
