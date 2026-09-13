import type { Journey } from "../journey";
export const demoJourney: Journey = {
  title: "From application to submission",
  steps: [
    {
      id: "demo-start",
      title: "Start application",
      goal: "Know what I need to get started.",
      action: "Start a new application.",
      notes: "Entry page and returning-user state are not connected.",
      link: "none",
    },
    {
      id: "demo-documents",
      title: "Add documents",
      goal: "Provide the right document with confidence.",
      action: "Upload the sample pay statement.",
      notes: "Check file requirements before starting.",
      link: "ready",
    },
    {
      id: "demo-recovery",
      title: "Recover from an error",
      goal: "Continue without losing my selected document.",
      action: "Read the error and try the upload again.",
      notes: "Review retry availability and error announcement.",
      link: "failed",
    },
    {
      id: "demo-review",
      title: "Review documents",
      goal: "Know that my document was received.",
      action: "Confirm the upload and continue.",
      notes:
        "Only the upload confirmation is connected, not an application review page.",
      link: "complete",
    },
    {
      id: "demo-submit",
      title: "Submit application",
      goal: "Know my application was submitted.",
      action: "Submit and receive confirmation.",
      notes: "Submission and confirmation pages are not connected.",
      link: "none",
    },
  ],
};
