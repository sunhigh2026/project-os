// ==============================
// 状態
// ==============================
let project = null;
let tasks = [];
let editPriority = 'mid';
let suggestedTasks = [];

// ==============================
// 初期化
// ==============================
document.addEventListener('DOMContentLoaded', () => {
  const id = new URLSearchParams(location.search).get('id');
  if (!id) { location.href = '/projects'; return; }
  loadProject(id);
});

// ==============================
// プロジェクト読み込み
// ==============================
async function loadProject(id) {
  try {
    const [projData, taskData] = await Promise.all([
      apiFetch(`/api/projects`),
      apiFetch(`/api/projects/${id}/tasks`),
    ]);
    project = projData.projects.find(p => p.id === id);
    if (!project) { showToast('プロジェクトが見つかりません'); return; }
    tasks = taskData.tasks;
    renderProject();
    renderTasks();

    // GitHub連携チェック
    if (project.github_repo) {
      document.getElementById('githubCheckBtn').style.display = '';
      loadGithub();
    }

    // AI提案自動起動
    if (new URLSearchParams(location.search).get('suggest') === '1') {
      history.replaceState(null, '', `/project-detail?id=${id}`);
      suggestTasks();
    }
  } catch (e) {
    showToast(`エラー: ${e.message}`);
  }
}

// ==============================
// レンダリング
// ==============================
function renderProject() {
  document.getElementById('projectName').textContent = project.name;
  document.getElementById('projectTypeIcon').textContent = project.type === 'study' ? '📖' : '🔨';
  document.title = `${project.name} - Project OS`;

  if (project.description) {
    const desc = document.getElementById('projectDesc');
    desc.textContent = project.description;
    desc.style.display = '';
  }

  const total = tasks.length;
  const done = tasks.filter(t => t.status === 'done').length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('progressFill').style.width = `${pct}%`;

  const meta = [];
  meta.push(`${done}/${total} タスク (${pct}%)`);
  if (project.goal_date) {
    meta.push(`🎯 ${formatDate(project.goal_date)} (${formatRelativeDate(project.goal_date)})`);
  }
  if (project.daily_minutes) {
    meta.push(`⏱ ${project.daily_minutes}分/日`);
  }
  document.getElementById('projectMeta').innerHTML = meta.map(m => `<span>${m}</span>`).join('');
}

function renderTasks() {
  const open = tasks.filter(t => t.status === 'open');
  const doing = tasks.filter(t => t.status === 'doing');
  const done = tasks.filter(t => t.status === 'done');

  document.getElementById('openCount').textContent = open.length ? `${open.length}件` : '';
  document.getElementById('doingCount').textContent = doing.length ? `${doing.length}件` : '';
  document.getElementById('doneCount').textContent = done.length ? `${done.length}件` : '';

  document.getElementById('openTasks').innerHTML = renderTaskGroup(open, 'open');
  document.getElementById('doingTasks').innerHTML = renderTaskGroup(doing, 'doing');
  document.getElementById('doneTasks').innerHTML = renderTaskGroup(done, 'done');
}

function renderTaskGroup(taskList, groupStatus) {
  if (!taskList.length) {
    if (groupStatus === 'open') {
      return `<div style="padding:12px 0;font-size:13px;color:var(--text-sub);">タスクはありません</div>`;
    }
    return '';
  }

  const today = todayJST();
  return taskList.map(t => {
    const overdue = t.due_end && t.due_end < today && t.status !== 'done';
    const nextStatus = t.status === 'open' ? 'doing' : t.status === 'doing' ? 'done' : 'open';
    const checkClass = t.status === 'doing' ? 'doing' : t.status === 'done' ? 'done' : '';
    const textClass = t.status === 'done' ? 'done' : '';

    let metaHtml = '';
    const metaParts = [];
    if (t.phase) metaParts.push(`<span class="phase-label">${escHtml(t.phase)}</span>`);
    if (t.is_milestone) metaParts.push(`<span class="milestone-badge">◆ マイルストーン</span>`);
    if (t.due_end) {
      const dateStr = t.due_start ? `${formatDate(t.due_start)}〜${formatDate(t.due_end)}` : formatDate(t.due_end);
      metaParts.push(`<span>📅 ${dateStr}</span>`);
    }
    if (t.score != null) metaParts.push(`<span>📊 ${t.score}点</span>`);
    if (overdue) metaParts.push(`<span style="color:var(--accent-red);">期限超過</span>`);
    if (metaParts.length) metaHtml = `<div class="task-meta${overdue ? ' overdue' : ''}">${metaParts.join('')}</div>`;

    return `
      <div class="task-item" ${overdue ? 'style="background:rgba(252,165,165,0.08);"' : ''}>
        <div class="task-check ${checkClass}" onclick="cycleStatus('${t.id}', '${nextStatus}')"></div>
        <div class="priority-dot ${t.priority || 'mid'}"></div>
        <div class="task-content" onclick="openEditTask('${t.id}')">
          <div class="task-text ${textClass}">${escHtml(t.text)}</div>
          ${metaHtml}
        </div>
      </div>
    `;
  }).join('');
}

// ==============================
// ステータス変更
// ==============================
async function cycleStatus(taskId, newStatus) {
  try {
    await apiFetch(`/api/tasks/${taskId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus }),
    });
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      task.status = newStatus;
      if (newStatus === 'done') task.done_at = new Date().toISOString();
    }
    renderProject();
    renderTasks();
    if (newStatus === 'done') showToast('✅ 完了！');
  } catch (e) {
    showToast(`エラー: ${e.message}`);
  }
}

// ==============================
// クイック追加
// ==============================
async function quickAddTask() {
  const input = document.getElementById('quickAddInput');
  const text = input.value.trim();
  if (!text) return;

  try {
    const data = await apiFetch(`/api/projects/${project.id}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
    tasks.push({ ...data, priority: 'mid', project_id: project.id, created_at: new Date().toISOString(), sort_order: tasks.length });
    input.value = '';
    renderProject();
    renderTasks();
    showToast('📋 タスクを追加しました');
  } catch (e) {
    showToast(`エラー: ${e.message}`);
  }
}

// ==============================
// タスク編集
// ==============================
function openEditTask(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  document.getElementById('editTaskId').value = task.id;
  document.getElementById('editTaskText').value = task.text;
  document.getElementById('editTaskPhase').value = task.phase || '';
  document.getElementById('editTaskDueStart').value = task.due_start || '';
  document.getElementById('editTaskDueEnd').value = task.due_end || '';

  // スコア（studyタイプのみ）
  if (project.type === 'study') {
    document.getElementById('editScoreGroup').style.display = '';
    document.getElementById('editTaskScore').value = task.score || '';
  }

  selectEditPriority(task.priority || 'mid');
  openModal('editTaskModal');
}

function selectEditPriority(p) {
  editPriority = p;
  document.querySelectorAll('.edit-priority').forEach(btn => {
    btn.classList.toggle('btn-primary', btn.dataset.p === p);
    btn.classList.toggle('btn-ghost', btn.dataset.p !== p);
  });
}

async function saveTask() {
  const id = document.getElementById('editTaskId').value;
  const body = {
    text: document.getElementById('editTaskText').value.trim(),
    priority: editPriority,
    phase: document.getElementById('editTaskPhase').value.trim() || null,
    due_start: document.getElementById('editTaskDueStart').value || null,
    due_end: document.getElementById('editTaskDueEnd').value || null,
  };

  if (project.type === 'study') {
    const score = document.getElementById('editTaskScore').value;
    body.score = score ? parseInt(score) : null;
  }

  try {
    await apiFetch(`/api/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    const task = tasks.find(t => t.id === id);
    if (task) Object.assign(task, body);
    closeModal('editTaskModal');
    renderTasks();
    showToast('✅ 更新しました');
  } catch (e) {
    showToast(`エラー: ${e.message}`);
  }
}

async function deleteTask() {
  const id = document.getElementById('editTaskId').value;
  if (!confirm('このタスクを削除しますか？')) return;

  try {
    await apiFetch(`/api/tasks/${id}`, { method: 'DELETE' });
    tasks = tasks.filter(t => t.id !== id);
    closeModal('editTaskModal');
    renderProject();
    renderTasks();
    showToast('🗑 削除しました');
  } catch (e) {
    showToast(`エラー: ${e.message}`);
  }
}

// ==============================
// プロジェクト編集
// ==============================
function openEditProject() {
  document.getElementById('editProjectName').value = project.name;
  document.getElementById('editProjectDesc').value = project.description || '';
  document.getElementById('editProjectGoalDate').value = project.goal_date || '';
  document.getElementById('editProjectGithub').value = project.github_repo || '';
  document.getElementById('editProjectStatus').value = project.status;
  openModal('editProjectModal');
}

async function saveProject() {
  const body = {
    name: document.getElementById('editProjectName').value.trim(),
    description: document.getElementById('editProjectDesc').value.trim() || null,
    goal_date: document.getElementById('editProjectGoalDate').value || null,
    github_repo: document.getElementById('editProjectGithub').value.trim() || null,
    status: document.getElementById('editProjectStatus').value,
  };

  try {
    await apiFetch(`/api/projects/${project.id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    Object.assign(project, body);
    closeModal('editProjectModal');
    renderProject();
    showToast('✅ 更新しました');
  } catch (e) {
    showToast(`エラー: ${e.message}`);
  }
}

async function deleteProject() {
  if (!confirm('このプロジェクトを削除しますか？配下のタスクもすべて削除されます。')) return;

  try {
    await apiFetch(`/api/projects/${project.id}`, { method: 'DELETE' });
    showToast('🗑 削除しました');
    location.href = '/projects';
  } catch (e) {
    showToast(`エラー: ${e.message}`);
  }
}

// ==============================
// AI: タスク提案
// ==============================
async function suggestTasks() {
  showToast('🐷 ピアちゃんが考え中...');
  try {
    const data = await apiFetch('/api/ai/suggest-tasks', {
      method: 'POST',
      body: JSON.stringify({ project_id: project.id }),
    });
    suggestedTasks = data.tasks || [];
    document.getElementById('suggestComment').textContent = data.pia_comment || 'こんな感じでどうかな〜？';

    document.getElementById('suggestList').innerHTML = suggestedTasks.map((t, i) => `
      <div class="check-list-item">
        <input type="checkbox" id="suggest_${i}" checked>
        <div>
          <div style="font-size:14px;">${escHtml(t.text)}</div>
          <div style="font-size:11px;color:var(--text-sub);">
            ${t.phase ? `${escHtml(t.phase)} · ` : ''}${t.duration_days ? `${t.duration_days}日` : ''}${t.priority ? ` · ${t.priority}` : ''}
          </div>
        </div>
      </div>
    `).join('');

    openModal('suggestModal');
  } catch (e) {
    showToast(`エラー: ${e.message}`);
  }
}

async function addSuggestedTasks() {
  const selected = suggestedTasks.filter((_, i) => document.getElementById(`suggest_${i}`)?.checked);
  if (!selected.length) { showToast('タスクを選択してください'); return; }

  try {
    await apiFetch(`/api/projects/${project.id}/tasks/bulk`, {
      method: 'POST',
      body: JSON.stringify({ tasks: selected }),
    });
    closeModal('suggestModal');
    showToast(`✨ ${selected.length}件のタスクを追加しました`);
    loadProject(project.id);
  } catch (e) {
    showToast(`エラー: ${e.message}`);
  }
}

// ==============================
// AI: スケジュール逆算
// ==============================
async function scheduleProject() {
  if (!project.goal_date) {
    showToast('目標日を設定してからスケジュールを組んでね');
    return;
  }
  showToast('📅 スケジュールを計算中...');
  try {
    const data = await apiFetch('/api/ai/schedule', {
      method: 'POST',
      body: JSON.stringify({ project_id: project.id }),
    });

    if (data.schedule && data.schedule.length) {
      // バッチ更新
      for (const s of data.schedule) {
        await apiFetch(`/api/tasks/${s.task_id}`, {
          method: 'PUT',
          body: JSON.stringify({ due_start: s.due_start, due_end: s.due_end, duration_days: s.duration_days }),
        });
      }
      showToast('📅 スケジュールを設定しました！');
      loadProject(project.id);
    }

    document.getElementById('aiResultTitle').textContent = '📅 スケジュール';
    document.getElementById('aiResultContent').textContent = data.pia_comment || 'スケジュールを組んだよ〜！';
    document.getElementById('aiResultExtra').innerHTML = '';
    openModal('aiResultModal');
  } catch (e) {
    showToast(`エラー: ${e.message}`);
  }
}

// ==============================
// AI: タスク分解
// ==============================
function openSubdivideSelect() {
  const openTasks = tasks.filter(t => t.status !== 'done');
  if (!openTasks.length) { showToast('分解できるタスクがありません'); return; }

  document.getElementById('subdivideTaskList').innerHTML = openTasks.map(t => `
    <div class="task-item" style="cursor:pointer;" onclick="subdivideTask('${t.id}')">
      <div class="priority-dot ${t.priority || 'mid'}"></div>
      <div class="task-content">
        <div class="task-text">${escHtml(t.text)}</div>
      </div>
    </div>
  `).join('');

  openModal('subdivideSelectModal');
}

async function subdivideTask(taskId) {
  closeModal('subdivideSelectModal');
  showToast('✂️ タスクを分解中...');

  try {
    const data = await apiFetch('/api/ai/subdivide', {
      method: 'POST',
      body: JSON.stringify({ task_id: taskId }),
    });

    const subtasks = data.subtasks || [];
    if (!subtasks.length) { showToast('分解結果が空でした'); return; }

    const task = tasks.find(t => t.id === taskId);

    // 元タスクを削除して差し替え
    await apiFetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    await apiFetch(`/api/projects/${project.id}/tasks/bulk`, {
      method: 'POST',
      body: JSON.stringify({ tasks: subtasks.map(s => ({ text: s.text, phase: task?.phase || null })) }),
    });

    showToast(`✂️ ${subtasks.length}個のサブタスクに分解しました`);

    document.getElementById('aiResultTitle').textContent = '✂️ タスク分解';
    document.getElementById('aiResultContent').textContent = data.pia_comment || '分解したよ〜！';
    document.getElementById('aiResultExtra').innerHTML = '';
    openModal('aiResultModal');

    loadProject(project.id);
  } catch (e) {
    showToast(`エラー: ${e.message}`);
  }
}

// ==============================
// AI: ふりかえり
// ==============================
async function reviewProject() {
  showToast('📝 ふりかえり中...');
  try {
    const data = await apiFetch('/api/ai/review', {
      method: 'POST',
      body: JSON.stringify({ project_id: project.id }),
    });

    document.getElementById('aiResultTitle').textContent = '📝 ふりかえり';
    document.getElementById('aiResultContent').innerHTML = (data.review || 'レビューを取得できませんでした').replace(/\n/g, '<br>');
    document.getElementById('aiResultExtra').innerHTML = '';
    openModal('aiResultModal');
  } catch (e) {
    showToast(`エラー: ${e.message}`);
  }
}

// ==============================
// AI: GitHub照合
// ==============================
async function githubCheck() {
  showToast('🔗 GitHub照合中...');
  try {
    const data = await apiFetch('/api/ai/github-check', {
      method: 'POST',
      body: JSON.stringify({ project_id: project.id }),
    });

    const suggestions = data.suggestions || [];
    document.getElementById('aiResultTitle').textContent = '🔗 GitHub照合結果';
    document.getElementById('aiResultContent').textContent = data.pia_comment || '';

    if (suggestions.length) {
      document.getElementById('aiResultExtra').innerHTML = suggestions.map(s => `
        <div class="task-item">
          <div class="task-content">
            <div class="task-text">${escHtml(tasks.find(t => t.id === s.task_id)?.text || s.task_id)}</div>
            <div class="task-meta">${escHtml(s.reason)}</div>
          </div>
          <button class="btn btn-sm btn-primary" onclick="applyGithubSuggestion('${s.task_id}', '${s.suggest_status}', this)">
            ${s.suggest_status === 'done' ? '✅ 完了にする' : '承認'}
          </button>
        </div>
      `).join('');
    } else {
      document.getElementById('aiResultExtra').innerHTML = '<p style="color:var(--text-sub);font-size:13px;">変更提案はありません</p>';
    }

    openModal('aiResultModal');
  } catch (e) {
    showToast(`エラー: ${e.message}`);
  }
}

async function applyGithubSuggestion(taskId, status, btn) {
  try {
    await apiFetch(`/api/tasks/${taskId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    btn.disabled = true;
    btn.textContent = '適用済み';
    const task = tasks.find(t => t.id === taskId);
    if (task) task.status = status;
    renderProject();
    renderTasks();
  } catch (e) {
    showToast(`エラー: ${e.message}`);
  }
}

// ==============================
// GitHub表示
// ==============================
async function loadGithub() {
  try {
    const data = await apiFetch(`/api/github/${project.id}/commits`);
    if (!data.commits || !data.commits.length) return;

    document.getElementById('githubSection').style.display = '';
    const commits = data.commits.slice(0, 5);
    document.getElementById('githubContent').innerHTML = commits.map(c => `
      <div class="commit-item">
        <span style="color:var(--text-sub);">📦</span>
        <div style="flex:1;">
          <div>${escHtml(c.message?.split('\n')[0] || '')}</div>
          <div style="font-size:11px;color:var(--text-sub);">${c.date ? formatDate(c.date.slice(0, 10)) : ''}</div>
        </div>
      </div>
    `).join('');
  } catch (_) {}
}
