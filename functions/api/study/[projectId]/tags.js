function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// GET /api/study/:projectId/tags — プロジェクトのタグ一覧
export async function onRequestGet({ params, env }) {
  const { projectId } = params;

  const { results } = await env.DB.prepare(`
    SELECT DISTINCT tag FROM study_sessions
    WHERE project_id = ? AND tag IS NOT NULL AND tag != ''
    ORDER BY tag
  `).bind(projectId).all();

  return json({ tags: results.map(r => r.tag) });
}
