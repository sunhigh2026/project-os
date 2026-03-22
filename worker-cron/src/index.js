export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(generateAndSendDigest(env));
  },

  // Manual trigger via HTTP for testing
  async fetch(request, env) {
    if (request.method === 'POST' || new URL(request.url).pathname === '/trigger') {
      try {
        const result = await generateAndSendDigest(env);
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    return new Response('Project OS Cron Worker. POST /trigger to run manually.', { status: 200 });
  },
};

async function generateAndSendDigest(env) {
  const baseUrl = env.PROJECT_OS_URL;
  const authHeader = `Bearer ${env.AUTH_TOKEN}`;

  // Step 1: Generate digest
  let digest = null;

  const genRes = await fetch(`${baseUrl}/api/digests/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
    },
  });

  if (genRes.ok) {
    digest = await genRes.json();
  } else if (genRes.status === 409) {
    // Already exists, get latest
    const listRes = await fetch(`${baseUrl}/api/digests`, {
      headers: { 'Authorization': authHeader },
    });
    if (listRes.ok) {
      const data = await listRes.json();
      digest = data.digests?.[0];
    }
  }

  if (!digest) {
    return { error: 'Failed to generate or fetch digest' };
  }

  // Step 2: Parse velocity_data
  let details = {};
  try {
    details = typeof digest.velocity_data === 'string'
      ? JSON.parse(digest.velocity_data)
      : (digest.velocity_data || {});
  } catch (_) {}

  // Step 3: Build HTML email
  const html = buildEmailHtml(digest, details);

  // Step 4: Send email via Gmail API
  if (env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN) {
    await sendViaGmail(env, html, digest);
    return { ok: true, method: 'gmail', week: `${digest.week_start} ~ ${digest.week_end}` };
  }

  // Fallback: log (no email service configured)
  return { ok: true, method: 'none', message: 'Digest generated but no email service configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN.', week: `${digest.week_start} ~ ${digest.week_end}` };
}

async function getGmailAccessToken(env) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GMAIL_CLIENT_ID,
      client_secret: env.GMAIL_CLIENT_SECRET,
      refresh_token: env.GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OAuth token refresh failed: ${err}`);
  }
  const data = await res.json();
  return data.access_token;
}

function base64url(str) {
  // TextEncoder for UTF-8, then base64url encode
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sendViaGmail(env, html, digest) {
  const accessToken = await getGmailAccessToken(env);

  const to = env.EMAIL_TO;
  const from = env.EMAIL_FROM || to;
  const subject = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(`🐷 Project OS 週次ダイジェスト (${formatDateShort(digest.week_start)}〜${formatDateShort(digest.week_end)})`)))}?=`;

  const boundary = 'boundary_' + Date.now();
  const rawEmail = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    btoa(unescape(encodeURIComponent(html))),
    `--${boundary}--`,
  ].join('\r\n');

  const raw = base64url(rawEmail);

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail API error: ${err}`);
  }
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00Z');
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function buildEmailHtml(digest, data) {
  const projects = data.projects || [];
  const velocity = data.velocity || [];
  const highlights = data.highlights || [];
  const toughThings = data.tough_things || [];
  const nextWeek = data.next_week || [];
  const overdue = data.overdue_tasks || [];
  const prevCompleted = data.prev_completed || 0;
  const prevAdded = data.prev_added || 0;

  const diffArrow = (current, prev) => {
    if (current > prev) return `<span style="color:#22C55E;">↑${current - prev}</span>`;
    if (current < prev) return `<span style="color:#FCA5A5;">↓${prev - current}</span>`;
    return `<span style="color:#9CA3AF;">→</span>`;
  };

  const fmtTime = (m) => {
    if (!m) return '0分';
    return m >= 60 ? `${Math.floor(m / 60)}時間${m % 60 ? m % 60 + '分' : ''}` : `${m}分`;
  };

  // Header + Pia Summary
  let html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0FAF6;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Noto Sans JP',sans-serif;">
<div style="max-width:520px;margin:0 auto;padding:20px;">

  <h1 style="font-size:18px;color:#2D3D36;margin-bottom:16px;">📊 週次ダイジェスト <span style="font-size:14px;color:#9CA3AF;font-weight:400;">${formatDateShort(digest.week_start)}〜${formatDateShort(digest.week_end)}</span></h1>

  <div style="background:#FDF2F8;border-radius:16px;padding:16px;margin-bottom:16px;">
    <div style="font-size:14px;line-height:1.7;color:#2D3D36;">${escHtml(digest.pia_comment || '')}</div>
  </div>`;

  // Stats Grid
  html += `
  <div style="display:flex;gap:10px;margin-bottom:16px;">
    <div style="flex:1;background:#fff;border-radius:12px;padding:14px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
      <div style="font-size:24px;font-weight:700;color:#5BA68A;">${digest.tasks_completed || 0}</div>
      <div style="font-size:11px;color:#9CA3AF;">件完了</div>
      <div style="font-size:11px;margin-top:2px;">${diffArrow(digest.tasks_completed || 0, prevCompleted)}</div>
    </div>
    <div style="flex:1;background:#fff;border-radius:12px;padding:14px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
      <div style="font-size:24px;font-weight:700;color:#2D3D36;">${digest.tasks_added || 0}</div>
      <div style="font-size:11px;color:#9CA3AF;">件追加</div>
      <div style="font-size:11px;margin-top:2px;">${diffArrow(digest.tasks_added || 0, prevAdded)}</div>
    </div>
    <div style="flex:1;background:#fff;border-radius:12px;padding:14px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
      <div style="font-size:24px;font-weight:700;color:#2D3D36;">${digest.projects_active || 0}</div>
      <div style="font-size:11px;color:#9CA3AF;">件稼働</div>
    </div>
  </div>`;

  // Velocity Graph
  if (velocity.length > 0) {
    const maxTotal = Math.max(...velocity.map(v => v.total), 1);
    html += `
  <div style="background:#fff;border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,0.05);margin-bottom:16px;">
    <div style="font-size:14px;font-weight:700;margin-bottom:12px;">📈 ベロシティ（直近12週）</div>
    <div style="display:flex;align-items:flex-end;gap:4px;height:80px;">`;

    for (const week of velocity) {
      const barH = maxTotal > 0 ? Math.max(2, (week.total / maxTotal) * 70) : 2;
      const isLatest = week.week_start === digest.week_start;
      const color = isLatest ? '#5BA68A' : '#7EC8B0';
      const wLabel = new Date(week.week_start + 'T00:00:00Z').getUTCDate();
      html += `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;">
        <div style="font-size:9px;color:#9CA3AF;margin-bottom:2px;">${week.total || ''}</div>
        <div style="width:100%;height:${barH}px;background:${color};border-radius:3px 3px 0 0;"></div>
        <div style="font-size:8px;color:#9CA3AF;margin-top:2px;">${wLabel}</div>
      </div>`;
    }

    html += `
    </div>
  </div>`;
  }

  // Project Cards
  if (projects.length > 0) {
    html += `<div style="font-size:14px;font-weight:700;margin-bottom:10px;">📁 プロジェクト別</div>`;

    for (const p of projects) {
      const hasActivity = p.completed_count > 0 || p.added_count > 0;
      const opacity = hasActivity ? '1' : '0.6';
      const progressDiff = p.progress_pct - (p.progress_prev_pct || 0);
      const typeIcon = p.type === 'study' ? '📖' : '🔨';

      html += `
  <div style="background:#fff;border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,0.05);border-left:4px solid ${p.color || '#7EC8B0'};margin-bottom:10px;opacity:${opacity};">
    <div style="font-size:14px;font-weight:700;margin-bottom:6px;">${typeIcon} ${escHtml(p.name)}</div>
    <div style="height:6px;background:#E5E7EB;border-radius:3px;overflow:hidden;margin-bottom:6px;">
      <div style="height:100%;background:${p.color || '#7EC8B0'};border-radius:3px;width:${p.progress_pct}%;"></div>
    </div>
    <div style="font-size:12px;color:#9CA3AF;margin-bottom:8px;">
      ${p.progress_pct}% ${progressDiff > 0 ? `<span style="color:#22C55E;">(+${progressDiff}%)</span>` : progressDiff < 0 ? `<span style="color:#FCA5A5;">(${progressDiff}%)</span>` : ''}
    </div>`;

      if (!hasActivity) {
        html += `<div style="font-size:13px;color:#9CA3AF;font-style:italic;">🐷 今週は動きなし...放置気味だけど大丈夫？</div>`;
      } else {
        if (p.completed_tasks?.length > 0) {
          html += `<div style="font-size:12px;font-weight:600;color:#5BA68A;margin-bottom:4px;">✅ 完了したタスク</div>`;
          for (const t of p.completed_tasks) {
            html += `<div style="font-size:13px;padding:2px 0;color:#2D3D36;">• ${escHtml(t)}</div>`;
          }
        }
      }

      if (p.upcoming_tasks?.length > 0) {
        html += `<div style="font-size:12px;font-weight:600;color:#E8A0BF;margin-top:8px;margin-bottom:4px;">📅 来週が期限</div>`;
        for (const t of p.upcoming_tasks) {
          html += `<div style="font-size:13px;padding:2px 0;color:#2D3D36;">• ${escHtml(t.text)} <span style="color:#9CA3AF;">(${formatDateShort(t.due_end)})</span></div>`;
        }
      }

      // GitHub activity
      if (p.github) {
        const dayLabels = ['月', '火', '水', '木', '金', '土', '日'];
        html += `<div style="font-size:12px;font-weight:600;margin-top:8px;margin-bottom:4px;">🐙 GitHub</div>`;
        html += `<div style="font-size:12px;color:#9CA3AF;margin-bottom:4px;">${p.github.commits}コミット · PR ${p.github.open_prs}件</div>`;
        html += `<div style="display:flex;gap:4px;">`;
        for (let i = 0; i < 7; i++) {
          const active = p.github.commit_days?.[i];
          html += `<div style="width:22px;height:22px;border-radius:50%;background:${active ? '#22C55E' : '#E5E7EB'};color:${active ? '#fff' : '#9CA3AF'};font-size:9px;display:flex;align-items:center;justify-content:center;">${dayLabels[i]}</div>`;
        }
        html += `</div>`;
      }

      // Study time
      if (p.study) {
        const pct = p.study.goal_minutes > 0 ? Math.round((p.study.minutes / p.study.goal_minutes) * 100) : 0;
        html += `<div style="font-size:12px;font-weight:600;margin-top:8px;margin-bottom:4px;">⏱ 学習時間</div>`;
        html += `<div style="font-size:12px;color:#9CA3AF;">${fmtTime(p.study.minutes)} / 目標${fmtTime(p.study.goal_minutes)} (${pct}%)</div>`;
      }

      html += `</div>`;
    }
  }

  // Highlights / Tough things
  if (highlights.length > 0 || toughThings.length > 0) {
    html += `<div style="display:flex;gap:10px;margin-bottom:16px;">`;
    if (highlights.length > 0) {
      html += `<div style="flex:1;background:#fff;border-radius:12px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <div style="font-size:13px;font-weight:700;margin-bottom:6px;">✨ ハイライト</div>`;
      for (const h of highlights) {
        html += `<div style="font-size:13px;padding:2px 0;">• ${escHtml(h)}</div>`;
      }
      html += `</div>`;
    }
    if (toughThings.length > 0) {
      html += `<div style="flex:1;background:#fff;border-radius:12px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <div style="font-size:13px;font-weight:700;margin-bottom:6px;">💪 タフだったこと</div>`;
      for (const t of toughThings) {
        html += `<div style="font-size:13px;padding:2px 0;">• ${escHtml(t)}</div>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
  }

  // Next Week Preview
  if (nextWeek.length > 0) {
    html += `
  <div style="background:#fff;border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,0.05);margin-bottom:16px;">
    <div style="font-size:14px;font-weight:700;margin-bottom:10px;">📋 来週のプレビュー</div>`;
    for (const t of nextWeek) {
      html += `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #E5E7EB;font-size:13px;">
      <span style="color:${t.project_color || '#7EC8B0'};">●</span>
      <span style="flex:1;">${escHtml(t.text)}</span>
      <span style="color:#9CA3AF;font-size:11px;">${formatDateShort(t.due_end)}</span>
    </div>`;
    }
    html += `</div>`;
  }

  // Overdue warning
  if (overdue.length > 0) {
    html += `
  <div style="background:#FEF2F2;border-radius:12px;padding:16px;margin-bottom:16px;border-left:4px solid #FCA5A5;">
    <div style="font-size:14px;font-weight:700;color:#991B1B;margin-bottom:8px;">⚠️ 期限超過 (${overdue.length}件)</div>`;
    for (const t of overdue) {
      html += `<div style="font-size:13px;padding:2px 0;">• ${escHtml(t.text)} <span style="color:#9CA3AF;">(${escHtml(t.project_name)})</span></div>`;
    }
    html += `</div>`;
  }

  // Closing
  if (data.closing) {
    html += `
  <div style="background:#FDF2F8;border-radius:16px;padding:16px;margin-bottom:16px;">
    <div style="font-size:14px;line-height:1.7;color:#2D3D36;">🐷 ${escHtml(data.closing)}</div>
  </div>`;
  }

  // CTA
  html += `
  <div style="text-align:center;margin:20px 0;">
    <a href="https://project-os-3k7.pages.dev/digest-detail" style="display:inline-block;background:#7EC8B0;color:#fff;padding:12px 28px;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px;">Project OS で詳細を見る →</a>
  </div>

  <div style="text-align:center;font-size:11px;color:#9CA3AF;padding:16px 0;">
    Project OS - ピアちゃんと一緒にプロジェクト管理 🐷
  </div>
</div>
</body></html>`;

  return html;
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
