import { useState } from "react";
import { Link } from "react-router-dom";
import { Star, Heart, Zap, Clock, Brain, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { base44 } from "@/api/base44Client";
import moment from "moment";
import { computeSessionScore, gradeFromPct } from "@/utils/sessionScore";

export default function SessionCard({ session, selectable, selected, onSelect }) {
  const [aiExpanded, setAiExpanded] = useState(false);
  const [aiText, setAiText] = useState(session.ai_analysis?.summary ?? null);
  const [aiLoading, setAiLoading] = useState(false);

  const date = moment(session.date).format("MMM D, YYYY");
  const methods = session.methods || [];
  const eventCount = (session.event_timeline || []).length;
  const scorePct = computeSessionScore(session, []);
  const gradeInfo = scorePct != null ? gradeFromPct(scorePct) : null;

  const loadAI = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (aiText) { setAiExpanded((v) => !v); return; }
    setAiExpanded(true);
    setAiLoading(true);
    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `Write a brief 1–2 paragraph physiological summary of this session. Be concise and insightful. Focus on what happened, how the body responded, and any notable patterns.

Session data:
- Date: ${session.date?.slice(0, 10)}
- Duration: ${session.duration_minutes ?? "unknown"} minutes
- Methods: ${(session.methods || []).join(", ") || "none listed"}
- Build type: ${session.build_type || "unknown"}
- Intensity: ${session.intensity}/10
- Build quality: ${session.build_quality ?? "—"}/10
- Satisfaction: ${session.satisfaction ?? "—"}/10
- Climax duration: ${session.climax_duration || "—"}
- Avg HR: ${session.avg_hr ?? "—"} bpm, Max HR: ${session.max_hr ?? "—"} bpm, HR at climax: ${session.hr_at_climax ?? "—"} bpm
- Mood: ${session.mood || "—"}
- Events logged: ${eventCount}
${session.notes ? `- Notes: ${session.notes.slice(0, 200)}` : ""}`,
      });
      const text = typeof res === "string" ? res : (res?.response ?? res?.summary ?? JSON.stringify(res));
      setAiText(text);
    } finally {
      setAiLoading(false);
    }
  };

  const content = (
    <div className={`bg-card rounded-xl border p-4 transition-all ${
      selected ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/30"
    }`}>
      {/* Header row */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {selectable && (
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onSelect?.(session.id)}
              className="w-5 h-5 rounded accent-primary"
            />
          )}
          <div>
            <p className="text-sm font-semibold">{date}</p>
            {(session.start_time || session.duration_minutes) && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {session.start_time}
                {session.end_time && ` – ${session.end_time}`}
                {session.duration_minutes && ` (${session.duration_minutes}m)`}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {session.is_quick_entry && <Zap className="w-4 h-4 text-primary" />}
          {session.is_favorite && <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />}
        </div>
      </div>

      {/* Metrics row */}
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-1">
          <Heart className="w-3.5 h-3.5 text-chart-3" />
          <span className="text-xs font-mono">{session.max_hr || "—"}</span>
        </div>
        <div className="bg-primary/10 rounded-full px-2 py-0.5">
          <span className="text-xs font-bold text-primary">{session.intensity}/10</span>
        </div>
        {session.satisfaction && (
          <span className="text-xs text-muted-foreground">Sat: {session.satisfaction}/10</span>
        )}
        {eventCount > 0 && (
          <span className="text-[10px] bg-muted rounded-full px-2 py-0.5 text-muted-foreground">
            {eventCount} event{eventCount !== 1 ? "s" : ""}
          </span>
        )}
        {gradeInfo && (
          <span
            className="text-[10px] font-bold rounded-full px-2 py-0.5"
            style={{ background: gradeInfo.color + "22", color: gradeInfo.color }}
          >
            {gradeInfo.grade} · {scorePct}%
          </span>
        )}
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1 mb-2">
        {methods.slice(0, 3).map((m) => (
          <Badge key={m} variant="secondary" className="text-[10px] py-0">{m}</Badge>
        ))}
        {methods.length > 3 && (
          <Badge variant="secondary" className="text-[10px] py-0">+{methods.length - 3}</Badge>
        )}
        {(session.tags || []).slice(0, 2).map((t) => (
          <Badge key={t} variant="outline" className="text-[10px] py-0">{t}</Badge>
        ))}
      </div>

      {/* AI toggle */}
      {!selectable && (
        <button
          onClick={loadAI}
          className="flex items-center gap-1 text-[10px] text-primary font-semibold mt-1"
        >
          <Brain className="w-3 h-3" />
          {aiLoading ? "Generating…" : aiExpanded ? "Hide breakdown" : session.ai_analysis?.summary ? "Show AI breakdown" : "Generate AI breakdown"}
          {!aiLoading && (aiExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
        </button>
      )}

      {/* AI text */}
      {aiExpanded && (
        <div className="mt-2 pt-2 border-t border-border">
          {aiLoading ? (
            <p className="text-xs text-muted-foreground animate-pulse">Generating breakdown…</p>
          ) : aiText ? (
            <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">{aiText}</p>
          ) : null}
        </div>
      )}
    </div>
  );

  if (selectable) return content;
  return <Link to={`/sessions/${session.id}`}>{content}</Link>;
}