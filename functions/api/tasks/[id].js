function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// PUT /api/tasks/:id — タスク更新
export async function onRequestPut({ params, request, env }) {
  const { id } = params;
  const body = await request.json();

  const fields = [];
  const values = [];
  for (const key of ['text', 'priority', 'phase', 'due_start', 'due_end', 'duration_days', 'status', 'is_milestone', 'score', 'sort_order', 'memo']) {
    if (body[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(body[key]);
    }
  }

  // statusがdoneになった場合、done_atを設定
  if (body.status === 'done') {
    fields.push('done_at = ?');
    values.push(new Date().toISOString());
  } else if (body.status && body.status !== 'done') {
    fields.push('done_at = ?');
    values.push(null);
  }

  if (!fields.length) return json({ error: 'no fields to update' }, 400);

  values.push(id);
  await env.DB.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();

  return json({ ok: true });
}

// DELETE /api/tasks/:id — タスク削除
export async function onRequestDelete({ params, env }) {
  const { id } = params;
  await env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
