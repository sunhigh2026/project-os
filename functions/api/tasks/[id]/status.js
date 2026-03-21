function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// PATCH /api/tasks/:id/status — ステータス変更
export async function onRequest({ params, request, env }) {
  if (request.method !== 'PATCH') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const { id } = params;
  const body = await request.json();
  const { status } = body;

  if (!status || !['open', 'doing', 'done'].includes(status)) {
    return json({ error: 'status must be open, doing, or done' }, 400);
  }

  const done_at = status === 'done' ? new Date().toISOString() : null;

  if (status === 'doing') {
    // Only set started_at if not already set
    await env.DB.prepare(
      'UPDATE tasks SET status = ?, done_at = ?, started_at = COALESCE(started_at, ?) WHERE id = ?'
    ).bind(status, done_at, new Date().toISOString(), id).run();
  } else if (status === 'open') {
    await env.DB.prepare(
      'UPDATE tasks SET status = ?, done_at = ?, started_at = NULL WHERE id = ?'
    ).bind(status, done_at, id).run();
  } else {
    // done
    await env.DB.prepare(
      'UPDATE tasks SET status = ?, done_at = ? WHERE id = ?'
    ).bind(status, done_at, id).run();
  }

  return json({ ok: true, status });
}
