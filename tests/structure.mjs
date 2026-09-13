import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import postcss from "postcss";

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : [file];
  });
}
const appFiles = files("app");
const componentFiles = files("components");
const productSources = [...appFiles, ...componentFiles].filter((f) =>
  /\.tsx?$/.test(f),
);
assert.deepEqual(
  appFiles.filter((f) => f.endsWith(".css")),
  ["app/globals.css"],
);
let cssImports = 0;
for (const file of productSources) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  for (const node of source.statements) {
    if (!ts.isImportDeclaration(node)) continue;
    const imported = node.moduleSpecifier.text;
    if (imported.endsWith(".css")) cssImports++;
    assert.ok(
      !/workspace\.css|\/uploader$|feedback-notifications|\/demo\/document-upload$|\/demo\/guided-prompt$|^\.\/feedback$/.test(
        imported,
      ),
      `${file}: retired import`,
    );
    if (file.startsWith("components/") && !file.startsWith("components/ui/")) {
      assert.ok(
        !imported.includes("/demo/"),
        `${file}: reusable UI must not depend on demo fixtures`,
      );
    }
  }
  if (
    file.endsWith(".tsx") &&
    !file.startsWith("components/ui/") &&
    !/\/(page|layout)\.tsx$/.test(file)
  ) {
    const component = source.statements.find(
      (node) =>
        ts.isFunctionDeclaration(node) &&
        node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword),
    );
    assert.ok(component?.name, `${file}: default components must be named`);
    assert.equal(
      component.name.text.toLowerCase(),
      path.basename(file, ".tsx").replaceAll("-", "").toLowerCase(),
      `${file}: filename must match component name`,
    );
  }
}
assert.equal(cssImports, 1, "One application stylesheet entry point");
const css = postcss.parse(fs.readFileSync("app/globals.css", "utf8"));
const themes = { light: {}, dark: {} };
css.walkRules((rule) => {
  if (rule.selector !== ":root" && rule.selector !== ".dark") return;
  rule.walkDecls(/^--/, (d) => {
    themes[rule.selector === ":root" ? "light" : "dark"][d.prop] = d.value;
  });
});
function luminance(hex) {
  let value = hex.slice(1);
  if (value.length === 3) value = [...value].map((c) => c + c).join("");
  const [r, g, b] = value.match(/../g).map((c) => {
    const n = parseInt(c, 16) / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
for (const [name, overrides] of Object.entries(themes)) {
  const t = { ...themes.light, ...overrides };
  for (const [foreground, background, minimum] of [
    ["--foreground", "--background", 4.5],
    ["--muted-foreground", "--background", 4.5],
    ["--muted-foreground", "--secondary", 4.5],
    ["--primary-foreground", "--primary", 4.5],
    ["--rating", "--background", 3],
    ["--input", "--background", 3],
    ["--ring", "--background", 3],
  ]) {
    const a = luminance(t[foreground]),
      b = luminance(t[background]);
    assert.ok(
      (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= minimum,
      `${name}: ${foreground} on ${background} contrast`,
    );
  }
}
const signatures = new Set();
css.walkRules((rule) => {
  const context = [];
  for (let p = rule.parent; p?.type === "atrule"; p = p.parent)
    context.push(p.name + p.params);
  const signature = JSON.stringify([
    context,
    rule.selector,
    rule.nodes.map((n) => n.toString()),
  ]);
  assert.ok(!signatures.has(signature), `Duplicate CSS rule: ${rule.selector}`);
  signatures.add(signature);
});
// Pure domain modules are evaluated without a browser or writing compiled files.
async function moduleAt(file) {
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`
  );
}
const { sessionFacts, eventLabels } = await moduleAt("lib/results.ts");
const sample = { outcome: "started", interactions: [] };
assert.equal(sessionFacts(sample).attention, false);
assert.equal(sessionFacts(sample).finding, "No final outcome recorded");
assert.equal(sessionFacts({ ...sample, outcome: "gave_up" }).attention, true);
assert.equal(sessionFacts({ ...sample, outcome: "complete" }).attention, false);
const attempts = Array.from({ length: 5 }, () => ({
  target: "retry",
  state: "failed",
  available: false,
}));
assert.equal(
  sessionFacts({ ...sample, interactions: attempts }).repeated.length,
  1,
);
assert.equal(
  sessionFacts({ ...sample, interactions: attempts.slice(1) }).repeated.length,
  0,
);
assert.equal(
  sessionFacts({ ...sample, outcome: "complete", interactions: attempts })
    .attention,
  true,
);
assert.equal(
  sessionFacts({
    ...sample,
    interactions: attempts.map((c) => ({ ...c, target: "non_action" })),
  }).attention,
  false,
);
assert.equal(eventLabels.retry_success, "Retry succeeded");
const { completePrompt: completeDemoPrompt } = await moduleAt(
  "lib/prompt-completion.ts",
);
const { reviewPrompts, testPrompts } = await moduleAt("lib/demo/prompts.ts");
const { demoPromptIntent } = await moduleAt("lib/demo/recovery-agent.ts");
assert.equal(completeDemoPrompt("", reviewPrompts), "");
assert.equal(completeDemoPrompt("   ", reviewPrompts), "");
assert.equal(
  completeDemoPrompt("Review", reviewPrompts),
  reviewPrompts[0].text,
);
assert.equal(
  completeDemoPrompt("review", reviewPrompts),
  "review" + reviewPrompts[0].text.slice(6),
);
assert.equal(
  completeDemoPrompt("  Set up", testPrompts),
  "  " + testPrompts[0].text,
);
assert.equal(completeDemoPrompt(reviewPrompts[0].text, reviewPrompts), "");
assert.equal(completeDemoPrompt("Something unrelated", reviewPrompts), "");
assert.equal(completeDemoPrompt("Review\n", reviewPrompts), "");
for (const prompt of reviewPrompts)
  assert.notEqual(demoPromptIntent(prompt.text), "unsupported");
for (const prompt of testPrompts)
  assert.equal(demoPromptIntent(prompt.text), "test");
const { DEMO_IDS } = await moduleAt("lib/demo/registry.ts");
assert.equal(
  new Set(Object.values(DEMO_IDS)).size,
  Object.keys(DEMO_IDS).length,
);
const ui = appFiles
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => fs.readFileSync(f, "utf8"))
  .join("\n");
for (const key of Object.keys(DEMO_IDS))
  assert.ok(ui.includes(`DEMO_IDS.${key}`), `Unmarked demo: ${key}`);
const { baseline, checks, improvement, uploadEventError } =
  await moduleAt("lib/demo/upload.ts");
const { uploadStates, uploadStateOptions, uploadStateShortOptions } =
  await moduleAt("lib/demo/upload.ts");
assert.deepEqual(
  uploadStateOptions.map((s) => s.value),
  uploadStates,
);
assert.deepEqual(
  uploadStateShortOptions.map((s) => s.value),
  uploadStates,
);
assert.equal(checks(baseline).filter((c) => c.pass).length, 0);
assert.equal(
  checks({ ...baseline, ...improvement }).filter((c) => c.pass).length,
  3,
);
for (const [event, prior, retry, scenario, valid] of [
  ["upload_success", undefined, false, "success", true],
  ["upload_attempt", undefined, true, "recovery", true],
  ["upload_attempt", undefined, true, "success", false],
  ["retry_success", "upload_attempt", true, "recovery", true],
  ["retry_success", "upload_attempt", false, "recovery", false],
  ["continue", undefined, true, "success", false],
  ["continue", "upload_success", false, "success", true],
  ["continue", "retry_success", true, "recovery", true],
  ["gave_up", undefined, false, "success", true],
  ["upload_attempt", "upload_attempt", true, "recovery", false],
])
  assert.equal(uploadEventError(event, prior, retry, scenario) === null, valid);
const { sameConfig, previousRevision, placedComments, createHandoff } =
  await moduleAt("lib/review.ts");
assert.ok(
  sameConfig(baseline, Object.fromEntries(Object.entries(baseline).reverse())),
);
assert.ok(!sameConfig(baseline, { ...baseline, ...improvement }));
const revisions = [1, 3, 2].map((number) => ({
  id: String(number),
  number,
  config: baseline,
  note: "Demo",
  createdAt: "",
}));
assert.equal(previousRevision(revisions, revisions[0]), undefined);
assert.equal(previousRevision(revisions, revisions[1]).number, 2);
const comments = ["mobile", "desktop", "both"].map((viewport) => ({
  id: viewport,
  viewport,
  state: "failed",
  revisionId: "1",
  parentId: null,
}));
assert.deepEqual(
  placedComments(comments, "1", "failed", "mobile").map((c) => c.id),
  ["mobile", "both"],
);
assert.equal(placedComments(comments, "1", "ready", "mobile").length, 0);
const draft = { ...baseline, ...improvement };
const handoff = createHandoff(
  revisions[0],
  draft,
  comments,
  checks(draft),
  DEMO_IDS.upload,
  ["ready", "failed", "complete"],
);
assert.equal(handoff.inspectedDesign.status, "unsaved-draft");
assert.equal(handoff.savedRevision.config.retryEnabled, false);
assert.equal(handoff.inspectedDesign.config.retryEnabled, true);
assert.equal(handoff.commentsApplyTo, "savedRevision");
const { createDocumentUploaderCode } = await moduleAt("lib/demo/document-uploader-code.ts");
for (const config of [
  baseline,
  draft,
  { ...draft, title: 'Quotes " and ` ${x} </script>\nNew line' },
]) {
  const files = createDocumentUploaderCode(config);
  assert.deepEqual(Object.keys(files), ["DocumentUploader.jsx", "style.css"]);
  const source = files["DocumentUploader.jsx"];
  const parsed = ts.createSourceFile(
    "DocumentUploader.jsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JSX,
  );
  assert.equal(parsed.parseDiagnostics.length, 0, "Exported JSX must parse");
  assert.ok(
    source.includes(JSON.stringify(config, null, 2)),
    "Export preserves saved settings safely",
  );
  assert.ok(source.includes("export default function DocumentUploader"));
  assert.ok(source.includes('import "./style.css"'));
  assert.ok(source.includes("design.retryEnabled &&"));
  assert.ok(source.includes('design.announceError ? "alert"'));
  assert.ok(source.includes("onContinue?.()"));
}
console.log(
  "Structure, stylesheet, demo markers, scenario rules, version selection, comment placement, and handoff checks passed.",
);
