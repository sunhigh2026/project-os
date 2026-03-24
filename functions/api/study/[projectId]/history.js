function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// GET /api/study/:projectId/history — 直近N日の日別学習時間
export async function onRequestGet({ params, request, env }) {
  const { projectId } = params;
  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get('days')) || 14;

  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const today = jst.toISOString().slice(0, 10);

  // 日付範囲を生成
  const dailyStats = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(today + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - i);
    dailyStats[d.toISOString().slice(0, 10)] = 0;
  }

  const startDate = Object.keys(dailyStats).sort()[0];

  const { results } = await env.DB.prepare(`
    SELECT date, SUM(duration_minutes) as minutes
    FROM study_sessions
    WHERE project_id = ? AND date >= ? AND duration_minutes IS NOT NULL
    GROUP BY date
  `).bind(projectId, startDate).all();

  for (const r of results) {
    if (dailyStats[r.date] !== undefined) {
      dailyStats[r.date] = r.minutes || 0;
    }
  }

  const daily = Object.entries(dailyStats)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, minutes]) => ({ date, minutes: Math.round(minutes) }));

  return json({ daily, today });
}
