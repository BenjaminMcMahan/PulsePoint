import { useState, useRef, useEffect } from "react";
import { MessageCircle, Send, ChevronDown, ChevronUp, Sparkles, Save, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";

const PROFILE_CATEGORIES = [
  { key: "physical", label: "Physical Baseline", emoji: "🫀", hint: "Body metrics, fitness, resting HR, medications" },
  { key: "arousal", label: "Arousal Profile", emoji: "📈", hint: "Build style, speed to climax, plateau patterns" },
  { key: "stimulation", label: "Stimulation Methods", emoji: "⚡", hint: "What works best, technique nuances, edging habits" },
  { key: "anatomical", label: "Anatomical Sensitivity", emoji: "🧬", hint: "Nerve sensitivity, pelvic floor, pressure responses" },
  { key: "climax", label: "Climax & Recovery", emoji: "🎯", hint: "Climax intensity, duration, refractory period" },
  { key: "contextual", label: "Contextual Factors", emoji: "🌡️", hint: "Mood, hydration, substances, time of day effects" },
];

const SESSION_CATEGORIES = [
  { key: "sensations", label: "Sensations", emoji: "✋", hint: "What you felt physically during this session" },
  { key: "stimulation", label: "Stimulation Details", emoji: "⚡", hint: "Settings, technique, pauses, adjustments made" },
  { key: "buildup", label: "Build & Edging", emoji: "📈", hint: "How arousal escalated, near-misses, control" },
  { key: "climax", label: "Climax Experience", emoji: "🎯", hint: "Intensity, duration, contractions, ejaculate" },
  { key: "discomfort", label: "Discomfort / Issues", emoji: "⚠️", hint: "Pain, pressure, anything unusual or unexpected" },
  { key: "recovery", label: "Recovery & Aftermath", emoji: "🔄", hint: "Post-climax feelings, refractory, residual sensations" },
];

export default function AIChat({
  mode = "session",
  context,
  savedMessages,
  savedNotes,
  onSaveMessages,
  onSaveNotes,
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(savedMessages || []);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [savingFindings, setSavingFindings] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const categories = mode === "profile" ? PROFILE_CATEGORIES : SESSION_CATEGORIES;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const generateQuestion = async (category) => {
    setGenerating(true);
    setSelectedCategory(category);

    const cat = categories.find((c) => c.key === category);

    const systemPrompt = mode === "profile"
      ? `You are an expert physiologist helping someone build a detailed personal arousal and physiological profile. The user has selected the category "${cat?.label}" (${cat?.hint}). Ask a single, highly specific and clinically insightful question focused on this exact category that would help expand or clarify gaps in their profile. Ask only one question. Be direct and conversational.`
      : `You are an expert physiologist analyzing a specific sexual response session. The user wants to discuss "${cat?.label}" (${cat?.hint}). Ask a single, targeted follow-up question about THIS SPECIFIC SESSION only — not general profile questions. Reference the session data where relevant. Ask only one question. Be direct and conversational.`;

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `${systemPrompt}\n\nContext:\n${context}\n\nPrevious conversation (if any):\n${messages.map(m => `${m.role === "user" ? "User" : "AI"}: ${m.text}`).join("\n")}\n\nAsk your focused question now:`,
    });
    const question = typeof res === "string" ? res.trim() : res?.response?.trim() ?? "";
    const msg = { role: "assistant", text: question, category };
    const updated = [...messages, msg];
    setMessages(updated);
    onSaveMessages?.(updated);
    setGenerating(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleOpen = () => {
    setOpen(true);
    // Restore persisted messages but don't auto-generate — let user pick a category
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", text: input.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    onSaveMessages?.(updated);
    setInput("");
    setLoading(true);

    const history = updated.map((m) => `${m.role === "user" ? "User" : "AI"}: ${m.text}`).join("\n");

    const systemPrompt = mode === "profile"
      ? `You are an expert physiologist helping someone build a detailed personal arousal profile. Respond to their answer briefly (1-2 sentences max) then IMMEDIATELY ask a question about a DIFFERENT aspect of their physiology or arousal profile — do NOT keep drilling into the same topic unless their answer raises a specific, highly clinically relevant detail that absolutely must be clarified. Move forward, cover new ground.`
      : `You are an expert physiologist analyzing a specific sexual response session. Respond to their answer briefly (1-2 sentences max) then IMMEDIATELY ask a question about a DIFFERENT aspect of THIS SESSION — do NOT keep asking about the same subject unless their answer introduces a new specific anatomical or physiological detail that requires immediate clarification. Stay session-specific, move to new ground.`;

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `${systemPrompt}\n\nContext:\n${context}\n\nConversation:\n${history}\n\nRespond now as the AI:`,
    });

    const reply = typeof res === "string" ? res.trim() : res?.response?.trim() ?? "";
    const aiMsg = { role: "assistant", text: reply };
    const finalMessages = [...updated, aiMsg];
    setMessages(finalMessages);
    onSaveMessages?.(finalMessages);
    setLoading(false);
  };

  const saveFindings = async () => {
    setSavingFindings(true);
    const history = messages.map((m) => `${m.role === "user" ? "User" : "AI"}: ${m.text}`).join("\n");
    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `Based on this Q&A conversation about a person's ${mode === "profile" ? "physiological and arousal profile" : "session"}, write 2-4 concise bullet points summarizing only the NEW factual findings from the user's answers that would be useful to persist for future AI analysis. Do not repeat generic information already obvious from the base data. Be specific and factual.\n\nConversation:\n${history}\n\nOutput as plain bullet points starting with "•":`,
    });
    const findings = typeof res === "string" ? res.trim() : res?.response?.trim() ?? "";
    const timestamp = new Date().toISOString().slice(0, 10);
    const newNote = `\n\n[AI Interview — ${timestamp}]\n${findings}`;
    const merged = (savedNotes || "") + newNote;
    onSaveNotes?.(merged);
    setSavingFindings(false);
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 3000);
  };

  const hasUserReplied = messages.some((m) => m.role === "user");
  const hasMessages = messages.length > 0;

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center gap-2 px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
        onClick={() => open ? setOpen(false) : handleOpen()}
      >
        <MessageCircle className="w-4 h-4 text-accent shrink-0" />
        <span className="text-xs font-semibold text-foreground flex-1">
          {mode === "profile" ? "Interview Me — Deepen My Profile" : "Ask the AI — Session Deep Dive"}
        </span>
        {hasMessages && (
          <span className="text-[10px] text-muted-foreground">{messages.length} msg{messages.length !== 1 ? "s" : ""}</span>
        )}
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="p-3 space-y-3">
          <p className="text-[11px] text-muted-foreground">
            {mode === "profile"
              ? "Pick a category and the AI will ask a targeted question to deepen your profile. Findings are saved to your arousal notes."
              : "Pick a topic and the AI will ask a focused question about this specific session. Findings are saved to session notes."}
          </p>

          {/* Category chips */}
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat.key}
                onClick={() => generateQuestion(cat.key)}
                disabled={generating}
                title={cat.hint}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors disabled:opacity-50"
                style={selectedCategory === cat.key
                  ? { background: "hsl(var(--accent))", color: "hsl(var(--accent-foreground))", borderColor: "hsl(var(--accent))" }
                  : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }
                }
              >
                <span>{cat.emoji}</span> {cat.label}
              </button>
            ))}
          </div>

          {/* Message thread */}
          {(hasMessages || generating) && (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1 border-t border-border pt-2">
              {generating && (
                <div className="flex gap-2 items-start">
                  <Sparkles className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    Generating question…
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-2 items-start ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  {msg.role === "assistant" && (
                    <Sparkles className="w-3.5 h-3.5 text-accent shrink-0 mt-1" />
                  )}
                  <div
                    className={`rounded-xl px-3 py-2 text-sm leading-relaxed max-w-[85%] ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-muted/70 text-foreground rounded-tl-sm"
                    }`}
                  >
                    {msg.role === "assistant" && msg.category && (
                      <span className="block text-[9px] font-semibold uppercase tracking-wider mb-1 opacity-60">
                        {categories.find(c => c.key === msg.category)?.emoji} {categories.find(c => c.key === msg.category)?.label}
                      </span>
                    )}
                    {msg.text}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex gap-2 items-start">
                  <Sparkles className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                  <div className="bg-muted/70 rounded-xl rounded-tl-sm px-3 py-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}

          {/* Input — only shown once a question has been asked */}
          {hasMessages && (
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                placeholder="Type your answer…"
                disabled={loading || generating}
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading || generating}
                className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary text-primary-foreground disabled:opacity-40 shrink-0 transition-opacity"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Actions */}
          {hasUserReplied && (
            <div className="flex items-center gap-2 pt-1 border-t border-border flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={saveFindings}
                disabled={savingFindings}
                className="h-7 text-xs gap-1.5"
              >
                {savingFindings
                  ? <><span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />Saving…</>
                  : savedFeedback
                  ? <><Save className="w-3 h-3 text-primary" />Saved!</>
                  : <><Save className="w-3 h-3" />Save Findings</>}
              </Button>
              <button
                onClick={() => { setMessages([]); onSaveMessages?.([]); setSelectedCategory(null); }}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors ml-auto"
              >
                <RefreshCw className="w-3 h-3" /> Clear chat
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}