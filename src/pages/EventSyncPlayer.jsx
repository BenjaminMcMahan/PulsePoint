import { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Play, Pause, Square, Upload, Volume2, VolumeX, ChevronDown } from "lucide-react";
import { EVENT_CATEGORIES } from "@/components/session-form/EventTimelineSection";
import moment from "moment";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtMmSs(s) {
  const totalS = Math.round(Number(s));
  const m = Math.floor(totalS / 60);
  const sec = totalS % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function getCategoryMeta(value) {
  return EVENT_CATEGORIES.find((c) => c.value === value) || EVENT_CATEGORIES[EVENT_CATEGORIES.length - 1];
}

function getCategories(ev) {
  if (!ev.category) return ["other"];
  const arr = Array.isArray(ev.category) ? ev.category : [ev.category];
  const filtered = arr.filter((v) => typeof v === "string" && v && !["pause","resume","paused","resumed"].includes(v.toLowerCase()));
  return filtered.length ? filtered : ["other"];
}

function CategoryPill({ value }) {
  const meta = getCategoryMeta(value);
  return (
    <span className="inline-flex items-center rounded-full text-[9px] px-1.5 py-0 font-medium"
      style={{ background: meta.color + "22", color: meta.color, border: `1px solid ${meta.color}44` }}>
      {meta.label}
    </span>
  );
}

const OAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

// ── TTS fetch helper ──────────────────────────────────────────────────────────

async function fetchTTSBase64(text, voice, speed) {
  const cacheKey = `tts_cache:${voice}:${speed}:${text}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return cached;
  } catch (_) {}
  const res = await base44.functions.invoke("openaiTTS", { text, voice, speed });
  const b64 = res.data.audio;
  try { sessionStorage.setItem(cacheKey, b64); } catch (_) {}
  return b64;
}

async function decodeBase64ToAudioBuffer(ctx, b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return ctx.decodeAudioData(bytes.buffer.slice(0));
}

// ── EventCard ─────────────────────────────────────────────────────────────────

function EventCard({ ev, idx, isActive, isUpcoming, isFired, onJump }) {
  const cats = getCategories(ev);
  const primary = getCategoryMeta(cats[0]);
  return (
    <button
      onClick={() => onJump(ev.time_s)}
      className={`w-full text-left flex items-start gap-2 rounded-xl px-3 py-2.5 transition-all duration-300 border ${
        isActive
          ? "border-primary shadow-lg scale-[1.01]"
          : isUpcoming
          ? "border-border opacity-70"
          : "border-transparent opacity-40"
      }`}
      style={{
        background: isActive ? primary.color + "25" : primary.color + "0d",
        borderLeftColor: primary.color,
        borderLeftWidth: 3,
      }}
    >
      <div className="shrink-0 mt-0.5 font-mono text-[10px] font-bold w-10" style={{ color: primary.color }}>
        {fmtMmSs(ev.time_s)}
      </div>
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex flex-wrap gap-1">
          {cats.map((c) => <CategoryPill key={c} value={c} />)}
        </div>
        <p className={`text-sm leading-snug ${isActive ? "text-foreground font-medium" : "text-foreground/80"}`}>{ev.note}</p>
      </div>
      {isActive && (
        <span className="shrink-0 w-2 h-2 rounded-full bg-primary animate-pulse mt-1" />
      )}
    </button>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function EventSyncPlayer() {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(false);

  // Playback state
  const [playbackTime, setPlaybackTime] = useState(0); // seconds
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeEventIdx, setActiveEventIdx] = useState(-1);

  // Video
  const [videoSrc, setVideoSrc] = useState(null);
  const [videoMode, setVideoMode] = useState(false); // true when video loaded
  const videoRef = useRef(null);
  const videoUrlRef = useRef(null);

  // TTS
  const [voice, setVoice] = useState(() => localStorage.getItem("tts_oai_voice") || "alloy");
  const [speed] = useState(() => parseFloat(localStorage.getItem("tts_speed") || "1.0"));
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [showVoicePicker, setShowVoicePicker] = useState(false);

  // TTS playback internals
  const audioCtxRef = useRef(null);
  const ttsSourceRef = useRef(null);
  const firedEventsRef = useRef(new Set()); // event indices already spoken this playback
  const voiceRef = useRef(voice);
  const ttsEnabledRef = useRef(ttsEnabled);

  // Timer playback (no video)
  const timerRef = useRef(null);
  const timerStartRef = useRef(null); // real time when timer started
  const timerOffsetRef = useRef(0);  // playbackTime at timer start

  const events = (selectedSession?.event_timeline || []).slice().sort((a, b) => a.time_s - b.time_s);

  // ── Load sessions list ────────────────────────────────────────────────────

  useEffect(() => {
    base44.entities.Session.list("-date", 100).then(setSessions);
  }, []);

  // ── Sync voice/tts refs ───────────────────────────────────────────────────

  useEffect(() => { voiceRef.current = voice; }, [voice]);
  useEffect(() => { ttsEnabledRef.current = ttsEnabled; }, [ttsEnabled]);

  // ── AudioContext helper ───────────────────────────────────────────────────

  const getCtx = () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtxRef.current;
  };

  const stopTTS = () => {
    if (ttsSourceRef.current) { try { ttsSourceRef.current.stop(); } catch (_) {} ttsSourceRef.current = null; }
  };

  const speakEvent = useCallback(async (ev) => {
    if (!ttsEnabledRef.current) return;
    stopTTS();
    const text = ev.note;
    const ctx = getCtx();
    if (ctx.state === "suspended") await ctx.resume();
    const b64 = await fetchTTSBase64(text, voiceRef.current, speed);
    const buffer = await decodeBase64ToAudioBuffer(ctx, b64);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(0);
    ttsSourceRef.current = src;
  }, [speed]);

  // ── Check which event is active at current playback time ──────────────────

  const updateActiveEvent = useCallback((time) => {
    if (!events.length) return;
    let activeIdx = -1;
    for (let i = events.length - 1; i >= 0; i--) {
      if (time >= events[i].time_s) { activeIdx = i; break; }
    }
    setActiveEventIdx(activeIdx);

    // Speak newly passed events
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (time >= ev.time_s && !firedEventsRef.current.has(i)) {
        firedEventsRef.current.add(i);
        speakEvent(ev);
      }
    }
  }, [events, speakEvent]);

  // ── Timer-based playback (no video) ──────────────────────────────────────

  const startTimer = useCallback((fromTime) => {
    clearInterval(timerRef.current);
    timerStartRef.current = Date.now();
    timerOffsetRef.current = fromTime;
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - timerStartRef.current) / 1000;
      const t = timerOffsetRef.current + elapsed;
      setPlaybackTime(t);
      updateActiveEvent(t);
    }, 100);
  }, [updateActiveEvent]);

  const stopTimer = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  // ── Video time sync ───────────────────────────────────────────────────────

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    const onTimeUpdate = () => {
      const t = vid.currentTime;
      setPlaybackTime(t);
      updateActiveEvent(t);
    };
    vid.addEventListener("timeupdate", onTimeUpdate);
    return () => vid.removeEventListener("timeupdate", onTimeUpdate);
  }, [videoMode, updateActiveEvent]);

  // ── Play / Pause ──────────────────────────────────────────────────────────

  const handlePlayPause = async () => {
    if (videoMode && videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        stopTTS();
        setIsPlaying(false);
      } else {
        await videoRef.current.play();
        setIsPlaying(true);
      }
      return;
    }

    // Timer mode
    if (isPlaying) {
      stopTimer();
      stopTTS();
      setIsPlaying(false);
      timerOffsetRef.current = playbackTime;
    } else {
      startTimer(playbackTime);
      setIsPlaying(true);
    }
  };

  const handleStop = () => {
    stopTimer();
    stopTTS();
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = 0; }
    setIsPlaying(false);
    setPlaybackTime(0);
    setActiveEventIdx(-1);
    firedEventsRef.current = new Set();
  };

  const handleJump = (time_s) => {
    firedEventsRef.current = new Set(
      events.map((_, i) => i).filter((i) => events[i].time_s < time_s)
    );
    if (videoMode && videoRef.current) {
      videoRef.current.currentTime = time_s;
    } else {
      setPlaybackTime(time_s);
      if (isPlaying) {
        startTimer(time_s);
      }
    }
    updateActiveEvent(time_s);
  };

  // ── Session select ────────────────────────────────────────────────────────

  const selectSession = async (id) => {
    handleStop();
    setLoadingSession(true);
    const sess = sessions.find((s) => s.id === id);
    setSelectedSession(sess || null);
    setLoadingSession(false);
  };

  // ── Video load ────────────────────────────────────────────────────────────

  const handleVideoFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    const url = URL.createObjectURL(file);
    videoUrlRef.current = url;
    setVideoSrc(url);
    setVideoMode(true);
    handleStop();
  };

  const clearVideo = () => {
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    videoUrlRef.current = null;
    setVideoSrc(null);
    setVideoMode(false);
    handleStop();
  };

  // cleanup
  useEffect(() => () => { stopTimer(); stopTTS(); if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current); }, []);

  // ── Scrubber ──────────────────────────────────────────────────────────────

  const maxTime = selectedSession?.duration_minutes ? selectedSession.duration_minutes * 60 : (events.length ? events[events.length - 1].time_s + 30 : 600);

  const handleScrub = (e) => {
    const t = Number(e.target.value);
    firedEventsRef.current = new Set(
      events.map((_, i) => i).filter((i) => events[i].time_s < t)
    );
    if (videoMode && videoRef.current) {
      videoRef.current.currentTime = t;
    } else {
      setPlaybackTime(t);
      if (isPlaying) startTimer(t);
    }
    updateActiveEvent(t);
  };

  const pct = maxTime > 0 ? (playbackTime / maxTime) * 100 : 0;

  return (
    <div className="px-4 py-6 pb-28 space-y-5 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Event Sync Player</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Play a session timeline with TTS event narration, synced to a timer or local video.</p>
      </div>

      {/* Session selector */}
      <div className="bg-card rounded-xl border border-border p-4 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-primary">Select Session</h2>
        <div className="relative">
          <select
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary appearance-none pr-8"
            value={selectedSession?.id || ""}
            onChange={(e) => selectSession(e.target.value)}
          >
            <option value="">— choose a session —</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {moment(s.date).format("MMM D, YYYY")}
                {s.duration_minutes ? ` · ${s.duration_minutes}min` : ""}
                {(s.event_timeline?.length) ? ` · ${s.event_timeline.length} events` : ""}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
        {loadingSession && <p className="text-xs text-muted-foreground">Loading…</p>}
        {selectedSession && !events.length && (
          <p className="text-xs text-muted-foreground">This session has no event timeline entries.</p>
        )}
      </div>

      {/* Video loader */}
      <div className="bg-card rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-primary">Local Video (optional)</h2>
          {videoMode && (
            <button onClick={clearVideo} className="text-[10px] text-destructive hover:opacity-70">Remove</button>
          )}
        </div>
        {!videoMode ? (
          <label className="flex items-center gap-2 cursor-pointer border border-dashed border-border rounded-lg px-4 py-3 hover:bg-muted/40 transition-colors">
            <Upload className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Load video file…</span>
            <input type="file" accept="video/*" className="hidden" onChange={handleVideoFile} />
          </label>
        ) : (
          <video
            ref={videoRef}
            src={videoSrc}
            className="w-full rounded-lg max-h-64 bg-black"
            controls={false}
            playsInline
          />
        )}
        {!videoMode && (
          <p className="text-[10px] text-muted-foreground">Video stays local — not uploaded anywhere. Events will narrate at their timestamps during playback.</p>
        )}
      </div>

      {/* Playback controls */}
      {selectedSession && (
        <div className="bg-card rounded-xl border border-border p-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handlePlayPause}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition-colors"
            >
              {isPlaying ? <><Pause className="w-4 h-4" />Pause</> : <><Play className="w-4 h-4" />Play</>}
            </button>
            <button
              onClick={handleStop}
              className="p-2 rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <Square className="w-4 h-4" />
            </button>

            {/* TTS toggle */}
            <button
              onClick={() => setTtsEnabled((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${ttsEnabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
              title={ttsEnabled ? "TTS On" : "TTS Off"}
            >
              {ttsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              TTS
            </button>

            {/* Voice picker */}
            <div className="relative">
              <button
                onClick={() => setShowVoicePicker((v) => !v)}
                className="flex items-center gap-1 px-2 py-2 rounded-lg bg-muted text-muted-foreground hover:text-foreground text-xs capitalize transition-colors"
              >
                {voice} <ChevronDown className="w-3 h-3" />
              </button>
              {showVoicePicker && (
                <div className="absolute left-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[100px]">
                  {OAI_VOICES.map((v) => (
                    <button key={v} className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted capitalize transition-colors ${voice === v ? "text-primary font-medium" : "text-foreground"}`}
                      onClick={() => { setVoice(v); voiceRef.current = v; localStorage.setItem("tts_oai_voice", v); setShowVoicePicker(false); }}>
                      {v}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <span className="font-mono text-sm text-muted-foreground ml-auto">{fmtMmSs(playbackTime)}</span>
          </div>

          {/* Scrubber */}
          <div className="space-y-1">
            <input
              type="range"
              min={0}
              max={maxTime}
              step={0.5}
              value={playbackTime}
              onChange={handleScrub}
              className="w-full h-1.5 accent-primary cursor-pointer"
              style={{ accentColor: "hsl(var(--primary))" }}
            />
            {/* Event tick marks */}
            <div className="relative h-2">
              {events.map((ev, i) => {
                const cats = getCategories(ev);
                const color = getCategoryMeta(cats[0]).color;
                return (
                  <button
                    key={i}
                    onClick={() => handleJump(ev.time_s)}
                    className="absolute top-0 w-1 h-2 rounded-full transform -translate-x-0.5 opacity-80 hover:opacity-100 hover:scale-150 transition-all"
                    style={{ left: `${(ev.time_s / maxTime) * 100}%`, background: color }}
                    title={`${fmtMmSs(ev.time_s)} — ${ev.note}`}
                  />
                );
              })}
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground">
              <span>0:00</span>
              <span>{fmtMmSs(maxTime)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Event list */}
      {selectedSession && events.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-primary">Event Timeline</h2>
          <p className="text-[10px] text-muted-foreground">Events are read aloud by TTS when playback reaches their timestamp. Tap any event to jump there.</p>
          <div className="space-y-2">
            {events.map((ev, i) => (
              <EventCard
                key={i}
                ev={ev}
                idx={i}
                isActive={i === activeEventIdx}
                isUpcoming={i > activeEventIdx}
                isFired={i < activeEventIdx}
                onJump={handleJump}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}