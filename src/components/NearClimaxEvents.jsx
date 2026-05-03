import { useMemo, useState } from "react";
import { Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";

function fmtSec(s) {
  if (s == null) return "—";
  const v = Math.round(Math.abs(s));
  return v >= 60 ? `${Math.floor(v / 60)}m${v % 60}s` : `${v}s`;
}

function fmtMmSs(s) {
  const totalS = Math.round(Number(s));
  const m = Math.floor(totalS / 60);
  const sec = totalS % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// Keywords in event notes that corroborate a near-climax event
const NCE_KEYWORDS = [
  "tension", "tense", "tight", "tighten", "clench", "clench", "grip",
  "foot", "feet", "plant", "planting", "toe", "curl",
  "throb", "throb", "pulse", "pulsing", "twitch", "spasm",
  "edge", "edg", "near", "almost", "close", "threshold",
  "pressure", "build", "buildup", "surge", "wave", "rush",
  "intense", "intensity", "strong", "overwhelming",
  "breath", "breathing", "gasp", "hold",
  "shiver", "shak", "tremble",
];

function scoreEventNoteCorroboration(eventStartS, eventEndS, sessionEvents) {
  if (!sessionEvents || sessionEvents.length === 0) return 0;
  const windowS = 45; // look ±45s around the event
  let score = 0;
  for (const ev of sessionEvents) {
    const t = Number(ev.time_s);
    if (t < eventStartS - windowS || t > eventEndS + windowS) continue;
    // Proximity bonus — closer = higher weight
    const dist = Math.max(0, Math.min(Math.abs(t - eventStartS), Math.abs(t - eventEndS)));
    const proximityWeight = dist < 15 ? 2 : 1;
    const note = (ev.note || "").toLowerCase();
    const cats = Array.isArray(ev.category) ? ev.category : [ev.category].filter(Boolean);
    // Physical/sensation categories near event are mildly corroborating
    if (cats.some(c => ["physical", "sensation"].includes(c))) score += 1 * proximityWeight;
    // Keyword matches are strongly corroborating
    for (const kw of NCE_KEYWORDS) {
      if (note.includes(kw)) { score += 2 * proximityWeight; break; }
    }
  }
  return score;
}

export function detectNearClimaxEvents(rows, climaxOffsetS, preClimaxOffsetS, sessionEvents = []) {
  if (!rows || rows.length < 10) return [];

  // Smooth HR with a wider rolling average (±3 samples) to reduce noise
  const smoothed = rows.map((r, i) => {
    const win = rows.slice(Math.max(0, i - 3), i + 4);
    const avg = win.reduce((a, w) => a + Number(w.hr), 0) / win.length;
    return { t: Number(r.time_offset_s), hr: avg };
  });

  // Exclude everything from pre-climax marker (or 90s before climax) onward
  const excludeStart = climaxOffsetS != null
    ? (preClimaxOffsetS != null
        ? Math.min(preClimaxOffsetS, climaxOffsetS - 60)
        : climaxOffsetS - 90)
    : Infinity;

  // Session-wide HR stats for relative thresholds
  const allHRs = smoothed.filter(p => p.t < excludeStart).map(p => p.hr);
  if (allHRs.length < 10) return [];
  const sessionMinHR = Math.min(...allHRs);
  const sessionMaxHR = Math.max(...allHRs);
  const sessionHRRange = sessionMaxHR - sessionMinHR;

  // Dynamic thresholds
  const MIN_RISE_BPM = Math.max(7, sessionHRRange * 0.13);
  const MAX_RISE_BPM = sessionHRRange * 0.78; // not a full climax-level surge
  const RISE_WINDOW_S = 120;        // NCEs can build more slowly — allow up to 2 min ascent
  const SUSTAINED_THRESHOLD_S = 20; // HR must stay elevated for at least 20s (sustained, not spike)
  const SUSTAINED_TOLERANCE = 5;    // bpm below peak still counts as "elevated"
  const DROP_BPM = Math.max(5, MIN_RISE_BPM * 0.55);
  const SEARCH_DROP_S = 150;
  const MIN_DURATION_S = 25;        // longer minimum — filters out brief spikes
  const MAX_DURATION_S = 300;
  const COOLDOWN_S = 30;
  const MIN_CONFIDENCE = 2;         // minimum score to emit event (filters noise without corroborating events)

  const events = [];
  let lastEventEnd = -Infinity;
  let i = 0;

  while (i < smoothed.length - 5) {
    const { t: t0, hr: hr0 } = smoothed[i];

    if (t0 < lastEventEnd + COOLDOWN_S) { i++; continue; }
    if (t0 >= excludeStart) break;

    // Find local peak within RISE_WINDOW_S
    let peakIdx = i;
    let peakHr = hr0;
    for (let j = i + 1; j < smoothed.length; j++) {
      if (smoothed[j].t - t0 > RISE_WINDOW_S) break;
      if (smoothed[j].t >= excludeStart) break;
      if (smoothed[j].hr > peakHr) { peakHr = smoothed[j].hr; peakIdx = j; }
    }

    const rise = peakHr - hr0;
    if (rise < MIN_RISE_BPM || rise > MAX_RISE_BPM || peakIdx === i) { i++; continue; }

    const peakTime = smoothed[peakIdx].t;

    // KEY IMPROVEMENT: require sustained elevation, not just a momentary peak.
    // Count how long HR stays within SUSTAINED_TOLERANCE of peak after reaching it.
    let sustainedEndIdx = peakIdx;
    for (let j = peakIdx + 1; j < smoothed.length; j++) {
      if (smoothed[j].t - peakTime > 90) break;
      if (smoothed[j].hr >= peakHr - SUSTAINED_TOLERANCE) sustainedEndIdx = j;
    }
    const sustainedDuration = smoothed[sustainedEndIdx].t - peakTime;
    if (sustainedDuration < SUSTAINED_THRESHOLD_S) { i = peakIdx + 1; continue; }

    // Find descent after the sustained plateau
    let dropIdx = -1;
    for (let j = sustainedEndIdx + 1; j < smoothed.length; j++) {
      if (smoothed[j].t - peakTime > SEARCH_DROP_S) break;
      if (smoothed[j].hr <= peakHr - DROP_BPM) { dropIdx = j; break; }
    }
    if (dropIdx === -1) { i = peakIdx + 1; continue; }

    const eventDuration = smoothed[dropIdx].t - t0;
    if (eventDuration < MIN_DURATION_S || eventDuration > MAX_DURATION_S) { i++; continue; }

    // Reject if peak HR is essentially the session max (likely the actual climax, just unmarked)
    if (peakHr >= sessionMaxHR * 0.96) { i = dropIdx + 1; continue; }

    // Score confidence using nearby event notes
    const noteScore = scoreEventNoteCorroboration(t0, smoothed[dropIdx].t, sessionEvents);

    // Base confidence from HR signal strength
    const hrConfidence = Math.min(4, Math.floor((rise / MIN_RISE_BPM - 1) * 2) + Math.floor(sustainedDuration / 20));
    const totalConfidence = hrConfidence + noteScore;

    if (totalConfidence < MIN_CONFIDENCE) { i++; continue; }

    events.push({
      start_offset_s: t0,
      peak_offset_s: peakTime,
      end_offset_s: smoothed[dropIdx].t,
      base_hr: Math.round(hr0),
      peak_hr: Math.round(peakHr),
      rise_bpm: Math.round(rise),
      sustained_s: Math.round(sustainedDuration),
      duration_s: Math.round(eventDuration),
      confidence: Math.min(10, totalConfidence),
      note_corroborated: noteScore > 0,
    });

    lastEventEnd = smoothed[dropIdx].t;
    i = dropIdx + 1;
  }

  return events;
}

export default function NearClimaxEvents({ timelineRows, session, selectedIndex, onSelectIndex }) {
  const events = useMemo(
    () => detectNearClimaxEvents(timelineRows, session?.climax_offset_s, session?.pre_climax_offset_s, session?.event_timeline || []),
    [timelineRows, session]
  );

  if (!timelineRows.length) return null;

  const handleTap = (i) => {
    onSelectIndex?.(selectedIndex === i ? null : i);
  };

  return (
    <div className="space-y-3 pt-1">
      <h3 className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "hsl(var(--chart-3))" }}>
        <Zap className="w-3.5 h-3.5" /> Near-Climax Events
      </h3>

      {events.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No near-climax events detected in this session's HR data.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["Detected", events.length],
              ["Total Time", fmtSec(events.reduce((a, e) => a + e.duration_s, 0))],
              ["Avg Rise", `+${Math.round(events.reduce((a, e) => a + e.rise_bpm, 0) / events.length)} bpm`],
            ].map(([label, val]) => (
              <div key={label} className="bg-muted/50 rounded-lg p-2 text-center">
                <p className="text-lg font-bold font-mono">{val}</p>
                <p className="text-[9px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-muted-foreground italic">
            Tap an event to highlight it on the chart above
          </p>

          <div className="space-y-2">
            {events.map((ev, i) => {
              const isSelected = selectedIndex === i;
              return (
                <button
                  key={i}
                  onClick={() => handleTap(i)}
                  className="w-full text-left rounded-lg px-3 py-2.5 space-y-1.5 transition-all"
                  style={{
                    background: isSelected ? "hsl(var(--chart-3) / 0.2)" : "hsl(var(--chart-3) / 0.08)",
                    borderLeft: `3px solid hsl(var(--chart-3) / ${isSelected ? "1" : "0.5"})`,
                    outline: isSelected ? "1.5px solid hsl(var(--chart-3) / 0.5)" : "none",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold font-mono" style={{ color: "hsl(var(--chart-3))" }}>
                      Event {i + 1} — {fmtMmSs(ev.start_offset_s)}
                    </span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                      {fmtSec(ev.duration_s)}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      Base <strong className="text-foreground font-mono">{ev.base_hr}</strong> bpm
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Peak <strong className="text-foreground font-mono">{ev.peak_hr}</strong> bpm
                    </span>
                    <span className="text-[10px]" style={{ color: "hsl(var(--chart-3))" }}>
                      ↑ +{ev.rise_bpm} bpm
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Sustained <strong className="text-foreground font-mono">{fmtSec(ev.sustained_s)}</strong>
                    </span>
                    {ev.note_corroborated && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: "hsl(var(--chart-3) / 0.2)", color: "hsl(var(--chart-3))" }}>
                        ✓ note corroborated
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}