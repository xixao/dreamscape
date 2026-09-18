'use client';

import { useLayoutEffect, useRef, type ComponentProps } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { SEG_GROUP, SEG_ITEM } from './chrome';

type Highlight = { x: number; y: number; width: number; height: number; orientation: string };
// Left-panel contents replace their headers when switching modes. Keep the
// highlight's last position scoped to that panel's stable state setter.
const positions = new WeakMap<object, Highlight>();

type Props = Omit<Extract<ComponentProps<typeof ToggleGroup>, { type: 'single' }>, 'type'> & { continuityKey?: object };
export function SegmentedControl({ children, className, value, orientation = 'horizontal', continuityKey, ...props }: Props) {
  const group = useRef<HTMLDivElement>(null);
  const highlight = useRef<HTMLSpanElement>(null);
  const previous = useRef<Highlight | null>(null);
  const animation = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    const root = group.current; const indicator = highlight.current;
    if (!root || !indicator) return;
    const update = (animate: boolean) => {
      const selected = root.querySelector<HTMLElement>('[data-slot="toggle-group-item"][data-state="on"]');
      if (!selected) { indicator.style.opacity = '0'; return; }
      const outer = root.getBoundingClientRect(); const rect = selected.getBoundingClientRect();
      // Layers stays mounted with display:none while Chat/Notes replaces it.
      // Hidden headers must not overwrite the visible panel's position.
      if (outer.width <= 0 || outer.height <= 0 || rect.width <= 0 || rect.height <= 0) return;
      const next: Highlight = { x: rect.left - outer.left - root.clientLeft, y: rect.top - outer.top - root.clientTop, width: rect.width, height: rect.height, orientation };
      const old = continuityKey ? positions.get(continuityKey) : previous.current;
      const styles = (box: Highlight) => ({ transform: `translate(${box.x}px, ${box.y}px)`, width: `${box.width}px`, height: `${box.height}px` });
      // A newly mounted panel's effect is replayed in Strict Mode. Preserve
      // its in-flight slide instead of replacing it with destination → destination.
      const placed = previous.current;
      if (placed && old && placed.x === next.x && placed.y === next.y && placed.width === next.width && placed.height === next.height && placed.orientation === next.orientation && old.x === next.x && old.y === next.y) return;
      animation.current?.cancel();
      Object.assign(indicator.style, styles(next), { opacity: '1' });
      if (animate && old && old.orientation === orientation && typeof indicator.animate === 'function' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        animation.current = indicator.animate([styles(old), styles(next)], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
      previous.current = next;
      if (continuityKey) positions.set(continuityKey, next);
    };
    update(true);
    // ResizeObserver delivers an initial observation. Don't cancel the slide
    // for that unchanged size; only reposition after actual geometry changes.
    let width = root.clientWidth; let height = root.clientHeight;
    const observer = new ResizeObserver(() => {
      if (width === root.clientWidth && height === root.clientHeight) return;
      width = root.clientWidth; height = root.clientHeight; update(false);
    });
    observer.observe(root);
    // The animation belongs to the DOM node and expires after 180ms. Leaving
    // it alive across effect replay preserves motion; a new target cancels it above.
    return () => { observer.disconnect(); };
  }, [value, orientation, continuityKey]);
  return <ToggleGroup {...props} ref={group} type="single" value={value} orientation={orientation} className={cn(SEG_GROUP, 'relative isolate', className)}>
    <span ref={highlight} aria-hidden="true" data-segment-highlight className="pointer-events-none absolute left-0 top-0 rounded-sm bg-(--segment-active) opacity-0 shadow-[var(--segment-active-shadow)]" />
    {children}
  </ToggleGroup>;
}
export function SegmentedItem({ className, ...props }: ComponentProps<typeof ToggleGroupItem>) {
  return <ToggleGroupItem {...props} className={cn(SEG_ITEM, 'relative z-10 data-[state=on]:bg-transparent data-[state=on]:shadow-none', className)} />;
}
