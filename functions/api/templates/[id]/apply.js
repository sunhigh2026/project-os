function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// POST /api/templates/:id/apply
export async function onRequestPost({ params, request, env }) {
  const template = await env.DB.prepare('SELECT * FROM templates WHERE id = ?').bind(params.id).first();
  if (!template) return json({ error: 'template not found' }, 404);

  const body = await request.json();
  const projectId = body.project_id;
  if (!projectId) return json({ error: 'project_id is required' }, 400);

  const tasks = JSON.parse(template.tasks_json || '[]');
  const now = new Date().toISOString();

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const taskId = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO tasks (id, project_id, text, phase, duration_days, priority, status, created_at, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)
    `).bind(taskId, projectId, t.text, t.phase || null, t.duration_days || null, t.priority || 'mid', now, t.sort_order || i).run();
  }

  return json({ ok: true, count: tasks.length });
}
