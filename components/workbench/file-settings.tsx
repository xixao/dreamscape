'use client';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { APPEARANCE_OPTIONS, useAppearance, type Appearance } from './appearance-context';
export function FileSettings({open,onOpenChange,fileName,onRename}:{open:boolean;onOpenChange:(open:boolean)=>void;fileName:string;onRename:(name:string)=>void}) {
  const {appearance,setAppearance}=useAppearance();
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-lg bg-card"><DialogTitle>File settings</DialogTitle><DialogDescription>Defaults for this design file. Individual frames can override the theme.</DialogDescription>
    <label className="space-y-2 text-sm">File name<Input key={fileName} aria-label="File name in settings" defaultValue={fileName} maxLength={120} onBlur={e=>{const name=e.target.value.trim();if(name)onRename(name);else e.target.value=fileName;}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}} /></label>
    <label className="space-y-2 text-sm">Default theme<select aria-label="File appearance" className="block w-full rounded-md border bg-muted p-2 text-sm" value={appearance} onChange={e=>setAppearance?.(e.target.value as Appearance)}>{APPEARANCE_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
    <p className="text-xs text-muted-foreground">Changes save automatically. Handoff scope and delivery settings are configured in Handoff.</p>
  </DialogContent></Dialog>;
}
