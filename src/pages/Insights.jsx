import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "../components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Trophy, Heart, TrendingUp, TrendingDown, AlertTriangle, Star } from "lucide-react";
import moment from "moment";
import { Link } from "react-router-dom";

function InsightCard({ icon: Icon, color, title, description, sessionId }) {
  const content = (
    <div className="bg-card rounded-xl border border-border p-4 flex gap-3 items-start">
      <div className={`w-9 h-9 rounded-lg bg-${color}/10 flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-5 h-5 text-${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
  
  if (sessionId) {
    return <Link to={`/sessions/${sessionId}`}>{content}</Link>;
  }
  return content;
}

export default function Insights() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const data = await base44.entities.Session.list("-date", 500);
      setSessions(data);
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

  const insights = [];

  if (sessions.length === 0) {
    return (
      <div>
        <PageHeader title="Insights" subtitle="Smart analysis of your sessions" />
        <div className="px-4 text-center py-12 text-muted-foreground text-sm">
          Record some sessions first to see insights
        </div>
      </div>
    );
  }

  // Highest intensity
  const maxIntensity = sessions.reduce((best, s) => (!best || s.intensity > best.intensity ? s : best), null);
  if (maxIntensity) {
    insights.push({
      icon: Trophy,
      color: "chart-4",
      title: `Peak Intensity: ${maxIntensity.intensity}/10`,
      description: `Achieved on ${moment(maxIntensity.date).format("MMM D, YYYY")} using ${(maxIntensity.methods || []).join(", ")}`,
      sessionId: maxIntensity.id,
    });
  }

  // Highest HR
  const maxHRSession = sessions.filter((s) => s.max_hr).reduce((best, s) => (!best || s.max_hr > best.max_hr ? s : best), null);
  if (maxHRSession) {
    insights.push({
      icon: Heart,
      color: "chart-3",
      title: `Peak HR: ${maxHRSession.max_hr} bpm`,
      description: `Recorded on ${moment(maxHRSession.date).format("MMM D, YYYY")}`,
      sessionId: maxHRSession.id,
    });
  }

  // Trend detection (last 5 vs previous 5)
  if (sessions.length >= 6) {
    const recent5 = sessions.slice(0, 5);
    const prev5 = sessions.slice(5, 10);
    const recentAvg = recent5.reduce((a, s) => a + (s.intensity || 0), 0) / recent5.length;
    const prevAvg = prev5.reduce((a, s) => a + (s.intensity || 0), 0) / prev5.length;
    const diff = recentAvg - prevAvg;
    
    if (Math.abs(diff) >= 0.5) {
      insights.push({
        icon: diff > 0 ? TrendingUp : TrendingDown,
        color: diff > 0 ? "chart-1" : "chart-3",
        title: `Intensity ${diff > 0 ? "Trending Up" : "Trending Down"}`,
        description: `Recent avg: ${recentAvg.toFixed(1)} vs previous: ${prevAvg.toFixed(1)} (${diff > 0 ? "+" : ""}${diff.toFixed(1)})`,
      });
    }
  }

  // Most effective method
  const methodStats = {};
  sessions.forEach((s) => {
    (s.methods || []).forEach((m) => {
      if (!methodStats[m]) methodStats[m] = { total: 0, count: 0 };
      methodStats[m].total += s.intensity || 0;
      methodStats[m].count++;
    });
  });
  const methodAvgs = Object.entries(methodStats)
    .filter(([_, v]) => v.count >= 2)
    .map(([name, v]) => ({ name, avg: v.total / v.count, count: v.count }))
    .sort((a, b) => b.avg - a.avg);

  if (methodAvgs.length > 0) {
    insights.push({
      icon: Star,
      color: "chart-2",
      title: `Best Method: ${methodAvgs[0].name}`,
      description: `Avg intensity ${methodAvgs[0].avg.toFixed(1)}/10 across ${methodAvgs[0].count} sessions`,
    });
  }

  // Discomfort warning
  const discomfortSessions = sessions.filter((s) => s.discomfort);
  if (discomfortSessions.length > 0) {
    const pct = ((discomfortSessions.length / sessions.length) * 100).toFixed(0);
    insights.push({
      icon: AlertTriangle,
      color: "destructive",
      title: `${discomfortSessions.length} sessions with discomfort`,
      description: `${pct}% of all sessions reported discomfort`,
    });
  }

  // Favorites count
  const favorites = sessions.filter((s) => s.is_favorite);
  if (favorites.length > 0) {
    const avgFavInt = (favorites.reduce((a, s) => a + (s.intensity || 0), 0) / favorites.length).toFixed(1);
    insights.push({
      icon: Star,
      color: "chart-4",
      title: `${favorites.length} Favorite Sessions`,
      description: `Average intensity of favorites: ${avgFavInt}/10`,
    });
  }

  return (
    <div>
      <PageHeader title="Insights" subtitle={`Based on ${sessions.length} sessions`} />

      <div className="px-4 space-y-3 pb-6">
        {/* Summary badges */}
        <div className="flex flex-wrap gap-2 mb-2">
          <Badge variant="outline" className="py-1">{sessions.length} sessions</Badge>
          {sessions.length > 0 && (
            <Badge variant="outline" className="py-1">
              Since {moment(sessions[sessions.length - 1].date).format("MMM YYYY")}
            </Badge>
          )}
        </div>

        {insights.map((insight, i) => (
          <InsightCard key={i} {...insight} />
        ))}

        {/* Method breakdown */}
        {methodAvgs.length > 1 && (
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Method Rankings by Avg Intensity
            </h3>
            <div className="space-y-2">
              {methodAvgs.map((m, i) => (
                <div key={m.name} className="flex items-center gap-3">
                  <span className="text-xs font-bold font-mono w-5 text-muted-foreground">{i + 1}</span>
                  <div className="flex-1">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium">{m.name}</span>
                      <span className="font-mono text-muted-foreground">{m.avg.toFixed(1)} ({m.count}x)</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${(m.avg / 10) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}