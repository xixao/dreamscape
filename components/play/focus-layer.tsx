'use client';

import { useEditor } from '@craftjs/core';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/** Uses Craft node identity and measured DOM; never rewrites source layouts. */
export function FocusLayer() {
  const { query, nodes } = useEditor(state => ({ nodes: state.nodes }));
  const [selected, setSelected] = useState('');
  const [rect, setRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  useEffect(() => {
    const choose = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const target = event.target;
      const candidates = Object.values(query.getNodes()).filter(node => node.id !== 'ROOT' && node.dom?.contains(target));
      const deepest = candidates.find(node => !candidates.some(other => other.id !== node.id && node.dom?.contains(other.dom)));
      if (!deepest) return;
      event.preventDefault(); event.stopPropagation();
      setSelected(deepest.id);
    };
    document.addEventListener('click', choose, true);
    return () => document.removeEventListener('click', choose, true);
  }, [query]);
  useEffect(() => {
    const measure = () => {
      const element = selected ? query.getNodes()[selected]?.dom : null;
      const bounds = element?.getBoundingClientRect();
      setRect(bounds ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } : null);
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    const observer = new ResizeObserver(measure);
    const element = selected ? query.getNodes()[selected]?.dom : null;
    if (element) observer.observe(element);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [query, selected]);
  return createPortal(<>
    {rect && <div data-testid="focus-highlight" aria-hidden="true" className="pointer-events-none fixed z-[70] border-2 border-ring" style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height, boxShadow: '0 0 0 9999px rgb(0 0 0 / .55)' }} />}
    <label className="fixed bottom-4 left-4 z-[90] max-w-[90vw] rounded border bg-card p-3 text-sm shadow-lg">Focus component<select aria-label="Focus component" className="ml-2 max-w-48 rounded border bg-background p-1" value={selected} onChange={event => setSelected(event.target.value)}><option value="">Choose or click a component</option>{Object.values(nodes).filter(node => node.id !== 'ROOT').map(node => <option key={node.id} value={node.id}>{node.data.displayName || node.data.name} · {node.id}</option>)}</select></label>
  </>, document.body);
}
