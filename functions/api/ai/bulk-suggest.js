function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

async function getGeminiKey(env) {
  if (env.GEMINI_API_KEY) return env.GEMINI_API_KEY;
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").first();
  return row?.value || null;
}

// POST /api/ai/bulk-suggest — AIでタスクリスト生成（テキスト形式）
export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const { project_name, project_type, prompt } = body;

  const apiKey = await getGeminiKey(env);
  if (!apiKey) return json({ error: 'Gemini APIキーが設定されてないよ〜' }, 400);

  const typeLabel = project_type === 'study' ? '学習' : '開発';
  const systemPrompt = `あなたはタスクリスト生成AIです。ユーザーの指示に基づいて、${typeLabel}プロジェクト「${project_name}」のタスクリストを生成してください。
出力形式: 1行に1タスク（改行区切り）のプレーンテキストのみ。番号や記号は不要。説明も不要。タスク名のみを改行で区切って出力してください。`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // 番号付きリストなどを除去してクリーンなテキストに
    const cleaned = text
      .split('\n')
      .map(l => l.replace(/^\d+[\.\)]\s*/, '').replace(/^[-*]\s*/, '').trim())
      .filter(l => l.length > 0)
      .join('\n');

    return json({ tasks_text: cleaned });
  } catch (e) {
    return json({ error: `AI生成エラー: ${e.message}` }, 500);
  }
}
