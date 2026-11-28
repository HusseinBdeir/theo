(() => {
  'use strict';

  window.__theoRegisterModule('transport', (S) => {
  let pairClaimInFlight = false;
  let pairCodeGenInFlight = false;
  let activeGeneratedPairCode = null;
  let showQuickPairLinkFallback = false;

  function resetTransportsForFreshPairing() {
    lastLocalProbeFailedAt = 0;
    cachedBridgeTokenHex = '';
    cachedBridgeTokenSrc = '';
    edgeReconnectAttempts = 0;
    localWsReconnectAttempts = 0;
    showQuickPairLinkFallback = false;
    if (edgeWs) {
      try {
        edgeWs.close();
      } catch {}
      edgeWs = null;
      edgeWsAuthed = false;
      edgeWsUrlConnected = '';
      edgeWsTokenConnected = '';
    }
    if (localWs) {
      try {
        localWs.close();
      } catch {}
      localWs = null;
      localWsAuthed = false;
    }
    if (
      document.activeElement &&
      typeof document.activeElement.blur === 'function' &&
      document.activeElement.closest?.('.quick-pair-card, #pairing-grid')
    ) {
      document.activeElement.blur();
    }
  }

  // v64: the cloud store lives on the Edge relay Worker (<edge base>/store) and its key is derived from the
  // edge access key, so a device paired before the move keeps working with no re-pairing and no stored store secret.
  function sha256HexSync(text) {
    const K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    const H = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ];
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    const bytes = new TextEncoder().encode(String(text));
    const len = bytes.length;
    const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
    padded.set(bytes);
    padded[len] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, Math.floor((len * 8) / 0x100000000), false);
    view.setUint32(padded.length - 4, (len * 8) >>> 0, false);
    const w = new Uint32Array(64);
    for (let off = 0; off < padded.length; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4, false);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
        const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        h = g;
        g = f;
        f = e;
        e = (d + t1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0;
      H[1] = (H[1] + b) >>> 0;
      H[2] = (H[2] + c) >>> 0;
      H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0;
      H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0;
      H[7] = (H[7] + h) >>> 0;
    }
    return H.map((x) => x.toString(16).padStart(8, '0')).join('');
  }

  let edgeStoreKeySrc = '';
  let edgeStoreKeyHex = '';
  function getEdgeStoreKeyHex(edgeKey) {
    const clean = String(edgeKey || '').trim();
    if (!clean) return '';
    if (edgeStoreKeySrc !== clean) {
      edgeStoreKeySrc = clean;
      edgeStoreKeyHex = sha256HexSync(`theo-edge-v1:${clean}`);
      // Cross-check against WebCrypto; if the two ever disagree the platform digest wins.
      deriveEdgeAuthTokenHex(clean)
        .then((hex) => {
          if (hex && edgeStoreKeySrc === clean) edgeStoreKeyHex = hex;
        })
        .catch(() => {});
    }
    return edgeStoreKeyHex;
  }

  function getEdgeStoreUrl() {
    const cfg = window.THEO_CLOUD_CFG || {};
    const raw = String(
      S.prefs.edgeRelayUrl || cfg.edgeRelayUrl || 'wss://theo-edge-relay.husseinbdeir.workers.dev/ws'
    ).trim();
    const base = raw
      .replace(/^wss:\/\//i, 'https://')
      .replace(/^ws:\/\//i, 'http://')
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '')
      .replace(/\/ws$/i, '')
      .replace(/\/+$/, '');
    if (!/^https:\/\/[^\s]+$/i.test(base) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(base)) {
      return '';
    }
    return `${base}/store`;
  }

  const cloudCfg = { url: '', key: '', edgeAccessKey: '', port: 4318 };
  function refreshCloudConfig() {
    const cfg = window.THEO_CLOUD_CFG || {};
    let fallbackUrl = '';
    let fallbackKey = '';
    try {
      fallbackUrl = cfg.u ? atob(cfg.u) : '';
      fallbackKey = cfg.k ? atob(cfg.k) : '';
    } catch {}
    cloudCfg.edgeAccessKey = String(S.prefs.edgeAccessKey || '').trim();
    const edgeStoreUrl = cloudCfg.edgeAccessKey ? getEdgeStoreUrl() : '';
    if (edgeStoreUrl) {
      cloudCfg.url = edgeStoreUrl;
      cloudCfg.key = getEdgeStoreKeyHex(cloudCfg.edgeAccessKey);
    } else {
      cloudCfg.url = String(S.prefs.cloudUrl || fallbackUrl || '').trim();
      cloudCfg.key = String(S.prefs.cloudKey || fallbackKey || '').trim();
    }
    cloudCfg.port = Number(S.prefs.port || cfg.port || 4318) || 4318;
    return cloudCfg;
  }

  function hasAnyPairingCredentials() {
    refreshCloudConfig();
    return Boolean(
      localBridgeBase ||
        (S.localBootInfo && S.localBootInfo.token) ||
        cloudCfg.edgeAccessKey ||
        (cloudCfg.url && cloudCfg.key) ||
        cachedPairingInfo?.pairUrl ||
        cachedPairingInfo?.mobilePairUrl
    );
  }
  let connMode = 'probing'; // 'local' | 'edge' | 'cloud' | 'offline'
  let localBridgeBase = '';
  let localBridgeWsPath = '/ws';
  let sseSource = null;
  let localWs = null;
  let localWsAuthed = false;
  let localWsRttMs = 0;
  let localWsDevice = null;
  let localWsPingTimer = null;
  let localWsReconnectTimer = null;
  let edgeWs = null;
  let edgeWsAuthed = false;
  let edgeWsRttMs = 0;
  let edgeWsUrlConnected = '';
  let edgeWsTokenConnected = '';
  const DEFAULT_EDGE_RELAY_URL = 'wss://theo-edge-relay.husseinbdeir.workers.dev/ws';
  let edgeWsPingTimer = null;
  let edgeWsReconnectTimer = null;
  let discoveredEdgeUrl = S.localBootInfo?.edgeRelayUrl || S.prefs.edgeRelayUrl || DEFAULT_EDGE_RELAY_URL;
  let lastCloudBackstopAt = 0;
  let lastCloudQueue = null;
  let edgeReconnectAttempts = 0;
  let localWsReconnectAttempts = 0;
  let cachedBridgeTokenHex = '';
  let cachedBridgeTokenSrc = '';
  let cachedPairingInfo = null;
  let wsRenderSeq = 0;
  let hasProvidersHydrated = Boolean(S.appState?.providers);
  const hostSnapshotsByDevice = new Map();
  const wsPendingRpcs = new Map();
  const fleetDevicesMap = new Map();
  const liveStreamsByThreadId = new Map();
  let streamDomRafId = 0;
  let streamDomTargetTid = '';
  const pendingThreadRequests = new Map();
  const lastThreadDetailFetchAtById = new Map();
  const lastThreadDetailReceivedAtById = new Map();
  const lastSeenThreadStepStampById = new Map();

  // Connectivity Engine: Probes Direct Local Bridge (:4318) first, then Edge WS & Cloud Relay fallback
  let lastLocalProbeFailedAt = 0;
  let syncInFlight = false;
  let pendingSyncAfterFlight = false;

  async function deriveEdgeAuthTokenHex(rawKey) {
    const clean = String(rawKey || '').trim();
    if (!clean || !window.crypto || !window.crypto.subtle) return '';
    const bytes = new TextEncoder().encode(`theo-edge-v1:${clean}`);
    const digest = await window.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async function getBridgeAuthTokenHex() {
    if (window.__THEO_MOCK_BRIDGE_TOKEN) {
      return String(window.__THEO_MOCK_BRIDGE_TOKEN).trim();
    }
    if (S.localBootInfo && typeof S.localBootInfo.token === 'string' && S.localBootInfo.token.trim()) {
      return S.localBootInfo.token.trim();
    }
    refreshCloudConfig();
    const rawSecret = cloudCfg.edgeAccessKey || cloudCfg.key || '';
    if (!rawSecret) return '';
    if (cachedBridgeTokenHex && cachedBridgeTokenSrc === rawSecret) {
      return cachedBridgeTokenHex;
    }
    const derived = await deriveEdgeAuthTokenHex(rawSecret);
    if (derived) {
      cachedBridgeTokenSrc = rawSecret;
      cachedBridgeTokenHex = derived;
    }
    return derived;
  }

  async function authFetchLocal(url, init = {}) {
    const token = await getBridgeAuthTokenHex();
    const headers = Object.assign({}, init.headers || {});
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return fetch(url, { ...init, headers });
  }

  async function fetchPairingInfoFromBridge() {
    if (S.isHeadlessBrowser || !localBridgeBase) return cachedPairingInfo;
    try {
      const res = await authFetchLocal(`${localBridgeBase}/api/pairing-info`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.ok) {
          cachedPairingInfo = data;
          return data;
        }
      }
    } catch {}
    return cachedPairingInfo;
  }

  async function probeLocalBridge(force = false) {
    if (S.isHeadlessBrowser && !window.__THEO_ALLOW_PROBE_MOCK_FETCH) return '';
    refreshCloudConfig();
    const candidates = [];
    const ua = String((typeof navigator !== 'undefined' && navigator.userAgent) || '');
    const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(ua);
    const isPublicHosted =
      location.hostname.endsWith('.github.io') || location.hostname.endsWith('.workers.dev');

    if (
      location.port === String(cloudCfg.port) ||
      (location.protocol === 'http:' && !isPublicHosted)
    ) {
      candidates.push(location.origin.replace(/\/+$/, ''));
    }
    if (S.prefs.customBridgeUrl) {
      candidates.push(S.prefs.customBridgeUrl.replace(/\/+$/, ''));
    }
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      candidates.push(`http://127.0.0.1:${cloudCfg.port}`);
      candidates.push(`http://localhost:${cloudCfg.port}`);
    }
    if (!isMobileDevice) {
      candidates.push(`http://127.0.0.1:${cloudCfg.port}`);
    }

    if (!candidates.length) return '';
    if (!force && lastLocalProbeFailedAt && Date.now() - lastLocalProbeFailedAt < 30000) {
      return '';
    }

    const seen = new Set();
    for (const base of candidates) {
      if (!base || seen.has(base)) continue;
      seen.add(base);
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 750);
        const res = await authFetchLocal(`${base}/api/ping`, { signal: ctrl.signal });
        clearTimeout(timer);
        if (res.ok) {
          const data = await res.json();
          if (data && data.ok) {
            if (data.edgeRelayUrl && !S.prefs.edgeRelayUrl && S.isSafeEdgeEndpointUrl(data.edgeRelayUrl)) {
              discoveredEdgeUrl = String(data.edgeRelayUrl).trim();
            }
            const isAuthedPing =
              data.authenticated !== false && !(data.authRequired && !data.localUrl);
            if (!isAuthedPing) {
              continue;
            }
            localBridgeBase = base;
            lastLocalProbeFailedAt = 0;
            if (data.device && data.device.id) {
              localWsDevice = data.device;
              updateFleetDevices([{ ...data.device, online: true, local: true, lastSeen: Date.now() }]);
            }
            fetchPairingInfoFromBridge().catch(() => {});
            return base;
          }
        }
      } catch {}
    }
    lastLocalProbeFailedAt = Date.now();
    return '';
  }

  const initialNoSse = location.search.includes('nosse=1');

  // A session belongs to the host that published it: every host stamps `deviceId` on the rows it sends, and a row
  // without a stamp belongs to the host whose snapshot it arrived in. Nothing here knows a PC by name or folder.
  // The name shown is the host's current name from the fleet list, so a renamed PC shows its new name at once.
  function inferFrontendRowDeviceId(r, fallbackId = '', fallbackName = '') {
    const id = String(r?.deviceId || fallbackId || '').trim();
    const devMeta = id ? fleetDevicesMap.get(id) : null;
    const name = String(devMeta?.name || r?.deviceName || fallbackName || id || '').trim();
    return { id, name };
  }

  function sanitizeFleetPcSetup(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const totalCount = Math.max(0, Math.min(99, Math.trunc(Number(raw.totalCount) || 0)));
    if (totalCount <= 0) return null;
    const okCount = Math.max(0, Math.min(totalCount, Math.trunc(Number(raw.okCount) || 0)));
    const pendingCount = Math.max(
      0,
      Math.min(
        totalCount,
        raw.pendingCount !== undefined ? Math.trunc(Number(raw.pendingCount) || 0) : totalCount - okCount
      )
    );
    const pendingIds = Array.isArray(raw.pendingIds)
      ? raw.pendingIds
          .map((x) => String(x || '').trim())
          .filter((x) => /^[a-z0-9._-]{1,64}$/i.test(x))
          .slice(0, 16)
      : [];
    // A host sends its pending steps as `pending: [{ id, name }]`; older snapshots used `pendingTitles`.
    const rawTitles = Array.isArray(raw.pendingTitles)
      ? raw.pendingTitles
      : Array.isArray(raw.pending)
        ? raw.pending.map((p) => (p && typeof p === 'object' ? p.name || p.title || p.id : ''))
        : [];
    const pendingTitles = rawTitles
      .map((x) => String(x || '').replace(/[\\/]+/g, ' ').trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 16);
    return {
      ok: Boolean((raw.ok || raw.ready) && pendingCount === 0),
      checkedAt: Number(raw.checkedAt || 0),
      totalCount,
      okCount,
      pendingCount,
      pendingIds,
      pendingTitles
    };
  }

  // Whether a PC can be driven from the phone alone, with no VS Code window open (theo-hub pc-setup.js
  // buildPwaReadySummary), carried on each fleet device entry like pcSetup. null = that PC's build does not
  // report it. Counts are recomputed from the checks, never taken from the wire.
  function sanitizeFleetPwaReady(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.checks)) return null;
    const checks = [];
    for (const c of raw.checks) {
      if (!c || typeof c !== 'object') continue;
      const id = String(c.id || '').trim();
      if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id) || checks.some((x) => x.id === id)) continue;
      checks.push({
        id,
        ok: Boolean(c.ok),
        level: c.level === 'required' ? 'required' : 'info',
        title: String(c.title || id).replace(/\s+/g, ' ').trim().slice(0, 60),
        detail: String(c.detail || '').replace(/\s+/g, ' ').trim().slice(0, 200)
      });
      if (checks.length >= 16) break;
    }
    const required = checks.filter((c) => c.level === 'required');
    if (!required.length) return null;
    const okCount = required.filter((c) => c.ok).length;
    return {
      ready: okCount === required.length,
      okCount,
      totalCount: required.length,
      vscodeOpen: Boolean(raw.vscodeOpen),
      // The PC's build runs an account sign-in itself and reports its progress (the sign-in sheet needs that).
      signIn: raw.signIn === true,
      checks
    };
  }

  // Unsaved git working folders per PC (theo-hub unsaved-work.js, hourly theo-worktree-guard report), carried on
  // each fleet device entry like pcSetup. null = this PC has no report (older build, or none yet).
  const UNSAVED_WORK_MAX_ITEMS = 50;
  const UNSAVED_WORK_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
  const UNSAVED_WORK_OLD_AFTER_MS = 2 * 3600 * 1000;
  // opts.age (render time only): add the time since the check to each folder's idle hours and re-mark 24 h+, so a
  // report from a PC that has been off for days still shows true idle times. Stored copies keep the PC's values.
  function sanitizeFleetUnsavedWork(raw, now = Date.now(), opts = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const checkedAt = Math.max(0, Math.trunc(Number(raw.checkedAt) || 0));
    if (!checkedAt || now - checkedAt > UNSAVED_WORK_MAX_AGE_MS) return null;
    if (checkedAt - now > 10 * 60 * 1000) return null; // stamped in the future: would never age out
    const ageH = opts.age ? Math.max(0, now - checkedAt) / 3600000 : 0;
    const staleHoursRaw = Number(raw.staleHours);
    const staleHours = Number.isFinite(staleHoursRaw) && staleHoursRaw > 0 ? staleHoursRaw : 24;
    const clip = (v, max) =>
      String(v == null ? '' : v)
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .trim()
        .slice(0, max);
    const items = [];
    for (const it of Array.isArray(raw.items) ? raw.items : []) {
      if (!it || typeof it !== 'object') continue;
      const idle = it.idleHours == null ? NaN : Number(it.idleHours);
      const idleHours = Number.isFinite(idle) ? Math.max(0, idle) + ageH : null;
      items.push({
        repo: clip(it.repo, 40) || '?',
        branch: clip(it.branch, 60) || '-',
        where: clip(it.where, 40),
        why: clip(it.why, 60),
        path: clip(it.path, 180),
        idleHours,
        stale: Boolean(it.stale) || (idleHours != null && idleHours >= staleHours)
      });
      if (items.length >= UNSAVED_WORK_MAX_ITEMS) break;
    }
    const count = (v, fallback) => Math.max(0, Math.min(999, Math.trunc(Number(v ?? fallback) || 0)));
    const unsavedCount = Math.max(items.length, count(raw.unsavedCount, items.length));
    const listedStale = items.filter((i) => i.stale).length;
    let stalledWt = null;
    const rawSt =
      raw.stalledWt && typeof raw.stalledWt === 'object' && !Array.isArray(raw.stalledWt)
        ? raw.stalledWt
        : null;
    if (rawSt) {
      const stTsRaw =
        typeof rawSt.checkedAt === 'number' && Number.isFinite(rawSt.checkedAt)
          ? Math.max(0, Math.trunc(rawSt.checkedAt))
          : rawSt.checkedAt
            ? Math.max(0, Date.parse(String(rawSt.checkedAt)) || 0)
            : 0;
      const stCheckedAt = stTsRaw && stTsRaw - now <= 10 * 60 * 1000 ? stTsRaw : checkedAt;
      const stAgeH = opts.age ? Math.max(0, now - stCheckedAt) / 3600000 : 0;
      const stItems = [];
      for (const sit of Array.isArray(rawSt.items) ? rawSt.items : []) {
        if (!sit || typeof sit !== 'object') continue;
        const ah = sit.ageHours == null ? NaN : Number(sit.ageHours);
        const ageHours = Number.isFinite(ah) ? Math.max(0, ah) + stAgeH : null;
        stItems.push({
          repo: clip(sit.repo, 40) || '?',
          branch: clip(sit.branch, 60) || '-',
          sha: clip(sit.sha, 16),
          ageHours,
          ahead: Math.max(0, Math.min(999, Math.trunc(Number(sit.ahead) || 0))),
          subject: clip(sit.subject, 80)
        });
        if (stItems.length >= UNSAVED_WORK_MAX_ITEMS) break;
      }
      const stCount = Math.max(stItems.length, count(rawSt.stalledCount, stItems.length));
      if (stCount > 0 || stItems.length > 0) {
        const cutRaw = Number(rawSt.cutoffHours ?? rawSt.hours);
        stalledWt = {
          checkedAt: stCheckedAt,
          cutoffHours: Number.isFinite(cutRaw) && cutRaw >= 0 ? cutRaw : 24,
          stalledCount: stCount,
          items: stItems
        };
      }
    }
    return {
      checkedAt,
      staleHours,
      unsavedCount,
      // The PC's own count also covers folders past the 50 sent; aging can only add to it.
      staleCount: Math.min(unsavedCount, Math.max(listedStale, count(raw.staleCount, listedStale))),
      unchecked: count(raw.unchecked, 0),
      items,
      ...(stalledWt ? { stalledWt } : {})
    };
  }

  // Several copies of a PC's list reach the phone (its own fleet entry, host snapshots, other hosts' device lists).
  // The newest report wins; only the PC's own entry (authoritative) may clear it, and an older copy can never refill
  // a list the PC itself cleared.
  const uwAuthClearedAt = new Map();
  function mergeFleetUnsavedWork(devId, prev, incomingRaw, authoritative) {
    if (incomingRaw === undefined) return prev || null;
    const inc = sanitizeFleetUnsavedWork(incomingRaw);
    if (!inc) {
      if (authoritative) {
        uwAuthClearedAt.set(devId, Date.now());
        return null;
      }
      return prev || null;
    }
    if (authoritative) uwAuthClearedAt.delete(devId);
    if (!prev) {
      const clearedAt = uwAuthClearedAt.get(devId) || 0;
      return !authoritative && clearedAt && inc.checkedAt <= clearedAt ? null : inc;
    }
    return inc.checkedAt >= Number(prev.checkedAt || 0) ? inc : prev;
  }

  function sanitizeFleetHostHealth(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const clip = (v, max) =>
      String(v == null ? '' : v)
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .trim()
        .slice(0, max);
    const out = {};
    if (raw.hotSwapHold && typeof raw.hotSwapHold === 'object') {
      const h = raw.hotSwapHold;
      out.hotSwapHold = {
        held: Boolean(h.held),
        stage: clip(h.stage || h.version, 40),
        file: clip(h.file, 80),
        error: clip(h.error || h.reason, 220),
        since: Number(h.since || h.heldAt || h.updatedAt || 0)
      };
    }
    if (raw.autoReload && typeof raw.autoReload === 'object') {
      const ar = raw.autoReload;
      const failAt = Number(ar.failure?.firstAt || ar.canaryFailure?.at || 0);
      out.autoReload = {
        pending: Boolean(ar.pending ?? ar.pendingReload),
        state: clip(ar.state, 32),
        reasons: Array.isArray(ar.reasons) ? ar.reasons.map((x) => clip(x, 80)).filter(Boolean).slice(0, 4) : [],
        blockers: Array.isArray(ar.blockers)
          ? ar.blockers.map((b) => ({ code: clip(b?.code, 40), label: clip(b?.label || b?.code, 120) })).slice(0, 5)
          : [],
        since: Number(ar.since || 0),
        failure: failAt > 0 || ar.canaryFailure ? { firstAt: failAt || 1 } : null
      };
    }
    const skipMsg = clip(raw.skipMessage || raw.bridge?.skipMessage || raw.bridge?.patchSkipNotice, 360);
    if (skipMsg) out.skipMessage = skipMsg;
    if (raw.attachFailed || raw.bridge?.attachFailed) {
      out.attachFailed = true;
      out.bridgeMessage = clip(raw.bridgeMessage || raw.bridge?.message, 280);
    }
    if (raw.hasVsCodeUi) out.hasVsCodeUi = true;
    return Object.keys(out).length ? out : null;
  }

  function renderFleetPcSetupPillHtml(d) {
    const ps = d && d.pcSetup ? sanitizeFleetPcSetup(d.pcSetup) : null;
    if (!ps) return '';
    const hostLbl = String(d?.name || d?.id || 'Host').trim();
    if (ps.ok || ps.pendingCount === 0) {
      return ` <span class="fleet-setup-pill is-ready tabular" aria-label="${S.esc(hostLbl)} PC setup ready (${ps.okCount}/${ps.totalCount})">✓ ${ps.okCount}/${ps.totalCount}</span>`;
    }
    return ` <span class="fleet-setup-pill is-pending tabular" aria-label="${S.esc(hostLbl)}: ${ps.pendingCount} PC setup update(s) pending (${ps.okCount}/${ps.totalCount})">! ${ps.okCount}/${ps.totalCount}</span>`;
  }

  function getFleetStalledWtCount(d) {
    const uw = d && d.unsavedWork ? sanitizeFleetUnsavedWork(d.unsavedWork) : null;
    return uw && uw.stalledWt && uw.stalledWt.stalledCount > 0 ? uw.stalledWt.stalledCount : 0;
  }

  function renderFleetStalledWtPillHtml(d) {
    const cnt = getFleetStalledWtCount(d);
    if (!cnt) return '';
    const hostLbl = String(d?.name || d?.id || 'Host').trim();
    return ` <span class="fleet-stalled-pill tabular" aria-label="${S.esc(hostLbl)}: ${cnt} stalled wt/* branch(es)">⎇ ${cnt} wt/*</span>`;
  }

  // opts.authoritative: the list holds each PC's own entry (store device_states, or a host's own device), so a
  // null unsaved-work list there means "no report" rather than "not mentioned".
  function updateFleetDevices(list, opts = {}) {
    if (!Array.isArray(list)) return;
    for (const d of list) {
      if (!d || !d.id) continue;
      const prev = fleetDevicesMap.get(d.id) || {};
      const nextPcSetup =
        d.pcSetup !== undefined
          ? sanitizeFleetPcSetup(d.pcSetup)
          : prev.pcSetup || null;
      // Like pcSetup: a list that does not mention it (edge presence frames) keeps the last copy.
      const nextUnsavedWork = mergeFleetUnsavedWork(
        d.id,
        prev.unsavedWork || null,
        d.unsavedWork,
        Boolean(opts.authoritative)
      );
      // A list that does not carry it (edge presence frames, another host's copy) keeps the last report.
      const nextPwaReady =
        (d.pwaReady !== undefined ? sanitizeFleetPwaReady(d.pwaReady) : null) || prev.pwaReady || null;
      const nextHostHealth =
        d.hostHealth !== undefined
          ? sanitizeFleetHostHealth(d.hostHealth)
          : prev.hostHealth || null;
      fleetDevicesMap.set(d.id, {
        ...prev,
        ...d,
        id: d.id,
        name: d.name || prev.name || d.hostname || d.id,
        online: d.online !== undefined ? Boolean(d.online) : Boolean(prev.online),
        lastSeen: Number(d.lastSeen || d.updatedAt || prev.lastSeen || Date.now()),
        sessionCount: Number(
          d.sessionCount !== undefined ? d.sessionCount : prev.sessionCount || 0
        ),
        pcSetup: nextPcSetup,
        pwaReady: nextPwaReady,
        unsavedWork: nextUnsavedWork,
        hostHealth: nextHostHealth
      });
    }
  }

  function getUnifiedFleetDevices() {
    if (Array.isArray(S.appState?.devices)) {
      updateFleetDevices(S.appState.devices);
    }
    const stateDev = S.appState?.device || S.appState?.connection?.device;
    if (stateDev && stateDev.id) {
      updateFleetDevices([
        {
          ...stateDev,
          online: connMode === 'local' || connMode === 'edge' ? true : Boolean(stateDev.online),
          sessionCount: (S.appState?.rows || []).filter(
            (r) => !r.archived && (!r.deviceId || r.deviceId === stateDev.id)
          ).length
        }
      ]);
    }
    const all = Array.from(fleetDevicesMap.values());
    return S.rankByFreq(
      all,
      'devices',
      (d) => d.id,
      (d) => (d.local ? 500 : d.online ? 300 : 100) + Math.min(99, Number(d.sessionCount || 0))
    );
  }

  function storeHostSnapshotEntry(snap, hintDeviceId = '') {
    if (!snap || typeof snap !== 'object') return '';
    const devObj = snap.device || snap.connection?.device || {};
    const devId = String(hintDeviceId || devObj.id || 'primary-host').trim();
    const devName = String(
      devObj.name || snap.connection?.hostname || fleetDevicesMap.get(devId)?.name || devId
    ).trim();

    if (Array.isArray(snap.devices)) {
      updateFleetDevices(snap.devices);
    }

    const normalizedRows = (Array.isArray(snap.rows) ? snap.rows : [])
      .filter((r) => r && r.id)
      .map((r) => {
        const owner = inferFrontendRowDeviceId(r, devId, devName);
        return {
          ...r,
          deviceId: owner.id || devId,
          deviceName: owner.name || devName
        };
      });

    if (devId && devId !== 'primary-host') {
      updateFleetDevices([
        {
          ...devObj,
          id: devId,
          name: devName,
          hostname: snap.connection?.hostname || devObj.hostname || '',
          sessionCount: normalizedRows.filter((r) => !r.archived && r.deviceId === devId).length,
          lastSeen: Number(snap.generatedAt || Date.now()),
          ...(devObj.pcSetup || snap.pcSetup ? { pcSetup: devObj.pcSetup || snap.pcSetup } : {})
        }
      ], { authoritative: true });
    }

    const prevSnap = hostSnapshotsByDevice.get(devId) || {};
    hostSnapshotsByDevice.set(devId, {
      ...prevSnap,
      ...snap,
      device: { ...devObj, id: devId, name: devName },
      rows: normalizedRows,
      approvals: Array.isArray(snap.approvals)
        ? snap.approvals.map((a) => ({
            ...a,
            deviceId: a.deviceId || devId,
            deviceName: a.deviceName || devName
          }))
        : prevSnap.approvals || [],
      workspaces: Array.isArray(snap.workspaces)
        ? snap.workspaces.map((w) => ({
            ...w,
            deviceId: w.deviceId || devId,
            deviceName: w.deviceName || devName
          }))
        : prevSnap.workspaces || [],
      groups: Array.isArray(snap.groups) ? snap.groups : prevSnap.groups || [],
      providers: snap.providers || prevSnap.providers || null,
      accountOrder: Array.isArray(snap.accountOrder) ? snap.accountOrder : prevSnap.accountOrder || [],
      summary: snap.summary || prevSnap.summary || null,
      summaryByProvider: snap.summaryByProvider || prevSnap.summaryByProvider || null,
      topSessions: Array.isArray(snap.topSessions) ? snap.topSessions : prevSnap.topSessions || [],
      generatedAt: Number(snap.generatedAt || Date.now())
    });

    if (snap.providers) {
      hasProvidersHydrated = true;
    }
    return devId;
  }

  function rebuildUnifiedAppState(preferredDeviceId = '') {
    if (hostSnapshotsByDevice.size === 0) return S.appState;
    const entries = Array.from(hostSnapshotsByDevice.entries()).sort((a, b) => {
      const aLocal = localWsDevice?.id && a[0] === localWsDevice.id ? 1 : 0;
      const bLocal = localWsDevice?.id && b[0] === localWsDevice.id ? 1 : 0;
      if (aLocal !== bLocal) return bLocal - aLocal;
      return Number(b[1]?.generatedAt || 0) - Number(a[1]?.generatedAt || 0);
    });

    const primarySnap =
      (preferredDeviceId && hostSnapshotsByDevice.get(preferredDeviceId)) ||
      (localWsDevice?.id && hostSnapshotsByDevice.get(localWsDevice.id)) ||
      entries[0][1];

    const rowMap = new Map();
    const appMap = new Map();
    const wsMap = new Map();
    const grpMap = new Map();
    let maxGeneratedAt = 0;
    let chosenProviders = primarySnap?.providers || null;
    let chosenAccountOrder = Array.isArray(primarySnap?.accountOrder) ? primarySnap.accountOrder : [];
    let chosenSummary = primarySnap?.summary || null;
    let chosenSummaryByProv = primarySnap?.summaryByProvider || null;
    let chosenTopSessions = Array.isArray(primarySnap?.topSessions) ? primarySnap.topSessions : [];
    let bestModelCatalog = primarySnap?.antigravityModelCatalog || null;
    let bestClaudeCatalog = primarySnap?.claudeModelCatalog || null;
    let bestClaudeMode = S.extractClaudeModeFields(
      primarySnap?.claudePermissionMode || primarySnap?.connection?.claudePermissionMode
    );
    let bestHide3p =
      typeof primarySnap?.hideThirdPartyQuota === 'boolean'
        ? {
            value: primarySnap.hideThirdPartyQuota,
            updatedAt: Number(primarySnap.hideThirdPartyQuotaUpdatedAt || 0)
          }
        : null;
    let bestHideDesktop =
      typeof primarySnap?.hideClaudeDesktop === 'boolean'
        ? {
            value: primarySnap.hideClaudeDesktop,
            updatedAt: Number(primarySnap.hideClaudeDesktopUpdatedAt || 0)
          }
        : null;

    let activePendingLogin =
      primarySnap?.pendingAccountLogin?.active ? primarySnap.pendingAccountLogin : null;
    for (const [devId, snap] of entries) {
      maxGeneratedAt = Math.max(maxGeneratedAt, Number(snap?.generatedAt || 0));
      if (!activePendingLogin && snap?.pendingAccountLogin?.active) {
        activePendingLogin = { ...snap.pendingAccountLogin, hostId: snap.pendingAccountLogin.hostId || devId };
      }
      if (typeof snap?.hideThirdPartyQuota === 'boolean') {
        const candAt = Number(snap.hideThirdPartyQuotaUpdatedAt || 0);
        if (!bestHide3p || candAt > bestHide3p.updatedAt) {
          bestHide3p = { value: snap.hideThirdPartyQuota, updatedAt: candAt };
        }
      }
      if (typeof snap?.hideClaudeDesktop === 'boolean') {
        const candAt = Number(snap.hideClaudeDesktopUpdatedAt || 0);
        if (!bestHideDesktop || candAt > bestHideDesktop.updatedAt) {
          bestHideDesktop = { value: snap.hideClaudeDesktop, updatedAt: candAt };
        }
      }
      const candMode = S.extractClaudeModeFields(
        snap?.claudePermissionMode || snap?.connection?.claudePermissionMode
      );
      if (candMode) {
        if (
          !bestClaudeMode ||
          candMode.rev > bestClaudeMode.rev ||
          (candMode.rev === bestClaudeMode.rev && candMode.updatedAt > bestClaudeMode.updatedAt)
        ) {
          bestClaudeMode = candMode;
        }
      }
      if (!chosenProviders && snap?.providers) chosenProviders = snap.providers;
      if (!chosenAccountOrder.length && Array.isArray(snap?.accountOrder) && snap.accountOrder.length) {
        chosenAccountOrder = snap.accountOrder;
      }
      if ((!chosenSummary || !Number(chosenSummary?.week?.tokens || 0)) && snap?.summary) {
        chosenSummary = snap.summary;
      }
      if (!chosenSummaryByProv && snap?.summaryByProvider) {
        chosenSummaryByProv = snap.summaryByProvider;
      }
      if (!chosenTopSessions.length && Array.isArray(snap?.topSessions) && snap.topSessions.length) {
        chosenTopSessions = snap.topSessions;
      }

      if (
        snap?.antigravityModelCatalog &&
        Array.isArray(snap.antigravityModelCatalog.models) &&
        (!bestModelCatalog ||
          Number(snap.antigravityModelCatalog.updatedAt || 0) >= Number(bestModelCatalog.updatedAt || 0))
      ) {
        bestModelCatalog = snap.antigravityModelCatalog;
      }
      if (
        snap?.claudeModelCatalog &&
        Array.isArray(snap.claudeModelCatalog.models) &&
        (!bestClaudeCatalog ||
          Number(snap.claudeModelCatalog.updatedAt || 0) >= Number(bestClaudeCatalog.updatedAt || 0))
      ) {
        bestClaudeCatalog = snap.claudeModelCatalog;
      }

      for (const r of snap.rows || []) {
        if (!r || !r.id) continue;
        const prev = rowMap.get(r.id);
        if (!prev) {
          rowMap.set(r.id, { ...r });
        } else {
          const rAt = Number(r.at || 0);
          const pAt = Number(prev.at || 0);
          const rOwned = r.deviceId === devId;
          const pOwned = prev.deviceId !== r.deviceId;
          const rWinsRow = rAt > pAt || (rAt === pAt && rOwned && pOwned);
          const effArchived = rWinsRow ? Boolean(r.archived) : Boolean(prev.archived);
          const rChatUpd = Number(r.pinUpdatedAt || (r.pinned ? r.pinnedAt || 1 : 0));
          const pChatUpd = Number(prev.pinUpdatedAt || (prev.pinned ? prev.pinnedAt || 1 : 0));
          let winChatPinned = Boolean(prev.pinned && !effArchived);
          let winChatPinnedAt = winChatPinned ? Number(prev.pinnedAt || 0) : 0;
          let winChatPinUpd = pChatUpd;
          if (effArchived) {
            winChatPinned = false;
            winChatPinnedAt = 0;
            winChatPinUpd = Math.max(rChatUpd, pChatUpd);
          } else if (
            rChatUpd > pChatUpd ||
            (rChatUpd === pChatUpd && rChatUpd > 0 && !r.pinned && Boolean(prev.pinned))
          ) {
            winChatPinned = Boolean(r.pinned);
            winChatPinnedAt = winChatPinned ? Number(r.pinnedAt || rChatUpd || 1) : 0;
            winChatPinUpd = rChatUpd;
          }
          if (rWinsRow) {
            rowMap.set(r.id, {
              ...prev,
              ...r,
              pinned: winChatPinned,
              pinnedAt: winChatPinnedAt,
              pinUpdatedAt: winChatPinUpd
            });
          } else if (winChatPinUpd > pChatUpd || winChatPinned !== Boolean(prev.pinned)) {
            rowMap.set(r.id, {
              ...prev,
              pinned: winChatPinned,
              pinnedAt: winChatPinnedAt,
              pinUpdatedAt: winChatPinUpd
            });
          }
        }
      }

      for (const a of snap.approvals || []) {
        if (!a) continue;
        const aKey = String(a.id || a.approvalId || `${devId}:${a.sessionId || ''}`);
        if (aKey && !appMap.has(aKey)) {
          appMap.set(aKey, { ...a });
        }
      }

      for (const w of snap.workspaces || []) {
        if (!w || !w.id) continue;
        const prevW = wsMap.get(w.id);
        if (!prevW || w.deviceId === localWsDevice?.id || Number(snap.generatedAt || 0) >= Number(prevW._snapAt || 0)) {
          wsMap.set(w.id, { ...w, _snapAt: Number(snap.generatedAt || 0) });
        }
      }

      for (const g of snap.groups || []) {
        if (g && g.id && !grpMap.has(g.id)) {
          grpMap.set(g.id, { ...g });
        }
      }
    }

    if (bestClaudeMode) {
      S.ingestClaudePermissionModeDoc(bestClaudeMode, { fromHostSnapshot: true });
    }
    if (bestModelCatalog) {
      S.ingestLiveAntigravityCatalog(bestModelCatalog);
      S.syncDefaultModelPrefsIfAuto('antigravity');
    }
    if (bestClaudeCatalog) {
      S.ingestLiveClaudeCatalog(bestClaudeCatalog);
      S.syncDefaultModelPrefsIfAuto('claude');
    }

    return {
      ...primarySnap,
      generatedAt: maxGeneratedAt || Date.now(),
      rows: Array.from(rowMap.values()).sort(
        (a, b) =>
          (S.isRowPinned(b) ? 1 : 0) - (S.isRowPinned(a) ? 1 : 0) ||
          Number(b.at || 0) - Number(a.at || 0) ||
          Number(b.pinnedAt || 0) - Number(a.pinnedAt || 0)
      ),
      approvals: Array.from(appMap.values()),
      workspaces: Array.from(wsMap.values()),
      groups: Array.from(grpMap.values()),
      providers: chosenProviders || S.appState?.providers || {},
      accountOrder: chosenAccountOrder.length ? chosenAccountOrder : S.appState?.accountOrder || [],
      summary: chosenSummary || S.appState?.summary || null,
      summaryByProvider: chosenSummaryByProv || S.appState?.summaryByProvider || null,
      topSessions: chosenTopSessions.length ? chosenTopSessions : S.appState?.topSessions || [],
      antigravityModelCatalog: bestModelCatalog || S.appState?.antigravityModelCatalog || null,
      claudeModelCatalog: bestClaudeCatalog || S.appState?.claudeModelCatalog || null,
      claudePermissionMode: { ...S.claudeModeState },
      pendingAccountLogin: activePendingLogin || null,
      ...(bestHide3p
        ? {
            hideThirdPartyQuota: bestHide3p.value,
            hideThirdPartyQuotaUpdatedAt: bestHide3p.updatedAt
          }
        : {}),
      ...(bestHideDesktop
        ? {
            hideClaudeDesktop: bestHideDesktop.value,
            hideClaudeDesktopUpdatedAt: bestHideDesktop.updatedAt
          }
        : {})
    };
  }

  function ingestIncomingHostState(st, sourceDeviceId = '') {
    if (!st || typeof st !== 'object') return;
    if (st.antigravityModelCatalog) {
      S.ingestLiveAntigravityCatalog(st.antigravityModelCatalog);
      S.syncDefaultModelPrefsIfAuto('antigravity');
    }
    if (st.claudeModelCatalog) {
      S.ingestLiveClaudeCatalog(st.claudeModelCatalog);
      S.syncDefaultModelPrefsIfAuto('claude');
    }
    const directMode = st.claudePermissionMode || st.connection?.claudePermissionMode;
    if (directMode) {
      S.ingestClaudePermissionModeDoc(directMode, { fromHostSnapshot: true });
    }
    const devId = storeHostSnapshotEntry(st, sourceDeviceId);
    const nextState = rebuildUnifiedAppState(devId) || st;
    nextState.claudePermissionMode = { ...S.claudeModeState };

    const nowMs = Date.now();
    if (S.pendingHideThirdPartyQuota) {
      if (nowMs >= S.pendingHideThirdPartyQuota.expiresAt) {
        S.pendingHideThirdPartyQuota = null;
      } else if (
        typeof st.hideThirdPartyQuota === 'boolean' &&
        st.hideThirdPartyQuota === S.pendingHideThirdPartyQuota.value &&
        Number(st.hideThirdPartyQuotaUpdatedAt || 0) >= S.pendingHideThirdPartyQuota.startedAt
      ) {
        S.pendingHideThirdPartyQuota = null;
      } else {
        nextState.hideThirdPartyQuota = S.pendingHideThirdPartyQuota.value;
        nextState.hideThirdPartyQuotaUpdatedAt = S.pendingHideThirdPartyQuota.startedAt;
      }
    }
    if (!S.pendingHideThirdPartyQuota) {
      const snapUpdatedAt = Number(nextState.hideThirdPartyQuotaUpdatedAt || 0);
      const localUpdatedAt = Number(S.prefs.hideThirdPartyQuotaUpdatedAt || 0);
      if (
        typeof nextState.hideThirdPartyQuota === 'boolean' &&
        (typeof S.prefs.hideThirdPartyQuota !== 'boolean' ||
          snapUpdatedAt > localUpdatedAt ||
          (localUpdatedAt === 0 && typeof st.hideThirdPartyQuota === 'boolean'))
      ) {
        if (
          S.prefs.hideThirdPartyQuota !== nextState.hideThirdPartyQuota ||
          (snapUpdatedAt > 0 && localUpdatedAt !== snapUpdatedAt)
        ) {
          S.prefs.hideThirdPartyQuota = nextState.hideThirdPartyQuota;
          if (snapUpdatedAt > 0) S.prefs.hideThirdPartyQuotaUpdatedAt = snapUpdatedAt;
          S.saveJson(S.STORAGE_KEYS.PREFS, S.prefs);
        }
      } else if (typeof S.prefs.hideThirdPartyQuota === 'boolean') {
        nextState.hideThirdPartyQuota = S.prefs.hideThirdPartyQuota;
        nextState.hideThirdPartyQuotaUpdatedAt = localUpdatedAt;
      }
    }

    if (S.pendingHideClaudeDesktop) {
      if (nowMs >= S.pendingHideClaudeDesktop.expiresAt) {
        S.pendingHideClaudeDesktop = null;
      } else if (
        typeof st.hideClaudeDesktop === 'boolean' &&
        st.hideClaudeDesktop === S.pendingHideClaudeDesktop.value &&
        Number(st.hideClaudeDesktopUpdatedAt || 0) >= S.pendingHideClaudeDesktop.startedAt
      ) {
        S.pendingHideClaudeDesktop = null;
      } else {
        nextState.hideClaudeDesktop = S.pendingHideClaudeDesktop.value;
        nextState.hideClaudeDesktopUpdatedAt = S.pendingHideClaudeDesktop.startedAt;
      }
    }
    if (!S.pendingHideClaudeDesktop) {
      const snapDeskAt = Number(nextState.hideClaudeDesktopUpdatedAt || 0);
      const localDeskAt = Number(S.prefs.hideClaudeDesktopUpdatedAt || 0);
      if (
        typeof nextState.hideClaudeDesktop === 'boolean' &&
        (typeof S.prefs.hideClaudeDesktop !== 'boolean' ||
          snapDeskAt > localDeskAt ||
          (localDeskAt === 0 && typeof st.hideClaudeDesktop === 'boolean'))
      ) {
        if (
          S.prefs.hideClaudeDesktop !== nextState.hideClaudeDesktop ||
          (snapDeskAt > 0 && localDeskAt !== snapDeskAt)
        ) {
          S.prefs.hideClaudeDesktop = nextState.hideClaudeDesktop;
          if (snapDeskAt > 0) S.prefs.hideClaudeDesktopUpdatedAt = snapDeskAt;
          S.saveJson(S.STORAGE_KEYS.PREFS, S.prefs);
        }
      } else if (typeof S.prefs.hideClaudeDesktop === 'boolean') {
        nextState.hideClaudeDesktop = S.prefs.hideClaudeDesktop;
        nextState.hideClaudeDesktopUpdatedAt = localDeskAt;
      }
    }

    for (const [tid, live] of liveStreamsByThreadId.entries()) {
      if (live && live.status === 'working' && Date.now() - Number(live.receivedAt || 0) < 45000) {
        const matchRow = (nextState.rows || []).find((r) => r && r.id === tid);
        if (matchRow) {
          matchRow.status = 'working';
          matchRow.statusLabel = 'Streaming Live';
          matchRow.dot = 'running';
        }
      }
    }

    S.applyStoppedSessionOverrides(nextState);
    S.applyAnsweredQuestionOverrides(nextState);
    S.applyPendingLocalOverrides(nextState);
    S.checkLiveStateNotifications(nextState);
    S.appState = nextState;
    S.reconcilePendingNewSessionBind(nextState, lastCloudQueue);
    persistCache();
    S.renderAll();

    if (!S.isHeadlessBrowser) {
      const watchedIds = [
        S.prefs.selectedThreadId,
        S.prefs.splitWatchOpen ? S.prefs.splitWatchThreadId : ''
      ].filter((id) => id && id !== '__new__' && !String(id).startsWith('draft-new-'));
      const nowMs = Date.now();
      for (const tid of watchedIds) {
        const row = (nextState.rows || []).find((r) => r && r.id === tid);
        if (!row) continue;
        const rowStamp = `${row.status || ''}:${row.stepCount || 0}:${row.at || 0}:${String(row.preview || '').slice(0, 64)}`;
        const prevStamp = lastSeenThreadStepStampById.get(tid) || '';
        S.setBoundedMap(lastSeenThreadStepStampById, tid, rowStamp);
        const isWorking = Boolean(row.status === 'working' || row.dot === 'running');
        const stampChanged = Boolean(prevStamp && rowStamp !== prevStamp);
        if (
          (isWorking || stampChanged) &&
          nowMs - (lastThreadDetailFetchAtById.get(tid) || 0) >= 950 &&
          nowMs - (lastThreadDetailReceivedAtById.get(tid) || 0) >= 800
        ) {
          S.setBoundedMap(lastThreadDetailFetchAtById, tid, nowMs);
          fetchThreadDetail(tid, row.provider || '').catch(() => {});
        }
      }
    }
  }

  function ingestIncomingThreadDetailFrame(msg) {
    const tObj = msg?.thread?.thread || msg?.thread || msg?.detail || null;
    const tid = String(msg?.threadId || msg?.id || tObj?.id || '').trim();
    if (!tid || !tObj || typeof tObj !== 'object') return false;
    S.setBoundedMap(lastThreadDetailReceivedAtById, tid, Date.now());
    mergeRemoteThreads({ [tid]: tObj });
    persistCache();
    if (S.prefs.activeTab === 'chat' && S.prefs.selectedThreadId === tid) {
      S.renderChatView(false);
    } else if (
      S.prefs.activeTab === 'chat' &&
      S.prefs.splitWatchOpen &&
      S.prefs.splitWatchThreadId === tid
    ) {
      S.renderSplitWatchPane();
    }
    return true;
  }

  function patchLiveStreamingDom(tid) {
    streamDomRafId = 0;
    if (S.prefs.activeTab !== 'chat' || S.prefs.selectedThreadId !== tid) {
      return;
    }
    const streamEl = S.$('chat-stream');
    if (!streamEl) return;
    const turnEl = streamEl.querySelector('[data-streaming-turn="1"]');
    const live = liveStreamsByThreadId.get(tid);
    if (!turnEl || !live) {
      S.renderChatView(false);
      return;
    }
    const wasNearBottom = streamEl.scrollHeight - streamEl.scrollTop - streamEl.clientHeight < 120;
    const thinkWrap = turnEl.querySelector('[data-stream-think-wrap]');
    const thinkBody = turnEl.querySelector('[data-stream-think-body]');
    const textWrap = turnEl.querySelector('[data-stream-text-body]');
    const toolSlot = turnEl.querySelector('[data-stream-tool-slot]');
    const statusLbl = turnEl.querySelector('[data-stream-status-lbl]');

    if (thinkWrap && thinkBody) {
      if (live.fullThinking) {
        thinkWrap.hidden = false;
        thinkBody.innerHTML = S.formatTurnMarkdown(live.fullThinking);
        const thinkPrev = turnEl.querySelector('[data-stream-think-preview]');
        if (thinkPrev) {
          const lastLine = String(live.fullThinking)
            .trim()
            .split(/\n+/)
            .filter(Boolean)
            .pop() || '';
          thinkPrev.textContent = lastLine.replace(/[*`#_>]+/g, '').trim().slice(0, 96);
        }
      } else {
        thinkWrap.hidden = true;
      }
    }
    if (toolSlot) {
      if (live.activeTool && live.status === 'working') {
        toolSlot.hidden = false;
        toolSlot.textContent = `⚡ ${live.activeTool}`;
      } else {
        toolSlot.hidden = true;
      }
    }
    if (textWrap) {
      const rendered = live.fullText ? S.formatTurnMarkdown(live.fullText) : '';
      const cursor = live.status === 'working' ? '<span class="stream-cursor"></span>' : '';
      textWrap.innerHTML = rendered + cursor;
    }
    if (statusLbl) {
      if (live.status === 'working') {
        statusLbl.textContent = `⚡ Live Stream${live.deviceName ? ` · ${live.deviceName}` : ''}`;
      } else if (live.status === 'failed' || live.status === 'error') {
        statusLbl.textContent = `⚠️ Stream Failed${live.error ? `: ${String(live.error).slice(0, 90)}` : ''}`;
      } else if (live.status === 'cancelled' || live.status === 'stopped') {
        statusLbl.textContent = '⏹ Stream Stopped';
      } else {
        statusLbl.textContent = '✓ Stream Complete';
      }
    }
    if (live.status !== 'working') {
      turnEl.classList.remove('is-streaming');
      if (thinkWrap) {
        thinkWrap.classList.remove('is-streaming');
        const lbl = thinkWrap.querySelector('.vs-thought-lbl');
        if (lbl) lbl.textContent = 'Thought process';
      }
    }
    if (wasNearBottom) {
      streamEl.scrollTop = streamEl.scrollHeight;
    }
    S.updateComposerActionButton();
  }

  function handleStreamDelta(rawDelta) {
    const delta = rawDelta?.delta && typeof rawDelta.delta === 'object' ? rawDelta.delta : rawDelta;
    if (!delta || typeof delta !== 'object') return;
    const prov = delta.provider === 'claude' ? 'claude' : 'antigravity';
    const realId = cleanTargetThreadId(delta.realThreadId || delta.threadId || '');
    const draftId = String(delta.draftThreadId || delta.draftId || '').trim();

    if (realId && S.pendingNewSessionBind) {
      const wantDev = S.pendingNewSessionBind.targetDeviceId || '';
      const deltaDev = String(delta.deviceId || '').trim();
      const devMatches = !wantDev || !deltaDev || wantDev === deltaDev;
      const matchesDraft =
        (draftId && S.pendingNewSessionBind.draftThreadId === draftId) ||
        (devMatches &&
          S.pendingNewSessionBind.provider === prov &&
          Date.now() - Number(S.pendingNewSessionBind.createdAt || 0) < 35000 &&
          !(S.pendingNewSessionBind.knownIds && S.pendingNewSessionBind.knownIds.has(realId)));
      if (matchesDraft) {
        S.bindDraftThreadToRealSession(S.pendingNewSessionBind.draftThreadId, realId, prov);
      }
    }

    const tid = realId || draftId || String(delta.runKey || delta.runId || '').trim();
    if (!tid) return;

    const mergedDelta = {
      ...(liveStreamsByThreadId.get(tid) || {}),
      ...delta,
      provider: prov,
      receivedAt: Date.now()
    };
    liveStreamsByThreadId.set(tid, mergedDelta);

    if (S.appState && Array.isArray(S.appState.rows)) {
      let row = S.appState.rows.find((r) => r && r.id === tid);
      if (!row && realId) {
        row = {
          id: realId,
          title: String(delta.prompt || delta.title || 'Live Session').slice(0, 64),
          provider: prov,
          folder: delta.folder || delta.workspaceName || '',
          model: delta.model || '',
          group: S.pendingRowOverrides.get(realId)?.group || '',
          deviceId: delta.deviceId || '',
          deviceName: delta.deviceName || '',
          status: 'working',
          statusLabel: 'Streaming Live',
          dot: 'running',
          at: Date.now()
        };
        S.appState.rows.unshift(row);
        S.appState.rows.sort(S.compareRowsPinnedFirst);
      } else if (row) {
        row.at = Date.now();
        S.noteRowOverride(row.id, { lastWorkedAt: row.at });
        if (delta.deviceId) row.deviceId = delta.deviceId;
        if (delta.deviceName) row.deviceName = delta.deviceName;
        if (delta.status === 'working') {
          row.status = 'working';
          row.statusLabel = 'Streaming Live';
          row.dot = 'running';
        } else if (delta.status === 'failed' || delta.status === 'error') {
          row.status = 'completed';
          row.statusLabel = 'Failed';
          row.dot = row.open ? 'idle' : null;
        } else if (delta.status === 'done' || delta.status === 'completed') {
          row.status = 'completed';
          row.statusLabel = 'Completed';
          row.dot = row.open ? 'idle' : null;
        }
        S.appState.rows.sort(S.compareRowsPinnedFirst);
      }
    }

    if (!S.threadsCache[tid]) {
      S.threadsCache[tid] = {
        id: tid,
        provider: prov,
        title: String(delta.title || 'Live Session').slice(0, 64),
        messages: []
      };
    }
    const msgs = Array.isArray(S.threadsCache[tid].messages) ? S.threadsCache[tid].messages : [];
    const streamMsgId = `stream-${delta.runKey || delta.runId || tid}`;
    let streamMsg = msgs.find((m) => m && (m.id === streamMsgId || m.isStreaming));
    const isWorking = delta.status === 'working';
    const incomingTrimmed = String(mergedDelta.fullText || '').trim();
    const lastNonStreamAssistant = [...msgs]
      .reverse()
      .find((m) => m && m.role === 'assistant' && m.id !== streamMsgId && !m.isStreaming);
    const alreadyPersisted = Boolean(
      !isWorking &&
        incomingTrimmed &&
        lastNonStreamAssistant &&
        String(lastNonStreamAssistant.text || '').trim() === incomingTrimmed
    );

    if (!streamMsg && !alreadyPersisted) {
      streamMsg = {
        id: streamMsgId,
        role: 'assistant',
        createdAt: new Date().toISOString(),
        text: mergedDelta.fullText || '',
        thinking: mergedDelta.fullThinking || '',
        toolCalls: Array.isArray(mergedDelta.toolSteps) ? mergedDelta.toolSteps : [],
        activeTool: mergedDelta.activeTool || '',
        deviceName: mergedDelta.deviceName || '',
        isStreaming: isWorking
      };
      msgs.push(streamMsg);
    } else if (streamMsg) {
      if (mergedDelta.fullText !== undefined) streamMsg.text = mergedDelta.fullText;
      if (mergedDelta.fullThinking !== undefined) streamMsg.thinking = mergedDelta.fullThinking;
      if (Array.isArray(mergedDelta.toolSteps)) streamMsg.toolCalls = mergedDelta.toolSteps;
      streamMsg.activeTool = isWorking ? mergedDelta.activeTool || '' : '';
      streamMsg.isStreaming = isWorking;
      if (mergedDelta.deviceName) streamMsg.deviceName = mergedDelta.deviceName;
    }
    S.threadsCache[tid].messages = msgs;

    if (!isWorking) {
      setTimeout(() => {
        fetchThreadDetail(tid, prov)
          .then((loaded) => {
            if (loaded && Array.isArray(loaded.messages) && loaded.messages.length > 0) {
              const curLive = liveStreamsByThreadId.get(tid);
              if (curLive && curLive.status !== 'working') {
                liveStreamsByThreadId.delete(tid);
              }
            }
          })
          .catch(() => {});
        S.renderPulseView();
        S.renderSessionsView();
      }, 450);
    }

    if (S.prefs.activeTab === 'chat' && S.prefs.selectedThreadId === tid) {
      streamDomTargetTid = tid;
      if (!streamDomRafId) {
        streamDomRafId = requestAnimationFrame(() => patchLiveStreamingDom(streamDomTargetTid));
      }
    } else if (S.prefs.activeTab === 'chat' && S.prefs.splitWatchOpen && S.prefs.splitWatchThreadId === tid) {
      S.renderSplitWatchPane();
      if (!isWorking) {
        S.renderIdeSidebar();
        S.syncAndRenderEditorTabs();
      }
    } else if (!isWorking) {
      S.renderPulseView();
      S.renderSessionsView();
    }
  }

  function rejectPendingRpcsForSocket(wsConn, reason = 'ws_closed') {
    for (const [reqId, pending] of Array.from(wsPendingRpcs.entries())) {
      if (!wsConn || pending.ws === wsConn) {
        clearTimeout(pending.timer);
        wsPendingRpcs.delete(reqId);
        pending.reject(new Error(reason));
      }
    }
  }

  function sendWsRpc(wsConn, framePayload, timeoutMs = 9000) {
    return new Promise((resolve, reject) => {
      if (!wsConn || wsConn.readyState !== 1) {
        reject(new Error('ws_not_open'));
        return;
      }
      const reqId = `rpc-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
      const timer = setTimeout(() => {
        wsPendingRpcs.delete(reqId);
        reject(new Error('ws_rpc_timeout'));
      }, timeoutMs);
      wsPendingRpcs.set(reqId, { resolve, reject, timer, ws: wsConn });
      try {
        wsConn.send(JSON.stringify({ ...framePayload, reqId }));
      } catch (err) {
        clearTimeout(timer);
        wsPendingRpcs.delete(reqId);
        reject(err);
      }
    });
  }

  const wsBaselineBySocket = new WeakMap();
  const wsDeltaStats = {
    stateFrames: 0,
    patchFrames: 0,
    patchedRows: 0,
    resyncRequests: 0,
    lastSeq: 0,
    edgeSuppressedForLocal: 0,
    prewarmHintsSent: 0
  };

  const PREWARM_HINT_MIN_INTERVAL_MS = 12000;
  const PREWARM_HINT_PENDING_TTL_MS = 45000;
  const lastPrewarmHintById = new Map();
  let pendingPrewarmHint = null;

  function flushPendingPrewarmHint() {
    if (!pendingPrewarmHint) return false;
    const item = pendingPrewarmHint;
    pendingPrewarmHint = null;
    if (
      !item ||
      !item.threadId ||
      Date.now() - Number(item.at || 0) > PREWARM_HINT_PENDING_TTL_MS ||
      S.isPinLocked()
    ) {
      return false;
    }
    const stillActive =
      item.threadId === S.prefs.selectedThreadId || item.threadId === S.prefs.splitWatchThreadId;
    if (!stillActive) return false;
    return emitPrewarmHint(item.threadId, { ...(item.opts || {}), noQueue: true });
  }

  function emitPrewarmHint(threadId, opts = {}) {
    if ((S.isHeadlessBrowser && !window.__THEO_ALLOW_MOCK_WS) || S.isPinLocked()) {
      return false;
    }
    const cleanTid = String(threadId || '')
      .trim()
      .replace(/^(?:antigravity|claude):/, '');
    if (
      !cleanTid ||
      cleanTid === '__new__' ||
      cleanTid === '__new_claude__' ||
      cleanTid.startsWith('cmd-') ||
      cleanTid.startsWith('draft-') ||
      !/^[A-Za-z0-9._:-]{1,160}$/.test(cleanTid)
    ) {
      return false;
    }
    const now = Date.now();
    if (!opts.force) {
      const lastSent = Number(lastPrewarmHintById.get(cleanTid) || 0);
      if (now - lastSent < PREWARM_HINT_MIN_INTERVAL_MS) {
        return false;
      }
    }
    const matchedRow = (S.appState?.rows || []).find((r) => r && r.id === cleanTid) || null;
    const rowDeviceId = String(opts.targetDeviceId || matchedRow?.deviceId || '').trim();
    const resolvedProv = String(opts.provider || matchedRow?.provider || '').trim();
    const isRemotePeerRow = Boolean(
      rowDeviceId && localWsDevice?.id && rowDeviceId !== localWsDevice.id
    );
    const frame = {
      type: 'prewarm_hint',
      threadId: cleanTid,
      ...(resolvedProv ? { provider: resolvedProv } : {}),
      ...(rowDeviceId ? { targetDeviceId: rowDeviceId } : {}),
      source: String(opts.source || 'tap').trim().slice(0, 32),
      ts: now
    };
    let transportSent = false;
    if (!isRemotePeerRow && localWsAuthed && localWs && localWs.readyState === 1) {
      try {
        localWs.send(JSON.stringify(frame));
        transportSent = 'local';
      } catch {}
    } else if (edgeWsAuthed && edgeWs && edgeWs.readyState === 1) {
      try {
        edgeWs.send(JSON.stringify({ ...frame, targetDeviceId: rowDeviceId || 'auto' }));
        transportSent = 'edge';
      } catch {}
    } else if (localWsAuthed && localWs && localWs.readyState === 1) {
      try {
        localWs.send(JSON.stringify(frame));
        transportSent = 'local-forward';
      } catch {}
    }
    if (!transportSent) {
      if (!opts.noQueue) {
        pendingPrewarmHint = {
          threadId: cleanTid,
          opts: { ...opts, noQueue: true },
          at: now
        };
      }
      return false;
    }
    if (pendingPrewarmHint && pendingPrewarmHint.threadId === cleanTid) {
      pendingPrewarmHint = null;
    }
    S.setBoundedMap(lastPrewarmHintById, cleanTid, now, 64);
    wsDeltaStats.prewarmHintsSent += 1;
    return transportSent;
  }

  function getSocketBaselineMap(ws) {
    if (!ws || typeof ws !== 'object') return null;
    let map = wsBaselineBySocket.get(ws);
    if (!map) {
      map = new Map();
      wsBaselineBySocket.set(ws, map);
    }
    return map;
  }

  function cloneBaselineSnapshot(snap) {
    if (!snap || typeof snap !== 'object') return null;
    return {
      ...snap,
      rows: Array.isArray(snap.rows)
        ? snap.rows.map((r) => (r && typeof r === 'object' ? { ...r } : r))
        : []
    };
  }

  function isLocalWsAuthoritativeForDevice(devId) {
    const cleanId = String(devId || '').trim();
    if (!cleanId || !localWsAuthed || !localWs || localWs.readyState !== 1) {
      return false;
    }
    if (localWsDevice?.id && String(localWsDevice.id).trim() === cleanId) {
      return true;
    }
    return Boolean(wsBaselineBySocket.get(localWs)?.has(cleanId));
  }

  function recordWsFullState(ws, snap, fallbackDevId = '', seq = null, transport = 'local') {
    if (!snap || typeof snap !== 'object') return false;
    const devId = String(snap?.device?.id || fallbackDevId || localWsDevice?.id || '').trim();
    const mapKey = devId || '__default__';
    const sockMap = getSocketBaselineMap(ws);
    if (sockMap) {
      const prevEntry = sockMap.get(mapKey);
      const nextSeq = typeof seq === 'number' && Number.isFinite(seq) ? seq : null;
      sockMap.set(mapKey, {
        seq: nextSeq,
        snapshot: cloneBaselineSnapshot(snap),
        lastResyncReqAt: nextSeq === null ? Number(prevEntry?.lastResyncReqAt || 0) : 0
      });
    }
    wsDeltaStats.stateFrames += 1;
    if (typeof seq === 'number' && Number.isFinite(seq)) {
      wsDeltaStats.lastSeq = seq;
    }
    if (transport === 'edge' && isLocalWsAuthoritativeForDevice(devId)) {
      wsDeltaStats.edgeSuppressedForLocal += 1;
      return false;
    }
    ingestIncomingHostState(cloneBaselineSnapshot(snap), devId || fallbackDevId);
    return true;
  }

  function requestWsStateResync(ws, devId = '', transport = 'local') {
    if (!ws || ws.readyState !== 1) return false;
    const sockMap = getSocketBaselineMap(ws);
    const mapKey = String(devId || '').trim() || '__default__';
    let entry = sockMap ? sockMap.get(mapKey) : null;
    const now = Date.now();
    if (entry && now - Number(entry.lastResyncReqAt || 0) < 1500) {
      return false;
    }
    if (!entry) {
      entry = { seq: null, snapshot: null, lastResyncReqAt: now };
      if (sockMap) sockMap.set(mapKey, entry);
    } else {
      entry.lastResyncReqAt = now;
    }
    wsDeltaStats.resyncRequests += 1;
    if (transport === 'local') {
      try {
        ws.send(JSON.stringify({ type: 'resync_state', targetDeviceId: devId || undefined }));
      } catch {}
      return true;
    }
    sendWsRpc(ws, { type: 'rpc_cmd', action: 'getState', targetDeviceId: devId || undefined }, 8000)
      .then((res) => {
        const st = res?.result?.state || res?.state || null;
        const resolvedSeq =
          typeof res?.result?.seq === 'number'
            ? res.result.seq
            : typeof res?.seq === 'number'
              ? res.seq
              : typeof st?.seq === 'number'
                ? st.seq
                : null;
        if (st && typeof st === 'object') {
          recordWsFullState(ws, st, devId, resolvedSeq, 'edge');
        }
      })
      .catch(() => {});
    return true;
  }

  function applyIncomingWsRowPatch(ws, msg, fallbackDevId = '', transport = 'local') {
    if (!msg || typeof msg !== 'object') return false;
    const sockMap = getSocketBaselineMap(ws);
    const rawDevId = String(msg.deviceId || msg.device?.id || fallbackDevId || '').trim();
    const lookupKey = rawDevId || '__default__';
    const base = (sockMap && (sockMap.get(lookupKey) || sockMap.get('__default__'))) || null;
    const hasSeq = typeof msg.seq === 'number' && Number.isFinite(msg.seq);
    const seqValid =
      !hasSeq ||
      (base && typeof base.seq === 'number' && Number.isFinite(base.seq) && msg.seq === base.seq + 1);
    if (!base || !base.snapshot || !seqValid) {
      requestWsStateResync(ws, rawDevId, transport);
      return false;
    }

    const remIds = new Set(Array.isArray(msg.removedIds) ? msg.removedIds.map(String) : []);
    const remKeys = new Set(Array.isArray(msg.removedKeys) ? msg.removedKeys.map(String) : []);
    const hasExplicitRemKeys = remKeys.size > 0;
    const prevRows = Array.isArray(base.snapshot.rows) ? base.snapshot.rows : [];
    const nextRows = [];
    const idxByKey = new Map();
    const idxById = new Map();
    for (let i = 0; i < prevRows.length; i += 1) {
      const r = prevRows[i];
      if (!r || typeof r !== 'object') continue;
      const rawKey = String(r.key || '').trim();
      const rid = String(r.id || '').trim();
      const rk = rawKey || rid;
      const shouldDrop = hasExplicitRemKeys
        ? Boolean((rk && remKeys.has(rk)) || (!rawKey && rid && remIds.has(rid)))
        : Boolean((rid && remIds.has(rid)) || (rk && remKeys.has(rk)));
      if (shouldDrop) {
        continue;
      }
      const cloned = { ...r };
      const idx = nextRows.length;
      nextRows.push(cloned);
      if (rawKey) idxByKey.set(rawKey, idx);
      if (rid) {
        const list = idxById.get(rid) || [];
        list.push({ idx, rawKey });
        idxById.set(rid, list);
      }
    }

    const rawUpserts = Array.isArray(msg.upserts) ? msg.upserts : [];
    for (let i = 0; i < rawUpserts.length; i += 1) {
      const u = rawUpserts[i];
      if (!u || typeof u !== 'object') continue;
      const rawUKey = String(u.key || '').trim();
      const rid = String(u.id || u.key || '').trim();
      const rk = rawUKey || rid;
      if (!rid && !rk) continue;
      let hitIdx = rawUKey && idxByKey.has(rawUKey) ? idxByKey.get(rawUKey) : undefined;
      if (hitIdx === undefined && rid && idxById.has(rid)) {
        const idEntries = idxById.get(rid);
        if (!rawUKey) {
          if (idEntries.length === 1) {
            hitIdx = idEntries[0].idx;
          } else {
            const keylessMatch = idEntries.find((e) => !e.rawKey);
            if (keylessMatch) hitIdx = keylessMatch.idx;
          }
        } else {
          const keylessMatch = idEntries.find((e) => !e.rawKey);
          if (keylessMatch) hitIdx = keylessMatch.idx;
        }
      }
      if (hitIdx !== undefined) {
        const prevKey = String(nextRows[hitIdx]?.key || '').trim();
        const mergedKey = rawUKey || prevKey;
        const cloned = mergedKey ? { ...u, id: rid || mergedKey, key: mergedKey } : { ...u, id: rid };
        nextRows[hitIdx] = cloned;
        if (mergedKey) idxByKey.set(mergedKey, hitIdx);
        if (rid && idxById.has(rid)) {
          for (const entry of idxById.get(rid)) {
            if (entry.idx === hitIdx) entry.rawKey = mergedKey;
          }
        }
      } else {
        const cloned = rawUKey ? { ...u, id: rid || rawUKey, key: rawUKey } : { ...u, id: rid };
        const newIdx = nextRows.length;
        nextRows.push(cloned);
        if (rawUKey) idxByKey.set(rawUKey, newIdx);
        if (rid) {
          const list = idxById.get(rid) || [];
          list.push({ idx: newIdx, rawKey: rawUKey });
          idxById.set(rid, list);
        }
      }
    }

    nextRows.sort(
      (a, b) =>
        (S.isRowPinned(b) ? 1 : 0) - (S.isRowPinned(a) ? 1 : 0) ||
        Number(b.at || 0) - Number(a.at || 0) ||
        Number(b.pinnedAt || 0) - Number(a.pinnedAt || 0) ||
        String(a.id || '').localeCompare(String(b.id || ''))
    );

    const nextSnap = {
      ...base.snapshot,
      generatedAt: Number(msg.generatedAt || Date.now()),
      total: typeof msg.total === 'number' ? msg.total : nextRows.length,
      rows: nextRows,
      ...(msg.pendingActiveKey !== undefined ? { pendingActiveKey: msg.pendingActiveKey } : {}),
      ...(msg.summary !== undefined ? { summary: msg.summary } : {}),
      ...(msg.summaryByProvider !== undefined ? { summaryByProvider: msg.summaryByProvider } : {}),
      ...(Array.isArray(msg.topSessions) ? { topSessions: msg.topSessions } : {}),
      ...(msg.connection !== undefined && msg.connection !== null ? { connection: msg.connection } : {})
    };

    base.snapshot = cloneBaselineSnapshot(nextSnap);
    if (hasSeq) {
      base.seq = msg.seq;
      wsDeltaStats.lastSeq = msg.seq;
    }
    wsDeltaStats.patchFrames += 1;
    wsDeltaStats.patchedRows += rawUpserts.length + Math.max(remIds.size, remKeys.size);

    const effectiveDevId = rawDevId || String(nextSnap?.device?.id || '').trim();
    if (transport === 'edge' && isLocalWsAuthoritativeForDevice(effectiveDevId)) {
      wsDeltaStats.edgeSuppressedForLocal += 1;
      return false;
    }
    ingestIncomingHostState(cloneBaselineSnapshot(nextSnap), effectiveDevId || fallbackDevId);
    return true;
  }

  function connectLocalWs(base, opts = {}) {
    if (
      (S.isHeadlessBrowser && !window.__THEO_ALLOW_MOCK_WS) ||
      (!window.__THEO_ALLOW_MOCK_WS && (initialNoSse || location.search.includes('nosse=1'))) ||
      !base ||
      typeof WebSocket === 'undefined'
    ) {
      return;
    }
    const cleanBase = String(base || '').replace(/\/+$/, '');
    const sameBase = Boolean(localBridgeBase && localBridgeBase === cleanBase);
    localBridgeBase = cleanBase;
    const rawSubpath =
      opts && opts.wsPath
        ? String(opts.wsPath)
        : sameBase && localBridgeWsPath
          ? localBridgeWsPath
          : '/ws';
    const wsSubpath = rawSubpath.startsWith('/') ? rawSubpath : `/${rawSubpath}`;
    localBridgeWsPath = wsSubpath;
    const wsUrl = `${cleanBase.replace(/^http/i, 'ws')}${wsSubpath}`;
    if (localWs && localWsAuthed && (localWs.readyState === 0 || localWs.readyState === 1)) {
      return;
    }
    if (localWs && localWs.readyState === 0) {
      return;
    }
    if (localWs) {
      try {
        localWs.close();
      } catch {}
      localWs = null;
      localWsAuthed = false;
    }
    if (localWsReconnectTimer) {
      clearTimeout(localWsReconnectTimer);
      localWsReconnectTimer = null;
    }
    try {
      const ws = new WebSocket(wsUrl);
      localWs = ws;
      ws.addEventListener('open', async () => {
        try {
          const token = await getBridgeAuthTokenHex();
          ws.send(JSON.stringify({ type: 'auth', role: 'client', token, protocol: 2, supportsRowPatch: true }));
          ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
        } catch {}
        if (localWsPingTimer) clearInterval(localWsPingTimer);
        localWsPingTimer = setInterval(() => {
          if (ws.readyState === 1) {
            try {
              ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
            } catch {}
          }
        }, 20000);
      });
      ws.addEventListener('message', (ev) => {
        if (ws !== localWs) return;
        try {
          const msg = JSON.parse(ev.data);
          if (!msg || typeof msg !== 'object') return;
          if (msg.type === 'welcome' || msg.type === 'auth_ok') {
            localWsAuthed = true;
            localWsReconnectAttempts = 0;
            connMode = 'local';
            const wDev = msg.device || msg.status?.device;
            if (wDev) {
              localWsDevice = wDev;
              updateFleetDevices([{ ...wDev, online: true, local: true, lastSeen: Date.now() }]);
            }
            if (Array.isArray(msg.devices)) updateFleetDevices(msg.devices);
            const wEdge = msg.edgeRelayUrl || msg.status?.edgeRelayUrl;
            if (wEdge && !S.prefs.edgeRelayUrl) {
              discoveredEdgeUrl = String(wEdge).trim();
            }
            const wSnap = msg.state || msg.snapshot;
            if (wSnap) {
              recordWsFullState(
                ws,
                wSnap,
                wDev?.id || '',
                typeof msg.seq === 'number' ? msg.seq : null,
                'local'
              );
            }
            flushOutbox().catch(() => {});
            flushPendingPrewarmHint();
            updateConnectionBanner();
          } else if (msg.type === 'pong') {
            const sentTs = Number(msg.echoTs || msg.ts || 0);
            if (sentTs) localWsRttMs = Math.max(1, Date.now() - sentTs);
            updateConnectionBanner();
          } else if (msg.type === 'state' || msg.type === 'host_state') {
            const snap = msg.state || msg.snapshot;
            if (snap) {
              recordWsFullState(
                ws,
                snap,
                msg.deviceId || localWsDevice?.id || '',
                typeof msg.seq === 'number' ? msg.seq : null,
                'local'
              );
            }
          } else if (msg.type === 'rowPatch' || msg.type === 'host_row_patch') {
            applyIncomingWsRowPatch(ws, msg, localWsDevice?.id || '', 'local');
          } else if (msg.type === 'devices_presence') {
            if (Array.isArray(msg.devices)) {
              updateFleetDevices(msg.devices);
              updateConnectionBanner();
              S.renderPulseView();
              S.renderSessionsView();
            }
          } else if (msg.type === 'thread_detail') {
            ingestIncomingThreadDetailFrame(msg);
          } else if (msg.type === 'stream_delta') {
            handleStreamDelta(msg);
          } else if (msg.type === 'claude_permission_mode') {
            if (S.ingestClaudePermissionModeDoc(msg, { fromWsFrame: true })) {
              persistCache();
              S.renderAll();
            }
          } else if (msg.type === 'rpc_res' && msg.reqId && wsPendingRpcs.has(msg.reqId)) {
            const p = wsPendingRpcs.get(msg.reqId);
            clearTimeout(p.timer);
            wsPendingRpcs.delete(msg.reqId);
            p.resolve(msg);
          }
        } catch {}
      });
      ws.addEventListener('close', (ev) => {
        rejectPendingRpcsForSocket(ws, 'local_ws_closed');
        const closedDevIds = new Set();
        if (localWsDevice?.id) closedDevIds.add(String(localWsDevice.id));
        const closedSockMap = wsBaselineBySocket.get(ws);
        if (closedSockMap) {
          for (const k of closedSockMap.keys()) {
            if (k && k !== '__default__') closedDevIds.add(k);
          }
        }
        if (localWs === ws) {
          localWs = null;
          localWsAuthed = false;
        }
        if (localWsPingTimer) {
          clearInterval(localWsPingTimer);
          localWsPingTimer = null;
        }
        if (edgeWsAuthed && edgeWs && edgeWs.readyState === 1) {
          const edgeMap = wsBaselineBySocket.get(edgeWs);
          if (edgeMap) {
            for (const devId of closedDevIds) {
              const edgeEntry = edgeMap.get(devId);
              const curSnap = hostSnapshotsByDevice.get(devId);
              if (
                edgeEntry?.snapshot &&
                Number(edgeEntry.snapshot.generatedAt || 0) > Number(curSnap?.generatedAt || 0)
              ) {
                ingestIncomingHostState(cloneBaselineSnapshot(edgeEntry.snapshot), devId);
              }
            }
          }
        }
        updateConnectionBanner();
        const code = Number(ev?.code || 0);
        localWsReconnectAttempts += 1;
        const delay = code === 4001 ? 30000 : Math.min(20000, 2500 * localWsReconnectAttempts);
        if (!initialNoSse && localBridgeBase) {
          localWsReconnectTimer = setTimeout(
            () => connectLocalWs(localBridgeBase, { wsPath: localBridgeWsPath }),
            delay
          );
        }
      });
    } catch {}
  }

  function normalizeEdgeWsUrl(rawUrl) {
    let u = String(rawUrl || '').trim();
    if (!u) return '';
    u = u.replace(/^https:\/\//i, 'wss://').replace(/^http:\/\//i, 'ws://').replace(/\/+$/, '');
    if (!/\/ws(\?|$)/i.test(u)) u += '/ws';
    u += u.includes('?') ? '&role=client' : '?role=client';
    return u;
  }

  async function connectEdgeWs(rawUrl) {
    if (S.isHeadlessBrowser && !window.__THEO_ALLOW_MOCK_WS) return;
    const cleanTarget = normalizeEdgeWsUrl(rawUrl || S.prefs.edgeRelayUrl || discoveredEdgeUrl);
    const token = await getBridgeAuthTokenHex();
    if (
      (!window.__THEO_ALLOW_MOCK_WS && (initialNoSse || location.search.includes('nosse=1'))) ||
      !cleanTarget ||
      !token ||
      typeof WebSocket === 'undefined'
    ) {
      return;
    }
    if (
      edgeWs &&
      edgeWsUrlConnected === cleanTarget &&
      edgeWsTokenConnected === token &&
      (edgeWs.readyState === 0 || edgeWs.readyState === 1)
    ) {
      return;
    }
    if (edgeWs) {
      try {
        edgeWs.close();
      } catch {}
      edgeWs = null;
      edgeWsAuthed = false;
      edgeWsTokenConnected = '';
    }
    if (edgeWsReconnectTimer) {
      clearTimeout(edgeWsReconnectTimer);
      edgeWsReconnectTimer = null;
    }

    try {
      const ws = new WebSocket(cleanTarget);
      edgeWs = ws;
      edgeWsUrlConnected = cleanTarget;
      edgeWsTokenConnected = token;
      ws.addEventListener('open', async () => {
        try {
          const freshToken = await getBridgeAuthTokenHex();
          ws.send(
            JSON.stringify({
              type: 'auth_client',
              token: freshToken,
              protocol: 2,
              supportsRowPatch: true,
              clientLabel: (navigator.userAgent || 'THEO PWA').slice(0, 64)
            })
          );
        } catch {}
      });
      ws.addEventListener('message', (ev) => {
        if (ws !== edgeWs) return;
        try {
          const msg = JSON.parse(ev.data);
          if (!msg || typeof msg !== 'object') return;
          if (msg.type === 'auth_ok') {
            edgeWsAuthed = true;
            edgeReconnectAttempts = 0;
            if (!localWsAuthed) connMode = 'edge';
            if (Array.isArray(msg.devices)) updateFleetDevices(msg.devices);
            if (msg.cachedSnapshots && typeof msg.cachedSnapshots === 'object') {
              for (const [devId, entry] of Object.entries(msg.cachedSnapshots)) {
                const snap = entry?.snapshot || entry?.state || entry;
                if (snap) {
                  recordWsFullState(
                    ws,
                    snap,
                    devId,
                    typeof entry?.seq === 'number'
                      ? entry.seq
                      : typeof snap?.seq === 'number'
                        ? snap.seq
                        : null,
                    'edge'
                  );
                }
              }
            }
            try {
              ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
            } catch {}
            if (edgeWsPingTimer) clearInterval(edgeWsPingTimer);
            edgeWsPingTimer = setInterval(() => {
              if (ws.readyState === 1) {
                try {
                  ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
                } catch {}
              }
            }, 22000);
            flushOutbox().catch(() => {});
            flushPendingPrewarmHint();
            updateConnectionBanner();
            S.renderAll();
          } else if (msg.type === 'auth_err') {
            edgeReconnectAttempts = Math.max(edgeReconnectAttempts, 5);
            try {
              ws.close();
            } catch {}
          } else if (msg.type === 'pong') {
            const sentTs = Number(msg.echoTs || msg.ts || 0);
            if (sentTs) edgeWsRttMs = Math.max(1, Date.now() - sentTs);
            updateConnectionBanner();
          } else if (msg.type === 'devices_presence') {
            if (Array.isArray(msg.devices)) {
              updateFleetDevices(msg.devices);
              updateConnectionBanner();
              S.renderPulseView();
              S.renderSessionsView();
            }
          } else if (msg.type === 'host_state' || msg.type === 'state') {
            const snap = msg.snapshot || msg.state;
            if (snap) {
              const frameSeq =
                typeof msg.seq === 'number'
                  ? msg.seq
                  : typeof snap?.seq === 'number'
                    ? snap.seq
                    : null;
              recordWsFullState(
                ws,
                snap,
                msg.deviceId || '',
                frameSeq,
                'edge'
              );
            }
          } else if (msg.type === 'rowPatch' || msg.type === 'host_row_patch') {
            const patchPayload =
              msg.patch && typeof msg.patch === 'object'
                ? {
                    ...msg.patch,
                    deviceId: msg.deviceId || msg.patch.deviceId,
                    seq: msg.seq ?? msg.patch.seq
                  }
                : msg;
            applyIncomingWsRowPatch(ws, patchPayload, msg.deviceId || '', 'edge');
          } else if (msg.type === 'thread_detail') {
            ingestIncomingThreadDetailFrame(msg);
          } else if (msg.type === 'stream_delta') {
            handleStreamDelta(msg);
          } else if (msg.type === 'claude_permission_mode') {
            if (S.ingestClaudePermissionModeDoc(msg, { fromWsFrame: true })) {
              persistCache();
              S.renderAll();
            }
          } else if (msg.type === 'rpc_res' && msg.reqId && wsPendingRpcs.has(msg.reqId)) {
            const p = wsPendingRpcs.get(msg.reqId);
            clearTimeout(p.timer);
            wsPendingRpcs.delete(msg.reqId);
            p.resolve(msg);
          }
        } catch {}
      });
      ws.addEventListener('close', (ev) => {
        rejectPendingRpcsForSocket(ws, 'edge_ws_closed');
        if (edgeWs === ws) {
          edgeWs = null;
          edgeWsAuthed = false;
          edgeWsTokenConnected = '';
          if (connMode === 'edge') connMode = S.appState ? 'cloud' : 'offline';
        }
        if (edgeWsPingTimer) {
          clearInterval(edgeWsPingTimer);
          edgeWsPingTimer = null;
        }
        updateConnectionBanner();
        const code = Number(ev?.code || 0);
        edgeReconnectAttempts += 1;
        const delay =
          code === 4001
            ? 45000
            : Math.min(35000, Math.round(2500 * Math.pow(1.6, Math.min(edgeReconnectAttempts, 7))));
        const retryUrl = S.prefs.edgeRelayUrl || discoveredEdgeUrl;
        if (!initialNoSse && retryUrl) {
          edgeWsReconnectTimer = setTimeout(() => {
            connectEdgeWs(retryUrl).catch(() => {});
          }, delay);
        }
      });
    } catch {}
  }

  async function saveEdgeRelayConfig(nextUrl) {
    const clean = String(nextUrl || '').trim();
    S.prefs.edgeRelayUrl = clean;
    discoveredEdgeUrl = clean || DEFAULT_EDGE_RELAY_URL;
    S.saveJson(S.STORAGE_KEYS.PREFS, S.prefs);
    if (S.isHeadlessBrowser) return true;
    if (localBridgeBase) {
      try {
        await authFetchLocal(`${localBridgeBase}/api/edge-config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ edgeRelayUrl: clean, url: clean })
        });
      } catch {}
    }
    if (cloudCfg.url && cloudCfg.key) {
      try {
        await fetch(cloudCfg.url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({
            key: cloudCfg.key,
            op: 'patch',
            ackOnly: true,
            patch: { edge_relay: { url: clean, updatedAt: Date.now() } }
          })
        });
      } catch {}
    }
    if (clean) {
      connectEdgeWs(clean).catch(() => {});
    } else if (edgeWs) {
      try {
        edgeWs.close();
      } catch {}
      edgeWs = null;
      edgeWsAuthed = false;
    }
    updateConnectionBanner();
    S.renderAnalyticsView();
    return true;
  }

  async function connectSse(base) {
    if (S.isHeadlessBrowser || initialNoSse || location.search.includes('nosse=1') || !base) {
      return;
    }
    connectLocalWs(base);
    // Avoid opening duplicate SSE stream when WebSocket is available (#14.1)
    if (typeof WebSocket !== 'undefined') {
      if (sseSource) {
        try {
          sseSource.close();
        } catch {}
        sseSource = null;
      }
      return;
    }
    if (sseSource) {
      try {
        sseSource.close();
      } catch {}
      sseSource = null;
    }
    try {
      const token = await getBridgeAuthTokenHex();
      const qs = token ? `?token=${encodeURIComponent(token)}` : '';
      const es = new EventSource(`${base}/api/events${qs}`);
      es.addEventListener('state', (ev) => {
        try {
          const st = JSON.parse(ev.data);
          if (st) ingestIncomingHostState(st, localWsDevice?.id || '');
        } catch {}
      });
      es.addEventListener('stream_delta', (ev) => {
        try {
          handleStreamDelta(JSON.parse(ev.data));
        } catch {}
      });
      sseSource = es;
    } catch {}
  }

  function persistCache() {
    S.saveJson(S.STORAGE_KEYS.CACHE, {
      state: S.appState,
      threads: S.threadsCache,
      workspacesDetail: S.workspacesDetailCache,
      updatedAt: Date.now()
    });
  }

  function mergeRemoteThreads(incomingThreads) {
    if (!incomingThreads || typeof incomingThreads !== 'object') return;
    const now = Date.now();
    for (const [tid, remoteThread] of Object.entries(incomingThreads)) {
      if (!remoteThread || typeof remoteThread !== 'object') continue;
      const existing = S.threadsCache[tid];
      const remoteMsgs = Array.isArray(remoteThread.messages) ? [...remoteThread.messages] : [];
      if (existing && Array.isArray(existing.messages)) {
        const optimisticMsgs = existing.messages.filter((m) => {
          if (!m) return false;
          if (m.isStreaming) {
            const streamTxt = String(m.text || '').trim();
            const alreadyInRemote =
              streamTxt &&
              remoteMsgs.some(
                (rm) => rm && rm.role === 'assistant' && String(rm.text || '').trim() === streamTxt
              );
            return !alreadyInRemote;
          }
          if (!m.optimistic) return false;
          const optAt = Number(m.optimisticAt || 0);
          if (now - optAt >= 45000) return false;
          const cleanOptText = String(m.text || '')
            .replace(/\n*(?:📎\s*)?Attached:.*$/s, '')
            .trim();
          const matchedRemoteUser = remoteMsgs.some((rm) => {
            if (!rm || rm.role !== 'user') return false;
            const rTxt = String(rm.text || '').trim();
            if (!cleanOptText) return false;
            return rTxt === cleanOptText || (cleanOptText.length >= 4 && rTxt.includes(cleanOptText));
          });
          if (matchedRemoteUser) return false;
          if (m.optimisticQuestionAnswer) {
            const baseCount = Number(m.baseMsgCount || 0);
            const hasServerQuestionReply = remoteMsgs.some((rm) => {
              if (!rm || rm.role !== 'user') return false;
              const rid = String(rm.id || '');
              if (rid.startsWith('agy-q-') || rid.startsWith('claude-qa-')) {
                const rmTs = rm.createdAt ? Date.parse(rm.createdAt) : 0;
                if (!rmTs || rmTs >= optAt - 20000 || remoteMsgs.length > baseCount) return true;
              }
              return false;
            });
            if (hasServerQuestionReply || (baseCount > 0 && remoteMsgs.length > baseCount)) {
              return false;
            }
          }
          return true;
        });
        if (optimisticMsgs.length) {
          remoteMsgs.push(...optimisticMsgs);
        }
      }
      S.threadsCache[tid] = {
        ...remoteThread,
        messages: remoteMsgs
      };
      if (remoteMsgs.length > 0) {
        pendingThreadRequests.delete(tid);
      }
    }
  }

  function maybePollCloudClaudeModeBackstop() {
    if (!cloudCfg.url || !cloudCfg.key || edgeWsAuthed) return;
    if (S.isHeadlessBrowser && !window.__THEO_ALLOW_PROBE_MOCK_FETCH) return;
    if (Date.now() - lastCloudBackstopAt < 60000) return;
    lastCloudBackstopAt = Date.now();
    fetch(cloudCfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ key: cloudCfg.key, op: 'get_theo' })
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((raw) => {
        const store = raw?.docs && typeof raw.docs === 'object' ? raw.docs : raw || {};
        if (
          store?.claude_permission_mode &&
          S.ingestClaudePermissionModeDoc(store.claude_permission_mode, { fromStore: true })
        ) {
          persistCache();
          S.renderAll();
        }
      })
      .catch(() => {});
  }

  async function retireOldTheoPushDevice() {
    refreshCloudConfig();
    const mf = S.getTheoMigrationMeta();
    if (!cloudCfg.url || !cloudCfg.key || !mf || mf.pushRetired || !mf.oldPushDeviceId) {
      return false;
    }
    let retired = false;
    S.theoPushRegistryLock = S.theoPushRegistryLock.then(async () => {
      try {
        const curRes = await S.callCloudPush({ op: 'get' });
        if (!curRes || curRes.ok === false) return;
        const curDocs = (curRes && curRes.docs) || curRes || {};
        const existing = Array.isArray(curDocs?.push_registry?.items)
          ? curDocs.push_registry.items
          : [];
        const filtered = existing.filter((x) => x && x.id !== mf.oldPushDeviceId);
        if (filtered.length !== existing.length) {
          const patchRes = await S.callCloudPush({
            op: 'patch',
            patch: {
              push_registry: {
                items: filtered,
                updatedAt: new Date().toISOString()
              }
            }
          });
          if (!patchRes || patchRes.ok === false) return;
        }
        const latestMf = S.getTheoMigrationMeta();
        if (latestMf) {
          S.saveTheoMigrationMeta({ ...latestMf, pushRetired: true });
        }
        retired = true;
      } catch {}
    });
    await S.theoPushRegistryLock;
    return retired;
  }

  function buildTheoMigrationUrl() {
    refreshCloudConfig();
    const kv = {};
    for (const k of S.THEO_MIGRATE_ALLOWLIST) {
      try {
        const raw = localStorage.getItem(k);
        if (raw === null) continue;
        if (k === S.STORAGE_KEYS.PIN_HASH || k === S.STORAGE_KEYS.PIN) {
          kv[k] = raw;
          continue;
        }
        kv[k] = JSON.parse(raw);
      } catch {}
    }
    const oldPushDeviceId = S.loadJson(S.STORAGE_KEYS.DEVID, '') || '';
    const encodePayload = (obj) => {
      const json = JSON.stringify(obj);
      const bytes = new TextEncoder().encode(json);
      return S.bytesToB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };
    const payload = { v: 1, app: 'theo', oldPushDeviceId, ts: Date.now(), kv };
    let encoded = encodePayload(payload);
    for (const dropKey of [S.STORAGE_KEYS.PERSONAL, S.STORAGE_KEYS.COMMAND, S.STORAGE_KEYS.NOTIFS, S.STORAGE_KEYS.ANSWERED_QUESTIONS]) {
      if (encoded.length <= 240000) break;
      delete kv[dropKey];
      encoded = encodePayload(payload);
    }
    return `${S.THEO_CF_MIGRATE_URL}#migrate=${encoded}`;
  }

  function renderTheoMigrationBannerHtml() {
    if (S.isTheoOldGithubOrigin()) {
      return `
        <div class="push-banner-card">
          <div class="push-banner-top">
            <strong>New Cloudflare address</strong>
            <span class="pill-count amber">Move App</span>
          </div>
          <div class="meta-timestamp" style="color:var(--text-secondary);font-size:var(--fs-md)">
            THEO moved off GitHub Pages to <strong>theo.husseinbdeir.workers.dev</strong>. Move your pairing and PIN in one tap.
          </div>
          <div class="push-banner-actions">
            <button type="button" class="btn-brass-sm" data-push-act="cf-migrate-now">Move to Cloudflare App</button>
          </div>
        </div>
      `;
    }
    const mf = S.getTheoMigrationMeta();
    if (!mf || !mf.needsPushPrompt) return '';
    const nf = Object.assign({ ...S.DEFAULT_NOTIF }, S.prefs.notif || {});
    const pushActive = Boolean(nf.enabled && S.pushSub && S.notifPerm() === 'granted');
    return `
      <div class="push-banner-card">
        <div class="push-banner-top">
          <strong>Moved to Cloudflare</strong>
          <span class="pill-count emerald">Ready</span>
        </div>
        <div class="meta-timestamp" style="color:var(--text-secondary);font-size:var(--fs-md)">
          ${pushActive ? 'Your data moved and your old GitHub push slot is retired.' : 'Your pairing moved here safely. Re-enable Push Notifications on this device so alerts work.'}
        </div>
        <div class="push-banner-actions">
          ${!pushActive ? `<button type="button" class="btn-brass-sm" data-push-act="enable">${S.pushBusy ? 'Enabling…' : 'Enable Push'}</button>` : ''}
          <button type="button" class="btn-ghost-sm" data-push-act="cf-migrate-dismiss">Dismiss</button>
        </div>
      </div>
    `;
  }

  async function syncData(options = {}) {
    if (S.isHeadlessBrowser && !window.__THEO_ALLOW_PROBE_MOCK_FETCH) return false;
    refreshCloudConfig();
    if (syncInFlight) {
      if (options.force || options.toast) {
        pendingSyncAfterFlight = true;
      }
      return false;
    }
    syncInFlight = true;
    try {
      retireOldTheoPushDevice().catch(() => {});
      if (options.toast || connMode === 'probing' || !S.appState) {
        updateConnectionBanner('syncing');
      }

      // 1. Try Direct Local Bridge first
      const bridgeBase = localBridgeBase || (await probeLocalBridge(Boolean(options.toast)));
      if (bridgeBase) {
        if (
          localWsAuthed &&
          localWs &&
          localWs.readyState === 1 &&
          S.appState &&
          !options.force &&
          !options.toast
        ) {
          connMode = 'local';
          updateConnectionBanner();
          flushOutbox().catch(() => {});
          maybePollCloudClaudeModeBackstop();
          if (
            S.prefs.activeTab === 'chat' &&
            S.prefs.selectedThreadId &&
            S.isSessionActivelyRunning(S.prefs.selectedThreadId) &&
            Date.now() - (lastThreadDetailFetchAtById.get(S.prefs.selectedThreadId) || 0) >= 1400 &&
            Date.now() - (lastThreadDetailReceivedAtById.get(S.prefs.selectedThreadId) || 0) >= 1200
          ) {
            lastThreadDetailFetchAtById.set(S.prefs.selectedThreadId, Date.now());
            fetchThreadDetail(S.prefs.selectedThreadId, S.pinnedNavProvider || '').catch(() => {});
          }
          return true;
        }
        try {
          const res = await authFetchLocal(`${bridgeBase}/api/state`);
          if (res.ok) {
            const payload = await res.json();
            if (payload?.state) {
              connMode = 'local';
              ingestIncomingHostState(
                payload.state,
                payload.state?.device?.id || localWsDevice?.id || ''
              );
              connectLocalWs(bridgeBase);
              const candidateEdge = S.prefs.edgeRelayUrl || discoveredEdgeUrl;
              if (candidateEdge) connectEdgeWs(candidateEdge).catch(() => {});
              if (
                S.pushSub &&
                S.prefs.notif &&
                S.prefs.notif.enabled &&
                Date.now() - S.lastPushScheduleSyncAt > 10 * 60 * 1000
              ) {
                S.schedulePushSync();
              }
              flushOutbox().catch(() => {});
              if (
                S.prefs.selectedThreadId &&
                S.prefs.selectedThreadId !== '__new__' &&
                !String(S.prefs.selectedThreadId).startsWith('draft-new-')
              ) {
                fetchThreadDetail(S.prefs.selectedThreadId, S.pinnedNavProvider || '').catch(() => {});
              }
              if (options.toast) {
                S.showToast(`Connected to host (${(S.appState?.rows || []).length} sessions)`);
              }
              maybePollCloudClaudeModeBackstop();
              return true;
            }
          } else if (res.status === 401 || res.status === 403) {
            localBridgeBase = '';
            lastLocalProbeFailedAt = Date.now();
          }
        } catch {
          localBridgeBase = '';
        }
      }

      // 2. Worldwide Multi-Device Sync via Cloudflare Edge WS (<70ms) + Cloud Relay 60s Backstop
      const candidateEdgeBoot = S.prefs.edgeRelayUrl || discoveredEdgeUrl;
      if (candidateEdgeBoot) {
        connectEdgeWs(candidateEdgeBoot).catch(() => {});
      }
      if (
        edgeWsAuthed &&
        edgeWs &&
        edgeWs.readyState === 1 &&
        S.appState &&
        !options.force &&
        !options.toast &&
        Date.now() - lastCloudBackstopAt < 60000
      ) {
        connMode = 'edge';
        updateConnectionBanner();
        flushOutbox().catch(() => {});
        if (
          S.prefs.activeTab === 'chat' &&
          S.prefs.selectedThreadId &&
          S.isSessionActivelyRunning(S.prefs.selectedThreadId) &&
          Date.now() - (lastThreadDetailFetchAtById.get(S.prefs.selectedThreadId) || 0) >= 1400 &&
          Date.now() - (lastThreadDetailReceivedAtById.get(S.prefs.selectedThreadId) || 0) >= 1200
        ) {
          lastThreadDetailFetchAtById.set(S.prefs.selectedThreadId, Date.now());
          fetchThreadDetail(S.prefs.selectedThreadId, S.pinnedNavProvider || '').catch(() => {});
        }
        return true;
      }

      if (cloudCfg.url && cloudCfg.key) {
        try {
          const res = await fetch(cloudCfg.url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            body: JSON.stringify({ key: cloudCfg.key, op: 'get_theo' })
          });
          if (res.ok) {
            lastCloudBackstopAt = Date.now();
            const rawStore = await res.json();
            const store =
              rawStore?.docs && typeof rawStore.docs === 'object' ? rawStore.docs : rawStore || {};
            lastCloudQueue = store?.queue || null;
            connMode = edgeWsAuthed ? 'edge' : 'cloud';
            if (store?.edge_relay?.url && !S.prefs.edgeRelayUrl) {
              discoveredEdgeUrl = String(store.edge_relay.url).trim();
            }
            const candidateEdge = S.prefs.edgeRelayUrl || discoveredEdgeUrl;
            if (candidateEdge) {
              connectEdgeWs(candidateEdge).catch(() => {});
            }
            if (store?.threads && typeof store.threads === 'object') {
              mergeRemoteThreads(store.threads);
            }
            if (store?.state?.snapshot) {
              storeHostSnapshotEntry(
                store.state.snapshot,
                store.state.snapshot?.device?.id || ''
              );
            }
            if (store?.device_states && typeof store.device_states === 'object') {
              for (const [devId, entry] of Object.entries(store.device_states)) {
                if (!entry || typeof entry !== 'object') continue;
                const snap = entry.snapshot || (Array.isArray(entry.rows) ? entry : null);
                const dInfo = entry.device || snap?.device || { id: devId, name: devId };
                const ageMs = Date.now() - Number(entry.updatedAt || snap?.generatedAt || 0);
                updateFleetDevices([
                  {
                    ...dInfo,
                    id: devId,
                    online: Boolean(fleetDevicesMap.get(devId)?.online) || ageMs < 90000,
                    lastSeen: Number(entry.updatedAt || snap?.generatedAt || Date.now()),
                    sessionCount: Array.isArray(snap?.rows)
                      ? snap.rows.filter((r) => r && !r.archived).length
                      : 0
                  }
                ], { authoritative: true });
                if (entry.threads && typeof entry.threads === 'object') {
                  mergeRemoteThreads(entry.threads);
                }
                if (snap) {
                  storeHostSnapshotEntry(snap, devId);
                }
              }
            }
            if (store?.claude_permission_mode) {
              S.ingestClaudePermissionModeDoc(store.claude_permission_mode, { fromStore: true });
            }
            const unified = rebuildUnifiedAppState();
            if (unified) {
              S.applyStoppedSessionOverrides(unified);
              S.applyAnsweredQuestionOverrides(unified);
              S.applyPendingLocalOverrides(unified);
              S.checkLiveStateNotifications(unified);
              unified.claudePermissionMode = { ...S.claudeModeState };
              S.appState = unified;
              S.reconcilePendingNewSessionBind(unified, lastCloudQueue);
            }
            if (store?.state?.workspacesDetail && typeof store.state.workspacesDetail === 'object') {
              S.workspacesDetailCache = { ...S.workspacesDetailCache, ...store.state.workspacesDetail };
            }
            if (!S.hasExplicitBootUrlNav && S.pinnedNavThreadId && Date.now() < S.pinnedNavUntil) {
              S.prefs.selectedThreadId = S.pinnedNavThreadId;
              S.prefs.activeTab = 'chat';
            }
            persistCache();
            S.renderAll();
            if (
              S.pushSub &&
              S.prefs.notif &&
              S.prefs.notif.enabled &&
              Date.now() - S.lastPushScheduleSyncAt > 10 * 60 * 1000
            ) {
              S.schedulePushSync();
            }
            flushOutbox().catch(() => {});
            if (
              S.prefs.selectedThreadId &&
              S.prefs.selectedThreadId !== '__new__' &&
              !String(S.prefs.selectedThreadId).startsWith('draft-new-')
            ) {
              fetchThreadDetail(S.prefs.selectedThreadId, S.pinnedNavProvider || '').catch(() => {});
            }
            if (options.toast) {
              S.showToast(`Synced Multi-Device Fleet (${(S.appState?.rows || []).length} sessions)`);
            }
            return true;
          }
        } catch {}
      }

      connMode = edgeWsAuthed ? 'edge' : 'offline';
      S.renderAll();
      if (options.toast && connMode === 'offline') {
        const hasCreds = hasAnyPairingCredentials();
        if (hasCreds) {
          S.showToast('Offline — showing cached snapshot');
        } else {
          const activeViewInput = document.querySelector(
            '.view-pane.active [data-pair-code-input], #conn-modal:not([hidden]) [data-pair-code-input]'
          );
          if (activeViewInput) {
            setTimeout(() => activeViewInput.focus({ preventScroll: false }), 20);
          } else {
            openConnModal();
          }
          S.showToast('Enter your 6-digit pairing code to connect live');
        }
      }
      return false;
    } finally {
      syncInFlight = false;
      if (pendingSyncAfterFlight) {
        pendingSyncAfterFlight = false;
        setTimeout(() => {
          syncData().catch(() => {});
        }, 80);
      }
    }
  }

  async function fetchThreadDetail(threadId, providerHint = '') {
    if (S.isHeadlessBrowser || !threadId) return null;
    S.setBoundedMap(lastThreadDetailFetchAtById, threadId, Date.now());
    const matchedRow = (S.appState?.rows || []).find((r) => r && r.id === threadId);
    const rowDeviceId = matchedRow?.deviceId || '';
    const isRemoteDeviceSession = Boolean(
      rowDeviceId && localWsDevice?.id && rowDeviceId !== localWsDevice.id
    );
    const hadAnyCachedTurns = Boolean(S.threadsCache[threadId]?.messages?.length);

    if (connMode === 'local' && localBridgeBase && !isRemoteDeviceSession) {
      try {
        const res = await authFetchLocal(
          `${localBridgeBase}/api/thread?id=${encodeURIComponent(threadId)}&provider=${encodeURIComponent(providerHint)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data?.thread) {
            S.setBoundedMap(lastThreadDetailReceivedAtById, threadId, Date.now());
            mergeRemoteThreads({ [threadId]: data.thread });
            persistCache();
            if (S.prefs.activeTab === 'chat' && S.prefs.selectedThreadId === threadId) {
              S.renderChatView(!hadAnyCachedTurns);
            } else if (S.prefs.activeTab === 'chat' && S.prefs.splitWatchOpen && S.prefs.splitWatchThreadId === threadId) {
              S.renderSplitWatchPane();
            }
            return S.threadsCache[threadId];
          }
        }
      } catch {}
    }

    if (edgeWsAuthed && edgeWs && edgeWs.readyState === 1) {
      try {
        const rpcOut = await sendWsRpc(
          edgeWs,
          {
            type: 'rpc_cmd',
            targetDeviceId: rowDeviceId,
            cmd: { type: 'getThread', id: threadId, threadId, provider: providerHint }
          },
          6500
        );
        const threadObj =
          rpcOut?.result?.thread ||
          rpcOut?.thread ||
          (Array.isArray(rpcOut?.result?.messages) ? rpcOut.result : null);
        if (threadObj) {
          S.setBoundedMap(lastThreadDetailReceivedAtById, threadId, Date.now());
          mergeRemoteThreads({ [threadId]: threadObj });
          persistCache();
          if (S.prefs.activeTab === 'chat' && S.prefs.selectedThreadId === threadId) {
            S.renderChatView(!hadAnyCachedTurns);
          } else if (S.prefs.activeTab === 'chat' && S.prefs.splitWatchOpen && S.prefs.splitWatchThreadId === threadId) {
            S.renderSplitWatchPane();
          }
          return S.threadsCache[threadId];
        }
      } catch {}
    }

    if (cloudCfg.url && cloudCfg.key) {
      const cached = S.threadsCache[threadId];
      const hasMessages = Array.isArray(cached?.messages) && cached.messages.length > 0;
      const lastReq = pendingThreadRequests.get(threadId) || 0;
      if (!hasMessages && Date.now() - lastReq > 30000) {
        pendingThreadRequests.set(threadId, Date.now());
        if (S.prefs.activeTab === 'chat' && S.prefs.selectedThreadId === threadId) {
          S.renderChatView(false);
        }
        dispatchRemoteCommand({
          type: 'requestThread',
          id: threadId,
          threadId,
          targetDeviceId: rowDeviceId,
          provider: providerHint
        })
          .then(() => {
            setTimeout(() => syncData(), 2500);
            setTimeout(() => syncData(), 6000);
          })
          .catch(() => {});
      }
    }
    return S.threadsCache[threadId] || null;
  }

  async function fetchWorkspaceDetail(repoId, fileRel = '') {
    if (S.isHeadlessBrowser || !repoId) {
      return { workspace: S.workspacesDetailCache[repoId] || null, file: null };
    }
    const wsEntry = (S.appState?.workspaces || []).find((w) => w && w.id === repoId);
    const targetDeviceId = wsEntry?.deviceId || '';
    const isRemoteWs = Boolean(targetDeviceId && localWsDevice?.id && targetDeviceId !== localWsDevice.id);

    if (connMode === 'local' && localBridgeBase && !isRemoteWs) {
      try {
        const q = `id=${encodeURIComponent(repoId)}${fileRel ? `&file=${encodeURIComponent(fileRel)}` : ''}`;
        const res = await authFetchLocal(`${localBridgeBase}/api/workspace?${q}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.workspace) {
            S.workspacesDetailCache[repoId] = data.workspace;
            persistCache();
          }
          return data;
        }
      } catch {}
    }

    if (edgeWsAuthed && edgeWs && edgeWs.readyState === 1) {
      try {
        const rpcOut = await sendWsRpc(
          edgeWs,
          {
            type: 'rpc_cmd',
            targetDeviceId,
            cmd: { type: 'getWorkspace', id: repoId, file: fileRel || '' }
          },
          6500
        );
        const out = rpcOut?.result || rpcOut || {};
        if (out?.workspace) {
          S.workspacesDetailCache[repoId] = out.workspace;
          persistCache();
          return out;
        }
      } catch {}
    }

    return { workspace: S.workspacesDetailCache[repoId] || null, file: null };
  }

  let cloudCmdChain = Promise.resolve();

  function cleanTargetThreadId(val) {
    const s = String(val || '').trim();
    if (!s || s === '__new__' || s.startsWith('cmd-') || s.startsWith('draft-new-')) {
      return '';
    }
    return s;
  }

  const MAX_LIVE_WS_ATTACHMENT_BYTES = 8 * 1024 * 1024;
  const MAX_CLOUD_FALLBACK_CHARS = 360 * 1024;

  function hasLiveAttachmentTransport(targetDeviceId = '') {
    if (window.__THEO_TEST_FORCE_TRANSPORT_MODE === 'cloud') return false;
    const targetsOther = Boolean(
      targetDeviceId && localWsDevice?.id && targetDeviceId !== localWsDevice.id
    );
    if (localWsAuthed && localWs && localWs.readyState === 1 && !targetsOther) return true;
    if (edgeWsAuthed && edgeWs && edgeWs.readyState === 1) return true;
    if (connMode === 'local' && Boolean(localBridgeBase) && !targetsOther) return true;
    return false;
  }

  function calcAttachmentsPayloadChars(atts) {
    if (!Array.isArray(atts) || !atts.length) return 0;
    return atts.reduce(
      (sum, a) => sum + String(a?.dataUrl || '').length + String(a?.textContent || '').length,
      0
    );
  }

  function compactAttachmentsForCloudFallback(atts) {
    if (!Array.isArray(atts) || !atts.length) return [];
    return atts.map((a) => {
      if (!a) return a;
      if (a.textContent && String(a.dataUrl || '').length > 0) {
        return { ...a, dataUrl: '' };
      }
      return a;
    });
  }

  async function uploadLargeAttachmentsOverWs(wsConn, isEdge, targetDeviceId, attachments) {
    if (!Array.isArray(attachments) || attachments.length === 0) return attachments;
    const CHUNK_CHAR_SIZE = 240000;
    const out = [];
    for (const att of attachments) {
      if (!att) continue;
      const rawData = String(att.dataUrl || '');
      if (rawData.length <= 520000) {
        out.push(att);
        continue;
      }
      const uploadId = `up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const totalChunks = Math.ceil(rawData.length / CHUNK_CHAR_SIZE);
      let okAll = true;
      for (let idx = 0; idx < totalChunks; idx++) {
        const chunkData = rawData.slice(idx * CHUNK_CHAR_SIZE, (idx + 1) * CHUNK_CHAR_SIZE);
        const frame = isEdge
          ? {
              type: 'rpc_cmd',
              targetDeviceId: targetDeviceId || '',
              cmd: { type: 'uploadAttachmentChunk', uploadId, chunkIndex: idx, totalChunks, data: chunkData }
            }
          : {
              type: 'rpc',
              targetDeviceId: targetDeviceId || '',
              cmd: { type: 'uploadAttachmentChunk', uploadId, chunkIndex: idx, totalChunks, data: chunkData }
            };
        const res = await sendWsRpc(wsConn, frame, 9000).catch(() => null);
        if (!res || res.ok === false) {
          okAll = false;
          break;
        }
      }
      if (okAll) {
        out.push({
          name: att.name,
          mime: att.mime,
          size: att.size,
          uploadId,
          totalChunks,
          textContent: att.textContent || ''
        });
      } else {
        out.push({
          name: att.name,
          mime: att.mime,
          size: att.size,
          textContent: att.textContent || '',
          chunkUploadFailed: true
        });
      }
    }
    return out;
  }

  async function dispatchRemoteCommand(cmdObj) {
    refreshCloudConfig();
    const targetThreadId =
      cleanTargetThreadId(cmdObj?.threadId) ||
      cleanTargetThreadId(cmdObj?.id) ||
      cleanTargetThreadId(cmdObj?.sessionId);
    const matchedRow = targetThreadId
      ? (S.appState?.rows || []).find((r) => r && r.id === targetThreadId)
      : null;
    const activeFilterDev =
      S.prefs.selectedDeviceFilter && S.prefs.selectedDeviceFilter !== 'all'
        ? String(S.prefs.selectedDeviceFilter).trim()
        : '';
    const composerPrefDev =
      S.prefs.composerTargetDevice && S.prefs.composerTargetDevice !== 'auto'
        ? String(S.prefs.composerTargetDevice).trim()
        : '';
    const resolvedTargetDevice =
      cmdObj?.targetDeviceId !== undefined
        ? String(cmdObj.targetDeviceId || '').trim()
        : matchedRow?.deviceId
          ? String(matchedRow.deviceId).trim()
          : cmdObj?.newSession
            ? composerPrefDev || activeFilterDev
            : activeFilterDev;
    const resolvedWorkspace =
      cmdObj?.workspace !== undefined
        ? String(cmdObj.workspace || '').trim()
        : String(S.prefs.composerRepoPrefix || '').trim();
    const resolvedExecMode =
      cmdObj?.executionMode ||
      (S.prefs.composerDirectStream === false
        ? 'ide'
        : cmdObj?.newSession
          ? 'direct'
          : 'auto');

    if (resolvedTargetDevice) S.recordFreqUsage('devices', resolvedTargetDevice);
    if (resolvedWorkspace) S.recordFreqUsage('repos', resolvedWorkspace);
    if (targetThreadId) S.recordFreqUsage('threads', targetThreadId);

    const cmd = {
      ...cmdObj,
      id:
        cmdObj?.id && String(cmdObj.id).startsWith('cmd-')
          ? cmdObj.id
          : `cmd-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
      threadId: targetThreadId,
      targetDeviceId: resolvedTargetDevice || undefined,
      workspace: resolvedWorkspace || undefined,
      executionMode: resolvedExecMode,
      createdAt: cmdObj?.createdAt || Date.now(),
      status: 'pending'
    };

    if (S.isHeadlessBrowser) {
      try {
        window.__theoLastQuarantinedCmd = cmd;
      } catch {}
      if (window.__THEO_TEST_QUARANTINE_RES && typeof window.__THEO_TEST_QUARANTINE_RES === 'object') {
        return { ...window.__THEO_TEST_QUARANTINE_RES, id: cmd.id };
      }
      return { ok: true, mode: 'quarantined', id: cmd.id };
    }

    const targetsAnotherHost = Boolean(
      resolvedTargetDevice &&
        localWsDevice?.id &&
        resolvedTargetDevice !== localWsDevice.id
    );

    // 1. Direct Local WebSocket RPC (<5ms local + automatic peer forwarding)
    if (localWsAuthed && localWs && localWs.readyState === 1 && !targetsAnotherHost) {
      try {
        const wsAttachments = Array.isArray(cmd.attachments) && cmd.attachments.length
          ? await uploadLargeAttachmentsOverWs(localWs, false, resolvedTargetDevice, cmd.attachments)
          : cmd.attachments;
        if (Array.isArray(wsAttachments) && wsAttachments.some((a) => a && a.chunkUploadFailed)) {
          return {
            ok: false,
            blocked: 'attachment_chunk_failed',
            error: 'Large attachment chunk upload failed over Direct WS.'
          };
        }
        const wsRes = await sendWsRpc(
          localWs,
          {
            type: 'rpc',
            targetDeviceId: resolvedTargetDevice || '',
            cmd: {
              ...cmd,
              attachments: wsAttachments,
              cmdId: cmd.id,
              id: cmd.newSession ? '' : targetThreadId,
              threadId: cmd.newSession ? '' : targetThreadId
            }
          },
          10000
        );
        const innerOk = wsRes && wsRes.ok !== false && wsRes?.result?.ok !== false;
        if (innerOk) {
          return { ok: true, mode: 'local_ws', id: cmd.id, out: wsRes.result || wsRes };
        }
      } catch {}
    }

    // 2. Cloudflare Edge WebSocket RPC (<25ms worldwide to ANY online PC)
    if (edgeWsAuthed && edgeWs && edgeWs.readyState === 1) {
      try {
        const edgeAttachments = Array.isArray(cmd.attachments) && cmd.attachments.length
          ? await uploadLargeAttachmentsOverWs(edgeWs, true, resolvedTargetDevice, cmd.attachments)
          : cmd.attachments;
        if (Array.isArray(edgeAttachments) && edgeAttachments.some((a) => a && a.chunkUploadFailed)) {
          return {
            ok: false,
            blocked: 'attachment_chunk_failed',
            error: 'Large attachment chunk upload failed over Edge WS.'
          };
        }
        const edgeRes = await sendWsRpc(
          edgeWs,
          {
            type: 'rpc_cmd',
            targetDeviceId: resolvedTargetDevice || '',
            cmd: {
              ...cmd,
              attachments: edgeAttachments,
              cmdId: cmd.id,
              id: cmd.newSession ? '' : targetThreadId,
              threadId: cmd.newSession ? '' : targetThreadId
            }
          },
          10000
        );
        const innerOk = edgeRes && edgeRes.ok !== false && edgeRes?.result?.ok !== false;
        if (innerOk) {
          return { ok: true, mode: 'edge_ws', id: cmd.id, out: edgeRes.result || edgeRes };
        }
      } catch {}
    }

    // 3. Direct Local HTTP Bridge (not for a live-only command meant for another PC: the bridge PC would have
    // to pass it on, and it must never end up in a queue)
    if (connMode === 'local' && localBridgeBase && !(cmdObj?.liveOnly && targetsAnotherHost)) {
      try {
        const endpoint =
          cmd.type === 'send'
            ? '/api/send'
            : cmd.type === 'approve' || cmd.type === 'answerQuestion'
              ? '/api/approve'
              : '/api/session-action';
        const res = await authFetchLocal(`${localBridgeBase}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...cmd,
            cmdId: cmd.id,
            id: cmd.newSession ? '' : targetThreadId,
            threadId: cmd.newSession ? '' : targetThreadId
          })
        });
        if (res.ok) {
          const out = await res.json();
          if (out && out.ok !== false) {
            setTimeout(() => syncData(), 500);
            return { ok: true, mode: 'local', id: cmd.id, out };
          }
        }
      } catch {}
    }

    // A command marked `liveOnly` (an account sign-in step, which may carry a one-time code) reaches a PC over
    // a live link or not at all: it is never written to the cloud queue or kept in this device's outbox.
    if (cmdObj?.liveOnly) {
      return { ok: false, mode: 'no_live_link', id: cmd.id };
    }

    if (Array.isArray(cmd.attachments) && cmd.attachments.length > 0) {
      const slimmedAtts = compactAttachmentsForCloudFallback(cmd.attachments);
      if (calcAttachmentsPayloadChars(slimmedAtts) > MAX_CLOUD_FALLBACK_CHARS) {
        return {
          ok: false,
          blocked: 'attachment_too_large_for_cloud',
          error: 'Attachment exceeds 250 KB Cloud Store fallback limit; connect live Edge WS for up to 8 MB.'
        };
      }
      cmd.attachments = slimmedAtts;
    }

    // 4. Cloud Relay Command Queue (serialized + fast get_control)
    if (cloudCfg.url && cloudCfg.key) {
      const runCloudWrite = async () => {
        const ctrlGet = new AbortController();
        const tGet = setTimeout(() => ctrlGet.abort(), 12000);
        const curRes = await fetch(cloudCfg.url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({ key: cloudCfg.key, op: 'get_control' }),
          signal: ctrlGet.signal
        }).finally(() => clearTimeout(tGet));
        const rawCur = curRes.ok ? await curRes.json() : {};
        const curStore =
          rawCur?.docs && typeof rawCur.docs === 'object' ? rawCur.docs : rawCur || {};
        const existingCmds = Array.isArray(curStore?.queue?.commands)
          ? curStore.queue.commands
              .filter((c) => c && c.id && c.id !== cmd.id)
              .slice(-14)
          : [];
        existingCmds.push(cmd);

        const nextQueue = {
          ...(curStore.queue || {}),
          commands: existingCmds
        };
        if ((cmd.type === 'requestThread' || cmd.subAction === 'requestThread') && targetThreadId) {
          nextQueue.activeThreadId = targetThreadId;
        }

        const ctrlPost = new AbortController();
        const tPost = setTimeout(() => ctrlPost.abort(), 15000);
        const postRes = await fetch(cloudCfg.url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({
            key: cloudCfg.key,
            op: 'patch',
            ackOnly: true,
            patch: {
              queue: nextQueue
            }
          }),
          signal: ctrlPost.signal
        }).finally(() => clearTimeout(tPost));
        return Boolean(postRes.ok);
      };

      try {
        const p = cloudCmdChain.then(runCloudWrite, runCloudWrite);
        cloudCmdChain = p.catch(() => false);
        const ok = await p;
        if (ok) {
          return { ok: true, mode: 'cloud', id: cmd.id };
        }
      } catch {}
    }

    // 5. Offline Outbox Queue
    S.outbox = S.outbox.filter((c) => c && c.id !== cmd.id);
    S.outbox.push(cmd);
    S.saveJson(S.STORAGE_KEYS.OUTBOX, S.outbox);
    renderOutboxBadge();
    return { ok: true, mode: 'queued', id: cmd.id };
  }

  async function flushOutbox() {
    if (!S.outbox.length || connMode === 'offline') return;
    const pending = [...S.outbox];
    S.outbox = [];
    S.saveJson(S.STORAGE_KEYS.OUTBOX, S.outbox);
    for (const item of pending) {
      if (item && item.type === 'setClaudePermissionMode' && item.defaultMode) {
        const itemTs = Number(item.createdAt || 0);
        if (itemTs > 0 && itemTs < Number(S.claudeModeState.updatedAt || 0)) {
          continue;
        }
        await S.setFleetClaudeModeRemote(item.defaultMode, {
          fromOutbox: true,
          silent: true,
          createdAt: itemTs
        });
        continue;
      }
      await dispatchRemoteCommand(item);
    }
    renderOutboxBadge();
  }

  function renderOutboxBadge() {
    const ind = S.$('outbox-indicator');
    if (!ind) return;
    if (S.outbox.length > 0) {
      ind.hidden = false;
      ind.textContent = `${S.outbox.length} queued`;
    } else {
      ind.hidden = true;
    }
  }

  function updateConnectionBanner(overrideState = '') {
    const railBtn = S.$('rail-conn-btn');
    const dotRail = S.$('rail-conn-dot');
    const titleRail = S.$('rail-conn-title');
    const subRail = S.$('rail-conn-sub');
    const pillMob = S.$('mobile-conn-pill');
    const dotMob = S.$('mobile-conn-dot');
    const textMob = S.$('mobile-conn-text');

    if (overrideState === 'syncing') {
      if (titleRail) titleRail.textContent = 'Syncing Bridge…';
      return;
    }

    const rowCount = (S.appState?.rows || []).length;
    const snapAge = S.appState?.generatedAt ? S.timeAgo(S.appState.generatedAt) : '';
    const fleetList = getUnifiedFleetDevices();
    const onlineHosts = fleetList.filter((d) => d.online).length;
    const hostLabel =
      localWsDevice?.name ||
      S.appState?.device?.name ||
      S.appState?.connection?.hostname ||
      'Local Host';

    if (connMode === 'local') {
      const wsBadge = localWsAuthed
        ? `WS${localWsRttMs > 0 ? ` ${localWsRttMs}ms` : ''}`
        : 'Live SSE';
      const isHeadlessDaemon = Boolean(S.appState?.connection?.standaloneMode);
      if (railBtn) railBtn.hidden = true;
      if (dotRail) dotRail.className = 'conn-dot live';
      if (titleRail) titleRail.textContent = `${hostLabel} · ${wsBadge}`;
      if (subRail) {
        subRail.textContent = `${fleetList.length > 1 ? `${fleetList.length} hosts · ` : ''}${rowCount} sess · ${isHeadlessDaemon ? 'Headless 24/7' : '24/7 Daemon'}`;
      }
      if (pillMob) pillMob.hidden = true;
      if (dotMob) dotMob.className = 'conn-dot live';
      if (textMob) textMob.textContent = localWsAuthed ? 'Direct WS' : 'Direct SSE';
    } else if (connMode === 'edge' || edgeWsAuthed) {
      const rttTxt = edgeWsRttMs > 0 ? ` · ${edgeWsRttMs}ms` : '';
      if (railBtn) railBtn.hidden = true;
      if (dotRail) dotRail.className = 'conn-dot live';
      if (titleRail) titleRail.textContent = `Edge WS · ${Math.max(1, onlineHosts)} Host${onlineHosts === 1 ? '' : 's'} Live`;
      if (subRail) subRail.textContent = `Cloudflare DO${rttTxt} · ${rowCount} sess · 24/7 Daemon`;
      if (pillMob) pillMob.hidden = true;
      if (dotMob) dotMob.className = 'conn-dot live';
      if (textMob) textMob.textContent = `Edge WS${rttTxt}`;
    } else if (connMode === 'cloud') {
      if (railBtn) railBtn.hidden = true;
      if (dotRail) dotRail.className = 'conn-dot cloud';
      if (titleRail) {
        titleRail.textContent =
          fleetList.length > 1 ? `Cloud Fleet · ${fleetList.length} Hosts` : 'Cloud Relay · Connected';
      }
      if (subRail) subRail.textContent = `Sync ${snapAge || 'live'} · ${rowCount} sess · 24/7 Daemon`;
      if (pillMob) pillMob.hidden = true;
      if (dotMob) dotMob.className = 'conn-dot cloud';
      if (textMob) textMob.textContent = snapAge ? `Live · ${snapAge.replace(' ago', '')}` : 'Cloud Live';
    } else {
      const paired = hasAnyPairingCredentials();
      const hideWhileProbing = Boolean(paired && connMode === 'probing' && navigator.onLine !== false);
      if (railBtn) railBtn.hidden = hideWhileProbing;
      if (dotRail) dotRail.className = 'conn-dot';
      if (titleRail) titleRail.textContent = paired ? 'Offline Snapshot' : 'Pair This Device';
      if (subRail) {
        subRail.textContent = !paired
          ? 'Enter 6-digit code or pair link'
          : snapAge
            ? `Cached ${snapAge} · 24/7 Daemon`
            : 'Waiting · 24/7 Daemon';
      }
      if (pillMob) pillMob.hidden = hideWhileProbing;
      if (dotMob) dotMob.className = 'conn-dot';
      if (textMob) {
        textMob.textContent = !paired
          ? 'Pair Device'
          : S.outbox.length > 0
            ? `Offline · ${S.outbox.length}`
            : 'Offline';
      }
    }

    const pushDot = S.$('mobile-push-dot');
    const pushBtn = S.$('mobile-push-btn');
    const railPushDot = S.$('rail-push-dot');
    const railPushBtn = S.$('rail-push-btn');
    const nf = Object.assign({ ...S.DEFAULT_NOTIF }, S.prefs.notif || {});
    const pushActive = Boolean(nf.enabled && S.pushSub && S.notifPerm() === 'granted');
    if (pushDot) {
      pushDot.className = `conn-dot ${pushActive ? 'live' : ''}`;
    }
    if (railPushDot) {
      railPushDot.className = `conn-dot ${pushActive ? 'live' : ''}`;
    }
    const bellTitle = pushActive
      ? 'Notifications & Home Screen Badge (Web Push Active)'
      : 'Notifications & Home Screen Badge (Tap to enable Web Push)';
    if (pushBtn) {
      pushBtn.classList.toggle('is-push-active', pushActive);
      pushBtn.style.borderColor = '';
      pushBtn.style.color = '';
      pushBtn.setAttribute('aria-label', bellTitle);
    }
    if (railPushBtn) {
      railPushBtn.classList.toggle('is-push-active', pushActive);
      railPushBtn.style.borderColor = '';
      railPushBtn.style.color = '';
      railPushBtn.setAttribute('aria-label', bellTitle);
    }

    const connModal = S.$('conn-modal');
    if (connModal && !connModal.hidden) {
      renderConnModal();
    }
    const notifModal = S.$('notif-modal');
    if (notifModal && !notifModal.hidden) {
      S.renderNotifModal();
    }
  }

  function openConnModal() {
    const modal = S.$('conn-modal');
    if (!modal) return;
    renderConnModal();
    const wasHidden = modal.hidden;
    modal.hidden = false;
    if (wasHidden) S.pushUiHistoryState('conn-modal');
  }

  function closeConnModal() {
    const modal = S.$('conn-modal');
    if (modal) modal.hidden = true;
  }

  function getEdgeHttpBaseUrl() {
    const raw = String(S.prefs.edgeRelayUrl || discoveredEdgeUrl || DEFAULT_EDGE_RELAY_URL).trim();
    if (!raw) return '';
    return raw
      .replace(/^wss:\/\//i, 'https://')
      .replace(/^ws:\/\//i, 'http://')
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '')
      .replace(/\/ws$/i, '')
      .replace(/\/+$/, '');
  }

  async function finalizeInteractivePairSuccess(parsed) {
    if (!S.applyPairPayloadToPrefs(parsed)) return false;
    refreshCloudConfig();
    resetTransportsForFreshPairing();
    const targetEdge = S.prefs.edgeRelayUrl || discoveredEdgeUrl || DEFAULT_EDGE_RELAY_URL;
    if (!S.isHeadlessBrowser && targetEdge) {
      connectEdgeWs(targetEdge).catch(() => {});
    }
    if (!S.isHeadlessBrowser) {
      await syncData({ force: true, toast: false });
    }
    closeConnModal();
    updateConnectionBanner();
    S.renderAll();
    S.showToast('✓ Device paired & connected to THEO Fleet');
    return true;
  }

  async function claimSixDigitPairCode(rawCode) {
    if (pairClaimInFlight) return false;
    const digits = String(rawCode || '').replace(/\D+/g, '');
    if (digits.length !== 6) {
      S.showToast('Enter the 6-digit pairing code shown on your PC');
      return false;
    }
    if (S.isHeadlessBrowser && !window.__THEO_ALLOW_PAIR_MOCK_FETCH) {
      S.showToast('Headless quarantine active');
      return false;
    }
    const httpBase = getEdgeHttpBaseUrl();
    if (!httpBase) {
      S.showToast('Edge Relay URL is not configured');
      return false;
    }
    pairClaimInFlight = true;
    let timer = null;
    try {
      const ctrl = new AbortController();
      timer = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(`${httpBase}/pair/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: digits }),
        signal: ctrl.signal
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok || !data?.bundle) {
        S.showToast(data?.error || 'Invalid or expired 6-digit code');
        return false;
      }
      const parsed = S.decodePairTokenString(data.bundle);
      if (!parsed) {
        S.showToast('Invalid pairing bundle returned by relay');
        return false;
      }
      return await finalizeInteractivePairSuccess(parsed);
    } catch {
      S.showToast('Could not reach Edge Relay — check internet connection');
      return false;
    } finally {
      if (timer) clearTimeout(timer);
      pairClaimInFlight = false;
    }
  }

  async function generateSixDigitPairCode(opts = {}) {
    const silentToast = Boolean(opts && opts.silentToast);
    if (pairCodeGenInFlight) return null;
    if (S.isHeadlessBrowser && !window.__THEO_ALLOW_PAIR_MOCK_FETCH) return null;
    pairCodeGenInFlight = true;
    let timer = null;
    try {
      if (localBridgeBase) {
        const res = await authFetchLocal(`${localBridgeBase}/api/pair-code`, { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.ok && data?.code) {
          activeGeneratedPairCode = {
            code: data.code,
            formatted: data.formatted || `${data.code.slice(0, 3)}-${data.code.slice(3)}`,
            expiresAt: Number(data.expiresAt || Date.now() + 600000)
          };
          S.renderAnalyticsView();
          renderConnModal();
          if (!silentToast) {
            S.showToast(`🔢 6-Digit Phone Code: ${activeGeneratedPairCode.formatted} (valid 10m)`);
          }
          return activeGeneratedPairCode;
        }
      }
      refreshCloudConfig();
      const bearer = await getBridgeAuthTokenHex();
      const bundle = S.encodePairTokenString({
        cloudUrl: cloudCfg.url,
        cloudKey: cloudCfg.key,
        edgeAccessKey: cloudCfg.edgeAccessKey,
        edgeRelayUrl: S.prefs.edgeRelayUrl || discoveredEdgeUrl || DEFAULT_EDGE_RELAY_URL,
        port: cloudCfg.port
      });
      const httpBase = getEdgeHttpBaseUrl();
      if (!bearer || !bundle || !httpBase) {
        S.showToast('Open Settings on your paired PC (http://127.0.0.1:4318) to generate a 6-digit code');
        return null;
      }
      const ctrl = new AbortController();
      timer = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(`${httpBase}/pair/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearer}`
        },
        body: JSON.stringify({ bundle, ttlSec: 600 }),
        signal: ctrl.signal
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok || !data?.code) {
        S.showToast(data?.error || 'Could not generate 6-digit code');
        return null;
      }
      activeGeneratedPairCode = {
        code: data.code,
        formatted: data.formatted || `${data.code.slice(0, 3)}-${data.code.slice(3)}`,
        expiresAt: Number(data.expiresAt || Date.now() + 600000)
      };
      S.renderAnalyticsView();
      renderConnModal();
      if (!silentToast) {
        S.showToast(`🔢 6-Digit Phone Code: ${activeGeneratedPairCode.formatted} (valid 10m)`);
      }
      return activeGeneratedPairCode;
    } catch {
      if (!silentToast) {
        S.showToast('Failed to contact Edge Relay to mint 6-digit code');
      }
      return null;
    } finally {
      if (timer) clearTimeout(timer);
      pairCodeGenInFlight = false;
    }
  }

  function buildPcSetupLauncherCmd(sixDigitCode = '') {
    const cleanDigits = String(sixDigitCode || '').replace(/\D+/g, '').slice(0, 6);
    const codeLine =
      cleanDigits.length === 6
        ? `set "THEO_PAIR_CODE=${cleanDigits}"`
        : 'rem Unpaired launcher (enter 6-digit code in the setup window if pairing a new PC)';
    const psOneLiner = [
      "$ErrorActionPreference='Stop'",
      'try {',
      "  $ps1=Join-Path $HOME 'bhfirms\\memory\\Admin\\Setup-THEO-PC.ps1'",
      "  if(Test-Path -LiteralPath $ps1){& $ps1 -Gui}else{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;$tmp=Join-Path $env:TEMP ('theo-install-'+$PID+'.ps1');Invoke-WebRequest -Uri 'https://theo.husseinbdeir.workers.dev/install.ps1' -OutFile $tmp -UseBasicParsing;try{& $tmp -Gui}finally{Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue}}",
      "} catch { try { Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'THEO PC Setup', 'OK', 'Error') } catch {}; exit 1 }"
    ].join(';');
    return [
      '@echo off',
      'setlocal',
      ':: THEO PC Setup — Double-click on Windows to open the visual checklist & fleet setup window.',
      ':: Carries at most a single-use 10-minute 6-digit pairing code (zero permanent secrets).',
      codeLine,
      `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -STA -Command "${psOneLiner}"`,
      'endlocal',
      ''
    ].join('\r\n');
  }

  let downloadPcSetupInFlight = false;
  let lastLauncherMintedCode = null;

  async function downloadPcSetupLauncher() {
    if (downloadPcSetupInFlight) return;
    downloadPcSetupInFlight = true;
    const dlButtons = Array.from(document.querySelectorAll('[data-download-pc-setup]'));
    for (const b of dlButtons) b.disabled = true;
    try {
      let minted = null;
      if (hasAnyPairingCredentials()) {
        const now = Date.now();
        if (
          lastLauncherMintedCode &&
          now - Number(lastLauncherMintedCode.mintedAt || 0) < 15000 &&
          Number(lastLauncherMintedCode.expiresAt || 0) - now > 60000
        ) {
          minted = lastLauncherMintedCode;
        } else {
          const fresh = await generateSixDigitPairCode({ silentToast: true });
          if (fresh && fresh.code) {
            lastLauncherMintedCode = { ...fresh, mintedAt: now };
            minted = lastLauncherMintedCode;
          }
        }
      }
      const cmdText = buildPcSetupLauncherCmd(minted?.code || '');
      const fileName = 'Set-Up-THEO-PC.cmd';
      if (typeof window !== 'undefined' && window.__THEO_CAPTURE_PC_SETUP_CMD) {
        window.__THEO_CAPTURED_PC_SETUP = {
          fileName,
          hasPairCode: Boolean(minted?.code),
          cmdText
        };
        S.showToast(
          minted?.formatted
            ? `⬇ Downloaded Set-Up-THEO-PC.cmd (10m code ${minted.formatted})`
            : '⬇ Downloaded Set-Up-THEO-PC.cmd'
        );
        return;
      }
      const ua = String((typeof navigator !== 'undefined' && navigator.userAgent) || '');
      const isIosStandalone =
        /iPhone|iPad|iPod/i.test(ua) &&
        document.documentElement.classList.contains('ios-standalone');
      if (isIosStandalone) {
        try {
          const f = new File([cmdText], fileName, { type: 'text/plain' });
          if (navigator.canShare && navigator.canShare({ files: [f] })) {
            await navigator.share({ files: [f], title: fileName });
            return;
          }
        } catch {}
        S.showToast(
          minted?.formatted
            ? `🔢 6-Digit PC Code: ${minted.formatted} — open THEO on your PC or enter in Set Up This PC`
            : 'Open THEO in your PC browser and click Download PC Setup'
        );
        return;
      }
      const blob = new Blob([cmdText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1800);
      S.showToast(
        minted?.formatted
          ? `Downloaded Set-Up-THEO-PC.cmd (code ${minted.formatted})`
          : 'Downloaded Set-Up-THEO-PC.cmd'
      );
    } finally {
      downloadPcSetupInFlight = false;
      for (const b of document.querySelectorAll('[data-download-pc-setup]')) {
        b.disabled = false;
      }
    }
  }

  function renderQuickPairOnboardingCardHtml(surfaceKey = 'main') {
    return `
      <div class="quick-pair-card" data-quick-pair-surface="${S.esc(surfaceKey)}">
        <div class="quick-pair-head">
          <div>
            <div class="quick-pair-title">Pair This Device</div>
          </div>
          <span class="pill-count amber">One-Time Setup</span>
        </div>
        <p class="meta-timestamp quick-pair-desc">
          Enter the <strong>6-digit code</strong> from your PC (works inside iOS Home Screen apps), or paste your <code>#pair=</code> link.
        </p>
        <div class="quick-pair-row">
          <input
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="24"
            class="input-field mono quick-pair-code-input"
            data-pair-code-input
            placeholder="6-digit code (e.g. 482-917)"
            aria-label="6-digit device pairing code"
          >
          <button type="button" class="btn-brass-sm quick-pair-btn" data-pair-code-submit>Connect</button>
        </div>
        <div class="quick-pair-subrow">
          <button type="button" class="btn-ghost-sm" data-pair-paste-clipboard>Paste Pair Link</button>
          <button type="button" class="btn-ghost-sm" data-pair-toggle-link-box>${showQuickPairLinkFallback ? 'Hide Link Box' : 'Type / Paste Manually'}</button>
          <button type="button" class="btn-ghost-sm" data-download-pc-setup="1">⬇ Download PC Setup</button>
        </div>
        <div class="quick-pair-manual" data-pair-manual-wrap ${showQuickPairLinkFallback ? '' : 'hidden'}>
          <input
            type="text"
            class="input-field mono pin-masked"
            data-pair-link-input
            placeholder="Paste https://.../#pair=... or 64-hex key"
            autocomplete="off"
            spellcheck="false"
            aria-label="Paste pairing URL or access key"
          >
          <button type="button" class="btn-brass-sm" data-pair-link-submit>Apply Link</button>
        </div>
      </div>
    `;
  }

  function renderConnModal() {
    const dotEl = S.$('conn-modal-dot');
    const titleEl = S.$('conn-modal-title');
    const bodyEl = S.$('conn-modal-body');
    if (!bodyEl || S.isFocusInsideContainerInputs(bodyEl)) return;

    const conn = S.appState?.connection || {};
    const lanUrl = conn.lanUrl || '';
    const hostName = conn.hostname || 'Paired Host';
    const activeCount = (S.appState?.rows || []).filter((r) => !r.archived).length;
    const runningCount = (S.appState?.rows || []).filter((r) => !r.archived && r.status === 'working').length;
    const snapTime = S.appState?.generatedAt ? S.timeAgo(S.appState.generatedAt) : '—';
    const nf = Object.assign({ ...S.DEFAULT_NOTIF }, S.prefs.notif || {});
    const pushActive = Boolean(nf.enabled && S.pushSub && S.notifPerm() === 'granted');

    const fleetList = getUnifiedFleetDevices();
    if (dotEl) {
      dotEl.className = `conn-dot ${connMode === 'local' || connMode === 'edge' || edgeWsAuthed ? 'live' : connMode === 'cloud' ? 'cloud' : ''}`;
    }
    const isPairedNow = hasAnyPairingCredentials();
    if (titleEl) {
      titleEl.textContent =
        connMode === 'local'
          ? `Connected · Direct Host (${localWsRttMs ? `${localWsRttMs}ms` : 'Live'})`
          : connMode === 'edge' || edgeWsAuthed
            ? `Connected · Edge WebSocket (${edgeWsRttMs ? `${edgeWsRttMs}ms` : 'Live'})`
            : connMode === 'cloud'
              ? 'Connected · Cloud Relay'
              : isPairedNow
                ? 'Offline · Local Snapshot Cache'
                : 'Pair This Device';
    }

    const fleetRowsHtml = fleetList.length
      ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0">
          ${fleetList
            .map(
              (d) =>
                `<span class="sess-device-badge ${d.online ? 'is-online' : ''}">${d.online ? '●' : '◐'} ${S.esc(d.name || d.id)}${d.sessionCount ? ` · ${d.sessionCount}` : ''}${renderFleetPcSetupPillHtml(d)}${renderFleetStalledWtPillHtml(d)}</span>`
            )
            .join('')}
        </div>`
      : '';

    bodyEl.innerHTML = `
      ${!isPairedNow ? renderQuickPairOnboardingCardHtml('conn-modal') : ''}
      <div class="conn-stat-grid tabular">
        <div class="conn-stat-box">
          <span class="conn-stat-lbl">Active Host</span>
          <span class="conn-stat-val">${S.esc(localWsDevice?.name || hostName)}</span>
        </div>
        <div class="conn-stat-box">
          <span class="conn-stat-lbl">Transport</span>
          <span class="conn-stat-val">${localWsAuthed ? `Local WS (${localWsRttMs || 2}ms)` : edgeWsAuthed ? `Edge WS (${edgeWsRttMs || 18}ms)` : S.esc(snapTime)}</span>
        </div>
        <div class="conn-stat-box">
          <span class="conn-stat-lbl">Fleet Sessions</span>
          <span class="conn-stat-val">${runningCount} running · ${activeCount} sessions</span>
        </div>
        <div class="conn-stat-box">
          <span class="conn-stat-lbl">Web Push Alerts</span>
          <span class="conn-stat-val" style="color:${pushActive ? 'var(--emerald)' : 'var(--amber)'}">${pushActive ? 'Active' : 'Off'}</span>
        </div>
      </div>
      ${fleetRowsHtml}
      ${S.renderClaudeModeSelectorHtml('modal')}
      <div class="meta-timestamp" style="line-height:1.45">
        ${
          connMode === 'local'
            ? `Streaming directly from this PC on <code>${S.esc(localBridgeBase)}</code>.`
            : `Synced via <strong>THEO Edge Relay</strong>. Prompts, approvals, and session actions go straight to your PC.`
        }
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
        <button type="button" class="btn-brass-sm" id="conn-modal-sync-btn" style="flex:1">↻ Sync Now</button>
        <button type="button" class="btn-ghost-sm" id="conn-modal-pulse-btn" data-goto-tab="pulse">Pulse &amp; Accounts</button>
        <button type="button" class="btn-ghost-sm" id="conn-modal-sessions-btn" data-goto-tab="sessions">All Sessions</button>
        <button type="button" class="btn-ghost-sm" id="conn-modal-settings-btn" data-goto-tab="analytics">Settings &amp; Usage</button>
        <button type="button" class="btn-ghost-sm" data-download-pc-setup="1">⬇ Download PC Setup</button>
        ${
          pushActive
            ? `<button type="button" class="btn-ghost-sm" data-push-act="test">Test Push</button><button type="button" class="btn-ghost-sm" data-push-act="reset" aria-label="Mint a fresh iOS APNs / Web Push subscription">Re-Pair Push</button>`
            : `<button type="button" class="btn-ghost-sm" data-push-act="enable">${S.pushBusy ? 'Enabling…' : 'Enable Push'}</button>`
        }
        ${
          lanUrl && /^https?:\/\//i.test(lanUrl) && connMode !== 'local'
            ? `<a href="${S.esc(lanUrl)}" class="btn-ghost-sm" style="text-decoration:none;display:inline-flex;align-items:center">Open Wi-Fi Direct (${S.esc(lanUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''))})</a>`
            : ''
        }
      </div>
    `;
  }

  function renderFleetPcSetupPulseBannerHtml() {
    const pendingHosts = getUnifiedFleetDevices().filter(
      (d) => d && d.pcSetup && Number(d.pcSetup.pendingCount || 0) > 0
    );
    if (pendingHosts.length === 0) return '';
    const summaryText = pendingHosts
      .map((d) => {
        const ps = d.pcSetup;
        const stepHint =
          Array.isArray(ps.pendingTitles) && ps.pendingTitles.length > 0
            ? `: ${ps.pendingTitles.slice(0, 2).join(', ')}${ps.pendingTitles.length > 2 ? ` +${ps.pendingTitles.length - 2}` : ''}`
            : '';
        return `${S.esc(d.name || d.id)} (${ps.okCount}/${ps.totalCount}${S.esc(stepHint)})`;
      })
      .join(' · ');
    // A PC that is online and reports phone-only readiness runs a build that takes the setup request itself.
    const applyButtons = pendingHosts
      .filter((d) => d.online && d.pwaReady)
      .slice(0, 4)
      .map((d) => renderApplyPcSetupButtonHtml(d, 'btn-brass-sm'))
      .join('');
    return `
      <div class="pc-setup-pulse-card" id="pulse-pc-setup-card">
        <div class="pc-setup-pulse-main">
          <div class="pc-setup-pulse-title">${pendingHosts.length === 1 ? '1 PC has pending setup updates' : `${pendingHosts.length} PCs have pending setup updates`}</div>
          <div class="meta-timestamp">${summaryText}. ${applyButtons ? 'Tap <strong>Apply</strong> to run the setup on that PC from here.' : 'Click <strong>Apply Setup</strong> in the THEO sidebar on that PC, or open <strong>Set Up This PC</strong>.'}</div>
        </div>
        <div class="pc-setup-pulse-actions">
          ${applyButtons}
          <button type="button" class="btn-ghost-sm" data-download-pc-setup="1">⬇ Download PC Setup</button>
        </div>
      </div>
    `;
  }

  // PCs whose setup run was started from this phone, so the button reads "Applying" until the PC reports back.
  const pcSetupApplyStartedAt = new Map();
  const PC_SETUP_APPLY_SHOW_MS = 4 * 60 * 1000;

  // True while a setup run started from this phone is taken to be in progress on that PC: until the PC reports a
  // check made after the tap (its pill then shows the outcome), or four minutes at most.
  function isPcSetupApplyShown(d) {
    const startedAt = pcSetupApplyStartedAt.get(d && d.id) || 0;
    if (!startedAt) return false;
    const reportedAfter = Number(d?.pcSetup?.checkedAt || 0) > startedAt;
    if (reportedAfter || Date.now() - startedAt >= PC_SETUP_APPLY_SHOW_MS) {
      pcSetupApplyStartedAt.delete(d.id);
      return false;
    }
    return true;
  }

  function renderApplyPcSetupButtonHtml(d, cls) {
    const busy = isPcSetupApplyShown(d);
    const name = String(d.name || d.id || 'PC').slice(0, 24);
    return `<button type="button" class="${cls}" data-apply-pc-setup="${S.esc(d.id)}" ${busy ? 'disabled' : ''}>${busy ? `Applying on ${S.esc(name)}…` : `Apply on ${S.esc(name)}`}</button>`;
  }

  async function applyPcSetupOnDevice(devId) {
    const cleanId = String(devId || '').trim();
    const dev = cleanId ? fleetDevicesMap.get(cleanId) : null;
    if (!dev) return;
    const name = String(dev.name || dev.id || 'that PC');
    if (isPcSetupApplyShown(dev)) return;
    if (!dev.online) {
      S.showToast(`${name} is offline. Switch it on, then apply the setup.`);
      return;
    }
    pcSetupApplyStartedAt.set(cleanId, Date.now());
    S.renderPulseView();
    const res = await dispatchRemoteCommand({
      type: 'sessionAction',
      action: 'applyPcSetup',
      subAction: 'applyPcSetup',
      targetDeviceId: cleanId
    }).catch(() => null);
    const { toast, inProgress } = describePcSetupReply(name, res);
    if (!inProgress) pcSetupApplyStartedAt.delete(cleanId);
    S.showToast(toast);
    S.renderPulseView();
  }

  // The reply of a command sent to one PC: the PC's own answer, or {} when the command is still on its way.
  // A reply that came through another PC and was queued there (`queued`) is not the PC's own answer.
  function readDirectPcReply(res) {
    const mode = String(res?.mode || '');
    const out = res && res.out && typeof res.out === 'object' ? res.out : {};
    const reply = out.result && typeof out.result === 'object' ? out.result : out;
    const direct = mode === 'local_ws' || mode === 'edge_ws' || mode === 'local';
    return { mode, reply, answered: direct && !reply.queued, queuedOnAnotherPc: direct && Boolean(reply.queued) };
  }

  // What to say after asking a PC to show a session in a VS Code tab. VS Code is optional: a PC with no window
  // open answers `opened: false`, and the session is already usable here.
  function describeVsCodeOpenReply(res, openedText) {
    const { mode, reply, answered } = readDirectPcReply(res);
    if (mode === 'quarantined') return openedText;
    if (answered && (reply.opened === false || reply.standalone)) {
      return 'VS Code is not open on that PC. The session is fully usable here in THEO.';
    }
    if (answered) return openedText;
    return 'Sent to the PC. A tab opens there only if VS Code is running.';
  }

  // What to tell the user about an Apply PC setup tap. "Started" is said only when that PC answered that it
  // started; a request still on its way, refused, or unconfirmed is said as that.
  function describePcSetupReply(name, res) {
    if (!res) return { toast: `Could not send the setup request to ${name}.`, inProgress: false };
    const { mode, reply, answered, queuedOnAnotherPc } = readDirectPcReply(res);
    if (mode === 'quarantined') {
      return { toast: `Setup started on ${name}. Its pill updates when it finishes.`, inProgress: true };
    }
    if (mode === 'cloud' || queuedOnAnotherPc) {
      return {
        toast: `${name} did not answer directly. The request is queued and starts if the PC picks it up within 15 minutes.`,
        inProgress: false
      };
    }
    if (!answered) {
      return {
        toast: 'The phone is offline. The request goes out when it reconnects, and is dropped after 15 minutes.',
        inProgress: false
      };
    }
    if (reply.reason === 'sessions_running') {
      return { toast: `${name} has sessions running. Apply the setup when they finish.`, inProgress: false };
    }
    if (reply.busy) return { toast: `${name} is already applying its setup.`, inProgress: true };
    if (reply.skipped === 'stale_request') {
      return {
        toast: `${name} dropped the request: it was more than 15 minutes old. Tap Apply again.`,
        inProgress: false
      };
    }
    if (reply.started === true) {
      return { toast: `Setup started on ${name}. Its pill updates when it finishes.`, inProgress: true };
    }
    if (reply.started === false || reply.refused) {
      return { toast: `${name} could not start its setup. Use Apply Setup on that PC.`, inProgress: false };
    }
    return {
      toast: `${name} did not confirm that the setup started. Watch its setup pill, or use Apply Setup on that PC.`,
      inProgress: false
    };
  }

  // ---- Add an account from THEO, with no VS Code window on the PC ----
  // The PC's background service runs the sign-in; this sheet shows its link and takes its code. Every step
  // goes over a live link only (`liveOnly`): a sign-in link or code is never queued in the cloud store.
  //   Claude:       open the link on any device, sign in, type the code the page shows.
  //   Antigravity:  Google returns to the PC itself to finish, so the link is opened in a browser on that PC.
  let acctSignIn = null;

  function isSafeHttpsLink(url) {
    return /^https:\/\/[^\s"'<>]+$/i.test(String(url || ''));
  }

  function accountSignInProviderName(provider) {
    return provider === 'claude' ? 'Claude Code' : 'Antigravity';
  }

  async function sendAccountSignInStep(subAction, extra = {}) {
    if (!acctSignIn) return null;
    const res = await dispatchRemoteCommand({
      type: 'sessionAction',
      action: subAction,
      subAction,
      targetDeviceId: acctSignIn.hostId,
      liveOnly: true,
      ...extra
    }).catch(() => null);
    const info = readDirectPcReply(res);
    if (info.mode === 'quarantined') return { quarantined: true };
    return info.answered ? info.reply : null;
  }

  function applyAccountSignInReply(reply) {
    if (!acctSignIn) return;
    if (!reply) {
      acctSignIn.linkLost = true;
      return;
    }
    acctSignIn.linkLost = false;
    if (reply.progress && typeof reply.progress === 'object') {
      acctSignIn.progress = reply.progress;
    }
  }

  async function startAccountSignIn(provider, label, host) {
    stopAccountSignInPolling();
    acctSignIn = {
      provider: provider === 'claude' ? 'claude' : 'antigravity',
      label: String(label || ''),
      hostId: host.id,
      hostName: host.name || 'the PC',
      phase: 'starting',
      progress: null,
      error: '',
      note: '',
      linkLost: false,
      pollTimer: null
    };
    const modal = S.$('acct-signin-modal');
    if (modal) {
      const wasHidden = modal.hidden;
      modal.hidden = false;
      if (wasHidden) S.pushUiHistoryState('acct-signin-modal');
    }
    renderAccountSignInModal();
    const session = acctSignIn;
    const reply = await sendAccountSignInStep('accountAdd', {
      provider: session.provider,
      label: session.label,
      switchOnComplete: true
    });
    if (acctSignIn !== session) return;
    if (!reply) {
      session.phase = 'failed';
      session.error = `THEO is not linked live to ${session.hostName} right now. A sign-in is only started over a live link.`;
      renderAccountSignInModal();
      return;
    }
    if (reply.quarantined) {
      session.phase = 'pending';
      renderAccountSignInModal();
      return;
    }
    if (reply.started === false) {
      session.phase = 'failed';
      session.error = String(reply.error || `${session.hostName} could not start the sign-in.`);
      renderAccountSignInModal();
      return;
    }
    // `started` is absent when a VS Code window on that PC took the request: the sign-in runs in its terminal
    // there (which keeps the link to itself), and the status below still reports how it ends.
    if (reply.started !== true) {
      session.viaVsCode = true;
      session.note = `VS Code is open on ${session.hostName}: the sign-in is running in its terminal there.`;
    }
    session.phase = 'pending';
    applyAccountSignInReply(reply);
    renderAccountSignInModal();
    session.pollTimer = setInterval(() => pollAccountSignIn(session), 2000);
    pollAccountSignIn(session);
  }

  function stopAccountSignInPolling() {
    if (acctSignIn?.pollTimer) {
      clearInterval(acctSignIn.pollTimer);
      acctSignIn.pollTimer = null;
    }
  }

  async function pollAccountSignIn(session) {
    if (acctSignIn !== session || session.phase !== 'pending' || session.polling) return;
    session.polling = true;
    try {
      const reply = await sendAccountSignInStep('accountSignInStatus');
      if (acctSignIn !== session) return;
      applyAccountSignInReply(reply);
      const progress = session.progress || {};
      if (reply && !reply.quarantined && !progress.pending) {
        stopAccountSignInPolling();
        if (progress.lastSuccess && progress.lastSuccess.provider === session.provider) {
          session.phase = 'done';
          S.showToast(
            `Signed in to ${accountSignInProviderName(session.provider)} on ${session.hostName} as ${progress.lastSuccess.email || 'the new account'}`
          );
          closeAccountSignInModal();
          setTimeout(() => syncData(), 400);
          return;
        }
        session.phase = 'failed';
        session.error = String(progress.lastFailure?.message || 'The sign-in ended before it finished.');
      }
      // Do not redraw under the user's fingers while the code is being typed.
      const codeInput = S.$('acct-signin-code');
      if (!(codeInput && document.activeElement === codeInput && session.phase === 'pending')) {
        renderAccountSignInModal();
      } else {
        const status = S.$('acct-signin-status');
        if (status) status.textContent = accountSignInStatusLine(session);
      }
    } finally {
      session.polling = false;
    }
  }

  function accountSignInStatusLine(session) {
    if (session.linkLost) return `Lost the live link to ${session.hostName}. Trying again…`;
    return String(session.progress?.pending?.message || session.note || '');
  }

  function closeAccountSignInModal() {
    const modal = S.$('acct-signin-modal');
    if (modal) modal.hidden = true;
    const session = acctSignIn;
    stopAccountSignInPolling();
    acctSignIn = null;
    // Closing the sheet while a sign-in still runs stops it on the PC: nothing is left waiting unseen.
    if (session && session.phase === 'pending') {
      dispatchRemoteCommand({
        type: 'sessionAction',
        action: 'accountSignInCancel',
        subAction: 'accountSignInCancel',
        targetDeviceId: session.hostId,
        liveOnly: true
      }).catch(() => {});
    }
  }

  function renderAccountSignInModal() {
    const body = S.$('acct-signin-body');
    const title = S.$('acct-signin-title');
    const dot = S.$('acct-signin-dot');
    if (!body) return;
    const s = acctSignIn;
    if (!s) {
      body.innerHTML = '';
      return;
    }
    const provName = accountSignInProviderName(s.provider);
    const host = S.esc(s.hostName);
    if (title) title.textContent = `Add a ${provName} account on ${s.hostName}`;
    if (dot) {
      dot.className = `conn-dot ${s.phase === 'failed' ? 'offline' : s.phase === 'pending' ? 'online' : ''}`.trim();
    }
    if (s.phase === 'starting') {
      body.innerHTML = `<div class="acct-signin-wait">Starting the sign-in on ${host}…</div>`;
      return;
    }
    if (s.phase === 'failed') {
      body.innerHTML = `
        <div class="acct-signin-error">${S.esc(s.error || 'The sign-in did not finish.')}</div>
        <div class="acct-signin-actions">
          <button type="button" class="btn-brass-sm" data-acct-signin-act="retry">Start again</button>
          <button type="button" class="btn-ghost-sm" data-acct-signin-act="close">Close</button>
        </div>
      `;
      return;
    }
    const pending = s.progress?.pending || {};
    const authUrl = isSafeHttpsLink(pending.authUrl) ? pending.authUrl : '';
    const verifyUrl = isSafeHttpsLink(pending.verificationUrl) ? pending.verificationUrl : '';
    const onThatPc = Boolean(localWsDevice?.id && localWsDevice.id === s.hostId);
    const statusLine = `<div class="acct-signin-status" id="acct-signin-status">${S.esc(accountSignInStatusLine(s))}</div>`;
    const cancelRow = `
      <div class="acct-signin-actions acct-signin-foot">
        <button type="button" class="btn-ghost-sm" data-acct-signin-act="cancel">Cancel sign-in</button>
      </div>`;
    if (!authUrl && !verifyUrl) {
      body.innerHTML = s.viaVsCode
        ? `<div class="acct-signin-wait">The sign-in opened in the VS Code window on ${host}. Finish it in the browser there; this sheet closes when the account is added. To sign in from here instead, close VS Code on ${host} and start again.</div>${statusLine}${cancelRow}`
        : `<div class="acct-signin-wait">Preparing the sign-in link on ${host}…</div>${statusLine}${cancelRow}`;
      return;
    }
    if (s.provider === 'claude') {
      const keptCode = String(S.$('acct-signin-code')?.value || '');
      body.innerHTML = `
        <div class="acct-signin-step">
          <span class="acct-signin-n">1</span>
          <div class="acct-signin-copy">
            <div>Open the Anthropic sign-in page and sign in. Any device works.</div>
            <div class="acct-signin-actions">
              <a class="btn-brass-sm" href="${S.esc(authUrl)}" target="_blank" rel="noopener noreferrer">Open sign-in page</a>
              <button type="button" class="btn-ghost-sm" data-acct-signin-act="open-on-pc">Open on ${host}</button>
            </div>
          </div>
        </div>
        <div class="acct-signin-step">
          <span class="acct-signin-n">2</span>
          <div class="acct-signin-copy">
            <div>Enter the code the page shows when you finish. If it was opened on ${host} and shows no code, it finishes by itself.</div>
            <div class="acct-signin-code-row">
              <input type="text" id="acct-signin-code" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Paste the code" ${pending.codeSubmitted ? 'disabled' : ''}>
              <button type="button" class="btn-brass-sm" data-acct-signin-act="submit-code" ${pending.codeSubmitted ? 'disabled' : ''}>${pending.codeSubmitted ? 'Checking…' : 'Finish'}</button>
            </div>
          </div>
        </div>
        ${statusLine}${cancelRow}
      `;
      const codeInput = S.$('acct-signin-code');
      if (codeInput && keptCode && !pending.codeSubmitted) codeInput.value = keptCode;
      return;
    }
    if (pending.awaitingVerification && verifyUrl) {
      body.innerHTML = `
        <div class="acct-signin-step">
          <span class="acct-signin-n">!</span>
          <div class="acct-signin-copy">
            <div>Google asked for a one-time check on this account. Complete it, then continue.</div>
            <div class="acct-signin-actions">
              <a class="btn-brass-sm" href="${S.esc(verifyUrl)}" target="_blank" rel="noopener noreferrer">Open verification page</a>
              <button type="button" class="btn-ghost-sm" data-acct-signin-act="verified">Verified, continue</button>
            </div>
          </div>
        </div>
        ${statusLine}${cancelRow}
      `;
      return;
    }
    body.innerHTML = `
      <div class="acct-signin-step">
        <span class="acct-signin-n">1</span>
        <div class="acct-signin-copy">
          <div>Open the Google sign-in page in a browser on ${host} and choose the account. Google finishes this sign-in on the PC itself, so the page has to be opened there.</div>
          <div class="acct-signin-actions">
            ${
              onThatPc
                ? `<a class="btn-brass-sm" href="${S.esc(authUrl)}" target="_blank" rel="noopener noreferrer">Open sign-in page</a>`
                : `<button type="button" class="btn-brass-sm" data-acct-signin-act="open-on-pc">Open on ${host}</button>`
            }
            <button type="button" class="btn-ghost-sm" data-acct-signin-act="copy-link">Copy link</button>
          </div>
        </div>
      </div>
      <div class="acct-signin-step">
        <span class="acct-signin-n">2</span>
        <div class="acct-signin-copy">This sheet closes by itself when the account is added.</div>
      </div>
      ${statusLine}${cancelRow}
    `;
  }

  async function handleAccountSignInAct(act) {
    const s = acctSignIn;
    if (!s) return;
    if (act === 'close') {
      closeAccountSignInModal();
      return;
    }
    if (act === 'retry') {
      startAccountSignIn(s.provider, s.label, { id: s.hostId, name: s.hostName });
      return;
    }
    if (act === 'cancel') {
      closeAccountSignInModal();
      S.showToast('Sign-in cancelled');
      return;
    }
    if (act === 'copy-link') {
      const link = s.progress?.pending?.authUrl;
      if (!isSafeHttpsLink(link)) return;
      try {
        await navigator.clipboard.writeText(link);
        S.showToast('Sign-in link copied');
      } catch {
        S.showToast('Could not copy the link on this device');
      }
      return;
    }
    if (act === 'open-on-pc') {
      const reply = await sendAccountSignInStep('accountSignInOpenOnPc');
      if (acctSignIn !== s) return;
      S.showToast(
        reply && reply.accepted
          ? `Sign-in page opened in the browser on ${s.hostName}`
          : String(reply?.error || `${s.hostName} did not answer. Try again.`)
      );
      return;
    }
    if (act === 'verified') {
      const reply = await sendAccountSignInStep('accountVerifyContinue');
      if (acctSignIn !== s) return;
      applyAccountSignInReply(reply);
      if (reply && !reply.accepted) S.showToast(String(reply.error || 'That did not go through.'));
      renderAccountSignInModal();
      return;
    }
    if (act === 'submit-code') {
      const input = S.$('acct-signin-code');
      const code = String(input?.value || '').trim();
      if (!code) {
        S.showToast('Paste the code from the sign-in page first');
        return;
      }
      const reply = await sendAccountSignInStep('accountSignInCode', { code });
      if (acctSignIn !== s) return;
      if (!reply) {
        S.showToast(`Lost the live link to ${s.hostName}. The code was not sent.`);
        return;
      }
      applyAccountSignInReply(reply);
      if (reply.accepted) {
        if (input) input.value = '';
      } else {
        S.showToast(String(reply.error || 'That code was not accepted.'));
      }
      renderAccountSignInModal();
    }
  }

  // Phone-only readiness: can THEO be driven from here alone, with VS Code closed on every PC?
  // null = follow the state (open while something needs attention); true/false = the user's own choice.
  let pwaReadyCardOpen = null;

  Object.assign(S, {
    DEFAULT_EDGE_RELAY_URL,
    MAX_CLOUD_FALLBACK_CHARS,
    MAX_LIVE_WS_ATTACHMENT_BYTES,
    UNSAVED_WORK_OLD_AFTER_MS,
    applyPcSetupOnDevice,
    authFetchLocal,
    buildTheoMigrationUrl,
    calcAttachmentsPayloadChars,
    claimSixDigitPairCode,
    cleanTargetThreadId,
    closeAccountSignInModal,
    closeConnModal,
    cloudCfg,
    compactAttachmentsForCloudFallback,
    connectEdgeWs,
    connectLocalWs,
    describeVsCodeOpenReply,
    dispatchRemoteCommand,
    downloadPcSetupLauncher,
    emitPrewarmHint,
    fetchPairingInfoFromBridge,
    fetchThreadDetail,
    fetchWorkspaceDetail,
    finalizeInteractivePairSuccess,
    fleetDevicesMap,
    generateSixDigitPairCode,
    getEdgeStoreKeyHex,
    getFleetStalledWtCount,
    getUnifiedFleetDevices,
    handleAccountSignInAct,
    hasAnyPairingCredentials,
    hasLiveAttachmentTransport,
    hostSnapshotsByDevice,
    initialNoSse,
    lastPrewarmHintById,
    lastThreadDetailFetchAtById,
    lastThreadDetailReceivedAtById,
    liveStreamsByThreadId,
    maybePollCloudClaudeModeBackstop,
    openConnModal,
    pendingThreadRequests,
    persistCache,
    pollAccountSignIn,
    readDirectPcReply,
    refreshCloudConfig,
    renderAccountSignInModal,
    renderApplyPcSetupButtonHtml,
    renderFleetPcSetupPillHtml,
    renderFleetPcSetupPulseBannerHtml,
    renderFleetStalledWtPillHtml,
    renderOutboxBadge,
    renderQuickPairOnboardingCardHtml,
    renderTheoMigrationBannerHtml,
    resetTransportsForFreshPairing,
    sanitizeFleetUnsavedWork,
    saveEdgeRelayConfig,
    sendWsRpc,
    startAccountSignIn,
    storeHostSnapshotEntry,
    syncData,
    updateConnectionBanner,
    updateFleetDevices,
    wsBaselineBySocket
  });
  Object.defineProperties(S, {
    acctSignIn: { get: () => acctSignIn, set: (v) => { acctSignIn = v; }, enumerable: true, configurable: true },
    activeGeneratedPairCode: { get: () => activeGeneratedPairCode, set: (v) => { activeGeneratedPairCode = v; }, enumerable: true, configurable: true },
    cachedPairingInfo: { get: () => cachedPairingInfo, set: (v) => { cachedPairingInfo = v; }, enumerable: true, configurable: true },
    connMode: { get: () => connMode, set: (v) => { connMode = v; }, enumerable: true, configurable: true },
    discoveredEdgeUrl: { get: () => discoveredEdgeUrl, set: (v) => { discoveredEdgeUrl = v; }, enumerable: true, configurable: true },
    edgeWs: { get: () => edgeWs, set: (v) => { edgeWs = v; }, enumerable: true, configurable: true },
    edgeWsAuthed: { get: () => edgeWsAuthed, set: (v) => { edgeWsAuthed = v; }, enumerable: true, configurable: true },
    edgeWsReconnectTimer: { get: () => edgeWsReconnectTimer, set: (v) => { edgeWsReconnectTimer = v; }, enumerable: true, configurable: true },
    edgeWsRttMs: { get: () => edgeWsRttMs, set: (v) => { edgeWsRttMs = v; }, enumerable: true, configurable: true },
    hasProvidersHydrated: { get: () => hasProvidersHydrated, set: (v) => { hasProvidersHydrated = v; }, enumerable: true, configurable: true },
    lastCloudQueue: { get: () => lastCloudQueue, set: (v) => { lastCloudQueue = v; }, enumerable: true, configurable: true },
    localBridgeBase: { get: () => localBridgeBase, set: (v) => { localBridgeBase = v; }, enumerable: true, configurable: true },
    localBridgeWsPath: { get: () => localBridgeWsPath, set: (v) => { localBridgeWsPath = v; }, enumerable: true, configurable: true },
    localWs: { get: () => localWs, set: (v) => { localWs = v; }, enumerable: true, configurable: true },
    localWsAuthed: { get: () => localWsAuthed, set: (v) => { localWsAuthed = v; }, enumerable: true, configurable: true },
    localWsDevice: { get: () => localWsDevice, set: (v) => { localWsDevice = v; }, enumerable: true, configurable: true },
    localWsReconnectTimer: { get: () => localWsReconnectTimer, set: (v) => { localWsReconnectTimer = v; }, enumerable: true, configurable: true },
    localWsRttMs: { get: () => localWsRttMs, set: (v) => { localWsRttMs = v; }, enumerable: true, configurable: true },
    pwaReadyCardOpen: { get: () => pwaReadyCardOpen, set: (v) => { pwaReadyCardOpen = v; }, enumerable: true, configurable: true },
    showQuickPairLinkFallback: { get: () => showQuickPairLinkFallback, set: (v) => { showQuickPairLinkFallback = v; }, enumerable: true, configurable: true },
    wsRenderSeq: { get: () => wsRenderSeq, set: (v) => { wsRenderSeq = v; }, enumerable: true, configurable: true }
  });

  refreshCloudConfig();
  window.__theoWsDeltaStats = wsDeltaStats;
  if (S.isHeadlessBrowser) {
    try {
      window.__theoDescribeVsCodeOpenReply = describeVsCodeOpenReply;
    } catch {}
  }
  // The automated browser check reads the wording for each kind of reply without a PC behind it.
  if (S.isHeadlessBrowser) {
    try {
      window.__theoDescribePcSetupReply = describePcSetupReply;
    } catch {}
  }
  if (S.isHeadlessBrowser) {
    try {
      window.__theoAccountSignIn = {
        start: startAccountSignIn,
        render: renderAccountSignInModal,
        get: () => acctSignIn,
        set: (v) => {
          acctSignIn = v;
        },
        close: closeAccountSignInModal
      };
    } catch {}
  }
  });
})();
