import { corsHeaders } from "https://deno.land/x/base44@v0.5.0/mod.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function callOpenAITTS(text: string, voice: string, speed: number) {
  let lastStatus = 500;
  let lastMessage = "Unknown TTS error";

  for (let attempt = 0; attempt < 5; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    try {
      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini-tts",
          input: text,
          voice,
          response_format: "mp3",
          speed,
        }),
      });

      clearTimeout(timeout);

      if (response.ok) {
        return response;
      }

      lastStatus = response.status;
      lastMessage = await response.text();

      const retryable = [408, 429, 500, 502, 503, 504].includes(response.status);

      if (!retryable) {
        throw new Error(lastMessage);
      }

      const retryAfter = response.headers.get("retry-after");
      const waitMs = retryAfter
        ? Math.max(Number(retryAfter) * 1000, 1000)
        : Math.min(1000 * 2 ** attempt, 12_000) + Math.floor(Math.random() * 500);

      console.log(
        `OpenAI TTS ${response.status}, retry ${attempt + 1}/5 in ${waitMs}ms`
      );

      await sleep(waitMs);
    } catch (error) {
      clearTimeout(timeout);

      lastMessage = error instanceof Error ? error.message : String(error);

      console.log(`OpenAI TTS exception, retry ${attempt + 1}/5:`, lastMessage);

      if (attempt === 4) break;

      const waitMs = Math.min(1000 * 2 ** attempt, 12_000);
      await sleep(waitMs);
    }
  }

  throw new Error(`OpenAI TTS failed after retries. Status: ${lastStatus}. ${lastMessage}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    if (!OPENAI_API_KEY) {
      return jsonResponse({ error: "Missing OPENAI_API_KEY" }, 500);
    }

    const body = await req.json();

    const text = String(body.text || "").trim();
    const voice = String(body.voice || "alloy");
    const speed = Number(body.speed || 1.0);

    if (!text) {
      return jsonResponse({ error: "Missing text" }, 400);
    }

    if (text.length > 2500) {
      return jsonResponse(
        {
          error: "Text chunk too large",
          length: text.length,
          maxLength: 2500,
        },
        413
      );
    }

    const ttsResponse = await callOpenAITTS(text, voice, speed);
    const audioBuffer = await ttsResponse.arrayBuffer();

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audioBuffer.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("openaiTTS failed:", message);

    return jsonResponse(
      {
        error: "TTS generation failed",
        message,
        retryable: true,
        upstream: "openai"
      },
      502
    );
  }
});