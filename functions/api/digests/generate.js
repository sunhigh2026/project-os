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

function getMonday(date) {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(d, n) {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

async function fetchGitHub(url, token) {
  const res = await fetch(url, {
    headers: {
      'Authorization': `token ${token}`,
      'User-Agent': 'Project-OS',
      'Accept': 'application/vnd.github.v3+json',
    },
  });
  if (!res.ok) return null;
  return res.json();
}

// POST /api/digests/generate
export async function onRequestPost({ request, env }) {
  let force = false;
  try {
    const body = await request.json();
    force = body?.force === true;
  } catch (_) {}

  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);

  // Calculate last week (Mon-Sun)
  const today = new Date(jst.toISOString().slice(0, 10) + 'T00:00:00Z');
  const thisMonday = getMonday(today);
  const lastMonday = addDays(thisMonday, -7);
  const lastSunday = addDays(lastMonday, 6);
  const nextMonday = thisMonday;
  const nextSunday = addDays(nextMonday, 6);

  const weekStart = formatDate(lastMonday);
  const weekEnd = formatDate(lastSunday);
  const nextWeekStart = formatDate(nextMonday);
  const nextWeekEnd = formatDate(nextSunday);

  // Check if already exists
  const existing = await env.DB.prepare(
    'SELECT id FROM weekly_digests WHERE week_start = ?'
  ).bind(weekStart).first();
  if (existing && !force) return json({ error: 'この週のダイジェストは既に生成済みです', digest_id: existing.id }, 409);
  if (existing && force) {
    await env.DB.prepare('DELETE FROM weekly_digests WHERE id = ?').bind(existing.id).run();
  }

  // ========== 1. Gather base counts ==========
  const completed = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM tasks WHERE done_at >= ? AND done_at <= ?"
  ).bind(weekStart + 'T00:00:00', weekEnd + 'T23:59:59').first();

  const added = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM tasks WHERE created_at >= ? AND created_at <= ?"
  ).bind(weekStart + 'T00:00:00', weekEnd + 'T23:59:59').first();

  const tasksCompleted = completed?.count || 0;
  const tasksAdded = added?.count || 0;

  // ========== 2. Get all active projects ==========
  const { results: activeProjects } = await env.DB.prepare(
    "SELECT id, name, description, type, goal_date, daily_minutes, github_repo, status, color FROM projects WHERE status = 'active'"
  ).all();

  // ========== 3. Get github_token from settings ==========
  let githubToken = null;
  try {
    const tokenRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'github_token'").first();
    githubToken = tokenRow?.value || null;
  } catch (_) {}

  // ========== 4. Per-project details ==========
  const projectDetails = [];
  let studyTotalMinutes = 0;

  for (const project of activeProjects) {
    const pId = project.id;

    // Tasks completed this week (names)
    const { results: completedTasks } = await env.DB.prepare(
      "SELECT text FROM tasks WHERE project_id = ? AND done_at >= ? AND done_at <= ?"
    ).bind(pId, weekStart + 'T00:00:00', weekEnd + 'T23:59:59').all();

    // Tasks added this week (count)
    const addedRow = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM tasks WHERE project_id = ? AND created_at >= ? AND created_at <= ?"
    ).bind(pId, weekStart + 'T00:00:00', weekEnd + 'T23:59:59').first();

    // Current progress: done / total tasks
    const totalRow = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM tasks WHERE project_id = ?"
    ).bind(pId).first();
    const doneRow = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM tasks WHERE project_id = ? AND status = 'done'"
    ).bind(pId).first();
    const totalTasks = totalRow?.count || 0;
    const doneTasks = doneRow?.count || 0;
    const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    // Previous week progress: done as of last Monday (done_at < weekStart) / total as of last Monday
    const donePrevRow = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM tasks WHERE project_id = ? AND status = 'done' AND done_at < ?"
    ).bind(pId, weekStart + 'T00:00:00').first();
    const totalPrevRow = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM tasks WHERE project_id = ? AND created_at < ?"
    ).bind(pId, weekStart + 'T00:00:00').first();
    const totalPrev = totalPrevRow?.count || 0;
    const donePrev = donePrevRow?.count || 0;
    const progressPrevPct = totalPrev > 0 ? Math.round((donePrev / totalPrev) * 100) : 0;

    // Upcoming tasks (due next week)
    const { results: upcomingTasks } = await env.DB.prepare(
      "SELECT text, due_end FROM tasks WHERE project_id = ? AND status != 'done' AND due_end >= ? AND due_end <= ? ORDER BY due_end ASC"
    ).bind(pId, nextWeekStart, nextWeekEnd).all();

    // Study data (for study projects)
    let studyData = null;
    if (project.type === 'study') {
      const { results: studyTasks } = await env.DB.prepare(
        "SELECT started_at, done_at FROM tasks WHERE project_id = ? AND started_at IS NOT NULL AND done_at IS NOT NULL AND done_at >= ? AND done_at <= ?"
      ).bind(pId, weekStart + 'T00:00:00', weekEnd + 'T23:59:59').all();

      let totalMinutes = 0;
      const daily = [0, 0, 0, 0, 0, 0, 0]; // Mon-Sun

      for (const st of studyTasks) {
        const start = new Date(st.started_at);
        const end = new Date(st.done_at);
        const diff = (end - start) / 60000;
        if (diff > 0 && diff < 480) {
          totalMinutes += diff;
          // Determine day of week (Mon=0 ... Sun=6)
          const dayIdx = end.getUTCDay() === 0 ? 6 : end.getUTCDay() - 1;
          daily[dayIdx] += Math.round(diff);
        }
      }

      totalMinutes = Math.round(totalMinutes);
      studyTotalMinutes += totalMinutes;
      const goalMinutes = (project.daily_minutes || 0) * 7;
      studyData = { minutes: totalMinutes, goal_minutes: goalMinutes, daily };
    }

    // GitHub activity
    let githubData = null;
    if (project.github_repo && githubToken) {
      try {
        const repo = project.github_repo;
        const [commits, prs] = await Promise.all([
          fetchGitHub(
            `https://api.github.com/repos/${repo}/commits?since=${weekStart}T00:00:00Z&until=${weekEnd}T23:59:59Z&per_page=100`,
            githubToken
          ),
          fetchGitHub(
            `https://api.github.com/repos/${repo}/pulls?state=open`,
            githubToken
          ),
        ]);

        if (commits && Array.isArray(commits)) {
          const commitDays = [false, false, false, false, false, false, false]; // Mon-Sun
          let lastCommitDate = null;

          for (const c of commits) {
            const commitDate = c.commit?.author?.date || c.commit?.committer?.date;
            if (commitDate) {
              const d = new Date(commitDate);
              const dayIdx = d.getUTCDay() === 0 ? 6 : d.getUTCDay() - 1;
              commitDays[dayIdx] = true;
              if (!lastCommitDate || commitDate > lastCommitDate) {
                lastCommitDate = commitDate;
              }
            }
          }

          githubData = {
            commits: commits.length,
            last_commit: lastCommitDate ? lastCommitDate.slice(0, 10) : null,
            open_prs: Array.isArray(prs) ? prs.length : 0,
            commit_days: commitDays,
          };
        }
      } catch (_) {
        // GitHub API failed - skip
      }
    }

    const detail = {
      id: pId,
      name: project.name,
      color: project.color,
      type: project.type,
      status: project.status,
      github_repo: project.github_repo,
      completed_tasks: completedTasks.map(t => t.text),
      completed_count: completedTasks.length,
      added_count: addedRow?.count || 0,
      progress_pct: progressPct,
      progress_prev_pct: progressPrevPct,
      upcoming_tasks: upcomingTasks.map(t => ({ text: t.text, due_end: t.due_end })),
    };

    if (githubData) detail.github = githubData;
    if (studyData) detail.study = studyData;

    projectDetails.push(detail);
  }

  // ========== 5. Velocity data (last 12 weeks) ==========
  const velocityWeeks = [];
  try {
    for (let i = 12; i >= 1; i--) {
      const vMonday = addDays(lastMonday, -7 * (i - 1));
      const vSunday = addDays(vMonday, 6);
      const vStart = formatDate(vMonday);
      const vEnd = formatDate(vSunday);

      const { results: weeklyByProject } = await env.DB.prepare(`
        SELECT p.id, p.name, p.color, COUNT(t.id) as count
        FROM tasks t JOIN projects p ON t.project_id = p.id
        WHERE t.done_at >= ? AND t.done_at <= ?
        GROUP BY p.id
      `).bind(vStart + 'T00:00:00', vEnd + 'T23:59:59').all();

      const total = weeklyByProject.reduce((sum, p) => sum + (p.count || 0), 0);

      velocityWeeks.push({
        week_start: vStart,
        total,
        by_project: weeklyByProject.map(p => ({ id: p.id, name: p.name, color: p.color, count: p.count })),
      });
    }
  } catch (_) {}

  // ========== 6. Previous week comparison ==========
  let prevCompleted = 0;
  let prevAdded = 0;
  try {
    const prevWeekStart = formatDate(addDays(lastMonday, -7));
    const prevDigest = await env.DB.prepare(
      'SELECT tasks_completed, tasks_added FROM weekly_digests WHERE week_start = ?'
    ).bind(prevWeekStart).first();
    if (prevDigest) {
      prevCompleted = prevDigest.tasks_completed || 0;
      prevAdded = prevDigest.tasks_added || 0;
    }
  } catch (_) {}

  // ========== 7. Next week preview (top 10) ==========
  let nextWeekTasks = [];
  try {
    const { results: nwTasks } = await env.DB.prepare(`
      SELECT t.text, t.due_end, p.name as project_name, p.color as project_color
      FROM tasks t JOIN projects p ON t.project_id = p.id
      WHERE t.status != 'done' AND t.due_end >= ? AND t.due_end <= ?
      ORDER BY t.due_end ASC
      LIMIT 10
    `).bind(nextWeekStart, nextWeekEnd).all();
    nextWeekTasks = nwTasks.map(t => ({
      text: t.text,
      project_name: t.project_name,
      project_color: t.project_color,
      due_end: t.due_end,
    }));
  } catch (_) {}

  // ========== 8. Overdue tasks ==========
  let overdueTasks = [];
  try {
    const { results: odTasks } = await env.DB.prepare(`
      SELECT t.text, t.due_end, p.name as project_name
      FROM tasks t JOIN projects p ON t.project_id = p.id
      WHERE t.status != 'done' AND t.due_end < ?
      ORDER BY t.due_end ASC
    `).bind(weekStart).all();
    overdueTasks = odTasks.map(t => ({
      text: t.text,
      project_name: t.project_name,
      due_end: t.due_end,
    }));
  } catch (_) {}

  // ========== 9. Build velocity_data JSON ==========
  const velocityData = {
    projects: projectDetails,
    velocity: velocityWeeks,
    next_week: nextWeekTasks,
    prev_completed: prevCompleted,
    prev_added: prevAdded,
    overdue_tasks: overdueTasks,
    study_total_minutes: studyTotalMinutes,
  };

  // ========== 10. Gemini prompt ==========
  let piaComment = '先週もおつかれさま〜！';
  let highlights = [];
  let toughThings = [];
  let closing = '';

  const apiKey = await getGeminiKey(env);
  if (apiKey) {
    try {
      // Build rich context for Gemini
      const projectSummaries = projectDetails.map(p => {
        let summary = `【${p.name}】(${p.type}) 進捗: ${p.progress_prev_pct}% → ${p.progress_pct}%`;
        summary += `\n  完了タスク(${p.completed_count}): ${p.completed_tasks.join(', ') || 'なし'}`;
        summary += `\n  追加タスク: ${p.added_count}件`;
        if (p.upcoming_tasks.length > 0) {
          summary += `\n  来週予定: ${p.upcoming_tasks.map(t => t.text).join(', ')}`;
        }
        if (p.github) {
          summary += `\n  GitHub: ${p.github.commits}コミット, PR ${p.github.open_prs}件オープン`;
        }
        if (p.study) {
          summary += `\n  学習: ${p.study.minutes}分 / 目標${p.study.goal_minutes}分`;
        }
        return summary;
      }).join('\n\n');

      const overdueText = overdueTasks.length > 0
        ? `期限超過タスク(${overdueTasks.length}件):\n${overdueTasks.map(t => `  - ${t.text} (${t.project_name}, 期限: ${t.due_end})`).join('\n')}`
        : '期限超過タスク: なし';

      const nextWeekText = nextWeekTasks.length > 0
        ? `来週の予定(${nextWeekTasks.length}件):\n${nextWeekTasks.map(t => `  - ${t.text} (${t.project_name}, 期限: ${t.due_end})`).join('\n')}`
        : '来週の予定: なし';

      const comparisonText = `先々週比較: 完了 ${prevCompleted} → ${tasksCompleted}, 追加 ${prevAdded} → ${tasksAdded}`;

      const prompt = `あなたはProject-OSのAIアシスタント「ピアちゃん」です。
ユーザーの週次レポートデータを分析して、振り返りコメントを生成してください。

ピアちゃんの性格:
- フレンドリーで励まし上手
- 具体的な数字やプロジェクト名に言及する
- 問題があれば率直に指摘する（でも優しく）
- 〜だよ、〜だね、絵文字を使うカジュアルな口調

=== 今週のデータ (${weekStart} ~ ${weekEnd}) ===

プロジェクト別:
${projectSummaries}

${overdueText}

${nextWeekText}

${comparisonText}

全体: 完了${tasksCompleted}件, 追加${tasksAdded}件, アクティブ${activeProjects.length}プロジェクト
学習合計: ${studyTotalMinutes}分

=== 指示 ===
以下のJSON形式で返答してください（他の文章は不要）:
{
  "summary": "メインサマリー（200文字以内）- どのプロジェクトが動いてるか、止まってるか、来週何をすべきか",
  "highlights": ["今週のハイライト1", "ハイライト2"],
  "tough_things": ["タフだったこと1"],
  "closing": "締めコメント（50文字以内）"
}`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 2048, responseMimeType: 'application/json' },
          }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        const parts = data.candidates?.[0]?.content?.parts || [];
        const nonThought = parts.filter(p => p.text !== undefined && p.thought !== true);
        const text = (nonThought.length > 0 ? nonThought : parts).map(p => p.text || '').join('').replace(/^\uFEFF/, '').trim();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (_) {}
        if (!parsed) parsed = extractJSON(text);

        if (parsed) {
          if (parsed.summary) piaComment = parsed.summary;
          if (Array.isArray(parsed.highlights)) highlights = parsed.highlights;
          if (Array.isArray(parsed.tough_things)) toughThings = parsed.tough_things;
          if (parsed.closing) closing = parsed.closing;
        } else {
          // Fallback: use raw text
          const cleaned = text.replace(/```[\s\S]*?```/g, '').trim();
          if (cleaned) piaComment = cleaned.slice(0, 300);
        }
      }
    } catch (_) {}
  }

  // Add Gemini results to velocity_data
  velocityData.highlights = highlights;
  velocityData.tough_things = toughThings;
  velocityData.closing = closing;

  const velocityDataStr = JSON.stringify(velocityData);

  // ========== 11. Insert into DB ==========
  const digestId = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO weekly_digests (id, week_start, week_end, tasks_completed, tasks_added, projects_active, velocity_data, pia_comment, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(digestId, weekStart, weekEnd, tasksCompleted, tasksAdded, activeProjects.length, velocityDataStr, piaComment, new Date().toISOString()).run();

  return json({
    id: digestId,
    week_start: weekStart,
    week_end: weekEnd,
    tasks_completed: tasksCompleted,
    tasks_added: tasksAdded,
    projects_active: activeProjects.length,
    velocity_data: velocityDataStr,
    pia_comment: piaComment,
  });
}
