import { useMemo, useState, useCallback } from "react";
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  ReferenceLine, ReferenceArea, ResponsiveContainer, Legend,
} from "recharts";
import { ZoomOut, ChevronDown, ChevronUp } from "lucide-react";
import { EVENT_CATEGORIES, normalizeCategoryArray } from "./session-form/EventTimelineSection";
import { useChartZoom } from "@/hooks/useChartZoom";

// ── helpers ────────────────────────────────────────────────────────────────────

function getCategoryMeta(v) {
  return EVENT_CATEGORIES.find((c) => c.value === v) || EVENT_CATEGORIES[EVENT_CATEGORIES.length - 1];
}

function fmtMmSs(totalSeconds) {
  const v = Math.round(Number(totalSeconds));
  const m = Math.floor(v / 60);
  const s = v % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getCategories(ev) {
  const arr = normalizeCategoryArray(ev.category);
  return arr.length ? arr : ["other"];
}

// Build smoothed HR chart data (downsample to ~300 pts for perf)
function buildChartData(timelineRows) {
  if (!timelineRows.length) return [];
  const step = Math.max(1, Math.floor(timelineRows.length / 300));
  return timelineRows
    .filter((_, i) => i % step === 0)
    .map((r) => ({
      t: Number(r.time_offset_s),
      hr: Math.round(Number(r.hr_smoothed || r.hr)),
    }));
}

// Derive estimated intensity (1–10) from HR, shaped by session phase markers
function buildIntensityCurve(chartData, session) {
  if (!chartData.length) return [];
  const hrs = chartData.map((d) => d.hr);
  const minHR = Math.min(...hrs);
  const maxHR = Math.max(...hrs);
  const hrRange = maxHR - minHR || 1;
  const climaxT = session.climax_offset_s ?? null;
  const recoveryT = session.recovery_offset_s ?? null;

  return chartData.map(({ t, hr }) => {
    const hrNorm = (hr - minHR) / hrRange;
    let phase = 1;
    if (climaxT != null) {
      if (t <= climaxT) {
        phase = 0.55 + 0.45 * (t / climaxT);
      } else {
        const recT = recoveryT ?? climaxT + 120;
        const decay = Math.max(0, 1 - (t - climaxT) / Math.max(1, recT - climaxT));
        phase = 0.4 + 0.6 * decay;
      }
    }
    const intensity = Math.min(10, Math.max(1, Math.round(1 + hrNorm * phase * 9)));
    return { t, intensity };
  });
}

// Find events within ±EVENT_SNAP_S of a chart point
const EVENT_SNAP_S = 12;
function eventsNear(t, sessionEvents) {
  return (sessionEvents || []).filter((ev) => Math.abs(ev.time_s - t) <= EVENT_SNAP_S);
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label, sessionEvents }) {
  if (!active || !payload?.length) return null;
  const t = Number(label);

  const hrEntry = payload.find((p) => p.dataKey === "hr");
  const intEntry = payload.find((p) => p.dataKey === "intensity");
  const nearby = eventsNear(t, sessionEvents);

  return (
    <div className="bg-popover border border-border rounded-xl shadow-xl px-3 py-2.5 text-xs max-w-[260px] space-y-2">
      {/* Timestamp */}
      <p className="font-mono font-bold text-primary text-[11px]">{fmtMmSs(t)}</p>

      {/* HR + Intensity row */}
      <div className="flex items-center gap-3">
        {hrEntry && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: "hsl(var(--primary))" }} />
            <span className="font-mono font-bold text-foreground">{hrEntry.value} bpm</span>
          </span>
        )}
        {intEntry && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: "hsl(var(--chart-3))" }} />
            <span className="text-foreground/80">Intensity <strong>{intEntry.value}/10</strong></span>
          </span>
        )}
      </div>

      {/* Nearby events */}
      {nearby.map((ev, i) => {
        const cats = getCategories(ev);
        const meta = getCategoryMeta(cats[0]);
        return (
          <div key={i} className="border-t border-border pt-1.5 space-y-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-[10px] text-muted-foreground">{fmtMmSs(ev.time_s)}</span>
              {cats.map((c) => {
                const m = getCategoryMeta(c);
                return (
                  <span
                    key={c}
                    className="text-[9px] px-1.5 py-0 rounded-full font-semibold"
                    style={{ background: m.color + "28", color: m.color }}
                  >
                    {m.label}
                  </span>
                );
              })}
            </div>
            <p className="text-foreground leading-snug">{ev.note}</p>
          </div>
        );
      })}
    </div>
  );
}

// ── Phase marker config ────────────────────────────────────────────────────────

const PHASE_MARKERS = [
  { key: "pre_climax_offset_s", label: "Pre-Climax", color: "#a855f7" },
  { key: "climax_offset_s",     label: "Climax",     color: "#ef4444" },
  { key: "recovery_offset_s",   label: "Recovery",   color: "#3b82f6" },
];

// ── Main component ─────────────────────────────────────────────────────────────

export default function UnifiedSessionTimeline({ timelineRows, session }) {
  const [collapsed, setCollapsed] = useState(false);
  const [showIntensity, setShowIntensity] = useState(true);
  const [showEvents, setShowEvents] = useState(true);

  const sessionEvents = session?.event_timeline || [];

  const chartData = useMemo(() => buildChartData(timelineRows), [timelineRows]);
  const intensityCurve = useMemo(() => buildIntensityCurve(chartData, session), [chartData, session]);

  // Merge HR + intensity into a single data array keyed by t
  const mergedData = useMemo(() => {
    const intMap = new Map(intensityCurve.map((p) => [p.t, p.intensity]));
    return chartData.map((p) => ({ ...p, intensity: intMap.get(p.t) ?? null }));
  }, [chartData, intensityCurve]);

  const dataMin = mergedData.length ? mergedData[0].t : 0;
  const dataMax = mergedData.length ? mergedData[mergedData.length - 1].t : 1;

  const { zoomDomain, resetZoom, isSelecting, selectRange, chartProps, wrapperProps } = useChartZoom(dataMin, dataMax);

  const displayData = useMemo(() => {
    if (!zoomDomain) return mergedData;
    return mergedData.filter((d) => d.t >= zoomDomain.x1 && d.t <= zoomDomain.x2);
  }, [mergedData, zoomDomain]);

  const xDomain = zoomDomain ? [zoomDomain.x1, zoomDomain.x2] : ["dataMin", "dataMax"];
  const isZoomed = zoomDomain != null;

  // Event category colours — stable per-event index
  const eventColors = useMemo(() =>
    sessionEvents.map((ev) => {
      const cats = getCategories(ev);
      return getCategoryMeta(cats[0]).color;
    }), [sessionEvents]);

  // Active event (hovered / clicked in list)
  const [activeEventIdx, setActiveEventIdx] = useState(null);

  const handleEventClick = useCallback((i) => {
    setActiveEventIdx((prev) => prev === i ? null : i);
    resetZoom();
  }, [resetZoom]);

  if (!timelineRows.length) return null;

  // HR Y-axis range
  const hrs = chartData.map((d) => d.hr);
  const hrMin = Math.max(0, Math.min(...hrs) - 5);
  const hrMax = Math.max(...hrs) + 5;

  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-3">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between"
        onClick={() => setCollapsed((v) => !v)}
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">
          Unified Session Timeline
        </h3>
        {collapsed
          ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
          : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
      </button>

      {!collapsed && (
        <>
          {/* Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            {isZoomed ? (
              <button
                onClick={resetZoom}
                className="flex items-center gap-1 text-[10px] text-primary border border-primary/40 rounded px-2 py-0.5"
              >
                <ZoomOut className="w-3 h-3" /> Reset Zoom
              </button>
            ) : (
              <span className="text-[10px] text-muted-foreground">Drag to zoom · Hover for details</span>
            )}

            <div className="ml-auto flex items-center gap-2">
              {/* Toggle intensity overlay */}
              <button
                onClick={() => setShowIntensity((v) => !v)}
                className="text-[10px] px-2 py-0.5 rounded-full border font-medium transition-all"
                style={showIntensity
                  ? { background: "hsl(var(--chart-3) / 0.2)", color: "hsl(var(--chart-3))", borderColor: "hsl(var(--chart-3) / 0.5)" }
                  : { background: "transparent", color: "hsl(var(--muted-foreground))", borderColor: "hsl(var(--border))" }}
              >
                Intensity
              </button>
              {/* Toggle event markers */}
              {sessionEvents.length > 0 && (
                <button
                  onClick={() => setShowEvents((v) => !v)}
                  className="text-[10px] px-2 py-0.5 rounded-full border font-medium transition-all"
                  style={showEvents
                    ? { background: "hsl(var(--accent) / 0.15)", color: "hsl(var(--accent))", borderColor: "hsl(var(--accent) / 0.4)" }
                    : { background: "transparent", color: "hsl(var(--muted-foreground))", borderColor: "hsl(var(--border))" }}
                >
                  Events
                </button>
              )}
            </div>
          </div>

          {/* Chart */}
          <div className="h-64 cursor-crosshair" {...wrapperProps}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={displayData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} {...chartProps}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />

                {/* Shared time axis */}
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={xDomain}
                  tickFormatter={fmtMmSs}
                  tickCount={8}
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  allowDataOverflow
                />

                {/* Left Y-axis: Heart Rate */}
                <YAxis
                  yAxisId="hr"
                  orientation="left"
                  domain={[hrMin, hrMax]}
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v) => `${v}`}
                  label={{ value: "HR", angle: -90, position: "insideLeft", offset: 14, fontSize: 9, fill: "hsl(var(--primary))" }}
                />

                {/* Right Y-axis: Intensity */}
                {showIntensity && (
                  <YAxis
                    yAxisId="intensity"
                    orientation="right"
                    domain={[0, 10]}
                    ticks={[1, 3, 5, 7, 10]}
                    tick={{ fontSize: 9, fill: "hsl(var(--chart-3) / 0.8)" }}
                    label={{ value: "Int", angle: 90, position: "insideRight", offset: 10, fontSize: 9, fill: "hsl(var(--chart-3))" }}
                    width={28}
                  />
                )}

                <Tooltip
                  content={<CustomTooltip sessionEvents={sessionEvents} />}
                  cursor={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1, strokeDasharray: "3 3" }}
                />

                {/* Phase reference lines */}
                {PHASE_MARKERS.map(({ key, label, color }) =>
                  session?.[key] != null ? (
                    <ReferenceLine
                      key={key}
                      yAxisId="hr"
                      x={session[key]}
                      stroke={color}
                      strokeWidth={1.5}
                      strokeDasharray="5 3"
                      label={{ value: label, fontSize: 7, fill: color, position: "insideTopLeft", offset: 4 }}
                    />
                  ) : null
                )}

                {/* Event marker lines */}
                {showEvents && sessionEvents.map((ev, i) => {
                  const isActive = activeEventIdx === i;
                  const color = eventColors[i];
                  return (
                    <ReferenceLine
                      key={i}
                      yAxisId="hr"
                      x={ev.time_s}
                      stroke={color}
                      strokeWidth={isActive ? 2.5 : 1.2}
                      strokeDasharray="2 3"
                      strokeOpacity={activeEventIdx !== null && !isActive ? 0.25 : 0.85}
                      label={{ value: `E${i + 1}`, fontSize: 7, fill: color, position: "insideTopRight", offset: 2 }}
                    />
                  );
                })}

                {/* Drag-to-zoom area */}
                {isSelecting && selectRange && (
                  <ReferenceArea
                    yAxisId="hr"
                    x1={selectRange.x1}
                    x2={selectRange.x2}
                    fill="hsl(var(--primary))"
                    fillOpacity={0.12}
                    stroke="hsl(var(--primary))"
                    strokeOpacity={0.4}
                    strokeWidth={1}
                  />
                )}

                {/* HR line */}
                <Line
                  yAxisId="hr"
                  type="monotone"
                  dataKey="hr"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  name="Heart Rate"
                />

                {/* Intensity overlay */}
                {showIntensity && (
                  <Line
                    yAxisId="intensity"
                    type="monotone"
                    dataKey="intensity"
                    stroke="hsl(var(--chart-3))"
                    strokeWidth={1.5}
                    strokeOpacity={0.65}
                    strokeDasharray="4 2"
                    dot={false}
                    isAnimationActive={false}
                    name="Intensity"
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 rounded" style={{ background: "hsl(var(--primary))" }} />
              Heart Rate (bpm)
            </span>
            {showIntensity && (
              <span className="flex items-center gap-1.5">
                <span className="w-4 rounded border-t-2 border-dashed" style={{ borderColor: "hsl(var(--chart-3))" }} />
                Est. Intensity (1–10)
              </span>
            )}
            {PHASE_MARKERS.map(({ label, color }) =>
              session?.[PHASE_MARKERS.find(p => p.label === label)?.key] != null ? null : null
            )}
            <span className="flex items-center gap-1 ml-auto">
              <span className="w-px h-3 border-l-2 border-dashed border-muted-foreground/50" />
              Event markers
            </span>
          </div>

          {/* Event list */}
          {showEvents && sessionEvents.length > 0 && (
            <div className="space-y-1 pt-2 border-t border-border">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                Logged Events — tap to highlight
              </p>
              {sessionEvents.map((ev, i) => {
                const cats = getCategories(ev);
                const color = eventColors[i];
                const isActive = activeEventIdx === i;
                return (
                  <button
                    key={i}
                    onClick={() => handleEventClick(i)}
                    className="w-full flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-left transition-all"
                    style={{
                      background: isActive ? color + "28" : color + "10",
                      borderLeft: `3px solid ${isActive ? color : color + "66"}`,
                      outline: isActive ? `1px solid ${color}44` : "none",
                    }}
                  >
                    <span className="font-mono text-[10px] font-bold shrink-0 mt-0.5" style={{ color }}>
                      E{i + 1} {fmtMmSs(ev.time_s)}
                    </span>
                    <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                      <div className="flex flex-wrap gap-1">
                        {cats.map((c) => {
                          const m = getCategoryMeta(c);
                          return (
                            <span
                              key={c}
                              className="text-[9px] px-1.5 py-0 rounded-full font-semibold"
                              style={{ background: m.color + "22", color: m.color }}
                            >
                              {m.label}
                            </span>
                          );
                        })}
                      </div>
                      <span className="text-xs text-foreground/90 leading-snug">{ev.note}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}