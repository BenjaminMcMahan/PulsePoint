import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";

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
  const [minutes, setMinutes] = useState("");
  const [seconds, setSeconds] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [timeError, setTimeError] = useState(false);

  const update = (newEvents) => onChange({ ...data, event_timeline: newEvents });

  const addEvent = () => {
    const m = parseInt(minutes, 10);
    const s = parseInt(seconds || "0", 10);
    if (isNaN(m) || m < 0 || isNaN(s) || s < 0 || s > 59) { setTimeError(true); return; }
    if (!noteInput.trim()) return;
    setTimeError(false);
    const totalSeconds = m * 60 + s;
    const newEvent = { time_s: totalSeconds, note: noteInput.trim() };
    const sorted = [...events, newEvent].sort((a, b) => a.time_s - b.time_s);
    update(sorted);
    setMinutes("");
    setSeconds("");
    setNoteInput("");
  };

  const removeEvent = (idx) => update(events.filter((_, i) => i !== idx));

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addEvent(); }
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
      <div className="space-y-2">
        <div className="flex gap-2 items-start">
          <div className="flex gap-1 items-center shrink-0">
            <div>
              <Input
                type="number"
                min={0}
                value={minutes}
                onChange={(e) => { setMinutes(e.target.value); setTimeError(false); }}
                placeholder="Min"
                className={`h-10 w-16 font-mono text-center ${timeError ? "border-destructive" : ""}`}
              />
            </div>
            <span className="text-muted-foreground font-bold text-lg pb-0.5">:</span>
            <div>
              <Input
                type="number"
                min={0}
                max={59}
                value={seconds}
                onChange={(e) => { setSeconds(e.target.value); setTimeError(false); }}
                placeholder="Sec"
                className={`h-10 w-16 font-mono text-center ${timeError ? "border-destructive" : ""}`}
              />
            </div>
          </div>
          <Button type="button" onClick={addEvent} size="icon" className="h-10 w-10 shrink-0 ml-auto">
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        {timeError && <p className="text-[10px] text-destructive">Enter valid minutes and seconds (0–59)</p>}
        <Textarea
          value={noteInput}
          onChange={(e) => setNoteInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe the event (e.g. channel B positive electrode moved from perineum to suprapubic, stimulation paused, intensity increased...)&#10;Press Enter to add."
          rows={3}
          className="resize-none"
        />
      </div>
    </div>
  );
}