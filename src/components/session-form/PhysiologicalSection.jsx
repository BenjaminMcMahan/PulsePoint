import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function PhysiologicalSection({ data, onChange }) {
  const update = (field, value) => onChange({ ...data, [field]: value });

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">Physiological Notes</h3>

      <div>
        <Label className="text-xs text-muted-foreground">Unusual Sensations</Label>
        <Textarea
          value={data.unusual_sensations || ""}
          onChange={(e) => update("unusual_sensations", e.target.value)}
          placeholder="Describe any unusual sensations..."
          rows={2}
          className="mt-1"
        />
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Refractory Period Notes</Label>
        <Textarea
          value={data.refractory_notes || ""}
          onChange={(e) => update("refractory_notes", e.target.value)}
          placeholder="Recovery time, sensations after..."
          rows={2}
          className="mt-1"
        />
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Ejaculate Volume</Label>
        <Select value={data.ejaculate_volume || ""} onValueChange={(v) => update("ejaculate_volume", v)}>
          <SelectTrigger className="h-12 mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="high">High</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between py-2">
        <Label className="text-sm">Any Discomfort</Label>
        <Switch
          checked={data.discomfort || false}
          onCheckedChange={(v) => update("discomfort", v)}
        />
      </div>

      {data.discomfort && (
        <Textarea
          value={data.discomfort_notes || ""}
          onChange={(e) => update("discomfort_notes", e.target.value)}
          placeholder="Describe discomfort..."
          rows={2}
        />
      )}
    </div>
  );
}