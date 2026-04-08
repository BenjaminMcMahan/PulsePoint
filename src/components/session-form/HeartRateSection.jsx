import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useState } from "react";
import { Upload, Plus, Trash2 } from "lucide-react";

export default function HeartRateSection({ data, onChange }) {
  const [uploading, setUploading] = useState(false);
  const update = (field, value) => onChange({ ...data, [field]: value });

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    update("hr_data_file", file_url);
    setUploading(false);
  };

  const addTimelineEntry = () => {
    const timeline = data.hr_timeline || [];
    update("hr_timeline", [...timeline, { minute: timeline.length, hr: 70 }]);
  };

  const updateTimeline = (index, field, value) => {
    const timeline = [...(data.hr_timeline || [])];
    timeline[index] = { ...timeline[index], [field]: Number(value) };
    update("hr_timeline", timeline);
  };

  const removeTimeline = (index) => {
    update("hr_timeline", (data.hr_timeline || []).filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">Heart Rate</h3>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Avg HR</Label>
          <Input
            type="number"
            placeholder="72"
            value={data.avg_hr || ""}
            onChange={(e) => update("avg_hr", Number(e.target.value))}
            className="h-12 mt-1 font-mono text-center"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Max HR</Label>
          <Input
            type="number"
            placeholder="140"
            value={data.max_hr || ""}
            onChange={(e) => update("max_hr", Number(e.target.value))}
            className="h-12 mt-1 font-mono text-center"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">At Climax</Label>
          <Input
            type="number"
            placeholder="135"
            value={data.hr_at_climax || ""}
            onChange={(e) => update("hr_at_climax", Number(e.target.value))}
            className="h-12 mt-1 font-mono text-center"
          />
        </div>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">HR Data File (CSV)</Label>
        <label className="mt-1 flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-3 cursor-pointer hover:border-primary/50 transition-colors">
          <Upload className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {uploading ? "Uploading..." : data.hr_data_file ? "File uploaded ✓" : "Upload CSV"}
          </span>
          <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
        </label>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs text-muted-foreground">HR Timeline</Label>
          <Button type="button" variant="ghost" size="sm" onClick={addTimelineEntry}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add
          </Button>
        </div>
        {(data.hr_timeline || []).map((entry, i) => (
          <div key={i} className="flex gap-2 mb-2 items-center">
            <Input
              type="number"
              placeholder="Min"
              value={entry.minute}
              onChange={(e) => updateTimeline(i, "minute", e.target.value)}
              className="h-10 w-20 font-mono text-center"
            />
            <span className="text-muted-foreground text-xs">min</span>
            <Input
              type="number"
              placeholder="HR"
              value={entry.hr}
              onChange={(e) => updateTimeline(i, "hr", e.target.value)}
              className="h-10 w-20 font-mono text-center"
            />
            <span className="text-muted-foreground text-xs">bpm</span>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeTimeline(i)}>
              <Trash2 className="w-3.5 h-3.5 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}