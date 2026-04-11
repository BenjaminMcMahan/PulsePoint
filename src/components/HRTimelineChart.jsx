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
  if (!payload?.marker || payload.marker === "build") return <g />;
  const color = MARKER_COLORS[payload.marker];
  if (!color) return <g />;
  return <circle cx={cx} cy={cy} r={5} fill={color} stroke="white" strokeWidth={1.5} />;
}

function ManualTimeInput({ phase, color, label, currentOffset, maxOffset, onSet }) {
  const [min, setMin] = useState("");
  const [sec, setSec] = useState("");

  const handleSet = () => {
    const totalS = (parseInt(min) || 0) * 60 + (parseInt(sec) || 0);
    if (totalS >= 0 && totalS <= maxOffset) onSet(totalS);
  };

  // Pre-fill when currentOffset changes
  const displayMin = currentOffset != null ? Math.floor(currentOffset / 60) : "";
  const displaySec = currentOffset != null ? currentOffset % 60 : "";

  return (
    <div className="flex items-center gap-1 bg-muted rounded-lg px-2 py-1">
      <span className="text-[10px] font-semibold w-16 shrink-0" style={{ color }}>{label}</span>
      {currentOffset != null && (
        <span className="text-[10px] font-mono text-foreground mr-1 font-semibold">{Math.floor(Math.round(currentOffset)/60)}:{String(Math.round(currentOffset)%60).padStart(2,"0")}</span>
      )}
      <input
        type="number" min={0}
        placeholder="m"
        value={min}
        onChange={(e) => setMin(e.target.value)}
        className="w-8 text-[10px] bg-background border border-border rounded px-1 py-0.5 font-mono text-center"
      />
      <span className="text-[10px] text-muted-foreground">:</span>
      <input
        type="number" min={0} max={59}
        placeholder="s"
        value={sec}
        onChange={(e) => setSec(e.target.value)}
        className="w-8 text-[10px] bg-background border border-border rounded px-1 py-0.5 font-mono text-center"
      />
      <button
        onClick={handleSet}
        className="text-[10px] px-1.5 py-0.5 rounded font-semibold text-white"
        style={{ background: color }}
      >Set</button>
    </div>
  );
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
  const [visibleLines, setVisibleLines] = useState({ hr: true, smoothed: true, baseline: true });
  const toggleLine = (key) => setVisibleLines((v) => ({ ...v, [key]: !v[key] }));
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

  // Build ref lines from data markers — only known types
  const KNOWN_DATA_MARKERS = new Set(["build", "climax", "recovery"]);
  const markerLines = [];
  const seen = new Set();
  visibleRows.forEach((r) => {
    if (!r.marker) return;
    if (!KNOWN_DATA_MARKERS.has(r.marker)) return; // skip unknown/gray markers
    if (r.marker === "build" && !showBuild) return;
    const key = `${r.marker}-${r.time_offset_s}`;
    if (!seen.has(key)) {
      seen.add(key);
      markerLines.push({ offset: r.time_offset_s, marker: r.marker });
    }
  });

  const calcHRMetrics = (markers) => {
    const extra = {};
    if (markers.pre_climax != null && markers.climax != null) {
      const lo = Math.min(markers.pre_climax, markers.climax);
      const hi = Math.max(markers.pre_climax, markers.climax);
      const segment = rows.filter((r) => Number(r.time_offset_s) >= lo && Number(r.time_offset_s) <= hi);
      if (segment.length > 0) {
        extra.hr_avg_pre_to_climax = Math.round(segment.reduce((a, r) => a + Number(r.hr), 0) / segment.length);
      }
    }
    if (markers.climax != null) {
      const window = rows.filter((r) => Math.abs(Number(r.time_offset_s) - markers.climax) <= 30);
      if (window.length > 0) {
        extra.hr_avg_at_climax_window = Math.round(window.reduce((a, r) => a + Number(r.hr), 0) / window.length);
      }
    }
    return extra;
  };

  const handleChartClick = (data) => {
    if (!markingPhase || !data?.activeLabel) return;
    const offset = Math.round(Number(data.activeLabel));
    const updated = { ...localMarkers, [markingPhase]: offset };
    setLocalMarkers(updated);

    // advance to next phase or end
    const idx = MARKING_PHASES.indexOf(markingPhase);
    setMarkingPhase(idx < MARKING_PHASES.length - 1 ? MARKING_PHASES[idx + 1] : null);

    if (onMarkersChange) {
      const extra = calcHRMetrics(updated);
      onMarkersChange({
        pre_climax_offset_s: updated.pre_climax,
        climax_offset_s: updated.climax,
        recovery_offset_s: updated.recovery,
        ...extra,
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
          Click the chart <span className="font-semibold">or enter time below</span> to mark <span style={{ color: PHASE_COLORS[markingPhase] }} className="font-semibold">{PHASE_LABELS[markingPhase]}</span>
        </p>
      )}

      {/* Manual time inputs */}
      <div className="flex flex-wrap gap-2 mb-2">
        {MARKING_PHASES.map((phase) => (
          <ManualTimeInput
            key={phase}
            phase={phase}
            color={PHASE_COLORS[phase]}
            label={PHASE_LABELS[phase]}
            currentOffset={localMarkers[phase]}
            maxOffset={maxOffsetS}
            onSet={(offset) => {
              setLocalMarkers((prev) => {
                const updated = { ...prev, [phase]: offset };
                if (onMarkersChange) {
                  const extra = calcHRMetrics(updated);
                  onMarkersChange({
                    pre_climax_offset_s: updated.pre_climax,
                    climax_offset_s: updated.climax,
                    recovery_offset_s: updated.recovery,
                    ...extra,
                  });
                }
                return updated;
              });
            }}
          />
        ))}
      </div>

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
                if (name === "hr") return [`${Math.round(val)} bpm`, "HR"];
                if (name === "hr_smoothed") return [`${Math.round(val)} bpm`, "Smoothed"];
                if (name === "baseline_hr") return [`${Math.round(val)} bpm`, "Baseline"];
                return [val, name];
              }}
              labelFormatter={(v) => `Time: ${fmtSec(Math.round(Number(v)))}`}
              contentStyle={{ fontSize: 11 }}
              labelStyle={{ color: '#111827', fontWeight: 600 }}
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

            {hasBaseline && visibleLines.baseline && (
              <Line type="monotone" dataKey="baseline_hr" stroke="#6b7280" strokeWidth={1} strokeDasharray="6 3" dot={false} />
            )}
            {hasSmoothed && visibleLines.smoothed && (
              <Line type="monotone" dataKey="hr_smoothed" stroke="hsl(var(--chart-2))" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
            )}
            {visibleLines.hr && (
              <Line type="monotone" dataKey="hr" stroke="hsl(var(--primary))" strokeWidth={2} dot={<MarkerDot />} activeDot={{ r: 4 }} isAnimationActive={false} />
            )}
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
        <button
          onClick={() => toggleLine("hr")}
          className={`text-[10px] flex items-center gap-1 transition-opacity ${visibleLines.hr ? "" : "opacity-40"}`}
        >
          <span className="w-4 h-0.5 bg-primary inline-block" /> HR
        </button>
        {hasSmoothed && (
          <button
            onClick={() => toggleLine("smoothed")}
            className={`text-[10px] flex items-center gap-1 transition-opacity ${visibleLines.smoothed ? "" : "opacity-40"}`}
          >
            <span className="w-4 h-0.5 inline-block" style={{ borderTop: "2px dashed hsl(var(--chart-2))" }} /> Smoothed
          </button>
        )}
        {hasBaseline && (
          <button
            onClick={() => toggleLine("baseline")}
            className={`text-[10px] flex items-center gap-1 transition-opacity ${visibleLines.baseline ? "" : "opacity-40"}`}
          >
            <span className="w-4 h-0.5 inline-block" style={{ borderTop: "2px dashed #6b7280" }} /> Baseline
          </button>
        )}
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