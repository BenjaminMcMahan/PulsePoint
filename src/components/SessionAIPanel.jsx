import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Brain, AlertCircle, Activity, Lightbulb, TrendingUp, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

const SECTION_COLORS = {
  primary: "hsl(var(--primary))",
  "chart-1": "hsl(var(--chart-1))",
  "chart-2": "hsl(var(--chart-2))",
  "chart-4": "hsl(var(--chart-4))",
  accent: "hsl(var(--accent))",
  destructive: "hsl(var(--destructive))",
};

function Section({ icon, title, color, children }) {
  return (
    <div className="bg-muted/60 rounded-lg p-3 space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: SECTION_COLORS[color] }}>
        {icon}{title}
      </p>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  );
}

function Item({ text }) {
  return (
    <li className="text-sm text-foreground leading-relaxed pl-3 border-l-2 border-primary/40 py-1">
      {text}
    </li>
  );
}

export default function SessionAIPanel({ session, timelineRows }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(session.ai_analysis ?? null);

  const analyze = async () => {
    setLoading(true);
    setResult(null);

    const hrSummary = timelineRows.length > 0 ? {
      total_points: timelineRows.length,
      duration_s: Math.round(Math.max(...timelineRows.map(r => Number(r.time_offset_s) || 0))),
      hr_min: Math.round(Math.min(...timelineRows.map(r => Number(r.hr)))),
      hr_max: Math.round(Math.max(...timelineRows.map(r => Number(r.hr)))),
    } : null;

    const res = await base44.integrations.Core.InvokeLLM({
      model: "claude_sonnet_4_6",
      prompt: `You are a physiological research assistant analyzing a single sexual response session.

Session data:
${JSON.stringify({
  date: session.date?.slice(0, 10),
  duration_minutes: session.duration_minutes,
  intensity: session.intensity,
  satisfaction: session.satisfaction,
  build_quality: session.build_quality,
  build_type: session.build_type,
  climax_duration: session.climax_duration,
  mood: session.mood,
  methods: session.methods,
  foley_size: session.foley_size,
  foley_type: session.foley_type,
  estim_notes: session.estim_notes,
  avg_hr: session.avg_hr,
  max_hr: session.max_hr,
  hr_at_climax: session.hr_at_climax,
  hr_avg_pre_to_climax: session.hr_avg_pre_to_climax,
  hr_avg_at_climax_window: session.hr_avg_at_climax_window,
  pre_climax_offset_s: session.pre_climax_offset_s,
  climax_offset_s: session.climax_offset_s,
  recovery_offset_s: session.recovery_offset_s,
  ejaculate_volume: session.ejaculate_volume,
  hydration: session.hydration,
  discomfort: session.discomfort,
  unusual_sensations: session.unusual_sensations,
  refractory_notes: session.refractory_notes,
  notes: session.notes,
  hr_timeline_summary: hrSummary,
}, null, 2)}

Provide a thorough physiological analysis of this individual session. Be specific and research-oriented.`,
      response_json_schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          hr_analysis: { type: "array", items: { type: "string" } },
          phase_analysis: { type: "array", items: { type: "string" } },
          notable_findings: { type: "array", items: { type: "string" } },
          recommendations: { type: "array", items: { type: "string" } },
        },
        required: ["summary", "hr_analysis", "phase_analysis", "notable_findings", "recommendations"],
      },
    });

    const raw = typeof res === "string" ? JSON.parse(res) : res;
    const parsed = raw?.response ?? raw;
    setResult(parsed);
    await base44.entities.Session.update(session.id, { ai_analysis: parsed });
    setLoading(false);
  };

  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
          <Brain className="w-4 h-4" /> AI Session Analysis
        </h3>
        <Button size="sm" onClick={analyze} disabled={loading} className="h-7 text-xs gap-1.5">
          {loading
            ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Analyzing…</>
            : <><Brain className="w-3 h-3" />Analyze</>}
        </Button>
      </div>

      {!result && !loading && (
        <p className="text-xs text-muted-foreground">
          Click Analyze to generate a detailed AI physiological breakdown of this session. Uses Claude Sonnet.
        </p>
      )}

      {result && (
        <div className="space-y-3">
          {result.summary && (
            <p className="text-base text-foreground font-medium leading-relaxed border-l-2 border-primary pl-3">
              {result.summary}
            </p>
          )}
          {result.hr_analysis?.length > 0 && (
            <Section icon={<Activity className="w-3.5 h-3.5" />} title="Heart Rate Analysis" color="chart-1">
              {result.hr_analysis.map((s, i) => <Item key={i} text={s} />)}
            </Section>
          )}
          {result.phase_analysis?.length > 0 && (
            <Section icon={<TrendingUp className="w-3.5 h-3.5" />} title="Phase Analysis" color="chart-2">
              {result.phase_analysis.map((s, i) => <Item key={i} text={s} />)}
            </Section>
          )}
          {result.notable_findings?.length > 0 && (
            <Section icon={<Zap className="w-3.5 h-3.5" />} title="Notable Findings" color="chart-4">
              {result.notable_findings.map((s, i) => <Item key={i} text={s} />)}
            </Section>
          )}
          {result.recommendations?.length > 0 && (
            <Section icon={<Lightbulb className="w-3.5 h-3.5" />} title="Recommendations" color="accent">
              {result.recommendations.map((s, i) => <Item key={i} text={s} />)}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}