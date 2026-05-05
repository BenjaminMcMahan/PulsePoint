import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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

    // Delete all existing rows for this session
    while (true) {
      const existing = await base44.asServiceRole.entities[entity].filter({ session: session_id }, filterKey, 1000);
      if (!existing.length) break;
      await Promise.all(existing.map((r) => base44.asServiceRole.entities[entity].delete(r.id)));
      if (existing.length < 1000) break;
    }

    // Insert new rows in chunks of 1000
    const tagged = rows.map((r) => ({ ...r, session: session_id }));
    const CHUNK = 1000;
    for (let i = 0; i < tagged.length; i += CHUNK) {
      await base44.asServiceRole.entities[entity].bulkCreate(tagged.slice(i, i + CHUNK));
    }

    return Response.json({ ok: true, inserted: tagged.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});