// ==============================
// API ユーティリティ
// ==============================
async function apiFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) {
    window.location.href = `/login.html?from=${encodeURIComponent(location.pathname + location.search)}`;
    return null;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ==============================
// Toast
// ==============================
let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

// ==============================
// ユーティリティ
// ==============================
function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function generateId() {
  return crypto.randomUUID();
}

function todayJST() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.ceil((target - today) / 86400000);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatRelativeDate(dateStr) {
  const days = daysUntil(dateStr);
  if (days === null) return '';
  if (days < 0) return `${Math.abs(days)}日超過`;
  if (days === 0) return '今日';
  if (days === 1) return '明日';
  return `あと${days}日`;
}

// ==============================
// ピアちゃん画像
// ==============================
const PIA_IMAGES = {
  normal:   ['/pia-normal.png', '/pia-happy.png'],
  happy:    ['/pia-happy.png'],
  thinking: ['/pia-thinking.png'],
  cheer:    ['/pia-full-1.png', '/pia-full-2.png', '/pia-full-3.png', '/pia-cheer.png'],
  full:     ['/pia-full-1.png', '/pia-full-2.png', '/pia-full-3.png',
             '/pia-full-4.png', '/pia-full-5.png', '/pia-full-6.png', '/pia-full-7.png'],
};

function getPiaImage(type) {
  const candidates = PIA_IMAGES[type] || PIA_IMAGES.normal;
  const seed = (new Date().getDate() + new Date().getHours()) % candidates.length;
  return candidates[seed];
}

// ==============================
// モーダル
// ==============================
function openModal(id) {
  document.getElementById(id)?.classList.add('show');
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('show');
}

// ==============================
// プロジェクトカラー
// ==============================
const PROJECT_COLORS = [
  '#7EC8B0', '#E8A0BF', '#FCA5A5', '#FDE68A', '#86EFAC',
  '#93C5FD', '#C4B5FD', '#FDBA74', '#A5B4FC', '#6EE7B7',
];
