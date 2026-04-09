import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, Customized
} from "recharts";

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

export default function HRTimelineChart({ rows }) {
  if (!rows || rows.length === 0) return null;

  const hasSmoothed = rows.some((r) => r.hr_smoothed != null && r.hr_smoothed !== "");
  const hasBaseline = rows.some((r) => r.baseline_hr != null && r.baseline_hr !== "");

  // Collect unique markers for reference lines (only first occurrence)
  const markerLines = [];
  const seen = new Set();
  rows.forEach((r) => {
    if (r.marker && !seen.has(`${r.marker}-${r.time_offset_s}`)) {
      seen.add(`${r.marker}-${r.time_offset_s}`);
      markerLines.push({ offset: r.time_offset_s, marker: r.marker, note: r.note });
    }
  });

  return (
    <div className="h-44">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
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
            <Line
              type="monotone"
              dataKey="baseline_hr"
              stroke="#6b7280"
              strokeWidth={1}
              strokeDasharray="6 3"
              dot={false}
            />
          )}

          {hasSmoothed && (
            <Line
              type="monotone"
              dataKey="hr_smoothed"
              stroke="hsl(var(--chart-2))"
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="4 2"
            />
          )}

          <Line
            type="monotone"
            dataKey="hr"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={<MarkerDot />}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-1 px-1">
        <span className="text-[10px] text-muted-foreground flex items-center gap-1"><span className="w-4 h-0.5 bg-primary inline-block" /> HR</span>
        {hasSmoothed && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><span className="w-4 h-0.5 inline-block" style={{borderTop:"2px dashed hsl(var(--chart-2))"}} /> Smoothed</span>}
        {hasBaseline && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><span className="w-4 h-0.5 inline-block" style={{borderTop:"2px dashed #6b7280"}} /> Baseline</span>}
        {Object.entries(MARKER_COLORS).map(([k, v]) => (
          <span key={k} className="text-[10px] text-muted-foreground flex items-center gap-1">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: v }} />
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}