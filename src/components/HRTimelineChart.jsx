import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

export default function HRTimelineChart({ rows }) {
  if (!rows || rows.length === 0) return null;

  const hasSmoothed = rows.some((r) => r.hr_smoothed != null && r.hr_smoothed !== "");
  const markers = rows.filter((r) => r.marker);

  return (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <XAxis
            dataKey="time_offset_s"
            tick={{ fontSize: 9 }}
            tickFormatter={(v) => `${Math.round(v)}s`}
          />
          <YAxis tick={{ fontSize: 9 }} domain={["auto", "auto"]} />
          <Tooltip
            formatter={(val, name) => [`${val} bpm`, name === "hr" ? "HR" : "Smoothed"]}
            labelFormatter={(v) => `${v}s`}
          />
          {markers.map((m, i) => (
            <ReferenceLine
              key={i}
              x={m.time_offset_s}
              stroke="hsl(var(--chart-3))"
              strokeDasharray="3 3"
              label={{ value: m.marker, fontSize: 8, fill: "hsl(var(--chart-3))" }}
            />
          ))}
          <Line
            type="monotone"
            dataKey="hr"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
          />
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
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}