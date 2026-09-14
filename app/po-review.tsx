"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  ExternalLink,
  MessageSquare,
  Maximize2,
  MonitorPlay,
  Moon,
  Play,
  Printer,
  RotateCcw,
  Share2,
  Sun,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import LabeledField from "@/components/labeled-field";
import RightPanel from "@/components/right-panel";
import WorkspaceHeader from "@/components/workspace-header";
import type { Comment, ReviewDecision, Revision, Session, UploadState } from "@/lib/model";
import { checks } from "@/lib/demo/upload";
import { sessionFacts, summarizeResults } from "@/lib/results";
import { isDecisionRecord, placedComments, verificationChecks } from "@/lib/review";
import DocumentUploader from "./demo/document-uploader";
import ReviewComments from "./review-comments";

const sections = ["Overview", "Tests", "Proposals", "Implementation", "Decision"] as const;
type Section = (typeof sections)[number];
type Decision = "Approve for next test" | "Request updates" | "Do not approve";
const decisions: Decision[] = ["Approve for next test", "Request updates", "Do not approve"];
const states: UploadState[] = ["ready", "failed", "complete"];
const stateNames: Record<UploadState, string> = {
  ready: "Before upload",
  failed: "Upload interrupted",
  complete: "Document received",
};
const changeNames = {
  title: "Upload heading",
  helper: "Document instructions",
  error: "Recovery message",
  button: "Upload action",
  retryEnabled: "Retry action",
  announceError: "Error announcement",
};
function presentNote(note: string) {
  return note.replace(/evidence session [a-f0-9-]{36}/i, "participant test evidence");
}

export default function POReview({
  revision,
  previous,
  sessions,
  comments,
  decisions: decisionRecords,
  busy,
  error,
  onAction,
  onCreateShare,
  onBack,
  dark,
  onTheme,
}: {
  revision: Revision;
  previous?: Revision;
  sessions?: Session[];
  comments: Comment[];
  decisions: ReviewDecision[];
  busy: boolean;
  error?: string;
  onAction: (payload: Record<string, unknown>) => Promise<boolean>;
  onCreateShare?: () => Promise<string>;
  onBack?: () => void;
  dark?: boolean;
  onTheme?: () => void;
}) {
  const [section, setSection] = useState<Section>("Overview");
  const [presenting, setPresenting] = useState(false);
  const [discussion, setDiscussion] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFocus, setPreviewFocus] = useState<"page" | "component">("page");
  const [previewFit, setPreviewFit] = useState({ width: 830, height: 0, scale: 1 });
  const [commentFocusRequest, setCommentFocusRequest] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [shareError, setShareError] = useState("");
  const [shareNotice, setShareNotice] = useState("");
  const [state, setState] = useState<UploadState>("ready");
  const [anchor, setAnchor] = useState("document-uploader");
  const [completed, setCompleted] = useState(false);
  const [decision, setDecision] = useState<Decision>("Request updates");
  const [reason, setReason] = useState("");
  const [owner, setOwner] = useState("Designer");
  const [nextStep, setNextStep] = useState("Review feedback and propose the next version.");
  const [saved, setSaved] = useState("");
  const sending = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLElement>(null);
  const [previewFrame, setPreviewFrame] = useState<HTMLDivElement | null>(null);
  const previewContents = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!previewOpen) return;
    const frame = previewFrame;
    const inner = previewContents.current;
    if (!frame || !inner) return;
    function measure() {
      if (!frame || !inner) return;
      const width = Math.max(280, frame.clientWidth - 32);
      const height = inner.offsetHeight;
      if (!height) return;
      const scale = Math.min(1, (frame.clientWidth - 32) / width, (frame.clientHeight - 32) / height);
      setPreviewFit((current) => current.width === width && current.height === height && Math.abs(current.scale - scale) < 0.001 ? current : { width, height, scale });
    }
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(inner);
    measure();
    return () => observer.disconnect();
  }, [previewFrame, previewOpen, previewFocus, state]);

  const scoped = sessions?.filter((session) => session.revisionId === revision.id);
  const summary = scoped ? summarizeResults(scoped) : null;
  const flagged = scoped?.filter((session) => sessionFacts(session).attention) ?? [];
  const quotes = scoped?.filter((session) => session.feedback.trim()) ?? [];
  const discussionComments = comments.filter((comment) => !isDecisionRecord(comment));
  const unresolved = discussionComments.filter((comment) => comment.revisionId === revision.id && !comment.parentId && !comment.resolved);
  const latestDecision = decisionRecords
    .filter((item) => item.revisionId === revision.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const legacyDecision = comments
    .filter((comment) => comment.revisionId === revision.id && !comment.parentId && isDecisionRecord(comment))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const decisionLabel = latestDecision?.choice;
  const decisionAuthor = latestDecision?.author;
  const changes = previous
    ? (Object.keys(changeNames) as (keyof typeof changeNames)[]).filter((key) => previous.config[key] !== revision.config[key])
    : [];
  const reviewChecks = checks(revision.config);
  const needsWork = reviewChecks.filter((check) => !check.pass);
  const openReadinessItems = needsWork.length + verificationChecks.length;

  function navigate(next: Section) {
    setSection(next);
    requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      content.current?.scrollTo({ top: 0 });
    });
  }

  function showState(next: UploadState) {
    setState(next);
    setCompleted(false);
  }

  function openPreviewComment(target = "document-uploader", focusComposer = false) {
    setAnchor(target);
    setPreviewOpen(false);
    setDiscussion(true);
    if (focusComposer) setCommentFocusRequest((request) => request + 1);
  }

  function previewControls(expanded = false) {
    return <div className="po-preview-controls" role="group" aria-label="Prototype controls">
      <div className="po-preview-modes" role="group" aria-label="Preview scope">
        <Button variant={previewFocus === "page" ? "secondary" : "ghost"} size="sm" aria-pressed={previewFocus === "page"} onClick={() => setPreviewFocus("page")}>Full page</Button>
        <Button variant={previewFocus === "component" ? "secondary" : "ghost"} size="sm" aria-pressed={previewFocus === "component"} onClick={() => setPreviewFocus("component")}>Component</Button>
      </div>
      <div className="po-preview-states" role="group" aria-label="Prototype state">
        {states.map((item) => <Button key={item} variant={state === item ? "secondary" : "ghost"} size="sm" aria-pressed={state === item} onClick={() => showState(item)}>{stateNames[item]}</Button>)}
        <Button variant="ghost" size="icon" aria-label="Restart walkthrough" title="Restart walkthrough" onClick={() => showState("ready")}><RotateCcw size={16} /></Button>
      </div>
      <div className="po-preview-actions">
        <Button variant="outline" size="sm" onClick={() => openPreviewComment("document-uploader", true)}><MessageSquare size={15} /> Leave comment</Button>
        {!expanded && <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}><Maximize2 size={15} /> Expand</Button>}
      </div>
    </div>;
  }

  function prototype() {
    return <DocumentUploader
      config={revision.config}
      state={state}
      focus={previewFocus}
      onState={(next, event) => { setState(next); if (event === "continue") setCompleted(true); }}
      annotate
      anchorComments={placedComments(discussionComments, revision.id, state, "desktop")}
      onAnchor={(target) => openPreviewComment(target, true)}
      onOpenComment={(comment) => { setState(comment.state); openPreviewComment(comment.anchor); }}
      onCommentAction={onAction}
      commentBusy={busy}
    />;
  }

  function selectDecision(next: Decision) {
    setDecision(next);
    setNextStep(
      next === "Approve for next test"
        ? "Schedule another participant test."
        : next === "Do not approve"
          ? "Revisit the upload flow before further testing."
          : "Review feedback and propose the next version.",
    );
    setSaved("");
  }

  async function share() {
    if (shareBusy) return;
    setShareBusy(true);
    setShareError("");
    setShareNotice("");
    try {
      const url = onCreateShare ? await onCreateShare() : window.location.href;
      setShareUrl(url);
      setShareOpen(true);
    } catch (cause) {
      setShareError((cause as Error).message);
      setShareOpen(true);
    } finally {
      setShareBusy(false);
    }
  }

  async function recordDecision(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current || busy || !reason.trim() || !owner.trim() || !nextStep.trim()) return;
    sending.current = true;
    setSaved("");
    try {
      const ok = await onAction({
        action: "decision",
        revisionId: revision.id,
        choice: decision,
        rationale: reason.trim(),
        followUpOwner: owner.trim(),
        nextStep: nextStep.trim(),
      });
      if (ok) {
        setSaved("Decision recorded on this version.");
        setReason("");
      }
    } finally {
      sending.current = false;
    }
  }

  const sectionTitle = <div className="po-section-title">
    <p className="eyebrow">Product review · v{revision.number}</p>
    <h2 ref={heading} tabIndex={-1}>{section}</h2>
  </div>;

  return (
    <div
      className={`po-review ${presenting ? "po-presenting" : ""}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && presenting) setPresenting(false);
        if (!presenting || (event.target as HTMLElement).closest("input,textarea,select,button,[contenteditable=true]")) return;
        const index = sections.indexOf(section);
        if (event.key === "ArrowRight" && index < sections.length - 1) navigate(sections[index + 1]);
        if (event.key === "ArrowLeft" && index > 0) navigate(sections[index - 1]);
      }}
    >
      <div className="workspace-chrome">
        <WorkspaceHeader
          className="po-header"
          title="Document upload"
          context={`Product review · Saved v${revision.number}`}
          back={onBack && !presenting ? { label: "Back to designer", onClick: onBack } : undefined}
          actions={<>
            {onTheme && !presenting && (
              <Button variant="ghost" size="icon" aria-label={dark ? "Use light mode" : "Use dark mode"} title={dark ? "Use light mode" : "Use dark mode"} onClick={onTheme}>
                {dark ? <Sun size={17} /> : <Moon size={17} />}
              </Button>
            )}
            {!presenting && (
              <>
                <Button variant="ghost" size="sm" onClick={() => setDiscussion(true)}><MessageSquare size={16} /> Comments <span className="po-action-count">{unresolved.length}</span></Button>
                <Button variant="ghost" size="icon" aria-label="Print review" title="Print review" onClick={() => window.print()}><Printer size={17} /></Button>
                <Button variant="ghost" size="icon" aria-label="Share review" title="Share review" disabled={shareBusy} onClick={() => void share()}><Share2 size={17} /></Button>
              </>
            )}
            {presenting && (
              <div className="po-presentation-controls" role="group" aria-label="Presentation navigation">
                <Button variant="ghost" size="icon" aria-label="Previous section" title="Previous section" disabled={section === sections[0]} onClick={() => navigate(sections[sections.indexOf(section) - 1])}><ChevronLeft size={18} /></Button>
                <span aria-live="polite">{sections.indexOf(section) + 1} / {sections.length}</span>
                <Button variant="ghost" size="icon" aria-label="Next section" title="Next section" disabled={section === sections.at(-1)} onClick={() => navigate(sections[sections.indexOf(section) + 1])}><ChevronRight size={18} /></Button>
              </div>
            )}
            <Button variant={presenting ? "outline" : "default"} size="sm" onClick={() => { if (!presenting) navigate("Overview"); setPresenting(!presenting); setDiscussion(false); }}>
              {presenting ? <X size={16} /> : <MonitorPlay size={16} />}
              {presenting ? "Exit presentation" : "Present"}
            </Button>
          </>}
        />

        <div className="po-review-nav" role="group" aria-label="Product review sections">
          {sections.map((item) => (
            <Button key={item} variant={section === item ? "secondary" : "ghost"} size="sm" aria-pressed={section === item} onClick={() => navigate(item)}>{item}</Button>
          ))}
        </div>
      </div>
      {error && <p className="error-banner" role="alert">{error}</p>}

      <main className="po-content">
        <div ref={content} className={`po-content-scroll ${section === "Overview" ? "po-content-scroll-overview" : ""}`}>
          {section !== "Overview" && sectionTitle}

          {section === "Overview" && (
            <div className="po-overview">
              <div className="po-overview-details">
                {sectionTitle}
                <p className="po-lead">Decide whether this saved upload experience should move to another test, needs updates, or should not proceed.</p>
                <p className="po-muted po-overview-guidance">Explore each state in the saved experience, then comment on what needs attention.</p>
                <div className="po-snapshot" aria-label="Review snapshot">
                  <div><strong>{scoped ? scoped.length : "—"}</strong><span>Tests on this version</span></div>
                  <div><strong>{unresolved.length}</strong><span>Open comments</span></div>
                  <div><strong>{openReadinessItems}</strong><span>Readiness items open</span></div>
                </div>
                <section className="po-summary-row">
                  <h2>Current update</h2>
                  <p>{previous ? changes.length ? `${changes.length} design ${changes.length === 1 ? "change" : "changes"} since v${previous.number}: ${changes.map((key) => changeNames[key].toLowerCase()).join(", ")}.` : `No component changes since v${previous.number}.` : revision.number > 1 ? "Earlier versions are not included in this shared review." : "This is the first saved version available for review."}</p>
                  <p className="po-muted">{presentNote(revision.note) || "No designer note was supplied for this version."}</p>
                  <p className="po-muted">Human accessibility review and production integration remain open.</p>
                </section>
                <section className="po-summary-row">
                  <h2>Decision status</h2>
                  <p>{decisionLabel ?? "No PO decision recorded on this version."}</p>
                  {decisionAuthor && <small>Recorded by {decisionAuthor}</small>}
                  {!latestDecision && legacyDecision && <small>An earlier comment-based decision needs to be recorded again.</small>}
                </section>
              </div>
              <section ref={preview} className="po-live-preview" aria-label="Try the saved upload experience">
                {previewControls()}
                <div className="po-overview-prototype">{prototype()}</div>
                {completed && <p className="po-muted" role="status">Walkthrough complete. No participant test was recorded.</p>}
              </section>
            </div>
          )}

          {section === "Tests" && (
            <div className="po-tests">
              {summary ? (
                <>
                  <div className="po-snapshot" aria-label="Test outcomes">
                    <div><strong>{summary.complete}</strong><span>Completed</span></div>
                    <div><strong>{summary.abandoned}</strong><span>Abandoned</span></div>
                    <div><strong>{summary.open}</strong><span>Still open</span></div>
                  </div>
                  <p className="po-muted">{scoped?.length} sessions on saved v{revision.number}. Open sessions are not failures.</p>
                  <section className="po-summary-row">
                    <h2>What needs attention</h2>
                    {flagged.length ? (
                      <ul className="po-finding-list">
                        {flagged.slice(0, 3).map((session) => <li key={session.id}><strong>{session.testSetup?.audience ?? "Participant"}</strong><span>{sessionFacts(session).finding}</span></li>)}
                      </ul>
                    ) : <p>{scoped?.length ? "No abandonment or unavailable-control attempts were recorded. Completion alone does not prove ease of use." : "No tests are recorded for this version yet."}</p>}
                  </section>
                  <details className="po-details"><summary>All test observations and participant comments</summary>
                    {flagged.map((session) => <p key={session.id}>{session.testSetup?.audience ?? "Participant"}: {sessionFacts(session).finding}</p>)}
                    {quotes.map((session) => <blockquote key={session.id}><p>{session.feedback}</p><cite>{session.testSetup?.audience ?? "Participant"} · {session.rating ? `${session.rating}/5 stars` : "Not rated"}</cite></blockquote>)}
                    {!flagged.length && !quotes.length && <p>No detailed observations or written feedback on this version.</p>}
                  </details>
                </>
              ) : <section className="po-summary-row"><h2>Test results unavailable</h2><p>Refresh this review or ask the designer to confirm access to these results.</p></section>}
            </div>
          )}

          {section === "Proposals" && (
            <div className="po-proposals">
              <p className="po-lead">Review the changes in this saved version and the experience they produce.</p>
              <section className="po-summary-row">
                <div className="po-inline-heading"><h2>Design changes</h2><Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}><Play size={15} /> Preview experience</Button></div>
                {previous ? changes.length ? <ul className="po-change-list">{changes.map((key) => <li key={key}><strong>{changeNames[key]}</strong><span>{typeof previous.config[key] === "boolean" ? previous.config[key] ? "Enabled" : "Not enabled" : previous.config[key]}</span><ArrowLeft size={14} aria-hidden="true" /><span>{typeof revision.config[key] === "boolean" ? revision.config[key] ? "Enabled" : "Not enabled" : revision.config[key]}</span></li>)}</ul> : <p>No component changes from the previous saved version.</p> : <p>No earlier saved version is available for comparison.</p>}
              </section>
              <section className="po-summary-row"><h2>Designer note</h2><p>{presentNote(revision.note) || "No proposal note was supplied for this version."}</p></section>
            </div>
          )}

          {section === "Implementation" && (
            <div className="po-implementation">
              <p className="po-lead">Component checks describe the prototype. They are not a production sign-off.</p>
              <section className="po-summary-row">
                <h2>Prototype checks</h2>
                <ul className="po-check-list">
                  {reviewChecks.map((check) => <li key={check.id}>{check.pass ? <CheckCircle2 size={18} aria-hidden="true" /> : <AlertCircle size={18} aria-hidden="true" />}<div><strong>{check.title}</strong><p>{check.detail}</p></div><span>{check.pass ? "Present" : "Needs review"}</span></li>)}
                </ul>
              </section>
              <section className="po-summary-row"><h2>Handoff status</h2><p>A React/CSS example exists for this demo component. Production implementation, integration, and accessibility verification are not connected to this review.</p></section>
            </div>
          )}

          {section === "Decision" && (
            <div className="po-decision">
              <p className="po-lead">Record a decision on saved v{revision.number}. Approval here means approval for another test, not production release.</p>
              {decisionLabel && <p className="po-current-decision"><Check size={16} aria-hidden="true" /> Latest: {decisionLabel} · {decisionAuthor}</p>}
              {!latestDecision && legacyDecision && <p className="po-muted">An earlier decision was stored as a comment. Record it again to create a verified decision entry.</p>}
              <form className="po-decision-form" onSubmit={(event) => void recordDecision(event)}>
                <div className="po-decision-options" role="group" aria-label="Review decision">
                  {decisions.map((option) => <Button key={option} type="button" variant={decision === option ? "secondary" : "outline"} aria-pressed={decision === option} onClick={() => selectDecision(option)}>{option}</Button>)}
                </div>
                <LabeledField label="Rationale"><Textarea required maxLength={700} value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} /></LabeledField>
                <details className="po-details"><summary>Follow-up owner and next step</summary>
                  <LabeledField label="Owner"><Input required maxLength={100} value={owner} onChange={(event) => setOwner(event.target.value)} disabled={busy} /></LabeledField>
                  <LabeledField label="Next step"><Textarea required maxLength={400} value={nextStep} onChange={(event) => setNextStep(event.target.value)} disabled={busy} /></LabeledField>
                </details>
                <div className="po-decision-actions"><Button type="submit" disabled={busy || !reason.trim() || !owner.trim() || !nextStep.trim()}>{busy ? "Recording..." : "Record decision"}</Button><Button type="button" variant="outline" onClick={() => setDiscussion(true)}><MessageSquare size={16} /> Leave a comment</Button></div>
                <p role="status">{saved}</p>
              </form>
            </div>
          )}
        </div>
      </main>

      {discussion && <Button variant="bare" size="auto" className="po-discussion-backdrop" aria-label="Close discussion" onClick={() => setDiscussion(false)} />}
      {discussion && (
        <RightPanel variant="discussion" className="po-discussion" aria-label="Version discussion">
          <div className="po-discussion-heading right-panel-heading"><strong>Comments · v{revision.number}</strong><Button variant="ghost" size="icon" aria-label="Close discussion" onClick={() => setDiscussion(false)}><X size={18} /></Button></div>
          <ReviewComments comments={discussionComments} revision={revision} state={state} viewport="desktop" anchor={anchor} onAction={onAction} busy={busy} canModerate={false} focusComposerRequest={commentFocusRequest} onComposerFocusHandled={() => setCommentFocusRequest(0)} onJump={(comment) => { setAnchor(comment.anchor); showState(comment.state); setDiscussion(false); navigate("Overview"); requestAnimationFrame(() => preview.current?.scrollIntoView({ block: "start" })); }} />
        </RightPanel>
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="po-preview-dialog">
          <DialogHeader><DialogTitle>Document upload · v{revision.number}</DialogTitle><DialogDescription>Inspect the saved prototype. This walkthrough does not record a participant test.</DialogDescription></DialogHeader>
          {previewControls(true)}
          <div className="po-prototype" ref={setPreviewFrame}>
            <div className="po-preview-fit-slot" style={{ width: previewFit.width * previewFit.scale, height: previewFit.height * previewFit.scale }}>
              <div className="po-preview-fit-content" ref={previewContents} style={{ width: previewFit.width, transform: `scale(${previewFit.scale})` }}>{prototype()}</div>
            </div>
          </div>
          {completed && <p className="po-muted" role="status">Walkthrough complete. No participant test was recorded.</p>}
        </DialogContent>
      </Dialog>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Share saved v{revision.number}</DialogTitle><DialogDescription>The link opens this saved review. Recipients also need Site access.</DialogDescription></DialogHeader>
          {shareError && <p role="alert" className="text-destructive text-sm">{shareError}</p>}
          {shareUrl && <div className="po-share-row"><Input readOnly aria-label="Review link" value={shareUrl} /><Button variant="outline" size="icon" aria-label="Copy review link" title="Copy review link" onClick={async () => { try { await navigator.clipboard.writeText(shareUrl); setShareNotice("Review link copied."); setShareError(""); } catch { setShareError("Copy failed. Select the link text instead."); } }}><Clipboard size={16} /></Button><a href={shareUrl} target="_blank" rel="noreferrer" aria-label="Open review link"><ExternalLink size={17} /></a></div>}
          {shareNotice && <p role="status" className="text-sm">{shareNotice}</p>}
        </DialogContent>
      </Dialog>

      <div className="po-print-report" aria-hidden="true">
        <h1>Document upload · Product review · v{revision.number}</h1>
        <p>Tests: {scoped ? scoped.length : "Not included"} · Open comments: {unresolved.length} · Readiness items open: {openReadinessItems}. Local rules passing: {reviewChecks.length - needsWork.length}/{reviewChecks.length}. Human accessibility review and production integration remain open.</p>
        <h2>Update</h2><p>{presentNote(revision.note)}</p>
        <h2>Changes</h2><p>{changes.map((key) => changeNames[key]).join(", ") || "No comparison available"}</p>
        <h2>Test outcomes</h2><p>{summary ? `${summary.complete} completed, ${summary.abandoned} abandoned, ${summary.open} open` : "Results not included"}</p>
        <h2>Implementation</h2>{reviewChecks.map((check) => <p key={check.id}>{check.title}: {check.pass ? "Present" : "Needs review"}. {check.detail}</p>)}
        <h2>Decision</h2><p>{latestDecision ? `${latestDecision.choice}. ${latestDecision.rationale} Owner: ${latestDecision.followUpOwner}. Next: ${latestDecision.nextStep}. Recorded by ${latestDecision.author}.` : "No verified PO decision recorded."}</p>
      </div>
    </div>
  );
}
