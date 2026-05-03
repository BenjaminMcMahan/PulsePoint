import { useState, useRef } from "react";
import { Play, Pause, Square, ChevronDown, Download } from "lucide-react";
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
  const [downloading, setDownloading] = useState(false);
  const [currentWordIdx, setCurrentWordIdx] = useState(-1); // index of highlighted word in current para
  const speedRef = useRef(parseFloat(localStorage.getItem("tts_speed") || "1.0"));

  const stateRef = useRef("idle");
  const currentParaRef = useRef(-1);
  const userPausedRef = useRef(false); // true only when the user explicitly paused
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
  const playbackTimeRef = useRef(0); // track playback time in seconds
  const chunkStartTimeRef = useRef(0); // AudioContext time when current chunk started
  const wordRefs = useRef(new Map()); // map of word element refs for auto-scroll
  const updateIntervalRef = useRef(null); // track update interval to clear it


  const getAudioCtx = () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Auto-resume if browser suspends context while we intend to be playing (not user-paused)
      ctx.addEventListener("statechange", () => {
        if (ctx.state === "suspended" && stateRef.current === "playing" && !userPausedRef.current) {
          ctx.resume().catch(() => {});
        }
      });
      audioCtxRef.current = ctx;
    }
    return audioCtxRef.current;
  };

  const setS = (s) => { stateRef.current = s; setState(s); };
  const setCP = (i) => {
    currentParaRef.current = i;
    setCurrentPara(i);
    setCurrentWordIdx(-1);
    playbackTimeRef.current = 0;
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
    if (updateIntervalRef.current) {
      clearInterval(updateIntervalRef.current);
      updateIntervalRef.current = null;
    }
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
    
    // Store chunk duration
    const chunkDuration = decoded.duration;
    let audioStartTime = null; // Will be set when audio actually starts
    
    source.onended = () => { 
      sourceRef.current = null;
      // Move to next chunk after this one finishes
      playNextChunk(gen);
    };
    sourceRef.current = source;
    
    // Clear previous interval if it exists
    if (updateIntervalRef.current) clearInterval(updateIntervalRef.current);
    
    // Track playback time during this chunk
    // Wait for audio to actually start playing before syncing to AudioContext time
    let hasStarted = false;
    let lastCtxTime = ctx.currentTime;
    
    updateIntervalRef.current = setInterval(() => {
      if (gen !== genRef.current || stateRef.current !== "playing") {
        clearInterval(updateIntervalRef.current);
        updateIntervalRef.current = null;
        return;
      }
      
      const currentCtxTime = ctx.currentTime;
      
      // Detect when audio actually starts (ctx.currentTime advances)
      if (!hasStarted && currentCtxTime > lastCtxTime) {
        hasStarted = true;
        audioStartTime = currentCtxTime;
      }
      
      lastCtxTime = currentCtxTime;
      
      // Only update highlighting after audio has started
      if (hasStarted && audioStartTime !== null) {
        const elapsed = currentCtxTime - audioStartTime;
        playbackTimeRef.current = Math.max(0, Math.min(elapsed, chunkDuration));
        updateWordHighlight();
      }
    }, 50);
    
    source.start(0);

    // Kick off background prefetch of the next chunk as soon as this one starts
    prefetchNext(gen);
  };

  const updateWordHighlight = () => {
    const paraIdx = currentParaRef.current;
    if (paraIdx < 0 || paraIdx >= paragraphs.length) return;
    
    const text = paragraphs[paraIdx];
    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length) return;
    
    // Estimate word index based on playback time (~120 WPM = 2 words/sec)
    const estimatedWordIdx = Math.floor(playbackTimeRef.current * 2);
    const boundedIdx = Math.max(0, Math.min(estimatedWordIdx, words.length - 1));
    
    // Update state with new index
    setCurrentWordIdx(boundedIdx);
    
    // Auto-scroll using requestAnimationFrame for better mobile performance
    requestAnimationFrame(() => {
      const wordKey = `word-${paraIdx}-${boundedIdx}`;
      const wordEl = wordRefs.current.get(wordKey);
      if (wordEl) {
        try {
          wordEl.scrollIntoView({ behavior: "auto", block: "center" });
        } catch (e) {
          // Silently handle scroll errors
        }
      }
    });
  };

  const startFrom = async (paraIdx) => {
    genRef.current++; // cancel any in-flight chain immediately
    const gen = genRef.current;
    userPausedRef.current = false;

    stopSource();
    prefetchCacheRef.current.clear();
    // Suspend then resume to immediately silence any audio still playing
    const ctx = getAudioCtx();
    if (ctx.state === "running") await ctx.suspend();
    if (gen !== genRef.current) return; // another startFrom raced us
    await ctx.resume();

    chunkQueueRef.current = [];
    currentChunkRef.current = null;
    remainingParasRef.current = paragraphs.map((_, i) => i).filter(i => i >= paraIdx);
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
      userPausedRef.current = true;
      const ctx = getAudioCtx();
      await ctx.suspend();
      setS("paused");
      return;
    }
    if (state === "buffering") {
      // Still fetching — cancel and mark paused; resume will re-fetch the same chunk
      userPausedRef.current = true;
      genRef.current++;
      setBufferingPara(-1);
      setS("paused");
      return;
    }
    if (state === "paused") {
      userPausedRef.current = false;
      const ctx = getAudioCtx();
      if (ctx.state === "suspended" && sourceRef.current) {
        // Audio is suspended mid-playback — resume the context first
        setS("playing"); // update state immediately
        await ctx.resume().catch(() => {}); // ensure context resumes even if it fails
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

  const downloadAudio = async () => {
    setDownloading(true);
    try {
      // Fetch all chunks for all paragraphs
      const allChunks = [];
      for (const para of paragraphs) {
        const cleaned = cleanTextForSpeech(para);
        const chunks = splitIntoChunks(cleaned);
        allChunks.push(...chunks);
      }

      console.log(`Starting download: ${allChunks.length} chunks`);

      // Fetch all audio buffers in parallel
      const buffers = await Promise.all(
        allChunks.map(chunk =>
          base44.functions.invoke("openaiTTS", { text: chunk, voice: voiceRef.current, speed: speedRef.current })
            .then(res => {
              const binary = atob(res.data.audio);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
              const ctx = getAudioCtx();
              return ctx.decodeAudioData(bytes.buffer.slice(0));
            })
        )
      );

      console.log(`Fetched ${buffers.length} audio buffers, combining...`);

      // Combine all buffers into one
      const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
      const ctx = getAudioCtx();
      const combined = ctx.createBuffer(1, totalLength, ctx.sampleRate);
      const data = combined.getChannelData(0);
      let offset = 0;
      for (const buf of buffers) {
        data.set(buf.getChannelData(0), offset);
        offset += buf.length;
      }

      console.log(`Combined buffer created, encoding to WAV...`);

      // Encode to WAV
      const samples = combined.getChannelData(0);
      const wavData = createWavHeader(samples, ctx.sampleRate);
      const wavBlob = new Blob([wavData], { type: "audio/wav" });
      const fileName = `tts-section-${Date.now()}.wav`;
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);

      // Save to library
      const file = new File([wavBlob], fileName, { type: "audio/wav" });
      const uploadRes = await base44.integrations.Core.UploadFile({ file });
      
      await base44.entities.AudioExport.create({
        title: fileName.replace(".wav", ""),
        file_url: uploadRes.file_url,
        duration_seconds: combined.duration,
        voice: voiceRef.current,
        speed: speedRef.current,
      });

      console.log("Download complete and saved to library");
      setDownloading(false);
    } catch (err) {
      console.error("Download failed:", err);
      setDownloading(false);
    }
  };

  const createWavHeader = (samples, sampleRate) => {
    const channels = 1;
    const bytesPerSample = 2;
    const frameLength = samples.length;
    const dataLength = frameLength * channels * bytesPerSample;
    
    // Create header
    const header = new ArrayBuffer(44);
    const view = new DataView(header);

    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * bytesPerSample, true);
    view.setUint16(32, channels * bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, dataLength, true);

    // Convert float samples to 16-bit PCM
    const pcmData = new Int16Array(frameLength);
    for (let i = 0; i < frameLength; i++) {
      pcmData[i] = samples[i] < 0 ? samples[i] * 0x8000 : samples[i] * 0x7FFF;
    }

    // Combine header + PCM data
    const wavFile = new Uint8Array(44 + dataLength);
    wavFile.set(new Uint8Array(header), 0);
    wavFile.set(new Uint8Array(pcmData.buffer), 44);
    
    return wavFile;
  };

  return (
    <>
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

        <button
          onClick={downloadAudio}
          disabled={downloading}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50 active:opacity-70 transition-colors text-xs font-medium select-none ml-auto"
          style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
          title="Download full section as WAV"
        >
          {downloading ? (
            <>
              <span className="w-3 h-3 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
              Downloading…
            </>
          ) : (
            <>
              <Download className="w-3.5 h-3.5" /> Download
            </>
          )}
        </button>

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
        const words = displayText.split(/\s+/).filter(Boolean);

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
              "text-sm leading-relaxed pl-3 border-l-2 py-1 transition-all duration-200 flex items-center gap-2 flex-wrap",
              isActive ? "cursor-pointer" : "",
              isPlaying ? "border-primary bg-primary/8 text-foreground font-medium rounded-r-md"
                : isBuffering ? "border-primary/60 bg-primary/5 text-foreground rounded-r-md"
                : "border-primary/30 text-foreground/80",
            ].join(" ")}
          >
            {isBuffering && (
              <span className="shrink-0 w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            )}
            {isPlaying ? (
              words.map((word, wordIdx) => {
                const key = `word-${paraIdx}-${wordIdx}`;
                const isHighlighted = wordIdx === currentWordIdx;
                return (
                  <span
                    key={key}
                    ref={(el) => {
                      if (el) {
                        wordRefs.current.set(key, el);
                      } else {
                        wordRefs.current.delete(key);
                      }
                    }}
                    className={isHighlighted ? "bg-primary text-primary-foreground font-bold px-1 rounded inline-block transition-all" : "inline-block"}
                  >
                    {word}
                  </span>
                );
              })
            ) : (
              displayText
            )}
          </p>
        );
      })}
    </div>

    {/* Floating play/pause button (bottom right) */}
    {isActive && (
      <button
        onClick={handlePlayPause}
        className="fixed bottom-6 right-6 flex items-center justify-center w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 active:opacity-70 transition-all z-40"
        style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
        title={state === "playing" ? "Pause" : "Resume"}
      >
        {state === "playing" || state === "buffering"
          ? <Pause className="w-5 h-5" />
          : <Play className="w-5 h-5" />}
      </button>
    )}
    </>
  );
}