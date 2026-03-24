// ==============================
// 状態
// ==============================
let projects = [];
let currentFilter = 'active';
let selectedType = 'project';
let selectedColor = '#7EC8B0';
let lastCreatedId = null;
let createTags = [];
let activeTagFilter = null;
const PRESET_TAGS = ["Androidアプリ", "Webアプリ", "Chrome拡張", "iOSアプリ", "ゲーム", "ツール", "ライブラリ", "資格勉強", "語学学習", "読書", "ブログ"];

// ==============================
// 初期化
// ==============================
document.addEventListener('DOMContentLoaded', () => {
  renderColorOptions();
  loadProjects();
});

// ==============================
// プロジェクト読み込み
// ==============================
async function loadProjects() {
  try {
    const query = currentFilter ? `?status=${currentFilter}` : '';
    const data = await apiFetch(`/api/projects${query}`);
    projects = data.projects;
    renderProjects();
  } catch (e) {
    showToast(`エラー: ${e.message}`);
  }
}

// ==============================
// レンダリング
// ==============================
function renderProjects() {
  const el = document.getElementById('projectList');

  // Render tag filter bar
  renderTagFilter();

  // Filter by active tag
  let filtered = projects;
  if (activeTagFilter) {
    filtered = projects.filter(p => {
      const tags = parseTags(p.tags);
      return tags.includes(activeTagFilter);
    });
  }

  if (!filtered.length) {
    el.innerHTML = `<div class="empty-state">
      <img src="${getPiaImage('cheer')}" alt="ピアちゃん" class="pia-icon-lg" onerror="this.src='/icon-pia.png'">
      <p>プロジェクトがないよ〜<br>新しく作ってみる？</p>
    </div>`;
    return;
  }

  el.innerHTML = filtered.map(p => {
    const typeIcon = p.type === 'study' ? '📖' : '🔨';
    const total = p.total_tasks || 0;
    const done = p.done_tasks || 0;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const remaining = formatRelativeDate(p.goal_date);
    const color = p.color || '#7EC8B0';
    const tags = parseTags(p.tags);
    const tagsHtml = tags.length ? `<div style="margin-top:6px;">${tags.map(t => `<span class="tag-badge">${escHtml(t)}</span>`).join('')}</div>` : '';

    return `
      <div class="project-card" style="border-left-color:${escHtml(color)};" onclick="location.href='/project-detail?id=${p.id}'">
        <div class="project-card-header">
          <span class="project-type-icon">${typeIcon}</span>
          <span class="project-name">${escHtml(p.name)}</span>
          ${p.github_repo ? '<span style="font-size:14px;">🔗</span>' : ''}
        </div>
        <div class="progress-bar" style="margin-bottom:6px;">
          <div class="progress-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="project-meta">
          <span>${done}/${total} タスク (${pct}%)</span>
          ${p.goal_date ? `<span>🎯 ${formatDate(p.goal_date)} ${remaining ? `(${remaining})` : ''}</span>` : ''}
        </div>
        ${tagsHtml}
      </div>
    `;
  }).join('');
}

function parseTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags;
  try { return JSON.parse(tags); } catch { return []; }
}

function renderTagFilter() {
  const filterEl = document.getElementById('tagsFilter');
  const allTags = new Set();
  projects.forEach(p => parseTags(p.tags).forEach(t => allTags.add(t)));

  if (!allTags.size) {
    filterEl.style.display = 'none';
    return;
  }

  filterEl.style.display = '';
  filterEl.innerHTML = Array.from(allTags).map(t =>
    `<span class="tag-badge${activeTagFilter === t ? ' active' : ''}" onclick="toggleTagFilter('${escHtml(t)}')">${escHtml(t)}</span>`
  ).join('');
}

function toggleTagFilter(tag) {
  activeTagFilter = activeTagFilter === tag ? null : tag;
  renderProjects();
}

// ==============================
// フィルタ
// ==============================
function filterProjects(status, btn) {
  currentFilter = status;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadProjects();
}

// ==============================
// タイプ選択
// ==============================
function selectType(type) {
  selectedType = type;
  document.querySelectorAll('.type-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.type === type);
  });
  document.getElementById('dailyMinutesGroup').style.display = type === 'study' ? '' : 'none';
  document.getElementById('goalHoursGroup').style.display = type === 'study' ? '' : 'none';
}

// ==============================
// カラーピッカー
// ==============================
function renderColorOptions() {
  const el = document.getElementById('colorOptions');
  el.innerHTML = PROJECT_COLORS.map(c => `
    <div class="color-option${c === selectedColor ? ' selected' : ''}"
         style="background:${c};"
         onclick="selectColor('${c}', this)"></div>
  `).join('');
}

function selectColor(color, el) {
  selectedColor = color;
  document.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
}

// ==============================
// プロジェクト作成
// ==============================
// ==============================
// タグ入力（作成フォーム）
// ==============================
function renderCreateTags() {
  const container = document.getElementById('createTagContainer');
  const input = document.getElementById('createTagInput');
  const badges = container.querySelectorAll('.tag-badge');
  badges.forEach(b => b.remove());
  createTags.forEach((tag, i) => {
    const badge = document.createElement('span');
    badge.className = 'tag-badge';
    badge.innerHTML = `${escHtml(tag)}<span class="remove-tag" onclick="removeCreateTag(${i}, event)">&times;</span>`;
    container.insertBefore(badge, input);
  });
}

function addCreateTag(tag) {
  tag = tag.trim();
  if (!tag || createTags.includes(tag)) return;
  createTags.push(tag);
  renderCreateTags();
  document.getElementById('createTagInput').value = '';
  hideCreateTagSuggestions();
}

function removeCreateTag(index, event) {
  event.stopPropagation();
  createTags.splice(index, 1);
  renderCreateTags();
}

function handleCreateTagKeydown(event) {
  const input = document.getElementById('createTagInput');
  if ((event.key === 'Enter' || event.key === ',') && input.value.trim()) {
    event.preventDefault();
    addCreateTag(input.value.replace(',', ''));
  }
  if (event.key === 'Backspace' && !input.value && createTags.length) {
    createTags.pop();
    renderCreateTags();
  }
}

function showCreateTagSuggestions() {
  const input = document.getElementById('createTagInput');
  const sugEl = document.getElementById('createTagSuggestions');
  const val = input.value.trim().toLowerCase();
  const filtered = PRESET_TAGS.filter(t => !createTags.includes(t) && (!val || t.toLowerCase().includes(val)));
  if (!filtered.length) { sugEl.style.display = 'none'; return; }
  sugEl.style.display = '';
  sugEl.innerHTML = filtered.map(t => `<div onclick="addCreateTag('${escHtml(t)}')">${escHtml(t)}</div>`).join('');
}

function hideCreateTagSuggestions() {
  document.getElementById('createTagSuggestions').style.display = 'none';
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#createTagContainer') && !e.target.closest('#createTagSuggestions')) hideCreateTagSuggestions();
});

async function createProject() {
  const name = document.getElementById('createName').value.trim();
  if (!name) { showToast('プロジェクト名を入力してください'); return; }

  const body = {
    name,
    description: document.getElementById('createDesc').value.trim() || null,
    type: selectedType,
    goal_date: document.getElementById('createGoalDate').value || null,
    daily_minutes: selectedType === 'study' ? (parseInt(document.getElementById('createDailyMinutes').value) || null) : null,
    total_goal_hours: selectedType === 'study' ? (parseFloat(document.getElementById('createTotalGoalHours').value) || null) : null,
    github_repo: document.getElementById('createGithubRepo').value.trim() || null,
    color: selectedColor,
    tags: createTags.length ? createTags : null,
  };

  try {
    const data = await apiFetch('/api/projects', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    lastCreatedId = data.id;
    showToast('✨ プロジェクトを作成しました！');
    closeModal('createModal');

    // フォームリセット
    document.getElementById('createName').value = '';
    document.getElementById('createDesc').value = '';
    document.getElementById('createGoalDate').value = '';
    document.getElementById('createDailyMinutes').value = '';
    document.getElementById('createTotalGoalHours').value = '';
    document.getElementById('createGithubRepo').value = '';
    document.getElementById('createTagInput').value = '';
    createTags = [];
    renderCreateTags();
    selectType('project');
    selectedColor = '#7EC8B0';
    renderColorOptions();

    // AI提案モーダル表示
    openModal('aiSuggestModal');
  } catch (e) {
    showToast(`エラー: ${e.message}`);
  }
}

// ==============================
// AI提案後の遷移
// ==============================
function goToProjectWithAI() {
  if (lastCreatedId) {
    location.href = `/project-detail?id=${lastCreatedId}&suggest=1`;
  }
}

function goToProject() {
  if (lastCreatedId) {
    location.href = `/project-detail?id=${lastCreatedId}`;
  }
  closeModal('aiSuggestModal');
  loadProjects();
}

// ==============================
// テンプレート選択
// ==============================
async function openTemplateSelect() {
  closeModal('aiSuggestModal');
  showToast('テンプレートを読み込み中...');
  try {
    const data = await apiFetch('/api/templates');
    const templates = data.templates || [];

    if (!templates.length) {
      showToast('テンプレートがありません');
      return;
    }

    document.getElementById('templateSelectList').innerHTML = templates.map(t => {
      const taskCount = Array.isArray(t.tasks_json) ? t.tasks_json.length : 0;
      return `
        <div class="task-item" style="cursor:pointer;" onclick="applyTemplate('${t.id}')">
          <div class="task-content">
            <div class="task-text">${escHtml(t.name)}</div>
            <div class="task-meta">
              <span>${t.type === 'study' ? '📖' : '🔨'}</span>
              <span>📋 ${taskCount}タスク</span>
              ${t.description ? `<span>${escHtml(t.description)}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    openModal('templateModal');
  } catch (e) { showToast(`エラー: ${e.message}`); }
}

async function applyTemplate(templateId) {
  if (!lastCreatedId) { showToast('プロジェクトが見つかりません'); return; }
  try {
    const data = await apiFetch(`/api/templates/${templateId}/apply`, {
      method: 'POST',
      body: JSON.stringify({ project_id: lastCreatedId }),
    });
    closeModal('templateModal');
    showToast(`📋 ${data.count}件のタスクを追加しました！`);
    location.href = `/project-detail?id=${lastCreatedId}`;
  } catch (e) { showToast(`エラー: ${e.message}`); }
}
