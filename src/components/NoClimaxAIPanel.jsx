import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Brain, Activity, Lightbulb, TrendingUp, Zap, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import TTSReader from "./TTSReader";
import { EVENT_CATEGORIES } from "./session-form/EventTimelineSection";

function getCategoryMeta(value) {
  return EVENT_CATEGORIES.find((c) => c.value === value) || EVENT_CATEGORIES[EVENT_CATEGORIES.length - 1];
}

const SECTION_DEFS = [
  { key: "arousal_assessment", label: "Arousal Assessment", color: "hsl(var(--chart-2))", icon: <TrendingUp className="w-3.5 h-3.5" /> },
  { key: "event_analysis", label: "Event Analysis", color: "hsl(var(--chart-1))", icon: <Activity className="w-3.5 h-3.5" /> },
  { key: "near_climax_estimate", label: "Near-Climax Estimate", color: "hsl(var(--accent))", icon: <Target className="w-3.5 h-3.5" /> },
  { key: "physiological_findings", label: "Physiological Findings", color: "hsl(var(--chart-3))", icon: <Zap className="w-3.5 h-3.5" /> },
  { key: "recommendations", label: "Recommendations", color: "hsl(var(--primary))", icon: <Lightbulb className="w-3.5 h-3.5" /> },
];

export default function NoClimaxAIPanel({ session, timelineRows, userProfile }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(session.ai_no_climax ?? null);

  const analyze = async () => {
    setLoading(true);
    setResult(null);

    const hrSummary = timelineRows.length > 0 ? {
      total_points: timelineRows.length,
      duration_s: Math.round(Math.max(...timelineRows.map(r => Number(r.time_offset_s) || 0))),
      hr_min: Math.round(Math.min(...timelineRows.map(r => Number(r.hr)))),
      hr_max: Math.round(Math.max(...timelineRows.map(r => Number(r.hr)))),
      hr_avg: session.avg_hr,
    } : null;

    const sortedRows = [...timelineRows].sort((a, b) => Number(a.time_offset_s) - Number(b.time_offset_s));
    const nearestHR = (time_s) => {
      if (!sortedRows.length) return null;
      let best = sortedRows[0];
      let bestDist = Math.abs(Number(sortedRows[0].time_offset_s) - time_s);
      for (const r of sortedRows) {
        const d = Math.abs(Number(r.time_offset_s) - time_s);
        if (d < bestDist) { bestDist = d; best = r; }
      }
      return Math.round(Number(best.hr));
    };

    const eventTimeline = (session.event_timeline || []).map(e => {
      const m = Math.floor(e.time_s / 60);
      const s = (e.time_s % 60).toString().padStart(2, '0');
      const hr = nearestHR(e.time_s);
      const cats = Array.isArray(e.category) ? e.category : [e.category].filter(Boolean);
      const catLabels = cats.map(c => getCategoryMeta(c).label).join("+");
      return `[${catLabels}] ${m}:${s} — ${e.note}${hr != null ? ` [HR: ${hr} bpm]` : ''}`;
    });

    // HR trajectory analysis for near-climax estimation
    let hrPeaks = [];
    if (sortedRows.length > 10) {
      const windowSize = Math.max(3, Math.floor(sortedRows.length / 20));
      for (let i = windowSize; i < sortedRows.length - windowSize; i++) {
        const curr = Number(sortedRows[i].hr);
        const prev = Number(sortedRows[i - windowSize].hr);
        const next = Number(sortedRows[i + windowSize].hr);
        if (curr > prev + 8 && curr > next + 8) {
          hrPeaks.push({ time_s: Number(sortedRows[i].time_offset_s), hr: Math.round(curr) });
        }
      }
      // Deduplicate peaks that are close together (within 60s)
      hrPeaks = hrPeaks.reduce((acc, pk) => {
        if (!acc.length || pk.time_s - acc[acc.length - 1].time_s > 60) acc.push(pk);
        return acc;
      }, []);
    }

    const arousalProfile = userProfile && (userProfile.arousal_response_style || userProfile.climax_sensitivity)
      ? `\nUSER AROUSAL PROFILE:\n${JSON.stringify({
          arousal_response_style: userProfile.arousal_response_style,
          typical_build_duration: userProfile.typical_build_duration,
          climax_sensitivity: userProfile.climax_sensitivity,
          preferred_stimulation: userProfile.preferred_stimulation,
          arousal_notes: userProfile.arousal_notes,
        }, null, 2)}`
      : "";

    const res = await base44.integrations.Core.InvokeLLM({
      model: "claude_sonnet_4_6",
      prompt: `You are an expert sexual arousal physiologist. Analyze this INCOMPLETE session — one that did NOT result in climax. Your goal is to:

1. Assess the arousal arc and how far toward climax the user progressed
2. Analyze event timeline notes for physiological and arousal insights
3. ESTIMATE how many near-climax threshold events occurred (moments where the user was likely close to climax based on HR spikes, event notes, and arousal progression) — give a specific number estimate with reasoning
4. Identify physiological patterns and findings from the incomplete session
5. Provide specific recommendations for what might have enabled climax in this session

This is NOT a climax session — DO NOT reference climax as having occurred. Focus on the arousal trajectory and what the data reveals about the incomplete arc.
${arousalProfile}
${hrPeaks.length > 0 ? `\nDETECTED HR PEAK EVENTS (potential near-climax moments):\n${hrPeaks.map(p => `- ${Math.floor(p.time_s/60)}:${String(Math.round(p.time_s%60)).padStart(2,'0')} — HR spike to ${p.hr} bpm`).join('\n')}` : ''}
${eventTimeline.length > 0 ? `\nEVENT TIMELINE:\n${eventTimeline.join('\n')}` : ''}

Session data:
${JSON.stringify({
  date: session.date?.slice(0, 10),
  duration_minutes: session.duration_minutes,
  peak_arousal_level: session.intensity,
  build_quality: session.build_quality,
  build_type: session.build_type,
  satisfaction: session.satisfaction,
  mood: session.mood,
  environment: session.environment,
  methods: session.methods,
  foley_size: session.foley_size,
  foley_type: session.foley_type,
  estim_notes: session.estim_notes,
  hydration: session.hydration,
  substances: session.substances,
  discomfort_entries: session.discomfort_entries?.length > 0 ? session.discomfort_entries : undefined,
  unusual_sensations: session.unusual_sensations,
  notes: session.notes,
  hr_data: hrSummary,
}, null, 2)}`,
      response_json_schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          arousal_assessment: { type: "array", items: { type: "string" } },
          event_analysis: { type: "array", items: { type: "string" } },
          near_climax_estimate: { type: "array", items: { type: "string" }, description: "Estimated number of near-climax events with reasoning" },
          physiological_findings: { type: "array", items: { type: "string" } },
          recommendations: { type: "array", items: { type: "string" } },
        },
        required: ["summary", "arousal_assessment", "event_analysis", "near_climax_estimate", "physiological_findings", "recommendations"],
      },
    });

    const raw = typeof res === "string" ? JSON.parse(res) : res;
    const parsed = raw?.response ?? raw;
    setResult(parsed);
    await base44.entities.Session.update(session.id, { ai_no_climax: parsed });
    setLoading(false);
  };

  const paragraphs = result
    ? [result.summary, ...SECTION_DEFS.flatMap(s => result[s.key] || [])].filter(Boolean)
    : [];

  // Build idx → section meta for TTS rendering
  let pIdx = 0;
  const paraMap = result ? [] : [];
  if (result) {
    if (result.summary) paraMap.push({ type: "summary" });
    SECTION_DEFS.forEach(s => (result[s.key] || []).forEach(() => paraMap.push({ type: "section", sec: s })));
  }

  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
          <Brain className="w-4 h-4" /> AI Incomplete Session Analysis
        </h3>
        <Button size="sm" onClick={analyze} disabled={loading} className="h-7 text-xs gap-1.5">
          {loading
            ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Analyzing…</>
            : <><Brain className="w-3 h-3" />Analyze</>}
        </Button>
      </div>

      {!result && !loading && (
        <p className="text-xs text-muted-foreground">
          AI analysis for non-climax sessions: arousal arc assessment, near-climax event estimation, event notes review, physiological findings, and recommendations. Uses Claude Sonnet.
        </p>
      )}

      {result && (
        <div className="space-y-3">
          {result.summary && (
            <p className="text-base font-medium leading-relaxed border-l-2 border-primary/50 pl-3 py-1 text-foreground">
              {result.summary}
            </p>
          )}
          {SECTION_DEFS.map((sec) =>
            (result[sec.key] || []).length > 0 ? (
              <div key={sec.key} className="bg-muted/50 rounded-lg p-3 space-y-1.5">
                <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: sec.color }}>
                  {sec.icon}{sec.label}
                </p>
                <ul className="space-y-1">
                  {result[sec.key].map((item, i) => (
                    <li key={i} className="text-sm text-foreground pl-3 border-l-2 border-primary/30 leading-relaxed py-0.5">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}