function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// GET /api/gantt/all — 全プロジェクト横断ガントチャート
export async function onRequestGet({ env }) {
  const { results: projects } = await env.DB.prepare(
    "SELECT id, name, color, goal_date FROM projects WHERE status = 'active' ORDER BY created_at DESC"
  ).all();

  const { results: tasks } = await env.DB.prepare(`
    SELECT t.id, t.project_id, t.text, t.phase, t.due_start, t.due_end, t.duration_days, t.status, t.is_milestone, t.priority, t.sort_order,
           p.name as project_name, p.color as project_color
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    WHERE p.status = 'active'
    ORDER BY p.created_at DESC, t.sort_order, t.created_at
  `).all();

  return json({ projects, tasks });
}
