function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// PUT /api/recurring/:id
export async function onRequestPut({ params, request, env }) {
  const { id } = params;
  const body = await request.json();

  const fields = [];
  const values = [];
  for (const key of ['text', 'frequency', 'day_of_week', 'day_of_month', 'next_due', 'project_id', 'status']) {
    if (body[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(body[key]);
    }
  }

  if (!fields.length) return json({ error: 'no fields to update' }, 400);

  values.push(id);
  await env.DB.prepare(`UPDATE recurring SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  return json({ ok: true });
}

// DELETE /api/recurring/:id
export async function onRequestDelete({ params, env }) {
  const { id } = params;
  await env.DB.prepare('DELETE FROM recurring WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
