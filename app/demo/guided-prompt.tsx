"use client";
import { useId, useRef, useState } from "react";
import { ArrowRightToLine, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { completeDemoPrompt, type DemoPrompt } from "@/lib/demo/prompts";

export default function GuidedPrompt({
  value,
  onChange,
  prompts,
  disabled = false,
  id,
  label,
  maxLength = 600,
}: {
  value: string;
  onChange: (value: string) => void;
  prompts: DemoPrompt[];
  disabled?: boolean;
  id?: string;
  label: string;
  maxLength?: number;
}) {
  const descriptionId = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [atEnd, setAtEnd] = useState(true);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const completion =
    focused && atEnd && !disabled && dismissed !== value
      ? completeDemoPrompt(value, prompts)
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
  return (
    <div className="guided-prompt">
      <div
        className="prompt-presets"
        role="group"
        aria-label="Demo prompt suggestions"
      >
        {prompts.map((prompt) => (
          <Button
            key={prompt.text}
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            title={prompt.text}
            onClick={() => accept(prompt.text)}
          >
            <Sparkles size={13} aria-hidden="true" />
            {prompt.label}
          </Button>
        ))}
      </div>
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
          placeholder="Start typing a prompt..."
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
          ? `Suggested prompt: ${suggestion}. Press Tab to accept or Escape to dismiss.`
          : "Choose a preset or type your own prompt."}
      </span>
    </div>
  );
}
