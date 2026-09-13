export function demoPromptIntent(prompt: string) {
  if (/test|study|pilot|research/i.test(prompt)) return "test";
  if (/review|fix|upload|error|accessib|retry/i.test(prompt)) return "review";
  return "unsupported";
}

export const recoveryAgent = {
  delayMs: 900,
  review: (passed: number) =>
    passed === 3
      ? "The three demo rules pass. I would still ask a person to check keyboard recovery, screen-reader output, and the wording."
      : "The upload ends without a clear recovery path. I suggest keeping the selected file, explaining what happened, and making retry available.",
  applied:
    "The changes are saved. The file stays selected, the retry button works, and the error now uses an alert announcement.",
  prepared:
    "Your test draft is prepared. Review its audience and instructions, then create the test to get a share link and try it.",
  unsupported:
    "This demo can review upload recovery and propose the scripted fix. Try 'Review this flow'. No live AI model is connected.",
} as const;
