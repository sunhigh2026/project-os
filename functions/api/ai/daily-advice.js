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

// POST /api/ai/daily-advice
export async function onRequestPost({ env }) {
  const apiKey = await getGeminiKey(env);
  if (!apiKey) return json({ advice: 'Gemini APIキーが設定されてないよ〜', pia_mood: 'thinking' });

  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const today = jst.toISOString().slice(0, 10);

  // 今日のタスク
  const { results: todayTasks } = await env.DB.prepare(`
    SELECT t.text, t.status, t.priority, t.due_end, p.name as project_name
    FROM tasks t JOIN projects p ON t.project_id = p.id
    WHERE t.status != 'done' AND p.status = 'active'
    AND (t.due_end <= ? OR t.due_end IS NULL)
    LIMIT 15
  `).bind(today).all();

  // 期限超過
  const { results: overdue } = await env.DB.prepare(`
    SELECT t.text, t.due_end, p.name as project_name
    FROM tasks t JOIN projects p ON t.project_id = p.id
    WHERE t.status != 'done' AND t.due_end < ? AND p.status = 'active'
    LIMIT 10
  `).bind(today).all();

  // 進行中タスク
  const { results: doingTasks } = await env.DB.prepare(`
    SELECT t.text, p.name as project_name
    FROM tasks t JOIN projects p ON t.project_id = p.id
    WHERE t.status = 'doing' AND p.status = 'active'
    LIMIT 5
  `).all();

  const prompt = `あなたは「ピアちゃん」、個人プロジェクトの応援AIコーチです。
今日は${today}。今日のアドバイスを1〜3文で返してください。

今日のタスク: ${todayTasks.length}件
${todayTasks.map(t => `- [${t.project_name}] ${t.text} (${t.priority})`).join('\n') || 'なし'}

期限超過: ${overdue.length}件
${overdue.map(t => `- [${t.project_name}] ${t.text} (${t.due_end})`).join('\n') || 'なし'}

作業中: ${doingTasks.length}件
${doingTasks.map(t => `- [${t.project_name}] ${t.text}`).join('\n') || 'なし'}

ルール:
- ピアちゃん口調（〜だよ、〜だね、絵文字あり）
- 厳しくせず、楽しく続けられるよう励ます
- 具体的なタスクに言及する
- 100字以内

以下のJSON形式で返答（他の文章は不要）:
{"advice":"アドバイス本文","pia_mood":"normal or happy or thinking"}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
        }),
      }
    );

    if (!res.ok) return json({ advice: '今日もがんばろうね〜！🐷', pia_mood: 'normal' });

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const nonThought = parts.filter(p => p.text !== undefined && p.thought !== true);
    const responseText = (nonThought.length > 0 ? nonThought : parts).map(p => p.text || '').join('');

    // JSON抽出（複数パターン対応）
    let parsed = null;

    // パターン1: ```json ... ``` コードブロック
    const codeBlock = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlock) { try { parsed = JSON.parse(codeBlock[1].trim()); } catch (_) {} }

    // パターン2: 生のJSONオブジェクト
    if (!parsed) {
      const s = responseText.indexOf('{');
      const e = responseText.lastIndexOf('}');
      if (s !== -1 && e > s) { try { parsed = JSON.parse(responseText.slice(s, e + 1)); } catch (_) {} }
    }

    if (parsed && parsed.advice) {
      return json({ advice: parsed.advice, pia_mood: parsed.pia_mood || 'normal' });
    }

    // フォールバック: マークダウンやJSON記法を除去してテキストを返す
    let fallback = responseText
      .replace(/```(?:json)?\s*\n?/g, '')
      .replace(/```/g, '')
      .replace(/^\s*\{[\s\S]*\}\s*$/, '')  // 生JSON全体を除去
      .trim();
    // それでもJSON風なら最後の手段でadviceフィールドを正規表現で抽出
    if (!fallback || fallback.startsWith('{')) {
      const adviceMatch = responseText.match(/"advice"\s*:\s*"([^"]+)"/);
      fallback = adviceMatch ? adviceMatch[1] : '今日もがんばろうね〜！';
    }
    return json({ advice: fallback.slice(0, 150) || '今日もがんばろうね〜！', pia_mood: 'normal' });
  } catch (e) {
    return json({ advice: '今日もがんばろうね〜！🐷', pia_mood: 'normal' });
  }
}
