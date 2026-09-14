"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowRightToLine, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { completePrompt, type PromptSuggestion } from "@/lib/prompt-completion";

export default function GuidedPrompt({
  value,
  onChange,
  prompts,
  disabled = false,
  id,
  label,
  maxLength = 600,
  showPresets = true,
  placeholder = "Start typing a prompt...",
}: {
  value: string;
  onChange: (value: string) => void;
  prompts: readonly PromptSuggestion[];
  disabled?: boolean;
  id?: string;
  label: string;
  maxLength?: number;
  showPresets?: boolean;
  placeholder?: string;
}) {
  const descriptionId = useId();
  const presetsId = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const presetTrack = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [atEnd, setAtEnd] = useState(true);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [scrollEdges, setScrollEdges] = useState({ back: false, forward: false });
  const updateScrollEdges = useCallback(() => {
    const track = presetTrack.current;
    if (!track) return;
    const next = {
      back: track.scrollLeft > 1,
      forward: track.scrollLeft + track.clientWidth < track.scrollWidth - 1,
    };
    setScrollEdges((current) => current.back === next.back && current.forward === next.forward ? current : next);
  }, []);
  useEffect(() => {
    if (!showPresets || !presetTrack.current) return;
    const track = presetTrack.current;
    const observer = new ResizeObserver(updateScrollEdges);
    observer.observe(track);
    for (const child of track.children) observer.observe(child);
    return () => observer.disconnect();
  }, [showPresets, prompts, updateScrollEdges]);
  const completion =
    focused && atEnd && !disabled && dismissed !== value
      ? completePrompt(value, prompts)
      : "";
  const suggestion = completion.length <= maxLength ? completion : "";
  function accept(text: string) {
    onChange(text);
    setDismissed(null);
    requestAnimationFrame(() => {
      field.current?.focus();
      field.current?.setSelectionRange(text.length, text.length);
      setAtEnd(true);
    });
  }
  function scrollPresets(direction: -1 | 1) {
    const track = presetTrack.current;
    if (!track) return;
    track.scrollBy({
      left: direction * Math.max(160, track.clientWidth * 0.75),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }
  return (
    <div className="guided-prompt">
      {showPresets && (
        <div
          className="prompt-presets"
          role="group"
          aria-label="Suggested prompts"
        >
          <span className="prompt-presets-label">Try asking</span>
          <div className="prompt-presets-carousel">
            <Button type="button" variant="ghost" size="icon" aria-label="Previous suggested prompts" aria-controls={presetsId} title="Previous suggested prompts" disabled={disabled || !scrollEdges.back} onClick={() => scrollPresets(-1)}><ChevronLeft size={16} /></Button>
            <div id={presetsId} ref={presetTrack} className="prompt-presets-track" onScroll={updateScrollEdges}>
              {prompts.map((prompt) => (
                <Button
                  key={prompt.text}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || prompt.text.length > maxLength}
                  title={prompt.text}
                  onClick={() => accept(prompt.text)}
                >
                  <Sparkles size={13} aria-hidden="true" />
                  {prompt.label}
                </Button>
              ))}
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label="Next suggested prompts" aria-controls={presetsId} title="Next suggested prompts" disabled={disabled || !scrollEdges.forward} onClick={() => scrollPresets(1)}><ChevronRight size={16} /></Button>
          </div>
        </div>
      )}
      <div className="guided-input">
        <div ref={ghost} className="prompt-ghost" aria-hidden="true">
          <span>{value}</span>
          {suggestion.slice(value.length)}
        </div>
        <Textarea
          ref={field}
          id={id}
          value={value}
          aria-label={label}
          aria-autocomplete="inline"
          aria-describedby={descriptionId}
          disabled={disabled}
          maxLength={maxLength}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSelect={(e) =>
            setAtEnd(
              e.currentTarget.selectionStart === value.length &&
                e.currentTarget.selectionEnd === value.length,
            )
          }
          onChange={(e) => {
            onChange(e.target.value);
            setDismissed(null);
            setAtEnd(
              e.target.selectionStart === e.target.value.length &&
                e.target.selectionEnd === e.target.value.length,
            );
          }}
          onScroll={(e) => {
            if (ghost.current)
              ghost.current.scrollTop = e.currentTarget.scrollTop;
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (
              suggestion &&
              !e.shiftKey &&
              !e.ctrlKey &&
              !e.metaKey &&
              !e.altKey &&
              (e.key === "Tab" || e.key === "ArrowRight")
            ) {
              e.preventDefault();
              accept(suggestion);
            } else if (e.key === "Escape" && suggestion) {
              e.preventDefault();
              e.stopPropagation();
              setDismissed(value);
            } else if (
              e.key === "Enter" &&
              !e.shiftKey &&
              e.currentTarget.form
            ) {
              e.preventDefault();
              e.currentTarget.form.requestSubmit();
            }
          }}
        />
      </div>
      {suggestion && (
        <Button
          className="accept-prompt"
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => accept(suggestion)}
          title="Accept suggested completion (Tab)"
        >
          <ArrowRightToLine size={14} />
          Complete prompt
        </Button>
      )}
      <span id={descriptionId} className="sr-only" role="status">
        {suggestion
          ? `Suggested prompt: ${suggestion} Press Tab to accept or Escape to dismiss.`
          : showPresets ? "Choose a preset or type your own prompt." : "Type a prompt. Press Tab to accept a suggestion."}
      </span>
    </div>
  );
}
