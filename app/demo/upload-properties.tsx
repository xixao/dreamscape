"use client";
import { Settings2, Save, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
    <aside className="review-panel" data-demo-id={DEMO_IDS.properties}>
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
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            ) : (
              <Input
                maxLength={key === "button" ? 40 : 80}
                value={draft[key]}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            )}
          </label>
        ))}
        <label className="switch-line">
          Retry action
          <Switch
            checked={draft.retryEnabled}
            onCheckedChange={(v) => setDraft({ ...draft, retryEnabled: v })}
          />
        </label>
        <label className="switch-line">
          Announce error
          <Switch
            checked={draft.announceError}
            onCheckedChange={(v) => setDraft({ ...draft, announceError: v })}
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
    </aside>
  );
}
