'use client';

import { useEffect, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Page, Screen } from '@/lib/files/repository';
import { isOverlay } from '@/lib/files/screens';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Settings {
  start: string;
  navigation: boolean;
  approval: 'off' | 'prototype' | 'screen';
  comments: Record<string, boolean>;
  approvals: Record<string, boolean>;
}

export function ShareSettings({ screens, pages, currentScreenId, storageKey, playHref }: { playHref?: string; screens: Screen[]; pages: Page[]; currentScreenId?: string; storageKey: string }) {
  const viewable = screens.filter(screen => !isOverlay(screen));
  const [settings, setSettings] = useState<Settings>(() => {
    const defaults: Settings = { start: currentScreenId ?? '', navigation: true, approval: 'off', comments: {}, approvals: {} };
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      if (!saved || typeof saved !== 'object') return defaults;
      const flags = (value: unknown): Record<string, boolean> => value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([, flag]) => typeof flag === 'boolean')) : {};
      return { start: typeof saved.start === 'string' ? saved.start : defaults.start, navigation: typeof saved.navigation === 'boolean' ? saved.navigation : true, approval: ['off', 'prototype', 'screen'].includes(saved.approval) ? saved.approval : 'off', comments: flags(saved.comments), approvals: flags(saved.approvals) };
    } catch { return defaults; }
  });
  const start = viewable.some(screen => screen.id === settings.start) ? settings.start : viewable[0]?.id ?? '';
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify({ ...settings, start })); } catch { /* Storage may be unavailable; controls remain usable. */ } }, [settings, start, storageKey]);
  const [copiedUrl, setCopiedUrl] = useState('');
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
    try { await navigator.clipboard.writeText(shareUrl); setCopiedUrl(shareUrl); }
    catch { setCopiedUrl(''); setCopyError(true); }
  }
  const pageName = (id?: string) => pages.find(page => page.id === id)?.name ?? 'Page 1';
  return <div className="space-y-6">
    {playHref && <section className="space-y-2"><label htmlFor="prototype-share-link" className="text-sm font-medium">Prototype link</label><div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1"><Input id="prototype-share-link" aria-label="Prototype link" readOnly value={shareUrl} onFocus={event => event.currentTarget.select()} className="min-w-0 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0" /><Button type="button" disabled={!start} onClick={copyLink} className="shrink-0">{copiedUrl === shareUrl ? <Check className="size-4" /> : <Copy className="size-4" />}{copiedUrl === shareUrl ? 'Copied' : 'Copy link'}</Button></div><p role={copyError ? 'alert' : 'status'} className="text-xs text-muted-foreground">{copyError ? 'Couldn’t copy. Select the link and copy it manually.' : copiedUrl === shareUrl ? 'Link copied.' : 'Opens the prototype in shared-view mode.'}</p></section>}

    <div className="grid gap-5 sm:grid-cols-2">
      <div className="space-y-2"><label className="text-sm font-medium" id="share-start-label">Starting point</label>
        <Select value={start} disabled={!viewable.length} onValueChange={start => setSettings(s => ({ ...s, start }))}><SelectTrigger aria-labelledby="share-start-label" className="w-full"><SelectValue placeholder="No screens available" /></SelectTrigger><SelectContent>{viewable.map(screen => <SelectItem key={screen.id} value={screen.id}>{pageName(screen.pageId)} · {screen.name}</SelectItem>)}</SelectContent></Select>
        <p className="text-xs text-muted-foreground">The first screen viewers see when they open the prototype.</p>
      </div>
      <div className="space-y-2"><label className="text-sm font-medium" id="share-approval-label">Approval</label>
        <Select value={settings.approval} onValueChange={approval => setSettings(s => ({ ...s, approval: approval as Settings['approval'] }))}><SelectTrigger aria-labelledby="share-approval-label" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="off">Off</SelectItem><SelectItem value="prototype">Entire prototype</SelectItem><SelectItem value="screen">Per screen</SelectItem></SelectContent></Select>
        <p className="text-xs text-muted-foreground">{settings.approval === 'prototype' ? 'Request one approval for the whole prototype.' : settings.approval === 'screen' ? 'Choose which screens need individual approval below.' : 'Viewers won’t be asked for approval.'}</p>
      </div>
    </div>
    <div className="flex items-center justify-between gap-4 rounded-lg border p-4"><div><label htmlFor="share-page-navigation" className="text-sm font-medium">Show page navigation</label><p className="mt-1 text-xs text-muted-foreground">Give viewers a dropdown of all prototype pages so they can jump between them.</p></div><Switch id="share-page-navigation" checked={settings.navigation} onCheckedChange={navigation => setSettings(s => ({ ...s, navigation }))} /></div>
    <section className="space-y-3"><div><h3 className="text-sm font-semibold">Screen permissions</h3><p className="mt-1 text-xs text-muted-foreground">Choose where viewers can comment{settings.approval === 'screen' ? ' and give approval' : ''}.</p></div>
      <div className="overflow-hidden rounded-lg border"><table className="w-full text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-4 py-3 text-left font-medium">Screen</th><th className="w-24 px-3 py-3 text-center font-medium">Comments</th>{settings.approval === 'screen' && <th className="w-24 px-3 py-3 text-center font-medium">Approval</th>}</tr></thead><tbody>{viewable.map(screen => <tr key={screen.id} className="border-t"><td className="px-4 py-3"><span className="block text-xs text-muted-foreground">{pageName(screen.pageId)}</span><span>{screen.name}</span></td><td className="px-3 py-3 text-center"><Switch aria-label={`Comments for ${pageName(screen.pageId)} · ${screen.name}`} checked={settings.comments[screen.id] ?? false} onCheckedChange={enabled => setSettings(s => ({ ...s, comments: { ...s.comments, [screen.id]: enabled } }))} /></td>{settings.approval === 'screen' && <td className="px-3 py-3 text-center"><Switch aria-label={`Approval for ${pageName(screen.pageId)} · ${screen.name}`} checked={settings.approvals[screen.id] ?? false} onCheckedChange={enabled => setSettings(s => ({ ...s, approvals: { ...s.approvals, [screen.id]: enabled } }))} /></td>}</tr>)}</tbody></table>{!viewable.length && <p className="p-4 text-sm text-muted-foreground">Add a screen to configure sharing.</p>}</div>
    </section>
  </div>;
}
