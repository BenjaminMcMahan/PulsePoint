import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, ReferenceLine, Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, Activity, TrendingDown, Clock, Zap, AlertCircle } from "lucide-react";

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtRel(s) {
  const sign = s >= 0 ? "+" : "";
  const abs = Math.abs(s);
  const m = Math.floor(abs / 60);
  const sec = abs % 60;
  return `${sign}${m > 0 ? `${m}m` : ""}${sec}s`;
}

const PHASE_COLORS = ["#3b82f6", "#ef4444", "#f59e0b", "#a855f7", "#10b981", "#f43f5e", "#0ea5e9", "#8b5cf6"];

// ─── Heatmap cell ─────────────────────────────────────────────────────────────

function HeatmapCell({ value, min, max }) {
  if (value == null) return <td className="w-5 h-5 bg-muted/20" />;
  const pct = max > min ? (value - min) / (max - min) : 0;
  // blue → red gradient
  const r = Math.round(pct * 239 + (1 - pct) * 59);
  const g = Math.round((1 - pct) * 130 + pct * 68);
  const b = Math.round((1 - pct) * 246 + pct) * 68;
  const bg = `rgb(${r},${g},${b})`;
  return (
    <td
      className="w-4 h-6 text-center text-[8px] font-mono cursor-default"
      style={{ background: bg, color: pct > 0.5 ? "#fff" : "#111" }}
      title={`${Math.round(value)} bpm`}
    >
      {Math.round(value)}
    </td>
  );
}

// ─── AI Insight panel ─────────────────────────────────────────────────────────

function AIInsightPanel({ sessions, alignedData }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const analyze = async () => {
    setLoading(true);
    setResult(null);
    // Build a compact summary for the LLM
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

    const res = await base44.integrations.Core.InvokeLLM({
      model: "claude_sonnet_4_6",
      prompt: `You are a physiological research assistant analyzing sexual response data. 
You have ${sessions.length} sessions with heart rate cascade data (build → pre-climax → climax → recovery phases).

Session data:
${JSON.stringify(summary, null, 2)}

Please provide:
1. COMMON SIGNATURES: Identify recurring physiological patterns across sessions (HR trajectory, timing, intensity).
2. ANOMALIES: Flag any sessions with unusual cascade patterns worth investigating.
3. MARKER REFINEMENT SUGGESTIONS: Based on the distribution of manually set markers, suggest improved detection heuristics (e.g., "recovery typically starts ~${Math.round(summary.filter(s=>s.recovery_offset_s&&s.climax_offset_s).reduce((a,s)=>a+(s.recovery_offset_s-s.climax_offset_s),0)/Math.max(1,summary.filter(s=>s.recovery_offset_s&&s.climax_offset_s).length))}s after climax peak").
4. PREDICTIVE INSIGHTS: What factors (methods, mood, build_type) best predict a longer/stronger climax response?
5. PHENOTYPE CLUSTERS: Are there distinct response profiles visible in this data?

Be specific and concise. Use physiological research language. Highlight the most actionable insights.`,
      response_json_schema: {
        type: "object",
        properties: {
          common_signatures: { type: "array", items: { type: "string" } },
          anomalies: { type: "array", items: { type: "object", properties: { session_date: { type: "string" }, finding: { type: "string" } }, required: ["session_date", "finding"] } },
          marker_refinement: { type: "array", items: { type: "string" } },
          predictive_insights: { type: "array", items: { type: "string" } },
          phenotype_clusters: { type: "array", items: { type: "string" } },
          summary: { type: "string" },
        },
      },
    });
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
          {loading ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Analyzing…</> : <><Brain className="w-3 h-3" />Analyze</>}
        </Button>
      </div>
      {sessions.length < 2 && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" />Need at least 2 sessions with climax markers to run AI analysis.</p>
      )}
      {!result && !loading && sessions.length >= 2 && (
        <p className="text-xs text-muted-foreground">Click Analyze to generate AI-powered physiological insights across all aligned sessions. Uses advanced AI model.</p>
      )}
      {result && (
        <div className="space-y-4 text-xs">
          {result.summary && (
            <p className="text-sm text-foreground leading-relaxed border-l-2 border-primary pl-3">{result.summary}</p>
          )}
          {result.common_signatures?.length > 0 && (
            <Section icon={<Activity className="w-3.5 h-3.5 text-chart-1" />} title="Common Signatures" color="chart-1">
              {result.common_signatures.map((s, i) => <Item key={i} text={s} />)}
            </Section>
          )}
          {result.marker_refinement?.length > 0 && (
            <Section icon={<Clock className="w-3.5 h-3.5 text-chart-2" />} title="Marker Refinement Suggestions" color="chart-2">
              {result.marker_refinement.map((s, i) => <Item key={i} text={s} />)}
            </Section>
          )}
          {result.predictive_insights?.length > 0 && (
            <Section icon={<Zap className="w-3.5 h-3.5 text-chart-4" />} title="Predictive Insights" color="chart-4">
              {result.predictive_insights.map((s, i) => <Item key={i} text={s} />)}
            </Section>
          )}
          {result.phenotype_clusters?.length > 0 && (
            <Section icon={<TrendingDown className="w-3.5 h-3.5 text-accent" />} title="Phenotype Clusters" color="accent">
              {result.phenotype_clusters.map((s, i) => <Item key={i} text={s} />)}
            </Section>
          )}
          {result.anomalies?.length > 0 && (
            <Section icon={<AlertCircle className="w-3.5 h-3.5 text-destructive" />} title="Anomalies" color="destructive">
              {result.anomalies.map((a, i) => <Item key={i} text={`${a.session_date}: ${a.finding}`} />)}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ icon, title, color, children }) {
  return (
    <div>
      <p className={`flex items-center gap-1 font-semibold text-${color} mb-1.5`}>{icon}{title}</p>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

function Item({ text }) {
  return <li className="text-muted-foreground leading-snug pl-3 border-l border-border">• {text}</li>;
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function CascadeAnalysis() {
  const [sessions, setSessions] = useState([]);
  const [hrData, setHrData] = useState({}); // { sessionId: [rows] }
  const [loading, setLoading] = useState(true);
  const [windowSec, setWindowSec] = useState(120); // seconds each side of climax

  useEffect(() => {
    (async () => {
      const all = await base44.entities.Session.list("-date", 200);
      // Only sessions with climax markers
      const withClimax = all.filter((s) => s.climax_offset_s != null);
      setSessions(withClimax);

      // Load HR timelines for those sessions
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

  // Sessions that have both HR data and climax markers
  const eligibleSessions = useMemo(
    () => sessions.filter((s) => hrData[s.id]?.length > 0),
    [sessions, hrData]
  );

  // Build aligned dataset: for each session, remap time relative to climax
  const alignedData = useMemo(() => {
    // Time axis: -windowSec to +windowSec in 5s buckets
    const bucketSize = 5;
    const buckets = [];
    for (let t = -windowSec; t <= windowSec; t += bucketSize) buckets.push(t);

    return eligibleSessions.map((s) => {
      const rows = hrData[s.id];
      const climaxT = s.climax_offset_s;
      // Build a lookup: relative second → hr
      const hrByRel = {};
      rows.forEach((r) => {
        const rel = Math.round((Number(r.time_offset_s) - climaxT) / bucketSize) * bucketSize;
        if (rel >= -windowSec && rel <= windowSec) {
          if (!hrByRel[rel]) hrByRel[rel] = [];
          hrByRel[rel].push(Number(r.hr));
        }
      });
      const series = {};
      buckets.forEach((t) => {
        series[t] = hrByRel[t] ? hrByRel[t].reduce((a, b) => a + b, 0) / hrByRel[t].length : null;
      });

      // Phase markers relative to climax
      const preRel = s.pre_climax_offset_s != null ? Math.round(s.pre_climax_offset_s - climaxT) : null;
      const recRel = s.recovery_offset_s != null ? Math.round(s.recovery_offset_s - climaxT) : null;

      return { session: s, series, preRel, recRel, buckets };
    });
  }, [eligibleSessions, hrData, windowSec]);

  // Merged chart data: array of { rel, session1_hr, session2_hr, … } plus avg
  const chartData = useMemo(() => {
    if (!alignedData.length) return [];
    const bucketSize = 5;
    const buckets = [];
    for (let t = -windowSec; t <= windowSec; t += bucketSize) buckets.push(t);

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

  // Heatmap data
  const heatmapRows = alignedData;
  const allHRVals = heatmapRows.flatMap(({ series }) => Object.values(series).filter(Boolean));
  const hrMin = allHRVals.length ? Math.min(...allHRVals) : 50;
  const hrMax = allHRVals.length ? Math.max(...allHRVals) : 180;
  const bucketSize = 5;
  const buckets = [];
  for (let t = -windowSec; t <= windowSec; t += bucketSize) buckets.push(t);

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
        <p className="text-muted-foreground text-sm">No sessions with climax markers found. Set climax markers in session detail to enable cascade analysis.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 pb-24 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cascade Analysis</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {eligibleSessions.length} sessions aligned by climax event
        </p>
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
                  formatter={(val, name) => [val ? `${val} bpm` : "—", name === "_avg" ? "Avg" : eligibleSessions.find((s) => s.id === name)?.date?.slice(0, 10) || name]}
                  contentStyle={{ fontSize: 10 }}
                />
                <ReferenceLine x={0} stroke="#ef4444" strokeWidth={2} label={{ value: "Climax", fontSize: 8, fill: "#ef4444", position: "top" }} />
                {/* Individual session lines (faint) */}
                {eligibleSessions.map((s, i) => (
                  <Line
                    key={s.id}
                    type="monotone"
                    dataKey={s.id}
                    stroke={PHASE_COLORS[i % PHASE_COLORS.length]}
                    strokeWidth={1}
                    dot={false}
                    strokeOpacity={0.4}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
                {/* Average line (bold) */}
                <Line type="monotone" dataKey="_avg" stroke="#ffffff" strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} name="Avg" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-muted-foreground">White line = population average. Colored lines = individual sessions.</p>
        </div>
      )}

      {/* Heatmap */}
      {heatmapRows.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">HR Heatmap (sessions × time)</h3>
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-0.5">
              <thead>
                <tr>
                  <th className="text-[8px] text-muted-foreground text-left pr-2 font-normal w-20">Session</th>
                  {buckets.filter((_, i) => i % 4 === 0).map((t) => (
                    <th key={t} className="text-[7px] text-muted-foreground font-normal" colSpan={4}>{fmtRel(t)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmapRows.map(({ session, series, preRel, recRel }, si) => (
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
          {/* Gradient legend */}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[9px] text-muted-foreground">{Math.round(hrMin)} bpm</span>
            <div className="flex-1 h-2 rounded" style={{ background: "linear-gradient(to right, rgb(59,130,246), rgb(239,68,68))" }} />
            <span className="text-[9px] text-muted-foreground">{Math.round(hrMax)} bpm</span>
          </div>
        </div>
      )}

      {/* Phase timing summary across sessions */}
      {eligibleSessions.length > 0 && (() => {
        const preDurations = eligibleSessions.filter((s) => s.pre_climax_offset_s != null).map((s) => s.climax_offset_s - s.pre_climax_offset_s).filter((d) => d > 0);
        const recDurations = eligibleSessions.filter((s) => s.recovery_offset_s != null).map((s) => s.recovery_offset_s - s.climax_offset_s).filter((d) => d > 0);
        const avg = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
        const avgPre = avg(preDurations);
        const avgRec = avg(recDurations);
        return (
          <div className="bg-card rounded-xl border border-border p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">Phase Timing Summary</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-[9px] text-muted-foreground uppercase">Sessions</p>
                <p className="text-2xl font-bold font-mono">{eligibleSessions.length}</p>
              </div>
              {avgPre && (
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-[9px] text-muted-foreground uppercase">Avg Build→Climax</p>
                  <p className="text-2xl font-bold font-mono text-chart-3">
                    {avgPre >= 60 ? `${Math.floor(avgPre / 60)}m${avgPre % 60}s` : `${avgPre}s`}
                  </p>
                </div>
              )}
              {avgRec && (
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-[9px] text-muted-foreground uppercase">Avg Recovery Onset</p>
                  <p className="text-2xl font-bold font-mono text-chart-2">
                    {avgRec >= 60 ? `${Math.floor(avgRec / 60)}m${avgRec % 60}s` : `${avgRec}s`}
                  </p>
                </div>
              )}
            </div>
            {/* Phase timing per session badges */}
            <div className="space-y-1.5">
              {eligibleSessions.map((s) => {
                const buildDur = s.pre_climax_offset_s != null ? s.climax_offset_s - s.pre_climax_offset_s : null;
                const recDur = s.recovery_offset_s != null ? s.recovery_offset_s - s.climax_offset_s : null;
                return (
                  <div key={s.id} className="flex items-center gap-2 flex-wrap">
                    <span className="text-[9px] text-muted-foreground w-12 shrink-0">{s.date?.slice(5, 10)}</span>
                    {buildDur > 0 && <Badge variant="outline" className="text-[9px] h-5 px-1.5 text-chart-3 border-chart-3/30">Build {buildDur >= 60 ? `${Math.floor(buildDur / 60)}m${buildDur % 60}s` : `${buildDur}s`}</Badge>}
                    {recDur > 0 && <Badge variant="outline" className="text-[9px] h-5 px-1.5 text-chart-2 border-chart-2/30">Recovery +{recDur >= 60 ? `${Math.floor(recDur / 60)}m${recDur % 60}s` : `${recDur}s`}</Badge>}
                    {s.intensity && <Badge variant="secondary" className="text-[9px] h-5 px-1.5">I:{s.intensity}</Badge>}
                    {s.hr_at_climax && <Badge variant="secondary" className="text-[9px] h-5 px-1.5">♥ {s.hr_at_climax}</Badge>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* AI Panel */}
      <AIInsightPanel sessions={eligibleSessions.length > 0 ? eligibleSessions : sessions} alignedData={alignedData} />
    </div>
  );
}