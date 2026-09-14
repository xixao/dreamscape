"use client";

import { useState, type ReactNode } from "react";
import { Layers3, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import StateSelector from "@/components/state-selector";
import { uploadStateOptions } from "@/lib/demo/upload";
import { DEMO_IDS } from "@/lib/demo/registry";
import type { Config, UploadState } from "@/lib/model";
import DocumentUploader from "./demo/document-uploader";

function SpecificationDialogShell({
  open,
  onOpenChange,
  title,
  description,
  demoId,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  demoId: string;
  children: ReactNode;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="design-spec-dialog" showCloseButton={false} data-demo-id={demoId}>
      <DialogHeader className="design-spec-header">
        <div className="design-spec-identity">
          <Layers3 size={19} aria-hidden="true" />
          <div>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </div>
        </div>
        <DialogClose asChild><Button variant="ghost" size="icon" aria-label={`Close ${title}`} title={`Close ${title}`}><X size={18} /></Button></DialogClose>
      </DialogHeader>
      <div className="design-spec-body">{children}</div>
    </DialogContent>
  </Dialog>;
}

export function PocSpecificationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return <SpecificationDialogShell
    open={open}
    onOpenChange={onOpenChange}
    title="Flow Review POC & Experience Guide"
    description="Document upload recovery · presentation walkthrough"
    demoId={DEMO_IDS.pocSpecification}
  >
    <section className="design-spec-section">
      <div className="design-spec-section-heading"><div><p className="eyebrow">PROOF OF CONCEPT</p><h2>What this demonstrates</h2></div></div>
      <p>One document-upload design travels from creation to review, a participant test, a product decision, and an engineering handoff. Each audience sees the same saved component with a view tailored to its job.</p>
    </section>
    <section className="design-spec-section" aria-labelledby="poc-walkthrough-title">
      <h2 id="poc-walkthrough-title">Presentation path</h2>
      <ol className="design-spec-list">
        <li><strong>Designer:</strong> open the upload component, change its copy or recovery behavior, save a version, and inspect it in Review.</li>
        <li><strong>Flow Assistant:</strong> run the scripted recovery review, inspect comments and checks, then prepare a shareable test.</li>
        <li><strong>Participant:</strong> attempt the upload, recover from failure, complete or abandon the task, and leave a rating or comment.</li>
        <li><strong>PO and Engineer:</strong> read the test evidence and decision status, then inspect the component and its React/CSS handoff.</li>
      </ol>
    </section>
    <div className="design-spec-columns">
      <section className="design-spec-section" aria-labelledby="poc-roles-title">
        <h2 id="poc-roles-title">Views and decisions</h2>
        <dl className="design-spec-details">
          <div><dt>Designer</dt><dd>Edit, review, comment, map the journey, and configure tests.</dd></div>
          <div><dt>Participant</dt><dd>Follow the task instructions and generate an observable test path.</dd></div>
          <div><dt>Product owner</dt><dd>Try the saved component, inspect concise results, comment, and record a decision.</dd></div>
          <div><dt>Engineer</dt><dd>See checks and the example component code beside the design.</dd></div>
        </dl>
      </section>
      <section className="design-spec-section" aria-labelledby="poc-evidence-title">
        <h2 id="poc-evidence-title">Evidence captured here</h2>
        <ul className="design-spec-list">
          <li>Saved design versions and comments tied to the component.</li>
          <li>Participant completion, abandonment, click path, rating, and feedback.</li>
          <li>Recovery checks, open human-review items, and PO decisions.</li>
          <li>A case-study trail connecting iterations to findings.</li>
        </ul>
      </section>
    </div>
    <section className="design-spec-section" aria-labelledby="poc-boundaries-title">
      <h2 id="poc-boundaries-title">POC boundaries</h2>
      <div className="design-spec-state-list">
        <div><strong>Working in the demo</strong><p>Local design edits, saved versions, comments, test paths, results, and role-specific review views.</p></div>
        <div><strong>Scripted</strong><p>The assistant responds to supported prompts with prepared actions. The upload uses a sample file; no production document is sent.</p></div>
        <div><strong>Still to connect</strong><p>Live AI, the Design System MCP, production upload services, and human accessibility validation.</p></div>
      </div>
    </section>
  </SpecificationDialogShell>;
}

export default function DesignSpecificationDialog({
  open,
  onOpenChange,
  config,
  version,
  dirty,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: Config;
  version: number;
  dirty: boolean;
}) {
  const [previewState, setPreviewState] = useState<UploadState>("ready");
  const [previewFocus, setPreviewFocus] = useState<"component" | "page">("component");
  return <SpecificationDialogShell open={open} onOpenChange={onOpenChange} title="Design Specification & Component Guide" description={`DocumentUploader · ${dirty ? `Draft based on v${version}` : `Saved v${version}`}`} demoId={DEMO_IDS.designSpecification}>
        <section className="design-spec-section">
          <div className="design-spec-section-heading"><div><p className="eyebrow">UPLOAD / DEFAULT</p><h2>DocumentUploader</h2></div><span className="design-spec-version">{dirty ? "Unsaved draft" : `Version ${version}`}</span></div>
          <p>Collect one document, recover from an interrupted upload, and continue only after the document is received.</p>
        </section>
        <section className="design-spec-section" aria-labelledby="design-spec-preview-title">
          <h2 id="design-spec-preview-title">Preview</h2>
          <div className="design-spec-controls">
            <div role="group" aria-label="Preview scope">
              <Button type="button" size="sm" variant={previewFocus === "component" ? "secondary" : "ghost"} aria-pressed={previewFocus === "component"} onClick={() => setPreviewFocus("component")}>Component</Button>
              <Button type="button" size="sm" variant={previewFocus === "page" ? "secondary" : "ghost"} aria-pressed={previewFocus === "page"} onClick={() => setPreviewFocus("page")}>Full page</Button>
            </div>
            <StateSelector value={previewState} options={uploadStateOptions} onChange={setPreviewState} label="Preview component state" />
          </div>
          <div className="design-spec-preview"><DocumentUploader config={config} state={previewState} focus={previewFocus} onState={(next) => setPreviewState(next)} /></div>
          <p className="design-spec-caption">Interactive demo: the first upload attempt fails, retry succeeds when enabled, and no file is sent.</p>
        </section>
        <div className="design-spec-columns">
          <section className="design-spec-section" aria-labelledby="design-spec-anatomy-title">
            <h2 id="design-spec-anatomy-title">Anatomy</h2>
            <ol className="design-spec-list">
              <li>Heading and supporting instruction</li>
              <li>Sample file and primary upload action</li>
              <li>File size and format guidance</li>
              <li>Inline recovery or success message</li>
              <li>Continue action after success</li>
            </ol>
          </section>
          <section className="design-spec-section" aria-labelledby="design-spec-copy-title">
            <h2 id="design-spec-copy-title">Current content</h2>
            <dl className="design-spec-details">
              <div><dt>Heading</dt><dd>{config.title}</dd></div>
              <div><dt>Instruction</dt><dd>{config.helper || "No supporting instruction"}</dd></div>
              <div><dt>Upload action</dt><dd>{config.button}</dd></div>
              <div><dt>Recovery message</dt><dd>{config.error}</dd></div>
            </dl>
          </section>
        </div>
        <section className="design-spec-section" aria-labelledby="design-spec-behavior-title">
          <h2 id="design-spec-behavior-title">States and behavior</h2>
          <div className="design-spec-state-list">
            <div><strong>Ready to upload</strong><p>Shows the selected sample file and upload action. Continue is unavailable.</p></div>
            <div><strong>Upload interrupted</strong><p>Keeps the sample file selected. {config.retryEnabled ? "Try again is available." : "No retry action is configured."}</p></div>
            <div><strong>Document received</strong><p>Confirms success and enables Continue.</p></div>
          </div>
        </section>
        <div className="design-spec-columns">
          <section className="design-spec-section" aria-labelledby="design-spec-foundations-title">
            <h2 id="design-spec-foundations-title">Style foundations</h2>
            <dl className="design-spec-details">
              <div><dt>Spacing</dt><dd>4, 8, 12, 16, 24, 32 px</dd></div>
              <div><dt>Control radius</dt><dd>6 px</dd></div>
              <div><dt>Body type</dt><dd>16 / 24 px</dd></div>
              <div><dt>Control type</dt><dd>14 / 20 px</dd></div>
              <div><dt>Color</dt><dd>Semantic light and dark tokens</dd></div>
            </dl>
          </section>
          <section className="design-spec-section" aria-labelledby="design-spec-accessibility-title">
            <h2 id="design-spec-accessibility-title">Accessibility</h2>
            <ul className="design-spec-list">
              <li>{config.announceError ? "Error is marked as an alert." : "Error announcement is not enabled."}</li>
              <li>Actions use native buttons and support keyboard focus.</li>
              <li>Verify screen-reader output, zoom, contrast, and recovery with people before production.</li>
            </ul>
          </section>
        </div>
        <section className="design-spec-section" aria-labelledby="design-spec-handoff-title">
          <h2 id="design-spec-handoff-title">Implementation handoff</h2>
          <p>Component: <code>DocumentUploader</code>. {dirty ? "The Engineer Code view reflects the last saved version, not these unsaved changes." : "The Engineer Code view contains the React and CSS example for this saved version."} The prototype uses a sample file and local transitions; production upload validation and service integration remain open.</p>
        </section>
  </SpecificationDialogShell>;
}
