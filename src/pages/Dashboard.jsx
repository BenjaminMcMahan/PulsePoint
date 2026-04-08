import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import { Activity, Heart, Zap, Target, PlusCircle } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
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
  const topMethod = (() => {
    const counts = {};
    sessions.forEach((s) => (s.methods || []).forEach((m) => { counts[m] = (counts[m] || 0) + 1; }));
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || "—";
  })();

  const intensityOverTime = sessions
    .slice().reverse()
    .map((s) => ({ date: moment(s.date).format("M/D"), intensity: s.intensity }));

  const hrOverTime = sessions
    .filter((s) => s.max_hr)
    .slice().reverse()
    .map((s) => ({ date: moment(s.date).format("M/D"), hr: s.max_hr }));

  const methodCounts = {};
  sessions.forEach((s) => (s.methods || []).forEach((m) => { methodCounts[m] = (methodCounts[m] || 0) + 1; }));
  const methodData = Object.entries(methodCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name: name.length > 10 ? name.slice(0, 10) + "…" : name, count }));

  const scatterData = sessions
    .filter((s) => s.max_hr && s.intensity)
    .map((s) => ({ hr: s.max_hr, intensity: s.intensity }));

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
          <StatCard label="Top Method" value={topMethod} icon={Target} />
        </div>

        {total > 0 && (
          <>
            <div className="bg-card rounded-xl border border-border p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Intensity Over Time</h3>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={intensityOverTime}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Line type="monotone" dataKey="intensity" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 3 }} />
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
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Line type="monotone" dataKey="hr" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={{ r: 3 }} />
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
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {scatterData.length > 1 && (
              <div className="bg-card rounded-xl border border-border p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">HR vs Intensity</h3>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" dataKey="hr" name="Max HR" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis type="number" dataKey="intensity" name="Intensity" domain={[0, 10]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Scatter data={scatterData} fill="hsl(var(--chart-4))" />
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