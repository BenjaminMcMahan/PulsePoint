import { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export default function CompareHRTimelineChart({ timelines }) {
  // Merge all timelines into a single dataset keyed by time_offset_s
  const { merged, labels } = useMemo(() => {
    if (!timelines || timelines.length === 0) return { merged: [], labels: [] };

    const labels = timelines.map((t) => t.label);
    const map = {};

    timelines.forEach((t, idx) => {
      t.rows.forEach((r) => {
        const key = Math.round(Number(r.time_offset_s));
        if (!map[key]) map[key] = { t: key };
        map[key][`s${idx}`] = r.hr;
      });
    });

    const merged = Object.values(map).sort((a, b) => a.t - b.t);
    return { merged, labels };
  }, [timelines]);

  if (!merged.length) return null;

  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        Heart Rate Timeline Comparison
      </p>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={merged} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <XAxis dataKey="t" tick={{ fontSize: 9 }} tickFormatter={(v) => `${Math.round(v)}s`} />
            <YAxis tick={{ fontSize: 9 }} domain={["auto", "auto"]} />
            <Tooltip
              labelFormatter={(v) => `${v}s`}
              formatter={(val, name) => {
                const idx = parseInt(name.replace("s", ""));
                return [`${val} bpm`, labels[idx]];
              }}
              contentStyle={{ fontSize: 11 }}
            />
            <Legend
              formatter={(value) => {
                const idx = parseInt(value.replace("s", ""));
                return <span style={{ fontSize: 10 }}>{labels[idx]}</span>;
              }}
            />
            {labels.map((_, idx) => (
              <Line
                key={idx}
                type="monotone"
                dataKey={`s${idx}`}
                stroke={COLORS[idx % COLORS.length]}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}