import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Brain, Activity, Layers, AlertCircle, Zap, TrendingUp, Clock } from "lucide-react";
import TTSButton from "../components/TTSButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ── helpers ────────────────────────────────────────────────────────────────────

function fmtSec(s) {
  if (s == null) return "—";
  const v = Math.round(Math.abs(s));
  return v >= 60 ? `${Math.floor(v / 60)}m${v % 60}s` : `${v}s`;
}

// Detect near-climax events in a HR timeline:
// Erratic rises (>=8 bpm over ≤45s) ending in a drop, not as sustained as a full climax.
function detectNearClimaxEvents(rows, climaxOffsetS, preClimaxOffsetS) {
  if (!rows || rows.length < 10) return [];
  const events = [];

  const RISE_THRESHOLD = 8;
  const RISE_WINDOW_S = 120;
  const PLATEAU_MIN_S = 6;
  const DROP_NEEDED = 6;
  const COOLDOWN_S = 30;
  const MIN_EVENT_DURATION_S = 10;
  const MAX_EVENT_DURATION_S = (climaxOffsetS != null && preClimaxOffsetS != null)
    ? Math.max(60, Math.abs(climaxOffsetS - preClimaxOffsetS) * 0.8)
    : 180;
  const climaxExcludeRadius = 90;

  let i = 0;
  let lastEventEnd = -Infinity;

  while (i < rows.length - 5) {
    const t0 = Number(rows[i].time_offset_s);
    const hr0 = Number(rows[i].hr);

    if (t0 < lastEventEnd + COOLDOWN_S) { i++; continue; }
    if (climaxOffsetS != null && Math.abs(t0 - climaxOffsetS) < climaxExcludeRadius) { i++; continue; }

    let peakIdx = i;
    let peakHr = hr0;
    for (let j = i + 1; j < rows.length; j++) {
      const tj = Number(rows[j].time_offset_s);
      if (tj - t0 > RISE_WINDOW_S) break;
      if (Number(rows[j].hr) > peakHr) {
        peakHr = Number(rows[j].hr);
        peakIdx = j;
      }
    }

    if (peakHr - hr0 < RISE_THRESHOLD || peakIdx === i) { i++; continue; }

    const peakTime = Number(rows[peakIdx].time_offset_s);

    let plateauEnd = peakIdx;
    for (let j = peakIdx; j < rows.length; j++) {
      if (Number(rows[j].time_offset_s) - peakTime > PLATEAU_MIN_S) break;
      if (Number(rows[j].hr) >= peakHr - DROP_NEEDED / 2) plateauEnd = j;
    }
    const plateauDuration = Number(rows[plateauEnd].time_offset_s) - peakTime;
    if (plateauDuration < PLATEAU_MIN_S * 0.5) { i = peakIdx + 1; continue; }

    let dropped = false;
    let dropIdx = plateauEnd;
    for (let j = plateauEnd + 1; j < rows.length && j < plateauEnd + 40; j++) {
      if (Number(rows[j].hr) <= peakHr - DROP_NEEDED) {
        dropped = true;
        dropIdx = j;
        break;
      }
    }

    if (!dropped) { i = peakIdx + 1; continue; }

    const eventDuration = Number(rows[dropIdx].time_offset_s) - t0;
    if (eventDuration < MIN_EVENT_DURATION_S || eventDuration > MAX_EVENT_DURATION_S) { i++; continue; }

    events.push({
      start_offset_s: t0,
      peak_offset_s: peakTime,
      end_offset_s: Number(rows[dropIdx].time_offset_s),
      base_hr: Math.round(hr0),
      peak_hr: Math.round(peakHr),
      rise_bpm: Math.round(peakHr - hr0),
      duration_s: Math.round(eventDuration),
    });

    lastEventEnd = Number(rows[dropIdx].time_offset_s);
    i = dropIdx + 1;
  }

  return events;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionCard({ icon, title, color, children }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color }}>
        {icon}{title}
      </h3>
      {children}
    </div>
  );
}

function ClusterCard({ cluster, index }) {
  const colors = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-4))", "hsl(var(--accent))", "hsl(var(--chart-3))"];
  const color = colors[index % colors.length];
  return (
    <div className="rounded-xl border border-border p-4 space-y-3" style={{ borderColor: color + "44" }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold" style={{ color }}>{cluster.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{cluster.session_count} sessions · {cluster.typical_duration || "—"}</p>
        </div>
        <Badge variant="outline" className="text-[10px] shrink-0 max-w-[120px] truncate" style={{ borderColor: color, color }} title={cluster.build_type_tendency || "Mixed"}>
          {cluster.build_type_tendency || "Mixed"}
        </Badge>
      </div>
      <p className="text-sm text-foreground/85 leading-relaxed break-words">{cluster.description}</p>
      {cluster.defining_methods?.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Key Methods</p>
          <div className="flex flex-wrap gap-1">
            {cluster.defining_methods.map((m, i) => (
              <Badge key={i} variant="secondary" className="text-[9px]">{m}</Badge>
            ))}
          </div>
        </div>
      )}
      {cluster.physiological_signature && (
        <p className="text-sm text-foreground/75 border-l-2 border-border pl-2 italic leading-relaxed break-words">{cluster.physiological_signature}</p>
      )}
      {cluster.recommendation && (
        <div className="bg-muted/60 rounded-lg p-3">
          <p className="text-sm text-foreground leading-relaxed break-words">{cluster.recommendation}</p>
        </div>
      )}
    </div>
  );
}

function NearClimaxPanel({ sessions, allTimelines }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [savedId, setSavedId] = useState(null);
  const [eventStats, setEventStats] = useState(null);

  useEffect(() => {
    base44.entities.SessionClusterAnalysis.list("-updated_date", 1).then((rows) => {
      if (rows[0]?.near_climax_result) {
        setResult(rows[0].near_climax_result);
        setSavedId(rows[0].id);
      }
    });
  }, []);

  const analyze = async () => {
    setLoading(true);
    setResult(null);

    // Detect events across all sessions with HR data
    const sessionEvents = [];
    for (const session of sessions) {
      const rows = allTimelines[session.id] || [];
      if (rows.length < 10) continue;
      const events = detectNearClimaxEvents(rows, session.climax_offset_s, session.pre_climax_offset_s);
      if (events.length > 0) {
        sessionEvents.push({
          date: session.date?.slice(0, 10),
          session_duration_s: Math.round(Math.max(...rows.map(r => Number(r.time_offset_s)))),
          climax_offset_s: session.climax_offset_s,
          methods: session.methods,
          intensity: session.intensity,
          near_climax_events: events,
          event_count: events.length,
          total_time_in_events_s: Math.round(events.reduce((a, e) => a + e.duration_s, 0)),
          avg_rise_bpm: Math.round(events.reduce((a, e) => a + e.rise_bpm, 0) / events.length),
          max_peak_hr: Math.max(...events.map(e => e.peak_hr)),
        });
      }
    }

    const totalEvents = sessionEvents.reduce((a, s) => a + s.event_count, 0);
    const stats = {
      sessions_with_events: sessionEvents.length,
      total_events: totalEvents,
      avg_events_per_session: sessionEvents.length ? (totalEvents / sessionEvents.length).toFixed(1) : 0,
    };
    setEventStats(stats);

    const res = await base44.integrations.Core.InvokeLLM({
      model: "claude_sonnet_4_6",
      prompt: `You are a physiological research assistant analyzing near-climax events detected in heart rate data from sexual response sessions.

A "near-climax event" is defined as: an erratic yet somewhat sustained climb in heart rate (>=8 bpm rise within 45 seconds), followed by a notable drop — similar in shape to the climax cascade (ever-increasing HR with an apex and fall) but not as sustained. These events occur OUTSIDE of the actual climax window.

Detected event data across ${sessionEvents.length} sessions (out of ${sessions.length} total):
${JSON.stringify(sessionEvents, null, 2)}

Provide a rich, interpretive narrative analysis. Focus on:
1. What these events physiologically represent — are they arousal plateaus, mini-edging responses, parasympathetic interruptions, or something else?
2. How frequently they occur and what that suggests about the user's physiological response pattern.
3. Which session contexts (methods, duration, time-in-session) seem to precipitate more of these events.
4. What role they likely play in the overall arousal arc — do they precede stronger or weaker climax events?
5. Recommendations for leveraging or managing these events to optimize session outcomes.

Be interpretive, insightful, and research-oriented. Reference specific sessions where notable.`,
      response_json_schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          physiological_interpretation: { type: "string" },
          pattern_analysis: { type: "array", items: { type: "string" } },
          contextual_triggers: { type: "array", items: { type: "string" } },
          role_in_arousal_arc: { type: "string" },
          recommendations: { type: "array", items: { type: "string" } },
        },
        required: ["summary", "physiological_interpretation", "pattern_analysis", "contextual_triggers", "role_in_arousal_arc", "recommendations"],
      },
    });

    const raw = typeof res === "string" ? JSON.parse(res) : res;
    const parsed = raw?.response ?? raw;
    setResult(parsed);

    // Save to entity
    const existing = await base44.entities.SessionClusterAnalysis.list("-updated_date", 1);
    if (existing[0]) {
      await base44.entities.SessionClusterAnalysis.update(existing[0].id, { near_climax_result: { ...parsed, _stats: stats, _session_events: sessionEvents } });
      setSavedId(existing[0].id);
    } else {
      const created = await base44.entities.SessionClusterAnalysis.create({ near_climax_result: { ...parsed, _stats: stats, _session_events: sessionEvents } });
      setSavedId(created.id);
    }
    setLoading(false);
  };

  const savedStats = result?._stats;
  const savedSessionEvents = result?._session_events;
  const displayStats = eventStats || savedStats;
  const displaySessionEvents = savedSessionEvents;

  return (
    <SectionCard icon={<Zap className="w-4 h-4" />} title="Near-Climax Event Analysis" color="hsl(var(--chart-3))">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Detects erratic HR spikes & reversals that resemble — but don't complete — a climax cascade.</p>
        <div className="flex items-center gap-2">
          {result && <TTSButton getText={() => {
            const parts = [result.summary, result.physiological_interpretation, result.role_in_arousal_arc];
            result.pattern_analysis?.forEach(s => parts.push(s));
            result.contextual_triggers?.forEach(s => parts.push(s));
            result.recommendations?.forEach(s => parts.push(s));
            return parts.filter(Boolean).join('. ');
          }} />}
        <Button size="sm" onClick={analyze} disabled={loading} className="h-7 text-xs gap-1.5 shrink-0 ml-2">
          {loading
            ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Analyzing…</>
            : <><Brain className="w-3 h-3" />{result ? "Re-run" : "Analyze"}</>}
        </Button>
        </div>
      </div>

      {displayStats && (
        <div className="grid grid-cols-3 gap-2">
          {[
            ["Sessions w/ Events", displayStats.sessions_with_events],
            ["Total Events", displayStats.total_events],
            ["Avg per Session", displayStats.avg_events_per_session],
          ].map(([l, v]) => (
            <div key={l} className="bg-muted/50 rounded-lg p-2 text-center">
              <p className="text-lg font-bold font-mono">{v}</p>
              <p className="text-[9px] text-muted-foreground">{l}</p>
            </div>
          ))}
        </div>
      )}

      {displaySessionEvents?.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground uppercase font-semibold">Per Session</p>
          {displaySessionEvents.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-[10px]">
              <span className="font-mono text-muted-foreground w-14 shrink-0">{s.date}</span>
              <Badge variant="outline" className="text-[9px] h-4 px-1">{s.event_count} events</Badge>
              <Badge variant="outline" className="text-[9px] h-4 px-1">{fmtSec(s.total_time_in_events_s)} total</Badge>
              <Badge variant="outline" className="text-[9px] h-4 px-1">+{s.avg_rise_bpm} bpm avg rise</Badge>
            </div>
          ))}
        </div>
      )}

      {result && (
        <div className="space-y-3 pt-1">
          {result.summary && (
            <p className="text-base text-foreground leading-relaxed border-l-2 border-chart-3 pl-3 font-medium">{result.summary}</p>
          )}
          {result.physiological_interpretation && (
            <div className="bg-muted/60 rounded-lg p-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1.5 tracking-wider">Physiological Interpretation</p>
              <p className="text-sm text-foreground leading-relaxed">{result.physiological_interpretation}</p>
            </div>
          )}
          {result.pattern_analysis?.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1.5 tracking-wider">Pattern Analysis</p>
              <ul className="space-y-2">
                {result.pattern_analysis.map((s, i) => (
                  <li key={i} className="text-sm text-foreground/90 pl-3 border-l-2 border-primary/40 leading-relaxed">• {s}</li>
                ))}
              </ul>
            </div>
          )}
          {result.contextual_triggers?.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1.5 tracking-wider">Contextual Triggers</p>
              <ul className="space-y-2">
                {result.contextual_triggers.map((s, i) => (
                  <li key={i} className="text-sm text-foreground/90 pl-3 border-l-2 border-primary/40 leading-relaxed">• {s}</li>
                ))}
              </ul>
            </div>
          )}
          {result.role_in_arousal_arc && (
            <div className="bg-muted/60 rounded-lg p-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1.5 tracking-wider">Role in Arousal Arc</p>
              <p className="text-sm text-foreground leading-relaxed">{result.role_in_arousal_arc}</p>
            </div>
          )}
          {result.recommendations?.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1.5 tracking-wider">Recommendations</p>
              <ul className="space-y-2">
                {result.recommendations.map((s, i) => (
                  <li key={i} className="text-sm text-foreground/90 pl-3 border-l-2 border-primary/40 leading-relaxed">• {s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function ClusterPanel({ sessions }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [savedId, setSavedId] = useState(null);

  useEffect(() => {
    base44.entities.SessionClusterAnalysis.list("-updated_date", 1).then((rows) => {
      if (rows[0]?.result) {
        setResult(rows[0].result);
        setSavedId(rows[0].id);
      }
    });
  }, []);

  const analyze = async () => {
    setLoading(true);
    setResult(null);

    const summary = sessions.map((s) => ({
      date: s.date?.slice(0, 10),
      duration_minutes: s.duration_minutes,
      avg_hr: s.avg_hr,
      max_hr: s.max_hr,
      hr_at_climax: s.hr_at_climax,
      hr_avg_pre_to_climax: s.hr_avg_pre_to_climax,
      hr_avg_at_climax_window: s.hr_avg_at_climax_window,
      pre_climax_offset_s: s.pre_climax_offset_s,
      climax_offset_s: s.climax_offset_s,
      recovery_offset_s: s.recovery_offset_s,
      methods: s.methods,
      custom_methods: s.custom_methods,
      foley_size: s.foley_size,
      foley_type: s.foley_type,
      estim_notes: s.estim_notes,
      sleeve_type: s.sleeve_type,
      tens_placement: s.tens_placement,
      build_type: s.build_type,
      custom_build_type: s.custom_build_type,
      climax_duration: s.climax_duration,
      unusual_sensations: s.unusual_sensations,
      refractory_notes: s.refractory_notes,
      ejaculate_volume: s.ejaculate_volume,
      discomfort: s.discomfort,
      mood: s.mood,
      environment: s.environment,
      substances: s.substances,
      hydration: s.hydration,
      tags: s.tags,
    }));

    const res = await base44.integrations.Core.InvokeLLM({
      model: "claude_sonnet_4_6",
      prompt: `You are a physiological research assistant performing cluster analysis on sexual response session data.

Analyze ${sessions.length} sessions and identify distinct physiological/behavioral profiles or clusters. DO NOT use intensity or satisfaction scores as clustering variables.

Session data:
${JSON.stringify(summary, null, 2)}

Your goal:
1. Identify 3-5 meaningful clusters based on: HR profile, phase timing, methods used, build type, physiological context (mood, hydration, discomfort, ejaculate volume, substances), and unusual sensations.
2. For each cluster, name it, describe its defining characteristics, note which methods consistently appear, and provide an interpretive recommendation.
3. Identify which method combinations most reliably produce specific build types preferred by the user.
4. Provide cross-cluster insights about what differentiates high-quality sessions physiologically.

Be interpretive and insightful — not just descriptive.`,
      response_json_schema: {
        type: "object",
        properties: {
          overview: { type: "string" },
          clusters: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                session_count: { type: "number" },
                description: { type: "string" },
                defining_methods: { type: "array", items: { type: "string" } },
                build_type_tendency: { type: "string" },
                typical_duration: { type: "string" },
                physiological_signature: { type: "string" },
                recommendation: { type: "string" },
              },
              required: ["name", "session_count", "description", "defining_methods", "recommendation"],
            },
          },
          method_build_correlations: { type: "array", items: { type: "string" } },
          cross_cluster_insights: { type: "array", items: { type: "string" } },
        },
        required: ["overview", "clusters", "method_build_correlations", "cross_cluster_insights"],
      },
    });

    const raw = typeof res === "string" ? JSON.parse(res) : res;
    const parsed = raw?.response ?? raw;
    setResult(parsed);

    const existing = await base44.entities.SessionClusterAnalysis.list("-updated_date", 1);
    if (existing[0]) {
      await base44.entities.SessionClusterAnalysis.update(existing[0].id, { result: parsed, session_count: sessions.length });
      setSavedId(existing[0].id);
    } else {
      const created = await base44.entities.SessionClusterAnalysis.create({ result: parsed, session_count: sessions.length });
      setSavedId(created.id);
    }
    setLoading(false);
  };

  return (
    <SectionCard icon={<Layers className="w-4 h-4" />} title="Session Profile Clusters" color="hsl(var(--primary))">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">AI-identified physiological profiles across all sessions, linked to methods and build types.</p>
        <div className="flex items-center gap-2">
          {result && <TTSButton getText={() => {
            const parts = [result.overview];
            result.clusters?.forEach(c => parts.push(c.name + ': ' + c.description + '. ' + c.recommendation));
            result.method_build_correlations?.forEach(s => parts.push(s));
            result.cross_cluster_insights?.forEach(s => parts.push(s));
            return parts.filter(Boolean).join('. ');
          }} />}
        <Button size="sm" onClick={analyze} disabled={loading || sessions.length < 4} className="h-7 text-xs gap-1.5 shrink-0 ml-2">
          {loading
            ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Analyzing…</>
            : <><Brain className="w-3 h-3" />{result ? "Re-run" : "Analyze"}</>}
        </Button>
        </div>
      </div>

      {sessions.length < 4 && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" /> Need at least 4 sessions for meaningful cluster detection.
        </p>
      )}

      {result && (
        <div className="space-y-4">
          {result.overview && (
            <p className="text-base text-foreground leading-relaxed border-l-2 border-primary pl-3 font-medium">{result.overview}</p>
          )}
          {result.clusters?.length > 0 && (
            <div className="space-y-3">
              {result.clusters.map((cluster, i) => <ClusterCard key={i} cluster={cluster} index={i} />)}
            </div>
          )}
          {result.method_build_correlations?.length > 0 && (
            <div className="bg-muted/60 rounded-lg p-3 space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase flex items-center gap-1 tracking-wider"><TrendingUp className="w-3 h-3" />Method → Build Type Correlations</p>
              {result.method_build_correlations.map((s, i) => (
                <p key={i} className="text-sm text-foreground/90 pl-3 border-l-2 border-primary/40 leading-relaxed">• {s}</p>
              ))}
            </div>
          )}
          {result.cross_cluster_insights?.length > 0 && (
            <div className="bg-muted/60 rounded-lg p-3 space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase flex items-center gap-1 tracking-wider"><Activity className="w-3 h-3" />Cross-Cluster Insights</p>
              {result.cross_cluster_insights.map((s, i) => (
                <p key={i} className="text-sm text-foreground/90 pl-3 border-l-2 border-primary/40 leading-relaxed">• {s}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function Profiler() {
  const [sessions, setSessions] = useState([]);
  const [allTimelines, setAllTimelines] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const all = await base44.entities.Session.list("-date", 300);
      setSessions(all);

      // Load HR timelines for sessions that have climax markers (needed for near-climax detection)
      const withData = all.filter((s) => s.climax_offset_s != null || s.avg_hr != null);
      const pairs = await Promise.all(
        withData.map((s) =>
          base44.entities.HeartRateTimeline.filter({ session: s.id }, "time_offset_s", 5000).then((rows) => [s.id, rows])
        )
      );
      const map = {};
      pairs.forEach(([id, rows]) => { if (rows.length > 0) map[id] = rows; });
      setAllTimelines(map);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 pb-24 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI Profiler</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{sessions.length} sessions · {Object.keys(allTimelines).length} with HR data</p>
      </div>

      <ClusterPanel sessions={sessions} />
      <NearClimaxPanel sessions={sessions} allTimelines={allTimelines} />
    </div>
  );
}