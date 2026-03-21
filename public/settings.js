// ==============================
// 初期化
// ==============================
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadRecurring();
  loadProjectsForRecurring();
});

// ==============================
// 設定読み込み
// ==============================
async function loadSettings() {
  try {
    const data = await apiFetch('/api/settings');
    const s = data.settings;

    // マスク表示
    if (s.gemini_api_key_masked) {
      document.getElementById('geminiKeyStatus').textContent = `設定済み: ${s.gemini_api_key_masked}`;
    }
    if (s.github_token_masked) {
      document.getElementById('githubTokenStatus').textContent = `設定済み: ${s.github_token_masked}`;
    }

    document.getElementById('charName').value = s.character_name || 'ピアちゃん';
    document.getElementById('charPrompt').value = s.character_prompt || '';
  } catch (e) {
    showToast(`設定の読み込みに失敗: ${e.message}`);
  }
}

// ==============================
// API設定保存
// ==============================
async function saveApiSettings() {
  const body = {};
  const geminiKey = document.getElementById('geminiKey').value.trim();
  const githubToken = document.getElementById('githubToken').value.trim();

  if (geminiKey) body.gemini_api_key = geminiKey;
  if (githubToken) body.github_token = githubToken;

  if (!Object.keys(body).length) { showToast('変更がありません'); return; }

  try {
    await apiFetch('/api/settings', { method: 'PUT', body: JSON.stringify(body) });
    showToast('🔑 保存しました');
    document.getElementById('geminiKey').value = '';
    document.getElementById('githubToken').value = '';
    loadSettings();
  } catch (e) {
    showToast(`エラー: ${e.message}`);
  }
}

// ==============================
// キャラクター設定保存
// ==============================
async function saveCharSettings() {
  const body = {
    character_name: document.getElementById('charName').value.trim(),
    character_prompt: document.getElementById('charPrompt').value.trim(),
  };

  try {
    await apiFetch('/api/settings', { method: 'PUT', body: JSON.stringify(body) });
    showToast('🐷 保存しました');
  } catch (e) {
    showToast(`エラー: ${e.message}`);
  }
}

// ==============================
// 繰り返しタスク
// ==============================
async function loadRecurring() {
  try {
    const data = await apiFetch('/api/recurring');
    renderRecurring(data.recurring);
  } catch (e) {
    document.getElementById('recurringList').innerHTML = '<div style="color:var(--text-sub);font-size:13px;">読み込みに失敗しました</div>';
  }
}

function renderRecurring(list) {
  const el = document.getElementById('recurringList');
  if (!list.length) {
    el.innerHTML = '<div style="color:var(--text-sub);font-size:13px;">繰り返しタスクはありません</div>';
    return;
  }

  const freqLabel = { daily: '毎日', weekly: '毎週', monthly: '毎月' };
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

  el.innerHTML = list.map(r => {
    let freqText = freqLabel[r.frequency] || r.frequency;
    if (r.frequency === 'weekly' && r.day_of_week != null) freqText += `(${dayNames[r.day_of_week]})`;
    if (r.frequency === 'monthly' && r.day_of_month) freqText += `(${r.day_of_month}日)`;
    const paused = r.status === 'paused';

    return `
      <div class="task-item" style="${paused ? 'opacity:0.5;' : ''}">
        <div class="task-content">
          <div class="task-text">${escHtml(r.text)}</div>
          <div class="task-meta">
            <span>🔁 ${freqText}</span>
            <span>次回: ${formatDate(r.next_due)}</span>
            ${r.project_name ? `<span>📁 ${escHtml(r.project_name)}</span>` : '<span>🌐 グローバル</span>'}
          </div>
        </div>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-sm btn-ghost" onclick="toggleRecurring('${r.id}', '${paused ? 'active' : 'paused'}')" title="${paused ? '再開' : '一時停止'}">
            ${paused ? '▶️' : '⏸'}
          </button>
          <button class="btn btn-sm btn-ghost" onclick="deleteRecurring('${r.id}')" title="削除">🗑</button>
        </div>
      </div>
    `;
  }).join('');
}

async function loadProjectsForRecurring() {
  try {
    const data = await apiFetch('/api/projects');
    const sel = document.getElementById('recurProject');
    data.projects.filter(p => p.status === 'active').forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      sel.appendChild(opt);
    });
  } catch (_) {}
}

function onFreqChange() {
  const freq = document.getElementById('recurFreq').value;
  document.getElementById('weekdayGroup').style.display = freq === 'weekly' ? '' : 'none';
  document.getElementById('monthdayGroup').style.display = freq === 'monthly' ? '' : 'none';
}

async function addRecurring() {
  const text = document.getElementById('recurText').value.trim();
  if (!text) { showToast('タスク名を入力してください'); return; }

  const freq = document.getElementById('recurFreq').value;
  const body = {
    text,
    frequency: freq,
    project_id: document.getElementById('recurProject').value || null,
  };
  if (freq === 'weekly') body.day_of_week = parseInt(document.getElementById('recurWeekday').value);
  if (freq === 'monthly') body.day_of_month = parseInt(document.getElementById('recurMonthday').value) || 1;

  try {
    await apiFetch('/api/recurring', { method: 'POST', body: JSON.stringify(body) });
    showToast('🔁 追加しました');
    closeModal('recurringModal');
    document.getElementById('recurText').value = '';
    loadRecurring();
  } catch (e) {
    showToast(`エラー: ${e.message}`);
  }
}

async function toggleRecurring(id, newStatus) {
  try {
    await apiFetch(`/api/recurring/${id}`, { method: 'PUT', body: JSON.stringify({ status: newStatus }) });
    loadRecurring();
  } catch (e) {
    showToast(`エラー: ${e.message}`);
  }
}

async function deleteRecurring(id) {
  if (!confirm('この繰り返しタスクを削除しますか？')) return;
  try {
    await apiFetch(`/api/recurring/${id}`, { method: 'DELETE' });
    showToast('🗑 削除しました');
    loadRecurring();
  } catch (e) {
    showToast(`エラー: ${e.message}`);
  }
}
