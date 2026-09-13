"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useTheme } from "next-themes";
import {
  AlertCircle,
  ArrowRight,
  Bell,
  BellOff,
  Check,
  CheckCircle2,
  Clipboard,
  Download,
  ExternalLink,
  FileClock,
  Flag,
  GitCompareArrows,
  Layers3,
  LoaderCircle,
  MessageSquare,
  Monitor,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
  Save,
  Send,
  Settings2,
  Share2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  X,
  Moon,
  Sun,
  Presentation,
  Maximize,
  Minimize,
  Scan,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  baseline,
  checks,
  improvement,
  type Audience,
  type Config,
  type Revision,
  type UploadState,
  type Workspace,
} from "@/lib/model";
import { download, request } from "@/lib/client";
import Uploader from "./uploader";
import Feedback from "./feedback";
import PreviewCanvas, { type PreviewFocus } from "./preview-canvas";
import FeedbackNotifications from "./feedback-notifications";

type Data = Workspace & {
  links: {
    token: string;
    audience: string;
    revisionId: string;
    revoked: number;
  }[];
};
const preview: Revision = {
  id: "preview",
  number: 1,
  config: baseline,
  note: "Original design: upload recovery needs review.",
  createdAt: "",
};
const initial: Data = {
  name: "Designer",
  revisions: [preview],
  comments: [],
  sessions: [],
  preferences: { comments: true, revisions: true, tests: true },
  links: [],
};
const audienceNames: Record<Audience, string> = {
  designer: "Designer",
  po: "Product owner",
  engineer: "Engineer",
  participant: "Participant preview",
};
const scenarioStates: UploadState[] = ["ready", "failed", "complete"];
const labels: Record<UploadState, string> = {
  ready: "Ready to upload",
  failed: "Upload interrupted",
  complete: "Document received",
};

function IconButton({
  label,
  children,
  onClick,
  active,
  disabled,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          size="icon"
          variant={active ? "secondary" : "ghost"}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export default function FlowReview() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [presentation, setPresentation] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [focus, setFocus] = useState<PreviewFocus>("page");
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [showFeedback, setShowFeedback] = useState(false);
  const studioRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<Data>(initial);
  const [revision, setRevision] = useState<Revision>(preview);
  const [draft, setDraft] = useState<Config>(baseline);
  const [state, setState] = useState<UploadState>("ready");
  const [playing, setPlaying] = useState(true);
  const [viewport, setViewport] = useState("desktop");
  const [audience, setAudience] = useState<Audience>("designer");
  const [view, setView] = useState("review");
  const [panel, setPanel] = useState("assistant");
  const [anchor, setAnchor] = useState("document-uploader");
  const [annotations, setAnnotations] = useState(true);
  const [compare, setCompare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [assistant, setAssistant] = useState<
    "idle" | "thinking" | "proposed" | "applied"
  >("idle");
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState("");
  const [dialog, setDialog] = useState<"share" | "notifications" | null>(null);
  const [shareRole, setShareRole] = useState("participant");
  const [shareUrl, setShareUrl] = useState("");
  const [saveNote, setSaveNote] = useState("Manual design update");
  const initialized = useRef(false);
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(revision.config);
  const currentChecks = checks(draft);
  const passed = currentChecks.filter((c) => c.pass).length;
  const isDesigner = audience === "designer";
  const participant = audience === "participant";
  const feedbackVisible =
    showFeedback && data.preferences.comments && !participant;
  const dark = mounted && resolvedTheme === "dark";
  const previous =
    data.revisions.find((r) => r.number < revision.number) ??
    data.revisions[data.revisions.length - 1];
  const refresh = useCallback(async () => {
    try {
      const next = await request<Data>("/api/workspace");
      setData(next);
      setLoaded(true);
      setNeedsSignIn(false);
      setError("");
      if (!initialized.current) {
        initialized.current = true;
        setRevision(next.revisions[0]);
        setDraft(next.revisions[0].config);
      }
      return next;
    } catch (e) {
      const err = e as Error & { status?: number };
      setError(err.message);
      setNeedsSignIn(err.status === 401);
      return null;
    }
  }, []);
  useEffect(() => {
    void refresh();
    return () => {
      if (aiTimer.current) clearTimeout(aiTimer.current);
    };
  }, [refresh]);
  useEffect(() => {
    setMounted(true);
    const changed = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  useEffect(() => {
    if (!feedbackVisible || !loaded) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible") await refresh();
      if (!stopped) timer = setTimeout(poll, 10000);
    };
    timer = setTimeout(poll, 10000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [feedbackVisible, loaded, refresh]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        presentation &&
        !dialog &&
        !document.fullscreenElement
      )
        setPresentation(false);
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [presentation, dialog]);
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      toast.error(
        "Fullscreen is unavailable in this browser. Presentation mode still fills the window.",
      );
    }
  }
  function startPresentation() {
    setView("review");
    setPresentation(true);
    setFocus("component");
    setZoom("fit");
    setCompare(false);
    setViewport("desktop");
  }
  function exitPresentation() {
    if (document.fullscreenElement) void document.exitFullscreen();
    setPresentation(false);
  }
  async function action(payload: Record<string, unknown>) {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      await request("/api/workspace", payload);
      await refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function chooseRevision(next: Revision) {
    setRevision(next);
    setDraft(next.config);
    setAssistant("idle");
    setReply("");
    setSaveNote("Manual design update");
    setState("ready");
  }
  async function save(config: Config, note: string) {
    if (busy || !loaded) return;
    setBusy(true);
    setError("");
    try {
      const result = await request<{ revision: Revision }>("/api/workspace", {
        action: "revision",
        config,
        note,
        baseId: revision.id,
      });
      await refresh();
      setRevision(result.revision);
      setDraft(result.revision.config);
      toast.success(`Version ${result.revision.number} saved`);
      return result.revision;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function inspect() {
    if (aiTimer.current) clearTimeout(aiTimer.current);
    setPanel("assistant");
    setState("failed");
    setPlaying(true);
    setAssistant("thinking");
    setReply("");
    aiTimer.current = setTimeout(() => {
      setAssistant("proposed");
      setReply(
        passed === 3
          ? "The three demo rules pass. I would still ask a person to check keyboard recovery, screen-reader output, and the wording."
          : "The upload ends without a clear recovery path. I suggest keeping the selected file, explaining what happened, and making retry available.",
      );
    }, 900);
  }
  async function applyFix() {
    const saved = await save(
      { ...draft, ...improvement },
      "Scripted assistant: clearer error, retry action, and alert announcement.",
    );
    if (saved) {
      setState("failed");
      setAssistant("applied");
      setReply(
        "The changes are saved. The file stays selected, the retry button works, and the error now uses an alert announcement.",
      );
    }
  }
  function changeState(next: UploadState, event: string) {
    setState(next);
    if (event === "continue")
      toast.success("Scenario completed. No application was submitted.");
  }
  async function createLink() {
    if (dirty) {
      toast.error("Save the draft before sharing");
      return;
    }
    setBusy(true);
    try {
      const r = await request<{ path: string }>("/api/workspace", {
        action: "share",
        revisionId: revision.id,
        audience: shareRole,
      });
      setShareUrl(window.location.origin + r.path);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Link copied");
    } catch {
      toast.error("Clipboard unavailable. Select the link to copy it.");
    }
  }
  const caseStudy = () =>
    `# Homepath: Upload recovery\n\n## Problem\nThe original uploader showed a generic error without a retry action.\n\n## Hypothesis\nA clear explanation and retry action may help people recover independently.\n\n## Iterations\n${[
      ...data.revisions,
    ]
      .reverse()
      .map((r) => `- v${r.number}: ${r.note}`)
      .join(
        "\n",
      )}\n\n## Evidence\n${data.sessions.length} sessions recorded; ${data.sessions.filter((s) => s.outcome === "complete").length} completed. Convenience sample, not proof of usability.\n\n## Feedback\n${
      data.comments
        .filter((c) => !c.parentId)
        .map((c) => `- ${c.text} (${c.resolved ? "resolved" : "open"})`)
        .join("\n") || "No feedback yet."
    }\n\n## Limitations\nFictional upload and scripted assistant. No live Design System MCP, real file upload, or production certification. Manual accessibility testing remains.\n`;

  const stateRef = useRef({ state, revision });
  stateRef.current = { state, revision };
  useEffect(() => {
    type Context = {
      registerTool: (
        tool: {
          name: string;
          description: string;
          inputSchema: object;
          annotations: object;
          execute: (input: unknown) => unknown;
        },
        options: { signal: AbortSignal },
      ) => unknown;
    };
    const context = (document as Document & { modelContext?: Context })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools = [
      {
        name: "get_flow_review_state",
        description:
          "Read the current upload scenario and version. Does not change data.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: () => ({
          state: stateRef.current.state,
          version: stateRef.current.revision.number,
        }),
      },
      {
        name: "set_upload_preview_state",
        description:
          "Set the local upload preview to ready, failed, or complete. Does not save a version or record a participant test.",
        inputSchema: {
          type: "object",
          properties: { state: { type: "string", enum: scenarioStates } },
          required: ["state"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: (input: unknown) => {
          const p = input as { state?: UploadState };
          if (
            !p ||
            Object.keys(p).length !== 1 ||
            !scenarioStates.includes(p.state!)
          )
            throw Error("A valid upload state is required");
          flushSync(() => setState(p.state!));
          stateRef.current = { ...stateRef.current, state: p.state! };
          return { state: p.state };
        },
      },
    ];
    for (const tool of tools) {
      try {
        Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(console.error);
      } catch (e) {
        console.error(e);
      }
    }
    return () => lifecycle.abort();
  }, []);

  return (
    <TooltipProvider delayDuration={250}>
      <div
        className={`studio ${presentation ? "is-presenting" : ""}`}
        ref={studioRef}
      >
        <Toaster position="bottom-right" />
        <header className="studio-header">
          <span className="studio-brand">
            <Layers3 />
            Flow Review
          </span>
          <span className="breadcrumb">
            Homepath <span className="dot">/</span> Document upload
          </span>
          <span className="badge amber">Scripted demo</span>
          <IconButton
            label={dark ? "Use light mode" : "Use dark mode"}
            onClick={() => setTheme(dark ? "light" : "dark")}
          >
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </IconButton>
          <IconButton label="Present component" onClick={startPresentation}>
            <Presentation size={17} />
          </IconButton>
          <IconButton
            label="Notifications"
            onClick={() => setDialog("notifications")}
          >
            <Bell size={17} />
          </IconButton>
          <Button
            variant="outline"
            onClick={() => {
              setShareUrl("");
              setDialog("share");
            }}
            disabled={!loaded}
          >
            <Share2 size={15} />
            Share
          </Button>
        </header>
        {presentation && (
          <header className="presentation-bar">
            <span className="presentation-name">
              <Presentation size={18} />
              <strong>Document upload</strong>
              <span className="badge">
                v{revision.number}
                {dirty ? " · Draft" : ""}
              </span>
            </span>
            <div className="presentation-actions">
              <IconButton
                label={dark ? "Use light mode" : "Use dark mode"}
                onClick={() => setTheme(dark ? "light" : "dark")}
              >
                {dark ? <Sun size={17} /> : <Moon size={17} />}
              </IconButton>
              <IconButton
                label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                onClick={() => void toggleFullscreen()}
              >
                {fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
              </IconButton>
              <IconButton label="Exit presentation" onClick={exitPresentation}>
                <X size={18} />
              </IconButton>
            </div>
          </header>
        )}
        <div className="workspace-heading">
          <div>
            <p className="eyebrow">REVIEW WORKSPACE</p>
            <h1>Document upload</h1>
            <p>
              Recovery flow <span className="dot">·</span> v{revision.number}
              {dirty ? " · Unsaved draft" : " · Saved version"}
            </p>
          </div>
          <div className="heading-actions">
            <Select
              value={audience}
              onValueChange={(v) => {
                setAudience(v as Audience);
                if (v !== "designer") setView("review");
                if (v === "po") setPanel("feedback");
                if (v === "engineer") setPanel("checks");
              }}
            >
              <SelectTrigger aria-label="Audience view">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(audienceNames).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => {
                setState("ready");
                setPlaying(true);
                setView("review");
              }}
            >
              <Play size={15} />
              Play scenario
            </Button>
          </div>
        </div>
        {error && (
          <div className="error-banner" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
            {needsSignIn ? (
              <a href="/signin-with-chatgpt?return_to=/" target="_top">
                Sign in
              </a>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => void refresh()}>
                Retry
              </Button>
            )}
          </div>
        )}
        {!participant && (
          <Tabs value={view} onValueChange={setView} className="workspace-tabs">
            <TabsList variant="line">
              <TabsTrigger value="review">
                <MousePointer2 />
                Review
              </TabsTrigger>
              {isDesigner && (
                <TabsTrigger value="build">
                  <Settings2 />
                  Edit component
                </TabsTrigger>
              )}
              <TabsTrigger value="results">
                <Flag />
                Test results{" "}
                <span className="tab-count">{data.sessions.length}</span>
              </TabsTrigger>
              <TabsTrigger value="case">
                <FileClock />
                Case study
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        {participant && (
          <div className="audience-notice">
            <span>Participant preview</span>
            <span>Not recording a test session</span>
          </div>
        )}
        {(view === "review" || view === "build") && (
          <main
            className={`preview-grid ${participant ? "participant-grid" : ""}`}
          >
            <div className="stage-column">
              <div className="stage">
                <div className="stage-toolbar">
                  <div className="flex items-center gap-1">
                    <IconButton
                      label={playing ? "Pause prototype" : "Resume prototype"}
                      onClick={() => setPlaying(!playing)}
                    >
                      {playing ? <Pause size={15} /> : <Play size={15} />}
                    </IconButton>
                    <IconButton
                      label="Reset scenario"
                      onClick={() => setState("ready")}
                    >
                      <RotateCcw size={15} />
                    </IconButton>
                    <span className={`status-dot ${playing ? "live" : ""}`} />
                    <span>{playing ? "Live preview" : "Paused"}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <IconButton
                      label="Desktop"
                      active={viewport === "desktop"}
                      onClick={() => setViewport("desktop")}
                    >
                      <Monitor size={17} />
                    </IconButton>
                    <IconButton
                      label="Mobile"
                      active={viewport === "mobile"}
                      onClick={() => setViewport("mobile")}
                    >
                      <Smartphone size={17} />
                    </IconButton>
                    <IconButton
                      label="Desktop and mobile"
                      active={viewport === "both"}
                      onClick={() => setViewport("both")}
                    >
                      <GitCompareArrows size={17} />
                    </IconButton>
                    {!participant && !presentation && (
                      <IconButton
                        label="Comment pins"
                        active={annotations}
                        onClick={() => setAnnotations(!annotations)}
                      >
                        <MessageSquare size={16} />
                      </IconButton>
                    )}
                  </div>
                </div>
                <div className="inspection-toolbar">
                  <Select
                    value={focus}
                    onValueChange={(value) => {
                      setFocus(value as PreviewFocus);
                      setZoom("fit");
                      if (value === "error") setState("failed");
                    }}
                  >
                    <SelectTrigger aria-label="Preview focus">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="page">Full page</SelectItem>
                      <SelectItem value="component">Component only</SelectItem>
                      <SelectItem value="error">Error message</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="zoom-controls">
                    <IconButton
                      label="Zoom out"
                      disabled={zoom !== "fit" && zoom <= 0.5}
                      onClick={() =>
                        setZoom(
                          Math.max(0.5, (zoom === "fit" ? 1 : zoom) - 0.25),
                        )
                      }
                    >
                      <ZoomOut size={17} />
                    </IconButton>
                    <Select
                      value={String(zoom)}
                      onValueChange={(value) =>
                        setZoom(value === "fit" ? "fit" : Number(value))
                      }
                    >
                      <SelectTrigger aria-label="Preview zoom">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fit">Fit</SelectItem>
                        {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((z) => (
                          <SelectItem value={String(z)} key={z}>
                            {Math.round(z * 100)}%
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <IconButton
                      label="Zoom in"
                      disabled={zoom !== "fit" && zoom >= 2}
                      onClick={() =>
                        setZoom(Math.min(2, (zoom === "fit" ? 1 : zoom) + 0.25))
                      }
                    >
                      <ZoomIn size={17} />
                    </IconButton>
                    <IconButton
                      label="Fit preview"
                      onClick={() => setZoom("fit")}
                    >
                      <Scan size={17} />
                    </IconButton>
                  </div>
                  {!participant && (
                    <IconButton
                      label={
                        feedbackVisible
                          ? "Hide feedback notifications"
                          : "Show feedback notifications"
                      }
                      active={feedbackVisible}
                      disabled={!data.preferences.comments}
                      onClick={() => setShowFeedback(!showFeedback)}
                    >
                      {feedbackVisible ? (
                        <Bell size={17} />
                      ) : (
                        <BellOff size={17} />
                      )}
                    </IconButton>
                  )}
                </div>
                <div
                  className={`stage-body ${feedbackVisible ? "with-feedback" : ""}`}
                >
                  <PreviewCanvas
                    zoom={zoom}
                    viewport={viewport}
                    paired={viewport === "both" || (compare && !participant)}
                    focus={focus}
                  >
                    {compare && !participant && (
                      <div className="device-wrap">
                        <div className="device-label">
                          Previous · v{previous.number}
                        </div>
                        <Uploader
                          focus={focus}
                          config={previous.config}
                          state={state}
                          onState={changeState}
                          playing={false}
                        />
                      </div>
                    )}
                    <div
                      className={`device-wrap ${viewport === "mobile" ? "mobile-wrap" : ""}`}
                    >
                      <div className="device-label">
                        {viewport === "mobile" ? "Mobile · 340" : "Desktop"}
                        <span>{dirty ? "Draft" : `v${revision.number}`}</span>
                      </div>
                      <Uploader
                        focus={focus}
                        config={draft}
                        state={state}
                        playing={playing}
                        onState={changeState}
                        compact={viewport === "mobile"}
                        annotate={!participant && annotations && !presentation}
                        onAnchor={(a) => {
                          setAnchor(a);
                          setPanel("feedback");
                          setView("review");
                        }}
                      />
                    </div>
                    {viewport === "both" && !compare && (
                      <div className="device-wrap mobile-wrap">
                        <div className="device-label">
                          Mobile · 340 <span>Same state</span>
                        </div>
                        <Uploader
                          focus={focus}
                          config={draft}
                          state={state}
                          playing={playing}
                          onState={changeState}
                          compact
                          annotate={!participant && annotations && !presentation}
                          onAnchor={(a) => {
                            setAnchor(a);
                            setPanel("feedback");
                          }}
                        />
                      </div>
                    )}
                  </PreviewCanvas>
                  {feedbackVisible && (
                    <FeedbackNotifications
                      comments={data.comments}
                      revision={revision}
                      onClose={() => setShowFeedback(false)}
                      onOpen={(comment) => {
                        setState(comment.state);
                        setAnchor(comment.anchor);
                        setPanel("feedback");
                        setView("review");
                        if (presentation) exitPresentation();
                      }}
                    />
                  )}
                </div>
                {!participant && (
                  <div className="state-strip">
                    <span>States</span>
                    {scenarioStates.map((s, i) => (
                      <button
                        key={s}
                        className={state === s ? "selected" : ""}
                        onClick={() => setState(s)}
                        aria-pressed={state === s}
                      >
                        <span>{i + 1}</span>
                        {labels[s]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {!participant && (
                <div className="scenario-caption">
                  <div>
                    <span className="badge">SCENARIO 01</span>
                    <strong>Can someone recover from a failed upload?</strong>
                  </div>
                  <span>No real files or application data</span>
                </div>
              )}
            </div>
            {!participant &&
              (view === "build" ? (
                <aside className="review-panel">
                  <div className="panel-title">
                    <Settings2 size={17} />
                    <strong>Component properties</strong>
                    <span className="badge">Manual</span>
                  </div>
                  <div className="editor-fields">
                    {(
                      [
                        ["title", "Heading"],
                        ["helper", "Supporting text"],
                        ["button", "Upload button"],
                        ["error", "Error message"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key}>
                        {label}
                        {key === "error" || key === "helper" ? (
                          <Textarea
                            maxLength={key === "error" ? 220 : 180}
                            value={draft[key]}
                            onChange={(e) =>
                              setDraft({ ...draft, [key]: e.target.value })
                            }
                          />
                        ) : (
                          <Input
                            maxLength={key === "button" ? 40 : 80}
                            value={draft[key]}
                            onChange={(e) =>
                              setDraft({ ...draft, [key]: e.target.value })
                            }
                          />
                        )}
                      </label>
                    ))}
                    <label className="switch-line">
                      Retry action
                      <Switch
                        checked={draft.retryEnabled}
                        onCheckedChange={(v) =>
                          setDraft({ ...draft, retryEnabled: v })
                        }
                      />
                    </label>
                    <label className="switch-line">
                      Announce error
                      <Switch
                        checked={draft.announceError}
                        onCheckedChange={(v) =>
                          setDraft({ ...draft, announceError: v })
                        }
                      />
                    </label>
                    <label>
                      Version note
                      <Input
                        maxLength={200}
                        value={saveNote}
                        onChange={(e) => setSaveNote(e.target.value)}
                      />
                    </label>
                    <Button
                      disabled={
                        busy ||
                        !loaded ||
                        !dirty ||
                        !saveNote.trim() ||
                        !draft.title.trim() ||
                        !draft.error.trim() ||
                        !draft.button.trim()
                      }
                      onClick={() => void save(draft, saveNote)}
                    >
                      <Save size={15} />
                      Save new version
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={!dirty}
                      onClick={() => setDraft(revision.config)}
                    >
                      <RotateCcw size={14} />
                      Discard draft
                    </Button>
                  </div>
                </aside>
              ) : (
                <aside className="review-panel">
                  <Tabs value={panel} onValueChange={setPanel}>
                    <TabsList className="inspector-tabs" variant="line">
                      {isDesigner && (
                        <TabsTrigger value="assistant" aria-label="Assistant">
                          <Sparkles />
                        </TabsTrigger>
                      )}
                      <TabsTrigger value="feedback">Feedback</TabsTrigger>
                      <TabsTrigger value="checks">Checks</TabsTrigger>
                      <TabsTrigger value="history">History</TabsTrigger>
                    </TabsList>
                    {isDesigner && (
                      <TabsContent value="assistant">
                        <div className="panel-title">
                          <Sparkles size={16} />
                          <strong>Flow assistant</strong>
                          <span className="badge amber">Simulated</span>
                        </div>
                        <div className="panel-section assistant-section">
                          <p className="eyebrow">UPLOAD RECOVERY</p>
                          <h2>A clearer way back.</h2>
                          <p>
                            The current component has {3 - passed} open demo{" "}
                            {3 - passed === 1 ? "check" : "checks"}.
                          </p>
                          <Button
                            className="w-full mt-4"
                            onClick={inspect}
                            disabled={assistant === "thinking" || busy}
                          >
                            {assistant === "thinking" ? (
                              <LoaderCircle className="animate-spin" />
                            ) : (
                              <Sparkles size={15} />
                            )}{" "}
                            {assistant === "thinking"
                              ? "Reviewing component..."
                              : "Review this flow"}
                          </Button>
                          {(reply || assistant === "thinking") && (
                            <div className="assistant-message" role="status">
                              <span className="assistant-avatar">
                                <Sparkles size={14} />
                              </span>
                              <p>
                                {assistant === "thinking"
                                  ? "Checking the failed state and recovery controls..."
                                  : reply}
                              </p>
                            </div>
                          )}
                          {assistant === "proposed" && passed < 3 && (
                            <div className="proposal">
                              <div className="section-heading">
                                <h3>Proposed change</h3>
                                <span className="badge">3 edits</span>
                              </div>
                              <div className="copy-diff">
                                <span>BEFORE</span>
                                <p>{draft.error}</p>
                                <span>AFTER</span>
                                <p>{improvement.error}</p>
                              </div>
                              <div className="proposal-row">
                                <Check size={14} />
                                Add a retry action
                              </div>
                              <div className="proposal-row">
                                <Check size={14} />
                                Announce the error
                              </div>
                              <Button
                                className="w-full"
                                disabled={busy || !loaded}
                                onClick={() => void applyFix()}
                              >
                                <Check size={15} />
                                {busy ? "Saving..." : "Apply changes"}
                              </Button>
                            </div>
                          )}
                          {assistant === "applied" && (
                            <Button
                              className="w-full"
                              variant="outline"
                              onClick={() => {
                                setState("ready");
                                setPlaying(true);
                              }}
                            >
                              <Play size={15} />
                              Retest updated flow
                            </Button>
                          )}
                          <form
                            className="assistant-prompt"
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (
                                /review|fix|upload|error|accessib|retry/i.test(
                                  prompt,
                                )
                              ) {
                                inspect();
                              } else {
                                setReply(
                                  "This demo can review upload recovery and propose the scripted fix. Try 'Review this flow'. No live AI model is connected.",
                                );
                              }
                              setPrompt("");
                            }}
                          >
                            <Input
                              aria-label="Message scripted assistant"
                              value={prompt}
                              maxLength={400}
                              onChange={(e) => setPrompt(e.target.value)}
                              placeholder="Ask about this upload flow..."
                            />
                            <Button
                              type="submit"
                              size="icon"
                              variant="ghost"
                              disabled={
                                !prompt.trim() || assistant === "thinking"
                              }
                              aria-label="Send to scripted assistant"
                            >
                              <Send size={16} />
                            </Button>
                          </form>
                          <p className="footnote">
                            Scripted responses · Changes require approval
                          </p>
                        </div>
                      </TabsContent>
                    )}
                    <TabsContent value="feedback">
                      <Feedback
                        comments={data.comments}
                        revision={revision}
                        state={state}
                        viewport={viewport}
                        anchor={anchor}
                        busy={busy || !loaded}
                        onAction={action}
                        onJump={(c) => {
                          setState(c.state);
                          setViewport(c.viewport);
                          setAnchor(c.anchor);
                        }}
                      />
                    </TabsContent>
                    <TabsContent value="checks">
                      <div className="panel-section">
                        <div className="section-heading">
                          <h3>Readiness checks</h3>
                          <span className="badge green">
                            {passed}/3 configured
                          </span>
                        </div>
                        {currentChecks.map((c) => (
                          <div className="check-row" key={c.id}>
                            {c.pass ? (
                              <CheckCircle2
                                size={18}
                                className="text-primary"
                              />
                            ) : (
                              <AlertCircle
                                size={18}
                                className="text-destructive"
                              />
                            )}
                            <div>
                              <strong>{c.title}</strong>
                              <span>{c.kind}</span>
                              <p>{c.detail}</p>
                            </div>
                          </div>
                        ))}
                        <div className="manual-check">
                          <ShieldCheck size={18} />
                          <strong>Human verification still required</strong>
                          <p>
                            Keyboard order, screen-reader behavior, zoom,
                            contrast, and error recovery with people.
                          </p>
                        </div>
                        <div className="integration-note">
                          <span className="badge">
                            Design System MCP · Not connected
                          </span>
                          <p>
                            Local component rules only. Production upload
                            security, file validation, and backend recovery are
                            out of scope.
                          </p>
                        </div>
                        <Button
                          className="w-full"
                          variant="outline"
                          onClick={() =>
                            download(
                              "flow-review-handoff.json",
                              JSON.stringify(
                                {
                                  schemaVersion: 1,
                                  componentId: "document-uploader",
                                  revision,
                                  checks: currentChecks,
                                  states: scenarioStates,
                                  comments: data.comments.filter(
                                    (c) => c.revisionId === revision.id,
                                  ),
                                  source: "scripted-demo",
                                  productionReady: false,
                                },
                                null,
                                2,
                              ),
                            )
                          }
                        >
                          <Download size={14} />
                          Export handoff
                        </Button>
                      </div>
                    </TabsContent>
                    <TabsContent value="history">
                      <div className="panel-section">
                        <div className="section-heading">
                          <h3>Version history</h3>
                          <IconButton
                            label="Compare versions"
                            active={compare}
                            disabled={data.revisions.length < 2}
                            onClick={() => setCompare(!compare)}
                          >
                            <GitCompareArrows size={16} />
                          </IconButton>
                        </div>
                        {data.revisions.map((r) => (
                          <button
                            key={r.id}
                            className={`version-row ${r.id === revision.id ? "active" : ""}`}
                            disabled={dirty}
                            onClick={() => chooseRevision(r)}
                          >
                            <span className="version-dot">{r.number}</span>
                            <div>
                              <strong>Version {r.number}</strong>
                              <p>{r.note}</p>
                              <span>
                                {r.createdAt
                                  ? new Date(r.createdAt).toLocaleString()
                                  : "Original design"}
                              </span>
                            </div>
                            {r.id === revision.id && <Check size={14} />}
                          </button>
                        ))}
                        {dirty && (
                          <p className="footnote">
                            Save or discard the draft before switching versions.
                          </p>
                        )}
                        <Button
                          variant="outline"
                          className="w-full mt-4"
                          disabled={busy || !loaded || dirty}
                          onClick={() =>
                            void save(
                              baseline,
                              "Restarted the original demo scenario.",
                            )
                          }
                        >
                          <RotateCcw size={14} />
                          Create baseline version
                        </Button>
                      </div>
                    </TabsContent>
                  </Tabs>
                </aside>
              ))}
          </main>
        )}
        {view === "results" && !participant && (
          <main className="wide-view">
            <div className="view-title">
              <div>
                <h2>Participant sessions</h2>
                <p>
                  Recorded on shared test links. Internal previews are excluded.
                </p>
              </div>
              <Button variant="outline" onClick={() => void refresh()}>
                <RotateCcw size={14} />
                Refresh
              </Button>
            </div>
            <div className="metrics">
              <div>
                <span>Sessions</span>
                <strong>{data.sessions.length}</strong>
              </div>
              <div>
                <span>Completed</span>
                <strong>
                  {data.sessions.filter((s) => s.outcome === "complete").length}
                </strong>
              </div>
              <div>
                <span>Gave up</span>
                <strong>
                  {data.sessions.filter((s) => s.outcome === "gave_up").length}
                </strong>
              </div>
              <div>
                <span>Still open</span>
                <strong>
                  {data.sessions.filter((s) => s.outcome === "started").length}
                </strong>
              </div>
            </div>
            {!data.sessions.length ? (
              <Empty className="results-empty">
                <Flag size={28} />
                <h3>No sessions yet</h3>
                <p>A participant link is pinned to a saved version.</p>
                <Button
                  disabled={!loaded}
                  onClick={() => {
                    setShareRole("participant");
                    setDialog("share");
                  }}
                >
                  Create test link
                  <ArrowRight size={14} />
                </Button>
              </Empty>
            ) : (
              <div className="sessions-list">
                {data.sessions.map((s, i) => (
                  <article key={s.id}>
                    <div className="section-heading">
                      <strong>
                        Session {data.sessions.length - i}{" "}
                        <span className="muted">
                          · v
                          {
                            data.revisions.find((r) => r.id === s.revisionId)
                              ?.number
                          }
                        </span>
                      </strong>
                      <span
                        className={`badge ${s.outcome === "complete" ? "green" : "amber"}`}
                      >
                        {s.outcome.replace("_", " ")}
                      </span>
                    </div>
                    <p className="session-meta">
                      {new Date(s.createdAt).toLocaleString()} ·{" "}
                      {s.duration === null
                        ? "Not ended"
                        : `${Math.round(s.duration / 1000)} seconds`}
                    </p>
                    <div className="event-trail">
                      {s.events.map((e, j) => (
                        <span key={j}>
                          {e.type.replaceAll("_", " ")}{" "}
                          <small>{Math.round(e.at / 1000)}s</small>
                        </span>
                      ))}
                    </div>
                    {s.feedback && <blockquote>{s.feedback}</blockquote>}
                  </article>
                ))}
              </div>
            )}
            <div className="results-footer">
              <p>
                Convenience sample. Timing includes idle time; a completed task
                is not proof of usability. Latest 100 sessions shown.
              </p>
              <Button
                variant="outline"
                onClick={() =>
                  download(
                    "flow-review-sessions.json",
                    JSON.stringify(data.sessions, null, 2),
                  )
                }
              >
                <Download size={14} />
                Export sessions
              </Button>
            </div>
          </main>
        )}
        {view === "case" && !participant && (
          <main className="wide-view case-study">
            <div className="view-title">
              <div>
                <p className="eyebrow">WORKING CASE STUDY</p>
                <h2>From a dead end to a way forward.</h2>
                <p>Homepath / Document upload</p>
              </div>
              <Button
                variant="outline"
                onClick={() =>
                  download(
                    "upload-recovery-case-study.md",
                    caseStudy(),
                    "text/markdown",
                  )
                }
              >
                <Download size={14} />
                Export
              </Button>
            </div>
            <div className="case-grid">
              <section>
                <span className="section-number">01</span>
                <h3>The problem</h3>
                <p>
                  The original uploader stopped at a generic error. The selected
                  document stayed visible, but there was no way to try again.
                </p>
              </section>
              <section>
                <span className="section-number">02</span>
                <h3>The hypothesis</h3>
                <p>
                  Explain the interruption, retain the selected file, and offer
                  a retry action so people can recover without starting over.
                </p>
              </section>
              <section>
                <span className="section-number">03</span>
                <h3>The iterations</h3>
                {[...data.revisions].reverse().map((r) => (
                  <button
                    className="case-version"
                    key={r.id}
                    disabled={dirty}
                    onClick={() => {
                      chooseRevision(r);
                      setView("review");
                      setPanel("history");
                    }}
                  >
                    <strong>v{r.number}</strong>
                    <span>{r.note}</span>
                    <ArrowRight size={14} />
                  </button>
                ))}
              </section>
              <section>
                <span className="section-number">04</span>
                <h3>The evidence</h3>
                <p>
                  {data.sessions.length} sessions recorded.{" "}
                  {data.comments.filter((c) => !c.parentId).length} feedback
                  threads. {data.comments.filter((c) => c.resolved).length}{" "}
                  resolved.
                </p>
                <p>
                  These are prototype observations, not a validated usability
                  claim. No live AI, real uploads, or Design System MCP are
                  connected.
                </p>
              </section>
            </div>
          </main>
        )}
        <footer className="studio-footer">
          <span>
            <span className="status-dot live" />
            Flow Review prototype
          </span>
          <span>Simulated assistant · Server-saved feedback & versions</span>
        </footer>

        <Dialog
          open={dialog === "share"}
          onOpenChange={(v) => {
            if (!v) setDialog(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Share version {revision.number}</DialogTitle>
              <DialogDescription>
                Links stay pinned to this saved version. This Site is private;
                recipients also need Site access.
              </DialogDescription>
            </DialogHeader>
            <Select
              value={shareRole}
              onValueChange={(v) => {
                setShareRole(v);
                setShareUrl("");
              }}
            >
              <SelectTrigger aria-label="Link audience" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="participant">Participant test</SelectItem>
                <SelectItem value="po">Product owner review</SelectItem>
              </SelectContent>
            </Select>
            <p className="dialog-copy">
              {shareRole === "participant"
                ? "Product, task, consent, and feedback. No internal comments, assistant, or change notes."
                : "Saved product, anchored feedback, replies, and reactions. No editing or participant results."}
            </p>
            {dirty && (
              <p className="text-destructive text-sm">
                Save the draft before creating a link.
              </p>
            )}
            <Button
              disabled={busy || !loaded || dirty}
              onClick={() => void createLink()}
            >
              <Share2 size={15} />
              Create {shareRole === "participant" ? "test" : "review"} link
            </Button>
            {shareUrl && (
              <div className="share-result">
                <Input aria-label="Share link" readOnly value={shareUrl} />
                <IconButton
                  label="Copy link"
                  onClick={() => void copy(shareUrl)}
                >
                  <Clipboard size={16} />
                </IconButton>
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open shared view"
                >
                  <ExternalLink size={17} />
                </a>
              </div>
            )}
            <div className="existing-links">
              <h3>Active links</h3>
              {data.links.filter((l) => !l.revoked).length === 0 && (
                <p>No active links.</p>
              )}
              {data.links
                .filter((l) => !l.revoked)
                .slice(0, 6)
                .map((l) => (
                  <div key={l.token}>
                    <span>
                      {l.audience === "participant" ? "Participant" : "Review"}{" "}
                      · v
                      {
                        data.revisions.find((r) => r.id === l.revisionId)
                          ?.number
                      }
                    </span>
                    <IconButton
                      label="Copy existing link"
                      onClick={() =>
                        void copy(`${window.location.origin}/s/${l.token}`)
                      }
                    >
                      <Clipboard size={14} />
                    </IconButton>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void action({ action: "revoke", token: l.token })
                      }
                    >
                      Revoke
                    </Button>
                  </div>
                ))}
            </div>
          </DialogContent>
        </Dialog>
        <Dialog
          open={dialog === "notifications"}
          onOpenChange={(v) => {
            if (!v) setDialog(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Review notifications</DialogTitle>
              <DialogDescription>
                Your in-app activity preferences. Participants never receive
                internal review activity.
              </DialogDescription>
            </DialogHeader>
            <label className="switch-line">
              Show feedback on screen
              <Switch
                checked={feedbackVisible}
                disabled={!data.preferences.comments || participant}
                onCheckedChange={setShowFeedback}
              />
            </label>
            {(
              [
                ["comments", "Feedback & replies"],
                ["revisions", "New versions"],
                ["tests", "Participant sessions"],
              ] as const
            ).map(([k, label]) => (
              <label className="switch-line" key={k}>
                {label}
                <Switch
                  disabled={busy || !loaded}
                  checked={data.preferences[k]}
                  onCheckedChange={(v) =>
                    void action({
                      action: "preferences",
                      value: { ...data.preferences, [k]: v },
                    })
                  }
                />
              </label>
            ))}
            <div className="notification-list">
              <h3>Recent activity</h3>
              {data.preferences.comments &&
                data.comments
                  .slice(-3)
                  .reverse()
                  .map((c) => (
                    <p key={c.id}>
                      <MessageSquare size={14} />
                      <span>
                        {c.author}: {c.text.slice(0, 90)}
                      </span>
                    </p>
                  ))}
              {data.preferences.revisions &&
                data.revisions.slice(0, 3).map((r) => (
                  <p key={r.id}>
                    <FileClock size={14} />
                    <span>
                      v{r.number}: {r.note}
                    </span>
                  </p>
                ))}
              {data.preferences.tests &&
                data.sessions.slice(0, 2).map((s) => (
                  <p key={s.id}>
                    <Flag size={14} />
                    <span>Session {s.outcome.replaceAll("_", " ")}</span>
                  </p>
                ))}
            </div>
            <p className="footnote">
              In-app only. Email and push notifications are not connected.
              {feedbackVisible &&
                " Feedback refreshes every 10 seconds while this tab is visible."}
            </p>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
