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

  const handlePlay = () => {
    if (state === "paused") {
      window.speechSynthesis.resume();
      setState("playing");
      return;
    }
    window.speechSynthesis.cancel();
    const text = getText();
    if (!text) return;
    const utt = new SpeechSynthesisUtterance(text);
    utt.onend = () => setState("idle");
    utt.onerror = () => setState("idle");
    uttRef.current = utt;
    window.speechSynthesis.speak(utt);
    setState("playing");
  };

  const handlePause = () => {
    window.speechSynthesis.pause();
    setState("paused");
  };

  const handleStop = () => {
    window.speechSynthesis.cancel();
    setState("idle");
  };

  if (state === "playing" || state === "paused") {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={state === "playing" ? handlePause : handlePlay}
          className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          title={state === "playing" ? "Pause" : "Resume"}
        >
          {state === "playing" ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={handleStop}
          className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Stop"
        >
          <Square className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handlePlay}
      className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
      title="Read aloud"
    >
      <Play className="w-3.5 h-3.5" />
    </button>
  );
}