"use client";
import { useLayoutEffect, useRef, useState } from "react";
export type PreviewFocus = "page" | "component" | "error";
const interactive =
  "button,a,input,textarea,select,[role=button],[data-canvas-interactive]";
export default function PreviewCanvas({
  children,
  zoom,
  onZoom,
  resetKey,
  viewport,
  paired,
  focus,
  feedback,
  phoneWidth = 340,
}: {
  children: React.ReactNode;
  zoom: number | "fit";
  onZoom: (zoom: number) => void;
  resetKey: number;
  viewport: string;
  paired: boolean;
  focus: PreviewFocus;
  feedback: boolean;
  phoneWidth?: number;
}) {
  const outer = useRef<HTMLDivElement>(null),
    inner = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({
    width: 800,
    height: 600,
    contentHeight: 600,
  });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const host = outer.current,
      content = inner.current;
    if (!host || !content) return;
    const measure = () =>
      setSize({
        width: host.clientWidth,
        height: host.clientHeight,
        contentHeight: content.offsetHeight,
      });
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    observer.observe(content);
    measure();
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    setPan({ x: 0, y: 0 });
  }, [resetKey, viewport, paired, focus, feedback, phoneWidth]);
  const width =
    (paired
      ? 1180 + (viewport === "both" ? phoneWidth - 340 : 0)
      : viewport === "mobile"
        ? phoneWidth
        : focus === "page"
          ? 920
          : 560) + (feedback ? (paired ? 520 : 260) : 0);
  const scale =
    zoom === "fit"
      ? Math.max(
          0.15,
          Math.min(
            1,
            (size.width - 32) / width,
            (size.height - 32) / Math.max(size.contentHeight, 1),
          ),
        )
      : zoom;
  const base = {
    x: (size.width - width * scale) / 2,
    y: Math.max(16, (size.height - size.contentHeight * scale) / 2),
  };
  const latest = useRef({ scale, pan, base, onZoom });
  useLayoutEffect(() => {
    latest.current = { scale, pan, base, onZoom };
  });
  useLayoutEffect(() => {
    const host = outer.current;
    if (!host) return;
    const zoomAt = (factor: number, x: number, y: number) => {
      const current = latest.current;
      const next = Math.max(
        0.15,
        Math.min(3, Math.round(current.scale * factor * 1000) / 1000),
      );
      const ratio = next / current.scale;
      // Keep the world point underneath the pinch stationary.
      const nextBase = {
        x: (host.clientWidth - width * next) / 2,
        y: Math.max(16, (host.clientHeight - size.contentHeight * next) / 2),
      };
      const nextPan = {
        x: x - (x - current.base.x - current.pan.x) * ratio - nextBase.x,
        y: y - (y - current.base.y - current.pan.y) * ratio - nextBase.y,
      };
      latest.current = {
        ...current,
        scale: next,
        pan: nextPan,
        base: nextBase,
      };
      setPan(nextPan);
      current.onZoom(next);
    };
    const wheel = (e: WheelEvent) => {
      if (
        !e.ctrlKey &&
        (e.target as Element).closest("[data-canvas-interactive]")
      )
        return;
      e.preventDefault();
      if (e.ctrlKey) {
        const rect = host.getBoundingClientRect();
        zoomAt(
          Math.exp(-e.deltaY * 0.01),
          e.clientX - rect.left,
          e.clientY - rect.top,
        );
      } else {
        const unit =
          e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? host.clientHeight : 1;
        setPan((p) => ({ x: p.x - e.deltaX * unit, y: p.y - e.deltaY * unit }));
      }
    };
    let gestureScale = 1;
    const start = (e: Event) => {
      e.preventDefault();
      gestureScale = 1;
    };
    const gesture = (event: Event) => {
      const e = event as Event & {
        scale: number;
        clientX: number;
        clientY: number;
      };
      e.preventDefault();
      const rect = host.getBoundingClientRect();
      zoomAt(
        e.scale / gestureScale,
        e.clientX - rect.left,
        e.clientY - rect.top,
      );
      gestureScale = e.scale;
    };
    host.addEventListener("wheel", wheel, { passive: false });
    host.addEventListener("gesturestart", start, { passive: false });
    host.addEventListener("gesturechange", gesture, { passive: false });
    return () => {
      host.removeEventListener("wheel", wheel);
      host.removeEventListener("gesturestart", start);
      host.removeEventListener("gesturechange", gesture);
    };
  }, [width, size.contentHeight]);
  return (
    <div
      ref={outer}
      className={`preview-scroll pan-canvas ${dragging ? "is-dragging" : ""}`}
      tabIndex={0}
      aria-label="Prototype canvas. Drag to pan, pinch to zoom. Arrow keys pan; use Fit preview to reset."
      onPointerDown={(e) => {
        if (e.button !== 0 || (e.target as Element).closest(interactive))
          return;
        e.preventDefault();
        e.currentTarget.focus();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
        setDragging(true);
      }}
      onPointerMove={(e) => {
        const last = drag.current;
        if (!last || last.id !== e.pointerId) return;
        const dx = e.clientX - last.x,
          dy = e.clientY - last.y;
        setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      }}
      onPointerUp={() => {
        drag.current = null;
        setDragging(false);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDragging(false);
      }}
      onLostPointerCapture={() => {
        drag.current = null;
        setDragging(false);
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        const d = (
          {
            ArrowLeft: [40, 0],
            ArrowRight: [-40, 0],
            ArrowUp: [0, 40],
            ArrowDown: [0, -40],
          } as Record<string, number[]>
        )[e.key];
        if (d) {
          e.preventDefault();
          setPan((p) => ({ x: p.x + d[0], y: p.y + d[1] }));
        }
      }}
    >
      <div
        ref={inner}
        className={`zoom-content canvas-world ${paired ? "paired" : ""}`}
        style={{
          width,
          transform: `translate(${base.x + pan.x}px, ${base.y + pan.y}px) scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
