function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// GET /api/reviews/:projectId
export async function onRequestGet({ params, env }) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM reviews WHERE project_id = ? ORDER BY created_at DESC'
  ).bind(params.projectId).all();
  return json({ reviews: results });
}
