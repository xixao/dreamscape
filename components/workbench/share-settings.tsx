'use client';

import { contextLabels, loadReview, presetContextFields, presets, saveReview, screenArtifact, sharedCapabilities, sharedReviewSchema, type Capability, type Preset, type ReviewArtifact, type SharedReview, type SaveSharedReview } from '@/lib/presentation/model';
import { useEffect, useState } from 'react';
import { Check, ChevronDown, Copy, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Page, Screen } from '@/lib/files/repository';
import { isOverlay } from '@/lib/files/screens';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface Settings {
  title: string;
  introduction: string;
  start: string;
  navigation: boolean;
  approval: 'off' | 'prototype' | 'screen';
  comments: Record<string, boolean>;
  approvals: Record<string, boolean>;
}

const presetDescriptions: Record<Preset, string> = {
  business: 'Problem, proposal, options, decisions, and next steps.',
  design: 'Full design context, rationale, accessibility, and exploration tools.',
  research: 'Questions, evidence, findings, limitations, and design connections.',
  development: 'Requirements, states, components, accessibility, and open questions.',
};

const capabilityLabels: Record<SharedReview['capabilities'][number], string> = {
  'context.read': 'Context panel',
  focus: 'Inspect components',
  compare: 'Compare screens',
  prototype: 'Use prototype',
  search: 'Search review',
};

function presetCapabilities(preset: Preset): SharedReview['capabilities'] {
  return sharedCapabilities.filter(capability => (presets[preset].capabilities as readonly Capability[]).includes(capability));
}

function publishedSignature(review?: SharedReview) {
  if (!review) return '';
  const { preset, capabilities, artifacts } = review;
  const settings: Settings = { title: review.title, introduction: review.introduction, start: review.start, navigation: review.navigation, approval: review.approval, comments: review.comments, approvals: review.approvals };
  const effective = presetCapabilities(preset);
  return JSON.stringify({ settings, start: review.start, preset, grants: capabilities.filter(capability => effective.includes(capability)), selection: artifacts });
}

export function ShareSettings({ screens, pages, currentScreenId, storageKey, playHref, fileId, sharedReview, onSaveSharedReview }: { fileId?: string; sharedReview?: SharedReview; onSaveSharedReview?: SaveSharedReview; playHref?: string; screens: Screen[]; pages: Page[]; currentScreenId?: string; storageKey: string }) {
  const viewable = screens.filter(screen => !isOverlay(screen));
  const [storedDraft] = useState<unknown>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) ?? 'null'); }
    catch { return null; }
  });
  const storedReview = sharedReviewSchema.safeParse(storedDraft);
  const reviewDraft = sharedReview ?? (storedReview.success ? storedReview.data : undefined);
  const [settings, setSettings] = useState<Settings>(() => {
    const defaults: Settings = reviewDraft ? { title: reviewDraft.title, introduction: reviewDraft.introduction, start: reviewDraft.start, navigation: reviewDraft.navigation, approval: reviewDraft.approval, comments: reviewDraft.comments, approvals: reviewDraft.approvals } : { title: '', introduction: '', start: currentScreenId ?? '', navigation: true, approval: 'off', comments: {}, approvals: {} };
    try {
      if (sharedReview || !storedDraft || typeof storedDraft !== 'object') return defaults;
      const saved = storedDraft as Record<string, unknown>;
      const flags = (value: unknown): Record<string, boolean> => value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([, flag]) => typeof flag === 'boolean')) : {};
      return { title: typeof saved.title === 'string' ? saved.title : defaults.title, introduction: typeof saved.introduction === 'string' ? saved.introduction : defaults.introduction, start: typeof saved.start === 'string' ? saved.start : defaults.start, navigation: typeof saved.navigation === 'boolean' ? saved.navigation : true, approval: typeof saved.approval === 'string' && ['off', 'prototype', 'screen'].includes(saved.approval) ? saved.approval as Settings['approval'] : 'off', comments: flags(saved.comments), approvals: flags(saved.approvals) };
    } catch { return defaults; }
  });
  const [preset, setPreset] = useState<Preset>(reviewDraft?.preset ?? 'design');
  const [grants, setGrants] = useState<SharedReview['capabilities']>(() => {
    const defaults = presetCapabilities(reviewDraft?.preset ?? 'design');
    return reviewDraft ? reviewDraft.capabilities.filter(capability => defaults.includes(capability)) : defaults;
  });
  const [selection, setSelection] = useState<ReviewArtifact[]>(reviewDraft?.artifacts ?? []);
  const [localDraft] = useState(() => {
    try { return { artifacts: fileId ? loadReview(localStorage, fileId).artifacts : [], error: '' }; }
    catch { return { artifacts: [], error: 'Local context could not be read. Existing notes are unchanged.' }; }
  });
  const [candidates, setCandidates] = useState<ReviewArtifact[]>(() => [...new Map([...viewable.map(screenArtifact), ...(reviewDraft?.artifacts ?? []), ...localDraft.artifacts].map(artifact => [artifact.id, artifact])).values()]);
  const [contextStatus, setContextStatus] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const start = viewable.some(screen => screen.id === settings.start) ? settings.start : viewable[0]?.id ?? '';
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify({ ...settings, start, version: 1, preset, capabilities: grants, artifacts: selection })); } catch { /* Storage may be unavailable; controls remain usable. */ } }, [settings, start, storageKey, preset, grants, selection]);
  const [copiedUrl, setCopiedUrl] = useState('');
  const [savedSignature, setSavedSignature] = useState(() => publishedSignature(sharedReview));
  const signature = JSON.stringify({ settings, start, preset, grants, selection });
  const [copyError, setCopyError] = useState(false);
  const url = playHref ? new URL(playHref, window.location.origin) : null;
  if (url) {
    url.searchParams.set('view', 'shared');
    url.searchParams.delete('overlay');
    url.searchParams.set('screen', start);
    const pageId = viewable.find(screen => screen.id === start)?.pageId;
    if (pageId) url.searchParams.set('page', pageId); else url.searchParams.delete('page');
  }
  const shareUrl = url?.toString() ?? '';
  async function copyLink() {
    setCopyError(false);
    setPublishError('');
    setPublishing(true);
    try {
      if (onSaveSharedReview) {
        try { await onSaveSharedReview(sharedReviewSchema.parse({ ...settings, start, version: 1, preset, capabilities: grants, artifacts: selection })); }
        catch (error) { setPublishError(error instanceof Error ? error.message : 'Could not save review.'); return; }
      }
      setSavedSignature(signature);
      await navigator.clipboard.writeText(shareUrl); setCopiedUrl(shareUrl);
    }
    catch { setCopiedUrl(''); setCopyError(true); }
    finally { setPublishing(false); }
  }
  function changePreset(next: Preset) {
    setPreset(next);
    setGrants(presetCapabilities(next));
    setCopiedUrl('');
  }
  const pageName = (id?: string) => pages.find(page => page.id === id)?.name ?? 'Page 1';
  const isCurrent = !onSaveSharedReview || savedSignature === signature;
  const effectiveCapabilities = presetCapabilities(preset);
  const reviewPayload = () => sharedReviewSchema.parse({ ...settings, start, version: 1, preset, capabilities: grants, artifacts: selection });
  async function saveSharedReview() {
    if (onSaveSharedReview) await onSaveSharedReview(reviewPayload());
    setSavedSignature(signature);
  }
  async function previewReview() {
    setPublishError('');
    setPublishing(true);
    try { await saveSharedReview(); window.open(shareUrl, '_blank', 'noopener,noreferrer'); }
    catch (error) { setPublishError(error instanceof Error ? error.message : 'Could not save review.'); }
    finally { setPublishing(false); }
  }
  function updateCandidate(next: ReviewArtifact) {
    setCandidates(previous => previous.map(artifact => artifact.id === next.id ? next : artifact));
    setSelection(previous => previous.map(artifact => artifact.id === next.id ? next : artifact));
    setCopiedUrl('');
    setContextStatus('');
  }
  function saveLocalContext() {
    if (!fileId) return;
    try {
      const meaningful = candidates.filter(artifact => artifact.body.trim() || Object.values(artifact.context).some(value => value.trim()) || !artifact.id.startsWith('screen:'));
      saveReview(localStorage, fileId, { version: 1, artifacts: meaningful });
      setContextStatus('Context saved.');
    } catch { setContextStatus('Could not save context. Your changes are still here.'); }
  }

  return <div className="space-y-6 pb-20">
    {onSaveSharedReview && <section className="space-y-3" aria-labelledby="review-audience-heading">
      <div><h3 id="review-audience-heading" className="text-sm font-semibold">Who is this review for?</h3><p className="mt-1 text-xs text-muted-foreground">The audience changes which context and tools viewers see.</p></div>
      <div className="sm:hidden"><Select value={preset} onValueChange={value => changePreset(value as Preset)}><SelectTrigger aria-label="Review audience" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{(Object.entries(presets) as [Preset, (typeof presets)[Preset]][]).map(([id, value]) => <SelectItem key={id} value={id}>{value.name}</SelectItem>)}</SelectContent></Select><p className="mt-2 text-xs leading-5 text-muted-foreground">{presetDescriptions[preset]}</p></div>
      <RadioGroup value={preset} onValueChange={value => changePreset(value as Preset)} className="hidden gap-2 sm:grid sm:grid-cols-2">
        {(Object.entries(presets) as [Preset, (typeof presets)[Preset]][]).map(([id, value]) => <label key={id} className="flex cursor-pointer gap-3 rounded-lg border border-line-soft p-3 transition-colors has-data-[state=checked]:border-ring has-data-[state=checked]:bg-accent/50"><RadioGroupItem value={id} className="mt-0.5" /><span><span className="block text-sm font-medium">{value.name}</span><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{presetDescriptions[id]}</span></span></label>)}
      </RadioGroup>
    </section>}

    {onSaveSharedReview && <section className="grid gap-4 rounded-xl border border-line-soft p-4 sm:grid-cols-2" aria-labelledby="review-details-heading">
      <div className="sm:col-span-2"><h3 id="review-details-heading" className="text-sm font-semibold">Review details</h3><p className="mt-1 text-xs text-muted-foreground">Give recipients a clear title and a short reason for the review.</p></div>
      <label className="text-sm font-medium">Review title<input aria-label="Review title" maxLength={200} value={settings.title} onChange={event => { setSettings(current => ({ ...current, title: event.target.value })); setCopiedUrl(''); }} placeholder="Use the file name" className="mt-2 h-9 w-full rounded-md border bg-background px-3 font-normal" /></label>
      <label className="text-sm font-medium">Introduction<textarea aria-label="Review introduction" maxLength={10000} value={settings.introduction} onChange={event => { setSettings(current => ({ ...current, introduction: event.target.value })); setCopiedUrl(''); }} placeholder="What should reviewers understand or decide?" className="mt-2 min-h-20 w-full rounded-md border bg-background p-3 font-normal" /></label>
    </section>}

    <section className="grid gap-4 rounded-xl border border-line-soft bg-muted/20 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="space-y-2"><label className="text-sm font-medium" id="share-start-label">Start review on</label><Select value={start} disabled={!viewable.length} onValueChange={start => { setSettings(s => ({ ...s, start })); setCopiedUrl(''); }}><SelectTrigger aria-labelledby="share-start-label" className="w-full sm:w-72"><SelectValue placeholder="No screens available" /></SelectTrigger><SelectContent>{viewable.map(screen => <SelectItem key={screen.id} value={screen.id}>{pageName(screen.pageId)} · {screen.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="flex items-center justify-between gap-4 sm:min-w-52"><div><label htmlFor="share-page-navigation" className="text-sm font-medium">Let viewers browse</label><p className="mt-1 max-w-52 text-xs text-muted-foreground">Show the review story and screen list.</p></div><Switch id="share-page-navigation" checked={settings.navigation} onCheckedChange={navigation => { setSettings(s => ({ ...s, navigation })); setCopiedUrl(''); }} /></div>
    </section>

    {onSaveSharedReview && <section className="space-y-3" aria-labelledby="shared-context-heading">
      <div><h3 id="shared-context-heading" className="text-sm font-semibold">Context to share</h3><p className="mt-1 text-xs text-muted-foreground">Nothing from your local notes is shared unless you select it here.</p></div>
      <div className="space-y-2">{candidates.map(artifact => {
        const selected = selection.some(item => item.id === artifact.id);
        const details = [artifact.body, ...Object.values(artifact.context)].filter(Boolean);
        return <div key={artifact.id} className={`rounded-lg border p-3 transition-colors ${selected ? 'border-ring bg-accent/30' : 'border-line-soft'}`}><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1" checked={selected} onChange={event => { setSelection(event.target.checked ? [...selection, artifact] : selection.filter(item => item.id !== artifact.id)); setCopiedUrl(''); }} /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{artifact.title}</span><span className="text-xs capitalize text-muted-foreground">{artifact.type}{details.length ? ` · ${details.length} context ${details.length === 1 ? 'item' : 'items'}` : ' · No context added'}</span></span></label><details className="group mt-3 border-t pt-3"><summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium"><ChevronDown className="size-3 transition-transform group-open:rotate-180" />Add or edit context</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium sm:col-span-2">Summary<textarea aria-label={`${artifact.title} summary`} value={artifact.body} onChange={event => updateCandidate({ ...artifact, body: event.target.value })} placeholder="Describe this review item" className="mt-1 min-h-20 w-full rounded-md border bg-background p-2 font-normal" /></label>{presetContextFields[preset].map(key => <label key={key} className="text-xs font-medium">{contextLabels[key]}<textarea aria-label={`${artifact.title} ${contextLabels[key]}`} value={artifact.context[key]} onChange={event => updateCandidate({ ...artifact, context: { ...artifact.context, [key]: event.target.value } })} placeholder="Add context" className="mt-1 min-h-20 w-full rounded-md border bg-background p-2 font-normal" /></label>)}</div><Button type="button" variant="outline" size="sm" className="mt-3" onClick={saveLocalContext}>Save context</Button></details></div>;
      })}{!candidates.length && <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No context has been saved yet. The source prototype can still be shared.</div>}</div>
      {contextStatus && <p role="status" className="text-sm text-muted-foreground">{contextStatus}</p>}
      {localDraft.error && <p role="alert" className="text-sm text-destructive">{localDraft.error}</p>}
    </section>}

    {onSaveSharedReview && <details className="group rounded-lg border border-line-soft"><summary className="flex cursor-pointer list-none items-center justify-between p-4 text-sm font-medium">Customize review tools<ChevronDown className="size-4 transition-transform group-open:rotate-180" /></summary><fieldset className="grid gap-2 border-t p-4 sm:grid-cols-2"><legend className="sr-only">Available review tools</legend>{effectiveCapabilities.map(capability => <label key={capability} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={grants.includes(capability)} onChange={event => { setGrants(event.target.checked ? [...grants, capability] : grants.filter(value => value !== capability)); setCopiedUrl(''); }} />{capabilityLabels[capability]}</label>)}</fieldset><p className="px-4 pb-4 text-xs text-muted-foreground">These choices shape the review experience. Link access is managed separately.</p></details>}

    {!onSaveSharedReview && playHref && <section className="space-y-2"><label htmlFor="prototype-share-link" className="text-sm font-medium">Prototype link</label><div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1"><Input id="prototype-share-link" aria-label="Prototype link" readOnly value={shareUrl} onFocus={event => event.currentTarget.select()} className="min-w-0 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0" /><Button type="button" disabled={!start || publishing} onClick={copyLink} className="shrink-0">{copiedUrl === shareUrl ? <Check className="size-4" /> : <Copy className="size-4" />}{copiedUrl === shareUrl ? 'Copied' : 'Copy link'}</Button></div></section>}

    {onSaveSharedReview && <div className="sticky -bottom-6 -mx-6 flex flex-col items-stretch gap-3 border-t bg-card/95 px-6 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0 flex-1 text-xs"><p className="flex items-center gap-1.5 font-medium text-foreground">{isCurrent ? <><Link2 className="size-3.5" />Ready to share</> : 'Changes not shared'}</p><p role={copyError || publishError ? 'alert' : 'status'} className={copyError || publishError ? 'mt-1 text-destructive' : 'mt-1 text-muted-foreground'}>{publishError || (copyError ? 'Couldn’t copy the link.' : copiedUrl === shareUrl && isCurrent ? 'Link copied.' : isCurrent ? 'The shared review matches these settings.' : 'Save to update the shared review.')}</p></div><div className="grid grid-cols-2 gap-2 sm:flex"><Button type="button" variant="outline" disabled={!start || publishing} onClick={previewReview}>Preview review</Button><Button type="button" disabled={!start || publishing} onClick={copyLink}>{copiedUrl === shareUrl && isCurrent ? <Check className="size-4" /> : <Copy className="size-4" />}{publishing ? 'Saving…' : copiedUrl === shareUrl && isCurrent ? 'Copied' : 'Save & copy link'}</Button></div></div>}
  </div>;
}
