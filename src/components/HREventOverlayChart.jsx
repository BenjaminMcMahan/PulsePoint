import { useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, ReferenceLine, ReferenceArea,
} from "recharts";
import { ZoomOut } from "lucide-react";
import { useChartZoom } from "@/hooks/useChartZoom";

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

function CustomTooltip({ active, payload, label, events, pinnedLabel }) {
  const showLabel = pinnedLabel ?? label;
  const isActive = active || pinnedLabel != null;
  if (!isActive || !payload?.length) return null;
  const hrVal = payload.find((p) => p.dataKey === "hr")?.value;
  const nearby = events.filter((e) => Math.abs(e.time_s - showLabel) <= 10);
  return (
    <div className="bg-card border border-border rounded-lg p-2.5 shadow-lg text-xs max-w-[220px]">
      <p className="font-mono text-muted-foreground mb-1">{fmtMmSs(showLabel)}</p>
      {hrVal != null && (
        <p className="font-bold text-primary mb-1">{Math.round(hrVal)} bpm</p>
      )}
      {nearby.map((e, i) => (
        <p key={i} className="text-foreground/90 leading-snug border-l-2 pl-1.5 mt-1" style={{ borderColor: EVENT_COLORS[events.indexOf(e) % EVENT_COLORS.length] }}>
          {e.note}
        </p>
      ))}
    </div>
  );
}

// Find nearest HR value to a given time_s from chartData
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

export default function HREventOverlayChart({ timelineRows, events = [], session }) {
  const [isolatedEvent, setIsolatedEvent] = useState(null);
  const [pinnedTime, setPinnedTime] = useState(null);

  const chartData = useMemo(() => {
    return timelineRows.map((r) => ({
      t: Number(r.time_offset_s),
      hr: Math.round(Number(r.hr_smoothed || r.hr)),
    }));
  }, [timelineRows]);

  const dataMin = chartData.length ? chartData[0].t : 0;
  const dataMax = chartData.length ? chartData[chartData.length - 1].t : 1;

  const { zoomDomain, resetZoom, isSelecting, selectRange, chartProps, wrapperProps } = useChartZoom(dataMin, dataMax);

  const displayData = useMemo(() => {
    if (!zoomDomain) return chartData;
    return chartData.filter(d => d.t >= zoomDomain.x1 && d.t <= zoomDomain.x2);
  }, [chartData, zoomDomain]);

  const phaseMarkers = [
    session?.pre_climax_offset_s != null && { time_s: session.pre_climax_offset_s, label: "Pre-Climax", color: "#a855f7" },
    session?.climax_offset_s != null && { time_s: session.climax_offset_s, label: "Climax", color: "#ef4444" },
    session?.recovery_offset_s != null && { time_s: session.recovery_offset_s, label: "Recovery", color: "#3b82f6" },
  ].filter(Boolean);

  const toggleIsolate = (idx) => {
    const next = isolatedEvent === idx ? null : idx;
    setIsolatedEvent(next);
    setPinnedTime(next !== null ? events[next]?.time_s ?? null : null);
    resetZoom();
  };

  // Isolated event zoom overrides drag zoom
  const xDomain = useMemo(() => {
    if (isolatedEvent !== null && events[isolatedEvent]) {
      const t = events[isolatedEvent].time_s;
      return [Math.max(0, t - 60), t + 60];
    }
    if (zoomDomain) return [zoomDomain.x1, zoomDomain.x2];
    return ["dataMin", "dataMax"];
  }, [isolatedEvent, events, zoomDomain]);

  if (!timelineRows.length) return null;

  const isZoomed = zoomDomain != null || isolatedEvent !== null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">HR + Event Overlay</h3>
        {isZoomed ? (
          <button
            onClick={() => { resetZoom(); setIsolatedEvent(null); setPinnedTime(null); }}
            className="flex items-center gap-1 text-[10px] text-primary border border-primary rounded px-2 py-0.5"
          >
            <ZoomOut className="w-3 h-3" /> Reset Zoom
          </button>
        ) : (
          <span className="text-[10px] text-muted-foreground">Drag to zoom</span>
        )}
      </div>

      <div className="h-64 cursor-crosshair" {...wrapperProps}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={displayData} margin={{ top: 8, right: 4, bottom: 0, left: -20 }} {...chartProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="t" tick={{ fontSize: 9 }} tickFormatter={fmtMmSs} tickCount={8} type="number" domain={xDomain} />
            <YAxis tick={{ fontSize: 9 }} domain={["auto", "auto"]} />
            <Tooltip
              content={<CustomTooltip events={events} pinnedLabel={pinnedTime} />}
              defaultIndex={pinnedTime !== null ? chartData.findIndex((d) => d.t >= pinnedTime) : undefined}
            />

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
            {events.map((ev, i) => {
              const isIsolated = isolatedEvent === i;
              const dimmed = isolatedEvent !== null && !isIsolated;
              if (dimmed) return null;
              const color = EVENT_COLORS[i % EVENT_COLORS.length];
              return (
                <ReferenceLine
                  key={i}
                  x={ev.time_s}
                  stroke={color}
                  strokeWidth={isIsolated ? 2.5 : 1.5}
                  strokeDasharray="2 3"
                  label={{ value: `E${i + 1}`, fontSize: 7, fill: color, position: "insideTopLeft" }}
                />
              );
            })}

            {/* Drag-to-zoom selection */}
            {isSelecting && selectRange && (
              <ReferenceArea
                x1={selectRange.x1}
                x2={selectRange.x2}
                fill="hsl(var(--primary))"
                fillOpacity={0.15}
                stroke="hsl(var(--primary))"
                strokeOpacity={0.5}
                strokeWidth={1}
              />
            )}

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
          <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">
            Events {isolatedEvent !== null ? "— tap again to reset · drag chart to zoom" : "— tap to isolate · drag chart to zoom"}
          </p>
          {events.map((ev, i) => {
            const color = EVENT_COLORS[i % EVENT_COLORS.length];
            const isIsolated = isolatedEvent === i;
            const dimmed = isolatedEvent !== null && !isIsolated;
            const hr = nearestHR(chartData, ev.time_s);
            return (
              <button
                key={i}
                onClick={() => toggleIsolate(i)}
                className={`w-full flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-left transition-opacity ${dimmed ? "opacity-30" : ""}`}
                style={{
                  background: isIsolated ? color + "30" : color + "15",
                  borderLeft: `3px solid ${color}`,
                  outline: isIsolated ? `1px solid ${color}55` : "none",
                }}
              >
                <span className="font-mono text-[10px] shrink-0 mt-0.5 font-bold" style={{ color }}>
                  E{i + 1} {fmtMmSs(ev.time_s)}
                </span>
                <span className="flex-1 text-xs text-foreground/90 leading-snug">{ev.note}</span>
                {hr != null && (
                  <span className="font-mono text-[10px] shrink-0 font-bold text-primary/80 mt-0.5">{hr} bpm</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}