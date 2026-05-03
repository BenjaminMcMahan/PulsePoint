import { useState, useRef } from "react";
import { Play, Pause, Square, ChevronDown } from "lucide-react";
import { cleanTextForSpeech, splitIntoChunks } from "./TTSButton";
import { fmtSecondsInText } from "@/utils/formatSeconds";
import { base44 } from "@/api/base44Client";

const OAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

/**
 * TTSReader — paragraph-aware TTS using OpenAI TTS API.
 * Highlights the currently-speaking paragraph.
 * Tap any paragraph while playing to jump to it.
 */
export default function TTSReader({ paragraphs, renderParagraph, sessionId }) {
  const [state, setState] = useState("idle"); // idle | loading | playing | paused
  const [currentPara, setCurrentPara] = useState(-1);
  const [voice, setVoice] = useState(() => localStorage.getItem("tts_oai_voice") || "alloy");
  const [showVoicePicker, setShowVoicePicker] = useState(false);

  const stateRef = useRef("idle");
  const currentParaRef = useRef(-1);
  const audioRef = useRef(null);
  const remainingParasRef = useRef([]); // paragraph indices yet to speak
  const chunkQueueRef = useRef([]);     // text chunks for current paragraph
  const voiceRef = useRef(voice);

  const setS = (s) => { stateRef.current = s; setState(s); };
  const setCP = (i) => { currentParaRef.current = i; setCurrentPara(i); if (sessionId && i >= 0) localStorage.setItem(`tts_progress_${sessionId}`, String(i)); };

  const stop = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
    remainingParasRef.current = [];
    chunkQueueRef.current = [];
    setS("idle");
    setCP(-1);
  };

  const playNextChunk = async () => {
    if (stateRef.current !== "playing") return;

    // If there are remaining chunks for the current paragraph, play the next one
    if (chunkQueueRef.current.length > 0) {
      const chunk = chunkQueueRef.current.shift();
      await fetchAndPlay(chunk);
      return;
    }

    // Advance to next paragraph
    if (remainingParasRef.current.length === 0) {
      setS("idle");
      setCP(-1);
      return;
    }

    const idx = remainingParasRef.current.shift();
    setCP(idx);
    const text = paragraphs[idx] || "";
    chunkQueueRef.current = splitIntoChunks(cleanTextForSpeech(text));
    playNextChunk();
  };

  const fetchAndPlay = async (chunk) => {
    if (stateRef.current !== "playing") return;
    const response = await base44.functions.invoke("openaiTTS", { text: chunk, voice: voiceRef.current });
    if (stateRef.current !== "playing") return;

    const base64 = response.data.audio;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);

    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = url;
    audioRef.current.onended = () => { URL.revokeObjectURL(url); playNextChunk(); };
    audioRef.current.onerror = () => { URL.revokeObjectURL(url); playNextChunk(); };
    await audioRef.current.play();
  };

  const startFrom = async (paraIdx) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
    chunkQueueRef.current = [];
    remainingParasRef.current = paragraphs.map((_, i) => i).filter(i => i > paraIdx);
    setCP(paraIdx);
    setS("playing");
    const text = paragraphs[paraIdx] || "";
    chunkQueueRef.current = splitIntoChunks(cleanTextForSpeech(text));
    playNextChunk();
  };

  const handlePlayPause = async () => {
    if (state === "playing") {
      if (audioRef.current) audioRef.current.pause();
      setS("paused");
      return;
    }
    if (state === "paused") {
      setS("playing");
      if (audioRef.current?.src && audioRef.current.paused) {
        audioRef.current.play();
      } else {
        playNextChunk();
      }
      return;
    }
    // idle → start
    await startFrom(0);
  };

  const changeVoice = (v) => {
    setVoice(v);
    voiceRef.current = v;
    localStorage.setItem("tts_oai_voice", v);
    setShowVoicePicker(false);
  };

  const isActive = state === "playing" || state === "paused";
  const savedIdx = sessionId ? parseInt(localStorage.getItem(`tts_progress_${sessionId}`) || "-1", 10) : -1;

  return (
    <div className="space-y-1">
      {/* Controls */}
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        <button
          onClick={handlePlayPause}
          disabled={state === "loading"}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 active:opacity-70 transition-colors text-xs font-medium select-none disabled:opacity-50"
          style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
        >
          {state === "loading"
            ? <><span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />Loading…</>
            : state === "playing"
              ? <><Pause className="w-3.5 h-3.5" />Pause</>
              : <><Play className="w-3.5 h-3.5" />{state === "idle" ? "Read" : "Resume"}</>}
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
          <span className="text-[10px] text-muted-foreground ml-1">Tap paragraph to jump</span>
        )}

        {/* Voice picker */}
        <div className="relative ml-auto">
          <button
            onClick={() => setShowVoicePicker(v => !v)}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground text-[10px] select-none transition-colors capitalize"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            {voice} <ChevronDown className="w-3 h-3" />
          </button>
          {showVoicePicker && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[120px]">
              {OAI_VOICES.map((v) => (
                <button
                  key={v}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors capitalize ${voice === v ? "text-primary font-medium" : "text-foreground"}`}
                  onClick={() => changeVoice(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Resume from saved position */}
      {sessionId && currentPara === -1 && state === "idle" && savedIdx >= 0 && savedIdx < paragraphs.length && (
        <button
          onClick={() => startFrom(savedIdx)}
          className="mb-2 text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 font-medium transition-colors"
        >
          Resume from paragraph {savedIdx + 1}
        </button>
      )}

      {/* Paragraphs */}
      {paragraphs.map((text, paraIdx) => {
        const displayText = fmtSecondsInText(text);
        const active = currentPara === paraIdx && state === "playing";

        if (renderParagraph) {
          return (
            <div
              key={paraIdx}
              className={isActive ? "cursor-pointer" : ""}
              onClick={() => isActive && startFrom(paraIdx)}
            >
              {renderParagraph(displayText, paraIdx, active)}
            </div>
          );
        }

        return (
          <p
            key={paraIdx}
            onClick={() => isActive && startFrom(paraIdx)}
            className={[
              "text-sm leading-relaxed pl-3 border-l-2 py-1 transition-all duration-200",
              isActive ? "cursor-pointer" : "",
              active ? "border-primary bg-primary/8 text-foreground font-medium rounded-r-md" : "border-primary/30 text-foreground/80",
            ].join(" ")}
          >
            {displayText}
          </p>
        );
      })}
    </div>
  );
}