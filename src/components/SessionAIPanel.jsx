import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Brain, AlertCircle, Activity, Lightbulb, TrendingUp, Zap } from "lucide-react";
import TTSReader from "./TTSReader";
import { Button } from "@/components/ui/button";
import { EVENT_CATEGORIES } from "./session-form/EventTimelineSection";

function getCategoryMeta(value) {
  return EVENT_CATEGORIES.find((c) => c.value === value) || EVENT_CATEGORIES[EVENT_CATEGORIES.length - 1];
}

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

export default function SessionAIPanel({ session, timelineRows, userProfile }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(session.ai_analysis ?? null);

  const analyze = async () => {
    setLoading(true);
    setResult(null);

    const estimScreenshots = [
      ...(session.estim_screenshots || []),
      ...(session.estim_screenshot && !(session.estim_screenshots?.includes(session.estim_screenshot)) ? [session.estim_screenshot] : []),
    ].filter(Boolean);

    const hrSummary = timelineRows.length > 0 ? {
      total_points: timelineRows.length,
      duration_s: Math.round(Math.max(...timelineRows.map(r => Number(r.time_offset_s) || 0))),
      hr_min: Math.round(Math.min(...timelineRows.map(r => Number(r.hr)))),
      hr_max: Math.round(Math.max(...timelineRows.map(r => Number(r.hr)))),
    } : null;

    // Build a sorted HR lookup from timeline rows for nearest-HR matching
    const sortedRows = [...timelineRows].sort((a, b) => Number(a.time_offset_s) - Number(b.time_offset_s));
    const nearestHR = (time_s) => {
      if (!sortedRows.length) return null;
      let best = sortedRows[0];
      let bestDist = Math.abs(Number(sortedRows[0].time_offset_s) - time_s);
      for (const r of sortedRows) {
        const d = Math.abs(Number(r.time_offset_s) - time_s);
        if (d < bestDist) { bestDist = d; best = r; }
        if (Number(r.time_offset_s) > time_s + 10) break; // past the window, stop early
      }
      return Math.round(Number(best.hr));
    };

    const eventTimeline = (session.event_timeline || []).map(e => {
      const m = Math.floor(e.time_s / 60);
      const s = (e.time_s % 60).toString().padStart(2, '0');
      const hr = nearestHR(e.time_s);
      const catMeta = getCategoryMeta(e.category);
      const relToClimax = session.climax_offset_s != null ? Math.round(e.time_s - session.climax_offset_s) : null;
      const relStr = relToClimax != null ? ` (${relToClimax >= 0 ? "+" : ""}${relToClimax}s vs climax)` : "";
      return `[${catMeta.label}] ${m}:${s}${relStr} — ${e.note}${hr != null ? ` [HR: ${hr} bpm]` : ''}`;
    });

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

Use this arousal profile to personalize analysis: compare the observed build arc and climax pattern against the user's known response style. Note deviations (e.g. faster/slower than typical, more/less sensitive). Reference preferred methods when interpreting session effectiveness.` : "";

    const profileContext = userProfile && (userProfile.age || userProfile.resting_hr || userProfile.max_hr || userProfile.medications || userProfile.recovery_hr_60s) ? `

USER PHYSIOLOGICAL PROFILE:
${JSON.stringify({
  age: userProfile.age,
  weight_kg: userProfile.weight_kg,
  fitness_level: userProfile.fitness_level,
  resting_hr: userProfile.resting_hr,
  max_hr_true: userProfile.max_hr,
  max_hr_age_estimated: userProfile.age ? 220 - userProfile.age : null,
  typical_recovery_hr_60s_drop: userProfile.recovery_hr_60s,
  medications_conditions: userProfile.medications,
}, null, 2)}

Use this profile to compute Karvonen HR reserve zones (if resting + max HR available), interpret HR values relative to the user's true baseline, and contextualize recovery speed against their personal norm. Flag if medications likely suppress or elevate HR readings.` : "";

    const res = await base44.integrations.Core.InvokeLLM({
      model: "claude_sonnet_4_6",
      ...(estimScreenshots.length > 0 ? { file_urls: estimScreenshots } : {}),
      prompt: `You are a physiological research assistant analyzing a single sexual response session.${profileContext}${arousalProfile}${estimScreenshots.length > 0 ? `

IMPORTANT: ${estimScreenshots.length} E-Stim settings screenshot(s) from the Howl app are attached. Analyze the visible waveform types, frequencies, pulse widths, channel configurations, and intensity levels shown. Incorporate these E-Stim settings as a key factor in your physiological analysis — note how the specific settings likely contributed to the observed heart rate patterns, build quality, and climax response.` : ""}${eventTimeline.length > 0 ? `

EVENT TIMELINE (notable moments logged during the session):
${eventTimeline.join('\n')}
Incorporate these events into your analysis — note how stimulation changes, pauses, or electrode movements correlate with heart rate changes and the arousal arc.` : ""}${estimScreenshots.length > 0 ? `

IMPORTANT: ${estimScreenshots.length} E-Stim settings screenshot(s) from the Howl app are attached. Analyze the visible waveform types, frequencies, pulse widths, channel configurations, and intensity levels shown. Incorporate these E-Stim settings as a key factor in your physiological analysis — note how the specific settings likely contributed to the observed heart rate patterns, build quality, and climax response.` : ""}

Session data:
${JSON.stringify({
  date: session.date?.slice(0, 10),
  start_time_et: session.start_time || undefined,
  time_of_day: session.start_time ? (() => {
    const h = parseInt(session.start_time.split(":")[0], 10);
    if (h >= 5 && h < 12) return "morning (5am–12pm)";
    if (h >= 12 && h < 17) return "afternoon (12pm–5pm)";
    if (h >= 17 && h < 21) return "evening (5pm–9pm)";
    return "night (9pm–5am)";
  })() : undefined,
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
  discomfort_entries: session.discomfort_entries?.length > 0 ? session.discomfort_entries : undefined,
  unusual_sensations: session.unusual_sensations,
  refractory_notes: session.refractory_notes,
  notes: session.notes,
  hr_timeline_summary: hrSummary,
}, null, 2)}

If discomfort_entries are present, explicitly analyze each entry — consider severity, likely anatomical cause, and whether it correlates with specific stimulation phases, HR peaks, or logged events. Flag any entries that warrant attention.

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

      {result && (() => {
        const paras = [
          result.summary,
          ...(result.hr_analysis || []),
          ...(result.phase_analysis || []),
          ...(result.notable_findings || []),
          ...(result.recommendations || []),
        ].filter(Boolean);

        // Build a flat index → section label map for rendering
        let idx = 0;
        const sections = [];
        if (result.summary) sections.push({ label: null, color: "primary", items: [result.summary], start: idx++ });
        if (result.hr_analysis?.length) { sections.push({ label: "Heart Rate Analysis", color: "chart-1", icon: <Activity className="w-3.5 h-3.5" />, items: result.hr_analysis, start: idx }); idx += result.hr_analysis.length; }
        if (result.phase_analysis?.length) { sections.push({ label: "Phase Analysis", color: "chart-2", icon: <TrendingUp className="w-3.5 h-3.5" />, items: result.phase_analysis, start: idx }); idx += result.phase_analysis.length; }
        if (result.notable_findings?.length) { sections.push({ label: "Notable Findings", color: "chart-4", icon: <Zap className="w-3.5 h-3.5" />, items: result.notable_findings, start: idx }); idx += result.notable_findings.length; }
        if (result.recommendations?.length) { sections.push({ label: "Recommendations", color: "accent", icon: <Lightbulb className="w-3.5 h-3.5" />, items: result.recommendations, start: idx }); }

        return (
          <TTSReader
            paragraphs={paras}
            renderParagraph={(text, paraIdx, isActive) => {
              // Find which section this paragraph belongs to
              let section = sections[0];
              for (const sec of sections) {
                if (paraIdx >= sec.start) section = sec;
              }
              const isSummary = section.label === null;
              if (isSummary) {
                return (
                  <p className={`text-base font-medium leading-relaxed border-l-2 pl-3 py-1 transition-all duration-200 rounded-r-md ${isActive ? "border-primary bg-primary/8 text-foreground" : "border-primary/50 text-foreground"}`}>
                    {text}
                  </p>
                );
              }
              return (
                <li className={`text-sm leading-relaxed pl-3 border-l-2 py-1 transition-all duration-200 rounded-r-md list-none ${isActive ? "border-primary bg-primary/8 text-foreground font-medium" : "border-primary/30 text-foreground"}`}>
                  {text}
                </li>
              );
            }}
          />
        );
      })()}
    </div>
  );
}