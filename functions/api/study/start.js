function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// POST /api/study/start — 学習セッション開始
export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const { project_id, tag } = body;

  if (!project_id) return json({ error: 'project_id required' }, 400);

  // プロジェクト確認
  const project = await env.DB.prepare('SELECT id, type FROM projects WHERE id = ?').bind(project_id).first();
  if (!project) return json({ error: 'project not found' }, 404);
  if (project.type !== 'study') return json({ error: 'not a study project' }, 400);

  // 既存のアクティブセッションを自動停止
  const now = new Date();
  const { results: active } = await env.DB.prepare(
    'SELECT id, started_at FROM study_sessions WHERE ended_at IS NULL'
  ).all();

  for (const s of active) {
    const duration = Math.floor((now.getTime() - new Date(s.started_at).getTime()) / 60000);
    await env.DB.prepare(
      'UPDATE study_sessions SET ended_at = ?, duration_minutes = ? WHERE id = ?'
    ).bind(now.toISOString(), Math.max(0, duration), s.id).run();
  }

  // JST日付を算出
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const date = jst.toISOString().slice(0, 10);

  const id = crypto.randomUUID();
  const started_at = now.toISOString();

  await env.DB.prepare(`
    INSERT INTO study_sessions (id, project_id, date, started_at, ended_at, duration_minutes, tag)
    VALUES (?, ?, ?, ?, NULL, NULL, ?)
  `).bind(id, project_id, date, started_at, tag || null).run();

  return json({ id, project_id, date, started_at, tag: tag || null }, 201);
}
