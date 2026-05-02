import { useState, useEffect, useRef } from "react";
import { Play, Pause, Square, ChevronDown } from "lucide-react";
import { cleanTextForSpeech, splitIntoChunks } from "./TTSButton";
import { fmtSecondsInText } from "@/utils/formatSeconds";
import { getBestVoice, getEnglishVoices, resetVoiceCache } from "@/lib/ttsVoice";

/**
 * TTSReader — paragraph-aware TTS component using Web Audio (audio element).
 * 
 * Props:
 *   paragraphs: string[]  — array of paragraphs to read (displayed + spoken)
 *   renderParagraph?: (text, index, isActive) => ReactNode  — optional custom renderer
 * 
 * Features:
 *   - Highlights the currently-speaking paragraph
 *   - Tap any paragraph while playing to jump to it
 *   - Continues playing in background when app loses focus
 *   - Uses HTML audio element with speech synthesis fallback
 */
export default function TTSReader({ paragraphs, renderParagraph }) {
  const [state, setState] = useState("idle"); // idle | playing | paused
  const [currentPara, setCurrentPara] = useState(-1);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [availableVoices, setAvailableVoices] = useState([]);
  const [showVoicePicker, setShowVoicePicker] = useState(false);

  const stateRef = useRef("idle");
  const currentParaRef = useRef(-1);
  const audioRef = useRef(null);  // hidden audio element for playback
  const chunkQueueRef = useRef([]);      // chunks for current paragraph
  const remainingIdxRef = useRef([]);    // paragraph indices yet to speak
  const currentChunkRef = useRef(null);
  const selectedVoiceRef = useRef(null);

  const setS = (s) => { stateRef.current = s; setState(s); };
  const setCP = (i) => { currentParaRef.current = i; setCurrentPara(i); };

  // Load voices and restore saved preference from localStorage
  useEffect(() => {
    const loadVoices = () => {
      resetVoiceCache();
      const voices = getEnglishVoices();
      if (voices.length > 0) {
        setAvailableVoices(voices);
        // Restore saved voice preference
        const savedName = localStorage.getItem("tts_voice_name");
        if (savedName) {
          const match = voices.find(v => v.name === savedName);
          if (match) setSelectedVoice(match);
        }
      }
    };
    loadVoices();
    const t = setTimeout(loadVoices, 200);
    window.speechSynthesis?.addEventListener("voiceschanged", loadVoices);
    return () => {
      clearTimeout(t);
      window.speechSynthesis?.removeEventListener("voiceschanged", loadVoices);
    };
  }, []);

  // Keep selectedVoiceRef in sync
  useEffect(() => { selectedVoiceRef.current = selectedVoice; }, [selectedVoice]);

  useEffect(() => () => {
    if (audioRef.current) audioRef.current.pause();
    window.speechSynthesis?.cancel();
  }, []);

  // Initialize audio element for background playback
  useEffect(() => {
    if (!audioRef.current) {
      const audio = document.createElement("audio");
      audio.style.display = "none";
      document.body.appendChild(audio);
      audioRef.current = audio;
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, []);

  const speakNext = () => {
    if (stateRef.current !== "playing") return;

    // Speak remaining chunks of current paragraph first
    if (chunkQueueRef.current.length > 0) {
      const chunk = chunkQueueRef.current.shift();
      currentChunkRef.current = chunk;
      const utt = new SpeechSynthesisUtterance(chunk);
      const voice = selectedVoiceRef.current || getBestVoice();
      if (voice) utt.voice = voice;
      utt.lang = voice?.lang || "en-US";
      utt.rate = 0.92;
      utt.pitch = 1.0;
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

  const startFrom = (paraIdx, wordIdx = 0) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    if (audioRef.current) audioRef.current.pause();
    chunkQueueRef.current = [];
    currentChunkRef.current = null;
    
    // Set remaining paragraphs *after* the current one
    remainingIdxRef.current = paragraphs.map((_, i) => i).filter(i => i > paraIdx);
    setCP(paraIdx);
    setS("playing");
    
    // For current paragraph, skip to the specified word
    const text = paragraphs[paraIdx] || "";
    let chunkText = text;
    if (wordIdx > 0) {
      const words = text.split(/\s+/);
      if (wordIdx < words.length) {
        chunkText = words.slice(wordIdx).join(" ");
      }
    }
    chunkQueueRef.current = splitIntoChunks(cleanTextForSpeech(chunkText));
    setTimeout(() => speakNext(), 80);
  };

  const handlePlayPause = () => {
    if (!window.speechSynthesis) return;
    if (state === "playing") {
      // Pause: cancel speech but preserve queue
      window.speechSynthesis.cancel();
      if (audioRef.current) audioRef.current.pause();
      // Re-prepend the chunk that was interrupted so it replays on resume
      if (currentChunkRef.current) {
        chunkQueueRef.current = [currentChunkRef.current, ...chunkQueueRef.current];
        currentChunkRef.current = null;
      }
      setS("paused");
      return;
    }
    if (state === "paused") {
      setS("playing");
      // Resume from the re-prepended chunk
      setTimeout(() => speakNext(), 80);
      return;
    }
    // idle → start from beginning
    startFrom(0);
  };

  const stop = () => {
    window.speechSynthesis.cancel();
    if (audioRef.current) audioRef.current.pause();
    chunkQueueRef.current = [];
    remainingIdxRef.current = [];
    currentChunkRef.current = null;
    setS("idle");
    setCP(-1);
  };

  const isActive = state === "playing" || state === "paused";

  return (
    <div className="space-y-1">
      {/* Controls */}
      <div className="flex items-center gap-1 mb-2 flex-wrap">
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
            Tap any word to jump
          </span>
        )}
        {/* Voice picker — always show if any voices loaded */}
        {availableVoices.length > 0 && (
          <div className="relative ml-auto">
            <button
              onClick={() => setShowVoicePicker(v => !v)}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground text-[10px] select-none transition-colors"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              {selectedVoice ? selectedVoice.name.slice(0, 18) : "Auto voice"}
              <ChevronDown className="w-3 h-3" />
            </button>
            {showVoicePicker && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[200px] max-h-48 overflow-y-auto">
                <button
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors text-muted-foreground"
                  onClick={() => { setSelectedVoice(null); localStorage.removeItem("tts_voice_name"); setShowVoicePicker(false); }}
                >
                  Auto (best available)
                </button>
                {availableVoices.map((v) => (
                  <button
                    key={v.name}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors ${selectedVoice?.name === v.name ? "text-primary font-medium" : "text-foreground"}`}
                    onClick={() => { setSelectedVoice(v); localStorage.setItem("tts_voice_name", v.name); setShowVoicePicker(false); }}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Paragraphs */}
      {paragraphs.map((text, paraIdx) => {
        const displayText = fmtSecondsInText(text);
        const active = currentPara === paraIdx && state === "playing";
        const words = displayText.split(/(\s+)/);

        if (renderParagraph) {
          return (
            <div
              key={paraIdx}
              className={isActive ? "cursor-pointer" : ""}
            >
              {renderParagraph(displayText, paraIdx, active)}
            </div>
          );
        }

        return (
          <p
            key={paraIdx}
            className={[
              "text-sm leading-relaxed pl-3 border-l-2 py-1 transition-all duration-200",
              active
                ? "border-primary bg-primary/8 text-foreground font-medium rounded-r-md"
                : "border-primary/30 text-foreground/80",
            ].join(" ")}
          >
            {words.map((word, wordIdx) => {
              const isWhitespace = /^\s+$/.test(word);
              if (isWhitespace) return word;
              return (
                <span
                  key={wordIdx}
                  onClick={() => isActive && startFrom(paraIdx, words.slice(0, wordIdx).join("").trim().split(/\s+/).filter(w => w).length)}
                  className={isActive ? "cursor-pointer hover:bg-primary/20 rounded px-0.5 transition-colors" : ""}
                >
                  {word}
                </span>
              );
            })}
          </p>
        );
      })}
    </div>
  );
}