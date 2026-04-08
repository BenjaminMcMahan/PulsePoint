import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Plus, Check } from "lucide-react";

const DEFAULT_METHODS = [
  "Manual",
  "Silicone Sleeve",
  "Coyote E-Stim",
  "TENS",
  "Foley Catheter",
];

export default function MultiSelect({ selected = [], onChange, options = DEFAULT_METHODS }) {
  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState("");

  const toggle = (item) => {
    if (selected.includes(item)) {
      onChange(selected.filter((s) => s !== item));
    } else {
      onChange([...selected, item]);
    }
  };

  const addCustom = () => {
    if (customValue.trim() && !selected.includes(customValue.trim())) {
      onChange([...selected, customValue.trim()]);
      setCustomValue("");
      setShowCustom(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
              selected.includes(opt)
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border hover:border-primary/50"
            }`}
          >
            {selected.includes(opt) && <Check className="w-3.5 h-3.5" />}
            {opt}
          </button>
        ))}
      </div>
      
      {selected.filter((s) => !options.includes(s)).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.filter((s) => !options.includes(s)).map((custom) => (
            <Badge key={custom} variant="secondary" className="gap-1 py-1">
              {custom}
              <button type="button" onClick={() => toggle(custom)}>
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {showCustom ? (
        <div className="flex gap-2">
          <Input
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            placeholder="Custom method..."
            className="h-10"
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustom())}
          />
          <Button type="button" size="sm" onClick={addCustom} className="h-10">Add</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setShowCustom(false)} className="h-10">
            <X className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowCustom(true)}
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <Plus className="w-3.5 h-3.5" /> Add custom
        </button>
      )}
    </div>
  );
}