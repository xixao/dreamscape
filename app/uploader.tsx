"use client";

import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  FileText,
  House,
  RotateCcw,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Config, UploadState } from "@/lib/model";

export default function Uploader({
  config,
  state,
  onState,
  playing = true,
  annotate = false,
  onAnchor,
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
  compact?: boolean;
  focus?: "page" | "component" | "error";
  observeDisabled?: boolean;
  simulateFailure?: boolean;
}) {
  return (
    <div className={`product ${compact ? "compact" : ""} focus-${focus}`}>
      <header className="product-header">
        <span className="product-brand">
          <House size={19} /> Homepath
        </span>
        <span className="product-person">AJ</span>
      </header>
      <div className="product-main">
        <div className="product-progress">
          <span className="done">
            <Check size={12} /> Profile
          </span>
          <i />
          <span className="current">
            2 <span>Documents</span>
          </span>
          <i />
          <span>
            3 <span>Review</span>
          </span>
        </div>
        <p className="eyebrow">YOUR APPLICATION</p>
        <h2>One step closer.</h2>
        <p className="product-subtitle">Let's get your documents ready.</p>
        <section className="upload-card" data-component-id="document-uploader">
          <div className="relative">
            <h3>{config.title}</h3>
            {annotate && (
              <button
                className="anchor-pin"
                aria-label="Comment on uploader"
                onClick={() => onAnchor?.("document-uploader")}
              >
                1
              </button>
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
                  data-component-id="upload-error"
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
                    <button
                      className="anchor-pin error-pin"
                      aria-label="Comment on error"
                      onClick={() => onAnchor?.("upload-error")}
                    >
                      2
                    </button>
                  )}
                </div>
              ) : (
                <div className="upload-success" role="status">
                  <CheckCircle2 size={18} />
                  <span>Document received. You're all set.</span>
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
        Homepath demo · No files are uploaded
      </footer>
    </div>
  );
}
