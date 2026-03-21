function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// GET /api/gantt/:projectId
export async function onRequestGet({ params, env }) {
  const { projectId } = params;

  const project = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first();
  if (!project) return json({ error: 'project not found' }, 404);

  const { results: tasks } = await env.DB.prepare(`
    SELECT id, text, phase, due_start, due_end, duration_days, status, is_milestone, priority, sort_order
    FROM tasks WHERE project_id = ?
    ORDER BY sort_order, created_at
  `).bind(projectId).all();

  // GitHub commits（github_repoが設定されている場合）
  let commits = [];
  if (project.github_repo) {
    try {
      const token = await env.DB.prepare("SELECT value FROM settings WHERE key = 'github_token'").first();
      if (token?.value) {
        const res = await fetch(`https://api.github.com/repos/${project.github_repo}/commits?per_page=30`, {
          headers: { 'Authorization': `token ${token.value}`, 'User-Agent': 'ProjectOS' },
        });
        if (res.ok) {
          const data = await res.json();
          commits = data.map(c => ({
            date: c.commit?.author?.date?.slice(0, 10),
            message: c.commit?.message?.split('\n')[0],
          }));
        }
      }
    } catch (_) {}
  }

  return json({ project, tasks, commits, goal_date: project.goal_date });
}
