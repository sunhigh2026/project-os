function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// POST /api/projects/:id/tasks/bulk — AI提案の一括追加
export async function onRequestPost({ params, request, env }) {
  const { id: project_id } = params;
  const body = await request.json();
  const { tasks } = body;

  if (!tasks || !Array.isArray(tasks) || !tasks.length) {
    return json({ error: 'tasks array required' }, 400);
  }

  // 現在のmax sort_orderを取得
  const maxOrder = await env.DB.prepare(
    'SELECT MAX(sort_order) as max_order FROM tasks WHERE project_id = ?'
  ).bind(project_id).first();
  let sortOrder = (maxOrder?.max_order || 0) + 1;

  const now = new Date().toISOString();
  const stmts = tasks.map(t => {
    const id = crypto.randomUUID();
    const order = sortOrder++;
    return env.DB.prepare(`
      INSERT INTO tasks (id, project_id, text, priority, phase, due_start, due_end, duration_days, status, is_milestone, created_at, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
    `).bind(
      id, project_id, t.text,
      t.priority || 'mid', t.phase || null, t.due_start || null, t.due_end || null, t.duration_days || null,
      t.is_milestone ? 1 : 0, now, order
    );
  });

  await env.DB.batch(stmts);

  return json({ ok: true, count: tasks.length }, 201);
}
