// ==============================
// 状態
// ==============================
let dashData = null;
let currentType = sessionStorage.getItem('dashType') || 'project';
let currentStatus = sessionStorage.getItem('dashStatus') || 'active';

// ==============================
// 初期化
// ==============================
document.addEventListener('DOMContentLoaded', () => {
  // タブ初期状態を復元
  document.querySelectorAll('.dash-type-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.type === currentType);
  });
  document.querySelectorAll('.dash-status-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.status === currentStatus);
  });
  loadDashboard();
});

// ==============================
// ダッシュボード読み込み
// ==============================
async function loadDashboard() {
  try {
    dashData = await apiFetch('/api/dashboard');
    renderPiaAdvice(dashData);
    renderProjectProgress(dashData.projects);
    updateStreakVisibility();
    renderTodayTasks(dashData.todayTasks, dashData.today);
    loadDigest();
    loadAiAdvice();
  } catch (e) {
    console.error('Dashboard error:', e);
    document.getElementById('piaBubble').textContent = 'データの読み込みに失敗したよ〜';
  }
}

// ==============================
// タブ切替
// ==============================
function switchTypeTab(type, btn) {
  currentType = type;
  sessionStorage.setItem('dashType', type);
  document.querySelectorAll('.dash-type-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (dashData) {
    renderProjectProgress(dashData.projects);
    updateStreakVisibility();
  }
}

function updateStreakVisibility() {
  const streakEl = document.getElementById('streakSection');
  if (currentType === 'study' && dashData?.studyStreak) {
    renderStreak(dashData.studyStreak);
    streakEl.style.display = '';
  } else {
    streakEl.style.display = 'none';
  }
}

function renderStreak(streak) {
  const el = document.getElementById('streakSection');
  const dots = (streak.dots || []).map((d, i) => {
    const isToday = i === streak.dots.length - 1;
    const color = d ? 'var(--primary)' : 'var(--border)';
    const pulse = isToday && !d ? 'animation:pulse 2s infinite;' : '';
    return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};${pulse}"></span>`;
  }).join('');

  el.innerHTML = `
    <div class="card" style="padding:12px 16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <span style="font-size:14px;font-weight:700;">${streak.current > 0 ? `🔥 ${streak.current}日連続学習中！` : '今日から始めよう！'}</span>
        <span style="font-size:11px;color:var(--text-sub);">最長 ${streak.best}日</span>
      </div>
      <div style="display:flex;gap:3px;justify-content:center;">${dots}</div>
    </div>
  `;
}

function switchStatusTab(status, btn) {
  currentStatus = status;
  sessionStorage.setItem('dashStatus', status);
  document.querySelectorAll('.dash-status-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (dashData) renderProjectProgress(dashData.projects);
}

// ==============================
// ピアちゃんアドバイス（静的版、AI接続前）
// ==============================
function renderPiaAdvice(data) {
  const icon = document.getElementById('piaIcon');
  const bubble = document.getElementById('piaBubble');

  const taskCount = data.todayTasks?.length || 0;
  const overdueCount = data.overdueCount || 0;
  const projectCount = data.projects?.length || 0;

  let msg, mood;
  if (taskCount === 0 && projectCount === 0) {
    msg = 'まだプロジェクトがないよ〜！新しく作ってみる？✨';
    mood = 'cheer';
  } else if (overdueCount > 0) {
    msg = `期限超過のタスクが${overdueCount}件あるよ〜！無理しない程度にやっていこ 💪`;
    mood = 'thinking';
  } else if (taskCount === 0) {
    msg = '今日やることは全部おわってるよ！ゆっくり休んでね 🌸';
    mood = 'happy';
  } else if (taskCount <= 3) {
    msg = `今日は${taskCount}件だけ！サクッと終わらせちゃおう 🎵`;
    mood = 'happy';
  } else {
    msg = `今日は${taskCount}件あるね！一つずつやっていこ〜 📝`;
    mood = 'normal';
  }

  icon.src = getPiaImage(mood);
  bubble.textContent = msg;
}

// AIアドバイス取得
async function loadAiAdvice() {
  try {
    const data = await apiFetch('/api/ai/daily-advice', { method: 'POST' });
    if (data.advice) {
      document.getElementById('piaBubble').textContent = data.advice;
      if (data.pia_mood) {
        document.getElementById('piaIcon').src = getPiaImage(data.pia_mood);
      }
    }
  } catch (_) {}
}

// ==============================
// プロジェクト進捗（タブ切替対応）
// ==============================
function renderProjectProgress(projects) {
  const el = document.getElementById('projectProgress');
  if (!projects || !projects.length) {
    el.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-sub);font-size:13px;">
      <a href="/projects" style="color:var(--primary-dark);">プロジェクトを作成する →</a>
    </div>`;
    return;
  }

  const typeValue = currentType === 'study' ? 'study' : 'project';
  const filtered = projects.filter(p => p.type === typeValue && p.status === currentStatus);

  if (!filtered.length) {
    const statusLabel = { planning: '計画中', active: '進行中', paused: '休止', done: '完了' }[currentStatus] || currentStatus;
    const typeLabel = currentType === 'study' ? 'まなぶ' : 'つくる';
    el.innerHTML = `<div style="text-align:center;padding:24px 0;color:var(--text-sub);font-size:13px;">
      ${typeLabel}の${statusLabel}プロジェクトはないよ
    </div>`;
    return;
  }

  el.innerHTML = filtered.map(p => renderCompactCard(p)).join('');
}

function renderCompactCard(p) {
  const total = p.total_tasks || 0;
  const done = p.done_tasks || 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const remaining = formatRelativeDate(p.goal_date);
  const color = p.color || '#7EC8B0';
  const typeIcon = p.type === 'study' ? '📖' : '🔨';

  let bottomLine = '';
  if (p.type === 'study') {
    const todayMin = p.study_today_minutes || 0;
    const goalMin = p.daily_minutes || 0;
    if (goalMin > 0) {
      bottomLine = `⏱ 今日: ${todayMin}分/${goalMin}分`;
    } else {
      bottomLine = `⏱ 今日: ${todayMin}分`;
    }
  } else {
    if (p.next_task) {
      const taskText = p.next_task.length > 20 ? p.next_task.slice(0, 20) + '...' : p.next_task;
      bottomLine = `📝 次: ${escHtml(taskText)}`;
    }
  }

  // total_goal_hours がある場合、進捗バーを時間ベースに差し替え
  let progressHtml = '';
  if (p.type === 'study' && p.total_goal_hours) {
    const totalHours = Math.round((p.study_today_minutes || 0) / 60); // dashboard doesn't have cumulative, so use task progress
    progressHtml = `
      <div class="progress-bar" style="margin-bottom:4px;">
        <div class="progress-bar-fill" style="width:${pct}%"></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--text-sub);">
        <span>${done}/${total} (${pct}%)</span>
        ${remaining ? `<span>🎯 ${remaining}</span>` : ''}
      </div>
    `;
  } else {
    progressHtml = `
      <div class="progress-bar" style="margin-bottom:4px;">
        <div class="progress-bar-fill" style="width:${pct}%"></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--text-sub);">
        <span>${done}/${total} (${pct}%)</span>
        ${remaining ? `<span>🎯 ${remaining}</span>` : ''}
      </div>
    `;
  }

  return `
    <div class="mini-card" style="border-left-color:${escHtml(color)};cursor:pointer;" onclick="location.href='/project-detail?id=${p.id}'">
      <div class="mini-card-title">${typeIcon} ${escHtml(p.name)}</div>
      ${progressHtml}
      ${bottomLine ? `<div style="font-size:11px;color:var(--primary-dark);margin-top:4px;">${bottomLine}</div>` : ''}
    </div>
  `;
}

// ==============================
// 今日のタスク
// ==============================
function renderTodayTasks(tasks, today) {
  const el = document.getElementById('todayTasks');
  const count = document.getElementById('todayTaskCount');

  if (!tasks || !tasks.length) {
    count.textContent = '';
    el.innerHTML = `<div class="empty-state" style="padding:20px;">
      <img src="${getPiaImage('cheer')}" alt="ピアちゃん" class="pia-icon-lg" onerror="this.src='/icon-pia.png'">
      <p>今日やることはないよ〜<br>のんびりしよう！</p>
    </div>`;
    return;
  }

  count.textContent = `${tasks.length}件`;
  el.innerHTML = tasks.map(t => {
    const overdue = t.due_end && t.due_end < today;
    const isToday = t.due_end === today;
    const nextStatus = t.status === 'open' ? 'doing' : 'done';
    const checkClass = t.status === 'doing' ? 'doing' : '';

    let itemStyle = '';
    if (overdue) {
      itemStyle = 'background:rgba(252,165,165,0.08);border-left:3px solid var(--accent-red);';
    } else if (isToday) {
      itemStyle = 'background:rgba(134,239,172,0.08);border-left:3px solid var(--accent-green);';
    }

    return `
      <div class="task-item" style="${itemStyle}border-radius:8px;padding:12px 8px;">
        <div class="task-check ${checkClass}" onclick="dashCycleStatus('${t.id}', '${nextStatus}')"></div>
        <div class="priority-dot ${t.priority || 'mid'}"></div>
        <div class="task-content" onclick="location.href='/project-detail?id=${t.project_id}'" style="cursor:pointer;">
          <div class="task-text">${escHtml(t.text)}</div>
          <div class="task-meta${overdue ? ' overdue' : ''}">
            <span style="color:${escHtml(t.project_color || '#7EC8B0')};">●</span>
            <span>${escHtml(t.project_name)}</span>
            ${t.due_end ? `<span>📅 ${formatDate(t.due_end)}${overdue ? ' 超過' : ''}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function dashCycleStatus(taskId, newStatus) {
  try {
    await apiFetch(`/api/tasks/${taskId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus }),
    });
    if (newStatus === 'done') showToast('✅ 完了！');
    loadDashboard();
  } catch (e) {
    showToast(`エラー: ${e.message}`);
  }
}

// ==============================
// ダイジェスト
// ==============================
async function loadDigest() {
  try {
    const data = await apiFetch('/api/digests');
    const digests = data.digests || [];
    if (digests.length) {
      renderDigestCard(digests[0]);
    }
  } catch (_) {}
}

function renderDigestCard(digest) {
  const el = document.getElementById('digestCard');
  if (!el) return;

  let velocityData = {};
  try {
    const parsed = JSON.parse(digest.velocity_data || '{}');
    velocityData = Array.isArray(parsed) ? {} : parsed;
  } catch (_) {
    velocityData = {};
  }

  const completed = digest.tasks_completed || 0;
  const added = digest.tasks_added || 0;
  const active = digest.projects_active || 0;
  const prevCompleted = velocityData.prev_completed || 0;
  const prevAdded = velocityData.prev_added || 0;

  function diffIcon(current, prev) {
    const diff = current - prev;
    if (diff > 0) return `<span class="digest-stat-diff up" style="display:inline;">↑${diff}</span>`;
    if (diff < 0) return `<span class="digest-stat-diff down" style="display:inline;">↓${Math.abs(diff)}</span>`;
    return '';
  }

  const comment = digest.pia_comment || '';
  const truncated = comment.length > 80 ? comment.slice(0, 80) + '...' : comment;

  el.innerHTML = `
    <div class="card section" style="cursor:pointer;" onclick="location.href='/digest-detail'">
      <div style="font-size:14px;font-weight:700;margin-bottom:8px;">先週のダイジェスト</div>
      ${comment ? `
        <div class="pia-comment" style="margin-bottom:10px;">
          <img src="${getPiaImage('happy')}" alt="ピアちゃん" class="pia-icon-sm" onerror="this.src='/icon-pia.png'" style="width:36px;height:36px;">
          <div class="pia-bubble" style="font-size:12px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${escHtml(truncated)}</div>
        </div>
      ` : ''}
      <div class="digest-stats" style="margin-bottom:8px;">
        <div class="digest-stat-box" style="padding:10px;">
          <div class="digest-stat-value" style="font-size:18px;">${completed}</div>
          <div class="digest-stat-label">完了 ${diffIcon(completed, prevCompleted)}</div>
        </div>
        <div class="digest-stat-box" style="padding:10px;">
          <div class="digest-stat-value" style="font-size:18px;">${added}</div>
          <div class="digest-stat-label">追加 ${diffIcon(added, prevAdded)}</div>
        </div>
        <div class="digest-stat-box" style="padding:10px;">
          <div class="digest-stat-value" style="font-size:18px;">${active}</div>
          <div class="digest-stat-label">稼働PJ</div>
        </div>
      </div>
      <div style="text-align:right;font-size:12px;color:var(--primary-dark);font-weight:600;">詳細を見る →</div>
    </div>
  `;
  el.style.display = '';
}
