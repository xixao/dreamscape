'use client';

import { ROOT_NODE, useNode } from '@craftjs/core';
import { useEffect, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { ZONE_TYPES } from '@/components/blocks/registry';
import { describeInteraction, getInteraction } from '@/lib/interactions';
import { cn } from '@/lib/utils';
import { useCanvasDocument } from './canvas-frame';
import { useSettledEditorState } from './use-settled-editor-state';
import { InteractionTag } from './interaction-tag';
import { usePrototypeContext } from './prototype-context';
import { useStage } from './stage-context';

export type OutlineWeight = 'hover' | 'selected';

export function SelectionOutline({
  rect,
  color,
  label,
  weight,
  dragId,
}: {
  rect: Pick<DOMRect, 'top' | 'left' | 'width' | 'height'>;
  color: string;
  label: string;
  weight: OutlineWeight;
  dragId?: string;
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
      {(weight === 'selected' || dragId) && (
        <span
          onPointerDown={event => event.stopPropagation()}
          onMouseDown={event => event.stopPropagation()}
          draggable={!!dragId}
          data-drag-handle={dragId}
          title={dragId ? `Drag ${label}` : undefined}
          className={cn(dragId && 'pointer-events-auto cursor-grab active:cursor-grabbing', 'absolute top-0 left-0 bg-black px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white uppercase', rect.top >= 24 && '-translate-y-full')}
          style={{ top: Math.max(0, -rect.top), backgroundColor: '#000000', color: '#ffffff' }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

export function NodeIndicator({ render }: { render: ReactElement }) {
  const { id, dom, name, displayName, isHovered, custom } = useNode((node) => ({
    dom: node.dom,
    name: node.data.name,
    displayName: node.data.displayName,
    isHovered: node.events.hovered,
    custom: node.data.custom,
  }));
  const editorSnapshot = useSettledEditorState();
  const nodes = editorSnapshot.nodes;
  const isSelected = editorSnapshot.events.selected.has(id);
  // The stage scales the artboard with a CSS transform to fit the column
  // (see stage.tsx / canvas-frame.tsx). `zoom` and `width` are read here only
  // to force the effect below to re-measure when either changes; see the
  // adaptation note where they're added to its dependency array.
  const { zoom, width } = useStage();
  const { panelMode, screens } = usePrototypeContext();
  const [rect, setRect] = useState<DOMRect | null>(null);
  // The iframe's own document/window once Stage has one (canvas-frame.tsx);
  // null in Play mode and in any test that renders a block tree without a
  // Stage, in which case this falls back to the parent document/window
  // exactly as before this feature.
  const canvasDocument = useCanvasDocument();
  const targetDocument = canvasDocument?.document ?? document;
  const targetWindow = canvasDocument?.window ?? window;

  const isRoot = id === ROOT_NODE;
  const isZone = ZONE_TYPES.has(name);
  const interaction = !isRoot && !isZone ? getInteraction({ data: { custom } }) : null;
  const showOutline = isSelected || (!isRoot && !isZone && isHovered);
  const showTag = panelMode === 'prototype' && interaction !== null;
  const active = showOutline || showTag;

  useEffect(() => {
    if (!dom || !active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRect(null);
      return;
    }
    const update = () => {
      const next = dom.getBoundingClientRect();
      setRect(previous => previous && previous.top === next.top && previous.left === next.left && previous.width === next.width && previous.height === next.height ? previous : next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(dom);
    // Listened on the node's own window (the iframe's, once Stage has one -
    // see targetWindow above) rather than always the outer one: a node
    // scrolling inside the frame (a fixed-height device with overflowing
    // content) fires scroll/resize on ITS window, which is a different
    // object from the parent's once the artboard lives in an iframe.
    targetWindow.addEventListener('scroll', update, true);
    targetWindow.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      targetWindow.removeEventListener('scroll', update, true);
      targetWindow.removeEventListener('resize', update);
    };
    // `zoom` and `width` are not read in the effect body: the stage applies
    // zoom as a CSS transform on an ancestor (canvas-frame.tsx), which
    // rescales getBoundingClientRect() without changing the node's own
    // layout box, so neither ResizeObserver nor a window resize/scroll event
    // fires for it. Depending on them here forces a re-measure whenever the
    // artboard rescales (preset switch or a resize-handle drag).
    // The node snapshot also changes when inspector props change: adding, removing or moving
    // a node elsewhere in the tree can shift this node's position (e.g. a new
    // sibling pushes it over) without resizing this node's own box, which is
    // the one thing ResizeObserver watches. Depending on it here forces a
    // re-measure on every such structural change.
  }, [dom, active, zoom, width, nodes, targetWindow]);

  const tagText = showTag ? describeInteraction(interaction, screens, nodes) : null;

  return (
    <>
      {render}
      {rect &&
        active &&
        createPortal(
          <>
            {showOutline && (
              <SelectionOutline
                dragId={!isRoot && !isZone ? id : undefined}
                rect={rect}
                color="var(--acc)"
                label={String(custom.layerName || displayName || name)}
                weight={isSelected ? 'selected' : 'hover'}
              />
            )}
            {tagText && <InteractionTag rect={rect} text={tagText} />}
          </>,
          targetDocument.body,
        )}
    </>
  );
}
