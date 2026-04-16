import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, ReferenceLine,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, Activity, TrendingDown, Clock, Zap, AlertCircle } from "lucide-react";
import TTSButton from "../components/TTSButton";

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
    <li className="text-sm text-foreground/90 leading-relaxed pl-3 border-l-2 border-primary/40 py-0.5">• {text}</li>
  );
}

// ─── AI Insight panel ─────────────────────────────────────────────────────────

function AIInsightPanel({ sessions }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [savedId, setSavedId] = useState(null);

  useEffect(() => {
    base44.entities.CascadeAnalysisResult.list("-updated_date", 1).then((rows) => {
      if (rows[0]) {
        setResult(rows[0].result);
        setSavedId(rows[0].id);
      }
    });
  }, []);

  const analyze = async () => {
    setLoading(true);
    setResult(null);

    // Build nearest-HR lookup per session for event annotation
    const nearestHR = (rows, time_s) => {
      if (!rows?.length) return null;
      let best = rows[0];
      let bestDist = Math.abs(Number(rows[0].time_offset_s) - time_s);
      for (const r of rows) {
        const d = Math.abs(Number(r.time_offset_s) - time_s);
        if (d < bestDist) { bestDist = d; best = r; }
        if (Number(r.time_offset_s) > time_s + 10) break;
      }
      return Math.round(Number(best.hr));
    };

    const summary = sessions.map((s) => {
      const rows = (s._hrRows || []).sort((a, b) => Number(a.time_offset_s) - Number(b.time_offset_s));

      // Sample HR at key phase points for cascade shape description
      const hrAt = (offset_s) => {
        if (offset_s == null || !rows.length) return null;
        return nearestHR(rows, offset_s);
      };

      // Annotate events with HR and category
      const annotatedEvents = (s.event_timeline || []).map((e) => {
        const m = Math.floor(e.time_s / 60);
        const sec = (e.time_s % 60).toString().padStart(2, "0");
        const hr = nearestHR(rows, e.time_s);
        const relToClimax = s.climax_offset_s != null ? Math.round(e.time_s - s.climax_offset_s) : null;
        const relStr = relToClimax != null ? ` (${relToClimax >= 0 ? "+" : ""}${relToClimax}s vs climax)` : "";
        const cats = Array.isArray(e.category) ? e.category : [e.category].filter(Boolean);
        const catStr = cats.length ? `[${cats.join("+")}]` : "";
        return `${catStr} ${m}:${sec}${relStr} — ${e.note}${hr != null ? ` [HR: ${hr} bpm]` : ""}`.trim();
      });

      // Build cascade shape: HR at pre-climax, climax, and recovery markers
      const cascadeShape = {
        hr_at_pre_climax_marker: hrAt(s.pre_climax_offset_s),
        hr_at_climax_marker: s.hr_at_climax || hrAt(s.climax_offset_s),
        hr_at_recovery_marker: hrAt(s.recovery_offset_s),
        build_duration_s: s.pre_climax_offset_s != null ? Math.round(s.climax_offset_s - s.pre_climax_offset_s) : null,
        recovery_onset_s: s.recovery_offset_s != null ? Math.round(s.recovery_offset_s - s.climax_offset_s) : null,
        hr_rise_pre_to_climax: (s.hr_at_climax || hrAt(s.climax_offset_s)) != null && hrAt(s.pre_climax_offset_s) != null
          ? Math.round((s.hr_at_climax || hrAt(s.climax_offset_s)) - hrAt(s.pre_climax_offset_s))
          : null,
      };

      return {
        date: s.date?.slice(0, 10),
        cascade_shape: cascadeShape,
        hr_avg_pre_to_climax: s.hr_avg_pre_to_climax,
        hr_avg_at_climax_window: s.hr_avg_at_climax_window,
        avg_hr: s.avg_hr,
        max_hr: s.max_hr,
        intensity: s.intensity,
        satisfaction: s.satisfaction,
        build_type: s.build_type,
        climax_duration: s.climax_duration,
        mood: s.mood,
        methods: s.methods,
        event_notes: annotatedEvents.length > 0 ? annotatedEvents : undefined,
        discomfort_entries: s.discomfort_entries?.length > 0 ? s.discomfort_entries : undefined,
        notes: s.notes || undefined,
      };
    });

    const withRecovery = summary.filter((s) => s.cascade_shape?.recovery_onset_s != null);
    const avgRecoveryOnset = withRecovery.length
      ? Math.round(withRecovery.reduce((a, s) => a + s.cascade_shape.recovery_onset_s, 0) / withRecovery.length)
      : null;

    const res = await base44.integrations.Core.InvokeLLM({
      model: "claude_sonnet_4_6",
      prompt: `You are a physiological research assistant analyzing sexual response cascade data across ${sessions.length} sessions.

Each session includes the full cascade arc: pre-climax buildup → climax peak → recovery onset.
Where available, event notes are annotated with HR values and their timing relative to the climax marker.

Session data:
${JSON.stringify(summary, null, 2)}

Provide a structured analysis covering:

1. CASCADE OVERVIEW: Describe the physiological arc across sessions — how the pre-climax build unfolds (rate of HR rise, build duration), the nature of the climax peak (intensity, HR at peak, climax duration), and the recovery trajectory (onset timing, recovery speed). Identify what is consistent and what varies. ${avgRecoveryOnset ? `Average recovery onset is ~${avgRecoveryOnset}s post-climax.` : ""}

2. EVENT NOTE PATTERNS: Analyze the annotated event notes across sessions. What physiological states (HR levels) are associated with logged events? Do events cluster at specific phases of the cascade? Do event types (stimulation changes, pauses, sensations) correlate with HR inflections or cascade shape?

3. COMMON SIGNATURES: Recurring physiological patterns across the full cascade arc.

4. PREDICTIVE INSIGHTS: Which factors (methods, mood, build_type, event patterns) best predict cascade quality (intensity, climax duration, recovery speed)?

5. ANOMALIES: Sessions with unusual cascade shapes, unexpected HR behavior, or atypical event-HR correlations.

6. PHENOTYPE CLUSTERS: Distinct cascade response profiles visible in this data.

Be specific, research-oriented, and reference actual data values where relevant.`,
      response_json_schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          cascade_overview: { type: "array", items: { type: "string" } },
          event_note_patterns: { type: "array", items: { type: "string" } },
          common_signatures: { type: "array", items: { type: "string" } },
          predictive_insights: { type: "array", items: { type: "string" } },
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
          phenotype_clusters: { type: "array", items: { type: "string" } },
        },
        required: ["summary", "cascade_overview", "event_note_patterns", "common_signatures", "predictive_insights", "anomalies", "phenotype_clusters"],
      },
    });

    console.log("AI Cascade result:", res);
    const raw = typeof res === "string" ? JSON.parse(res) : res;
    const parsed = raw?.response ?? raw;
    setResult(parsed);
    if (savedId) {
      await base44.entities.CascadeAnalysisResult.update(savedId, { result: parsed, session_count: sessions.length });
    } else {
      const created = await base44.entities.CascadeAnalysisResult.create({ result: parsed, session_count: sessions.length });
      setSavedId(created.id);
    }
    setLoading(false);
  };

  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
          <Brain className="w-4 h-4" /> AI Cascade Analysis
        </h3>
        <div className="flex items-center gap-2">
          {result && <TTSButton getText={() => {
            const parts = [result.summary];
            result.cascade_overview?.forEach(s => parts.push(s));
            result.event_note_patterns?.forEach(s => parts.push(s));
            result.common_signatures?.forEach(s => parts.push(s));
            result.predictive_insights?.forEach(s => parts.push(s));
            result.phenotype_clusters?.forEach(s => parts.push(s));
            result.anomalies?.forEach(a => parts.push(`${a.session_date}: ${a.finding}`));
            return parts.filter(Boolean).join('. ');
          }} />}
        <Button size="sm" onClick={analyze} disabled={loading || sessions.length < 2} className="h-7 text-xs gap-1.5">
          {loading
            ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Analyzing…</>
            : <><Brain className="w-3 h-3" />Analyze</>}
        </Button>
        </div>
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
            <p className="text-base text-foreground font-medium leading-relaxed border-l-2 border-primary pl-3">{result.summary}</p>
          ) : (
            <p className="text-xs text-muted-foreground italic">Analysis complete — no summary returned.</p>
          )}
          {result.cascade_overview?.length > 0 && (
            <Section icon={<Activity className="w-3.5 h-3.5" style={{ color: SECTION_COLORS["chart-1"] }} />} title="Cascade Overview" color="chart-1">
              {result.cascade_overview.map((s, i) => <Item key={i} text={s} />)}
            </Section>
          )}
          {result.event_note_patterns?.length > 0 && (
            <Section icon={<Clock className="w-3.5 h-3.5" style={{ color: SECTION_COLORS["chart-2"] }} />} title="Event Note Patterns" color="chart-2">
              {result.event_note_patterns.map((s, i) => <Item key={i} text={s} />)}
            </Section>
          )}
          {result.common_signatures?.length > 0 && (
            <Section icon={<TrendingDown className="w-3.5 h-3.5" style={{ color: SECTION_COLORS["accent"] }} />} title="Common Signatures" color="accent">
              {result.common_signatures.map((s, i) => <Item key={i} text={s} />)}
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
          {!result.summary && !result.cascade_overview?.length && !result.predictive_insights?.length && (
            <p className="text-xs text-muted-foreground italic">Analysis returned no content. Please try again.</p>
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
      <AIInsightPanel sessions={(eligibleSessions.length > 0 ? eligibleSessions : sessions).map(s => ({ ...s, _hrRows: hrData[s.id] || [] }))} />
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