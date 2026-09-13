export type DemoPrompt = { label: string; text: string };
export const reviewPrompts: DemoPrompt[] = [
  {
    label: "Review upload",
    text: "Review this upload flow and show the recovery checks.",
  },
  {
    label: "Suggest recovery",
    text: "Suggest a fix for the upload error and retry action.",
  },
  {
    label: "Research test",
    text: "Set up a Research mobile component test for the document upload.",
  },
];
export const testPrompts: DemoPrompt[] = [
  reviewPrompts[2],
  {
    label: "Teammate test",
    text: "Set up a Teammate desktop page test for the document upload.",
  },
  {
    label: "Recovery test",
    text: "Set up a Pilot mobile component test for upload failure and retry.",
  },
];

export function completeDemoPrompt(value: string, prompts: DemoPrompt[]) {
  const prefix = value.trimStart();
  if (!prefix) return "";
  const match = prompts.find(
    (p) =>
      p.text.toLowerCase().startsWith(prefix.toLowerCase()) &&
      p.text.length > prefix.length,
  );
  return match ? value + match.text.slice(prefix.length) : "";
}
