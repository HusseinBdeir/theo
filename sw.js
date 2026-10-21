/* THEO Remote PWA Service Worker, v29 (2026-10-21).
   App shell: network-first (cache: no-cache) for HTML/JS/CSS, cache-first for static assets.
   Web Push: RFC 8291 aes128gcm push listener + durable Cache Storage & postMessage notificationclick handoff. */
const CACHE_NAME = 'theo-remote-v29';
const NAV_CACHE = 'theo-nav-handoff-v1';
const PENDING_NAV_URL = './__theo_pending_nav.json';
const LAST_PUSH_NAV_URL = './__theo_last_push_nav.json';

let pendingClickNav = null;
let lastUnseenPushNav = null;

const APP_SHELL = [
  './',
  './index.html',
  './css/theo.css?v=29',
  './js/endpoints.js?v=29',
  './js/app.js?v=29',
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

function buildNavTarget(d, clicked = false) {
  const raw = d && typeof d === 'object' ? d : {};
  const threadId = String(raw.threadId || raw.sessionId || '').trim();
  const reminderId = String(raw.reminderId || raw.taskId || '').trim();
  const provider = String(raw.provider || '').trim();
  const rawTab = String(raw.tab || 'pulse').trim() || 'pulse';
  const targetTab = threadId
    ? 'chat'
    : rawTab === 'discipline'
      ? 'pulse'
      : rawTab;

  const qs = new URLSearchParams();
  if (targetTab) qs.set('tab', targetTab);
  if (threadId) qs.set('thread', threadId);
  if (provider) qs.set('provider', provider);
  const computedUrl = `./?${qs.toString()}`;
  const targetUrl =
    threadId
      ? computedUrl
      : raw.url && raw.url !== './'
        ? raw.url
        : computedUrl;

  return {
    type: 'theo-nav',
    id: String(raw.id || raw.tag || `theo-nav-${Date.now()}`),
    tag: String(raw.tag || 'theo-notif'),
    tab: targetTab,
    threadId,
    provider,
    reminderId,
    title: String(raw.title || ''),
    sessionTitle: String(raw.sessionTitle || ''),
    url: targetUrl,
    clicked: Boolean(clicked),
    ts: Date.now()
  };
}

function writeNavCache(keyUrl, navObj) {
  return caches
    .open(NAV_CACHE)
    .then((cache) =>
      cache.put(
        keyUrl,
        new Response(JSON.stringify(navObj), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store'
          }
        })
      )
    )
    .catch(() => {});
}

function clearNavCache() {
  pendingClickNav = null;
  lastUnseenPushNav = null;
  return caches
    .open(NAV_CACHE)
    .then((cache) =>
      Promise.all([
        cache.delete(PENDING_NAV_URL).catch(() => {}),
        cache.delete(LAST_PUSH_NAV_URL).catch(() => {})
      ])
    )
    .catch(() => {});
}

function isTheoRemoteClientUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.origin !== self.location.origin) return false;
    const p = u.pathname.toLowerCase();
    if (
      p.includes('/planner/') ||
      p.endsWith('/planner') ||
      p.includes('/command/') ||
      p.endsWith('/command') ||
      p.includes('/fitness/') ||
      p.includes('/attendance/') ||
      p.includes('/isabi/')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function buildNotifOptions(d) {
  const nav = buildNavTarget(d, false);
  return {
    body: d.body || 'Tap to open THEO Remote Workbench.',
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: nav.tag,
    renotify: true,
    vibrate: [180, 80, 180, 80, 260],
    data: nav
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
  const rawTab = String(d.tab || '').toLowerCase();
  const rawTag = String(d.tag || '').toLowerCase();
  const isPlannerDomainNotif = Boolean(
    d.openPrayer ||
      rawTab === 'prayers' ||
      rawTab === 'prayer' ||
      rawTab === 'tasks' ||
      rawTab === 'timers' ||
      rawTab === 'delegated' ||
      rawTab === 'delegation' ||
      rawTab === 'score' ||
      rawTab === 'discipline' ||
      rawTag.includes('prayer') ||
      rawTag.includes('cmd-') ||
      rawTag.includes('theo-cmd-')
  );
  // Prayer, Task, Reminder, Wait-Timer, Delegation & 100% Score alerts belong exclusively to Planner PWA
  if (isPlannerDomainNotif) {
    return;
  }

  const title = d.title || 'THEO Workbench';
  const opts = buildNotifOptions(d);
  const nav = opts.data;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (list) => {
      const theoClients = list.filter((c) => isTheoRemoteClientUrl(c.url));
      const anyVisible = theoClients.some(
        (c) => c.focused || c.visibilityState === 'visible'
      );
      if (!anyVisible && (nav.threadId || nav.reminderId || nav.tab !== 'pulse')) {
        lastUnseenPushNav = { ...nav, clicked: false, ts: Date.now() };
        await writeNavCache(LAST_PUSH_NAV_URL, lastUnseenPushNav);
      }
      theoClients.forEach((c) => {
        try {
          c.postMessage({ type: 'theo-push', payload: { ...d, ...nav } });
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
  if (m.type === 'clear-pending-nav') {
    event.waitUntil(clearNavCache());
    return;
  }
  if (m.type === 'consume-pending-nav') {
    const candidate =
      pendingClickNav || (m.allowUnseenPush ? lastUnseenPushNav : null);
    if (candidate && Date.now() - Number(candidate.ts || 0) < 30 * 60 * 1000) {
      const toSend = { ...candidate, type: 'theo-nav' };
      event.waitUntil(
        clearNavCache().then(() => {
          try {
            event.source?.postMessage(toSend);
          } catch {}
        })
      );
    }
    return;
  }
  if (m.type === 'show-notification') {
    const d = m.payload || {};
    const opts = buildNotifOptions(d);
    const nav = opts.data;
    if (nav.threadId || nav.reminderId || nav.tab !== 'pulse') {
      lastUnseenPushNav = { ...nav, clicked: false, ts: Date.now() };
    }
    event.waitUntil(
      Promise.all([
        nav.threadId || nav.reminderId || nav.tab !== 'pulse'
          ? writeNavCache(LAST_PUSH_NAV_URL, lastUnseenPushNav)
          : Promise.resolve(),
        self.registration.showNotification(d.title || 'THEO Workbench', opts)
      ])
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = (event.notification && event.notification.data) || {};
  const nav = buildNavTarget(data, true);
  pendingClickNav = nav;
  lastUnseenPushNav = nav;

  event.waitUntil(
    (async () => {
      await Promise.all([
        writeNavCache(PENDING_NAV_URL, nav),
        writeNavCache(LAST_PUSH_NAV_URL, nav)
      ]);
      const list = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      });
      const theoClients = list.filter((c) => isTheoRemoteClientUrl(c.url));
      const targetClient =
        theoClients.find((c) => c.focused || c.visibilityState === 'visible') ||
        theoClients[0];

      if (targetClient && 'focus' in targetClient) {
        try {
          targetClient.postMessage(nav);
        } catch {}
        await targetClient.focus().catch(() => {});
        try {
          targetClient.postMessage(nav);
        } catch {}
        await new Promise((r) => setTimeout(r, 260));
        try {
          targetClient.postMessage(nav);
        } catch {}
        return;
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(nav.url);
      }
    })()
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
