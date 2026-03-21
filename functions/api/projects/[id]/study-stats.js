function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// GET /api/projects/:id/study-stats
export async function onRequestGet({ params, env }) {
  const { id } = params;
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const today = jst.toISOString().slice(0, 10);

  const { results: tasks } = await env.DB.prepare(`
    SELECT started_at, done_at FROM tasks
    WHERE project_id = ? AND started_at IS NOT NULL AND done_at IS NOT NULL AND status = 'done'
  `).bind(id).all();

  // Calculate daily stats for last 14 days
  const dailyStats = {};
  for (let i = 0; i < 14; i++) {
    const d = new Date(today + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - i);
    dailyStats[d.toISOString().slice(0, 10)] = 0;
  }

  let totalMinutes = 0;
  let todayMinutes = 0;
  let weekMinutes = 0;

  // Monday of this week
  const todayDate = new Date(today + 'T00:00:00Z');
  const dow = todayDate.getUTCDay();
  const mondayOffset = dow === 0 ? 6 : dow - 1;
  const weekStart = new Date(todayDate);
  weekStart.setUTCDate(todayDate.getUTCDate() - mondayOffset);
  const weekStartStr = weekStart.toISOString().slice(0, 10);

  for (const t of tasks) {
    const diff = (new Date(t.done_at) - new Date(t.started_at)) / 60000;
    if (diff <= 0 || diff > 480) continue;

    totalMinutes += diff;
    const doneDate = t.done_at.slice(0, 10);
    if (doneDate === today) todayMinutes += diff;
    if (doneDate >= weekStartStr) weekMinutes += diff;
    if (dailyStats[doneDate] !== undefined) dailyStats[doneDate] += diff;
  }

  const daily = Object.entries(dailyStats)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, minutes]) => ({ date, minutes: Math.round(minutes) }));

  return json({
    today_minutes: Math.round(todayMinutes),
    week_minutes: Math.round(weekMinutes),
    total_minutes: Math.round(totalMinutes),
    daily,
  });
}
