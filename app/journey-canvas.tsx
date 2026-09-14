"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { ArrowLeft, ArrowRight, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import NumberMarker from "@/components/number-marker";
import {
  autoJourneyPositions,
  journeyConnection,
  JOURNEY_NODE_HEIGHT,
  JOURNEY_NODE_WIDTH,
  type JourneyPosition,
  type JourneyStep,
} from "@/lib/journey";

const linkLabels = {
  none: "Not connected",
  ready: "Uploader · Ready",
  failed: "Uploader · Error",
  complete: "Uploader · Received",
};

export default function JourneyCanvas({
  steps,
  selected,
  layout,
  disabled,
  onSelect,
  onPositionChange,
  onReorder,
  onMoveEnd,
}: {
  steps: JourneyStep[];
  selected: string;
  layout: "auto" | "manual";
  disabled: boolean;
  onSelect: (id: string) => void;
  onPositionChange: (id: string, position: JourneyPosition, autoPositions: Record<string, JourneyPosition>) => void;
  onReorder: (from: number, to: number) => void;
  onMoveEnd: () => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; x: number; y: number; start: JourneyPosition; moved: boolean } | null>(null);
  const [width, setWidth] = useState(960);
  const [dragged, setDragged] = useState<string | null>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => setWidth(canvas.clientWidth));
    observer.observe(canvas);
    setWidth(canvas.clientWidth);
    return () => observer.disconnect();
  }, []);

  const autoPositions = autoJourneyPositions(steps, width);
  const positions = Object.fromEntries(steps.map((step) => [
    step.id,
    layout === "manual" ? step.position ?? autoPositions[step.id] : autoPositions[step.id],
  ])) as Record<string, JourneyPosition>;
  const connections = steps.slice(0, -1).map((step, index) => ({
    from: step.id,
    to: steps[index + 1].id,
    ...journeyConnection(positions[step.id], positions[steps[index + 1].id]),
  }));
  const worldWidth = Math.max(width, ...Object.values(positions).map((p) => p.x + JOURNEY_NODE_WIDTH + 24));
  const worldHeight = Math.max(280, ...Object.values(positions).map((p) => p.y + JOURNEY_NODE_HEIGHT + 24));

  function startDrag(event: PointerEvent<HTMLButtonElement>, step: JourneyStep) {
    if (disabled || event.button !== 0) return;
    drag.current = { id: step.id, x: event.clientX, y: event.clientY, start: positions[step.id], moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function dragNode(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (!current.moved && Math.hypot(dx, dy) < 4) return;
    current.moved = true;
    setDragged(current.id);
    onPositionChange(current.id, {
      x: Math.max(0, Math.round(current.start.x + dx)),
      y: Math.max(0, Math.round(current.start.y + dy)),
    }, autoPositions);
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
    setDragged(null);
    if (current?.moved) onMoveEnd();
  }

  return (
    <div ref={canvasRef} className="journey-canvas" tabIndex={0} aria-label="Journey map; steps connect in order">
      <div className="journey-canvas-world" style={{ width: worldWidth, height: worldHeight }}>
        <svg className="journey-connections" width={worldWidth} height={worldHeight} viewBox={`0 0 ${worldWidth} ${worldHeight}`} aria-hidden="true">
          {connections.map((connection) => (
            <path key={`${connection.from}-${connection.to}`} d={connection.path} />
          ))}
        </svg>
        <ol className="journey-track" aria-label="Journey steps">
          {steps.map((step, index) => {
            const ports = new Set(connections.flatMap((connection) => [
              ...(connection.from === step.id ? [connection.sourcePort] : []),
              ...(connection.to === step.id ? [connection.targetPort] : []),
            ]));
            return (
              <li
                key={step.id}
                className={`journey-step ${step.id === selected ? "selected" : ""} ${dragged === step.id ? "dragging" : ""}`}
                style={{ left: positions[step.id].x, top: positions[step.id].y }}
              >
                {Array.from(ports).map((port) => <span key={port} className={`journey-port journey-port--${port}`} aria-hidden="true" />)}
                <div className="journey-step-tools">
                  <NumberMarker value={index + 1} variant="journey" selected={step.id === selected} />
                  <Button
                    variant="bare"
                    size="auto"
                    className="journey-grip"
                    disabled={disabled}
                    aria-label={`Move ${step.title} on canvas`}
                    title="Drag to move"
                    onPointerDown={(event) => startDrag(event, step)}
                    onPointerMove={dragNode}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  >
                    <GripVertical size={18} />
                  </Button>
                </div>
                <Button variant="bare" size="auto" className="journey-step-select" onClick={() => onSelect(step.id)} aria-pressed={step.id === selected}>
                  <strong>{step.title || "Untitled step"}</strong>
                  <span>{step.goal || "Goal not defined"}</span>
                  <small>{linkLabels[step.link]}</small>
                </Button>
                <div className="journey-step-tools journey-step-order">
                  <Button variant="bare" size="auto" disabled={disabled || index === 0} aria-label={`Move ${step.title} earlier`} title="Move earlier" onClick={() => onReorder(index, index - 1)}>
                    <ArrowLeft size={16} />
                  </Button>
                  <Button variant="bare" size="auto" disabled={disabled || index === steps.length - 1} aria-label={`Move ${step.title} later`} title="Move later" onClick={() => onReorder(index, index + 1)}>
                    <ArrowRight size={16} />
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
