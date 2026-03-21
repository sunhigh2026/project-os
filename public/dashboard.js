// ==============================
// 初期化
// ==============================
document.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
});

// ==============================
// ダッシュボード読み込み
// ==============================
async function loadDashboard() {
  try {
    const data = await apiFetch('/api/dashboard');
    renderPiaAdvice(data);
    renderTodayTasks(data.todayTasks, data.today);
    renderProjectProgress(data.projects);
    // AIアドバイス取得（バックグラウンド）
    loadAiAdvice();
  } catch (e) {
    console.error('Dashboard error:', e);
    document.getElementById('piaBubble').textContent = 'データの読み込みに失敗したよ〜';
  }
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
  } catch (_) {
    // AI失敗時は静的メッセージを維持
  }
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
    const nextStatus = t.status === 'open' ? 'doing' : 'done';
    const checkClass = t.status === 'doing' ? 'doing' : '';

    return `
      <div class="task-item" ${overdue ? 'style="background:rgba(252,165,165,0.08);border-radius:8px;padding:12px 8px;"' : ''}>
        <div class="task-check ${checkClass}" onclick="dashCycleStatus('${t.id}', '${nextStatus}')"></div>
        <div class="priority-dot ${t.priority || 'mid'}"></div>
        <div class="task-content" onclick="location.href='/project-detail.html?id=${t.project_id}'" style="cursor:pointer;">
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
// プロジェクト進捗
// ==============================
function renderProjectProgress(projects) {
  const el = document.getElementById('projectProgress');

  if (!projects || !projects.length) {
    el.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-sub);font-size:13px;">
      <a href="/projects.html" style="color:var(--primary-dark);">プロジェクトを作成する →</a>
    </div>`;
    return;
  }

  el.innerHTML = projects.map(p => {
    const total = p.total_tasks || 0;
    const done = p.done_tasks || 0;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const remaining = formatRelativeDate(p.goal_date);
    const color = p.color || '#7EC8B0';
    const typeIcon = p.type === 'study' ? '📖' : '🔨';

    return `
      <div class="mini-card" style="border-left-color:${escHtml(color)};cursor:pointer;" onclick="location.href='/project-detail.html?id=${p.id}'">
        <div class="mini-card-title">${typeIcon} ${escHtml(p.name)}</div>
        <div class="progress-bar" style="margin-bottom:4px;">
          <div class="progress-bar-fill" style="width:${pct}%"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-sub);">
          <span>${done}/${total} (${pct}%)</span>
          ${remaining ? `<span>🎯 ${remaining}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}
