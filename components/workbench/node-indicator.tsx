'use client';

import { ROOT_NODE, useEditor, useNode } from '@craftjs/core';
import { useEffect, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { ZONE_TYPES } from '@/components/blocks/registry';
import { cn } from '@/lib/utils';
import { useStage } from './stage-context';

export type OutlineWeight = 'hover' | 'selected';

export function SelectionOutline({
  rect,
  color,
  label,
  weight,
}: {
  rect: Pick<DOMRect, 'top' | 'left' | 'width' | 'height'>;
  color: string;
  label: string;
  weight: OutlineWeight;
}) {
  return (
    <div
      data-testid="selection-outline"
      data-weight={weight}
      aria-hidden
      className={cn(
        'pointer-events-none fixed z-50',
        weight === 'selected' ? 'outline-2' : 'outline-1 opacity-60',
      )}
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        outlineStyle: 'solid',
        outlineColor: color,
        outlineOffset: weight === 'selected' ? -2 : -1,
      }}
    >
      {weight === 'selected' && (
        <span
          className="absolute top-0 left-0 -translate-y-full bg-primary px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white uppercase"
          style={{ backgroundColor: color === 'var(--acc)' ? 'var(--primary)' : color }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

export function NodeIndicator({ render }: { render: ReactElement }) {
  const { id, dom, name, isHovered } = useNode((node) => ({
    dom: node.dom,
    name: node.data.name,
    isHovered: node.events.hovered,
  }));
  const { isSelected, treeVersion } = useEditor((state) => ({
    isSelected: state.events.selected.has(id),
    // A cheap fingerprint of the whole tree's shape: every node id paired with
    // its own ordered children, joined into one string. It changes whenever any
    // node anywhere is added, removed, or moved, unlike a plain node-count or
    // id-list check, which misses a same-parent reorder. Read only to force the
    // effect below to re-run; see the note in its dependency array.
    treeVersion: Object.entries(state.nodes)
      .map(([nodeId, node]) => `${nodeId}:${node.data.nodes.join(',')}`)
      .join('|'),
  }));
  // The stage scales the artboard with a CSS `zoom` factor to fit the column
  // (see stage.tsx). `zoom` and `width` are read here only to force the effect
  // below to re-measure when either changes; see the adaptation note where
  // they're added to its dependency array.
  const { zoom, width } = useStage();
  const [rect, setRect] = useState<DOMRect | null>(null);

  const isRoot = id === ROOT_NODE;
  const isZone = ZONE_TYPES.has(name);
  const active = !isRoot && !isZone && (isSelected || isHovered);

  useEffect(() => {
    if (!dom || !active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRect(null);
      return;
    }
    const update = () => setRect(dom.getBoundingClientRect());
    update();
    const observer = new ResizeObserver(update);
    observer.observe(dom);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
    // `zoom` and `width` are not read in the effect body: the stage applies
    // zoom as a CSS `zoom` factor on an ancestor (stage.tsx), which rescales
    // getBoundingClientRect() without changing the node's own layout box, so
    // neither ResizeObserver nor a window resize/scroll event fires for it.
    // Depending on them here forces a re-measure whenever the artboard
    // rescales (preset switch or resize-grip drag).
    // `treeVersion` is the same kind of dependency: adding, removing or moving
    // a node elsewhere in the tree can shift this node's position (e.g. a new
    // sibling pushes it over) without resizing this node's own box, which is
    // the one thing ResizeObserver watches. Depending on it here forces a
    // re-measure on every such structural change.
  }, [dom, active, zoom, width, treeVersion]);

  return (
    <>
      {render}
      {rect &&
        active &&
        createPortal(
          <SelectionOutline
            rect={rect}
            color="var(--acc)"
            label={name}
            weight={isSelected ? 'selected' : 'hover'}
          />,
          document.body,
        )}
    </>
  );
}
