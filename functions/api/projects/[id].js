function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// PUT /api/projects/:id — 更新
export async function onRequestPut({ params, request, env }) {
  const { id } = params;
  const body = await request.json();

  const fields = [];
  const values = [];
  for (const key of ['name', 'description', 'type', 'goal_date', 'daily_minutes', 'github_repo', 'status', 'color']) {
    if (body[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(body[key]);
    }
  }

  if (!fields.length) return json({ error: 'no fields to update' }, 400);

  values.push(id);
  await env.DB.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();

  return json({ ok: true });
}

// DELETE /api/projects/:id — 削除
export async function onRequestDelete({ params, env }) {
  const { id } = params;
  // タスクはCASCADE削除
  await env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
