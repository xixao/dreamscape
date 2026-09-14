"use client";

import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Code2,
  FileText,
  House,
  RotateCcw,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import NumberMarker from "@/components/number-marker";
import CommentPin from "@/components/comment-pin";
import type { Comment, Config, UploadState } from "@/lib/model";
import { DEMO_IDS, UPLOAD_ANCHORS } from "@/lib/demo/registry";

export default function DocumentUploader({
  config,
  state,
  onState,
  playing = true,
  annotate = false,
  onAnchor,
  anchorComments = [],
  onOpenComment,
  onCommentAction,
  onViewCode,
  commentBusy = false,
  compact = false,
  focus = "page",
  observeDisabled = false,
  simulateFailure = true,
}: {
  config: Config;
  state: UploadState;
  onState: (state: UploadState, event: string) => void;
  playing?: boolean;
  annotate?: boolean;
  onAnchor?: (anchor: string) => void;
  anchorComments?: Comment[];
  onOpenComment?: (comment: Comment) => void;
  onCommentAction?: (data: Record<string, unknown>) => Promise<boolean>;
  onViewCode?: () => void;
  commentBusy?: boolean;
  compact?: boolean;
  focus?: "page" | "component" | "error";
  observeDisabled?: boolean;
  simulateFailure?: boolean;
}) {
  return (
    <div
      data-demo-id={DEMO_IDS.upload}
      className={`product ${compact ? "compact" : ""} focus-${focus}`}
    >
      <header className="product-header">
        <span className="product-brand">
          <House size={19} /> Homepath
        </span>
        <span className="product-person">AJ</span>
      </header>
      <div className="product-main">
        <ol className="product-progress" aria-label="Application progress">
          <li className="done">
            <Check size={12} aria-hidden="true" />
            <span>Profile complete</span>
          </li>
          <li className="current" aria-current="step">
            <NumberMarker value={2} variant="progress" selected decorative />
            <span>Documents</span>
          </li>
          <li>
            <NumberMarker value={3} variant="progress" decorative />
            <span>Review</span>
          </li>
        </ol>
        <p className="eyebrow">YOUR APPLICATION</p>
        <h2>One step closer.</h2>
        <p className="product-subtitle">Let&apos;s get your documents ready.</p>
        <section
          className="upload-card"
          data-component-id={UPLOAD_ANCHORS.component}
        >
          <div className={`relative ${onViewCode ? "upload-heading-with-code" : ""}`}>
            <h3>{config.title}</h3>
            {onViewCode && <Button variant="ghost" size="icon" aria-label="View DocumentUploader code" title="View DocumentUploader code" onClick={onViewCode}><Code2 size={17} /></Button>}
            {annotate && (
              <CommentPin
                number={1}
                label="Uploader"
                comments={anchorComments.filter((comment) => comment.anchor === UPLOAD_ANCHORS.component)}
                onAddComment={() => onAnchor?.(UPLOAD_ANCHORS.component)}
                onOpenComment={onOpenComment}
                onAction={onCommentAction}
                busy={commentBusy}
              />
            )}
          </div>
          <p className="helper">{config.helper}</p>
          {state === "ready" ? (
            <div className="drop-zone">
              <Upload size={29} strokeWidth={1.5} />
              <strong>Pay-statement.pdf</strong>
              <span>Sample document · 240 KB</span>
              <Button
                data-test-action="upload"
                disabled={!observeDisabled && !playing}
                aria-disabled={!playing}
                onClick={() => {
                  if (playing)
                    onState(
                      simulateFailure ? "failed" : "complete",
                      simulateFailure ? "upload_attempt" : "upload_success",
                    );
                }}
              >
                {config.button}
                <ArrowRight size={15} />
              </Button>
            </div>
          ) : (
            <>
              <div className={`file-row ${state}`}>
                <span className="file-symbol">
                  <FileText size={24} />
                </span>
                <div>
                  <strong>Pay-statement.pdf</strong>
                  <span>240 KB · PDF</span>
                </div>
                {state === "complete" ? (
                  <CheckCircle2 size={21} />
                ) : (
                  <AlertCircle size={21} />
                )}
              </div>
              {state === "failed" ? (
                <div
                  className="upload-error"
                  role={config.announceError ? "alert" : undefined}
                  data-component-id={UPLOAD_ANCHORS.error}
                >
                  <div>
                    <AlertCircle size={17} />
                    <p>{config.error}</p>
                  </div>
                  {config.retryEnabled && (
                    <Button
                      variant="outline"
                      data-test-action="retry"
                      disabled={!observeDisabled && !playing}
                      aria-disabled={!playing}
                      onClick={() => {
                        if (playing) onState("complete", "retry_success");
                      }}
                    >
                      <RotateCcw size={15} />
                      Try again
                    </Button>
                  )}
                  {annotate && (
                    <CommentPin
                      number={2}
                      label="Upload error"
                      className="error-pin"
                      comments={anchorComments.filter((comment) => comment.anchor === UPLOAD_ANCHORS.error)}
                      onAddComment={() => onAnchor?.(UPLOAD_ANCHORS.error)}
                      onOpenComment={onOpenComment}
                      onAction={onCommentAction}
                      busy={commentBusy}
                    />
                  )}
                </div>
              ) : (
                <div className="upload-success" role="status">
                  <CheckCircle2 size={18} />
                  <span>Document received. You&apos;re all set.</span>
                </div>
              )}
            </>
          )}
          <div className="upload-foot">
            <span>PDF, JPG, or PNG</span>
            <span>Up to 10 MB</span>
          </div>
        </section>
        <div className="product-bottom">
          <span>All information is fictional.</span>
          <Button
            data-test-action="continue"
            disabled={!observeDisabled && (state !== "complete" || !playing)}
            aria-disabled={state !== "complete" || !playing}
            onClick={() => {
              if (state === "complete" && playing)
                onState("complete", "continue");
            }}
          >
            Continue
            <ArrowRight size={15} />
          </Button>
        </div>
      </div>
      <footer className="product-footer">
        Sample document · No files are uploaded
      </footer>
    </div>
  );
}
