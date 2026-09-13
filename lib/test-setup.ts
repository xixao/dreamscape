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
