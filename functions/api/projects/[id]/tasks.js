function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// GET /api/projects/:id/tasks — プロジェクト内タスク一覧
export async function onRequestGet({ params, env }) {
  const { id } = params;
  const { results } = await env.DB.prepare(
    'SELECT * FROM tasks WHERE project_id = ? ORDER BY sort_order, created_at'
  ).bind(id).all();
  return json({ tasks: results });
}

// POST /api/projects/:id/tasks — タスク追加
export async function onRequestPost({ params, request, env }) {
  const { id: project_id } = params;
  const body = await request.json();
  const { text, priority, phase, due_start, due_end, duration_days, is_milestone, score } = body;

  if (!text) return json({ error: 'text required' }, 400);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // sort_orderを最大値+1に設定
  const maxOrder = await env.DB.prepare(
    'SELECT MAX(sort_order) as max_order FROM tasks WHERE project_id = ?'
  ).bind(project_id).first();
  const sort_order = (maxOrder?.max_order || 0) + 1;

  await env.DB.prepare(`
    INSERT INTO tasks (id, project_id, text, priority, phase, due_start, due_end, duration_days, status, is_milestone, score, created_at, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)
  `).bind(
    id, project_id, text,
    priority || 'mid', phase || null, due_start || null, due_end || null, duration_days || null,
    is_milestone ? 1 : 0, score || null, now, sort_order
  ).run();

  return json({ id, text, status: 'open' }, 201);
}
