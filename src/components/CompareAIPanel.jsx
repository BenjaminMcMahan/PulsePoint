import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Brain, Activity, TrendingUp, Zap, Lightbulb, AlertCircle } from "lucide-react";
import TTSReader from "./TTSReader";

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
          recovery_offset_s: s.recovery_offset_s,
          ejaculate_volume: s.ejaculate_volume,
          unusual_sensations: s.unusual_sensations || undefined,
          discomfort_entries: s.discomfort_entries?.length ? s.discomfort_entries : undefined,
          notes: s.notes || undefined,
          tags: s.tags?.length ? s.tags : undefined,
          event_count: (s.event_timeline || []).length,
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

      {result && (() => {
        const paras = [
          result.summary,
          ...(result.key_differences || []),
          ...(result.hr_comparison || []),
          ...(result.phase_comparison || []),
          ...(result.standout_session ? [result.standout_session] : []),
          ...(result.recommendations || []),
        ].filter(Boolean);

        return (
          <TTSReader
            paragraphs={paras}
            renderParagraph={(text, idx, isActive) => {
              const isSummary = text === result.summary;
              return (
                <p className={`text-sm leading-relaxed pl-3 border-l-2 py-1 transition-all duration-200 rounded-r-md ${
                  isActive
                    ? "border-primary bg-primary/10 text-foreground font-medium"
                    : isSummary
                    ? "border-primary/60 text-foreground"
                    : "border-primary/30 text-[#ffffff]"
                }`}>
                  {text}
                </p>
              );
            }}
          />
        );
      })()}
    </div>);

}