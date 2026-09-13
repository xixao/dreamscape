import { z } from "zod";
export const testAudiences = [
  "Teammate",
  "Business",
  "Development",
  "Research",
  "Pilot",
] as const;
export const testSetupSchema = z
  .object({
    audience: z.enum(testAudiences),
    title: z.string().trim().min(1).max(100),
    instructions: z.string().trim().min(1).max(1000),
    task: z.string().trim().min(1).max(300),
    focus: z.enum(["page", "component"]),
    viewport: z.enum(["desktop", "mobile"]),
    scenario: z.enum(["success", "recovery"]),
  })
  .strict();
export type TestSetup = z.infer<typeof testSetupSchema>;
export const defaultTestSetup: TestSetup = {
  audience: "Teammate",
  title: "Try a document upload.",
  instructions:
    "Imagine you are getting a home application ready. Use the sample pay statement, then continue. Try what feels natural if you get stuck.",
  task: "Upload the sample pay statement and continue.",
  focus: "page",
  viewport: "desktop",
  scenario: "success",
};
export function scriptedTestSetup(
  prompt: string,
  canRetry: boolean,
): TestSetup {
  const lower = prompt.toLowerCase();
  const audience =
    testAudiences.find((a) => lower.includes(a.toLowerCase())) ?? "Teammate";
  const recovery = canRetry && /recover|retry|fail/.test(lower);
  return {
    ...defaultTestSetup,
    audience,
    viewport: /mobile|phone/.test(lower) ? "mobile" : "desktop",
    focus: /component/.test(lower) ? "component" : "page",
    scenario: recovery ? "recovery" : "success",
    title: `${audience} · ${recovery ? "Upload recovery" : "Document upload"}`,
    task: recovery
      ? "Upload the sample pay statement, recover if the upload fails, and continue."
      : defaultTestSetup.task,
  };
}
