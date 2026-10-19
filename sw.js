/* THEO Remote PWA Service Worker, v10 (2026-10-19).
   App shell: network-first (cache: no-cache) for HTML/JS/CSS, cache-first for static assets.
   Web Push: RFC 8291 aes128gcm push listener + notificationclick focus/open + local SW notification fallback. */
const CACHE_NAME = 'theo-remote-v10';
const APP_SHELL = [
  './',
  './index.html',
  './css/theo.css?v=10',
  './js/endpoints.js?v=10',
  './js/app.js?v=10',
  './manifest.json',
  './icon.svg',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './brand/theo-wordmark-dark.svg',
  './brand/theo-wordmark-light.svg',
  './brand/theo-mark-on-dark.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

function buildNotifOptions(d) {
  return {
    body: d.body || 'Tap to open THEO Remote Workbench.',
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: d.tag || 'theo-notif',
    renotify: true,
    vibrate: [180, 80, 180, 80, 260],
    data: {
      url: d.url || './',
      tab: d.tab || 'pulse',
      threadId: d.threadId || '',
      provider: d.provider || ''
    }
  };
}

self.addEventListener('push', (event) => {
  let d = {};
  if (event.data) {
    try {
      d = event.data.json();
    } catch {
      try {
        d = { title: 'THEO Workbench', body: event.data.text() };
      } catch {}
    }
  }
  const title = d.title || 'THEO Workbench';
  const opts = buildNotifOptions(d);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      list.forEach((c) => {
        try {
          c.postMessage({ type: 'theo-push', payload: d });
        } catch {}
      });
      return self.registration.showNotification(title, opts);
    })
  );
});

self.addEventListener('message', (event) => {
  const m = event.data;
  if (!m) return;
  if (m.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (m.type === 'show-notification') {
    const d = m.payload || {};
    event.waitUntil(
      self.registration.showNotification(d.title || 'THEO Workbench', buildNotifOptions(d))
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = (event.notification && event.notification.data) || {};
  const targetTab = data.tab || (data.threadId ? 'chat' : 'pulse');
  const qs = new URLSearchParams();
  if (targetTab) qs.set('tab', targetTab);
  if (data.threadId) qs.set('thread', data.threadId);
  if (data.provider) qs.set('provider', data.provider);
  const targetUrl = data.url && data.url !== './' ? data.url : `./?${qs.toString()}`;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          try {
            c.postMessage({
              type: 'theo-nav',
              tab: targetTab,
              threadId: data.threadId || '',
              provider: data.provider || ''
            });
          } catch {}
          return c.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never cache live API calls, SSE streams, or Power Automate Cloud Relay requests
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('powerplatform.com') ||
    url.hostname.includes('logic.azure.com')
  ) {
    return;
  }

  // Network-first for HTML/JS/CSS so updates land immediately when online, fallback to cache when offline
  if (
    req.mode === 'navigate' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css')
  ) {
    event.respondWith(
      fetch(req.url, { cache: 'no-cache' })
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html', { ignoreSearch: true })))
    );
    return;
  }

  // Cache-first for icons/fonts/SVGs
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          }
          return res;
        })
    )
  );
});
