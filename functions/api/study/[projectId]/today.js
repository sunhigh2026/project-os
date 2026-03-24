function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// GET /api/study/:projectId/today — 今日の学習時間
export async function onRequestGet({ params, env }) {
  const { projectId } = params;
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const today = jst.toISOString().slice(0, 10);

  // 完了済みセッションの合計
  const result = await env.DB.prepare(`
    SELECT COALESCE(SUM(duration_minutes), 0) as minutes
    FROM study_sessions
    WHERE project_id = ? AND date = ? AND duration_minutes IS NOT NULL
  `).bind(projectId, today).first();

  let minutes = result?.minutes || 0;

  // 計測中セッションの経過時間も加算
  const active = await env.DB.prepare(`
    SELECT started_at FROM study_sessions
    WHERE project_id = ? AND date = ? AND ended_at IS NULL
  `).bind(projectId, today).first();

  if (active) {
    const elapsed = Math.floor((now.getTime() - new Date(active.started_at).getTime()) / 60000);
    minutes += Math.max(0, elapsed);
  }

  return json({ minutes, date: today });
}
