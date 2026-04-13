import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Brain, TrendingUp, Activity, Lightbulb, Zap, BarChart2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import TTSButton from "../components/TTSButton";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, ScatterChart, Scatter, ZAxis, Legend,
} from "recharts";
import moment from "moment";

// ─── Small reusable pieces ────────────────────────────────────────────────────

function SectionCard({ icon, title, color, items }) {
  if (!items?.length) return null;
  return (
    <div className="bg-muted/50 rounded-lg p-3 space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color }}>
        {icon}{title}
      </p>
      <ul className="space-y-1.5">
        {items.map((text, i) => (
          <li key={i} className="text-sm text-foreground leading-relaxed pl-3 border-l-2 py-0.5" style={{ borderColor: color + "66" }}>
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">{title}</h3>
      {children}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-2 text-xs shadow-lg">
      <p className="font-semibold text-muted-foreground mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: <strong>{typeof p.value === "number" ? p.value.toFixed(1) : p.value}</strong></p>
      ))}
    </div>
  );
};

// ─── Data helpers ─────────────────────────────────────────────────────────────

function groupByMonth(sessions) {
  const map = {};
  sessions.forEach((s) => {
    const key = moment(s.date).format("MMM YYYY");
    if (!map[key]) map[key] = { key, sessions: [], ts: moment(s.date).valueOf() };
    map[key].sessions.push(s);
  });
  return Object.values(map).sort((a, b) => a.ts - b.ts);
}

function avg(arr) {
  const nums = arr.filter((v) => v != null && !isNaN(v));
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

function buildTrendData(sessions) {
  return groupByMonth(sessions).map(({ key, sessions: ss }) => ({
    month: key,
    satisfaction: avg(ss.map((s) => s.satisfaction)),
    build_quality: avg(ss.map((s) => s.build_quality)),
    intensity: avg(ss.map((s) => s.intensity)),
    avg_hr: avg(ss.map((s) => s.avg_hr)),
    max_hr: avg(ss.map((s) => s.max_hr)),
    count: ss.length,
  }));
}

function methodStats(sessions) {
  const map = {};
  sessions.forEach((s) => {
    const methods = s.methods || [];
    const key = [...methods].sort().join(" + ") || "Unknown";
    if (!map[key]) map[key] = { method: key, satisfaction: [], build_quality: [], count: 0 };
    map[key].count++;
    if (s.satisfaction) map[key].satisfaction.push(s.satisfaction);
    if (s.build_quality) map[key].build_quality.push(s.build_quality);
  });
  return Object.values(map)
    .map((m) => ({
      method: m.method.length > 30 ? m.method.slice(0, 30) + "…" : m.method,
      satisfaction: avg(m.satisfaction),
      build_quality: avg(m.build_quality),
      count: m.count,
    }))
    .filter((m) => m.count >= 2)
    .sort((a, b) => (b.satisfaction || 0) - (a.satisfaction || 0))
    .slice(0, 8);
}

function buildAggregate(sessions) {
  const months = groupByMonth(sessions);
  return {
    total_sessions: sessions.length,
    date_range: {
      first: sessions[0]?.date?.slice(0, 10),
      last: sessions[sessions.length - 1]?.date?.slice(0, 10),
    },
    monthly_averages: months.map(({ key, sessions: ss }) => ({
      month: key,
      count: ss.length,
      avg_satisfaction: avg(ss.map((s) => s.satisfaction))?.toFixed(1),
      avg_build_quality: avg(ss.map((s) => s.build_quality))?.toFixed(1),
      avg_intensity: avg(ss.map((s) => s.intensity))?.toFixed(1),
      avg_hr: avg(ss.map((s) => s.avg_hr))?.toFixed(0),
    })),
    method_performance: methodStats(sessions).map((m) => ({
      method: m.method,
      count: m.count,
      avg_satisfaction: m.satisfaction?.toFixed(1),
      avg_build_quality: m.build_quality?.toFixed(1),
    })),
    overall: {
      avg_satisfaction: avg(sessions.map((s) => s.satisfaction))?.toFixed(1),
      avg_build_quality: avg(sessions.map((s) => s.build_quality))?.toFixed(1),
      avg_max_hr: avg(sessions.map((s) => s.max_hr))?.toFixed(0),
      most_used_methods: (() => {
        const mc = {};
        sessions.forEach((s) => (s.methods || []).forEach((m) => { mc[m] = (mc[m] || 0) + 1; }));
        return Object.entries(mc).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([m, c]) => `${m} (${c}x)`);
      })(),
      climax_duration_dist: (() => {
        const cd = {};
        sessions.forEach((s) => { if (s.climax_duration) cd[s.climax_duration] = (cd[s.climax_duration] || 0) + 1; });
        return cd;
      })(),
    },
  };
}

// ─── AI Panel ────────────────────────────────────────────────────────────────

function AITrendsPanel({ sessions }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [savedId, setSavedId] = useState(null);

  useEffect(() => {
    base44.entities.CascadeAnalysisResult.filter({}, "-updated_date", 1).then((rows) => {
      // Reuse CascadeAnalysisResult entity but under a distinct key stored in session_count=-999 as sentinel
      const row = rows.find((r) => r.session_count === -9999);
      if (row) { setResult(row.result); setSavedId(row.id); }
    });
  }, []);

  const analyze = async () => {
    setLoading(true);
    const agg = buildAggregate(sessions);

    const res = await base44.integrations.Core.InvokeLLM({
      model: "gpt_5",
      prompt: `You are a physiological research analyst specializing in autonomic nervous system response, cardiovascular metrics, and neuromodulation outcomes. Analyze the following longitudinal physiological dataset collected across ${agg.total_sessions} individual sessions from ${agg.date_range.first} to ${agg.date_range.last}.

The data captures autonomic arousal metrics (heart rate, intensity ratings), neurostimulation modalities (including transcutaneous electrical nerve stimulation and urological catheter-based protocols), build quality scores (quality of physiological buildup curve), satisfaction ratings, and climax response characteristics — all standard metrics in clinical autonomic and pelvic floor physiological research.

DATA:
${JSON.stringify(agg, null, 2)}

Provide a rigorous long-term physiological analysis:
1. Month-over-month trends in cardiovascular and autonomic response metrics
2. Which neuromodulation/stimulation protocol combinations produce the most consistent and optimal physiological outcomes
3. Correlations between contextual variables (mood, hydration, environment) and outcome metrics
4. Personalized protocol optimization recommendations grounded in the observed data patterns
5. Any metrics showing concerning trajectories or high variance that warrant attention
6. Evidence-based suggestions for protocol evolution over the coming weeks and months

Be specific, cite actual numbers, and maintain a clinical research tone throughout.`,
      response_json_schema: {
        type: "object",
        properties: {
          executive_summary: { type: "string" },
          trend_analysis: { type: "array", items: { type: "string" } },
          method_insights: { type: "array", items: { type: "string" } },
          correlations: { type: "array", items: { type: "string" } },
          recommendations: { type: "array", items: { type: "string" } },
          watch_points: { type: "array", items: { type: "string" } },
        },
        required: ["executive_summary", "trend_analysis", "method_insights", "correlations", "recommendations"],
      },
    });

    const raw = typeof res === "string" ? JSON.parse(res) : res;
    const parsed = raw?.response ?? raw;
    setResult(parsed);

    if (savedId) {
      await base44.entities.CascadeAnalysisResult.update(savedId, { result: parsed, session_count: -9999 });
    } else {
      const created = await base44.entities.CascadeAnalysisResult.create({ result: parsed, session_count: -9999 });
      setSavedId(created.id);
    }
    setLoading(false);
  };

  const ttsText = result ? [
    result.executive_summary,
    ...(result.trend_analysis || []),
    ...(result.method_insights || []),
    ...(result.correlations || []),
    ...(result.recommendations || []),
    ...(result.watch_points || []),
  ].filter(Boolean).join(". ") : "";

  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
          <Brain className="w-4 h-4" /> AI Long-Term Analysis
        </h3>
        <div className="flex items-center gap-2">
          {result && <TTSButton getText={() => ttsText} />}
          <Button size="sm" onClick={analyze} disabled={loading} className="h-7 text-xs gap-1.5">
            {loading
              ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Analyzing…</>
              : result
                ? <><RefreshCw className="w-3 h-3" />Re-analyze</>
                : <><Brain className="w-3 h-3" />Analyze</>}
          </Button>
        </div>
      </div>

      {!result && !loading && (
        <p className="text-xs text-muted-foreground">
          Run an AI analysis of your full session history to uncover long-term physiological trends, method correlations, and personalized recommendations. Uses Claude Sonnet.
        </p>
      )}

      {loading && !result && (
        <p className="text-xs text-muted-foreground animate-pulse">Analyzing {sessions.length} sessions for long-term patterns…</p>
      )}

      {result && (
        <div className="space-y-3">
          {result.executive_summary && (
            <p className="text-sm text-foreground font-medium leading-relaxed border-l-2 border-primary pl-3">
              {result.executive_summary}
            </p>
          )}
          <SectionCard icon={<TrendingUp className="w-3.5 h-3.5" />} title="Trend Analysis" color="hsl(var(--chart-1))" items={result.trend_analysis} />
          <SectionCard icon={<Zap className="w-3.5 h-3.5" />} title="Method Insights" color="hsl(var(--chart-2))" items={result.method_insights} />
          <SectionCard icon={<Activity className="w-3.5 h-3.5" />} title="Correlations" color="hsl(var(--chart-4))" items={result.correlations} />
          <SectionCard icon={<Lightbulb className="w-3.5 h-3.5" />} title="Recommendations" color="hsl(var(--accent))" items={result.recommendations} />
          {result.watch_points?.length > 0 && (
            <SectionCard icon={<Brain className="w-3.5 h-3.5" />} title="Watch Points" color="hsl(var(--destructive))" items={result.watch_points} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LongTermTrends() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.Session.list("date", 500).then((rows) => {
      setSessions(rows.sort((a, b) => new Date(a.date) - new Date(b.date)));
      setLoading(false);
    });
  }, []);

  const trendData = useMemo(() => buildTrendData(sessions), [sessions]);
  const methods = useMemo(() => methodStats(sessions), [sessions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (sessions.length < 3) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        At least 3 sessions are needed for long-term trend analysis.
      </div>
    );
  }

  return (
    <div className="px-4 py-4 space-y-4 pb-10">
      <div>
        <h1 className="text-lg font-bold">Long-Term Trends</h1>
        <p className="text-xs text-muted-foreground">{sessions.length} sessions analysed</p>
      </div>

      {/* Satisfaction & Build Quality over time */}
      <ChartCard title="Satisfaction & Build Quality Over Time">
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 8 }} />
              <YAxis domain={[0, 10]} tick={{ fontSize: 8 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="satisfaction" name="Satisfaction" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="build_quality" name="Build Quality" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="intensity" name="Intensity" stroke="hsl(var(--chart-4))" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 2" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* Heart Rate trends */}
      <ChartCard title="Heart Rate Trends Over Time">
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 8 }} />
              <YAxis domain={["auto", "auto"]} tick={{ fontSize: 8 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="avg_hr" name="Avg HR" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="max_hr" name="Max HR" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* Method performance table */}
      {methods.length > 0 && (
        <ChartCard title="Method Combination Performance">
          <div className="space-y-2">
            {methods.map((m, i) => (
              <div key={i} className="bg-muted/50 rounded-lg px-3 py-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">{m.method}</span>
                  <span className="text-[10px] text-muted-foreground">{m.count} sessions</span>
                </div>
                <div className="flex gap-4">
                  {m.satisfaction != null && (
                    <div className="flex items-center gap-1.5 flex-1">
                      <span className="text-[10px] text-muted-foreground w-20">Satisfaction</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-chart-3 rounded-full" style={{ width: `${(m.satisfaction / 10) * 100}%` }} />
                      </div>
                      <span className="text-[10px] font-mono font-bold w-6 text-right">{m.satisfaction.toFixed(1)}</span>
                    </div>
                  )}
                  {m.build_quality != null && (
                    <div className="flex items-center gap-1.5 flex-1">
                      <span className="text-[10px] text-muted-foreground w-20">Build Quality</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-chart-2 rounded-full" style={{ width: `${(m.build_quality / 10) * 100}%` }} />
                      </div>
                      <span className="text-[10px] font-mono font-bold w-6 text-right">{m.build_quality.toFixed(1)}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      )}

      {/* Session frequency */}
      <ChartCard title="Session Frequency Per Month">
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 8 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 8 }} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="count" name="Sessions" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* AI Panel */}
      <AITrendsPanel sessions={sessions} />
    </div>
  );
}