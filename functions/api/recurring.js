function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// GET /api/recurring
export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(`
    SELECT r.*, p.name as project_name
    FROM recurring r
    LEFT JOIN projects p ON r.project_id = p.id
    ORDER BY r.status, r.next_due
  `).all();
  return json({ recurring: results });
}

// POST /api/recurring
export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const { text, frequency, day_of_week, day_of_month, project_id } = body;

  if (!text || !frequency) return json({ error: 'text and frequency required' }, 400);

  const id = crypto.randomUUID();

  // next_dueを計算
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  let next_due = jst.toISOString().slice(0, 10);

  if (frequency === 'weekly' && day_of_week != null) {
    const d = new Date(next_due + 'T00:00:00');
    const diff = (day_of_week - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + (diff || 7));
    next_due = d.toISOString().slice(0, 10);
  } else if (frequency === 'monthly' && day_of_month) {
    const d = new Date(next_due + 'T00:00:00');
    d.setMonth(d.getMonth() + (d.getDate() > day_of_month ? 1 : 0));
    d.setDate(Math.min(day_of_month, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    next_due = d.toISOString().slice(0, 10);
  }

  await env.DB.prepare(`
    INSERT INTO recurring (id, text, frequency, day_of_week, day_of_month, next_due, project_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
  `).bind(id, text, frequency, day_of_week ?? null, day_of_month ?? null, next_due, project_id || null).run();

  return json({ id, next_due }, 201);
}
