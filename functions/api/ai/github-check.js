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

// POST /api/ai/github-check
export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const { project_id } = body;

  const apiKey = await getGeminiKey(env);
  if (!apiKey) return json({ suggestions: [], pia_comment: 'Gemini APIキーが設定されてないよ〜' });

  const project = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(project_id).first();
  if (!project || !project.github_repo) return json({ suggestions: [], pia_comment: 'GitHub連携が設定されてないよ〜' });

  // 未完了タスク
  const { results: tasks } = await env.DB.prepare(
    "SELECT id, text FROM tasks WHERE project_id = ? AND status != 'done'"
  ).bind(project_id).all();

  if (!tasks.length) return json({ suggestions: [], pia_comment: '未完了タスクがないよ〜すごい！' });

  // 直近7日のコミット取得
  const token = await env.DB.prepare("SELECT value FROM settings WHERE key = 'github_token'").first();
  if (!token?.value) return json({ suggestions: [], pia_comment: 'GitHubトークンが設定されてないよ〜' });

  let commits = [];
  try {
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const res = await fetch(
      `https://api.github.com/repos/${project.github_repo}/commits?since=${since}&per_page=30`,
      { headers: { 'Authorization': `token ${token.value}`, 'User-Agent': 'ProjectOS' } }
    );
    if (res.ok) {
      const data = await res.json();
      commits = data.map(c => c.commit?.message?.split('\n')[0] || '');
    }
  } catch (_) {}

  if (!commits.length) return json({ suggestions: [], pia_comment: '直近7日のコミットがないよ〜' });

  const prompt = `あなたは「ピアちゃん」、個人プロジェクトの応援AIコーチです。

以下の未完了タスクとGitHubコミットを照合して、完了にできそうなタスクを提案してください。

未完了タスク:
${tasks.map(t => `- id: ${t.id}, text: ${t.text}`).join('\n')}

直近7日のコミットメッセージ:
${commits.map(c => `- ${c}`).join('\n')}

以下のJSON形式で返答（他の文章は不要）:
{"suggestions":[{"task_id":"xxx","suggest_status":"done","reason":"理由"}],"pia_comment":"ピアちゃん口調で一言"}

マッチしない場合はsuggestionsを空配列にしてください。`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
        }),
      }
    );

    if (!res.ok) return json({ suggestions: [], pia_comment: 'AIがエラーだったよ〜' });

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const nonThought = parts.filter(p => p.text !== undefined && p.thought !== true);
    const responseText = (nonThought.length > 0 ? nonThought : parts).map(p => p.text || '').join('');

    const parsed = extractJSON(responseText);
    if (parsed) {
      return json({
        suggestions: parsed.suggestions || [],
        pia_comment: parsed.pia_comment || 'コミット確認したよ〜！',
      });
    }

    return json({ suggestions: [], pia_comment: '解析できなかったよ〜' });
  } catch (e) {
    return json({ suggestions: [], pia_comment: 'AIがうまく動かなかったよ〜' });
  }
}
