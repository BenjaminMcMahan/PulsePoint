import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Anthropic from 'npm:@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: Deno.env.get('OPENAI_API_KEY') });

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { session_id, voice_transcript, session_data } = await req.json();
    if (!session_id) return Response.json({ error: 'session_id required' }, { status: 400 });

    const s = session_data || {};

    const sessionContext = [
      s.date ? `Date: ${new Date(s.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}` : null,
      s.duration_minutes ? `Duration: ${s.duration_minutes} minutes` : null,
      s.methods?.length ? `Methods: ${s.methods.join(', ')}` : null,
      s.intensity != null ? `Intensity: ${s.intensity}/10` : null,
      s.satisfaction != null ? `Satisfaction: ${s.satisfaction}/10` : null,
      s.build_quality != null ? `Build quality: ${s.build_quality}/10` : null,
      s.build_type ? `Build type: ${s.build_type}` : null,
      s.climax_duration ? `Climax duration: ${s.climax_duration}` : null,
      s.no_climax ? 'No climax this session' : null,
      s.mood ? `Mood: ${s.mood}` : null,
      s.avg_hr ? `Avg HR: ${s.avg_hr} bpm` : null,
      s.max_hr ? `Max HR: ${s.max_hr} bpm` : null,
      s.hr_at_climax ? `HR at climax: ${s.hr_at_climax} bpm` : null,
      s.ejaculate_volume ? `Ejaculate volume: ${s.ejaculate_volume}` : null,
      s.discomfort ? `Discomfort noted: ${s.discomfort_notes || 'yes'}` : null,
      s.discomfort_entries?.length ? `Discomfort entries: ${s.discomfort_entries.map(d => `severity ${d.severity}/10 — ${d.note}`).join('; ')}` : null,
      s.unusual_sensations ? `Unusual sensations: ${s.unusual_sensations}` : null,
      s.hydration ? `Hydration: ${s.hydration}` : null,
      s.substances?.length ? `Substances: ${s.substances.join(', ')}` : null,
      s.foley_size ? `Foley size: ${s.foley_size}` : null,
      s.foley_type ? `Foley type: ${s.foley_type}` : null,
      s.estim_notes ? `E-stim notes: ${s.estim_notes}` : null,
      s.refractory_notes ? `Refractory notes: ${s.refractory_notes}` : null,
      s.notes ? `Session notes: ${s.notes}` : null,
      s.event_timeline?.length
        ? `Event timeline highlights: ${s.event_timeline.slice(0, 10).map(e => `[${Math.floor(e.time_s / 60)}:${String(Math.round(e.time_s % 60)).padStart(2, '0')}] ${e.note}`).join(' | ')}`
        : null,
    ].filter(Boolean).join('\n');

    const transcriptSection = voice_transcript?.trim()
      ? `\n\nNOTES FROM THE PERSON (written or transcribed immediately after session):\n"${voice_transcript.trim()}"`
      : '';

    const prompt = `You are a compassionate, deeply perceptive physiological journal assistant. You help people reflect on their intimate physiological sessions with nuance, warmth, and scientific grounding. Write in second person ("you", "your") directly to the person. Your writing is warm yet precise, introspective yet data-grounded.

CRITICAL FOR TEXT-TO-SPEECH:
- Write all numbers as words (e.g., "eight out of ten", "seventy-two beats per minute")
- Write times as words ("eleven minutes and twenty seconds")
- Use natural spoken prose — no bullet headers, no markdown symbols
- Short, flowing sentences with natural pauses

SESSION DATA:
${sessionContext}
${transcriptSection}

Respond with ONLY a valid JSON object using EXACTLY these keys:
{
  "title": "a short, evocative title for this journal entry (not just the date)",
  "emotional_reflection": "2-3 sentences about the emotional tone and state during the session",
  "physiological_observations": "2-3 sentences grounding the experience in the physiological data — heart rate, build, intensity",
  "experience_narrative": "3-4 sentences weaving together the full arc of the session as a personal narrative",
  "key_moments": ["one brief sentence per notable moment", "2 to 4 items total"],
  "insights": "1-2 sentences of meaningful insight or pattern noticed",
  "next_session_intentions": "1-2 sentences of intentions or things to try next time"
}`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].text.trim();

    // Extract JSON even if Claude wraps it in markdown code fences
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in Claude response');

    const entry = JSON.parse(jsonMatch[0]);

    const journal = {
      title: entry.title || `Session Journal — ${new Date(s.date || Date.now()).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
      emotional_reflection: entry.emotional_reflection || '',
      physiological_observations: entry.physiological_observations || '',
      experience_narrative: entry.experience_narrative || '',
      key_moments: Array.isArray(entry.key_moments) ? entry.key_moments : [],
      insights: entry.insights || '',
      next_session_intentions: entry.next_session_intentions || '',
    };

    return Response.json({ journal });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});