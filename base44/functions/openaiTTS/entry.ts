import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// In-memory cache: hash → base64 audio string (lives as long as the Deno isolate)
const audioCache = new Map();

// In-process serializer — ensures only one OpenAI TTS call runs at a time per isolate
let requestQueue = Promise.resolve();

async function hashKey(text, voice, speed) {
  const raw = `${voice}|${speed}|${text}`;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function fetchTTS(text, voice, speed) {
  // Retry up to 5 times with aggressive exponential backoff on 429
  // OpenAI TTS rate limits reset on a ~60s window
  let response;
  for (let attempt = 0; attempt < 5; attempt++) {
    response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "tts-1", input: text, voice, speed }),
    });

    if (response.status !== 429) break;

    // Respect Retry-After header; fall back to exponential backoff (5s, 10s, 20s, 40s, 60s)
    const retryAfter = response.headers.get("retry-after");
    const waitMs = retryAfter
      ? Math.max(parseFloat(retryAfter) * 1000, 5000)
      : Math.min(5000 * Math.pow(2, attempt), 60000);
    console.log(`TTS 429 — attempt ${attempt + 1}, waiting ${Math.round(waitMs / 1000)}s`);
    await new Promise((r) => setTimeout(r, waitMs));
  }

  return response;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { text, voice = "alloy", speed = 1.0 } = await req.json();
    if (!text?.trim()) return Response.json({ error: 'No text provided' }, { status: 400 });

    const key = await hashKey(text, voice, speed);

    // Return from in-memory cache immediately if available
    if (audioCache.has(key)) {
      return Response.json({ audio: audioCache.get(key), cached: true });
    }

    // Serialize all OpenAI calls — only one runs at a time within this isolate
    let resultBase64 = null;
    let resultError = null;

    await new Promise((resolve) => {
      requestQueue = requestQueue.then(async () => {
        // Re-check cache inside the queue (populated by a concurrent request)
        if (audioCache.has(key)) {
          resultBase64 = audioCache.get(key);
          resolve();
          return;
        }

        const response = await fetchTTS(text, voice, speed);

        if (!response.ok) {
          resultError = { status: response.status, body: await response.text() };
          resolve();
          return;
        }

        const audioBuffer = await response.arrayBuffer();
        const bytes = new Uint8Array(audioBuffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        resultBase64 = btoa(binary);

        // Cache (cap at 100 entries)
        if (audioCache.size >= 100) {
          audioCache.delete(audioCache.keys().next().value);
        }
        audioCache.set(key, resultBase64);
        resolve();
      });
    });

    if (resultError) {
      return Response.json({ error: resultError.body }, { status: resultError.status });
    }

    return Response.json({ audio: resultBase64 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});