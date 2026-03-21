const CACHE_NAME = 'project-os-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/projects.html',
  '/project-detail.html',
  '/gantt.html',
  '/settings.html',
  '/style.css',
  '/app.js',
  '/dashboard.js',
  '/projects.js',
  '/project-detail.js',
  '/gantt.js',
  '/settings.js',
  '/icon-pia.png',
  '/pia-normal.png',
  '/pia-happy.png',
  '/pia-thinking.png',
  '/pia-cheer.png',
  '/manifest.json',
];

// インストール: 静的アセットをキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// アクティベーション: 古いキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// フェッチ: 静的アセットはキャッシュファースト、APIはネットワークファースト
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API リクエストはネットワークファースト
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ error: 'オフラインです' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      })
    );
    return;
  }

  // 静的アセットはキャッシュファースト
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        // 成功したレスポンスをキャッシュ
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    }).catch(() => {
      // オフラインフォールバック
      if (event.request.mode === 'navigate') {
        return caches.match('/index.html');
      }
    })
  );
});
