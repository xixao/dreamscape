import { z } from "zod";

export const journeySchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    layout: z.enum(["auto", "manual"]).optional(),
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
            position: z.object({
              x: z.number().finite().min(0).max(5000),
              y: z.number().finite().min(0).max(5000),
            }).strict().optional(),
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
export type JourneyPosition = NonNullable<JourneyStep["position"]>;
export type SavedJourney = { journey: Journey; version: number };
export const JOURNEY_NODE_WIDTH = 224;
export const JOURNEY_NODE_HEIGHT = 200;
const JOURNEY_GAP_X = 64;
const JOURNEY_GAP_Y = 52;
const JOURNEY_PADDING = 24;

export function autoJourneyPositions(steps: JourneyStep[], canvasWidth: number) {
  const columns = Math.max(1, Math.min(3, Math.floor((canvasWidth - 2 * JOURNEY_PADDING + JOURNEY_GAP_X) / (JOURNEY_NODE_WIDTH + JOURNEY_GAP_X))));
  return Object.fromEntries(steps.map((step, index) => {
    const row = Math.floor(index / columns);
    const withinRow = index % columns;
    const column = row % 2 === 0 ? withinRow : columns - 1 - withinRow;
    return [step.id, {
      x: JOURNEY_PADDING + column * (JOURNEY_NODE_WIDTH + JOURNEY_GAP_X),
      y: JOURNEY_PADDING + row * (JOURNEY_NODE_HEIGHT + JOURNEY_GAP_Y),
    }];
  })) as Record<string, JourneyPosition>;
}

export function journeyConnection(from: JourneyPosition, to: JourneyPosition) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const right = dx >= 0;
    const x1 = from.x + (right ? JOURNEY_NODE_WIDTH : 0);
    const x2 = to.x + (right ? 0 : JOURNEY_NODE_WIDTH);
    const y1 = from.y + JOURNEY_NODE_HEIGHT / 2;
    const y2 = to.y + JOURNEY_NODE_HEIGHT / 2;
    const bend = (x1 + x2) / 2;
    return { path: `M ${x1} ${y1} C ${bend} ${y1}, ${bend} ${y2}, ${x2} ${y2}`, sourcePort: right ? "right" : "left", targetPort: right ? "left" : "right" };
  }
  const down = dy >= 0;
  const x1 = from.x + JOURNEY_NODE_WIDTH / 2;
  const x2 = to.x + JOURNEY_NODE_WIDTH / 2;
  const y1 = from.y + (down ? JOURNEY_NODE_HEIGHT : 0);
  const y2 = to.y + (down ? 0 : JOURNEY_NODE_HEIGHT);
  const bend = (y1 + y2) / 2;
  return { path: `M ${x1} ${y1} C ${x1} ${bend}, ${x2} ${bend}, ${x2} ${y2}`, sourcePort: down ? "bottom" : "top", targetPort: down ? "top" : "bottom" };
}
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
