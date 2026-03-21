function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// GET /api/templates
export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM templates ORDER BY created_at DESC'
  ).all();
  return json({ templates: results.map(t => ({ ...t, tasks_json: JSON.parse(t.tasks_json || '[]') })) });
}

// POST /api/templates
export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    'INSERT INTO templates (id, name, description, type, tasks_json, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, body.name, body.description || null, body.type || 'project', JSON.stringify(body.tasks_json || body.tasks || []), now).run();

  return json({ id, ok: true });
}
