function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// GET /api/digests
export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM weekly_digests ORDER BY week_start DESC LIMIT 12'
  ).all();
  return json({ digests: results });
}
