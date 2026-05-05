import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retry a fn up to maxRetries times, doubling the delay on 429s
async function withRetry(fn, maxRetries = 6, baseDelay = 500) {
  let delay = baseDelay;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const is429 = err?.message?.includes('Rate limit') || err?.status === 429 || String(err).includes('429');
      if (attempt === maxRetries || !is429) throw err;
      await sleep(delay);
      delay = Math.min(delay * 2, 8000);
    }
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { session_id, entity, rows } = await req.json();
    if (!session_id || !entity || !rows) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const validEntities = ['HeartRateTimeline', 'EMGTimeline'];
    if (!validEntities.includes(entity)) {
      return Response.json({ error: 'Invalid entity' }, { status: 400 });
    }

    const filterKey = entity === 'EMGTimeline' ? 'time_s' : 'time_offset_s';
    const db = base44.asServiceRole.entities[entity];

    // Delete existing rows: fetch 200 at a time, delete sequentially with pauses
    while (true) {
      const existing = await withRetry(() => db.filter({ session: session_id }, filterKey, 200));
      if (!existing.length) break;
      for (const r of existing) {
        await withRetry(() => db.delete(r.id));
        await sleep(50); // 50ms between each delete = ~20 req/s
      }
      if (existing.length < 200) break;
      await sleep(300);
    }

    // Insert new rows in chunks of 500 with a pause between chunks
    const tagged = rows.map((r) => ({ ...r, session: session_id }));
    const CHUNK = 500;
    for (let i = 0; i < tagged.length; i += CHUNK) {
      await withRetry(() => db.bulkCreate(tagged.slice(i, i + CHUNK)));
      if (i + CHUNK < tagged.length) await sleep(800);
    }

    return Response.json({ ok: true, inserted: tagged.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});