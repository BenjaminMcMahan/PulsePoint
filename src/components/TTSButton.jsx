import { useState, useEffect, useRef } from "react";
import { Play, Pause, Square } from "lucide-react";

export default function TTSButton({ getText }) {
  const [state, setState] = useState("idle"); // idle | playing | paused
  const uttRef = useRef(null);

  // Cancel on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  // iOS Safari workaround: speech synthesis can silently stop mid-utterance
  // Keep a heartbeat that resumes it if it pauses unexpectedly
  useEffect(() => {
    if (state !== "playing") return;
    const interval = setInterval(() => {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      // Detect if speech ended without triggering onend
      if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
        setState("idle");
      }
    }, 500);
    return () => clearInterval(interval);
  }, [state]);

  const stop = () => {
    window.speechSynthesis.cancel();
    uttRef.current = null;
    setState("idle");
  };

  const handlePress = () => {
    if (state === "playing") {
      window.speechSynthesis.pause();
      setState("paused");
      return;
    }

    if (state === "paused") {
      window.speechSynthesis.resume();
      setState("playing");
      return;
    }

    // idle → start
    // Must be synchronous (no await) for iOS to allow speech
    const text = getText();
    if (!text?.trim()) return;

    window.speechSynthesis.cancel(); // clear queue first

    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.95;
    utt.onend = () => setState("idle");
    utt.onerror = () => setState("idle");
    uttRef.current = utt;

    // Small timeout needed on some Android browsers to let cancel() settle
    setTimeout(() => {
      window.speechSynthesis.speak(utt);
      setState("playing");
    }, 50);
  };

  if (state === "idle") {
    return (
      <button
        onClick={handlePress}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors text-xs font-medium"
        style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
        title="Read aloud"
      >
        <Play className="w-3.5 h-3.5" /> Read
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={handlePress}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-xs font-medium"
        style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
        title={state === "playing" ? "Pause" : "Resume"}
      >
        {state === "playing" ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        {state === "playing" ? "Pause" : "Resume"}
      </button>
      <button
        onClick={stop}
        className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors"
        style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
        title="Stop"
      >
        <Square className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}