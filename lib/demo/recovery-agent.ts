export function demoPromptIntent(prompt: string) {
  if (/show me (the )?designs?|design specification|component guide/i.test(prompt)) return "designs";
  if (/show me (the )?(poc|proof of concept)|poc (guide|overview)|prototype overview/i.test(prompt)) return "poc";
  if (/(?:how many|count|number of).*(?:tests?|sessions?).*(?:complete|finished)|(?:completed|finished).*(?:tests?|sessions?).*(?:how many|count)/i.test(prompt)) return "completed-tests";
  if (/(?:show me (?:the )?|show (?:the )?)?(?:test|testing|participant) results\b|results from (?:the )?test/i.test(prompt)) return "results";
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
  designs: "Opening the Design Specification & Component Guide for the current uploader.",
  poc: "Opening the Flow Review POC & Experience Guide.",
  results: "Opening the test results for the saved design.",
  completedTests: (complete: number, total: number, version: number) =>
    total === 0
      ? `No test sessions have been recorded for saved v${version} yet.`
      : `${complete} of ${total} test ${total === 1 ? "session" : "sessions"} on saved v${version} ${complete === 1 ? "is" : "are"} complete.`,
  resultsUnavailable: "I couldn't load the latest test results, so I can't verify the completed count right now.",
  unsupported:
    "This demo can review upload recovery and propose the scripted fix. Try 'Review this flow'. No live AI model is connected.",
} as const;
