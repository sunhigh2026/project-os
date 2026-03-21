function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// POST /api/templates/from-project/:id
export async function onRequestPost({ params, env }) {
  const { id } = params;

  const project = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
  if (!project) return json({ error: 'project not found' }, 404);

  const { results: tasks } = await env.DB.prepare(
    'SELECT text, phase, duration_days, priority, sort_order FROM tasks WHERE project_id = ? ORDER BY sort_order'
  ).bind(id).all();

  const templateId = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    'INSERT INTO templates (id, name, description, type, tasks_json, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(
    templateId,
    `${project.name}テンプレート`,
    `${project.name}から生成`,
    project.type,
    JSON.stringify(tasks),
    now
  ).run();

  return json({ id: templateId, ok: true });
}
