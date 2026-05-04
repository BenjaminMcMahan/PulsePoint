import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// In-memory cache: hash → base64 audio string (lives as long as the Deno isolate)
const audioCache = new Map();

async function hashKey(text, voice, speed) {
  const raw = `${voice}|${speed}|${text}`;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { text, voice = "alloy", speed = 1.0 } = await req.json();
    if (!text?.trim()) return Response.json({ error: 'No text provided' }, { status: 400 });

    const key = await hashKey(text, voice, speed);

    // Return cached audio if available
    if (audioCache.has(key)) {
      return Response.json({ audio: audioCache.get(key), cached: true });
    }

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: text,
        voice,
        speed,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return Response.json({ error: err }, { status: response.status });
    }

    const audioBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(audioBuffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);

    // Store in memory cache (cap at 100 entries to avoid OOM)
    if (audioCache.size >= 100) {
      const firstKey = audioCache.keys().next().value;
      audioCache.delete(firstKey);
    }
    audioCache.set(key, base64);

    return Response.json({ audio: base64 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});