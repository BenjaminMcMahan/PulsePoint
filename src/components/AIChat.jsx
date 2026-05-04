import { useState, useRef, useEffect } from "react";
import { MessageCircle, Send, ChevronDown, ChevronUp, Sparkles, Save, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";

/**
 * AIChat — conversational follow-up panel for session analysis or profile deepening.
 *
 * Props:
 *   mode: "session" | "profile"
 *   context: string  — system context fed to the AI (session data summary or profile summary)
 *   savedMessages: array  — persisted message history
 *   savedNotes: string   — existing persisted free-text notes to append findings to
 *   onSaveMessages: (messages) => void  — called when messages are persisted
 *   onSaveNotes: (notes) => void  — called when new findings are appended to notes
 *   initialQuestion: string | null  — optional AI-generated opener; if null we auto-generate
 */
export default function AIChat({
  mode = "session",
  context,
  savedMessages,
  savedNotes,
  onSaveMessages,
  onSaveNotes,
  initialQuestion = null,
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(savedMessages || []);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [savingFindings, setSavingFindings] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Generate the first AI question when the panel opens for the first time
  const generateOpener = async () => {
    setGenerating(true);
    const systemPrompt = mode === "profile"
      ? `You are an expert physiologist helping someone build a detailed personal arousal and physiological profile. Ask a single, highly specific and clinically insightful follow-up question that would help expand or clarify their profile. Base it on gaps or ambiguities in their profile data. Ask only one question. Be direct and conversational — as if speaking to them personally.`
      : `You are an expert physiologist analyzing a sexual response session. Ask a single, specific follow-up question that would help you better understand something ambiguous or important in this session's data — anatomy, sensation, stimulus response, timing, or subjective experience. Ask only one question. Be direct and conversational.`;

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `${systemPrompt}\n\nContext:\n${context}\n\nAsk your most pertinent single question now.`,
    });
    const question = typeof res === "string" ? res.trim() : res?.response?.trim() ?? "";
    const msg = { role: "assistant", text: question };
    setMessages([msg]);
    onSaveMessages?.([msg]);
    setGenerating(false);
  };

  const handleOpen = async () => {
    setOpen(true);
    if (messages.length === 0) {
      if (initialQuestion) {
        const msg = { role: "assistant", text: initialQuestion };
        setMessages([msg]);
        onSaveMessages?.([msg]);
      } else {
        await generateOpener();
      }
    }
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", text: input.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    onSaveMessages?.(updated);
    setInput("");
    setLoading(true);

    // Build conversation history for the LLM
    const history = updated.map((m) => `${m.role === "user" ? "User" : "AI"}: ${m.text}`).join("\n");

    const systemPrompt = mode === "profile"
      ? `You are an expert physiologist helping someone build a detailed personal arousal profile. Based on the context and conversation so far, either: (1) respond to their answer with a follow-up insight or clarifying question, OR (2) if you have enough information, summarize what you've learned in 1-2 sentences then ask another probing question about a different aspect of their physiology. Be specific, warm, and direct. Keep responses concise.`
      : `You are an expert physiologist analyzing a sexual response session. Based on the session context and conversation, either: (1) respond to their answer with a physiological insight or follow-up question, OR (2) if their answer is complete, acknowledge what you've learned and ask another pertinent question about the session's physiology, anatomy, or experience. Be specific, direct, and concise.`;

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `${systemPrompt}\n\nContext:\n${context}\n\nConversation so far:\n${history}\n\nRespond now as the AI:`,
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
    // Ask the AI to distill key findings from the conversation into a concise note
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

  const resetChat = async () => {
    setMessages([]);
    onSaveMessages?.([]);
    await generateOpener();
  };

  const hasUserReplied = messages.some((m) => m.role === "user");

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center gap-2 px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
        onClick={() => open ? setOpen(false) : handleOpen()}
      >
        <MessageCircle className="w-4 h-4 text-accent shrink-0" />
        <span className="text-xs font-semibold text-foreground flex-1">
          {mode === "profile" ? "Interview Me — Deepen My Profile" : "Ask the AI — Follow-up Questions"}
        </span>
        {messages.length > 0 && (
          <span className="text-[10px] text-muted-foreground">{messages.length} msg{messages.length !== 1 ? "s" : ""}</span>
        )}
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="p-3 space-y-3">
          {/* Description */}
          <p className="text-[11px] text-muted-foreground">
            {mode === "profile"
              ? "The AI will ask targeted questions to expand your physiological and arousal profile. Your answers are saved to your profile notes and used in future analysis."
              : "The AI will ask follow-up questions about this session to uncover additional physiological insights. Findings are saved to the session notes."}
          </p>

          {/* Message thread */}
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
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

          {/* Input */}
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
                onClick={resetChat}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors ml-auto"
              >
                <RefreshCw className="w-3 h-3" /> New question
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}