'use client';
import { useState } from 'react';
import { CATEGORIES, KIT, ANNOTATION_MIME, ANNOTATION_DRAG, type Category, type Annotation } from '@/lib/accessibility/kit';
import { DESIGNER_KINDS, DESIGNER_KIT, type DesignerKind } from '@/lib/accessibility/designer-kit';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type Props = {
  library?: 'accessibility' | 'designer';
  onInsert: (category: Category, format: Annotation['format'], template?: DesignerKind) => void;
  onClose: () => void;
  onNote: () => void;
};
export function AnnotationLibrary({ library = 'accessibility', onInsert, onClose, onNote }: Props) {
  const [search, setSearch] = useState('');
  const [format, setFormat] = useState<Annotation['format']>('pin');
  const designer = library === 'designer';
  const formats: Annotation['format'][] = designer ? ['pin', 'lasso', 'bracket', 'card'] : ['pin', 'lasso', 'card'];
  const entries = designer
    ? DESIGNER_KINDS.map(template => ({category:'other' as Category, template, ...DESIGNER_KIT[template], kind:template === 'post-it' ? 'sticky' as const : format}))
    : [...CATEGORIES.map(category => ({category, template:undefined, ...KIT[category], kind:format})), {category:'other' as Category, template:undefined, label:'Annotation Summary', color:KIT.other.color, kind:'summary' as const}];
  const filtered = entries.filter(entry => entry.label.toLowerCase().includes(search.toLowerCase()));
  return <div aria-label={`${designer ? 'Designer' : 'Accessibility'} annotation library`} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
    <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">{designer ? 'Designer annotations' : 'Accessibility kit'}</h2><Button variant="ghost" size="sm" onClick={onClose}>Done</Button></div>
    <p className="text-xs text-muted-foreground">Click to add, or drag onto the canvas. Select an annotation to edit its details.</p>
    <Input aria-label={`Search ${designer ? 'designer' : 'accessibility'} annotations`} placeholder="Find an annotation…" value={search} onChange={e => setSearch(e.target.value)} />
    <div role="group" aria-label="Annotation format" className={`grid gap-1 rounded-md bg-muted p-1 ${designer ? 'grid-cols-4' : 'grid-cols-3'}`}>
      {formats.map(f => <button key={f} aria-pressed={format === f} onClick={() => setFormat(f)} className={`rounded px-2 py-1.5 text-xs ${format === f ? 'bg-accent text-foreground' : 'text-muted-foreground'}`}>{f.charAt(0).toUpperCase() + f.slice(1)}</button>)}
    </div>
    <div className="space-y-2">
      {filtered.map(entry => <button key={entry.template ?? `${entry.category}-${entry.kind}`} draggable
        onDragStart={e => {
          const raw = JSON.stringify({category:entry.category, format:entry.kind, ...(entry.template ? {template:entry.template} : {})});
          e.dataTransfer.setData(ANNOTATION_MIME, raw); e.dataTransfer.effectAllowed = 'copy';
          window.dispatchEvent(new CustomEvent(ANNOTATION_DRAG, {detail:raw}));
        }}
        onDragEnd={() => window.dispatchEvent(new CustomEvent(ANNOTATION_DRAG, {detail:null}))}
        onClick={() => entry.template ? onInsert(entry.category, entry.kind, entry.template) : onInsert(entry.category, entry.kind)}
        className="flex w-full items-center gap-3 rounded-lg border border-line-soft bg-muted/30 px-3 py-3 text-left text-xs hover:bg-muted"
        aria-label={`Add ${entry.label} ${entry.kind === 'summary' || entry.kind === 'sticky' ? '' : entry.kind}`.trim()}>
        <span aria-hidden className="size-3 rounded-full" style={{background:entry.color}} /><span>{entry.label}</span>
      </button>)}
      {!filtered.length && <p className="py-3 text-xs text-muted-foreground">No matching annotations.</p>}
    </div>
    <Button variant="outline" size="sm" onClick={onNote}>Place {designer ? 'a designer' : 'an accessibility'} comment</Button>
  </div>;
}
