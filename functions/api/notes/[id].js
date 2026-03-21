function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// PUT /api/notes/:id
export async function onRequestPut({ params, request, env }) {
  const { id } = params;
  const body = await request.json();
  const now = new Date().toISOString();

  const fields = ['updated_at = ?'];
  const values = [now];
  for (const key of ['title', 'content', 'type']) {
    if (body[key] !== undefined) { fields.push(`${key} = ?`); values.push(body[key]); }
  }

  values.push(id);
  await env.DB.prepare(`UPDATE notes SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  return json({ ok: true });
}

// DELETE /api/notes/:id
export async function onRequestDelete({ params, env }) {
  await env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(params.id).run();
  return json({ ok: true });
}
