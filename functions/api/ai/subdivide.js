function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function getGeminiKey(env) {
  if (env.GEMINI_API_KEY) return env.GEMINI_API_KEY;
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").first();
  return row?.value || null;
}

function extractJSON(text) {
  const codeBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlock) { try { return JSON.parse(codeBlock[1].trim()); } catch (_) {} }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) { try { return JSON.parse(text.slice(start, end + 1)); } catch (_) {} }
  return null;
}

// POST /api/ai/subdivide
export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const { task_id } = body;

  const apiKey = await getGeminiKey(env);
  if (!apiKey) return json({ subtasks: [], pia_comment: 'Gemini APIキーが設定されてないよ〜' });

  const task = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(task_id).first();
  if (!task) return json({ error: 'task not found' }, 404);

  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const today = jst.toISOString().slice(0, 10);

  const prompt = `あなたはタスク分解アシスタント「ピアちゃん」です。
今日は${today}。以下のタスクを具体的な実行ステップに分解してください。

分解するタスク: 「${task.text}」
フェーズ: ${task.phase || '未設定'}
期間: ${task.duration_days || '未設定'}日

ルール:
- 3〜7個のステップに分解
- 各ステップは15〜30分で終わる粒度
- 最初のステップは今すぐ始められるくらい具体的に
- サブタスク名は短く（25文字以内）
- 「準備する」「確認する」のような抽象表現は禁止

以下のJSON形式で返答（他の文章は不要）:
{"subtasks":[{"text":"具体的なアクション名"}],"pia_comment":"ピアちゃん口調で一言（30字以内）"}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 2048, responseMimeType: 'application/json' },
        }),
      }
    );

    if (!res.ok) return json({ subtasks: [], pia_comment: 'AIがエラーだったよ〜' });

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const nonThought = parts.filter(p => p.text !== undefined && p.thought !== true);
    const responseText = (nonThought.length > 0 ? nonThought : parts).map(p => p.text || '').join('');

    const parsed = extractJSON(responseText);
    if (parsed && parsed.subtasks && parsed.subtasks.length > 0) {
      return json({ subtasks: parsed.subtasks, pia_comment: parsed.pia_comment || '一歩ずつやっていこ〜！' });
    }

    return json({ subtasks: [], pia_comment: 'AIの返答を解析できなかったよ〜' });
  } catch (e) {
    return json({ subtasks: [], pia_comment: 'AIがうまく動かなかったよ〜' });
  }
}
