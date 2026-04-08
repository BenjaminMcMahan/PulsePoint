import SliderField from "../SliderField";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function SubjectiveSection({ data, onChange }) {
  const update = (field, value) => onChange({ ...data, [field]: value });

  return (
    <div className="space-y-5">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">Subjective Metrics</h3>

      <SliderField
        label="Intensity of Climax"
        value={data.intensity}
        onChange={(v) => update("intensity", v)}
      />

      <SliderField
        label="Build-up Quality"
        value={data.buildup_quality}
        onChange={(v) => update("buildup_quality", v)}
      />

      <div>
        <Label className="text-xs text-muted-foreground">Climax Duration</Label>
        <Select value={data.climax_duration || ""} onValueChange={(v) => update("climax_duration", v)}>
          <SelectTrigger className="h-12 mt-1"><SelectValue placeholder="Select duration" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="short">Short</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="long">Long</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <SliderField
        label="Control"
        value={data.control}
        onChange={(v) => update("control", v)}
      />

      <SliderField
        label="Satisfaction"
        value={data.satisfaction}
        onChange={(v) => update("satisfaction", v)}
      />
    </div>
  );
}