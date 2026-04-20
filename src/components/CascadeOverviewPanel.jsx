import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { TrendingUp, Zap, Activity, Flag, Brain } from "lucide-react";
import TTSButton from "./TTSButton";
import { EVENT_CATEGORIES } from "./session-form/EventTimelineSection";

function getCategoryMeta(value) {
  return EVENT_CATEGORIES.find((c) => c.value === value) || EVENT_CATEGORIES[EVENT_CATEGORIES.length - 1];
}

function fmtMmSs(s) {
  const totalS = Math.round(Number(s));
  const m = Math.floor(totalS / 60);
  const sec = totalS % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function fmtDur(s) {
  const v = Math.round(Math.abs(s));
  return v >= 60 ? `${Math.floor(v / 60)}m ${v % 60}s` : `${v}s`;
}

function PhaseBlock({ color, icon, title, items }) {
  if (!items?.length) return null;
  return (
    <div className="rounded-lg p-3 space-y-1.5" style={{ background: color + "12", borderLeft: `3px solid ${color}` }}>
      <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color }}>
        {icon}{title}
      </p>
      <ul className="space-y-1">
        {items.map((s, i) =>
        <li key={i} className="text-[#a8b4cc] pl-2 text-sm leading-relaxed">• {s}</li>
        )}
      </ul>
    </div>);

}

export default function CascadeOverviewPanel({ session, timelineRows }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(session.ai_cascade ?? null);

  const hasMarkers = session.climax_offset_s != null;

  // Nearest HR lookup from timeline
  const nearestHR = (time_s) => {
    if (!timelineRows.length) return null;
    let best = timelineRows[0];
    let bestDist = Math.abs(Number(timelineRows[0].time_offset_s) - time_s);
    for (const r of timelineRows) {
      const d = Math.abs(Number(r.time_offset_s) - time_s);
      if (d < bestDist) {bestDist = d;best = r;}
    }
    return Math.round(Number(best.hr));
  };

  const analyze = async () => {
    setLoading(true);
    setResult(null);

    // Annotate events with HR and phase context
    const annotatedEvents = (session.event_timeline || []).map((ev) => {
      const m = Math.floor(ev.time_s / 60);
      const sec = (ev.time_s % 60).toString().padStart(2, "0");
      const hr = nearestHR(ev.time_s);
      const catMeta = getCategoryMeta(ev.category);
      const relToClimax = session.climax_offset_s != null ? Math.round(ev.time_s - session.climax_offset_s) : null;
      const relStr = relToClimax != null ? ` (${relToClimax >= 0 ? "+" : ""}${relToClimax}s vs climax)` : "";
      return `[${catMeta.label}] ${m}:${sec}${relStr} — ${ev.note}${hr != null ? ` [HR: ${hr} bpm]` : ""}`;
    });

    // Build HR at key phase markers
    const hrAtPre = session.pre_climax_offset_s != null ? nearestHR(session.pre_climax_offset_s) : null;
    const hrAtClimax = session.hr_at_climax || (session.climax_offset_s != null ? nearestHR(session.climax_offset_s) : null);
    const hrAtRecovery = session.recovery_offset_s != null ? nearestHR(session.recovery_offset_s) : null;

    const buildDur = session.pre_climax_offset_s != null && session.climax_offset_s != null ?
    Math.round(session.climax_offset_s - session.pre_climax_offset_s) : null;
    const recoveryOnset = session.recovery_offset_s != null && session.climax_offset_s != null ?
    Math.round(session.recovery_offset_s - session.climax_offset_s) : null;

    const h = session.start_time ? parseInt(session.start_time.split(":")[0], 10) : null;
    const timeOfDay = h !== null ?
    h >= 5 && h < 12 ? "morning" : h >= 12 && h < 17 ? "afternoon" : h >= 17 && h < 21 ? "evening" : "night" :
    null;

    const res = await base44.integrations.Core.InvokeLLM({
      model: "claude_sonnet_4_6",
      prompt: `You are a physiological research assistant. Analyze the climax cascade arc of this single sexual response session in depth.

Focus exclusively on the four phases:
1. BUILD (start of session → pre-climax marker): how arousal built, HR trajectory, event patterns, pacing
2. PRE-CLIMAX (pre-climax marker → climax marker): the final ascent, HR acceleration, sensations, events
3. CLIMAX (the peak event itself): HR peak, intensity, duration, ejaculate, physical markers
4. RECOVERY (climax → recovery marker and beyond): HR descent rate, refractory state, physical/emotional notes

Use all available data — HR timeline, event notes with categories and timing, phase markers, subjective ratings.
Be specific, reference actual values, note event-HR correlations.

Session cascade data:
${JSON.stringify({
        date: session.date?.slice(0, 10),
        start_time_et: session.start_time || undefined,
        time_of_day: timeOfDay || undefined,
        duration_minutes: session.duration_minutes,
        build_type: session.build_type,
        build_quality: session.build_quality,
        climax_duration: session.climax_duration,
        intensity: session.intensity,
        satisfaction: session.satisfaction,
        mood: session.mood,
        methods: session.methods,
        avg_hr: session.avg_hr,
        max_hr: session.max_hr,
        hr_at_climax: hrAtClimax,
        hr_at_pre_climax_marker: hrAtPre,
        hr_at_recovery_marker: hrAtRecovery,
        hr_avg_pre_to_climax: session.hr_avg_pre_to_climax,
        hr_avg_at_climax_window: session.hr_avg_at_climax_window,
        pre_climax_offset_s: session.pre_climax_offset_s,
        climax_offset_s: session.climax_offset_s,
        recovery_offset_s: session.recovery_offset_s,
        build_duration_s: buildDur,
        recovery_onset_s: recoveryOnset,
        ejaculate_volume: session.ejaculate_volume,
        unusual_sensations: session.unusual_sensations,
        discomfort_entries: session.discomfort_entries?.length ? session.discomfort_entries : undefined,
        notes: session.notes || undefined
      }, null, 2)}
${annotatedEvents.length > 0 ? `\nAnnotated event timeline:\n${annotatedEvents.join("\n")}` : ""}`,
      response_json_schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          build_phase: { type: "array", items: { type: "string" } },
          pre_climax_phase: { type: "array", items: { type: "string" } },
          climax_phase: { type: "array", items: { type: "string" } },
          recovery_phase: { type: "array", items: { type: "string" } },
          cascade_quality: { type: "string" }
        },
        required: ["summary", "build_phase", "pre_climax_phase", "climax_phase", "recovery_phase", "cascade_quality"]
      }
    });

    const raw = typeof res === "string" ? JSON.parse(res) : res;
    const parsed = raw?.response ?? raw;
    setResult(parsed);
    await base44.entities.Session.update(session.id, { ai_cascade: parsed });
    setLoading(false);
  };

  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4" /> Cascade Overview
        </h3>
        <div className="flex items-center gap-2">
          {result &&
          <TTSButton getText={() => {
            const parts = [result.summary];
            result.build_phase?.forEach((s) => parts.push(s));
            result.pre_climax_phase?.forEach((s) => parts.push(s));
            result.climax_phase?.forEach((s) => parts.push(s));
            result.recovery_phase?.forEach((s) => parts.push(s));
            if (result.cascade_quality) parts.push(result.cascade_quality);
            return parts.filter(Boolean).join(". ");
          }} />
          }
          <Button
            size="sm"
            onClick={analyze}
            disabled={loading || !hasMarkers}
            className="h-7 text-xs gap-1.5">
            
            {loading ?
            <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Analyzing…</> :
            <><Brain className="w-3 h-3" />Analyze</>}
          </Button>
        </div>
      </div>

      {!hasMarkers &&
      <p className="text-xs text-muted-foreground">
          Set Pre-Climax, Climax, and Recovery markers on the HR timeline above to enable cascade analysis.
        </p>
      }

      {hasMarkers && !result && !loading &&
      <p className="text-xs text-muted-foreground">
          Analyze the full cascade arc — build, pre-climax, climax, and recovery — with event correlations. Uses Claude Sonnet.
        </p>
      }

      {/* Phase timing mini-summary */}
      {hasMarkers &&
      <div className="grid grid-cols-2 gap-2">
          {session.pre_climax_offset_s != null && session.climax_offset_s != null &&
        <div className="bg-muted/50 rounded-lg px-3 py-2 flex flex-col items-center">
              <p className="text-[9px] uppercase text-muted-foreground tracking-wide">Build → Climax</p>
              <p className="text-base font-bold font-mono" style={{ color: "#a855f7" }}>
                {fmtDur(session.climax_offset_s - session.pre_climax_offset_s)}
              </p>
            </div>
        }
          {session.recovery_offset_s != null && session.climax_offset_s != null &&
        <div className="bg-muted/50 rounded-lg px-3 py-2 flex flex-col items-center">
              <p className="text-[9px] uppercase text-muted-foreground tracking-wide">Recovery Onset</p>
              <p className="text-base font-bold font-mono" style={{ color: "#3b82f6" }}>
                +{fmtDur(session.recovery_offset_s - session.climax_offset_s)}
              </p>
            </div>
        }
        </div>
      }

      {result &&
      <div className="space-y-3">
          {result.summary &&
        <p className="text-base text-foreground font-medium leading-relaxed border-l-2 border-primary pl-3">
              {result.summary}
            </p>
        }
          <PhaseBlock
          color="#6366f1"
          icon={<Activity className="w-3.5 h-3.5" />}
          title="Build Phase"
          items={result.build_phase} />
        
          <PhaseBlock
          color="#a855f7"
          icon={<Zap className="w-3.5 h-3.5" />}
          title="Pre-Climax"
          items={result.pre_climax_phase} />
        
          <PhaseBlock
          color="#ef4444"
          icon={<Flag className="w-3.5 h-3.5" />}
          title="Climax"
          items={result.climax_phase} />
        
          <PhaseBlock
          color="#3b82f6"
          icon={<TrendingUp className="w-3.5 h-3.5" style={{ transform: "scaleY(-1)" }} />}
          title="Recovery"
          items={result.recovery_phase} />
        
          {result.cascade_quality &&
        <div className="bg-primary/10 rounded-lg px-3 py-2.5">
              <p className="text-xs font-semibold text-primary mb-1">Cascade Quality Assessment</p>
              <p className="text-sm text-foreground leading-relaxed">{result.cascade_quality}</p>
            </div>
        }
        </div>
      }
    </div>);

}