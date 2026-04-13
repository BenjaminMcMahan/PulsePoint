import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "../components/PageHeader";
import SessionInfoSection from "../components/session-form/SessionInfoSection";
import HeartRateSection from "../components/session-form/HeartRateSection";
import MethodsSection from "../components/session-form/MethodsSection";
import SubjectiveSection from "../components/session-form/SubjectiveSection";
import PhysiologicalSection from "../components/session-form/PhysiologicalSection";
import ContextSection from "../components/session-form/ContextSection";
import NotesMediaSection from "../components/session-form/NotesMediaSection";
import EventTimelineSection from "../components/session-form/EventTimelineSection";
import { Zap, Save, ChevronDown, ChevronUp } from "lucide-react";
import { Link } from "react-router-dom";

const SECTIONS = [
  { id: "info", label: "Session Info" },
  { id: "hr", label: "Heart Rate" },
  { id: "methods", label: "Methods & Devices" },
  { id: "subjective", label: "Subjective Metrics" },
  { id: "physio", label: "Physiological" },
  { id: "context", label: "Context" },
  { id: "events", label: "Event Timeline" },
  { id: "notes", label: "Notes & Media" },
];

function calcDuration(start, end) {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff < 0) diff += 1440;
  return diff;
}

export default function NewSession() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(new Set(["info", "subjective", "methods"]));
  const [data, setData] = useState({
    date: new Date().toISOString(),
    methods: [],
    intensity: 5,
    buildup_quality: 5,
    control: 5,
    satisfaction: 5,
    substances: [],
    tags: [],
    media_images: [],
    hr_timeline: [],
    is_favorite: false,
  });

  const toggleSection = (id) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  const handleSave = async () => {
    if (!data.methods?.length) {
      toast({ title: "Please select at least one method", variant: "destructive" });
      return;
    }
    setSaving(true);
    const duration = calcDuration(data.start_time, data.end_time);
    const { _csv_rows, ...sessionData } = data;
    const session = await base44.entities.Session.create({
      ...sessionData,
      duration_minutes: duration || data.duration_minutes,
    });
    // Import HeartRateTimeline rows — delete any existing first, then bulk-create
    if (_csv_rows && _csv_rows.length > 0) {
      const existing = await base44.entities.HeartRateTimeline.filter({ session: session.id }, "time_offset_s", 10000);
      await Promise.all(existing.map((r) => base44.entities.HeartRateTimeline.delete(r.id)));
      const rows = _csv_rows.map((r) => ({ ...r, session: session.id }));
      await base44.entities.HeartRateTimeline.bulkCreate(rows);
    }
    toast({ title: "Session saved!", duration: 2000 });
    navigate("/sessions");
  };

  const renderSection = (id) => {
    const props = { data, onChange: setData };
    switch (id) {
      case "info": return <SessionInfoSection {...props} />;
      case "hr": return <HeartRateSection {...props} />;
      case "methods": return <MethodsSection {...props} />;
      case "subjective": return <SubjectiveSection {...props} />;
      case "physio": return <PhysiologicalSection {...props} />;
      case "context": return <ContextSection {...props} />;
      case "events": return <EventTimelineSection {...props} />;
      case "notes": return <NotesMediaSection {...props} />;
      default: return null;
    }
  };

  return (
    <div>
      <PageHeader
        title="New Session"
        subtitle="Full entry mode"
        action={
          <Link to="/new/quick">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Zap className="w-4 h-4" /> Quick
            </Button>
          </Link>
        }
      />

      <div className="px-4 space-y-2 pb-6">
        {SECTIONS.map(({ id, label }) => (
          <div key={id} className="bg-card rounded-xl border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection(id)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold"
            >
              {label}
              {expanded.has(id) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expanded.has(id) && (
              <div className="px-4 pb-4 border-t border-border pt-3">
                {renderSection(id)}
              </div>
            )}
          </div>
        ))}

        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full h-14 text-base font-semibold gap-2 mt-4"
        >
          <Save className="w-5 h-5" />
          {saving ? "Saving..." : "Save Session"}
        </Button>
      </div>
    </div>
  );
}