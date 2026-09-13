"use client";
import { Button } from "@/components/ui/button";
import type { Workspace, Revision } from "@/lib/model";
import { ArrowRight, Download } from "lucide-react";
import { download } from "@/lib/client";
import { DEMO_IDS } from "@/lib/demo/registry";
export default function UploadCaseStudy({
  data,
  dirty,
  busy,
  onRevision,
  caseStudy,
}: {
  data: Workspace;
  dirty: boolean;
  busy: boolean;
  onRevision: (revision: Revision) => void;
  caseStudy: () => string;
}) {
  return (
    <main className="wide-view case-study" data-demo-id={DEMO_IDS.caseStudy}>
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
            Explain the interruption, retain the selected file, and offer a
            retry action so people can recover without starting over.
          </p>
        </section>
        <section>
          <span className="section-number">03</span>
          <h3>The iterations</h3>
          {[...data.revisions].reverse().map((r) => (
            <button
              className="case-version"
              key={r.id}
              disabled={dirty || busy}
              onClick={() => onRevision(r)}
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
            {data.comments.filter((c) => !c.parentId).length} feedback threads.{" "}
            {data.comments.filter((c) => c.resolved).length} resolved.
          </p>
          <p>
            These are prototype observations, not a validated usability claim.
            No live AI, real uploads, or Design System MCP are connected.
          </p>
        </section>
      </div>
    </main>
  );
}

export const buildCaseStudy = (data: Workspace) =>
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
