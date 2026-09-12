// Rendered by NodeIndicator through the same document.body portal as
// SelectionOutline, while the Prototype tab is active, for every node that
// carries an interaction (spec docs/superpowers/specs/2026-09-12-screens-
// prototype-play-design.md #4): a small mono chip at the node's top-right
// reading "→ <target name>", "→ Dialog: <title>" or "← Back".
export function InteractionTag({
  rect,
  text,
}: {
  rect: Pick<DOMRect, 'top' | 'left' | 'width'>;
  text: string;
}) {
  return (
    <div
      data-testid="interaction-tag"
      aria-hidden
      className="pointer-events-none fixed z-50 -translate-y-1/2 rounded-sm bg-primary px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white"
      style={{ top: rect.top, left: rect.left + rect.width }}
    >
      {text}
    </div>
  );
}
