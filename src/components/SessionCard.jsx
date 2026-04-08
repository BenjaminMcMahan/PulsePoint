import { Link } from "react-router-dom";
import { Star, Heart, Zap, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import moment from "moment";

export default function SessionCard({ session, selectable, selected, onSelect }) {
  const date = moment(session.date).format("MMM D, YYYY");
  const methods = session.methods || [];

  const content = (
    <div className={`bg-card rounded-xl border p-4 transition-all ${
      selected ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/30"
    }`}>
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
            {session.start_time && (
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

      <div className="flex items-center gap-4 mb-2">
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
      </div>

      <div className="flex flex-wrap gap-1">
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
    </div>
  );

  if (selectable) return content;
  return <Link to={`/sessions/${session.id}`}>{content}</Link>;
}