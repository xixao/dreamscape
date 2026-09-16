'use client';

import { Button } from '@/components/ui/button';
import { artifactTypes, contextLabels, presetContextFields, type ReviewArtifact, type Preset } from '@/lib/presentation/model';

export function ReviewContextEditor({ artifact, editable, pinned, pinnable = true, onPin, onChange, onSave, status, sources, shared = false, preset = 'design' }: {
  shared?: boolean; preset?: Preset; pinnable?: boolean;
  artifact: ReviewArtifact; editable: boolean; pinned: boolean; onPin: () => void;
  onChange: (artifact: ReviewArtifact) => void; onSave: () => void; status: string;
  sources: { id: string; name: string }[];
}) {
  const visibleFields = presetContextFields[preset].filter(key => artifact.context[key]);
  if (shared) return <section aria-label="Artifact context" className="space-y-4 text-sm">
    <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{artifact.title}</h3>{pinnable && <Button size="sm" variant="outline" aria-pressed={pinned} onClick={onPin}>{pinned ? 'Unpin context' : 'Pin context'}</Button>}</div>
    {pinnable && <p className="text-xs text-muted-foreground">{pinned ? 'This context stays visible as you navigate.' : 'Context follows the selected story item.'}</p>}
    {artifact.body && <p className="whitespace-pre-wrap">{artifact.body}</p>}
    {visibleFields.length > 0 && <dl className="space-y-4">{visibleFields.map(key => <div key={key}><dt className="font-medium">{contextLabels[key]}</dt><dd className="mt-1 whitespace-pre-wrap text-muted-foreground">{artifact.context[key]}</dd></div>)}</dl>}
    {!artifact.body && visibleFields.length === 0 && <p className="text-muted-foreground">No additional context was included.</p>}
    {artifact.screenIds.length > 0 && <div><h4 className="font-medium">Related screens / alternatives</h4><ul className="mt-1 list-inside list-disc text-muted-foreground">{artifact.screenIds.map(id => <li key={id}>{sources.find(source => source.id === id)?.name ?? 'Source unavailable'}</li>)}</ul></div>}
    <p className="text-xs text-muted-foreground">These notes were explicitly included by the author. Decision summaries are manual notes, not formal approvals.</p>
  </section>;
  return <section aria-label="Artifact context" className="space-y-4 text-sm">
    <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{artifact.title}</h3><Button size="sm" variant="outline" aria-pressed={pinned} onClick={onPin}>{pinned ? 'Unpin context' : 'Pin context'}</Button></div>
    <p className="text-xs text-muted-foreground">{pinned ? 'This context stays visible as you navigate.' : 'Context follows the selected story item.'}</p>
    <label className="block">Content type<select className="mt-1 w-full rounded border bg-background p-2" value={artifact.type} disabled={!editable} onChange={event => onChange({ ...artifact, type: event.target.value as ReviewArtifact['type'] })}>{artifactTypes.map(type => <option key={type} value={type}>{type}</option>)}</select></label>
    <label className="block">Title<input className="mt-1 w-full rounded border bg-background p-2" maxLength={200} readOnly={!editable} value={artifact.title} onChange={event => onChange({ ...artifact, title: event.target.value })} /></label>
    <label className="block">Content<textarea className="mt-1 min-h-24 w-full rounded border bg-background p-2" maxLength={10000} readOnly={!editable} value={artifact.body} onChange={event => onChange({ ...artifact, body: event.target.value })} /></label>
    <fieldset className="space-y-2"><legend>Related screens / alternatives</legend>{sources.map(source => <label key={source.id} className="flex items-center gap-2"><input type="checkbox" disabled={!editable} checked={artifact.screenIds.includes(source.id)} onChange={event => onChange({ ...artifact, screenIds: event.target.checked ? [...artifact.screenIds, source.id] : artifact.screenIds.filter(id => id !== source.id) })} />{source.name}</label>)}</fieldset>
    {presetContextFields[preset].map(key => <label key={key} className="block">{contextLabels[key]}<textarea className="mt-1 min-h-20 w-full rounded border bg-background p-2" maxLength={10000} placeholder="Add context" readOnly={!editable} value={artifact.context[key]} onChange={event => onChange({ ...artifact, context: { ...artifact.context, [key]: event.target.value } })} /></label>)}
    {editable && <Button onClick={onSave}>Save context</Button>}
    {status && <p role="status">{status}</p>}
  </section>;
}
