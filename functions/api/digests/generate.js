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

// POST /api/digests/generate
export async function onRequestPost({ env }) {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);

  // Calculate last week (Mon-Sun)
  const today = new Date(jst.toISOString().slice(0, 10) + 'T00:00:00Z');
  const dayOfWeek = today.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const lastMonday = new Date(today);
  lastMonday.setUTCDate(today.getUTCDate() - mondayOffset - 7);
  const lastSunday = new Date(lastMonday);
  lastSunday.setUTCDate(lastMonday.getUTCDate() + 6);

  const weekStart = lastMonday.toISOString().slice(0, 10);
  const weekEnd = lastSunday.toISOString().slice(0, 10);

  // Check if already exists
  const existing = await env.DB.prepare(
    'SELECT id FROM weekly_digests WHERE week_start = ?'
  ).bind(weekStart).first();
  if (existing) return json({ error: 'この週のダイジェストは既に生成済みです', digest_id: existing.id }, 409);

  // Aggregate data
  const completed = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM tasks WHERE done_at >= ? AND done_at < ?"
  ).bind(weekStart + 'T00:00:00', weekEnd + 'T23:59:59').first();

  const added = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM tasks WHERE created_at >= ? AND created_at < ?"
  ).bind(weekStart + 'T00:00:00', weekEnd + 'T23:59:59').first();

  const activeProjects = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM projects WHERE status = 'active'"
  ).first();

  // Per-project completion count
  const { results: perProject } = await env.DB.prepare(`
    SELECT p.id, p.name, p.color, COUNT(t.id) as completed
    FROM tasks t JOIN projects p ON t.project_id = p.id
    WHERE t.done_at >= ? AND t.done_at < ?
    GROUP BY p.id
  `).bind(weekStart + 'T00:00:00', weekEnd + 'T23:59:59').all();

  // Study time
  const { results: studyTasks } = await env.DB.prepare(`
    SELECT t.started_at, t.done_at
    FROM tasks t JOIN projects p ON t.project_id = p.id
    WHERE p.type = 'study' AND t.started_at IS NOT NULL AND t.done_at IS NOT NULL
    AND t.done_at >= ? AND t.done_at < ?
  `).bind(weekStart + 'T00:00:00', weekEnd + 'T23:59:59').all();

  let studyMinutes = 0;
  for (const st of studyTasks) {
    const diff = (new Date(st.done_at) - new Date(st.started_at)) / 60000;
    if (diff > 0 && diff < 480) studyMinutes += diff;
  }

  const velocityData = JSON.stringify(perProject.map(p => ({ id: p.id, name: p.name, color: p.color, completed: p.completed })));

  const statsData = {
    tasks_completed: completed?.count || 0,
    tasks_added: added?.count || 0,
    projects_active: activeProjects?.count || 0,
    per_project: perProject,
    study_minutes: Math.round(studyMinutes),
    week: `${weekStart} ~ ${weekEnd}`,
  };

  // Generate Pia comment via Gemini
  let piaComment = '先週もおつかれさま〜！';
  const apiKey = await getGeminiKey(env);
  if (apiKey) {
    try {
      const prompt = `以下のデータをもとに、ピアちゃんとして先週の振り返りコメントを書いてください。
よかった点、改善点、来週へのアドバイスを含めてください。
ピアちゃん口調（〜だよ、〜だね、絵文字あり）で、200文字以内で。

${JSON.stringify(statsData, null, 2)}

以下のJSON形式で返答してください（他の文章は不要）:
{"pia_comment":"コメント本文"}`;

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
      if (res.ok) {
        const data = await res.json();
        const parts = data.candidates?.[0]?.content?.parts || [];
        const nonThought = parts.filter(p => p.text !== undefined && p.thought !== true);
        const text = (nonThought.length > 0 ? nonThought : parts).map(p => p.text || '').join('');
        const parsed = extractJSON(text);
        if (parsed?.pia_comment) {
          piaComment = parsed.pia_comment;
        } else if (parsed?.comment) {
          piaComment = parsed.comment;
        } else {
          // フォールバック: "pia_comment" フィールドを正規表現で抽出
          const match = text.match(/"pia_comment"\s*:\s*"([^"]+)"/);
          if (match) {
            piaComment = match[1];
          } else {
            // コードブロックやJSON記法を除去してテキストのみ取得
            const cleaned = text.replace(/```[\s\S]*?```/g, '').replace(/^\s*\{[\s\S]*\}\s*$/m, '').trim();
            if (cleaned) piaComment = cleaned.slice(0, 300);
          }
        }
      }
    } catch (_) {}
  }

  const digestId = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO weekly_digests (id, week_start, week_end, tasks_completed, tasks_added, projects_active, velocity_data, pia_comment, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(digestId, weekStart, weekEnd, completed?.count || 0, added?.count || 0, activeProjects?.count || 0, velocityData, piaComment, new Date().toISOString()).run();

  return json({
    id: digestId,
    week_start: weekStart,
    week_end: weekEnd,
    tasks_completed: completed?.count || 0,
    tasks_added: added?.count || 0,
    projects_active: activeProjects?.count || 0,
    velocity_data: velocityData,
    pia_comment: piaComment,
    study_minutes: Math.round(studyMinutes),
  });
}
