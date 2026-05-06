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

// Downsample EMG rows: group by N, keep the row with the peak envelope value
function downsampleEMG(rows, targetMax = 10000) {
  if (rows.length <= targetMax) return rows;
  const n = Math.ceil(rows.length / targetMax);
  const result = [];
  for (let i = 0; i < rows.length; i += n) {
    const chunk = rows.slice(i, i + n);
    // Pick the row with the highest signal value in the chunk
    const peak = chunk.reduce((best, r) => {
      const val = Math.max(
        r.level_pct ?? r.env_smooth ?? r.raw_env ?? 0,
        r.left_pct ?? r.left_env ?? 0,
        r.right_pct ?? r.right_env ?? 0
      );
      const bestVal = Math.max(
        best.level_pct ?? best.env_smooth ?? best.raw_env ?? 0,
        best.left_pct ?? best.left_env ?? 0,
        best.right_pct ?? best.right_env ?? 0
      );
      return val >= bestVal ? r : best;
    }, chunk[0]);
    result.push(peak);
  }
  return result;
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

    // Downsample EMG if over 10,000 rows
    let finalRows = rows;
    let downsampled = false;
    if (entity === 'EMGTimeline' && rows.length > 10000) {
      finalRows = downsampleEMG(rows, 10000);
      downsampled = true;
    }

    // Delete existing rows in parallel batches of 10
    while (true) {
      const existing = await withRetry(() => db.filter({ session: session_id }, filterKey, 500));
      if (!existing.length) break;
      for (let i = 0; i < existing.length; i += 10) {
        await Promise.all(existing.slice(i, i + 10).map((r) => withRetry(() => db.delete(r.id))));
        await sleep(300);
      }
      if (existing.length < 500) break;
      await sleep(500);
    }

    // Insert in chunks of 500
    const tagged = finalRows.map((r) => ({ ...r, session: session_id }));
    const CHUNK = 500;
    for (let i = 0; i < tagged.length; i += CHUNK) {
      await withRetry(() => db.bulkCreate(tagged.slice(i, i + CHUNK)));
      if (i + CHUNK < tagged.length) await sleep(500);
    }

    return Response.json({ ok: true, inserted: tagged.length, original: rows.length, downsampled });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});