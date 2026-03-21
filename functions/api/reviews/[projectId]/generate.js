function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

async function getGeminiKey(env) {
  if (env.GEMINI_API_KEY) return env.GEMINI_API_KEY;
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").first();
  return row?.value || null;
}

function extractJSON(text) {
  const codeBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlock) { try { return JSON.parse(codeBlock[1].trim()); } catch (_) {} }
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s !== -1 && e > s) { try { return JSON.parse(text.slice(s, e + 1)); } catch (_) {} }
  return null;
}

// POST /api/reviews/:projectId/generate
export async function onRequestPost({ params, env }) {
  const { projectId } = params;
  const apiKey = await getGeminiKey(env);
  if (!apiKey) return json({ error: 'Gemini APIキーが設定されていません' }, 400);

  const project = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first();
  if (!project) return json({ error: 'project not found' }, 404);

  const { results: allTasks } = await env.DB.prepare(
    'SELECT * FROM tasks WHERE project_id = ? ORDER BY sort_order'
  ).bind(projectId).all();

  const { results: notes } = await env.DB.prepare(
    'SELECT title, type, content FROM notes WHERE project_id = ?'
  ).bind(projectId).all();

  const tasksTotal = allTasks.length;
  const tasksDone = allTasks.filter(t => t.status === 'done');
  const today = new Date().toISOString().slice(0, 10);
  const tasksOnTime = tasksDone.filter(t => !t.due_end || t.done_at?.slice(0, 10) <= t.due_end).length;

  const createdDate = project.created_at?.slice(0, 10);
  const durationDays = createdDate ? Math.ceil((new Date(today) - new Date(createdDate)) / 86400000) : 0;

  const prompt = `以下のプロジェクトデータをもとに、ピアちゃんとしてふりかえりを作成してください。
JSON形式で出力してください。

{
  "summary": "プロジェクト全体の振り返り（200文字以内）",
  "highlights": ["よかったこと1", "よかったこと2"],
  "learnings": ["学んだこと/次に活かすこと1", "学んだこと/次に活かすこと2"],
  "pia_comment": "ピアちゃんの締めコメント（100文字以内）"
}

プロジェクト: ${project.name}
タイプ: ${project.type === 'study' ? '学習' : '開発'}
説明: ${project.description || 'なし'}
期間: ${durationDays}日
タスク合計: ${tasksTotal}件 (完了: ${tasksDone.length}件, 期限内完了: ${tasksOnTime}件)

タスク一覧:
${allTasks.map(t => `- [${t.status}] ${t.text} ${t.due_end ? `(期限:${t.due_end})` : ''} ${t.done_at ? `(完了:${t.done_at.slice(0,10)})` : ''}`).join('\n')}

${notes.length ? `ノート:\n${notes.map(n => `- [${n.type}] ${n.title}: ${n.content || ''}`).join('\n')}` : ''}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 2048 },
        }),
      }
    );

    if (!res.ok) return json({ error: 'Gemini API error' }, 500);

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const nonThought = parts.filter(p => p.text !== undefined && p.thought !== true);
    const text = (nonThought.length > 0 ? nonThought : parts).map(p => p.text || '').join('');

    const parsed = extractJSON(text);
    if (!parsed) return json({ error: 'AI応答の解析に失敗' }, 500);

    const reviewId = crypto.randomUUID();
    const now = new Date().toISOString();

    await env.DB.prepare(`
      INSERT INTO reviews (id, project_id, summary, duration_actual_days, tasks_total, tasks_on_time, highlights, learnings, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      reviewId, projectId, parsed.summary || '', durationDays, tasksTotal, tasksOnTime,
      JSON.stringify(parsed.highlights || []), JSON.stringify(parsed.learnings || []), now
    ).run();

    return json({
      id: reviewId,
      summary: parsed.summary,
      highlights: parsed.highlights || [],
      learnings: parsed.learnings || [],
      pia_comment: parsed.pia_comment || 'おつかれさま〜！',
      duration_actual_days: durationDays,
      tasks_total: tasksTotal,
      tasks_on_time: tasksOnTime,
    });
  } catch (e) {
    return json({ error: 'ふりかえり生成に失敗しました' }, 500);
  }
}
