// ==============================
// 初期化
// ==============================
document.addEventListener('DOMContentLoaded', () => {
  loadDigestPage();
});

// ==============================
// ダイジェストページ読み込み
// ==============================
async function loadDigestPage() {
  try {
    const data = await apiFetch('/api/digests');
    const digests = data.digests || [];

    if (!digests.length) {
      document.getElementById('digestDetail').innerHTML = `
        <div class="empty-state" style="padding:20px;">
          <img src="${getPiaImage('cheer')}" alt="ピアちゃん" class="pia-icon-lg" onerror="this.src='/icon-pia.png'">
          <p>まだダイジェストがないよ〜<br>上のボタンで生成してみてね！</p>
        </div>
      `;
      return;
    }

    renderDigest(digests[0]);
  } catch (e) {
    document.getElementById('digestDetail').innerHTML =
      '<div style="color:var(--text-sub);font-size:13px;padding:20px;text-align:center;">読み込みに失敗しました</div>';
  }
}

// ==============================
// メインレンダリング
// ==============================
function renderDigest(digest) {
  let velocityData = {};
  try {
    const parsed = JSON.parse(digest.velocity_data || '{}');
    velocityData = Array.isArray(parsed) ? {} : parsed;
  } catch (_) {
    velocityData = {};
  }

  const weekStart = digest.week_start ? formatDate(digest.week_start) : '';
  const weekEnd = digest.week_end ? formatDate(digest.week_end) : '';

  let html = `<div class="digest-week" style="margin-bottom:12px;font-size:13px;">${weekStart} 〜 ${weekEnd}</div>`;

  html += renderPiaSummary(digest);
  html += renderStatsGrid(velocityData, digest);
  html += renderVelocityChart(velocityData);
  html += renderProjectCards(velocityData);
  html += renderHighlights(velocityData);
  html += renderGithubActivity(velocityData);
  html += renderStudyTime(velocityData);
  html += renderNextWeek(velocityData);
  html += renderClosing(velocityData);

  document.getElementById('digestDetail').innerHTML = html;
}

// ==============================
// ① ピアちゃんサマリー
// ==============================
function renderPiaSummary(digest) {
  if (!digest.pia_comment) return '';
  return `
    <div class="card section" style="margin-bottom:12px;">
      <div class="pia-comment">
        <img src="${getPiaImage('happy')}" alt="ピアちゃん" class="pia-icon-sm" onerror="this.src='/icon-pia.png'">
        <div class="pia-bubble" style="font-size:13px;">${escHtml(digest.pia_comment)}</div>
      </div>
    </div>
  `;
}

// ==============================
// ② 統計グリッド
// ==============================
function renderStatsGrid(data, digest) {
  const completed = digest.tasks_completed || 0;
  const added = digest.tasks_added || 0;
  const active = digest.projects_active || 0;
  const prevCompleted = data.prev_completed || 0;
  const prevAdded = data.prev_added || 0;

  function diffHtml(current, prev) {
    const diff = current - prev;
    if (diff > 0) return `<div class="digest-stat-diff up">↑ +${diff}</div>`;
    if (diff < 0) return `<div class="digest-stat-diff down">↓ ${diff}</div>`;
    return `<div class="digest-stat-diff same">→ 0</div>`;
  }

  return `
    <div class="digest-stats section" style="margin-bottom:12px;">
      <div class="digest-stat-box">
        <div class="digest-stat-value">${completed}</div>
        <div class="digest-stat-label">完了タスク</div>
        ${diffHtml(completed, prevCompleted)}
      </div>
      <div class="digest-stat-box">
        <div class="digest-stat-value">${added}</div>
        <div class="digest-stat-label">追加タスク</div>
        ${diffHtml(added, prevAdded)}
      </div>
      <div class="digest-stat-box">
        <div class="digest-stat-value">${active}</div>
        <div class="digest-stat-label">稼働PJ</div>
        <div class="digest-stat-diff same">&nbsp;</div>
      </div>
    </div>
  `;
}

// ==============================
// ③ ベロシティグラフ（12週、積み上げ）
// ==============================
function renderVelocityChart(data) {
  const velocity = data.velocity;
  if (!velocity || !velocity.length) return '';

  const maxTotal = Math.max(...velocity.map(v => v.total || 0), 1);

  let barsHtml = '';
  for (const week of velocity) {
    const byProject = week.by_project || [];
    const label = week.week_start ? formatDate(week.week_start) : '';

    let stackHtml = '';
    for (const bp of byProject) {
      const h = Math.max(0, ((bp.count || 0) / maxTotal) * 80);
      if (h > 0) {
        stackHtml += `<div class="velocity-segment" style="height:${h}px;background:${escHtml(bp.color || 'var(--primary)')};"></div>`;
      }
    }

    barsHtml += `
      <div class="velocity-week">
        <div class="velocity-stack">${stackHtml}</div>
        <div class="velocity-label">${escHtml(label)}</div>
      </div>
    `;
  }

  return `
    <div class="card section" style="margin-bottom:12px;">
      <div style="font-size:13px;font-weight:700;margin-bottom:8px;">ベロシティ（${velocity.length}週）</div>
      <div class="velocity-chart">${barsHtml}</div>
    </div>
  `;
}

// ==============================
// ④ プロジェクトカード
// ==============================
function renderProjectCards(data) {
  const projects = data.projects;
  if (!projects || !projects.length) return '';

  let html = '<div style="margin-bottom:12px;">';
  html += '<div style="font-size:13px;font-weight:700;margin-bottom:8px;">プロジェクト別</div>';

  for (const p of projects) {
    const hasActivity = (p.completed_count || 0) > 0 || (p.added_count || 0) > 0;
    const color = p.color || 'var(--primary)';
    const typeIcon = p.type === 'study' ? '📖' : '🔨';
    const inactiveClass = hasActivity ? '' : ' inactive';

    html += `<div class="digest-project-card${inactiveClass}" style="border-left-color:${escHtml(color)};">`;
    html += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">`;
    html += `<span>${typeIcon}</span>`;
    html += `<span style="font-weight:700;font-size:14px;">${escHtml(p.name)}</span>`;
    html += `</div>`;

    if (!hasActivity) {
      html += `<div style="font-size:12px;color:var(--text-sub);margin-bottom:4px;">今週は動きなし</div>`;
      html += `<div style="font-size:12px;color:var(--accent-pink);">次の一歩、踏み出してみよう？</div>`;
      html += `</div>`;
      continue;
    }

    // Progress bar
    const pct = p.progress_pct || 0;
    const prevPct = p.progress_prev_pct || 0;
    const pctDiff = pct - prevPct;
    html += `<div class="progress-bar" style="margin-bottom:6px;"><div class="progress-bar-fill" style="width:${pct}%;background:${escHtml(color)};"></div></div>`;
    html += `<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-sub);margin-bottom:8px;">`;
    html += `<span>進捗 ${pct}%</span>`;
    if (pctDiff > 0) {
      html += `<span style="color:#22C55E;">↑ +${pctDiff}pt</span>`;
    } else if (pctDiff < 0) {
      html += `<span style="color:var(--accent-red);">↓ ${pctDiff}pt</span>`;
    }
    html += `</div>`;

    // Stats
    html += `<div style="display:flex;gap:12px;font-size:12px;color:var(--text-sub);margin-bottom:8px;">`;
    html += `<span>完了 ${p.completed_count || 0}件</span>`;
    html += `<span>追加 ${p.added_count || 0}件</span>`;
    html += `</div>`;

    // Completed tasks list
    const completed = p.completed_tasks || [];
    if (completed.length) {
      html += `<div style="margin-bottom:6px;">`;
      for (const t of completed) {
        html += `<div class="task-list-item" style="font-size:13px;padding:3px 0;color:var(--text-main);">✅ ${escHtml(t)}</div>`;
      }
      html += `</div>`;
    }

    // Upcoming tasks
    const upcoming = p.upcoming_tasks || [];
    if (upcoming.length) {
      html += `<div style="font-size:11px;font-weight:600;color:var(--text-sub);margin-top:6px;margin-bottom:4px;">次にやること</div>`;
      for (const t of upcoming) {
        const due = t.due_end ? ` (${formatDate(t.due_end)})` : '';
        html += `<div style="font-size:12px;padding:2px 0;color:var(--text-main);">▸ ${escHtml(t.text)}${due}</div>`;
      }
    }

    html += `</div>`;
  }

  html += '</div>';
  return html;
}

// ==============================
// ⑤ ハイライト / 大変だったこと
// ==============================
function renderHighlights(data) {
  const highlights = data.highlights || [];
  const tough = data.tough_things || [];
  if (!highlights.length && !tough.length) return '';

  let html = '';

  if (highlights.length) {
    html += `<div class="card section" style="margin-bottom:12px;">`;
    html += `<div style="font-size:13px;font-weight:700;margin-bottom:8px;">✨ ハイライト</div>`;
    for (const h of highlights) {
      html += `<div class="highlight-card">${escHtml(h)}</div>`;
    }
    html += `</div>`;
  }

  if (tough.length) {
    html += `<div class="card section" style="margin-bottom:12px;">`;
    html += `<div style="font-size:13px;font-weight:700;margin-bottom:8px;">💪 大変だったこと</div>`;
    for (const t of tough) {
      html += `<div class="highlight-card">${escHtml(t)}</div>`;
    }
    html += `</div>`;
  }

  return html;
}

// ==============================
// ⑥ GitHubアクティビティ
// ==============================
function renderGithubActivity(data) {
  const projects = (data.projects || []).filter(p => p.github && p.github.commits > 0);
  if (!projects.length) return '';

  const dayLabels = ['月', '火', '水', '木', '金', '土', '日'];

  let html = `<div class="card section" style="margin-bottom:12px;">`;
  html += `<div style="font-size:13px;font-weight:700;margin-bottom:10px;">GitHub アクティビティ</div>`;

  for (const p of projects) {
    const gh = p.github;
    const color = p.color || 'var(--primary)';
    html += `<div style="margin-bottom:12px;">`;
    html += `<div style="font-size:12px;font-weight:600;margin-bottom:6px;"><span style="color:${escHtml(color)};">●</span> ${escHtml(p.name)}</div>`;
    html += `<div style="display:flex;gap:12px;font-size:12px;color:var(--text-sub);margin-bottom:6px;">`;
    html += `<span>${gh.commits} commits</span>`;
    if (gh.last_commit) html += `<span>最終: ${formatDate(gh.last_commit)}</span>`;
    if (gh.open_prs) html += `<span>PR: ${gh.open_prs}件</span>`;
    html += `</div>`;

    // Commit dots (7 days)
    const days = gh.commit_days || [];
    if (days.length) {
      html += `<div class="commit-dots">`;
      for (let i = 0; i < days.length && i < 7; i++) {
        const active = days[i] ? ' active' : ' inactive';
        html += `<div class="commit-dot${active}">${dayLabels[i] || ''}</div>`;
      }
      html += `</div>`;
    }

    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

// ==============================
// ⑦ 学習時間
// ==============================
function renderStudyTime(data) {
  const totalMin = data.study_total_minutes || 0;
  const studyProjects = (data.projects || []).filter(p => p.study && p.study.minutes > 0);
  if (!totalMin && !studyProjects.length) return '';

  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;

  let html = `<div class="card section" style="margin-bottom:12px;">`;
  html += `<div style="font-size:13px;font-weight:700;margin-bottom:10px;">📖 学習時間</div>`;
  html += `<div style="font-size:20px;font-weight:700;color:var(--primary-dark);margin-bottom:8px;">${hours}時間${mins > 0 ? mins + '分' : ''}</div>`;

  for (const p of studyProjects) {
    const s = p.study;
    const goalPct = s.goal_minutes ? Math.round((s.minutes / s.goal_minutes) * 100) : 0;
    const color = p.color || 'var(--primary)';

    html += `<div style="margin-bottom:10px;">`;
    html += `<div style="font-size:12px;font-weight:600;margin-bottom:4px;"><span style="color:${escHtml(color)};">●</span> ${escHtml(p.name)}</div>`;
    html += `<div style="display:flex;gap:8px;font-size:12px;color:var(--text-sub);margin-bottom:6px;">`;
    html += `<span>${s.minutes}分</span>`;
    if (s.goal_minutes) html += `<span>目標達成率 ${goalPct}%</span>`;
    html += `</div>`;

    // Daily bar chart
    const daily = s.daily || [];
    if (daily.length) {
      const maxDaily = Math.max(...daily, 1);
      const dayLabels = ['月', '火', '水', '木', '金', '土', '日'];
      html += `<div style="display:flex;align-items:flex-end;gap:4px;height:40px;">`;
      for (let i = 0; i < daily.length && i < 7; i++) {
        const h = Math.max(0, (daily[i] / maxDaily) * 36);
        html += `<div style="flex:1;display:flex;flex-direction:column;align-items:center;">`;
        if (h > 0) {
          html += `<div style="width:100%;height:${h}px;background:${escHtml(color)};border-radius:2px;"></div>`;
        }
        html += `<div style="font-size:9px;color:var(--text-sub);margin-top:2px;">${dayLabels[i]}</div>`;
        html += `</div>`;
      }
      html += `</div>`;
    }

    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

// ==============================
// ⑧ 来週のプレビュー
// ==============================
function renderNextWeek(data) {
  const tasks = data.next_week || [];
  if (!tasks.length) return '';

  const shown = tasks.slice(0, 10);

  let html = `<div class="card section" style="margin-bottom:12px;">`;
  html += `<div style="font-size:13px;font-weight:700;margin-bottom:8px;">来週の予定</div>`;

  for (const t of shown) {
    const color = t.project_color || 'var(--primary)';
    const due = t.due_end ? formatDate(t.due_end) : '';
    html += `<div class="next-week-task">`;
    html += `<span style="color:${escHtml(color)};font-size:10px;">●</span>`;
    html += `<span style="flex:1;">${escHtml(t.text)}</span>`;
    if (t.project_name) html += `<span style="font-size:11px;color:var(--text-sub);">${escHtml(t.project_name)}</span>`;
    if (due) html += `<span style="font-size:11px;color:var(--text-sub);">${due}</span>`;
    html += `</div>`;
  }

  if (tasks.length > 10) {
    html += `<div style="font-size:12px;color:var(--text-sub);text-align:center;padding-top:8px;">他 ${tasks.length - 10}件</div>`;
  }

  html += `</div>`;
  return html;
}

// ==============================
// ⑨ ピアちゃん締めコメント
// ==============================
function renderClosing(data) {
  if (!data.closing) return '';
  return `
    <div class="card section" style="margin-bottom:12px;">
      <div class="pia-comment">
        <img src="${getPiaImage('cheer')}" alt="ピアちゃん" class="pia-icon-sm" onerror="this.src='/icon-pia.png'">
        <div class="pia-bubble" style="font-size:13px;">${escHtml(data.closing)}</div>
      </div>
    </div>
  `;
}

// ==============================
// ダイジェスト生成
// ==============================
async function generateDigest() {
  showToast('ダイジェストを生成中...');
  try {
    await apiFetch('/api/digests/generate', { method: 'POST' });
    showToast('ダイジェストを生成しました！');
    loadDigestPage();
  } catch (e) {
    showToast('エラー: ' + e.message);
  }
}
