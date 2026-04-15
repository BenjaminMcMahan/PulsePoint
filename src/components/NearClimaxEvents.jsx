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

export function detectNearClimaxEvents(rows, climaxOffsetS, preClimaxOffsetS) {
  if (!rows || rows.length < 10) return [];

  // Smooth HR with a small rolling average to reduce noise before detection
  const smoothed = rows.map((r, i) => {
    const window = rows.slice(Math.max(0, i - 2), i + 3);
    const avg = window.reduce((a, w) => a + Number(w.hr), 0) / window.length;
    return { t: Number(r.time_offset_s), hr: avg };
  });

  // Determine the terminal climax cascade region to exclude
  // Exclude from preClimaxOffset (or 90s before climax) through end of data
  const excludeStart = climaxOffsetS != null
    ? (preClimaxOffsetS != null ? Math.min(preClimaxOffsetS, climaxOffsetS - 60) : climaxOffsetS - 120)
    : Infinity;

  // Also compute session-wide HR stats for relative thresholds
  const allHRs = smoothed.map(p => p.hr);
  const sessionMinHR = Math.min(...allHRs);
  const sessionMaxHR = Math.max(...allHRs);
  const sessionHRRange = sessionMaxHR - sessionMinHR;

  // Thresholds — tuned for sub-climax arousal spikes:
  // Rise must be meaningful relative to session range but not a full climax cascade
  const MIN_RISE_BPM = Math.max(6, sessionHRRange * 0.12);   // at least 12% of range or 6 bpm
  const MAX_RISE_BPM = sessionHRRange * 0.80;                  // not a near-full-range surge (climax-level)
  const RISE_WINDOW_S = 90;       // must reach peak within 90s of start
  const PLATEAU_MIN_S = 5;        // peak must be sustained at least 5s
  const PLATEAU_TOLERANCE = 4;    // bpm tolerance for "sustained" plateau
  const DROP_BPM = Math.max(5, MIN_RISE_BPM * 0.6); // drop needed to end event
  const SEARCH_DROP_S = 120;      // look up to 120s after peak for the drop
  const MIN_DURATION_S = 15;
  const MAX_DURATION_S = 240;
  const COOLDOWN_S = 25;

  const events = [];
  let lastEventEnd = -Infinity;
  let i = 0;

  while (i < smoothed.length - 5) {
    const { t: t0, hr: hr0 } = smoothed[i];

    // Skip cooldown period after last event
    if (t0 < lastEventEnd + COOLDOWN_S) { i++; continue; }

    // Skip the terminal climax cascade region
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

    // Must be a meaningful rise but NOT a full climax-level surge
    if (rise < MIN_RISE_BPM || rise > MAX_RISE_BPM || peakIdx === i) { i++; continue; }

    // Ensure the rise is sharp: peak reached within a reasonable ascent window
    const ascentTime = smoothed[peakIdx].t - t0;
    if (ascentTime < 5 || ascentTime > RISE_WINDOW_S) { i++; continue; }

    const peakTime = smoothed[peakIdx].t;

    // Confirm plateau: HR stays within PLATEAU_TOLERANCE of peak for PLATEAU_MIN_S
    let plateauEnd = peakIdx;
    for (let j = peakIdx + 1; j < smoothed.length; j++) {
      if (smoothed[j].t - peakTime > 60) break; // don't search too far for plateau
      if (smoothed[j].hr >= peakHr - PLATEAU_TOLERANCE) plateauEnd = j;
    }
    const plateauDuration = smoothed[plateauEnd].t - peakTime;
    if (plateauDuration < PLATEAU_MIN_S) { i = peakIdx + 1; continue; }

    // Find the descent — HR drops DROP_BPM below the peak
    let dropIdx = -1;
    for (let j = plateauEnd + 1; j < smoothed.length; j++) {
      if (smoothed[j].t - peakTime > SEARCH_DROP_S) break;
      if (smoothed[j].hr <= peakHr - DROP_BPM) { dropIdx = j; break; }
    }
    if (dropIdx === -1) { i = peakIdx + 1; continue; }

    const eventDuration = smoothed[dropIdx].t - t0;
    if (eventDuration < MIN_DURATION_S || eventDuration > MAX_DURATION_S) { i++; continue; }

    // Final guard: reject if this event's peak HR is suspiciously close to session max
    // (i.e. it IS the climax, just not properly marked)
    if (peakHr >= sessionMaxHR * 0.97) { i = dropIdx + 1; continue; }

    events.push({
      start_offset_s: t0,
      peak_offset_s: peakTime,
      end_offset_s: smoothed[dropIdx].t,
      base_hr: Math.round(hr0),
      peak_hr: Math.round(peakHr),
      rise_bpm: Math.round(rise),
      duration_s: Math.round(eventDuration),
    });

    lastEventEnd = smoothed[dropIdx].t;
    i = dropIdx + 1;
  }

  return events;
}

export default function NearClimaxEvents({ timelineRows, session, selectedIndex, onSelectIndex }) {
  const events = useMemo(
    () => detectNearClimaxEvents(timelineRows, session?.climax_offset_s, session?.pre_climax_offset_s),
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
                      Peak at {fmtMmSs(ev.peak_offset_s)}
                    </span>
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