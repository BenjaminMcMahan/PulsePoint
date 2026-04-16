import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import { Save, ChevronDown, ChevronUp, ArrowLeft } from "lucide-react";

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

export default function EditSession() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(new Set(["info", "subjective", "methods"]));
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      const results = await base44.entities.Session.filter({ id });
      if (results[0]) setData(results[0]);
      setLoading(false);
    })();
  }, [id]);

  const toggleSection = (sectionId) => {
    const next = new Set(expanded);
    if (next.has(sectionId)) next.delete(sectionId);
    else next.add(sectionId);
    setExpanded(next);
  };

  const handleSave = async () => {
    if (!data.methods?.length) {
      toast({ title: "Please select at least one method", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const duration = calcDuration(data.start_time, data.end_time);
      // Exclude internal/computed fields that shouldn't be re-saved
      const { _csv_rows, ai_analysis, ai_cascade, ...sessionData } = data;
      await base44.entities.Session.update(id, {
        ...sessionData,
        duration_minutes: duration || data.duration_minutes,
      });
      if (_csv_rows && _csv_rows.length > 0) {
        const existing = await base44.entities.HeartRateTimeline.filter({ session: id }, "time_offset_s", 10000);
        await Promise.all(existing.map((r) => base44.entities.HeartRateTimeline.delete(r.id)));
        const rows = _csv_rows.map((r) => ({ ...r, session: id }));
        await base44.entities.HeartRateTimeline.bulkCreate(rows);
      }
      toast({ title: "Session updated!", duration: 2000 });
      navigate(`/sessions/${id}`);
    } catch (err) {
      toast({ title: "Save failed: " + err.message, variant: "destructive" });
      setSaving(false);
    }
  };

  const renderSection = (sectionId) => {
    const props = { data, onChange: setData };
    switch (sectionId) {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return <div className="p-6 text-center text-muted-foreground">Session not found</div>;
  }

  return (
    <div>
      <PageHeader
        title="Edit Session"
        subtitle="Update session details"
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
        }
      />

      <div className="px-4 space-y-2 pb-6">
        {SECTIONS.map(({ id: sId, label }) => (
          <div key={sId} className="bg-card rounded-xl border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection(sId)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold"
            >
              {label}
              {expanded.has(sId) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expanded.has(sId) && (
              <div className="px-4 pb-4 border-t border-border pt-3">
                {renderSection(sId)}
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
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}