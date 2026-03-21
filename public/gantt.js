// ==============================
// 状態
// ==============================
let ganttData = null;
let viewMode = 'week'; // 'week' | 'month'
const TASK_NAME_WIDTH = 140;
const DAY_WIDTH_WEEK = 36;
const DAY_WIDTH_MONTH = 14;

// ==============================
// 初期化
// ==============================
document.addEventListener('DOMContentLoaded', () => {
  loadProjectList();
  loadGantt();
});

async function loadProjectList() {
  try {
    const data = await apiFetch('/api/projects');
    const sel = document.getElementById('projectSelect');
    data.projects.filter(p => p.status === 'active').forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      sel.appendChild(opt);
    });
  } catch (_) {}
}

// ==============================
// データ読み込み
// ==============================
async function loadGantt() {
  const sel = document.getElementById('projectSelect');
  const projectId = sel.value;

  try {
    if (projectId === 'all') {
      ganttData = await apiFetch('/api/gantt/all');
      ganttData.commits = [];
      ganttData.goal_date = null;
    } else {
      ganttData = await apiFetch(`/api/gantt/${projectId}`);
    }
    renderGantt();
  } catch (e) {
    document.getElementById('ganttContainer').innerHTML = `<div class="empty-state"><p>データの取得に失敗しました</p></div>`;
  }
}

function setView(v, btn) {
  viewMode = v;
  document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderGantt();
}

// ==============================
// ガントチャート描画
// ==============================
function renderGantt() {
  const container = document.getElementById('ganttContainer');
  const tasks = ganttData?.tasks || [];

  // スケジュール付きタスクのみ
  const scheduled = tasks.filter(t => t.due_start || t.due_end);
  if (!scheduled.length) {
    container.innerHTML = `<div class="empty-state">
      <img src="${getPiaImage('thinking')}" alt="ピアちゃん" class="pia-icon-lg" onerror="this.src='/icon-pia.png'">
      <p>スケジュールが設定されたタスクがないよ〜<br>「スケジュールを組んで」ボタンで設定してね！</p>
    </div>`;
    return;
  }

  const today = todayJST();
  const dayWidth = viewMode === 'week' ? DAY_WIDTH_WEEK : DAY_WIDTH_MONTH;

  // 日付範囲を算出
  let minDate = today;
  let maxDate = today;
  scheduled.forEach(t => {
    const s = t.due_start || t.due_end;
    const e = t.due_end || t.due_start;
    if (s < minDate) minDate = s;
    if (e > maxDate) maxDate = e;
  });
  if (ganttData.goal_date && ganttData.goal_date > maxDate) maxDate = ganttData.goal_date;

  // 前後に3日余白
  const startDate = addDays(minDate, -3);
  const endDate = addDays(maxDate, 3);
  const days = daysBetween(startDate, endDate) + 1;

  // フェーズでグループ化
  const groups = groupByPhase(scheduled);

  // グリッド構築
  let totalRows = 0;
  groups.forEach(g => { totalRows += 1 + g.tasks.length; }); // header + tasks

  const gridCols = `${TASK_NAME_WIDTH}px repeat(${days}, ${dayWidth}px)`;

  let html = `<div class="gantt-table" style="grid-template-columns:${gridCols};position:relative;">`;

  // 日付ヘッダー
  html += '<div class="gantt-header-row">';
  html += '<div class="gantt-date-cell" style="font-weight:600;">タスク</div>';
  for (let i = 0; i < days; i++) {
    const d = addDays(startDate, i);
    const dow = new Date(d + 'T00:00:00').getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isToday = d === today;
    const label = viewMode === 'week' ? d.slice(8) : (parseInt(d.slice(8)) % 5 === 1 ? d.slice(5).replace('-', '/') : '');
    html += `<div class="gantt-date-cell${isWeekend ? ' weekend' : ''}${isToday ? ' today' : ''}">${label}</div>`;
  }
  html += '</div>';

  // タスク行
  const commits = ganttData.commits || [];
  groups.forEach(g => {
    // フェーズヘッダー
    html += `<div class="gantt-phase-header">${escHtml(g.phase)}</div>`;

    g.tasks.forEach(t => {
      html += '<div class="gantt-row">';

      // タスク名
      const color = t.project_color || '#7EC8B0';
      html += `<div class="gantt-task-name">
        <div class="priority-dot ${t.priority || 'mid'}" style="width:6px;height:6px;"></div>
        <span title="${escHtml(t.text)}">${escHtml(t.text)}</span>
      </div>`;

      // 日付セル（バー描画のため1行1セルのコンテナ方式）
      const tStart = t.due_start || t.due_end;
      const tEnd = t.due_end || t.due_start;
      for (let i = 0; i < days; i++) {
        const d = addDays(startDate, i);
        const dow = new Date(d + 'T00:00:00').getDay();
        const isWeekend = dow === 0 || dow === 6;

        let cellHtml = '';

        // バー開始日のセルにバーを描画
        if (d === tStart && tStart && tEnd) {
          const barDays = Math.max(1, daysBetween(tStart, tEnd) + 1);
          const barWidth = barDays * dayWidth - 4;

          if (t.is_milestone) {
            cellHtml += `<div class="gantt-milestone" style="left:${(dayWidth - 14) / 2}px;"></div>`;
          } else {
            cellHtml += `<div class="gantt-bar ${t.status}" style="width:${barWidth}px;left:2px;"></div>`;
          }
        }

        // コミットドット
        const hasCommit = commits.some(c => c.date === d);
        if (hasCommit && d >= tStart && d <= tEnd) {
          cellHtml += `<div class="gantt-commit-dot" style="left:${(dayWidth - 6) / 2}px;"></div>`;
        }

        html += `<div class="gantt-cell${isWeekend ? ' weekend' : ''}" style="${isWeekend ? 'background:rgba(126,200,176,0.06);' : ''}">${cellHtml}</div>`;
      }

      html += '</div>';
    });
  });

  // 今日の赤線
  const todayIdx = daysBetween(startDate, today);
  if (todayIdx >= 0 && todayIdx < days) {
    const left = TASK_NAME_WIDTH + todayIdx * dayWidth + dayWidth / 2;
    html += `<div class="gantt-today-line" style="left:${left}px;"></div>`;
  }

  // 目標日のピンク線
  if (ganttData.goal_date) {
    const goalIdx = daysBetween(startDate, ganttData.goal_date);
    if (goalIdx >= 0 && goalIdx < days) {
      const left = TASK_NAME_WIDTH + goalIdx * dayWidth + dayWidth / 2;
      html += `<div class="gantt-goal-line" style="left:${left}px;"></div>`;
    }
  }

  html += '</div>';
  container.innerHTML = html;

  // 今日の位置にスクロール
  if (todayIdx > 5) {
    container.scrollLeft = (todayIdx - 3) * dayWidth;
  }
}

// ==============================
// ユーティリティ
// ==============================
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}

function groupByPhase(tasks) {
  const map = new Map();
  tasks.forEach(t => {
    const phase = t.phase || '未分類';
    if (!map.has(phase)) map.set(phase, []);
    map.get(phase).push(t);
  });
  return Array.from(map.entries()).map(([phase, tasks]) => ({ phase, tasks }));
}
