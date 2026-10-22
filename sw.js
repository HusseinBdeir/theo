/* THEO Remote PWA Service Worker, v34 (2026-10-22).
   App shell: network-first (cache: no-cache) for HTML/JS/CSS, cache-first for static assets.
   Web Push: RFC 8291 aes128gcm push listener + W3C Badging API (navigator.setAppBadge) + durable Cache Storage & postMessage notificationclick handoff. */
const CACHE_NAME = 'theo-remote-v34';
const NAV_CACHE = 'theo-nav-handoff-v1';
const PENDING_NAV_URL = './__theo_pending_nav.json';
const LAST_PUSH_NAV_URL = './__theo_last_push_nav.json';
const UNREAD_NOTIFS_URL = './__theo_unread_notifs.json';

let pendingClickNav = null;
let lastUnseenPushNav = null;

const APP_SHELL = [
  './',
  './index.html',
  './css/theo.css?v=34',
  './js/endpoints.js?v=34',
  './js/app.js?v=34',
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
      .then((cache) =>
        Promise.all(
          APP_SHELL.map((u) =>
            cache.add(new Request(u, { cache: 'reload' })).catch(() => {})
          )
        )
      )
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

function applySwAppBadge(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  try {
    if (self.navigator && typeof self.navigator.setAppBadge === 'function') {
      if (n > 0) {
        return Promise.resolve(self.navigator.setAppBadge(n)).catch(() => {});
      }
      if (typeof self.navigator.clearAppBadge === 'function') {
        return Promise.resolve(self.navigator.clearAppBadge()).catch(() => {});
      }
      return Promise.resolve(self.navigator.setAppBadge(0)).catch(() => {});
    }
  } catch {}
  return Promise.resolve();
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

async function readUnreadNotifsFromCache() {
  try {
    const cache = await caches.open(NAV_CACHE);
    const res = await cache.match(UNREAD_NOTIFS_URL);
    if (!res) return [];
    const data = await res.json();
    return Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function writeUnreadNotifsToCache(items) {
  const safe = Array.isArray(items) ? items.slice(0, 60) : [];
  await writeNavCache(UNREAD_NOTIFS_URL, {
    updatedAt: Date.now(),
    items: safe
  });
  return safe;
}

async function upsertSwUnreadNotif(d, nav) {
  const existing = await readUnreadNotifsFromCache();
  const tag = String(nav.tag || d.tag || `theo-${Date.now()}`);
  const id = String(d.id || nav.id || tag);
  const entry = {
    id,
    tag,
    title: String(d.title || 'THEO Workbench'),
    body: String(d.body || ''),
    tab: nav.tab || 'pulse',
    threadId: nav.threadId || '',
    provider: nav.provider || '',
    reminderId: nav.reminderId || '',
    sessionTitle: nav.sessionTitle || '',
    url: nav.url || './',
    ts: Date.now(),
    checked: false
  };
  const filtered = existing.filter((x) => x && x.id !== id && x.tag !== tag);
  const next = [entry, ...filtered].slice(0, 60);
  await writeUnreadNotifsToCache(next);
  const unreadCount = next.filter((x) => x && !x.checked).length;
  return { item: entry, unreadCount, items: next };
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
  // Never return without calling showNotification() — iOS webpushd penalizes silent pushes on userVisibleOnly subscriptions
  const effectivePayload = isPlannerDomainNotif
    ? {
        title: 'THEO Workbench ⚡',
        body: 'Remote workbench connected & synced.',
        tag: 'theo-sync-pulse',
        tab: 'pulse',
        url: './?tab=pulse'
      }
    : d;

  const title = effectivePayload.title || 'THEO Workbench';
  const opts = buildNotifOptions(effectivePayload);
  const nav = opts.data;

  event.waitUntil(
    (async () => {
      const showPromise = self.registration.showNotification(title, opts);
      if (!isPlannerDomainNotif) {
        try {
          const { item: unreadItem, unreadCount } = await upsertSwUnreadNotif(effectivePayload, nav);
          const badgeCount =
            Number.isFinite(Number(d.badgeCount)) && Number(d.badgeCount) > 0
              ? Math.max(unreadCount, Number(d.badgeCount))
              : Math.max(1, unreadCount);
          await applySwAppBadge(badgeCount);

          const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
          const theoClients = list.filter((c) => isTheoRemoteClientUrl(c.url));
          if (nav.threadId || nav.reminderId || nav.tab !== 'pulse') {
            lastUnseenPushNav = { ...nav, clicked: false, ts: Date.now() };
            await writeNavCache(LAST_PUSH_NAV_URL, lastUnseenPushNav);
          }
          theoClients.forEach((c) => {
            try {
              c.postMessage({
                type: 'theo-push',
                payload: { ...d, ...nav },
                item: unreadItem,
                unreadCount: badgeCount
              });
            } catch {}
          });
        } catch {}
      }
      await showPromise;
    })()
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
  if (m.type === 'sync-unread-notifs') {
    event.waitUntil(
      (async () => {
        const items = Array.isArray(m.items) ? m.items : [];
        await writeUnreadNotifsToCache(items);
        const unreadCount = items.filter((x) => x && !x.checked).length;
        const explicitBadge = Number.isFinite(Number(m.badgeCount))
          ? Math.max(0, Number(m.badgeCount))
          : unreadCount;
        await applySwAppBadge(Math.max(unreadCount, explicitBadge));
        if (m.closeOsNotifications && self.registration && self.registration.getNotifications) {
          try {
            const active = await self.registration.getNotifications();
            const checkedTags = new Set(
              Array.isArray(m.checkedTags) ? m.checkedTags.map(String) : []
            );
            active.forEach((n) => {
              if (!checkedTags.size || (n.tag && checkedTags.has(String(n.tag)))) {
                n.close();
              }
            });
          } catch {}
        }
      })()
    );
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
      (async () => {
        if (!m.skipUnread) {
          const { unreadCount } = await upsertSwUnreadNotif(d, nav);
          await applySwAppBadge(Math.max(1, unreadCount));
        }
        await Promise.all([
          nav.threadId || nav.reminderId || nav.tab !== 'pulse'
            ? writeNavCache(LAST_PUSH_NAV_URL, lastUnseenPushNav)
            : Promise.resolve(),
          self.registration.showNotification(d.title || 'THEO Workbench', opts)
        ]);
      })()
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
      try {
        const items = await readUnreadNotifsFromCache();
        let changed = false;
        const next = items.map((it) => {
          if (!it) return it;
          if (
            it.id === nav.id ||
            it.tag === nav.tag ||
            (nav.threadId && it.threadId === nav.threadId) ||
            (nav.reminderId && it.reminderId === nav.reminderId)
          ) {
            changed = true;
            return { ...it, checked: true, checkedAt: Date.now() };
          }
          return it;
        });
        if (changed) {
          await writeUnreadNotifsToCache(next);
        }
        const unreadCount = next.filter((x) => x && !x.checked).length;
        await applySwAppBadge(unreadCount);
      } catch {}

      const navWithChecked = {
        ...nav,
        checkedNotifId: nav.id,
        checkedNotifTag: nav.tag
      };

      await Promise.all([
        writeNavCache(PENDING_NAV_URL, navWithChecked),
        writeNavCache(LAST_PUSH_NAV_URL, navWithChecked)
      ]);
      const list = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      });
      const theoClients = list.filter((c) => isTheoRemoteClientUrl(c.url));
      const targetClient =
        theoClients.find((c) => c.focused || c.visibilityState === 'visible') ||
        theoClients[0];

      const postToAllClients = () => {
        theoClients.forEach((c) => {
          try {
            c.postMessage(navWithChecked);
          } catch {}
        });
      };

      if (targetClient && 'focus' in targetClient) {
        postToAllClients();
        await targetClient.focus().catch(() => {});
        postToAllClients();
        await new Promise((r) => setTimeout(r, 150));
        postToAllClients();
        await new Promise((r) => setTimeout(r, 350));
        postToAllClients();
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
