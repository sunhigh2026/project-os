function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// GET /api/reviews
export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(`
    SELECT r.*, p.name as project_name, p.color as project_color, p.type as project_type
    FROM reviews r JOIN projects p ON r.project_id = p.id
    ORDER BY r.created_at DESC
  `).all();
  return json({ reviews: results });
}
