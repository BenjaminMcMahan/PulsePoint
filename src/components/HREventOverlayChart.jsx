import { useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, ReferenceLine, Legend,
} from "recharts";

function fmtMmSs(s) {
  const totalS = Math.round(Number(s));
  const m = Math.floor(totalS / 60);
  const sec = totalS % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const EVENT_COLORS = [
  "#f59e0b", "#a855f7", "#10b981", "#f43f5e", "#0ea5e9",
  "#fb923c", "#84cc16", "#e879f9", "#34d399", "#f87171",
];

function CustomTooltip({ active, payload, label, events }) {
  if (!active || !payload?.length) return null;
  const hrVal = payload.find((p) => p.dataKey === "hr")?.value;
  const nearby = events.filter((e) => Math.abs(e.time_s - label) <= 10);
  return (
    <div className="bg-card border border-border rounded-lg p-2.5 shadow-lg text-xs max-w-[220px]">
      <p className="font-mono text-muted-foreground mb-1">{fmtMmSs(label)}</p>
      {hrVal != null && (
        <p className="font-bold text-primary mb-1">{hrVal} bpm</p>
      )}
      {nearby.map((e, i) => (
        <p key={i} className="text-foreground/90 leading-snug border-l-2 pl-1.5 mt-1" style={{ borderColor: EVENT_COLORS[events.indexOf(e) % EVENT_COLORS.length] }}>
          {e.note}
        </p>
      ))}
    </div>
  );
}

export default function HREventOverlayChart({ timelineRows, events = [], session }) {
  const [hiddenEvents, setHiddenEvents] = useState(new Set());

  const chartData = useMemo(() => {
    return timelineRows.map((r) => ({
      t: Number(r.time_offset_s),
      hr: Number(r.hr_smoothed || r.hr),
    }));
  }, [timelineRows]);

  const visibleEvents = events.filter((_, i) => !hiddenEvents.has(i));

  const phaseMarkers = [
    session?.pre_climax_offset_s != null && { time_s: session.pre_climax_offset_s, label: "Pre-Climax", color: "#a855f7" },
    session?.climax_offset_s != null && { time_s: session.climax_offset_s, label: "Climax", color: "#ef4444" },
    session?.recovery_offset_s != null && { time_s: session.recovery_offset_s, label: "Recovery", color: "#3b82f6" },
  ].filter(Boolean);

  const toggleEvent = (idx) => {
    setHiddenEvents((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  if (!timelineRows.length) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">HR + Event Overlay</h3>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="t" tick={{ fontSize: 9 }} tickFormatter={fmtMmSs} tickCount={8} type="number" domain={["dataMin", "dataMax"]} />
            <YAxis tick={{ fontSize: 9 }} domain={["auto", "auto"]} />
            <Tooltip content={<CustomTooltip events={events} />} />

            {/* Phase markers */}
            {phaseMarkers.map((pm) => (
              <ReferenceLine
                key={pm.label}
                x={pm.time_s}
                stroke={pm.color}
                strokeWidth={1.5}
                strokeDasharray="4 2"
                label={{ value: pm.label, fontSize: 7, fill: pm.color, position: "top" }}
              />
            ))}

            {/* Event markers */}
            {events.map((ev, i) => !hiddenEvents.has(i) && (
              <ReferenceLine
                key={i}
                x={ev.time_s}
                stroke={EVENT_COLORS[i % EVENT_COLORS.length]}
                strokeWidth={1.5}
                strokeDasharray="2 3"
                label={{ value: `E${i + 1}`, fontSize: 7, fill: EVENT_COLORS[i % EVENT_COLORS.length], position: "insideTopLeft" }}
              />
            ))}

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

      {/* Event legend */}
      {events.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Events (tap to toggle)</p>
          {events.map((ev, i) => {
            const color = EVENT_COLORS[i % EVENT_COLORS.length];
            const hidden = hiddenEvents.has(i);
            return (
              <button
                key={i}
                onClick={() => toggleEvent(i)}
                className={`w-full flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-left transition-opacity ${hidden ? "opacity-40" : ""}`}
                style={{ background: color + "15", borderLeft: `3px solid ${color}` }}
              >
                <span className="font-mono text-[10px] shrink-0 mt-0.5 font-bold" style={{ color }}>
                  E{i + 1} {fmtMmSs(ev.time_s)}
                </span>
                <span className="text-xs text-foreground/90 leading-snug">{ev.note}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}