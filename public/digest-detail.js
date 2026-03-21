// ==============================
// 初期化
// ==============================
document.addEventListener('DOMContentLoaded', () => {
  loadDigests();
});

// ==============================
// ダイジェスト読み込み
// ==============================
async function loadDigests() {
  try {
    const data = await apiFetch('/api/digests');
    const digests = data.digests || [];

    if (!digests.length) {
      document.getElementById('digestDetail').innerHTML = `
        <div class="empty-state" style="padding:20px;">
          <img src="${getPiaImage('cheer')}" alt="ピアちゃん" class="pia-icon-lg" onerror="this.src='/icon-pia.png'">
          <p>まだダイジェストがないよ〜<br>下のボタンで生成してみてね！</p>
        </div>
      `;
      document.getElementById('digestList').innerHTML = '';
      return;
    }

    // Render latest digest as detail
    renderDigestDetail(digests[0]);

    // Render older digests as list
    if (digests.length > 1) {
      document.getElementById('digestList').innerHTML = digests.slice(1).map(d => renderDigestCard(d)).join('');
    } else {
      document.getElementById('digestList').innerHTML = '<div style="color:var(--text-sub);font-size:13px;">過去のダイジェストはありません</div>';
    }
  } catch (e) {
    document.getElementById('digestDetail').innerHTML = '<div style="color:var(--text-sub);font-size:13px;">読み込みに失敗しました</div>';
  }
}

// ==============================
// ダイジェスト詳細レンダリング
// ==============================
function renderDigestDetail(digest) {
  const el = document.getElementById('digestDetail');

  const weekStart = digest.week_start ? formatDate(digest.week_start) : '';
  const weekEnd = digest.week_end ? formatDate(digest.week_end) : '';
  const velocity = JSON.parse(digest.velocity_data || '[]');

  let html = `
    <div class="card section">
      <div class="digest-week">${weekStart} 〜 ${weekEnd}</div>
  `;

  // Pia comment
  if (digest.pia_comment) {
    html += `
      <div class="pia-comment" style="margin-bottom:12px;">
        <img src="${getPiaImage('happy')}" alt="ピアちゃん" class="pia-icon-sm" onerror="this.src='/icon-pia.png'">
        <div class="pia-bubble" style="font-size:13px;">${escHtml(digest.pia_comment)}</div>
      </div>
    `;
  }

  // Stats
  html += `
    <div style="display:flex;gap:16px;font-size:13px;color:var(--text-sub);margin-bottom:16px;">
      <span>✅ ${digest.tasks_completed || 0}件完了</span>
      <span>📋 ${digest.tasks_added || 0}件追加</span>
      <span>📁 ${digest.projects_active || 0}件稼働</span>
    </div>
  `;

  // Velocity chart
  if (velocity.length) {
    const maxCompleted = Math.max(...velocity.map(v => v.completed), 1);
    html += '<div style="font-size:12px;font-weight:600;margin-bottom:8px;">📊 プロジェクト別 完了タスク数</div>';
    html += '<div style="display:flex;align-items:flex-end;gap:6px;height:100px;margin-bottom:4px;">';
    for (const v of velocity) {
      const h = Math.max(6, (v.completed / maxCompleted) * 90);
      html += `<div style="flex:1;display:flex;flex-direction:column;align-items:center;">
        <div style="font-size:10px;color:var(--text-sub);margin-bottom:2px;">${v.completed}</div>
        <div class="velocity-bar" style="width:100%;height:${h}px;background:${v.color || 'var(--primary)'};"></div>
      </div>`;
    }
    html += '</div>';
    html += '<div style="display:flex;gap:6px;font-size:10px;color:var(--text-sub);">';
    for (const v of velocity) {
      const name = v.name && v.name.length > 6 ? v.name.slice(0, 6) + '..' : (v.name || '');
      html += `<div style="flex:1;text-align:center;">${escHtml(name)}</div>`;
    }
    html += '</div>';
  }

  // Summary
  if (digest.summary) {
    html += `<div style="margin-top:12px;font-size:13px;line-height:1.7;">${escHtml(digest.summary)}</div>`;
  }

  html += '</div>';
  el.innerHTML = html;
}

// ==============================
// ダイジェストカード（一覧用）
// ==============================
function renderDigestCard(digest) {
  const weekStart = digest.week_start ? formatDate(digest.week_start) : '';
  const weekEnd = digest.week_end ? formatDate(digest.week_end) : '';

  return `
    <div class="card" style="padding:14px;margin-bottom:10px;">
      <div class="digest-week">${weekStart} 〜 ${weekEnd}</div>
      <div style="display:flex;gap:12px;font-size:12px;color:var(--text-sub);">
        <span>✅ ${digest.tasks_completed || 0}件</span>
        <span>📋 ${digest.tasks_added || 0}件</span>
        <span>📁 ${digest.projects_active || 0}件</span>
      </div>
      ${digest.pia_comment ? `<div style="font-size:12px;margin-top:6px;color:var(--text-main);">${escHtml(digest.pia_comment)}</div>` : ''}
    </div>
  `;
}

// ==============================
// ダイジェスト生成
// ==============================
async function generateDigest() {
  showToast('📊 ダイジェストを生成中...');
  try {
    await apiFetch('/api/digests/generate', { method: 'POST' });
    showToast('📊 ダイジェストを生成しました！');
    loadDigests();
  } catch (e) {
    showToast(`エラー: ${e.message}`);
  }
}
