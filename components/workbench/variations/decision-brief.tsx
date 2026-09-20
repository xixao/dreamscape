import type { Variation } from '@/lib/variations/model';

/** Scan the decision first, then open the reasoning that matters to you. */
export function DecisionBrief({ rationale }: { rationale: Variation['rationale'] }) {
  return <section aria-label="Decision brief" className="space-y-5">
    <div className="rounded-lg border bg-muted/30 p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Design intent · working hypothesis</p>
      <p className="text-base leading-relaxed">{rationale.hypothesis}</p>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div><h3 className="mb-2 text-sm font-semibold">Choose this when</h3><p className="text-sm leading-relaxed text-muted-foreground">{rationale.bestFor || rationale.assumption}</p></div>
      <div><h3 className="mb-2 text-sm font-semibold">What you give up</h3><p className="text-sm leading-relaxed text-muted-foreground">{rationale.tradeoff}</p></div>
    </div>
    <section aria-label="Key design decisions" className="overflow-hidden rounded-lg border">
      <h3 className="bg-muted/30 px-4 py-3 text-sm font-semibold">Why these choices work together</h3>
      {rationale.decisions.map((decision, index) => <details key={index} className="group border-t">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
          <span className="mr-3 text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>{decision.title || `Design decision ${index + 1}`}
        </summary>
        <p className="px-4 pb-4 text-sm leading-relaxed text-muted-foreground">{decision.explanation}</p>
      </details>)}
    </section>
    <details className="rounded-lg border px-4 py-3"><summary className="cursor-pointer text-sm font-medium">Challenge this direction</summary>
      <div className="space-y-4 pt-4 text-sm leading-relaxed"><div><h3 className="font-semibold">Assumption to verify</h3><p className="text-muted-foreground">{rationale.assumption}</p></div>
        {rationale.poorFit && <div><h3 className="font-semibold">When I would reject it</h3><p className="text-muted-foreground">{rationale.poorFit}</p></div>}
        <div><h3 className="font-semibold">Test that could change the decision</h3><p className="text-muted-foreground">{rationale.test}</p></div>
      </div>
    </details>
    {rationale.precedents.length > 0 && <details className="rounded-lg border px-4 py-3"><summary className="cursor-pointer text-sm font-medium">Pattern references</summary><div className="space-y-3 pt-4">{rationale.precedents.map((reference, index) => <p key={index} className="text-sm leading-relaxed"><span className="text-muted-foreground">Suggested · not verified: </span>{reference.url ? <a className="underline" href={reference.url} target="_blank" rel="noreferrer">{reference.title}</a> : reference.title} — {reference.lesson}</p>)}</div></details>}
  </section>;
}
