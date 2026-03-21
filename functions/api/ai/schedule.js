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
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1].trim()); } catch (_) {}
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch (_) {}
  }
  return null;
}

// POST /api/ai/schedule
export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const { project_id } = body;

  const apiKey = await getGeminiKey(env);
  if (!apiKey) return json({ schedule: [], pia_comment: 'Gemini APIキーが設定されてないよ〜' });

  const project = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(project_id).first();
  if (!project) return json({ error: 'project not found' }, 404);
  if (!project.goal_date) return json({ schedule: [], pia_comment: '目標日を設定してね〜' });

  const { results: tasks } = await env.DB.prepare(
    "SELECT id, text, phase, duration_days, priority, is_milestone FROM tasks WHERE project_id = ? AND status != 'done' ORDER BY sort_order"
  ).bind(project_id).all();

  if (!tasks.length) return json({ schedule: [], pia_comment: 'タスクがないよ〜先に追加してね' });

  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const today = jst.toISOString().slice(0, 10);

  const isStudy = project.type === 'study';

  const prompt = `あなたは「ピアちゃん」、個人プロジェクトの応援AIコーチです。
今日は${today}、目標日は${project.goal_date}。

以下の未完了タスクにdue_start/due_endを割り当ててスケジュールを組んでください。

プロジェクト: ${project.name}（${isStudy ? '学習' : '開発'}）
${isStudy && project.daily_minutes ? `1日の学習時間: ${project.daily_minutes}分` : ''}

タスク一覧:
${tasks.map(t => `- id: ${t.id}, text: ${t.text}, duration_days: ${t.duration_days || '未設定'}, phase: ${t.phase || '未設定'}`).join('\n')}

ルール:
- 趣味プロジェクトなので週末メインでスケジュール
- バッファを25〜30%確保（余裕を持たせる）
- phaseの順序を尊重
- 今日以降の日付を割り当て
- 目標日を超えないように（ただし無理な場合は超えてOK、コメントで言及）
${isStudy ? `- 1日の学習時間${project.daily_minutes || 30}分を考慮` : ''}

以下のJSON形式で返答（他の文章は不要）:
{"schedule":[{"task_id":"xxx","due_start":"YYYY-MM-DD","due_end":"YYYY-MM-DD","duration_days":3}],"pia_comment":"ピアちゃん口調で一言"}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
        }),
      }
    );

    if (!res.ok) return json({ schedule: [], pia_comment: 'AIがエラーだったよ〜' });

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const nonThought = parts.filter(p => p.text !== undefined && p.thought !== true);
    const responseText = (nonThought.length > 0 ? nonThought : parts).map(p => p.text || '').join('');

    const parsed = extractJSON(responseText);
    if (parsed && parsed.schedule && parsed.schedule.length > 0) {
      return json({
        schedule: parsed.schedule,
        pia_comment: parsed.pia_comment || 'スケジュール組んだよ〜！',
      });
    }

    return json({ schedule: [], pia_comment: 'スケジュールの解析ができなかったよ〜' });
  } catch (e) {
    return json({ schedule: [], pia_comment: 'AIがうまく動かなかったよ〜' });
  }
}
