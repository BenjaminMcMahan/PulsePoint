import { useMemo } from "react";

function variance(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
}

function StatBlock({ label, values }) {
  if (!values.length) return null;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const vari = variance(values);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return (
    <div className="bg-muted/50 rounded-lg p-3 space-y-2">
      <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">{label}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <div>
          <p className="text-xs text-muted-foreground">Avg</p>
          <p className="text-base font-bold font-mono">{avg.toFixed(1)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Variance</p>
          <p className="text-base font-bold font-mono">{vari.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Min</p>
          <p className="text-sm font-mono text-muted-foreground">{min}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Max</p>
          <p className="text-sm font-mono text-muted-foreground">{max}</p>
        </div>
      </div>
      {/* Mini bar for spread */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden relative">
        {values.map((v, i) => (
          <div
            key={i}
            className="absolute top-0 h-full w-1.5 rounded-full"
            style={{
              left: `${((v - min) / (max - min || 1)) * 95}%`,
              background: `hsl(var(--chart-${(i % 5) + 1}))`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function CompareStats({ sessions }) {
  const stats = useMemo(() => {
    const intensities = sessions.map((s) => s.intensity).filter(Boolean);
    const bqs = sessions.map((s) => s.build_quality).filter(Boolean);
    const satisfactions = sessions.map((s) => s.satisfaction).filter(Boolean);
    const avgHRs = sessions.map((s) => s.avg_hr).filter(Boolean);
    const maxHRs = sessions.map((s) => s.max_hr).filter(Boolean);
    const hrPreToClimax = sessions.map((s) => s.hr_avg_pre_to_climax).filter(Boolean);
    const hrAtClimaxWindow = sessions.map((s) => s.hr_avg_at_climax_window).filter(Boolean);
    const buildDurs = sessions
      .filter((s) => s.pre_climax_offset_s != null && s.climax_offset_s != null)
      .map((s) => Math.round(Math.abs(s.climax_offset_s - s.pre_climax_offset_s)));
    return { intensities, bqs, satisfactions, avgHRs, maxHRs, hrPreToClimax, hrAtClimaxWindow, buildDurs };
  }, [sessions]);

  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Group Statistics ({sessions.length} sessions)
      </p>
      <div className="grid grid-cols-2 gap-3">
        <StatBlock label="Intensity" values={stats.intensities} />
        <StatBlock label="Build Quality" values={stats.bqs} />
        <StatBlock label="Satisfaction" values={stats.satisfactions} />
        <StatBlock label="Avg HR (bpm)" values={stats.avgHRs} />
        <StatBlock label="Max HR (bpm)" values={stats.maxHRs} />
        {stats.hrPreToClimax.length > 0 && (
          <StatBlock label="Avg HR Pre→Climax" values={stats.hrPreToClimax} />
        )}
        {stats.hrAtClimaxWindow.length > 0 && (
          <StatBlock label="Avg HR ±30s Climax" values={stats.hrAtClimaxWindow} />
        )}
        {stats.buildDurs.length > 0 && (
          <StatBlock label="Build→Climax (s)" values={stats.buildDurs} />
        )}
      </div>
    </div>
  );
}