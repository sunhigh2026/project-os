// ==============================
// 状態
// ==============================
let projects = [];
let currentFilter = 'active';
let selectedType = 'project';
let selectedColor = '#7EC8B0';
let lastCreatedId = null;

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

  if (!projects.length) {
    el.innerHTML = `<div class="empty-state">
      <img src="${getPiaImage('cheer')}" alt="ピアちゃん" class="pia-icon-lg" onerror="this.src='/icon-pia.png'">
      <p>プロジェクトがないよ〜<br>新しく作ってみる？</p>
    </div>`;
    return;
  }

  el.innerHTML = projects.map(p => {
    const typeIcon = p.type === 'study' ? '📖' : '🔨';
    const total = p.total_tasks || 0;
    const done = p.done_tasks || 0;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const remaining = formatRelativeDate(p.goal_date);
    const color = p.color || '#7EC8B0';

    return `
      <div class="project-card" style="border-left-color:${escHtml(color)};" onclick="location.href='/project-detail.html?id=${p.id}'">
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
      </div>
    `;
  }).join('');
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
async function createProject() {
  const name = document.getElementById('createName').value.trim();
  if (!name) { showToast('プロジェクト名を入力してください'); return; }

  const body = {
    name,
    description: document.getElementById('createDesc').value.trim() || null,
    type: selectedType,
    goal_date: document.getElementById('createGoalDate').value || null,
    daily_minutes: selectedType === 'study' ? (parseInt(document.getElementById('createDailyMinutes').value) || null) : null,
    github_repo: document.getElementById('createGithubRepo').value.trim() || null,
    color: selectedColor,
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
    document.getElementById('createGithubRepo').value = '';
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
    location.href = `/project-detail.html?id=${lastCreatedId}&suggest=1`;
  }
}

function goToProject() {
  if (lastCreatedId) {
    location.href = `/project-detail.html?id=${lastCreatedId}`;
  }
  closeModal('aiSuggestModal');
  loadProjects();
}
