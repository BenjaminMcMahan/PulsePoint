import { useState, useRef } from "react";
import { Play, Pause, Square, ChevronDown } from "lucide-react";
import { cleanTextForSpeech, splitIntoChunks } from "./TTSButton";
import { fmtSecondsInText } from "@/utils/formatSeconds";
import { base44 } from "@/api/base44Client";

const OAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

export default function TTSReader({ paragraphs, renderParagraph, sessionId }) {
  const [state, setState] = useState("idle"); // idle | buffering | playing | paused
  const [currentPara, setCurrentPara] = useState(-1);
  const [bufferingPara, setBufferingPara] = useState(-1); // which paragraph is currently fetching
  const [voice, setVoice] = useState(() => localStorage.getItem("tts_oai_voice") || "alloy");
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [speed, setSpeed] = useState(() => parseFloat(localStorage.getItem("tts_speed") || "1.0"));
  const speedRef = useRef(parseFloat(localStorage.getItem("tts_speed") || "1.0"));

  const stateRef = useRef("idle");
  const currentParaRef = useRef(-1);
  const audioCtxRef = useRef(null);
  const sourceRef = useRef(null);
  const remainingParasRef = useRef([]);
  const chunkQueueRef = useRef([]);
  const currentChunkRef = useRef(null); // the chunk currently playing/buffering
  const voiceRef = useRef(voice);
  // Generation counter: increment on every startFrom to cancel stale async chains
  const genRef = useRef(0);
  // Prefetch cache: chunk text → decoded AudioBuffer (keyed by gen+chunk for staleness)
  const prefetchCacheRef = useRef(new Map()); // key: `${gen}:${chunk}` → Promise<AudioBuffer>


  const getAudioCtx = () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtxRef.current;
  };

  const setS = (s) => { stateRef.current = s; setState(s); };
  const setCP = (i) => {
    currentParaRef.current = i;
    setCurrentPara(i);
    if (sessionId && i >= 0) localStorage.setItem(`tts_progress_${sessionId}`, String(i));
  };

  const stopSource = () => {
    if (sourceRef.current) { try { sourceRef.current.stop(); } catch (_) {} sourceRef.current = null; }
  };

  const stop = () => {
    genRef.current++; // invalidate any in-flight async chain
    stopSource();
    remainingParasRef.current = [];
    chunkQueueRef.current = [];
    currentChunkRef.current = null;
    prefetchCacheRef.current.clear();
    setBufferingPara(-1);
    setS("idle");
    setCP(-1);
  };

  const playNextChunk = async (gen) => {
    if (gen !== genRef.current) return; // stale call — a new startFrom has taken over
    if (stateRef.current !== "playing") return;

    if (chunkQueueRef.current.length > 0) {
      const chunk = chunkQueueRef.current.shift();
      currentChunkRef.current = chunk;
      await fetchAndPlay(chunk, gen);
      return;
    }

    if (remainingParasRef.current.length === 0) {
      setBufferingPara(-1);
      setS("idle");
      setCP(-1);
      return;
    }

    const idx = remainingParasRef.current.shift();
    setCP(idx);
    const text = paragraphs[idx] || "";
    chunkQueueRef.current = splitIntoChunks(cleanTextForSpeech(text));
    currentChunkRef.current = null;
    playNextChunk(gen);
  };

  // Fetch a chunk and decode it, using the prefetch cache when available.
  // Returns a decoded AudioBuffer or throws.
  const fetchDecoded = async (chunk, gen) => {
    const cacheKey = `${gen}:${chunk}`;
    if (prefetchCacheRef.current.has(cacheKey)) {
      return prefetchCacheRef.current.get(cacheKey);
    }
    // Start (or reuse) a pending promise so concurrent callers share the same fetch
    const promise = (async () => {
      const response = await base44.functions.invoke("openaiTTS", { text: chunk, voice: voiceRef.current, speed: speedRef.current });
      const base64 = response.data.audio;
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const ctx = getAudioCtx();
      return ctx.decodeAudioData(bytes.buffer.slice(0));
    })();
    prefetchCacheRef.current.set(cacheKey, promise);
    return promise;
  };

  // Fire-and-forget: prefetch the next chunk into the cache without blocking playback.
  const prefetchNext = (gen) => {
    // Peek at the next chunk in the queue (without shifting)
    let nextChunk = chunkQueueRef.current[0] ?? null;
    if (!nextChunk) {
      // Next will come from the next paragraph
      const nextParaIdx = remainingParasRef.current[0];
      if (nextParaIdx == null) return;
      const nextText = paragraphs[nextParaIdx] || "";
      const nextChunks = splitIntoChunks(cleanTextForSpeech(nextText));
      nextChunk = nextChunks[0] ?? null;
    }
    if (!nextChunk) return;
    const cacheKey = `${gen}:${nextChunk}`;
    if (!prefetchCacheRef.current.has(cacheKey)) {
      // Kick off background fetch; ignore errors (will retry on actual playback)
      fetchDecoded(nextChunk, gen).catch(() => {
        prefetchCacheRef.current.delete(cacheKey);
      });
    }
  };

  const fetchAndPlay = async (chunk, gen) => {
    if (gen !== genRef.current) return;
    if (stateRef.current !== "playing") return;

    setBufferingPara(currentParaRef.current);

    let decoded;
    try {
      decoded = await fetchDecoded(chunk, gen);
    } catch (err) {
      console.error("TTS fetch failed:", err);
      stop();
      return;
    }

    if (gen !== genRef.current) return;
    if (stateRef.current !== "playing") return;

    setBufferingPara(-1);

    const ctx = getAudioCtx();
    if (ctx.state === "suspended") await ctx.resume();

    if (gen !== genRef.current) return;

    const source = ctx.createBufferSource();
    source.buffer = decoded;
    source.connect(ctx.destination);
    source.onended = () => { sourceRef.current = null; playNextChunk(gen); };
    sourceRef.current = source;
    source.start(0);

    // Kick off background prefetch of the next chunk as soon as this one starts
    prefetchNext(gen);
  };

  const startFrom = async (paraIdx) => {
    genRef.current++; // cancel any in-flight chain immediately
    const gen = genRef.current;

    stopSource();
    prefetchCacheRef.current.clear();
    // Ensure AudioContext is running (may be suspended from a pause)
    const ctx = getAudioCtx();
    if (ctx.state === "suspended") await ctx.resume();

    chunkQueueRef.current = [];
    currentChunkRef.current = null;
    remainingParasRef.current = paragraphs.map((_, i) => i).filter(i => i > paraIdx);
    setCP(paraIdx);
    setS("playing");
    setBufferingPara(paraIdx);

    const text = paragraphs[paraIdx] || "";
    chunkQueueRef.current = splitIntoChunks(cleanTextForSpeech(text));
    playNextChunk(gen);
  };

  const handlePlayPause = async () => {
    if (state === "playing") {
      // Suspend the AudioContext to freeze playback at exact position
      const ctx = getAudioCtx();
      await ctx.suspend();
      setS("paused");
      return;
    }
    if (state === "buffering") {
      // Still fetching — cancel and mark paused; resume will re-fetch the same chunk
      genRef.current++;
      setBufferingPara(-1);
      setS("paused");
      return;
    }
    if (state === "paused") {
      const ctx = getAudioCtx();
      if (ctx.state === "suspended" && sourceRef.current) {
        // Audio is suspended mid-playback — just resume it
        await ctx.resume();
        setS("playing");
      } else {
        // Was paused during buffering — re-fetch the current chunk
        const gen = genRef.current;
        setS("playing");
        if (currentChunkRef.current) {
          await fetchAndPlay(currentChunkRef.current, gen);
        } else {
          await ctx.resume();
          playNextChunk(gen);
        }
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

  const changeSpeed = (v) => {
    speedRef.current = v;
    setSpeed(v);
    localStorage.setItem("tts_speed", String(v));
    prefetchCacheRef.current.clear();
    // If currently playing, restart from the current paragraph at new speed
    if (stateRef.current === "playing" || stateRef.current === "paused") {
      const para = currentParaRef.current >= 0 ? currentParaRef.current : 0;
      startFrom(para);
    }
  };

  const isActive = state === "playing" || state === "paused" || state === "buffering";
  const savedIdx = sessionId ? parseInt(localStorage.getItem(`tts_progress_${sessionId}`) || "-1", 10) : -1;

  return (
    <div className="space-y-1">
      {/* Controls */}
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        <button
          onClick={handlePlayPause}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 active:opacity-70 transition-colors text-xs font-medium select-none"
          style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
        >
          {state === "playing"
            ? <><Pause className="w-3.5 h-3.5" />Pause</>
            : state === "buffering"
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

        {/* Speed slider */}
        <div className="flex items-center gap-1.5 ml-1">
          <span className="text-[10px] text-muted-foreground w-6 text-right">{speed.toFixed(1)}x</span>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.25"
            value={speed}
            onChange={(e) => changeSpeed(parseFloat(e.target.value))}
            className="w-20 h-1 accent-primary cursor-pointer"
            style={{ accentColor: "hsl(var(--primary))" }}
          />
        </div>

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
        const isPlaying = currentPara === paraIdx && state === "playing";
        const isBuffering = bufferingPara === paraIdx && state !== "idle" && state !== "paused";

        if (renderParagraph) {
          return (
            <div
              key={paraIdx}
              className={isActive ? "cursor-pointer" : ""}
              onClick={() => isActive && startFrom(paraIdx)}
            >
              {renderParagraph(displayText, paraIdx, isPlaying, isBuffering)}
            </div>
          );
        }

        return (
          <p
            key={paraIdx}
            onClick={() => isActive && startFrom(paraIdx)}
            className={[
              "text-sm leading-relaxed pl-3 border-l-2 py-1 transition-all duration-200 flex items-center gap-2",
              isActive ? "cursor-pointer" : "",
              isPlaying ? "border-primary bg-primary/8 text-foreground font-medium rounded-r-md"
                : isBuffering ? "border-primary/60 bg-primary/5 text-foreground rounded-r-md"
                : "border-primary/30 text-foreground/80",
            ].join(" ")}
          >
            {isBuffering && (
              <span className="shrink-0 w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            )}
            {displayText}
          </p>
        );
      })}
    </div>
  );
}