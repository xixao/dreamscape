export type UploadState = "ready" | "failed" | "complete";
export type Audience = "designer" | "po" | "engineer" | "participant";
export type Config = {
  title: string;
  helper: string;
  error: string;
  button: string;
  retryEnabled: boolean;
  announceError: boolean;
};
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
export type Revision = {
  id: string;
  number: number;
  config: Config;
  note: string;
  createdAt: string;
};
export type Comment = {
  id: string;
  parentId: string | null;
  text: string;
  author: string;
  revisionId: string;
  state: UploadState;
  viewport: string;
  anchor: string;
  resolved: boolean;
  assignee: string;
  likes: number;
  liked: boolean;
  dislikes: number;
  fuegos: number;
  reaction: "like" | "dislike" | "fuego" | null;
  createdAt: string;
};
export type Session = {
  id: string;
  revisionId: string;
  outcome: "started" | "complete" | "gave_up";
  duration: number | null;
  feedback: string;
  events: { type: string; at: number }[];
  interactions: {
    id: string;
    target: string;
    state: UploadState;
    available: boolean;
    at: number;
  }[];
  rating: number | null;
  fuego: boolean;
  createdAt: string;
};
export type Workspace = {
  revisions: Revision[];
  comments: Comment[];
  sessions: Session[];
  preferences: { comments: boolean; revisions: boolean; tests: boolean };
  name: string;
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
