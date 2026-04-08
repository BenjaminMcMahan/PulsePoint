import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SessionInfoSection({ data, onChange }) {
  const update = (field, value) => onChange({ ...data, [field]: value });

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">Session Info</h3>
      
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Date</Label>
          <Input
            type="date"
            value={data.date?.split("T")[0] || ""}
            onChange={(e) => update("date", e.target.value + "T00:00:00")}
            className="h-12 mt-1"
          />
        </div>
        <div />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Start Time</Label>
          <Input
            type="time"
            value={data.start_time || ""}
            onChange={(e) => update("start_time", e.target.value)}
            className="h-12 mt-1"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">End Time</Label>
          <Input
            type="time"
            value={data.end_time || ""}
            onChange={(e) => update("end_time", e.target.value)}
            className="h-12 mt-1"
          />
        </div>
      </div>

      {data.start_time && data.end_time && (
        <div className="bg-muted rounded-lg px-3 py-2 text-sm font-mono">
          Duration: <span className="text-primary font-bold">{calcDuration(data.start_time, data.end_time)} min</span>
        </div>
      )}
    </div>
  );
}

function calcDuration(start, end) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff < 0) diff += 1440;
  return diff;
}