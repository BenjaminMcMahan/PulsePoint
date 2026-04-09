import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useState } from "react";
import { Upload, Plus, Trash2, CheckCircle, AlertCircle } from "lucide-react";
import HRTimelineChart from "@/components/HRTimelineChart";

export default function HeartRateSection({ data, onChange }) {
  const [uploading, setUploading] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const update = (fields) => onChange({ ...data, ...fields });

  const handleCSVUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setImportResult(null);

    const { file_url } = await base44.integrations.Core.UploadFile({ file });

    const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
      file_url,
      json_schema: {
        type: "object",
        properties: {
          rows: {
            type: "array",
            items: {
              type: "object",
              properties: {
                timestamp: { type: "string" },
                time_offset_ms: { type: "number" },
                time_offset_s: { type: "number" },
                hr: { type: "number" },
                hr_smoothed: { type: "number" },
                baseline_hr: { type: "number" },
                elevated_delta: { type: "number" },
                marker: { type: "string" },
                note: { type: "string" }
              }
            }
          }
        }
      }
    });

    if (result.status !== "success" || !result.output?.rows) {
      setImportResult({ error: "Could not parse CSV. Make sure it has the required columns (timestamp, time_offset_s, hr)." });
      setUploading(false);
      return;
    }

    const allRows = result.output.rows;
    const validRows = allRows.filter((r) => r.hr != null && !isNaN(Number(r.hr)));
    const skipped = allRows.length - validRows.length;

    if (validRows.length === 0) {
      setImportResult({ error: "No valid rows found. Ensure the 'hr' column is present and numeric." });
      setUploading(false);
      return;
    }

    // Auto-populate summary fields
    const hrs = validRows.map((r) => Number(r.hr));
    const avgHr = Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length);
    const maxHr = Math.max(...hrs);
    const maxOffsetS = Math.max(...validRows.map((r) => Number(r.time_offset_s) || 0));
    const durationMins = Math.round(maxOffsetS / 60);

    // Earliest timestamp
    const timestamps = validRows.map((r) => r.timestamp).filter(Boolean).sort();
    const firstTimestamp = timestamps[0] ? new Date(timestamps[0]).toISOString() : data.date;

    update({
      hr_data_file: file_url,
      avg_hr: avgHr,
      max_hr: maxHr,
      date: firstTimestamp || data.date,
      duration_minutes: durationMins,
      _csv_rows: validRows,
    });

    setImportResult({ imported: validRows.length, skipped });
    setUploading(false);
  };

  const addTimelineEntry = () => {
    const timeline = data.hr_timeline || [];
    update({ hr_timeline: [...timeline, { minute: "", hr: "" }] });
  };

  const updateTimeline = (index, field, value) => {
    const timeline = [...(data.hr_timeline || [])];
    timeline[index] = { ...timeline[index], [field]: Number(value) };
    update({ hr_timeline: timeline });
  };

  const removeTimeline = (index) => {
    update({ hr_timeline: (data.hr_timeline || []).filter((_, i) => i !== index) });
  };

  const csvRows = data._csv_rows || [];

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
            onChange={(e) => update({ avg_hr: Number(e.target.value) })}
            className="h-12 mt-1 font-mono text-center"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Max HR</Label>
          <Input
            type="number"
            placeholder="140"
            value={data.max_hr || ""}
            onChange={(e) => update({ max_hr: Number(e.target.value) })}
            className="h-12 mt-1 font-mono text-center"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">At Climax</Label>
          <Input
            type="number"
            placeholder="135"
            value={data.hr_at_climax || ""}
            onChange={(e) => update({ hr_at_climax: Number(e.target.value) })}
            className="h-12 mt-1 font-mono text-center"
          />
        </div>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">HR Data File (CSV)</Label>
        <label className="mt-1 flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-3 cursor-pointer hover:border-primary/50 transition-colors">
          <Upload className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {uploading ? "Importing..." : csvRows.length > 0 ? `${csvRows.length} rows imported ✓` : "Upload & Import CSV"}
          </span>
          <input type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} disabled={uploading} />
        </label>

        {importResult && (
          <div className={`mt-2 p-2 rounded-lg text-xs flex items-start gap-1.5 ${importResult.error ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
            {importResult.error
              ? <><AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{importResult.error}</>
              : <><CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{importResult.imported} rows imported{importResult.skipped > 0 ? `, ${importResult.skipped} skipped (invalid hr)` : ""}. Summary fields auto-populated.</>
            }
          </div>
        )}
      </div>

      {csvRows.length > 0 && (
        <div>
          <Label className="text-xs text-muted-foreground mb-2 block">HR Timeline Preview</Label>
          <HRTimelineChart rows={csvRows} />
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs text-muted-foreground">Manual HR Timeline</Label>
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