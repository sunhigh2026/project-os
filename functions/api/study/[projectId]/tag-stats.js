function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// GET /api/study/:projectId/tag-stats — タグ別学習時間集計
export async function onRequestGet({ params, request, env }) {
  const { projectId } = params;
  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get('days')) || 7;

  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const today = jst.toISOString().slice(0, 10);

  const startDate = new Date(today + 'T00:00:00Z');
  startDate.setUTCDate(startDate.getUTCDate() - days + 1);
  const startStr = startDate.toISOString().slice(0, 10);

  const { results } = await env.DB.prepare(`
    SELECT COALESCE(tag, '未分類') as tag, SUM(duration_minutes) as minutes
    FROM study_sessions
    WHERE project_id = ? AND date >= ? AND duration_minutes IS NOT NULL
    GROUP BY COALESCE(tag, '未分類')
    ORDER BY minutes DESC
  `).bind(projectId, startStr).all();

  const totalMinutes = results.reduce((s, r) => s + (r.minutes || 0), 0);

  const stats = results.map(r => ({
    tag: r.tag,
    minutes: r.minutes || 0,
    pct: totalMinutes > 0 ? Math.round(((r.minutes || 0) / totalMinutes) * 100) : 0,
  }));

  return json({ stats, totalMinutes, period: { start: startStr, end: today } });
}
