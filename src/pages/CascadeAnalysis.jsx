import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, ReferenceLine,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, Activity, TrendingDown, Clock, Zap, AlertCircle } from "lucide-react";

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtRel(s) {
  const sign = s >= 0 ? "+" : "-";
  const abs = Math.abs(Math.round(s));
  const m = Math.floor(abs / 60);
  const sec = abs % 60;
  return `${sign}${m > 0 ? `${m}m` : ""}${sec}s`;
}

function fmtDur(s) {
  const v = Math.round(s);
  return v >= 60 ? `${Math.floor(v / 60)}m${v % 60}s` : `${v}s`;
}

const PHASE_COLORS = ["#3b82f6", "#ef4444", "#f59e0b", "#a855f7", "#10b981", "#f43f5e", "#0ea5e9", "#8b5cf6"];

const SECTION_COLORS = {
  "chart-1": "hsl(var(--chart-1))",
  "chart-2": "hsl(var(--chart-2))",
  "chart-4": "hsl(var(--chart-4))",
  "accent": "hsl(var(--accent))",
  "destructive": "hsl(var(--destructive))",
};

// ─── Heatmap cell ─────────────────────────────────────────────────────────────

function HeatmapCell({ value, min, max }) {
  if (value == null) return <td className="w-4 h-6 bg-muted/20" />;
  const pct = max > min ? (value - min) / (max - min) : 0;
  const r = Math.round(pct * 239 + (1 - pct) * 59);
  const g = Math.round((1 - pct) * 130 + pct * 68);
  const b = Math.round((1 - pct) * 246 + pct * 68);
  return (
    <td
      className="w-4 h-6 text-center text-[8px] font-mono cursor-default"
      style={{ background: `rgb(${r},${g},${b})`, color: pct > 0.5 ? "#fff" : "#111" }}
      title={`${Math.round(value)} bpm`}
    >
      {Math.round(value)}
    </td>
  );
}

// ─── Section / Item for AI output ─────────────────────────────────────────────

function Section({ icon, title, color, children }) {
  return (
    <div>
      <p className="flex items-center gap-1 font-semibold mb-1.5" style={{ color: SECTION_COLORS[color] }}>
        {icon}{title}
      </p>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

function Item({ text }) {
  return (
    <li className="text-muted-foreground leading-snug pl-3 border-l border-border py-0.5">• {text}</li>
  );
}

// ─── AI Insight panel ─────────────────────────────────────────────────────────

function AIInsightPanel({ sessions }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const analyze = async () => {
    setLoading(true);
    setResult(null);

    const summary = sessions.map((s) => ({
      date: s.date?.slice(0, 10),
      climax_offset_s: s.climax_offset_s,
      recovery_offset_s: s.recovery_offset_s,
      pre_climax_offset_s: s.pre_climax_offset_s,
      hr_at_climax: s.hr_at_climax,
      avg_hr: s.avg_hr,
      max_hr: s.max_hr,
      hr_avg_pre_to_climax: s.hr_avg_pre_to_climax,
      hr_avg_at_climax_window: s.hr_avg_at_climax_window,
      intensity: s.intensity,
      satisfaction: s.satisfaction,
      build_type: s.build_type,
      climax_duration: s.climax_duration,
      mood: s.mood,
      methods: s.methods,
    }));

    const withRecovery = summary.filter((s) => s.recovery_offset_s && s.climax_offset_s);
    const avgRecoveryOnset = withRecovery.length
      ? Math.round(withRecovery.reduce((a, s) => a + (s.recovery_offset_s - s.climax_offset_s), 0) / withRecovery.length)
      : null;

    const res = await base44.integrations.Core.InvokeLLM({
      model: "claude_sonnet_4_6",
      prompt: `You are a physiological research assistant analyzing sexual response data.
You have ${sessions.length} sessions with heart rate cascade data (build → pre-climax → climax → recovery phases).

Session data:
${JSON.stringify(summary, null, 2)}

Please provide a structured analysis with these sections:
1. COMMON SIGNATURES: Recurring physiological patterns across sessions (HR trajectory, timing, intensity).
2. ANOMALIES: Sessions with unusual cascade patterns worth investigating.
3. MARKER REFINEMENT SUGGESTIONS: Improved detection heuristics based on the distribution of manually set markers${avgRecoveryOnset ? ` (e.g., recovery onset currently averages ~${avgRecoveryOnset}s post-climax)` : ""}.
4. PREDICTIVE INSIGHTS: Which factors (methods, mood, build_type) best predict a longer or stronger climax response?
5. PHENOTYPE CLUSTERS: Distinct response profiles visible in this data.

Be specific, concise, and use physiological research language.`,
      response_json_schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          common_signatures: { type: "array", items: { type: "string" } },
          anomalies: {
            type: "array",
            items: {
              type: "object",
              properties: {
                session_date: { type: "string" },
                finding: { type: "string" },
              },
              required: ["session_date", "finding"],
            },
          },
          marker_refinement: { type: "array", items: { type: "string" } },
          predictive_insights: { type: "array", items: { type: "string" } },
          phenotype_clusters: { type: "array", items: { type: "string" } },
        },
        required: ["summary", "common_signatures", "marker_refinement", "predictive_insights", "phenotype_clusters", "anomalies"],
      },
    });

    console.log("AI Cascade result:", res);
    setResult(res);
    setLoading(false);
  };

  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
          <Brain className="w-4 h-4" /> AI Cascade Analysis
        </h3>
        <Button size="sm" onClick={analyze} disabled={loading || sessions.length < 2} className="h-7 text-xs gap-1.5">
          {loading
            ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Analyzing…</>
            : <><Brain className="w-3 h-3" />Analyze</>}
        </Button>
      </div>

      {sessions.length < 2 && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" />Need at least 2 sessions with climax markers to run AI analysis.
        </p>
      )}

      {!result && !loading && sessions.length >= 2 && (
        <p className="text-xs text-muted-foreground">
          Click Analyze to generate AI-powered physiological insights across all aligned sessions. Uses Claude Sonnet (advanced model).
        </p>
      )}

      {result && (
        <div className="space-y-4 text-xs">
          {result.summary ? (
            <p className="text-sm text-foreground leading-relaxed border-l-2 border-primary pl-3">{result.summary}</p>
          ) : (
            <p className="text-xs text-muted-foreground italic">Analysis complete — no summary returned.</p>
          )}
          {result.common_signatures?.length > 0 && (
            <Section icon={<Activity className="w-3.5 h-3.5" style={{ color: SECTION_COLORS["chart-1"] }} />} title="Common Signatures" color="chart-1">
              {result.common_signatures.map((s, i) => <Item key={i} text={s} />)}
            </Section>
          )}
          {result.marker_refinement?.length > 0 && (
            <Section icon={<Clock className="w-3.5 h-3.5" style={{ color: SECTION_COLORS["chart-2"] }} />} title="Marker Refinement Suggestions" color="chart-2">
              {result.marker_refinement.map((s, i) => <Item key={i} text={s} />)}
            </Section>
          )}
          {result.predictive_insights?.length > 0 && (
            <Section icon={<Zap className="w-3.5 h-3.5" style={{ color: SECTION_COLORS["chart-4"] }} />} title="Predictive Insights" color="chart-4">
              {result.predictive_insights.map((s, i) => <Item key={i} text={s} />)}
            </Section>
          )}
          {result.phenotype_clusters?.length > 0 && (
            <Section icon={<TrendingDown className="w-3.5 h-3.5" style={{ color: SECTION_COLORS["accent"] }} />} title="Phenotype Clusters" color="accent">
              {result.phenotype_clusters.map((s, i) => <Item key={i} text={s} />)}
            </Section>
          )}
          {result.anomalies?.length > 0 && (
            <Section icon={<AlertCircle className="w-3.5 h-3.5" style={{ color: SECTION_COLORS["destructive"] }} />} title="Anomalies" color="destructive">
              {result.anomalies.map((a, i) => <Item key={i} text={`${a.session_date}: ${a.finding}`} />)}
            </Section>
          )}
          {/* Fallback: dump raw if everything is empty */}
          {!result.summary && !result.common_signatures?.length && !result.predictive_insights?.length && (
            <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap bg-muted/40 rounded p-2 overflow-auto">{JSON.stringify(result, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function CascadeAnalysis() {
  const [sessions, setSessions] = useState([]);
  const [hrData, setHrData] = useState({});
  const [loading, setLoading] = useState(true);
  const [windowSec, setWindowSec] = useState(120);

  useEffect(() => {
    (async () => {
      const all = await base44.entities.Session.list("-date", 200);
      const withClimax = all.filter((s) => s.climax_offset_s != null);
      setSessions(withClimax);

      const hrMap = {};
      await Promise.all(
        withClimax.map(async (s) => {
          const rows = await base44.entities.HeartRateTimeline.filter({ session: s.id }, "time_offset_s", 10000);
          if (rows.length > 0) hrMap[s.id] = rows;
        })
      );
      setHrData(hrMap);
      setLoading(false);
    })();
  }, []);

  const eligibleSessions = useMemo(
    () => sessions.filter((s) => hrData[s.id]?.length > 0),
    [sessions, hrData]
  );

  const BUCKET = 5;

  const makeBuckets = (win) => {
    const b = [];
    for (let t = -win; t <= win; t += BUCKET) b.push(t);
    return b;
  };

  const alignedData = useMemo(() => {
    const buckets = makeBuckets(windowSec);
    return eligibleSessions.map((s) => {
      const rows = hrData[s.id];
      const climaxT = s.climax_offset_s;
      const hrByRel = {};
      rows.forEach((r) => {
        const rel = Math.round((Number(r.time_offset_s) - climaxT) / BUCKET) * BUCKET;
        if (rel >= -windowSec && rel <= windowSec) {
          if (!hrByRel[rel]) hrByRel[rel] = [];
          hrByRel[rel].push(Number(r.hr));
        }
      });
      const series = {};
      buckets.forEach((t) => {
        series[t] = hrByRel[t] ? hrByRel[t].reduce((a, b) => a + b, 0) / hrByRel[t].length : null;
      });
      const preRel = s.pre_climax_offset_s != null ? Math.round(s.pre_climax_offset_s - climaxT) : null;
      const recRel = s.recovery_offset_s != null ? Math.round(s.recovery_offset_s - climaxT) : null;
      return { session: s, series, preRel, recRel };
    });
  }, [eligibleSessions, hrData, windowSec]);

  const chartData = useMemo(() => {
    if (!alignedData.length) return [];
    const buckets = makeBuckets(windowSec);
    return buckets.map((t) => {
      const point = { rel: t };
      const vals = [];
      alignedData.forEach(({ session, series }) => {
        const v = series[t];
        point[session.id] = v != null ? Math.round(v) : null;
        if (v != null) vals.push(v);
      });
      point._avg = vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
      return point;
    });
  }, [alignedData, windowSec]);

  const buckets = makeBuckets(windowSec);
  const allHRVals = alignedData.flatMap(({ series }) => Object.values(series).filter(Boolean));
  const hrMin = allHRVals.length ? Math.min(...allHRVals) : 50;
  const hrMax = allHRVals.length ? Math.max(...allHRVals) : 180;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-center px-6">
        <Activity className="w-10 h-10 text-muted-foreground" />
        <p className="text-muted-foreground text-sm">No sessions with climax markers found. Set climax markers in a session to enable cascade analysis.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 pb-24 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cascade Analysis</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{eligibleSessions.length} sessions aligned by climax event</p>
      </div>

      {/* Window selector */}
      <div className="flex gap-1 flex-wrap">
        {[60, 120, 180, 300].map((w) => (
          <Button key={w} size="sm" variant={windowSec === w ? "default" : "outline"} className="h-7 text-xs" onClick={() => setWindowSec(w)}>
            ±{w / 60}m
          </Button>
        ))}
      </div>

      {eligibleSessions.length === 0 && (
        <div className="bg-muted/40 rounded-xl p-4 text-sm text-muted-foreground text-center">
          Sessions have climax markers but no imported HR data. Upload HR CSVs to enable cascade visualizations.
        </div>
      )}

      {/* Overlaid HR curves */}
      {eligibleSessions.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">Aligned HR Cascade (time relative to climax)</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="rel" tick={{ fontSize: 9 }} tickFormatter={fmtRel} />
                <YAxis tick={{ fontSize: 9 }} domain={["auto", "auto"]} />
                <Tooltip
                  labelFormatter={(v) => `Climax ${fmtRel(Number(v))}`}
                  formatter={(val, name) => [
                    val ? `${val} bpm` : "—",
                    name === "_avg" ? "Avg" : (eligibleSessions.find((s) => s.id === name)?.date?.slice(0, 10) || name),
                  ]}
                  contentStyle={{ fontSize: 10 }}
                />
                <ReferenceLine x={0} stroke="#ef4444" strokeWidth={2} label={{ value: "Climax", fontSize: 8, fill: "#ef4444", position: "top" }} />
                {eligibleSessions.map((s, i) => (
                  <Line key={s.id} type="monotone" dataKey={s.id} stroke={PHASE_COLORS[i % PHASE_COLORS.length]} strokeWidth={1} dot={false} strokeOpacity={0.4} connectNulls isAnimationActive={false} />
                ))}
                <Line type="monotone" dataKey="_avg" stroke="#ffffff" strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} name="Avg" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-muted-foreground">White line = population average. Colored lines = individual sessions.</p>
        </div>
      )}

      {/* Heatmap */}
      {alignedData.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">HR Heatmap (sessions × time)</h3>
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-0.5">
              <thead>
                <tr>
                  <th className="text-[8px] text-muted-foreground text-left pr-2 font-normal w-12">Session</th>
                  {buckets.filter((_, i) => i % 4 === 0).map((t) => (
                    <th key={t} className="text-[7px] text-muted-foreground font-normal" colSpan={4}>{fmtRel(t)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {alignedData.map(({ session, series }) => (
                  <tr key={session.id}>
                    <td className="text-[8px] text-muted-foreground pr-2 whitespace-nowrap">{session.date?.slice(5, 10)}</td>
                    {buckets.map((t) => (
                      <HeatmapCell key={t} value={series[t]} min={hrMin} max={hrMax} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[9px] text-muted-foreground">{Math.round(hrMin)} bpm</span>
            <div className="flex-1 h-2 rounded" style={{ background: "linear-gradient(to right, rgb(59,130,246), rgb(239,68,68))" }} />
            <span className="text-[9px] text-muted-foreground">{Math.round(hrMax)} bpm</span>
          </div>
        </div>
      )}

      {/* Phase timing summary */}
      {eligibleSessions.length > 0 && (
        <PhaseSummary sessions={eligibleSessions} />
      )}

      {/* AI Panel */}
      <AIInsightPanel sessions={eligibleSessions.length > 0 ? eligibleSessions : sessions} />
    </div>
  );
}

function PhaseSummary({ sessions }) {
  const preDurations = sessions.filter((s) => s.pre_climax_offset_s != null).map((s) => s.climax_offset_s - s.pre_climax_offset_s).filter((d) => d > 0);
  const recDurations = sessions.filter((s) => s.recovery_offset_s != null).map((s) => s.recovery_offset_s - s.climax_offset_s).filter((d) => d > 0);
  const avg = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
  const avgPre = avg(preDurations);
  const avgRec = avg(recDurations);

  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">Phase Timing Summary</h3>
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <p className="text-[9px] text-muted-foreground uppercase">Sessions</p>
          <p className="text-2xl font-bold font-mono">{sessions.length}</p>
        </div>
        {avgPre && (
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-[9px] text-muted-foreground uppercase">Avg Build→Climax</p>
            <p className="text-xl font-bold font-mono text-chart-3">{fmtDur(avgPre)}</p>
          </div>
        )}
        {avgRec && (
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-[9px] text-muted-foreground uppercase">Avg Recovery Onset</p>
            <p className="text-xl font-bold font-mono text-chart-2">{fmtDur(avgRec)}</p>
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        {sessions.map((s) => {
          const buildDur = s.pre_climax_offset_s != null ? Math.round(s.climax_offset_s - s.pre_climax_offset_s) : null;
          const recDur = s.recovery_offset_s != null ? Math.round(s.recovery_offset_s - s.climax_offset_s) : null;
          return (
            <div key={s.id} className="flex items-center gap-2 flex-wrap">
              <span className="text-[9px] text-muted-foreground w-12 shrink-0">{s.date?.slice(5, 10)}</span>
              {buildDur > 0 && <Badge variant="outline" className="text-[9px] h-5 px-1.5 text-chart-3 border-chart-3/30">Build {fmtDur(buildDur)}</Badge>}
              {recDur > 0 && <Badge variant="outline" className="text-[9px] h-5 px-1.5 text-chart-2 border-chart-2/30">Recovery +{fmtDur(recDur)}</Badge>}
              {s.intensity && <Badge variant="secondary" className="text-[9px] h-5 px-1.5">I:{s.intensity}</Badge>}
              {s.hr_at_climax && <Badge variant="secondary" className="text-[9px] h-5 px-1.5">♥ {s.hr_at_climax}</Badge>}
            </div>
          );
        })}
      </div>
    </div>
  );
}