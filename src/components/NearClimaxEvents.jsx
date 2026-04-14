import { useMemo } from "react";
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

function detectNearClimaxEvents(rows, climaxOffsetS, preClimaxOffsetS) {
  if (!rows || rows.length < 10) return [];
  const events = [];

  // Thresholds tuned for sustained plateau-style rises, not quick spikes
  const RISE_THRESHOLD = 12;       // bpm — meaningful rise required
  const RISE_WINDOW_S = 90;        // seconds — allow gradual climbs
  const PLATEAU_MIN_S = 10;        // seconds the HR must stay elevated before drop
  const DROP_NEEDED = 8;           // bpm drop to confirm reversal
  const COOLDOWN_S = 60;           // seconds between events
  const MIN_EVENT_DURATION_S = 15; // ignore fleeting micro-spikes

  // Max duration: shorter than pre-climax→climax window, or fallback to 180s
  const MAX_EVENT_DURATION_S = (climaxOffsetS != null && preClimaxOffsetS != null)
    ? Math.max(60, Math.abs(climaxOffsetS - preClimaxOffsetS) * 0.8)
    : 180;

  // Exclude zone around actual climax (±90s)
  const climaxExcludeRadius = 90;

  let i = 0;
  let lastEventEnd = -Infinity;

  while (i < rows.length - 5) {
    const t0 = Number(rows[i].time_offset_s);
    const hr0 = Number(rows[i].hr);

    if (t0 < lastEventEnd + COOLDOWN_S) { i++; continue; }
    if (climaxOffsetS != null && Math.abs(t0 - climaxOffsetS) < climaxExcludeRadius) { i++; continue; }

    // Find the peak within RISE_WINDOW_S
    let peakIdx = i;
    let peakHr = hr0;
    for (let j = i + 1; j < rows.length; j++) {
      const tj = Number(rows[j].time_offset_s);
      if (tj - t0 > RISE_WINDOW_S) break;
      if (Number(rows[j].hr) > peakHr) {
        peakHr = Number(rows[j].hr);
        peakIdx = j;
      }
    }

    if (peakHr - hr0 < RISE_THRESHOLD || peakIdx === i) { i++; continue; }

    const peakTime = Number(rows[peakIdx].time_offset_s);

    // Require the HR to stay within DROP_NEEDED/2 of peak for at least PLATEAU_MIN_S
    let plateauEnd = peakIdx;
    for (let j = peakIdx; j < rows.length; j++) {
      if (Number(rows[j].time_offset_s) - peakTime > PLATEAU_MIN_S) break;
      if (Number(rows[j].hr) >= peakHr - DROP_NEEDED / 2) plateauEnd = j;
    }
    const plateauDuration = Number(rows[plateauEnd].time_offset_s) - peakTime;
    if (plateauDuration < PLATEAU_MIN_S * 0.5) { i = peakIdx + 1; continue; }

    // Find the drop after the plateau
    let dropped = false;
    let dropIdx = plateauEnd;
    for (let j = plateauEnd + 1; j < rows.length && j < plateauEnd + 40; j++) {
      if (Number(rows[j].hr) <= peakHr - DROP_NEEDED) {
        dropped = true;
        dropIdx = j;
        break;
      }
    }

    if (!dropped) { i = peakIdx + 1; continue; }

    const eventDuration = Number(rows[dropIdx].time_offset_s) - t0;
    if (eventDuration < MIN_EVENT_DURATION_S || eventDuration > MAX_EVENT_DURATION_S) { i++; continue; }

    events.push({
      start_offset_s: t0,
      peak_offset_s: peakTime,
      end_offset_s: Number(rows[dropIdx].time_offset_s),
      base_hr: Math.round(hr0),
      peak_hr: Math.round(peakHr),
      rise_bpm: Math.round(peakHr - hr0),
      duration_s: Math.round(eventDuration),
    });

    lastEventEnd = Number(rows[dropIdx].time_offset_s);
    i = dropIdx + 1;
  }

  return events;
}

export default function NearClimaxEvents({ timelineRows, session }) {
  const events = useMemo(
    () => detectNearClimaxEvents(timelineRows, session?.climax_offset_s, session?.pre_climax_offset_s),
    [timelineRows, session]
  );

  if (!timelineRows.length) return null;

  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "hsl(var(--chart-3))" }}>
        <Zap className="w-4 h-4" /> Near-Climax Events
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

          <div className="space-y-2">
            {events.map((ev, i) => (
              <div
                key={i}
                className="rounded-lg px-3 py-2.5 space-y-1.5"
                style={{ background: "hsl(var(--chart-3) / 0.1)", borderLeft: "3px solid hsl(var(--chart-3) / 0.6)" }}
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
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}