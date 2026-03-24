function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// PATCH /api/tasks/:id/review — 復習フラグ切替
export async function onRequestPatch({ params, env }) {
  const { id } = params;

  const task = await env.DB.prepare('SELECT review_flag FROM tasks WHERE id = ?').bind(id).first();
  if (!task) return json({ error: 'not found' }, 404);

  const newFlag = task.review_flag ? 0 : 1;
  await env.DB.prepare('UPDATE tasks SET review_flag = ? WHERE id = ?').bind(newFlag, id).run();

  return json({ ok: true, review_flag: newFlag });
}
