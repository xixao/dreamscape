'use client';

type Limit = { value: number; unit: 'px' | '%' };
export function InstanceSizing({ props, onChange }: { props: Record<string, unknown>; onChange: (patch: Record<string, unknown>) => void }) {
  const mode = String(props.widthMode ?? 'fill');
  const limit = props.maxWidth as Limit | undefined;
  const control = 'min-w-0 rounded border bg-background px-2 py-1 text-xs';
  return <div className="flex flex-col gap-3">
    <div className="flex items-center gap-2 text-xs"><span className="flex-1">Width</span>
      {mode !== 'fill' && <input className={`${control} w-20 font-mono`} aria-label="Component width" type="number" min={1} value={Number(mode === 'percent' ? props.widthPercent ?? 100 : props.widthPx ?? 320)} onChange={e => { const value = Number(e.target.value); if (value > 0) onChange({ [mode === 'percent' ? 'widthPercent' : 'widthPx']: value }); }} />}
      <select className={control} aria-label="Width sizing" value={mode} onChange={e => onChange({ widthMode: e.target.value })}><option value="fill">Fill container</option><option value="fixed">px</option><option value="percent">%</option></select>
    </div>
    <div className="flex items-center gap-2 text-xs"><span className="flex-1">Max width</span>
      {limit && <input className={`${control} w-20 font-mono`} aria-label="Maximum width" type="number" min={1} value={limit.value} onChange={e => { const value = Number(e.target.value); if (value > 0) onChange({ maxWidth: { ...limit, value } }); }} />}
      <select className={control} aria-label="Maximum width unit" value={limit?.unit ?? 'none'} onChange={e => onChange({ maxWidth: e.target.value === 'none' ? undefined : { value: e.target.value === '%' ? 100 : 800, unit: e.target.value } })}><option value="none">None</option><option value="px">px</option><option value="%">%</option></select>
    </div>
    {mode === 'fill' && <p className="text-xs text-muted-foreground">Fills the space inside the parent’s padding.</p>}
  </div>;
}
