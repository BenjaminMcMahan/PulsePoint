import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { TrendingUp, Activity, Zap, Flag, Brain, Lightbulb } from "lucide-react";
import TTSButton from "./TTSButton";
import moment from "moment";

const PHASE_COLORS = {
  build: "#6366f1",
  pre_climax: "#a855f7",
  climax: "#ef4444",
  recovery: "#3b82f6",
};

function Section({ color, icon, title, items }) {
  if (!items?.length) return null;
  return (
    <div className="rounded-lg p-3 space-y-1.5" style={{ background: color + "12", borderLeft: `3px solid ${color}` }}>
      <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color }}>
        {icon}{title}
      </p>
      <ul className="space-y-1">
        {items.map((s, i) => (
          <li key={i} className="text-sm text-foreground/90 leading-relaxed pl-2">• {s}</li>
        ))}
      </ul>
    </div>
  );
}

export default function CompareCascadePanel({ sessions, timelineMap }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [savedId, setSavedId] = useState(null);
  const sessionKey = sessions.map((s) => s.id).sort().join(",") + ":cascade";
  const prevKeyRef = useRef(null);

  useEffect(() => {
    if (prevKeyRef.current === sessionKey) return;
    prevKeyRef.current = sessionKey;
    setResult(null);
    setSavedId(null);

    base44.entities.CompareAnalysisResult.filter({ session_key: sessionKey }, "-updated_date", 1).then((rows) => {
      if (rows[0]) {
        setResult(rows[0].result);
        setSavedId(rows[0].id);
      }
    });
  }, [sessionKey]);

  const runAnalysis = async (existingId) => {
    setLoading(true);
    try {
      const nearestHR = (rows, time_s) => {
        if (!rows?.length) return null;
        let best = rows[0];
        let bestDist = Math.abs(Number(rows[0].time_offset_s) - time_s);
        for (const r of rows) {
          const d = Math.abs(Number(r.time_offset_s) - time_s);
          if (d < bestDist) { bestDist = d; best = r; }
        }
        return Math.round(Number(best.hr));
      };

      const sessionSummaries = sessions.map((s) => {
        const rows = timelineMap[s.id] || [];
        const hrAtPre = s.pre_climax_offset_s != null ? nearestHR(rows, s.pre_climax_offset_s) : null;
        const hrAtClimax = s.hr_at_climax || (s.climax_offset_s != null ? nearestHR(rows, s.climax_offset_s) : null);
        const hrAtRecovery = s.recovery_offset_s != null ? nearestHR(rows, s.recovery_offset_s) : null;
        const buildDur = s.pre_climax_offset_s != null && s.climax_offset_s != null
          ? Math.round(s.climax_offset_s - s.pre_climax_offset_s) : null;
        const recoveryOnset = s.recovery_offset_s != null && s.climax_offset_s != null
          ? Math.round(s.recovery_offset_s - s.climax_offset_s) : null;

        return {
          label: moment(s.date).format("MMM D, YYYY"),
          build_type: s.build_type,
          build_quality: s.build_quality,
          intensity: s.intensity,
          satisfaction: s.satisfaction,
          climax_duration: s.climax_duration,
          mood: s.mood,
          methods: s.methods,
          avg_hr: s.avg_hr,
          max_hr: s.max_hr,
          hr_at_pre_climax: hrAtPre,
          hr_at_climax: hrAtClimax,
          hr_at_recovery: hrAtRecovery,
          hr_avg_pre_to_climax: s.hr_avg_pre_to_climax,
          hr_avg_at_climax_window: s.hr_avg_at_climax_window,
          pre_climax_offset_s: s.pre_climax_offset_s,
          climax_offset_s: s.climax_offset_s,
          recovery_offset_s: s.recovery_offset_s,
          build_duration_s: buildDur,
          recovery_onset_s: recoveryOnset,
          ejaculate_volume: s.ejaculate_volume,
          event_count: (s.event_timeline || []).length,
        };
      });

      const res = await base44.integrations.Core.InvokeLLM({
        model: "claude_sonnet_4_6",
        prompt: `You are a physiological research assistant. Perform a comparative cascade analysis across ${sessions.length} sexual response sessions.

For each of the four cascade phases — Build, Pre-Climax, Climax, Recovery — identify meaningful differences and patterns between the sessions. Reference specific values (HR, timings, ratings). Focus on what changed between sessions and what those changes imply physiologically.

Sessions:
${JSON.stringify(sessionSummaries, null, 2)}

Provide structured findings per phase, cross-session notable findings, and a standout observation.`,
        response_json_schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            build_differences: { type: "array", items: { type: "string" } },
            pre_climax_differences: { type: "array", items: { type: "string" } },
            climax_differences: { type: "array", items: { type: "string" } },
            recovery_differences: { type: "array", items: { type: "string" } },
            notable_findings: { type: "array", items: { type: "string" } },
            standout: { type: "string" },
          },
          required: ["summary", "build_differences", "pre_climax_differences", "climax_differences", "recovery_differences", "notable_findings"],
        },
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
          <TrendingUp className="w-4 h-4" /> Comparative Cascade Analysis
        </h3>
        <div className="flex items-center gap-2">
          {result && (
            <TTSButton getText={() => {
              const parts = [result.summary];
              [...(result.build_differences || []), ...(result.pre_climax_differences || []),
               ...(result.climax_differences || []), ...(result.recovery_differences || []),
               ...(result.notable_findings || [])].forEach((s) => parts.push(s));
              if (result.standout) parts.push(result.standout);
              return parts.filter(Boolean).join(". ");
            }} />
          )}
          <button
            onClick={() => runAnalysis(savedId)}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold flex items-center gap-1.5 disabled:opacity-50"
          >
            {loading
              ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Analyzing…</>
              : <><Brain className="w-3 h-3" />{result ? "Re-analyze" : "Analyze"}</>}
          </button>
        </div>
      </div>

      {!result && !loading && (
        <p className="text-xs text-muted-foreground">
          Compare cascade phases across all selected sessions — build, pre-climax, climax, and recovery differences. Uses Claude Sonnet.
        </p>
      )}

      {loading && !result && (
        <p className="text-xs text-muted-foreground animate-pulse">Running comparative cascade analysis…</p>
      )}

      {result && (
        <div className="space-y-3">
          {result.summary && (
            <p className="text-sm text-foreground leading-relaxed border-l-2 border-primary pl-3">{result.summary}</p>
          )}
          <Section color={PHASE_COLORS.build} icon={<Activity className="w-3.5 h-3.5" />} title="Build Phase Differences" items={result.build_differences} />
          <Section color={PHASE_COLORS.pre_climax} icon={<Zap className="w-3.5 h-3.5" />} title="Pre-Climax Differences" items={result.pre_climax_differences} />
          <Section color={PHASE_COLORS.climax} icon={<Flag className="w-3.5 h-3.5" />} title="Climax Differences" items={result.climax_differences} />
          <Section color={PHASE_COLORS.recovery} icon={<TrendingUp className="w-3.5 h-3.5" />} title="Recovery Differences" items={result.recovery_differences} />
          <Section color="#f59e0b" icon={<Lightbulb className="w-3.5 h-3.5" />} title="Notable Findings" items={result.notable_findings} />
          {result.standout && (
            <div className="bg-accent/10 rounded-lg px-3 py-2.5">
              <p className="text-xs font-semibold text-accent mb-1">Standout Observation</p>
              <p className="text-sm text-foreground leading-relaxed">{result.standout}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}