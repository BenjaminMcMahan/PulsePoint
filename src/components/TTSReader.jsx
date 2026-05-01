import { useState, useEffect, useRef } from "react";
import { Play, Pause, Square } from "lucide-react";
import { cleanTextForSpeech, splitIntoChunks } from "./TTSButton";

/**
 * TTSReader — paragraph-aware TTS component.
 * 
 * Props:
 *   paragraphs: string[]  — array of paragraphs to read (displayed + spoken)
 *   renderParagraph?: (text, index, isActive) => ReactNode  — optional custom renderer
 * 
 * Features:
 *   - Highlights the currently-speaking paragraph
 *   - Tap any paragraph while playing to jump to it
 *   - Android-safe pause (cancel + re-queue) instead of pause/resume
 *   - Background keepAlive to survive window blur
 */
export default function TTSReader({ paragraphs, renderParagraph }) {
  const [state, setState] = useState("idle"); // idle | playing | paused
  const [currentPara, setCurrentPara] = useState(-1);

  const stateRef = useRef("idle");
  const currentParaRef = useRef(-1);
  const chunkQueueRef = useRef([]);      // chunks for current paragraph
  const remainingIdxRef = useRef([]);    // paragraph indices yet to speak
  const keepAliveRef = useRef(null);

  const setS = (s) => { stateRef.current = s; setState(s); };
  const setCP = (i) => { currentParaRef.current = i; setCurrentPara(i); };

  useEffect(() => () => {
    clearInterval(keepAliveRef.current);
    window.speechSynthesis?.cancel();
  }, []);

  // Background keepAlive
  const startKeepAlive = () => {
    clearInterval(keepAliveRef.current);
    keepAliveRef.current = setInterval(() => {
      if (stateRef.current !== "playing") { clearInterval(keepAliveRef.current); return; }
      if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
        speakNext();
      }
    }, 8000);
  };

  useEffect(() => {
    const onBlur = () => { if (stateRef.current === "playing") startKeepAlive(); };
    const onFocus = () => {
      clearInterval(keepAliveRef.current);
      if (stateRef.current === "playing" && !window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
        setTimeout(() => speakNext(), 150);
      }
    };
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      clearInterval(keepAliveRef.current);
    };
  }, []); // eslint-disable-line

  const speakNext = () => {
    if (stateRef.current !== "playing") return;

    // Speak remaining chunks of current paragraph first
    if (chunkQueueRef.current.length > 0) {
      const chunk = chunkQueueRef.current.shift();
      const utt = new SpeechSynthesisUtterance(chunk);
      utt.lang = "en-US";
      utt.rate = 0.95;
      utt.volume = 1;
      utt.onend = () => speakNext();
      utt.onerror = (e) => { if (e.error !== "interrupted" && e.error !== "canceled") speakNext(); };
      window.speechSynthesis.speak(utt);
      return;
    }

    // Advance to next paragraph
    if (remainingIdxRef.current.length === 0) {
      setS("idle");
      setCP(-1);
      return;
    }

    const idx = remainingIdxRef.current.shift();
    setCP(idx);
    const text = paragraphs[idx] || "";
    chunkQueueRef.current = splitIntoChunks(cleanTextForSpeech(text));
    speakNext();
  };

  const startFrom = (idx) => {
    clearInterval(keepAliveRef.current);
    window.speechSynthesis.cancel();
    chunkQueueRef.current = [];
    remainingIdxRef.current = paragraphs.map((_, i) => i).filter(i => i > idx);
    setCP(idx);
    setS("playing");
    // Speak the tapped paragraph immediately
    const text = paragraphs[idx] || "";
    chunkQueueRef.current = splitIntoChunks(cleanTextForSpeech(text));
    setTimeout(() => speakNext(), 80);
  };

  const handlePlayPause = () => {
    if (state === "playing") {
      // Android-safe pause
      clearInterval(keepAliveRef.current);
      window.speechSynthesis.cancel();
      // Keep chunkQueueRef and remainingIdxRef intact — resume will restart current paragraph
      chunkQueueRef.current = []; // restart current para from beginning (safest on Android)
      setS("paused");
      return;
    }
    if (state === "paused") {
      setS("playing");
      // Re-queue current paragraph from start, then remaining
      const cur = currentParaRef.current >= 0 ? currentParaRef.current : 0;
      remainingIdxRef.current = paragraphs.map((_, i) => i).filter(i => i > cur);
      chunkQueueRef.current = splitIntoChunks(cleanTextForSpeech(paragraphs[cur] || ""));
      setTimeout(() => speakNext(), 80);
      return;
    }
    // idle → start from beginning
    startFrom(0);
  };

  const stop = () => {
    clearInterval(keepAliveRef.current);
    window.speechSynthesis.cancel();
    chunkQueueRef.current = [];
    remainingIdxRef.current = [];
    setS("idle");
    setCP(-1);
  };

  const isActive = state === "playing" || state === "paused";

  return (
    <div className="space-y-1">
      {/* Controls */}
      <div className="flex items-center gap-1 mb-2">
        <button
          onClick={handlePlayPause}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 active:opacity-70 transition-colors text-xs font-medium select-none"
          style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
        >
          {state === "playing" ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          {state === "idle" ? "Read" : state === "playing" ? "Pause" : "Resume"}
        </button>
        {isActive && (
          <button
            onClick={stop}
            className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground active:opacity-70 transition-colors select-none"
            style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
          >
            <Square className="w-3.5 h-3.5" />
          </button>
        )}
        {isActive && (
          <span className="text-[10px] text-muted-foreground ml-1">
            Tap any paragraph to jump
          </span>
        )}
      </div>

      {/* Paragraphs */}
      {paragraphs.map((text, idx) => {
        const active = currentPara === idx && state === "playing";
        if (renderParagraph) {
          return (
            <div
              key={idx}
              onClick={() => isActive && startFrom(idx)}
              className={isActive ? "cursor-pointer" : ""}
            >
              {renderParagraph(text, idx, active)}
            </div>
          );
        }
        return (
          <p
            key={idx}
            onClick={() => isActive && startFrom(idx)}
            className={[
              "text-sm leading-relaxed pl-3 border-l-2 py-1 transition-all duration-200",
              active
                ? "border-primary bg-primary/8 text-foreground font-medium rounded-r-md"
                : "border-primary/30 text-foreground/80",
              isActive ? "cursor-pointer hover:border-primary/60 hover:bg-muted/40" : "",
            ].join(" ")}
          >
            {text}
          </p>
        );
      })}
    </div>
  );
}