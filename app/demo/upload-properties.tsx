"use client";
import { Settings2, Save, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LabeledField from "@/components/labeled-field";
import RightPanel from "@/components/right-panel";
import DocumentUploaderFields from "./document-uploader-fields";
import { DEMO_IDS } from "@/lib/demo/registry";
import { configSchema } from "@/lib/demo/upload-schema";
import type { Config, Revision } from "@/lib/model";
export default function UploadProperties({
  draft,
  setDraft,
  revision,
  saveNote,
  setSaveNote,
  dirty,
  busy,
  loaded,
  save,
}: {
  draft: Config;
  setDraft: (draft: Config) => void;
  revision: Revision;
  saveNote: string;
  setSaveNote: (note: string) => void;
  dirty: boolean;
  busy: boolean;
  loaded: boolean;
  save: (config: Config, note: string) => Promise<unknown>;
}) {
  return (
    <RightPanel variant="properties" className="review-panel" aria-label="Component properties" data-demo-id={DEMO_IDS.properties}>
      <div className="panel-title right-panel-heading">
        <Settings2 size={17} />
        <strong>Component properties</strong>
        <span className="badge">Manual</span>
      </div>
      <div className="editor-fields">
        <DocumentUploaderFields value={draft} onChange={setDraft} />
        <LabeledField label="Version note">
          <Input
            maxLength={200}
            value={saveNote}
            onChange={(e) => setSaveNote(e.target.value)}
          />
        </LabeledField>
        <Button
          disabled={
            busy ||
            !loaded ||
            !dirty ||
            !saveNote.trim() ||
            !configSchema.safeParse(draft).success
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
    </RightPanel>
  );
}
