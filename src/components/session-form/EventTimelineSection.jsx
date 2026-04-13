import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Clock } from "lucide-react";

function parseMmSs(str) {
  const match = str.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const m = parseInt(match[1], 10);
  const s = parseInt(match[2], 10);
  if (s > 59) return null;
  return m * 60 + s;
}

function fmtMmSs(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function EventTimelineSection({ data, onChange }) {
  const events = data.event_timeline || [];
  const [timeInput, setTimeInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [timeError, setTimeError] = useState(false);

  const update = (newEvents) => onChange({ ...data, event_timeline: newEvents });

  const addEvent = () => {
    const seconds = parseMmSs(timeInput.trim());
    if (seconds === null) { setTimeError(true); return; }
    if (!noteInput.trim()) return;
    setTimeError(false);
    const newEvent = { time_s: seconds, note: noteInput.trim() };
    const sorted = [...events, newEvent].sort((a, b) => a.time_s - b.time_s);
    update(sorted);
    setTimeInput("");
    setNoteInput("");
  };

  const removeEvent = (idx) => update(events.filter((_, i) => i !== idx));

  const handleKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); addEvent(); }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">Event Timeline</h3>
      <p className="text-xs text-muted-foreground -mt-2">
        Log notable moments during the session (e.g. electrode moved, stimulation paused).
      </p>

      {/* Existing events */}
      {events.length > 0 && (
        <div className="space-y-1.5">
          {events.map((ev, i) => (
            <div key={i} className="flex items-start gap-2 bg-muted/50 rounded-lg px-3 py-2">
              <span className="font-mono text-xs text-primary shrink-0 mt-0.5 w-10">{fmtMmSs(ev.time_s)}</span>
              <span className="text-sm text-foreground flex-1 leading-snug">{ev.note}</span>
              <button onClick={() => removeEvent(i)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0 mt-0.5">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add new event */}
      <div className="flex gap-2 items-start">
        <div className="shrink-0 w-20">
          <Input
            value={timeInput}
            onChange={(e) => { setTimeInput(e.target.value); setTimeError(false); }}
            onKeyDown={handleKeyDown}
            placeholder="MM:SS"
            className={`h-10 font-mono text-center ${timeError ? "border-destructive" : ""}`}
          />
          {timeError && <p className="text-[10px] text-destructive mt-0.5">Use MM:SS</p>}
        </div>
        <Input
          value={noteInput}
          onChange={(e) => setNoteInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What happened? (e.g. channel B moved to suprapubic)"
          className="h-10 flex-1"
        />
        <Button type="button" onClick={addEvent} size="icon" className="h-10 w-10 shrink-0">
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}