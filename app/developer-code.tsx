"use client";

import { useState } from "react";
import { Clipboard, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { documentUploaderCode } from "@/lib/component-code";
import { download } from "@/lib/client";
import type { Revision } from "@/lib/model";

export default function DeveloperCode({
  revision,
  dirty,
}: {
  revision: Revision;
  dirty: boolean;
}) {
  const files = documentUploaderCode(revision.config);
  type FileName = keyof typeof files;
  const [file, setFile] = useState<FileName>("DocumentUploader.jsx");
  async function copy() {
    try {
      await navigator.clipboard.writeText(files[file]);
      toast.success(`${file} copied`);
    } catch {
      toast.error("Copy unavailable. Download the file instead.");
    }
  }
  return (
    <main className="developer-code">
      <header>
        <div>
          <p className="eyebrow">SAVED VERSION {revision.number}</p>
          <h2>DocumentUploader</h2>
          <p>React component and scoped styles</p>
        </div>
        <code>document-uploader</code>
      </header>
      {dirty && (
        <p role="status">
          Unsaved design changes are not included. Save a version to update this
          code.
        </p>
      )}
      <Tabs value={file} onValueChange={(value) => setFile(value as FileName)}>
        <div className="developer-code-toolbar">
          <TabsList variant="line">
            {(Object.keys(files) as FileName[]).map((name) => (
              <TabsTrigger key={name} value={name}>
                {name}
              </TabsTrigger>
            ))}
          </TabsList>
          <div>
            <Button variant="outline" onClick={() => void copy()}>
              <Clipboard size={16} />
              Copy
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                download(
                  file,
                  files[file],
                  file.endsWith("css") ? "text/css" : "text/javascript",
                )
              }
            >
              <Download size={16} />
              Download
            </Button>
          </div>
        </div>
        {(Object.keys(files) as FileName[]).map((name) => (
          <TabsContent key={name} value={name}>
            <pre tabIndex={0} aria-label={`${name} source code`}>
              <code>{files[name]}</code>
            </pre>
          </TabsContent>
        ))}
      </Tabs>
      <footer>
        POC handoff · Uses the saved design text and recovery settings with
        simplified styling. Requires React and both files in the same folder.
        Upload behavior is local; connect a file service before production.
      </footer>
    </main>
  );
}
