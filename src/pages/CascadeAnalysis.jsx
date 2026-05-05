import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, ReferenceLine } from
"recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, Activity, TrendingDown, Clock, Zap, AlertCircle } from "lucide-react";
import TTSReader from "../components/TTSReader";

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
  "destructive": "hsl(var(--destructive))"
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
      title={`${Math.round(value)} bpm`}>
      
      {Math.round(value)}
    </td>);

}

// ─── Section / Item for AI output ─────────────────────────────────────────────

function Section({ icon, title, color, children }) {
  return (
    <div>
      <p className="flex items-center gap-1 font-semibold mb-1.5" style={{ color: SECTION_COLORS[color] }}>
        {icon}{title}
      </p>
      <ul className="space-y-1">{children}</ul>
    </div>);

}

function Item({ text }) {
  return (
    <li className="text-[#ffffff] pl-3 py-0.5 text-sm leading-relaxed border-l-2 border-primary/40">• {text}</li>);

}

// ─── AI Insight panel ─────────────────────────────────────────────────────────

function AIInsightPanel({ sessions }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [savedId, setSavedId] = useState(null);
  const [userProfile, setUserProfile] = useState(null);

  useEffect(() => {
    base44.entities.CascadeAnalysisResult.list("-updated_date", 1).then((rows) => {
      if (rows[0]) {
        setResult(rows[0].result);
        setSavedId(rows[0].id);
      }
    });
    base44.auth.me().then((u) => setUserProfile(u)).catch(() => {});
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
        if (d < bestDist) {bestDist = d;best = r;}
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

      // Annotate events with HR and category — TTS-friendly word format
      const formatTimeWords = (seconds) => {
        const m = Math.floor(seconds / 60);
        const sec = Math.round(seconds % 60);
        if (m === 0) return `${sec} second${sec !== 1 ? "s" : ""}`;
        if (sec === 0) return `${m} minute${m !== 1 ? "s" : ""}`;
        return `${m} minute${m !== 1 ? "s" : ""} and ${sec} second${sec !== 1 ? "s" : ""}`;
      };
      const annotatedEvents = (s.event_timeline || []).map((e) => {
        const timeWords = formatTimeWords(e.time_s);
        const hr = nearestHR(rows, e.time_s);
        const relToClimax = s.climax_offset_s != null ? Math.round(e.time_s - s.climax_offset_s) : null;
        const relStr = relToClimax != null ? ` (${formatTimeWords(Math.abs(relToClimax))} ${relToClimax >= 0 ? "after" : "before"} climax)` : "";
        const cats = Array.isArray(e.category) ? e.category : [e.category].filter(Boolean);
        const catStr = cats.length ? `[${cats.join("+")}]` : "";
        return `${catStr} at ${timeWords}${relStr} — ${e.note}${hr != null ? ` (heart rate: ${hr} beats per minute)` : ""}`.trim();
      });

      // Build cascade shape: HR at pre-climax, climax, and recovery markers
      const cascadeShape = {
        hr_at_pre_climax_marker: hrAt(s.pre_climax_offset_s),
        hr_at_climax_marker: s.hr_at_climax || hrAt(s.climax_offset_s),
        hr_at_recovery_marker: hrAt(s.recovery_offset_s),
        build_duration_s: s.pre_climax_offset_s != null ? Math.round(s.climax_offset_s - s.pre_climax_offset_s) : null,
        recovery_onset_s: s.recovery_offset_s != null ? Math.round(s.recovery_offset_s - s.climax_offset_s) : null,
        hr_rise_pre_to_climax: (s.hr_at_climax || hrAt(s.climax_offset_s)) != null && hrAt(s.pre_climax_offset_s) != null ?
        Math.round((s.hr_at_climax || hrAt(s.climax_offset_s)) - hrAt(s.pre_climax_offset_s)) :
        null
      };

      const dateObj = s.date ? new Date(s.date) : null;
      const spokenDate = dateObj ? dateObj.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : null;

      return {
        date: spokenDate,
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
        notes: s.notes || undefined
      };
    });

    const withRecovery = summary.filter((s) => s.cascade_shape?.recovery_onset_s != null);
    const avgRecoveryOnset = withRecovery.length ?
    Math.round(withRecovery.reduce((a, s) => a + s.cascade_shape.recovery_onset_s, 0) / withRecovery.length) :
    null;

    const arousalProfile = userProfile && (userProfile.arousal_response_style || userProfile.arousal_notes || userProfile.climax_sensitivity) ? `

USER AROUSAL PROFILE:
${JSON.stringify({
  arousal_response_style: userProfile.arousal_response_style,
  typical_build_duration: userProfile.typical_build_duration,
  climax_sensitivity: userProfile.climax_sensitivity,
  preferred_stimulation: userProfile.preferred_stimulation,
  refractory_pattern: userProfile.refractory_pattern,
  arousal_notes: userProfile.arousal_notes,
}, null, 2)}

Use this profile throughout the analysis — compare observed cascade patterns against the user's known arousal response style. Note sessions that align with or deviate from their typical build arc, sensitivity, and refractory pattern.` : "";

    const res = await base44.integrations.Core.InvokeLLM({
      model: "claude_sonnet_4_6",
      prompt: `You are a physiological research assistant analyzing sexual response cascade data across ${sessions.length} sessions. Write directly to the person — use "you" and "your" throughout, as if speaking to them personally.

CRITICAL FOR TEXT-TO-SPEECH QUALITY:
- Write all times as words: "ten minutes and thirty seconds" not "10:30"
- Spell out all numbers as words (e.g., "seventy-two beats per minute" not "72 bpm", "eight out of ten" not "8/10")
- Write "beats per minute" not "bpm", "heart rate" not "HR", "seconds" not "s", "minutes" not "min"
- Write in conversational, sentence-based prose with natural pauses — no bullet points, no lists, no markdown
- Use short sentences and simple grammar optimized for audio readability
- Explain anatomical terms briefly and accessibly — don't assume medical background
- Use commas and periods to create natural speech cadence
- Never start a sentence with a digit — restructure if needed
${arousalProfile}

Each session includes the full cascade arc: pre-climax buildup, climax peak, and recovery onset.
Where available, event notes are annotated with heart rate values and their timing relative to the climax marker.

Session data:
${JSON.stringify(summary, null, 2)}

Provide a structured analysis covering:

1. CASCADE OVERVIEW: Describe the physiological arc across sessions — how the pre-climax build unfolds, the nature of the climax peak, and the recovery trajectory. Identify what is consistent and what varies. ${avgRecoveryOnset ? `Average recovery onset is approximately ${avgRecoveryOnset} seconds post-climax.` : ""}

2. EVENT NOTE PATTERNS: Analyze the annotated event notes across sessions. What physiological states are associated with logged events? Do events cluster at specific phases? Do event types correlate with heart rate inflections or cascade shape?

3. COMMON SIGNATURES: Recurring physiological patterns across the full cascade arc.

4. PREDICTIVE INSIGHTS: Which factors best predict cascade quality — intensity, climax duration, recovery speed?

5. ANOMALIES: Sessions with unusual cascade shapes, unexpected heart rate behavior, or atypical event correlations.

6. PHENOTYPE CLUSTERS: Distinct cascade response profiles visible in this data.

Be specific and reference actual values — but always written as spoken words, never digits or abbreviations.`,
      response_json_schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          cascade_overview: { type: "array", items: { type: "string" } },
          event_note_patterns: { type: "array", items: { type: "string" } },
          common_signatures: { type: "array", items: { type: "string" } },
          predictive_insights: { type: "array", items: { type: "string" } },
          anomalies: { type: "array", items: { type: "string" } },
          phenotype_clusters: { type: "array", items: { type: "string" } }
        },
        required: ["summary", "cascade_overview", "event_note_patterns", "common_signatures", "predictive_insights", "anomalies", "phenotype_clusters"]
      }
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
        <Button size="sm" onClick={analyze} disabled={loading || sessions.length < 2} className="h-7 text-xs gap-1.5">
          {loading ?
            <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Analyzing…</> :
            <><Brain className="w-3 h-3" />Analyze</>}
        </Button>
        </div>
      </div>

      {sessions.length < 2 &&
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" />Need at least 2 sessions with climax markers to run AI analysis.
        </p>
      }

      {!result && !loading && sessions.length >= 2 &&
      <p className="text-xs text-muted-foreground">
          Click Analyze to generate AI-powered physiological insights across all aligned sessions. Uses Claude Sonnet (advanced model).
        </p>
      }

      {result && (() => {
        const paras = [
          result.summary,
          ...(result.cascade_overview || []),
          ...(result.event_note_patterns || []),
          ...(result.common_signatures || []),
          ...(result.predictive_insights || []),
          ...(result.phenotype_clusters || []),
          ...(result.anomalies || []),
        ].filter(Boolean);

        if (!paras.length) return <p className="text-xs text-muted-foreground italic">Analysis returned no content. Please try again.</p>;

        return (
          <TTSReader
            paragraphs={paras}
            renderParagraph={(text, idx, isActive) => (
              <p className={`text-sm leading-relaxed pl-3 border-l-2 py-1 transition-all duration-200 rounded-r-md ${
                idx === 0
                  ? isActive ? "border-primary bg-primary/10 text-foreground font-bold" : "border-primary text-foreground font-medium"
                  : isActive ? "border-primary bg-primary/8 text-foreground font-medium" : "border-primary/30 text-[#ffffff]"
              }`}>
                {text}
              </p>
            )}
          />
        );
      })()}
    </div>);

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
      </div>);

  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-center px-6">
        <Activity className="w-10 h-10 text-muted-foreground" />
        <p className="text-muted-foreground text-sm">No sessions with climax markers found. Set climax markers in a session to enable cascade analysis.</p>
      </div>);

  }

  return (
    <div className="px-4 py-6 pb-24 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cascade Analysis</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{eligibleSessions.length} sessions aligned by climax event</p>
      </div>

      {/* Window selector */}
      <div className="flex gap-1 flex-wrap">
        {[60, 120, 180, 300].map((w) =>
        <Button key={w} size="sm" variant={windowSec === w ? "default" : "outline"} className="h-7 text-xs" onClick={() => setWindowSec(w)}>
            ±{w / 60}m
          </Button>
        )}
      </div>

      {eligibleSessions.length === 0 &&
      <div className="bg-muted/40 rounded-xl p-4 text-sm text-muted-foreground text-center">
          Sessions have climax markers but no imported HR data. Upload HR CSVs to enable cascade visualizations.
        </div>
      }

      {/* Overlaid HR curves */}
      {eligibleSessions.length > 0 &&
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
                name === "_avg" ? "Avg" : eligibleSessions.find((s) => s.id === name)?.date?.slice(0, 10) || name]
                }
                contentStyle={{ fontSize: 10 }} />
              
                <ReferenceLine x={0} stroke="#ef4444" strokeWidth={2} label={{ value: "Climax", fontSize: 8, fill: "#ef4444", position: "top" }} />
                {eligibleSessions.map((s, i) =>
              <Line key={s.id} type="monotone" dataKey={s.id} stroke={PHASE_COLORS[i % PHASE_COLORS.length]} strokeWidth={1} dot={false} strokeOpacity={0.4} connectNulls isAnimationActive={false} />
              )}
                <Line type="monotone" dataKey="_avg" stroke="#ffffff" strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} name="Avg" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-muted-foreground">White line = population average. Colored lines = individual sessions.</p>
        </div>
      }

      {/* Heatmap */}
      {alignedData.length > 0 &&
      <div className="bg-card rounded-xl border border-border p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">HR Heatmap (sessions × time)</h3>
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-0.5">
              <thead>
                <tr>
                  <th className="text-[8px] text-muted-foreground text-left pr-2 font-normal w-12">Session</th>
                  {buckets.filter((_, i) => i % 4 === 0).map((t) =>
                <th key={t} className="text-[7px] text-muted-foreground font-normal" colSpan={4}>{fmtRel(t)}</th>
                )}
                </tr>
              </thead>
              <tbody>
                {alignedData.map(({ session, series }) =>
              <tr key={session.id}>
                    <td className="text-[8px] text-muted-foreground pr-2 whitespace-nowrap">{session.date?.slice(5, 10)}</td>
                    {buckets.map((t) =>
                <HeatmapCell key={t} value={series[t]} min={hrMin} max={hrMax} />
                )}
                  </tr>
              )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[9px] text-muted-foreground">{Math.round(hrMin)} bpm</span>
            <div className="flex-1 h-2 rounded" style={{ background: "linear-gradient(to right, rgb(59,130,246), rgb(239,68,68))" }} />
            <span className="text-[9px] text-muted-foreground">{Math.round(hrMax)} bpm</span>
          </div>
        </div>
      }

      {/* Phase timing summary */}
      {eligibleSessions.length > 0 &&
      <PhaseSummary sessions={eligibleSessions} />
      }

      {/* AI Panel */}
      <AIInsightPanel sessions={(eligibleSessions.length > 0 ? eligibleSessions : sessions).map((s) => ({ ...s, _hrRows: hrData[s.id] || [] }))} />
    </div>);

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
        {avgPre &&
        <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-[9px] text-muted-foreground uppercase">Avg Build→Climax</p>
            <p className="text-xl font-bold font-mono text-chart-3">{fmtDur(avgPre)}</p>
          </div>
        }
        {avgRec &&
        <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-[9px] text-muted-foreground uppercase">Avg Recovery Onset</p>
            <p className="text-xl font-bold font-mono text-chart-2">{fmtDur(avgRec)}</p>
          </div>
        }
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
            </div>);

        })}
      </div>
    </div>);

}