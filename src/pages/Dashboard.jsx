import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import { Activity, Heart, Zap, Target, PlusCircle, TrendingUp, Clock } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import moment from "moment";

export default function Dashboard() {
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

  const total = sessions.length;
  const avgIntensity = total ? (sessions.reduce((a, s) => a + (s.intensity || 0), 0) / total).toFixed(1) : "—";
  const avgHR = (() => {
    const withHR = sessions.filter((s) => s.avg_hr);
    return withHR.length ? (withHR.reduce((a, s) => a + s.avg_hr, 0) / withHR.length).toFixed(0) : "—";
  })();
  const avgBuildQuality = (() => {
    const w = sessions.filter((s) => s.build_quality);
    return w.length ? (w.reduce((a, s) => a + s.build_quality, 0) / w.length).toFixed(1) : "—";
  })();
  const avgDuration = (() => {
    const w = sessions.filter((s) => s.duration_minutes);
    return w.length ? Math.round(w.reduce((a, s) => a + s.duration_minutes, 0) / w.length) + "m" : "—";
  })();
  const topMethod = (() => {
    const counts = {};
    sessions.forEach((s) => (s.methods || []).forEach((m) => { counts[m] = (counts[m] || 0) + 1; }));
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || "—";
  })();

  const chronological = sessions.slice().reverse();

  const intensityOverTime = chronological.map((s) => ({
    date: moment(s.date).format("M/D"),
    intensity: s.intensity,
    build_quality: s.build_quality,
  }));

  const hrOverTime = chronological
    .filter((s) => s.max_hr)
    .map((s) => ({ date: moment(s.date).format("M/D"), hr: s.max_hr }));

  const methodCounts = {};
  sessions.forEach((s) => (s.methods || []).forEach((m) => { methodCounts[m] = (methodCounts[m] || 0) + 1; }));
  const methodData = Object.entries(methodCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name: name.length > 10 ? name.slice(0, 10) + "…" : name, count }));

  // Build Quality by method
  const methodBQ = {};
  sessions.forEach((s) => {
    if (!s.build_quality) return;
    (s.methods || []).forEach((m) => {
      if (!methodBQ[m]) methodBQ[m] = { total: 0, count: 0 };
      methodBQ[m].total += s.build_quality;
      methodBQ[m].count++;
    });
  });
  const methodBQData = Object.entries(methodBQ)
    .filter(([_, v]) => v.count >= 1)
    .map(([name, v]) => ({ name: name.length > 10 ? name.slice(0, 10) + "…" : name, avg: parseFloat((v.total / v.count).toFixed(1)) }))
    .sort((a, b) => b.avg - a.avg);

  const scatterHRvsInt = sessions
    .filter((s) => s.max_hr && s.intensity)
    .map((s) => ({ hr: s.max_hr, intensity: s.intensity, bq: s.build_quality }));

  const scatterBQvsInt = sessions
    .filter((s) => s.build_quality && s.intensity)
    .map((s) => ({ bq: s.build_quality, intensity: s.intensity }));

  const tooltipStyle = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))" };

  return (
    <div>
      <PageHeader
        title="Session Analyzer"
        subtitle="Track · Analyze · Optimize"
        action={
          <Link to="/new">
            <Button size="sm" className="gap-1.5 h-9">
              <PlusCircle className="w-4 h-4" /> New
            </Button>
          </Link>
        }
      />

      <div className="px-4 space-y-4 pb-6">
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Total Sessions" value={total} icon={Activity} />
          <StatCard label="Avg Intensity" value={avgIntensity} icon={Zap} />
          <StatCard label="Avg HR" value={avgHR} icon={Heart} />
          <StatCard label="Avg Build Quality" value={avgBuildQuality} icon={TrendingUp} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Top Method" value={topMethod} icon={Target} />
          <StatCard label="Avg Duration" value={avgDuration} icon={Clock} />
        </div>

        {total > 0 && (
          <>
            {/* Intensity + Build Quality over time */}
            <div className="bg-card rounded-xl border border-border p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Intensity & Build Quality Over Time</h3>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={intensityOverTime}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="intensity" name="Intensity" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 2 }} />
                    <Line type="monotone" dataKey="build_quality" name="Build Quality" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {hrOverTime.length > 0 && (
              <div className="bg-card rounded-xl border border-border p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Max HR Over Time</h3>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={hrOverTime}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Line type="monotone" dataKey="hr" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="bg-card rounded-xl border border-border p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Method Usage</h3>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={methodData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {methodBQData.length > 0 && (
              <div className="bg-card rounded-xl border border-border p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Avg Build Quality by Method</h3>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={methodBQData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="avg" name="Avg Build Quality" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {scatterBQvsInt.length > 1 && (
              <div className="bg-card rounded-xl border border-border p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Build Quality vs Intensity</h3>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" dataKey="bq" name="Build Quality" domain={[0, 10]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" label={{ value: "Build Quality", position: "insideBottom", offset: -2, fontSize: 10 }} />
                      <YAxis type="number" dataKey="intensity" name="Intensity" domain={[0, 10]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Scatter data={scatterBQvsInt} fill="hsl(var(--chart-2))" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {scatterHRvsInt.length > 1 && (
              <div className="bg-card rounded-xl border border-border p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">HR vs Intensity</h3>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" dataKey="hr" name="Max HR" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis type="number" dataKey="intensity" name="Intensity" domain={[0, 10]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Scatter data={scatterHRvsInt} fill="hsl(var(--chart-4))" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </>
        )}

        {total === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-3">No sessions yet</p>
            <Link to="/new">
              <Button className="gap-2"><PlusCircle className="w-4 h-4" /> Record First Session</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}