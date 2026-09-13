"use client";
import { improvement } from "@/lib/demo/upload";
import { useState } from "react";
import {
  ArrowRight,
  Check,
  Frame,
  Hand,
  Layers3,
  MessageSquare,
  Monitor,
  MousePointer2,
  Save,
  Send,
  Smartphone,
  Sparkles,
  Type,
  ZoomIn,
  ZoomOut,
  Scan,
  Moon,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  type Config,
  type Comment,
  type Revision,
  type UploadState,
} from "@/lib/model";
import PreviewCanvas from "./preview-canvas";
import Uploader from "@/app/demo/document-upload";

export default function DesignWorkspace({
  draft,
  onChange,
  revision,
  state,
  onState,
  anchor,
  onAnchor,
  onReview,
  onSave,
  busy,
  loaded,
  error,
  dark,
  onTheme,
  comments,
}: {
  draft: Config;
  onChange: (c: Config) => void;
  revision: Revision;
  state: UploadState;
  onState: (s: UploadState) => void;
  anchor: string;
  onAnchor: (s: string) => void;
  onReview: (feedback?: boolean) => void;
  onSave: () => void;
  busy: boolean;
  loaded: boolean;
  error: string;
  dark: boolean;
  onTheme: () => void;
  comments: Comment[];
}) {
  const [tab, setTab] = useState("agent"),
    [prompt, setPrompt] = useState(""),
    [proposal, setProposal] = useState(false),
    [reply, setReply] = useState("");
  const [zoom, setZoom] = useState<number | "fit">("fit"),
    [reset, setReset] = useState(0),
    [viewport, setViewport] = useState("desktop"),
    [focus, setFocus] = useState<"page" | "component">("page");
  const dirty = JSON.stringify(draft) !== JSON.stringify(revision.config);
  const feedback = comments.filter(
    (c) => !c.parentId && c.revisionId === revision.id,
  );
  function tool(
    label: string,
    icon: React.ReactNode,
    click: () => void,
    active = false,
  ) {
    return (
      <Button
        variant="ghost"
        size="icon"
        title={label}
        aria-label={label}
        aria-pressed={active}
        onClick={click}
      >
        {icon}
      </Button>
    );
  }
  function ask() {
    if (!prompt.trim()) return;
    setProposal(true);
    setReply(
      "I prepared the recovery changes: clearer error text, a Retry button, and an error announcement. Review before applying.",
    );
    setPrompt("");
    onState("failed");
  }
  return (
    <div className="studio design-workspace">
      <header className="design-header">
        <span className="studio-brand">
          <Layers3 />
          Flow Studio
        </span>
        <span className="design-breadcrumb">Homepath / Document upload</span>
        <span className="design-save-status">
          {!loaded
            ? "Loading…"
            : dirty
              ? "Unsaved draft"
              : `Saved · v${revision.number}`}
        </span>
        {tool(
          dark ? "Use light mode" : "Use dark mode",
          dark ? <Sun size={17} /> : <Moon size={17} />,
          onTheme,
        )}
        <Button
          variant="outline"
          disabled={busy || !loaded || !dirty}
          onClick={onSave}
        >
          <Save size={15} />
          {busy ? "Saving…" : "Save version"}
        </Button>
        <Button onClick={() => onReview()}>
          <span>Review & Test</span>
          <ArrowRight size={16} />
        </Button>
      </header>
      {error && (
        <div className="error-banner" role="alert">
          {error}
          {/sign in/i.test(error) && (
            <a href="/signin-with-chatgpt?return_to=/">Sign in</a>
          )}
        </div>
      )}
      <div className="design-tools">
        {tool(
          "Select component",
          <MousePointer2 size={18} />,
          () => {
            onAnchor("document-uploader");
            setTab("design");
          },
          tab === "design",
        )}
        {tool(
          "Focus component",
          <Frame size={18} />,
          () => {
            setFocus(focus === "page" ? "component" : "page");
            setZoom("fit");
          },
          focus === "component",
        )}
        {tool("Edit text", <Type size={18} />, () => {
          setTab("design");
          requestAnimationFrame(() =>
            document.getElementById("design-title")?.focus(),
          );
        })}
        {tool("Review comments", <MessageSquare size={18} />, () =>
          onReview(true),
        )}
        {tool("Recenter canvas", <Hand size={18} />, () => {
          setReset((n) => n + 1);
          setZoom("fit");
        })}
        <div className="design-tool-spacer" />
        {tool(
          "Desktop",
          <Monitor size={18} />,
          () => setViewport("desktop"),
          viewport === "desktop",
        )}
        {tool(
          "Mobile",
          <Smartphone size={18} />,
          () => setViewport("mobile"),
          viewport === "mobile",
        )}
        {tool("Zoom out", <ZoomOut size={18} />, () =>
          setZoom(Math.max(0.15, (zoom === "fit" ? 1 : zoom) - 0.25)),
        )}
        <span className="design-zoom">
          {zoom === "fit" ? "Fit" : `${Math.round(zoom * 100)}%`}
        </span>
        {tool("Zoom in", <ZoomIn size={18} />, () =>
          setZoom(Math.min(3, (zoom === "fit" ? 1 : zoom) + 0.25)),
        )}
        {tool("Fit canvas", <Scan size={18} />, () => {
          setReset((n) => n + 1);
          setZoom("fit");
        })}
      </div>
      <main className="design-body">
        <aside className="design-layers" aria-label="Layers">
          <h2>Layers</h2>
          <p className="design-page-name">Application</p>
          <button
            className={anchor === "document-uploader" ? "selected" : ""}
            onClick={() => {
              onAnchor("document-uploader");
              setTab("design");
            }}
          >
            <Layers3 size={15} />
            Document uploader
          </button>
          <button
            className="child-layer"
            onClick={() => {
              onAnchor("document-uploader");
              setTab("design");
              requestAnimationFrame(() =>
                document.getElementById("design-title")?.focus(),
              );
            }}
          >
            <Type size={14} />
            Heading
          </button>
          <button
            className="child-layer"
            onClick={() => {
              setTab("design");
              requestAnimationFrame(() =>
                document.getElementById("design-helper")?.focus(),
              );
            }}
          >
            <Type size={14} />
            Helper text
          </button>
          <button
            className={`child-layer ${anchor === "upload-error" ? "selected" : ""}`}
            onClick={() => {
              onAnchor("upload-error");
              onState("failed");
              setTab("design");
            }}
          >
            <Frame size={14} />
            Error message
          </button>
          <button
            className="child-layer"
            onClick={() => {
              onAnchor("upload-error");
              onState("failed");
              setTab("design");
              requestAnimationFrame(() =>
                document.getElementById("design-retry")?.focus(),
              );
            }}
          >
            <ArrowRight size={14} />
            Retry button
          </button>
          <div className="design-system-label">
            <div className="design-library-heading">
              <Layers3 size={17} />
              <strong>Component library</strong>
            </div>
            <span>Upload / Default</span>
            <small>Demo component</small>
          </div>
        </aside>
        <section className="design-stage" aria-label="Design canvas">
          <PreviewCanvas
            zoom={zoom}
            onZoom={setZoom}
            resetKey={reset}
            viewport={viewport}
            paired={false}
            focus={focus}
            feedback={false}
          >
            <div
              className={`device-wrap ${viewport === "mobile" ? "mobile-wrap" : ""} design-selected`}
              data-selected-anchor={anchor}
            >
              <div className="device-label">
                Document upload · {viewport}
                <span>{dirty ? "Draft" : `v${revision.number}`}</span>
              </div>
              <Uploader
                config={draft}
                state={state}
                onState={onState}
                compact={viewport === "mobile"}
                focus={focus}
                annotate
                onAnchor={(a) => {
                  onAnchor(a);
                  setTab("design");
                }}
              />
            </div>
          </PreviewCanvas>
          <div
            className="design-state-bar"
            role="group"
            aria-label="Component state"
          >
            {(["ready", "failed", "complete"] as const).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={state === s ? "secondary" : "ghost"}
                aria-pressed={state === s}
                onClick={() => onState(s)}
              >
                {s === "ready"
                  ? "Ready"
                  : s === "failed"
                    ? "Failed"
                    : "Complete"}
              </Button>
            ))}
          </div>
        </section>
        <aside className="design-inspector">
          <div
            className="design-inspector-tabs"
            role="group"
            aria-label="Inspector mode"
          >
            <Button
              variant="ghost"
              aria-pressed={tab === "design"}
              onClick={() => setTab("design")}
            >
              Design
            </Button>
            <Button
              variant="ghost"
              aria-pressed={tab === "agent"}
              onClick={() => setTab("agent")}
            >
              <Sparkles size={15} />
              Agent
            </Button>
          </div>
          <div className="design-selection">
            <Frame size={16} />
            <strong>
              {anchor === "upload-error"
                ? "Error message"
                : "Document uploader"}
            </strong>
          </div>
          {tab === "design" ? (
            <div className="design-properties">
              <label htmlFor="design-title">Heading</label>
              <Input
                id="design-title"
                maxLength={80}
                value={draft.title}
                onChange={(e) => onChange({ ...draft, title: e.target.value })}
              />
              <label htmlFor="design-helper">Helper text</label>
              <Textarea
                id="design-helper"
                maxLength={180}
                value={draft.helper}
                onChange={(e) => onChange({ ...draft, helper: e.target.value })}
              />
              <label htmlFor="design-error">Error message</label>
              <Textarea
                id="design-error"
                maxLength={220}
                value={draft.error}
                onChange={(e) => onChange({ ...draft, error: e.target.value })}
              />
              <label htmlFor="design-button">Upload button</label>
              <Input
                id="design-button"
                maxLength={40}
                value={draft.button}
                onChange={(e) => onChange({ ...draft, button: e.target.value })}
              />
              <label className="design-check">
                <Checkbox
                  id="design-retry"
                  checked={draft.retryEnabled}
                  onCheckedChange={(v) =>
                    onChange({ ...draft, retryEnabled: v === true })
                  }
                />
                Retry action
              </label>
              <label className="design-check">
                <Checkbox
                  checked={draft.announceError}
                  onCheckedChange={(v) =>
                    onChange({ ...draft, announceError: v === true })
                  }
                />
                Announce error
              </label>
            </div>
          ) : (
            <>
              <div className="design-agent-thread">
                <div className="section-heading">
                  <h2>Design agent</h2>
                </div>
                <Button
                  variant="outline"
                  className="design-agent-suggestion"
                  onClick={() => {
                    setPrompt("Add a retry action and make the error clearer.");
                  }}
                >
                  Add a clearer recovery path
                </Button>
                {reply && (
                  <p role="status" className="design-agent-reply">
                    {reply}
                  </p>
                )}
                {proposal && (
                  <div className="design-proposal">
                    <p>
                      <Check size={15} />
                      Clearer error message
                    </p>
                    <p>
                      <Check size={15} />
                      Retry and announcement
                    </p>
                    <Button
                      onClick={() => {
                        onChange({ ...draft, ...improvement });
                        setProposal(false);
                        setReply(
                          "Changes applied to your draft. Save a version when you are ready.",
                        );
                      }}
                    >
                      Apply changes
                    </Button>
                    <Button variant="ghost" onClick={() => setProposal(false)}>
                      Dismiss
                    </Button>
                  </div>
                )}
                <div className="design-feedback">
                  <h3>
                    {feedback.length} review{" "}
                    {feedback.length === 1 ? "comment" : "comments"}
                  </h3>
                  {feedback.slice(0, 3).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        onAnchor(c.anchor);
                        onState(c.state);
                        onReview(true);
                      }}
                    >
                      <strong>{c.author}</strong>
                      <p>{c.text}</p>
                    </button>
                  ))}
                  {!feedback.length && <p>No comments on this version.</p>}
                </div>
              </div>
              <form
                className="design-agent-composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  ask();
                }}
              >
                <Textarea
                  aria-label="Message design agent"
                  placeholder="Ask the agent to edit this component…"
                  value={prompt}
                  maxLength={600}
                  onChange={(e) => setPrompt(e.target.value)}
                />
                <div>
                  <span>Scripted responses · Review before applying</span>
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!prompt.trim()}
                    title="Send prompt"
                    aria-label="Send prompt"
                  >
                    <Send size={16} />
                  </Button>
                </div>
              </form>
            </>
          )}
        </aside>
      </main>
      <footer className="design-footer">
        <span>
          <span className="design-status-label">Selected:</span>{" "}
          <strong>
            {anchor === "upload-error" ? "Error message" : "Document uploader"}
          </strong>
        </span>
        <span>{dirty ? "Unsaved draft" : `Version ${revision.number}`}</span>
      </footer>
    </div>
  );
}
