function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// PATCH /api/tasks/reorder — sort_order一括更新
export async function onRequest({ request, env }) {
  if (request.method !== 'PATCH') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const body = await request.json();
  const { orders } = body;

  if (!orders || !Array.isArray(orders)) {
    return json({ error: 'orders array required' }, 400);
  }

  const stmts = orders.map(o =>
    env.DB.prepare('UPDATE tasks SET sort_order = ? WHERE id = ?').bind(o.sort_order, o.id)
  );

  await env.DB.batch(stmts);

  return json({ ok: true });
}
