"use client";
import { improvement } from "@/lib/demo/upload";
import { DEMO_IDS } from "@/lib/demo/registry";
import { discussionThreads, sameConfig } from "@/lib/review";
import IconButton from "@/components/icon-button";
import StateSelector from "@/components/state-selector";
import { uploadStateShortOptions } from "@/lib/demo/upload";
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
import RightPanel from "@/components/right-panel";
import PromptVoiceControls from "@/components/prompt-voice-controls";
import GuidedPrompt from "@/components/guided-prompt";
import { reviewPrompts } from "@/lib/demo/prompts";
import PhoneModelSelect from "@/components/phone-model-select";
import { previewPhoneLabel, previewPhoneWidth, type PhoneModel } from "@/lib/preview-devices";
import WorkspaceHeader from "@/components/workspace-header";
import DocumentUploaderFields from "./demo/document-uploader-fields";
import {
  type Config,
  type Comment,
  type Revision,
  type UploadState,
} from "@/lib/model";
import PreviewCanvas from "./preview-canvas";
import DocumentUploader from "@/app/demo/document-uploader";
import DesignSpecificationDialog, { PocSpecificationDialog } from "./design-specification-dialog";
import { demoPromptIntent, recoveryAgent } from "@/lib/demo/recovery-agent";

export default function DesignWorkspace({
  draft,
  onChange,
  revision,
  state,
  onState,
  anchor,
  onAnchor,
  onReview,
  onResults,
  onCompletedTests,
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
  onResults: () => void;
  onCompletedTests: () => Promise<string>;
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
  const [phoneModel, setPhoneModel] = useState<PhoneModel>("iphone");
  const [designSpecOpen, setDesignSpecOpen] = useState(false);
  const [pocSpecOpen, setPocSpecOpen] = useState(false);
  const [phoneUnfolded, setPhoneUnfolded] = useState(false);
  const phoneWidth = previewPhoneWidth(phoneModel, phoneUnfolded);
  const dirty = !sameConfig(draft, revision.config);
  const feedback = discussionThreads(comments).filter((c) => c.revisionId === revision.id);
  function tool(
    label: string,
    icon: React.ReactNode,
    click: () => void,
    active?: boolean,
  ) {
    return (
      <IconButton label={label} active={active} onClick={click} variant="ghost">
        {icon}
      </IconButton>
    );
  }
  async function ask(input = prompt) {
    if (!input.trim()) return "";
    if (demoPromptIntent(input) === "designs") {
      setDesignSpecOpen(true);
      setReply(recoveryAgent.designs);
      setPrompt("");
      return recoveryAgent.designs;
    }
    if (demoPromptIntent(input) === "poc") {
      setPocSpecOpen(true);
      setReply(recoveryAgent.poc);
      setPrompt("");
      return recoveryAgent.poc;
    }
    if (demoPromptIntent(input) === "results") {
      setPrompt("");
      onResults();
      return recoveryAgent.results;
    }
    if (demoPromptIntent(input) === "completed-tests") {
      setPrompt("");
      const message = await onCompletedTests();
      setReply(message);
      return message;
    }
    const message = "I prepared the recovery changes: clearer error text, a Retry button, and an error announcement. Review before applying.";
    setProposal(true);
    setReply(message);
    setPrompt("");
    onState("failed");
    return message;
  }
  return (
    <div
      className="studio design-workspace"
      data-demo-id={DEMO_IDS.designWorkspace}
    >
      <div className="workspace-chrome">
        <WorkspaceHeader
          className="design-header"
          title="Document upload"
          context={`Design workspace · ${!loaded ? error ? "Preview only" : "Loading" : dirty ? "Unsaved draft" : `Saved v${revision.number}`}`}
          actions={<>
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
          </>}
        />
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
          {viewport === "mobile" && <PhoneModelSelect value={phoneModel} onChange={(next) => { setPhoneModel(next); setZoom("fit"); }} />}
          {viewport === "mobile" && phoneModel === "duo" && <div className="fold-controls" role="group" aria-label="Phone posture">
            <Button type="button" size="sm" variant={phoneUnfolded ? "ghost" : "secondary"} aria-pressed={!phoneUnfolded} onClick={() => { setPhoneUnfolded(false); setZoom("fit"); }}>Folded</Button>
            <Button type="button" size="sm" variant={phoneUnfolded ? "secondary" : "ghost"} aria-pressed={phoneUnfolded} onClick={() => { setPhoneUnfolded(true); setZoom("fit"); }}>Unfolded</Button>
          </div>}
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
      </div>
      <main className="design-body">
        <aside className="design-layers" aria-label="Layers">
          <h2>Layers</h2>
          <p className="design-page-name">Application</p>
          <Button variant="bare" size="auto"
            className={anchor === "document-uploader" ? "selected" : ""}
            onClick={() => {
              onAnchor("document-uploader");
              setTab("design");
            }}
          >
            <Layers3 size={15} />
            Document uploader
          </Button>
          <Button variant="bare" size="auto"
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
          </Button>
          <Button variant="bare" size="auto"
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
          </Button>
          <Button variant="bare" size="auto"
            className={`child-layer ${anchor === "upload-error" ? "selected" : ""}`}
            onClick={() => {
              onAnchor("upload-error");
              onState("failed");
              setTab("design");
            }}
          >
            <Frame size={14} />
            Error message
          </Button>
          <Button variant="bare" size="auto"
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
          </Button>
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
            phoneWidth={phoneWidth}
            paired={false}
            focus={focus}
            feedback={false}
          >
            <div
              className={`device-wrap ${viewport === "mobile" ? "mobile-wrap phone-simulation" : ""} design-selected`}
              data-selected-anchor={anchor}
              style={viewport === "mobile" ? { flex: `0 0 ${phoneWidth}px`, maxWidth: phoneWidth } : undefined}
            >
              <div className="device-label">
                Document upload · {viewport === "mobile" ? previewPhoneLabel(phoneModel, phoneUnfolded) : "desktop"}
                <span>{dirty ? "Draft" : `v${revision.number}`}</span>
              </div>
              <DocumentUploader
                config={draft}
                state={state}
                onState={onState}
                compact={viewport === "mobile" && !(phoneModel === "duo" && phoneUnfolded)}
                focus={focus}
                annotate
                onAnchor={(a) => {
                  onAnchor(a);
                  setTab("design");
                }}
              />
            </div>
          </PreviewCanvas>
          <StateSelector
            className="design-state-bar"
            label="Component state"
            value={state}
            options={uploadStateShortOptions}
            onChange={onState}
          />
        </section>
        <RightPanel variant="design" className="design-inspector" aria-label="Design inspector">
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
              <DocumentUploaderFields
                value={draft}
                onChange={onChange}
                variant="design"
                idPrefix="design"
              />
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
                    <Button variant="bare" size="auto"
                      key={c.id}
                      onClick={() => {
                        onAnchor(c.anchor);
                        onState(c.state);
                        onReview(true);
                      }}
                    >
                      <strong>{c.author}</strong>
                      <p>{c.text}</p>
                    </Button>
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
                <GuidedPrompt
                  label="Message design agent"
                  value={prompt}
                  maxLength={600}
                  onChange={setPrompt}
                  prompts={reviewPrompts}
                  disabled={busy}
                  showPresets={false}
                  placeholder="Ask the agent to edit this component…"
                />
                <div className="design-agent-actions">
                  <span className="design-agent-note">Scripted responses · Approve edits</span>
                  <div className="prompt-actions">
                    <PromptVoiceControls value={prompt} onTranscript={setPrompt} onVoiceSubmit={ask} disabled={busy} />
                    <Button
                    type="submit"
                    size="icon"
                    disabled={busy || !prompt.trim()}
                    title="Send prompt"
                    aria-label="Send prompt"
                  >
                    <Send size={16} />
                  </Button>
                  </div>
                </div>
              </form>
            </>
          )}
        </RightPanel>
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
      <DesignSpecificationDialog open={designSpecOpen} onOpenChange={setDesignSpecOpen} config={draft} version={revision.number} dirty={dirty} />
      <PocSpecificationDialog open={pocSpecOpen} onOpenChange={setPocSpecOpen} />
    </div>
  );
}
