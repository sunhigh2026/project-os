function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// POST /api/study/stop — 学習セッション停止
export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const { session_id } = body;

  if (!session_id) return json({ error: 'session_id required' }, 400);

  const session = await env.DB.prepare(
    'SELECT * FROM study_sessions WHERE id = ?'
  ).bind(session_id).first();

  if (!session) return json({ error: 'session not found' }, 404);
  if (session.ended_at) return json({ error: 'session already stopped' }, 400);

  const now = new Date();
  const ended_at = now.toISOString();
  const duration_minutes = Math.max(0, Math.floor((now.getTime() - new Date(session.started_at).getTime()) / 60000));

  await env.DB.prepare(
    'UPDATE study_sessions SET ended_at = ?, duration_minutes = ? WHERE id = ?'
  ).bind(ended_at, duration_minutes, session_id).run();

  return json({ ok: true, session_id, duration_minutes, ended_at });
}
