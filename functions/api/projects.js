function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// GET /api/projects — 全プロジェクト一覧
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const status = url.searchParams.get('status');

  let query = `
    SELECT p.*,
      (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as total_tasks,
      (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'done') as done_tasks,
      (SELECT MAX(COALESCE(t.done_at, t.created_at)) FROM tasks t WHERE t.project_id = p.id) as last_activity
    FROM projects p
  `;
  const params = [];

  if (status) {
    query += ' WHERE p.status = ?';
    params.push(status);
  }

  query += ` ORDER BY
    CASE p.status WHEN 'active' THEN 0 WHEN 'planning' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END,
    COALESCE(last_activity, p.created_at) DESC`;

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return json({ projects: results });
}

// POST /api/projects — 新規作成
export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const { name, description, type, goal_date, daily_minutes, github_repo, color, tags } = body;

  if (!name) return json({ error: 'name required' }, 400);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const tagsStr = Array.isArray(tags) ? JSON.stringify(tags) : null;

  await env.DB.prepare(`
    INSERT INTO projects (id, name, description, type, goal_date, daily_minutes, github_repo, status, color, tags, total_goal_hours, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, name, description || null, type || 'project', goal_date || null, daily_minutes || null, github_repo || null, body.status || 'planning', color || '#7EC8B0', tagsStr, body.total_goal_hours || null, now).run();

  return json({ id, name, status: body.status || 'planning' }, 201);
}
