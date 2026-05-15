import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import OpenAI from 'npm:openai';

const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { session_id, voice_transcript, session_data } = await req.json();
    if (!session_id) return Response.json({ error: 'session_id required' }, { status: 400 });

    const s = session_data || {};

    // Build session context for the AI
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
      ? `\n\nVOICE NOTE FROM THE PERSON (transcribed immediately after session):\n"${voice_transcript.trim()}"`
      : '';

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a compassionate, deeply perceptive physiological journal assistant. You help people reflect on their intimate physiological sessions with nuance, warmth, and scientific grounding. You write in second person ("you", "your") directly to the person. Your writing is warm yet precise, introspective yet data-grounded. You never use clinical detachment — you write as if you truly understand and have witnessed the experience alongside them.

CRITICAL FOR TEXT-TO-SPEECH QUALITY:
- Write all numbers as words (e.g., "eight out of ten" not "8/10", "seventy-two beats per minute" not "72 bpm")
- Write times as words ("eleven minutes and twenty seconds" not "11:20")
- Use natural spoken prose — no bullet headers in narrative fields, no markdown
- Short, flowing sentences with natural pauses`,
        },
        {
          role: 'user',
          content: `Generate a rich, personal journal entry for this session. Weave together the session data and the voice note (if present) into a cohesive, emotionally resonant reflection.

SESSION DATA:
${sessionContext}
${transcriptSection}

Respond with a structured JSON journal entry that captures the full emotional and physiological arc of this experience.`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.75,
    });

    const raw = JSON.parse(completion.choices[0].message.content);

    // Normalise — model may or may not wrap in a key
    const entry = raw.journal || raw.entry || raw;

    // Ensure all expected fields exist
    const journal = {
      title: entry.title || `Session Journal — ${new Date(s.date || Date.now()).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
      emotional_reflection: entry.emotional_reflection || entry.emotions || '',
      physiological_observations: entry.physiological_observations || entry.physiology || '',
      experience_narrative: entry.experience_narrative || entry.narrative || '',
      key_moments: Array.isArray(entry.key_moments) ? entry.key_moments : [],
      insights: entry.insights || '',
      next_session_intentions: entry.next_session_intentions || entry.intentions || '',
    };

    return Response.json({ journal });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});