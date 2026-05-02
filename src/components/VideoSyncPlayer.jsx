import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Play, Pause, Video, ChevronLeft, ChevronRight, Pencil, Trash2, Plus, Check, X, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid,
} from "recharts";
import { EVENT_CATEGORIES, normalizeCategoryArray } from "./session-form/EventTimelineSection";
import { base44 } from "@/api/base44Client";

function getCategoryMeta(value) {
  return EVENT_CATEGORIES.find((c) => c.value === value) || EVENT_CATEGORIES[EVENT_CATEGORIES.length - 1];
}

function fmtMmSs(totalSeconds) {
  const v = Math.round(Number(totalSeconds));
  const m = Math.floor(v / 60);
  const s = v % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const PHASE_LINES = [
  { key: "pre_climax_offset_s", label: "Pre", color: "#a855f7" },
  { key: "climax_offset_s",     label: "Climax", color: "#ef4444" },
  { key: "recovery_offset_s",   label: "Recovery", color: "#3b82f6" },
];

const EVENT_COLORS = [
  "#f59e0b", "#a855f7", "#10b981", "#f43f5e", "#0ea5e9",
  "#fb923c", "#84cc16", "#e879f9", "#34d399", "#f87171",
];

// Nearest HR from sorted chart data
function nearestHR(chartData, time_s) {
  if (!chartData.length) return null;
  let best = chartData[0];
  let bestDist = Math.abs(chartData[0].t - time_s);
  for (const pt of chartData) {
    const d = Math.abs(pt.t - time_s);
    if (d < bestDist) { bestDist = d; best = pt; }
  }
  return Math.round(best.hr);
}

// Events within ±windowSec of a playhead position
function nearbyEvents(events, currentSec, windowSec = 30) {
  return events
    .map((ev, i) => ({ ev, i, dist: Math.abs(ev.time_s - currentSec) }))
    .filter(({ dist }) => dist <= windowSec)
    .sort((a, b) => a.dist - b.dist);
}

function CategorySelector({ selected, onChange }) {
  const toggle = (val) => {
    onChange(selected.includes(val) ? selected.filter((v) => v !== val) : [...selected, val]);
  };
  return (
    <div className="flex flex-wrap gap-1">
      {EVENT_CATEGORIES.map((c) => {
        const active = selected.includes(c.value);
        return (
          <button key={c.value} type="button" onClick={() => toggle(c.value)}
            className="text-[9px] px-1.5 py-0.5 rounded-full border font-medium transition-all"
            style={active
              ? { background: c.color, color: "#fff", borderColor: c.color }
              : { background: c.color + "18", color: c.color, borderColor: c.color + "44" }
            }>{c.label}</button>
        );
      })}
    </div>
  );
}

export default function VideoSyncPlayer({ session, timelineRows }) {
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const [videoSrc, setVideoSrc] = useState(null);
  const [videoOffset, setVideoOffset] = useState(0);
  const [playheadS, setPlayheadS] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [zoomWindow, setZoomWindow] = useState(60);
  const [activeEventIdx, setActiveEventIdx] = useState(null);

  // Local mutable events list
  const [events, setEvents] = useState(session.event_timeline || []);

  // Edit state: idx of event being edited, or null
  const [editingIdx, setEditingIdx] = useState(null);
  const [editNote, setEditNote] = useState("");
  const [editCats, setEditCats] = useState([]);
  const [editMin, setEditMin] = useState("");
  const [editSec, setEditSec] = useState("");

  // Add-new state
  const [addingNew, setAddingNew] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [lastUsedCat, setLastUsedCat] = useState("stimulation");
  const [newCats, setNewCats] = useState([lastUsedCat]);
  const [newMin, setNewMin] = useState("");
  const [newSec, setNewSec] = useState("");

  const saveEvents = async (updated) => {
    const sorted = [...updated].sort((a, b) => a.time_s - b.time_s);
    setEvents(sorted);
    await base44.entities.Session.update(session.id, { event_timeline: sorted });
  };

  const startEdit = (ev, idx) => {
    setEditingIdx(idx);
    setEditNote(ev.note);
    setEditCats(normalizeCategoryArray(ev.category).length ? normalizeCategoryArray(ev.category) : ["other"]);
    setEditMin(String(Math.floor(ev.time_s / 60)));
    setEditSec(String(ev.time_s % 60));
  };

  const commitEdit = async () => {
    const m = parseInt(editMin, 10) || 0;
    const s = Math.min(59, parseInt(editSec, 10) || 0);
    const updated = events.map((ev, i) =>
      i === editingIdx ? { ...ev, time_s: m * 60 + s, note: editNote.trim() || ev.note, category: editCats } : ev
    );
    setEditingIdx(null);
    await saveEvents(updated);
  };

  const cancelEdit = () => setEditingIdx(null);

  const deleteEvent = async (idx) => {
    await saveEvents(events.filter((_, i) => i !== idx));
  };

  const commitAdd = async () => {
    if (!newNote.trim()) return;
    const m = parseInt(newMin, 10) || 0;
    const s = Math.min(59, parseInt(newSec, 10) || 0);
    const ev = { time_s: m * 60 + s, note: newNote.trim(), category: newCats };
    setLastUsedCat(newCats[0]);
    setAddingNew(false);
    setNewNote(""); setNewMin(""); setNewSec(""); setNewCats([newCats[0]]);
    await saveEvents([...events, ev]);
  };

  const startAddAtPlayhead = () => {
    if (videoRef.current && !videoRef.current.paused) videoRef.current.pause();
    setNewMin(String(Math.floor(playheadS / 60)));
    setNewSec(String(Math.round(playheadS % 60)));
    setNewCats([lastUsedCat]);
    setAddingNew(true);
  };

  const chartData = useMemo(() =>
    timelineRows.map((r) => ({
      t: Number(r.time_offset_s),
      hr: Math.round(Number(r.hr_smoothed || r.hr)),
    })),
    [timelineRows]
  );

  const maxT = chartData.length ? chartData[chartData.length - 1].t : (session.duration_minutes || 60) * 60;

  // Visible x-domain centered on playhead
  const xDomain = useMemo(() => {
    const half = zoomWindow / 2;
    const lo = Math.max(0, playheadS - half);
    const hi = Math.min(maxT, lo + zoomWindow);
    return [lo, hi];
  }, [playheadS, zoomWindow, maxT]);

  // Load local video file
  const handleFileLoad = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setVideoSrc(url);
  };

  // Sync video → playhead
  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const sessionTime = v.currentTime + videoOffset;
    setPlayheadS(sessionTime);
  }, [videoOffset]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.addEventListener("timeupdate", handleTimeUpdate);
    v.addEventListener("play", () => setIsPlaying(true));
    v.addEventListener("pause", () => setIsPlaying(false));
    v.addEventListener("loadedmetadata", () => setVideoDuration(v.duration));
    return () => {
      v.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, [handleTimeUpdate, videoSrc]);

  // Click on chart → seek video
  const handleChartClick = useCallback((data) => {
    if (!data?.activeLabel) return;
    const sessionT = Number(data.activeLabel);
    setPlayheadS(sessionT);
    const videoT = Math.max(0, sessionT - videoOffset);
    if (videoRef.current) {
      videoRef.current.currentTime = videoT;
    }
  }, [videoOffset]);

  // Click event note → seek to it
  const seekToEvent = (ev, idx) => {
    setActiveEventIdx(idx);
    setPlayheadS(ev.time_s);
    const videoT = Math.max(0, ev.time_s - videoOffset);
    if (videoRef.current) {
      videoRef.current.currentTime = videoT;
    }
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play(); else v.pause();
  };

  const stepFrames = (seconds) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, v.currentTime + seconds);
  };

  const setSpeed = (speed) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) videoRef.current.playbackRate = speed;
  };

  const handleTimelineScrub = (e) => {
    const v = videoRef.current;
    if (!v || !videoDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = frac * videoDuration;
  };

  // Nearby events relative to playhead
  const nearby = useMemo(() => nearbyEvents(events, playheadS, 30), [events, playheadS]);
  // eslint-disable-next-line no-unused-vars
  const currentHR = useMemo(() => nearestHR(chartData, playheadS), [chartData, playheadS]);

  // Chart: only show data in visible window
  const visibleChartData = useMemo(() => {
    const [lo, hi] = xDomain;
    return chartData.filter(d => d.t >= lo - 5 && d.t <= hi + 5);
  }, [chartData, xDomain]);

  if (!timelineRows.length && !events.length) return null;

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
          <Video className="w-4 h-4" /> Video Sync Player
        </h3>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary font-medium hover:bg-primary/20 transition-colors"
        >
          {videoSrc ? "Change Video" : "Load Local Video"}
        </button>
        <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileLoad} />
      </div>

      <div className="p-4 space-y-4">
        {/* Video player + side panels */}
        <div className="grid grid-cols-5 gap-4">
          {/* Video player - 3/5 width */}
          <div className="col-span-3 space-y-2">
        {videoSrc ? (
          <div className="space-y-2">
            <video
              ref={videoRef}
              src={videoSrc}
              className="w-full rounded-lg bg-black max-h-[70vh] object-contain"
              playsInline
            />
            {/* Video timeline scrubber */}
            {videoDuration > 0 && (
              <div className="space-y-1">
                <div
                  className="relative h-3 bg-muted rounded-full cursor-pointer group"
                  onClick={handleTimelineScrub}
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-primary rounded-full transition-none"
                    style={{ width: `${((videoRef.current?.currentTime || 0) / videoDuration) * 100}%` }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white border-2 border-primary rounded-full shadow -translate-x-1/2"
                    style={{ left: `${((videoRef.current?.currentTime || 0) / videoDuration) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-mono text-muted-foreground px-0.5">
                  <span>{fmtMmSs(videoRef.current?.currentTime || 0)}</span>
                  <span>{fmtMmSs(videoDuration)}</span>
                </div>
              </div>
            )}

            {/* Playback controls */}
            <div className="flex items-center gap-2">
              <button onClick={() => stepFrames(-10)} className="p-1.5 rounded-lg bg-muted hover:bg-muted/70 transition-colors" title="-10s">
                <SkipBack className="w-4 h-4" />
              </button>
              <button onClick={() => stepFrames(-5)} className="p-1.5 rounded-lg bg-muted hover:bg-muted/70 transition-colors" title="-5s">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={togglePlay} className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg bg-primary text-primary-foreground font-medium text-sm transition-colors hover:bg-primary/90">
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {isPlaying ? "Pause" : "Play"}
              </button>
              <button onClick={() => stepFrames(5)} className="p-1.5 rounded-lg bg-muted hover:bg-muted/70 transition-colors" title="+5s">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button onClick={() => stepFrames(10)} className="p-1.5 rounded-lg bg-muted hover:bg-muted/70 transition-colors" title="+10s">
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            {/* Playback speed */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider shrink-0">Speed:</span>
              {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${playbackSpeed === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
                >
                  {s}×
                </button>
              ))}
            </div>

            {/* Add event — right below controls */}
            {addingNew ? (
              <div className="rounded-lg px-3 py-2.5 space-y-2 bg-muted/40 border border-primary/30">
                <p className="text-[10px] font-semibold text-primary uppercase tracking-wider">New Event at {fmtMmSs(playheadS)}</p>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} value={newMin} onChange={(e) => setNewMin(e.target.value)}
                    placeholder="min" className="w-14 text-xs font-mono text-center bg-background border border-border rounded px-2 py-1" />
                  <span className="text-muted-foreground font-bold">:</span>
                  <input type="number" min={0} max={59} value={newSec} onChange={(e) => setNewSec(e.target.value)}
                    placeholder="sec" className="w-14 text-xs font-mono text-center bg-background border border-border rounded px-2 py-1" />
                </div>
                <CategorySelector selected={newCats} onChange={setNewCats} />
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitAdd(); } }}
                  placeholder="Describe the event…"
                  rows={2}
                  className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 resize-none"
                />
                <div className="flex gap-2">
                  <button onClick={commitAdd} className="flex items-center gap-1 text-[10px] px-3 py-1 rounded-lg bg-primary text-primary-foreground font-medium">
                    <Check className="w-3 h-3" /> Save
                  </button>
                  <button onClick={() => setAddingNew(false)} className="flex items-center gap-1 text-[10px] px-3 py-1 rounded-lg bg-muted text-muted-foreground font-medium">
                    <X className="w-3 h-3" /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={startAddAtPlayhead}
                className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-primary/10 text-primary font-semibold text-sm hover:bg-primary/20 transition-colors border border-primary/20"
              >
                <Plus className="w-4 h-4" /> Add Event at {fmtMmSs(playheadS)}
              </button>
            )}

            {/* Video offset alignment */}
            <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
              <span className="text-xs text-muted-foreground shrink-0">Video offset (session start align):</span>
              <input
                type="number"
                value={videoOffset}
                onChange={(e) => setVideoOffset(Number(e.target.value) || 0)}
                className="w-20 text-xs font-mono text-center bg-background border border-border rounded px-2 py-1 h-7"
                step="1"
              />
              <span className="text-xs text-muted-foreground">s</span>
              <span className="text-xs text-muted-foreground ml-auto">Video 0:00 = Session {fmtMmSs(videoOffset)}</span>
            </div>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-32 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
          >
            <Video className="w-8 h-8" />
            <span className="text-sm font-medium">Load local video file</span>
            <span className="text-xs">Syncs playhead with HR and events</span>
          </button>
        )}
          </div>

          {/* HR Timeline + Most Recent Events - 2/5 width */}
          <div className="col-span-2 space-y-3 flex flex-col max-h-[70vh] overflow-y-auto">
            {/* Add event form - first in sidebar */}
            {addingNew ? (
              <div className="rounded-lg px-3 py-2.5 space-y-2 bg-muted/40 border border-primary/30">
                <p className="text-[10px] font-semibold text-primary uppercase tracking-wider">New Event at {fmtMmSs(playheadS)}</p>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} value={newMin} onChange={(e) => setNewMin(e.target.value)}
                    placeholder="min" className="w-14 text-xs font-mono text-center bg-background border border-border rounded px-2 py-1" />
                  <span className="text-muted-foreground font-bold">:</span>
                  <input type="number" min={0} max={59} value={newSec} onChange={(e) => setNewSec(e.target.value)}
                    placeholder="sec" className="w-14 text-xs font-mono text-center bg-background border border-border rounded px-2 py-1" />
                </div>
                <CategorySelector selected={newCats} onChange={setNewCats} />
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitAdd(); } }}
                  placeholder="Describe the event…"
                  rows={2}
                  className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 resize-none"
                />
                <div className="flex gap-2">
                  <button onClick={commitAdd} className="flex items-center gap-1 text-[10px] px-3 py-1 rounded-lg bg-primary text-primary-foreground font-medium">
                    <Check className="w-3 h-3" /> Save
                  </button>
                  <button onClick={() => setAddingNew(false)} className="flex items-center gap-1 text-[10px] px-3 py-1 rounded-lg bg-muted text-muted-foreground font-medium">
                    <X className="w-3 h-3" /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={startAddAtPlayhead}
                className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-primary/10 text-primary font-semibold text-sm hover:bg-primary/20 transition-colors border border-primary/20"
              >
                <Plus className="w-4 h-4" /> Add Event at {fmtMmSs(playheadS)}
              </button>
            )}

            {/* HR Timeline */}
            {chartData.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">HR Timeline — click to seek</p>
                <div className="flex items-center gap-1 mb-1.5 flex-wrap">
                  <span className="text-[9px] text-muted-foreground">Zoom:</span>
                  {[30, 60, 120, 300].map((w) => (
                    <button
                      key={w}
                      onClick={() => setZoomWindow(w)}
                      className={`text-[9px] px-2 py-0.5 rounded font-medium transition-colors ${zoomWindow === w ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
                    >
                      {w < 60 ? `${w}s` : `${w / 60}m`}
                    </button>
                  ))}
                </div>
                <div className="h-48 cursor-pointer">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={visibleChartData}
                      margin={{ top: 8, right: 4, bottom: 0, left: -20 }}
                      onClick={handleChartClick}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                      <XAxis
                        dataKey="t"
                        type="number"
                        domain={xDomain}
                        tick={{ fontSize: 9 }}
                        tickFormatter={fmtMmSs}
                        tickCount={8}
                        allowDataOverflow
                      />
                      <YAxis tick={{ fontSize: 9 }} domain={["auto", "auto"]} />
                      <Tooltip
                        formatter={(val) => [`${val} bpm`, "HR"]}
                        labelFormatter={(v) => fmtMmSs(Math.round(Number(v)))}
                        contentStyle={{ fontSize: 11 }}
                      />

                      {/* Phase markers */}
                      {PHASE_LINES.map(({ key, label, color }) =>
                        session[key] != null ? (
                          <ReferenceLine key={key} x={session[key]} stroke={color} strokeWidth={1.5}
                            strokeDasharray="4 2"
                            label={{ value: label, fontSize: 7, fill: color, position: "top" }}
                          />
                        ) : null
                      )}

                      {/* Event markers */}
                      {events.map((ev, i) => {
                        const color = EVENT_COLORS[i % EVENT_COLORS.length];
                        return (
                          <ReferenceLine key={i} x={ev.time_s} stroke={color} strokeWidth={1.5}
                            strokeDasharray="2 3"
                            label={{ value: `E${i + 1}`, fontSize: 7, fill: color, position: "insideTopLeft" }}
                          />
                        );
                      })}

                      {/* Live playhead */}
                      <ReferenceLine
                        x={playheadS}
                        stroke="hsl(var(--foreground))"
                        strokeWidth={2}
                        label={{ value: "▶", fontSize: 10, fill: "hsl(var(--foreground))", position: "top" }}
                      />

                      <Line
                        type="monotone"
                        dataKey="hr"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Most Recent Events */}
            {events.length > 0 && (() => {
              const past = events
                .map((ev, i) => ({ ev, i, diff: playheadS - ev.time_s }))
                .filter(({ diff }) => diff >= 0)
                .sort((a, b) => a.diff - b.diff)
                .slice(0, 3);
              if (!past.length) return null;
              return (
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Most Recent</p>
                  {past.map(({ ev, i, diff }) => {
                    const color = EVENT_COLORS[i % EVENT_COLORS.length];
                    const cats = normalizeCategoryArray(ev.category);
                    const isCurrent = diff < 5;
                    return (
                      <button
                        key={i}
                        onClick={() => seekToEvent(ev, i)}
                        className="w-full text-left flex flex-col gap-1 rounded-lg px-3 py-2 transition-all text-sm"
                        style={{
                          background: isCurrent ? color + "30" : color + "1a",
                          borderLeft: `3px solid ${color}`,
                          outline: isCurrent ? `1px solid ${color}66` : "none",
                        }}
                      >
                        <span className="font-mono text-[10px] font-bold" style={{ color }}>
                          {fmtMmSs(ev.time_s)}
                        </span>
                        <div className="flex flex-wrap gap-1 mb-0.5">
                          {cats.map((c) => {
                            const meta = getCategoryMeta(c);
                            return (
                              <span key={c} className="text-[8px] px-1 rounded-full font-medium"
                                style={{ background: meta.color + "22", color: meta.color, border: `1px solid ${meta.color}44` }}>
                                {meta.label}
                              </span>
                            );
                          })}
                        </div>
                        <span className="text-xs text-foreground leading-tight">{ev.note}</span>
                        <span className="text-[9px] font-mono text-muted-foreground">
                          {diff < 1 ? "now" : `${Math.round(diff)}s ago`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Playhead status bar */}
        <div className="flex items-center gap-3 bg-muted/40 rounded-lg px-3 py-2">
          <span className="font-mono text-sm font-bold text-primary">{fmtMmSs(playheadS)}</span>
          <span className="text-xs text-muted-foreground">session time</span>
          {currentHR != null && (
            <>
              <div className="w-px h-4 bg-border" />
              <span className="font-mono text-sm font-bold text-chart-3">{currentHR} bpm</span>
            </>
          )}
        </div>

        {/* All event notes — full list */}
        {events.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              All Events ({events.length}) — nearby highlighted
            </p>
            {events.map((ev, i) => {
              const color = EVENT_COLORS[i % EVENT_COLORS.length];
              const cats = normalizeCategoryArray(ev.category);
              const dist = Math.abs(ev.time_s - playheadS);
              const isNearby = dist <= 30;
              const isCurrent = dist < 5;
              const isActive = activeEventIdx === i;
              const isEditing = editingIdx === i;

              if (isEditing) {
                return (
                  <div key={i} className="rounded-lg px-3 py-2.5 space-y-2"
                    style={{ background: color + "18", borderLeft: `3px solid ${color}` }}>
                    <div className="flex items-center gap-2">
                      <input type="number" min={0} value={editMin} onChange={(e) => setEditMin(e.target.value)}
                        className="w-14 text-xs font-mono text-center bg-background border border-border rounded px-2 py-1" />
                      <span className="text-muted-foreground font-bold">:</span>
                      <input type="number" min={0} max={59} value={editSec} onChange={(e) => setEditSec(e.target.value)}
                        className="w-14 text-xs font-mono text-center bg-background border border-border rounded px-2 py-1" />
                    </div>
                    <CategorySelector selected={editCats} onChange={setEditCats} />
                    <textarea
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      rows={2}
                      className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 resize-none"
                    />
                    <div className="flex gap-2">
                      <button onClick={commitEdit} className="flex items-center gap-1 text-[10px] px-3 py-1 rounded-lg bg-primary text-primary-foreground font-medium">
                        <Check className="w-3 h-3" /> Save
                      </button>
                      <button onClick={cancelEdit} className="flex items-center gap-1 text-[10px] px-3 py-1 rounded-lg bg-muted text-muted-foreground font-medium">
                        <X className="w-3 h-3" /> Cancel
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={i}
                  className="w-full text-left flex items-start gap-2 rounded-lg px-3 py-2 transition-all"
                  style={{
                    background: isActive || isCurrent ? color + "28" : isNearby ? color + "18" : color + "08",
                    borderLeft: `3px solid ${isNearby ? color : color + "55"}`,
                    outline: isCurrent ? `1px solid ${color}66` : "none",
                    opacity: isNearby ? 1 : 0.55,
                  }}
                >
                  <button onClick={() => seekToEvent(ev, i)} className="font-mono text-[11px] font-bold shrink-0 mt-0.5" style={{ color: isNearby ? color : color + "99" }}>
                    {fmtMmSs(ev.time_s)}
                  </button>
                  <button onClick={() => seekToEvent(ev, i)} className="flex-1 min-w-0 text-left">
                    <div className="flex flex-wrap gap-1 mb-0.5">
                      {cats.map((c) => {
                        const meta = getCategoryMeta(c);
                        return (
                          <span key={c} className="text-[9px] px-1.5 rounded-full font-medium"
                            style={{ background: meta.color + "22", color: meta.color, border: `1px solid ${meta.color}44` }}>
                            {meta.label}
                          </span>
                        );
                      })}
                    </div>
                    <span className="text-xs text-foreground leading-snug">{ev.note}</span>
                  </button>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1">
                      <button onClick={() => startEdit(ev, i)} className="text-muted-foreground hover:text-primary transition-colors p-0.5">
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button onClick={() => deleteEvent(i)} className="text-muted-foreground hover:text-destructive transition-colors p-0.5">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {dist < 1 ? "now" : isNearby ? `${Math.round(dist)}s ${ev.time_s < playheadS ? "ago" : "ahead"}` : fmtMmSs(ev.time_s)}
                    </span>
                    {nearestHR(chartData, ev.time_s) != null && (
                      <span className="text-[10px] font-mono font-bold text-primary/70">{nearestHR(chartData, ev.time_s)} bpm</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}