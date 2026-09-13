import type { Config, UploadState } from "../model";

export const uploadStates: UploadState[] = ["ready", "failed", "complete"];
export const uploadEvents = [
  "upload_attempt",
  "upload_success",
  "retry_success",
  "continue",
  "gave_up",
] as const;
export type UploadEvent = (typeof uploadEvents)[number];

/** Legacy links have no scenario; preserve their recorded event compatibility. */
export function uploadEventError(
  event: UploadEvent,
  prior: string | undefined,
  retryEnabled: boolean,
  scenario?: "success" | "recovery",
) {
  if (event === "upload_attempt" && (prior || scenario === "success"))
    return "A failed upload cannot start in this state or scenario";
  if (
    event === "upload_success" &&
    (prior || (scenario ? scenario !== "success" : retryEnabled))
  )
    return "Direct upload success unavailable";
  if (
    event === "retry_success" &&
    (prior !== "upload_attempt" || !retryEnabled)
  )
    return "Retry unavailable";
  if (
    event === "continue" &&
    prior !== "retry_success" &&
    prior !== "upload_success"
  )
    return "Document must be received first";
  return null;
}

export const baseline: Config = {
  title: "Upload your document",
  helper: "Add your most recent pay statement.",
  error: "Something went wrong.",
  button: "Upload document",
  retryEnabled: false,
  announceError: false,
};

export const improvement: Partial<Config> = {
  error:
    "Your upload was interrupted. Your document is still selected. Try again.",
  retryEnabled: true,
  announceError: true,
};

export function checks(config: Config) {
  return [
    {
      id: "recovery",
      title: "Recovery action",
      pass: config.retryEnabled,
      detail: config.retryEnabled
        ? "A retry action is available in the failed state."
        : "The failed state has no way to retry.",
      kind: "Behavior rule",
    },
    {
      id: "copy",
      title: "Error guidance",
      pass: config.error.trim().length > 35,
      detail:
        config.error.trim().length > 35
          ? "Error copy includes additional guidance. Human review still required."
          : "Short, generic error copy needs a clear next step.",
      kind: "Copy heuristic",
    },
    {
      id: "announcement",
      title: "Error announcement",
      pass: config.announceError,
      detail: config.announceError
        ? "The error uses role=alert. Verify with a screen reader."
        : "The error is not announced as an alert.",
      kind: "Component rule",
    },
  ];
}
export const uploadStateOptions = [
  { value: "ready", label: "Ready to upload" },
  { value: "failed", label: "Upload interrupted" },
  { value: "complete", label: "Document received" },
] as const;
export const uploadStateShortOptions = [
  { value: "ready", label: "Ready" },
  { value: "failed", label: "Error" },
  { value: "complete", label: "Success" },
] as const;
