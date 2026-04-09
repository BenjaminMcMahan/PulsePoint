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

function MarkerDot(props) {
  const { cx, cy, payload } = props;
  if (!payload?.marker) return null;
  const color = MARKER_COLORS[payload.marker] || "#9ca3af";
  return <circle cx={cx} cy={cy} r={5} fill={color} stroke="white" strokeWidth={1.5} />;
}

const WINDOWS = [
  { label: "Full", value: "full" },
  { label: "Last 5m", value: 5 },
  { label: "Last 3m", value: 3 },
  { label: "Last 2m", value: 2 },
];

export default function HRTimelineChart({ rows }) {
  const maxOffsetS = useMemo(() => Math.max(...rows.map((r) => Number(r.time_offset_s) || 0)), [rows]);
  const durationMins = maxOffsetS / 60;

  const defaultWindow = durationMins > 10 ? 5 : "full";
  const [window, setWindow] = useState(defaultWindow);

  const visibleRows = useMemo(() => {
    if (window === "full") return rows;
    const cutoff = maxOffsetS - window * 60;
    return rows.filter((r) => Number(r.time_offset_s) >= cutoff);
  }, [rows, window, maxOffsetS]);

  if (!rows || rows.length === 0) return null;

  const hasSmoothed = rows.some((r) => r.hr_smoothed != null && r.hr_smoothed !== "");
  const hasBaseline = rows.some((r) => r.baseline_hr != null && r.baseline_hr !== "");

  // Unique marker ref lines within visible window
  const markerLines = [];
  const seen = new Set();
  visibleRows.forEach((r) => {
    const key = `${r.marker}-${r.time_offset_s}`;
    if (r.marker && !seen.has(key)) {
      seen.add(key);
      markerLines.push({ offset: r.time_offset_s, marker: r.marker });
    }
  });

  return (
    <div>
      {/* Window toggle */}
      <div className="flex gap-1 mb-2 flex-wrap">
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
      </div>

      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={visibleRows} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
            <XAxis
              dataKey="time_offset_s"
              tick={{ fontSize: 9 }}
              tickFormatter={(v) => `${Math.round(v)}s`}
            />
            <YAxis tick={{ fontSize: 9 }} domain={["auto", "auto"]} />
            <Tooltip
              formatter={(val, name) => {
                if (name === "hr") return [`${val} bpm`, "HR"];
                if (name === "hr_smoothed") return [`${val} bpm`, "Smoothed"];
                if (name === "baseline_hr") return [`${val} bpm`, "Baseline"];
                return [val, name];
              }}
              labelFormatter={(v) => `${v}s`}
              contentStyle={{ fontSize: 11 }}
            />

            {markerLines.map((m, i) => (
              <ReferenceLine
                key={i}
                x={m.offset}
                stroke={MARKER_COLORS[m.marker] || "#9ca3af"}
                strokeDasharray="4 2"
                strokeWidth={1.5}
                label={{ value: m.marker, fontSize: 8, fill: MARKER_COLORS[m.marker] || "#9ca3af", position: "top" }}
              />
            ))}

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

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-1 px-1">
        <span className="text-[10px] text-muted-foreground flex items-center gap-1"><span className="w-4 h-0.5 bg-primary inline-block" /> HR</span>
        {hasSmoothed && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><span className="w-4 h-0.5 inline-block" style={{ borderTop: "2px dashed hsl(var(--chart-2))" }} /> Smoothed</span>}
        {hasBaseline && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><span className="w-4 h-0.5 inline-block" style={{ borderTop: "2px dashed #6b7280" }} /> Baseline</span>}
        {Object.entries(MARKER_COLORS).map(([k, v]) => (
          <span key={k} className="text-[10px] text-muted-foreground flex items-center gap-1">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: v }} />{k}
          </span>
        ))}
      </div>
    </div>
  );
}