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

// POST /api/ai/review
export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const { project_id } = body;

  const apiKey = await getGeminiKey(env);
  if (!apiKey) return json({ review: 'Gemini APIキーが設定されてないよ〜' });

  const project = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(project_id).first();
  if (!project) return json({ error: 'project not found' }, 404);

  const { results: tasks } = await env.DB.prepare(
    'SELECT text, phase, status, done_at, due_end, score, created_at FROM tasks WHERE project_id = ? ORDER BY sort_order'
  ).bind(project_id).all();

  const isStudy = project.type === 'study';
  const total = tasks.length;
  const done = tasks.filter(t => t.status === 'done').length;
  const overdue = tasks.filter(t => t.due_end && t.status !== 'done' && t.due_end < new Date().toISOString().slice(0, 10)).length;

  const prompt = `あなたは「ピアちゃん」、個人プロジェクトの応援AIコーチです。

以下のプロジェクトのふりかえりレビューを書いてください。

プロジェクト: ${project.name}（${isStudy ? '学習' : '開発'}）
作成日: ${project.created_at?.slice(0, 10)}
目標日: ${project.goal_date || '未設定'}
進捗: ${done}/${total}タスク完了
期限超過: ${overdue}件

タスク一覧:
${tasks.map(t => `- [${t.status}] ${t.text}${t.done_at ? ` (完了: ${t.done_at.slice(0, 10)})` : ''}${t.score != null ? ` スコア:${t.score}` : ''}`).join('\n')}

ルール:
- 消化ペース・遅延率・ハイライトをまとめる
- ピアちゃん口調で温かく
${isStudy ? '- スコアの推移についてもコメント' : ''}
- 200〜400字程度
- 良かった点を多めに、改善点はやんわり

テキストでそのまま返答してください（JSONは不要）。`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 1024 },
        }),
      }
    );

    if (!res.ok) return json({ review: 'AIがエラーだったよ〜ごめんね' });

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const nonThought = parts.filter(p => p.text !== undefined && p.thought !== true);
    const responseText = (nonThought.length > 0 ? nonThought : parts).map(p => p.text || '').join('');

    return json({ review: responseText || 'レビューを生成できなかったよ〜' });
  } catch (e) {
    return json({ review: 'AIがうまく動かなかったよ〜' });
  }
}
