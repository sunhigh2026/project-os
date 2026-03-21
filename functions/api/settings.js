function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// GET /api/settings
export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  results.forEach(r => { settings[r.key] = r.value; });

  // APIキーはマスク
  if (settings.gemini_api_key) {
    settings.gemini_api_key_masked = settings.gemini_api_key.slice(0, 6) + '...' + settings.gemini_api_key.slice(-4);
  }
  if (settings.github_token) {
    settings.github_token_masked = settings.github_token.slice(0, 6) + '...' + settings.github_token.slice(-4);
  }

  return json({ settings });
}

// PUT /api/settings
export async function onRequestPut({ request, env }) {
  const body = await request.json();

  const stmts = [];
  for (const [key, value] of Object.entries(body)) {
    stmts.push(
      env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(key, value)
    );
  }

  if (stmts.length) await env.DB.batch(stmts);

  return json({ ok: true });
}
