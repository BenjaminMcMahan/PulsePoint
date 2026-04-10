import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { Button } from "@/components/ui/button";

const MARKER_COLORS = {
  build: "#f59e0b",
  climax: "#ef4444",
  recovery: "#3b82f6",
};

const PHASE_COLORS = {
  pre_climax: "#a855f7",
  climax: "#ef4444",
  recovery: "#3b82f6",
};

function fmtSec(v) {
  const total = Math.round(Number(v));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function deltaSec(a, b) {
  if (a == null || b == null) return null;
  return Math.round(Math.abs(b - a));
}

function MarkerDot(props) {
  const { cx, cy, payload } = props;
  if (!payload?.marker || payload.marker === "build") return null;
  const color = MARKER_COLORS[payload.marker] || "#9ca3af";
  return <circle cx={cx} cy={cy} r={5} fill={color} stroke="white" strokeWidth={1.5} />;
}

const WINDOWS = [
  { label: "Full", value: "full" },
  { label: "Last 5m", value: 5 },
  { label: "Last 3m", value: 3 },
  { label: "Last 2m", value: 2 },
];

const MARKING_PHASES = ["pre_climax", "climax", "recovery"];
const PHASE_LABELS = { pre_climax: "Pre-Climax", climax: "Climax", recovery: "Recovery" };

export default function HRTimelineChart({ rows, savedMarkers = {}, onMarkersChange }) {
  const maxOffsetS = useMemo(() => Math.max(...rows.map((r) => Number(r.time_offset_s) || 0)), [rows]);
  const durationMins = maxOffsetS / 60;

  const defaultWindow = durationMins > 10 ? 5 : "full";
  const [window, setWindow] = useState(defaultWindow);
  const [showBuild, setShowBuild] = useState(false);
  const [markingPhase, setMarkingPhase] = useState(null); // null | 'pre_climax' | 'climax' | 'recovery'
  const [localMarkers, setLocalMarkers] = useState({
    pre_climax: savedMarkers.pre_climax_offset_s ?? null,
    climax: savedMarkers.climax_offset_s ?? null,
    recovery: savedMarkers.recovery_offset_s ?? null,
  });

  const visibleRows = useMemo(() => {
    if (window === "full") return rows;
    const cutoff = maxOffsetS - window * 60;
    return rows.filter((r) => Number(r.time_offset_s) >= cutoff);
  }, [rows, window, maxOffsetS]);

  if (!rows || rows.length === 0) return null;

  const hasSmoothed = rows.some((r) => r.hr_smoothed != null && r.hr_smoothed !== "");
  const hasBaseline = rows.some((r) => r.baseline_hr != null && r.baseline_hr !== "");

  // Build ref lines from data markers (only if showBuild or non-build)
  const markerLines = [];
  const seen = new Set();
  visibleRows.forEach((r) => {
    if (!r.marker) return;
    if (r.marker === "build" && !showBuild) return;
    const key = `${r.marker}-${r.time_offset_s}`;
    if (!seen.has(key)) {
      seen.add(key);
      markerLines.push({ offset: r.time_offset_s, marker: r.marker });
    }
  });

  const handleChartClick = (data) => {
    if (!markingPhase || !data?.activeLabel) return;
    const offset = Number(data.activeLabel);
    const updated = { ...localMarkers, [markingPhase]: offset };
    setLocalMarkers(updated);

    // advance to next phase or end
    const idx = MARKING_PHASES.indexOf(markingPhase);
    setMarkingPhase(idx < MARKING_PHASES.length - 1 ? MARKING_PHASES[idx + 1] : null);

    if (onMarkersChange) {
      onMarkersChange({
        pre_climax_offset_s: updated.pre_climax,
        climax_offset_s: updated.climax,
        recovery_offset_s: updated.recovery,
      });
    }
  };

  const clearMarkers = () => {
    setLocalMarkers({ pre_climax: null, climax: null, recovery: null });
    setMarkingPhase(null);
    if (onMarkersChange) onMarkersChange({ pre_climax_offset_s: null, climax_offset_s: null, recovery_offset_s: null });
  };

  const preToClimax = deltaSec(localMarkers.pre_climax, localMarkers.climax);
  const climaxToRecovery = deltaSec(localMarkers.climax, localMarkers.recovery);

  return (
    <div>
      {/* Controls row */}
      <div className="flex gap-1 mb-2 flex-wrap items-center">
        {WINDOWS.map(({ label, value }) => (
          <Button
            key={label}
            size="sm"
            variant={window === value ? "default" : "outline"}
            className="h-6 text-[10px] px-2"
            onClick={() => setWindow(value)}
          >
            {label}
          </Button>
        ))}
        <div className="w-px h-4 bg-border mx-1" />
        <Button
          size="sm"
          variant={showBuild ? "default" : "outline"}
          className="h-6 text-[10px] px-2"
          onClick={() => setShowBuild((b) => !b)}
        >
          Build {showBuild ? "ON" : "OFF"}
        </Button>
      </div>

      {/* Marking mode controls */}
      <div className="flex gap-1 mb-2 flex-wrap items-center">
        {MARKING_PHASES.map((phase) => (
          <Button
            key={phase}
            size="sm"
            variant={markingPhase === phase ? "default" : localMarkers[phase] != null ? "secondary" : "outline"}
            className="h-6 text-[10px] px-2"
            style={markingPhase === phase ? { background: PHASE_COLORS[phase] } : localMarkers[phase] != null ? { borderColor: PHASE_COLORS[phase], color: PHASE_COLORS[phase] } : {}}
            onClick={() => setMarkingPhase(markingPhase === phase ? null : phase)}
          >
            {PHASE_LABELS[phase]}{localMarkers[phase] != null ? ` ✓` : ""}
          </Button>
        ))}
        {(localMarkers.pre_climax != null || localMarkers.climax != null || localMarkers.recovery != null) && (
          <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-destructive" onClick={clearMarkers}>Clear</Button>
        )}
      </div>

      {markingPhase && (
        <p className="text-[10px] text-muted-foreground mb-1 italic">
          Click a point on the chart to mark <span style={{ color: PHASE_COLORS[markingPhase] }} className="font-semibold">{PHASE_LABELS[markingPhase]}</span>
        </p>
      )}

      <div className={`h-44 ${markingPhase ? "cursor-crosshair" : ""}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={visibleRows}
            margin={{ top: 8, right: 4, bottom: 0, left: -20 }}
            onClick={handleChartClick}
          >
            <XAxis
              dataKey="time_offset_s"
              tick={{ fontSize: 9 }}
              tickFormatter={fmtSec}
            />
            <YAxis tick={{ fontSize: 9 }} domain={["auto", "auto"]} />
            <Tooltip
              formatter={(val, name) => {
                if (name === "hr") return [`${val} bpm`, "HR"];
                if (name === "hr_smoothed") return [`${val} bpm`, "Smoothed"];
                if (name === "baseline_hr") return [`${val} bpm`, "Baseline"];
                return [val, name];
              }}
              labelFormatter={(v) => fmtSec(v)}
              contentStyle={{ fontSize: 11 }}
            />

            {/* Data-driven marker lines */}
            {markerLines.map((m, i) => (
              <ReferenceLine
                key={`data-${i}`}
                x={m.offset}
                stroke={MARKER_COLORS[m.marker] || "#9ca3af"}
                strokeDasharray="4 2"
                strokeWidth={1.5}
                label={{ value: m.marker, fontSize: 8, fill: MARKER_COLORS[m.marker] || "#9ca3af", position: "top" }}
              />
            ))}

            {/* Manual phase markers */}
            {MARKING_PHASES.map((phase) =>
              localMarkers[phase] != null ? (
                <ReferenceLine
                  key={`phase-${phase}`}
                  x={localMarkers[phase]}
                  stroke={PHASE_COLORS[phase]}
                  strokeWidth={2}
                  label={{ value: PHASE_LABELS[phase], fontSize: 8, fill: PHASE_COLORS[phase], position: "insideTopLeft" }}
                />
              ) : null
            )}

            {hasBaseline && (
              <Line type="monotone" dataKey="baseline_hr" stroke="#6b7280" strokeWidth={1} strokeDasharray="6 3" dot={false} />
            )}
            {hasSmoothed && (
              <Line type="monotone" dataKey="hr_smoothed" stroke="hsl(var(--chart-2))" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
            )}
            <Line type="monotone" dataKey="hr" stroke="hsl(var(--primary))" strokeWidth={2} dot={<MarkerDot />} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Phase timing summary */}
      {(preToClimax != null || climaxToRecovery != null) && (
        <div className="flex gap-3 mt-2 flex-wrap">
          {preToClimax != null && (
            <div className="bg-muted rounded-lg px-3 py-1.5 text-center">
              <p className="text-[9px] text-muted-foreground uppercase">Pre-Climax → Climax</p>
              <p className="text-sm font-mono font-bold" style={{ color: PHASE_COLORS.climax }}>{fmtSec(preToClimax)}</p>
            </div>
          )}
          {climaxToRecovery != null && (
            <div className="bg-muted rounded-lg px-3 py-1.5 text-center">
              <p className="text-[9px] text-muted-foreground uppercase">Climax → Recovery</p>
              <p className="text-sm font-mono font-bold" style={{ color: PHASE_COLORS.recovery }}>{fmtSec(climaxToRecovery)}</p>
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-1 px-1">
        <span className="text-[10px] text-muted-foreground flex items-center gap-1"><span className="w-4 h-0.5 bg-primary inline-block" /> HR</span>
        {hasSmoothed && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><span className="w-4 h-0.5 inline-block" style={{ borderTop: "2px dashed hsl(var(--chart-2))" }} /> Smoothed</span>}
        {hasBaseline && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><span className="w-4 h-0.5 inline-block" style={{ borderTop: "2px dashed #6b7280" }} /> Baseline</span>}
        {showBuild && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: MARKER_COLORS.build }} />build</span>}
        {Object.entries(PHASE_COLORS).map(([k, v]) => (
          <span key={k} className="text-[10px] text-muted-foreground flex items-center gap-1">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: v }} />{PHASE_LABELS[k]}
          </span>
        ))}
      </div>
    </div>
  );
}