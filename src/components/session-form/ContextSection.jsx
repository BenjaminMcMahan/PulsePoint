import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check } from "lucide-react";

const SUBSTANCES = ["None", "Alcohol", "Caffeine", "Cannabis", "Nicotine", "Other"];

export default function ContextSection({ data, onChange }) {
  const update = (field, value) => onChange({ ...data, [field]: value });
  const substances = data.substances || [];

  const toggleSubstance = (s) => {
    if (s === "None") {
      update("substances", ["None"]);
      return;
    }
    const filtered = substances.filter((x) => x !== "None");
    if (filtered.includes(s)) {
      update("substances", filtered.filter((x) => x !== s));
    } else {
      update("substances", [...filtered, s]);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">Context</h3>

      <div>
        <Label className="text-xs text-muted-foreground">Mood Before</Label>
        <Select value={data.mood || ""} onValueChange={(v) => update("mood", v)}>
          <SelectTrigger className="h-12 mt-1"><SelectValue placeholder="Select mood" /></SelectTrigger>
          <SelectContent>
            {["relaxed", "stressed", "neutral", "excited", "tired", "anxious"].map((m) => (
              <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Environment</Label>
        <Select value={data.environment || ""} onValueChange={(v) => update("environment", v)}>
          <SelectTrigger className="h-12 mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
          <SelectContent>
            {["private", "clinical", "experimental", "other"].map((e) => (
              <SelectItem key={e} value={e} className="capitalize">{e}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground mb-2 block">Substances</Label>
        <div className="flex flex-wrap gap-2">
          {SUBSTANCES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleSubstance(s)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
                substances.includes(s)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground border-border hover:border-primary/50"
              }`}
            >
              {substances.includes(s) && <Check className="w-3.5 h-3.5" />}
              {s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Hydration</Label>
        <Select value={data.hydration || ""} onValueChange={(v) => update("hydration", v)}>
          <SelectTrigger className="h-12 mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="high">High</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}