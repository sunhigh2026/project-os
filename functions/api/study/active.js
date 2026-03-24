function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// GET /api/study/active — アクティブなセッション取得
export async function onRequestGet({ env }) {
  const session = await env.DB.prepare(
    'SELECT ss.*, p.name as project_name FROM study_sessions ss JOIN projects p ON ss.project_id = p.id WHERE ss.ended_at IS NULL LIMIT 1'
  ).first();

  return json({ session: session || null });
}
