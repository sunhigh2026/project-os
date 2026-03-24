function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// GET /api/projects/:id/study-stats — study_sessionsベースの学習統計
export async function onRequestGet({ params, env }) {
  const { id } = params;
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const today = jst.toISOString().slice(0, 10);

  // 直近14日の日付範囲を生成
  const dailyStats = {};
  for (let i = 0; i < 14; i++) {
    const d = new Date(today + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - i);
    dailyStats[d.toISOString().slice(0, 10)] = 0;
  }
  const startDate14 = Object.keys(dailyStats).sort()[0];

  // 完了済みセッションの日別集計（直近14日）
  const { results: dailyResults } = await env.DB.prepare(`
    SELECT date, SUM(duration_minutes) as minutes
    FROM study_sessions
    WHERE project_id = ? AND date >= ? AND duration_minutes IS NOT NULL
    GROUP BY date
  `).bind(id, startDate14).all();

  for (const r of dailyResults) {
    if (dailyStats[r.date] !== undefined) {
      dailyStats[r.date] = r.minutes || 0;
    }
  }

  // 全期間の累計
  const totalResult = await env.DB.prepare(`
    SELECT COALESCE(SUM(duration_minutes), 0) as total
    FROM study_sessions
    WHERE project_id = ? AND duration_minutes IS NOT NULL
  `).bind(id).first();

  // 今日の合計
  const todayResult = await env.DB.prepare(`
    SELECT COALESCE(SUM(duration_minutes), 0) as minutes
    FROM study_sessions
    WHERE project_id = ? AND date = ? AND duration_minutes IS NOT NULL
  `).bind(id, today).first();

  // 今週（月曜始まり）の合計
  const todayDate = new Date(today + 'T00:00:00Z');
  const dow = todayDate.getUTCDay();
  const mondayOffset = dow === 0 ? 6 : dow - 1;
  const weekStart = new Date(todayDate);
  weekStart.setUTCDate(todayDate.getUTCDate() - mondayOffset);
  const weekStartStr = weekStart.toISOString().slice(0, 10);

  const weekResult = await env.DB.prepare(`
    SELECT COALESCE(SUM(duration_minutes), 0) as minutes
    FROM study_sessions
    WHERE project_id = ? AND date >= ? AND duration_minutes IS NOT NULL
  `).bind(id, weekStartStr).first();

  // 計測中セッションの経過時間を今日分に加算
  let todayMinutes = todayResult?.minutes || 0;
  let weekMinutes = weekResult?.minutes || 0;
  let totalMinutes = totalResult?.total || 0;

  const activeSession = await env.DB.prepare(`
    SELECT started_at FROM study_sessions
    WHERE project_id = ? AND ended_at IS NULL
  `).bind(id).first();

  if (activeSession) {
    const elapsed = Math.max(0, Math.floor((now.getTime() - new Date(activeSession.started_at).getTime()) / 60000));
    todayMinutes += elapsed;
    weekMinutes += elapsed;
    totalMinutes += elapsed;
    if (dailyStats[today] !== undefined) dailyStats[today] += elapsed;
  }

  const daily = Object.entries(dailyStats)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, minutes]) => ({ date, minutes: Math.round(minutes) }));

  // 逆算データ（total_goal_hours設定時のみ）
  const project = await env.DB.prepare('SELECT total_goal_hours, goal_date, daily_minutes FROM projects WHERE id = ?').bind(id).first();
  let paceData = null;

  if (project?.total_goal_hours && project?.goal_date) {
    const totalGoalMin = project.total_goal_hours * 60;
    const remainingMin = Math.max(0, totalGoalMin - totalMinutes);
    const goalDateObj = new Date(project.goal_date + 'T00:00:00Z');
    const todayObj = new Date(today + 'T00:00:00Z');
    const daysLeft = Math.max(1, Math.ceil((goalDateObj - todayObj) / 86400000));
    const neededDailyMin = Math.round(remainingMin / daysLeft);

    // 直近14日の平均（1日あたり）
    const recentTotal = daily.reduce((s, d) => s + d.minutes, 0);
    const avgDailyMin = Math.round(recentTotal / 14);

    let pace = 'on_track';
    if (avgDailyMin < neededDailyMin * 0.8) pace = 'danger';
    else if (avgDailyMin < neededDailyMin) pace = 'behind';

    paceData = {
      total_goal_hours: project.total_goal_hours,
      total_hours: Math.round(totalMinutes / 60 * 10) / 10,
      remaining_hours: Math.round(remainingMin / 60 * 10) / 10,
      days_left: daysLeft,
      needed_daily_minutes: neededDailyMin,
      avg_daily_minutes: avgDailyMin,
      pace,
    };
  }

  return json({
    today_minutes: Math.round(todayMinutes),
    week_minutes: Math.round(weekMinutes),
    total_minutes: Math.round(totalMinutes),
    daily,
    pace: paceData,
  });
}
