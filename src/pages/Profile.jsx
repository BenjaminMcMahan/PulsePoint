import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { User, Heart, Activity, Pill, RefreshCw, CheckCircle } from "lucide-react";

function Field({ label, hint, children }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-foreground/80">{label}</label>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

function NumInput({ value, onChange, placeholder, min, max }) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      placeholder={placeholder}
      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
    />
  );
}

const FITNESS_OPTIONS = [
  { value: "sedentary", label: "Sedentary" },
  { value: "light", label: "Light" },
  { value: "moderate", label: "Moderate" },
  { value: "active", label: "Active" },
  { value: "athlete", label: "Athlete" },
];

export default function Profile() {
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [computing, setComputing] = useState(false);
  const [computedRecovery, setComputedRecovery] = useState(null);

  useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      setForm({
        age: u.age ?? null,
        weight_kg: u.weight_kg ?? null,
        resting_hr: u.resting_hr ?? null,
        max_hr: u.max_hr ?? null,
        recovery_hr_60s: u.recovery_hr_60s ?? null,
        medications: u.medications ?? "",
        fitness_level: u.fitness_level ?? "moderate",
      });
    });
  }, []);

  // Auto-compute recovery HR from session HR timelines
  const computeRecovery = async () => {
    setComputing(true);
    const sessions = await base44.entities.Session.list("-date", 50);
    const withPeak = sessions.filter((s) => s.climax_offset_s != null);
    if (!withPeak.length) { setComputing(false); return; }

    const drops = [];
    for (const s of withPeak.slice(0, 20)) {
      const rows = await base44.entities.HeartRateTimeline.filter({ session: s.id }, "time_offset_s", 5000);
      if (rows.length < 5) continue;
      const peakIdx = rows.reduce((best, r, i) => Number(r.hr) > Number(rows[best].hr) ? i : best, 0);
      const peakHr = Number(rows[peakIdx].hr);
      const peakTime = Number(rows[peakIdx].time_offset_s);
      const r60 = rows.find((r) => Number(r.time_offset_s) >= peakTime + 60);
      if (r60) drops.push(peakHr - Number(r60.hr));
    }

    if (drops.length > 0) {
      const avg = Math.round(drops.reduce((a, b) => a + b, 0) / drops.length);
      setComputedRecovery(avg);
      setForm((f) => ({ ...f, recovery_hr_60s: avg }));
    }
    setComputing(false);
  };

  const save = async () => {
    setSaving(true);
    await base44.auth.updateMe(form);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  // Derived estimated max HR
  const estimatedMaxHR = form.age ? 220 - form.age : null;
  const effectiveMaxHR = form.max_hr || estimatedMaxHR;

  if (!user) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="px-4 py-6 pb-24 max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <User className="w-6 h-6 text-primary" /> Physiological Profile
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          These values improve HR zone accuracy and AI analysis across all sessions.
        </p>
      </div>

      {/* Demographics */}
      <div className="bg-card rounded-xl border border-border p-4 space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
          <User className="w-3.5 h-3.5" /> Demographics
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Age (years)">
            <NumInput value={form.age} onChange={(v) => setForm((f) => ({ ...f, age: v }))} placeholder="e.g. 35" min={10} max={100} />
          </Field>
          <Field label="Weight (kg)">
            <NumInput value={form.weight_kg} onChange={(v) => setForm((f) => ({ ...f, weight_kg: v }))} placeholder="e.g. 80" min={30} max={250} />
          </Field>
        </div>
        <Field label="Fitness Level">
          <div className="flex flex-wrap gap-2 mt-1">
            {FITNESS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setForm((f) => ({ ...f, fitness_level: opt.value }))}
                className="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
                style={form.fitness_level === opt.value
                  ? { background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", borderColor: "hsl(var(--primary))" }
                  : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Field>
      </div>

      {/* Heart Rate */}
      <div className="bg-card rounded-xl border border-border p-4 space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
          <Heart className="w-3.5 h-3.5" /> Heart Rate Baselines
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Resting HR (bpm)" hint="Measured at complete rest">
            <NumInput value={form.resting_hr} onChange={(v) => setForm((f) => ({ ...f, resting_hr: v }))} placeholder="e.g. 60" min={30} max={120} />
          </Field>
          <Field label="Max HR (bpm)" hint={estimatedMaxHR ? `Age estimate: ${estimatedMaxHR}` : "Measured or leave blank"}>
            <NumInput value={form.max_hr} onChange={(v) => setForm((f) => ({ ...f, max_hr: v }))} placeholder={estimatedMaxHR ? String(estimatedMaxHR) : "e.g. 185"} min={100} max={230} />
          </Field>
        </div>

        {effectiveMaxHR && form.resting_hr && (
          <div className="bg-muted/60 rounded-lg px-3 py-2 text-xs space-y-1">
            <p className="font-semibold text-foreground/70 uppercase text-[10px] tracking-wider">Computed Zone Boundaries</p>
            {[1,2,3,4,5].map((z) => {
              const lo = Math.round(form.resting_hr + (effectiveMaxHR - form.resting_hr) * ((z - 1) * 0.2));
              const hi = Math.round(form.resting_hr + (effectiveMaxHR - form.resting_hr) * (z * 0.2));
              const zColors = ["#3b82f6","#22c55e","#eab308","#f97316","#ef4444"];
              return (
                <div key={z} className="flex justify-between">
                  <span className="font-semibold" style={{ color: zColors[z-1] }}>Zone {z}</span>
                  <span className="font-mono text-foreground/80">{lo}–{hi} bpm</span>
                </div>
              );
            })}
            <p className="text-[10px] text-muted-foreground mt-1">Uses Karvonen (HR reserve) method</p>
          </div>
        )}

        <Field label="Recovery HR at 60s post-peak (bpm drop)" hint="Average drop from peak HR at 60 seconds after climax">
          <div className="flex gap-2">
            <NumInput value={form.recovery_hr_60s} onChange={(v) => setForm((f) => ({ ...f, recovery_hr_60s: v }))} placeholder="e.g. 18" min={0} max={80} />
            <Button
              variant="outline"
              size="sm"
              onClick={computeRecovery}
              disabled={computing}
              className="shrink-0 gap-1.5 text-xs"
            >
              {computing
                ? <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                : <RefreshCw className="w-3 h-3" />}
              Auto
            </Button>
          </div>
          {computedRecovery != null && (
            <p className="text-[10px] text-primary mt-1">Computed from sessions: avg {computedRecovery} bpm drop</p>
          )}
        </Field>
      </div>

      {/* Medications */}
      <div className="bg-card rounded-xl border border-border p-4 space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
          <Pill className="w-3.5 h-3.5" /> Medications & Conditions
        </h2>
        <Field label="Medications or conditions affecting HR" hint="e.g. beta-blockers, stimulants, arrhythmia — used by AI to contextualize HR data">
          <textarea
            value={form.medications ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, medications: e.target.value }))}
            placeholder="e.g. Metoprolol 25mg daily (beta-blocker)"
            rows={3}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
        </Field>
      </div>

      <Button onClick={save} disabled={saving} className="w-full gap-2">
        {saved
          ? <><CheckCircle className="w-4 h-4" /> Saved!</>
          : saving
          ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</>
          : "Save Profile"}
      </Button>
    </div>
  );
}