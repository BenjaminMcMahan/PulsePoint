import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "../components/PageHeader";
import SessionCard from "../components/SessionCard";
import { PlusCircle, Search, SlidersHorizontal, X, Download } from "lucide-react";

const ALL_METHODS = ["Manual", "Silicone Sleeve", "Coyote E-Stim", "TENS", "Foley Catheter"];

export default function Sessions() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState("");
  const [filterMethod, setFilterMethod] = useState("");
  const [filterIntMin, setFilterIntMin] = useState("");
  const [filterIntMax, setFilterIntMax] = useState("");

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    const data = await base44.entities.Session.list("-date", 200);
    setSessions(data);
    setLoading(false);
  };

  const filtered = sessions.filter((s) => {
    if (filterMethod && !(s.methods || []).includes(filterMethod)) return false;
    if (filterIntMin && s.intensity < Number(filterIntMin)) return false;
    if (filterIntMax && s.intensity > Number(filterIntMax)) return false;
    if (search) {
      const q = search.toLowerCase();
      const text = [s.notes, s.unusual_sensations, ...(s.methods || []), ...(s.tags || [])].join(" ").toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  const exportCSV = () => {
    const headers = ["Date","Start","End","Duration","Avg HR","Max HR","HR at Climax","Methods","Intensity","Build-up","Control","Satisfaction","Climax Duration","Mood","Environment","Tags"];
    const rows = filtered.map((s) => [
      s.date?.split("T")[0], s.start_time, s.end_time, s.duration_minutes,
      s.avg_hr, s.max_hr, s.hr_at_climax, (s.methods || []).join(";"),
      s.intensity, s.buildup_quality, s.control, s.satisfaction,
      s.climax_duration, s.mood, s.environment, (s.tags || []).join(";")
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "sessions.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Sessions"
        subtitle={`${sessions.length} total`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={exportCSV} className="h-9 w-9">
              <Download className="w-4 h-4" />
            </Button>
            <Link to="/new">
              <Button size="sm" className="gap-1.5 h-9">
                <PlusCircle className="w-4 h-4" /> New
              </Button>
            </Link>
          </div>
        }
      />

      <div className="px-4 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sessions..."
              className="pl-9 h-10"
            />
          </div>
          <Button
            variant={showFilters ? "secondary" : "outline"}
            size="icon"
            className="h-10 w-10"
            onClick={() => setShowFilters(!showFilters)}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </Button>
        </div>

        {showFilters && (
          <div className="bg-card rounded-xl border border-border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Filters</span>
              <button
                onClick={() => { setFilterMethod(""); setFilterIntMin(""); setFilterIntMax(""); }}
                className="text-xs text-primary"
              >
                Clear all
              </button>
            </div>
            <Select value={filterMethod} onValueChange={setFilterMethod}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Method" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all_methods">All Methods</SelectItem>
                {ALL_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                placeholder="Min intensity"
                value={filterIntMin}
                onChange={(e) => setFilterIntMin(e.target.value)}
                className="h-10"
              />
              <Input
                type="number"
                placeholder="Max intensity"
                value={filterIntMax}
                onChange={(e) => setFilterIntMax(e.target.value)}
                className="h-10"
              />
            </div>
          </div>
        )}

        <div className="space-y-2 pb-4">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">No sessions found</p>
              <Link to="/new" className="text-primary text-sm mt-1 inline-block">Record your first session →</Link>
            </div>
          ) : (
            filtered.map((s) => <SessionCard key={s.id} session={s} />)
          )}
        </div>
      </div>
    </div>
  );
}