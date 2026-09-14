"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AudioLines, Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

type RecognitionResult = { isFinal: boolean; [index: number]: { transcript: string } };
type RecognitionEvent = { results: ArrayLike<RecognitionResult> };
type RecognitionError = { error: string };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionError) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionConstructor = new () => Recognition;
type VoiceWindow = Window & {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
};
type Mode = "idle" | "dictation" | "chat" | "speaking";

function recognitionConstructor() {
  const browser = window as VoiceWindow;
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}
const subscribeBrowserCapability = () => () => {};
const browserSupportsRecognition = () => Boolean(recognitionConstructor());
const serverSupportsRecognition = () => false;

export default function PromptVoiceControls({
  value,
  onTranscript,
  onVoiceSubmit,
  disabled = false,
}: {
  value: string;
  onTranscript: (text: string) => void;
  onVoiceSubmit: (text: string) => string | Promise<string>;
  disabled?: boolean;
}) {
  const supported = useSyncExternalStore(subscribeBrowserCapability, browserSupportsRecognition, serverSupportsRecognition);
  const [mode, setMode] = useState<Mode>("idle");
  const [status, setStatus] = useState("");
  const recognition = useRef<Recognition | null>(null);
  const chatActive = useRef(false);

  useEffect(() => {
    return () => {
      chatActive.current = false;
      const active = recognition.current;
      recognition.current = null;
      active?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);

  function stop() {
    chatActive.current = false;
    const active = recognition.current;
    recognition.current = null;
    active?.abort();
    window.speechSynthesis?.cancel();
    setMode("idle");
    setStatus("Voice stopped.");
  }

  function listen(nextMode: "dictation" | "chat") {
    const Constructor = recognitionConstructor();
    if (!Constructor) {
      setStatus("Speech recognition is unavailable in this browser.");
      return;
    }
    const instance = new Constructor();
    recognition.current = instance;
    instance.lang = navigator.language || "en-US";
    instance.continuous = false;
    instance.interimResults = true;
    let transcript = "";
    let failed = false;
    const prefix = value.trim();
    instance.onresult = (event) => {
      transcript = Array.from(event.results)
        .filter((result) => result.isFinal)
        .map((result) => result[0]?.transcript.trim())
        .filter(Boolean)
        .join(" ");
      if (nextMode === "dictation" && transcript) onTranscript([prefix, transcript].filter(Boolean).join(" "));
    };
    instance.onerror = (event) => {
      failed = true;
      chatActive.current = false;
      setMode("idle");
      setStatus(event.error === "not-allowed" || event.error === "service-not-allowed"
        ? "Microphone permission was denied. Allow access in your browser and try again."
        : event.error === "no-speech" ? "No speech heard. Try again." : "Voice input stopped. Try again.");
    };
    instance.onend = async () => {
      if (recognition.current !== instance) return;
      recognition.current = null;
      if (failed || !chatActive.current && nextMode === "chat") return;
      if (nextMode === "dictation") {
        setMode("idle");
        setStatus(transcript ? "Added speech to the prompt." : "No speech heard. Try again.");
        return;
      }
      if (!transcript) {
        chatActive.current = false;
        setMode("idle");
        setStatus("No speech heard. Start voice chat to try again.");
        return;
      }
      onTranscript(transcript);
      setStatus("Preparing response...");
      try {
        const reply = await onVoiceSubmit(transcript);
        if (!chatActive.current) return;
        if (!reply.trim() || !window.speechSynthesis) {
          chatActive.current = false;
          setMode("idle");
          setStatus("Voice playback is unavailable. The response is on screen.");
          return;
        }
        const speech = new SpeechSynthesisUtterance(reply);
        speech.lang = navigator.language || "en-US";
        speech.onend = () => { if (chatActive.current) listen("chat"); };
        speech.onerror = () => {
          chatActive.current = false;
          setMode("idle");
          setStatus("Voice playback stopped. The response is on screen.");
        };
        setMode("speaking");
        setStatus("Speaking response. Voice chat will listen again afterward.");
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(speech);
      } catch {
        chatActive.current = false;
        setMode("idle");
        setStatus("Could not send that prompt. Try again.");
      }
    };
    try {
      instance.start();
      setMode(nextMode);
      setStatus(nextMode === "chat" ? "Voice chat listening. Speak your prompt." : "Listening. Speech will be added to the prompt.");
    } catch {
      recognition.current = null;
      chatActive.current = false;
      setMode("idle");
      setStatus("Could not start the microphone. Try again.");
    }
  }

  function toggleDictation() {
    if (mode !== "idle") { stop(); return; }
    listen("dictation");
  }

  function toggleChat() {
    if (mode !== "idle") { stop(); return; }
    chatActive.current = true;
    listen("chat");
  }

  return <div className="prompt-voice-controls">
    <div role="group" aria-label="Voice prompt controls">
      <Button type="button" variant="ghost" size="icon" disabled={!supported || disabled && mode === "idle"} aria-label={mode === "dictation" ? "Stop speech to text" : "Speech to text"} title={supported ? "Speech to text" : "Speech recognition unavailable in this browser"} aria-pressed={mode === "dictation"} onClick={toggleDictation}>{mode === "dictation" ? <Square size={16} /> : <Mic size={17} />}</Button>
      <Button type="button" variant="ghost" size="icon" disabled={!supported || disabled && mode === "idle"} aria-label={chatActive.current ? "Stop voice chat" : "Start voice chat"} title={supported ? "Voice chat" : "Speech recognition unavailable in this browser"} aria-pressed={chatActive.current} onClick={toggleChat}>{chatActive.current ? <Square size={16} /> : <AudioLines size={17} />}</Button>
    </div>
    {status && <span className="prompt-voice-status" role="status">{status}</span>}
  </div>;
}
