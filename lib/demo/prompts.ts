import type { PromptSuggestion } from "../prompt-completion";
export const reviewPrompts: PromptSuggestion[] = [
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
export const testPrompts: PromptSuggestion[] = [
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
