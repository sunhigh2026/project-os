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
      (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'done') as done_tasks
    FROM projects p
  `;
  const params = [];

  if (status) {
    query += ' WHERE p.status = ?';
    params.push(status);
  }

  query += ` ORDER BY
    CASE p.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,
    p.created_at DESC`;

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return json({ projects: results });
}

// POST /api/projects — 新規作成
export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const { name, description, type, goal_date, daily_minutes, github_repo, color } = body;

  if (!name) return json({ error: 'name required' }, 400);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO projects (id, name, description, type, goal_date, daily_minutes, github_repo, status, color, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `).bind(id, name, description || null, type || 'project', goal_date || null, daily_minutes || null, github_repo || null, color || '#7EC8B0', now).run();

  return json({ id, name, status: 'active' }, 201);
}
