import { useState, useEffect, useRef } from "react";
import { Play, Pause, Square } from "lucide-react";

// Clean text for natural speech — replace symbols and units with spoken equivalents
function cleanTextForSpeech(text) {
  return text
    // Punctuation / bullets first
    .replace(/•/g, ". ")
    .replace(/·/g, ". ")
    .replace(/–|—/g, ", ")
    // HR / physiological units
    .replace(/(\d+)\s*bpm/gi, "$1 beats per minute")
    .replace(/(\d+)\s*m(\d+)s/g, (_, m, s) => `${m} minute${m !== '1' ? 's' : ''} ${s} seconds`)
    .replace(/(\d+)\s*m(?=\b)/g, "$1 minutes")
    .replace(/(\d+)\s*s(?=\b)/g, "$1 seconds")
    // Comparison symbols
    .replace(/>=/g, " greater than or equal to ")
    .replace(/<=/g, " less than or equal to ")
    .replace(/>/g, " greater than ")
    .replace(/</g, " less than ")
    // Common symbols
    .replace(/±/g, " plus or minus ")
    .replace(/\+/g, " plus ")
    .replace(/\*/g, " times ")
    .replace(/%/g, " percent")
    .replace(/\/(?=\d)/g, " out of ")
    .replace(/→/g, " to ")
    .replace(/←/g, " from ")
    .replace(/≈/g, " approximately ")
    .replace(/~(\d)/g, "approximately $1")
    // Abbreviations
    .replace(/\bHR\b/g, "heart rate")
    .replace(/\bhr\b/g, "heart rate")
    .replace(/\bavg\b/gi, "average")
    .replace(/\bmax\b/gi, "maximum")
    .replace(/\bmin\b/g, "minimum")
    .replace(/\bI:(\d+)/g, "intensity $1")
    .replace(/♥/g, "heart rate")
    // Remove leftover markdown-ish chars
    .replace(/[#_*`]/g, "")
    // Collapse extra whitespace
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Android Chrome silently drops long utterances — split into sentence chunks
function splitIntoChunks(text, maxLen = 200) {
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

export default function TTSButton({ getText }) {
  const [state, setState] = useState("idle"); // idle | playing | paused
  const queueRef = useRef([]);
  const pausedRef = useRef(false);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const stop = () => {
    queueRef.current = [];
    pausedRef.current = false;
    window.speechSynthesis.cancel();
    setState("idle");
  };

  const speakNext = () => {
    if (pausedRef.current) return;
    const chunk = queueRef.current.shift();
    if (!chunk) { setState("idle"); return; }

    const utt = new SpeechSynthesisUtterance(chunk);
    utt.lang = "en-US";
    utt.rate = 0.95;
    utt.volume = 1;
    utt.onend = () => speakNext();
    utt.onerror = (e) => {
      if (e.error === "interrupted") return;
      speakNext(); // skip bad chunk, continue
    };
    window.speechSynthesis.speak(utt);
  };

  const handlePress = () => {
    if (state === "playing") {
      pausedRef.current = true;
      window.speechSynthesis.pause();
      setState("paused");
      return;
    }

    if (state === "paused") {
      pausedRef.current = false;
      window.speechSynthesis.resume();
      // If resume doesn't work (Android bug), re-speak remaining queue
      setTimeout(() => {
        if (!window.speechSynthesis.speaking) speakNext();
      }, 200);
      setState("playing");
      return;
    }

    // idle → start
    const rawText = getText();
    if (!rawText?.trim()) return;

    const text = cleanTextForSpeech(rawText);
    window.speechSynthesis.cancel();
    queueRef.current = splitIntoChunks(text);
    pausedRef.current = false;
    setState("playing");
    // Small delay so cancel() settles before we start speaking
    setTimeout(() => speakNext(), 100);
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