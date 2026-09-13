import type { UploadConfig } from "./demo/upload-schema";
export type UploadState = "ready" | "failed" | "complete";
export type Audience = "designer" | "po" | "engineer" | "participant";
// Demo contract alias: replace with the real design document contract at integration.
export type Config = UploadConfig;
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
  testSetup?: import("./test-setup").TestSetup | null;
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
