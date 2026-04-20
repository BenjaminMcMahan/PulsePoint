import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Brain, Activity, TrendingUp, Zap, Lightbulb, AlertCircle } from "lucide-react";
import TTSButton from "./TTSButton";

const SECTION_COLORS = {
  "chart-1": "hsl(var(--chart-1))",
  "chart-2": "hsl(var(--chart-2))",
  "chart-4": "hsl(var(--chart-4))",
  accent: "hsl(var(--accent))",
  destructive: "hsl(var(--destructive))"
};

function Section({ icon, title, color, children }) {
  return (
    <div className="bg-muted/40 rounded-lg p-3 space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: SECTION_COLORS[color] }}>
        {icon}{title}
      </p>
      <ul className="space-y-1.5">{children}</ul>
    </div>);

}

function Item({ text }) {
  return (
    <li className="text-[#ffffff] pl-3 py-0.5 text-sm leading-relaxed border-l-2 border-primary/40">{text}</li>);

}

export default function CompareAIPanel({ sessions }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [savedId, setSavedId] = useState(null);
  const sessionKey = sessions.map((s) => s.id).sort().join(",");
  const prevKeyRef = useRef(null);

  // Load persisted result for this exact set of sessions
  useEffect(() => {
    if (prevKeyRef.current === sessionKey) return;
    prevKeyRef.current = sessionKey;
    setResult(null);
    setSavedId(null);

    base44.entities.CompareAnalysisResult.filter({ session_key: sessionKey }, "-updated_date", 1).then((rows) => {
      if (rows[0]) {
        setResult(rows[0].result);
        setSavedId(rows[0].id);
      } else {
        // No cached result — auto-run analysis
        runAnalysis(null);
      }
    });
  }, [sessionKey]);

  const runAnalysis = async (existingId) => {
    setLoading(true);
    try {
      const summary = sessions.map((s) => {
        const h = s.start_time ? parseInt(s.start_time.split(":")[0], 10) : null;
        const timeOfDay = h !== null ?
        h >= 5 && h < 12 ? "morning" : h >= 12 && h < 17 ? "afternoon" : h >= 17 && h < 21 ? "evening" : "night" :
        undefined;
        return {
          date: s.date?.slice(0, 10),
          start_time_et: s.start_time || undefined,
          time_of_day: timeOfDay,
          duration_minutes: s.duration_minutes,
          intensity: s.intensity,
          satisfaction: s.satisfaction,
          build_quality: s.build_quality,
          build_type: s.build_type,
          climax_duration: s.climax_duration,
          mood: s.mood,
          methods: s.methods,
          avg_hr: s.avg_hr,
          max_hr: s.max_hr,
          hr_at_climax: s.hr_at_climax,
          hr_avg_pre_to_climax: s.hr_avg_pre_to_climax,
          hr_avg_at_climax_window: s.hr_avg_at_climax_window,
          pre_climax_offset_s: s.pre_climax_offset_s,
          climax_offset_s: s.climax_offset_s,
          recovery_offset_s: s.recovery_offset_s
        }; // closes the object literal
      }); // closes the .map()

      const res = await base44.integrations.Core.InvokeLLM({
        model: "claude_sonnet_4_6",
        prompt: `You are a physiological research assistant. Compare the following ${sessions.length} sexual response sessions side-by-side.

For each session, analyze the full cascade arc: Build Phase → Pre-Climax → Climax → Recovery.
Focus on: HR trajectories, phase durations, build types, climax quality, recovery speed, and any event notes.
Identify meaningful physiological differences and patterns across sessions.

Sessions:
${JSON.stringify(summary, null, 2)}

Provide a structured comparative analysis.`,
        response_json_schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            key_differences: { type: "array", items: { type: "string" } },
            hr_comparison: { type: "array", items: { type: "string" } },
            phase_comparison: { type: "array", items: { type: "string" } },
            standout_session: { type: "string" },
            recommendations: { type: "array", items: { type: "string" } }
          },
          required: ["summary", "key_differences", "hr_comparison", "phase_comparison", "recommendations"]
        }
      });

      const raw = typeof res === "string" ? JSON.parse(res) : res;
      const parsed = raw?.response ?? raw;
      setResult(parsed);

      if (existingId) {
        await base44.entities.CompareAnalysisResult.update(existingId, { result: parsed, session_key: sessionKey });
      } else {
        const created = await base44.entities.CompareAnalysisResult.create({ result: parsed, session_key: sessionKey });
        setSavedId(created.id);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
          <Brain className="w-4 h-4" /> AI Comparison Analysis
        </h3>
        <div className="flex items-center gap-2">
          {result && <TTSButton getText={() => {
            const parts = [result.summary, result.standout_session];
            result.key_differences?.forEach((s) => parts.push(s));
            result.hr_comparison?.forEach((s) => parts.push(s));
            result.phase_comparison?.forEach((s) => parts.push(s));
            result.recommendations?.forEach((s) => parts.push(s));
            return parts.filter(Boolean).join('. ');
          }} />}
        <button
            onClick={() => runAnalysis(savedId)}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold flex items-center gap-1.5 disabled:opacity-50">
            
          {loading ?
            <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Analyzing…</> :
            <><Brain className="w-3 h-3" />Re-analyze</>}
        </button>
        </div>
      </div>

      {loading && !result &&
      <p className="text-xs text-muted-foreground animate-pulse">Running AI comparison analysis…</p>
      }

      {result &&
      <div className="space-y-3">
          {result.summary &&
        <p className="text-sm text-foreground leading-relaxed border-l-2 border-primary pl-3">{result.summary}</p>
        }
          {result.key_differences?.length > 0 &&
        <Section icon={<AlertCircle className="w-3.5 h-3.5" />} title="Key Differences" color="chart-1">
              {result.key_differences.map((s, i) => <Item key={i} text={s} />)}
            </Section>
        }
          {result.hr_comparison?.length > 0 &&
        <Section icon={<Activity className="w-3.5 h-3.5" />} title="Heart Rate Comparison" color="chart-2">
              {result.hr_comparison.map((s, i) => <Item key={i} text={s} />)}
            </Section>
        }
          {result.phase_comparison?.length > 0 &&
        <Section icon={<TrendingUp className="w-3.5 h-3.5" />} title="Phase Comparison" color="chart-4">
              {result.phase_comparison.map((s, i) => <Item key={i} text={s} />)}
            </Section>
        }
          {result.standout_session &&
        <Section icon={<Zap className="w-3.5 h-3.5" />} title="Standout Session" color="accent">
              <Item text={result.standout_session} />
            </Section>
        }
          {result.recommendations?.length > 0 &&
        <Section icon={<Lightbulb className="w-3.5 h-3.5" />} title="Recommendations" color="destructive">
              {result.recommendations.map((s, i) => <Item key={i} text={s} />)}
            </Section>
        }
        </div>
      }
    </div>);

}