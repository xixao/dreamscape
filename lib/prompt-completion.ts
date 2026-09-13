export type PromptSuggestion = { label: string; text: string };

export function completePrompt(
  value: string,
  prompts: readonly PromptSuggestion[],
) {
  const prefix = value.trimStart();
  if (!prefix) return "";
  const match = prompts.find(
    (p) =>
      p.text.toLowerCase().startsWith(prefix.toLowerCase()) &&
      p.text.length > prefix.length,
  );
  return match ? value + match.text.slice(prefix.length) : "";
}
