// ==============================
// 初期化
// ==============================
document.addEventListener('DOMContentLoaded', () => {
  loadReviews();
});

// ==============================
// ふりかえり読み込み
// ==============================
async function loadReviews() {
  try {
    const data = await apiFetch('/api/reviews');
    const reviews = data.reviews || [];
    renderReviews(reviews);
  } catch (e) {
    document.getElementById('reviewList').innerHTML = '<div style="color:var(--text-sub);font-size:13px;">読み込みに失敗しました</div>';
  }
}

// ==============================
// ふりかえりレンダリング
// ==============================
function renderReviews(reviews) {
  const el = document.getElementById('reviewList');

  if (!reviews.length) {
    el.innerHTML = `
      <div class="empty-state" style="padding:20px;">
        <img src="${getPiaImage('cheer')}" alt="ピアちゃん" class="pia-icon-lg" onerror="this.src='/icon-pia.png'">
        <p>ふりかえりはまだないよ〜<br>プロジェクトを完了すると作れるよ！</p>
      </div>
    `;
    return;
  }

  el.innerHTML = reviews.map(r => {
    const highlights = r.highlights || [];
    const learnings = r.learnings || [];

    let highlightsHtml = '';
    if (highlights.length) {
      highlightsHtml = '<div style="margin-top:8px;"><strong style="font-size:12px;">✨ よかったこと</strong></div>';
      highlightsHtml += highlights.map(h => `<div style="font-size:12px;padding:1px 0;color:var(--text-sub);">• ${escHtml(h)}</div>`).join('');
    }

    let learningsHtml = '';
    if (learnings.length) {
      learningsHtml = '<div style="margin-top:6px;"><strong style="font-size:12px;">📚 学んだこと</strong></div>';
      learningsHtml += learnings.map(l => `<div style="font-size:12px;padding:1px 0;color:var(--text-sub);">• ${escHtml(l)}</div>`).join('');
    }

    return `
      <div class="card" style="padding:16px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="font-size:15px;font-weight:700;">${escHtml(r.project_name || 'プロジェクト')}</div>
          <div style="font-size:11px;color:var(--text-sub);">${r.created_at ? formatDate(r.created_at.slice(0, 10)) : ''}</div>
        </div>
        ${r.pia_comment ? `
          <div class="pia-comment" style="margin-bottom:8px;">
            <img src="${getPiaImage('happy')}" alt="ピアちゃん" class="pia-icon-sm" onerror="this.src='/icon-pia.png'" style="width:36px;height:36px;">
            <div class="pia-bubble" style="font-size:12px;">${escHtml(r.pia_comment)}</div>
          </div>
        ` : ''}
        ${r.summary ? `<div style="font-size:13px;line-height:1.6;margin-bottom:4px;">${escHtml(r.summary)}</div>` : ''}
        ${highlightsHtml}
        ${learningsHtml}
      </div>
    `;
  }).join('');
}
