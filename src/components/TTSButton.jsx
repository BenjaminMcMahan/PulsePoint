import { useState, useEffect, useRef } from "react";
import { Play, Pause, Square } from "lucide-react";

export default function TTSButton({ getText }) {
  const [state, setState] = useState("idle"); // idle | playing | paused
  const uttRef = useRef(null);

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  // iOS heartbeat: keeps speech going if it silently pauses
  useEffect(() => {
    if (state !== "playing") return;
    const interval = setInterval(() => {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) setState("idle");
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

    // idle → play
    const text = getText();
    if (!text?.trim()) return;

    // Cancel any existing speech FIRST
    window.speechSynthesis.cancel();

    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = "en-US";
    utt.rate = 0.95;
    utt.volume = 1;
    utt.onstart = () => setState("playing");
    utt.onend = () => setState("idle");
    utt.onerror = (e) => {
      // "interrupted" fires when cancel() is called; not a real error
      if (e.error !== "interrupted") setState("idle");
    };
    uttRef.current = utt;

    // Android Chrome: speak() must be called in the SAME synchronous call stack
    // as the user event (no setTimeout). Call it directly here.
    window.speechSynthesis.speak(utt);

    // Android fallback: if onstart hasn't fired after 300ms, assume it's speaking
    const fallback = setTimeout(() => {
      if (state === "idle") setState("playing");
    }, 300);
    utt.onstart = () => { clearTimeout(fallback); setState("playing"); };
  };

  if (state === "idle") {
    return (
      <button
        onClick={handlePress}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 active:bg-muted/60 transition-colors text-xs font-medium select-none"
        style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
      >
        <Play className="w-3.5 h-3.5" /> Read
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={handlePress}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 active:bg-primary/30 transition-colors text-xs font-medium select-none"
        style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
      >
        {state === "playing" ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        {state === "playing" ? "Pause" : "Resume"}
      </button>
      <button
        onClick={stop}
        className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground active:bg-muted/60 transition-colors select-none"
        style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
      >
        <Square className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}