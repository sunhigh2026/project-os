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
  // 方法1: ```json ... ```
  const codeBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1].trim()); } catch (_) {}
  }
  // 方法2: 最も外側の { ... }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch (_) {}
  }
  return null;
}

// POST /api/ai/suggest-tasks
export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const { project_id, prompt: userPrompt } = body;

  const apiKey = await getGeminiKey(env);
  if (!apiKey) return json({ tasks: [], pia_comment: 'Gemini APIキーが設定されてないよ〜' });

  // プロジェクト情報取得
  const project = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(project_id).first();
  if (!project) return json({ error: 'project not found' }, 404);

  // 既存タスク取得
  const { results: existingTasks } = await env.DB.prepare(
    'SELECT text, phase, status FROM tasks WHERE project_id = ?'
  ).bind(project_id).all();

  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const today = jst.toISOString().slice(0, 10);

  const isStudy = project.type === 'study';

  let prompt = `あなたは「ピアちゃん」、個人プロジェクトの応援AIコーチです。
今日は${today}。

以下のプロジェクトに対して、5〜15個のタスクを提案してください。

プロジェクト名: ${project.name}
タイプ: ${isStudy ? '学習' : '開発'}
${project.description ? `説明: ${project.description}` : ''}
${project.goal_date ? `目標日: ${project.goal_date}` : ''}
${isStudy && project.daily_minutes ? `1日の学習時間: ${project.daily_minutes}分` : ''}
${existingTasks.length ? `既存タスク:\n${existingTasks.map(t => `- [${t.status}] ${t.text}`).join('\n')}` : '既存タスク: なし'}
${userPrompt ? `ユーザーの追加要望: ${userPrompt}` : ''}

${isStudy ? 'フェーズ分けと学習ロードマップ形式で提案してください。' : 'フェーズ分けして実装の順序を提案してください。'}

ルール:
- 各タスクは30分〜2時間で終わる粒度
- 趣味プロジェクトなので楽しく続けられる内容に
- 既存タスクと重複しないこと
- duration_daysは1〜7日程度

以下のJSON形式で返答してください（他の文章は不要）:
{"tasks":[{"text":"タスク名","phase":"フェーズ名","duration_days":3,"priority":"mid","is_milestone":false}],"pia_comment":"ピアちゃん口調で一言（30字以内）"}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 4096 },
        }),
      }
    );

    if (!res.ok) {
      return json({ tasks: [], pia_comment: 'AIがエラーだったよ〜ごめんね' });
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const nonThought = parts.filter(p => p.text !== undefined && p.thought !== true);
    const responseText = (nonThought.length > 0 ? nonThought : parts).map(p => p.text || '').join('');

    const parsed = extractJSON(responseText);
    if (parsed && parsed.tasks && parsed.tasks.length > 0) {
      return json({
        tasks: parsed.tasks,
        pia_comment: parsed.pia_comment || 'こんな感じでどうかな〜？',
      });
    }

    return json({ tasks: [], pia_comment: 'AIの返答を解析できなかったよ〜' });
  } catch (e) {
    return json({ tasks: [], pia_comment: 'AIがうまく動かなかったよ〜' });
  }
}
