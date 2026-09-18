'use client';
import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, LockKeyhole, Moon, Sun, Trash2, Search, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PANEL, PANEL_HEADER, LABEL, CHIP, SEARCH, SEG_GROUP, SEG_ITEM, PRIMARY_BUTTON, SECONDARY_BUTTON } from '@/components/workbench/chrome';
import { cn } from '@/lib/utils';
import { DARK, DEFAULTS, LIGHT, EASTER_EGG_THEMES, ROLE_GROUPS, ROLES, contrastChecks, hiddenPreset, themeVariables, type Mode, type Role, type UITheme } from '@/lib/ui-theme';
import { useUITheme } from './theme-provider';
import { CursorSettings } from './cursor-settings';
import { ColorWheel } from './color-wheel';
import { ThemePanelPreview } from './theme-panel-preview';

function ThemePreview({theme}:{theme:UITheme}) {
 return <div style={themeVariables(theme) as CSSProperties} className="overflow-hidden rounded-xl border border-border bg-background text-foreground" aria-label={`${theme.name || 'Custom'} theme preview`}>
  <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3"><span className="text-sm font-semibold">Dreamscape</span><span className="text-xs text-muted-foreground">Saved</span></div>
  <div className="grid min-h-56 grid-cols-[1fr_150px] gap-3 bg-canvas p-4">
   <div className="flex items-center justify-center"><div className="rounded-lg border border-border bg-card p-4 shadow-panel"><div className="text-sm font-semibold">Your workspace</div><p className="mt-2 text-xs text-t2">Panels, controls, and canvas</p><p className="mt-2 text-xs text-muted-foreground">A preview of your theme.</p><button type="button" tabIndex={-1} className="mt-4 rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground">Primary action</button></div></div>
   <div className="rounded-lg border border-border bg-card p-3 shadow-panel"><div className="rounded bg-accent p-2 text-xs">Design</div><p className="mt-4 font-mono text-[10px] text-muted-foreground">WIDTH</p><div className="mt-2 rounded border border-border bg-muted p-2 text-xs">320 px</div><p className="mt-2 text-[11px] text-t4">Enter a value</p><div className="mt-4 flex gap-2">{['ok','warn','bad'].map(color=><span key={color} className="size-3 rounded-full" style={{background:`var(--${color})`}}/>)}</div></div>
  </div>
 </div>;
}
const PRESET_NAMES: Record<string, string> = {
 naruto: 'Naruto', kuromi: 'Kuromi', spartans: 'Michigan State',
 wolverines: 'University of Michigan', sonic: 'Sonic', goth: 'Goth',
};

// Older versions saved an unchanged preset as a custom theme. Represent those
// copies with the preset card, while retaining genuinely customized palettes.
function matchingGalleryPreset(item: UITheme): string | undefined {
 const name=item.name.trim().toLowerCase();
 const entry=Object.entries(PRESET_NAMES).find(([key,label])=>
  (name===key || name===label.toLowerCase() || hiddenPreset(name,item.mode)?.['bg-canvas']===EASTER_EGG_THEMES[key][item.mode]['bg-canvas']) &&
  ROLES.every(role=>item.colors[role]===EASTER_EGG_THEMES[key][item.mode][role]));
 return entry ? `preset-${entry[0]}-${item.mode}` : undefined;
}

function ThemeThumbnail({theme}:{theme:UITheme}) {
 return <div aria-hidden="true" style={themeVariables(theme) as CSSProperties} className="pointer-events-none flex h-[320px] items-center justify-center overflow-hidden bg-canvas text-foreground">
  <div className={cn(PANEL, 'w-[280px] shrink-0 origin-center scale-[.82] overflow-hidden text-left')}>
   <div className={cn(PANEL_HEADER, 'py-3')}>
    <div className={SEG_GROUP}>{['Design','Prototype','Components'].map((label,i)=><span key={label} data-state={i===0?'on':'off'} className={cn(SEG_ITEM,'text-center')}>{label}</span>)}</div>
   </div>
   <div className="space-y-3 p-4">
    <div className="flex items-center gap-2 text-[12.5px] font-semibold"><Layers className="size-4 text-acc"/>Frame settings</div>
    <div className={SEARCH}><Search className="size-3.5 text-muted-foreground"/><span className="text-[13px] text-t4">Search components…</span></div>
    <div className="grid grid-cols-2 gap-3">{['Width','Height'].map((label,i)=><div key={label}><div className={LABEL}>{label}</div><div className={cn(CHIP,'mt-1 justify-between')}><span className="font-mono text-[12.5px]">{i?'240':'320'}</span><span className="text-xs text-muted-foreground">px</span></div></div>)}</div>
    <div className="flex items-center justify-between border-t border-line-soft pt-3"><span className="text-[12.5px] text-t2">Show layout grid</span><span className="flex h-4 w-7 items-center justify-end rounded-full bg-primary px-0.5"><span className="size-3 rounded-full bg-primary-foreground"/></span></div>
    <div className="flex gap-2"><span className={cn(PRIMARY_BUTTON,'flex-1 text-center')}>Apply</span><span className={SECONDARY_BUTTON}>Reset</span></div>
    <div className="flex items-center justify-between border-t border-line-soft pt-2 text-[11px]"><span className="flex items-center gap-1 text-ok"><Check className="size-3"/>Saved</span><span className="text-warn">Warning</span><span className="text-bad">Error</span></div>
   </div>
  </div>
 </div>;
}

export function ThemeSettings() {
 const {preferences,theme,ready,error,select,save,remove,preview}=useUITheme();
 const [draft,setDraft]=useState<UITheme|null>(null),[notice,setNotice]=useState('');
 const [galleryChoice,setGalleryMode]=useState<Mode|null>(null);
 const galleryMode=galleryChoice??theme.mode;
 const [presetKey,setPresetKey]=useState<string|null>(null);
 useEffect(()=>{preview(draft);return()=>preview(null);},[draft,preview]);
 const activeId=matchingGalleryPreset(theme)??theme.id;
 const savedThemes=preferences.custom.filter(item=>!matchingGalleryPreset(item));
 const failed=draft?contrastChecks(draft.colors).filter(c=>c.ratio<c.minimum):[];
 function start(source:UITheme){setPresetKey(null);setNotice('');setDraft({...source,id:`custom-${crypto.randomUUID()}`,name:'',colors:{...source.colors}});}
 function rename(name:string){if(!draft)return;const preset=hiddenPreset(name,draft.mode);if(preset)setPresetKey(name.trim().toLowerCase());setDraft({...draft,name,...(preset?{colors:preset}:{})});setNotice(preset?'Palette loaded. You can adjust its colors below.':'');}
 function baseline(mode:Mode){if(!draft)return;const preset=hiddenPreset(presetKey??draft.name,mode);setDraft({...draft,mode,colors:preset??{...(mode==='dark'?DARK:LIGHT).colors}});}
 return <main className="mx-auto max-w-[1180px] px-5 pb-16 pt-4">
  <header className={cn(PANEL,'flex h-[54px] items-center gap-4 px-4')}><Link className="flex items-center gap-2 text-sm text-t2 hover:text-foreground" href="/"><ArrowLeft size={16}/>Files</Link></header>
  <div className="my-8"><h1 className="text-2xl font-semibold">Settings</h1><h2 className="mt-6 text-lg font-semibold">Interface theme</h2><p className="mt-2 text-sm text-t2">Make Dreamscape feel like your workspace. Your screen designs keep their own themes.</p><p className="mt-1 text-xs text-muted-foreground">Saved in this browser on this device.</p></div>
  {error&&<p role="alert" className="mb-4 text-bad">{error}</p>}
  {!draft?<>
   <div className="grid gap-5 md:grid-cols-2">{DEFAULTS.map(item=><section key={item.id} className={cn(PANEL,'p-5',activeId===item.id&&'ring-2 ring-ring')}>
    <div className="mb-4 flex items-center gap-2">{item.mode==='dark'?<Moon size={18}/>:<Sun size={18}/>}<h2 className="font-semibold">{item.name}</h2><span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground"><LockKeyhole size={12}/>Locked default</span></div>
    <ThemePreview theme={item}/><div className="mt-4 flex gap-2"><Button disabled={!ready} className={cn(SECONDARY_BUTTON,'flex-1')} onClick={()=>select(item.id)}>{activeId===item.id?<><Check size={14}/>Active</>:`Use ${item.name}`}</Button><Button disabled={!ready} className={SECONDARY_BUTTON} onClick={()=>start(item)}>Customize</Button></div>
   </section>)}</div>
   <div className="mt-8 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Custom themes</h2><div className="flex items-center gap-3"><label className="flex items-center gap-2 text-sm text-t2">Preview<select aria-label="Theme gallery appearance" value={galleryMode} onChange={e=>setGalleryMode(e.target.value as Mode)} className="rounded-md border border-border bg-muted px-2 py-1.5"><option value="dark">Dark</option><option value="light">Light</option></select></label><Button className={SECONDARY_BUTTON} onClick={()=>start(theme)}>Create theme</Button></div></div>
   <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {Object.entries(PRESET_NAMES).map(([key,name])=>{
     const item:UITheme={id:`preset-${key}-${galleryMode}`,name,mode:galleryMode,colors:EASTER_EGG_THEMES[key][galleryMode]};
     return <div key={key} className={cn(PANEL,'overflow-hidden',activeId===item.id&&'ring-2 ring-ring')}><button type="button" aria-label={`Customize ${name}`} className="block w-full text-left focus-visible:outline-2 focus-visible:outline-ring" onClick={()=>{setPresetKey(key);setDraft({...item,id:`custom-${crypto.randomUUID()}`,colors:{...item.colors}});setNotice('');}}><ThemeThumbnail theme={item}/></button><div className="flex items-center gap-2 border-t border-border px-4 py-3"><h3 className="min-w-0 flex-1 text-sm font-semibold">{name}</h3><Button type="button" size="sm" variant="secondary" disabled={!ready} aria-label={`Apply ${name}`} aria-pressed={activeId===item.id} onClick={()=>select(item.id)}>{activeId===item.id?<><Check size={14}/>Active</>:'Apply'}</Button></div></div>;
    })}
    {savedThemes.map(item=><div key={item.id} className={cn(PANEL,'overflow-hidden',activeId===item.id&&'ring-2 ring-ring')}><button type="button" aria-label={`Edit ${item.name}`} className="block w-full text-left focus-visible:outline-2 focus-visible:outline-ring" onClick={()=>{setPresetKey(null);setDraft({...item,colors:{...item.colors}});}}><ThemeThumbnail theme={item}/></button><div className="flex items-center gap-2 border-t border-border px-4 py-3"><h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{item.name}{Object.values(PRESET_NAMES).some(name=>name.toLowerCase()===item.name.trim().toLowerCase())?' · Custom':''}</h3><Button type="button" size="sm" variant="secondary" aria-label={`Apply ${item.name}`} aria-pressed={activeId===item.id} onClick={()=>select(item.id)}>{activeId===item.id?<><Check size={14}/>Active</>:'Apply'}</Button><Button type="button" size="icon-sm" variant="ghost" aria-label={`Delete ${item.name}`} onClick={()=>{if(window.confirm(`Delete “${item.name}”?`))remove(item.id);}}><Trash2 size={14}/></Button></div></div>)}
   </div>
  </>:<form onSubmit={e=>{e.preventDefault();if(!draft.name.trim())return;const preset=matchingGalleryPreset(draft);if(preset)select(preset);else save({...draft,name:draft.name.trim()});setDraft(null);setNotice('Theme saved and applied.');}}>
   <div className="grid items-start gap-6 lg:grid-cols-[1fr_420px]">
    <section className={cn(PANEL,'p-5')}><h2 className="text-lg font-semibold">Customize theme</h2><label className="mt-5 block text-sm">Theme name<input autoFocus required maxLength={60} value={draft.name} onChange={e=>rename(e.target.value)} placeholder="Name your theme" className="mt-2 block w-full rounded-md border border-border bg-muted px-3 py-2 text-foreground focus:outline-2 focus:outline-ring"/></label>
     <label className="mt-4 block text-sm">Baseline<select value={draft.mode} onChange={e=>baseline(e.target.value as Mode)} className="mt-2 block w-full rounded-md border border-border bg-muted px-3 py-2"><option value="dark">Dark</option><option value="light">Light</option></select></label><p className="mt-2 text-xs text-muted-foreground">Changing the baseline resets the colors below.</p>
     {Object.entries(ROLE_GROUPS).map(([group,roles])=><fieldset className="mt-6 border-t border-border pt-3" key={group}><legend className="pr-2 text-sm font-semibold">{group}</legend><div className="space-y-3">{Object.entries(roles).map(([role,label])=><div key={role} className="grid grid-cols-[1fr_minmax(160px,230px)] items-start gap-3"><span className="pt-2 text-sm text-t2">{label}</span><ColorWheel key={`${role}-${draft.mode}`} label={label} value={draft.colors[role as Role]} onChange={value=>setDraft({...draft,colors:{...draft.colors,[role]:value}})}/></div>)}</div></fieldset>)}
    </section>
    <aside className="space-y-4 lg:sticky lg:top-5"><ThemePanelPreview theme={draft}/><p className="text-sm text-t2">Live preview is on. Save to keep this theme, or cancel to restore your previous one.</p><p role="status" className="text-sm text-acc">{notice}</p>{failed.length>0&&<div className={cn(PANEL,'p-4')}><p className="text-sm font-semibold">Some colors need more contrast</p><p className="mt-1 text-xs text-t2">{failed.length} text or control color pairs fall below their AA target. You can still save your custom theme.</p><details className="mt-2 text-xs"><summary className="cursor-pointer">Review contrast</summary><ul className="mt-2 max-h-48 space-y-1 overflow-auto">{failed.map(check=><li key={`${check.role}-${check.background}`}>{check.role} on {check.background}: {check.ratio.toFixed(2)}:1 (needs {check.minimum}:1)</li>)}</ul></details></div>}
     <div className="flex gap-3"><Button type="submit" disabled={!draft.name.trim()} className={cn(PRIMARY_BUTTON,'flex-1')}>Save theme</Button><Button type="button" className={SECONDARY_BUTTON} onClick={()=>{setDraft(null);setNotice('');}}>Cancel</Button></div>
    </aside>
   </div>
  </form>}
  {!draft&&notice&&<p className="mt-4 text-sm text-acc" role="status">{notice}</p>}
  {!draft&&<CursorSettings/>}
 </main>;
}
