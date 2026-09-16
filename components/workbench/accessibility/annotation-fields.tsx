'use client';
import { annotationFields, annotationMeta, type Annotation, type KitField } from '@/lib/accessibility/kit';
import type { DiagramNode, DiagramAction } from '@/lib/diagram/store';
import { Input } from '@/components/ui/input';
import { LABEL } from '../chrome';

export function AnnotationFields({node, onAction}: {node:DiagramNode; onAction:(action:DiagramAction)=>void}) {
  const a = node.annotation!;
  const designer = a.library === 'designer';
  const change = (patch:Partial<Annotation>) => onAction({type:'setAnnotation', id:node.id, annotation:{...a, ...patch}});
  const fields = annotationFields(a);
  const stamp = ['pin','lasso','bracket'].includes(a.format);
  const labelFields = ['title','label','type','element','level','imageType','order'];
  const primary = stamp ? fields.filter(f=>labelFields.includes(f.key)) : designer && fields.length > 7 ? fields.slice(0, 6) : fields;
  const advanced = stamp ? fields.filter(f=>!labelFields.includes(f.key)) : designer && fields.length > 7 ? fields.slice(6) : [];
  function select(label:string, value:string, options:readonly string[], onChange:(value:string)=>void) {
    return <label className={`${LABEL} block space-y-1`}>{label}
      <select aria-label={label} className="block w-full rounded-md border border-line-soft bg-muted px-2 py-2 text-xs text-foreground" value={value} onChange={e=>onChange(e.target.value)}>
        {options.map(v=><option key={v} value={v}>{v ? v.charAt(0).toUpperCase()+v.slice(1) : 'Not specified'}</option>)}
      </select>
    </label>;
  }
  function field(f:KitField) {
    if(f.options) return <div key={f.key}>{select(f.label, a.values[f.key]||'', ['', ...f.options!], value=>change({values:{...a.values, [f.key]:value}}))}</div>;
    return <label key={f.key} className={`${LABEL} block space-y-1`}>{f.label}
      <textarea key={`${node.id}:${a.values[f.key]||''}`} aria-label={f.label} defaultValue={a.values[f.key]||''} placeholder={`Add ${f.label.toLowerCase()}`} maxLength={4000} rows={f.key==='code'||f.key==='notes'?3:2}
        className="block w-full resize-y rounded-md border border-line-soft bg-muted p-2 text-xs text-foreground normal-case"
        onBlur={e=>{if(e.target.value!==(a.values[f.key]||''))change({values:{...a.values, [f.key]:e.target.value}});}}
        onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey))e.currentTarget.blur();}} />
    </label>;
  }
  return <div className="space-y-4" aria-label={`${designer?'Designer':'Accessibility'} annotation properties`}>
    <p className="text-xs text-muted-foreground">{designer?'Designer annotation':'Accessibility annotation'}</p>
    <h3 className="text-sm font-semibold">{a.format==='summary'?'Annotation Summary':annotationMeta(a).label}</h3>
    {a.format!=='summary'&&a.format!=='sticky'&&<>
      {select('Format', a.format, designer?['pin','lasso','bracket','card']:['pin','lasso','card'], value=>change({format:value as Annotation['format'], ...((value==='lasso'||value==='bracket')&&a.position==='center'?{position:'above' as const}:{})}))}
      <div className="grid grid-cols-2 gap-2">
        <label className={LABEL}>Note number<Input aria-label="Note number" type="number" min={1} max={9999} value={a.number} onChange={e=>{const n=Number(e.target.value);if(n>=1&&n<=9999)change({number:Math.round(n)});}} /></label>
        {select('Audience', a.audience, ['Default','Dev','Designer','Both','None'], value=>change({audience:value as Annotation['audience']}))}
      </div>
      {(a.format==='pin'||a.format==='lasso'||a.format==='bracket')&&<>
        {select('Label position', a.position, a.format==='pin'?['above','below','left','right','center']:['above','below','left','right'], value=>change({position:value as Annotation['position']}))}
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={a.showNumber} onChange={e=>change({showNumber:e.target.checked})} />Show note number</label>
      </>}
    </>}
    {primary.map(field)}
    {!!advanced.length&&<details className="rounded-md border border-line-soft p-3"><summary className="cursor-pointer text-xs font-medium">{stamp?'Card details':'Additional properties'}</summary>{stamp&&<p className="mt-2 text-xs text-muted-foreground">These fields appear when Format is set to Card.</p>}<div className="mt-3 space-y-3">{advanced.map(field)}</div></details>}
    {a.format!=='summary'&&<label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={a.resolved} onChange={e=>change({resolved:e.target.checked})} />Mark as resolved</label>}
    <div className="grid grid-cols-2 gap-2">{(['width','height'] as const).map(key=><label key={key} className={LABEL}>{key}<Input aria-label={`Annotation ${key}`} type="number" min={40} value={node[key]}
      onKeyDown={e=>{if(e.shiftKey&&(e.key==='ArrowUp'||e.key==='ArrowDown')){e.preventDefault();onAction({type:'resize',id:node.id,width:node.width,height:node.height,[key]:Math.max(40,node[key]+(e.key==='ArrowUp'?10:-10))});}}}
      onChange={e=>{const n=Number(e.target.value);if(n>=40)onAction({type:'resize',id:node.id,width:node.width,height:node.height,[key]:n});}} /></label>)}</div>
    <p className="text-xs text-muted-foreground">Canvas annotation only. Not included in product code.</p>
  </div>;
}
