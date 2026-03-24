function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// POST /api/projects/:id/tasks/bulk-text — テキスト一括登録（改行区切り）
export async function onRequestPost({ params, request, env }) {
  const { id: project_id } = params;
  const body = await request.json();
  const { text } = body;

  if (!text || typeof text !== 'string') {
    return json({ error: 'text required' }, 400);
  }

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (!lines.length) {
    return json({ error: 'no tasks found' }, 400);
  }

  // 現在のmax sort_orderを取得
  const maxOrder = await env.DB.prepare(
    'SELECT MAX(sort_order) as max_order FROM tasks WHERE project_id = ?'
  ).bind(project_id).first();
  let sortOrder = (maxOrder?.max_order || 0) + 1;

  const now = new Date().toISOString();
  const stmts = lines.map(line => {
    const id = crypto.randomUUID();
    const order = sortOrder++;
    return env.DB.prepare(`
      INSERT INTO tasks (id, project_id, text, priority, status, created_at, sort_order)
      VALUES (?, ?, ?, 'mid', 'open', ?, ?)
    `).bind(id, project_id, line, now, order);
  });

  await env.DB.batch(stmts);

  return json({ ok: true, count: lines.length }, 201);
}
