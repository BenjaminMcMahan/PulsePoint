import { useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, ReferenceLine, ReferenceArea,
} from "recharts";

import { ZoomOut, ChevronLeft, ChevronRight } from "lucide-react";
import { useChartZoom } from "@/hooks/useChartZoom";
import { EVENT_CATEGORIES } from "@/components/session-form/EventTimelineSection";

function getCategoryMeta(value) {
  return EVENT_CATEGORIES.find((c) => c.value === value) || EVENT_CATEGORIES[EVENT_CATEGORIES.length - 1];
}

// Normalize: category may be string or array, strip legacy values
const LEGACY_CATS = ["pause", "resume", "paused", "resumed"];
function getCategories(ev) {
  if (!ev.category) return [];
  const arr = Array.isArray(ev.category) ? ev.category : [ev.category];
  return arr.filter((v) => typeof v === "string" && v && !LEGACY_CATS.includes(v.toLowerCase()));
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

function EventCategoryPills({ ev }) {
  const cats = getCategories(ev);
  if (!cats.length) return <CategoryPill value="other" />;
  return <>{cats.map((c) => <CategoryPill key={c} value={c} />)}</>;
}

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
  const [focusedIdx, setFocusedIdx] = useState(null);

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
    setFocusedIdx(next);
    resetZoom();
  };

  const navigateTo = (idx) => {
    setFocusedIdx(idx);
    setIsolatedEvent(idx);
    resetZoom();
  };

  const handlePrev = () => {
    const cur = focusedIdx ?? 0;
    navigateTo(cur > 0 ? cur - 1 : events.length - 1);
  };

  const handleNext = () => {
    const cur = focusedIdx ?? -1;
    navigateTo(cur < events.length - 1 ? cur + 1 : 0);
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
            onClick={() => { resetZoom(); setIsolatedEvent(null); setFocusedIdx(null); }}
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
              formatter={(val) => [`${Math.round(val)} bpm`, "HR"]}
              labelFormatter={(v) => fmtMmSs(Math.round(Number(v)))}
              contentStyle={{ fontSize: 11 }}
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

      {/* Event navigator bar */}
      {events.length > 0 && (() => {
        const idx = focusedIdx ?? 0;
        const ev = events[idx];
        const color = EVENT_COLORS[idx % EVENT_COLORS.length];
        const hr = nearestHR(chartData, ev.time_s);
        return (
          <div className="rounded-lg px-3 py-3" style={{ background: color + "18", borderLeft: `3px solid ${color}` }}>
            <div className="flex items-center gap-2 mb-2">
              <button onClick={handlePrev} className="p-0.5 rounded hover:bg-black/10 shrink-0">
                <ChevronLeft className="w-4 h-4" style={{ color }} />
              </button>
              <div className="flex-1 flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[11px] font-bold" style={{ color }}>E{idx + 1} / {events.length}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{fmtMmSs(ev.time_s)}</span>
                <EventCategoryPills ev={ev} />
                {hr != null && <span className="font-mono text-[11px] font-bold text-primary">{hr} bpm</span>}
              </div>
              <button onClick={handleNext} className="p-0.5 rounded hover:bg-black/10 shrink-0">
                <ChevronRight className="w-4 h-4" style={{ color }} />
              </button>
            </div>
            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{ev.note}</p>
          </div>
        );
      })()}

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
                <div className="flex-1 flex flex-col gap-0.5">
                  <div className="flex flex-wrap gap-1"><EventCategoryPills ev={ev} /></div>
                  <span className="text-xs text-foreground/90 leading-snug">{ev.note}</span>
                </div>
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