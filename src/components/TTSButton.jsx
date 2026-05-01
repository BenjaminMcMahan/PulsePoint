import { useState, useEffect, useRef } from "react";
import { Play, Pause, Square } from "lucide-react";

// Convert large raw-second values to spoken minutes + seconds
function secondsToSpeech(n) {
  const sec = Math.round(Number(n));
  if (sec < 100) return `${sec} seconds`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0
    ? `${m} minute${m !== 1 ? 's' : ''}`
    : `${m} minute${m !== 1 ? 's' : ''} and ${s} seconds`;
}

// Clean text for natural speech
export function cleanTextForSpeech(text) {
  return text
    .replace(/•/g, ". ")
    .replace(/·/g, ". ")
    .replace(/–|—/g, ", ")
    .replace(/(\d+)\s*bpm/gi, "$1 beats per minute")
    // Convert "NNNs" or "NNN seconds" where NNN >= 100 into minutes+seconds
    .replace(/\b(\d{3,})\s*seconds\b/gi, (_, n) => secondsToSpeech(n))
    .replace(/\b(\d{3,})s\b/g, (_, n) => secondsToSpeech(n))
    .replace(/(\d+)\s*m(\d+)s/g, (_, m, s) => `${m} minute${m !== '1' ? 's' : ''} ${s} seconds`)
    .replace(/(\d+)\s*m(?=\b)/g, "$1 minutes")
    .replace(/(\d+)\s*s(?=\b)/g, "$1 seconds")
    .replace(/>=/g, " greater than or equal to ")
    .replace(/<=/g, " less than or equal to ")
    .replace(/>/g, " greater than ")
    .replace(/</g, " less than ")
    .replace(/±/g, " plus or minus ")
    .replace(/\+/g, " plus ")
    .replace(/\*/g, " times ")
    .replace(/%/g, " percent")
    .replace(/\/(?=\d)/g, " out of ")
    .replace(/→/g, " to ")
    .replace(/←/g, " from ")
    .replace(/≈/g, " approximately ")
    .replace(/~(\d)/g, "approximately $1")
    .replace(/\bHR\b/g, "heart rate")
    .replace(/\bhr\b/g, "heart rate")
    .replace(/\bavg\b/gi, "average")
    .replace(/\bmax\b/gi, "maximum")
    .replace(/\bmin\b/g, "minimum")
    .replace(/\bI:(\d+)/g, "intensity $1")
    .replace(/♥/g, "heart rate")
    .replace(/[#_*`]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Split text into chunks safe for Android (< 180 chars)
export function splitIntoChunks(text, maxLen = 180) {
  const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
  const chunks = [];
  let current = "";
  for (const s of sentences) {
    if ((current + s).length > maxLen) {
      if (current.trim()) chunks.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : [text];
}

/**
 * TTSButton — simple play/pause/stop button.
 * Uses cancel+re-queue instead of pause/resume for Android compatibility.
 * Includes background keepAlive to prevent Chrome from suspending speech.
 */
export default function TTSButton({ getText }) {
  const [state, setState] = useState("idle"); // idle | playing | paused
  const stateRef = useRef("idle");
  const queueRef = useRef([]);
  const keepAliveRef = useRef(null);

  const setS = (s) => { stateRef.current = s; setState(s); };

  useEffect(() => () => {
    clearInterval(keepAliveRef.current);
    window.speechSynthesis?.cancel();
  }, []);

  const stop = () => {
    clearInterval(keepAliveRef.current);
    queueRef.current = [];
    window.speechSynthesis.cancel();
    setS("idle");
  };

  const speakNext = () => {
    if (stateRef.current !== "playing") return;
    const chunk = queueRef.current.shift();
    if (!chunk) { setS("idle"); return; }

    const utt = new SpeechSynthesisUtterance(chunk);
    utt.lang = "en-US";
    utt.rate = 0.95;
    utt.volume = 1;
    utt.onend = () => speakNext();
    utt.onerror = (e) => {
      if (e.error !== "interrupted" && e.error !== "canceled") speakNext();
    };
    window.speechSynthesis.speak(utt);
  };

  // Background keepAlive: poll every 8s while blurred to restart stalled synthesis
  const startKeepAlive = () => {
    clearInterval(keepAliveRef.current);
    keepAliveRef.current = setInterval(() => {
      if (stateRef.current !== "playing") { clearInterval(keepAliveRef.current); return; }
      if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending && queueRef.current.length > 0) {
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
    };
  }, []); // eslint-disable-line

  const handlePress = () => {
    if (state === "playing") {
      // Android-safe pause: cancel and keep remaining queue intact
      clearInterval(keepAliveRef.current);
      window.speechSynthesis.cancel();
      setS("paused");
      return;
    }
    if (state === "paused") {
      setS("playing");
      setTimeout(() => speakNext(), 80);
      return;
    }
    // idle → start fresh
    const raw = getText?.();
    if (!raw?.trim()) return;
    window.speechSynthesis.cancel();
    queueRef.current = splitIntoChunks(cleanTextForSpeech(raw));
    setS("playing");
    setTimeout(() => speakNext(), 80);
  };

  if (state === "idle") {
    return (
      <button
        onClick={handlePress}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground active:opacity-70 transition-colors text-xs font-medium select-none"
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
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 active:opacity-70 transition-colors text-xs font-medium select-none"
        style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
      >
        {state === "playing" ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        {state === "playing" ? "Pause" : "Resume"}
      </button>
      <button
        onClick={stop}
        className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground active:opacity-70 transition-colors select-none"
        style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
      >
        <Square className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}