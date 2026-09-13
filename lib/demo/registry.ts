/** Stable demo markers, not database keys. Keep legacy anchors for saved feedback. */
export const DEMO_IDS = {
  upload: "flow-demo:document-upload:v1",
  recoveryAgent: "flow-demo:recovery-agent:v1",
  testSetupAgent: "flow-demo:test-setup-agent:v1",
  readiness: "flow-demo:upload-checks:v1",
  properties: "flow-demo:upload-properties:v1",
  caseStudy: "flow-demo:upload-case-study:v1",
} as const;

export const UPLOAD_ANCHORS = {
  component: "document-uploader",
  error: "upload-error",
} as const;
