function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// GET /api/dashboard — ダッシュボード集約データ
export async function onRequestGet({ env }) {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const today = jst.toISOString().slice(0, 10);

  // 繰り返しタスク生成（Cronの代替）
  await generateRecurringTasks(env, today);

  // 今日やるべきタスク（期限が今日以前の未完了タスク）
  const { results: todayTasks } = await env.DB.prepare(`
    SELECT t.*, p.name as project_name, p.color as project_color
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    WHERE t.status != 'done' AND (t.due_end <= ? OR t.due_end IS NULL)
    AND p.status = 'active'
    ORDER BY
      CASE WHEN t.due_end IS NOT NULL AND t.due_end < ? THEN 0 ELSE 1 END,
      CASE t.priority WHEN 'high' THEN 0 WHEN 'mid' THEN 1 ELSE 2 END,
      t.sort_order
    LIMIT 20
  `).bind(today, today).all();

  // 全プロジェクト（全ステータス）
  const { results: projects } = await env.DB.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as total_tasks,
      (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'done') as done_tasks,
      (SELECT text FROM tasks WHERE project_id = p.id AND status != 'done' ORDER BY CASE status WHEN 'doing' THEN 0 ELSE 1 END, sort_order LIMIT 1) as next_task
    FROM projects p
    WHERE p.status != 'done'
    ORDER BY
      CASE p.status WHEN 'active' THEN 0 WHEN 'planning' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END,
      p.created_at DESC
  `).all();

  // まなぶプロジェクトの今日の学習時間（study_sessions）
  const { results: studyToday } = await env.DB.prepare(`
    SELECT project_id, SUM(duration_minutes) as minutes
    FROM study_sessions
    WHERE date = ? AND duration_minutes IS NOT NULL
    GROUP BY project_id
  `).bind(today).all();
  const studyTodayMap = {};
  for (const s of studyToday) studyTodayMap[s.project_id] = s.minutes || 0;

  // アクティブな計測中セッションの経過時間も加算
  const { results: activeSessions } = await env.DB.prepare(`
    SELECT project_id, started_at FROM study_sessions
    WHERE date = ? AND ended_at IS NULL
  `).bind(today).all();
  for (const s of activeSessions) {
    const elapsed = Math.floor((now.getTime() - new Date(s.started_at).getTime()) / 60000);
    studyTodayMap[s.project_id] = (studyTodayMap[s.project_id] || 0) + Math.max(0, elapsed);
  }

  // プロジェクトに学習時間を付与
  for (const p of projects) {
    p.study_today_minutes = studyTodayMap[p.id] || 0;
  }

  // 期限超過タスク数
  const overdue = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM tasks t
    JOIN projects p ON t.project_id = p.id
    WHERE t.status != 'done' AND t.due_end < ? AND p.status = 'active'
  `).bind(today).first();

  // 学習ストリーク（直近30日）
  let studyStreak = { current: 0, best: 0, dots: [] };
  try {
    // 直近30日の学習有無を取得
    const d30 = new Date(today + 'T00:00:00Z');
    d30.setUTCDate(d30.getUTCDate() - 29);
    const startDate30 = d30.toISOString().slice(0, 10);

    const { results: studyDays } = await env.DB.prepare(`
      SELECT DISTINCT date FROM study_sessions
      WHERE date >= ? AND duration_minutes > 0
      ORDER BY date
    `).bind(startDate30).all();
    const studyDaySet = new Set(studyDays.map(r => r.date));

    // 30日のドット配列を生成
    const dots = [];
    for (let i = 29; i >= 0; i--) {
      const dd = new Date(today + 'T00:00:00Z');
      dd.setUTCDate(dd.getUTCDate() - i);
      const dateStr = dd.toISOString().slice(0, 10);
      dots.push(studyDaySet.has(dateStr) ? 1 : 0);
    }

    // 現在のストリーク（今日から遡って連続日数、今日未学習なら昨日から）
    let current = 0;
    for (let i = dots.length - 1; i >= 0; i--) {
      if (dots[i] === 1) current++;
      else if (i === dots.length - 1) continue; // 今日はまだ学習してなくてもOK
      else break;
    }

    // 全期間の最長ストリーク
    const { results: allDays } = await env.DB.prepare(`
      SELECT DISTINCT date FROM study_sessions
      WHERE duration_minutes > 0
      ORDER BY date
    `).all();

    let best = 0, streak = 0, prevDate = null;
    for (const r of allDays) {
      if (prevDate) {
        const prev = new Date(prevDate + 'T00:00:00Z');
        const curr = new Date(r.date + 'T00:00:00Z');
        const diff = (curr - prev) / 86400000;
        if (diff === 1) {
          streak++;
        } else {
          streak = 1;
        }
      } else {
        streak = 1;
      }
      if (streak > best) best = streak;
      prevDate = r.date;
    }

    studyStreak = { current, best, dots };
  } catch (_) {}

  return json({
    today,
    todayTasks,
    projects,
    overdueCount: overdue?.count || 0,
    studyStreak,
  });
}

// 繰り返しタスク生成
async function generateRecurringTasks(env, today) {
  try {
    const { results: dueRecurring } = await env.DB.prepare(
      "SELECT * FROM recurring WHERE status = 'active' AND next_due <= ?"
    ).bind(today).all();

    for (const r of dueRecurring) {
      const taskId = crypto.randomUUID();
      const now = new Date().toISOString();

      // タスクを生成
      await env.DB.prepare(`
        INSERT INTO tasks (id, project_id, text, priority, status, created_at, sort_order, due_end)
        VALUES (?, ?, ?, 'mid', 'open', ?, 0, ?)
      `).bind(taskId, r.project_id, r.text, now, today).run();

      // next_dueを更新
      const nextDue = calcNextDue(r.frequency, r.next_due, r.day_of_week, r.day_of_month);
      await env.DB.prepare(
        'UPDATE recurring SET next_due = ? WHERE id = ?'
      ).bind(nextDue, r.id).run();
    }
  } catch (_) {}
}

function calcNextDue(frequency, currentDue, dayOfWeek, dayOfMonth) {
  const d = new Date(currentDue + 'T00:00:00Z');
  if (frequency === 'daily') {
    d.setUTCDate(d.getUTCDate() + 1);
  } else if (frequency === 'weekly') {
    d.setUTCDate(d.getUTCDate() + 7);
  } else if (frequency === 'monthly') {
    d.setUTCMonth(d.getUTCMonth() + 1);
    if (dayOfMonth) d.setUTCDate(Math.min(dayOfMonth, new Date(d.getUTCFullYear(), d.getUTCMonth() + 1, 0).getUTCDate()));
  }
  return d.toISOString().slice(0, 10);
}
