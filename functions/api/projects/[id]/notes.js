function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// GET /api/projects/:id/notes
export async function onRequestGet({ params, env, request }) {
  const { id } = params;
  const url = new URL(request.url);
  const type = url.searchParams.get('type');

  let query = 'SELECT * FROM notes WHERE project_id = ?';
  const binds = [id];
  if (type) { query += ' AND type = ?'; binds.push(type); }
  query += " ORDER BY CASE WHEN type = 'spec' THEN 0 ELSE 1 END, created_at DESC";

  const { results } = await env.DB.prepare(query).bind(...binds).all();
  return json({ notes: results });
}

// POST /api/projects/:id/notes
export async function onRequestPost({ params, request, env }) {
  const { id } = params;
  const body = await request.json();
  const noteId = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    'INSERT INTO notes (id, project_id, type, title, content, note_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(noteId, id, body.type || 'memo', body.title, body.content || null, body.note_date || null, now, now).run();

  return json({ id: noteId, ok: true });
}
