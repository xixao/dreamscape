import type { UploadConfig } from "./upload-schema";

export function createDocumentUploaderCode(config: UploadConfig) {
  const settings = JSON.stringify(config, null, 2);
  return {
    "DocumentUploader.jsx": `import { useState } from "react";
import "./style.css";

const design = ${settings};

// POC behavior: the first attempt fails; retry succeeds. No file is uploaded.
// Replace these transitions with your upload service before production.
export default function DocumentUploader({ onContinue, simulateFailure = true }) {
  const [state, setState] = useState("ready");
  const [finished, setFinished] = useState(false);

  return (
    <section className="document-uploader" data-component-id="document-uploader">
      <h2>{design.title}</h2>
      <p>{design.helper}</p>
      <div className="document-uploader__file">
        <strong>Pay-statement.pdf</strong>
        <span>Sample document · 240 KB</span>
      </div>
      {state === "ready" && (
        <button type="button" onClick={() => setState(simulateFailure ? "failed" : "complete")}>
          {design.button}
        </button>
      )}
      {state === "failed" && (
        <div className="document-uploader__error" data-component-id="upload-error"
          role={design.announceError ? "alert" : undefined}>
          <p>{design.error}</p>
          {design.retryEnabled && (
            <button type="button" onClick={() => setState("complete")}>Try again</button>
          )}
        </div>
      )}
      {state === "complete" && (
        <p className="document-uploader__success" role="status">
          {finished ? "Upload step complete." : "Document received. You're all set."}
        </p>
      )}
      <div className="document-uploader__limits">
        <span>PDF, JPG, or PNG</span><span>Up to 10 MB</span>
      </div>
      <button type="button" disabled={state !== "complete" || finished} onClick={() => {
        setFinished(true);
        onContinue?.();
      }}>Continue</button>
      <small>Sample document · No files are uploaded</small>
    </section>
  );
}
`,
    "style.css": `.document-uploader {
  box-sizing: border-box;
  width: 100%;
  max-width: 560px;
  padding: 28px;
  border: 1px solid #d7dfdc;
  border-radius: 8px;
  background: #ffffff;
  color: #20332b;
  font: 16px/1.5 system-ui, sans-serif;
}
.document-uploader * { box-sizing: border-box; }
.document-uploader h2 { margin: 0 0 8px; font-size: 22px; }
.document-uploader p { margin: 0 0 20px; overflow-wrap: anywhere; }
.document-uploader button {
  min-height: 44px;
  padding: 10px 18px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: #176b52;
  color: #ffffff;
  font: inherit;
  cursor: pointer;
}
.document-uploader button:disabled { background: #e5ebe8; color: #52635b; cursor: default; }
.document-uploader button:focus-visible { outline: 3px solid #087769; outline-offset: 3px; }
.document-uploader__file { display: grid; gap: 4px; padding: 20px; margin: 20px 0; border: 1px dashed #81988c; border-radius: 6px; overflow-wrap: anywhere; }
.document-uploader__file span, .document-uploader small { color: #52635b; font-size: 14px; }
.document-uploader__error { padding: 16px; margin: 16px 0; background: #fff2ef; color: #943b2a; border-left: 3px solid #b94c36; }
.document-uploader__error p { margin-bottom: 12px; }
.document-uploader__success { color: #176b52; }
.document-uploader__limits { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin: 20px 0; font-size: 14px; }
.document-uploader small { display: block; margin-top: 16px; }
@media (max-width: 480px) { .document-uploader { padding: 20px; } }
@media (prefers-color-scheme: dark) {
  .document-uploader { background: #202b26; color: #eff5f1; border-color: #85958b; }
  .document-uploader__file span, .document-uploader small { color: #bbc9c2; }
  .document-uploader__error { background: #422b27; color: #ffc6b9; }
  .document-uploader__success { color: #8edbbc; }
}
`,
  };
}
