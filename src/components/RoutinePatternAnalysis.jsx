import { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Brain, TrendingUp, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

// Compute average of an array, or null if empty
function avg(arr) {
  const valid = arr.filter((v) => v != null && !isNaN(v));
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

// Get sorted combination key for a session's methods
function methodKey(session) {
  return (session.methods || []).slice().sort().join(" + ") || "Unknown";
}

// Analyze sessions into routine groups
function analyzeRoutines(sessions) {
  // Group by method combination
  const methodGroups = {};
  const buildGroups = {};

  for (const s of sessions) {
    const mk = methodKey(s);
    if (!methodGroups[mk]) methodGroups[mk] = [];
    methodGroups[mk].push(s);

    if (s.build_type) {
      if (!buildGroups[s.build_type]) buildGroups[s.build_type] = [];
      buildGroups[s.build_type].push(s);
    }
  }

  const toStats = (groups, minCount = 2) =>
    Object.entries(groups)
      .filter(([, arr]) => arr.length >= minCount)
      .map(([key, arr]) => ({
        key,
        count: arr.length,
        avgSatisfaction: avg(arr.map((s) => s.satisfaction)),
        avgBuildQuality: avg(arr.map((s) => s.build_quality)),
        avgIntensity: avg(arr.map((s) => s.intensity)),
        composite: avg([
          avg(arr.map((s) => s.satisfaction)),
          avg(arr.map((s) => s.build_quality)),
        ]),
      }))
      .sort((a, b) => (b.composite ?? 0) - (a.composite ?? 0));

  return {
    methods: toStats(methodGroups, 2),
    buildTypes: toStats(buildGroups, 2),
  };
}

const BAR_COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

function StatBar({ data, dataKey, label }) {
  if (!data.length) return null;
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <div style={{ height: Math.max(120, data.length * 36) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 32, bottom: 0, left: 0 }}>
            <XAxis type="number" domain={[0, 10]} tick={{ fontSize: 9 }} />
            <YAxis
              type="category"
              dataKey="key"
              tick={{ fontSize: 9 }}
              width={120}
              tickFormatter={(v) => v.length > 18 ? v.slice(0, 17) + "…" : v}
            />
            <Tooltip
              formatter={(val, name) => [val ? val.toFixed(1) : "—", name]}
              contentStyle={{ fontSize: 11 }}
            />
            <Bar dataKey={dataKey} radius={[0, 4, 4, 0]}>
              {data.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-1 mt-1">
        {data.map((d, i) => (
          <div key={d.key} className="flex items-center gap-2 text-[10px]">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: BAR_COLORS[i % BAR_COLORS.length] }} />
            <span className="font-medium truncate flex-1" title={d.key}>{d.key}</span>
            <span className="text-muted-foreground shrink-0">{d.count} sessions</span>
            {d[dataKey] != null && <span className="font-mono font-bold shrink-0">{d[dataKey].toFixed(1)}/10</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RoutinePatternAnalysis({ sessions }) {
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const stats = useMemo(() => analyzeRoutines(sessions), [sessions]);

  const runAI = async () => {
    setAiLoading(true);
    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a physiological research assistant. Analyze the following session routine statistics to identify which method combinations and build types consistently produce higher satisfaction and build quality scores.

Method combination stats (sorted by composite score):
${JSON.stringify(stats.methods.map(m => ({ routine: m.key, sessions: m.count, avg_satisfaction: m.avgSatisfaction?.toFixed(1), avg_build_quality: m.avgBuildQuality?.toFixed(1) })), null, 2)}

Build type stats (sorted by composite score):
${JSON.stringify(stats.buildTypes.map(b => ({ build_type: b.key, sessions: b.count, avg_satisfaction: b.avgSatisfaction?.toFixed(1), avg_build_quality: b.avgBuildQuality?.toFixed(1) })), null, 2)}

Provide 3–5 concise, actionable insights about which routines perform best and why. Focus on statistically meaningful differences (avoid speculation where data is thin). Be direct and specific.`,
        response_json_schema: {
          type: "object",
          properties: {
            top_routine: { type: "string" },
            insights: { type: "array", items: { type: "string" } },
          },
          required: ["top_routine", "insights"],
        },
      });
      const raw = typeof res === "string" ? JSON.parse(res) : res;
      setAiResult(raw?.response ?? raw);
    } finally {
      setAiLoading(false);
    }
  };

  if (sessions.length < 3) return null;

  const hasData = stats.methods.length > 0 || stats.buildTypes.length > 0;
  if (!hasData) return null;

  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">Routine Performance Patterns</h3>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-[10px] text-primary font-semibold"
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>

      {!expanded && (
        <div className="space-y-1">
          {stats.methods.slice(0, 3).map((m, i) => (
            <div key={m.key} className="flex items-center gap-2 text-xs">
              <span className="w-4 h-4 rounded flex items-center justify-center text-[9px] font-bold text-white shrink-0" style={{ background: BAR_COLORS[i] }}>
                {i + 1}
              </span>
              <span className="flex-1 truncate font-medium" title={m.key}>{m.key}</span>
              <span className="text-muted-foreground shrink-0 text-[10px]">{m.count}×</span>
              {m.avgSatisfaction != null && (
                <span className="font-mono text-[10px] text-primary font-bold shrink-0">Sat {m.avgSatisfaction.toFixed(1)}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {expanded && (
        <div className="space-y-5">
          {stats.methods.length > 0 && (
            <StatBar data={stats.methods} dataKey="avgSatisfaction" label="Method Combinations — Avg Satisfaction" />
          )}
          {stats.methods.length > 0 && (
            <StatBar data={stats.methods} dataKey="avgBuildQuality" label="Method Combinations — Avg Build Quality" />
          )}
          {stats.buildTypes.length > 0 && (
            <StatBar data={stats.buildTypes} dataKey="avgSatisfaction" label="Build Types — Avg Satisfaction" />
          )}

          <div className="border-t border-border pt-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                <Brain className="w-3.5 h-3.5" /> AI Pattern Insights
              </p>
              <Button size="sm" className="h-7 text-xs gap-1.5" onClick={runAI} disabled={aiLoading}>
                {aiLoading
                  ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Analyzing…</>
                  : <><Brain className="w-3 h-3" />Analyze</>}
              </Button>
            </div>
            {aiResult && (
              <div className="space-y-2">
                {aiResult.top_routine && (
                  <p className="text-sm font-semibold text-primary border-l-2 border-primary pl-2">{aiResult.top_routine}</p>
                )}
                {aiResult.insights?.map((ins, i) => (
                  <div key={i} className="flex gap-2 text-sm text-foreground/90">
                    <TrendingUp className="w-3.5 h-3.5 shrink-0 mt-0.5 text-chart-1" />
                    <span className="leading-relaxed">{ins}</span>
                  </div>
                ))}
              </div>
            )}
            {!aiResult && !aiLoading && (
              <p className="text-xs text-muted-foreground">Click Analyze to get AI-powered insights on which routines produce the best outcomes.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}