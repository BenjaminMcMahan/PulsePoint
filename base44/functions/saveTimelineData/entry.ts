import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, maxRetries = 5, baseDelay = 1000) {
  let delay = baseDelay;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const is429 = err?.message?.includes('Rate limit') || String(err).includes('429');
      if (attempt === maxRetries || !is429) throw err;
      await sleep(delay);
      delay = Math.min(delay * 2, 10000);
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

    if (!['HeartRateTimeline', 'EMGTimeline'].includes(entity)) {
      return Response.json({ error: 'Invalid entity' }, { status: 400 });
    }

    const filterKey = entity === 'EMGTimeline' ? 'time_s' : 'time_offset_s';
    const db = base44.asServiceRole.entities[entity];

    // Delete in parallel batches of 10, fetching 500 at a time, with pause between batches
    while (true) {
      const existing = await withRetry(() => db.filter({ session: session_id }, filterKey, 500));
      if (!existing.length) break;

      // Delete in groups of 10 in parallel, 300ms between groups
      for (let i = 0; i < existing.length; i += 10) {
        await Promise.all(existing.slice(i, i + 10).map((r) => withRetry(() => db.delete(r.id))));
        await sleep(300);
      }

      if (existing.length < 500) break;
      await sleep(500);
    }

    // Insert in chunks of 500, 500ms between chunks
    const tagged = rows.map((r) => ({ ...r, session: session_id }));
    const CHUNK = 500;
    for (let i = 0; i < tagged.length; i += CHUNK) {
      await withRetry(() => db.bulkCreate(tagged.slice(i, i + CHUNK)));
      if (i + CHUNK < tagged.length) await sleep(500);
    }

    return Response.json({ ok: true, inserted: tagged.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});