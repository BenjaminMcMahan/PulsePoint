import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, Scatter, CartesianGrid,
} from "recharts";
import { EVENT_CATEGORIES, normalizeCategoryArray } from "./session-form/EventTimelineSection";

function getCategoryMeta(value) {
  return EVENT_CATEGORIES.find((c) => c.value === value) || EVENT_CATEGORIES[EVENT_CATEGORIES.length - 1];
}

function fmtMmSs(totalSeconds) {
  const v = Math.round(Number(totalSeconds));
  const m = Math.floor(v / 60);
  const s = v % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Build an interpolated arousal curve from HR timeline + session markers
function buildArousalCurve(timelineRows, session) {
  if (!timelineRows.length) return [];

  const maxHR = Math.max(...timelineRows.map((r) => Number(r.hr)));
  const minHR = Math.min(...timelineRows.map((r) => Number(r.hr)));
  const hrRange = maxHR - minHR || 1;

  // Sample every ~10s to keep the chart readable
  const step = Math.max(1, Math.floor(timelineRows.length / 120));
  const sampled = timelineRows.filter((_, i) => i % step === 0);

  const climaxT = session.climax_offset_s ?? null;
  const preT = session.pre_climax_offset_s ?? null;

  return sampled.map((r) => {
    const t = Number(r.time_offset_s);
    const hrNorm = (Number(r.hr) - minHR) / hrRange; // 0..1

    // Phase multiplier: ramp up into climax, drop at recovery
    let phaseMult = 1;
    if (climaxT != null) {
      if (t <= climaxT) {
        // Build phase: gradual ramp
        phaseMult = 0.6 + 0.4 * (t / climaxT);
      } else {
        // Recovery: decay
        const recT = session.recovery_offset_s ?? climaxT + 120;
        const decay = Math.max(0, 1 - (t - climaxT) / Math.max(1, recT - climaxT));
        phaseMult = 0.5 + 0.5 * decay;
      }
    }

    // Arousal = normalized HR shaped by phase, mapped to 1–10
    const raw = hrNorm * phaseMult;
    const arousal = Math.round(1 + raw * 9);
    return { time_s: t, arousal: Math.min(10, Math.max(1, arousal)) };
  });
}

// Tooltip for event scatter dots
function EventDot(props) {
  const { cx, cy, payload } = props;
  if (!payload) return null;
  const cats = normalizeCategoryArray(payload.category);
  const meta = getCategoryMeta(cats[0]);
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill={meta.color}
      stroke="#fff"
      strokeWidth={1.5}
      style={{ cursor: "pointer" }}
    />
  );
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;

  if (d.category !== undefined) {
    // Event scatter point
    const cats = normalizeCategoryArray(d.category);
    const meta = getCategoryMeta(cats[0]);
    return (
      <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-xs max-w-[220px]">
        <p className="font-mono font-bold text-primary mb-1">{fmtMmSs(d.time_s)}</p>
        <p className="font-semibold" style={{ color: meta.color }}>{cats.map(c => getCategoryMeta(c).label).join(" + ")}</p>
        <p className="text-foreground mt-0.5 leading-snug">{d.note}</p>
        {d.arousal != null && <p className="text-muted-foreground mt-1">Arousal ≈ {d.arousal}/10</p>}
      </div>
    );
  }

  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-mono text-muted-foreground">{fmtMmSs(d.time_s)}</p>
      <p className="font-bold">Arousal: <span className="text-primary">{d.arousal}/10</span></p>
    </div>
  );
}

const PHASE_LINES = [
  { key: "pre_climax_offset_s", label: "Pre-Climax", color: "#a855f7" },
  { key: "climax_offset_s", label: "Climax", color: "#ef4444" },
  { key: "recovery_offset_s", label: "Recovery", color: "#3b82f6" },
];

export default function ArousalEventChart({ session, timelineRows }) {
  const [hiddenCats, setHiddenCats] = useState(new Set());
  const [collapsed, setCollapsed] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);

  const arousalCurve = useMemo(
    () => buildArousalCurve(timelineRows, session),
    [timelineRows, session]
  );

  // Map each event to an arousal value by nearest curve point
  const eventPoints = useMemo(() => {
    if (!arousalCurve.length) return [];
    return (session.event_timeline || []).map((ev) => {
      const cats = normalizeCategoryArray(ev.category);
      if (cats.some((c) => hiddenCats.has(c))) return null;
      // Nearest arousal value
      let best = arousalCurve[0];
      let bestDist = Math.abs(arousalCurve[0].time_s - ev.time_s);
      for (const pt of arousalCurve) {
        const d = Math.abs(pt.time_s - ev.time_s);
        if (d < bestDist) { bestDist = d; best = pt; }
      }
      return { ...ev, arousal: best.arousal };
    }).filter(Boolean);
  }, [session.event_timeline, arousalCurve, hiddenCats]);

  const toggleCat = (val) => {
    setHiddenCats((prev) => {
      const next = new Set(prev);
      if (next.has(val)) next.delete(val); else next.add(val);
      return next;
    });
  };

  // Collect which categories are present in this session's events
  const presentCats = useMemo(() => {
    const seen = new Set();
    for (const ev of session.event_timeline || []) {
      for (const c of normalizeCategoryArray(ev.category)) seen.add(c);
    }
    return EVENT_CATEGORIES.filter((c) => seen.has(c.value));
  }, [session.event_timeline]);

  const hasCurve = arousalCurve.length > 0;
  const hasEvents = (session.event_timeline || []).length > 0;

  if (!hasCurve && !hasEvents) return null;

  const maxT = arousalCurve.length
    ? arousalCurve[arousalCurve.length - 1].time_s
    : Math.max(...(session.event_timeline || []).map((e) => e.time_s), 0);

  const visibleEvents = showAllEvents ? eventPoints : eventPoints.slice(0, 8);

  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-3">
      <button
        className="w-full flex items-center justify-between"
        onClick={() => setCollapsed((v) => !v)}
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
          Arousal Arc &amp; Event Correlation
        </h3>
        {collapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
      </button>

      {!collapsed && (
        <>
          {/* Category filter pills */}
          {presentCats.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {presentCats.map((c) => {
                const hidden = hiddenCats.has(c.value);
                return (
                  <button
                    key={c.value}
                    onClick={() => toggleCat(c.value)}
                    className="text-[10px] px-2 py-0.5 rounded-full border font-medium transition-all"
                    style={hidden
                      ? { background: "transparent", color: c.color + "88", borderColor: c.color + "33" }
                      : { background: c.color + "22", color: c.color, borderColor: c.color + "66" }
                    }
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          )}

          <div className="w-full" style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis
                  dataKey="time_s"
                  type="number"
                  domain={[0, maxT]}
                  tickFormatter={fmtMmSs}
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  tickCount={7}
                  allowDataOverflow
                />
                <YAxis
                  domain={[0, 10]}
                  ticks={[1, 3, 5, 7, 10]}
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  width={28}
                />
                <Tooltip content={<CustomTooltip />} />

                {/* Phase reference lines */}
                {PHASE_LINES.map(({ key, label, color }) =>
                  session[key] != null ? (
                    <ReferenceLine
                      key={key}
                      x={session[key]}
                      stroke={color}
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      label={{ value: label, position: "top", fontSize: 8, fill: color, offset: 4 }}
                    />
                  ) : null
                )}

                {/* Arousal curve */}
                {hasCurve && (
                  <Line
                    data={arousalCurve}
                    dataKey="arousal"
                    type="monotone"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                )}

                {/* Event scatter */}
                {eventPoints.length > 0 && (
                  <Scatter
                    data={eventPoints}
                    dataKey="arousal"
                    shape={<EventDot />}
                    isAnimationActive={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {!hasCurve && hasEvents && (
            <p className="text-xs text-muted-foreground text-center">
              Upload a HR file to see the full arousal arc. Events shown at estimated positions.
            </p>
          )}

          {/* Event legend below chart */}
          {eventPoints.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-border">
              {visibleEvents.map((ev, i) => {
                const cats = normalizeCategoryArray(ev.category);
                const meta = getCategoryMeta(cats[0]);
                return (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="font-mono text-primary shrink-0 w-8 mt-0.5">{fmtMmSs(ev.time_s)}</span>
                    <span className="shrink-0 mt-0.5 font-semibold" style={{ color: meta.color }}>
                      {cats.map(c => getCategoryMeta(c).label).join("+")}
                    </span>
                    <span className="text-muted-foreground leading-snug line-clamp-1">{ev.note}</span>
                    {ev.arousal != null && (
                      <span className="ml-auto shrink-0 font-mono font-bold text-primary">{ev.arousal}/10</span>
                    )}
                  </div>
                );
              })}
              {eventPoints.length > 8 && (
                <button
                  onClick={() => setShowAllEvents((v) => !v)}
                  className="text-[10px] text-primary font-medium mt-1 hover:underline"
                >
                  {showAllEvents ? "Show less" : `Show all ${eventPoints.length} events`}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}