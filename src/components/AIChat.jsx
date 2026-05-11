import { useState, useRef, useEffect } from "react";
import { MessageCircle, Send, ChevronDown, ChevronUp, Sparkles, Save, RefreshCw, Mic, MicOff, Volume2, VolumeX } from "lucide-react";
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
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [speakingIdx, setSpeakingIdx] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioRef = useRef(null);

  const categories = mode === "profile" ? PROFILE_CATEGORIES : SESSION_CATEGORIES;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const speakText = async (text, idx) => {
    if (!ttsEnabled) return;
    setSpeakingIdx(idx);
    const res = await base44.functions.invoke("openaiTTS", { text, voice: "nova", speed: 1.0 });
    const audio = res.data?.audio;
    if (!audio) { setSpeakingIdx(null); return; }
    const src = `data:audio/mpeg;base64,${audio}`;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    const el = new Audio(src);
    audioRef.current = el;
    el.onended = () => setSpeakingIdx(null);
    el.onerror = () => setSpeakingIdx(null);
    el.play();
  };

  const stopSpeaking = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setSpeakingIdx(null);
  };

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunksRef.current = [];
    const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
    mediaRecorderRef.current = mr;
    mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setTranscribing(true);
      const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result.split(",")[1];
        const res = await base44.functions.invoke("whisperSTT", { audio_base64: base64, mime_type: "audio/webm" });
        const text = res.data?.text || "";
        if (text) setInput((prev) => (prev ? prev + " " + text : text));
        setTranscribing(false);
        setTimeout(() => inputRef.current?.focus(), 100);
      };
      reader.readAsDataURL(blob);
    };
    mr.start();
    setRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const generateQuestion = async (category) => {
    setGenerating(true);
    setSelectedCategory(category);

    const cat = categories.find((c) => c.key === category);

    const systemPrompt = mode === "profile"
      ? `You are having a casual, insightful conversation to help someone understand their physiology better. They picked "${cat?.label}". Ask ONE short, natural question on that topic — like a curious friend who knows physiology, not a clinical intake form. Keep it under 20 words if possible. No preamble, no "great choice!", just the question.`
      : `You are having a natural conversation about THIS SPECIFIC session. The session context below contains real data — HR numbers, timestamps, methods, events, ratings, notes. They want to explore "${cat?.label}". 
Ask ONE short, hyper-specific question that references a CONCRETE detail from this session's data (e.g. a specific HR value, a logged event, a rating, a method used, a noted sensation). Do NOT ask generic questions that could apply to any session. Under 25 words. No preamble — just the question.
If there are event notes or unusual sensations logged, prioritize asking about those.`;

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `${systemPrompt}\n\nSession data:\n${context}\n\nPrevious conversation (if any):\n${messages.map(m => `${m.role === "user" ? "User" : "AI"}: ${m.text}`).join("\n")}\n\nAsk your hyper-specific question now:`,
    });
    const question = typeof res === "string" ? res.trim() : res?.response?.trim() ?? "";
    const msg = { role: "assistant", text: question, category };
    const updated = [...messages, msg];
    setMessages(updated);
    onSaveMessages?.(updated);
    setGenerating(false);
    const newIdx = updated.length - 1;
    if (ttsEnabled) speakText(question, newIdx);
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
      ? `You're having a casual, natural conversation about someone's physiology and arousal. Acknowledge their answer in one short sentence (warm but not sycophantic), then ask ONE short follow-up question about a DIFFERENT aspect — keep it conversational and under 20 words. No bullet points, no clinical jargon, no lengthy intros.`
      : `You're having a natural conversation about THIS SPECIFIC session. The session data below has real numbers — HR values, event timestamps, ratings, logged notes. Briefly acknowledge their answer (one sentence, warm but not sycophantic), then ask ONE short follow-up that digs into a DIFFERENT concrete detail from this session's data. Reference specific values or events when possible. Under 25 words for the follow-up. No lists, no preamble.`;

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `${systemPrompt}\n\nSession data:\n${context}\n\nConversation:\n${history}\n\nRespond now as the AI:`,
    });

    const reply = typeof res === "string" ? res.trim() : res?.response?.trim() ?? "";
    const aiMsg = { role: "assistant", text: reply };
    const finalMessages = [...updated, aiMsg];
    setMessages(finalMessages);
    onSaveMessages?.(finalMessages);
    setLoading(false);
    const newIdx = finalMessages.length - 1;
    if (ttsEnabled) speakText(reply, newIdx);
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
        {open && (
          <button
            onClick={(e) => { e.stopPropagation(); if (ttsEnabled) stopSpeaking(); setTtsEnabled((v) => !v); }}
            title={ttsEnabled ? "Read questions aloud (on)" : "Read questions aloud (off)"}
            className="p-1 rounded-md transition-colors hover:bg-black/10"
          >
            {ttsEnabled
              ? <Volume2 className="w-4 h-4 text-accent" />
              : <VolumeX className="w-4 h-4 text-muted-foreground" />}
          </button>
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
                        : "bg-muted/70 text-foreground rounded-tl-sm cursor-pointer"
                    }`}
                    onClick={msg.role === "assistant" ? () => speakingIdx === i ? stopSpeaking() : speakText(msg.text, i) : undefined}
                    title={msg.role === "assistant" ? (speakingIdx === i ? "Tap to stop" : "Tap to hear") : undefined}
                  >
                    {msg.role === "assistant" && msg.category && (
                      <span className="block text-[9px] font-semibold uppercase tracking-wider mb-1 opacity-60">
                        {categories.find(c => c.key === msg.category)?.emoji} {categories.find(c => c.key === msg.category)?.label}
                      </span>
                    )}
                    {msg.text}
                    {msg.role === "assistant" && speakingIdx === i && (
                      <span className="ml-2 inline-flex items-center gap-0.5">
                        <span className="w-1 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1 h-3 bg-accent rounded-full animate-bounce" style={{ animationDelay: "100ms" }} />
                        <span className="w-1 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: "200ms" }} />
                      </span>
                    )}
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
                placeholder={transcribing ? "Transcribing…" : recording ? "Recording… tap mic to stop" : "Type or speak your answer…"}
                disabled={loading || generating || transcribing}
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
              {/* Mic button */}
              <button
                onClick={recording ? stopRecording : startRecording}
                disabled={loading || generating || transcribing}
                title={recording ? "Stop recording" : "Speak your answer"}
                className={`flex items-center justify-center w-9 h-9 rounded-lg shrink-0 transition-all disabled:opacity-40 ${recording ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-muted text-muted-foreground hover:text-foreground"}`}
              >
                {transcribing
                  ? <span className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  : recording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
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