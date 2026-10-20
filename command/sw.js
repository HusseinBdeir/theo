/* THEO Command — Executive Planner, Wait-Timer, Org Delegation, Shia Prayer Alerts & 100% Discipline Service Worker v7 */
const CACHE_NAME = 'theo-command-v7';
const NAV_CACHE = 'theo-cmd-nav-handoff-v1';
const PENDING_NAV_URL = './__theo_cmd_pending_nav.json';
const APP_SHELL = [
  './',
  './index.html',
  './css/command.css?v=7',
  './js/endpoints.js?v=7',
  './js/app.js?v=7',
  './manifest.json',
  './icon.svg',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.all(APP_SHELL.map((u) => cache.add(new Request(u, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME && k !== NAV_CACHE).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

function buildCmdDeepLink(d) {
  const openPrayer = Boolean(d.openPrayer || (d.tag && String(d.tag).includes('prayer')));
  const tab = String(d.tab || (d.taskId ? 'timers' : 'radar')).trim();
  const taskId = String(d.taskId || '').trim();
  let url = d.url && d.url !== './' ? String(d.url) : '';
  if (!url) {
    if (openPrayer) {
      url = './?prayer=1';
    } else if (taskId) {
      url = `./?tab=${encodeURIComponent(tab)}&taskId=${encodeURIComponent(taskId)}`;
    } else {
      url = `./?tab=${encodeURIComponent(tab)}`;
    }
  }
  return {
    url,
    tab,
    taskId,
    openPrayer,
    ts: Date.now()
  };
}

function buildNotifOptions(d) {
  const nav = buildCmdDeepLink(d);
  return {
    body: d.body || 'Tap to open THEO Command.',
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: d.tag || 'theo-cmd-notif',
    renotify: true,
    vibrate: [180, 80, 180, 80, 260],
    data: nav
  };
}

function isCommandClientUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.origin !== self.location.origin) return false;
    return u.pathname.includes('/command');
  } catch {
    return false;
  }
}

self.addEventListener('push', (event) => {
  let d = {};
  if (event.data) {
    try {
      d = event.data.json();
    } catch {
      try {
        d = { title: 'THEO Command', body: event.data.text() };
      } catch {}
    }
  }
  const title = d.title || 'THEO Command';
  const opts = buildNotifOptions(d);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      list.filter((c) => isCommandClientUrl(c.url)).forEach((c) => {
        try {
          c.postMessage({ type: 'theo-command-push', payload: d });
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
      self.registration.showNotification(d.title || 'THEO Command', buildNotifOptions(d))
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = buildCmdDeepLink(event.notification.data || {});
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(NAV_CACHE);
        await cache.put(
          PENDING_NAV_URL,
          new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
        );
      } catch {}
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const cmdClients = clientList.filter((c) => isCommandClientUrl(c.url));
      for (const client of cmdClients) {
        try {
          client.postMessage({ type: 'theo-command-nav', data });
        } catch {}
        if ('focus' in client) {
          try {
            const focused = await client.focus();
            try {
              (focused || client).postMessage({ type: 'theo-command-nav', data });
            } catch {}
            setTimeout(() => {
              try {
                (focused || client).postMessage({ type: 'theo-command-nav', data });
              } catch {}
            }, 250);
            return focused;
          } catch {}
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(data.url || './');
      }
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  const isCodeOrHtml =
    req.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css');

  if (isCodeOrHtml) {
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
