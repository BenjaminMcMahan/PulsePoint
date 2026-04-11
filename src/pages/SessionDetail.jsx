import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PageHeader from "../components/PageHeader";
import { ArrowLeft, Star, Trash2, Heart, Clock, Zap, Pencil } from "lucide-react";
import moment from "moment";
import HRTimelineChart from "../components/HRTimelineChart";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";

function InfoRow({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex justify-between py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right max-w-[60%]">{value}</span>
    </div>
  );
}

function MetricBadge({ label, value, max = 10 }) {
  if (!value) return null;
  const pct = (value / max) * 100;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-bold">{value}/{max}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function SessionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [timelineRows, setTimelineRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const elevatedTime = timelineRows.length > 1
    ? timelineRows.reduce((total, row, i) => {
        if (i === 0) return total;
        const delta = Number(row.elevated_delta);
        if (isNaN(delta) || delta <= 8) return total;
        const dt = Number(row.time_offset_s) - Number(timelineRows[i - 1].time_offset_s);
        return total + (dt > 0 ? dt : 0);
      }, 0)
    : null;

  useEffect(() => {
    (async () => {
      const all = await base44.entities.Session.filter({ id });
      const s = all[0];
      setSession(s);
      const rows = await base44.entities.HeartRateTimeline.filter({ session: id }, "time_offset_s", 2000);
      setTimelineRows(rows);

      // Auto-compute phase HR metrics for existing sessions that have markers but no computed values
      if (rows.length > 0 && s && (!s.hr_avg_pre_to_climax || !s.hr_avg_at_climax_window)) {
        const updates = {};
        if (s.pre_climax_offset_s != null && s.climax_offset_s != null && !s.hr_avg_pre_to_climax) {
          const lo = Math.min(s.pre_climax_offset_s, s.climax_offset_s);
          const hi = Math.max(s.pre_climax_offset_s, s.climax_offset_s);
          const seg = rows.filter((r) => Number(r.time_offset_s) >= lo && Number(r.time_offset_s) <= hi);
          if (seg.length > 0)
            updates.hr_avg_pre_to_climax = Math.round(seg.reduce((a, r) => a + Number(r.hr), 0) / seg.length);
        }
        if (s.climax_offset_s != null && !s.hr_avg_at_climax_window) {
          const win = rows.filter((r) => Math.abs(Number(r.time_offset_s) - s.climax_offset_s) <= 30);
          if (win.length > 0)
            updates.hr_avg_at_climax_window = Math.round(win.reduce((a, r) => a + Number(r.hr), 0) / win.length);
        }
        if (Object.keys(updates).length > 0) {
          await base44.entities.Session.update(id, updates);
          setSession((prev) => ({ ...prev, ...updates }));
        }
      }

      setLoading(false);
    })();
  }, [id]);

  const handleDelete = async () => {
    await base44.entities.Session.delete(id);
    navigate("/sessions");
  };

  const toggleFav = async () => {
    await base44.entities.Session.update(id, { is_favorite: !session.is_favorite });
    setSession((s) => ({ ...s, is_favorite: !s.is_favorite }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <div className="p-6 text-center text-muted-foreground">Session not found</div>;
  }

  const s = session;
  const cap = (str) => str ? str.charAt(0).toUpperCase() + str.slice(1) : str;

  return (
    <div>
      <div className="px-4 pt-4 flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">{moment(s.date).format("MMM D, YYYY")}</h1>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            {s.start_time && <><Clock className="w-3 h-3" />{s.start_time}</>}
            {s.end_time && ` – ${s.end_time}`}
            {s.duration_minutes && <> · <strong>{s.duration_minutes}m</strong></>}
            {s.is_quick_entry && <><Zap className="w-3 h-3 ml-1" /> Quick</>}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => navigate(`/sessions/${id}/edit`)}>
          <Pencil className="w-5 h-5 text-muted-foreground" />
        </Button>
        <Button variant="ghost" size="icon" onClick={toggleFav}>
          <Star className={`w-5 h-5 ${s.is_favorite ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground"}`} />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon"><Trash2 className="w-5 h-5 text-destructive" /></Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete session?</AlertDialogTitle>
              <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="px-4 py-4 space-y-4 pb-8">
        {/* Subjective Metrics */}
        <div className="bg-card rounded-xl border border-border p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">Metrics</h3>
          <MetricBadge label="Intensity" value={s.intensity} />
          <MetricBadge label="Build Quality" value={s.build_quality} />

          <MetricBadge label="Satisfaction" value={s.satisfaction} />
          {s.build_type && <InfoRow label="Build Type" value={s.build_type === "Other" && s.custom_build_type ? s.custom_build_type : s.build_type} />}
          {s.climax_duration && (
            <InfoRow label="Climax Duration" value={cap(s.climax_duration)} />
          )}
        </div>

        {/* Heart Rate */}
        <div className="bg-card rounded-xl border border-border p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <Heart className="w-3.5 h-3.5" /> Heart Rate
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {[["Avg", s.avg_hr], ["Max", s.max_hr], ["Climax", s.hr_at_climax]].map(([label, val]) => (
              <div key={label} className="text-center">
                <p className="text-2xl font-bold font-mono">{val || "—"}</p>
                <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
              </div>
            ))}
          </div>
          {(s.hr_avg_pre_to_climax || s.hr_avg_at_climax_window) && (
            <div className="grid grid-cols-2 gap-2">
              {s.hr_avg_pre_to_climax && (
                <div className="flex items-center justify-between rounded-lg bg-chart-2/10 px-3 py-2">
                  <span className="text-xs text-muted-foreground">Avg HR Pre→Climax</span>
                  <span className="text-sm font-mono font-bold text-chart-2">{s.hr_avg_pre_to_climax} bpm</span>
                </div>
              )}
              {s.hr_avg_at_climax_window && (
                <div className="flex items-center justify-between rounded-lg bg-chart-3/10 px-3 py-2">
                  <span className="text-xs text-muted-foreground">Avg HR ±30s Climax</span>
                  <span className="text-sm font-mono font-bold text-chart-3">{s.hr_avg_at_climax_window} bpm</span>
                </div>
              )}
            </div>
          )}
          {elevatedTime != null && elevatedTime > 0 && (
            <div className="flex items-center justify-between rounded-lg bg-chart-3/10 px-3 py-2">
              <span className="text-xs text-muted-foreground">Elevated Time <span className="text-[10px]">(Δ &gt; 8)</span></span>
              <span className="text-sm font-mono font-bold text-chart-3">{Math.round(elevatedTime)}s</span>
            </div>
          )}
          {timelineRows.length > 0 && (
            <HRTimelineChart
              rows={timelineRows}
              savedMarkers={{
                pre_climax_offset_s: s.pre_climax_offset_s,
                climax_offset_s: s.climax_offset_s,
                recovery_offset_s: s.recovery_offset_s,
              }}
              onMarkersChange={async (markers) => {
                await base44.entities.Session.update(id, markers);
                setSession((prev) => ({ ...prev, ...markers }));
              }}
            />
          )}
          {timelineRows.length === 0 && s.hr_timeline?.length > 0 && (
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={s.hr_timeline}>
                  <XAxis dataKey="minute" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="hr" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Methods */}
        <div className="bg-card rounded-xl border border-border p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">Methods</h3>
          <div className="flex flex-wrap gap-1.5">
            {(s.methods || []).map((m) => <Badge key={m} variant="secondary">{m}</Badge>)}
          </div>
          {s.foley_size && <InfoRow label="Foley Size" value={`${s.foley_size} Fr`} />}
          {s.foley_type && <InfoRow label="Foley Type" value={s.foley_type} />}
          {s.estim_notes && <InfoRow label="E-Stim Notes" value={s.estim_notes} />}
          {s.sleeve_type && <InfoRow label="Sleeve" value={s.sleeve_type} />}
          {s.tens_placement && <InfoRow label="TENS Placement" value={s.tens_placement} />}
          {s.estim_screenshot && (
            <img src={s.estim_screenshot} alt="E-Stim settings" className="rounded-lg w-full mt-2" />
          )}
        </div>

        {/* Context */}
        <div className="bg-card rounded-xl border border-border p-4 space-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-primary mb-2">Context</h3>
          <InfoRow label="Mood" value={cap(s.mood)} />
          <InfoRow label="Environment" value={cap(s.environment)} />
          <InfoRow label="Hydration" value={cap(s.hydration)} />
        </div>

        {/* Physiological */}
        <div className="bg-card rounded-xl border border-border p-4 space-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-primary mb-2">Physiological</h3>
          <InfoRow label="Ejaculate Volume" value={cap(s.ejaculate_volume)} />
          <InfoRow label="Discomfort" value={s.discomfort ? "Yes" : "No"} />
          {s.discomfort_notes && <InfoRow label="Discomfort Notes" value={s.discomfort_notes} />}
          {s.unusual_sensations && <InfoRow label="Unusual Sensations" value={s.unusual_sensations} />}
          {s.refractory_notes && <InfoRow label="Refractory Notes" value={s.refractory_notes} />}
        </div>

        {/* Notes */}
        {s.notes && (
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-primary mb-2">Notes</h3>
            <p className="text-sm whitespace-pre-wrap">{s.notes}</p>
          </div>
        )}

        {/* Media */}
        {((s.media_images || []).length > 0 || (s.media_videos || []).length > 0 || s.video_link) && (
          <div className="bg-card rounded-xl border border-border p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">Media</h3>
            {s.media_images?.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {s.media_images.map((url, i) => (
                  <img key={i} src={url} alt="" className="rounded-lg w-full aspect-square object-cover" />
                ))}
              </div>
            )}
            {(s.media_videos || []).length > 0 && (
              <div className="space-y-2">
                {s.media_videos.map((url, i) => (
                  <video key={i} src={url} controls className="w-full rounded-lg bg-black" />
                ))}
              </div>
            )}
            {s.video_link && (
              <a href={s.video_link} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">
                Video Link →
              </a>
            )}
          </div>
        )}

        {/* Tags */}
        {(s.tags || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {s.tags.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
          </div>
        )}
      </div>
    </div>
  );
}