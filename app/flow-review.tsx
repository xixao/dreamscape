"use client";
import { baseline, checks, improvement, uploadStates } from "@/lib/demo/upload";
import { DEMO_IDS, UPLOAD_ANCHORS } from "@/lib/demo/registry";
import { demoPromptIntent, recoveryAgent } from "@/lib/demo/recovery-agent";
import GuidedPrompt from "./demo/guided-prompt";
import { reviewPrompts } from "@/lib/demo/prompts";
import {
  createHandoff,
  placedComments,
  previousRevision,
  sameConfig,
} from "@/lib/review";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { flushSync } from "react-dom";
import { useTheme } from "next-themes";
import {
  AlertCircle,
  ArrowRight,
  Bell,
  BellOff,
  Check,
  CheckCircle2,
  ClipboardCheck,
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
  MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import EvidenceTrail, { type EvidenceContext } from "./evidence-trail";
import { Button } from "@/components/ui/button";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  type Audience,
  type Config,
  type Revision,
  type UploadState,
  type Workspace,
} from "@/lib/model";
import { download, request } from "@/lib/client";
import Uploader from "@/app/demo/document-upload";
import Feedback from "./feedback";
import PreviewCanvas, { type PreviewFocus } from "./preview-canvas";
import AnchoredComments from "./anchored-comments";
import ParticipantTest from "./participant-test";
import ReviewResults from "./review-results";
import ReviewBrief from "./review-brief";
import POReview from "./po-review";
import JourneyView from "./journey-view";
import UploadCaseStudy, { buildCaseStudy } from "./demo/upload-case-study";
import UploadProperties from "./demo/upload-properties";
import TestSetupEditor from "./test-setup-editor";
import DesignWorkspace from "./design-workspace";
import { defaultTestSetup, scriptedTestSetup } from "@/lib/demo/test-setup";
import { type TestSetup } from "@/lib/test-setup";

type Data = Workspace & {
  links: {
    token: string;
    audience: string;
    revisionId: string;
    revoked: number;
    testSetup?: TestSetup | null;
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
  participant: "Participant test",
};
const scenarioStates = uploadStates;
const labels: Record<UploadState, string> = {
  ready: "Ready to upload",
  failed: "Upload interrupted",
  complete: "Document received",
};
const subscribeHydration = () => () => {};

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
  const [workspaceMode, setWorkspaceMode] = useState<"design" | "review">(
    "design",
  );
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  const [presentation, setPresentation] = useState(false);
  const [viewOptions, setViewOptions] = useState(false);
  const [evidence, setEvidence] = useState<EvidenceContext | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [focus, setFocus] = useState<PreviewFocus>("page");
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const renderedScale = useRef(1);
  const rememberScale = useCallback((scale: number) => {
    renderedScale.current = scale;
  }, []);
  const [canvasReset, setCanvasReset] = useState(0);
  const [phoneModel, setPhoneModel] = useState("iphone");
  const [phoneUnfolded, setPhoneUnfolded] = useState(false);
  const phoneWidth = phoneModel === "duo" && phoneUnfolded ? 740 : 390;
  const phoneLabel =
    phoneModel === "duo"
      ? `iPhone Duo · ${phoneUnfolded ? "Unfolded" : "Folded"}`
      : "iPhone";
  const [showFeedback, setShowFeedback] = useState(false);
  const [data, setData] = useState<Data>(initial);
  const [revision, setRevision] = useState<Revision>(preview);
  const [draft, setDraft] = useState<Config>(baseline);
  const [state, setState] = useState<UploadState>("ready");
  const [playing, setPlaying] = useState(true);
  const [viewport, setViewport] = useState("desktop");
  const [audience, setAudience] = useState<Audience>("designer");
  const [participantToken, setParticipantToken] = useState("");
  const [participantRevision, setParticipantRevision] =
    useState<Revision | null>(null);
  const [view, setView] = useState("review");
  const [journeyDirty, setJourneyDirty] = useState(false);
  const [panel, setPanel] = useState("brief");
  const [anchor, setAnchor] = useState("document-uploader");
  const [commentViewport, setCommentViewport] = useState("desktop");
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
  const [linkError, setLinkError] = useState("");
  const [testSetup, setTestSetup] = useState<TestSetup>(defaultTestSetup);
  const [readyTest, setReadyTest] = useState<{
    token: string;
    revision: Revision;
    setup: TestSetup;
  } | null>(null);
  const [activeTestSetup, setActiveTestSetup] = useState<
    TestSetup | undefined
  >();
  const [saveNote, setSaveNote] = useState("Manual design update");
  const initialized = useRef(false);
  const mutationPending = useRef(false);
  const refreshSequence = useRef(0);
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = !sameConfig(draft, revision.config);
  const currentChecks = checks(draft);
  const passed = currentChecks.filter((c) => c.pass).length;
  const isDesigner = audience === "designer";
  const participant = audience === "participant";
  const feedbackVisible =
    showFeedback && data.preferences.comments && !participant;
  const dark = mounted && resolvedTheme === "dark";
  const previous = previousRevision(data.revisions, revision);
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    try {
      const next = await request<Data>("/api/workspace");
      if (sequence !== refreshSequence.current) return next;
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
      if (sequence !== refreshSequence.current) return null;
      const err = e as Error & { status?: number };
      setError(err.message);
      setNeedsSignIn(err.status === 401);
      return null;
    }
  }, []);
  useEffect(() => {
    // Bootstrap from asynchronous storage; this is not derived UI state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    return () => {
      if (aiTimer.current) clearTimeout(aiTimer.current);
    };
  }, [refresh]);
  useEffect(() => {
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
    if (mutationPending.current || !loaded) return false;
    mutationPending.current = true;
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
      mutationPending.current = false;
      setBusy(false);
    }
  }
  function chooseRevision(next: Revision) {
    if (dirty || mutationPending.current) return;
    setEvidence(null);
    if (aiTimer.current) clearTimeout(aiTimer.current);
    setShareUrl("");
    setReadyTest(null);
    setCompare(false);
    setRevision(next);
    setDraft(next.config);
    setAssistant("idle");
    setReply("");
    setSaveNote("Manual design update");
    setState("ready");
  }
  async function save(config: Config, note: string) {
    if (mutationPending.current || !loaded) return;
    mutationPending.current = true;
    const startingDraft = draft;
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
      setDraft((current) =>
        sameConfig(current, startingDraft) ? result.revision.config : current,
      );
      setShareUrl("");
      setReadyTest(null);
      toast.success(`Version ${result.revision.number} saved`);
      return result.revision;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      mutationPending.current = false;
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
      setReply(recoveryAgent.review(passed));
    }, recoveryAgent.delayMs);
  }
  async function applyFix() {
    const saved = await save(
      { ...draft, ...improvement },
      evidence
        ? `Recovery change from v${evidence.source.number}; evidence session ${evidence.session.id}. Human review required.`
        : "Scripted assistant: clearer error, retry action, and alert announcement.",
    );
    if (saved) {
      if (evidence) setEvidence({ ...evidence, updated: saved });
      setState("failed");
      setAssistant("applied");
      setReply(recoveryAgent.applied);
    }
  }
  function changeState(next: UploadState, event: string) {
    setState(next);
    if (event === "continue")
      toast.success("Scenario completed. No application was submitted.");
  }
  async function createLink() {
    if (mutationPending.current || !loaded) return;
    setLinkError("");
    if (dirty) {
      toast.error("Save the draft before sharing");
      return;
    }
    mutationPending.current = true;
    setBusy(true);
    try {
      const r = await request<{ path: string; token: string }>(
        "/api/workspace",
        {
          action: "share",
          revisionId: revision.id,
          audience: shareRole,
          ...(shareRole === "participant" ? { testSetup } : {}),
        },
      );
      setShareUrl(window.location.origin + r.path);
      setReadyTest(
        shareRole === "participant"
          ? { token: r.token, revision, setup: testSetup }
          : null,
      );
      if (shareRole === "participant") toast.success("Your test is ready.");
      await refresh();
    } catch (e) {
      setLinkError((e as Error).message);
    } finally {
      mutationPending.current = false;
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
  const caseStudy = () => buildCaseStudy(data);

  const stateRef = useRef({ state, revision });
  useLayoutEffect(() => {
    stateRef.current = { state, revision };
  }, [state, revision]);
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

  if (participantToken)
    return (
      <ParticipantTest
        setup={activeTestSetup}
        token={participantToken}
        revision={participantRevision ?? revision}
        onReturn={() => {
          setParticipantToken("");
          setParticipantRevision(null);
          setAudience("designer");
          setView("results");
          void refresh();
        }}
      />
    );
  if (workspaceMode === "design")
    return (
      <DesignWorkspace
        draft={draft}
        onChange={setDraft}
        revision={revision}
        state={state}
        onState={setState}
        anchor={anchor}
        onAnchor={setAnchor}
        busy={busy}
        loaded={loaded}
        error={error}
        dark={dark}
        onTheme={() => setTheme(dark ? "light" : "dark")}
        comments={data.comments}
        onSave={() => void save(draft, "Manual update from design workspace")}
        onReview={(feedback) => {
          setWorkspaceMode("review");
          setAudience("designer");
          setView("review");
          setPanel(feedback ? "feedback" : "brief");
        }}
      />
    );
  if (audience === "po")
    return (
      <POReview
        key={revision.id}
        revision={revision}
        previous={previous}
        sessions={data.sessions}
        comments={data.comments}
        busy={busy || !loaded}
        error={error}
        onAction={action}
        onBack={() => {
          setAudience("designer");
          setView("review");
          setPanel("brief");
        }}
        dark={dark}
        onTheme={() => setTheme(dark ? "light" : "dark")}
      />
    );
  return (
    <TooltipProvider delayDuration={250}>
      <div className={`studio ${presentation ? "is-presenting" : ""}`}>
        <header className="studio-header">
          <Button
            variant="ghost"
            onClick={() => {
              if (journeyDirty) {
                setView("journey");
                toast.error(
                  "Save or discard your journey changes before leaving.",
                );
                return;
              }
              setWorkspaceMode("design");
            }}
          >
            <ArrowRight size={16} className="rotate-180" />
            Back to design
          </Button>
          <span className="studio-brand">
            <Layers3 />
            Flow Review
          </span>
          <span className="breadcrumb">
            Homepath <span className="dot">/</span> Document upload
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Workspace options"
                title="Workspace options"
              >
                <MoreHorizontal size={19} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <div className="workspace-environment">Prototype environment</div>
              <DropdownMenuItem
                onSelect={() => setTheme(dark ? "light" : "dark")}
              >
                {dark ? <Sun /> : <Moon />}
                {dark ? "Use light mode" : "Use dark mode"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={startPresentation}>
                <Presentation />
                Present component
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog("notifications")}>
                <Bell />
                Notifications
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!previous}
                onSelect={() => {
                  setCompare(!compare);
                  setViewport("desktop");
                  setView("review");
                }}
              >
                <GitCompareArrows />
                {compare ? "Stop comparing" : "Compare versions"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  download(
                    "flow-review-handoff.json",
                    JSON.stringify(
                      createHandoff(
                        revision,
                        draft,
                        data.comments,
                        currentChecks,
                        DEMO_IDS.upload,
                        scenarioStates,
                      ),
                      null,
                      2,
                    ),
                  )
                }
              >
                <Download />
                Export handoff
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
            <p className="eyebrow">
              {
                {
                  review: "Design review",
                  results: "Test results",
                  journey: "User journey",
                  build: "Edit component",
                  case: "Case study",
                }[view]
              }{" "}
              · {audienceNames[audience]}
            </p>
            <h1>Document upload</h1>
            <p>
              Recovery flow <span className="dot">·</span> v{revision.number}
              {dirty ? " · Unsaved draft" : " · Saved version"}
              {" · "}
              {
                data.sessions.filter(
                  (s) =>
                    s.revisionId === revision.id && s.outcome !== "started",
                ).length
              }{" "}
              finished tests · Human review required
            </p>
          </div>
          <div className="heading-actions">
            <Select
              value={audience}
              onValueChange={async (v) => {
                if (v !== "designer" && journeyDirty) {
                  setView("journey");
                  toast.error(
                    "Save or discard your journey changes before switching audience.",
                  );
                  return;
                }
                if (v === "participant") {
                  if (dirty || journeyDirty || mutationPending.current) {
                    toast.error(
                      "Save or discard component and journey changes before starting a test.",
                    );
                    return;
                  }
                  mutationPending.current = true;
                  const setup: TestSetup = {
                    ...defaultTestSetup,
                    scenario: revision.config.retryEnabled
                      ? "recovery"
                      : "success",
                  };
                  setActiveTestSetup(setup);
                  setBusy(true);
                  try {
                    const link = await request<{ token: string }>(
                      "/api/workspace",
                      {
                        action: "share",
                        revisionId: revision.id,
                        audience: "participant",
                        testSetup: setup,
                      },
                    );
                    setParticipantRevision(revision);
                    setParticipantToken(link.token);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    mutationPending.current = false;
                    setBusy(false);
                  }
                  return;
                }
                setAudience(v as Audience);
                if (v !== "designer") setView("review");
                if (v === "po") setPanel("feedback");
                if (v === "engineer") setPanel("checks");
              }}
            >
              <SelectTrigger
                aria-label="Audience view"
                disabled={!loaded || busy}
              >
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
                <TabsTrigger value="journey">
                  <GitCompareArrows />
                  Journey
                </TabsTrigger>
              )}
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
            {isDesigner && (
              <Button
                variant="ghost"
                className="setup-nav-action"
                disabled={!loaded}
                onClick={() => {
                  setShareRole("participant");
                  setShareUrl("");
                  setDialog("share");
                }}
              >
                <Settings2 size={15} />
                Set up test
              </Button>
            )}
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
                    <span>{playing ? "Preview" : "Paused"}</span>
                  </div>
                  <div className="stage-primary-actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPanel("feedback");
                        setView("review");
                        setAnnotations(true);
                        if (presentation) exitPresentation();
                      }}
                    >
                      <MessageSquare size={15} />
                      Comment
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-expanded={viewOptions}
                      aria-controls="preview-options"
                      onClick={() => setViewOptions(!viewOptions)}
                    >
                      <Settings2 size={15} />
                      View options
                    </Button>
                  </div>
                </div>
                <div
                  id="preview-options"
                  className="preview-options"
                  hidden={!viewOptions}
                >
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
                      onClick={() => {
                        setViewport("mobile");
                        setCompare(false);
                      }}
                    >
                      <Smartphone size={17} />
                    </IconButton>
                    <IconButton
                      label="Desktop and mobile"
                      active={viewport === "both"}
                      onClick={() => {
                        setViewport("both");
                        setCompare(false);
                      }}
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
                  <div className="inspection-toolbar">
                    {viewport !== "desktop" && (
                      <>
                        <Select
                          value={phoneModel}
                          onValueChange={(value) => {
                            setPhoneModel(value);
                            setZoom("fit");
                          }}
                        >
                          <SelectTrigger aria-label="Phone model">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="iphone">iPhone</SelectItem>
                            <SelectItem value="duo">iPhone Duo</SelectItem>
                          </SelectContent>
                        </Select>
                        {phoneModel === "duo" && (
                          <div
                            className="fold-controls"
                            role="group"
                            aria-label="Phone posture"
                          >
                            <Button
                              size="sm"
                              variant={phoneUnfolded ? "ghost" : "secondary"}
                              aria-pressed={!phoneUnfolded}
                              onClick={() => {
                                setPhoneUnfolded(false);
                                setZoom("fit");
                              }}
                            >
                              Folded
                            </Button>
                            <Button
                              size="sm"
                              variant={phoneUnfolded ? "secondary" : "ghost"}
                              aria-pressed={phoneUnfolded}
                              onClick={() => {
                                setPhoneUnfolded(true);
                                setZoom("fit");
                              }}
                            >
                              Unfolded
                            </Button>
                          </div>
                        )}
                      </>
                    )}
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
                        <SelectItem value="component">
                          Component only
                        </SelectItem>
                        <SelectItem value="error">Error message</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="zoom-controls">
                      <IconButton
                        label="Zoom out"
                        disabled={zoom !== "fit" && zoom <= 0.15}
                        onClick={() =>
                          setZoom(
                            Math.max(
                              0.15,
                              (zoom === "fit" ? renderedScale.current : zoom) -
                                0.25,
                            ),
                          )
                        }
                      >
                        <ZoomOut size={17} />
                      </IconButton>
                      <Select
                        value={String(zoom)}
                        onValueChange={(value) => {
                          setZoom(value === "fit" ? "fit" : Number(value));
                          if (value === "fit") setCanvasReset((n) => n + 1);
                        }}
                      >
                        <SelectTrigger aria-label="Preview zoom">
                          <SelectValue>
                            {zoom === "fit"
                              ? "Fit"
                              : `${Math.round(zoom * 100)}%`}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fit">Fit</SelectItem>
                          {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3].map(
                            (z) => (
                              <SelectItem value={String(z)} key={z}>
                                {Math.round(z * 100)}%
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                      <IconButton
                        label="Zoom in"
                        disabled={zoom !== "fit" && zoom >= 3}
                        onClick={() =>
                          setZoom(
                            Math.min(
                              3,
                              (zoom === "fit" ? renderedScale.current : zoom) +
                                0.25,
                            ),
                          )
                        }
                      >
                        <ZoomIn size={17} />
                      </IconButton>
                      <IconButton
                        label="Fit preview"
                        onClick={() => {
                          setZoom("fit");
                          setCanvasReset((n) => n + 1);
                        }}
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
                </div>
                <div
                  className={`stage-body ${feedbackVisible ? "with-feedback" : ""}`}
                >
                  <PreviewCanvas
                    zoom={zoom}
                    onZoom={setZoom}
                    onScaleChange={rememberScale}
                    resetKey={canvasReset}
                    feedback={feedbackVisible}
                    viewport={viewport}
                    phoneWidth={phoneWidth}
                    paired={
                      viewport === "both" ||
                      (compare && !!previous && !participant)
                    }
                    focus={focus}
                  >
                    {compare && previous && !participant && (
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
                      className={`device-wrap ${feedbackVisible ? "review-device" : ""} ${viewport === "mobile" ? "mobile-wrap phone-simulation" : ""}`}
                      style={
                        viewport === "mobile"
                          ? {
                              flex: `0 0 ${phoneWidth}px`,
                              maxWidth: phoneWidth,
                            }
                          : undefined
                      }
                    >
                      <div className="device-label">
                        {viewport === "mobile"
                          ? `${phoneLabel} · Preview`
                          : "Desktop"}
                        <span>{dirty ? "Draft" : `v${revision.number}`}</span>
                      </div>
                      <Uploader
                        focus={focus}
                        config={draft}
                        state={state}
                        playing={playing}
                        onState={changeState}
                        compact={
                          viewport === "mobile" &&
                          !(phoneModel === "duo" && phoneUnfolded)
                        }
                        annotate={!participant && annotations && !presentation}
                        onAnchor={(a) => {
                          setAnchor(a);
                          setCommentViewport(
                            viewport === "mobile" ? "mobile" : "desktop",
                          );
                          setPanel("feedback");
                          setView("review");
                        }}
                      />
                      {feedbackVisible && (
                        <AnchoredComments
                          comments={placedComments(
                            data.comments,
                            revision.id,
                            state,
                            viewport === "mobile" ? "mobile" : "desktop",
                          )}
                          busy={busy}
                          onAction={action}
                          onOpen={(c) => {
                            setAnchor(c.anchor);
                            setPanel("feedback");
                            setView("review");
                            if (presentation) exitPresentation();
                          }}
                        />
                      )}
                    </div>
                    {viewport === "both" && !compare && (
                      <div
                        className={`device-wrap mobile-wrap phone-simulation ${feedbackVisible ? "review-device" : ""}`}
                        style={{
                          flex: `0 0 ${phoneWidth}px`,
                          maxWidth: phoneWidth,
                        }}
                      >
                        <div className="device-label">
                          {phoneLabel} <span>Preview</span>
                        </div>
                        <Uploader
                          focus={focus}
                          config={draft}
                          state={state}
                          playing={playing}
                          onState={changeState}
                          compact={!(phoneModel === "duo" && phoneUnfolded)}
                          annotate={
                            !participant && annotations && !presentation
                          }
                          onAnchor={(a) => {
                            setAnchor(a);
                            setCommentViewport("mobile");
                            setPanel("feedback");
                          }}
                        />
                        {feedbackVisible && (
                          <AnchoredComments
                            comments={placedComments(
                              data.comments,
                              revision.id,
                              state,
                              "mobile",
                            )}
                            busy={busy}
                            onAction={action}
                            onOpen={(c) => {
                              setAnchor(c.anchor);
                              setPanel("feedback");
                              setView("review");
                              if (presentation) exitPresentation();
                            }}
                          />
                        )}
                      </div>
                    )}
                  </PreviewCanvas>
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
                <UploadProperties
                  draft={draft}
                  setDraft={setDraft}
                  revision={revision}
                  saveNote={saveNote}
                  setSaveNote={setSaveNote}
                  dirty={dirty}
                  busy={busy}
                  loaded={loaded}
                  save={save}
                />
              ) : (
                <aside
                  className={`review-panel ${panel === "assistant" && isDesigner ? "assistant-open" : ""}`}
                >
                  {evidence && (
                    <EvidenceTrail
                      key={evidence.session.id}
                      evidence={evidence}
                      comments={data.comments}
                      busy={busy || dirty}
                      onClose={() => setEvidence(null)}
                      onReview={inspect}
                      onVersion={(r) => {
                        chooseRevision(r);
                        setEvidence(evidence);
                      }}
                    />
                  )}
                  <Tabs value={panel} onValueChange={setPanel}>
                    <TabsList className="inspector-tabs" variant="line">
                      {isDesigner && (
                        <TabsTrigger
                          value="brief"
                          aria-label="Review brief"
                          title="Review brief"
                        >
                          <ClipboardCheck />
                        </TabsTrigger>
                      )}
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
                      <TabsContent value="brief">
                        <ReviewBrief
                          data={data}
                          revision={revision}
                          state={state}
                          dirty={dirty}
                          onState={setState}
                          onFeedback={() => setPanel("feedback")}
                          onResults={() => setView("results")}
                          onChecks={() => setPanel("checks")}
                          onSuggest={inspect}
                        />
                      </TabsContent>
                    )}
                    {isDesigner && (
                      <TabsContent
                        value="assistant"
                        className="assistant-tab"
                        data-demo-id={DEMO_IDS.recoveryAgent}
                      >
                        <div className="panel-title">
                          <Sparkles size={16} />
                          <strong>Flow assistant</strong>
                        </div>
                        <div className="panel-section assistant-section">
                          <p className="eyebrow">UPLOAD RECOVERY</p>
                          <h2>A clearer way back.</h2>
                          <p>
                            The current component has {3 - passed} open{" "}
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
                                <h3>Suggested change</h3>
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
                        </div>
                        <div className="assistant-composer">
                          <form
                            className="assistant-prompt guided-composer"
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (
                                !prompt.trim() ||
                                busy ||
                                assistant === "thinking"
                              )
                                return;
                              if (demoPromptIntent(prompt) === "test") {
                                setTestSetup(
                                  scriptedTestSetup(
                                    prompt,
                                    revision.config.retryEnabled,
                                  ),
                                );
                                setShareRole("participant");
                                setShareUrl("");
                                setDialog("share");
                                setReply(recoveryAgent.prepared);
                              } else if (
                                demoPromptIntent(prompt) === "review"
                              ) {
                                inspect();
                              } else {
                                setReply(recoveryAgent.unsupported);
                              }
                              setPrompt("");
                            }}
                          >
                            <GuidedPrompt
                              label="Message Flow assistant"
                              value={prompt}
                              maxLength={400}
                              onChange={setPrompt}
                              prompts={reviewPrompts}
                              disabled={busy || assistant === "thinking"}
                            />
                            <Button
                              type="submit"
                              size="icon"
                              variant="ghost"
                              disabled={
                                !prompt.trim() ||
                                busy ||
                                assistant === "thinking"
                              }
                              aria-label="Send to Flow assistant"
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
                        viewport={
                          viewport === "both" ? commentViewport : viewport
                        }
                        anchor={anchor}
                        busy={busy || !loaded}
                        onAction={action}
                        onJump={(c) => {
                          setState(c.state);
                          setViewport(c.viewport);
                          setCommentViewport(c.viewport);
                          setAnchor(c.anchor);
                        }}
                      />
                    </TabsContent>
                    <TabsContent
                      value="checks"
                      data-demo-id={DEMO_IDS.readiness}
                    >
                      <div className="panel-section">
                        <div className="section-heading">
                          <h3>Readiness checks</h3>
                          <span className="badge">{passed}/3 configured</span>
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
                      </div>
                    </TabsContent>
                    <TabsContent value="history">
                      <div className="panel-section">
                        <div className="section-heading">
                          <h3>Version history</h3>
                        </div>
                        {data.revisions.map((r) => (
                          <button
                            key={r.id}
                            className={`version-row ${r.id === revision.id ? "active" : ""}`}
                            disabled={dirty || busy}
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
        {loaded && !participant && (
          <div
            hidden={view !== "journey" || presentation}
            className="journey-host"
          >
            <JourneyView
              data={data}
              revision={revision}
              editable={isDesigner}
              onDirty={setJourneyDirty}
              onReview={(state) => {
                if (dirty || busy) {
                  toast.error(
                    "Save or discard the component draft before reviewing the linked version.",
                  );
                  return;
                }
                setState(state);
                setView("review");
                setFocus("component");
                setZoom("fit");
                setAnchor(
                  state === "failed"
                    ? UPLOAD_ANCHORS.error
                    : UPLOAD_ANCHORS.component,
                );
              }}
              onTest={(step) => {
                setTestSetup({
                  ...defaultTestSetup,
                  title: `Test: ${step.title}`.slice(0, 100),
                  task: step.action || defaultTestSetup.task,
                  instructions: step.goal || defaultTestSetup.instructions,
                  focus: "component",
                  scenario:
                    step.link === "failed" && revision.config.retryEnabled
                      ? "recovery"
                      : "success",
                });
                setShareRole("participant");
                setShareUrl("");
                setReadyTest(null);
                setDialog("share");
              }}
              onResults={() => setView("results")}
            />
          </div>
        )}
        {view === "results" && !participant && (
          <ReviewResults
            revisionId={revision.id}
            data={data}
            loaded={loaded}
            refresh={refresh}
            onReviewEvidence={(session) => {
              if (dirty || busy) {
                toast.error(
                  "Save or discard your draft before reviewing another version.",
                );
                return;
              }
              const source = data.revisions.find(
                (r) => r.id === session.revisionId,
              );
              if (!source) return;
              chooseRevision(source);
              setEvidence({ session, source });
              setState(
                session.events.some((e) => e.type === "upload_attempt")
                  ? "failed"
                  : "ready",
              );
              setView("review");
              setPanel("assistant");
              setAudience("designer");
            }}
            onCreateTest={() => {
              setShareRole("participant");
              setShareUrl("");
              setDialog("share");
            }}
          />
        )}
        {view === "case" && !participant && (
          <UploadCaseStudy
            data={data}
            dirty={dirty}
            busy={busy}
            caseStudy={caseStudy}
            onRevision={(r) => {
              chooseRevision(r);
              setView("review");
              setPanel("history");
            }}
          />
        )}
        <footer className="studio-footer">
          <span>
            <span className="status-dot live" />
            Flow Review
          </span>
          <span>Feedback & version history</span>
        </footer>

        <Dialog
          open={dialog === "share"}
          onOpenChange={(v) => {
            if (!v) setDialog(null);
          }}
        >
          <DialogContent className="test-setup-dialog">
            <DialogHeader>
              <DialogTitle>Share version {revision.number}</DialogTitle>
              <DialogDescription>
                Links stay pinned to this saved version. This Site is private;
                recipients also need Site access.
              </DialogDescription>
            </DialogHeader>
            <Select
              value={shareRole}
              disabled={busy}
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
            {shareRole === "participant" && (
              <TestSetupEditor
                value={testSetup}
                canRetry={revision.config.retryEnabled}
                disabled={busy}
                onChange={(value) => {
                  setTestSetup(value);
                  setShareUrl("");
                  setReadyTest(null);
                }}
              />
            )}
            {dirty && (
              <p className="text-destructive text-sm">
                Save the draft before creating a link.
              </p>
            )}
            {linkError && (
              <p role="alert" className="text-destructive text-sm">
                {linkError}
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
              <>
                {shareRole === "participant" && readyTest && (
                  <div className="test-ready" role="status">
                    <strong>Your test is ready</strong>
                    <span>
                      {readyTest.setup.audience} · {readyTest.setup.viewport} ·{" "}
                      {readyTest.setup.focus === "page"
                        ? "Full page"
                        : "Component"}
                    </span>
                    <Button
                      onClick={() => {
                        if (journeyDirty) {
                          setDialog(null);
                          setView("journey");
                          toast.error(
                            "Save or discard your journey changes before starting the test.",
                          );
                          return;
                        }
                        setActiveTestSetup(readyTest.setup);
                        setParticipantRevision(readyTest.revision);
                        setParticipantToken(readyTest.token);
                        setDialog(null);
                      }}
                    >
                      <Play size={15} />
                      Try test
                    </Button>
                  </div>
                )}
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
              </>
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
                      {l.testSetup
                        ? `${l.testSetup.title} · ${l.testSetup.audience}`
                        : l.audience === "participant"
                          ? "Participant"
                          : "Review"}{" "}
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
