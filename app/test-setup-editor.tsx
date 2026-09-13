"use client";
import { DEMO_IDS } from "@/lib/demo/registry";
import GuidedPrompt from "./demo/guided-prompt";
import { testPrompts } from "@/lib/demo/prompts";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { scriptedTestSetup } from "@/lib/demo/test-setup";
import { testAudiences, type TestSetup } from "@/lib/test-setup";
export default function TestSetupEditor({
  value,
  onChange,
  canRetry,
  disabled,
}: {
  value: TestSetup;
  onChange: (value: TestSetup) => void;
  canRetry: boolean;
  disabled: boolean;
}) {
  const [prompt, setPrompt] = useState("");
  const [message, setMessage] = useState("");
  function change<K extends keyof TestSetup>(key: K, v: TestSetup[K]) {
    onChange({ ...value, [key]: v });
  }
  return (
    <div className="test-setup-editor">
      <div className="setup-ai" data-demo-id={DEMO_IDS.testSetupAgent}>
        <label htmlFor="setup-prompt">
          Set up with AI <span className="badge amber">Simulated</span>
        </label>
        <GuidedPrompt
          id="setup-prompt"
          label="Prompt to prepare a test"
          value={prompt}
          maxLength={600}
          onChange={setPrompt}
          prompts={testPrompts}
          disabled={disabled}
        />
        <Button
          variant="outline"
          disabled={disabled || !prompt.trim()}
          onClick={() => {
            onChange(scriptedTestSetup(prompt, canRetry));
            setMessage(
              !canRetry && /recover|retry|fail/i.test(prompt)
                ? "Draft prepared with successful upload. This version needs a Retry action before it can run a recovery test."
                : "Test draft prepared. Review the settings, then create your test.",
            );
          }}
        >
          <Sparkles size={15} />
          Prepare test
        </Button>
        {message && <p role="status">{message}</p>}
      </div>
      <label htmlFor="test-title">Test name</label>
      <Input
        id="test-title"
        maxLength={100}
        value={value.title}
        disabled={disabled}
        onChange={(e) => change("title", e.target.value)}
      />
      <div className="setup-options">
        <div>
          <label>Participants</label>
          <Select
            value={value.audience}
            disabled={disabled}
            onValueChange={(v) =>
              change("audience", v as TestSetup["audience"])
            }
          >
            <SelectTrigger aria-label="Test participant audience">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {testAudiences.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label>Test surface</label>
          <Select
            value={value.focus}
            disabled={disabled}
            onValueChange={(v) => change("focus", v as TestSetup["focus"])}
          >
            <SelectTrigger aria-label="Test surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="page">Full page</SelectItem>
              <SelectItem value="component">Component only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label>Viewport</label>
          <Select
            value={value.viewport}
            disabled={disabled}
            onValueChange={(v) =>
              change("viewport", v as TestSetup["viewport"])
            }
          >
            <SelectTrigger aria-label="Test viewport">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desktop">Desktop</SelectItem>
              <SelectItem value="mobile">Mobile</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label>Scenario</label>
          <Select
            value={value.scenario}
            disabled={disabled}
            onValueChange={(v) =>
              change("scenario", v as TestSetup["scenario"])
            }
          >
            <SelectTrigger aria-label="Test scenario">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="success">Successful upload</SelectItem>
              <SelectItem value="recovery" disabled={!canRetry}>
                Failure and retry
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <label htmlFor="test-instructions">
        Instructions before and during the test
      </label>
      <Textarea
        id="test-instructions"
        maxLength={1000}
        value={value.instructions}
        disabled={disabled}
        onChange={(e) => change("instructions", e.target.value)}
      />
      <label htmlFor="test-task">Task reminder during the test</label>
      <Textarea
        id="test-task"
        maxLength={300}
        value={value.task}
        disabled={disabled}
        onChange={(e) => change("task", e.target.value)}
      />
    </div>
  );
}
