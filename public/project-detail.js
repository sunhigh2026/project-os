// ==============================
// 状態
// ==============================
let project = null;
let tasks = [];
let editPriority = 'mid';
let suggestedTasks = [];
let notes = [];
let currentNoteFilter = 'all';
let currentTaskFilter = 'all'; // all / open / review / done
let editTags = [];
const PRESET_TAGS = ["Androidアプリ", "Webアプリ", "Chrome拡張", "iOSアプリ", "ゲーム", "ツール", "ライブラリ", "資格勉強", "語学学習", "読書", "ブログ"];

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

    // 学習時間セクション + ストップウォッチ
    if (project.type === 'study') {
      document.getElementById('stopwatchSection').style.display = '';
      document.getElementById('studyTimeSection').style.display = '';
      initStopwatch();
      loadStudyStats();
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

  // Render tags
  const tags = parseTags(project.tags);
  const tagsEl = document.getElementById('projectTags');
  if (tags.length) {
    tagsEl.style.display = '';
    tagsEl.innerHTML = tags.map(t => `<span class="tag-badge">${escHtml(t)}</span>`).join('');
  } else {
    tagsEl.style.display = 'none';
  }

  // Render status badge
  const statusLabels = { planning: '計画中', active: '進行中', paused: '休止', done: '完了' };
  document.getElementById('projectStatusBadge').innerHTML =
    `<button class="status-badge ${project.status}" onclick="quickChangeStatus()">${statusLabels[project.status] || project.status}</button>`;

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
  if (project.github_repo) {
    meta.push(`<a href="https://github.com/${escHtml(project.github_repo)}" target="_blank" rel="noopener" style="color:var(--primary-dark);text-decoration:none;">🐙 ${escHtml(project.github_repo)}</a>`);
  }
  document.getElementById('projectMeta').innerHTML = meta.map(m => `<span>${m}</span>`).join('');
}

async function quickChangeStatus() {
  const order = ['planning', 'active', 'paused', 'done'];
  const labels = { planning: '計画中', active: '進行中', paused: '休止', done: '完了' };
  const idx = order.indexOf(project.status);
  const next = order[(idx + 1) % order.length];

  if (!confirm(`ステータスを「${labels[next]}」に変更しますか？`)) return;

  const wasActive = project.status !== 'done';
  try {
    await apiFetch(`/api/projects/${project.id}`, {
      method: 'PUT',
      body: JSON.stringify({ status: next }),
    });
    project.status = next;
    renderProject();
    if (next === 'done' && wasActive) {
      openModal('reviewConfirmModal');
    } else {
      showToast(`✅ ステータスを「${labels[next]}」に変更しました`);
    }
  } catch (e) {
    showToast(`エラー: ${e.message}`);
  }
}

function renderTasks() {
  let filtered = tasks;
  if (currentTaskFilter === 'open') {
    filtered = tasks.filter(t => t.status !== 'done');
  } else if (currentTaskFilter === 'review') {
    filtered = tasks.filter(t => t.review_flag);
  } else if (currentTaskFilter === 'done') {
    filtered = tasks.filter(t => t.status === 'done');
  }

  const open = filtered.filter(t => t.status === 'open');
  const doing = filtered.filter(t => t.status === 'doing');
  const done = filtered.filter(t => t.status === 'done');

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
    if (t.review_flag) metaParts.push(`<span style="color:#E8A0BF;">🔄 要復習</span>`);
    if (metaParts.length) metaHtml = `<div class="task-meta${overdue ? ' overdue' : ''}">${metaParts.join('')}</div>`;

    let memoHtml = '';
    if (t.memo) {
      const short = t.memo.length > 40 ? t.memo.slice(0, 40) + '...' : t.memo;
      memoHtml = `<div style="font-size:11px;color:var(--text-sub);margin-top:2px;">💬 ${linkify(escHtml(short))}</div>`;
    }

    // 復習フラグボタン（完了タスクのみ）
    const reviewBtn = t.status === 'done'
      ? `<div class="review-toggle ${t.review_flag ? 'active' : ''}" onclick="event.stopPropagation();toggleReview('${t.id}')" title="${t.review_flag ? '復習済み' : '要復習にする'}">🔄</div>`
      : '';

    return `
      <div class="task-item" ${overdue ? 'style="background:rgba(252,165,165,0.08);"' : ''}>
        <div class="task-check ${checkClass}" onclick="cycleStatus('${t.id}', '${nextStatus}')"></div>
        <div class="priority-dot ${t.priority || 'mid'}"></div>
        <div class="task-content" onclick="openEditTask('${t.id}')">
          <div class="task-text ${textClass}">${escHtml(t.text)}</div>
          ${metaHtml}
          ${memoHtml}
        </div>
        ${reviewBtn}
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
// 復習フラグ切替
// ==============================
async function toggleReview(taskId) {
  try {
    const data = await apiFetch(`/api/tasks/${taskId}/review`, { method: 'PATCH' });
    const task = tasks.find(t => t.id === taskId);
    if (task) task.review_flag = data.review_flag;
    renderTasks();
    showToast(data.review_flag ? '🔄 要復習に設定' : '復習フラグを解除');
  } catch (e) {
    showToast(`エラー: ${e.message}`);
  }
}

// ==============================
// タスクフィルタ
// ==============================
function filterTasks(filter, btn) {
  currentTaskFilter = filter;
  document.querySelectorAll('.task-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderTasks();
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
  document.getElementById('editTaskMemo').value = task.memo || '';

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
    memo: document.getElementById('editTaskMemo').value.trim() || null,
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
// タグ関連
// ==============================
function parseTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags;
  try { return JSON.parse(tags); } catch { return []; }
}

function renderEditTags() {
  const container = document.getElementById('editTagContainer');
  const input = document.getElementById('editTagInput');
  const badges = container.querySelectorAll('.tag-badge');
  badges.forEach(b => b.remove());
  editTags.forEach((tag, i) => {
    const badge = document.createElement('span');
    badge.className = 'tag-badge';
    badge.innerHTML = `${escHtml(tag)}<span class="remove-tag" onclick="removeEditTag(${i}, event)">&times;</span>`;
    container.insertBefore(badge, input);
  });
}

function addEditTag(tag) {
  tag = tag.trim();
  if (!tag || editTags.includes(tag)) return;
  editTags.push(tag);
  renderEditTags();
  document.getElementById('editTagInput').value = '';
  hideEditTagSuggestions();
}

function removeEditTag(index, event) {
  event.stopPropagation();
  editTags.splice(index, 1);
  renderEditTags();
}

function handleEditTagKeydown(event) {
  const input = document.getElementById('editTagInput');
  if ((event.key === 'Enter' || event.key === ',') && input.value.trim()) {
    event.preventDefault();
    addEditTag(input.value.replace(',', ''));
  }
  if (event.key === 'Backspace' && !input.value && editTags.length) {
    editTags.pop();
    renderEditTags();
  }
}

function showEditTagSuggestions() {
  const input = document.getElementById('editTagInput');
  const sugEl = document.getElementById('editTagSuggestions');
  const val = input.value.trim().toLowerCase();
  const filtered = PRESET_TAGS.filter(t => !editTags.includes(t) && (!val || t.toLowerCase().includes(val)));
  if (!filtered.length) { sugEl.style.display = 'none'; return; }
  sugEl.style.display = '';
  sugEl.innerHTML = filtered.map(t => `<div onclick="addEditTag('${escHtml(t)}')">${escHtml(t)}</div>`).join('');
}

function hideEditTagSuggestions() {
  document.getElementById('editTagSuggestions').style.display = 'none';
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#editTagContainer') && !e.target.closest('#editTagSuggestions')) hideEditTagSuggestions();
});

// ==============================
// プロジェクト編集
// ==============================
function openEditProject() {
  document.getElementById('editProjectName').value = project.name;
  document.getElementById('editProjectDesc').value = project.description || '';
  document.getElementById('editProjectGoalDate').value = project.goal_date || '';
  document.getElementById('editProjectGithub').value = project.github_repo || '';
  document.getElementById('editProjectStatus').value = project.status;
  editTags = parseTags(project.tags).slice();
  renderEditTags();

  // 目標総学習時間（studyタイプのみ表示）
  const goalHoursGroup = document.getElementById('editGoalHoursGroup');
  if (project.type === 'study') {
    goalHoursGroup.style.display = '';
    document.getElementById('editTotalGoalHours').value = project.total_goal_hours || '';
  } else {
    goalHoursGroup.style.display = 'none';
  }

  openModal('editProjectModal');
}

async function saveProject() {
  const newStatus = document.getElementById('editProjectStatus').value;
  const wasActive = project.status !== 'done';

  const body = {
    name: document.getElementById('editProjectName').value.trim(),
    description: document.getElementById('editProjectDesc').value.trim() || null,
    goal_date: document.getElementById('editProjectGoalDate').value || null,
    github_repo: document.getElementById('editProjectGithub').value.trim() || null,
    status: newStatus,
    tags: editTags.length ? editTags : null,
  };

  if (project.type === 'study') {
    const goalHours = parseFloat(document.getElementById('editTotalGoalHours').value);
    body.total_goal_hours = goalHours > 0 ? goalHours : null;
  }

  try {
    await apiFetch(`/api/projects/${project.id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    Object.assign(project, body);

    // After successful save, check if becoming done
    if (newStatus === 'done' && wasActive) {
      closeModal('editProjectModal');
      renderProject();
      openModal('reviewConfirmModal');
      return;
    }

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
// ==============================
// タブ切り替え
// ==============================
function switchTab(tab) {
  document.getElementById('tabTasks').classList.toggle('active', tab === 'tasks');
  document.getElementById('tabNotes').classList.toggle('active', tab === 'notes');
  document.getElementById('taskView').style.display = tab === 'tasks' ? '' : 'none';
  document.getElementById('noteView').style.display = tab === 'notes' ? '' : 'none';
  if (tab === 'notes' && !notes.length) loadNotes();
}

// ==============================
// ノート機能
// ==============================
async function loadNotes() {
  try {
    const data = await apiFetch(`/api/projects/${project.id}/notes`);
    notes = data.notes || [];
    renderNotes();
  } catch (e) { showToast(`エラー: ${e.message}`); }
}

function renderNotes() {
  const filtered = currentNoteFilter === 'all' ? notes : notes.filter(n => n.type === currentNoteFilter);
  const el = document.getElementById('noteList');

  if (!filtered.length) {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-sub);font-size:13px;">ノートはまだないよ〜</div>';
    return;
  }

  const typeIcons = { memo: '📝', idea: '💡', link: '🔗', spec: '📄' };

  el.innerHTML = filtered.map(n => {
    const icon = typeIcons[n.type] || '📝';
    const isLink = n.type === 'link' || n.type === 'spec';
    const contentHtml = isLink && n.content
      ? `<a href="${escHtml(n.content)}" target="_blank" rel="noopener" style="color:var(--primary-dark);font-size:12px;word-break:break-all;">${escHtml(n.content)}</a>`
      : n.content ? `<div style="font-size:12px;color:var(--text-sub);margin-top:2px;white-space:pre-wrap;">${linkify(escHtml(n.content))}</div>` : '';

    return `
      <div class="task-item" style="${n.type === 'spec' ? 'background:var(--primary-light);border-radius:8px;padding:10px;margin-bottom:4px;' : ''}">
        <div style="font-size:18px;">${icon}</div>
        <div class="task-content" style="cursor:pointer;" onclick="${isLink && n.content ? `window.open('${escHtml(n.content)}','_blank')` : ''}">
          <div class="task-text">${escHtml(n.title)}</div>
          ${contentHtml}
          <div class="task-meta"><span>${formatDate(n.created_at?.slice(0,10))}</span></div>
        </div>
        <button class="btn btn-sm btn-ghost" onclick="deleteNote('${n.id}')" title="削除">🗑</button>
      </div>
    `;
  }).join('');
}

function filterNotes(type, btn) {
  currentNoteFilter = type;
  document.querySelectorAll('#noteView .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderNotes();
}

function onNoteTypeChange() {
  const type = document.getElementById('noteType').value;
  const isLink = type === 'link' || type === 'spec';
  document.getElementById('noteContentGroup').style.display = isLink ? 'none' : '';
  document.getElementById('noteUrlGroup').style.display = isLink ? '' : 'none';
  document.getElementById('noteContentLabel').textContent = type === 'idea' ? 'アイデア内容' : '内容';
}

function openAddNote() {
  document.getElementById('noteType').value = 'memo';
  document.getElementById('noteTitle').value = '';
  document.getElementById('noteContent').value = '';
  document.getElementById('noteUrl').value = '';
  onNoteTypeChange();
  openModal('addNoteModal');
}

async function saveNote() {
  const type = document.getElementById('noteType').value;
  const title = document.getElementById('noteTitle').value.trim();
  if (!title) { showToast('タイトルを入力してください'); return; }

  const isLink = type === 'link' || type === 'spec';
  const content = isLink ? document.getElementById('noteUrl').value.trim() : document.getElementById('noteContent').value.trim();

  try {
    await apiFetch(`/api/projects/${project.id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ type, title, content: content || null }),
    });
    closeModal('addNoteModal');
    showToast('📝 ノートを追加しました');
    loadNotes();
  } catch (e) { showToast(`エラー: ${e.message}`); }
}

async function deleteNote(noteId) {
  if (!confirm('このノートを削除しますか？')) return;
  try {
    await apiFetch(`/api/notes/${noteId}`, { method: 'DELETE' });
    notes = notes.filter(n => n.id !== noteId);
    renderNotes();
    showToast('🗑 削除しました');
  } catch (e) { showToast(`エラー: ${e.message}`); }
}

function linkify(text) {
  return text.replace(/(https?:\/\/[^\s]+|obsidian:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:var(--primary-dark);">$1</a>');
}

// ==============================
// ふりかえり生成
// ==============================
async function generateReview() {
  closeModal('reviewConfirmModal');
  showToast('📝 ふりかえりを生成中...');
  try {
    const data = await apiFetch(`/api/reviews/${project.id}/generate`, { method: 'POST' });

    document.getElementById('aiResultTitle').textContent = '🎉 ふりかえり';
    let html = `<div style="margin-bottom:12px;">${escHtml(data.summary || '')}</div>`;
    if (data.highlights?.length) {
      html += '<div style="margin-bottom:8px;"><strong>✨ よかったこと</strong></div>';
      html += data.highlights.map(h => `<div style="font-size:13px;padding:2px 0;">• ${escHtml(h)}</div>`).join('');
    }
    if (data.learnings?.length) {
      html += '<div style="margin:8px 0;"><strong>📚 学んだこと</strong></div>';
      html += data.learnings.map(l => `<div style="font-size:13px;padding:2px 0;">• ${escHtml(l)}</div>`).join('');
    }

    document.getElementById('aiResultContent').textContent = data.pia_comment || 'おつかれさま〜！';
    document.getElementById('aiResultExtra').innerHTML = html;
    openModal('aiResultModal');
  } catch (e) { showToast(`エラー: ${e.message}`); }
}

// ==============================
// まとめて追加
// ==============================
async function submitBulkAdd() {
  const textarea = document.getElementById('bulkAddText');
  const text = textarea.value.trim();
  if (!text) { showToast('テキストを入力してください'); return; }

  try {
    const data = await apiFetch(`/api/projects/${project.id}/tasks/bulk-text`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
    showToast(`📋 ${data.count}件のタスクを追加しました！`);
    textarea.value = '';
    closeModal('bulkAddModal');
    const taskData = await apiFetch(`/api/projects/${project.id}/tasks`);
    tasks = taskData.tasks;
    renderProject();
    renderTasks();
  } catch (e) {
    showToast(`エラー: ${e.message}`);
  }
}

function aiBulkGenerate() {
  const promptArea = document.getElementById('bulkAddAiPrompt');
  promptArea.style.display = promptArea.style.display === 'none' ? '' : 'none';
  document.getElementById('bulkAiInput').focus();
}

async function runAiBulkGenerate() {
  const prompt = document.getElementById('bulkAiInput').value.trim();
  if (!prompt) { showToast('プロンプトを入力してください'); return; }

  showToast('🐷 ピアちゃんが考え中...');
  try {
    const data = await apiFetch('/api/ai/bulk-suggest', {
      method: 'POST',
      body: JSON.stringify({
        project_name: project.name,
        project_type: project.type,
        prompt,
      }),
    });
    if (data.tasks_text) {
      document.getElementById('bulkAddText').value = data.tasks_text;
      document.getElementById('bulkAddAiPrompt').style.display = 'none';
      showToast('生成完了！内容を確認してから追加してね');
    }
  } catch (e) {
    showToast(`エラー: ${e.message}`);
  }
}

// ==============================
// ストップウォッチ
// ==============================
let stopwatchInterval = null;
let activeSession = null;

async function initStopwatch() {
  try {
    // タグ一覧を読み込み
    loadStudyTags();

    const data = await apiFetch('/api/study/active');
    if (data.session && data.session.project_id === project.id) {
      activeSession = data.session;
      startStopwatchDisplay();
    } else {
      activeSession = null;
      updateStopwatchIdle();
    }
  } catch (_) {
    updateStopwatchIdle();
  }
}

async function loadStudyTags() {
  try {
    const data = await apiFetch(`/api/study/${project.id}/tags`);
    const select = document.getElementById('stopwatchTagSelect');
    select.innerHTML = '<option value="">なし</option>' +
      (data.tags || []).map(t => `<option value="${escHtml(t)}">${escHtml(t)}</option>`).join('');
  } catch (_) {}
}

function promptNewTag() {
  const tag = prompt('新しいタグ名:');
  if (!tag || !tag.trim()) return;
  const select = document.getElementById('stopwatchTagSelect');
  const opt = document.createElement('option');
  opt.value = tag.trim();
  opt.textContent = tag.trim();
  select.appendChild(opt);
  select.value = tag.trim();
}

async function updateStopwatchIdle() {
  // 今日の学習時間を取得
  try {
    const data = await apiFetch(`/api/study/${project.id}/today`);
    const goalMin = project.daily_minutes || 0;
    const todayMin = data.minutes || 0;
    const summaryEl = document.getElementById('stopwatchTodaySummary');
    if (goalMin > 0) {
      summaryEl.textContent = `⏱ 今日の学習時間: ${todayMin}分 / 目標${goalMin}分`;
    } else {
      summaryEl.textContent = `⏱ 今日の学習時間: ${todayMin}分`;
    }
  } catch (_) {}

  document.getElementById('stopwatchTime').textContent = '⏱ 00:00:00';
  document.getElementById('stopwatchStatus').textContent = '';
  document.getElementById('stopwatchBtn').textContent = '▶ スタート';
  document.getElementById('stopwatchBtn').className = 'btn btn-primary';
}

function startStopwatchDisplay() {
  if (stopwatchInterval) clearInterval(stopwatchInterval);
  document.getElementById('stopwatchBtn').textContent = '⏹ ストップ';
  document.getElementById('stopwatchBtn').className = 'btn btn-danger';
  document.getElementById('stopwatchStatus').textContent = '計測中...';

  const updateDisplay = () => {
    if (!activeSession) return;
    const elapsed = Math.floor((Date.now() - new Date(activeSession.started_at).getTime()) / 1000);
    const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
    const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    document.getElementById('stopwatchTime').textContent = `⏱ ${h}:${m}:${s}`;
  };

  updateDisplay();
  stopwatchInterval = setInterval(updateDisplay, 1000);

  // 今日の合計も更新
  updateStopwatchTodaySummary();
}

async function updateStopwatchTodaySummary() {
  try {
    const data = await apiFetch(`/api/study/${project.id}/today`);
    const goalMin = project.daily_minutes || 0;
    const todayMin = data.minutes || 0;
    const summaryEl = document.getElementById('stopwatchTodaySummary');
    if (goalMin > 0) {
      summaryEl.textContent = `今日の合計: ${todayMin}分 / 目標${goalMin}分`;
    } else {
      summaryEl.textContent = `今日の合計: ${todayMin}分`;
    }
  } catch (_) {}
}

async function toggleStopwatch() {
  if (activeSession) {
    // 停止
    try {
      await apiFetch('/api/study/stop', {
        method: 'POST',
        body: JSON.stringify({ session_id: activeSession.id }),
      });
      if (stopwatchInterval) clearInterval(stopwatchInterval);
      stopwatchInterval = null;
      activeSession = null;
      showToast('⏹ 学習記録を保存しました');
      updateStopwatchIdle();
      loadStudyStats();
    } catch (e) {
      showToast(`エラー: ${e.message}`);
    }
  } else {
    // 開始
    try {
      const tag = document.getElementById('stopwatchTagSelect')?.value || null;
      const data = await apiFetch('/api/study/start', {
        method: 'POST',
        body: JSON.stringify({ project_id: project.id, tag }),
      });
      activeSession = data;
      showToast('▶ 学習開始！');
      startStopwatchDisplay();
    } catch (e) {
      showToast(`エラー: ${e.message}`);
    }
  }
}

// ==============================
// 学習時間
// ==============================
async function loadStudyStats() {
  try {
    const data = await apiFetch(`/api/projects/${project.id}/study-stats`);
    const el = document.getElementById('studyTimeContent');

    const fmtTime = (m) => m >= 60 ? `${Math.floor(m/60)}時間${m%60 ? m%60+'分' : ''}` : `${m}分`;
    const goalMin = project.daily_minutes || 60;
    const pct = Math.min(100, Math.round((data.today_minutes / goalMin) * 100));

    let html = '';

    // 逆算表示（total_goal_hoursが設定されている場合）
    if (data.pace) {
      const p = data.pace;
      const paceLabel = p.pace === 'on_track' ? '順調' : p.pace === 'behind' ? 'やや不足' : '危険';
      const paceColor = p.pace === 'on_track' ? 'var(--primary-dark)' : p.pace === 'behind' ? '#D97706' : 'var(--accent-red)';
      const paceIcon = p.pace === 'on_track' ? '✅' : '⚠️';
      const totalPct = Math.min(100, Math.round((p.total_hours / p.total_goal_hours) * 100));

      html += `
        <div style="margin-bottom:16px;padding:12px;background:var(--primary-light);border-radius:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-size:13px;font-weight:700;">累計: ${p.total_hours}h / 目標${p.total_goal_hours}h (${totalPct}%)</span>
            <span style="font-size:12px;font-weight:600;color:${paceColor};">${paceIcon} ${paceLabel}</span>
          </div>
          <div class="progress-bar" style="margin-bottom:8px;"><div class="progress-bar-fill" style="width:${totalPct}%"></div></div>
          <div style="font-size:11px;color:var(--text-sub);display:flex;justify-content:space-between;">
            <span>残り: ${p.remaining_hours}h → 1日${p.needed_daily_minutes}分必要</span>
            <span>現ペース: 1日${p.avg_daily_minutes}分</span>
          </div>
        </div>
      `;
    }

    html += `
      <div style="display:flex;justify-content:space-around;text-align:center;margin-bottom:16px;">
        <div>
          <div style="font-size:20px;font-weight:700;color:var(--primary-dark);">${fmtTime(data.today_minutes)}</div>
          <div style="font-size:11px;color:var(--text-sub);">今日</div>
        </div>
        <div>
          <div style="font-size:20px;font-weight:700;">${fmtTime(data.week_minutes)}</div>
          <div style="font-size:11px;color:var(--text-sub);">今週</div>
        </div>
        <div>
          <div style="font-size:20px;font-weight:700;">${fmtTime(data.total_minutes)}</div>
          <div style="font-size:11px;color:var(--text-sub);">累計</div>
        </div>
      </div>
    `;

    // Progress bar for today
    html += `
      <div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-sub);margin-bottom:4px;">
          <span>今日の達成率</span>
          <span>${data.today_minutes}分 / ${goalMin}分 (${pct}%)</span>
        </div>
        <div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
      </div>
    `;

    // Daily bar chart (last 14 days) with goal line
    if (data.daily?.length) {
      const maxMin = Math.max(...data.daily.map(d => d.minutes), goalMin);
      const chartHeight = 80;
      const goalLinePos = goalMin > 0 ? Math.round((goalMin / maxMin) * chartHeight) : 0;

      // 週間サマリー
      const weekDays = data.daily.filter(d => d.minutes > 0).length;
      const achievedDays = goalMin > 0 ? data.daily.filter(d => d.minutes >= goalMin).length : 0;
      const avgMin = Math.round(data.daily.reduce((s, d) => s + d.minutes, 0) / 14);

      html += `<div style="display:flex;justify-content:space-around;text-align:center;margin-bottom:12px;padding:8px;background:var(--primary-light);border-radius:8px;">
        <div><div style="font-size:16px;font-weight:700;">${weekDays}</div><div style="font-size:10px;color:var(--text-sub);">学習日</div></div>
        <div><div style="font-size:16px;font-weight:700;">${fmtTime(avgMin)}</div><div style="font-size:10px;color:var(--text-sub);">平均/日</div></div>
        ${goalMin > 0 ? `<div><div style="font-size:16px;font-weight:700;">${achievedDays}</div><div style="font-size:10px;color:var(--text-sub);">目標達成</div></div>` : ''}
      </div>`;

      html += '<div style="font-size:12px;font-weight:600;margin-bottom:8px;">📊 直近14日の学習時間</div>';
      html += `<div style="position:relative;display:flex;align-items:flex-end;gap:3px;height:${chartHeight}px;">`;

      // 目標ライン
      if (goalLinePos > 0 && goalLinePos < chartHeight) {
        html += `<div style="position:absolute;bottom:${goalLinePos}px;left:0;right:0;border-top:1.5px dashed var(--primary-dark);opacity:0.4;z-index:1;"></div>`;
      }

      for (const d of data.daily) {
        const h = maxMin > 0 ? Math.max(2, (d.minutes / maxMin) * (chartHeight - 10)) : 2;
        const isToday = d.date === todayJST();
        const metGoal = goalMin > 0 && d.minutes >= goalMin;
        const barColor = isToday ? 'var(--primary-dark)' : metGoal ? 'var(--primary)' : (d.minutes > 0 ? 'var(--border)' : 'var(--border)');
        html += `<div style="flex:1;display:flex;flex-direction:column;align-items:center;">
          <div style="width:100%;height:${h}px;background:${barColor};border-radius:3px 3px 0 0;min-width:4px;" title="${d.date.slice(5)}: ${d.minutes}分"></div>
        </div>`;
      }
      html += '</div>';
      html += '<div style="display:flex;gap:3px;font-size:9px;color:var(--text-sub);">';
      for (const d of data.daily) {
        const dayNum = new Date(d.date + 'T00:00:00').getDate();
        html += `<div style="flex:1;text-align:center;">${dayNum}</div>`;
      }
      html += '</div>';
    }

    el.innerHTML = html;

    // タグ別学習時間
    loadTagStats(el);
  } catch (_) {}
}

async function loadTagStats(parentEl) {
  try {
    const data = await apiFetch(`/api/study/${project.id}/tag-stats?days=7`);
    if (!data.stats || !data.stats.length || data.totalMinutes === 0) return;

    const colors = ['#7EC8B0', '#5BA68A', '#A3D9C8', '#4A9070', '#C8E6D8', '#3D7A5E'];
    const fmtTime = (m) => m >= 60 ? `${Math.floor(m/60)}h${m%60 ? m%60+'m' : ''}` : `${m}m`;

    let html = '<div style="margin-top:16px;font-size:12px;font-weight:600;margin-bottom:8px;">今週の内訳</div>';
    data.stats.forEach((s, i) => {
      const color = colors[i % colors.length];
      html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="font-size:11px;color:var(--text-sub);min-width:60px;text-align:right;">${escHtml(s.tag)}</span>
        <div style="flex:1;height:14px;background:var(--border);border-radius:4px;overflow:hidden;">
          <div style="height:100%;width:${s.pct}%;background:${color};border-radius:4px;"></div>
        </div>
        <span style="font-size:11px;color:var(--text-sub);min-width:50px;">${s.pct}% ${fmtTime(s.minutes)}</span>
      </div>`;
    });

    parentEl.innerHTML += html;
  } catch (_) {}
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
    const repoUrl = `https://github.com/${project.github_repo}`;
    document.getElementById('githubContent').innerHTML =
      `<div style="margin-bottom:8px;"><a href="${escHtml(repoUrl)}" target="_blank" rel="noopener" style="font-size:13px;color:var(--primary-dark);text-decoration:none;">🐙 ${escHtml(project.github_repo)} ↗</a></div>` +
      commits.map(c => `
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
