"use client";

import { useLayoutEffect, useRef, useState } from "react";

export type PreviewFocus = "page" | "component" | "error";

export default function PreviewCanvas({
  children,
  zoom,
  viewport,
  paired,
  focus,
}: {
  children: React.ReactNode;
  zoom: number | "fit";
  viewport: string;
  paired: boolean;
  focus: PreviewFocus;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({
    width: 800,
    height: 600,
    contentHeight: 600,
  });
  useLayoutEffect(() => {
    const outer = scroll.current,
      inner = content.current;
    if (!outer || !inner) return;
    const measure = () =>
      setSize((old) => {
        const padding = getComputedStyle(outer);
        const next = {
          width: Math.max(
            1,
            outer.clientWidth -
              parseFloat(padding.paddingLeft) -
              parseFloat(padding.paddingRight),
          ),
          height: Math.max(
            1,
            outer.clientHeight -
              parseFloat(padding.paddingTop) -
              parseFloat(padding.paddingBottom),
          ),
          contentHeight: inner.offsetHeight,
        };
        return Object.keys(next).every(
          (k) => next[k as keyof typeof next] === old[k as keyof typeof old],
        )
          ? old
          : next;
      });
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(inner);
    measure();
    return () => observer.disconnect();
  }, []);
  const width = paired
    ? 1180
    : viewport === "mobile"
      ? Math.min(340, size.width)
      : Math.min(focus === "page" ? 920 : 560, size.width);
  const scale =
    zoom === "fit"
      ? Math.max(
          0.25,
          Math.min(
            1,
            size.width / width,
            size.height / Math.max(size.contentHeight, 1),
          ),
        )
      : zoom;
  return (
    <div
      className="preview-scroll"
      ref={scroll}
      tabIndex={0}
      aria-label="Scrollable prototype preview"
    >
      <div
        className="zoom-layout"
        style={{ width: width * scale, minHeight: size.contentHeight * scale }}
      >
        <div
          className={`zoom-content ${paired ? "paired" : ""}`}
          ref={content}
          style={{ width, zoom: scale }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
