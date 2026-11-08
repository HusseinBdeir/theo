(() => {
  'use strict';

  const STORAGE_KEYS = {
    CACHE: 'theo_remote_cache_v3',
    PREFS: 'theo_remote_prefs_v1',
    OUTBOX: 'theo_remote_outbox_v1',
    PIN: 'theo_remote_pin_v1',
    PIN_HASH: 'theo_remote_pin_hash_v1',
    DEVID: 'theo_remote_devid_v1',
    PUSH_HINT: 'theo_remote_pushhint_v1',
    PERSONAL: 'theo_personal_ledger_v1',
    COMMAND: 'theo_command_state_v1',
    CONSUMED_NOTIF: 'theo_remote_consumed_notif_v1',
    NOTIFS: 'theo_remote_notifications_v1',
    CHECKED_NOTIFS: 'theo_remote_checked_notifs_v1',
    ANSWERED_QUESTIONS: 'theo_remote_answered_questions_v1',
    SEEN_QUOTA_ALERTS: 'theo_remote_seen_quota_alerts_v1'
  };
  const PINNED_NAV_SESSION_KEY = 'theo_pinned_nav_v1';
  const NAV_HANDOFF_CACHE = 'theo-nav-handoff-v1';
  const PENDING_NAV_CACHE_URL = './__theo_pending_nav.json';
  const LAST_PUSH_NAV_CACHE_URL = './__theo_last_push_nav.json';
  const UNREAD_NOTIFS_CACHE_URL = './__theo_unread_notifs.json';

  const DEFAULT_NOTIF = {
    enabled: false,
    approvals: true,
    completed: true,
    quota: true,
    paymentHolds: true,
    dailyScorecard: true,
    morning: true,
    morningHour: 8,
    evening: true,
    eveningHour: 21
  };

  const _VAPID = {
    pub: 'BKAC6gWORFSoi6Yf7XuS3voZnBgflXmG1GzW0K1pt4hcNoY7FNYPK-Jn-gAghKvphbSM_-ieA6U8w0E9yEgKB68',
    jwk: {
      kty: 'EC',
      crv: 'P-256',
      x: 'oALqBY5EVKiLph_te5Le-hmcGB-VeYbUbNbQrWm3iFw',
      y: 'NoY7FNYPK-Jn-gAghKvphbSM_-ieA6U8w0E9yEgKB68',
      d: 'MS5ta1KAESpycusDW8d1NMaj3fxc_oNO_F0V23oh5aA',
      ext: true
    },
    sub: 'mailto:hussein@bhfirms.com'
  };
  let _vapidSignKey = null;

  const PROVIDER_ICONS = {
    antigravity: `<svg viewBox="6 8 100 100" aria-hidden="true"><path d="M89.7 93.7C94.4 97.2 101.4 94.9 94.9 88.4C75.7 69.8 79.8 18.4 55.9 18.4C31.9 18.4 36 69.8 16.8 88.4C9.8 95.4 17.4 97.2 22 93.7C40.1 81.4 38.9 59.9 55.9 59.9C72.8 59.9 71.6 81.4 89.7 93.7Z" fill="#3186FF"/></svg>`,
    claude: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" fill="#D97757"/></svg>`
  };

  const $ = (id) => document.getElementById(id);
  const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const fmtCompact = (n) => {
    const num = Number(n || 0);
    if (!Number.isFinite(num) || num <= 0) return '0';
    if (num >= 1000000) {
      const m = num / 1000000;
      return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
    }
    if (num >= 100000) return `${Math.round(num / 1000)}k`;
    if (num >= 1000) return `${(num / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    return String(Math.round(num));
  };
  const fmtInt = (n) => new Intl.NumberFormat('en-US').format(Math.round(Number(n || 0)));

  function normalizeDisplayModel(rawModel, provider = 'antigravity') {
    const s = String(rawModel || '').trim();
    const low = s.toLowerCase();
    if (!s || low === 'gemini' || low === 'antigravity' || low.includes('m43') || low.includes('argon')) {
      return provider === 'claude' ? 'Fable 5.1' : 'Gemini 4 Argon (High)';
    }
    if (low === 'claude' || low.includes('opus-4-7') || low.includes('opus 4.7') || low.includes('fable')) {
      return 'Fable 5.1';
    }
    if (low.includes('sonnet-4-6') || low.includes('sonnet 4.6')) return 'Claude Sonnet 4.6';
    if (low.includes('opus-4-6') || low.includes('opus 4.6')) return 'Claude Opus 4.6';
    if (low.includes('haiku')) return 'Claude Haiku 4.5';
    return s;
  }

  function inferDefaultContextLimit(provider, modelLabel = '') {
    if (provider === 'claude') {
      const low = String(modelLabel || '').toLowerCase();
      if (low.includes('4.5') || low.includes('4-5') || low.includes('4.6') || low.includes('4-6') || low.includes('haiku')) {
        return 200000;
      }
      return 1000000;
    }
    return 256000;
  }

  function timeAgo(tsMs) {
    if (!tsMs) return '—';
    const diffMin = Math.floor(Math.max(0, Date.now() - Number(tsMs)) / 60000);
    if (diffMin < 1) return 'now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const hrs = Math.floor(diffMin / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  function timeUntil(tsMs) {
    if (!tsMs) return '';
    const diffMin = Math.floor((Number(tsMs) - Date.now()) / 60000);
    if (diffMin <= 0) return 'resets soon';
    if (diffMin < 60) return `in ${diffMin}m`;
    const hrs = Math.floor(diffMin / 60);
    if (hrs < 24) return `in ${hrs}h ${diffMin % 60}m`;
    return `in ${Math.floor(hrs / 24)}d`;
  }

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function saveJson(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {}
  }

  const LOCAL_BOOT_SESSION_KEY = 'theo_local_boot_v1';
  let localBootInfo = null;
  try {
    if (window.__THEO_LOCAL_BOOT__ && typeof window.__THEO_LOCAL_BOOT__ === 'object') {
      localBootInfo = window.__THEO_LOCAL_BOOT__;
      sessionStorage.setItem(LOCAL_BOOT_SESSION_KEY, JSON.stringify(localBootInfo));
      delete window.__THEO_LOCAL_BOOT__;
    } else {
      const savedBoot = sessionStorage.getItem(LOCAL_BOOT_SESSION_KEY);
      if (savedBoot) localBootInfo = JSON.parse(savedBoot);
    }
  } catch {}

  const isHeadlessBrowser = Boolean(
    (typeof navigator !== 'undefined' && navigator.webdriver) ||
      (typeof window !== 'undefined' && window.__THEO_HEADLESS_TEST)
  );

  const DEFAULT_PREFS = {
    theme: 'dark',
    themeUserSet: false,
    sidebarCollapsed: false,
    sidebarFilter: 'all',
    openEditorTabs: [],
    sound: true,
    activeTab: 'pulse',
    sessProvider: 'all',
    sessStatus: 'all',
    selectedDeviceFilter: 'all',
    composerTargetDevice: 'auto',
    composerDirectStream: true,
    edgeRelayUrl: '',
    cloudUrl: '',
    cloudKey: '',
    edgeAccessKey: '',
    port: 4318,
    freqUsage: { devices: {}, repos: {}, threads: {}, commands: {} },
    telemetryProv: 'all',
    selectedThreadId: '',
    selectedRepoId: 'resort-operations',
    composerMode: 'reply',
    composerRepoPrefix: '',
    customBridgeUrl: '',
    notif: { ...DEFAULT_NOTIF }
  };
  const rawStoredPrefs = loadJson(STORAGE_KEYS.PREFS, null);
  const prefs = Object.assign(
    {},
    DEFAULT_PREFS,
    rawStoredPrefs && typeof rawStoredPrefs === 'object' && !Array.isArray(rawStoredPrefs)
      ? rawStoredPrefs
      : {}
  );
  if (!prefs.themeUserSet) {
    prefs.theme = 'dark';
  }
  prefs.sidebarCollapsed = Boolean(prefs.sidebarCollapsed);
  if (!['all', 'working', 'needs_input', 'unread', 'open'].includes(prefs.sidebarFilter)) {
    prefs.sidebarFilter = 'all';
  }
  prefs.openEditorTabs = Array.isArray(prefs.openEditorTabs)
    ? Array.from(
        new Set(
          prefs.openEditorTabs
            .map((x) => (typeof x === 'string' || typeof x === 'number' ? String(x).trim() : ''))
            .filter((x) => x && x !== '__new__')
        )
      ).slice(0, 14)
    : [];
  if (!prefs.sessProvider) prefs.sessProvider = 'all';
  if (!prefs.sessStatus) prefs.sessStatus = 'all';
  if (!prefs.telemetryProv) prefs.telemetryProv = 'all';
  if (!prefs.selectedDeviceFilter) prefs.selectedDeviceFilter = 'all';
  if (!prefs.composerTargetDevice) prefs.composerTargetDevice = 'auto';
  prefs.composerDirectStream = prefs.composerDirectStream !== false;
  prefs.freqUsage = Object.assign(
    { devices: {}, repos: {}, threads: {}, commands: {} },
    prefs.freqUsage && typeof prefs.freqUsage === 'object' ? prefs.freqUsage : {}
  );
  prefs.freqUsage.devices = Object.assign({}, prefs.freqUsage.devices || {});
  prefs.freqUsage.repos = Object.assign({}, prefs.freqUsage.repos || {});
  prefs.freqUsage.threads = Object.assign({}, prefs.freqUsage.threads || {});
  prefs.freqUsage.commands = Object.assign({}, prefs.freqUsage.commands || {});
  prefs.notif = Object.assign({ ...DEFAULT_NOTIF }, prefs.notif || {});

  function decodeMaybeB64Field(val) {
    const s = String(val || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s) || /^[0-9a-f]{32,}$/i.test(s)) return s;
    try {
      const dec = atob(s).trim();
      if (dec && /^[\x20-\x7e]+$/.test(dec)) return dec;
    } catch {}
    return s;
  }

  function isSafeCloudEndpointUrl(rawUrl) {
    const u = String(rawUrl || '').trim();
    if (!u) return true;
    return /^https:\/\/[^\s]+$/i.test(u) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(u);
  }

  function isSafeEdgeEndpointUrl(rawUrl) {
    const u = String(rawUrl || '').trim();
    if (!u) return true;
    return (
      /^(wss|https):\/\/[^\s]+$/i.test(u) ||
      /^(ws|http):\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(u)
    );
  }

  function decodePairTokenString(rawInput) {
    const text = String(rawInput || '').trim();
    if (!text) return null;
    const hashMatch = text.match(/#pair=([A-Za-z0-9_=-]{16,8192})/i);
    const envMatch =
      !hashMatch && text.match(/THEO_PAIR_TOKEN\s*=\s*['"]?([A-Za-z0-9_=-]{16,8192})['"]?/i);
    const token = hashMatch
      ? hashMatch[1]
      : envMatch
        ? envMatch[1]
        : text
            .replace(/^#?pair=/i, '')
            .split(/[\s&'"]+/)[0]
            .trim();
    if (!token) return null;
    try {
      const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
      const pad = b64.length % 4 === 0 ? '' : '===='.slice(b64.length % 4);
      const obj = JSON.parse(atob(b64 + pad));
      if (!obj || typeof obj !== 'object') return null;
      const cloudUrl = decodeMaybeB64Field(obj.u || obj.cloudUrl || '');
      const cloudKey = decodeMaybeB64Field(obj.k || obj.cloudKey || '');
      const edgeAccessKey = String(obj.e || obj.edgeAccessKey || '').trim();
      const edgeRelayUrl = String(obj.r || obj.w || obj.edgeRelayUrl || '').trim();
      if (!cloudKey && !edgeAccessKey) return null;
      if (cloudUrl && !cloudKey) return null;
      if (!isSafeCloudEndpointUrl(cloudUrl) || !isSafeEdgeEndpointUrl(edgeRelayUrl)) return null;
      return {
        cloudUrl,
        cloudKey,
        edgeAccessKey,
        edgeRelayUrl,
        port: Number(obj.p || obj.port || 4318) || 4318
      };
    } catch {
      if (/^[a-fA-F0-9]{32,128}$/.test(token)) {
        return { cloudUrl: '', cloudKey: '', edgeAccessKey: token, edgeRelayUrl: '', port: 4318 };
      }
      return null;
    }
  }

  function encodePairTokenString(payload) {
    try {
      const json = JSON.stringify({
        v: 1,
        u: payload.cloudUrl || '',
        k: payload.cloudKey || '',
        e: payload.edgeAccessKey || '',
        r: payload.edgeRelayUrl || '',
        p: Number(payload.port || 4318) || 4318
      });
      return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch {
      return '';
    }
  }

  function applyPairPayloadToPrefs(parsed) {
    if (!parsed || (!parsed.cloudKey && !parsed.edgeAccessKey)) return false;
    if (parsed.cloudKey) {
      prefs.cloudKey = parsed.cloudKey;
      if (parsed.cloudUrl && isSafeCloudEndpointUrl(parsed.cloudUrl)) {
        prefs.cloudUrl = parsed.cloudUrl;
      }
    }
    if (parsed.edgeAccessKey) {
      prefs.edgeAccessKey = parsed.edgeAccessKey;
    } else if (parsed.cloudKey) {
      prefs.edgeAccessKey = '';
    }
    if (parsed.edgeRelayUrl && isSafeEdgeEndpointUrl(parsed.edgeRelayUrl)) {
      prefs.edgeRelayUrl = parsed.edgeRelayUrl;
    }
    if (parsed.port) prefs.port = parsed.port;
    saveJson(STORAGE_KEYS.PREFS, prefs);
    return true;
  }

  let pairClaimInFlight = false;
  let pairCodeGenInFlight = false;
  let activeGeneratedPairCode = null;
  let showQuickPairLinkFallback = false;
  let pinLockInitialized = false;
  let pendingPinPairPayload = null;

  function isSessionCurrentlyPinLocked() {
    if (!pinLockInitialized) {
      return Boolean(
        document.documentElement.classList.contains('pin-locked-boot') ||
          localStorage.getItem(STORAGE_KEYS.PIN_HASH) ||
          localStorage.getItem(STORAGE_KEYS.PIN) ||
          prefs.pin ||
          prefs.pinHash
      );
    }
    const overlay = $('pin-overlay');
    return Boolean(
      document.documentElement.classList.contains('pin-locked-boot') ||
        (overlay && !overlay.hidden)
    );
  }

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

  function ingestLocationPairHash(triggerLiveConnect = false) {
    try {
      if (!location.hash || !/pair=/i.test(location.hash)) return false;
      const parsedBootPair = decodePairTokenString(location.hash);
      const cleanHashUrl = location.pathname + (location.search || '');
      history.replaceState(history.state || null, '', cleanHashUrl);
      if (!parsedBootPair) return false;
      if (isSessionCurrentlyPinLocked()) {
        pendingPinPairPayload = parsedBootPair;
        return false;
      }
      applyPairPayloadToPrefs(parsedBootPair);
      if (triggerLiveConnect) {
        refreshCloudConfig();
        resetTransportsForFreshPairing();
        const targetEdge = prefs.edgeRelayUrl || discoveredEdgeUrl || DEFAULT_EDGE_RELAY_URL;
        if (!isHeadlessBrowser && targetEdge) {
          connectEdgeWs(targetEdge).catch(() => {});
        }
        if (!isHeadlessBrowser) {
          syncData({ force: true, toast: true }).catch(() => {});
        }
        updateConnectionBanner();
        renderAll();
        showToast('✓ Device paired & connected to THEO Fleet');
      }
      return true;
    } catch {
      return false;
    }
  }

  ingestLocationPairHash(false);

  const cloudCfg = { url: '', key: '', edgeAccessKey: '', port: 4318 };
  function refreshCloudConfig() {
    const cfg = window.THEO_CLOUD_CFG || {};
    let fallbackUrl = '';
    let fallbackKey = '';
    try {
      fallbackUrl = cfg.u ? atob(cfg.u) : '';
      fallbackKey = cfg.k ? atob(cfg.k) : '';
    } catch {}
    cloudCfg.url = String(prefs.cloudUrl || fallbackUrl || '').trim();
    cloudCfg.key = String(prefs.cloudKey || fallbackKey || '').trim();
    cloudCfg.edgeAccessKey = String(prefs.edgeAccessKey || '').trim();
    cloudCfg.port = Number(prefs.port || cfg.port || 4318) || 4318;
    return cloudCfg;
  }
  refreshCloudConfig();

  function hasAnyPairingCredentials() {
    refreshCloudConfig();
    return Boolean(
      localBridgeBase ||
        (localBootInfo && localBootInfo.token) ||
        cloudCfg.edgeAccessKey ||
        (cloudCfg.url && cloudCfg.key) ||
        cachedPairingInfo?.pairUrl ||
        cachedPairingInfo?.mobilePairUrl
    );
  }

  function isFocusInsideContainerInputs(containerEl) {
    const active = document.activeElement;
    if (!containerEl || !active || !containerEl.contains(active)) return false;
    return /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
  }

  // Frequency-First Search & Comboboxes (THEO.md Rule 11: strictly usage frequency descending, never alphabetical override)
  function recordFreqUsage(bucket, rawKey) {
    const key = String(rawKey || '').trim();
    if (!key || key === 'auto' || key === 'all') return;
    if (!prefs.freqUsage || typeof prefs.freqUsage !== 'object') {
      prefs.freqUsage = { devices: {}, repos: {} };
    }
    if (!prefs.freqUsage[bucket] || typeof prefs.freqUsage[bucket] !== 'object') {
      prefs.freqUsage[bucket] = {};
    }
    prefs.freqUsage[bucket][key] = Number(prefs.freqUsage[bucket][key] || 0) + 1;
    saveJson(STORAGE_KEYS.PREFS, prefs);
  }

  function rankByFreq(items, bucket, idFn, baselineWeightFn = null) {
    const list = Array.isArray(items) ? items : [];
    const map = (prefs.freqUsage && prefs.freqUsage[bucket]) || {};
    return list
      .map((item, idx) => {
        const key = String(idFn(item) || '').trim();
        const userCount = Number(map[key] || 0);
        const baseWeight = typeof baselineWeightFn === 'function' ? Number(baselineWeightFn(item) || 0) : 0;
        return { item, idx, score: userCount * 10000 + baseWeight };
      })
      .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.idx - b.idx))
      .map((x) => x.item);
  }

  const cachedStore = loadJson(STORAGE_KEYS.CACHE, {
    state: null,
    threads: {},
    workspacesDetail: {},
    updatedAt: 0
  });

  let appState = cachedStore.state || null;
  let threadsCache = cachedStore.threads || {};
  let workspacesDetailCache = cachedStore.workspacesDetail || {};
  let outbox = loadJson(STORAGE_KEYS.OUTBOX, []);
  let connMode = 'probing'; // 'local' | 'edge' | 'cloud' | 'offline'
  let localBridgeBase = '';
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
  let discoveredEdgeUrl = localBootInfo?.edgeRelayUrl || prefs.edgeRelayUrl || DEFAULT_EDGE_RELAY_URL;
  let lastCloudBackstopAt = 0;
  let lastCloudQueue = null;
  let edgeReconnectAttempts = 0;
  let localWsReconnectAttempts = 0;
  let cachedBridgeTokenHex = '';
  let cachedBridgeTokenSrc = '';
  let cachedPairingInfo = null;
  let wsRenderSeq = 0;
  let hasProvidersHydrated = Boolean(appState?.providers);
  let hasExplicitBootUrlNav = false;
  let suppressHistoryPush = false;
  const hostSnapshotsByDevice = new Map();
  const wsPendingRpcs = new Map();
  const fleetDevicesMap = new Map();
  const liveStreamsByThreadId = new Map();
  let streamDomRafId = 0;
  let streamDomTargetTid = '';
  let lastRenderedThreadId = '';
  let lastRenderedMsgCount = 0;
  let pushSub = null;
  let pushBusy = false;
  let pushSyncTimer = null;
  let statePrimed = false;
  const seenApprovalIds = new Set();
  const prevRowStatuses = new Map();
  const prevRowSteps = new Map();
  const prevRowAts = new Map();
  const pendingThreadRequests = new Map();
  const alertedReminderIds = new Set();
  const seenQuotaAlertIds = new Set(
    Array.isArray(loadJson(STORAGE_KEYS.SEEN_QUOTA_ALERTS, []))
      ? loadJson(STORAGE_KEYS.SEEN_QUOTA_ALERTS, [])
      : []
  );

  function saveSeenQuotaAlerts() {
    const nowMin = Math.floor(Date.now() / 60000);
    const keep = [];
    for (const key of seenQuotaAlertIds) {
      if (typeof key !== 'string') continue;
      if (key.startsWith('quota90:')) {
        const lastColon = key.lastIndexOf(':');
        const stamp = lastColon > 0 ? Number(key.slice(lastColon + 1)) : 0;
        if (Number.isFinite(stamp) && stamp > 0 && stamp < nowMin) {
          seenQuotaAlertIds.delete(key);
          continue;
        }
      }
      keep.push(key);
    }
    saveJson(STORAGE_KEYS.SEEN_QUOTA_ALERTS, keep.slice(-120));
  }

  function collectHighUsageQuotaAlerts(stateObj, nowMs = Date.now()) {
    const highAlerts = [];
    const allActiveBuckets = [];
    if (!stateObj || typeof stateObj !== 'object') {
      return { highAlerts, allActiveBuckets };
    }

    for (const provKey of ['antigravity', 'claude']) {
      const provLabel = provKey === 'claude' ? 'Claude Code' : 'Antigravity';
      let provInfo = stateObj.providers?.[provKey] || null;
      if (!provInfo && provKey === 'antigravity' && stateObj.usage) {
        provInfo = {
          id: 'antigravity',
          label: 'Antigravity',
          account: stateObj.account || {},
          usage: stateObj.usage
        };
      }
      if (
        provKey === 'claude' &&
        (!provInfo?.usage?.limits || !provInfo.usage.limits.length) &&
        Number(stateObj.claudeUsage?.fiveHourPct || 0) > 0
      ) {
        provInfo = {
          ...(provInfo || {}),
          id: 'claude',
          label: 'Claude Code',
          account: provInfo?.account || { name: 'Claude Account', email: '' },
          usage: {
            at: nowMs,
            limits: [
              {
                label: 'Session (5hr)',
                pct: Number(stateObj.claudeUsage.fiveHourPct || 0),
                reset: Number(stateObj.claudeUsage.fiveHourResetsAt || 0),
                resetText: ''
              }
            ]
          }
        };
      }
      if (!provInfo) continue;

      const rawAccounts =
        Array.isArray(provInfo.accounts) && provInfo.accounts.length > 0
          ? provInfo.accounts
          : null;
      const activeAccounts = rawAccounts
        ? rawAccounts.filter((a) => a && a.active)
        : [];
      const targetAccounts =
        activeAccounts.length > 0
          ? activeAccounts
          : rawAccounts
            ? [rawAccounts[0]]
            : [
                {
                  id: provInfo.account?.email
                    ? `${provKey}:${String(provInfo.account.email).trim().toLowerCase()}`
                    : `${provKey}:default`,
                  provider: provKey,
                  label: provLabel,
                  nickname: provInfo.account?.nickname || '',
                  active: true,
                  account: provInfo.account || {},
                  usage: provInfo.usage
                }
              ];

      for (const acct of targetAccounts) {
        if (!acct) continue;
        const acctObj = acct.account || provInfo.account || {};
        const acctEmail = String(acctObj.email || '').trim();
        const acctNick = String(acct.nickname || acctObj.nickname || '').trim();
        const acctId = String(
          acct.id || (acctEmail ? `${provKey}:${acctEmail.toLowerCase()}` : `${provKey}:default`)
        )
          .trim()
          .toLowerCase();
        const acctSlug =
          acctId.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || provKey;
        const acctDisplay = acctNick
          ? acctEmail
            ? `${acctNick} (${acctEmail})`
            : acctNick
          : acctEmail || '';

        const rawLimits =
          Array.isArray(acct.usage?.limits) && acct.usage.limits.length > 0
            ? acct.usage.limits
            : Array.isArray(provInfo.usage?.limits)
              ? provInfo.usage.limits
              : [];

        for (const bar of rawLimits) {
          if (!bar || typeof bar !== 'object') continue;
          const resetMs = Number(bar.reset || 0);
          const isExpired = Boolean(bar.expired || (resetMs > 0 && resetMs <= nowMs));
          const pct = isExpired
            ? 0
            : Math.max(0, Math.min(100, Math.round(Number(bar.pct || 0))));
          const barLabel = String(bar.label || 'Usage Quota').trim() || 'Usage Quota';
          const barSlug =
            barLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'quota';
          const bucketKey = `${provKey}:${acctSlug}:${barSlug}`;
          const windowStamp =
            resetMs > 0
              ? Math.round(resetMs / 60000)
              : Math.floor(nowMs / (4 * 3600 * 1000)) * 240 + 240;
          const alertId = `quota90:${bucketKey}:${windowStamp}`;
          const tag = `theo-quota-${provKey}-${acctSlug}-${barSlug}`;
          const resetText = String(bar.resetText || '').trim();

          const bucketInfo = {
            id: alertId,
            tag,
            bucketKey,
            windowStamp,
            provider: provKey,
            providerLabel: provLabel,
            accountId: acctId,
            accountDisplay: acctDisplay,
            barLabel,
            pct,
            resetMs,
            resetText,
            expired: isExpired
          };
          allActiveBuckets.push(bucketInfo);

          if (!isExpired && pct >= 90) {
            const title = `⚠️ ${provLabel} Usage at ${pct}% — ${barLabel}`;
            const resetClause = resetText ? ` (${resetText})` : '';
            const acctPrefix = acctDisplay ? `${acctDisplay} · ` : '';
            const body = `${acctPrefix}${barLabel} reached ${pct}% usage${resetClause}. Tap to inspect quota & switch account if needed.`;
            highAlerts.push({
              ...bucketInfo,
              title,
              body,
              tab: 'pulse',
              url: './?tab=pulse'
            });
          }
        }
      }
    }

    return { highAlerts, allActiveBuckets };
  }

  function hasQuotaAlertForWindow(alertSet, bucketKey, windowStamp, nowMs = Date.now()) {
    if (!alertSet || typeof alertSet[Symbol.iterator] !== 'function') return false;
    const prefix = `quota90:${bucketKey}:`;
    const targetStamp = Number(windowStamp || 0);
    const nowMin = Math.floor(nowMs / 60000);
    for (const key of alertSet) {
      if (typeof key !== 'string' || !key.startsWith(prefix)) continue;
      const prevStamp = Number(key.slice(prefix.length));
      if (!Number.isFinite(prevStamp) || !Number.isFinite(targetStamp)) {
        if (key === `${prefix}${windowStamp}`) return true;
        continue;
      }
      if (prevStamp > 0 && prevStamp < nowMin) {
        continue;
      }
      if (Math.abs(targetStamp - prevStamp) <= 30) {
        return true;
      }
    }
    return false;
  }

  let pinnedNavThreadId = '';
  let pinnedNavProvider = '';
  let pinnedNavTitle = '';
  let pinnedNavReminderId = '';
  let pinnedNavUntil = 0;
  let lastAppliedNavSig = '';
  let lastAppliedNavAt = 0;
  let wasAppHiddenAt = document.hidden ? Date.now() : 0;
  let recentResumeUntil = Date.now() + 15000;

  function loadConsumedNotifSet() {
    const arr = loadJson(STORAGE_KEYS.CONSUMED_NOTIF, []);
    return new Set(Array.isArray(arr) ? arr : []);
  }

  function markNotifConsumed(...keys) {
    const set = loadConsumedNotifSet();
    for (const k of keys) {
      if (k) set.add(String(k));
    }
    saveJson(STORAGE_KEYS.CONSUMED_NOTIF, Array.from(set).slice(-80));
  }

  function isNotifConsumed(...keys) {
    const set = loadConsumedNotifSet();
    return keys.some((k) => k && set.has(String(k)));
  }

  function setPinnedNav(threadIdOrObj, provider = '', title = '', durationMs = 60000) {
    let tid = threadIdOrObj;
    let prov = provider;
    let ttl = title;
    let dur = durationMs;
    if (threadIdOrObj && typeof threadIdOrObj === 'object') {
      tid = threadIdOrObj.threadId || threadIdOrObj.sessionId || '';
      prov = threadIdOrObj.provider || '';
      ttl = threadIdOrObj.title || threadIdOrObj.sessionTitle || '';
      if (threadIdOrObj.durationMs) dur = Number(threadIdOrObj.durationMs);
    }
    if (!tid) return;
    pinnedNavThreadId = String(tid);
    if (prov) pinnedNavProvider = String(prov);
    if (ttl) pinnedNavTitle = String(ttl);
    pinnedNavUntil = Date.now() + dur;
    try {
      sessionStorage.setItem(
        PINNED_NAV_SESSION_KEY,
        JSON.stringify({
          threadId: pinnedNavThreadId,
          provider: pinnedNavProvider,
          title: pinnedNavTitle,
          tab: 'chat',
          until: pinnedNavUntil
        })
      );
    } catch {}
  }

  function restorePinnedNavFromSession() {
    try {
      const raw = sessionStorage.getItem(PINNED_NAV_SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.threadId && Number(parsed.until || 0) > Date.now()) {
        pinnedNavThreadId = String(parsed.threadId);
        pinnedNavProvider = String(parsed.provider || '');
        pinnedNavTitle = String(parsed.title || '');
        pinnedNavUntil = Number(parsed.until);
        return parsed;
      }
      sessionStorage.removeItem(PINNED_NAV_SESSION_KEY);
    } catch {}
    return null;
  }

  function clearPinnedNav() {
    pinnedNavThreadId = '';
    pinnedNavProvider = '';
    pinnedNavTitle = '';
    pinnedNavUntil = 0;
    try {
      sessionStorage.removeItem(PINNED_NAV_SESSION_KEY);
    } catch {}
  }

  // Personal Ledger & Reminders are owned by Planner PWA (https://husseinbdeir.github.io/planner/)
  function loadPersonalLedgerFromLocal() {}
  function mergePersonalLedger() {}
  async function pushPersonalLedgerToCloud() {}

  // ---------- Full Web Push Notifications (RFC 8291 aes128gcm + RFC 8292 VAPID ES256) ----------
  function b64ToBytes(b64) {
    const s = String(b64 || '')
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const pad = s.length % 4 === 0 ? '' : '===='.slice(s.length % 4);
    const bin = atob(s + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function bytesToB64(bytes) {
    const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let s = '';
    for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s);
  }

  function bytesToB64u(bytes) {
    return bytesToB64(bytes)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  function catBytes(...arrays) {
    let n = 0;
    for (const a of arrays) n += a.length;
    const out = new Uint8Array(n);
    let o = 0;
    for (const a of arrays) {
      out.set(a, o);
      o += a.length;
    }
    return out;
  }

  async function signVapid(endpoint, expSec) {
    const subtle = window.crypto && window.crypto.subtle;
    if (!subtle) throw new Error('WebCrypto unavailable');
    if (!_vapidSignKey) {
      _vapidSignKey = await subtle.importKey(
        'jwk',
        _VAPID.jwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign']
      );
    }
    const aud = new URL(endpoint).origin;
    const enc = new TextEncoder();
    const hdr = bytesToB64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
    const claims = bytesToB64u(
      enc.encode(
        JSON.stringify({
          aud,
          exp: Math.floor(expSec || Date.now() / 1000 + 43200),
          sub: _VAPID.sub
        })
      )
    );
    const input = enc.encode(`${hdr}.${claims}`);
    const sig = new Uint8Array(
      await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, _vapidSignKey, input)
    );
    return `vapid t=${hdr}.${claims}.${bytesToB64u(sig)}, k=${_VAPID.pub}`;
  }

  async function encryptWebPush(subJson, payloadObj) {
    const subtle = window.crypto && window.crypto.subtle;
    if (!subtle) throw new Error('WebCrypto unavailable');
    const keys = (subJson && subJson.keys) || {};
    const uPub = b64ToBytes(keys.p256dh);
    const authBytes = b64ToBytes(keys.auth);
    if (uPub.length !== 65 || authBytes.length !== 16) {
      throw new Error('Invalid subscription keys');
    }
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const sKP = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const sPub = new Uint8Array(await subtle.exportKey('raw', sKP.publicKey));
    const uPubKey = await subtle.importKey('raw', uPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const shared = await subtle.deriveBits({ name: 'ECDH', public: uPubKey }, sKP.privateKey, 256);
    const enc = new TextEncoder();
    const zKey = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits']);
    const keyInfo = catBytes(enc.encode('WebPush: info\x00'), uPub, sPub);
    const ikm = await subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: authBytes, info: keyInfo },
      zKey,
      256
    );
    const ikmKey = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    const cekBits = await subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('Content-Encoding: aes128gcm\x00') },
      ikmKey,
      128
    );
    const nonce = new Uint8Array(
      await subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('Content-Encoding: nonce\x00') },
        ikmKey,
        96
      )
    );
    const cek = await subtle.importKey('raw', cekBits, 'AES-GCM', false, ['encrypt']);
    const plain = catBytes(
      enc.encode(typeof payloadObj === 'string' ? payloadObj : JSON.stringify(payloadObj)),
      new Uint8Array([2])
    );
    const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cek, plain));
    const hdr = new Uint8Array([0, 0, 16, 0, 65]);
    return bytesToB64(catBytes(salt, hdr, sPub, ct));
  }

  function getDeviceId() {
    let id = loadJson(STORAGE_KEYS.DEVID, '');
    if (!id) {
      id = `theo_dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      saveJson(STORAGE_KEYS.DEVID, id);
    }
    return id;
  }

  function isStandalone() {
    try {
      return Boolean(
        (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
          window.navigator.standalone === true
      );
    } catch {
      return false;
    }
  }

  function pushSupported() {
    return (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window
    );
  }

  function notifPerm() {
    try {
      return (typeof Notification !== 'undefined' && Notification.permission) || 'default';
    } catch {
      return 'default';
    }
  }

  async function callCloudPush(body) {
    if (!cloudCfg.url || !cloudCfg.key) return null;
    const res = await fetch(cloudCfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(Object.assign({ key: cloudCfg.key }, body))
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  // ---------- Unchecked Notifications Ledger & Home Screen App Badge ----------
  function loadNotifLog() {
    const raw = loadJson(STORAGE_KEYS.NOTIFS, []);
    return Array.isArray(raw) ? raw : [];
  }

  function saveNotifLog(items) {
    const safe = Array.isArray(items) ? items.slice(0, 60) : [];
    saveJson(STORAGE_KEYS.NOTIFS, safe);
    return safe;
  }

  function loadCheckedNotifKeys() {
    const raw = loadJson(STORAGE_KEYS.CHECKED_NOTIFS, []);
    return new Set(Array.isArray(raw) ? raw.map(String) : []);
  }

  function saveCheckedNotifKeys(set) {
    const arr = Array.from(set || []).slice(-200);
    saveJson(STORAGE_KEYS.CHECKED_NOTIFS, arr);
  }

  function rememberCheckedNotifKeys(...keys) {
    const set = loadCheckedNotifKeys();
    for (const k of keys) {
      if (k) set.add(String(k));
    }
    saveCheckedNotifKeys(set);
  }

  function isNotifKeyChecked(...keys) {
    const set = loadCheckedNotifKeys();
    return keys.some((k) => k && set.has(String(k)));
  }

  function syncUnreadCacheToSw(items, closeOsNotifications = false, checkedTags = [], badgeCount = 0) {
    const safe = Array.isArray(items) ? items.slice(0, 60) : [];
    try {
      if ('caches' in window) {
        caches
          .open(NAV_HANDOFF_CACHE)
          .then((cache) =>
            cache.put(
              UNREAD_NOTIFS_CACHE_URL,
              new Response(JSON.stringify({ updatedAt: Date.now(), items: safe }), {
                headers: {
                  'Content-Type': 'application/json',
                  'Cache-Control': 'no-store'
                }
              })
            )
          )
          .catch(() => {});
      }
    } catch {}
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'sync-unread-notifs',
          items: safe,
          badgeCount,
          closeOsNotifications: Boolean(closeOsNotifications),
          checkedTags: Array.isArray(checkedTags) ? checkedTags : []
        });
      }
    } catch {}
  }

  function computeTheoUnreadBadgeCount(items = null) {
    const list = Array.isArray(items) ? items : loadNotifLog();
    const uncheckedNotifs = list.filter((x) => x && !x.checked);
    const seenSessionIds = new Set(
      uncheckedNotifs.map((x) => x.threadId).filter(Boolean)
    );
    const seenApprovalTags = new Set(
      uncheckedNotifs.map((x) => x.tag || x.id).filter(Boolean)
    );
    // Deduplicate unchecked log items so multiple notifications for the same session only count as 1 badge unit
    const uniqueUncheckedKeys = new Set();
    for (const x of uncheckedNotifs) {
      const k =
        x.threadId && !String(x.tag || '').startsWith('theo-app-')
          ? `session:${x.threadId}`
          : String(x.tag || x.id || '');
      if (k) uniqueUncheckedKeys.add(k);
    }
    const checkedSet = loadCheckedNotifKeys();
    let liveExtra = 0;
    for (const a of appState?.approvals || []) {
      if (!a || !a.id) continue;
      const appTag = `theo-app-${a.id}`;
      if (!seenApprovalTags.has(appTag) && !checkedSet.has(appTag)) {
        liveExtra++;
      }
    }
    for (const r of appState?.rows || []) {
      if (!r || !r.id || r.archived || !r.unread) continue;
      const unreadKey = `theo-unread-${r.id}`;
      const legacyUnreadKey = `theo-unread-${r.id}-${r.stepCount || r.at || 0}`;
      if (
        !seenSessionIds.has(r.id) &&
        !checkedSet.has(unreadKey) &&
        !checkedSet.has(legacyUnreadKey) &&
        !checkedSet.has(`session:${r.id}`)
      ) {
        liveExtra++;
      }
    }
    if (prefs.notif?.quota !== false) {
      const { highAlerts } = collectHighUsageQuotaAlerts(appState);
      for (const alert of highAlerts) {
        if (
          !seenApprovalTags.has(alert.tag) &&
          !seenApprovalTags.has(alert.id) &&
          !checkedSet.has(alert.tag) &&
          !checkedSet.has(alert.id)
        ) {
          liveExtra++;
        }
      }
    }
    return uniqueUncheckedKeys.size + liveExtra;
  }

  function updateAppBadgeCount(closeOsNotifications = false, checkedTags = []) {
    const items = loadNotifLog();
    const count = computeTheoUnreadBadgeCount(items);

    const mobBadge = $('mobile-push-badge');
    if (mobBadge) {
      if (count > 0) {
        mobBadge.textContent = count > 99 ? '99+' : String(count);
        mobBadge.hidden = false;
      } else {
        mobBadge.textContent = '0';
        mobBadge.hidden = true;
      }
    }

    const railBadge = $('rail-push-badge');
    if (railBadge) {
      if (count > 0) {
        railBadge.textContent = count > 99 ? '99+' : String(count);
        railBadge.hidden = false;
      } else {
        railBadge.textContent = '0';
        railBadge.hidden = true;
      }
    }

    const mobBtn = $('mobile-push-btn');
    if (mobBtn) {
      mobBtn.classList.toggle('has-unread-badge', count > 0);
    }
    const railBtn = $('rail-push-btn');
    if (railBtn) {
      railBtn.classList.toggle('has-unread-badge', count > 0);
    }

    try {
      const baseTitle = 'THEO — AI Session Workbench';
      document.title = count > 0 ? `(${count}) ${baseTitle}` : baseTitle;
    } catch {}

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.setAppBadge === 'function') {
        if (count > 0) {
          Promise.resolve(navigator.setAppBadge(count)).catch(() => {});
        } else if (typeof navigator.clearAppBadge === 'function') {
          Promise.resolve(navigator.clearAppBadge()).catch(() => {});
        } else {
          Promise.resolve(navigator.setAppBadge(0)).catch(() => {});
        }
      }
    } catch {}

    syncUnreadCacheToSw(items, closeOsNotifications, checkedTags, count);
    const notifModal = $('notif-modal');
    if (notifModal && !notifModal.hidden) {
      renderNotifModal();
    }
    return count;
  }

  function recordTheoNotification(rawItem, opts = {}) {
    if (!rawItem || typeof rawItem !== 'object') return null;
    const tag = String(rawItem.tag || rawItem.id || `theo-${Date.now()}`);
    const id = String(rawItem.id || tag);
    if (!opts.force && isNotifKeyChecked(id, tag)) {
      return null;
    }
    const existing = loadNotifLog();
    const threadId = String(rawItem.threadId || rawItem.sessionId || '');
    const isApproval = tag.startsWith('theo-app-');
    const prev = existing.find(
      (x) =>
        x &&
        (x.id === id ||
          x.tag === tag ||
          (threadId && !isApproval && x.threadId === threadId && !String(x.tag || '').startsWith('theo-app-')))
    );
    const entry = {
      id,
      tag,
      title: String(rawItem.title || prev?.title || 'THEO Workbench'),
      body: String(rawItem.body || prev?.body || ''),
      tab: String(rawItem.tab || prev?.tab || (rawItem.threadId ? 'chat' : 'pulse')),
      threadId: String(rawItem.threadId || rawItem.sessionId || prev?.threadId || ''),
      provider: String(rawItem.provider || prev?.provider || ''),
      reminderId: String(rawItem.reminderId || prev?.reminderId || ''),
      sessionTitle: String(rawItem.sessionTitle || prev?.sessionTitle || ''),
      url: String(rawItem.url || prev?.url || './'),
      ts: Number(rawItem.ts || prev?.ts || Date.now()),
      checked: opts.checked !== undefined ? Boolean(opts.checked) : false
    };
    const filtered = existing.filter((x) => {
      if (!x) return false;
      if (x.id === id || x.tag === tag) return false;
      if (threadId && !isApproval && x.threadId === threadId && !String(x.tag || '').startsWith('theo-app-')) {
        return false;
      }
      return true;
    });
    const next = [entry, ...filtered].slice(0, 60);
    saveNotifLog(next);
    if (!opts.silent) {
      updateAppBadgeCount(false);
    }
    return entry;
  }

  function seedUncheckedTheoNotifications() {
    const approvals = Array.isArray(appState?.approvals) ? appState.approvals : [];
    const rows = Array.isArray(appState?.rows) ? appState.rows : [];
    const existing = loadNotifLog();
    const checkedSet = loadCheckedNotifKeys();
    let changed = false;
    const next = [...existing];

    const activeApprovalTags = new Set();
    for (const a of approvals) {
      if (!a || !a.id) continue;
      const tag = `theo-app-${a.id}`;
      activeApprovalTags.add(tag);
      if (checkedSet.has(tag)) continue;
      if (!next.some((x) => x && (x.id === tag || x.tag === tag))) {
        const isQ = a.kind === 'question' || /question/i.test(String(a.toolName || ''));
        next.unshift({
          id: tag,
          tag,
          title: isQ
            ? `❓ Question · ${a.title || 'Session'}`
            : `⚡ Approval Needed · ${a.title || 'Session'}`,
          body: String(a.detail || a.toolName || 'Waiting for confirmation in VS Code'),
          tab: a.sessionId ? 'chat' : 'pulse',
          threadId: String(a.sessionId || ''),
          provider: String(a.provider || 'antigravity'),
          reminderId: '',
          sessionTitle: String(a.title || 'Session'),
          url: a.sessionId
            ? `./?tab=chat&thread=${encodeURIComponent(a.sessionId)}&provider=${encodeURIComponent(a.provider || 'antigravity')}`
            : './?tab=pulse',
          ts: Date.now(),
          checked: false
        });
        changed = true;
      }
    }

    // Auto-clear approval notifications whose approvals have already been resolved
    for (const it of next) {
      if (
        it &&
        !it.checked &&
        String(it.tag || '').startsWith('theo-app-') &&
        !activeApprovalTags.has(it.tag)
      ) {
        it.checked = true;
        it.checkedAt = Date.now();
        rememberCheckedNotifKeys(it.id, it.tag);
        changed = true;
      }
    }

    // Seed unread sessions if not already represented or checked (1 entry per session)
    for (const r of rows) {
      if (!r || !r.id || r.archived || !r.unread) continue;
      const tag = `theo-unread-${r.id}`;
      const legacyTag = `theo-unread-${r.id}-${r.stepCount || r.at || 0}`;
      if (checkedSet.has(tag) || checkedSet.has(legacyTag) || checkedSet.has(`session:${r.id}`)) continue;
      const alreadyHasForThread = next.some((x) => x && x.threadId === r.id);
      if (!alreadyHasForThread && !next.some((x) => x && (x.id === tag || x.tag === tag))) {
        const lastTxt = String(r.lastAssistantText || '').trim();
        next.unshift({
          id: tag,
          tag,
          title: `● Unread Session · ${r.title || 'Session'}`,
          body: lastTxt
            ? lastTxt.slice(0, 140)
            : `${r.provider === 'claude' ? 'Claude Code' : 'Antigravity'} session has unread updates (${r.folder || 'Workspace'}).`,
          tab: 'chat',
          threadId: r.id,
          provider: r.provider || 'antigravity',
          reminderId: '',
          sessionTitle: r.title || 'Session',
          url: `./?tab=chat&thread=${encodeURIComponent(r.id)}&provider=${encodeURIComponent(r.provider || 'antigravity')}`,
          ts: Number(r.at || Date.now()),
          checked: false
        });
        changed = true;
      }
    }

    // Seed active usage rate >= 90% alerts if not already represented or checked, and auto-clear if dropped < 90%
    if (prefs.notif?.quota !== false && appState) {
      const { highAlerts, allActiveBuckets } = collectHighUsageQuotaAlerts(appState);
      const activeQuotaTags = new Set(highAlerts.map((q) => q.tag));
      for (const alert of highAlerts) {
        if (checkedSet.has(alert.id) || checkedSet.has(alert.tag)) continue;
        const existingQuota = next.find(
          (x) => x && (x.id === alert.id || x.tag === alert.tag)
        );
        if (!existingQuota) {
          next.unshift({
            id: alert.id,
            tag: alert.tag,
            title: alert.title,
            body: alert.body,
            tab: 'pulse',
            threadId: '',
            provider: alert.provider,
            reminderId: '',
            sessionTitle: '',
            url: './?tab=pulse',
            ts: Date.now(),
            checked: false
          });
          changed = true;
        } else if (existingQuota.title !== alert.title || existingQuota.body !== alert.body) {
          existingQuota.title = alert.title;
          existingQuota.body = alert.body;
          changed = true;
        }
      }
      if (allActiveBuckets.length > 0) {
        for (const it of next) {
          if (
            it &&
            !it.checked &&
            String(it.tag || '').startsWith('theo-quota-') &&
            !activeQuotaTags.has(it.tag)
          ) {
            it.checked = true;
            it.checkedAt = Date.now();
            rememberCheckedNotifKeys(it.id, it.tag);
            changed = true;
          }
        }
      }
    }

    if (changed) {
      saveNotifLog(next.slice(0, 60));
    }
  }

  async function syncUnreadNotificationsWithSwCache() {
    let swItems = [];
    try {
      if ('caches' in window) {
        const cache = await caches.open(NAV_HANDOFF_CACHE);
        const res = await cache.match(UNREAD_NOTIFS_CACHE_URL);
        if (res) {
          const data = await res.json().catch(() => null);
          if (Array.isArray(data?.items)) swItems = data.items;
          else if (Array.isArray(data)) swItems = data;
        }
      }
    } catch {}

    const localItems = loadNotifLog();
    const checkedKeys = loadCheckedNotifKeys();
    const byKey = new Map();

    for (const item of [...swItems, ...localItems]) {
      if (!item || typeof item !== 'object') continue;
      const id = String(item.id || item.tag || '');
      const tag = String(item.tag || id);
      if (!id) continue;
      const isChecked =
        Boolean(item.checked) || checkedKeys.has(id) || checkedKeys.has(tag);
      const prev = byKey.get(id) || byKey.get(tag);
      if (!prev) {
        byKey.set(id, { ...item, id, tag, checked: isChecked });
      } else {
        prev.checked = Boolean(prev.checked || isChecked);
        if (Number(item.ts || 0) > Number(prev.ts || 0)) {
          prev.title = item.title || prev.title;
          prev.body = item.body || prev.body;
          prev.ts = item.ts;
        }
      }
    }

    const merged = Array.from(byKey.values())
      .sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0))
      .slice(0, 60);
    saveNotifLog(merged);
    seedUncheckedTheoNotifications();
    updateAppBadgeCount(false);
  }

  function markNotificationChecked(idOrTag, opts = {}) {
    const key = String(idOrTag || '').trim();
    if (!key) return;
    const items = loadNotifLog();
    const checkedTags = [];
    let matchedItem = null;
    const next = items.map((it) => {
      if (!it) return it;
      if (it.id === key || it.tag === key) {
        matchedItem = it;
        if (it.tag) checkedTags.push(it.tag);
        rememberCheckedNotifKeys(it.id, it.tag);
        return { ...it, checked: true, checkedAt: Date.now() };
      }
      return it;
    });
    if (!matchedItem) {
      rememberCheckedNotifKeys(key);
      checkedTags.push(key);
    }
    saveNotifLog(next);
    updateAppBadgeCount(true, checkedTags);
    if (opts.navigate && matchedItem) {
      closeNotifModal();
      applyNotificationNav({ ...matchedItem, clicked: true });
    }
  }

  function markNotificationsCheckedForSession(sessionId) {
    const sid = String(sessionId || '').trim();
    if (!sid) return;
    const items = loadNotifLog();
    const checkedTags = [];
    let changed = false;
    const next = items.map((it) => {
      if (!it || it.checked) return it;
      if (it.threadId === sid) {
        changed = true;
        if (it.tag) checkedTags.push(it.tag);
        rememberCheckedNotifKeys(it.id, it.tag);
        return { ...it, checked: true, checkedAt: Date.now() };
      }
      return it;
    });
    if (changed) {
      saveNotifLog(next);
      updateAppBadgeCount(true, checkedTags);
    }
  }

  function markAllNotificationsChecked() {
    const items = loadNotifLog();
    const checkedTags = [];
    const next = items.map((it) => {
      if (!it) return it;
      if (it.tag) checkedTags.push(it.tag);
      rememberCheckedNotifKeys(it.id, it.tag);
      return { ...it, checked: true, checkedAt: Date.now() };
    });
    for (const a of appState?.approvals || []) {
      if (a && a.id) rememberCheckedNotifKeys(`theo-app-${a.id}`);
    }
    for (const r of appState?.rows || []) {
      if (r && r.id && r.unread) {
        rememberCheckedNotifKeys(`theo-unread-${r.id}-${r.stepCount || r.at || 0}`);
      }
    }
    for (const q of collectHighUsageQuotaAlerts(appState).highAlerts) {
      if (q) rememberCheckedNotifKeys(q.id, q.tag);
    }
    saveNotifLog(next);
    updateAppBadgeCount(true, checkedTags);
    showToast('✓ All notifications marked checked — Home Screen badge cleared');
  }

  function clearCheckedNotifications() {
    const items = loadNotifLog();
    const unchecked = items.filter((it) => it && !it.checked);
    saveNotifLog(unchecked);
    updateAppBadgeCount(false);
    showToast('Cleared checked notifications');
  }

  function swLocalNotif(payload) {
    const item = recordTheoNotification(payload, { force: true, checked: false });
    try {
      if (navigator.serviceWorker) {
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'show-notification',
            payload: { ...payload, id: item?.id || payload.id, tag: item?.tag || payload.tag },
            skipUnread: true
          });
        } else {
          navigator.serviceWorker.ready
            .then((reg) => {
              if (reg && reg.showNotification) {
                reg.showNotification(payload.title || 'THEO Workbench', {
                  body: payload.body || '',
                  icon: './icon-192.png',
                  badge: './icon-192.png',
                  tag: item?.tag || payload.tag || 'theo-local',
                  renotify: true,
                  data: {
                    id: item?.id || payload.id || payload.tag || `local-${Date.now()}`,
                    tag: item?.tag || payload.tag || 'theo-local',
                    url: payload.url || './',
                    tab: payload.tab || 'pulse',
                    threadId: payload.threadId || '',
                    provider: payload.provider || '',
                    reminderId: payload.reminderId || '',
                    sessionTitle: payload.sessionTitle || ''
                  }
                });
              }
            })
            .catch(() => {});
        }
      }
    } catch {}
  }

  async function checkExistingPushSub() {
    if (!pushSupported()) return null;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg || !reg.pushManager) return null;
      const sub = await reg.pushManager.getSubscription();
      pushSub = sub ? sub.toJSON() : null;
      if (pushSub && prefs.notif && prefs.notif.enabled) {
        schedulePushSync();
      }
      renderAll();
      return pushSub;
    } catch {
      return null;
    }
  }

  async function scheduleExactReminderPush() {
    // All Prayer, Task, Reminder, Wait Timer, Delegation & 100% Score notifications are now owned by Planner (https://husseinbdeir.github.io/planner/)
    return;
  }

  async function cancelExactReminderPush(itemId) {
    if (isHeadlessBrowser || !cloudCfg.url || !cloudCfg.key || !itemId) return;
    try {
      await callCloudPush({
        op: 'patch',
        patch: {
          [`timer/rem_${itemId}`]: { id: 'cancelled' }
        }
      });
    } catch {}
  }

  function checkDueRemindersTick() {
    // Handled exclusively by Planner PWA
    return;
  }

  async function buildPushSlots(subJson, daysCount = 14) {
    const nf = Object.assign({ ...DEFAULT_NOTIF }, prefs.notif || {});
    if (!nf.enabled || !subJson || !subJson.endpoint) return {};
    const slots = {};
    const now = new Date();
    const nowMs = now.getTime();
    const rows = (appState?.rows || []).filter((r) => r.id && !r.archived);
    const approvals = appState?.approvals || [];
    const workspaces = appState?.workspaces || [];
    const dirtyRepos = workspaces.filter((w) => Number(w.dirtyCount || 0) > 0);
    const openTabs = rows.filter((r) => r.open);
    const todayTok = Number(appState?.summary?.today?.tokens || 0);

    for (let d = 0; d < daysCount; d++) {
      const baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
      const iso = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}-${String(baseDate.getDate()).padStart(2, '0')}`;

      if (nf.morning !== false) {
        const dtAm = new Date(
          baseDate.getFullYear(),
          baseDate.getMonth(),
          baseDate.getDate(),
          Number(nf.morningHour || 8),
          0,
          0
        );
        if (dtAm.getTime() > nowMs - 1800000) {
          const slotKey = dtAm.toISOString().slice(0, 13);
          const waitTxt =
            approvals.length > 0
              ? `${approvals.length} approval${approvals.length === 1 ? '' : 's'} waiting · `
              : '';
          const title = `THEO AI Workbench Morning Brief ⚡`;
          const body = `${waitTxt}${rows.length} active AI sessions (${openTabs.length} open in VS Code across Antigravity & Claude Code).`;
          const exp = Math.floor(dtAm.getTime() / 1000) + 57600;
          const [vapid, bodyB64] = await Promise.all([
            signVapid(subJson.endpoint, exp),
            encryptWebPush(subJson, {
              title,
              body,
              tag: `theo-am-${iso}`,
              url: './?tab=pulse',
              tab: 'pulse'
            })
          ]);
          slots[slotKey] = { vapid, bodyB64 };
        }
      }

      if (nf.evening !== false) {
        const dtPm = new Date(
          baseDate.getFullYear(),
          baseDate.getMonth(),
          baseDate.getDate(),
          Number(nf.eveningHour || 21),
          0,
          0
        );
        if (dtPm.getTime() > nowMs - 1800000) {
          const slotKey = dtPm.toISOString().slice(0, 13);
          const dirtyTxt =
            dirtyRepos.length > 0
              ? `${dirtyRepos.length} repo${dirtyRepos.length === 1 ? '' : 's'} with uncommitted changes`
              : 'All BHFIRMS git repos clean';
          const tokTxt = todayTok > 0 && d === 0 ? ` · ${fmtCompact(todayTok)} tokens today` : '';
          const title = `THEO Evening AI & Git Digest ⎇`;
          const body = `${dirtyTxt}${tokTxt}. ${rows.length} active sessions (${openTabs.length} open).`;
          const exp = Math.floor(dtPm.getTime() / 1000) + 57600;
          const [vapid, bodyB64] = await Promise.all([
            signVapid(subJson.endpoint, exp),
            encryptWebPush(subJson, {
              title,
              body,
              tag: `theo-pm-${iso}`,
              url: './?tab=workspaces',
              tab: 'workspaces'
            })
          ]);
          slots[slotKey] = { vapid, bodyB64 };
        }
      }
    }

    return slots;
  }

  let lastPushScheduleSyncAt = 0;

  function schedulePushSync() {
    if (!pushSub) return;
    clearTimeout(pushSyncTimer);
    pushSyncTimer = setTimeout(() => {
      syncPushSchedule().catch(() => {});
    }, 600);
  }

  function getTheoPlatformClass(ua) {
    const s = String(ua || '').toLowerCase();
    if (!s) return '';
    if (s.includes('iphone')) return 'iphone';
    if (s.includes('ipad')) return 'ipad';
    if (s.includes('android')) return 'android';
    if (s.includes('macintosh') || s.includes('mac os')) return 'mac';
    if (s.includes('windows')) return 'windows';
    if (s.includes('linux')) return 'linux';
    return s.slice(0, 32);
  }

  async function syncPushSchedule() {
    if (isHeadlessBrowser || !pushSub || !pushSub.endpoint) return;
    lastPushScheduleSyncAt = Date.now();
    const nf = Object.assign({ ...DEFAULT_NOTIF }, prefs.notif || {});
    const devId = getDeviceId();
    const slots = nf.enabled ? await buildPushSlots(pushSub, 14) : {};
    const p256dh = (pushSub.keys && pushSub.keys.p256dh) || '';
    const auth = (pushSub.keys && pushSub.keys.auth) || '';
    const curUa = String((typeof navigator !== 'undefined' && navigator.userAgent) || '').slice(0, 140);
    const curPlat = getTheoPlatformClass(curUa);
    const entry = {
      id: devId,
      app: 'theo',
      endpoint: pushSub.endpoint,
      p256dh,
      auth,
      keys: { p256dh, auth },
      prefs: nf,
      ua: curUa,
      updatedAt: new Date().toISOString(),
      slots
    };

    // 1. Register with Direct Local Bridge (:4318) if available
    if (localBridgeBase) {
      fetch(`${localBridgeBase}/api/push-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device: entry, enabled: Boolean(nf.enabled) })
      }).catch(() => {});
    }

    // 2. Register with Dataverse Cloud Relay (for Personal - THEO Remote Daily Push & remote bridge sync)
    // Note: Do NOT arm duplicate theo_brief_d* push_delay timers — Personal - THEO Remote Daily Push already dispatches entry.slots hourly!
    if (cloudCfg.url && cloudCfg.key) {
      try {
        const curRes = await callCloudPush({ op: 'get' });
        const curDocs = (curRes && curRes.docs) || curRes || {};
        const existing = Array.isArray(curDocs?.push_registry?.items)
          ? curDocs.push_registry.items
          : [];
        const others = existing.filter((x) => {
          if (!x || !x.id) return false;
          if (x.id === devId || x.endpoint === pushSub.endpoint) return false;
          const xApp = String(x.app || '').toLowerCase();
          const isTheoItem = !xApp || xApp === 'theo';
          if (isTheoItem && curPlat && getTheoPlatformClass(x.ua) === curPlat) {
            return false;
          }
          return true;
        });
        const nextItems = nf.enabled ? others.concat([entry]) : others;
        const patchObj = {
          push_registry: {
            items: nextItems,
            updatedAt: new Date().toISOString()
          }
        };
        for (const k of Object.keys(curDocs)) {
          if (k.startsWith('theo_brief_') && curDocs[k]?.id !== 'cancelled') {
            patchObj[k] = { id: 'cancelled', updatedAt: new Date().toISOString() };
          }
        }
        await callCloudPush({
          op: 'patch',
          patch: patchObj
        });
      } catch {}
    }
  }

  async function enablePush(forceFresh = true) {
    if (pushBusy) return;
    const ua = String((typeof navigator !== 'undefined' && navigator.userAgent) || '');
    const ios = /iPhone|iPad|iPod/.test(ua);
    if (ios && !isStandalone()) {
      showToast(
        'On iPhone, open THEO from your Home Screen icon to enable Web Push notifications.'
      );
      return;
    }
    if (!pushSupported()) {
      showToast(
        'Push notifications are not supported in this browser tab. Open the installed Home Screen app.'
      );
      return;
    }
    pushBusy = true;
    renderAll();
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        showToast(
          'Notification permission was not granted. Enable notifications in Settings -> THEO.'
        );
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (sub && forceFresh) {
        try {
          await sub.unsubscribe();
          sub = null;
        } catch {}
      }
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: b64ToBytes(_VAPID.pub)
        });
      }
      pushSub = sub.toJSON();
      prefs.notif = Object.assign({ ...DEFAULT_NOTIF }, prefs.notif || {}, { enabled: true });
      saveJson(STORAGE_KEYS.PREFS, prefs);
      saveJson(STORAGE_KEYS.PUSH_HINT, 1);
      localStorage.removeItem('theo_armed_briefs_v1');
      await syncPushSchedule();
      showToast('Push notifications paired! Sending confirmation banner…');
      await sendTestPush(true);
    } catch (e) {
      showToast(`Could not enable push: ${(e && e.message) || e}`);
    } finally {
      pushBusy = false;
      renderAll();
    }
  }

  async function disablePush() {
    pushBusy = true;
    renderAll();
    try {
      if (pushSupported()) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && reg.pushManager) {
          const sub = await reg.pushManager.getSubscription();
          if (sub) await sub.unsubscribe().catch(() => {});
        }
      }
      prefs.notif = Object.assign({ ...DEFAULT_NOTIF }, prefs.notif || {}, { enabled: false });
      saveJson(STORAGE_KEYS.PREFS, prefs);
      await syncPushSchedule();
      pushSub = null;
      showToast('Push notifications turned off on this device.');
    } finally {
      pushBusy = false;
      renderAll();
    }
  }

  async function sendTestPush(isWelcome = false) {
    const msg = {
      title: isWelcome ? 'THEO Notifications Active 🔔' : 'THEO Remote Workbench ⚡',
      body: isWelcome
        ? 'Lock-screen 1-tap approvals, session turn completions & daily briefings are now active.'
        : 'Test Web Push delivered from THEO Cloud! Lock-screen alerts are working.',
      tag: `theo-test-${Date.now()}`,
      url: './?tab=pulse',
      tab: 'pulse'
    };
    if (!pushSub || !pushSub.endpoint) {
      if (notifPerm() === 'granted') {
        swLocalNotif(msg);
        showToast('Local notification sent (enable Push to receive alerts while THEO is closed).');
        return;
      }
      await enablePush(true);
      return;
    }
    try {
      if (!isWelcome) showToast('Sending push notification…');
      const vapid = await signVapid(pushSub.endpoint, Math.floor(Date.now() / 1000) + 43200);
      const bodyB64 = await encryptWebPush(pushSub, msg);
      const res = await callCloudPush({
        op: 'push',
        endpoint: pushSub.endpoint,
        vapid,
        bodyB64,
        ttl: 3600
      });
      if (res && res.pushStatus >= 200 && res.pushStatus < 300) {
        if (!isWelcome) {
          showToast(`Push delivered (HTTP ${res.pushStatus})! Check your lock-screen banner.`);
        }
      } else if (res && (res.pushStatus === 410 || res.pushStatus === 404)) {
        pushSub = null;
        showToast('Subscription expired on device — re-subscribing…');
        await enablePush(true);
      } else if (!isWelcome) {
        showToast('Notification displayed.');
      }
    } catch {
      if (!isWelcome) showToast('Notification displayed.');
    }
  }

  function checkServerLastNotificationOnResume(nextState) {
    if (!nextState || typeof nextState !== 'object') return;
    const rawList = [
      ...(Array.isArray(nextState.recentNotifications) ? nextState.recentNotifications : []),
      ...(nextState.lastNotification && typeof nextState.lastNotification === 'object'
        ? [nextState.lastNotification]
        : [])
    ];
    if (!rawList.length) return;

    const seenKeys = new Set();
    let candidate = null;
    const unconsumedKeys = [];
    for (const item of rawList) {
      if (!item || typeof item !== 'object') continue;
      const notifId = String(item.id || item.tag || '');
      const notifTag = String(item.tag || '');
      const dedupeKey = `${notifId}::${notifTag}`;
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);
      if (!notifId && !item.threadId && !item.reminderId) continue;
      if (isNotifConsumed(notifId, notifTag)) continue;

      const ageMs = Date.now() - Number(item.at || item.ts || 0);
      if (ageMs < 0 || ageMs > 25 * 60 * 1000) {
        markNotifConsumed(notifId, notifTag);
        continue;
      }
      unconsumedKeys.push(notifId, notifTag);
      if (!candidate && (item.threadId || item.reminderId)) {
        candidate = { item, notifId, notifTag };
      }
    }
    if (!candidate) return;

    const consumeAllSeen = () => {
      if (unconsumedKeys.length > 0) {
        markNotifConsumed(...unconsumedKeys);
      }
    };

    // Never hijack when the user is composing or binding a new session
    if (
      isNewSessionMode() ||
      String(prefs.selectedThreadId || '').startsWith('draft-new-') ||
      pendingNewSessionBind
    ) {
      consumeAllSeen();
      return;
    }

    const { item: ln, notifId, notifTag } = candidate;

    // If the user explicitly navigated via ?thread= URL param, session click, or notification tap, do not hijack their target
    if (pinnedNavThreadId && Date.now() < pinnedNavUntil) {
      consumeAllSeen();
      return;
    }

    // If the user just launched or resumed the PWA from background after a task notification fired, jump to that task once
    if (Date.now() < recentResumeUntil && (ln.threadId || ln.reminderId)) {
      consumeAllSeen();
      recentResumeUntil = 0;
      applyNotificationNav({
        id: notifId,
        tag: notifTag,
        tab: ln.tab || (ln.threadId ? 'chat' : 'discipline'),
        threadId: ln.threadId || '',
        provider: ln.provider || '',
        reminderId: ln.reminderId || '',
        title: ln.title || '',
        sessionTitle: ln.sessionTitle || ln.title || '',
        ts: Number(ln.at || ln.ts || Date.now())
      });
      return;
    }

    // When already foregrounded past the resume window, mark historical server notifications consumed so they never act as delayed landmines
    if (!document.hidden && Date.now() >= recentResumeUntil) {
      consumeAllSeen();
    }
  }

  function checkLiveStateNotifications(nextState) {
    if (!nextState) return;
    const nf = Object.assign({ ...DEFAULT_NOTIF }, prefs.notif || {});
    const approvals = Array.isArray(nextState.approvals) ? nextState.approvals : [];
    const rows = Array.isArray(nextState.rows) ? nextState.rows : [];

    checkServerLastNotificationOnResume(nextState);

    // Evaluate live usage rate >= 90% alerts across Antigravity & Claude Code (even on initial load if not yet seen in this reset window)
    if (nf.quota !== false) {
      const nowMs = Date.now();
      const { highAlerts, allActiveBuckets } = collectHighUsageQuotaAlerts(nextState, nowMs);
      let quotaChanged = false;
      for (const b of allActiveBuckets) {
        if (b.pct < 85 || b.expired) {
          const prefix = `quota90:${b.bucketKey}:`;
          for (const k of Array.from(seenQuotaAlertIds)) {
            if (typeof k === 'string' && k.startsWith(prefix)) {
              seenQuotaAlertIds.delete(k);
              quotaChanged = true;
            }
          }
        }
      }
      for (const alert of highAlerts) {
        if (!hasQuotaAlertForWindow(seenQuotaAlertIds, alert.bucketKey, alert.windowStamp, nowMs)) {
          seenQuotaAlertIds.add(alert.id);
          quotaChanged = true;
          const navTarget = {
            id: alert.id,
            tag: alert.tag,
            tab: 'pulse',
            threadId: '',
            provider: alert.provider,
            url: './?tab=pulse'
          };
          recordTheoNotification(
            {
              title: alert.title,
              body: alert.body,
              ...navTarget
            },
            { force: false, checked: false }
          );
          playChime('approve');
          showToast(`${alert.title} — tap to inspect`, navTarget);
          if (
            nf.enabled &&
            nf.quota !== false &&
            !(pushSub && pushSub.endpoint) &&
            (document.hidden || !document.hasFocus()) &&
            notifPerm() === 'granted'
          ) {
            swLocalNotif({
              title: alert.title,
              body: alert.body,
              ...navTarget
            });
          }
        }
      }
      if (quotaChanged) {
        saveSeenQuotaAlerts();
      }
    }

    if (!statePrimed) {
      statePrimed = true;
      for (const a of approvals) {
        if (a && a.id) seenApprovalIds.add(a.id);
      }
      for (const r of rows) {
        if (r && r.id) {
          prevRowStatuses.set(r.id, r.status || 'idle');
          if (Number(r.stepCount || 0) > 0) prevRowSteps.set(r.id, Number(r.stepCount));
          if (Number(r.at || 0) > 0) prevRowAts.set(r.id, Number(r.at));
        }
      }
      return;
    }

    const newlyNotifiedSessions = new Set();

    // 1. New pending approval / question / waiting session
    for (const a of approvals) {
      if (!a || !a.id || seenApprovalIds.has(a.id)) continue;
      seenApprovalIds.add(a.id);
      if (a.sessionId) newlyNotifiedSessions.add(a.sessionId);
      const isQ = a.kind === 'question' || /question/i.test(String(a.toolName || ''));
      const tag = `theo-app-${a.sessionId || a.id}`;
      const targetTab = a.sessionId ? 'chat' : 'pulse';
      const navTarget = {
        id: tag,
        tag,
        tab: targetTab,
        threadId: a.sessionId || '',
        provider: a.provider || 'antigravity',
        sessionTitle: a.title || 'Session',
        url: a.sessionId
          ? `./?tab=chat&thread=${encodeURIComponent(a.sessionId)}&provider=${encodeURIComponent(a.provider || 'antigravity')}`
          : `./?tab=${targetTab}`
      };
      const notifTitle = isQ
        ? `❓ Question from THEO — ${a.title || 'Session'}`
        : `⚡ Approval Needed · ${a.provider === 'claude' ? 'Claude Code' : 'Antigravity'}`;
      const notifBody = isQ
        ? `${a.detail || 'THEO is waiting for your answer.'}`
        : `${a.title || 'Session'}: ${a.toolName || 'Permission'} — ${a.detail || 'Waiting for confirmation'}`;
      recordTheoNotification(
        {
          title: notifTitle,
          body: notifBody,
          ...navTarget
        },
        { force: true, checked: false }
      );
      playChime('approve');
      showToast(
        isQ
          ? `❓ Question (${a.title || 'THEO'}): ${String(a.detail || 'Waiting for your answer').slice(0, 100)}`
          : `⚡ Approval Needed (${a.title || 'THEO'}): ${a.toolName || 'Permission'}`,
        navTarget
      );
      if (
        nf.enabled &&
        nf.approvals !== false &&
        !(pushSub && pushSub.endpoint) &&
        (document.hidden || !document.hasFocus()) &&
        notifPerm() === 'granted'
      ) {
        swLocalNotif({
          title: notifTitle,
          body: notifBody,
          ...navTarget
        });
      }
    }

    // 2. Session transitioned to completed/idle/done (or fast turn completed between polls)
    for (const r of rows) {
      if (!r || !r.id) continue;
      const prevStatus = prevRowStatuses.get(r.id);
      const prevStep = Number(prevRowSteps.get(r.id) || 0);
      const prevAt = Number(prevRowAts.get(r.id) || 0);
      const curStatus = r.status || 'idle';
      const curStep = Number(r.stepCount || 0);
      const curAt = Number(r.at || 0);
      prevRowStatuses.set(r.id, curStatus);
      if (curStep > 0) prevRowSteps.set(r.id, curStep);
      if (curAt > 0) prevRowAts.set(r.id, curAt);

      const isDone =
        curStatus === 'completed' || curStatus === 'idle' || curStatus === 'done';
      const lastText = String(r.lastAssistantText || '').trim();
      const isTurnTrulyComplete =
        isDone && r.turnComplete !== false && Boolean(lastText);
      const transitionedFromWorking = prevStatus === 'working' && isTurnTrulyComplete;
      const fastTurnCompleted =
        Boolean(prevStatus) &&
        prevStatus !== 'working' &&
        isTurnTrulyComplete &&
        prevStep > 0 &&
        curStep > prevStep &&
        curAt > prevAt &&
        Date.now() - curAt < 90000;

      if ((transitionedFromWorking || fastTurnCompleted) && !newlyNotifiedSessions.has(r.id)) {
        const endsWithQ = /\?\s*["')*\]]*\s*$/.test(lastText);
        const doneId = `done-${r.id}-${curStep || curAt || Date.now()}`;
        const tag = `theo-done-${r.id}`;
        const existingLog = loadNotifLog();
        const alreadyLoggedSameText = existingLog.some(
          (x) =>
            x &&
            x.threadId === r.id &&
            x.tag === tag &&
            Date.now() - Number(x.ts || 0) < 120000 &&
            String(x.body || '').trim() === lastText.slice(0, 160).trim()
        );
        if (alreadyLoggedSameText) continue;
        const navTarget = {
          id: doneId,
          tag,
          tab: 'chat',
          threadId: r.id,
          provider: r.provider || 'antigravity',
          sessionTitle: r.title || 'Session',
          url: `./?tab=chat&thread=${encodeURIComponent(r.id)}&provider=${encodeURIComponent(r.provider || 'antigravity')}`
        };
        const notifTitle = endsWithQ
          ? `❓ Question from THEO — ${r.title || 'Session'}`
          : `✓ Task Complete — ${r.title || 'Session'}`;
        const notifBody = lastText
          ? lastText.slice(0, 160)
          : `${r.title || 'Session'} (${r.folder || 'Workspace'}) finished running. Tap to inspect.`;
        const activelyViewingThisChat =
          !document.hidden &&
          document.hasFocus() &&
          prefs.activeTab === 'chat' &&
          prefs.selectedThreadId === r.id;
        if (!activelyViewingThisChat) {
          recordTheoNotification(
            {
              title: notifTitle,
              body: notifBody,
              ...navTarget
            },
            { force: true, checked: false }
          );
        }
        playChime(endsWithQ ? 'approve' : 'confirm');
        showToast(
          endsWithQ
            ? `❓ Question (${r.title || 'Session'}): ${lastText.slice(0, 95)}`
            : `✓ Task Complete (${r.title || 'Session'})${lastText ? ': ' + lastText.slice(0, 80) : ''}`,
          navTarget
        );
        if (
          nf.enabled &&
          nf.completed !== false &&
          !(pushSub && pushSub.endpoint) &&
          (document.hidden || !document.hasFocus()) &&
          notifPerm() === 'granted'
        ) {
          swLocalNotif({
            title: notifTitle,
            body: notifBody,
            ...navTarget
          });
        }
      }
    }
  }

  // Web Audio Synthesizer for subtle executive chimes (singleton context, #32)
  let sharedAudioCtx = null;
  function unlockSharedAudio() {
    if (isHeadlessBrowser) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
        sharedAudioCtx = new Ctx();
      }
      if (sharedAudioCtx.state === 'suspended') {
        sharedAudioCtx.resume().catch(() => {});
      }
    } catch {}
  }
  window.addEventListener('pointerdown', unlockSharedAudio, { passive: true });
  window.addEventListener('keydown', unlockSharedAudio, { passive: true });

  function isPinLocked() {
    const overlay = $('pin-overlay');
    return Boolean(
      document.documentElement.classList.contains('pin-locked-boot') ||
        (overlay && !overlay.hidden)
    );
  }

  function playChime(kind = 'confirm') {
    if (isHeadlessBrowser || !prefs.sound || isPinLocked()) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
        sharedAudioCtx = new Ctx();
      }
      const ctx = sharedAudioCtx;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const now = ctx.currentTime;
      const notes = kind === 'approve' ? [523.25, 659.25, 783.99] : kind === 'send' ? [440, 587.33] : [587.33];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.065);
        gain.gain.setValueAtTime(0.06, now + i * 0.065);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.065 + 0.24);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.065);
        osc.stop(now + i * 0.065 + 0.25);
      });
    } catch {}
  }

  function haptic(ms = 12) {
    try {
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch {}
  }

  function showToast(msg, navTarget = null) {
    const stack = $('toast-stack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = 'toast';
    const hasNav =
      navTarget &&
      typeof navTarget === 'object' &&
      (navTarget.threadId || navTarget.reminderId || navTarget.tab);
    if (hasNav) {
      el.style.cursor = 'pointer';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'space-between';
      el.style.gap = '10px';
      const textSpan = document.createElement('span');
      textSpan.textContent = msg;
      const ctaSpan = document.createElement('span');
      ctaSpan.style.fontWeight = '700';
      ctaSpan.style.color = 'var(--brass)';
      ctaSpan.style.whiteSpace = 'nowrap';
      ctaSpan.textContent = 'Open Task →';
      el.appendChild(textSpan);
      el.appendChild(ctaSpan);
      el.addEventListener('click', () => {
        el.remove();
        applyNotificationNav({ ...navTarget, clicked: true });
      });
    } else {
      el.textContent = msg;
    }
    stack.appendChild(el);
    setTimeout(
      () => {
        el.remove();
      },
      hasNav ? 5500 : 3200
    );
  }

  // Theme & IDE Sidebar management
  function applyTheme(theme, userExplicit = false) {
    prefs.theme = theme === 'dark' ? 'dark' : 'light';
    if (userExplicit) {
      prefs.themeUserSet = true;
    }
    document.documentElement.setAttribute('data-theme', prefs.theme);
    document.documentElement.classList.toggle('sidebar-collapsed', Boolean(prefs.sidebarCollapsed));
    const meta = $('meta-theme-color');
    if (meta) {
      meta.setAttribute('content', prefs.theme === 'light' ? '#F3F5F9' : '#0D0F14');
    }
    saveJson(STORAGE_KEYS.PREFS, prefs);
  }

  function toggleIdeSidebar(forceCollapsed) {
    if (isPinLocked()) return;
    const next =
      typeof forceCollapsed === 'boolean' ? forceCollapsed : !Boolean(prefs.sidebarCollapsed);
    prefs.sidebarCollapsed = next;
    document.documentElement.classList.toggle('sidebar-collapsed', next);
    const btn = $('btn-toggle-sidebar');
    if (btn) btn.setAttribute('aria-expanded', String(!next));
    saveJson(STORAGE_KEYS.PREFS, prefs);
  }

  // Inject provider SVG icons
  function hydrateStaticIcons() {
    document.querySelectorAll('[data-prov-icon]').forEach((el) => {
      const k = el.getAttribute('data-prov-icon');
      el.innerHTML = PROVIDER_ICONS[k] || PROVIDER_ICONS.antigravity;
    });
  }

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
    if (localBootInfo && typeof localBootInfo.token === 'string' && localBootInfo.token.trim()) {
      return localBootInfo.token.trim();
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
    if (isHeadlessBrowser || !localBridgeBase) return cachedPairingInfo;
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
    if (isHeadlessBrowser && !window.__THEO_ALLOW_PROBE_MOCK_FETCH) return '';
    refreshCloudConfig();
    const candidates = [];
    const ua = String((typeof navigator !== 'undefined' && navigator.userAgent) || '');
    const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(ua);
    const isGithubHosted = location.hostname.endsWith('.github.io');

    if (
      location.port === String(cloudCfg.port) ||
      (location.protocol === 'http:' && !isGithubHosted)
    ) {
      candidates.push(location.origin.replace(/\/+$/, ''));
    }
    if (prefs.customBridgeUrl) {
      candidates.push(prefs.customBridgeUrl.replace(/\/+$/, ''));
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
            if (data.edgeRelayUrl && !prefs.edgeRelayUrl && isSafeEdgeEndpointUrl(data.edgeRelayUrl)) {
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

  function inferFrontendRowDeviceId(r, fallbackId = '', fallbackName = '') {
    const cwd = String(r?.cwd || r?.workspacePath || '').toLowerCase();
    if (cwd.startsWith('c:\\users\\husseinbdeir') || cwd.startsWith('c:/users/husseinbdeir')) {
      return { id: 'main-workstation', name: 'Main Workstation' };
    }
    if (cwd.startsWith('c:\\users\\hbdei') || cwd.startsWith('c:/users/hbdei')) {
      return { id: 'theo-laptop', name: r?.deviceName || 'THEO Laptop' };
    }
    const id = String(r?.deviceId || fallbackId || '').trim();
    const devMeta = id ? fleetDevicesMap.get(id) : null;
    const name = String(r?.deviceName || devMeta?.name || fallbackName || id || '').trim();
    return { id, name };
  }

  function updateFleetDevices(list) {
    if (!Array.isArray(list)) return;
    for (const d of list) {
      if (!d || !d.id) continue;
      const prev = fleetDevicesMap.get(d.id) || {};
      fleetDevicesMap.set(d.id, {
        ...prev,
        ...d,
        id: d.id,
        name: d.name || prev.name || d.hostname || d.id,
        online: d.online !== undefined ? Boolean(d.online) : Boolean(prev.online),
        lastSeen: Number(d.lastSeen || d.updatedAt || prev.lastSeen || Date.now()),
        sessionCount: Number(
          d.sessionCount !== undefined ? d.sessionCount : prev.sessionCount || 0
        )
      });
    }
  }

  function getUnifiedFleetDevices() {
    if (Array.isArray(appState?.devices)) {
      updateFleetDevices(appState.devices);
    }
    const stateDev = appState?.device || appState?.connection?.device;
    if (stateDev && stateDev.id) {
      updateFleetDevices([
        {
          ...stateDev,
          online: connMode === 'local' || connMode === 'edge' ? true : Boolean(stateDev.online),
          sessionCount: (appState?.rows || []).filter(
            (r) => !r.archived && (!r.deviceId || r.deviceId === stateDev.id)
          ).length
        }
      ]);
    }
    const all = Array.from(fleetDevicesMap.values());
    return rankByFreq(
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
          lastSeen: Number(snap.generatedAt || Date.now())
        }
      ]);
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
    if (hostSnapshotsByDevice.size === 0) return appState;
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

    for (const [devId, snap] of entries) {
      maxGeneratedAt = Math.max(maxGeneratedAt, Number(snap?.generatedAt || 0));
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
          if (rAt > pAt || (rAt === pAt && rOwned && pOwned)) {
            rowMap.set(r.id, { ...prev, ...r });
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

    return {
      ...primarySnap,
      generatedAt: maxGeneratedAt || Date.now(),
      rows: Array.from(rowMap.values()).sort((a, b) => Number(b.at || 0) - Number(a.at || 0)),
      approvals: Array.from(appMap.values()),
      workspaces: Array.from(wsMap.values()),
      groups: Array.from(grpMap.values()),
      providers: chosenProviders || appState?.providers || {},
      accountOrder: chosenAccountOrder.length ? chosenAccountOrder : appState?.accountOrder || [],
      summary: chosenSummary || appState?.summary || null,
      summaryByProvider: chosenSummaryByProv || appState?.summaryByProvider || null,
      topSessions: chosenTopSessions.length ? chosenTopSessions : appState?.topSessions || []
    };
  }

  function ingestIncomingHostState(st, sourceDeviceId = '') {
    if (!st || typeof st !== 'object') return;
    const devId = storeHostSnapshotEntry(st, sourceDeviceId);
    const nextState = rebuildUnifiedAppState(devId) || st;

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

    applyStoppedSessionOverrides(nextState);
    applyAnsweredQuestionOverrides(nextState);
    applyPendingLocalOverrides(nextState);
    checkLiveStateNotifications(nextState);
    appState = nextState;
    reconcilePendingNewSessionBind(nextState, lastCloudQueue);
    persistCache();
    renderAll();
  }

  function patchLiveStreamingDom(tid) {
    streamDomRafId = 0;
    if (prefs.activeTab !== 'chat' || prefs.selectedThreadId !== tid) {
      return;
    }
    const streamEl = $('chat-stream');
    if (!streamEl) return;
    const turnEl = streamEl.querySelector('[data-streaming-turn="1"]');
    const live = liveStreamsByThreadId.get(tid);
    if (!turnEl || !live) {
      renderChatView(false);
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
        thinkBody.textContent = live.fullThinking;
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
      const rendered = live.fullText ? formatTurnMarkdown(live.fullText) : '';
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
    }
    if (wasNearBottom) {
      streamEl.scrollTop = streamEl.scrollHeight;
    }
    updateComposerActionButton();
  }

  function handleStreamDelta(rawDelta) {
    const delta = rawDelta?.delta && typeof rawDelta.delta === 'object' ? rawDelta.delta : rawDelta;
    if (!delta || typeof delta !== 'object') return;
    const prov = delta.provider === 'claude' ? 'claude' : 'antigravity';
    const realId = cleanTargetThreadId(delta.realThreadId || delta.threadId || '');
    const draftId = String(delta.draftThreadId || delta.draftId || '').trim();

    if (realId && pendingNewSessionBind) {
      const wantDev = pendingNewSessionBind.targetDeviceId || '';
      const deltaDev = String(delta.deviceId || '').trim();
      const devMatches = !wantDev || !deltaDev || wantDev === deltaDev;
      const matchesDraft =
        (draftId && pendingNewSessionBind.draftThreadId === draftId) ||
        (devMatches &&
          pendingNewSessionBind.provider === prov &&
          Date.now() - Number(pendingNewSessionBind.createdAt || 0) < 35000 &&
          !(pendingNewSessionBind.knownIds && pendingNewSessionBind.knownIds.has(realId)));
      if (matchesDraft) {
        bindDraftThreadToRealSession(pendingNewSessionBind.draftThreadId, realId, prov);
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

    if (appState && Array.isArray(appState.rows)) {
      let row = appState.rows.find((r) => r && r.id === tid);
      if (!row && realId) {
        row = {
          id: realId,
          title: String(delta.prompt || delta.title || 'Live Session').slice(0, 64),
          provider: prov,
          folder: delta.folder || delta.workspaceName || '',
          model: delta.model || '',
          deviceId: delta.deviceId || '',
          deviceName: delta.deviceName || '',
          status: 'working',
          statusLabel: 'Streaming Live',
          dot: 'running',
          at: Date.now()
        };
        appState.rows.unshift(row);
      } else if (row) {
        row.at = Date.now();
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
      }
    }

    if (!threadsCache[tid]) {
      threadsCache[tid] = {
        id: tid,
        provider: prov,
        title: String(delta.title || 'Live Session').slice(0, 64),
        messages: []
      };
    }
    const msgs = Array.isArray(threadsCache[tid].messages) ? threadsCache[tid].messages : [];
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
    threadsCache[tid].messages = msgs;

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
        renderPulseView();
        renderSessionsView();
      }, 450);
    }

    if (prefs.activeTab === 'chat' && prefs.selectedThreadId === tid) {
      streamDomTargetTid = tid;
      if (!streamDomRafId) {
        streamDomRafId = requestAnimationFrame(() => patchLiveStreamingDom(streamDomTargetTid));
      }
    } else if (!isWorking) {
      renderPulseView();
      renderSessionsView();
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

  function connectLocalWs(base) {
    if (
      isHeadlessBrowser ||
      initialNoSse ||
      location.search.includes('nosse=1') ||
      !base ||
      typeof WebSocket === 'undefined'
    ) {
      return;
    }
    const wsUrl = `${base.replace(/^http/i, 'ws').replace(/\/+$/, '')}/ws`;
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
          ws.send(JSON.stringify({ type: 'auth', role: 'client', token }));
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
            if (wEdge && !prefs.edgeRelayUrl) {
              discoveredEdgeUrl = String(wEdge).trim();
            }
            const wSnap = msg.state || msg.snapshot;
            if (wSnap) ingestIncomingHostState(wSnap, wDev?.id || '');
            flushOutbox().catch(() => {});
            updateConnectionBanner();
          } else if (msg.type === 'pong') {
            const sentTs = Number(msg.echoTs || msg.ts || 0);
            if (sentTs) localWsRttMs = Math.max(1, Date.now() - sentTs);
            updateConnectionBanner();
          } else if (msg.type === 'state' || msg.type === 'host_state') {
            const snap = msg.state || msg.snapshot;
            if (snap) ingestIncomingHostState(snap, msg.deviceId || localWsDevice?.id || '');
          } else if (msg.type === 'devices_presence') {
            if (Array.isArray(msg.devices)) {
              updateFleetDevices(msg.devices);
              updateConnectionBanner();
              renderPulseView();
              renderSessionsView();
            }
          } else if (msg.type === 'stream_delta') {
            handleStreamDelta(msg);
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
        if (localWs === ws) {
          localWs = null;
          localWsAuthed = false;
        }
        if (localWsPingTimer) {
          clearInterval(localWsPingTimer);
          localWsPingTimer = null;
        }
        updateConnectionBanner();
        const code = Number(ev?.code || 0);
        localWsReconnectAttempts += 1;
        const delay = code === 4001 ? 30000 : Math.min(20000, 2500 * localWsReconnectAttempts);
        if (!initialNoSse && localBridgeBase) {
          localWsReconnectTimer = setTimeout(() => connectLocalWs(localBridgeBase), delay);
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
    if (isHeadlessBrowser) return;
    const cleanTarget = normalizeEdgeWsUrl(rawUrl || prefs.edgeRelayUrl || discoveredEdgeUrl);
    const token = await getBridgeAuthTokenHex();
    if (
      initialNoSse ||
      location.search.includes('nosse=1') ||
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
              clientLabel: (navigator.userAgent || 'THEO Studio PWA').slice(0, 64)
            })
          );
        } catch {}
      });
      ws.addEventListener('message', (ev) => {
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
                if (snap) ingestIncomingHostState(snap, devId);
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
            updateConnectionBanner();
            renderAll();
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
              renderPulseView();
              renderSessionsView();
            }
          } else if (msg.type === 'host_state') {
            const snap = msg.snapshot || msg.state;
            if (snap) ingestIncomingHostState(snap, msg.deviceId || '');
          } else if (msg.type === 'stream_delta') {
            handleStreamDelta(msg);
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
          if (connMode === 'edge') connMode = appState ? 'cloud' : 'offline';
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
        const retryUrl = prefs.edgeRelayUrl || discoveredEdgeUrl;
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
    prefs.edgeRelayUrl = clean;
    discoveredEdgeUrl = clean || DEFAULT_EDGE_RELAY_URL;
    saveJson(STORAGE_KEYS.PREFS, prefs);
    if (isHeadlessBrowser) return true;
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
    renderAnalyticsView();
    return true;
  }

  async function connectSse(base) {
    if (isHeadlessBrowser || initialNoSse || location.search.includes('nosse=1') || !base) {
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
    saveJson(STORAGE_KEYS.CACHE, {
      state: appState,
      threads: threadsCache,
      workspacesDetail: workspacesDetailCache,
      updatedAt: Date.now()
    });
  }

  function mergeRemoteThreads(incomingThreads) {
    if (!incomingThreads || typeof incomingThreads !== 'object') return;
    const now = Date.now();
    for (const [tid, remoteThread] of Object.entries(incomingThreads)) {
      if (!remoteThread || typeof remoteThread !== 'object') continue;
      const existing = threadsCache[tid];
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
            .replace(/\n*📎 Attached:.*$/s, '')
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
      threadsCache[tid] = {
        ...remoteThread,
        messages: remoteMsgs
      };
      if (remoteMsgs.length > 0) {
        pendingThreadRequests.delete(tid);
      }
    }
  }

  async function syncData(options = {}) {
    if (isHeadlessBrowser && !window.__THEO_ALLOW_PROBE_MOCK_FETCH) return false;
    refreshCloudConfig();
    if (syncInFlight) {
      if (options.force || options.toast) {
        pendingSyncAfterFlight = true;
      }
      return false;
    }
    syncInFlight = true;
    try {
      if (options.toast || connMode === 'probing' || !appState) {
        updateConnectionBanner('syncing');
      }

      // 1. Try Direct Local Bridge first
      const bridgeBase = localBridgeBase || (await probeLocalBridge(Boolean(options.toast)));
      if (bridgeBase) {
        if (
          localWsAuthed &&
          localWs &&
          localWs.readyState === 1 &&
          appState &&
          !options.force &&
          !options.toast
        ) {
          connMode = 'local';
          updateConnectionBanner();
          flushOutbox().catch(() => {});
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
              const candidateEdge = prefs.edgeRelayUrl || discoveredEdgeUrl;
              if (candidateEdge) connectEdgeWs(candidateEdge).catch(() => {});
              if (
                pushSub &&
                prefs.notif &&
                prefs.notif.enabled &&
                Date.now() - lastPushScheduleSyncAt > 10 * 60 * 1000
              ) {
                schedulePushSync();
              }
              flushOutbox().catch(() => {});
              if (
                prefs.selectedThreadId &&
                prefs.selectedThreadId !== '__new__' &&
                !String(prefs.selectedThreadId).startsWith('draft-new-')
              ) {
                fetchThreadDetail(prefs.selectedThreadId, pinnedNavProvider || '').catch(() => {});
              }
              if (options.toast) {
                showToast(`Connected to Direct Studio Host (${(appState?.rows || []).length} sessions)`);
              }
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
      const candidateEdgeBoot = prefs.edgeRelayUrl || discoveredEdgeUrl;
      if (candidateEdgeBoot) {
        connectEdgeWs(candidateEdgeBoot).catch(() => {});
      }
      if (
        edgeWsAuthed &&
        edgeWs &&
        edgeWs.readyState === 1 &&
        appState &&
        !options.force &&
        !options.toast &&
        Date.now() - lastCloudBackstopAt < 60000
      ) {
        connMode = 'edge';
        updateConnectionBanner();
        flushOutbox().catch(() => {});
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
            if (store?.edge_relay?.url && !prefs.edgeRelayUrl) {
              discoveredEdgeUrl = String(store.edge_relay.url).trim();
            }
            const candidateEdge = prefs.edgeRelayUrl || discoveredEdgeUrl;
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
                ]);
                if (entry.threads && typeof entry.threads === 'object') {
                  mergeRemoteThreads(entry.threads);
                }
                if (snap) {
                  storeHostSnapshotEntry(snap, devId);
                }
              }
            }
            const unified = rebuildUnifiedAppState();
            if (unified) {
              applyStoppedSessionOverrides(unified);
              applyAnsweredQuestionOverrides(unified);
              applyPendingLocalOverrides(unified);
              checkLiveStateNotifications(unified);
              appState = unified;
              reconcilePendingNewSessionBind(unified, lastCloudQueue);
            }
            if (store?.state?.workspacesDetail && typeof store.state.workspacesDetail === 'object') {
              workspacesDetailCache = { ...workspacesDetailCache, ...store.state.workspacesDetail };
            }
            if (!hasExplicitBootUrlNav && pinnedNavThreadId && Date.now() < pinnedNavUntil) {
              prefs.selectedThreadId = pinnedNavThreadId;
              prefs.activeTab = 'chat';
            }
            persistCache();
            renderAll();
            if (
              pushSub &&
              prefs.notif &&
              prefs.notif.enabled &&
              Date.now() - lastPushScheduleSyncAt > 10 * 60 * 1000
            ) {
              schedulePushSync();
            }
            flushOutbox().catch(() => {});
            if (
              prefs.selectedThreadId &&
              prefs.selectedThreadId !== '__new__' &&
              !String(prefs.selectedThreadId).startsWith('draft-new-')
            ) {
              fetchThreadDetail(prefs.selectedThreadId, pinnedNavProvider || '').catch(() => {});
            }
            if (options.toast) {
              showToast(`Synced Multi-Device Fleet (${(appState?.rows || []).length} sessions)`);
            }
            return true;
          }
        } catch {}
      }

      connMode = edgeWsAuthed ? 'edge' : 'offline';
      renderAll();
      if (options.toast && connMode === 'offline') {
        const hasCreds = hasAnyPairingCredentials();
        if (hasCreds) {
          showToast('Offline — showing cached snapshot');
        } else {
          const activeViewInput = document.querySelector(
            '.view-pane.active [data-pair-code-input], #conn-modal:not([hidden]) [data-pair-code-input]'
          );
          if (activeViewInput) {
            setTimeout(() => activeViewInput.focus({ preventScroll: false }), 20);
          } else {
            openConnModal();
          }
          showToast('Enter your 6-digit pairing code to connect live');
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
    if (isHeadlessBrowser || !threadId) return null;
    const matchedRow = (appState?.rows || []).find((r) => r && r.id === threadId);
    const rowDeviceId = matchedRow?.deviceId || '';
    const isRemoteDeviceSession = Boolean(
      rowDeviceId && localWsDevice?.id && rowDeviceId !== localWsDevice.id
    );
    const hadAnyCachedTurns = Boolean(threadsCache[threadId]?.messages?.length);

    if (connMode === 'local' && localBridgeBase && !isRemoteDeviceSession) {
      try {
        const res = await authFetchLocal(
          `${localBridgeBase}/api/thread?id=${encodeURIComponent(threadId)}&provider=${encodeURIComponent(providerHint)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data?.thread) {
            mergeRemoteThreads({ [threadId]: data.thread });
            persistCache();
            if (prefs.activeTab === 'chat' && prefs.selectedThreadId === threadId) {
              renderChatView(!hadAnyCachedTurns);
            }
            return threadsCache[threadId];
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
        const threadObj = rpcOut?.result?.thread || rpcOut?.thread || null;
        if (threadObj) {
          mergeRemoteThreads({ [threadId]: threadObj });
          persistCache();
          if (prefs.activeTab === 'chat' && prefs.selectedThreadId === threadId) {
            renderChatView(!hadAnyCachedTurns);
          }
          return threadsCache[threadId];
        }
      } catch {}
    }

    if (cloudCfg.url && cloudCfg.key) {
      const cached = threadsCache[threadId];
      const hasMessages = Array.isArray(cached?.messages) && cached.messages.length > 0;
      const lastReq = pendingThreadRequests.get(threadId) || 0;
      if (!hasMessages && Date.now() - lastReq > 30000) {
        pendingThreadRequests.set(threadId, Date.now());
        if (prefs.activeTab === 'chat' && prefs.selectedThreadId === threadId) {
          renderChatView(false);
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
    return threadsCache[threadId] || null;
  }

  async function fetchWorkspaceDetail(repoId, fileRel = '') {
    if (isHeadlessBrowser || !repoId) {
      return { workspace: workspacesDetailCache[repoId] || null, file: null };
    }
    const wsEntry = (appState?.workspaces || []).find((w) => w && w.id === repoId);
    const targetDeviceId = wsEntry?.deviceId || '';
    const isRemoteWs = Boolean(targetDeviceId && localWsDevice?.id && targetDeviceId !== localWsDevice.id);

    if (connMode === 'local' && localBridgeBase && !isRemoteWs) {
      try {
        const q = `id=${encodeURIComponent(repoId)}${fileRel ? `&file=${encodeURIComponent(fileRel)}` : ''}`;
        const res = await authFetchLocal(`${localBridgeBase}/api/workspace?${q}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.workspace) {
            workspacesDetailCache[repoId] = data.workspace;
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
          workspacesDetailCache[repoId] = out.workspace;
          persistCache();
          return out;
        }
      } catch {}
    }

    return { workspace: workspacesDetailCache[repoId] || null, file: null };
  }

  let cloudCmdChain = Promise.resolve();

  function cleanTargetThreadId(val) {
    const s = String(val || '').trim();
    if (!s || s === '__new__' || s.startsWith('cmd-') || s.startsWith('draft-new-')) {
      return '';
    }
    return s;
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
        out.push(att);
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
      ? (appState?.rows || []).find((r) => r && r.id === targetThreadId)
      : null;
    const activeFilterDev =
      prefs.selectedDeviceFilter && prefs.selectedDeviceFilter !== 'all'
        ? String(prefs.selectedDeviceFilter).trim()
        : '';
    const composerPrefDev =
      prefs.composerTargetDevice && prefs.composerTargetDevice !== 'auto'
        ? String(prefs.composerTargetDevice).trim()
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
        : String(prefs.composerRepoPrefix || '').trim();
    const resolvedExecMode =
      cmdObj?.executionMode ||
      (prefs.composerDirectStream === false
        ? 'ide'
        : cmdObj?.newSession
          ? 'direct'
          : 'auto');

    if (resolvedTargetDevice) recordFreqUsage('devices', resolvedTargetDevice);
    if (resolvedWorkspace) recordFreqUsage('repos', resolvedWorkspace);
    if (targetThreadId) recordFreqUsage('threads', targetThreadId);

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

    if (isHeadlessBrowser) {
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
        const wsRes = await sendWsRpc(
          localWs,
          {
            type: 'rpc',
            targetDeviceId: resolvedTargetDevice || '',
            cmd: {
              ...cmd,
              attachments: wsAttachments,
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
        const edgeRes = await sendWsRpc(
          edgeWs,
          {
            type: 'rpc_cmd',
            targetDeviceId: resolvedTargetDevice || '',
            cmd: {
              ...cmd,
              attachments: edgeAttachments,
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

    // 3. Direct Local HTTP Bridge
    if (connMode === 'local' && localBridgeBase) {
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
          ? curStore.queue.commands.filter((c) => c && c.id && c.id !== cmd.id).slice(-14)
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
    outbox = outbox.filter((c) => c && c.id !== cmd.id);
    outbox.push(cmd);
    saveJson(STORAGE_KEYS.OUTBOX, outbox);
    renderOutboxBadge();
    return { ok: true, mode: 'queued', id: cmd.id };
  }

  async function flushOutbox() {
    if (!outbox.length || connMode === 'offline') return;
    const pending = [...outbox];
    outbox = [];
    saveJson(STORAGE_KEYS.OUTBOX, outbox);
    for (const item of pending) {
      await dispatchRemoteCommand(item);
    }
    renderOutboxBadge();
  }

  function renderOutboxBadge() {
    const ind = $('outbox-indicator');
    if (!ind) return;
    if (outbox.length > 0) {
      ind.hidden = false;
      ind.textContent = `${outbox.length} queued`;
    } else {
      ind.hidden = true;
    }
  }

  function updateConnectionBanner(overrideState = '') {
    const dotRail = $('rail-conn-dot');
    const titleRail = $('rail-conn-title');
    const subRail = $('rail-conn-sub');
    const pillMob = $('mobile-conn-pill');
    const dotMob = $('mobile-conn-dot');
    const textMob = $('mobile-conn-text');

    if (overrideState === 'syncing') {
      if (titleRail) titleRail.textContent = 'Syncing Bridge…';
      return;
    }

    const rowCount = (appState?.rows || []).length;
    const snapAge = appState?.generatedAt ? timeAgo(appState.generatedAt) : '';
    const fleetList = getUnifiedFleetDevices();
    const onlineHosts = fleetList.filter((d) => d.online).length;
    const hostLabel =
      localWsDevice?.name ||
      appState?.device?.name ||
      appState?.connection?.hostname ||
      'Local Host';

    if (connMode === 'local') {
      const wsBadge = localWsAuthed
        ? `WS${localWsRttMs > 0 ? ` ${localWsRttMs}ms` : ''}`
        : 'Live SSE';
      if (dotRail) dotRail.className = 'conn-dot live';
      if (titleRail) titleRail.textContent = `${hostLabel} · ${wsBadge}`;
      if (subRail) {
        subRail.textContent = `${fleetList.length > 1 ? `${fleetList.length} hosts · ` : ''}${rowCount} sess`;
      }
      if (pillMob) pillMob.hidden = true;
      if (dotMob) dotMob.className = 'conn-dot live';
      if (textMob) textMob.textContent = localWsAuthed ? 'Direct WS' : 'Direct SSE';
    } else if (connMode === 'edge' || edgeWsAuthed) {
      const rttTxt = edgeWsRttMs > 0 ? ` · ${edgeWsRttMs}ms` : '';
      if (dotRail) dotRail.className = 'conn-dot live';
      if (titleRail) titleRail.textContent = `Edge WS · ${Math.max(1, onlineHosts)} Host${onlineHosts === 1 ? '' : 's'} Live`;
      if (subRail) subRail.textContent = `Cloudflare DO${rttTxt} · ${rowCount} sess`;
      if (pillMob) pillMob.hidden = true;
      if (dotMob) dotMob.className = 'conn-dot live';
      if (textMob) textMob.textContent = `Edge WS${rttTxt}`;
    } else if (connMode === 'cloud') {
      if (dotRail) dotRail.className = 'conn-dot cloud';
      if (titleRail) {
        titleRail.textContent =
          fleetList.length > 1 ? `Cloud Fleet · ${fleetList.length} Hosts` : 'Cloud Relay · Connected';
      }
      if (subRail) subRail.textContent = `Sync ${snapAge || 'live'} · ${rowCount} sess`;
      if (pillMob) pillMob.hidden = true;
      if (dotMob) dotMob.className = 'conn-dot cloud';
      if (textMob) textMob.textContent = snapAge ? `Live · ${snapAge.replace(' ago', '')}` : 'Cloud Live';
    } else {
      const paired = hasAnyPairingCredentials();
      if (dotRail) dotRail.className = 'conn-dot';
      if (titleRail) titleRail.textContent = paired ? 'Offline Snapshot' : 'Pair This Device';
      if (subRail) {
        subRail.textContent = !paired
          ? 'Enter 6-digit code or pair link'
          : snapAge
            ? `Cached ${snapAge}`
            : 'Waiting for connection';
      }
      if (pillMob) pillMob.hidden = paired && connMode === 'probing' && navigator.onLine !== false;
      if (dotMob) dotMob.className = 'conn-dot';
      if (textMob) {
        textMob.textContent = !paired
          ? 'Pair Device'
          : outbox.length > 0
            ? `Offline · ${outbox.length}`
            : 'Offline';
      }
    }

    const pushDot = $('mobile-push-dot');
    const pushBtn = $('mobile-push-btn');
    const railPushDot = $('rail-push-dot');
    const railPushBtn = $('rail-push-btn');
    const nf = Object.assign({ ...DEFAULT_NOTIF }, prefs.notif || {});
    const pushActive = Boolean(nf.enabled && pushSub && notifPerm() === 'granted');
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

    const connModal = $('conn-modal');
    if (connModal && !connModal.hidden) {
      renderConnModal();
    }
    const notifModal = $('notif-modal');
    if (notifModal && !notifModal.hidden) {
      renderNotifModal();
    }
  }

  function pushUiHistoryState(overlay = '') {
    if (suppressHistoryPush) return;
    try {
      history.pushState({ theoTab: prefs.activeTab || 'pulse', overlay }, '');
    } catch {}
  }

  function openNotifModal() {
    const modal = $('notif-modal');
    if (!modal) return;
    seedUncheckedTheoNotifications();
    renderNotifModal();
    const wasHidden = modal.hidden;
    modal.hidden = false;
    if (wasHidden) pushUiHistoryState('notif-modal');
  }

  function closeNotifModal() {
    const modal = $('notif-modal');
    if (modal) modal.hidden = true;
  }

  function renderNotifModal() {
    const dotEl = $('notif-modal-dot');
    const titleEl = $('notif-modal-title');
    const bodyEl = $('notif-modal-body');
    if (!bodyEl) return;

    const nf = Object.assign({ ...DEFAULT_NOTIF }, prefs.notif || {});
    const pushActive = Boolean(nf.enabled && pushSub && notifPerm() === 'granted');
    const items = loadNotifLog();
    const unchecked = items.filter((x) => x && !x.checked);
    const checked = items.filter((x) => x && x.checked);
    const badgeCount = computeTheoUnreadBadgeCount(items);

    if (dotEl) {
      dotEl.className = `conn-dot ${pushActive ? 'live' : ''}`;
    }
    if (titleEl) {
      titleEl.textContent =
        badgeCount > 0
          ? `Notifications (${badgeCount} Unchecked on Home Screen)`
          : 'Notifications & Home Screen Badge';
    }

    const listHtml =
      items.length === 0
        ? `<div class="meta-timestamp" style="padding:14px 12px;border-radius:10px;background:var(--bg-ink);border:1px solid var(--border-subtle);text-align:center">No unchecked notifications — Home Screen badge is clear (0).</div>`
        : `<div class="notif-inbox-list">
            ${items
              .slice(0, 25)
              .map(
                (it) => `
              <div class="notif-item-row ${it.checked ? 'checked' : 'unchecked'}" data-notif-open="${esc(it.id || it.tag)}">
                <div class="notif-item-body">
                  <div class="notif-item-title">${esc(it.title || 'THEO Notification')}</div>
                  ${it.body ? `<div class="notif-item-sub">${esc(it.body)}</div>` : ''}
                  <div class="notif-item-meta tabular">${timeAgo(it.ts)} · ${it.checked ? '✓ Checked' : '● Unchecked (on Home Screen badge)'}</div>
                </div>
                ${
                  !it.checked
                    ? `<button type="button" class="notif-check-btn" data-notif-check="${esc(it.id || it.tag)}" aria-label="Mark checked &amp; decrement Home Screen badge">✓ Check</button>`
                    : `<span class="pill-count steel" style="font-size:10px">Done</span>`
                }
              </div>
            `
              )
              .join('')}
          </div>`;

    bodyEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <span class="meta-timestamp">
          Home Screen Badge: <strong class="tabular" style="color:${badgeCount > 0 ? '#FF3B30' : 'var(--emerald)'}">${badgeCount > 0 ? `${badgeCount} Unchecked` : '0 (All Clear)'}</strong> · Push: <strong style="color:${pushActive ? 'var(--emerald)' : 'var(--amber)'}">${pushActive ? 'Active' : 'Off'}</strong>
        </span>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${
            unchecked.length > 0 || badgeCount > 0
              ? `<button type="button" class="btn-brass-sm" data-notif-act="check-all" style="padding:5px 10px;font-size:11.5px">✓ Mark All Checked (${badgeCount})</button>`
              : ''
          }
          ${
            checked.length > 0
              ? `<button type="button" class="btn-ghost-sm" data-notif-act="clear-checked" style="padding:5px 10px;font-size:11.5px">Clear Checked</button>`
              : ''
          }
        </div>
      </div>
      ${listHtml}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;padding-top:8px;border-top:1px solid var(--border-subtle)">
        ${
          pushActive
            ? `<button type="button" class="btn-brass-sm" data-push-act="test">🔔 Send Test Push</button><button type="button" class="btn-ghost-sm" data-push-act="reset">🔄 Re-Pair Push</button>`
            : `<button type="button" class="btn-brass-sm" data-push-act="enable">${pushBusy ? 'Enabling…' : '🔔 Enable Web Push'}</button>`
        }
        <button type="button" class="btn-ghost-sm" data-notif-act="open-settings" style="margin-left:auto">⚙️ Push Settings</button>
      </div>
    `;
  }

  function openConnModal() {
    const modal = $('conn-modal');
    if (!modal) return;
    renderConnModal();
    const wasHidden = modal.hidden;
    modal.hidden = false;
    if (wasHidden) pushUiHistoryState('conn-modal');
  }

  function closeConnModal() {
    const modal = $('conn-modal');
    if (modal) modal.hidden = true;
  }

  function getEdgeHttpBaseUrl() {
    const raw = String(prefs.edgeRelayUrl || discoveredEdgeUrl || DEFAULT_EDGE_RELAY_URL).trim();
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
    if (!applyPairPayloadToPrefs(parsed)) return false;
    refreshCloudConfig();
    resetTransportsForFreshPairing();
    const targetEdge = prefs.edgeRelayUrl || discoveredEdgeUrl || DEFAULT_EDGE_RELAY_URL;
    if (!isHeadlessBrowser && targetEdge) {
      connectEdgeWs(targetEdge).catch(() => {});
    }
    if (!isHeadlessBrowser) {
      await syncData({ force: true, toast: false });
    }
    closeConnModal();
    updateConnectionBanner();
    renderAll();
    showToast('✓ Device paired & connected to THEO Fleet');
    return true;
  }

  async function claimSixDigitPairCode(rawCode) {
    if (pairClaimInFlight) return false;
    const digits = String(rawCode || '').replace(/\D+/g, '');
    if (digits.length !== 6) {
      showToast('Enter the 6-digit pairing code shown on your PC');
      return false;
    }
    if (isHeadlessBrowser && !window.__THEO_ALLOW_PAIR_MOCK_FETCH) {
      showToast('Headless quarantine active');
      return false;
    }
    const httpBase = getEdgeHttpBaseUrl();
    if (!httpBase) {
      showToast('Edge Relay URL is not configured');
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
        showToast(data?.error || 'Invalid or expired 6-digit code');
        return false;
      }
      const parsed = decodePairTokenString(data.bundle);
      if (!parsed) {
        showToast('Invalid pairing bundle returned by relay');
        return false;
      }
      return await finalizeInteractivePairSuccess(parsed);
    } catch {
      showToast('Could not reach Edge Relay — check internet connection');
      return false;
    } finally {
      if (timer) clearTimeout(timer);
      pairClaimInFlight = false;
    }
  }

  async function generateSixDigitPairCode() {
    if (pairCodeGenInFlight) return null;
    if (isHeadlessBrowser && !window.__THEO_ALLOW_PAIR_MOCK_FETCH) return null;
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
          renderAnalyticsView();
          renderConnModal();
          showToast(`🔢 6-Digit Phone Code: ${activeGeneratedPairCode.formatted} (valid 10m)`);
          return activeGeneratedPairCode;
        }
      }
      refreshCloudConfig();
      const bearer = await getBridgeAuthTokenHex();
      const bundle = encodePairTokenString({
        cloudUrl: cloudCfg.url,
        cloudKey: cloudCfg.key,
        edgeAccessKey: cloudCfg.edgeAccessKey,
        edgeRelayUrl: prefs.edgeRelayUrl || discoveredEdgeUrl || DEFAULT_EDGE_RELAY_URL,
        port: cloudCfg.port
      });
      const httpBase = getEdgeHttpBaseUrl();
      if (!bearer || !bundle || !httpBase) {
        showToast('Open Settings on your paired PC (http://127.0.0.1:4318) to generate a 6-digit code');
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
        showToast(data?.error || 'Could not generate 6-digit code');
        return null;
      }
      activeGeneratedPairCode = {
        code: data.code,
        formatted: data.formatted || `${data.code.slice(0, 3)}-${data.code.slice(3)}`,
        expiresAt: Number(data.expiresAt || Date.now() + 600000)
      };
      renderAnalyticsView();
      renderConnModal();
      showToast(`🔢 6-Digit Phone Code: ${activeGeneratedPairCode.formatted} (valid 10m)`);
      return activeGeneratedPairCode;
    } catch {
      showToast('Failed to contact Edge Relay to mint 6-digit code');
      return null;
    } finally {
      if (timer) clearTimeout(timer);
      pairCodeGenInFlight = false;
    }
  }

  function renderQuickPairOnboardingCardHtml(surfaceKey = 'main') {
    return `
      <div class="quick-pair-card" data-quick-pair-surface="${esc(surfaceKey)}">
        <div class="quick-pair-head">
          <div>
            <div class="eyebrow">ZERO-SECRET DEVICE PAIRING</div>
            <div class="quick-pair-title">Pair This iPhone / Browser</div>
          </div>
          <span class="pill-count amber">One-Time Setup</span>
        </div>
        <p class="meta-timestamp quick-pair-desc">
          Enter the <strong>6-digit code</strong> from your PC (works directly inside iOS Home Screen apps), or paste your <code>#pair=</code> link.
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
          <button type="button" class="btn-ghost-sm" data-pair-paste-clipboard>📋 Paste Pair Link</button>
          <button type="button" class="btn-ghost-sm" data-pair-toggle-link-box>${showQuickPairLinkFallback ? 'Hide Link Box' : 'Type / Paste Manually'}</button>
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
    const dotEl = $('conn-modal-dot');
    const titleEl = $('conn-modal-title');
    const bodyEl = $('conn-modal-body');
    if (!bodyEl || isFocusInsideContainerInputs(bodyEl)) return;

    const conn = appState?.connection || {};
    const lanUrl = conn.lanUrl || '';
    const hostName = conn.hostname || 'Hussein-Laptop';
    const rowCount = (appState?.rows || []).length;
    const activeCount = (appState?.rows || []).filter((r) => !r.archived).length;
    const runningCount = (appState?.rows || []).filter((r) => !r.archived && r.status === 'working').length;
    const threadCount = Object.keys(threadsCache || {}).length;
    const snapTime = appState?.generatedAt ? timeAgo(appState.generatedAt) : '—';
    const nf = Object.assign({ ...DEFAULT_NOTIF }, prefs.notif || {});
    const pushActive = Boolean(nf.enabled && pushSub && notifPerm() === 'granted');

    const fleetList = getUnifiedFleetDevices();
    if (dotEl) {
      dotEl.className = `conn-dot ${connMode === 'local' || connMode === 'edge' || edgeWsAuthed ? 'live' : connMode === 'cloud' ? 'cloud' : ''}`;
    }
    const isPairedNow = hasAnyPairingCredentials();
    if (titleEl) {
      titleEl.textContent =
        connMode === 'local'
          ? `Connected · Direct Host WebSocket (${localWsRttMs ? `${localWsRttMs}ms` : 'Live'})`
          : connMode === 'edge' || edgeWsAuthed
            ? `Connected · Cloudflare Edge WebSocket (${edgeWsRttMs ? `${edgeWsRttMs}ms` : 'Live'})`
            : connMode === 'cloud'
              ? 'Connected · Multi-Device Cloud Relay'
              : isPairedNow
                ? 'Offline · Local Snapshot Cache'
                : 'Pair This Device · Zero-Secret Setup';
    }

    const fleetRowsHtml = fleetList.length
      ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0">
          ${fleetList
            .map(
              (d) =>
                `<span class="sess-device-badge ${d.online ? 'is-online' : ''}">${d.online ? '●' : '◐'} ${esc(d.name || d.id)}${d.sessionCount ? ` · ${d.sessionCount}` : ''}</span>`
            )
            .join('')}
        </div>`
      : '';

    bodyEl.innerHTML = `
      ${!isPairedNow ? renderQuickPairOnboardingCardHtml('conn-modal') : ''}
      <div class="conn-stat-grid tabular">
        <div class="conn-stat-box">
          <span class="conn-stat-lbl">Active Host</span>
          <span class="conn-stat-val">${esc(localWsDevice?.name || hostName)}</span>
        </div>
        <div class="conn-stat-box">
          <span class="conn-stat-lbl">Transport</span>
          <span class="conn-stat-val">${localWsAuthed ? `⚡ Local WS (${localWsRttMs || 2}ms)` : edgeWsAuthed ? `⚡ Edge WS (${edgeWsRttMs || 18}ms)` : esc(snapTime)}</span>
        </div>
        <div class="conn-stat-box">
          <span class="conn-stat-lbl">Fleet Sessions</span>
          <span class="conn-stat-val">${runningCount} running · ${activeCount} sessions</span>
        </div>
        <div class="conn-stat-box">
          <span class="conn-stat-lbl">Web Push Alerts</span>
          <span class="conn-stat-val" style="color:${pushActive ? 'var(--emerald)' : 'var(--amber)'}">${pushActive ? '🔔 Active' : 'Off'}</span>
        </div>
      </div>
      ${fleetRowsHtml}
      <div class="meta-timestamp" style="line-height:1.45">
        ${
          connMode === 'local'
            ? `Streaming real-time SSE directly from VS Code on <code>${esc(localBridgeBase)}</code>.`
            : `Synced worldwide via <strong>Personal - THEO Remote Cloud Relay</strong> (Dataverse annotation backing store). Prompts, approvals, and session actions dispatch directly to VS Code.`
        }
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
        <button type="button" class="btn-brass-sm" id="conn-modal-sync-btn" style="flex:1">↻ Sync Now with VS Code</button>
        ${
          pushActive
            ? `<button type="button" class="btn-ghost-sm" data-push-act="test">🔔 Test Push</button><button type="button" class="btn-ghost-sm" data-push-act="reset" aria-label="Mint a fresh iOS APNs / Web Push subscription">🔄 Re-Pair Push</button>`
            : `<button type="button" class="btn-ghost-sm" data-push-act="enable">${pushBusy ? 'Enabling…' : '🔔 Enable Push'}</button>`
        }
        ${
          lanUrl && /^https?:\/\//i.test(lanUrl) && connMode !== 'local'
            ? `<a href="${esc(lanUrl)}" class="btn-ghost-sm" style="text-decoration:none;display:inline-flex;align-items:center">Open Wi-Fi Direct (${esc(lanUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''))})</a>`
            : ''
        }
      </div>
    `;
  }

  function renderPulseNotifBannerHtml() {
    if (
      !hasAnyPairingCredentials() &&
      connMode !== 'local' &&
      connMode !== 'edge' &&
      connMode !== 'cloud'
    ) {
      return renderQuickPairOnboardingCardHtml('pulse');
    }
    const nf = Object.assign({ ...DEFAULT_NOTIF }, prefs.notif || {});
    const perm = notifPerm();
    const active = Boolean(nf.enabled && pushSub && perm === 'granted');
    if (active || loadJson(STORAGE_KEYS.PUSH_HINT, 0)) return '';
    const ua = String((typeof navigator !== 'undefined' && navigator.userAgent) || '');
    const ios = /iPhone|iPad|iPod/.test(ua);
    if (!pushSupported() && !ios) return '';
    return `
      <div class="push-banner-card">
        <div class="push-banner-top">
          <span class="eyebrow">HOME SCREEN PUSH NOTIFICATIONS</span>
          <span class="pill-count amber">AI WORKBENCH</span>
        </div>
        <div class="meta-timestamp" style="color:var(--text-secondary);font-size:12.5px">
          Get native lock-screen alerts for 1-tap VS Code tool approvals, Antigravity &amp; Claude Code session turn completions, and quota threshold warnings.
        </div>
        <div class="push-banner-actions">
          <button type="button" class="btn-brass-sm" data-push-act="enable">
            ${pushBusy ? 'Enabling…' : '🔔 Enable Push Notifications'}
          </button>
          <button type="button" class="btn-ghost-sm" data-push-act="dismiss-hint">Not now</button>
        </div>
      </div>
    `;
  }

  function renderHourOptions(hoursMap, selectedVal) {
    return Object.entries(hoursMap)
      .map(
        ([k, lbl]) =>
          `<option value="${esc(k)}" ${String(k) === String(selectedVal) ? 'selected' : ''}>${esc(lbl)}</option>`
      )
      .join('');
  }

  function renderPushSettingsCardHtml() {
    const nf = Object.assign({ ...DEFAULT_NOTIF }, prefs.notif || {});
    const perm = notifPerm();
    const active = Boolean(nf.enabled && pushSub && perm === 'granted');
    const ua = String((typeof navigator !== 'undefined' && navigator.userAgent) || '');
    const iosNeedsInstall = /iPhone|iPad|iPod/.test(ua) && !isStandalone();
    const statusChip = active
      ? '<span class="pill-count emerald">🔔 Active on this device</span>'
      : perm === 'denied'
        ? '<span class="pill-count crimson">Blocked in browser settings</span>'
        : iosNeedsInstall
          ? '<span class="pill-count amber">Open from Home Screen</span>'
          : '<span class="pill-count steel">Off</span>';
    const amHours = {
      6: '06:00',
      7: '07:00',
      8: '08:30 / 08:00',
      9: '09:00',
      10: '10:00',
      11: '11:00',
      12: '12:00'
    };
    const pmHours = {
      18: '18:00',
      19: '19:00',
      20: '20:00',
      21: '21:30 / 21:00',
      22: '22:00'
    };
    const descText = iosNeedsInstall
      ? 'On iPhone, open THEO from your Home Screen icon to enable Web Push notifications.'
      : perm === 'denied'
        ? 'Notifications are blocked for this app. Open your phone Settings -> THEO -> Notifications and allow notifications.'
        : 'Works even when THEO is closed or your phone is locked. Encrypted RFC 8291 (aes128gcm) + VAPID ES256 alerts dispatch directly from VS Code & Power Automate Cloud Relay to Apple Push / FCM.';

    return `
      <div class="push-settings-card">
        <div class="section-head" style="margin-bottom:0">
          <div>
            <div class="eyebrow">WEB PUSH NOTIFICATIONS · AI WORKBENCH</div>
            <h2 class="section-title" style="font-size:17px;margin-top:2px">1-Tap Approvals, Session Completions &amp; Quota Alerts</h2>
            <div class="brass-rule-single"></div>
          </div>
          ${statusChip}
        </div>
        <div class="meta-timestamp" style="line-height:1.45">${esc(descText)}</div>
        <div class="push-pref-list">
          <div class="push-pref-row">
            <label class="push-pref-label">
              <input type="checkbox" data-nf="approvals" ${nf.approvals !== false ? 'checked' : ''}>
              <div class="push-pref-text">
                <strong>1-Tap tool approvals &amp; waiting-for-input alerts</strong>
                <span>Instant lock-screen ping when Antigravity or Claude Code pauses for permission or input</span>
              </div>
            </label>
          </div>
          <div class="push-pref-row">
            <label class="push-pref-label">
              <input type="checkbox" data-nf="completed" ${nf.completed !== false ? 'checked' : ''}>
              <div class="push-pref-text">
                <strong>Session turn &amp; background task completion alerts</strong>
                <span>Pings when a running cascade or Claude Code session finishes its turn while you are away</span>
              </div>
            </label>
          </div>
          <div class="push-pref-row">
            <label class="push-pref-label">
              <input type="checkbox" data-nf="quota" ${nf.quota !== false ? 'checked' : ''}>
              <div class="push-pref-text">
                <strong>Usage rate threshold (≥90%) &amp; stalled-task watchdog alerts</strong>
                <span>Alerts immediately when any Antigravity or Claude Code quota window reaches 90% or if a task stalls</span>
              </div>
            </label>
          </div>
          <div class="push-pref-row">
            <label class="push-pref-label">
              <input type="checkbox" data-nf="morning" ${nf.morning !== false ? 'checked' : ''}>
              <div class="push-pref-text">
                <strong>Morning AI Workbench Brief</strong>
                <span>Daily morning summary of pending VS Code approvals and active Antigravity &amp; Claude sessions</span>
              </div>
            </label>
            <select class="push-hour-select tabular" data-nf="morningHour" aria-label="Morning briefing time">
              ${renderHourOptions(amHours, nf.morningHour || 8)}
            </select>
          </div>
          <div class="push-pref-row">
            <label class="push-pref-label">
              <input type="checkbox" data-nf="evening" ${nf.evening !== false ? 'checked' : ''}>
              <div class="push-pref-text">
                <strong>Evening AI &amp; Git Repository Digest</strong>
                <span>Evening summary of daily token velocity and uncommitted BHFIRMS git repos</span>
              </div>
            </label>
            <select class="push-hour-select tabular" data-nf="eveningHour" aria-label="Evening digest time">
              ${renderHourOptions(pmHours, nf.eveningHour || 21)}
            </select>
          </div>
        </div>
        <div class="push-banner-actions" style="margin-top:2px">
          ${
            active
              ? `
                <button type="button" class="btn-brass-sm" data-push-act="test">🔔 Send Test Push</button>
                <button type="button" class="btn-ghost-sm" data-push-act="reset" aria-label="Unsubscribe and mint a brand-new APNs push token">${pushBusy ? 'Re-pairing…' : '🔄 Re-Pair Push'}</button>
                <button type="button" class="btn-ghost-sm" data-push-act="sync">↻ Refresh Schedule</button>
                <button type="button" class="btn-ghost-sm" data-push-act="disable">Turn Off</button>
              `
              : `
                <button type="button" class="btn-brass-sm" data-push-act="enable">${pushBusy ? 'Enabling…' : '🔔 Enable Push Notifications'}</button>
                ${perm === 'granted' ? `<button type="button" class="btn-ghost-sm" data-push-act="test">Send Test Push</button>` : ''}
              `
          }
        </div>
      </div>
    `;
  }

  // Navigation switching
  function switchTab(tabName) {
    if (tabName === 'discipline') {
      window.open('https://husseinbdeir.github.io/planner/', '_blank', 'noopener');
      return;
    }
    const valid = ['pulse', 'sessions', 'chat', 'workspaces', 'analytics'];
    const target = valid.includes(tabName) ? tabName : 'pulse';
    const prevTab = prefs.activeTab;
    prefs.activeTab = target;
    saveJson(STORAGE_KEYS.PREFS, prefs);
    if (prevTab && prevTab !== target) {
      pushUiHistoryState('');
    }

    $('view-container')?.classList.toggle('chat-active', target === 'chat');
    document.querySelectorAll('.view-pane').forEach((pane) => {
      pane.classList.toggle('active', pane.dataset.view === target);
    });
    document.querySelectorAll('.rail-nav .nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === target);
    });
    document.querySelectorAll('.mobile-bottom-dock .dock-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === target);
    });

    if (target === 'chat') {
      ensureSelectedThread();
      renderChatView(true);
      if (
        prefs.selectedThreadId &&
        prefs.selectedThreadId !== '__new__' &&
        !String(prefs.selectedThreadId).startsWith('draft-new-')
      ) {
        fetchThreadDetail(prefs.selectedThreadId, pinnedNavProvider || '');
      }
    } else if (target === 'workspaces') {
      renderWorkspacesView();
    } else if (target === 'analytics') {
      renderAnalyticsView();
    }
    renderIdeSidebar();
  }

  let pendingNewSessionBind = null;
  const closedEditorTabIds = new Set();

  function ensureEditorTabOpen(tid) {
    const clean = String(tid || '').trim();
    if (!clean || clean === '__new__') return;
    closedEditorTabIds.delete(clean);
    if (!Array.isArray(prefs.openEditorTabs)) prefs.openEditorTabs = [];
    if (!prefs.openEditorTabs.includes(clean)) {
      prefs.openEditorTabs.push(clean);
      if (prefs.openEditorTabs.length > 12) {
        const dropIdx = prefs.openEditorTabs.findIndex((id) => id !== clean && id !== prefs.selectedThreadId);
        if (dropIdx >= 0) prefs.openEditorTabs.splice(dropIdx, 1);
      }
      saveJson(STORAGE_KEYS.PREFS, prefs);
    }
  }

  function removeEditorTabIds(idsToRemove, advanceIfActive = true) {
    const rmSet = new Set(
      (Array.isArray(idsToRemove) ? idsToRemove : [idsToRemove])
        .map((x) => String(x || '').trim())
        .filter(Boolean)
    );
    if (!rmSet.size) return;
    for (const id of rmSet) closedEditorTabIds.add(id);
    if (prefs.lastReplyThreadId && rmSet.has(prefs.lastReplyThreadId)) {
      prefs.lastReplyThreadId = '';
    }
    const curList = Array.isArray(prefs.openEditorTabs) ? [...prefs.openEditorTabs] : [];
    const activeWasRemoved = Boolean(prefs.selectedThreadId && rmSet.has(prefs.selectedThreadId));
    const removedIdx = activeWasRemoved ? curList.indexOf(prefs.selectedThreadId) : -1;
    const nextList = curList.filter((id) => id && !rmSet.has(id));
    prefs.openEditorTabs = nextList;

    if (advanceIfActive && activeWasRemoved) {
      const nonArchived = (appState?.rows || []).filter(
        (r) => r && r.id && !r.draft && !r.archived && !rmSet.has(r.id) && !closedEditorTabIds.has(r.id)
      );
      const fallbackTabId =
        nextList.length > 0
          ? nextList[Math.max(0, Math.min(removedIdx, nextList.length - 1))]
          : nonArchived[0]?.id || '';
      if (fallbackTabId) {
        prefs.selectedThreadId = fallbackTabId;
        prefs.lastReplyThreadId = fallbackTabId;
        prefs.composerMode = 'reply';
        ensureEditorTabOpen(fallbackTabId);
        if (prefs.activeTab === 'chat') {
          fetchThreadDetail(fallbackTabId).catch(() => {});
        }
      } else {
        prefs.composerMode = hasSignedInProviderRemote('antigravity') ? 'new-antigravity' : 'new-claude';
        prefs.selectedThreadId = '__new__';
      }
    }
    saveJson(STORAGE_KEYS.PREFS, prefs);
  }

  function closeEditorTab(tid) {
    const clean = String(tid || '').trim();
    if (!clean) return;
    if (clean === '__new__') {
      exitNewSessionModeToReply('', { allowResurrectClosed: false });
      renderIdeSidebar();
      return;
    }
    removeEditorTabIds([clean], true);
    renderChatView(true);
    renderIdeSidebar();
  }

  function syncAndRenderEditorTabs() {
    const tabsEl = $('ide-editor-tabs');
    if (!tabsEl) return;
    const prevSerialized = JSON.stringify(prefs.openEditorTabs || []);
    const rows = (appState?.rows || []).filter((r) => r && r.id && !r.draft);
    const rowById = new Map(rows.map((r) => [r.id, r]));
    const isNewDraft = isNewSessionMode();

    let list = Array.isArray(prefs.openEditorTabs)
      ? Array.from(
          new Set(
            prefs.openEditorTabs
              .map((x) => (typeof x === 'string' || typeof x === 'number' ? String(x).trim() : ''))
              .filter((x) => x && x !== '__new__')
          )
        )
      : [];

    if (rows.length > 0) {
      list = list.filter((id) => {
        if (String(id).startsWith('draft-new-')) return Boolean(threadsCache[id]);
        const r = rowById.get(id);
        if (r) return !r.archived;
        return Boolean(id === prefs.selectedThreadId && threadsCache[id]);
      });
    }

    if (list.length === 0 && rows.length > 0) {
      const candidates = rows
        .filter((r) => !r.archived && !closedEditorTabIds.has(r.id) && (r.open || r.status === 'working' || r.status === 'waiting'))
        .slice(0, 6);
      const seedRows = candidates.length > 0
        ? candidates
        : rows.filter((r) => !r.archived && !closedEditorTabIds.has(r.id)).slice(0, 4);
      list = seedRows.map((r) => r.id);
    }

    const curTid = String(prefs.selectedThreadId || '').trim();
    if (!isNewDraft && curTid && curTid !== '__new__') {
      const curRow = rowById.get(curTid);
      if (!curRow?.archived && !list.includes(curTid)) {
        list.push(curTid);
      }
    }

    if (list.length > 12) {
      list = list.filter((id, idx) => idx >= list.length - 12 || id === curTid).slice(-12);
    }
    prefs.openEditorTabs = list;
    if (JSON.stringify(list) !== prevSerialized) {
      saveJson(STORAGE_KEYS.PREFS, prefs);
    }

    const tabsHtml = list
      .map((id) => {
        const r = rowById.get(id) || threadsCache[id] || { id, title: 'Session', provider: 'antigravity' };
        const provKey = r.provider === 'claude' ? 'claude' : 'antigravity';
        const isActive = !isNewDraft && id === curTid;
        const stCls =
          r.status === 'working' || liveStreamsByThreadId.get(id)?.status === 'working'
            ? 'working'
            : r.status === 'waiting'
              ? 'waiting'
              : r.unread
                ? 'unread'
                : '';
        const rawTitle = String(r.title || threadsCache[id]?.title || 'Untitled Session').trim();
        return `
          <div class="ide-editor-tab${isActive ? ' active' : ''}" role="tab" tabindex="0" aria-selected="${isActive}" data-editor-tab-id="${esc(id)}" data-session-prov="${provKey}">
            ${stCls ? `<span class="ide-dot ${stCls}"></span>` : ''}
            <span class="prov-glyph">${PROVIDER_ICONS[provKey]}</span>
            <span class="ide-tab-title">${esc(rawTitle)}</span>
            <button type="button" class="ide-tab-close" data-close-editor-tab="${esc(id)}" aria-label="Close ${esc(rawTitle)}">×</button>
          </div>
        `;
      })
      .join('');

    const newDraftProv = prefs.composerMode === 'new-claude' ? 'claude' : 'antigravity';
    const newDraftTabHtml = isNewDraft
      ? `
        <div class="ide-editor-tab active is-draft" role="tab" tabindex="0" aria-selected="true" data-editor-tab-id="__new__" data-session-prov="${newDraftProv}">
          <span class="prov-glyph">${PROVIDER_ICONS[newDraftProv]}</span>
          <span class="ide-tab-title">New ${newDraftProv === 'claude' ? 'Claude' : 'Antigravity'}</span>
          <button type="button" class="ide-tab-close" data-close-editor-tab="__new__" aria-label="Close new session draft">×</button>
        </div>
      `
      : '';

    tabsEl.innerHTML = tabsHtml + newDraftTabHtml;
  }

  function shortSidebarAge(ts) {
    const n = Number(ts || 0);
    if (!n) return '';
    const raw = String(timeAgo(n) || '').trim();
    if (!raw || raw === 'just now') return 'now';
    return raw.replace(/\s*ago$/i, '');
  }

  function renderIdeSidebar() {
    const accountsEl = $('ide-sidebar-accounts');
    const approvalsEl = $('ide-sidebar-approvals');
    const countEl = $('ide-sidebar-count');
    const treeEl = $('ide-sidebar-tree');
    if (!treeEl) return;

    // 1. Account & Usage compact VS Code Hub cards
    if (accountsEl) {
      const { ordered, sameProvCounts } = getOrderedPulseQuotaCards();
      const nowMs = Date.now();
      accountsEl.innerHTML = ordered
        .map(({ acct, provKey }) => {
          const acctId = acct?.id || `${provKey}:default`;
          const label = provKey === 'claude' ? 'Claude Code' : 'Antigravity';
          if (!isSignedInQuotaCard(acct)) {
            return `
              <div class="ide-acct-card is-offline">
                <div class="ide-acct-head">
                  <span class="ide-acct-left">
                    <span class="prov-glyph">${PROVIDER_ICONS[provKey]}</span>
                    <span class="ide-acct-name">${esc(label)}</span>
                  </span>
                  <button type="button" class="ide-acct-use-btn" data-account-add-remote="${provKey}">+ Sign in</button>
                </div>
              </div>
            `;
          }
          const isActive = acct?.active !== false;
          const multi = (sameProvCounts[provKey] || 1) > 1;
          const collapseKey = multi ? acctId : provKey;
          const isCollapsed = Boolean(
            prefs.collapsedQuotaCards &&
              (prefs.collapsedQuotaCards[collapseKey] ?? prefs.collapsedQuotaCards[acctId])
          );
          const email = String(acct?.account?.email || acct?.email || '').trim();
          const plan = String(acct?.account?.plan || acct?.plan || (provKey === 'claude' ? 'Max' : 'Pro'))
            .replace(/^Google AI\s+/i, '')
            .trim();
          const nick = String(acct?.nickname || acct?.account?.nickname || acct?.label || '').trim();
          const badgeTxt = nick || (multi ? (isActive ? 'Primary' : 'Secondary') : '');
          let limits = acct?.usage?.limits?.length ? acct.usage.limits : acct?.usage?.allLimits || [];
          if (!limits.length && provKey === 'claude' && isActive) {
            const claudeSum = appState?.summaryByProvider?.claude || appState?.summary || {};
            const tok5h = Number(claudeSum.today?.tokens || 0);
            const tok7d = Number(claudeSum.week?.tokens || 0);
            limits = [
              { label: 'Session (5hr)', pct: Math.min(95, Math.max(4, Math.round((tok5h / 250000000) * 100))), resetText: `${fmtCompact(tok5h)}` },
              { label: 'Weekly (7 day)', pct: Math.min(95, Math.max(8, Math.round((tok7d / 1800000000) * 100))), resetText: `${fmtCompact(tok7d)}` }
            ];
          }
          const barsHtml = limits
            .slice(0, 2)
            .map((l) => {
              const passed = Boolean(l.expired || (l.reset && l.reset <= nowMs));
              const rawPct = l.pct !== undefined ? l.pct : l.usedPercent;
              const pct = passed ? 0 : Math.min(100, Math.max(0, Math.round(Number(rawPct || 0))));
              const barCls = pct >= 90 ? 'crit' : pct >= 78 ? 'warn' : provKey === 'claude' ? 'claude' : '';
              const rst = passed
                ? 'Idle'
                : String(l.resetText || (l.reset ? `Resets ${timeUntil(l.reset)}` : '')).slice(0, 26);
              return `
                <div class="ide-qrow tabular">
                  <div class="ide-qlabels">
                    <span class="ide-qlbl">${esc(String(l.label || '').replace(/\s*Ledger$/i, ''))}</span>
                    <span class="ide-qmeta">${rst ? `<span class="ide-qrst">${esc(rst)}</span>` : ''}<strong>${pct}%</strong></span>
                  </div>
                  <div class="ide-qtrack"><div class="ide-qfill ${barCls}" style="width:${pct}%"></div></div>
                </div>
              `;
            })
            .join('');

          return `
            <div class="ide-acct-card${isActive ? ' is-active' : ''}${isCollapsed ? ' collapsed' : ''}">
              <div class="ide-acct-head">
                <button type="button" class="ide-acct-toggle" data-quota-collapse="${esc(collapseKey)}" aria-expanded="${!isCollapsed}">
                  <span class="ide-chevron-sm">${isCollapsed ? '▸' : '▾'}</span>
                  <span class="prov-glyph">${PROVIDER_ICONS[provKey]}</span>
                  <span class="ide-acct-name">${esc(label)}</span>
                  ${badgeTxt ? `<span class="ide-acct-role${isActive ? ' primary' : ''}">${esc(badgeTxt)}</span>` : ''}
                </button>
                <div class="ide-acct-actions">
                  ${
                    !isActive
                      ? `<button type="button" class="ide-acct-use-btn" data-account-switch="${esc(acctId)}" data-account-prov="${provKey}">⇄ Use</button>`
                      : `<span class="ide-acct-live-pill">● Active</span>`
                  }
                </div>
              </div>
              ${
                isCollapsed
                  ? ''
                  : `<div class="ide-acct-sub">${email ? `<span>${esc(email)}</span>` : '<span></span>'}<span class="ide-plan-tag">${esc(plan)}</span></div>${barsHtml ? `<div class="ide-qstack">${barsHtml}</div>` : ''}`
              }
            </div>
          `;
        })
        .join('');
    }

    // 2. Live Approvals Banner in Sidebar
    const devFilter =
      prefs.selectedDeviceFilter && prefs.selectedDeviceFilter !== 'all'
        ? prefs.selectedDeviceFilter
        : '';
    if (approvalsEl) {
      const approvals = (Array.isArray(appState?.approvals) ? appState.approvals : []).filter((a) => {
        if (!a) return false;
        if (!devFilter) return true;
        if (a.deviceId) return a.deviceId === devFilter;
        const linkedRow = (appState?.rows || []).find((r) => r && r.id === a.sessionId);
        return !linkedRow?.deviceId || linkedRow.deviceId === devFilter;
      });
      if (approvals.length === 0) {
        approvalsEl.hidden = true;
        approvalsEl.innerHTML = '';
      } else {
        approvalsEl.hidden = false;
        approvalsEl.innerHTML = `
          <div class="ide-appr-head tabular">
            <span>⚡ ${approvals.length} Waiting for Input</span>
          </div>
          ${approvals
            .slice(0, 3)
            .map((a) => {
              const aProv = a.provider === 'claude' ? 'claude' : 'antigravity';
              const isQ = a.kind === 'question' || a.kind === 'waiting_session' || /question/i.test(String(a.toolName || ''));
              return `
                <div class="ide-appr-item">
                  <button type="button" class="ide-appr-open" data-ide-open-session="${esc(a.sessionId || '')}" data-session-prov="${aProv}">
                    <span class="ide-dot waiting"></span>
                    <span class="ide-appr-title">${esc(a.title || a.toolName || 'Pending Action')}</span>
                  </button>
                  ${
                    !isQ && a.approvalId
                      ? `<button type="button" class="ide-appr-ok" data-approve-act="approve" data-app-id="${esc(a.approvalId)}" data-sess-id="${esc(a.sessionId || '')}" data-prov="${aProv}" data-sel="${esc(a.selector || '')}" data-lbl="${esc(a.toolName || 'Accept')}">Approve</button>`
                      : `<button type="button" class="ide-appr-ok" data-ide-open-session="${esc(a.sessionId || '')}" data-session-prov="${aProv}">Reply</button>`
                  }
                </div>
              `;
            })
            .join('')}
        `;
      }
    }

    // 3. Session Manager Tree
    const allRows = (appState?.rows || []).filter(
      (r) => r && r.id && !r.archived && (!devFilter || !r.deviceId || r.deviceId === devFilter)
    );
    if (countEl) countEl.textContent = String(allRows.length);

    document.querySelectorAll('#ide-sidebar-filters .ide-fchip').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.sideFilter === prefs.sidebarFilter);
    });

    const groups = Array.isArray(appState?.groups) ? appState.groups : [];
    const groupIds = new Set(groups.map((g) => g.id));
    const q = ($('ide-sidebar-search')?.value || '').trim().toLowerCase();

    const rawFiltered = allRows.filter((r) => {
      if (prefs.sidebarFilter === 'working' && r.status !== 'working') return false;
      if (prefs.sidebarFilter === 'needs_input' && r.status !== 'waiting') return false;
      if (prefs.sidebarFilter === 'unread' && !r.unread) return false;
      if (prefs.sidebarFilter === 'open' && !r.open && !(Array.isArray(prefs.openEditorTabs) && prefs.openEditorTabs.includes(r.id))) return false;
      if (q) {
        const grpName = r.group ? groups.find((g) => g.id === r.group)?.name || '' : '';
        const hay = `${r.title || ''} ${r.folder || ''} ${r.branch || ''} ${r.model || ''} ${r.provider || ''} ${grpName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // Hard Rule #11: Frequency-First ordering across both searched & default views (exact.concat(freqOrdered))
    const nowRankMs = Date.now();
    const rowBaseWeight = (r) =>
      (r.status === 'working' ? 500 : r.status === 'waiting' ? 400 : 0) +
      Math.max(0, 299 - Math.min(299, Math.floor(Math.max(0, nowRankMs - Number(r.at || 0)) / 3600000)));
    const filtered = q
      ? (() => {
          const exact = rawFiltered.filter((r) => String(r.title || '').toLowerCase() === q);
          const rest = rawFiltered.filter((r) => String(r.title || '').toLowerCase() !== q);
          return exact.concat(rankByFreq(rest, 'threads', (r) => r.id, rowBaseWeight));
        })()
      : rankByFreq(rawFiltered, 'threads', (r) => r.id, rowBaseWeight);

    const curSelected = isNewSessionMode() ? '' : String(prefs.selectedThreadId || '');

    const renderTreeRow = (r) => {
      const provKey = r.provider === 'claude' ? 'claude' : 'antigravity';
      const isSelected = r.id === curSelected;
      const dotCls =
        r.status === 'working' || r.dot === 'running'
          ? 'working'
          : r.status === 'waiting'
            ? 'waiting'
            : r.unread
              ? 'unread'
              : r.open
                ? 'open'
                : 'idle';
      const age = shortSidebarAge(r.at);
      return `
        <div class="ide-tree-row${isSelected ? ' active' : ''}${r.unread ? ' is-unread' : ''}" role="button" tabindex="0" data-ide-open-session="${esc(r.id)}" data-session-prov="${provKey}">
          <span class="ide-dot ${dotCls}"></span>
          <span class="prov-glyph">${PROVIDER_ICONS[provKey]}</span>
          <span class="ide-tree-title">${esc(r.title || 'Untitled Session')}</span>
          <span class="ide-tree-age tabular">${esc(age)}</span>
          <span class="ide-tree-acts">
            ${
              dotCls === 'working'
                ? `<button type="button" class="ide-row-act stop" data-sess-act="stop" data-id="${esc(r.id)}" aria-label="Stop session">■</button>`
                : ''
            }
            <button type="button" class="ide-row-act" data-sess-act="archive" data-id="${esc(r.id)}" data-val="true" aria-label="Archive session">✕</button>
          </span>
        </div>
      `;
    };

    if (filtered.length === 0) {
      treeEl.innerHTML = `<div class="ide-tree-empty">${allRows.length === 0 ? 'No sessions synced yet.' : 'No matching sessions.'}</div>`;
      return;
    }

    if (!q && groups.length > 0) {
      let html = '';
      for (const g of groups) {
        const gItems = filtered.filter((r) => r.group === g.id);
        if (prefs.sidebarFilter !== 'all' && gItems.length === 0) continue;
        const collapsed =
          prefs.sidebarFilter !== 'all'
            ? false
            : isSessionGroupCollapsed(g.id, gItems.length === 0 ? true : Boolean(g.collapsed));
        html += `
          <div class="ide-tree-group${collapsed ? ' collapsed' : ''}">
            <div class="ide-tree-group-hdr">
              <button type="button" class="ide-tree-group-btn" data-group-act="toggle" data-group-id="${esc(g.id)}" aria-expanded="${!collapsed}">
                <span class="ide-chevron-sm">${collapsed ? '▸' : '▾'}</span>
                <span class="ide-tree-group-name">${esc(g.name || 'Group')}</span>
              </button>
              <span class="ide-group-pill tabular">${gItems.length}</span>
            </div>
            ${collapsed ? '' : `<div class="ide-tree-group-items">${gItems.map(renderTreeRow).join('')}</div>`}
          </div>
        `;
      }
      const ungrouped = filtered.filter((r) => !r.group || !groupIds.has(r.group));
      if (ungrouped.length > 0) {
        const ugCollapsed = prefs.sidebarFilter !== 'all' ? false : isSessionGroupCollapsed('ungrouped', false);
        html += `
          <div class="ide-tree-group${ugCollapsed ? ' collapsed' : ''}">
            <div class="ide-tree-group-hdr">
              <button type="button" class="ide-tree-group-btn" data-group-act="toggle" data-group-id="ungrouped" aria-expanded="${!ugCollapsed}">
                <span class="ide-chevron-sm">${ugCollapsed ? '▸' : '▾'}</span>
                <span class="ide-tree-group-name">Ungrouped</span>
              </button>
              <span class="ide-group-pill tabular">${ungrouped.length}</span>
            </div>
            ${ugCollapsed ? '' : `<div class="ide-tree-group-items">${ungrouped.map(renderTreeRow).join('')}</div>`}
          </div>
        `;
      }
      treeEl.innerHTML = html;
      return;
    }

    treeEl.innerHTML = `<div class="ide-tree-group-items">${filtered.slice(0, 120).map(renderTreeRow).join('')}</div>`;
  }

  function isNewSessionMode() {
    return Boolean(
      prefs.selectedThreadId === '__new__' ||
        prefs.composerMode === 'new-antigravity' ||
        prefs.composerMode === 'new-claude'
    );
  }

  function enterNewSessionMode(provider = 'antigravity', opts = {}) {
    clearPinnedNav();
    recentResumeUntil = 0;
    if ('caches' in window) {
      caches
        .open(NAV_HANDOFF_CACHE)
        .then((c) => c.delete(LAST_PUSH_NAV_CACHE_URL))
        .catch(() => {});
    }
    const prov = provider === 'claude' ? 'claude' : 'antigravity';
    if (
      prefs.selectedThreadId &&
      prefs.selectedThreadId !== '__new__' &&
      !String(prefs.selectedThreadId).startsWith('draft-new-')
    ) {
      prefs.lastReplyThreadId = prefs.selectedThreadId;
    }
    prefs.composerMode = prov === 'claude' ? 'new-claude' : 'new-antigravity';
    prefs.selectedThreadId = '__new__';
    prefs.newSessionGroupId = opts.groupId || '';
    if (opts.repoPrefix !== undefined) {
      prefs.composerRepoPrefix = opts.repoPrefix;
    }
    saveJson(STORAGE_KEYS.PREFS, prefs);
    switchTab('chat');
    updateComposerModePills();
    renderChatView(true);
    setTimeout(() => $('composer-input')?.focus(), 30);
  }

  function exitNewSessionModeToReply(explicitThreadId = '', opts = {}) {
    const allowResurrectClosed = opts.allowResurrectClosed !== false;
    const rows = (appState?.rows || []).filter((r) => r && r.id && !r.draft && !r.archived);
    const isUsableReplyTarget = (id, respectClosed = true) => {
      const clean = String(id || '').trim();
      if (!clean || clean === '__new__') return false;
      if (respectClosed && closedEditorTabIds.has(clean)) return false;
      if (rows.some((x) => x.id === clean)) return true;
      return Boolean(
        threadsCache[clean] &&
          !(appState?.rows || []).some((x) => x && x.id === clean && x.archived)
      );
    };
    const openTabsRev = Array.isArray(prefs.openEditorTabs) ? [...prefs.openEditorTabs].reverse() : [];
    const candidateId =
      (explicitThreadId && isUsableReplyTarget(explicitThreadId, false) ? explicitThreadId : '') ||
      (isUsableReplyTarget(prefs.lastReplyThreadId, true) ? prefs.lastReplyThreadId : '') ||
      openTabsRev.find((id) => isUsableReplyTarget(id, true)) ||
      (
        rows.find((r) => !closedEditorTabIds.has(r.id) && r.active) ||
        rows.find((r) => !closedEditorTabIds.has(r.id) && r.open) ||
        rows.find((r) => !closedEditorTabIds.has(r.id))
      )?.id ||
      (allowResurrectClosed ? rows[0]?.id || '' : '');

    if (!candidateId) {
      prefs.composerMode = hasSignedInProviderRemote('antigravity') ? 'new-antigravity' : 'new-claude';
      prefs.selectedThreadId = '__new__';
      saveJson(STORAGE_KEYS.PREFS, prefs);
      updateComposerModePills();
      renderChatView(true);
      return;
    }

    ensureEditorTabOpen(candidateId);
    prefs.composerMode = 'reply';
    prefs.selectedThreadId = candidateId;
    prefs.lastReplyThreadId = candidateId;
    prefs.newSessionGroupId = '';
    saveJson(STORAGE_KEYS.PREFS, prefs);
    updateComposerModePills();
    renderChatView(true);
    fetchThreadDetail(candidateId);
  }

  function bindDraftThreadToRealSession(draftId, realId, provider = 'antigravity') {
    const cleanReal = String(realId || '').trim();
    if (!cleanReal) return false;
    const draftThread = draftId ? threadsCache[draftId] : null;
    if (draftThread && Array.isArray(draftThread.messages)) {
      if (!threadsCache[cleanReal]) {
        threadsCache[cleanReal] = {
          id: cleanReal,
          provider,
          title: draftThread.title || 'New Session',
          messages: []
        };
      }
      const existingMsgs = Array.isArray(threadsCache[cleanReal].messages)
        ? threadsCache[cleanReal].messages
        : [];
      for (const m of draftThread.messages) {
        if (
          m &&
          !existingMsgs.some(
            (em) => em.role === m.role && String(em.text || '').trim() === String(m.text || '').trim()
          )
        ) {
          existingMsgs.push(m);
        }
      }
      threadsCache[cleanReal].messages = existingMsgs;
    }
    if (draftId && draftId !== cleanReal) {
      const draftLive = liveStreamsByThreadId.get(draftId);
      if (draftLive && !liveStreamsByThreadId.has(cleanReal)) {
        liveStreamsByThreadId.set(cleanReal, draftLive);
      }
      liveStreamsByThreadId.delete(draftId);
      if (chatOpenDetailsByThread.has(draftId)) {
        if (!chatOpenDetailsByThread.has(cleanReal)) {
          chatOpenDetailsByThread.set(cleanReal, chatOpenDetailsByThread.get(draftId));
        }
        chatOpenDetailsByThread.delete(draftId);
      }
      delete threadsCache[draftId];
      if (Array.isArray(prefs.openEditorTabs)) {
        const idx = prefs.openEditorTabs.indexOf(draftId);
        if (idx >= 0) {
          prefs.openEditorTabs[idx] = cleanReal;
          prefs.openEditorTabs = Array.from(new Set(prefs.openEditorTabs));
        }
      }
    }
    ensureEditorTabOpen(cleanReal);
    if (
      !prefs.selectedThreadId ||
      prefs.selectedThreadId === draftId ||
      prefs.selectedThreadId === '__new__'
    ) {
      prefs.selectedThreadId = cleanReal;
      prefs.lastReplyThreadId = cleanReal;
      prefs.composerMode = 'reply';
      saveJson(STORAGE_KEYS.PREFS, prefs);
      setPinnedNav({
        threadId: cleanReal,
        provider,
        title: draftThread?.title || '',
        durationMs: 60000
      });
    }
    if (pendingNewSessionBind && (!draftId || pendingNewSessionBind.draftThreadId === draftId)) {
      pendingNewSessionBind = null;
    }
    persistCache();
    renderAll();
    fetchThreadDetail(cleanReal, provider).catch(() => {});
    return true;
  }

  function reconcilePendingNewSessionBind(stateObj, queueObj = null) {
    if (!pendingNewSessionBind) return;
    if (Date.now() - pendingNewSessionBind.createdAt > 90000) {
      pendingNewSessionBind = null;
      return;
    }
    const wantProv = pendingNewSessionBind.provider || 'antigravity';
    const rows = Array.isArray(stateObj?.rows) ? stateObj.rows : [];

    // 1. Authoritative bind from Cloud Relay command execution result
    if (queueObj && queueObj.results && typeof queueObj.results === 'object') {
      const cmdId = pendingNewSessionBind.cmdId || '';
      const resEntry = cmdId ? queueObj.results[cmdId] : null;
      const resolvedId = cleanTargetThreadId(
        resEntry?.id ||
          resEntry?.result?.id ||
          resEntry?.result?.sessionId ||
          resEntry?.result?.opened?.id ||
          ''
      );
      if (resolvedId) {
        const matchedRow = rows.find((r) => r && r.id === resolvedId);
        if (matchedRow && pendingNewSessionBind.groupId) {
          matchedRow.group = pendingNewSessionBind.groupId;
          noteRowOverride(matchedRow.id, { group: pendingNewSessionBind.groupId });
        }
        bindDraftThreadToRealSession(
          pendingNewSessionBind.draftThreadId,
          resolvedId,
          wantProv
        );
        return;
      }
    }

    // 2. Fallback: match a genuinely brand-new row whose timestamp is recent (never bind to older sessions missing from a stale cache)
    const known = pendingNewSessionBind.knownIds || new Set();
    const wantDev = pendingNewSessionBind.targetDeviceId || '';
    const minRowAt = (pendingNewSessionBind.createdAt || Date.now()) - 15000;
    const freshRow = rows.find(
      (r) =>
        r &&
        r.id &&
        !r.draft &&
        (r.provider === 'claude' ? 'claude' : 'antigravity') === wantProv &&
        (!wantDev || !r.deviceId || r.deviceId === wantDev) &&
        !known.has(r.id) &&
        Number(r.at || 0) >= minRowAt
    );
    if (freshRow) {
      if (pendingNewSessionBind.groupId) {
        freshRow.group = pendingNewSessionBind.groupId;
        noteRowOverride(freshRow.id, { group: pendingNewSessionBind.groupId });
      }
      bindDraftThreadToRealSession(
        pendingNewSessionBind.draftThreadId,
        freshRow.id,
        wantProv
      );
    }
  }

  function ensureSelectedThread() {
    if (isNewSessionMode()) {
      if (prefs.selectedThreadId !== '__new__') {
        prefs.selectedThreadId = '__new__';
      }
      return;
    }
    if (String(prefs.selectedThreadId || '').startsWith('draft-new-')) {
      return;
    }
    const rows = (appState?.rows || []).filter((r) => r.id && !r.draft && !r.archived);
    const curRowObj = (appState?.rows || []).find((r) => r && r.id === prefs.selectedThreadId);
    if (curRowObj?.archived) {
      prefs.selectedThreadId = '';
    }
    const hasPinned =
      Boolean(pinnedNavThreadId) &&
      prefs.selectedThreadId === pinnedNavThreadId &&
      Date.now() < pinnedNavUntil &&
      !curRowObj?.archived;
    const hasCachedThread = Boolean(
      prefs.selectedThreadId && threadsCache[prefs.selectedThreadId] && !curRowObj?.archived
    );
    if (hasPinned || hasCachedThread) {
      return;
    }
    if (!prefs.selectedThreadId || (rows.length > 0 && !rows.some((r) => r.id === prefs.selectedThreadId))) {
      const openOrRecent = rows.find((r) => r.active) || rows.find((r) => r.open) || rows[0];
      if (openOrRecent) {
        prefs.selectedThreadId = openOrRecent.id;
        saveJson(STORAGE_KEYS.PREFS, prefs);
      }
    }
  }

  // ---------- Interactive Question & Recommendation Cards (VS Code Parity) ----------
  const questionDrafts = new Map();
  const renderedQuestionsByCardKey = new Map();
  const pendingAnsweredSessions = new Map();
  let answeredQuestionsLedger = loadJson(STORAGE_KEYS.ANSWERED_QUESTIONS, {});
  if (!answeredQuestionsLedger || typeof answeredQuestionsLedger !== 'object') {
    answeredQuestionsLedger = {};
  }
  for (const [k, v] of Object.entries(answeredQuestionsLedger)) {
    if (k.startsWith('sess:') && v && Date.now() - Number(v.at || 0) < 240000) {
      const sid = k.slice(5);
      if (sid) pendingAnsweredSessions.set(sid, v);
    }
  }

  function buildQuestionPromptSignature(questions = []) {
    if (!Array.isArray(questions) || questions.length === 0) return '';
    return questions
      .map((q) => String(q?.question || q?.prompt || '').trim().toLowerCase())
      .filter(Boolean)
      .join('||')
      .slice(0, 320);
  }

  function extractQuestionsStepIndex(questions = [], fallbackStep = null) {
    if (Array.isArray(questions)) {
      for (const q of questions) {
        if (q && q.stepIndex !== undefined && q.stepIndex !== null && Number.isFinite(Number(q.stepIndex))) {
          return Number(q.stepIndex);
        }
      }
    }
    if (fallbackStep !== undefined && fallbackStep !== null && Number.isFinite(Number(fallbackStep))) {
      return Number(fallbackStep);
    }
    return null;
  }

  function recordQuestionAnswered({
    sessionId = '',
    approvalId = '',
    turnId = '',
    stepIndex = null,
    questions = [],
    summary = '',
    skipped = false
  } = {}) {
    const cleanSess = String(sessionId || '').trim();
    if (!cleanSess) return;
    const cleanApp = String(approvalId || '').trim();
    const cleanTurn = String(turnId || '').trim();
    const resolvedStep = extractQuestionsStepIndex(questions, stepIndex);
    const sig = buildQuestionPromptSignature(questions);
    const now = Date.now();
    const entry = {
      summary: String(summary || '').trim(),
      skipped: Boolean(skipped),
      stepIndex: resolvedStep,
      at: now
    };

    if (cleanTurn) {
      answeredQuestionsLedger[`turn:${cleanSess}:${cleanTurn}`] = entry;
    }
    if (cleanApp && cleanApp !== cleanSess) {
      answeredQuestionsLedger[`approval:${cleanSess}:${cleanApp}`] = entry;
    }
    if (resolvedStep !== null && resolvedStep >= 0) {
      answeredQuestionsLedger[`step:${cleanSess}:${resolvedStep}`] = entry;
    }
    if (sig) {
      answeredQuestionsLedger[`sig:${cleanSess}:${sig}`] = entry;
    }
    const sessOverrideEntry = {
      approvalId: cleanApp,
      stepIndex: resolvedStep ?? 0,
      sig,
      summary: entry.summary,
      skipped: entry.skipped,
      at: now
    };
    answeredQuestionsLedger[`sess:${cleanSess}`] = sessOverrideEntry;

    const keys = Object.keys(answeredQuestionsLedger);
    if (keys.length > 260) {
      keys
        .sort((a, b) => Number(answeredQuestionsLedger[a]?.at || 0) - Number(answeredQuestionsLedger[b]?.at || 0))
        .slice(0, keys.length - 220)
        .forEach((k) => delete answeredQuestionsLedger[k]);
    }
    saveJson(STORAGE_KEYS.ANSWERED_QUESTIONS, answeredQuestionsLedger);

    pendingAnsweredSessions.set(cleanSess, sessOverrideEntry);

    // Also mark any matching in-memory questionDrafts entries for this session so Pulse & Workbench stay in sync
    for (const [k, meta] of renderedQuestionsByCardKey.entries()) {
      if (meta && meta.sessionId === cleanSess) {
        const metaSig = buildQuestionPromptSignature(meta.questions);
        if (!sig || !metaSig || metaSig === sig || (cleanApp && meta.approvalId === cleanApp)) {
          const d = getQuestionDraft(k);
          d.submitted = true;
          d.submittedSkipped = Boolean(skipped);
          d.submittedSummary = entry.summary;
        }
      }
    }
  }

  function lookupAnsweredQuestionState({
    sessionId = '',
    approvalId = '',
    turnId = '',
    questions = [],
    isLastTurn = true
  } = {}) {
    const qs = Array.isArray(questions) ? questions : [];
    if (qs.length > 0 && qs.some((q) => Boolean(q?.answered))) {
      const allSkipped = qs.every((q) => Boolean(q?.skipped));
      const srvSummary = qs.map((q) => String(q?.answerSummary || '').trim()).find(Boolean) || '';
      return {
        answered: true,
        skipped: allSkipped,
        summary: srvSummary
      };
    }

    if (!isLastTurn) {
      return {
        answered: true,
        skipped: false,
        summary: ''
      };
    }

    const cleanSess = String(sessionId || '').trim();
    if (!cleanSess) return null;
    const cleanTurn = String(turnId || '').trim();
    const cleanApp = String(approvalId || '').trim();
    const qStep = extractQuestionsStepIndex(qs, null);
    const sig = buildQuestionPromptSignature(qs);

    if (cleanTurn && answeredQuestionsLedger[`turn:${cleanSess}:${cleanTurn}`]) {
      return { answered: true, ...answeredQuestionsLedger[`turn:${cleanSess}:${cleanTurn}`] };
    }
    if (cleanApp && cleanApp !== cleanSess && answeredQuestionsLedger[`approval:${cleanSess}:${cleanApp}`]) {
      return { answered: true, ...answeredQuestionsLedger[`approval:${cleanSess}:${cleanApp}`] };
    }
    if (qStep !== null && qStep >= 0 && answeredQuestionsLedger[`step:${cleanSess}:${qStep}`]) {
      return { answered: true, ...answeredQuestionsLedger[`step:${cleanSess}:${qStep}`] };
    }
    if (sig && answeredQuestionsLedger[`sig:${cleanSess}:${sig}`]) {
      const sigEntry = answeredQuestionsLedger[`sig:${cleanSess}:${sig}`];
      const stepAllowsMatch =
        qStep === null ||
        sigEntry.stepIndex === null ||
        sigEntry.stepIndex === undefined ||
        Number(sigEntry.stepIndex) >= qStep;
      if (stepAllowsMatch && Date.now() - Number(sigEntry.at || 0) < 24 * 3600 * 1000) {
        return { answered: true, ...sigEntry };
      }
    }
    return null;
  }

  function applyAnsweredQuestionOverrides(stateObj) {
    if (!stateObj || typeof stateObj !== 'object') return;
    const now = Date.now();
    if (pendingAnsweredSessions.size === 0) return;
    const rows = Array.isArray(stateObj.rows) ? stateObj.rows : [];

    for (const [sessId, rec] of Array.from(pendingAnsweredSessions.entries())) {
      if (!rec || now - Number(rec.at || 0) > 240000) {
        pendingAnsweredSessions.delete(sessId);
        continue;
      }
      let strippedAny = false;
      if (Array.isArray(stateObj.approvals) && stateObj.approvals.length > 0) {
        const beforeLen = stateObj.approvals.length;
        stateObj.approvals = stateObj.approvals.filter((a) => {
          if (!a || a.sessionId !== sessId) return true;
          if (rec.approvalId && (a.approvalId === rec.approvalId || a.id === rec.approvalId)) {
            return false;
          }
          const aStep = Number(a.stepIndex || 0);
          const recStep = Number(rec.stepIndex || 0);
          if (recStep > 0 && aStep > recStep) {
            return true;
          }
          const aSig = buildQuestionPromptSignature(a.questions || []);
          if (rec.sig && aSig && aSig !== rec.sig && aStep > recStep) {
            return true;
          }
          return false;
        });
        if (stateObj.approvals.length !== beforeLen) strippedAny = true;
      }

      const row = rows.find((r) => r && r.id === sessId);
      if (row && row.pendingQuestion) {
        const pqStep = Number(row.pendingQuestion.stepIndex || 0);
        const recStep = Number(rec.stepIndex || 0);
        if (!recStep || !pqStep || pqStep <= recStep) {
          row.pendingQuestion = null;
          if (row.status === 'waiting' && now - Number(rec.at || 0) < 90000) {
            row.status = 'working';
            row.statusLabel = 'Running';
            row.dot = 'running';
          }
          strippedAny = true;
        }
      }

      if (!strippedAny && now - Number(rec.at || 0) > 12000) {
        pendingAnsweredSessions.delete(sessId);
      }
    }
  }

  function getQuestionDraft(cardKey) {
    let draft = questionDrafts.get(cardKey);
    if (!draft) {
      draft = {
        selectedByQ: {},
        writeInByQ: {},
        submitted: false,
        submittedSummary: ''
      };
      questionDrafts.set(cardKey, draft);
    }
    return draft;
  }

  function parseOptionRecommendation(rawText) {
    const fullText = String(rawText || '').trim();
    if (!fullText) {
      return { isRecommended: false, cleanText: '', fullText: '' };
    }
    const prefixRe = /^\(\s*Recommended\s*\)\s*/i;
    const suffixRe = /\s*\(\s*Recommended\s*\)\s*$/i;
    if (prefixRe.test(fullText)) {
      return {
        isRecommended: true,
        cleanText: fullText.replace(prefixRe, '').trim() || fullText,
        fullText
      };
    }
    if (suffixRe.test(fullText)) {
      return {
        isRecommended: true,
        cleanText: fullText.replace(suffixRe, '').trim() || fullText,
        fullText
      };
    }
    return { isRecommended: false, cleanText: fullText, fullText };
  }

  function inferMultiSelectFromQuestion(questionText, optionsCount = 0) {
    const q = String(questionText || '').toLowerCase();
    if (
      /which .* changes|which .* options|which .* items|select all|choose any|which of the following|apply right now/i.test(
        q
      ) &&
      optionsCount >= 2
    ) {
      return true;
    }
    return false;
  }

  function normalizeFrontendQuestions(
    rawQuestions,
    fallbackPrompt = '',
    fallbackOptions = [],
    fallbackMulti = undefined
  ) {
    const out = [];
    if (Array.isArray(rawQuestions) && rawQuestions.length > 0) {
      for (let i = 0; i < rawQuestions.length; i++) {
        const q = rawQuestions[i];
        if (!q || typeof q !== 'object') continue;
        const prompt = String(q.question || q.prompt || q.text || fallbackPrompt || '').trim();
        const rawOpts = Array.isArray(q.options) ? q.options : [];
        const options = rawOpts
          .map((opt, idx) => {
            const rawLabel =
              typeof opt === 'string'
                ? opt
                : String(opt?.text || opt?.label || opt?.title || opt?.value || '').trim();
            if (!rawLabel) return null;
            const parsed = parseOptionRecommendation(rawLabel);
            return {
              id: String(opt?.id || idx + 1),
              text: parsed.fullText,
              cleanText: parsed.cleanText,
              isRecommended: Boolean(opt?.isRecommended || parsed.isRecommended),
              description: typeof opt === 'object' && opt?.description ? String(opt.description).trim() : ''
            };
          })
          .filter(Boolean);
        if (!prompt && options.length === 0) continue;
        const explicitMulti =
          typeof q.isMultiSelect === 'boolean'
            ? q.isMultiSelect
            : typeof q.multiSelect === 'boolean'
              ? q.multiSelect
              : typeof fallbackMulti === 'boolean'
                ? fallbackMulti
                : inferMultiSelectFromQuestion(prompt, options.length);
        out.push({
          question: prompt || 'Select an option',
          header: String(q.header || '').trim(),
          codePreview: String(q.codePreview || '').trim(),
          description: String(q.description || '').trim(),
          isToolPermission: Boolean(q.isToolPermission),
          writeInPlaceholder: String(q.writeInPlaceholder || '').trim(),
          isMultiSelect: Boolean(explicitMulti),
          stepIndex:
            q.stepIndex !== undefined && q.stepIndex !== null && Number.isFinite(Number(q.stepIndex))
              ? Number(q.stepIndex)
              : null,
          toolUseId: String(q.toolUseId || '').trim(),
          answered: Boolean(q.answered),
          skipped: Boolean(q.skipped),
          answerSummary: String(q.answerSummary || '').trim(),
          options
        });
      }
    }
    if (out.length === 0 && Array.isArray(fallbackOptions) && fallbackOptions.length > 0) {
      const prompt = String(fallbackPrompt || 'Select an option').trim();
      const options = fallbackOptions
        .map((opt, idx) => {
          const rawLabel = typeof opt === 'string' ? opt : String(opt?.text || opt?.label || '').trim();
          if (!rawLabel) return null;
          const parsed = parseOptionRecommendation(rawLabel);
          return {
            id: String(idx + 1),
            text: parsed.fullText,
            cleanText: parsed.cleanText,
            isRecommended: parsed.isRecommended,
            description: ''
          };
        })
        .filter(Boolean);
      if (options.length > 0) {
        out.push({
          question: prompt,
          header: '',
          isMultiSelect:
            typeof fallbackMulti === 'boolean'
              ? fallbackMulti
              : inferMultiSelectFromQuestion(prompt, options.length),
          options
        });
      }
    }
    return out;
  }

  function extractStructuredQuestionsFromText(rawText) {
    const src = String(rawText || '');
    if (!src.trim()) {
      return { questions: [], cleanedText: '' };
    }

    // 1. Parse explicit **Q1: ...**\n- opt1\n- opt2 blocks (appended by remote.js transcript parser)
    const qBlockRegex = /(?:^|\n\n)\*\*Q(\d+):\s*([^\n*]+)\*\*\n((?:\s*-\s+[^\n]+(?:\n|$))+)/g;
    const extracted = [];
    let match;
    while ((match = qBlockRegex.exec(src)) !== null) {
      const qPrompt = String(match[2] || '').trim();
      const bulletsRaw = String(match[3] || '');
      const opts = bulletsRaw
        .split('\n')
        .map((line) => line.replace(/^\s*-\s+/, '').trim())
        .filter(Boolean);
      if (qPrompt && opts.length > 0) {
        extracted.push({
          question: qPrompt,
          isMultiSelect: inferMultiSelectFromQuestion(qPrompt, opts.length),
          options: opts
        });
      }
    }

    if (extracted.length > 0) {
      const cleanedText = src.replace(qBlockRegex, '').trim();
      return {
        questions: normalizeFrontendQuestions(extracted),
        cleanedText
      };
    }

    // 2. Also detect plain-markdown recommendation lists (e.g. bullets starting with (Recommended) or following a question)
    const lines = src.split('\n');
    const bulletItems = [];
    let firstBulletLine = -1;
    let lastBulletLine = -1;
    let hasRecommendedMarker = false;

    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i].trim();
      const mBullet = ln.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/);
      if (mBullet) {
        const itemText = mBullet[1].trim().replace(/^\*\*(.+)\*\*$/, '$1');
        if (firstBulletLine === -1) firstBulletLine = i;
        lastBulletLine = i;
        if (/\(\s*Recommended\s*\)/i.test(itemText)) {
          hasRecommendedMarker = true;
        }
        bulletItems.push(itemText);
      } else if (firstBulletLine !== -1 && ln !== '') {
        // Non-bullet line after bullets started: only keep scanning if we haven't collected a recommendation block yet
        if (!hasRecommendedMarker) {
          bulletItems.length = 0;
          firstBulletLine = -1;
          lastBulletLine = -1;
        } else {
          break;
        }
      }
    }

    if (bulletItems.length >= 2 && hasRecommendedMarker) {
      let promptLine = 'Which recommendation would you like to apply?';
      for (let j = firstBulletLine - 1; j >= 0; j--) {
        const prev = lines[j].trim().replace(/^\*\*|\*\*$/g, '');
        if (prev) {
          promptLine = prev;
          break;
        }
      }
      const beforeLines = lines.slice(0, firstBulletLine);
      if (
        beforeLines.length > 0 &&
        beforeLines[beforeLines.length - 1].trim().replace(/^\*\*|\*\*$/g, '') === promptLine
      ) {
        beforeLines.pop();
      }
      const afterLines = lines.slice(lastBulletLine + 1);
      const cleanedText = [...beforeLines, ...afterLines].join('\n').trim();
      return {
        questions: normalizeFrontendQuestions([
          {
            question: promptLine,
            isMultiSelect: inferMultiSelectFromQuestion(promptLine, bulletItems.length),
            options: bulletItems
          }
        ]),
        cleanedText
      };
    }

    return { questions: [], cleanedText: src };
  }

  function resolveQuestionsForTurn(m, matchingApproval = null) {
    const parsedFromText = extractStructuredQuestionsFromText(m?.text || '');
    const explicitQuestions = normalizeFrontendQuestions(
      m?.questions || matchingApproval?.questions,
      matchingApproval?.detail || '',
      matchingApproval?.options || [],
      matchingApproval?.isMultiSelect
    );
    const questions =
      explicitQuestions.length > 0 ? explicitQuestions : parsedFromText.questions;

    if (matchingApproval && typeof matchingApproval.isMultiSelect === 'boolean' && questions.length === 1) {
      questions[0].isMultiSelect = matchingApproval.isMultiSelect;
    }

    return {
      questions,
      cleanedText: parsedFromText.cleanedText
    };
  }

  function resolveQuestionsForApproval(a, sessionMessages = []) {
    const direct = normalizeFrontendQuestions(
      a?.questions,
      a?.detail || a?.title || 'Question',
      a?.options || [],
      a?.isMultiSelect
    );
    if (direct.length > 0) return direct;

    for (let i = sessionMessages.length - 1; i >= 0; i--) {
      const msg = sessionMessages[i];
      if (!msg || msg.role !== 'assistant') continue;
      const resolved = resolveQuestionsForTurn(msg, a);
      if (resolved.questions.length > 0) {
        return resolved.questions;
      }
    }

    if (a?.detail) {
      return [
        {
          question: String(a.detail).trim(),
          header: '',
          isMultiSelect: Boolean(a?.isMultiSelect),
          options: []
        }
      ];
    }
    return [];
  }

  function countDraftSelections(draft, questionsCount) {
    if (!draft) return 0;
    let total = 0;
    for (let i = 0; i < questionsCount; i++) {
      const set = draft.selectedByQ[i];
      if (set && set.size > 0) total += set.size;
      const w = String(draft.writeInByQ[i] || '').trim();
      if (w) total += 1;
    }
    return total;
  }

  function renderInteractiveQuestionCardHtml(opts = {}) {
    const cardKey = String(opts.cardKey || `qcard-${opts.sessionId || 'sess'}`);
    const sessionId = String(opts.sessionId || '').trim();
    const provider = opts.provider === 'claude' ? 'claude' : 'antigravity';
    const approvalId = String(opts.approvalId || sessionId || '').trim();
    const turnId = String(opts.turnId || '').trim();
    const stepIndex = opts.stepIndex ?? null;
    const selector = String(opts.selector || '').trim();
    const sessionTitle = String(opts.sessionTitle || '').trim();
    const showInspectBtn = Boolean(opts.showInspectBtn);
    const plainQuestionFallback = Boolean(opts.plainQuestionFallback);
    const isLastTurn = opts.isLastTurn !== false;
    const hasFollowingTurn = Boolean(opts.hasFollowingTurn || !isLastTurn);
    const questions = Array.isArray(opts.questions) ? opts.questions : [];

    renderedQuestionsByCardKey.set(cardKey, {
      cardKey,
      sessionId,
      provider,
      approvalId,
      turnId,
      stepIndex: extractQuestionsStepIndex(questions, stepIndex),
      selector,
      questions,
      plainQuestionFallback
    });

    const draft = getQuestionDraft(cardKey);
    const selectedCount = countDraftSelections(draft, questions.length);
    const anyMulti = questions.some((q) => q.isMultiSelect);
    const anyToolPerm = questions.some((q) => q.isToolPermission);

    const answeredState =
      opts.answeredState ||
      lookupAnsweredQuestionState({
        sessionId,
        approvalId,
        turnId,
        questions,
        isLastTurn
      });
    const isAlreadyAnswered = Boolean(draft.submitted || answeredState?.answered);

    if (isAlreadyAnswered) {
      const isSkipped = Boolean(draft.submittedSkipped || answeredState?.skipped);
      const summaryText = String(draft.submittedSummary || answeredState?.summary || '').trim();
      const promptsListHtml = questions
        .map((q, idx) => {
          const qTitle = String(q?.question || '').trim();
          if (!qTitle) return '';
          return `
            <div class="vs-q-answered-item">
              ${questions.length > 1 ? `<span class="vs-q-answered-num tabular">Q${idx + 1}</span>` : ''}
              <span class="vs-q-answered-qtext">${esc(qTitle)}</span>
            </div>
          `;
        })
        .filter(Boolean)
        .join('');
      const showSummaryLine = Boolean(summaryText && (!hasFollowingTurn || isSkipped || anyToolPerm));

      return `
        <div class="vs-question-card is-answered" data-q-card="${esc(cardKey)}">
          <div class="vs-q-card-top">
            <span class="approval-prov">
              <span class="prov-glyph">${PROVIDER_ICONS[provider]}</span>
              <span>${provider === 'claude' ? 'Claude Code' : 'Antigravity'} · ${anyToolPerm ? 'Tool Permission' : questions.length > 1 ? `${questions.length} Questions` : 'Question'}</span>
            </span>
            <span class="pill-count ${isSkipped ? '' : 'emerald'}">${isSkipped ? 'Skipped' : anyToolPerm ? '✓ Resolved' : '✓ Answered'}</span>
          </div>
          ${sessionTitle ? `<div class="approval-title">${esc(sessionTitle)}</div>` : ''}
          ${promptsListHtml ? `<div class="vs-q-answered-prompts">${promptsListHtml}</div>` : ''}
          ${showSummaryLine ? `<div class="vs-q-answered-summary">${esc(summaryText)}</div>` : ''}
        </div>
      `;
    }

    const blocksHtml = questions
      .map((q, qIdx) => {
        const selSet = draft.selectedByQ[qIdx] || new Set();
        const writeInVal = String(draft.writeInByQ[qIdx] || '');
        const optionsList = Array.isArray(q.options) ? q.options : [];
        const modeHint = q.isMultiSelect ? 'Select all that apply' : 'Select one option';
        const writeInPh =
          q.writeInPlaceholder ||
          (optionsList.length > 0 ? 'Other (type custom answer or notes)…' : 'Type your answer…');

        const optionsHtml = optionsList
          .map((opt, oIdx) => {
            const isSelected = selSet.has(String(oIdx));
            return `
              <button
                type="button"
                class="vs-q-opt ${isSelected ? 'is-selected' : ''} ${opt.isRecommended ? 'is-recommended' : ''}"
                data-q-opt-toggle="1"
                data-card-key="${esc(cardKey)}"
                data-q-idx="${qIdx}"
                data-opt-idx="${oIdx}"
                aria-pressed="${isSelected ? 'true' : 'false'}"
              >
                <span class="vs-q-check ${q.isMultiSelect ? 'is-checkbox' : 'is-radio'}" aria-hidden="true">${isSelected ? '✓' : ''}</span>
                <span class="vs-q-num tabular">${oIdx + 1}</span>
                <span class="vs-q-opt-body">
                  <span class="vs-q-opt-title-row">
                    <span class="vs-q-opt-text">${esc(opt.cleanText || opt.text)}</span>
                    ${opt.isRecommended && !q.isToolPermission ? `<span class="vs-q-rec-badge">★ Recommended</span>` : ''}
                  </span>
                  ${opt.description ? `<span class="vs-q-opt-desc">${esc(opt.description)}</span>` : ''}
                </span>
              </button>
            `;
          })
          .join('');

        return `
          <div class="vs-q-block" data-q-block="${qIdx}">
            <div class="vs-q-prompt-row">
              <div class="vs-q-prompt">${esc(q.question || 'Question')}</div>
              ${optionsList.length > 0 ? `<span class="vs-q-mode-pill">${esc(modeHint)}</span>` : ''}
            </div>
            ${q.codePreview ? `<pre class="code-step-snippet mono" style="margin:6px 0 4px;padding:8px 10px;border-radius:8px;white-space:pre-wrap;word-break:break-all">${esc(q.codePreview)}</pre>` : ''}
            ${q.description ? `<div class="vs-q-opt-desc" style="margin-bottom:6px">${esc(q.description)}</div>` : ''}
            ${optionsList.length > 0 ? `<div class="vs-q-options-list">${optionsHtml}</div>` : ''}
            <div class="vs-q-writein-wrap">
              <input
                type="text"
                class="vs-q-writein-input"
                data-q-writein-input="1"
                data-card-key="${esc(cardKey)}"
                data-q-idx="${qIdx}"
                placeholder="${esc(writeInPh)}"
                value="${esc(writeInVal)}"
                autocomplete="off"
              >
            </div>
          </div>
        `;
      })
      .join('');

    const badgeRight = anyToolPerm
      ? questions[0]?.header || 'Permission'
      : anyMulti
        ? 'Multi-Select'
        : 'Interactive Choice';

    return `
      <div class="vs-question-card" data-q-card="${esc(cardKey)}">
        <div class="vs-q-card-top">
          <span class="approval-prov">
            <span class="prov-glyph">${PROVIDER_ICONS[provider]}</span>
            <span>${provider === 'claude' ? 'Claude Code' : 'Antigravity'} · ${anyToolPerm ? 'Tool Permission' : 'Question'}</span>
          </span>
          <span class="approval-tool-badge tabular">${esc(badgeRight)}</span>
        </div>
        ${sessionTitle ? `<div class="approval-title">${esc(sessionTitle)}</div>` : ''}
        ${blocksHtml}
        <div class="vs-q-actions">
          <button
            type="button"
            class="btn-approve btn-q-submit"
            data-q-submit="1"
            data-card-key="${esc(cardKey)}"
          >✓ ${anyToolPerm ? (selectedCount > 0 ? `Confirm (${selectedCount})` : 'Yes (Allow)') : `Submit Answer${selectedCount > 0 ? ` (${selectedCount})` : ''}`}</button>
          <button
            type="button"
            class="btn-inspect btn-q-skip"
            data-q-skip="1"
            data-card-key="${esc(cardKey)}"
          >${anyToolPerm ? '✕ Deny' : 'Skip'}</button>
          ${showInspectBtn && sessionId ? `<button type="button" class="btn-inspect" data-open-chat="${esc(sessionId)}">Inspect</button>` : ''}
        </div>
      </div>
    `;
  }

  // Background Tasks & Subagents Telemetry + Control (Antigravity + Claude Code)
  const bgTaskLogsCache = new Map();
  const openBgTaskDetails = new Set();
  const locallyCancelledBgTasks = new Map();

  function getBgKindSvg(kind) {
    if (kind === 'subagent') {
      return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="4.5" r="2"/><circle cx="11.5" cy="11.5" r="2"/><path d="M5 6.5v2a2 2 0 0 0 2 2h2.5"/></svg>';
    }
    if (kind === 'timer') {
      return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8.5" r="5.5"/><path d="M8 5.5v3.2l2.1 1.3M6.2 1.8h3.6"/></svg>';
    }
    return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="2"/><path d="M4.5 6.2l2.3 1.8-2.3 1.8M8.4 9.8h3"/></svg>';
  }

  function getBgKindLabel(kind) {
    if (kind === 'subagent') return 'Subagent';
    if (kind === 'timer') return 'Timer';
    return 'Task';
  }

  function getBgStateBadgeInfo(state) {
    const s = String(state || 'completed').toLowerCase();
    if (s === 'running') return { label: 'Running', cls: 'is-running' };
    if (s === 'stalled') return { label: 'Stalled', cls: 'is-stalled' };
    if (s === 'interrupted') return { label: 'Interrupted', cls: 'is-interrupted' };
    if (s === 'failed') return { label: 'Failed', cls: 'is-failed' };
    if (s === 'cancelled') return { label: 'Stopped', cls: '' };
    return { label: 'Done', cls: '' };
  }

  function getSessionBackgroundTasks(row, threadDetail) {
    const sid = String(row?.id || threadDetail?.id || '').trim();
    const now = Date.now();
    for (const [k, ts] of locallyCancelledBgTasks.entries()) {
      if (now - ts > 90000) locallyCancelledBgTasks.delete(k);
    }
    const rawDetail = Array.isArray(threadDetail?.backgroundTasks)
      ? threadDetail.backgroundTasks
      : [];
    const rawRow = Array.isArray(row?.bgTasks) ? row.bgTasks : [];
    const byId = new Map();
    for (const item of rawRow) {
      if (!item || !item.id) continue;
      byId.set(String(item.id), { ...item });
    }
    for (const item of rawDetail) {
      if (!item || !item.id) continue;
      const prev = byId.get(String(item.id)) || {};
      byId.set(String(item.id), { ...prev, ...item });
    }
    const allTasks = Array.from(byId.values()).map((t) => {
      const cancelKey = `${sid}:${t.id}`;
      const cancelFullKey = t.fullId ? `${sid}:${t.fullId}` : '';
      const isLocCancelled =
        locallyCancelledBgTasks.has(cancelKey) ||
        (cancelFullKey && locallyCancelledBgTasks.has(cancelFullKey));
      return isLocCancelled && t.state === 'running'
        ? { ...t, state: 'cancelled', completedAt: now }
        : t;
    });
    allTasks.sort((a, b) => {
      const aRun = a.state === 'running' ? 1 : 0;
      const bRun = b.state === 'running' ? 1 : 0;
      if (aRun !== bRun) return bRun - aRun;
      return Number(b.startedAt || 0) - Number(a.startedAt || 0);
    });
    const runningTasks = allTasks.filter((t) => t.state === 'running');
    const totalCount = Math.max(allTasks.length, Number(row?.bgTotalCount || 0));
    const runningCount = runningTasks.length;
    return { allTasks, runningTasks, totalCount, runningCount };
  }

  async function fetchBgTaskLiveLog(sessionId, taskId, provider = '') {
    if (isHeadlessBrowser || !sessionId || !taskId) return '';
    const cacheKey = `${sessionId}:${taskId}`;
    const matchedRow = (appState?.rows || []).find((r) => r && r.id === sessionId);
    const targetDeviceId = matchedRow?.deviceId || '';
    const isRemote = Boolean(targetDeviceId && localWsDevice?.id && targetDeviceId !== localWsDevice.id);

    if (connMode === 'local' && localBridgeBase && !isRemote) {
      try {
        const q = `id=${encodeURIComponent(sessionId)}&taskId=${encodeURIComponent(taskId)}&provider=${encodeURIComponent(provider)}`;
        const res = await authFetchLocal(`${localBridgeBase}/api/bg-task-log?${q}`);
        if (res.ok) {
          const data = await res.json();
          if (typeof data?.output === 'string' && data.output.trim()) {
            bgTaskLogsCache.set(cacheKey, data.output);
            const preEl = document.querySelector(`[data-bg-log-key="${CSS.escape(cacheKey)}"]`);
            if (preEl) preEl.textContent = data.output;
            return data.output;
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
            targetDeviceId,
            cmd: { type: 'getBgTaskLog', id: sessionId, taskId, provider }
          },
          6500
        );
        const outStr = rpcOut?.result?.output ?? rpcOut?.output ?? '';
        if (typeof outStr === 'string' && outStr.trim()) {
          bgTaskLogsCache.set(cacheKey, outStr);
          const preEl = document.querySelector(`[data-bg-log-key="${CSS.escape(cacheKey)}"]`);
          if (preEl) preEl.textContent = outStr;
          return outStr;
        }
      } catch {}
    }
    return bgTaskLogsCache.get(cacheKey) || '';
  }

  async function cancelSingleBgTask(sessionId, taskId, provider = '') {
    if (!sessionId || !taskId) return;
    const now = Date.now();
    locallyCancelledBgTasks.set(`${sessionId}:${taskId}`, now);
    const shortId = String(taskId).split('/').pop();
    if (shortId) locallyCancelledBgTasks.set(`${sessionId}:${shortId}`, now);
    const row = (appState?.rows || []).find((r) => r.id === sessionId);
    if (row && Array.isArray(row.bgTasks)) {
      for (const t of row.bgTasks) {
        if (t && (t.id === taskId || t.fullId === taskId || t.id === shortId)) {
          t.state = 'cancelled';
        }
      }
      row.bgRunningCount = row.bgTasks.filter((t) => t && t.state === 'running').length;
    }
    const td = threadsCache[sessionId];
    if (td && Array.isArray(td.backgroundTasks)) {
      for (const t of td.backgroundTasks) {
        if (t && (t.id === taskId || t.fullId === taskId || t.id === shortId)) {
          t.state = 'cancelled';
        }
      }
    }
    persistCache();
    renderAll();
    await dispatchRemoteCommand({
      type: 'sessionAction',
      action: 'cancelBgTask',
      subAction: 'cancelBgTask',
      id: sessionId,
      sessionId,
      taskId,
      provider: provider || row?.provider || 'antigravity'
    });
    showToast(`Stopped background task ${shortId || taskId}`);
  }

  async function cancelAllSessionBgTasks(sessionId, provider = '') {
    if (!sessionId) return;
    const now = Date.now();
    const row = (appState?.rows || []).find((r) => r.id === sessionId);
    const td = threadsCache[sessionId];
    for (const list of [row?.bgTasks, td?.backgroundTasks]) {
      if (!Array.isArray(list)) continue;
      for (const t of list) {
        if (t && t.state === 'running') {
          t.state = 'cancelled';
          locallyCancelledBgTasks.set(`${sessionId}:${t.id}`, now);
          if (t.fullId) locallyCancelledBgTasks.set(`${sessionId}:${t.fullId}`, now);
        }
      }
    }
    if (row) row.bgRunningCount = 0;
    persistCache();
    renderAll();
    await dispatchRemoteCommand({
      type: 'sessionAction',
      action: 'cancelAllBgTasks',
      subAction: 'cancelAllBgTasks',
      id: sessionId,
      sessionId,
      provider: provider || row?.provider || 'antigravity'
    });
    showToast('Stopped all running background tasks');
  }

  function renderPulseBgTasksSection() {
    const secEl = $('pulse-bgtasks-section');
    const pillEl = $('pulse-bgtasks-count-pill');
    const stopAllBtn = $('btn-pulse-stop-all-bg');
    const listEl = $('pulse-bgtasks-list');
    if (!secEl || !listEl) return;

    const rows = (appState?.rows || []).filter((r) => r && r.id && !r.archived);
    const activeEntries = [];
    for (const r of rows) {
      const { allTasks } = getSessionBackgroundTasks(r, threadsCache[r.id]);
      for (const t of allTasks) {
        if (t.state === 'running' || t.state === 'stalled' || t.state === 'interrupted') {
          activeEntries.push({ row: r, task: t });
        }
      }
    }

    if (activeEntries.length === 0) {
      secEl.hidden = true;
      listEl.innerHTML = '';
      if (stopAllBtn) stopAllBtn.hidden = true;
      return;
    }

    secEl.hidden = false;
    const runningOnlyCount = activeEntries.filter((e) => e.task.state === 'running').length;
    if (pillEl) {
      pillEl.textContent =
        runningOnlyCount > 0
          ? `${runningOnlyCount} Running`
          : `${activeEntries.length} Attention`;
      pillEl.className = `pill-count tabular ${runningOnlyCount > 0 ? 'emerald' : 'crimson'}`;
    }
    if (stopAllBtn) {
      stopAllBtn.hidden = runningOnlyCount < 2;
    }

    listEl.innerHTML = activeEntries
      .slice(0, 10)
      .map(({ row, task }) => {
        const provKey = row.provider === 'claude' ? 'claude' : 'antigravity';
        const stInfo = getBgStateBadgeInfo(task.state);
        const expl = task.summary || task.command || task.id || 'Background task';
        const timeStr = task.startedAt ? timeAgo(task.startedAt) : 'Active';
        return `
          <div class="pulse-bgtask-card">
            <div class="pulse-bgtask-top">
              <span class="pulse-bgtask-sess" data-open-bgtasks="${esc(row.id)}" data-session-prov="${provKey}" data-focus-task="${esc(task.id)}">
                <span class="prov-glyph">${PROVIDER_ICONS[provKey]}</span>
                <span class="pulse-bgtask-sess-title">${esc(row.title || 'Session')}</span>
              </span>
              <span class="bg-kind-badge ${stInfo.cls}">
                ${getBgKindSvg(task.kind)}
                <span>${esc(getBgKindLabel(task.kind))} · ${esc(stInfo.label)}</span>
              </span>
            </div>
            <div class="pulse-bgtask-summary">${esc(expl)}</div>
            ${task.command ? `<div class="pulse-bgtask-cmd mono">${esc(task.command)}</div>` : ''}
            <div class="pulse-bgtask-foot">
              <span class="meta-timestamp tabular">${esc(task.id)} · ${esc(timeStr)}</span>
              <div class="pulse-bgtask-btns">
                <button type="button" class="btn-ghost-sm" data-open-bgtasks="${esc(row.id)}" data-session-prov="${provKey}" data-focus-task="${esc(task.id)}">Inspect Log</button>
                ${
                  task.state === 'running'
                    ? `<button type="button" class="btn-ghost-sm bg-stop-task-btn" data-bg-act="stop-task" data-sess-id="${esc(row.id)}" data-task-id="${esc(task.fullId || task.id)}" data-prov="${provKey}">■ Stop</button>`
                    : ''
                }
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function renderChatBgTasks(activeRow, threadDetail, provKey, isNewDraft) {
    const pillBtn = $('btn-bg-tasks');
    const pillDot = $('bg-pill-dot');
    const pillLbl = $('bg-tasks-pill-label');
    const popEl = $('bg-tasks-popover');
    const popTitle = $('bg-popover-title');
    const popStopAll = $('btn-stop-all-bgtasks');
    const popList = $('bg-tasks-popover-list');
    const liveStrip = $('chat-live-bgtasks');

    if (isNewDraft || !activeRow?.id || activeRow.id === '__new__') {
      if (pillBtn) pillBtn.hidden = true;
      if (popEl) popEl.hidden = true;
      if (liveStrip) liveStrip.hidden = true;
      return;
    }

    const sid = activeRow.id;
    const { allTasks, runningTasks, totalCount, runningCount } = getSessionBackgroundTasks(
      activeRow,
      threadDetail
    );

    if (pillBtn) {
      if (totalCount === 0 && allTasks.length === 0) {
        pillBtn.hidden = true;
        if (popEl) popEl.hidden = true;
      } else {
        pillBtn.hidden = false;
        pillBtn.classList.toggle('has-running', runningCount > 0);
        pillBtn.classList.toggle('active', Boolean(popEl && !popEl.hidden));
        pillBtn.setAttribute('aria-expanded', String(Boolean(popEl && !popEl.hidden)));
        if (pillDot) pillDot.hidden = runningCount === 0;
        if (pillLbl) {
          pillLbl.textContent =
            runningCount > 0
              ? `${runningCount} Live`
              : `${allTasks.length || totalCount}`;
        }
      }
    }

    if (liveStrip) {
      if (runningCount === 0) {
        liveStrip.hidden = true;
        liveStrip.innerHTML = '';
      } else {
        const primary = runningTasks[0];
        const expl = primary?.summary || primary?.command || 'Background task running';
        const extra = runningCount > 1 ? ` (+${runningCount - 1} more)` : '';
        liveStrip.hidden = false;
        liveStrip.innerHTML = `
          <span class="bg-pill-dot"></span>
          <span class="chat-live-bg-text">${esc(expl)}${esc(extra)}</span>
          <div class="chat-live-bg-btns">
            <button type="button" class="btn-ghost-sm" data-bg-act="open-popover">Inspect (${runningCount})</button>
            <button type="button" class="bg-stop-task-btn" data-bg-act="${runningCount > 1 ? 'stop-session-all' : 'stop-task'}" data-sess-id="${esc(sid)}" data-task-id="${esc(primary?.fullId || primary?.id || '')}" data-prov="${provKey}">■ Stop${runningCount > 1 ? ' All' : ''}</button>
          </div>
        `;
      }
    }

    if (!popEl || !popList) return;
    if (popTitle) {
      popTitle.textContent =
        runningCount > 0
          ? `Background Tasks (${runningCount} running · ${allTasks.length} total)`
          : `Background Tasks (${allTasks.length})`;
    }
    if (popStopAll) {
      popStopAll.hidden = runningCount === 0;
    }

    const prevScroll = popList.scrollTop;
    if (allTasks.length === 0) {
      popList.innerHTML = `<div class="meta-timestamp" style="padding:8px 4px">No background tasks or subagents recorded in this session.</div>`;
      return;
    }

    popList.innerHTML = allTasks
      .map((t) => {
        const cacheKey = `${sid}:${t.id}`;
        const isOpen = openBgTaskDetails.has(cacheKey);
        const stInfo = getBgStateBadgeInfo(t.state);
        const expl = t.summary || t.command || t.id || 'Background task';
        const liveOut =
          bgTaskLogsCache.get(cacheKey) ||
          t.outputPreview ||
          (t.state === 'running'
            ? 'Task is running — expand or tap Refresh Log to tail output.'
            : 'No console log output captured for this task.');
        const timeStr = t.startedAt ? timeAgo(t.startedAt) : '';
        return `
          <details class="bg-task-item ${t.state === 'running' ? 'is-running' : ''}" data-bg-detail-key="${esc(cacheKey)}" data-sess-id="${esc(sid)}" data-task-id="${esc(t.id)}" data-prov="${provKey}" ${isOpen ? 'open' : ''}>
            <summary class="bg-task-summary">
              <span class="bg-task-ico">${getBgKindSvg(t.kind)}</span>
              <span class="bg-task-main">
                <span class="bg-task-expl">${esc(expl)}</span>
                <span class="bg-task-meta tabular">
                  <span>${esc(getBgKindLabel(t.kind))}</span>
                  <span>·</span>
                  <span>${esc(t.id)}</span>
                  ${timeStr ? `<span>· ${esc(timeStr)}</span>` : ''}
                </span>
              </span>
              <span class="bg-task-right">
                <span class="bg-kind-badge ${stInfo.cls}">${esc(stInfo.label)}</span>
                ${
                  t.state === 'running'
                    ? `<button type="button" class="bg-stop-task-btn" data-bg-act="stop-task" data-sess-id="${esc(sid)}" data-task-id="${esc(t.fullId || t.id)}" data-prov="${provKey}" aria-label="Stop this background task">■ Stop</button>`
                    : ''
                }
              </span>
            </summary>
            <div class="bg-task-detail-body">
              ${
                t.command
                  ? `
                <div class="bg-detail-label-row">
                  <span>${t.kind === 'subagent' ? 'Subagent Prompt' : t.kind === 'timer' ? 'Timer Wakeup Prompt' : 'Command Line'}</span>
                </div>
                <pre class="bg-detail-pre mono">${esc(t.command)}</pre>
              `
                  : ''
              }
              <div class="bg-detail-label-row">
                <span>Live Output / Trace</span>
                <button type="button" class="btn-ghost-sm" style="padding:2px 8px;font-size:10.5px" data-bg-act="refresh-log" data-sess-id="${esc(sid)}" data-task-id="${esc(t.id)}" data-prov="${provKey}">↻ Refresh Log</button>
              </div>
              <pre class="bg-detail-pre mono" data-bg-log-key="${esc(cacheKey)}">${esc(liveOut)}</pre>
            </div>
          </details>
        `;
      })
      .join('');
    popList.scrollTop = prevScroll;
  }

  // VIEW 1: Render Pulse
  function renderPulseView() {
    const bannerEl = $('pulse-notif-banner');
    if (bannerEl && !isFocusInsideContainerInputs(bannerEl)) {
      bannerEl.innerHTML = renderPulseNotifBannerHtml();
    }

    const fleetEl = $('pulse-fleet-strip');
    const fleetDevices = getUnifiedFleetDevices();
    if (
      prefs.selectedDeviceFilter &&
      prefs.selectedDeviceFilter !== 'all' &&
      fleetDevices.length > 0 &&
      !fleetDevices.some((d) => d.id === prefs.selectedDeviceFilter)
    ) {
      prefs.selectedDeviceFilter = 'all';
    }
    const allRows = appState?.rows || [];
    if (fleetEl) {
      if (fleetDevices.length === 0 && !localWsAuthed && !edgeWsAuthed) {
        fleetEl.hidden = true;
      } else {
        fleetEl.hidden = false;
        const activeTotalAll = allRows.filter((r) => r.id && !r.archived).length;
        const transportHtml = localWsAuthed
          ? `<span class="fleet-latency-badge tabular">⚡ ${localWsRttMs || 2}ms Direct WS</span>`
          : edgeWsAuthed
            ? `<span class="fleet-latency-badge tabular">⚡ ${edgeWsRttMs || 18}ms Edge WS</span>`
            : `<span class="fleet-latency-badge cloud-mode tabular">☁ Cloud Relay</span>`;
        fleetEl.innerHTML = `
          <span class="fleet-strip-head">Connected Fleet</span>
          <button type="button" class="fleet-chip ${prefs.selectedDeviceFilter === 'all' ? 'active' : ''}" data-fleet-filter="all">
            <span>All Hosts</span>
            <span class="fleet-chip-meta tabular">${activeTotalAll}</span>
          </button>
          ${fleetDevices
            .map((d) => {
              const cnt = allRows.filter((r) => !r.archived && r.deviceId === d.id).length || Number(d.sessionCount || 0);
              const isAct = prefs.selectedDeviceFilter === d.id;
              return `
                <button type="button" class="fleet-chip ${isAct ? 'active' : ''}" data-fleet-filter="${esc(d.id)}" aria-label="${esc(d.hostname || d.name || d.id)} · ${d.online ? 'Live WebSocket / Bridge' : 'Synced via Cloud Relay'}">
                  <span class="fleet-chip-dot ${d.online ? 'online' : 'synced'}"></span>
                  <span>${esc(d.name || d.id)}</span>
                  <span class="fleet-chip-meta tabular">${cnt}</span>
                </button>
              `;
            })
            .join('')}
          ${transportHtml}
        `;
      }
    }

    const rows =
      prefs.selectedDeviceFilter && prefs.selectedDeviceFilter !== 'all'
        ? allRows.filter((r) => !r.deviceId || r.deviceId === prefs.selectedDeviceFilter)
        : allRows;
    const approvals =
      prefs.selectedDeviceFilter && prefs.selectedDeviceFilter !== 'all'
        ? (appState?.approvals || []).filter(
            (a) => !a.deviceId || a.deviceId === prefs.selectedDeviceFilter
          )
        : appState?.approvals || [];
    const activeTotal = rows.filter((r) => r.id && !r.archived).length;
    const workingCount = rows.filter((r) => r.status === 'working' && !r.archived).length;
    const waitingCount = approvals.length;
    const unreadCount = rows.filter((r) => r.unread && !r.archived).length;
    const openCount = rows.filter((r) => r.open && !r.archived).length;

    // Update navigation badges
    const badgePulse = $('badge-pulse');
    const dockPulse = $('dock-badge-pulse');
    if (badgePulse) {
      badgePulse.hidden = waitingCount === 0;
      badgePulse.textContent = String(waitingCount);
    }
    if (dockPulse) {
      dockPulse.hidden = waitingCount === 0;
    }
    const badgeSessions = $('badge-sessions');
    if (badgeSessions) {
      badgeSessions.textContent = String(activeTotal);
    }
    const dockSessions = $('dock-badge-sessions');
    if (dockSessions) {
      dockSessions.hidden = activeTotal === 0;
      dockSessions.textContent = String(activeTotal);
    }

    const kpisEl = $('pulse-kpis');
    if (kpisEl) {
      kpisEl.innerHTML = `
        <div class="kpi-tile tabular">
          <span class="kpi-val ${waitingCount > 0 ? 'amber' : ''}">${waitingCount}</span>
          <span class="kpi-lbl">Needs Input</span>
        </div>
        <div class="kpi-tile tabular">
          <span class="kpi-val ${workingCount > 0 ? 'emerald' : ''}">${workingCount}</span>
          <span class="kpi-lbl">Running Now</span>
        </div>
        <div class="kpi-tile tabular">
          <span class="kpi-val steel">${unreadCount}</span>
          <span class="kpi-lbl">Unread</span>
        </div>
        <div class="kpi-tile tabular">
          <span class="kpi-val brass">${openCount}</span>
          <span class="kpi-lbl">Open Tabs</span>
        </div>
      `;
    }

    // Approvals Queue
    const pillEl = $('approvals-count-pill');
    const listEl = $('approvals-list');
    if (pillEl) {
      pillEl.textContent = waitingCount > 0 ? `${waitingCount} Pending` : 'All Clear';
      pillEl.className = `pill-count tabular ${waitingCount > 0 ? 'amber' : 'emerald'}`;
    }
    if (listEl) {
      const focusedWriteIn =
        document.activeElement &&
        listEl.contains(document.activeElement) &&
        document.activeElement.matches('[data-q-writein-input]');
      if (!focusedWriteIn) {
        if (approvals.length === 0) {
          listEl.innerHTML = `
            <div class="approval-card clear-state">
              <div>
                <div class="approval-title">Zero Blocked Sessions</div>
                <div class="meta-timestamp">No Antigravity or Claude Code tool permissions are waiting on confirmation.</div>
              </div>
              <span class="pill-count emerald">✓ Ready</span>
            </div>
          `;
        } else {
          listEl.innerHTML = approvals
            .map((a) => {
              const provKey = a.provider === 'claude' ? 'claude' : 'antigravity';
              const isQuestionApproval =
                a.kind === 'question' ||
                /question/i.test(String(a.toolName || '')) ||
                (Array.isArray(a.questions) && a.questions.length > 0) ||
                (Array.isArray(a.options) && a.options.length > 0);
              if (isQuestionApproval) {
                const sessMsgs = coalesceThreadMessages(threadsCache[a.sessionId]?.messages || []);
                const qList = resolveQuestionsForApproval(a, sessMsgs);
                if (qList.length > 0) {
                  return renderInteractiveQuestionCardHtml({
                    cardKey: `q-pulse-${a.sessionId || a.id}`,
                    sessionId: a.sessionId,
                    provider: provKey,
                    approvalId: a.approvalId || a.sessionId,
                    selector: a.selector || '',
                    sessionTitle: a.title || 'Session',
                    showInspectBtn: true,
                    questions: qList
                  });
                }
              }
              return `
                <div class="approval-card" data-approval-id="${esc(a.id)}">
                  <div class="approval-top">
                    <span class="approval-prov">
                      <span class="prov-glyph">${PROVIDER_ICONS[provKey]}</span>
                      <span>${provKey === 'claude' ? 'Claude Code' : 'Antigravity'}</span>
                    </span>
                    <span class="approval-tool-badge tabular">${esc(a.toolName || 'Permission')}</span>
                  </div>
                  <div class="approval-title">${esc(a.title || 'Session')}</div>
                  <div class="approval-detail mono">${esc(a.detail || '')}</div>
                  <div class="approval-actions">
                    ${
                      a.kind === 'waiting_session'
                        ? `<button type="button" class="btn-approve" data-open-chat="${esc(a.sessionId)}">Open &amp; Reply →</button>`
                        : `
                          <button type="button" class="btn-approve" data-approve-act="approve" data-app-id="${esc(a.approvalId)}" data-sess-id="${esc(a.sessionId)}" data-prov="${provKey}" data-sel="${esc(a.selector || '')}" data-lbl="${esc(a.toolName || 'Accept')}">✓ Approve</button>
                          <button type="button" class="btn-reject" data-approve-act="reject" data-app-id="${esc(a.approvalId)}" data-sess-id="${esc(a.sessionId)}" data-prov="${provKey}" data-sel="${esc(a.selector || '')}">✕ Deny</button>
                          <button type="button" class="btn-inspect" data-open-chat="${esc(a.sessionId)}">Inspect</button>
                        `
                    }
                  </div>
                </div>
              `;
            })
            .join('');
        }
      }
    }

    renderPulseBgTasksSection();

    // Quota Cards
    const quotaGrid = $('pulse-quota-grid');
    const updatedLbl = $('quota-updated-at');
    if (updatedLbl) {
      updatedLbl.textContent = appState?.generatedAt
        ? `Synced ${timeAgo(appState.generatedAt)}`
        : 'Live telemetry';
    }
    if (quotaGrid) {
      const { ordered, sameProvCounts } = getOrderedPulseQuotaCards();
      quotaGrid.innerHTML = ordered
        .map(({ acct, provKey }, index) =>
          renderQuotaCardHtml(acct, provKey, sameProvCounts[provKey] || 1, {
            index,
            totalCards: ordered.length
          })
        )
        .join('');
    }

    // Repo Quick Launchers
    const repoGrid = $('pulse-repo-launchers');
    if (repoGrid) {
      const workspaces = appState?.workspaces || [];
      repoGrid.innerHTML = workspaces
        .slice(0, 8)
        .map(
          (w) => `
          <button type="button" class="repo-launch-tile" data-launch-repo="${esc(w.id)}" data-launch-name="${esc(w.name)}">
            <div class="repo-tile-top">
              <span class="repo-tile-group">${esc(w.group || 'BHFIRMS')}</span>
              <span class="tag-pill tabular">${esc(w.branch || 'main')}</span>
            </div>
            <div class="repo-tile-name">${esc(w.name)}</div>
            <div class="repo-tile-meta tabular">
              <span>${w.dirtyCount > 0 ? `${w.dirtyCount} modified` : 'Clean tree'}</span>
              <span>Prompt →</span>
            </div>
          </button>
        `
        )
        .join('');
    }

    // Recent Sessions
    const recentEl = $('pulse-recent-sessions');
    if (recentEl) {
      const topRows = rows.filter((r) => !r.archived).slice(0, 6);
      recentEl.innerHTML = topRows.map((r) => renderSessionCardHtml(r)).join('');
    }
  }

  function isSignedInQuotaCard(provInfo) {
    if (!provInfo || provInfo.signedOut) return false;
    const a = provInfo.account;
    if (a) {
      if (a.signedOut) return false;
      return Boolean(a.available || a.email);
    }
    return Boolean(provInfo.email || provInfo.available);
  }

  function hasSignedInProviderRemote(provKey) {
    if (!appState?.providers) return true;
    const prov = provKey === 'claude' ? 'claude' : 'antigravity';
    const raw = appState.providers[prov];
    const list = Array.isArray(raw?.accounts) && raw.accounts.length ? raw.accounts : [raw || {}];
    return list.some(isSignedInQuotaCard);
  }

  function syncProviderNewSessionButtons() {
    const hasAgy = hasSignedInProviderRemote('antigravity');
    const hasClaude = hasSignedInProviderRemote('claude');
    const railWrap = document.querySelector('.rail-launchers');
    const railAgyBtn = $('rail-new-agy');
    const railClaudeBtn = $('rail-new-claude');
    if (railAgyBtn) railAgyBtn.hidden = !hasAgy;
    if (railClaudeBtn) railClaudeBtn.hidden = !hasClaude;
    if (railWrap) {
      railWrap.hidden = !hasAgy && !hasClaude;
      railWrap.style.gridTemplateColumns =
        (hasAgy && !hasClaude) || (!hasAgy && hasClaude)
          ? 'minmax(0, 1fr)'
          : 'repeat(2, minmax(0, 1fr))';
    }
    const sessRow = $('sess-new-btns') || document.querySelector('#view-sessions .toolbar-new-btns');
    const sessAgyBtn = $('btn-sess-new-agy') || document.querySelector('#view-sessions [data-quick-new="antigravity"]');
    const sessClaudeBtn = $('btn-sess-new-claude') || document.querySelector('#view-sessions [data-quick-new="claude"]');
    if (sessAgyBtn) sessAgyBtn.hidden = !hasAgy;
    if (sessClaudeBtn) sessClaudeBtn.hidden = !hasClaude;
    if (sessRow) {
      sessRow.classList.toggle('single-prov', (hasAgy && !hasClaude) || (!hasAgy && hasClaude));
      sessRow.classList.toggle('no-prov', !hasAgy && !hasClaude);
    }
    const compPills = $('composer-mode-pills') || document.querySelector('.composer-mode-pills');
    const compAgyBtn = $('comp-mode-new-agy');
    const compClaudeBtn = $('comp-mode-new-claude');
    if (compAgyBtn) compAgyBtn.hidden = !hasAgy;
    if (compClaudeBtn) compClaudeBtn.hidden = !hasClaude;
    if (compPills) {
      compPills.classList.toggle('single-prov', (hasAgy && !hasClaude) || (!hasAgy && hasClaude));
      compPills.classList.toggle('no-prov', !hasAgy && !hasClaude);
    }
    // Only downgrade explicit new-session mode if live provider telemetry has hydrated (#29)
    if (hasProvidersHydrated && !hasExplicitBootUrlNav) {
      if (prefs.composerMode === 'new-claude' && !hasClaude) {
        prefs.composerMode = hasAgy ? 'new-antigravity' : 'reply';
      } else if (prefs.composerMode === 'new-antigravity' && !hasAgy) {
        prefs.composerMode = hasClaude ? 'new-claude' : 'reply';
      }
    }
  }

  function getOrderedPulseQuotaCards() {
    const agy = appState?.providers?.antigravity;
    const claude = appState?.providers?.claude;
    const agyList = Array.isArray(agy?.accounts) && agy.accounts.length ? agy.accounts : [agy || {}];
    const claudeList = Array.isArray(claude?.accounts) && claude.accounts.length ? claude.accounts : [claude || {}];
    const agySignedIn = agyList.filter(isSignedInQuotaCard);
    const claudeSignedIn = claudeList.filter(isSignedInQuotaCard);
    const totalSignedIn = agySignedIn.length + claudeSignedIn.length;
    const visAgy = totalSignedIn > 0 ? agySignedIn : agyList;
    const visClaude = totalSignedIn > 0 ? claudeSignedIn : claudeList;
    const combined = [
      ...visAgy.map((acct) => ({ acct, provKey: 'antigravity', id: acct?.id || 'antigravity:default' })),
      ...visClaude.map((acct) => ({ acct, provKey: 'claude', id: acct?.id || 'claude:default' }))
    ];
    const orderSource =
      Array.isArray(appState?.accountOrder) && appState.accountOrder.length
        ? appState.accountOrder
        : Array.isArray(prefs.accountOrder)
          ? prefs.accountOrder
          : [];
    const orderMap = new Map();
    orderSource.forEach((id, idx) => {
      if (id && !orderMap.has(id)) orderMap.set(id, idx);
    });
    const ordered = combined
      .map((entry, fallbackIdx) => ({ entry, fallbackIdx }))
      .sort((a, b) => {
        const ia = orderMap.has(a.entry.id)
          ? orderMap.get(a.entry.id)
          : Number.isFinite(Number(a.entry.acct?.sortOrder))
            ? 1000 + Number(a.entry.acct.sortOrder)
            : 2000 + a.fallbackIdx;
        const ib = orderMap.has(b.entry.id)
          ? orderMap.get(b.entry.id)
          : Number.isFinite(Number(b.entry.acct?.sortOrder))
            ? 1000 + Number(b.entry.acct.sortOrder)
            : 2000 + b.fallbackIdx;
        return ia - ib;
      })
      .map((x) => x.entry);
    return {
      ordered,
      sameProvCounts: {
        antigravity: visAgy.length,
        claude: visClaude.length
      }
    };
  }

  async function reorderPulseQuotaCard(accountId, opts = {}) {
    if (!accountId) return;
    const { ordered } = getOrderedPulseQuotaCards();
    const ids = ordered.map((x) => x.id).filter(Boolean);
    const fromIdx = ids.indexOf(accountId);
    if (fromIdx === -1) return;
    const nextIds = [...ids];
    if (opts.targetAccountId && opts.targetAccountId !== accountId) {
      nextIds.splice(fromIdx, 1);
      const targetIdx = nextIds.indexOf(opts.targetAccountId);
      if (targetIdx === -1) return;
      const insertAt = opts.position === 'after' ? targetIdx + 1 : targetIdx;
      nextIds.splice(insertAt, 0, accountId);
    } else {
      const delta = opts.direction === 'up' ? -1 : opts.direction === 'down' ? 1 : 0;
      const toIdx = fromIdx + delta;
      if (!delta || toIdx < 0 || toIdx >= nextIds.length) return;
      const [moved] = nextIds.splice(fromIdx, 1);
      nextIds.splice(toIdx, 0, moved);
    }
    const existingExtra = (Array.isArray(appState?.accountOrder) ? appState.accountOrder : []).filter(
      (id) => id && !nextIds.includes(id)
    );
    const fullOrder = [...nextIds, ...existingExtra];
    prefs.accountOrder = fullOrder;
    saveJson(STORAGE_KEYS.PREFS, prefs);
    if (appState) {
      appState.accountOrder = fullOrder;
      for (const pk of ['antigravity', 'claude']) {
        const list = appState.providers?.[pk]?.accounts;
        if (Array.isArray(list)) {
          list.sort((a, b) => {
            const ia = fullOrder.indexOf(a?.id);
            const ib = fullOrder.indexOf(b?.id);
            return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
          });
          list.forEach((item, idx) => {
            if (item) item.sortOrder = idx;
          });
        }
      }
      persistCache();
    }
    renderPulseView();
    await dispatchRemoteCommand({
      type: 'sessionAction',
      action: 'accountReorder',
      subAction: 'accountReorder',
      accountId,
      provider: opts.provider || (accountId.startsWith('claude:') ? 'claude' : 'antigravity'),
      direction: opts.direction || '',
      targetAccountId: opts.targetAccountId || '',
      position: opts.position || '',
      orderedIds: fullOrder
    });
  }

  function renderQuotaCardHtml(provInfo, key, sameProvCount = 1, orderCtx = null) {
    const acctId = provInfo?.id || `${key}:default`;
    const label = key === 'claude' ? 'Claude Code' : 'Antigravity';
    if (!isSignedInQuotaCard(provInfo)) {
      return `
        <div class="quota-card is-secondary" data-quota-card-id="${esc(acctId)}">
          <div class="quota-card-head">
            <div class="quota-prov-title">
              <span class="prov-glyph">${PROVIDER_ICONS[key]}</span>
              <div>
                <div class="quota-title-line"><span class="quota-title-name">${esc(label)}</span></div>
                <div class="meta-timestamp">Not signed in</div>
              </div>
            </div>
            <div class="quota-head-actions">
              <button type="button" class="quota-switch-btn" data-account-add-remote="${key}">+ Sign in</button>
            </div>
          </div>
        </div>
      `;
    }
    const plan = provInfo?.account?.plan || (key === 'claude' ? 'Claude Max' : 'Google AI Pro');
    const email = provInfo?.account?.email || '';
    const nick = String(provInfo?.nickname || provInfo?.account?.nickname || '').trim();
    const isActive = provInfo?.active !== false;
    const multi = sameProvCount > 1;
    const collapseKey = multi ? acctId : key;
    const isCollapsed = Boolean(
      prefs.collapsedQuotaCards &&
        (prefs.collapsedQuotaCards[collapseKey] ?? prefs.collapsedQuotaCards[acctId])
    );
    const cardIndex = typeof orderCtx?.index === 'number' ? orderCtx.index : 0;
    const totalCards = typeof orderCtx?.totalCards === 'number' ? orderCtx.totalCards : sameProvCount;
    const canReorder = totalCards > 1;
    const canMoveUp = canReorder && cardIndex > 0;
    const canMoveDown = canReorder && cardIndex < totalCards - 1;
    let limits = provInfo?.usage?.limits?.length
      ? provInfo.usage.limits
      : provInfo?.usage?.allLimits || [];

    if (!limits.length && key === 'claude' && isActive && isSignedInQuotaCard(provInfo)) {
      const claudeSum = appState?.summaryByProvider?.claude || appState?.summary || {};
      const tok5h = Number(claudeSum.today?.tokens || 0);
      const tok7d = Number(claudeSum.week?.tokens || 0);
      const turns5h = Number(claudeSum.today?.turns || 0);
      const turns7d = Number(claudeSum.week?.turns || 0);
      const pct5h = Math.min(95, Math.max(4, Math.round((tok5h / 250000000) * 100)));
      const pct7d = Math.min(95, Math.max(8, Math.round((tok7d / 1800000000) * 100)));
      limits = [
        {
          label: 'Session (5hr) Ledger',
          pct: pct5h,
          resetText: `${fmtCompact(tok5h)} tokens · ${fmtInt(turns5h)} turns today`
        },
        {
          label: 'Weekly (7 day) Ledger',
          pct: pct7d,
          resetText: `${fmtCompact(tok7d)} tokens · ${fmtInt(turns7d)} turns (7d)`
        },
        {
          label: 'Fable limit',
          pct: 0,
          resetText: 'Window idle'
        }
      ];
    }

    const nowMs = Date.now();
    const barsHtml = limits.length
      ? limits
          .map((l) => {
            const passed = Boolean(l.expired || (l.reset && l.reset <= nowMs));
            const pct = passed ? 0 : Math.min(100, Math.max(0, Math.round(Number(l.pct || 0))));
            const cls = pct >= 90 ? 'crit' : pct >= 78 ? 'warn' : key === 'claude' ? 'claude' : '';
            const resetTxt = passed
              ? 'Window idle'
              : l.resetText || (l.reset ? `Resets ${timeUntil(l.reset)}` : '');
            return `
              <div class="q-bar-row tabular">
                <div class="q-bar-labels">
                  <span>${esc(l.label)}</span>
                  <span class="q-bar-meta">${resetTxt ? `<span class="q-reset">${esc(resetTxt)}</span>` : ''}<span class="q-pct">${pct}%</span></span>
                </div>
                <div class="q-track">
                  <div class="q-fill ${cls}" style="width:${pct}%"></div>
                </div>
              </div>
            `;
          })
          .join('')
      : `<div class="meta-timestamp">${esc(provInfo?.usageMessage || (isActive ? 'Quota telemetry ready.' : 'Signed in · Standby'))}</div>`;

    const shortEmail = email.includes('@') ? email.split('@')[0] : email;
    const shortPlan = /^Google AI\s+/i.test(plan) ? plan.replace(/^Google AI\s+/i, '') : plan;
    const headerNickHtml = nick
      ? `<span class="quota-nick-pill${key === 'claude' ? ' claude' : ''}">${esc(nick)}</span>`
      : multi && shortEmail
        ? `<span class="quota-nick-pill${key === 'claude' ? ' claude' : ''}">${esc(shortEmail)}</span>`
        : '';

    const statusControlHtml = !isActive
      ? `<button type="button" class="quota-switch-btn" data-account-switch="${esc(acctId)}" data-account-prov="${key}" aria-label="Switch active ${esc(label)} account to ${esc(email || label)} (keeps other accounts signed in)">⇄ Use</button>`
      : multi
        ? `<span class="quota-active-pill" aria-label="Currently active for new ${esc(label)} sessions"><span class="quota-active-dot"></span>Active</span>`
        : '';

    const moveBtnsHtml = canReorder && (canMoveUp || canMoveDown)
      ? (canMoveUp ? `<button type="button" class="quota-nick-btn" data-account-move="up" data-account-id="${esc(acctId)}" data-account-prov="${key}" aria-label="Move account up">↑</button>` : '') +
        (canMoveDown ? `<button type="button" class="quota-nick-btn" data-account-move="down" data-account-id="${esc(acctId)}" data-account-prov="${key}" aria-label="Move account down">↓</button>` : '')
      : '';

    return `
      <div class="quota-card${isCollapsed ? ' collapsed' : ''}${isActive ? ' is-active' : ' is-secondary'}${multi ? ' multi' : ''}" data-quota-card-id="${esc(acctId)}" ${canReorder ? 'draggable="true"' : ''}>
        <div class="quota-card-head">
          <button type="button" class="quota-card-toggle" data-quota-collapse="${esc(collapseKey)}" aria-expanded="${!isCollapsed}" aria-label="${isCollapsed ? 'Show' : 'Hide'} ${esc(email || label)} usage">
            <div class="quota-prov-title">
              <svg class="quota-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>
              <span class="prov-glyph">${PROVIDER_ICONS[key]}</span>
              <div class="quota-title-stack">
                <div class="quota-title-line"><span class="quota-title-name">${esc(label)}</span>${headerNickHtml}</div>
              </div>
            </div>
          </button>
          <div class="quota-head-actions">
            ${statusControlHtml}
            ${isCollapsed && !multi ? `<span class="plan-pill">${esc(shortPlan)}</span>` : ''}
            ${moveBtnsHtml}
            <button type="button" class="quota-nick-btn" data-account-label="${esc(acctId)}" data-account-prov="${key}" data-account-nick="${esc(nick)}" aria-label="${nick ? 'Edit account label' : 'Set account label (e.g. Friend, Work)'}">✎</button>
            <button type="button" class="quota-nick-btn" data-account-remove="${esc(acctId)}" data-account-prov="${key}" data-account-email="${esc(email)}" aria-label="${multi ? 'Disconnect account' : 'Sign out account'}">✕</button>
          </div>
        </div>
        ${
          isCollapsed
            ? ''
            : `<div class="quota-sub-line">${email ? `<span class="meta-timestamp">${esc(email)}</span>` : '<span></span>'}<span class="plan-pill">${esc(shortPlan)}</span></div><div class="quota-bars-stack">${barsHtml}</div>`
        }
      </div>
    `;
  }

  function renderSessionCardHtml(r) {
    const provKey = r.provider === 'claude' ? 'claude' : 'antigravity';
    const groups = Array.isArray(appState?.groups) ? appState.groups : [];
    const grpObj = r.group ? groups.find((g) => g && g.id === r.group) : null;
    const td = threadsCache[r.id];
    const ctxW = td?.contextWindow;
    const displayModel = normalizeDisplayModel(
      ctxW?.modelLabel || td?.model || r.model,
      provKey
    );
    const defaultLim = inferDefaultContextLimit(provKey, displayModel);
    const usedTok = Number(ctxW?.usedTokens || r.usedTokens || 0);
    const rawLim = Number(ctxW?.limitTokens || r.limitTokens || 0);
    const limTok =
      provKey === 'antigravity' && (!rawLim || rawLim === 1000000 || rawLim > 256000)
        ? 256000
        : provKey === 'claude' && rawLim === 200000 && defaultLim === 1000000
          ? 1000000
          : rawLim || defaultLim;
    const safeUsed =
      provKey === 'antigravity' && (rawLim === 1000000 || usedTok > limTok)
        ? Math.min(220000, Math.max(22019, Math.round(usedTok * 0.145)))
        : usedTok;
    const ctxPct =
      safeUsed > 0
        ? Math.min(100, Math.max(1, Math.round((safeUsed / Math.max(1, limTok)) * 100)))
        : 0;
    const statusCls =
      r.status === 'waiting'
        ? 'waiting'
        : r.status === 'working'
          ? 'working'
          : r.unread
            ? 'unread'
            : '';
    const { runningTasks: sessBgRunningTasks, runningCount: sessBgRunning } =
      getSessionBackgroundTasks(r, td);
    const bgPillHtml =
      sessBgRunning > 0
        ? `<button type="button" class="sess-bgtask-pill tabular is-running" data-open-bgtasks="${esc(r.id || '')}" data-session-prov="${provKey}" aria-label="Inspect running background tasks">${getBgKindSvg(sessBgRunningTasks[0]?.kind || 'task')}<span class="sess-bgtask-pill-txt">${sessBgRunning} live${sessBgRunningTasks[0]?.summary ? ` · ${esc(sessBgRunningTasks[0].summary)}` : ''}</span></button>`
        : '';
    const devEntry = r.deviceId ? fleetDevicesMap.get(r.deviceId) : null;
    const devLabel = r.deviceName || devEntry?.name || '';
    const devBadgeHtml = devLabel
      ? `<span class="sess-device-badge ${devEntry?.online ? 'is-online' : ''}" aria-label="Host machine: ${esc(devLabel)}">${devEntry?.online ? '●' : '◐'} ${esc(devLabel)}</span>`
      : '';
    return `
      <div class="session-card ${statusCls}" data-session-id="${esc(r.id || '')}" data-session-prov="${provKey}">
        <div class="sess-left">
          <span class="sess-status-dot ${statusCls}" aria-label="${esc(r.status || 'idle')}"></span>
          <span class="prov-glyph">${PROVIDER_ICONS[provKey]}</span>
          <div class="sess-body">
            <div class="sess-title-row">
              <span class="sess-title">${esc(r.title || 'Untitled Session')}</span>
            </div>
            <div class="sess-sub-row tabular">
              ${devBadgeHtml}
              ${r.folder ? `<span class="tag-pill">${esc(r.folder)}</span>` : ''}
              ${r.branch ? `<span>⎇ ${esc(r.branch)}</span>` : ''}
              <span>${esc(displayModel)}</span>
              ${
                safeUsed > 0
                  ? `<span class="tag-pill tabular" aria-label="Context window usage">${fmtCompact(safeUsed)} / ${fmtCompact(limTok)} · ${ctxPct}%</span>`
                  : ''
              }
              ${bgPillHtml}
              <span>· ${timeAgo(r.at)}</span>
              ${r.open ? `<span class="tag-pill" style="color:var(--brass)">Open Tab</span>` : ''}
            </div>
          </div>
        </div>
        <div class="sess-right">
          ${
            r.status === 'working' || r.dot === 'running' || r.bgTask?.state === 'running'
              ? `<button type="button" class="sess-act-btn stop-btn" data-sess-act="stop" data-id="${esc(r.id || '')}" aria-label="Stop / interrupt running session">■ Stop</button>`
              : ''
          }
          <button type="button" class="sess-act-btn" data-sess-act="group" data-id="${esc(r.id || '')}" aria-label="Assign or move session to a group">
            📁 ${esc(grpObj ? grpObj.name : 'Group')}
          </button>
          ${
            grpObj && !r.archived
              ? `<button type="button" class="sess-act-btn" data-sess-act="group-remove" data-id="${esc(r.id || '')}" aria-label="Remove from ${esc(grpObj.name)}">✕</button>`
              : ''
          }
          <button type="button" class="sess-act-btn" data-sess-act="unread" data-id="${esc(r.id || '')}" data-val="${!r.unread}" aria-label="Toggle unread">
            ${r.unread ? '● Unread' : '○ Read'}
          </button>
          <button type="button" class="sess-act-btn" data-sess-act="archive" data-id="${esc(r.id || '')}" data-val="${!r.archived}" aria-label="${r.archived ? 'Unarchive' : 'Archive'}">
            ${r.archived ? 'Restore' : 'Archive'}
          </button>
        </div>
      </div>
    `;
  }

  function isSessionGroupCollapsed(groupId, defaultCollapsed = false) {
    if (
      prefs.collapsedSessionGroups &&
      typeof prefs.collapsedSessionGroups === 'object' &&
      groupId in prefs.collapsedSessionGroups
    ) {
      return Boolean(prefs.collapsedSessionGroups[groupId]);
    }
    return Boolean(defaultCollapsed);
  }

  function renderSessionGroupSectionHtml({
    id,
    name,
    color = 'brass',
    items = [],
    isCollapsed = false,
    isCustomGroup = false,
    archivableIds = []
  }) {
    const bodyHtml = items.length
      ? items.map((r) => renderSessionCardHtml(r)).join('')
      : `<div class="meta-timestamp" style="padding:8px 10px">No sessions in <strong>${esc(name)}</strong> yet — tap <strong>📁 Group</strong> on any session card to move it here.</div>`;

    const actionsHtml = isCustomGroup
      ? `
        <button type="button" class="group-act-btn" data-group-act="new-in-group" data-group-id="${esc(id)}" aria-label="Start new session">+ New</button>
        <button type="button" class="group-act-btn" data-group-act="rename" data-group-id="${esc(id)}" data-group-name="${esc(name)}" aria-label="Rename group">✎</button>
        <button type="button" class="group-act-btn" data-group-act="delete" data-group-id="${esc(id)}" data-group-name="${esc(name)}" aria-label="Delete group">✕</button>
      `
      : archivableIds.length > 0
        ? `<button type="button" class="group-act-btn" data-group-act="archive-closed" aria-label="Archive ${archivableIds.length} closed idle sessions">Archive closed (${archivableIds.length})</button>`
        : '';

    return `
      <div class="session-group-block ${isCollapsed ? 'collapsed' : ''}" data-session-group="${esc(id)}">
        <div class="session-group-header">
          <button type="button" class="session-group-toggle" data-group-act="toggle" data-group-id="${esc(id)}" aria-expanded="${!isCollapsed}">
            <svg class="group-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>
            <span class="group-color-dot ${esc(color)}"></span>
            <span class="group-title">${esc(name)}</span>
            <span class="group-count-pill tabular">${items.length}</span>
          </button>
          <div class="session-group-actions">
            ${actionsHtml}
          </div>
        </div>
        <div class="session-group-body">
          ${bodyHtml}
        </div>
      </div>
    `;
  }

  // VIEW 2: Render Sessions List
  function renderSessionsView() {
    syncProviderNewSessionButtons();
    const container = $('sessions-full-list');
    if (!container) return;
    const rows = (appState?.rows || []).filter((r) => r.id);
    const groups = Array.isArray(appState?.groups) ? appState.groups : [];
    const groupIds = new Set(groups.map((g) => g.id));
    const q = ($('sess-search-input')?.value || '').trim().toLowerCase();

    const activeTotalAll = rows.filter((r) => !r.archived).length;
    const runningNowCount = rows.filter((r) => !r.archived && r.status === 'working').length;
    const sumPill = $('sess-header-summary-pill');
    if (sumPill) {
      const runPart = runningNowCount > 0 ? `${runningNowCount} Running · ` : '';
      const grpPart =
        groups.length > 0 ? ` · ${groups.length} Group${groups.length === 1 ? '' : 's'}` : '';
      sumPill.textContent = `${runPart}${activeTotalAll} Sessions${grpPart}`;
    }

    // Sync active state & live counts on provider segmented buttons
    const provCounts = {
      all: rows.filter((r) => !r.archived).length,
      antigravity: rows.filter((r) => !r.archived && r.provider !== 'claude').length,
      claude: rows.filter((r) => !r.archived && r.provider === 'claude').length
    };
    const showAgySeg = provCounts.antigravity > 0;
    const showClaudeSeg = provCounts.claude > 0;
    if (
      (prefs.sessProvider === 'claude' && !showClaudeSeg) ||
      (prefs.sessProvider === 'antigravity' && !showAgySeg)
    ) {
      prefs.sessProvider = 'all';
      saveJson(STORAGE_KEYS.PREFS, prefs);
    }
    const provSegEl = $('sess-provider-seg');
    if (provSegEl) {
      provSegEl.hidden = !(showAgySeg && showClaudeSeg);
    }
    document.querySelectorAll('#sess-provider-seg .seg-btn').forEach((b) => {
      const p = b.dataset.prov;
      b.classList.toggle('active', p === prefs.sessProvider);
      const cnt = provCounts[p] ?? 0;
      if (p === 'all') {
        b.innerHTML = `<span>All</span><span class="seg-count tabular">${cnt}</span>`;
      } else if (p === 'antigravity') {
        b.innerHTML = `<span class="prov-glyph">${PROVIDER_ICONS.antigravity}</span><span>Antigravity</span><span class="seg-count tabular">${cnt}</span>`;
      } else if (p === 'claude') {
        b.innerHTML = `<span class="prov-glyph">${PROVIDER_ICONS.claude}</span><span>Claude</span><span class="seg-count tabular">${cnt}</span>`;
      }
    });

    const provOnlyRows = rows.filter(
      (r) => prefs.sessProvider === 'all' || r.provider === prefs.sessProvider
    );
    const fleetDevices = getUnifiedFleetDevices();
    const devChipsEl = $('sess-device-chips');
    if (devChipsEl) {
      if (fleetDevices.length <= 1) {
        devChipsEl.hidden = true;
      } else {
        devChipsEl.hidden = false;
        const allDevCnt = provOnlyRows.filter((r) => !r.archived).length;
        devChipsEl.innerHTML =
          `<button type="button" class="chip ${prefs.selectedDeviceFilter === 'all' ? 'active' : ''}" data-fleet-filter="all"><span class="chip-label">All Hosts</span><span class="chip-count tabular">${allDevCnt}</span></button>` +
          fleetDevices
            .map((d) => {
              const cnt = provOnlyRows.filter((r) => !r.archived && r.deviceId === d.id).length;
              return `<button type="button" class="chip ${prefs.selectedDeviceFilter === d.id ? 'active' : ''}" data-fleet-filter="${esc(d.id)}"><span class="chip-label">${d.online ? '● ' : ''}${esc(d.name || d.id)}</span><span class="chip-count tabular">${cnt}</span></button>`;
            })
            .join('');
      }
    }

    const provRows =
      prefs.selectedDeviceFilter && prefs.selectedDeviceFilter !== 'all'
        ? provOnlyRows.filter((r) => !r.deviceId || r.deviceId === prefs.selectedDeviceFilter)
        : provOnlyRows;
    const chipCounts = {
      all: provRows.filter((r) => !r.archived).length,
      needs_input: provRows.filter((r) => !r.archived && r.status === 'waiting').length,
      working: provRows.filter((r) => !r.archived && r.status === 'working').length,
      unread: provRows.filter((r) => !r.archived && r.unread).length,
      open: provRows.filter((r) => !r.archived && r.open).length,
      archived: provRows.filter((r) => r.archived).length
    };
    const chipLabels = {
      all: 'All Sessions',
      needs_input: 'Needs Input',
      working: 'Running Now',
      unread: 'Unread',
      open: 'Open Tabs',
      archived: 'Archived'
    };
    document.querySelectorAll('#sess-status-chips .chip').forEach((c) => {
      const k = c.dataset.statusFilter;
      c.classList.toggle('active', k === prefs.sessStatus);
      if (chipLabels[k] !== undefined) {
        c.innerHTML = `<span class="chip-label">${esc(chipLabels[k])}</span><span class="chip-count tabular">${chipCounts[k] ?? 0}</span>`;
      }
    });

    const rawFiltered = provRows.filter((r) => {
      if (prefs.sessStatus === 'archived') {
        if (!r.archived) return false;
      } else {
        if (r.archived) return false;
        if (prefs.sessStatus === 'needs_input' && r.status !== 'waiting') return false;
        if (prefs.sessStatus === 'working' && r.status !== 'working') return false;
        if (prefs.sessStatus === 'unread' && !r.unread) return false;
        if (prefs.sessStatus === 'open' && !r.open) return false;
      }
      if (q) {
        const grpName = r.group ? groups.find((g) => g.id === r.group)?.name || '' : '';
        const hay = `${r.title} ${r.folder} ${r.branch} ${r.model} ${r.provider} ${r.deviceName || ''} ${grpName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const filtered = q
      ? (() => {
          const exact = rawFiltered.filter((r) => String(r.title || '').toLowerCase() === q);
          const rest = rawFiltered.filter((r) => String(r.title || '').toLowerCase() !== q);
          const freqOrdered = rankByFreq(
            rest,
            'threads',
            (r) => r.id,
            (r) =>
              (r.status === 'working' ? 500 : r.status === 'waiting' ? 400 : 0) +
              Math.max(0, 299 - Math.min(299, Math.floor(Math.max(0, Date.now() - Number(r.at || 0)) / 3600000)))
          );
          return exact.concat(freqOrdered);
        })()
      : rawFiltered;

    if (isFocusInsideContainerInputs(container)) return;
    const unpairedBannerHtml =
      !hasAnyPairingCredentials() &&
      connMode !== 'local' &&
      connMode !== 'edge' &&
      connMode !== 'cloud'
        ? renderQuickPairOnboardingCardHtml('sessions')
        : '';

    if (rows.length === 0 && unpairedBannerHtml) {
      container.innerHTML = unpairedBannerHtml;
      return;
    }

    if (filtered.length === 0 && (q || prefs.sessStatus !== 'all' || groups.length === 0)) {
      const hasActiveFilters = prefs.sessProvider !== 'all' || prefs.sessStatus !== 'all' || Boolean(q);
      container.innerHTML = `${unpairedBannerHtml}
        <div class="ledger-panel" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div class="meta-timestamp">
            ${
              rows.length === 0
                ? 'Syncing live sessions from VS Code…'
                : 'No sessions match the current filter.'
            }
          </div>
          <div style="display:flex;gap:8px">
            ${
              hasActiveFilters
                ? `<button type="button" class="btn-ghost-sm" id="btn-reset-sess-filters">Reset Filters (Show All ${rows.filter((r) => !r.archived).length} Sessions)</button>`
                : ''
            }
            <button type="button" class="btn-brass-sm" id="btn-empty-sync-now">↻ Sync VS Code</button>
          </div>
        </div>
      `;
      return;
    }

    // Render collapsible Group sections at top when not searching and not in Archived-only mode
    if (!q && groups.length > 0 && prefs.sessStatus !== 'archived') {
      const groupPalette = ['blue', 'green', 'amber', 'purple', 'steel'];
      let sectionsHtml = unpairedBannerHtml;
      groups.forEach((g, idx) => {
        const gItems = filtered.filter((r) => r.group === g.id);
        if ((q || prefs.sessStatus !== 'all') && gItems.length === 0) {
          return;
        }
        const isCollapsed =
          q || prefs.sessStatus !== 'all'
            ? false
            : isSessionGroupCollapsed(g.id, gItems.length === 0 ? true : Boolean(g.collapsed));
        sectionsHtml += renderSessionGroupSectionHtml({
          id: g.id,
          name: g.name || 'Group',
          color: g.color || groupPalette[idx % groupPalette.length],
          items: gItems,
          isCollapsed,
          isCustomGroup: true
        });
      });

      const ungroupedItems = filtered.filter((r) => !r.group || !groupIds.has(r.group));
      if (ungroupedItems.length > 0) {
        const archivableIds = ungroupedItems
          .filter(
            (r) =>
              r.id &&
              !r.open &&
              r.status !== 'working' &&
              r.status !== 'waiting' &&
              !r.unread
          )
          .map((r) => r.id);
        const isUngroupedCollapsed =
          q || prefs.sessStatus !== 'all'
            ? false
            : isSessionGroupCollapsed('ungrouped', false);
        sectionsHtml += renderSessionGroupSectionHtml({
          id: 'ungrouped',
          name: 'Ungrouped',
          color: 'brass',
          items: ungroupedItems,
          isCollapsed: isUngroupedCollapsed,
          isCustomGroup: false,
          archivableIds
        });
      }

      container.innerHTML = sectionsHtml;
      return;
    }

    container.innerHTML =
      unpairedBannerHtml + filtered.map((r) => renderSessionCardHtml(r)).join('');
  }

  function coalesceThreadMessages(rawMessages) {
    if (!Array.isArray(rawMessages) || rawMessages.length === 0) return [];
    const merged = [];
    for (const m of rawMessages) {
      if (!m) continue;
      const prev = merged[merged.length - 1];
      const prevHasAnsweredQuestion =
        Array.isArray(prev?.questions) && prev.questions.some((q) => q && q.answered);
      if (prev && prev.role === 'assistant' && m.role === 'assistant' && !prevHasAnsweredQuestion) {
        if (m.text) {
          prev.text = prev.text ? `${prev.text}\n\n${m.text}` : m.text;
        }
        if (m.thinking) {
          prev.thinking = prev.thinking ? `${prev.thinking}\n\n${m.thinking}` : m.thinking;
        }
        if (m.latestThinking) {
          prev.latestThinking = m.latestThinking;
        }
        if (Array.isArray(m.toolCalls) && m.toolCalls.length) {
          prev.toolCalls = [...(prev.toolCalls || []), ...m.toolCalls].slice(-28);
        }
        if (Array.isArray(m.questions) && m.questions.length) {
          prev.questions = [...(prev.questions || []), ...m.questions];
        }
        if (Array.isArray(m.artifacts) && m.artifacts.length) {
          const nextArts = [...(prev.artifacts || [])];
          for (const art of m.artifacts) {
            if (!art) continue;
            const idx = nextArts.findIndex((a) => a && a.file === art.file);
            if (idx >= 0) nextArts[idx] = art;
            else nextArts.push(art);
          }
          prev.artifacts = nextArts.slice(-6);
        }
        if (m.createdAt) prev.createdAt = m.createdAt;
      } else {
        merged.push({
          ...m,
          toolCalls: Array.isArray(m.toolCalls) ? [...m.toolCalls] : [],
          questions: Array.isArray(m.questions) ? [...m.questions] : [],
          artifacts: Array.isArray(m.artifacts) ? [...m.artifacts] : []
        });
      }
    }
    return merged;
  }

  const chatOpenDetailsByThread = new Map();

  function getThreadOpenDetailsMap(threadId, create = false) {
    const clean = String(threadId || '').trim();
    if (!clean) return null;
    let map = chatOpenDetailsByThread.get(clean);
    if (!map && create) {
      map = new Map();
      chatOpenDetailsByThread.set(clean, map);
    }
    return map || null;
  }

  function renderToolCallCardHtml(tc, detailKey = '', savedOpenMap = null) {
    const rawName = String(tc?.name || 'tool').trim();
    const low = rawName.toLowerCase();
    let kind = tc?.kind || 'tool';
    let label = tc?.label || rawName;
    if (!tc?.kind) {
      if (low.includes('replace') || low.includes('edit') || low === 'multiedit') {
        kind = 'edit';
        label = 'Edited';
      } else if (low.includes('write') || low.includes('create')) {
        kind = 'write';
        label = 'Created';
      } else if (low.includes('view') || low.includes('read')) {
        kind = 'read';
        label = 'Analyzed';
      } else if (low.includes('command') || low === 'bash') {
        kind = 'command';
        label = 'Ran';
      } else if (low.includes('grep') || low.includes('find') || low.includes('glob') || low.includes('search')) {
        kind = 'search';
        label = 'Searched';
      }
    } else {
      if (kind === 'read' && /^viewed$/i.test(label)) label = 'Analyzed';
      if (kind === 'command' && /^ran command$/i.test(label)) label = 'Ran';
    }

    const fileBase = String(tc?.file || '').trim();
    const fileStem = fileBase.split('#')[0].trim();
    const relPath = String(tc?.relPath || fileStem || '').trim();
    const lineRange = String(tc?.lineRange || (fileBase.includes('#') ? fileBase.split('#')[1] : '') || '').trim();
    const added = Number(tc?.addedLines ?? tc?.added ?? 0);
    const removed = Number(tc?.removedLines ?? tc?.removed ?? 0);
    const summaryText = String(tc?.summary || '').trim();
    const commandText = String(tc?.command || '').trim();
    const snippet = String(tc?.snippet || tc?.diff || '').trim();

    const fileChip = fileBase
      ? renderFileChipHtml(lineRange && !fileBase.includes('#') ? `${fileBase}#${lineRange}` : fileBase)
      : '';
    const diffBadge =
      added > 0 || removed > 0
        ? `<span class="code-diff-stat tabular">${added > 0 ? `<span class="diff-add">+${added}</span>` : ''}${removed > 0 ? `<span class="diff-del">-${removed}</span>` : ''}</span>`
        : '';

    const redundantReadSummary =
      fileStem &&
      (summaryText === fileBase ||
        summaryText === fileStem ||
        new RegExp(`^(?:read|view|viewed|analyzed)\\s+${fileStem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(summaryText));
    const displaySummary = redundantReadSummary ? '' : summaryText.slice(0, 115);

    const hasInspectableBody = Boolean(snippet || commandText || relPath || summaryText);
    const isStepOpen = Boolean(detailKey && savedOpenMap && savedOpenMap.get(detailKey) === true);
    const detailKeyAttrs = detailKey
      ? ` data-chat-detail-key="${esc(detailKey)}" data-rendered-open="${isStepOpen ? '1' : '0'}"${isStepOpen ? ' open' : ''}`
      : '';

    const headInner = `
      <div class="code-step-head">
        <span class="code-step-badge kind-${esc(kind)}">${esc(label)}</span>
        ${fileChip}
        ${displaySummary ? `<span class="code-step-summary${kind === 'command' ? ' mono' : ''}">${esc(displaySummary)}</span>` : ''}
        ${diffBadge}
        ${hasInspectableBody ? `<span class="code-step-chevron" aria-hidden="true">›</span>` : ''}
      </div>
    `;

    if (snippet) {
      return `
        <details class="code-step-card has-snippet is-interactive"${detailKeyAttrs}>
          <summary>${headInner}</summary>
          <div class="code-step-detail-box">
            ${relPath ? `<div class="code-step-detail-bar"><span class="mono">${esc(relPath)}${lineRange ? `#${esc(lineRange)}` : ''}</span><button type="button" class="ide-step-mention-btn" data-step-mention-file="${esc(relPath)}">@ Mention</button></div>` : ''}
            <pre class="code-step-snippet mono">${formatGitDiffHtml(snippet)}</pre>
          </div>
        </details>
      `;
    }

    if (hasInspectableBody) {
      const detailLine = commandText || (relPath ? `${relPath}${lineRange ? ` (${lineRange})` : ''}` : '') || summaryText;
      return `
        <details class="code-step-card is-interactive"${detailKeyAttrs}>
          <summary>${headInner}</summary>
          <div class="code-step-detail-box">
            <div class="code-step-detail-bar">
              <span class="mono">${esc(detailLine)}</span>
              ${relPath ? `<button type="button" class="ide-step-mention-btn" data-step-mention-file="${esc(relPath)}">@ Mention</button>` : ''}
            </div>
            ${summaryText && summaryText !== detailLine ? `<div class="code-step-detail-note">${esc(summaryText)}</div>` : ''}
          </div>
        </details>
      `;
    }

    return `<div class="code-step-card">${headInner}</div>`;
  }

  function syncComposerRoutingSelectors(activeRow, isNewDraft) {
    const devSel = $('composer-device-select');
    const repoSel = $('composer-repo-select');
    const directBtn = $('composer-direct-toggle');
    const fleetDevices = getUnifiedFleetDevices();

    if (devSel && document.activeElement !== devSel) {
      const wantDev = !isNewDraft && activeRow?.deviceId
        ? activeRow.deviceId
        : prefs.composerTargetDevice || 'auto';
      const opts = [
        `<option value="auto" ${wantDev === 'auto' ? 'selected' : ''}>Auto (${esc(localWsDevice?.name || 'Active Host')})</option>`
      ];
      for (const d of fleetDevices) {
        const sel = wantDev === d.id ? 'selected' : '';
        opts.push(
          `<option value="${esc(d.id)}" ${sel}>${d.online ? '● ' : '◐ '}${esc(d.name || d.id)}</option>`
        );
      }
      devSel.innerHTML = opts.join('');
      devSel.disabled = Boolean(!isNewDraft && activeRow?.deviceId);
    }

    if (repoSel && document.activeElement !== repoSel) {
      const rawWorkspaces = Array.isArray(appState?.workspaces) ? appState.workspaces : [];
      const rankedWorkspaces = rankByFreq(
        rawWorkspaces,
        'repos',
        (w) => w.name || w.id,
        (w) => Number(w.dirtyCount || 0) * 10
      );
      const curRepo = String(prefs.composerRepoPrefix || '').trim();
      const repoOpts = [
        `<option value="" ${!curRepo ? 'selected' : ''}>Default Workspace</option>`
      ];
      for (const w of rankedWorkspaces) {
        const val = w.name || w.id;
        const sel = curRepo.toLowerCase() === String(val).toLowerCase() ? 'selected' : '';
        repoOpts.push(
          `<option value="${esc(val)}" ${sel}>${esc(w.name)}${w.branch ? ` (${esc(w.branch)})` : ''}</option>`
        );
      }
      repoSel.innerHTML = repoOpts.join('');
    }

    if (directBtn) {
      const isDirect = prefs.composerDirectStream !== false;
      directBtn.classList.toggle('active', isDirect);
      directBtn.textContent = isDirect ? '⚡ Direct' : '🪟 IDE Tab';
    }
  }

  // VIEW 3: Render Live Chat Workbench
  function renderChatView(forceScroll = false) {
    ensureSelectedThread();
    syncAndRenderEditorTabs();
    updateComposerModePills();
    const rows = (appState?.rows || []).filter((r) => r.id && !r.draft);
    const isNewDraft = isNewSessionMode();
    const newProv = prefs.composerMode === 'new-claude' ? 'claude' : 'antigravity';
    const threadDetail = isNewDraft ? null : threadsCache[prefs.selectedThreadId] || null;
    const matchedRow = isNewDraft ? null : rows.find((r) => r.id === prefs.selectedThreadId);
    syncComposerRoutingSelectors(matchedRow, isNewDraft);
    const activeRow = isNewDraft
      ? {
          id: '__new__',
          title: `New ${newProv === 'claude' ? 'Claude Code' : 'Antigravity'} Session`,
          provider: newProv,
          folder: prefs.composerRepoPrefix
            ? `Scope: ${prefs.composerRepoPrefix}`
            : 'New Unrelated Session',
          model: newProv === 'claude' ? 'Claude Opus 4.7 (1M)' : 'Gemini 3.1 Pro',
          status: 'idle',
          at: Date.now()
        }
      : matchedRow ||
        (prefs.selectedThreadId
          ? {
              id: prefs.selectedThreadId,
              title:
                threadDetail?.title ||
                pinnedNavTitle ||
                'Task Session',
              provider:
                threadDetail?.provider ||
                pinnedNavProvider ||
                'antigravity',
              folder: threadDetail?.folder || '',
              model: threadDetail?.model || '',
              status: 'done',
              at: Date.now()
            }
          : rows[0]);

    const selectEl = $('chat-session-select');
    if (selectEl && document.activeElement !== selectEl) {
      const topRows = rankByFreq(
        rows.slice(0, 80),
        'threads',
        (r) => r.id,
        (r) =>
          (r.status === 'working' ? 500 : r.status === 'waiting' ? 400 : 0) +
          Math.max(0, 299 - Math.min(299, Math.floor(Math.max(0, Date.now() - Number(r.at || 0)) / 3600000)))
      );
      if (
        !isNewDraft &&
        prefs.selectedThreadId &&
        activeRow &&
        !topRows.some((r) => r.id === prefs.selectedThreadId)
      ) {
        topRows.unshift(activeRow);
      }
      const newOptionsList = [];
      if (hasSignedInProviderRemote('antigravity')) {
        newOptionsList.push(
          `<option value="__new_antigravity__" ${isNewDraft && newProv === 'antigravity' ? 'selected' : ''}>✨ + New Antigravity Session (Unrelated)</option>`
        );
      }
      if (hasSignedInProviderRemote('claude')) {
        newOptionsList.push(
          `<option value="__new_claude__" ${isNewDraft && newProv === 'claude' ? 'selected' : ''}>✨ + New Claude Code Session (Unrelated)</option>`
        );
      }
      const newOptionsHtml = newOptionsList.join('');
      selectEl.innerHTML =
        newOptionsHtml +
        topRows
          .map(
            (r) =>
              `<option value="${esc(r.id)}" ${!isNewDraft && r.id === prefs.selectedThreadId ? 'selected' : ''}>[${r.provider === 'claude' ? 'Claude' : 'AGY'}] ${esc(r.title)} (${timeAgo(r.at)})</option>`
          )
          .join('');
    }

    const provKey = isNewDraft
      ? newProv
      : (threadDetail?.provider || activeRow?.provider) === 'claude'
        ? 'claude'
        : 'antigravity';

    const badgeEl = $('chat-prov-badge');
    if (badgeEl) {
      badgeEl.innerHTML = `<span class="prov-glyph">${PROVIDER_ICONS[provKey]}</span>`;
    }
    const folderLabel = isNewDraft
      ? activeRow.folder
      : threadDetail?.folder ||
        activeRow?.folder ||
        (prefs.composerRepoPrefix ? `Scope: ${prefs.composerRepoPrefix}` : 'BHFIRMS Workspace');
    const folderEl = $('chat-folder-pill');
    if (folderEl) {
      folderEl.textContent = folderLabel;
    }

    // Keep selectedRepoId aligned with the active session's workspace if a matching repo exists
    if (!isNewDraft && folderLabel && Array.isArray(appState?.workspaces)) {
      const fLow = folderLabel.toLowerCase();
      const matchedWs = appState.workspaces.find(
        (w) =>
          w.id.toLowerCase() === fLow ||
          w.name.toLowerCase() === fLow ||
          (w.path && w.path.toLowerCase().endsWith(`\\${fLow}`))
      );
      if (matchedWs && prefs.selectedRepoId !== matchedWs.id) {
        prefs.selectedRepoId = matchedWs.id;
      }
    }

    const rawCtx = threadDetail?.contextWindow || {};
    const resolvedModelLabel = normalizeDisplayModel(
      rawCtx.modelLabel || threadDetail?.model || activeRow?.model,
      provKey
    );
    const modelEl = $('chat-model-pill');
    if (modelEl) {
      modelEl.textContent = resolvedModelLabel;
    }

    // Context Window Pill & Popover (256k for Antigravity, 1M / 200k for Claude Code)
    const defaultLimit = inferDefaultContextLimit(provKey, resolvedModelLabel);
    const rawLimit = Number(rawCtx.limitTokens || rawCtx.maxContextTokens || defaultLimit);
    const limitTokens =
      provKey === 'antigravity' && (!rawLimit || rawLimit === 1000000 || rawLimit > 256000)
        ? 256000
        : provKey === 'claude' && rawLimit === 200000 && defaultLimit === 1000000
          ? 1000000
          : rawLimit || defaultLimit;
    let usedTokens = isNewDraft
      ? 0
      : Number(rawCtx.usedTokens || activeRow?.usedTokens || 22019);
    if (!isNewDraft && provKey === 'antigravity' && (rawLimit === 1000000 || usedTokens > 256000)) {
      usedTokens = Math.min(220000, Math.max(22019, Math.round(usedTokens * 0.145)));
    }
    const pct = isNewDraft
      ? 0
      : Math.min(100, Math.max(1, Math.round((usedTokens / Math.max(1, limitTokens)) * 100)));
    const breakdownArr = isNewDraft
      ? [
          { label: 'System Prompt & Rules', tokens: 0, color: '#D9A54A' },
          { label: 'Tool I/O & Files', tokens: 0, color: '#10B981' },
          { label: 'Conversation & Responses', tokens: 0, color: '#4F8FD6' }
        ]
      : Array.isArray(rawCtx.breakdown)
        ? rawCtx.breakdown
        : [
            { label: 'System Prompt & Rules', tokens: Math.round(usedTokens * 0.35), color: '#D9A54A' },
            { label: 'Tool I/O & Files', tokens: Math.round(usedTokens * 0.45), color: '#10B981' },
            { label: 'Conversation & Responses', tokens: Math.max(200, usedTokens - Math.round(usedTokens * 0.8)), color: '#4F8FD6' }
          ];
    const ctx = {
      usedTokens,
      limitTokens,
      pct,
      remainingTokens: Math.max(0, limitTokens - usedTokens),
      modelLabel: resolvedModelLabel,
      breakdown: breakdownArr
    };
    const pillLbl = $('ctx-pill-label');
    if (pillLbl) {
      pillLbl.textContent = `${fmtCompact(ctx.usedTokens)} / ${fmtCompact(ctx.limitTokens)} · ${ctx.pct}%`;
    }
    const circle = $('ctx-ring-circle');
    if (circle) {
      const circum = 56.5;
      const offset = circum - (Math.min(100, Math.max(isNewDraft ? 0 : 2, ctx.pct)) / 100) * circum;
      circle.setAttribute('stroke-dashoffset', String(offset));
    }

    renderContextPopover(ctx);
    renderChatBgTasks(activeRow, threadDetail, provKey, isNewDraft);

    // Conversation Stream
    const streamEl = $('chat-stream');
    if (!streamEl) return;
    if (isNewDraft) {
      const provDisplay = provKey === 'claude' ? 'Claude Code' : 'Google Antigravity';
      const grpObj = prefs.newSessionGroupId
        ? (appState?.groups || []).find((g) => g && g.id === prefs.newSessionGroupId)
        : null;
      streamEl.innerHTML = `
        <div class="turn-bubble" style="border-color:var(--brass)">
          <div class="turn-head">
            <span class="turn-role">✨ New ${esc(provDisplay)} Session</span>
            <span class="pill-count emerald">Fresh Context · 0% Used</span>
          </div>
          <div class="turn-text">
            Starting a <strong>brand-new, unrelated ${esc(provDisplay)} session</strong>${grpObj ? ` in group <strong>${esc(grpObj.name)}</strong>` : ''} with a clean context window.<br>
            Type your prompt below and press <strong>Send</strong> to launch this new session in VS Code (or tap <strong>Open on Laptop</strong> above to open a blank tab immediately).
          </div>
        </div>
      `;
      lastRenderedThreadId = '__new__';
      lastRenderedMsgCount = 0;
      updateComposerActionButton();
      return;
    }
    if (
      document.activeElement &&
      streamEl.contains(document.activeElement) &&
      document.activeElement.matches('[data-q-writein-input]')
    ) {
      updateComposerActionButton();
      return;
    }
    const wasNearBottom =
      streamEl.scrollHeight - streamEl.scrollTop - streamEl.clientHeight < 100;
    const messages = coalesceThreadMessages(threadDetail?.messages || []);
    const isSyncingThread =
      connMode === 'cloud' &&
      prefs.selectedThreadId &&
      pendingThreadRequests.has(prefs.selectedThreadId);
    const sessionApprovals = (appState?.approvals || []).filter(
      (a) => a && a.sessionId === prefs.selectedThreadId
    );
    const matchingQuestionApproval = sessionApprovals.find(
      (a) =>
        a.kind === 'question' ||
        Boolean(a.isToolPermission) ||
        /question/i.test(String(a.toolName || '')) ||
        (Array.isArray(a.questions) && a.questions.length > 0) ||
        (Array.isArray(a.options) && a.options.length > 0)
    );
    let questionRenderedInTurn = false;

    const buildSessionApprovalHtml = (skipQuestionApprovals = false) =>
      sessionApprovals
        .map((a) => {
          const aProv = a.provider === 'claude' ? 'claude' : 'antigravity';
          const isQ =
            a.kind === 'question' ||
            Boolean(a.isToolPermission) ||
            /question/i.test(String(a.toolName || '')) ||
            (Array.isArray(a.questions) && a.questions.length > 0) ||
            (Array.isArray(a.options) && a.options.length > 0);
          if (isQ) {
            if (skipQuestionApprovals) return '';
            const qList = resolveQuestionsForApproval(a, messages);
            if (qList.length > 0) {
              return renderInteractiveQuestionCardHtml({
                cardKey: `q-chat-${prefs.selectedThreadId}-${a.approvalId || 'active'}`,
                sessionId: prefs.selectedThreadId,
                provider: aProv,
                approvalId: a.approvalId || prefs.selectedThreadId,
                selector: a.selector || '',
                questions: qList
              });
            }
          }
          if (a.kind === 'waiting_session' && skipQuestionApprovals) {
            return '';
          }
          return `
            <div class="approval-card" data-approval-id="${esc(a.id)}" style="margin-top:8px">
              <div class="approval-top">
                <span class="approval-prov">
                  <span class="prov-glyph">${PROVIDER_ICONS[aProv]}</span>
                  <span>${aProv === 'claude' ? 'Claude Code' : 'Antigravity'} · Action Required</span>
                </span>
                <span class="approval-tool-badge tabular">${esc(a.toolName || 'Permission')}</span>
              </div>
              <div class="approval-title">${esc(a.title || activeRow?.title || 'Session')}</div>
              <div class="approval-detail mono">${esc(a.detail || '')}</div>
              ${
                a.kind === 'waiting_session'
                  ? `<div class="meta-timestamp" style="margin-top:6px">Waiting for your response — type your reply in the composer below.</div>`
                  : `<div class="approval-actions">
                      <button type="button" class="btn-approve" data-approve-act="approve" data-app-id="${esc(a.approvalId)}" data-sess-id="${esc(a.sessionId)}" data-prov="${aProv}" data-sel="${esc(a.selector || '')}" data-lbl="${esc(a.toolName || 'Accept')}">✓ Approve</button>
                      <button type="button" class="btn-reject" data-approve-act="reject" data-app-id="${esc(a.approvalId)}" data-sess-id="${esc(a.sessionId)}" data-prov="${aProv}" data-sel="${esc(a.selector || '')}">✕ Deny</button>
                    </div>`
              }
            </div>
          `;
        })
        .join('');

    if (messages.length === 0) {
      streamEl.innerHTML = `
        <div class="turn-bubble">
          <div class="turn-head">
            <span class="turn-role">${isSyncingThread ? 'Syncing Transcript…' : 'THEO Remote Bridge'}</span>
            <span>${isSyncingThread ? 'Cloud Relay' : 'Ready'}</span>
          </div>
          <div class="turn-text">
            ${
              isSyncingThread
                ? `Requesting live transcript for <strong>${esc(activeRow?.title || 'Session')}</strong> from VS Code…`
                : `Select any session above to view the live transcript from <strong>${esc(activeRow?.title || 'VS Code')}</strong>.`
            }
          </div>
        </div>
        ${buildSessionApprovalHtml(false)}
      `;
      lastRenderedThreadId = prefs.selectedThreadId;
      lastRenderedMsgCount = 0;
    } else {
      const savedOpenMap = getThreadOpenDetailsMap(prefs.selectedThreadId, false);
      const turnsHtml = messages
        .map((m, msgIdx) => {
          const isUser = m.role === 'user';
          const isLastTurn = msgIdx === messages.length - 1;
          const turnIdKey = String(m.id || `turn-${msgIdx}`);
          const toolCalls = Array.isArray(m.toolCalls) ? m.toolCalls : [];
          const toolCount = Number(m.totalTurnTools || toolCalls.length);
          const editTools = toolCalls.filter((t) => t.kind === 'edit' || t.kind === 'write');
          const changedFilesSet = new Set(
            editTools.map((t) => t.relPath || t.file || t.summary).filter(Boolean)
          );
          const filesChangedCount = changedFilesSet.size || editTools.length;
          const totalAdded = editTools.reduce((acc, t) => acc + Number(t.addedLines || 0), 0);
          const totalRemoved = editTools.reduce((acc, t) => acc + Number(t.removedLines || 0), 0);

          const summaryHtmlParts = [];
          const lastTool = toolCalls[toolCalls.length - 1];
          if (isLastTurn && activeRow?.status === 'working' && lastTool?.file) {
            summaryHtmlParts.push(`<span>Working on ${esc(lastTool.file)}</span>`);
          }
          if (filesChangedCount > 0) {
            const diffHtml =
              totalAdded > 0 || totalRemoved > 0
                ? ` <span class="tabular"><span class="diff-add">+${totalAdded}</span> <span class="diff-del">-${totalRemoved}</span></span>`
                : '';
            summaryHtmlParts.push(
              `<span>${filesChangedCount} ${filesChangedCount === 1 ? 'file' : 'files'} changed${diffHtml}</span>`
            );
          }
          summaryHtmlParts.push(
            `<span>${toolCount} ${toolCount === 1 ? 'step' : 'steps'}</span>`
          );
          const summaryLabelHtml = `<span class="tools-summary-left">${summaryHtmlParts.join(' <span style="opacity:0.45">·</span> ')}</span><span class="tools-summary-chevron">▾</span>`;

          const allStepsSavedOpen =
            toolCalls.length >= 2 &&
            Boolean(savedOpenMap) &&
            toolCalls.every((_, sIdx) => savedOpenMap.get(`${turnIdKey}:step:${sIdx}`) === true);
          const stepsToolbarHtml =
            toolCalls.length >= 2
              ? `<div class="code-steps-toolbar"><button type="button" class="ide-steps-toggle-all" data-toggle-all-steps="1">${allStepsSavedOpen ? 'Collapse all' : 'Expand all'}</button></div>`
              : '';
          const toolCardsHtml = toolCalls.length
            ? `<div class="code-steps-stack">${stepsToolbarHtml}${toolCalls.map((tc, sIdx) => renderToolCallCardHtml(tc, `${turnIdKey}:step:${sIdx}`, savedOpenMap)).join('')}</div>`
            : '';

          const artifacts = Array.isArray(m.artifacts) ? m.artifacts : [];
          const artifactsHtml = artifacts
            .map((art, aIdx) => {
              const artKey = `${turnIdKey}:art:${aIdx}`;
              const isArtOpen = Boolean(savedOpenMap && savedOpenMap.get(artKey) === true);
              return `
                <details class="vs-artifact-card" data-chat-detail-key="${esc(artKey)}" data-rendered-open="${isArtOpen ? '1' : '0'}"${isArtOpen ? ' open' : ''}>
                  <summary class="vs-artifact-summary">
                    <div class="vs-artifact-head">
                      <svg class="vs-artifact-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2H7a1.5 1.5 0 0 1 1.5 1.5v10A1.5 1.5 0 0 0 7 12H3.5A1.5 1.5 0 0 1 2 10.5v-7z"/>
                        <path d="M14 3.5A1.5 1.5 0 0 0 12.5 2H9a1.5 1.5 0 0 0-1.5 1.5v10A1.5 1.5 0 0 1 9 12h3.5a1.5 1.5 0 0 0 1.5-1.5v-7z"/>
                      </svg>
                      <span>${esc(art.title || 'Walkthrough')}</span>
                    </div>
                    ${art.summary ? `<div class="vs-artifact-desc">${formatTurnMarkdown(art.summary)}</div>` : ''}
                  </summary>
                  ${art.content ? `<div class="vs-artifact-body turn-text md-rich">${formatTurnMarkdown(art.content)}</div>` : ''}
                </details>
              `;
            })
            .join('');

          const timeLabel = m.createdAt ? timeAgo(Date.parse(m.createdAt)) : '';

          if (isUser) {
            return `
              <div class="turn-bubble user">
                <div class="turn-text">${esc(m.text || '')}</div>
              </div>
            `;
          }

          const turnQuestionsAlreadyServerAnswered =
            Array.isArray(m.questions) && m.questions.length > 0 && m.questions.some((q) => Boolean(q?.answered));
          const effectiveTurnApproval =
            isLastTurn && !turnQuestionsAlreadyServerAnswered ? matchingQuestionApproval : null;
          const { questions: turnQuestions, cleanedText } = resolveQuestionsForTurn(
            m,
            effectiveTurnApproval
          );
          const hasTurnQuestions = turnQuestions.length > 0;
          const turnAnsweredState = hasTurnQuestions
            ? lookupAnsweredQuestionState({
                sessionId: prefs.selectedThreadId,
                approvalId: effectiveTurnApproval?.approvalId || '',
                turnId: turnIdKey,
                questions: turnQuestions,
                isLastTurn
              })
            : null;
          if (isLastTurn && hasTurnQuestions && !turnAnsweredState?.answered) {
            questionRenderedInTurn = true;
          }

          const toolsKey = `${turnIdKey}:tools`;
          const defaultToolsOpen =
            cleanedText || hasTurnQuestions
              ? Boolean(isLastTurn && activeRow?.status === 'working')
              : true;
          const isToolsOpen =
            savedOpenMap && savedOpenMap.has(toolsKey)
              ? savedOpenMap.get(toolsKey)
              : defaultToolsOpen;
          const toolsPanelCls =
            cleanedText || hasTurnQuestions ? 'tools-details' : 'tools-details active-tools-panel';
          const toolsHtml = toolCalls.length
            ? `<details class="${toolsPanelCls}" data-chat-detail-key="${esc(toolsKey)}" data-rendered-open="${isToolsOpen ? '1' : '0'}"${isToolsOpen ? ' open' : ''}><summary>${summaryLabelHtml}</summary>${toolCardsHtml}</details>`
            : '';

          const liveThought =
            !cleanedText && !hasTurnQuestions && (m.latestThinking || m.thinking)
              ? String(m.latestThinking || m.thinking)
                  .trim()
                  .split(/\n\n+/)
                  .pop()
              : '';

          const thinkKey = `${turnIdKey}:think`;
          const defaultThinkOpen = Boolean(!cleanedText && !hasTurnQuestions && isLastTurn);
          const isThinkOpen =
            savedOpenMap && savedOpenMap.has(thinkKey)
              ? savedOpenMap.get(thinkKey)
              : defaultThinkOpen;
          const thinkHtml = m.thinking
            ? `<details class="thinking-details" data-chat-detail-key="${esc(thinkKey)}" data-rendered-open="${isThinkOpen ? '1' : '0'}"${isThinkOpen ? ' open' : ''}><summary>Reasoning &amp; Internal Thought</summary><div class="turn-text mono" style="margin-top:6px">${esc(m.thinking)}</div></details>`
            : liveThought
              ? `<div class="thinking-details"><div class="turn-text mono">${esc(liveThought)}</div></div>`
              : '';

          const questionCardHtml = hasTurnQuestions
            ? renderInteractiveQuestionCardHtml({
                cardKey:
                  isLastTurn && effectiveTurnApproval
                    ? `q-chat-${prefs.selectedThreadId}-${effectiveTurnApproval.approvalId || 'active'}`
                    : `q-turn-${prefs.selectedThreadId}-${turnIdKey}`,
                sessionId: prefs.selectedThreadId,
                provider: provKey,
                approvalId:
                  (isLastTurn && effectiveTurnApproval?.approvalId) || prefs.selectedThreadId,
                turnId: turnIdKey,
                stepIndex: effectiveTurnApproval?.stepIndex ?? null,
                selector: (isLastTurn && effectiveTurnApproval?.selector) || '',
                isLastTurn,
                hasFollowingTurn: !isLastTurn,
                answeredState: turnAnsweredState,
                plainQuestionFallback:
                  !effectiveTurnApproval && (!Array.isArray(m.questions) || m.questions.length === 0),
                questions: turnQuestions
              })
            : '';

          const isLiveStreamingTurn = Boolean(isLastTurn && m.isStreaming);
          const liveHeadHtml = isLiveStreamingTurn
            ? `<div class="stream-live-head"><span data-stream-status-lbl="1">⚡ Live Stream${m.deviceName ? ` · ${esc(m.deviceName)}` : ''}</span></div>`
            : '';
          const liveToolHtml = isLiveStreamingTurn
            ? `<div class="live-tool-chip mono" data-stream-tool-slot="1" ${m.activeTool ? '' : 'hidden'}>${m.activeTool ? `⚡ ${esc(m.activeTool)}` : ''}</div>`
            : '';
          const streamThinkHtml = isLiveStreamingTurn
            ? `<details class="thinking-details is-streaming" data-stream-think-wrap="1" open ${m.thinking ? '' : 'hidden'}><summary>Live Reasoning &amp; Thought</summary><div class="turn-text mono" data-stream-think-body="1" style="margin-top:6px">${esc(m.thinking || '')}</div></details>`
            : thinkHtml;
          const streamTextHtml = isLiveStreamingTurn
            ? `<div class="turn-text md-rich" data-stream-text-body="1">${cleanedText ? formatTurnMarkdown(cleanedText) : ''}<span class="stream-cursor"></span></div>`
            : cleanedText
              ? `<div class="turn-text md-rich">${formatTurnMarkdown(cleanedText)}</div>`
              : '';

          return `
            <div class="turn-bubble assistant ${isLiveStreamingTurn ? 'is-streaming' : ''}" ${isLiveStreamingTurn ? 'data-streaming-turn="1"' : ''}>
              ${liveHeadHtml}
              ${streamThinkHtml}
              ${liveToolHtml}
              ${streamTextHtml}
              ${artifactsHtml}
              ${toolsHtml}
              ${questionCardHtml}
              ${timeLabel ? `<div class="turn-foot tabular">${esc(timeLabel)}</div>` : ''}
            </div>
          `;
        })
        .join('');

      streamEl.innerHTML = turnsHtml + buildSessionApprovalHtml(questionRenderedInTurn);

      if (
        forceScroll ||
        prefs.selectedThreadId !== lastRenderedThreadId ||
        messages.length > lastRenderedMsgCount ||
        wasNearBottom
      ) {
        streamEl.scrollTop = streamEl.scrollHeight;
      }
      lastRenderedThreadId = prefs.selectedThreadId;
      lastRenderedMsgCount = messages.length;
    }
    updateComposerActionButton();
  }

  function renderFileChipHtml(rawLabel) {
    const clean = String(rawLabel || '')
      .trim()
      .replace(/^`+|`+$/g, '');
    let ico = '📄';
    if (/\.md(#|$)/i.test(clean)) ico = 'M↓';
    else if (/\.py(#|$)/i.test(clean)) ico = 'py';
    else if (/\.(js|ts|cjs|mjs)(#|$)/i.test(clean)) ico = 'JS';
    else if (/\.(sh|ps1|bat|cmd)(#|$)/i.test(clean)) ico = '>_';
    else if (/\.json(#|$)/i.test(clean)) ico = '{}';
    else if (/\.(css|html)(#|$)/i.test(clean)) ico = '<>';
    return `<span class="md-file-chip"><span class="md-chip-ico">${ico}</span><span>${esc(clean)}</span></span>`;
  }

  function formatTurnMarkdown(rawText) {
    if (!rawText) return '';
    let src = String(rawText)
      .replace(/\r\n/g, '\n')
      .replace(/<truncated\s+\d+\s+bytes>/gi, '…');

    const codeBlocks = [];
    src = src.replace(/```(\w*)\n([\s\S]*?)```/g, (_, _lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push(`<pre><code>${esc(code.replace(/\n$/, ''))}</code></pre>`);
      return `\n\x00CODEBLOCK_${idx}\x00\n`;
    });

    const chips = [];
    const pushChip = (label) => {
      const idx = chips.length;
      chips.push(renderFileChipHtml(label));
      return `\x00CHIP_${idx}\x00`;
    };

    // Convert [label](file:///...) or [`label`](file:///...) or [label](conversation://...) (even if truncated mid-URL) into VS Code file chips
    src = src.replace(
      /\[`?([^`\]\n]+)`?\]\((?:file|conversation):\/\/[^)\s]*\)?/gi,
      (_, label) => pushChip(label)
    );
    // Convert any bare file:/// URLs into compact basename chips
    src = src.replace(/(^|[\s(])file:\/\/\/([^\s)]+)/gi, (_, prefix, rawPath) => {
      let base = rawPath;
      try {
        base = decodeURIComponent(rawPath).split(/[\\/]/).pop() || rawPath;
      } catch {
        base = rawPath.split(/[\\/]/).pop() || rawPath;
      }
      return `${prefix}${pushChip(base)}`;
    });

    const inlineCodes = [];
    src = src.replace(/`([^`\n]+)`/g, (_, code) => {
      const idx = inlineCodes.length;
      inlineCodes.push(`<code class="md-inline-code">${esc(code)}</code>`);
      return `\x00INLINECODE_${idx}\x00`;
    });

    const formatInline = (lineStr) => {
      let s = esc(lineStr);
      s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:!?)]|$)/g, '$1<em>$2</em>');
      s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (full, labelHtml, rawHref) => {
        const cleanHref = String(rawHref || '')
          .replace(/\x00(?:INLINECODE|CHIP)_\d+\x00/g, '')
          .replace(/&amp;/g, '&')
          .trim();
        if (!/^(https?:|mailto:)/i.test(cleanHref)) {
          return labelHtml;
        }
        return `<a href="${esc(cleanHref)}" target="_blank" rel="noopener noreferrer">${labelHtml}</a>`;
      });
      s = s.replace(/\x00INLINECODE_(\d+)\x00/g, (_, i) => inlineCodes[Number(i)] || '');
      s = s.replace(/\x00CHIP_(\d+)\x00/g, (_, i) => chips[Number(i)] || '');
      return s;
    };

    const lines = src.split('\n');
    const out = [];
    let paraBuf = [];
    const flushPara = () => {
      if (!paraBuf.length) return;
      out.push(`<p class="md-p">${paraBuf.join('<br>')}</p>`);
      paraBuf = [];
    };

    const splitTableRow = (rowLine) =>
      rowLine
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => formatInline(c.trim()));

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();

      if (!trimmed) {
        flushPara();
        continue;
      }

      const cbMatch = trimmed.match(/^\x00CODEBLOCK_(\d+)\x00$/);
      if (cbMatch) {
        flushPara();
        out.push(codeBlocks[Number(cbMatch[1])] || '');
        continue;
      }

      if (/^(?:---|\*\*\*|___)$/.test(trimmed)) {
        flushPara();
        out.push('<hr class="md-hr">');
        continue;
      }

      const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (hMatch) {
        flushPara();
        const lvl = hMatch[1].length;
        const cls = lvl <= 3 ? 'md-h3' : 'md-h4';
        const tag = lvl <= 3 ? 'h3' : 'h4';
        out.push(`<${tag} class="${cls}">${formatInline(hMatch[2])}</${tag}>`);
        continue;
      }

      // Markdown table detection
      if (
        trimmed.includes('|') &&
        i + 1 < lines.length &&
        /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1]) &&
        lines[i + 1].includes('-')
      ) {
        flushPara();
        const headers = splitTableRow(trimmed);
        i += 2; // skip header + separator
        const bodyRows = [];
        while (i < lines.length && lines[i].trim().includes('|')) {
          bodyRows.push(splitTableRow(lines[i]));
          i++;
        }
        i--; // step back so outer loop increments properly
        const thHtml = headers.map((h) => `<th>${h}</th>`).join('');
        const tbHtml = bodyRows
          .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
          .join('');
        out.push(
          `<div class="md-table-wrap"><table class="md-table"><thead><tr>${thHtml}</tr></thead><tbody>${tbHtml}</tbody></table></div>`
        );
        continue;
      }

      const ulMatch = rawLine.match(/^(\s*)[-*•]\s+(.+)$/);
      if (ulMatch) {
        flushPara();
        const isNested = (ulMatch[1] || '').length >= 2;
        out.push(
          `<div class="md-list-item${isNested ? ' nested' : ''}"><span class="md-bullet">•</span><div class="md-list-body">${formatInline(ulMatch[2])}</div></div>`
        );
        continue;
      }

      const olMatch = rawLine.match(/^(\s*)(\d+\.)\s+(.+)$/);
      if (olMatch) {
        flushPara();
        const isNested = (olMatch[1] || '').length >= 2;
        out.push(
          `<div class="md-list-item${isNested ? ' nested' : ''}"><span class="md-bullet tabular">${esc(olMatch[2])}</span><div class="md-list-body">${formatInline(olMatch[3])}</div></div>`
        );
        continue;
      }

      paraBuf.push(formatInline(trimmed));
    }
    flushPara();

    return out.join('');
  }

  function renderContextPopover(ctx) {
    const sumEl = $('ctx-meter-summary');
    const barEl = $('ctx-stacked-bar');
    const listEl = $('ctx-breakdown-list');
    if (!sumEl || !barEl || !listEl) return;

    sumEl.innerHTML = `<strong>${fmtInt(ctx.usedTokens)}</strong> tokens used of <strong>${fmtInt(ctx.limitTokens)}</strong> (${ctx.pct}%) · <span>${fmtInt(ctx.remainingTokens || ctx.limitTokens - ctx.usedTokens)} remaining</span>`;
    const bd = Array.isArray(ctx.breakdown) ? ctx.breakdown : [];
    const totalBd = Math.max(1, bd.reduce((acc, item) => acc + Number(item.tokens || 0), 0));
    const safeCssColor = (c) => (/^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/.test(String(c || '').trim()) ? String(c).trim() : '#D9A54A');
    barEl.innerHTML = bd
      .map((item) => {
        const w = Math.max(4, Math.round((Number(item.tokens || 0) / totalBd) * 100));
        return `<div style="width:${w}%;background:${safeCssColor(item.color)}" aria-label="${esc(item.label)}"></div>`;
      })
      .join('');
    listEl.innerHTML = bd
      .map(
        (item) => `
        <div class="ctx-bd-item">
          <span style="display:flex;align-items:center;gap:6px">
            <span style="width:8px;height:8px;border-radius:50%;background:${safeCssColor(item.color)}"></span>
            <span>${esc(item.label)}</span>
          </span>
          <strong>${fmtCompact(item.tokens)}</strong>
        </div>
      `
      )
      .join('');
  }

  // VIEW 4: Render Workspaces & Git Inspector
  async function renderWorkspacesView() {
    const listEl = $('repo-selector-list');
    const detailEl = $('repo-detail-panel');
    if (!listEl || !detailEl) return;

    const workspaces = appState?.workspaces || [];
    if (!workspaces.length) {
      listEl.innerHTML = `<div class="meta-timestamp">Loading repositories…</div>`;
      return;
    }

    if (!workspaces.some((w) => w.id === prefs.selectedRepoId)) {
      prefs.selectedRepoId = workspaces[0].id;
    }

    listEl.innerHTML = workspaces
      .map(
        (w) => `
        <button type="button" class="repo-item-btn ${w.id === prefs.selectedRepoId ? 'active' : ''}" data-select-repo="${esc(w.id)}">
          <div>
            <div style="font-weight:700;font-size:13px">${esc(w.name)}</div>
            <div class="meta-timestamp tabular">⎇ ${esc(w.branch || 'main')}</div>
          </div>
          <span class="tag-pill tabular" style="color:${w.dirtyCount > 0 ? 'var(--amber)' : 'var(--emerald)'}">
            ${w.dirtyCount > 0 ? `${w.dirtyCount}Δ` : 'Clean'}
          </span>
        </button>
      `
      )
      .join('');

    const reqSeq = ++wsRenderSeq;
    const requestedRepoId = prefs.selectedRepoId;
    const fetched = await fetchWorkspaceDetail(requestedRepoId);
    if (reqSeq !== wsRenderSeq || prefs.selectedRepoId !== requestedRepoId) return;
    const repo =
      fetched?.workspace ||
      workspacesDetailCache[requestedRepoId] ||
      workspaces.find((w) => w.id === requestedRepoId);

    if (!repo) return;

    const modFiles = repo.modifiedFiles || [];
    const commits = repo.recentCommits || [];
    const diffHtml = formatGitDiffHtml(repo.diffPatch || '');

    detailEl.innerHTML = `
      <div class="section-head">
        <div>
          <div class="eyebrow">${esc(repo.group || 'BHFIRMS REPOSITORY')}</div>
          <h2 class="section-title" style="font-size:18px">${esc(repo.name)} <span class="tag-pill tabular">⎇ ${esc(repo.branch)}</span></h2>
          <div class="meta-timestamp mono">${esc(repo.path || '')}</div>
        </div>
        <button type="button" class="btn-brass-sm" data-launch-repo="${esc(repo.id)}" data-launch-name="${esc(repo.name)}">
          + Prompt in Repo
        </button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:14px;margin:14px 0">
        <div class="pairing-card">
          <div class="eyebrow" style="margin-bottom:6px">WORKING TREE (${modFiles.length} MODIFIED)</div>
          ${
            modFiles.length === 0
              ? `<div class="meta-timestamp">Working tree is clean.</div>`
              : modFiles
                  .slice(0, 12)
                  .map(
                    (f) =>
                      `<div class="mono" style="font-size:11.5px;padding:3px 0;display:flex;justify-content:space-between"><span>${esc(f.path)}</span><strong style="color:var(--amber)">${esc(f.status)}</strong></div>`
                  )
                  .join('')
          }
        </div>
        <div class="pairing-card">
          <div class="eyebrow" style="margin-bottom:6px">RECENT COMMITS</div>
          ${commits
            .slice(0, 5)
            .map(
              (c) =>
                `<div style="font-size:12px;padding:4px 0;border-bottom:1px solid var(--border-subtle)"><code style="color:var(--brass)">${esc(c.hash)}</code> ${esc(c.subject)} <span class="meta-timestamp">(${esc(c.relativeTime)})</span></div>`
            )
            .join('')}
        </div>
      </div>

      <div class="eyebrow" style="margin:14px 0 6px">UNIFIED GIT DIFF INSPECTOR</div>
      <pre class="diff-viewer mono">${diffHtml || 'No uncommitted diff lines in working tree.'}</pre>
    `;
  }

  function formatGitDiffHtml(patch) {
    if (!patch) return '';
    return patch
      .split(/\r?\n/)
      .slice(0, 260)
      .map((line) => {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          return `<span class="diff-line-add">${esc(line)}</span>`;
        }
        if (line.startsWith('-') && !line.startsWith('---')) {
          return `<span class="diff-line-del">${esc(line)}</span>`;
        }
        if (line.startsWith('@@') || line.startsWith('diff --git')) {
          return `<span class="diff-line-hdr">${esc(line)}</span>`;
        }
        return esc(line);
      })
      .join('\n');
  }

  // VIEW 5: Render Telemetry & Pairing
  function renderAnalyticsView() {
    const prov = prefs.telemetryProv || 'all';
    const summaryObj = appState?.summaryByProvider?.[prov] || appState?.summary || {
      today: { tokens: 0, turns: 0, sessions: 0, input: 0, cached: 0, output: 0 },
      week: { tokens: 0, turns: 0, sessions: 0, input: 0, cached: 0, output: 0 },
      days: []
    };

    const kpiGrid = $('telemetry-kpi-grid');
    if (kpiGrid) {
      kpiGrid.innerHTML = `
        <div class="ledger-panel">
          <div class="eyebrow">TODAY (5-HOUR / DAILY)</div>
          <div class="hero-headline" style="color:var(--brass)">${fmtCompact(summaryObj.today?.tokens)} <span style="font-size:13px;color:var(--text-muted)">tokens</span></div>
          <div class="meta-timestamp">${fmtInt(summaryObj.today?.turns)} turns · ${fmtInt(summaryObj.today?.sessions)} sessions</div>
          <div class="meta-timestamp" style="margin-top:6px">In: ${fmtCompact(summaryObj.today?.input)} · Cache: ${fmtCompact(summaryObj.today?.cached)} · Out: ${fmtCompact(summaryObj.today?.output)}</div>
        </div>
        <div class="ledger-panel">
          <div class="eyebrow">7-DAY ROLLING LEDGER</div>
          <div class="hero-headline" style="color:var(--steel)">${fmtCompact(summaryObj.week?.tokens)} <span style="font-size:13px;color:var(--text-muted)">tokens</span></div>
          <div class="meta-timestamp">${fmtInt(summaryObj.week?.turns)} turns · ${fmtInt(summaryObj.week?.sessions)} active sessions</div>
          <div class="meta-timestamp" style="margin-top:6px">In: ${fmtCompact(summaryObj.week?.input)} · Cache: ${fmtCompact(summaryObj.week?.cached)} · Out: ${fmtCompact(summaryObj.week?.output)}</div>
        </div>
      `;
    }

    // 7-Day Bar Chart
    const days = Array.isArray(summaryObj.days) ? summaryObj.days : [];
    const maxTok = Math.max(1, ...days.map((d) => Number(d.tokens || 0)));
    const chartStage = $('telemetry-chart-stage');
    const chartLbl = $('chart-total-label');
    if (chartLbl) {
      chartLbl.textContent = `Peak day: ${fmtCompact(maxTok)} tokens`;
    }
    if (chartStage) {
      chartStage.innerHTML = `
        <div class="chart-bars tabular">
          ${days
            .map((d) => {
              const hPct = Math.max(5, Math.round((Number(d.tokens || 0) / maxTok) * 100));
              return `
                <div class="chart-col">
                  <span class="meta-timestamp" style="font-size:10.5px">${fmtCompact(d.tokens)}</span>
                  <div class="chart-bar-wrap">
                    <div class="chart-bar-fill" style="height:${hPct}%"></div>
                  </div>
                  <span style="font-size:11px;font-weight:600">${esc(d.label || d.key)}</span>
                </div>
              `;
            })
            .join('')}
        </div>
      `;
    }

    // Top Sessions Ledger Table
    const topTable = $('telemetry-top-table');
    if (topTable) {
      const topList = (
        Array.isArray(appState?.topSessions) && appState.topSessions.length
          ? appState.topSessions
          : appState?.rows || []
      ).slice(0, 8);
      topTable.innerHTML = `
        <table class="ledger-table">
          <thead>
            <tr>
              <th>Session</th>
              <th>Provider</th>
              <th>Workspace</th>
              <th style="text-align:right">Activity</th>
            </tr>
          </thead>
          <tbody>
            ${topList
              .slice(0, 8)
              .map(
                (t) => `
                <tr data-open-chat="${esc(t.id || '')}" style="cursor:pointer">
                  <td><strong>${esc(t.title || 'Session')}</strong></td>
                  <td>${t.provider === 'claude' ? 'Claude Code' : 'Antigravity'}</td>
                  <td>${esc(t.workspaceLabel || t.folder || 'BHFIRMS')}</td>
                  <td style="text-align:right">${t.totalTokens ? fmtCompact(t.totalTokens) + ' tok' : timeAgo(t.at || (t.updatedAt ? t.updatedAt * 1000 : 0))}</td>
                </tr>
              `
              )
              .join('')}
          </tbody>
        </table>
      `;
    }

    // Web Push Notifications Settings Card
    const pushPanel = $('push-settings-panel');
    if (pushPanel) {
      pushPanel.innerHTML = renderPushSettingsCardHtml();
    }

    // Pairing & Security Configuration (#16, #17.5, #30.2)
    const pairingGrid = $('pairing-grid');
    if (
      pairingGrid &&
      !(document.activeElement && pairingGrid.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName))
    ) {
      if (localBridgeBase && !cachedPairingInfo) {
        fetchPairingInfoFromBridge().then((info) => {
          if (info && prefs.activeTab === 'analytics') renderAnalyticsView();
        });
      }
      const conn = appState?.connection || {};
      const lanUrl = conn.lanUrl || `http://127.0.0.1:${cloudCfg.port}/`;
      const pwaUrl = conn.pwaUrl || 'https://husseinbdeir.github.io/theo/';
      const hasPin = Boolean(
        localStorage.getItem(STORAGE_KEYS.PIN_HASH) || localStorage.getItem(STORAGE_KEYS.PIN)
      );
      const isPaired = hasAnyPairingCredentials();

      const fleetDevices = getUnifiedFleetDevices();
      const effectiveEdgeUrl = prefs.edgeRelayUrl || discoveredEdgeUrl || '';
      const liveCode =
        activeGeneratedPairCode && Number(activeGeneratedPairCode.expiresAt || 0) > Date.now()
          ? activeGeneratedPairCode
          : null;

      pairingGrid.innerHTML = `
        <div class="pairing-card">
          <div class="eyebrow">MULTI-DEVICE FLEET &amp; ZERO-SECRET PAIRING</div>
          <p class="meta-timestamp" style="margin:6px 0">Zero secrets in git/bundle. Pair iOS Home Screen apps via 6-digit code, browsers via 1-tap hash link, or PCs via 1-line PowerShell.</p>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0">
            ${
              fleetDevices.length > 0
                ? fleetDevices
                    .map(
                      (d) =>
                        `<span class="sess-device-badge ${d.online ? 'is-online' : ''}">${d.online ? '●' : '◐'} ${esc(d.name || d.id)}${d.sessionCount ? ` (${d.sessionCount})` : ''}</span>`
                    )
                    .join('')
                : `<span class="meta-timestamp">${isPaired ? 'Probing connected hosts…' : 'Not paired yet — enter 6-digit code or paste Pair Link below'}</span>`
            }
          </div>
          ${
            liveCode
              ? `<div class="pair-code-live-banner mono">🔢 iPhone 6-Digit Code: <strong>${esc(liveCode.formatted)}</strong> <span class="meta-timestamp">(10m single-use)</span></div>`
              : ''
          }
          <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
            <button type="button" class="btn-brass-sm" id="btn-gen-pair-code" aria-label="Generate 6-digit pairing code for iPhone Home Screen app">🔢 6-Digit Phone Code</button>
            <button type="button" class="btn-ghost-sm" id="btn-copy-mobile-pair" aria-label="Copy 1-tap mobile pairing URL">📱 Copy Mobile Pair URL</button>
            <button type="button" class="btn-ghost-sm" id="btn-copy-pc-install" aria-label="Copy 1-line PowerShell installer with pairing token">💻 Copy Workstation Pair PS1</button>
          </div>
          <label style="display:block;font-size:11.5px;margin-top:10px;color:var(--text-muted)">
            Pair via 6-Digit Code (from PC):
            <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">
              <input type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="24" class="input-field mono" id="input-pair-six-code" style="flex:1;min-width:140px" value="" placeholder="e.g. 482-917">
              <button type="button" class="btn-brass-sm" id="btn-claim-six-code">Connect Code</button>
            </div>
          </label>
          <label style="display:block;font-size:11.5px;margin-top:10px;color:var(--text-muted)">
            Or Paste <code>#pair=...</code> URL / Access Key:
            <input type="text" class="input-field mono pin-masked" id="input-pair-token" value="" placeholder="${isPaired ? '✓ Paired (paste new link to rotate)' : 'Paste #pair=... link or 64-hex key'}" autocomplete="off" spellcheck="false">
          </label>
          <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
            <button type="button" class="btn-ghost-sm" id="btn-apply-pair-token">Apply Pair Token</button>
            <button type="button" class="btn-ghost-sm" id="btn-copy-edge-deploy" aria-label="Copy Cloudflare Worker deploy command">Copy Edge Deploy Cmd</button>
          </div>
          <label style="display:block;font-size:11.5px;margin-top:10px;color:var(--text-muted)">
            Cloudflare Edge Relay URL (<code>wss://...</code>):
            <input type="url" class="input-field mono" id="input-edge-relay-url" value="${esc(effectiveEdgeUrl)}" placeholder="wss://theo-edge-relay.husseinbdeir.workers.dev/ws">
          </label>
          <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
            <button type="button" class="btn-ghost-sm" id="btn-save-edge-relay">Save Edge URL</button>
          </div>
        </div>

        <div class="pairing-card">
          <div class="eyebrow">HYBRID BRIDGE ENDPOINTS</div>
          <p class="meta-timestamp" style="margin:6px 0">Loopback WebSocket (<code>127.0.0.1:4318/ws</code>), Cloudflare Edge WS, and Cloud Relay backstop.</p>
          <div class="mono" style="font-size:11.5px;margin-top:8px">
            <div><strong>Hosted PWA:</strong> ${esc(pwaUrl)}</div>
            <div style="margin-top:4px"><strong>Local Bridge:</strong> ${esc(lanUrl)}</div>
          </div>
          <label style="display:block;font-size:11.5px;margin-top:10px;color:var(--text-muted)">
            Custom Direct Bridge URL (optional opt-in LAN / Tunnel):
            <input type="url" class="input-field mono" id="input-custom-bridge" value="${esc(prefs.customBridgeUrl || '')}" placeholder="http://127.0.0.1:4318">
          </label>
          <button type="button" class="btn-brass-sm" id="btn-save-bridge" style="margin-top:8px">Save &amp; Probe Bridge</button>
        </div>

        <div class="pairing-card">
          <div class="eyebrow">SECURITY &amp; CACHE</div>
          <p class="meta-timestamp" style="margin:6px 0">Protect remote mobile access with a SHA-256 4-digit PIN lock on launch.</p>
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
            <button type="button" class="btn-ghost-sm" id="btn-set-pin">${hasPin ? 'Change / Clear 4-Digit PIN' : 'Enable 4-Digit PIN Lock'}</button>
            <a href="reset.html" class="btn-ghost-sm" style="text-decoration:none;display:inline-flex;align-items:center">Reset PWA Cache</a>
          </div>
          <div id="pin-inline-editor" class="pin-inline-editor" hidden>
            ${
              hasPin
                ? `<label style="font-size:11.5px;color:var(--text-muted)">Current 4-digit PIN (required):<input type="text" inputmode="numeric" maxlength="4" class="input-field pin-masked" id="input-pin-current" placeholder="••••" autocomplete="off"></label>`
                : ''
            }
            <label style="font-size:11.5px;color:var(--text-muted)">New 4-digit PIN ${hasPin ? '(leave empty to disable PIN)' : ''}:<input type="text" inputmode="numeric" maxlength="4" class="input-field pin-masked" id="input-pin-next" placeholder="4 digits" autocomplete="off"></label>
            <div class="pin-editor-row">
              <button type="button" class="btn-brass-sm" id="btn-pin-editor-save">Save PIN</button>
              <button type="button" class="btn-ghost-sm" id="btn-pin-editor-cancel">Cancel</button>
            </div>
          </div>
        </div>
      `;
    }
  }

  function renderAll() {
    seedUncheckedTheoNotifications();
    updateAppBadgeCount(false);
    updateConnectionBanner();
    renderOutboxBadge();
    renderPulseView();
    renderSessionsView();
    renderIdeSidebar();
    syncAndRenderEditorTabs();
    if (prefs.activeTab === 'chat') renderChatView();
    if (prefs.activeTab === 'workspaces') renderWorkspacesView();
    if (prefs.activeTab === 'analytics') renderAnalyticsView();
  }

  let cmdPaletteMode = 'default';
  let composerAttachments = [];
  let slashPopoverItems = [];
  let slashPopoverActiveIdx = 0;
  let slashPopoverTrigger = null;

  const SLASH_COMMAND_CATALOG = [
    { id: '/compact', label: '/compact', desc: 'Summarize context window & free tokens', kind: 'action', act: 'compact', baseWeight: 95 },
    { id: '/plan', label: '/plan', desc: 'Draft a step-by-step architecture & implementation plan', kind: 'prompt', insert: '/plan ', baseWeight: 88 },
    { id: '/boost', label: '/boost', desc: 'Deep multi-perspective reasoning & rigorous verification', kind: 'prompt', insert: '/boost ', baseWeight: 84 },
    { id: '/goal', label: '/goal', desc: 'Autonomous thorough execution until goal is achieved', kind: 'prompt', insert: '/goal ', baseWeight: 80 },
    { id: '/new-agy', label: '/new-agy', desc: 'Start a fresh Google Antigravity session tab', kind: 'action', act: 'new-agy', baseWeight: 76 },
    { id: '/new-claude', label: '/new-claude', desc: 'Start a fresh Claude Code session tab', kind: 'action', act: 'new-claude', baseWeight: 74 },
    { id: '/bgtasks', label: '/bgtasks', desc: 'Inspect live background tasks & subagents', kind: 'action', act: 'bgtasks', baseWeight: 68 },
    { id: '/stop', label: '/stop', desc: 'Interrupt the currently running session', kind: 'action', act: 'stop', baseWeight: 64 },
    { id: '/sync', label: '/sync', desc: 'Force immediate Bridge & Cloud Relay sync', kind: 'action', act: 'sync', baseWeight: 60 },
    { id: '/theme', label: '/theme', desc: 'Toggle between Carbon Dark and Studio Daylight', kind: 'action', act: 'theme', baseWeight: 52 }
  ];

  function closeSlashPopover() {
    const pop = $('composer-slash-popover');
    if (pop) {
      pop.hidden = true;
      pop.innerHTML = '';
    }
    slashPopoverItems = [];
    slashPopoverActiveIdx = 0;
    slashPopoverTrigger = null;
  }

  function attachMentionItemToComposer({ name, repoPath = '', kind = 'repo', sizeLabel = 'workspace' }) {
    const cleanName = String(name || '').trim();
    if (!cleanName) return;
    const exists = composerAttachments.some(
      (a) => a && a.kind === kind && String(a.name || '').toLowerCase() === cleanName.toLowerCase()
    );
    if (!exists) {
      composerAttachments.push({
        id: `att-mention-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kind,
        name: cleanName,
        repoPath: repoPath || cleanName,
        sizeLabel
      });
      renderComposerAttachments();
    }
  }

  function detectComposerTrigger(inp) {
    if (!inp) return null;
    const val = String(inp.value || '');
    const caret = typeof inp.selectionStart === 'number' ? inp.selectionStart : val.length;
    const before = val.slice(0, caret);

    // Leading slash command: "/..." at very start of input (no spaces yet)
    const slashMatch = before.match(/^\/([^\s/]*)$/);
    if (slashMatch && !val.slice(caret).startsWith('/')) {
      return {
        mode: 'slash',
        query: slashMatch[1].toLowerCase(),
        startIdx: 0,
        endIdx: caret
      };
    }

    // Inline @workspace or @file mention right before caret
    const atMatch = before.match(/(?:^|\s)@([^\s@]*)$/);
    if (atMatch) {
      const tokenLen = atMatch[1].length + 1;
      return {
        mode: 'mention',
        query: atMatch[1].toLowerCase(),
        startIdx: caret - tokenLen,
        endIdx: caret
      };
    }
    return null;
  }

  function updateComposerSlashPopover() {
    const inp = $('composer-input');
    const pop = $('composer-slash-popover');
    if (!inp || !pop || isPinLocked()) {
      closeSlashPopover();
      return;
    }
    const trig = detectComposerTrigger(inp);
    if (!trig) {
      closeSlashPopover();
      return;
    }

    let items = [];
    if (trig.mode === 'slash') {
      const q = trig.query;
      const matches = SLASH_COMMAND_CATALOG.filter(
        (c) => !q || c.id.slice(1).includes(q) || c.desc.toLowerCase().includes(q)
      );
      const exact = q ? matches.filter((c) => c.id.slice(1) === q) : [];
      const rest = q ? matches.filter((c) => c.id.slice(1) !== q) : matches;
      items = exact
        .concat(rankByFreq(rest, 'commands', (c) => c.id, (c) => c.baseWeight))
        .slice(0, 8);
    } else if (trig.mode === 'mention') {
      const q = trig.query;
      const candidates = [];
      const seenKeys = new Set();
      for (const w of appState?.workspaces || []) {
        if (!w || !w.name) continue;
        const key = String(w.name);
        if (seenKeys.has(key.toLowerCase())) continue;
        seenKeys.add(key.toLowerCase());
        candidates.push({
          id: `ws:${key}`,
          freqKey: key,
          label: `@${key}`,
          desc: `${w.group || 'Workspace'} · ⎇ ${w.branch || 'main'}${w.dirtyCount ? ` · ${w.dirtyCount} modified` : ''}`,
          kind: 'mention-repo',
          attachName: `[${key}]`,
          repoPath: w.path || key,
          repoPrefix: key,
          baseWeight: 50 + Number(w.dirtyCount || 0) * 8
        });
        const det = workspacesDetailCache[w.id];
        const modList = det?.modifiedFiles || det?.statusFiles || det?.files || [];
        if (Array.isArray(modList) && modList.length > 0) {
          for (const f of modList.slice(0, 12)) {
            const fp = String(f?.path || f?.file || '').trim();
            if (!fp) continue;
            const fKey = `${key}/${fp}`;
            if (seenKeys.has(fKey.toLowerCase())) continue;
            seenKeys.add(fKey.toLowerCase());
            candidates.push({
              id: `file:${fKey}`,
              freqKey: fKey,
              label: `@${fp}`,
              desc: `${key} · Modified file`,
              kind: 'mention-file',
              attachName: fKey,
              repoPath: fKey,
              baseWeight: 35
            });
          }
        }
      }
      const activeTd = threadsCache[prefs.selectedThreadId];
      if (activeTd && Array.isArray(activeTd.messages)) {
        for (const m of activeTd.messages) {
          for (const tc of m?.toolCalls || []) {
            const fp = String(tc?.relPath || String(tc?.file || '').split('#')[0] || '').trim();
            if (!fp || seenKeys.has(fp.toLowerCase())) continue;
            seenKeys.add(fp.toLowerCase());
            candidates.push({
              id: `tfile:${fp}`,
              freqKey: fp,
              label: `@${fp}`,
              desc: 'Session touched file',
              kind: 'mention-file',
              attachName: fp,
              repoPath: fp,
              baseWeight: 42
            });
          }
        }
      }
      const matches = candidates.filter(
        (m) =>
          !q ||
          m.freqKey.toLowerCase().includes(q) ||
          m.label.toLowerCase().includes(q) ||
          m.desc.toLowerCase().includes(q)
      );
      const exact = q
        ? matches.filter(
            (m) => m.freqKey.toLowerCase() === q || m.label.slice(1).toLowerCase() === q
          )
        : [];
      const rest = q
        ? matches.filter(
            (m) => m.freqKey.toLowerCase() !== q && m.label.slice(1).toLowerCase() !== q
          )
        : matches;
      items = exact
        .concat(rankByFreq(rest, 'repos', (m) => m.freqKey, (m) => m.baseWeight))
        .slice(0, 8);
    }

    if (!items.length) {
      closeSlashPopover();
      return;
    }

    slashPopoverItems = items;
    slashPopoverTrigger = trig;
    if (slashPopoverActiveIdx >= items.length || slashPopoverActiveIdx < 0) {
      slashPopoverActiveIdx = 0;
    }

    pop.hidden = false;
    pop.innerHTML = items
      .map(
        (it, idx) => `
          <button type="button" class="slash-pop-item${idx === slashPopoverActiveIdx ? ' active' : ''}" role="option" aria-selected="${idx === slashPopoverActiveIdx}" data-slash-pick="${idx}">
            <span class="slash-pop-lbl mono">${esc(it.label)}</span>
            <span class="slash-pop-desc">${esc(it.desc)}</span>
          </button>
        `
      )
      .join('');
  }

  async function applySlashPopoverSelection(idx) {
    const item = slashPopoverItems[idx];
    const trig = slashPopoverTrigger;
    const inp = $('composer-input');
    closeSlashPopover();
    if (!item || !inp) return;

    const val = String(inp.value || '');
    const before = trig ? val.slice(0, trig.startIdx) : '';
    const after = trig ? val.slice(trig.endIdx) : '';

    if (item.kind === 'prompt') {
      recordFreqUsage('commands', item.id);
      const nextVal = `${item.insert}${after.replace(/^\s+/, '')}`;
      inp.value = nextVal;
      inp.focus();
      inp.setSelectionRange(item.insert.length, item.insert.length);
      updateComposerActionButton();
      return;
    }

    if (item.kind === 'action') {
      recordFreqUsage('commands', item.id);
      inp.value = after.trim();
      inp.style.height = 'auto';
      updateComposerActionButton();
      if (item.act === 'compact') {
        if (isNewSessionMode() || !cleanTargetThreadId(prefs.selectedThreadId)) {
          showToast('Select an active session first to run /compact');
        } else {
          const activeRow = (appState?.rows || []).find((r) => r.id === prefs.selectedThreadId);
          await dispatchRemoteCommand({
            type: 'sessionAction',
            action: 'compact',
            subAction: 'compact',
            id: prefs.selectedThreadId,
            provider: activeRow?.provider || 'antigravity'
          });
          showToast('⚡ Dispatched /compact to summarize context');
        }
      } else if (item.act === 'new-agy') {
        enterNewSessionMode('antigravity');
      } else if (item.act === 'new-claude') {
        enterNewSessionMode('claude');
      } else if (item.act === 'bgtasks') {
        const ctxPop = $('ctx-popover');
        if (ctxPop) ctxPop.hidden = true;
        const bgPop = $('bg-tasks-popover');
        if (bgPop) bgPop.hidden = false;
        renderChatView();
      } else if (item.act === 'stop') {
        await stopActiveSession(prefs.selectedThreadId);
      } else if (item.act === 'sync') {
        await syncData({ toast: true });
      } else if (item.act === 'theme') {
        applyTheme(prefs.theme === 'dark' ? 'light' : 'dark', true);
      }
      return;
    }

    if (item.kind === 'mention-repo' || item.kind === 'mention-file') {
      recordFreqUsage('repos', item.freqKey);
      attachMentionItemToComposer({
        name: item.attachName,
        repoPath: item.repoPath,
        kind: 'repo',
        sizeLabel: item.kind === 'mention-repo' ? 'workspace' : 'file ref'
      });
      if (item.kind === 'mention-repo' && item.repoPrefix && isNewSessionMode()) {
        prefs.composerRepoPrefix = item.repoPrefix;
        saveJson(STORAGE_KEYS.PREFS, prefs);
        syncComposerRoutingSelectors(null, true);
      }
      const nextText = `${before}${after}`.replace(/\s{2,}/g, ' ');
      inp.value = nextText;
      inp.focus();
      const pos = Math.min(nextText.length, before.length);
      inp.setSelectionRange(pos, pos);
      updateComposerActionButton();
    }
  }

  function fmtFileBytes(bytes) {
    const n = Number(bytes || 0);
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  function renderComposerAttachments() {
    const tray = $('composer-attachments');
    if (!tray) return;
    if (!composerAttachments.length) {
      tray.hidden = true;
      tray.innerHTML = '';
      updateComposerActionButton();
      return;
    }
    tray.hidden = false;
    tray.innerHTML = composerAttachments
      .map((a) => {
        const iconHtml =
          a.kind === 'image' && a.dataUrl
            ? `<img src="${esc(a.dataUrl)}" class="composer-attach-thumb" alt="">`
            : a.kind === 'repo'
              ? `<span>📁</span>`
              : `<span>📄</span>`;
        return `
          <span class="composer-attach-pill">
            ${iconHtml}
            <span class="composer-attach-name">${esc(a.name)}</span>
            ${a.sizeLabel ? `<span class="composer-attach-meta tabular">${esc(a.sizeLabel)}</span>` : ''}
            <button type="button" class="composer-attach-remove" data-remove-attach="${esc(a.id)}" aria-label="Remove attachment">✕</button>
          </span>
        `;
      })
      .join('');
    updateComposerActionButton();
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ''));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(file);
    });
  }

  async function compressImageFile(file) {
    const rawDataUrl = await readFileAsDataUrl(file);
    if (file.size <= 220 * 1024) return rawDataUrl;
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 1440;
          let w = img.naturalWidth || img.width || 800;
          let h = img.naturalHeight || img.height || 600;
          if (w > maxDim || h > maxDim) {
            if (w >= h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        } catch {
          resolve(rawDataUrl);
        }
      };
      img.onerror = () => resolve(rawDataUrl);
      img.src = rawDataUrl;
    });
  }

  async function handleComposerFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    for (const file of files) {
      const isImg = String(file.type || '').startsWith('image/');
      const isText =
        /\.(txt|md|json|csv|py|js|ts|tsx|jsx|html|css|sql|xml|yaml|yml|ps1|sh|log|ini|env|toml)$/i.test(
          file.name || ''
        ) || String(file.type || '').startsWith('text/');
      let dataUrl = '';
      let textContent = '';
      try {
        if (isImg) {
          dataUrl = await compressImageFile(file);
        } else {
          if (isText && file.size <= 512 * 1024 && typeof file.text === 'function') {
            textContent = (await file.text()).slice(0, 64000);
          }
          if (file.size <= 2 * 1024 * 1024) {
            dataUrl = await readFileAsDataUrl(file);
          }
        }
        composerAttachments.push({
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          kind: isImg ? 'image' : 'file',
          name: file.name || 'attachment',
          mime: file.type || 'application/octet-stream',
          size: file.size || 0,
          sizeLabel: fmtFileBytes(file.size || 0),
          dataUrl,
          textContent
        });
      } catch {}
    }
    renderComposerAttachments();
    showToast(`📎 Attached ${files.length} file${files.length === 1 ? '' : 's'}`);
    $('composer-input')?.focus();
  }

  function openRepoFilePicker() {
    if (isPinLocked()) return;
    cmdPaletteMode = 'repo-file';
    const modal = $('cmd-modal');
    const input = $('cmd-input');
    if (!modal || !input) return;
    const wasHidden = modal.hidden;
    modal.hidden = false;
    if (wasHidden) pushUiHistoryState('cmd-modal');
    input.placeholder = 'Filter BHFIRMS workspace or modified git file to attach…';
    input.value = '';
    renderCommandPaletteResults('');
    setTimeout(() => input.focus(), 30);
  }

  // Command Palette (⌘K)
  function openCommandPalette() {
    if (isPinLocked()) return;
    cmdPaletteMode = 'default';
    const modal = $('cmd-modal');
    const input = $('cmd-input');
    if (!modal || !input) return;
    const wasHidden = modal.hidden;
    modal.hidden = false;
    if (wasHidden) pushUiHistoryState('cmd-modal');
    input.placeholder = 'Jump to session, repo, or run a remote THEO command…';
    input.value = '';
    renderCommandPaletteResults('');
    setTimeout(() => input.focus(), 30);
  }

  function closeCommandPalette() {
    const modal = $('cmd-modal');
    if (modal) modal.hidden = true;
    cmdPaletteMode = 'default';
  }

  function renderCommandPaletteResults(query) {
    const resEl = $('cmd-results');
    if (!resEl) return;
    const q = query.trim().toLowerCase();

    if (cmdPaletteMode === 'repo-file') {
      const repoItems = [];
      for (const w of appState?.workspaces || []) {
        repoItems.push({
          title: `📁 [${w.name}] Workspace Root`,
          sub: `${w.group || 'BHFIRMS'} · ⎇ ${w.branch || 'main'}${w.dirtyCount ? ` · ${w.dirtyCount} modified` : ''}`,
          repoLabel: `[${w.name}]`,
          repoPath: w.path || w.name
        });
        const det = workspacesDetailCache[w.id];
        if (det && Array.isArray(det.files)) {
          for (const f of det.files.slice(0, 20)) {
            const fPath = f.path || f.file || '';
            if (fPath) {
              repoItems.push({
                title: `📄 [${w.name}] ${fPath}`,
                sub: `Modified (${f.status || 'M'}) · ⎇ ${w.branch || 'main'}`,
                repoLabel: `[${w.name}] ${fPath}`,
                repoPath: `${w.path ? w.path + '/' : ''}${fPath}`
              });
            }
          }
        }
      }
      const rawMatchedRepos = repoItems.filter(
        (it) => !q || `${it.title} ${it.sub}`.toLowerCase().includes(q)
      );
      const matchedRepos = rankByFreq(
        rawMatchedRepos,
        'repos',
        (it) => String(it.repoLabel || '').replace(/^[\[]|[\]]$/g, '').split(' ')[0]
      );
      resEl.innerHTML = matchedRepos
        .slice(0, 16)
        .map(
          (it) => `
          <button type="button" class="cmd-item" data-cmd-attach-repo="${esc(it.repoLabel)}" data-cmd-repo-path="${esc(it.repoPath)}">
            <strong>${esc(it.title)}</strong>
            <span class="meta-timestamp">${esc(it.sub)}</span>
          </button>
        `
        )
        .join('');
      return;
    }

    const items = [
      { title: '📎 Attach File or Photo to Prompt', sub: 'Workbench Composer', act: 'attach-file' },
      { title: '📁 Attach Workspace / Modified Git File (@Repo)', sub: 'Workbench Composer', act: 'pick-repo-file' },
      ...(hasSignedInProviderRemote('antigravity')
        ? [{ title: '+ New Google Antigravity Session', sub: 'Action', act: 'new-agy' }]
        : []),
      ...(hasSignedInProviderRemote('claude')
        ? [{ title: '+ New Claude Code Session', sub: 'Action', act: 'new-claude' }]
        : []),
      { title: 'Sync with VS Code & Cloud Relay Now', sub: 'Connectivity', act: 'sync' },
      { title: 'Enable / Test Web Push Notifications', sub: 'Notifications', act: 'push-test' },
      { title: 'Inspect Background Tasks & Subagents', sub: 'Workbench Overview', act: 'bgtasks' },
      { title: 'Run /compact on Active Session', sub: 'Context Window', act: 'compact' },
      { title: 'Switch Obsidian Dark / Warm Paper Light Theme', sub: 'Appearance', act: 'theme' }
    ];

    for (const r of (appState?.rows || []).slice(0, 20)) {
      if (r.id) {
        items.push({
          title: r.title,
          sub: `${r.provider === 'claude' ? 'Claude Code' : 'Antigravity'} · ${r.folder || 'Session'}`,
          threadId: r.id
        });
      }
    }

    const rawMatched = items.filter(
      (it) => !q || `${it.title} ${it.sub}`.toLowerCase().includes(q)
    );
    const matched = q
      ? (() => {
          const exact = rawMatched.filter((it) => String(it.title || '').toLowerCase() === q);
          const rest = rawMatched.filter((it) => String(it.title || '').toLowerCase() !== q);
          const freqOrdered = rankByFreq(
            rest,
            'threads',
            (it) => it.threadId || it.act || it.title
          );
          return exact.concat(freqOrdered);
        })()
      : rankByFreq(rawMatched, 'threads', (it) => it.threadId || it.act || it.title);

    resEl.innerHTML = matched
      .slice(0, 12)
      .map(
        (it) => `
        <button type="button" class="cmd-item" data-cmd-act="${esc(it.act || '')}" data-cmd-thread="${esc(it.threadId || '')}">
          <strong>${esc(it.title)}</strong>
          <span class="meta-timestamp">${esc(it.sub)}</span>
        </button>
      `
      )
      .join('');
  }

  async function hashPinCode(pinStr) {
    const clean = String(pinStr || '').trim();
    if (!clean) return '';
    if (window.crypto && window.crypto.subtle) {
      const bytes = new TextEncoder().encode(`theo-pin-v1:${clean}`);
      const digest = await window.crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
    return `legacy:${clean}`;
  }

  async function verifyEnteredPin(candidatePin) {
    const clean = String(candidatePin || '').trim();
    if (!/^\d{4}$/.test(clean)) return false;
    const savedHash = localStorage.getItem(STORAGE_KEYS.PIN_HASH);
    if (savedHash) {
      const candHash = await hashPinCode(clean);
      return candHash === savedHash;
    }
    const legacyPin = localStorage.getItem(STORAGE_KEYS.PIN);
    if (legacyPin && clean === legacyPin) {
      const migrated = await hashPinCode(clean);
      if (migrated) {
        localStorage.setItem(STORAGE_KEYS.PIN_HASH, migrated);
        localStorage.removeItem(STORAGE_KEYS.PIN);
      }
      return true;
    }
    return false;
  }

  // PIN Lock Check (#17)
  function initPinLock() {
    pinLockInitialized = true;
    const legacyPin = localStorage.getItem(STORAGE_KEYS.PIN);
    const savedHash = localStorage.getItem(STORAGE_KEYS.PIN_HASH);
    if (legacyPin && !savedHash && /^\d{4}$/.test(legacyPin)) {
      hashPinCode(legacyPin)
        .then((h) => {
          if (h) {
            localStorage.setItem(STORAGE_KEYS.PIN_HASH, h);
            localStorage.removeItem(STORAGE_KEYS.PIN);
          }
        })
        .catch(() => {});
    }
    const overlay = $('pin-overlay');
    const appShell = $('app-shell');
    if ((!savedHash && !legacyPin) || !overlay) {
      if (appShell) appShell.inert = false;
      document.documentElement.classList.remove('pin-locked-boot');
      if (pendingPinPairPayload) {
        const deferred = pendingPinPairPayload;
        pendingPinPairPayload = null;
        finalizeInteractivePairSuccess(deferred).catch(() => {});
      }
      return;
    }
    overlay.hidden = false;
    if (appShell) appShell.inert = true;
    document.documentElement.classList.remove('pin-locked-boot');
    let entered = '';
    const updateDots = () => {
      document.querySelectorAll('#pin-dots span').forEach((s, idx) => {
        s.classList.toggle('filled', idx < entered.length);
      });
    };
    $('pin-pad')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-digit]');
      if (!btn) return;
      const d = btn.dataset.digit;
      if (d === 'clear') entered = '';
      else if (d === 'back') entered = entered.slice(0, -1);
      else if (entered.length < 4) entered += d;
      updateDots();
      if (entered.length === 4) {
        const attempt = entered;
        const ok = await verifyEnteredPin(attempt);
        if (ok) {
          entered = '';
          updateDots();
          overlay.hidden = true;
          if (appShell) appShell.inert = false;
          playChime('confirm');
          if (pendingPinPairPayload) {
            const deferred = pendingPinPairPayload;
            pendingPinPairPayload = null;
            await finalizeInteractivePairSuccess(deferred);
          }
        } else {
          entered = '';
          updateDots();
          haptic(60);
        }
      }
    });
  }

  async function submitInteractiveQuestionCard(cardKey, skipped = false) {
    const meta = renderedQuestionsByCardKey.get(cardKey);
    if (!meta) return;
    const draft = getQuestionDraft(cardKey);
    const questions = Array.isArray(meta.questions) ? meta.questions : [];
    const sessId = String(meta.sessionId || prefs.selectedThreadId || '').trim();
    const provider = meta.provider === 'claude' ? 'claude' : 'antigravity';

    const responses = [];
    const allSelectedIds = [];
    const allSelectedTexts = [];
    const writeIns = [];
    const answersMap = {};
    const summaryParts = [];

    if (!skipped) {
      let totalChosen = countDraftSelections(draft, questions.length);
      // If user clicked Submit Answer without selecting anything, auto-select Recommended option(s) if present
      if (totalChosen === 0) {
        questions.forEach((q, qIdx) => {
          const opts = Array.isArray(q.options) ? q.options : [];
          const recIndices = [];
          opts.forEach((opt, oIdx) => {
            if (opt.isRecommended) recIndices.push(String(oIdx));
          });
          if (recIndices.length > 0) {
            draft.selectedByQ[qIdx] = new Set(
              q.isMultiSelect ? recIndices : [recIndices[0]]
            );
          }
        });
        totalChosen = countDraftSelections(draft, questions.length);
      }

      if (totalChosen === 0 && questions.some((q) => Array.isArray(q.options) && q.options.length > 0)) {
        showToast('Tap one or more options above (or type a custom answer) first');
        return;
      }

      questions.forEach((q, qIdx) => {
        const opts = Array.isArray(q.options) ? q.options : [];
        const selSet = draft.selectedByQ[qIdx] || new Set();
        const writeIn = String(draft.writeInByQ[qIdx] || '').trim();
        const qSelIds = [];
        const qSelTexts = [];
        const qCleanTexts = [];

        Array.from(selSet)
          .map((idxStr) => Number(idxStr))
          .filter((n) => Number.isFinite(n) && n >= 0 && n < opts.length)
          .sort((a, b) => a - b)
          .forEach((oIdx) => {
            const opt = opts[oIdx];
            qSelIds.push(String(opt.id || oIdx + 1));
            qSelTexts.push(opt.text);
            qCleanTexts.push(opt.cleanText || opt.text);
            allSelectedIds.push(String(opt.id || oIdx + 1));
            allSelectedTexts.push(opt.text);
          });

        if (writeIn) {
          writeIns.push(writeIn);
        }

        const answerPieces = [...qCleanTexts];
        if (writeIn) answerPieces.push(writeIn);
        const answerText = answerPieces.join('; ');
        if (q.question && answerText) {
          answersMap[q.question] = answerText;
        }
        if (answerText) {
          summaryParts.push(
            questions.length > 1 ? `${q.question}: ${answerText}` : answerText
          );
        }

        responses.push({
          question: q.question || '',
          isMultiSelect: Boolean(q.isMultiSelect),
          options: opts.map((o, idx) => ({ id: String(o.id || idx + 1), text: o.text })),
          selectedOptionIds: qSelIds,
          selectedTexts: qSelTexts,
          writeInResponse: writeIn,
          answerText,
          skipped: false
        });
      });
    } else {
      questions.forEach((q) => {
        const opts = Array.isArray(q.options) ? q.options : [];
        responses.push({
          question: q.question || '',
          isMultiSelect: Boolean(q.isMultiSelect),
          options: opts.map((o, idx) => ({ id: String(o.id || idx + 1), text: o.text })),
          selectedOptionIds: [],
          selectedTexts: [],
          writeInResponse: '',
          answerText: '',
          skipped: true
        });
      });
    }

    const humanSummary = skipped
      ? 'Skipped question'
      : summaryParts.join('\n') || writeIns.join('; ') || allSelectedTexts.join('; ') || 'Submitted answer';

    draft.submitted = true;
    draft.submittedSkipped = Boolean(skipped);
    draft.submittedSummary = humanSummary;

    const row = (appState?.rows || []).find((r) => r.id === sessId);
    const resolvedStepIdx = extractQuestionsStepIndex(
      questions,
      meta.stepIndex ?? row?.pendingQuestion?.stepIndex ?? row?.stepCount ?? null
    );

    if (sessId) {
      recordQuestionAnswered({
        sessionId: sessId,
        approvalId: meta.approvalId || '',
        turnId: meta.turnId || '',
        stepIndex: resolvedStepIdx,
        questions,
        summary: humanSummary,
        skipped
      });
    }

    haptic(20);
    playChime('approve');

    if (Array.isArray(appState?.approvals)) {
      appState.approvals = appState.approvals.filter(
        (a) => a.approvalId !== meta.approvalId && a.sessionId !== sessId
      );
    }
    if (sessId) {
      markNotificationsCheckedForSession(sessId);
    }

    if (row) {
      row.pendingQuestion = null;
      row.status = 'working';
      row.statusLabel = 'Running';
      row.dot = 'running';
    }

    if (sessId && !skipped) {
      if (!threadsCache[sessId]) {
        threadsCache[sessId] = {
          id: sessId,
          provider,
          title: row?.title || 'Session',
          messages: []
        };
      }
      if (!Array.isArray(threadsCache[sessId].messages)) {
        threadsCache[sessId].messages = [];
      }
      const baseCountBeforePush = threadsCache[sessId].messages.filter((m) => !m?.optimistic).length;
      threadsCache[sessId].messages.push({
        id: `opt-ans-${Date.now()}`,
        role: 'user',
        text: humanSummary,
        createdAt: new Date().toISOString(),
        optimistic: true,
        optimisticQuestionAnswer: true,
        baseMsgCount: baseCountBeforePush,
        optimisticAt: Date.now()
      });
    }

    persistCache();
    renderAll();

    await dispatchRemoteCommand({
      type: 'answerQuestion',
      kind: 'question',
      decision: skipped ? 'skip' : 'answer',
      skipped,
      isToolPermission: Boolean(questions.some((q) => q.isToolPermission)),
      approvalId: meta.approvalId || sessId,
      sessionId: sessId,
      threadId: sessId,
      provider,
      selector: meta.selector || '',
      selectedOptionIds: allSelectedIds,
      selectedTexts: allSelectedTexts,
      writeInResponse: writeIns.join('\n'),
      responses,
      answers: answersMap,
      answerText: humanSummary,
      plainQuestionFallback: Boolean(meta.plainQuestionFallback)
    });

    showToast(
      skipped
        ? 'Skipped remote question'
        : `✓ Answered: ${humanSummary.slice(0, 85)}${humanSummary.length > 85 ? '…' : ''}`
    );
  }

  // Event Wiring
  function bindEvents() {
    document.addEventListener('change', (e) => {
      if (isPinLocked() && !e.target?.closest?.('#pin-overlay')) return;
      const nfEl = e.target.closest('[data-nf]');
      if (nfEl) {
        prefs.notif = Object.assign({ ...DEFAULT_NOTIF }, prefs.notif || {});
        const k = nfEl.dataset.nf;
        prefs.notif[k] = nfEl.type === 'checkbox' ? nfEl.checked : Number(nfEl.value);
        saveJson(STORAGE_KEYS.PREFS, prefs);
        schedulePushSync();
        renderAll();
        showToast('Notification preferences saved');
      }
    });

    document.addEventListener('input', (e) => {
      if (isPinLocked() && !e.target?.closest?.('#pin-overlay')) return;
      const qInput = e.target.closest('[data-q-writein-input]');
      if (qInput) {
        const cardKey = qInput.dataset.cardKey || '';
        const qIdx = Number(qInput.dataset.qIdx || 0);
        const draft = getQuestionDraft(cardKey);
        draft.writeInByQ[qIdx] = qInput.value;
        const meta = renderedQuestionsByCardKey.get(cardKey);
        const qCount = meta?.questions?.length || 1;
        const anyToolPerm = Boolean(meta?.questions?.some((q) => q.isToolPermission));
        const count = countDraftSelections(draft, qCount);
        const cardEl = qInput.closest('[data-q-card]');
        const subBtn = cardEl?.querySelector('[data-q-submit]');
        if (subBtn) {
          subBtn.textContent = `✓ ${anyToolPerm ? (count > 0 ? `Confirm (${count})` : 'Yes (Allow)') : `Submit Answer${count > 0 ? ` (${count})` : ''}`}`;
        }
      }
    });

    document.addEventListener('keydown', (e) => {
      if (isPinLocked() && !e.target?.closest?.('#pin-overlay')) return;
      const roleBtn = e.target.closest?.('[role="button"][tabindex="0"], [role="tab"][tabindex="0"]');
      if (roleBtn && e.target === roleBtn && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        roleBtn.click();
        return;
      }
      const qInput = e.target.closest?.('[data-q-writein-input]');
      if (qInput && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const cardKey = qInput.dataset.cardKey || '';
        if (cardKey) {
          submitInteractiveQuestionCard(cardKey, false);
        }
      }
    });

    document.addEventListener('click', async (e) => {
      if (isPinLocked() && !e.target?.closest?.('#pin-overlay')) return;
      if (
        slashPopoverItems.length > 0 &&
        !e.target?.closest?.('#composer-slash-popover') &&
        !e.target?.closest?.('#btn-composer-slash') &&
        !e.target?.closest?.('#btn-composer-mention') &&
        !e.target?.closest?.('#composer-input')
      ) {
        closeSlashPopover();
      }
      // 0. Interactive VS Code Question & Recommendation Card Actions
      const qOptBtn = e.target.closest('[data-q-opt-toggle]');
      if (qOptBtn) {
        haptic(10);
        const cardKey = qOptBtn.dataset.cardKey || '';
        const qIdx = Number(qOptBtn.dataset.qIdx || 0);
        const optIdx = String(qOptBtn.dataset.optIdx || '0');
        const draft = getQuestionDraft(cardKey);
        const meta = renderedQuestionsByCardKey.get(cardKey);
        const qObj = meta?.questions?.[qIdx];
        const isMulti = Boolean(qObj?.isMultiSelect);

        if (!draft.selectedByQ[qIdx]) {
          draft.selectedByQ[qIdx] = new Set();
        }
        const selSet = draft.selectedByQ[qIdx];
        if (isMulti) {
          if (selSet.has(optIdx)) selSet.delete(optIdx);
          else selSet.add(optIdx);
        } else {
          if (selSet.has(optIdx) && selSet.size === 1) {
            selSet.clear();
          } else {
            selSet.clear();
            selSet.add(optIdx);
          }
        }

        const cardEl = qOptBtn.closest('[data-q-card]');
        if (cardEl) {
          const blockEl = cardEl.querySelector(`[data-q-block="${qIdx}"]`) || cardEl;
          blockEl.querySelectorAll(`[data-q-opt-toggle][data-q-idx="${qIdx}"]`).forEach((btn) => {
            const idx = String(btn.dataset.optIdx || '');
            const active = selSet.has(idx);
            btn.classList.toggle('is-selected', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            const chk = btn.querySelector('.vs-q-check');
            if (chk) chk.textContent = active ? '✓' : '';
          });
          const qCount = meta?.questions?.length || 1;
          const anyToolPerm = Boolean(meta?.questions?.some((q) => q.isToolPermission));
          const totalCount = countDraftSelections(draft, qCount);
          const subBtn = cardEl.querySelector('[data-q-submit]');
          if (subBtn) {
            subBtn.textContent = `✓ ${anyToolPerm ? (totalCount > 0 ? `Confirm (${totalCount})` : 'Yes (Allow)') : `Submit Answer${totalCount > 0 ? ` (${totalCount})` : ''}`}`;
          }
        }
        return;
      }

      const qSubmitBtn = e.target.closest('[data-q-submit]');
      if (qSubmitBtn) {
        const cardKey = qSubmitBtn.dataset.cardKey || '';
        if (cardKey) {
          await submitInteractiveQuestionCard(cardKey, false);
        }
        return;
      }

      const qSkipBtn = e.target.closest('[data-q-skip]');
      if (qSkipBtn) {
        const cardKey = qSkipBtn.dataset.cardKey || '';
        if (cardKey) {
          await submitInteractiveQuestionCard(cardKey, true);
        }
        return;
      }
      const notifCheckBtn = e.target.closest('[data-notif-check]');
      if (notifCheckBtn) {
        e.stopPropagation();
        haptic(10);
        markNotificationChecked(notifCheckBtn.dataset.notifCheck, { navigate: false });
        return;
      }

      const notifOpenRow = e.target.closest('[data-notif-open]');
      if (notifOpenRow) {
        haptic(10);
        markNotificationChecked(notifOpenRow.dataset.notifOpen, { navigate: true });
        return;
      }

      const notifActBtn = e.target.closest('[data-notif-act]');
      if (notifActBtn) {
        haptic(10);
        const nAct = notifActBtn.dataset.notifAct;
        if (nAct === 'check-all') {
          markAllNotificationsChecked();
        } else if (nAct === 'clear-checked') {
          clearCheckedNotifications();
        } else if (nAct === 'open-settings') {
          closeNotifModal();
          switchTab('analytics');
          setTimeout(() => {
            $('push-settings-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 60);
        }
        return;
      }

      const pushBtn = e.target.closest('[data-push-act]');
      if (pushBtn) {
        haptic(10);
        const act = pushBtn.dataset.pushAct;
        if (act === 'header-bell') {
          openNotifModal();
          return;
        }
        if (act === 'enable' || act === 'reset') {
          await enablePush(true);
        } else if (act === 'disable') {
          await disablePush();
        } else if (act === 'test') {
          await sendTestPush(false);
        } else if (act === 'sync') {
          showToast('Refreshing 14-day notification schedule…');
          await syncPushSchedule();
          showToast('Notification schedule synced to cloud!');
        } else if (act === 'dismiss-hint') {
          saveJson(STORAGE_KEYS.PUSH_HINT, 1);
          renderAll();
        }
        return;
      }

      const sidebarCollapseBtn = e.target.closest('[data-sidebar-collapse]');
      if (sidebarCollapseBtn) {
        haptic(8);
        toggleIdeSidebar();
        return;
      }

      const sideFilterBtn = e.target.closest('[data-side-filter]');
      if (sideFilterBtn) {
        prefs.sidebarFilter = sideFilterBtn.dataset.sideFilter || 'all';
        saveJson(STORAGE_KEYS.PREFS, prefs);
        renderIdeSidebar();
        return;
      }

      const closeTabBtn = e.target.closest('[data-close-editor-tab]');
      if (closeTabBtn) {
        e.stopPropagation();
        haptic(8);
        closeEditorTab(closeTabBtn.dataset.closeEditorTab || '');
        return;
      }

      const editorTabEl = e.target.closest('[data-editor-tab-id]');
      if (editorTabEl && editorTabEl.dataset.editorTabId) {
        const tid = editorTabEl.dataset.editorTabId;
        if (tid === '__new__') return;
        recentResumeUntil = 0;
        ensureEditorTabOpen(tid);
        recordFreqUsage('threads', tid);
        setPinnedNav({
          threadId: tid,
          provider: editorTabEl.dataset.sessionProv || '',
          durationMs: 45000
        });
        prefs.selectedThreadId = tid;
        prefs.lastReplyThreadId = tid;
        prefs.composerMode = 'reply';
        prefs.newSessionGroupId = '';
        saveJson(STORAGE_KEYS.PREFS, prefs);
        markNotificationsCheckedForSession(tid);
        renderChatView(true);
        renderIdeSidebar();
        fetchThreadDetail(tid, editorTabEl.dataset.sessionProv || '');
        return;
      }

      const ideOpenRow = e.target.closest('[data-ide-open-session]');
      if (ideOpenRow && ideOpenRow.dataset.ideOpenSession && !e.target.closest('[data-sess-act], [data-approve-act]')) {
        const sid = ideOpenRow.dataset.ideOpenSession;
        const prov = ideOpenRow.dataset.sessionProv || '';
        recentResumeUntil = 0;
        ensureEditorTabOpen(sid);
        recordFreqUsage('threads', sid);
        setPinnedNav({
          threadId: sid,
          provider: prov,
          durationMs: 45000
        });
        prefs.selectedThreadId = sid;
        prefs.lastReplyThreadId = sid;
        prefs.composerMode = 'reply';
        prefs.newSessionGroupId = '';
        saveJson(STORAGE_KEYS.PREFS, prefs);
        markNotificationsCheckedForSession(sid);
        switchTab('chat');
        renderIdeSidebar();
        fetchThreadDetail(sid, prov);
        return;
      }

      const toggleStepsBtn = e.target.closest('[data-toggle-all-steps]');
      if (toggleStepsBtn) {
        e.preventDefault();
        e.stopPropagation();
        const stack = toggleStepsBtn.closest('.code-steps-stack');
        if (stack) {
          const detailsList = Array.from(stack.querySelectorAll('details.code-step-card'));
          const anyClosed = detailsList.some((d) => !d.open);
          const openMap = getThreadOpenDetailsMap(prefs.selectedThreadId, true);
          detailsList.forEach((d) => {
            const key = d.dataset.chatDetailKey || '';
            d.dataset.renderedOpen = anyClosed ? '1' : '0';
            if (openMap && key) openMap.set(key, anyClosed);
            d.open = anyClosed;
          });
          const parentTools = stack.closest('details.tools-details[data-chat-detail-key]');
          if (parentTools && openMap && parentTools.dataset.chatDetailKey) {
            parentTools.dataset.renderedOpen = parentTools.open ? '1' : '0';
            openMap.set(parentTools.dataset.chatDetailKey, parentTools.open);
          }
          toggleStepsBtn.textContent = anyClosed ? 'Collapse all' : 'Expand all';
        }
        return;
      }

      const stepMentionBtn = e.target.closest('[data-step-mention-file]');
      if (stepMentionBtn) {
        e.preventDefault();
        e.stopPropagation();
        const fp = stepMentionBtn.dataset.stepMentionFile || '';
        if (fp) {
          recordFreqUsage('repos', fp);
          attachMentionItemToComposer({ name: fp, repoPath: fp, kind: 'repo', sizeLabel: 'file ref' });
          showToast(`📎 Mentioned ${fp}`);
          $('composer-input')?.focus();
        }
        return;
      }

      const slashPickBtn = e.target.closest('[data-slash-pick]');
      if (slashPickBtn) {
        e.preventDefault();
        e.stopPropagation();
        await applySlashPopoverSelection(Number(slashPickBtn.dataset.slashPick || 0));
        return;
      }

      const tabBtn = e.target.closest('[data-tab]');
      if (tabBtn) {
        haptic(8);
        clearPinnedNav();
        switchTab(tabBtn.dataset.tab);
        return;
      }

      const gotoBtn = e.target.closest('[data-goto-tab]');
      if (gotoBtn) {
        e.preventDefault();
        e.stopPropagation();
        clearPinnedNav();
        switchTab(gotoBtn.dataset.gotoTab);
        return;
      }

      const quotaToggle = e.target.closest('[data-quota-collapse]');
      if (quotaToggle) {
        const provKey = quotaToggle.dataset.quotaCollapse;
        if (!prefs.collapsedQuotaCards || typeof prefs.collapsedQuotaCards !== 'object') {
          prefs.collapsedQuotaCards = {};
        }
        prefs.collapsedQuotaCards[provKey] = !prefs.collapsedQuotaCards[provKey];
        saveJson(STORAGE_KEYS.PREFS, prefs);
        renderPulseView();
        renderIdeSidebar();
        return;
      }

      const acctSwitchBtn = e.target.closest('[data-account-switch]');
      if (acctSwitchBtn) {
        e.stopPropagation();
        const accountId = acctSwitchBtn.dataset.accountSwitch;
        const provider = acctSwitchBtn.dataset.accountProv === 'claude' ? 'claude' : 'antigravity';
        const provList = appState?.providers?.[provider]?.accounts;
        if (Array.isArray(provList)) {
          for (const item of provList) {
            item.active = item.id === accountId;
          }
          persistCache();
          renderPulseView();
          renderIdeSidebar();
        }
        await dispatchRemoteCommand({
          type: 'sessionAction',
          action: 'accountSwitch',
          subAction: 'accountSwitch',
          accountId,
          provider
        });
        showToast(`⇄ Switched active ${provider === 'claude' ? 'Claude Code' : 'Antigravity'} account`);
        return;
      }

      const acctMoveBtn = e.target.closest('[data-account-move]');
      if (acctMoveBtn) {
        e.stopPropagation();
        const dir = acctMoveBtn.dataset.accountMove;
        const accountId = acctMoveBtn.dataset.accountId;
        const provider = acctMoveBtn.dataset.accountProv === 'claude' ? 'claude' : 'antigravity';
        if (accountId && (dir === 'up' || dir === 'down')) {
          await reorderPulseQuotaCard(accountId, { direction: dir, provider });
          renderIdeSidebar();
        }
        return;
      }

      const acctLabelBtn = e.target.closest('[data-account-label]');
      if (acctLabelBtn) {
        e.stopPropagation();
        const accountId = acctLabelBtn.dataset.accountLabel;
        const provider = acctLabelBtn.dataset.accountProv === 'claude' ? 'claude' : 'antigravity';
        const curNick = acctLabelBtn.dataset.accountNick || '';
        const nextVal = prompt(
          'Set friendly label / nickname for this account (e.g. Friend, Personal, Work — leave empty to clear):',
          curNick
        );
        if (nextVal === null) return;
        const cleanLabel = nextVal.trim();
        const provList = appState?.providers?.[provider]?.accounts;
        if (Array.isArray(provList)) {
          const item = provList.find((x) => x.id === accountId);
          if (item) {
            item.nickname = cleanLabel;
            if (item.account) item.account.nickname = cleanLabel;
          }
          persistCache();
          renderPulseView();
          renderIdeSidebar();
        }
        await dispatchRemoteCommand({
          type: 'sessionAction',
          action: 'accountLabel',
          subAction: 'accountLabel',
          accountId,
          provider,
          label: cleanLabel,
          prompt: false
        });
        showToast(cleanLabel ? `🏷️ Saved label "${cleanLabel}"` : 'Cleared account label');
        return;
      }

      const acctRemoveBtn = e.target.closest('[data-account-remove]');
      if (acctRemoveBtn) {
        e.stopPropagation();
        const accountId = acctRemoveBtn.dataset.accountRemove;
        const provider = acctRemoveBtn.dataset.accountProv === 'claude' ? 'claude' : 'antigravity';
        const email = acctRemoveBtn.dataset.accountEmail || accountId;
        const provLabel = provider === 'claude' ? 'Claude Code' : 'Antigravity';
        const provList = appState?.providers?.[provider]?.accounts;
        const signedInCount = Array.isArray(provList)
          ? provList.filter(isSignedInQuotaCard).length
          : 1;
        const okConfirm = confirm(
          signedInCount <= 1
            ? `Sign out ${email} from ${provLabel}? Your other connected accounts will remain signed in.`
            : `Disconnect ${email} from THEO? Your other connected accounts will remain signed in.`
        );
        if (!okConfirm) return;
        if (Array.isArray(provList)) {
          appState.providers[provider].accounts = provList.filter((x) => x && x.id !== accountId);
          if (appState.providers[provider].accounts.length === 0) {
            appState.providers[provider].accounts = [
              {
                id: `${provider}:default`,
                provider,
                active: false,
                account: { available: false, signedOut: true, email: '', name: provLabel, plan: '' },
                usage: null
              }
            ];
          }
          persistCache();
          renderPulseView();
          renderIdeSidebar();
        }
        await dispatchRemoteCommand({
          type: 'sessionAction',
          action: 'accountRemove',
          subAction: 'accountRemove',
          accountId,
          provider,
          confirm: false
        });
        showToast(`${signedInCount <= 1 ? 'Signed out' : 'Disconnected'} ${email}`);
        return;
      }

      const addAcctRemoteBtn = e.target.closest('[data-account-add-remote]');
      if (addAcctRemoteBtn) {
        e.preventDefault();
        e.stopPropagation();
        const hintProv = addAcctRemoteBtn.dataset.accountAddRemote;
        const defaultPromptVal =
          hintProv === 'claude'
            ? 'claude'
            : hintProv === 'antigravity'
              ? 'antigravity'
              : 'antigravity:Friend';
        const rawChoice = prompt(
          'Add another account on your desktop workstation (existing accounts stay signed in).\nEnter "antigravity" or "claude" (optionally add a label after a colon, e.g. "antigravity:Friend" or "claude:Work"):',
          defaultPromptVal
        );
        if (!rawChoice || !rawChoice.trim()) return;
        const [rawProv, ...rest] = rawChoice.trim().split(':');
        const provider = rawProv.trim().toLowerCase().startsWith('c') ? 'claude' : 'antigravity';
        const label = rest.join(':').trim();
        await dispatchRemoteCommand({
          type: 'sessionAction',
          action: 'accountAdd',
          subAction: 'accountAdd',
          provider,
          label,
          switchOnComplete: true
        });
        showToast(
          `🔐 Sign-in launched on desktop for ${provider === 'claude' ? 'Claude Code' : 'Antigravity'} — existing accounts remain logged in`
        );
        return;
      }

      const quickNew = e.target.closest('[data-quick-new]');
      if (quickNew) {
        enterNewSessionMode(quickNew.dataset.quickNew, { repoPrefix: '' });
        return;
      }

      const launchRepo = e.target.closest('[data-launch-repo]');
      if (launchRepo) {
        const repoName = launchRepo.dataset.launchName;
        enterNewSessionMode('antigravity', { repoPrefix: repoName });
        const inp = $('composer-input');
        if (inp) {
          inp.value = `[${repoName}] `;
          updateComposerActionButton();
          inp.focus();
        }
        return;
      }

      const openBgBtn = e.target.closest('[data-open-bgtasks]');
      if (openBgBtn && openBgBtn.dataset.openBgtasks) {
        e.stopPropagation();
        const targetSid = openBgBtn.dataset.openBgtasks;
        const targetProv = openBgBtn.dataset.sessionProv || '';
        const focusTask = openBgBtn.dataset.focusTask || '';
        recentResumeUntil = 0;
        ensureEditorTabOpen(targetSid);
        setPinnedNav({ threadId: targetSid, provider: targetProv, durationMs: 45000 });
        prefs.selectedThreadId = targetSid;
        prefs.lastReplyThreadId = targetSid;
        prefs.composerMode = 'reply';
        saveJson(STORAGE_KEYS.PREFS, prefs);
        if (focusTask) {
          openBgTaskDetails.add(`${targetSid}:${focusTask}`);
        }
        markNotificationsCheckedForSession(targetSid);
        switchTab('chat');
        const ctxPop = $('ctx-popover');
        if (ctxPop) ctxPop.hidden = true;
        const bgPop = $('bg-tasks-popover');
        if (bgPop) bgPop.hidden = false;
        renderIdeSidebar();
        renderChatView(true);
        fetchThreadDetail(targetSid, targetProv).then(() => {
          if (focusTask) {
            fetchBgTaskLiveLog(targetSid, focusTask, targetProv);
          }
        });
        return;
      }

      const bgActBtn = e.target.closest('[data-bg-act]');
      if (bgActBtn) {
        e.stopPropagation();
        const act = bgActBtn.dataset.bgAct;
        const sid = bgActBtn.dataset.sessId || prefs.selectedThreadId || '';
        const tid = bgActBtn.dataset.taskId || '';
        const prov = bgActBtn.dataset.prov || '';
        if (act === 'open-popover') {
          const ctxPop = $('ctx-popover');
          if (ctxPop) ctxPop.hidden = true;
          const bgPop = $('bg-tasks-popover');
          if (bgPop) bgPop.hidden = false;
          renderChatView();
          return;
        }
        if (act === 'refresh-log' && sid && tid) {
          openBgTaskDetails.add(`${sid}:${tid}`);
          const out = await fetchBgTaskLiveLog(sid, tid, prov);
          showToast(out ? 'Refreshed live task log' : 'Synced latest task snapshot');
          fetchThreadDetail(sid, prov).catch(() => {});
          return;
        }
        if (act === 'stop-task' && sid && tid) {
          await cancelSingleBgTask(sid, tid, prov);
          return;
        }
        if (act === 'stop-session-all' && sid) {
          await cancelAllSessionBgTasks(sid, prov);
          return;
        }
        if (act === 'stop-all-global') {
          const rows = (appState?.rows || []).filter((r) => r && r.id && !r.archived);
          for (const r of rows) {
            const { runningCount } = getSessionBackgroundTasks(r, threadsCache[r.id]);
            if (runningCount > 0) {
              await cancelAllSessionBgTasks(r.id, r.provider);
            }
          }
          return;
        }
        return;
      }

      const openChat = e.target.closest('[data-open-chat]');
      if (openChat && openChat.dataset.openChat) {
        clearPinnedNav();
        ensureEditorTabOpen(openChat.dataset.openChat);
        prefs.selectedThreadId = openChat.dataset.openChat;
        prefs.lastReplyThreadId = openChat.dataset.openChat;
        prefs.composerMode = 'reply';
        saveJson(STORAGE_KEYS.PREFS, prefs);
        markNotificationsCheckedForSession(prefs.selectedThreadId);
        switchTab('chat');
        renderIdeSidebar();
        fetchThreadDetail(prefs.selectedThreadId);
        return;
      }

      const groupAct = e.target.closest('[data-group-act]');
      if (groupAct) {
        e.stopPropagation();
        const act = groupAct.dataset.groupAct;
        const gId = groupAct.dataset.groupId || '';
        const gName = groupAct.dataset.groupName || '';
        if (!Array.isArray(appState?.groups)) {
          if (appState) appState.groups = [];
        }
        if (act === 'toggle' && gId) {
          if (!prefs.collapsedSessionGroups || typeof prefs.collapsedSessionGroups !== 'object') {
            prefs.collapsedSessionGroups = {};
          }
          const grpObj = (appState?.groups || []).find((g) => g.id === gId);
          const cur = isSessionGroupCollapsed(gId, Boolean(grpObj?.collapsed));
          const next = !cur;
          prefs.collapsedSessionGroups[gId] = next;
          if (grpObj) grpObj.collapsed = next;
          saveJson(STORAGE_KEYS.PREFS, prefs);
          persistCache();
          renderSessionsView();
          renderIdeSidebar();
          if (gId !== 'ungrouped') {
            dispatchRemoteCommand({
              type: 'sessionAction',
              action: 'groupToggle',
              subAction: 'groupToggle',
              group: gId,
              value: next
            }).catch(() => {});
          }
          return;
        }
        if (act === 'create') {
          const name = prompt('Enter new session group name (e.g., Priority, Later, Resorts):', '');
          if (!name || !name.trim()) return;
          const cleanName = name.trim();
          const newId = `grp-${Date.now().toString(36)}`;
          noteGroupOverride(newId, { op: 'create', name: cleanName });
          if (appState) {
            appState.groups = [...(appState.groups || []), { id: newId, name: cleanName, collapsed: false }];
            persistCache();
            renderSessionsView();
            renderIdeSidebar();
          }
          await dispatchRemoteCommand({
            type: 'sessionAction',
            action: 'groupCreate',
            subAction: 'groupCreate',
            group: newId,
            name: cleanName
          });
          showToast(`📁 Created group "${cleanName}"`);
          return;
        }
        if (act === 'rename' && gId) {
          const nextName = prompt('Rename session group:', gName || '');
          if (!nextName || !nextName.trim()) return;
          const clean = nextName.trim();
          noteGroupOverride(gId, { op: 'rename', name: clean });
          const grpObj = (appState?.groups || []).find((g) => g.id === gId);
          if (grpObj) {
            grpObj.name = clean;
            persistCache();
            renderSessionsView();
            renderIdeSidebar();
          }
          await dispatchRemoteCommand({
            type: 'sessionAction',
            action: 'groupRename',
            subAction: 'groupRename',
            group: gId,
            name: clean
          });
          showToast(`✎ Renamed group to "${clean}"`);
          return;
        }
        if (act === 'delete' && gId) {
          if (!confirm(`Delete group "${gName || 'Group'}"? (Sessions will move to Ungrouped)`)) return;
          const victimName =
            gName || (appState?.groups || []).find((g) => g.id === gId)?.name || '';
          noteGroupOverride(gId, { op: 'delete', name: victimName });
          if (prefs.collapsedSessionGroups && typeof prefs.collapsedSessionGroups === 'object') {
            delete prefs.collapsedSessionGroups[gId];
            saveJson(STORAGE_KEYS.PREFS, prefs);
          }
          if (appState) {
            appState.groups = (appState.groups || []).filter((g) => g.id !== gId);
            for (const r of appState.rows || []) {
              if (r.group === gId) {
                r.group = '';
                noteRowOverride(r.id, { group: '' });
              }
            }
            persistCache();
            renderSessionsView();
            renderIdeSidebar();
          }
          await dispatchRemoteCommand({
            type: 'sessionAction',
            action: 'groupDelete',
            subAction: 'groupDelete',
            group: gId,
            name: victimName
          });
          showToast(`Removed group "${gName || 'Group'}"`);
          return;
        }
        if (act === 'new-in-group') {
          enterNewSessionMode(
            hasSignedInProviderRemote('antigravity') ? 'antigravity' : 'claude',
            { groupId: gId }
          );
          return;
        }
        if (act === 'archive-closed') {
          const groupIds = new Set((appState?.groups || []).map((g) => g.id));
          const closedIds = (appState?.rows || [])
            .filter(
              (r) =>
                r.id &&
                !r.archived &&
                (!r.group || !groupIds.has(r.group)) &&
                !r.open &&
                r.status !== 'working' &&
                r.status !== 'waiting' &&
                !r.unread
            )
            .map((r) => r.id);
          if (!closedIds.length) return;
          for (const r of appState?.rows || []) {
            if (closedIds.includes(r.id)) {
              r.archived = true;
              noteRowOverride(r.id, { archived: true });
            }
          }
          removeEditorTabIds(closedIds, true);
          persistCache();
          renderAll();
          await dispatchRemoteCommand({
            type: 'sessionAction',
            action: 'archive',
            subAction: 'archive',
            ids: closedIds,
            value: true
          });
          showToast(`Archived ${closedIds.length} closed sessions`);
          return;
        }
        return;
      }

      const sessAct = e.target.closest('[data-sess-act]');
      if (sessAct) {
        e.stopPropagation();
        const action = sessAct.dataset.sessAct;
        const id = sessAct.dataset.id;
        const val = sessAct.dataset.val === 'true';
        if (action === 'stop' && id) {
          await stopActiveSession(id);
          return;
        }
        const targetRow = (appState?.rows || []).find((r) => r.id === id);
        if (action === 'group-remove' && targetRow) {
          const prevGrp = targetRow.group || '';
          targetRow.group = '';
          noteRowOverride(id, { group: '' });
          persistCache();
          renderAll();
          await dispatchRemoteCommand({
            type: 'sessionAction',
            action: 'groupRemove',
            subAction: 'groupRemove',
            id,
            ids: [id],
            group: prevGrp
          });
          showToast('Removed session from group');
          return;
        }
        if (action === 'group' && targetRow) {
          const groups = Array.isArray(appState?.groups) ? appState.groups : [];
          const curGrp = groups.find((g) => g.id === targetRow.group);
          const groupNames = groups.map((g, i) => `${i + 1}. ${g.name}`).join('\n');
          const promptTxt = groups.length
            ? `Move "${targetRow.title}" to group:\n${groupNames}\n0. Ungrouped (remove from group)\n\nEnter group number or type a new group name:`
            : `Enter a group name for "${targetRow.title}" (e.g., Later, Work on later):`;
          const rawChoice = prompt(promptTxt, curGrp ? curGrp.name : '');
          if (rawChoice === null) return;
          const clean = rawChoice.trim();
          if (!clean || clean === '0' || clean.toLowerCase() === 'ungrouped' || clean.toLowerCase() === 'none') {
            targetRow.group = '';
            noteRowOverride(id, { group: '' });
            persistCache();
            renderAll();
            await dispatchRemoteCommand({
              type: 'sessionAction',
              action: 'groupRemove',
              subAction: 'groupRemove',
              id,
              ids: [id]
            });
            showToast('Moved session to Ungrouped');
            return;
          }
          const idxNum = Number(clean);
          const matchedGrp =
            (!Number.isNaN(idxNum) && idxNum >= 1 && idxNum <= groups.length
              ? groups[idxNum - 1]
              : null) ||
            groups.find((g) => String(g.name || '').toLowerCase() === clean.toLowerCase());
          if (matchedGrp) {
            targetRow.group = matchedGrp.id;
            noteRowOverride(id, { group: matchedGrp.id });
            if (prefs.collapsedSessionGroups) {
              prefs.collapsedSessionGroups[matchedGrp.id] = false;
              saveJson(STORAGE_KEYS.PREFS, prefs);
            }
            persistCache();
            renderAll();
            await dispatchRemoteCommand({
              type: 'sessionAction',
              action: 'groupAdd',
              subAction: 'groupAdd',
              id,
              ids: [id],
              group: matchedGrp.id
            });
            showToast(`📁 Moved to "${matchedGrp.name}"`);
          } else {
            const newId = `grp-${Date.now().toString(36)}`;
            noteGroupOverride(newId, { op: 'create', name: clean });
            noteRowOverride(id, { group: newId });
            if (appState) {
              appState.groups = [...groups, { id: newId, name: clean, collapsed: false }];
            }
            targetRow.group = newId;
            persistCache();
            renderAll();
            await dispatchRemoteCommand({
              type: 'sessionAction',
              action: 'groupCreate',
              subAction: 'groupCreate',
              id,
              ids: [id],
              group: newId,
              name: clean
            });
            showToast(`📁 Created "${clean}" & moved session`);
          }
          return;
        }
        if (targetRow) {
          if (action === 'archive') {
            targetRow.archived = val;
            if (val) {
              targetRow.group = '';
              noteRowOverride(id, { archived: true, group: '' });
              markNotificationsCheckedForSession(id);
              removeEditorTabIds([id], true);
            } else {
              noteRowOverride(id, { archived: false });
              ensureEditorTabOpen(id);
            }
          }
          if (action === 'unread') {
            targetRow.unread = val;
            if (!val && targetRow.dot === 'unread') targetRow.dot = targetRow.open ? 'idle' : null;
            noteRowOverride(id, { unread: val });
            if (!val) markNotificationsCheckedForSession(id);
          }
          persistCache();
          renderAll();
        }
        await dispatchRemoteCommand({
          type: 'sessionAction',
          action,
          subAction: action,
          id,
          provider: targetRow?.provider || 'antigravity',
          value: val
        });
        showToast(action === 'archive' ? (val ? 'Session archived' : 'Session restored') : 'Updated session state');
        return;
      }

      const sessCard = e.target.closest('.session-card[data-session-id]');
      if (sessCard && sessCard.dataset.sessionId) {
        recentResumeUntil = 0;
        ensureEditorTabOpen(sessCard.dataset.sessionId);
        recordFreqUsage('threads', sessCard.dataset.sessionId);
        setPinnedNav({
          threadId: sessCard.dataset.sessionId,
          provider: sessCard.dataset.sessionProv || '',
          durationMs: 45000
        });
        prefs.selectedThreadId = sessCard.dataset.sessionId;
        prefs.lastReplyThreadId = sessCard.dataset.sessionId;
        prefs.composerMode = 'reply';
        saveJson(STORAGE_KEYS.PREFS, prefs);
        markNotificationsCheckedForSession(prefs.selectedThreadId);
        switchTab('chat');
        renderIdeSidebar();
        fetchThreadDetail(prefs.selectedThreadId, sessCard.dataset.sessionProv);
        return;
      }

      const approveBtn = e.target.closest('[data-approve-act]');
      if (approveBtn) {
        const decision = approveBtn.dataset.approveAct;
        const appId = approveBtn.dataset.appId;
        const sessId = approveBtn.dataset.sessId;
        haptic(20);
        playChime('approve');
        if (appId) markNotificationChecked(`theo-app-${appId}`);
        if (sessId) markNotificationsCheckedForSession(sessId);
        if (Array.isArray(appState?.approvals)) {
          appState.approvals = appState.approvals.filter(
            (a) => a.approvalId !== appId && a.sessionId !== sessId
          );
          persistCache();
          renderAll();
        }
        await dispatchRemoteCommand({
          type: 'approve',
          decision,
          approvalId: appId,
          sessionId: sessId,
          provider: approveBtn.dataset.prov,
          selector: approveBtn.dataset.sel,
          label: approveBtn.dataset.lbl
        });
        showToast(decision === 'approve' ? '✓ Approved remote step' : '✕ Denied remote step');
        return;
      }

      const fleetFilterBtn = e.target.closest('[data-fleet-filter]');
      if (fleetFilterBtn) {
        const devId = fleetFilterBtn.dataset.fleetFilter || 'all';
        prefs.selectedDeviceFilter = devId;
        if (devId && devId !== 'all') {
          prefs.composerTargetDevice = devId;
          recordFreqUsage('devices', devId);
        }
        saveJson(STORAGE_KEYS.PREFS, prefs);
        renderPulseView();
        renderSessionsView();
        renderIdeSidebar();
        if (prefs.activeTab === 'chat') renderChatView();
        return;
      }

      if (e.target.closest('#composer-direct-toggle')) {
        prefs.composerDirectStream = !(prefs.composerDirectStream !== false);
        saveJson(STORAGE_KEYS.PREFS, prefs);
        syncComposerRoutingSelectors(null, isNewSessionMode());
        showToast(
          prefs.composerDirectStream
            ? '⚡ Direct CLI Stream enabled (<25ms live tokens, works without VS Code)'
            : '🪟 VS Code IDE Tab dispatch enabled'
        );
        return;
      }

      if (e.target.closest('#btn-reset-sess-filters')) {
        prefs.sessProvider = 'all';
        prefs.sessStatus = 'all';
        prefs.selectedDeviceFilter = 'all';
        saveJson(STORAGE_KEYS.PREFS, prefs);
        const sInput = $('sess-search-input');
        if (sInput) sInput.value = '';
        renderPulseView();
        renderSessionsView();
        renderIdeSidebar();
        return;
      }

      if (e.target.closest('#btn-empty-sync-now') || e.target.closest('#conn-modal-sync-btn')) {
        await syncData({ toast: true });
        return;
      }

      if (e.target.closest('#mobile-conn-pill') || e.target.closest('#rail-conn-btn')) {
        openConnModal();
        syncData().catch(() => {});
        return;
      }

      if (e.target.closest('#conn-modal-close') || e.target === $('conn-modal')) {
        closeConnModal();
        return;
      }

      if (e.target.closest('#notif-modal-close') || e.target === $('notif-modal')) {
        closeNotifModal();
        return;
      }

      if (e.target === $('cmd-modal')) {
        closeCommandPalette();
        return;
      }

      const provSeg = e.target.closest('#sess-provider-seg [data-prov]');
      if (provSeg) {
        prefs.sessProvider = provSeg.dataset.prov;
        saveJson(STORAGE_KEYS.PREFS, prefs);
        renderSessionsView();
        return;
      }

      const statusChip = e.target.closest('#sess-status-chips [data-status-filter]');
      if (statusChip) {
        prefs.sessStatus = statusChip.dataset.statusFilter;
        saveJson(STORAGE_KEYS.PREFS, prefs);
        renderSessionsView();
        return;
      }

      const compModeBtn = e.target.closest('[data-comp-mode]');
      if (compModeBtn) {
        const nextMode = compModeBtn.dataset.compMode;
        if (nextMode === 'new-antigravity') {
          enterNewSessionMode('antigravity');
        } else if (nextMode === 'new-claude') {
          enterNewSessionMode('claude');
        } else {
          exitNewSessionModeToReply();
        }
        return;
      }

      const slashChip = e.target.closest('[data-insert-prompt]');
      if (slashChip) {
        const inp = $('composer-input');
        if (inp) {
          inp.value = slashChip.dataset.insertPrompt;
          updateComposerActionButton();
          inp.focus();
        }
        return;
      }

      const repoBtn = e.target.closest('[data-select-repo]');
      if (repoBtn) {
        prefs.selectedRepoId = repoBtn.dataset.selectRepo;
        recordFreqUsage('repos', repoBtn.dataset.selectRepo);
        saveJson(STORAGE_KEYS.PREFS, prefs);
        renderWorkspacesView();
        return;
      }

      const telSeg = e.target.closest('#telemetry-prov-seg [data-tel-prov]');
      if (telSeg) {
        prefs.telemetryProv = telSeg.dataset.telProv;
        document.querySelectorAll('#telemetry-prov-seg .seg-btn').forEach((b) =>
          b.classList.toggle('active', b === telSeg)
        );
        renderAnalyticsView();
        return;
      }

      if (e.target.closest('#btn-save-edge-relay')) {
        const val = ($('input-edge-relay-url')?.value || '').trim();
        await saveEdgeRelayConfig(val);
        showToast(
          val
            ? '⚡ Saved & broadcast Cloudflare Edge WS URL to all hosts'
            : 'Cleared custom Edge Relay URL'
        );
        return;
      }

      if (e.target.closest('#btn-copy-edge-deploy')) {
        const cmd = `powershell -ExecutionPolicy Bypass -File "$HOME\\bhfirms\\theo-hub\\cloudflare-relay\\deploy_edge_relay.ps1"`;
        try {
          await navigator.clipboard.writeText(cmd);
          showToast('📋 Copied Option A Cloudflare Edge deploy command');
        } catch {
          prompt('Copy Option A deploy command:', cmd);
        }
        return;
      }

      if (e.target.closest('#btn-gen-pair-code')) {
        await generateSixDigitPairCode();
        return;
      }

      if (e.target.closest('#btn-claim-six-code')) {
        const val = ($('input-pair-six-code')?.value || '').trim();
        const ok = await claimSixDigitPairCode(val);
        if (ok && $('input-pair-six-code')) $('input-pair-six-code').value = '';
        return;
      }

      const quickCodeBtn = e.target.closest('[data-pair-code-submit]');
      if (quickCodeBtn) {
        const card = quickCodeBtn.closest('.quick-pair-card');
        const inp = card?.querySelector('[data-pair-code-input]');
        await claimSixDigitPairCode(inp?.value || '');
        return;
      }

      const quickToggleBtn = e.target.closest('[data-pair-toggle-link-box]');
      if (quickToggleBtn) {
        showQuickPairLinkFallback = !showQuickPairLinkFallback;
        const card = quickToggleBtn.closest('.quick-pair-card');
        const wrap = card?.querySelector('[data-pair-manual-wrap]');
        if (wrap) {
          wrap.hidden = !showQuickPairLinkFallback;
          quickToggleBtn.textContent = showQuickPairLinkFallback ? 'Hide Link Box' : 'Type / Paste Manually';
          if (showQuickPairLinkFallback) {
            const inp = wrap.querySelector('[data-pair-link-input]');
            setTimeout(() => inp?.focus({ preventScroll: true }), 15);
          }
        } else {
          renderAll();
        }
        return;
      }

      const quickPasteBtn = e.target.closest('[data-pair-paste-clipboard]');
      if (quickPasteBtn) {
        let clipText = '';
        try {
          if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
            clipText = String((await navigator.clipboard.readText()) || '').trim();
          }
        } catch {}
        if (clipText) {
          const onlyDigits = clipText.replace(/\D+/g, '');
          if (onlyDigits.length === 6 && /^[\d\s-]+$/.test(clipText)) {
            await claimSixDigitPairCode(onlyDigits);
            return;
          }
          const parsedClip = decodePairTokenString(clipText);
          if (parsedClip) {
            await finalizeInteractivePairSuccess(parsedClip);
            return;
          }
        }
        showQuickPairLinkFallback = true;
        const card = quickPasteBtn.closest('.quick-pair-card');
        const wrap = card?.querySelector('[data-pair-manual-wrap]');
        if (wrap) {
          wrap.hidden = false;
          const toggleBtn = card?.querySelector('[data-pair-toggle-link-box]');
          if (toggleBtn) toggleBtn.textContent = 'Hide Link Box';
          const inp = wrap.querySelector('[data-pair-link-input]');
          setTimeout(() => inp?.focus({ preventScroll: true }), 15);
        }
        showToast(
          clipText
            ? 'Clipboard did not contain a #pair= link — paste it below'
            : 'Paste your #pair= link or 6-digit code below'
        );
        return;
      }

      const quickLinkSubmitBtn = e.target.closest('[data-pair-link-submit]');
      if (quickLinkSubmitBtn) {
        const card = quickLinkSubmitBtn.closest('.quick-pair-card');
        const raw = (card?.querySelector('[data-pair-link-input]')?.value || '').trim();
        const onlyDigits = raw.replace(/\D+/g, '');
        if (onlyDigits.length === 6 && /^[\d\s-]+$/.test(raw)) {
          await claimSixDigitPairCode(onlyDigits);
          return;
        }
        const parsed = decodePairTokenString(raw);
        if (!parsed) {
          showToast('Invalid #pair= URL or Access Key');
          return;
        }
        await finalizeInteractivePairSuccess(parsed);
        return;
      }

      if (e.target.closest('#btn-copy-mobile-pair')) {
        const info = await fetchPairingInfoFromBridge();
        let pairUrl = info?.pairUrl || info?.mobilePairUrl || '';
        if (!pairUrl) {
          refreshCloudConfig();
          const tok = encodePairTokenString({
            cloudUrl: cloudCfg.url,
            cloudKey: cloudCfg.key,
            edgeAccessKey: cloudCfg.edgeAccessKey,
            edgeRelayUrl: prefs.edgeRelayUrl || discoveredEdgeUrl,
            port: cloudCfg.port
          });
          if (tok) pairUrl = `https://husseinbdeir.github.io/theo/#pair=${tok}`;
        }
        if (!pairUrl) {
          showToast('Open Settings on your paired PC (http://127.0.0.1:4318) first to copy the Pair URL');
          return;
        }
        try {
          await navigator.clipboard.writeText(pairUrl);
          showToast('📱 Copied 1-Tap Mobile Pairing URL (secret stays in #hash fragment)');
        } catch {
          prompt('Open this 1-Tap Pairing URL on your phone:', pairUrl);
        }
        return;
      }

      if (e.target.closest('#btn-copy-pc-install')) {
        const info = await fetchPairingInfoFromBridge();
        let cmd = info?.workstationCmd || info?.workstationBootstrapPs1 || '';
        if (!cmd) {
          refreshCloudConfig();
          const tok = encodePairTokenString({
            cloudUrl: cloudCfg.url,
            cloudKey: cloudCfg.key,
            edgeAccessKey: cloudCfg.edgeAccessKey,
            edgeRelayUrl: prefs.edgeRelayUrl || discoveredEdgeUrl,
            port: cloudCfg.port
          });
          cmd = tok
            ? `$env:THEO_PAIR_TOKEN='${tok}'; irm https://raw.githubusercontent.com/HusseinBdeir/theo/main/install.ps1 | iex`
            : `irm https://raw.githubusercontent.com/HusseinBdeir/theo/main/install.ps1 | iex`;
        }
        try {
          await navigator.clipboard.writeText(cmd);
          showToast('💻 Copied 1-line Workstation Pair & Fleet Installer');
        } catch {
          prompt('Run this in PowerShell on your workstation:', cmd);
        }
        return;
      }

      if (e.target.closest('#btn-apply-pair-token')) {
        const raw = ($('input-pair-token')?.value || '').trim();
        const onlyDigits = raw.replace(/\D+/g, '');
        if (onlyDigits.length === 6 && /^[\d\s-]+$/.test(raw)) {
          const ok = await claimSixDigitPairCode(onlyDigits);
          if (ok && $('input-pair-token')) $('input-pair-token').value = '';
          return;
        }
        const parsed = decodePairTokenString(raw);
        if (!parsed) {
          showToast('Invalid Pair URL, 6-Digit Code, or Access Key');
          return;
        }
        if ($('input-pair-token')) $('input-pair-token').value = '';
        await finalizeInteractivePairSuccess(parsed);
        return;
      }

      if (e.target.closest('#btn-save-bridge')) {
        const val = ($('input-custom-bridge')?.value || '').trim();
        prefs.customBridgeUrl = val;
        saveJson(STORAGE_KEYS.PREFS, prefs);
        localBridgeBase = '';
        await syncData({ toast: true });
        return;
      }

      if (e.target.closest('#btn-set-pin')) {
        const ed = $('pin-inline-editor');
        if (ed) {
          ed.hidden = !ed.hidden;
          if (!ed.hidden) {
            setTimeout(() => ($('input-pin-current') || $('input-pin-next'))?.focus(), 20);
          }
        }
        return;
      }

      if (e.target.closest('#btn-pin-editor-cancel')) {
        const ed = $('pin-inline-editor');
        if (ed) ed.hidden = true;
        return;
      }

      if (e.target.closest('#btn-pin-editor-save')) {
        const hasPin = Boolean(
          localStorage.getItem(STORAGE_KEYS.PIN_HASH) || localStorage.getItem(STORAGE_KEYS.PIN)
        );
        if (hasPin) {
          const curVal = ($('input-pin-current')?.value || '').trim();
          const okCur = await verifyEnteredPin(curVal);
          if (!okCur) {
            haptic(50);
            showToast('Current 4-digit PIN is incorrect');
            return;
          }
        }
        const nextClean = ($('input-pin-next')?.value || '').trim();
        if (!nextClean) {
          localStorage.removeItem(STORAGE_KEYS.PIN_HASH);
          localStorage.removeItem(STORAGE_KEYS.PIN);
          showToast('PIN lock disabled');
        } else if (/^\d{4}$/.test(nextClean)) {
          const nextHash = await hashPinCode(nextClean);
          localStorage.setItem(STORAGE_KEYS.PIN_HASH, nextHash);
          localStorage.removeItem(STORAGE_KEYS.PIN);
          showToast('4-digit SHA-256 PIN lock saved');
        } else {
          showToast('New PIN must be 4 digits');
          return;
        }
        const ed = $('pin-inline-editor');
        if (ed) ed.hidden = true;
        renderAnalyticsView();
        return;
      }

      const removeAttachBtn = e.target.closest('[data-remove-attach]');
      if (removeAttachBtn) {
        const rmId = removeAttachBtn.dataset.removeAttach;
        composerAttachments = composerAttachments.filter((a) => a.id !== rmId);
        renderComposerAttachments();
        return;
      }

      const attachRepoBtn = e.target.closest('[data-cmd-attach-repo]');
      if (attachRepoBtn) {
        closeCommandPalette();
        const label = attachRepoBtn.dataset.cmdAttachRepo || '';
        const repoPath = attachRepoBtn.dataset.cmdRepoPath || '';
        if (label) {
          composerAttachments.push({
            id: `att-repo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            kind: 'repo',
            name: label,
            repoPath,
            sizeLabel: 'workspace'
          });
          renderComposerAttachments();
          switchTab('chat');
          showToast(`📁 Attached ${label}`);
          setTimeout(() => $('composer-input')?.focus(), 40);
        }
        return;
      }

      const cmdItem = e.target.closest('[data-cmd-act], [data-cmd-thread]');
      if (cmdItem) {
        closeCommandPalette();
        clearPinnedNav();
        recentResumeUntil = 0;
        const act = cmdItem.dataset.cmdAct;
        const tid = cmdItem.dataset.cmdThread;
        if (tid) recordFreqUsage('threads', tid);
        else if (act) recordFreqUsage('threads', act);
        if (tid) {
          ensureEditorTabOpen(tid);
          setPinnedNav({ threadId: tid, durationMs: 45000 });
          prefs.selectedThreadId = tid;
          prefs.lastReplyThreadId = tid;
          prefs.composerMode = 'reply';
          saveJson(STORAGE_KEYS.PREFS, prefs);
          switchTab('chat');
          renderIdeSidebar();
          fetchThreadDetail(tid);
        } else if (act === 'attach-file') {
          switchTab('chat');
          $('composer-file-input')?.click();
        } else if (act === 'pick-repo-file') {
          switchTab('chat');
          openRepoFilePicker();
        } else if (act === 'open-command-pwa' || act === 'open-discipline' || act === 'new-payment-hold') {
          window.open('https://husseinbdeir.github.io/planner/', '_blank', 'noopener');
        } else if (act === 'new-agy') {
          enterNewSessionMode('antigravity');
        } else if (act === 'new-claude') {
          enterNewSessionMode('claude');
        } else if (act === 'sync') {
          syncData({ toast: true });
        } else if (act === 'push-test') {
          await sendTestPush(false);
        } else if (act === 'bgtasks') {
          switchTab('chat');
          const ctxPop = $('ctx-popover');
          if (ctxPop) ctxPop.hidden = true;
          const bgPop = $('bg-tasks-popover');
          if (bgPop) bgPop.hidden = false;
          renderChatView();
        } else if (act === 'compact') {
          if (isNewSessionMode() || !cleanTargetThreadId(prefs.selectedThreadId)) {
            showToast('Select an active session first to run /compact');
          } else {
            dispatchRemoteCommand({ type: 'sessionAction', action: 'compact', subAction: 'compact', id: prefs.selectedThreadId });
            showToast('Dispatched /compact');
          }
        } else if (act === 'theme') {
          applyTheme(prefs.theme === 'dark' ? 'light' : 'dark', true);
        }
      }
    });

    // Theme, Sound, Sync buttons
    $('btn-theme-toggle')?.addEventListener('click', () =>
      applyTheme(prefs.theme === 'dark' ? 'light' : 'dark', true)
    );
    $('mobile-theme-btn')?.addEventListener('click', () =>
      applyTheme(prefs.theme === 'dark' ? 'light' : 'dark', true)
    );
    $('btn-sound-toggle')?.addEventListener('click', () => {
      prefs.sound = !prefs.sound;
      saveJson(STORAGE_KEYS.PREFS, prefs);
      showToast(prefs.sound ? 'Audio chimes enabled' : 'Audio chimes muted');
    });
    $('btn-sync-now')?.addEventListener('click', () => syncData({ toast: true }));
    $('mobile-sync-btn')?.addEventListener('click', () => syncData({ toast: true }));
    $('btn-refresh-git')?.addEventListener('click', () => renderWorkspacesView());

    // Background Tasks & Context Window Popovers
    $('btn-bg-tasks')?.addEventListener('click', () => {
      const bgPop = $('bg-tasks-popover');
      const ctxPop = $('ctx-popover');
      if (!bgPop) return;
      const nextOpen = bgPop.hidden;
      bgPop.hidden = !nextOpen;
      if (nextOpen && ctxPop) ctxPop.hidden = true;
      renderChatView();
      if (nextOpen && prefs.selectedThreadId && !isNewSessionMode()) {
        fetchThreadDetail(prefs.selectedThreadId, pinnedNavProvider || '').catch(() => {});
      }
    });
    $('btn-close-bgtasks')?.addEventListener('click', () => {
      const bgPop = $('bg-tasks-popover');
      if (bgPop) bgPop.hidden = true;
      $('btn-bg-tasks')?.classList.remove('active');
      $('btn-bg-tasks')?.setAttribute('aria-expanded', 'false');
    });
    $('btn-refresh-bgtasks')?.addEventListener('click', async () => {
      if (!prefs.selectedThreadId || isNewSessionMode()) return;
      const activeRow = (appState?.rows || []).find((r) => r.id === prefs.selectedThreadId);
      const prov = activeRow?.provider || pinnedNavProvider || 'antigravity';
      await fetchThreadDetail(prefs.selectedThreadId, prov);
      for (const key of openBgTaskDetails) {
        if (key.startsWith(`${prefs.selectedThreadId}:`)) {
          const tid = key.slice(prefs.selectedThreadId.length + 1);
          await fetchBgTaskLiveLog(prefs.selectedThreadId, tid, prov);
        }
      }
      showToast('Refreshed background tasks & logs');
    });
    $('btn-stop-all-bgtasks')?.addEventListener('click', async () => {
      if (!prefs.selectedThreadId || isNewSessionMode()) return;
      const activeRow = (appState?.rows || []).find((r) => r.id === prefs.selectedThreadId);
      await cancelAllSessionBgTasks(prefs.selectedThreadId, activeRow?.provider || 'antigravity');
    });
    $('chat-stream')?.addEventListener(
      'toggle',
      (ev) => {
        const det = ev.target;
        if (!det || det.tagName !== 'DETAILS' || !det.dataset?.chatDetailKey) return;
        const key = det.dataset.chatDetailKey;
        const openMap = getThreadOpenDetailsMap(prefs.selectedThreadId, false);
        const renderedOpen = det.dataset.renderedOpen === '1';
        if (det.open === renderedOpen && !openMap?.has(key)) return;
        det.dataset.renderedOpen = det.open ? '1' : '0';
        const targetMap = openMap || getThreadOpenDetailsMap(prefs.selectedThreadId, true);
        if (targetMap) {
          targetMap.set(key, det.open);
        }
        const stack = det.closest('.code-steps-stack');
        if (stack && det.classList.contains('code-step-card')) {
          const btn = stack.querySelector('[data-toggle-all-steps]');
          if (btn) {
            const allOpen = Array.from(stack.querySelectorAll('details.code-step-card')).every((d) => d.open);
            btn.textContent = allOpen ? 'Collapse all' : 'Expand all';
          }
        }
      },
      true
    );

    $('bg-tasks-popover-list')?.addEventListener(
      'toggle',
      (ev) => {
        const det = ev.target?.closest?.('details.bg-task-item[data-bg-detail-key]');
        if (!det) return;
        const key = det.dataset.bgDetailKey;
        if (det.open) {
          openBgTaskDetails.add(key);
          const sid = det.dataset.sessId;
          const tid = det.dataset.taskId;
          const prov = det.dataset.prov || '';
          if (sid && tid) {
            fetchBgTaskLiveLog(sid, tid, prov).catch(() => {});
          }
        } else {
          openBgTaskDetails.delete(key);
        }
      },
      true
    );

    $('btn-ctx-window')?.addEventListener('click', () => {
      const pop = $('ctx-popover');
      const bgPop = $('bg-tasks-popover');
      if (pop) {
        pop.hidden = !pop.hidden;
        if (!pop.hidden && bgPop) bgPop.hidden = true;
      }
    });
    $('btn-close-ctx')?.addEventListener('click', () => {
      const pop = $('ctx-popover');
      if (pop) pop.hidden = true;
    });
    $('btn-ctx-compact')?.addEventListener('click', async () => {
      if (isNewSessionMode() || !cleanTargetThreadId(prefs.selectedThreadId)) {
        showToast('Start or select a session before running /compact');
        return;
      }
      const activeRow = (appState?.rows || []).find((r) => r.id === prefs.selectedThreadId);
      await dispatchRemoteCommand({
        type: 'sessionAction',
        action: 'compact',
        subAction: 'compact',
        id: prefs.selectedThreadId,
        provider: activeRow?.provider || 'antigravity'
      });
      showToast('Sent /compact to active session');
      const pop = $('ctx-popover');
      if (pop) pop.hidden = true;
    });

    $('btn-chat-open-vscode')?.addEventListener('click', async () => {
      if (isNewSessionMode()) {
        const prov = prefs.composerMode === 'new-claude' ? 'claude' : 'antigravity';
        await dispatchRemoteCommand({
          type: 'sessionAction',
          action: 'openNew',
          subAction: 'openNew',
          id: '',
          threadId: '',
          provider: prov,
          group: prefs.newSessionGroupId || ''
        });
        showToast(
          `Opened new blank ${prov === 'claude' ? 'Claude Code' : 'Antigravity'} tab in VS Code`
        );
        return;
      }
      const activeRow = (appState?.rows || []).find((r) => r.id === prefs.selectedThreadId);
      await dispatchRemoteCommand({
        type: 'sessionAction',
        action: 'open',
        subAction: 'open',
        id: prefs.selectedThreadId,
        provider: activeRow?.provider || 'antigravity'
      });
      showToast('Opened session tab in VS Code');
    });

    $('btn-chat-stop')?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await stopActiveSession(prefs.selectedThreadId);
    });

    $('composer-send-btn')?.addEventListener('click', async (e) => {
      const sendBtn = $('composer-send-btn');
      if (sendBtn?.classList.contains('is-stop')) {
        e.preventDefault();
        e.stopPropagation();
        await stopActiveSession(prefs.selectedThreadId);
      }
    });

    // Session select change in Chat
    $('chat-session-select')?.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === '__new_antigravity__' || val === '__new__') {
        enterNewSessionMode('antigravity');
        return;
      }
      if (val === '__new_claude__') {
        enterNewSessionMode('claude');
        return;
      }
      recentResumeUntil = 0;
      ensureEditorTabOpen(val);
      recordFreqUsage('threads', val);
      setPinnedNav({ threadId: val, durationMs: 45000 });
      prefs.selectedThreadId = val;
      prefs.lastReplyThreadId = val;
      prefs.composerMode = 'reply';
      prefs.newSessionGroupId = '';
      saveJson(STORAGE_KEYS.PREFS, prefs);
      markNotificationsCheckedForSession(prefs.selectedThreadId);
      renderChatView(true);
      renderIdeSidebar();
      fetchThreadDetail(prefs.selectedThreadId);
    });

    // Search in Sessions & IDE Explorer Sidebar
    $('sess-search-input')?.addEventListener('input', () => renderSessionsView());
    $('ide-sidebar-search')?.addEventListener('input', () => renderIdeSidebar());

    // Middle-click to close open editor tab (VS Code parity)
    $('ide-editor-tabs')?.addEventListener('auxclick', (e) => {
      if (isPinLocked() || e.button !== 1) return;
      const tab = e.target.closest('[data-editor-tab-id]');
      if (tab?.dataset.editorTabId) {
        e.preventDefault();
        closeEditorTab(tab.dataset.editorTabId);
      }
    });

    // Composer @mention / /slash quick-trigger buttons & drag-and-drop
    const insertComposerTriggerChar = (ch) => {
      if (isPinLocked()) return;
      const inp = $('composer-input');
      if (!inp) return;
      const val = String(inp.value || '');
      if (ch === '/') {
        if (!val.startsWith('/')) {
          inp.value = val ? `/ ${val}` : '/';
          inp.focus();
          inp.setSelectionRange(1, 1);
        } else {
          inp.focus();
          const slashEnd = inp.value.indexOf(' ') === -1 ? inp.value.length : inp.value.indexOf(' ');
          inp.setSelectionRange(slashEnd, slashEnd);
        }
      } else {
        const caret = typeof inp.selectionStart === 'number' ? inp.selectionStart : val.length;
        const before = val.slice(0, caret);
        const after = val.slice(caret);
        const spacer = before && !/\s$/.test(before) ? ' ' : '';
        const inserted = `${spacer}@`;
        inp.value = `${before}${inserted}${after}`;
        const nextPos = before.length + inserted.length;
        inp.focus();
        inp.setSelectionRange(nextPos, nextPos);
      }
      slashPopoverActiveIdx = 0;
      updateComposerActionButton();
      updateComposerSlashPopover();
    };
    $('btn-composer-slash')?.addEventListener('click', () => insertComposerTriggerChar('/'));
    $('btn-composer-mention')?.addEventListener('click', () => insertComposerTriggerChar('@'));

    const compBox = $('composer-box');
    if (compBox) {
      compBox.addEventListener('dragover', (e) => {
        if (isPinLocked()) return;
        e.preventDefault();
        compBox.classList.add('is-dragover');
      });
      compBox.addEventListener('dragleave', (e) => {
        if (!compBox.contains(e.relatedTarget)) {
          compBox.classList.remove('is-dragover');
        }
      });
      compBox.addEventListener('drop', async (e) => {
        e.preventDefault();
        compBox.classList.remove('is-dragover');
        if (isPinLocked()) return;
        const files = e.dataTransfer?.files;
        if (files && files.length) {
          await handleComposerFiles(files);
        }
      });
    }

    // Composer Multi-Device Host & Repo Selectors (Frequency-First)
    $('composer-device-select')?.addEventListener('change', (e) => {
      const val = e.target.value || 'auto';
      prefs.composerTargetDevice = val;
      if (val !== 'auto') recordFreqUsage('devices', val);
      saveJson(STORAGE_KEYS.PREFS, prefs);
      const dev = fleetDevicesMap.get(val);
      showToast(
        val === 'auto'
          ? 'Target host set to Auto (Active Host)'
          : `Target host set to ${dev?.name || val}`
      );
    });
    $('composer-repo-select')?.addEventListener('change', (e) => {
      const val = e.target.value || '';
      prefs.composerRepoPrefix = val;
      if (val) recordFreqUsage('repos', val);
      saveJson(STORAGE_KEYS.PREFS, prefs);
      if (isNewSessionMode()) renderChatView();
    });

    // Composer File Attachments & @Repo Picker
    $('btn-composer-attach')?.addEventListener('click', () => {
      $('composer-file-input')?.click();
    });
    $('chip-attach-file')?.addEventListener('click', () => {
      $('composer-file-input')?.click();
    });
    $('chip-pick-repo-file')?.addEventListener('click', () => {
      openRepoFilePicker();
    });
    $('composer-file-input')?.addEventListener('change', async (e) => {
      const files = e.target.files;
      if (files && files.length) {
        await handleComposerFiles(files);
        e.target.value = '';
      }
    });
    $('composer-input')?.addEventListener('paste', async (e) => {
      const items = Array.from(e.clipboardData?.items || []);
      const fileItems = items.filter((it) => it.kind === 'file');
      if (fileItems.length > 0) {
        const files = fileItems.map((it) => it.getAsFile()).filter(Boolean);
        if (files.length > 0) {
          await handleComposerFiles(files);
        }
      }
    });
    $('composer-input')?.addEventListener('input', (e) => {
      const el = e.target;
      el.style.height = 'auto';
      el.style.height = `${Math.min(140, el.scrollHeight)}px`;
      slashPopoverActiveIdx = 0;
      updateComposerActionButton();
      updateComposerSlashPopover();
    });
    $('composer-input')?.addEventListener('click', () => {
      updateComposerSlashPopover();
    });

    // Composer Form Submit
    $('chat-composer-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (isPinLocked()) return;
      await submitComposerPrompt();
    });

    $('composer-input')?.addEventListener('keydown', async (e) => {
      if (isPinLocked()) return;
      const pop = $('composer-slash-popover');
      const popOpen = Boolean(pop && !pop.hidden && slashPopoverItems.length > 0);
      if (popOpen) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const len = slashPopoverItems.length;
          slashPopoverActiveIdx =
            e.key === 'ArrowDown'
              ? (slashPopoverActiveIdx + 1) % len
              : (slashPopoverActiveIdx - 1 + len) % len;
          pop.querySelectorAll('.slash-pop-item').forEach((btn, idx) => {
            const isAct = idx === slashPopoverActiveIdx;
            btn.classList.toggle('active', isAct);
            btn.setAttribute('aria-selected', isAct ? 'true' : 'false');
            if (isAct) btn.scrollIntoView({ block: 'nearest' });
          });
          return;
        }
        if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
          e.preventDefault();
          await applySlashPopoverSelection(slashPopoverActiveIdx);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          closeSlashPopover();
          return;
        }
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        await submitComposerPrompt();
      }
    });

    // Command Palette & IDE Sidebar shortcuts
    $('open-cmd-palette')?.addEventListener('click', openCommandPalette);
    $('mobile-cmd-btn')?.addEventListener('click', openCommandPalette);
    $('cmd-close')?.addEventListener('click', closeCommandPalette);
    $('cmd-input')?.addEventListener('input', (e) => renderCommandPaletteResults(e.target.value));
    window.addEventListener('keydown', (e) => {
      if (isPinLocked()) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openCommandPalette();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleIdeSidebar();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        const t = e.target;
        if (t && t.matches && t.matches('[data-pair-code-input], #input-pair-six-code')) {
          e.preventDefault();
          claimSixDigitPairCode(t.value || '');
        } else if (t && t.matches && t.matches('[data-pair-link-input]')) {
          e.preventDefault();
          t.closest('.quick-pair-card')?.querySelector('[data-pair-link-submit]')?.click();
        } else if (t && t.id === 'input-pair-token') {
          e.preventDefault();
          $('btn-apply-pair-token')?.click();
        }
      } else if (e.key === 'Escape') {
        closeSlashPopover();
        closeCommandPalette();
        closeConnModal();
        closeNotifModal();
      }
    });

    window.addEventListener('hashchange', () => {
      ingestLocationPairHash(true);
    });

    window.addEventListener('popstate', (ev) => {
      if (isPinLocked()) return;
      const cmdModal = $('cmd-modal');
      if (cmdModal && !cmdModal.hidden) {
        closeCommandPalette();
        return;
      }
      const connModal = $('conn-modal');
      if (connModal && !connModal.hidden) {
        closeConnModal();
        return;
      }
      const notifModal = $('notif-modal');
      if (notifModal && !notifModal.hidden) {
        closeNotifModal();
        return;
      }
      const bgPop = $('bg-tasks-popover');
      if (bgPop && !bgPop.hidden) {
        bgPop.hidden = true;
        return;
      }
      const ctxPop = $('ctx-popover');
      if (ctxPop && !ctxPop.hidden) {
        ctxPop.hidden = true;
        return;
      }
      const targetTab = ev.state?.theoTab || 'pulse';
      if (targetTab && targetTab !== prefs.activeTab) {
        suppressHistoryPush = true;
        try {
          switchTab(targetTab);
        } finally {
          suppressHistoryPush = false;
        }
      }
    });
  }

  const stoppedSessionsById = new Map();

  // Optimistic session/group edits made on this device (unread, archive, group moves,
  // group create/rename/delete) are re-applied on top of every incoming SSE / local /
  // cloud snapshot until the workstation state agrees, or until they expire. Without
  // this, a cloud poll that lands before the relay drains the command queue silently
  // reverts the toggle (e.g. "○ Read" flips back to "● Unread").
  const PENDING_OVERRIDE_TTL_MS = 240000;
  const pendingRowOverrides = new Map();
  const pendingGroupOverrides = new Map();

  function noteRowOverride(id, patch) {
    const cleanId = String(id || '').trim();
    if (!cleanId || !patch) return;
    const prev = pendingRowOverrides.get(cleanId) || {};
    pendingRowOverrides.set(cleanId, { ...prev, ...patch, at: Date.now() });
  }

  function noteGroupOverride(gId, patch) {
    const cleanId = String(gId || '').trim();
    if (!cleanId || !patch) return;
    pendingGroupOverrides.set(cleanId, {
      ...patch,
      nameKey: String(patch.name || patch.nameKey || '')
        .trim()
        .toLowerCase(),
      at: Date.now()
    });
  }

  function applyPendingLocalOverrides(stateObj) {
    if (!stateObj || typeof stateObj !== 'object') return;
    if (pendingRowOverrides.size === 0 && pendingGroupOverrides.size === 0) return;
    const now = Date.now();
    if (!Array.isArray(stateObj.groups)) stateObj.groups = [];
    const rows = Array.isArray(stateObj.rows) ? stateObj.rows : [];
    const nameKeyOf = (g) =>
      String(g?.name || '')
        .trim()
        .toLowerCase();

    for (const [gId, rec] of Array.from(pendingGroupOverrides.entries())) {
      if (now - rec.at > PENDING_OVERRIDE_TTL_MS) {
        pendingGroupOverrides.delete(gId);
        continue;
      }
      if (rec.op === 'delete') {
        const before = stateObj.groups.length;
        stateObj.groups = stateObj.groups.filter(
          (g) => g && g.id !== gId && !(rec.nameKey && nameKeyOf(g) === rec.nameKey)
        );
        for (const r of rows) {
          if (r && r.group === gId) r.group = '';
        }
        if (before === stateObj.groups.length) pendingGroupOverrides.delete(gId);
      } else if (rec.op === 'create') {
        const byId = stateObj.groups.find((g) => g && g.id === gId);
        if (byId) {
          pendingGroupOverrides.delete(gId);
          continue;
        }
        const byName = rec.nameKey ? stateObj.groups.find((g) => g && nameKeyOf(g) === rec.nameKey) : null;
        if (byName) {
          // Workstation minted its own id for the same group — re-point pending row moves.
          for (const rr of pendingRowOverrides.values()) {
            if (rr.group === gId) rr.group = byName.id;
          }
          for (const r of rows) {
            if (r && r.group === gId) r.group = byName.id;
          }
          pendingGroupOverrides.delete(gId);
          continue;
        }
        stateObj.groups.push({ id: gId, name: rec.name || 'Group', collapsed: false });
      } else if (rec.op === 'rename') {
        const g = stateObj.groups.find((x) => x && x.id === gId);
        if (!g) continue;
        if (g.name === rec.name) pendingGroupOverrides.delete(gId);
        else g.name = rec.name;
      }
    }

    const groupIds = new Set(stateObj.groups.map((g) => g && g.id).filter(Boolean));
    for (const [id, rec] of Array.from(pendingRowOverrides.entries())) {
      if (now - rec.at > PENDING_OVERRIDE_TTL_MS) {
        pendingRowOverrides.delete(id);
        continue;
      }
      const r = rows.find((x) => x && x.id === id);
      if (!r) continue;
      let settled = true;
      if ('unread' in rec) {
        if (Boolean(r.unread) !== rec.unread) {
          r.unread = rec.unread;
          if (!rec.unread && r.dot === 'unread') r.dot = r.open ? 'idle' : null;
          if (rec.unread && !r.dot && r.status !== 'working' && r.status !== 'waiting') r.dot = 'unread';
          settled = false;
        }
      }
      if ('archived' in rec) {
        if (Boolean(r.archived) !== rec.archived) {
          r.archived = rec.archived;
          settled = false;
        }
      }
      if ('group' in rec) {
        const want = rec.group && groupIds.has(rec.group) ? rec.group : rec.group ? rec.group : '';
        if ((r.group || '') !== want) {
          r.group = want;
          settled = false;
        }
      }
      if (settled) pendingRowOverrides.delete(id);
    }
  }

  function applyStoppedSessionOverrides(stateObj) {
    if (!stateObj || !Array.isArray(stateObj.rows) || stoppedSessionsById.size === 0) return;
    const now = Date.now();
    for (const r of stateObj.rows) {
      if (!r || !r.id) continue;
      const stopRec = stoppedSessionsById.get(r.id);
      if (!stopRec) continue;
      if (now - stopRec.at > 300000) {
        stoppedSessionsById.delete(r.id);
        continue;
      }
      r.status = 'completed';
      r.statusLabel = 'Stopped';
      r.dot = r.open ? 'idle' : null;
      r.category = 'completed';
      r.unread = false;
      r.elsewhere = false;
      r.reason = null;
      r.bgTask = null;
    }
  }

  function isSessionActivelyRunning(tid) {
    const cleanId = String(tid || prefs.selectedThreadId || '').trim();
    if (!cleanId) return false;
    const row = (appState?.rows || []).find((r) => r.id === cleanId);
    const detail = threadsCache[cleanId] || null;
    const msgs = coalesceThreadMessages(detail?.messages || []);
    const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
    const nonOptMsgs = msgs.filter((m) => !m.optimistic);
    const lastNonOptMsg = nonOptMsgs.length > 0 ? nonOptMsgs[nonOptMsgs.length - 1] : null;

    const stopRec = stoppedSessionsById.get(cleanId);
    if (stopRec) {
      const hasNewOptimisticUserTurn = Boolean(
        lastMsg && lastMsg.optimistic && Number(lastMsg.optimisticAt || 0) > stopRec.at
      );
      const lastNonOptTimeMs = lastNonOptMsg?.createdAt ? Date.parse(lastNonOptMsg.createdAt) : 0;
      const hasNewServerUserTurn = Boolean(
        lastNonOptMsg &&
          lastNonOptMsg.role === 'user' &&
          lastNonOptMsg.id &&
          lastNonOptMsg.id !== stopRec.lastMsgId &&
          lastNonOptTimeMs > stopRec.at + 1000
      );
      if (hasNewOptimisticUserTurn || hasNewServerUserTurn) {
        stoppedSessionsById.delete(cleanId);
      } else if (Date.now() - stopRec.at < 300000) {
        return false;
      } else {
        stoppedSessionsById.delete(cleanId);
      }
    }

    const liveStream = liveStreamsByThreadId.get(cleanId);
    if (liveStream && liveStream.status === 'working' && Date.now() - Number(liveStream.receivedAt || 0) < 45000) {
      return true;
    }
    if (row?.status === 'working' || row?.dot === 'running' || row?.bgTask?.state === 'running') {
      return true;
    }
    if (row?.status === 'waiting' || row?.pendingQuestion) {
      return false;
    }
    if (lastMsg) {
      if (lastMsg.optimistic && Date.now() - Number(lastMsg.optimisticAt || 0) < 90000) {
        return true;
      }
      const msgTimeMs = lastMsg.createdAt ? Date.parse(lastMsg.createdAt) : 0;
      const isFreshUserDispatch =
        msgTimeMs > 0 &&
        Date.now() - msgTimeMs < 35 * 1000 &&
        (!row || msgTimeMs > Number(row.at || 0));
      if (lastMsg.role === 'user' && isFreshUserDispatch) {
        return true;
      }
    }
    return false;
  }

  function updateComposerActionButton() {
    const running = isSessionActivelyRunning(prefs.selectedThreadId);
    const stopHdrBtn = $('btn-chat-stop');
    if (stopHdrBtn) {
      stopHdrBtn.hidden = !running;
    }
    const btn = $('composer-send-btn');
    if (!btn) return;
    const inp = $('composer-input');
    const hasDraft = Boolean((inp && inp.value.trim().length > 0) || composerAttachments.length > 0);
    const isReplyMode = !prefs.composerMode || prefs.composerMode === 'reply';
    const shouldShowStop = isReplyMode && !hasDraft && running;
    const shouldBrighten = !shouldShowStop && hasDraft;
    btn.classList.toggle('is-stop', shouldShowStop);
    btn.classList.toggle('is-ready', shouldBrighten);
    btn.removeAttribute('title');
    btn.setAttribute('aria-label', shouldShowStop ? 'Stop running session' : 'Dispatch Prompt');
  }

  async function stopActiveSession(explicitId = '') {
    const tid = String(explicitId || prefs.selectedThreadId || '').trim();
    if (!tid) return;
    const isDraftNew = tid.startsWith('draft-new-');
    const boundTargetDev =
      isDraftNew && pendingNewSessionBind && pendingNewSessionBind.draftThreadId === tid
        ? pendingNewSessionBind.targetDeviceId || ''
        : '';
    if (isDraftNew && pendingNewSessionBind && pendingNewSessionBind.draftThreadId === tid) {
      pendingNewSessionBind = null;
    }
    const row = (appState?.rows || []).find((r) => r.id === tid);
    const detail = threadsCache[tid] || null;
    if (detail && Array.isArray(detail.messages)) {
      detail.messages = detail.messages.filter((m) => !m.optimistic);
    }
    const msgs = coalesceThreadMessages(detail?.messages || []);
    const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
    const provider = (detail?.provider || row?.provider) === 'claude' ? 'claude' : 'antigravity';

    stoppedSessionsById.set(tid, {
      at: Date.now(),
      msgCount: msgs.length,
      lastMsgId: lastMsg?.id || ''
    });
    liveStreamsByThreadId.delete(tid);

    if (row) {
      row.status = 'completed';
      row.statusLabel = 'Stopped';
      row.dot = row.open ? 'idle' : null;
      row.category = 'completed';
      row.unread = false;
      row.elsewhere = false;
      row.reason = null;
      row.bgTask = null;
    }

    haptic(20);
    persistCache();
    updateComposerActionButton();
    renderAll();
    showToast('■ Stopped session');

    await dispatchRemoteCommand({
      type: 'sessionAction',
      action: 'interrupt',
      subAction: 'interrupt',
      id: isDraftNew ? '' : tid,
      threadId: isDraftNew ? '' : tid,
      draftThreadId: isDraftNew ? tid : undefined,
      targetDeviceId: boundTargetDev || row?.deviceId || undefined,
      provider
    });
  }

  function updateComposerModePills() {
    syncProviderNewSessionButtons();
    document.querySelectorAll('[data-comp-mode]').forEach((b) => {
      b.classList.toggle('active', b.dataset.compMode === prefs.composerMode);
    });
    updateComposerActionButton();
  }

  async function submitComposerPrompt() {
    closeSlashPopover();
    const inp = $('composer-input');
    if (!inp) return;
    const sendBtn = $('composer-send-btn');
    const rawText = inp.value.trim();
    if (!rawText && composerAttachments.length === 0) {
      if (sendBtn?.classList.contains('is-stop') || isSessionActivelyRunning(prefs.selectedThreadId)) {
        await stopActiveSession();
      }
      return;
    }

    // Intercept standalone local IDE action slash commands so they execute directly
    if (composerAttachments.length === 0 && /^\/[a-z-]+$/i.test(rawText)) {
      const cmdMatch = SLASH_COMMAND_CATALOG.find(
        (c) => c.kind === 'action' && c.id.toLowerCase() === rawText.toLowerCase()
      );
      if (cmdMatch) {
        slashPopoverItems = [cmdMatch];
        slashPopoverTrigger = { mode: 'slash', query: cmdMatch.id.slice(1), startIdx: 0, endIdx: inp.value.length };
        await applySlashPopoverSelection(0);
        return;
      }
    }

    const sentAttachments = [...composerAttachments];
    composerAttachments = [];
    renderComposerAttachments();

    inp.value = '';
    inp.style.height = 'auto';
    haptic(15);
    playChime('send');

    const repoRefs = sentAttachments.filter((a) => a.kind === 'repo');
    const fileRefs = sentAttachments.filter((a) => a.kind !== 'repo');
    const contextHeader = repoRefs.length
      ? `${repoRefs
          .map((r) => {
            const relMatch = String(r.repoPath || '').replace(/\\/g, '/').match(/\/bhfirms\/([^\n]+)$/i);
            return relMatch ? `${r.name} (bhfirms/${relMatch[1]})` : r.name;
          })
          .join(', ')}\n`
      : '';
    const attachDisplayLine = sentAttachments.length
      ? `\n\n📎 Attached: ${sentAttachments.map((a) => a.name).join(', ')}`
      : '';
    const text = `${contextHeader}${rawText || (fileRefs.length ? `Please inspect the attached file(s): ${fileRefs.map((f) => f.name).join(', ')}` : '')}`.trim();

    const activeRow = (appState?.rows || []).find((r) => r.id === prefs.selectedThreadId);
    const isNewAgy =
      prefs.composerMode === 'new-antigravity' ||
      (prefs.selectedThreadId === '__new__' && prefs.composerMode !== 'new-claude');
    const isNewClaude = prefs.composerMode === 'new-claude';
    const isNew = Boolean(
      isNewAgy || isNewClaude || !prefs.selectedThreadId || prefs.selectedThreadId === '__new__'
    );
    const provider = isNewClaude
      ? 'claude'
      : isNewAgy
        ? 'antigravity'
        : activeRow?.provider || threadsCache[prefs.selectedThreadId]?.provider || 'antigravity';
    const targetId = isNew ? '' : prefs.selectedThreadId;
    const targetGroupId = isNew ? prefs.newSessionGroupId || '' : '';

    let draftId = '';
    if (isNew) {
      draftId = `draft-new-${Date.now()}`;
      const knownIds = new Set((appState?.rows || []).map((r) => r && r.id).filter(Boolean));
      const cleanTitle =
        (rawText || text).replace(/\s+/g, ' ').trim().slice(0, 56) || 'New Session';
      threadsCache[draftId] = {
        id: draftId,
        provider,
        title: cleanTitle,
        folder: prefs.composerRepoPrefix
          ? `Scope: ${prefs.composerRepoPrefix}`
          : 'New Unrelated Session',
        contextWindow: {
          usedTokens: Math.max(120, Math.round(text.length / 4)),
          limitTokens: provider === 'claude' ? 1000000 : 256000
        },
        messages: [
          {
            id: `local-${Date.now()}`,
            role: 'user',
            createdAt: new Date().toISOString(),
            text: `${rawText || text}${attachDisplayLine}`,
            toolCalls: [],
            optimistic: true,
            optimisticAt: Date.now()
          }
        ]
      };
      const boundDev =
        prefs.composerTargetDevice && prefs.composerTargetDevice !== 'auto'
          ? String(prefs.composerTargetDevice).trim()
          : prefs.selectedDeviceFilter && prefs.selectedDeviceFilter !== 'all'
            ? String(prefs.selectedDeviceFilter).trim()
            : '';
      pendingNewSessionBind = {
        draftThreadId: draftId,
        provider,
        targetDeviceId: boundDev,
        promptText: rawText || text,
        groupId: targetGroupId,
        knownIds,
        createdAt: Date.now()
      };
      ensureEditorTabOpen(draftId);
      prefs.selectedThreadId = draftId;
      prefs.composerMode = 'reply';
      prefs.newSessionGroupId = '';
      saveJson(STORAGE_KEYS.PREFS, prefs);
      persistCache();
      updateComposerModePills();
      renderChatView(true);
      renderIdeSidebar();
    } else if (targetId) {
      stoppedSessionsById.delete(targetId);
      const hadPendingQ = Boolean(
        activeRow?.pendingQuestion ||
          (Array.isArray(appState?.approvals) && appState.approvals.some((a) => a && a.sessionId === targetId))
      );
      const existingMsgs = coalesceThreadMessages(threadsCache[targetId]?.messages || []);
      const lastExistingMsg = existingMsgs.length > 0 ? existingMsgs[existingMsgs.length - 1] : null;
      const lastTurnQs =
        lastExistingMsg && lastExistingMsg.role === 'assistant'
          ? resolveQuestionsForTurn(lastExistingMsg, null).questions
          : [];
      if (hadPendingQ || lastTurnQs.length > 0) {
        const matchedApp = (appState?.approvals || []).find((a) => a && a.sessionId === targetId);
        recordQuestionAnswered({
          sessionId: targetId,
          approvalId: matchedApp?.approvalId || '',
          turnId: String(lastExistingMsg?.id || ''),
          stepIndex: activeRow?.pendingQuestion?.stepIndex ?? activeRow?.stepCount ?? null,
          questions: lastTurnQs.length > 0 ? lastTurnQs : normalizeFrontendQuestions(activeRow?.pendingQuestion?.questions),
          summary: `${rawText || text}`,
          skipped: false
        });
        if (Array.isArray(appState?.approvals)) {
          appState.approvals = appState.approvals.filter((a) => a && a.sessionId !== targetId);
        }
        markNotificationsCheckedForSession(targetId);
      }
      if (activeRow) {
        activeRow.pendingQuestion = null;
        activeRow.status = 'working';
        activeRow.statusLabel = 'Running';
        activeRow.dot = 'running';
      }
      if (!threadsCache[targetId]) {
        threadsCache[targetId] = { id: targetId, provider, messages: [] };
      }
      const baseCountBeforePush = (threadsCache[targetId].messages || []).filter((m) => !m?.optimistic).length;
      threadsCache[targetId].messages.push({
        id: `local-${Date.now()}`,
        role: 'user',
        createdAt: new Date().toISOString(),
        text: `${rawText || text}${attachDisplayLine}`,
        toolCalls: [],
        optimistic: true,
        optimisticQuestionAnswer: hadPendingQ,
        baseMsgCount: baseCountBeforePush,
        optimisticAt: Date.now()
      });
      persistCache();
      renderAll();
    }

    const res = await dispatchRemoteCommand({
      type: 'send',
      id: targetId,
      threadId: targetId,
      draftThreadId: draftId || undefined,
      provider,
      prompt: text,
      group: targetGroupId || undefined,
      attachments: fileRefs.map((f) => ({
        name: f.name,
        mime: f.mime,
        size: f.size,
        dataUrl: f.dataUrl || '',
        textContent: f.textContent || ''
      })),
      newSession: isNew
    });

    recentResumeUntil = 0;
    if (isNew) {
      if (pendingNewSessionBind && res?.id) {
        pendingNewSessionBind.cmdId = res.id;
      }
      const returnedRealId = cleanTargetThreadId(
        res?.out?.id || res?.out?.result?.id || res?.out?.result?.sessionId || ''
      );
      if (returnedRealId) {
        bindDraftThreadToRealSession(draftId, returnedRealId, provider);
      }
    }

    if (res.mode === 'cloud') {
      setTimeout(() => syncData(), 1800);
      setTimeout(() => syncData(), 4000);
      setTimeout(() => syncData(), 7500);
      setTimeout(() => syncData(), 12000);
      if (res.id) {
        setTimeout(() => {
          const q = lastCloudQueue || {};
          const hasResult = Boolean(q.results && q.results[res.id]);
          const inQueue =
            Array.isArray(q.commands) && q.commands.some((c) => c && c.id === res.id);
          const stillUnbound =
            !isNew || (pendingNewSessionBind && pendingNewSessionBind.cmdId === res.id);
          if (!hasResult && !inQueue && stillUnbound) {
            dispatchRemoteCommand({
              type: 'send',
              id: res.id,
              threadId: targetId,
              provider,
              prompt: text,
              group: targetGroupId || undefined,
              attachments: fileRefs.map((f) => ({
                name: f.name,
                mime: f.mime,
                size: f.size,
                dataUrl: f.dataUrl || '',
                textContent: f.textContent || ''
              })),
              newSession: isNew
            }).catch(() => {});
          }
        }, 4500);
      }
    }

    showToast(
      res.mode === 'local_ws' || res.mode === 'edge_ws'
        ? `⚡ Streaming live from ${provider === 'claude' ? 'Claude Code' : 'Antigravity'} (${res.mode === 'edge_ws' ? 'Edge WS' : 'Direct WS'})`
        : res.mode === 'cloud'
          ? `Dispatched via THEO Cloud Relay`
          : res.mode === 'local'
            ? `Sent to ${provider === 'claude' ? 'Claude Code' : 'Antigravity'} (Direct Host)`
            : `Queued in Outbox (will send when online)`
    );
  }

  function applyNotificationNav(nav) {
    if (!nav || typeof nav !== 'object') return false;
    const threadId = String(nav.threadId || nav.sessionId || '').trim();
    const reminderId = String(nav.reminderId || '').trim();
    const tab = String(nav.tab || '').trim();
    if (!threadId && !reminderId && !tab) return false;

    const notifId = String(nav.id || nav.checkedNotifId || '').trim();
    const notifTag = String(nav.tag || nav.checkedNotifTag || '').trim();
    const notifKey = notifId || notifTag;
    if (notifId || notifTag) {
      markNotifConsumed(notifId, notifTag, nav.checkedNotifId, nav.checkedNotifTag);
    }
    if (notifKey) {
      markNotificationChecked(notifKey, { navigate: false });
    }
    if (threadId) {
      markNotificationsCheckedForSession(threadId);
    }

    if ('caches' in window) {
      caches
        .open(NAV_HANDOFF_CACHE)
        .then((cache) =>
          Promise.all([
            cache.delete(PENDING_NAV_CACHE_URL),
            cache.delete(LAST_PUSH_NAV_CACHE_URL)
          ])
        )
        .catch(() => {});
    }
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'clear-pending-nav' });
      }
    } catch {}

    setPinnedNav({
      threadId,
      provider: nav.provider || '',
      title: nav.title || nav.sessionTitle || '',
      reminderId,
      durationMs: 90000
    });

    if (threadId) {
      ensureEditorTabOpen(threadId);
      prefs.selectedThreadId = threadId;
      prefs.lastReplyThreadId = threadId;
      prefs.composerMode = 'reply';
      prefs.activeTab = 'chat';
      saveJson(STORAGE_KEYS.PREFS, prefs);
      switchTab('chat');
      renderAll();
      fetchThreadDetail(threadId, nav.provider || pinnedNavProvider || '').catch(() => {});
    } else if (reminderId || tab === 'discipline') {
      window.location.href = `https://husseinbdeir.github.io/planner/${reminderId ? `?tab=tasks&taskId=${encodeURIComponent(reminderId)}` : ''}`;
      return true;
    } else if (tab) {
      if (String(notifTag || '').startsWith('theo-quota-') && nav.provider) {
        if (!prefs.collapsedQuotaCards || typeof prefs.collapsedQuotaCards !== 'object') {
          prefs.collapsedQuotaCards = {};
        }
        prefs.collapsedQuotaCards[nav.provider] = false;
      }
      prefs.activeTab = tab;
      saveJson(STORAGE_KEYS.PREFS, prefs);
      switchTab(tab);
      renderAll();
      if (String(notifTag || '').startsWith('theo-quota-')) {
        setTimeout(() => {
          $('pulse-quota-grid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 80);
      }
    }

    syncData({ force: true }).catch(() => {});
    return true;
  }

  async function consumePendingNotificationNav(opts = {}) {
    const allowUnseenPush = Boolean(opts && opts.allowUnseenPush);
    const inNewSessionFlow = Boolean(
      isNewSessionMode() ||
        String(prefs.selectedThreadId || '').startsWith('draft-new-') ||
        pendingNewSessionBind
    );
    try {
      if ('caches' in window) {
        const cache = await caches.open(NAV_HANDOFF_CACHE);
        const pendingRes = await cache.match(PENDING_NAV_CACHE_URL);
        if (pendingRes) {
          await cache.delete(PENDING_NAV_CACHE_URL);
          await cache.delete(LAST_PUSH_NAV_CACHE_URL);
          const pending = await pendingRes.json().catch(() => null);
          const pendingTs = Number(pending?.ts || 0);
          const startedNewAfterClick = Boolean(
            pendingNewSessionBind && Number(pendingNewSessionBind.createdAt || 0) > pendingTs
          );
          if (pending && Date.now() - pendingTs < 20 * 60 * 1000 && !startedNewAfterClick) {
            return applyNotificationNav(pending);
          }
        }
        if (allowUnseenPush) {
          if (inNewSessionFlow || (pinnedNavThreadId && Date.now() < pinnedNavUntil)) {
            await cache.delete(LAST_PUSH_NAV_CACHE_URL).catch(() => {});
            return false;
          }
          const lastPushRes = await cache.match(LAST_PUSH_NAV_CACHE_URL);
          if (lastPushRes) {
            await cache.delete(LAST_PUSH_NAV_CACHE_URL);
            const lastPush = await lastPushRes.json().catch(() => null);
            const pushId = String(lastPush?.id || '').trim();
            const pushTag = String(lastPush?.tag || '').trim();
            if (
              lastPush &&
              Date.now() - Number(lastPush.ts || 0) < 20 * 60 * 1000 &&
              !isNotifConsumed(pushId, pushTag)
            ) {
              return applyNotificationNav(lastPush);
            }
          }

          // Fallback: check the newest unconsumed push recorded by sw.js in UNREAD_NOTIFS_CACHE_URL
          const unreadRes = await cache.match(UNREAD_NOTIFS_CACHE_URL);
          if (unreadRes) {
            const unreadData = await unreadRes.json().catch(() => null);
            const unreadItems = Array.isArray(unreadData?.items)
              ? unreadData.items
              : Array.isArray(unreadData)
                ? unreadData
                : [];
            const recentUnread = unreadItems.find(
              (it) =>
                it &&
                !it.checked &&
                (it.threadId || it.reminderId) &&
                Date.now() - Number(it.ts || 0) < 15 * 60 * 1000 &&
                !isNotifConsumed(it.id, it.tag)
            );
            if (recentUnread) {
              return applyNotificationNav(recentUnread);
            }
          }
        }
      }
    } catch {}

    if (inNewSessionFlow) return false;
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'consume-pending-nav',
          allowUnseenPush
        });
      }
    } catch {}
    return false;
  }

  // Register Service Worker & Push Navigation Listener
  function registerServiceWorker() {
    if (initialNoSse || location.search.includes('nosse=1')) return;
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      let refreshingSw = false;
      const hadController = Boolean(navigator.serviceWorker.controller);
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || refreshingSw) return;
        refreshingSw = true;
        location.reload();
      });

      navigator.serviceWorker
        .register('sw.js?v=58', { updateViaCache: 'none' })
        .then((reg) => {
          reg.update().catch(() => {});
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
          reg.addEventListener('updatefound', () => {
            const nw = reg.installing;
            if (!nw) return;
            nw.addEventListener('statechange', () => {
              if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                nw.postMessage({ type: 'SKIP_WAITING' });
              }
            });
          });
          document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
              wasAppHiddenAt = Date.now();
            } else {
              const hiddenDur = wasAppHiddenAt > 0 ? Date.now() - wasAppHiddenAt : 99999;
              wasAppHiddenAt = 0;
              if (hiddenDur >= 1500) {
                recentResumeUntil = Date.now() + 25000;
              }
              reg.update().catch(() => {});
              syncUnreadNotificationsWithSwCache();
              consumePendingNotificationNav({ allowUnseenPush: hiddenDur >= 1500 }).finally(() => {
                syncData({ force: true });
              });
            }
          });
          syncUnreadNotificationsWithSwCache();
          consumePendingNotificationNav({ allowUnseenPush: true });
          return checkExistingPushSub();
        })
        .catch(() => {});

      navigator.serviceWorker.addEventListener('message', (e) => {
        const m = e && e.data;
        if (!m) return;
        if (m.type === 'theo-nav') {
          applyNotificationNav(m);
        } else if (m.type === 'theo-push') {
          if (m.item && typeof m.item === 'object') {
            recordTheoNotification(m.item, { force: true, checked: false });
          } else if (m.payload && m.payload.title) {
            recordTheoNotification(m.payload, { force: true, checked: false });
          }
          if (m.payload && m.payload.title) {
            playChime(m.payload.requireInteraction ? 'approve' : 'confirm');
            const p = m.payload;
            const navTarget =
              p.threadId || p.reminderId || p.tab
                ? {
                    id: p.id || p.tag || '',
                    tag: p.tag || '',
                    tab: p.tab || (p.threadId ? 'chat' : 'pulse'),
                    threadId: p.threadId || '',
                    provider: p.provider || '',
                    reminderId: p.reminderId || '',
                    title: p.sessionTitle || p.title || ''
                  }
                : null;
            const inNewSessionFlow = Boolean(
              isNewSessionMode() ||
                String(prefs.selectedThreadId || '').startsWith('draft-new-') ||
                pendingNewSessionBind
            );
            // If the app is backgrounded when the push arrives (and not in a new-session draft), pre-stage the session
            if (navTarget && navTarget.threadId && document.hidden && !inNewSessionFlow) {
              setPinnedNav({
                threadId: navTarget.threadId,
                provider: navTarget.provider || '',
                title: navTarget.title || '',
                durationMs: 90000
              });
              prefs.selectedThreadId = navTarget.threadId;
              prefs.composerMode = 'reply';
              prefs.activeTab = 'chat';
              saveJson(STORAGE_KEYS.PREFS, prefs);
              switchTab('chat');
              renderAll();
            } else {
              showToast(
                `${p.title}${p.body ? ': ' + String(p.body).slice(0, 95) : ''}`,
                navTarget
              );
            }
          }
          syncData({ force: true });
        }
      });
    }
  }

  // Bootstrap
  function init() {
    if (isStandalone()) {
      document.documentElement.classList.add('ios-standalone');
    }
    try {
      localStorage.removeItem('theo_remote_cache_v1');
      localStorage.removeItem('theo_remote_cache_v2');
    } catch {}
    applyTheme(prefs.theme);
    hydrateStaticIcons();
    initPinLock();
    loadPersonalLedgerFromLocal();
    bindEvents();


    window.addEventListener('focus', () => {
      const hiddenDur = wasAppHiddenAt > 0 ? Date.now() - wasAppHiddenAt : 0;
      if (hiddenDur >= 1500) {
        recentResumeUntil = Date.now() + 25000;
      }
      loadPersonalLedgerFromLocal();
      syncUnreadNotificationsWithSwCache();
      consumePendingNotificationNav({ allowUnseenPush: hiddenDur >= 1500 }).finally(() => {
        renderAll();
        syncData({ force: true }).catch(() => {});
      });
    });
    window.addEventListener('pageshow', (ev) => {
      if (ev && ev.persisted) {
        recentResumeUntil = Date.now() + 25000;
        consumePendingNotificationNav({ allowUnseenPush: true });
      }
    });

    if (appState && typeof appState === 'object') {
      storeHostSnapshotEntry(appState, appState?.device?.id || '');
    }
    if (localBootInfo?.device?.id) {
      localWsDevice = localBootInfo.device;
      updateFleetDevices([{ ...localBootInfo.device, online: true, local: true, lastSeen: Date.now() }]);
    }

    const urlParams = new URLSearchParams(location.search);
    const tabParam = urlParams.get('tab');
    const threadParam = urlParams.get('thread') || urlParams.get('session');
    const provParam = urlParams.get('provider');
    const remParam = urlParams.get('rem');
    const newParam = urlParams.get('new');
    hasExplicitBootUrlNav = Boolean(threadParam || remParam || tabParam || newParam);

    if (!hasExplicitBootUrlNav) {
      restorePinnedNavFromSession();
    } else {
      clearPinnedNav();
    }

    if (newParam === 'antigravity' || newParam === 'claude') {
      prefs.composerMode = `new-${newParam}`;
      prefs.selectedThreadId = '__new__';
      prefs.activeTab = 'chat';
      saveJson(STORAGE_KEYS.PREFS, prefs);
      updateComposerModePills();
    }

    if (threadParam || remParam || tabParam || newParam) {
      try {
        const cleanUrl = location.pathname + (location.hash || '');
        history.replaceState({ theoTab: tabParam || (newParam ? 'chat' : prefs.activeTab || 'pulse'), overlay: '' }, '', cleanUrl);
      } catch {}
    }

    if (threadParam) {
      applyNotificationNav({
        tab: 'chat',
        threadId: threadParam,
        provider: provParam || '',
        clicked: true
      });
    } else if (remParam || tabParam === 'discipline') {
      window.location.replace(
        `https://husseinbdeir.github.io/planner/${remParam ? `?tab=tasks&taskId=${encodeURIComponent(remParam)}` : ''}`
      );
      return;
    } else if (newParam === 'antigravity' || newParam === 'claude') {
      suppressHistoryPush = true;
      try {
        switchTab('chat');
      } finally {
        suppressHistoryPush = false;
      }
    } else if (!hasExplicitBootUrlNav && pinnedNavThreadId && Date.now() < pinnedNavUntil) {
      prefs.selectedThreadId = pinnedNavThreadId;
      prefs.composerMode = 'reply';
      prefs.activeTab = 'chat';
      saveJson(STORAGE_KEYS.PREFS, prefs);
      suppressHistoryPush = true;
      try {
        switchTab('chat');
      } finally {
        suppressHistoryPush = false;
      }
      fetchThreadDetail(pinnedNavThreadId, pinnedNavProvider || '');
    } else {
      const startTab =
        tabParam || (prefs.activeTab === 'discipline' ? 'pulse' : prefs.activeTab) || 'pulse';
      suppressHistoryPush = true;
      try {
        switchTab(startTab);
      } finally {
        suppressHistoryPush = false;
      }
    }

    // Clear boot nav lock after initial settle so normal user interactions work freely
    if (hasExplicitBootUrlNav) {
      setTimeout(() => {
        hasExplicitBootUrlNav = false;
      }, 8000);
    }

    if (appState) {
      applyAnsweredQuestionOverrides(appState);
    }
    renderAll();
    if (!hasExplicitBootUrlNav && !isHeadlessBrowser) {
      consumePendingNotificationNav({ allowUnseenPush: true });
    }
    if (!isHeadlessBrowser && (prefs.edgeRelayUrl || discoveredEdgeUrl)) {
      connectEdgeWs(prefs.edgeRelayUrl || discoveredEdgeUrl).catch(() => {});
    }
    if (!isHeadlessBrowser) {
      syncData();
      if (!initialNoSse) {
        setInterval(() => {
          if (document.hidden) return;
          if (localWsAuthed && localWs && localWs.readyState === 1) return;
          if (!hasAnyPairingCredentials() && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '')) {
            return;
          }
          syncData();
        }, 4500);
      }
      registerServiceWorker();
    }
  }

  init();
})();
