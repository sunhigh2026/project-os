function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// GET /api/dashboard — ダッシュボード集約データ
export async function onRequestGet({ env }) {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const today = jst.toISOString().slice(0, 10);

  // 繰り返しタスク生成（Cronの代替）
  await generateRecurringTasks(env, today);

  // 今日やるべきタスク（期限が今日以前の未完了タスク）
  const { results: todayTasks } = await env.DB.prepare(`
    SELECT t.*, p.name as project_name, p.color as project_color
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    WHERE t.status != 'done' AND (t.due_end <= ? OR t.due_end IS NULL)
    AND p.status = 'active'
    ORDER BY
      CASE WHEN t.due_end IS NOT NULL AND t.due_end < ? THEN 0 ELSE 1 END,
      CASE t.priority WHEN 'high' THEN 0 WHEN 'mid' THEN 1 ELSE 2 END,
      t.sort_order
    LIMIT 20
  `).bind(today, today).all();

  // 全プロジェクト進捗
  const { results: projects } = await env.DB.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as total_tasks,
      (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'done') as done_tasks
    FROM projects p
    WHERE p.status = 'active'
    ORDER BY p.created_at DESC
  `).all();

  // 期限超過タスク数
  const overdue = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM tasks t
    JOIN projects p ON t.project_id = p.id
    WHERE t.status != 'done' AND t.due_end < ? AND p.status = 'active'
  `).bind(today).first();

  return json({
    today,
    todayTasks,
    projects,
    overdueCount: overdue?.count || 0,
  });
}

// 繰り返しタスク生成
async function generateRecurringTasks(env, today) {
  try {
    const { results: dueRecurring } = await env.DB.prepare(
      "SELECT * FROM recurring WHERE status = 'active' AND next_due <= ?"
    ).bind(today).all();

    for (const r of dueRecurring) {
      const taskId = crypto.randomUUID();
      const now = new Date().toISOString();

      // タスクを生成
      await env.DB.prepare(`
        INSERT INTO tasks (id, project_id, text, priority, status, created_at, sort_order, due_end)
        VALUES (?, ?, ?, 'mid', 'open', ?, 0, ?)
      `).bind(taskId, r.project_id, r.text, now, today).run();

      // next_dueを更新
      const nextDue = calcNextDue(r.frequency, r.next_due, r.day_of_week, r.day_of_month);
      await env.DB.prepare(
        'UPDATE recurring SET next_due = ? WHERE id = ?'
      ).bind(nextDue, r.id).run();
    }
  } catch (_) {}
}

function calcNextDue(frequency, currentDue, dayOfWeek, dayOfMonth) {
  const d = new Date(currentDue + 'T00:00:00Z');
  if (frequency === 'daily') {
    d.setUTCDate(d.getUTCDate() + 1);
  } else if (frequency === 'weekly') {
    d.setUTCDate(d.getUTCDate() + 7);
  } else if (frequency === 'monthly') {
    d.setUTCMonth(d.getUTCMonth() + 1);
    if (dayOfMonth) d.setUTCDate(Math.min(dayOfMonth, new Date(d.getUTCFullYear(), d.getUTCMonth() + 1, 0).getUTCDate()));
  }
  return d.toISOString().slice(0, 10);
}
