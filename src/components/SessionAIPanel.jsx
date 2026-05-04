import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Brain, AlertCircle, Activity, Lightbulb, TrendingUp, Zap, ChevronDown, ChevronUp } from "lucide-react";
import TTSReader from "./TTSReader";
import { Button } from "@/components/ui/button";
import { EVENT_CATEGORIES } from "./session-form/EventTimelineSection";
import AIChat from "./AIChat";

function buildSessionContext(session, timelineRows) {
  const hrMin = timelineRows.length ? Math.round(Math.min(...timelineRows.map(r => Number(r.hr)))) : null;
  const hrMax = timelineRows.length ? Math.round(Math.max(...timelineRows.map(r => Number(r.hr)))) : null;
  return [
    `Session date: ${session.date?.slice(0, 10)}`,
    `Duration: ${session.duration_minutes ?? "?"}min`,
    `Methods: ${(session.methods || []).join(", ")}`,
    session.foley_size ? `Foley: ${session.foley_size}Fr ${session.foley_type || ""}` : null,
    session.estim_notes ? `E-Stim notes: ${session.estim_notes}` : null,
    `Intensity: ${session.intensity}/10, Build quality: ${session.build_quality}/10, Satisfaction: ${session.satisfaction}/10`,
    `Build type: ${session.build_type}${session.custom_build_type ? " — " + session.custom_build_type : ""}`,
    `Climax duration: ${session.climax_duration ?? "?"}`,
    `Mood: ${session.mood}, Hydration: ${session.hydration}`,
    hrMin != null ? `HR: min ${hrMin}, avg ${session.avg_hr ?? "?"}, max ${hrMax}, at climax ${session.hr_at_climax ?? "?"}` : null,
    session.pre_climax_offset_s != null ? `Phase markers: pre-climax ${Math.round(session.pre_climax_offset_s)}s, climax ${Math.round(session.climax_offset_s)}s, recovery ${session.recovery_offset_s != null ? Math.round(session.recovery_offset_s) + "s" : "?"}` : null,
    session.ejaculate_volume ? `Ejaculate: ${session.ejaculate_volume}` : null,
    session.unusual_sensations ? `Unusual sensations: ${session.unusual_sensations}` : null,
    (session.discomfort_entries || []).length ? `Discomfort: ${session.discomfort_entries.map(e => `sev ${e.severity}/10 — ${e.note}`).join("; ")}` : null,
    (session.event_timeline || []).length ? `Events: ${session.event_timeline.map(e => `[${e.time_s}s] ${e.note}`).join(" | ")}` : null,
    session.notes ? `Session notes: ${session.notes}` : null,
    session.ai_analysis?.summary ? `AI analysis summary: ${session.ai_analysis.summary}` : null,
  ].filter(Boolean).join("\n");
}

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
  const [collapsed, setCollapsed] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(session.ai_analysis ?? null);
  const [chatMessages, setChatMessages] = useState(session.ai_analysis?._chat_messages || []);
  const [sessionNotes, setSessionNotes] = useState(session.notes || "");

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

    // Sample HR trajectory for the prompt (~1 point every 15s)
    const hrTrajectory = (() => {
      if (!timelineRows.length) return null;
      const step = Math.max(1, Math.floor(timelineRows.length / 60));
      return timelineRows
        .filter((_, i) => i % step === 0)
        .map(r => `${Math.round(Number(r.time_offset_s))}s:${Math.round(Number(r.hr))}`)
        .join("  ");
    })();

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

    const formatTimeWords = (seconds) => {
      const m = Math.floor(seconds / 60);
      const s = Math.round(seconds % 60);
      if (m === 0) return `${s} second${s !== 1 ? 's' : ''}`;
      if (s === 0) return `${m} minute${m !== 1 ? 's' : ''}`;
      return `${m} minute${m !== 1 ? 's' : ''} and ${s} second${s !== 1 ? 's' : ''}`;
    };

    const eventTimeline = (session.event_timeline || []).map(e => {
      const timeWords = formatTimeWords(e.time_s);
      const hr = nearestHR(e.time_s);
      const catMeta = getCategoryMeta(e.category);
      const relToClimax = session.climax_offset_s != null ? Math.round(e.time_s - session.climax_offset_s) : null;
      const relStr = relToClimax != null ? ` (${formatTimeWords(Math.abs(relToClimax))} ${relToClimax >= 0 ? 'after' : 'before'} climax)` : "";
      return `[${catMeta.label}] at ${timeWords}${relStr} — ${e.note}${hr != null ? ` (heart rate: ${hr} beats per minute)` : ''}`;
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

    const res = await base44.integrations.Core.InvokeLLM({
      model: "claude_sonnet_4_6",
      ...(estimScreenshots.length > 0 ? { file_urls: estimScreenshots } : {}),
      prompt: `You are an expert physiologist and anatomist specializing in sexual response. Analyze this session integrating arousal physiology, anatomy, heart rate data, event timeline, and subjective experience into a cohesive narrative. Write directly to the person — use "you" and "your" throughout, as if speaking to them personally.

PHYSIOLOGICAL & ANATOMICAL LENS — apply throughout:
- Interpret HR trajectory as a real-time window into sympathetic nervous system activation, parasympathetic withdrawal, and autonomic arousal state
- Reference relevant anatomy where appropriate: pelvic floor muscle engagement, smooth muscle tone in the bladder neck and urethra, prostatic engorgement, pudendal nerve pathways, bulbocavernosus/ischiocavernosus muscle activity
- Where foley or urethral stimulation is involved, consider the urethral sensory nerve density, stretch receptor activation, and internal urethral sphincter dynamics
- Where e-stim is involved, consider motor nerve recruitment, muscle contraction patterns, and how frequency/pulse-width affect sensory vs motor fibers
- Connect subjective sensations (pressure, throb, tightness, wave) to their likely anatomical generators
- Interpret discomfort entries through an anatomical lens — likely tissue, nerve, or positional cause
- Note how stimulation pauses affect sympathetic tone and re-arousal dynamics based on HR recovery pattern

CRITICAL FOR TEXT-TO-SPEECH QUALITY:
- Write all times as words: "ten minutes and thirty seconds" not "10:30"
- Spell out all numbers as words (e.g., "ten beats per minute" not "10 bpm")
- Write in conversational, sentence-based prose with natural pauses
- Use short sentences and simple grammar optimized for audio readability
- Avoid dense jargon — explain anatomical concepts briefly but accessibly
- Use commas and periods to create natural speech cadence
${arousalProfile}${estimScreenshots.length > 0 ? `

E-STIM SCREENSHOTS ATTACHED (${estimScreenshots.length}): Analyze the waveform types, frequencies, pulse widths, and channel configurations. Interpret how these settings recruited sensory vs motor fibers, shaped smooth muscle tone, and drove the arousal arc through the session.` : ""}${eventTimeline.length > 0 ? `

SESSION EVENT TIMELINE (with heart rate at each moment):
${eventTimeline.join('\n')}

This is the primary dataset. For each event: interpret the arousal state at that HR level, what the note reveals about the underlying physiology or anatomy, and how it connects to the session arc. Identify physiological turning points — moments where HR + event note together reveal a shift in autonomic or sensory state.` : ""}

${hrTrajectory ? `HR TRAJECTORY (time_s:bpm, sampled):
${hrTrajectory}

Use this to trace sympathetic activation patterns, identify arousal plateaus, and correlate HR changes to event timing.` : ""}

Session data:
${JSON.stringify({
  date: session.date?.slice(0, 10),
  time_of_day: session.start_time ? (() => {
    const h = parseInt(session.start_time.split(":")[0], 10);
    if (h >= 5 && h < 12) return "morning";
    if (h >= 12 && h < 17) return "afternoon";
    if (h >= 17 && h < 21) return "evening";
    return "night";
  })() : undefined,
  duration_minutes: session.duration_minutes,
  intensity: session.intensity,
  satisfaction: session.satisfaction,
  build_quality: session.build_quality,
  build_type: session.build_type,
  climax_duration: session.climax_duration,
  mood: session.mood,
  environment: session.environment,
  methods: session.methods,
  foley_size: session.foley_size,
  foley_type: session.foley_type,
  estim_notes: session.estim_notes,
  ejaculate_volume: session.ejaculate_volume,
  hydration: session.hydration,
  substances: session.substances,
  discomfort_entries: session.discomfort_entries?.length > 0 ? session.discomfort_entries : undefined,
  unusual_sensations: session.unusual_sensations,
  refractory_notes: session.refractory_notes,
  notes: session.notes,
  hr: hrSummary ? { avg: session.avg_hr, max: session.max_hr, hr_at_climax: session.hr_at_climax, min: hrSummary.hr_min } : undefined,
  phase_markers_s: {
    pre_climax: session.pre_climax_offset_s,
    climax: session.climax_offset_s,
    recovery: session.recovery_offset_s,
  },
}, null, 2)}

${session.discomfort_entries?.length > 0 ? "Discomfort entries present — analyze each for likely anatomical cause (nerve, tissue, positional), severity context, and whether it disrupted the arousal arc." : ""}

Provide a rich, physiologically-grounded analysis that tells the story of this session — from the autonomic and anatomical level up to the subjective experience.`,
      response_json_schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          arousal_arc: { type: "array", items: { type: "string" } },
          event_analysis: { type: "array", items: { type: "string" } },
          notable_findings: { type: "array", items: { type: "string" } },
          recommendations: { type: "array", items: { type: "string" } },
        },
        required: ["summary", "arousal_arc", "event_analysis", "notable_findings", "recommendations"],
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
        <button className="flex items-center gap-1.5 flex-1 text-left" onClick={() => setCollapsed((v) => !v)}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <Brain className="w-4 h-4" /> AI Session Analysis
          </h3>
          {collapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground ml-1" /> : <ChevronUp className="w-4 h-4 text-muted-foreground ml-1" />}
        </button>
        <Button size="sm" onClick={analyze} disabled={loading} className="h-7 text-xs gap-1.5">
          {loading
            ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Analyzing…</>
            : <><Brain className="w-3 h-3" />Analyze</>}
        </Button>
      </div>

      {!collapsed && !result && !loading && (
        <p className="text-xs text-muted-foreground">
          Click Analyze to generate a detailed AI physiological breakdown of this session. Uses Claude Sonnet.
        </p>
      )}

      {!collapsed && (
        <AIChat
          mode="session"
          context={buildSessionContext(session, timelineRows)}
          savedMessages={chatMessages}
          savedNotes={sessionNotes}
          onSaveMessages={async (msgs) => {
            setChatMessages(msgs);
            const updated = { ...(result || {}), _chat_messages: msgs };
            await base44.entities.Session.update(session.id, { ai_analysis: updated });
          }}
          onSaveNotes={async (merged) => {
            setSessionNotes(merged);
            await base44.entities.Session.update(session.id, { notes: merged });
          }}
        />
      )}

      {!collapsed && result && (() => {
        // Support both old schema (hr_analysis/phase_analysis) and new schema (arousal_arc/event_analysis)
        const arousalItems = result.arousal_arc || result.phase_analysis || [];
        const eventItems = result.event_analysis || result.hr_analysis || [];

        const paras = [
          result.summary,
          ...arousalItems,
          ...eventItems,
          ...(result.notable_findings || []),
          ...(result.recommendations || []),
        ].filter(Boolean);

        // Build a flat index → section label map for rendering
        let idx = 0;
        const sections = [];
        if (result.summary) sections.push({ label: null, color: "primary", items: [result.summary], start: idx++ });
        if (arousalItems.length) { sections.push({ label: "Arousal Arc", color: "chart-2", icon: <TrendingUp className="w-3.5 h-3.5" />, items: arousalItems, start: idx }); idx += arousalItems.length; }
        if (eventItems.length) { sections.push({ label: "Event Analysis", color: "chart-1", icon: <Activity className="w-3.5 h-3.5" />, items: eventItems, start: idx }); idx += eventItems.length; }
        if (result.notable_findings?.length) { sections.push({ label: "Notable Findings", color: "chart-4", icon: <Zap className="w-3.5 h-3.5" />, items: result.notable_findings, start: idx }); idx += result.notable_findings.length; }
        if (result.recommendations?.length) { sections.push({ label: "Recommendations", color: "accent", icon: <Lightbulb className="w-3.5 h-3.5" />, items: result.recommendations, start: idx }); }

        return (
          <TTSReader
            sessionId={session.id}
            title="AI Session Analysis"
            sessionDate={session.date}
            paragraphs={paras}
            renderParagraph={(text, paraIdx, isActive, isBuffering) => {
              // Find which section this paragraph belongs to
              let section = sections[0];
              for (const sec of sections) {
                if (paraIdx >= sec.start) section = sec;
              }
              const isSummary = section.label === null;
              if (isSummary) {
                return (
                  <p className={`text-base font-medium leading-relaxed border-l-2 pl-3 py-1 transition-all duration-200 rounded-r-md flex items-center gap-2 ${isActive ? "border-primary bg-primary/8 text-foreground" : isBuffering ? "border-primary/60 bg-primary/5 text-foreground" : "border-primary/50 text-foreground"}`}>
                    {isBuffering && <span className="shrink-0 w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
                    {text}
                  </p>
                );
              }
              return (
                <li className={`text-sm leading-relaxed pl-3 border-l-2 py-1 transition-all duration-200 rounded-r-md list-none flex items-center gap-2 ${isActive ? "border-primary bg-primary/8 text-foreground font-medium" : isBuffering ? "border-primary/60 bg-primary/5 text-foreground" : "border-primary/30 text-foreground"}`}>
                  {isBuffering && <span className="shrink-0 w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
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