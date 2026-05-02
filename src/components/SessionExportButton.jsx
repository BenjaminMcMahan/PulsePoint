import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import moment from "moment";
import { EVENT_CATEGORIES } from "./session-form/EventTimelineSection";

function getCategoryLabel(value) {
  const cat = EVENT_CATEGORIES.find((c) => c.value === value);
  return cat ? cat.label : value;
}

function fmtMmSs(s) {
  const totalS = Math.round(Number(s));
  const m = Math.floor(totalS / 60);
  const sec = totalS % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function buildCSV(session, timelineRows) {
  const s = session;
  const lines = [];

  // Session summary header
  lines.push("=== SESSION SUMMARY ===");
  lines.push(`Date,${moment(s.date).format("MMMM D YYYY")}`);
  lines.push(`Start Time,${s.start_time || ""}`);
  lines.push(`Duration (min),${s.duration_minutes || ""}`);
  lines.push(`Intensity,${s.intensity || ""}`);
  lines.push(`Build Quality,${s.build_quality || ""}`);
  lines.push(`Satisfaction,${s.satisfaction || ""}`);
  lines.push(`Build Type,${s.build_type || ""}`);
  lines.push(`Climax Duration,${s.climax_duration || ""}`);
  lines.push(`Mood,${s.mood || ""}`);
  lines.push(`Environment,${s.environment || ""}`);
  lines.push(`Methods,"${(s.methods || []).join("; ")}"`);
  lines.push(`Ejaculate Volume,${s.ejaculate_volume || ""}`);
  lines.push(`Hydration,${s.hydration || ""}`);
  lines.push(`Avg HR,${s.avg_hr || ""}`);
  lines.push(`Max HR,${s.max_hr || ""}`);
  lines.push(`HR at Climax,${s.hr_at_climax || ""}`);
  lines.push(`Pre-Climax Marker (s),${s.pre_climax_offset_s ?? ""}`);
  lines.push(`Climax Marker (s),${s.climax_offset_s ?? ""}`);
  lines.push(`Recovery Marker (s),${s.recovery_offset_s ?? ""}`);
  if (s.notes) lines.push(`Notes,"${s.notes.replace(/"/g, '""')}"`);
  lines.push("");

  // Event timeline
  if ((s.event_timeline || []).length > 0) {
    lines.push("=== EVENT TIMELINE ===");
    lines.push("Time,Category,Note");
    for (const ev of [...s.event_timeline].sort((a, b) => a.time_s - b.time_s)) {
      const time = fmtMmSs(ev.time_s);
      const cats = Array.isArray(ev.category) ? ev.category : [ev.category].filter(Boolean);
      const catLabel = cats.map(getCategoryLabel).join("+") || "Event";
      lines.push(`${time},"${catLabel}","${(ev.note || "").replace(/"/g, '""')}"`);
    }
    lines.push("");
  }

  // Discomfort log
  if ((s.discomfort_entries || []).length > 0) {
    lines.push("=== DISCOMFORT LOG ===");
    lines.push("Severity,Note");
    for (const d of s.discomfort_entries) {
      lines.push(`${d.severity},"${(d.note || "").replace(/"/g, '""')}"`);
    }
    lines.push("");
  }

  // AI analysis
  const ai = s.ai_analysis;
  if (ai) {
    lines.push("=== AI SESSION ANALYSIS ===");
    if (ai.summary) lines.push(`Summary,"${ai.summary.replace(/"/g, '""')}"`);
    lines.push("");
    for (const [section, label] of [
      ["arousal_arc", "Arousal Arc"],
      ["event_analysis", "Event Analysis"],
      ["phase_analysis", "Phase Analysis"],
      ["notable_findings", "Notable Findings"],
      ["recommendations", "Recommendations"],
    ]) {
      if (ai[section]?.length) {
        lines.push(label);
        for (const item of ai[section]) lines.push(`,"${item.replace(/"/g, '""')}"`);
        lines.push("");
      }
    }
  }

  // HR timeline (if available)
  if (timelineRows.length > 0) {
    lines.push("=== HR TIMELINE ===");
    lines.push("Time (s),HR (bpm)");
    for (const r of timelineRows) {
      lines.push(`${Math.round(Number(r.time_offset_s))},${Math.round(Number(r.hr))}`);
    }
  }

  return lines.join("\n");
}

function buildTextReport(session, timelineRows) {
  const s = session;
  const lines = [];
  const divider = "─".repeat(50);

  lines.push(`SESSION REPORT — ${moment(s.date).format("MMMM D, YYYY")}`);
  lines.push(divider);
  lines.push(`Start: ${s.start_time || "—"}  |  Duration: ${s.duration_minutes ? s.duration_minutes + " min" : "—"}`);
  lines.push(`Mood: ${s.mood || "—"}  |  Environment: ${s.environment || "—"}  |  Hydration: ${s.hydration || "—"}`);
  lines.push(`Methods: ${(s.methods || []).join(", ") || "—"}`);
  lines.push("");
  lines.push("SUBJECTIVE RATINGS");
  lines.push(`  Intensity:     ${s.intensity || "—"}/10`);
  lines.push(`  Build Quality: ${s.build_quality || "—"}/10`);
  lines.push(`  Satisfaction:  ${s.satisfaction || "—"}/10`);
  lines.push(`  Build Type:    ${s.build_type || "—"}`);
  lines.push(`  Climax:        ${s.climax_duration || "—"}`);
  if (s.ejaculate_volume) lines.push(`  Ejaculate:     ${s.ejaculate_volume}`);
  lines.push("");

  if (s.avg_hr || s.max_hr || s.hr_at_climax) {
    lines.push("HEART RATE");
    if (s.avg_hr) lines.push(`  Avg: ${s.avg_hr} bpm`);
    if (s.max_hr) lines.push(`  Max: ${s.max_hr} bpm`);
    if (s.hr_at_climax) lines.push(`  At Climax: ${s.hr_at_climax} bpm`);
    if (s.pre_climax_offset_s != null) lines.push(`  Pre-Climax marker: ${fmtMmSs(s.pre_climax_offset_s)}`);
    if (s.climax_offset_s != null) lines.push(`  Climax marker: ${fmtMmSs(s.climax_offset_s)}`);
    if (s.recovery_offset_s != null) lines.push(`  Recovery marker: ${fmtMmSs(s.recovery_offset_s)}`);
    lines.push("");
  }

  if ((s.event_timeline || []).length > 0) {
    lines.push("EVENT TIMELINE");
    for (const ev of [...s.event_timeline].sort((a, b) => a.time_s - b.time_s)) {
      const cats = Array.isArray(ev.category) ? ev.category : [ev.category].filter(Boolean);
      const catLabel = cats.map(getCategoryLabel).join("+") || "Event";
      lines.push(`  ${fmtMmSs(ev.time_s)}  [${catLabel}]  ${ev.note || ""}`);
    }
    lines.push("");
  }

  if ((s.discomfort_entries || []).length > 0) {
    lines.push("DISCOMFORT LOG");
    for (const d of s.discomfort_entries) {
      lines.push(`  Severity ${d.severity}/10: ${d.note}`);
    }
    lines.push("");
  }

  if (s.unusual_sensations) { lines.push(`UNUSUAL SENSATIONS: ${s.unusual_sensations}`); lines.push(""); }
  if (s.refractory_notes) { lines.push(`REFRACTORY NOTES: ${s.refractory_notes}`); lines.push(""); }
  if (s.notes) { lines.push("NOTES"); lines.push(s.notes); lines.push(""); }

  const ai = s.ai_analysis;
  if (ai) {
    lines.push(divider);
    lines.push("AI SESSION ANALYSIS");
    lines.push(divider);
    if (ai.summary) { lines.push(ai.summary); lines.push(""); }
    for (const [section, label] of [
      ["arousal_arc", "AROUSAL ARC"],
      ["event_analysis", "EVENT ANALYSIS"],
      ["phase_analysis", "PHASE ANALYSIS"],
      ["notable_findings", "NOTABLE FINDINGS"],
      ["recommendations", "RECOMMENDATIONS"],
    ]) {
      if (ai[section]?.length) {
        lines.push(label);
        for (const item of ai[section]) lines.push(`  • ${item}`);
        lines.push("");
      }
    }
  }

  lines.push(divider);
  lines.push(`Exported ${moment().format("MMMM D, YYYY [at] h:mm A")}`);

  return lines.join("\n");
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SessionExportButton({ session, timelineRows = [] }) {
  const [open, setOpen] = useState(false);
  const dateSlug = moment(session.date).format("YYYY-MM-DD");

  const handleCSV = () => {
    downloadFile(buildCSV(session, timelineRows), `session-${dateSlug}.csv`, "text/csv");
    setOpen(false);
  };

  const handleText = () => {
    downloadFile(buildTextReport(session, timelineRows), `session-${dateSlug}.txt`, "text/plain");
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" title="Export session">
          <Download className="w-5 h-5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleCSV}>Export as CSV</DropdownMenuItem>
        <DropdownMenuItem onClick={handleText}>Export as Text Report</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}