function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// DELETE /api/templates/:id
export async function onRequestDelete({ params, env }) {
  await env.DB.prepare('DELETE FROM templates WHERE id = ?').bind(params.id).run();
  return json({ ok: true });
}
