(() => {
  'use strict';
  const S = Object.create(null);
  const registeredModules = typeof window.__theoConsumeModules === 'function' ? window.__theoConsumeModules() : [];
  const expectedOrder = ['models', 'transport', 'sidebar', 'inspector', 'chat', 'views'];
  if (registeredModules.length !== expectedOrder.length || expectedOrder.some((name, idx) => registeredModules[idx]?.[0] !== name)) {
    throw new Error('THEO module load order mismatch');
  }
  const factories = Object.fromEntries(registeredModules);


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

  const PIN_OUTLINE_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.85 3.25l3.9 3.9M9.6 4L7.6 6 4.4 7l4.6 4.6 1-3.2 2-2M6.7 9.3L3.2 12.8"/></svg>';
  const PIN_FILLED_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.6 4L7.6 6 4.4 7l4.6 4.6 1-3.2 2-2Z" fill="currentColor" stroke-width="1"/><path d="M8.85 3.25l3.9 3.9M6.7 9.3L3.2 12.8"/></svg>';
  const isRowPinned = (r) => Boolean(r && r.pinned && !r.archived);
  const compareRowsPinnedFirst = (a, b) =>
    (isRowPinned(b) ? 1 : 0) - (isRowPinned(a) ? 1 : 0) ||
    Number(b?.at || 0) - Number(a?.at || 0) ||
    Number(b?.pinnedAt || 0) - Number(a?.pinnedAt || 0);
  const rankSearchMatchesWithPinnedFirst = (rawFiltered, q, weightFn) => {
    const rankPart = (list) => {
      if (!list.length) return [];
      const exact = list.filter((r) => String(r.title || '').toLowerCase() === q);
      const rest = list.filter((r) => String(r.title || '').toLowerCase() !== q);
      return exact.concat(rankByFreq(rest, 'threads', (r) => r.id, weightFn));
    };
    return rankPart(rawFiltered.filter((r) => isRowPinned(r))).concat(
      rankPart(rawFiltered.filter((r) => !isRowPinned(r)))
    );
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

  const RETIRED_WORKSPACE_IDS = new Set([
    'resort-operations',
    'trading-operations',
    'manufacturing-operations',
    'holding-operations',
    'realestate-operations',
    'insurance-operations',
    'codex-hub',
    'agent-board'
  ]);

  function normalizeInspectorTab(raw) {
    const t = String(raw || '').trim().toLowerCase();
    if (t === 'files' || t === 'code' || t === 'canvas') return 'files';
    if (t === 'git') return 'git';
    if (t === 'tasks' || t === 'agents' || t === 'checks' || t === 'outline') return 'tasks';
    return 'files';
  }

  const DEFAULT_PREFS = {
    theme: 'dark',
    themeUserSet: false,
    palette: 'graphite',
    lastDarkPalette: 'graphite',
    sidebarCollapsed: false,
    sidebarFilter: 'all',
    openEditorTabs: [],
    inspectorOpen: false,
    inspectorTab: 'files',
    inspectorViewMode: 'source',
    inspectorFullStage: false,
    splitWatchOpen: false,
    splitWatchThreadId: '',
    composerRouteExpanded: false,
    pinnedBgSessionId: '',
    sound: true,
    activeTab: 'pulse',
    desktopWorkbenchBootV92: false,
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
    freqUsage: { devices: {}, repos: {}, threads: {}, commands: {}, skills: {}, checks: {} },
    telemetryProv: 'all',
    selectedThreadId: '',
    selectedRepoId: 'isabi-app',
    composerMode: 'reply',
    composerRepoPrefix: '',
    customBridgeUrl: '',
    selectedModelByProvider: { antigravity: 'gemini-4-argon', claude: 'claude-opus-4-7' },
    selectedThinkingEffort: { antigravity: 'high', claude: 'high' },
    threadModelConfig: {},
    claudePermissionMode: null,
    hideThirdPartyQuota: false,
    hideClaudeDesktop: false,
    notif: { ...DEFAULT_NOTIF }
  };

  Object.assign(S, {
    $,
    DEFAULT_NOTIF,
    LAST_PUSH_NAV_CACHE_URL,
    NAV_HANDOFF_CACHE,
    PIN_FILLED_SVG,
    PIN_OUTLINE_SVG,
    PROVIDER_ICONS,
    RETIRED_WORKSPACE_IDS,
    STORAGE_KEYS,
    compareRowsPinnedFirst,
    esc,
    fmtCompact,
    fmtInt,
    isHeadlessBrowser,
    isRowPinned,
    loadJson,
    normalizeInspectorTab,
    rankSearchMatchesWithPinnedFirst,
    saveJson,
    timeAgo
  });
  Object.defineProperties(S, {
    localBootInfo: { get: () => localBootInfo, set: (v) => { localBootInfo = v; }, enumerable: true, configurable: true }
  });
  factories.models(S);

  const cachedStore = loadJson(STORAGE_KEYS.CACHE, {
    state: null,
    threads: {},
    workspacesDetail: {},
    updatedAt: 0
  });
  if (cachedStore?.state?.antigravityModelCatalog) {
    S.ingestLiveAntigravityCatalog(cachedStore.state.antigravityModelCatalog);
  }
  if (cachedStore?.state?.claudeModelCatalog) {
    S.ingestLiveClaudeCatalog(cachedStore.state.claudeModelCatalog);
  }
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
  if (!['graphite', 'velvet', 'espresso', 'daylight'].includes(prefs.palette)) {
    prefs.palette = prefs.theme === 'light' ? 'daylight' : 'graphite';
  }
  if (!['graphite', 'velvet', 'espresso'].includes(prefs.lastDarkPalette)) {
    prefs.lastDarkPalette = prefs.palette !== 'daylight' ? prefs.palette : 'graphite';
  }
  if (prefs.theme === 'light') {
    prefs.palette = 'daylight';
  } else if (prefs.palette === 'daylight') {
    prefs.palette = prefs.lastDarkPalette || 'graphite';
  }
  prefs.sidebarCollapsed = Boolean(prefs.sidebarCollapsed);
  prefs.inspectorOpen = Boolean(prefs.inspectorOpen);
  const rawInspTab = String(prefs.inspectorTab || '');
  prefs.inspectorTab = normalizeInspectorTab(rawInspTab);
  if (RETIRED_WORKSPACE_IDS.has(String(prefs.selectedRepoId || '').trim())) {
    prefs.selectedRepoId = 'isabi-app';
  }
  if (rawStoredPrefs && (rawInspTab !== prefs.inspectorTab || RETIRED_WORKSPACE_IDS.has(String(rawStoredPrefs.selectedRepoId || '').trim()))) {
    saveJson(STORAGE_KEYS.PREFS, prefs);
  }
  if (!['preview', 'source', 'diff'].includes(prefs.inspectorViewMode)) {
    prefs.inspectorViewMode = 'source';
  }
  prefs.inspectorFullStage = Boolean(prefs.inspectorFullStage);
  prefs.splitWatchOpen = Boolean(prefs.splitWatchOpen);
  prefs.splitWatchThreadId =
    typeof prefs.splitWatchThreadId === 'string' ? prefs.splitWatchThreadId.trim() : '';
  prefs.composerRouteExpanded = Boolean(prefs.composerRouteExpanded);
  prefs.pinnedBgSessionId =
    typeof prefs.pinnedBgSessionId === 'string' ? prefs.pinnedBgSessionId.trim() : '';
  if (!['all', 'working', 'needs_input', 'unread', 'open'].includes(prefs.sidebarFilter)) {
    prefs.sidebarFilter = 'all';
  }
  const rawStoredModelExplicit =
    rawStoredPrefs?.modelSelectionExplicit &&
    typeof rawStoredPrefs.modelSelectionExplicit === 'object' &&
    !Array.isArray(rawStoredPrefs.modelSelectionExplicit)
      ? rawStoredPrefs.modelSelectionExplicit
      : null;
  if (
    !prefs.modelSelectionExplicit ||
    typeof prefs.modelSelectionExplicit !== 'object' ||
    Array.isArray(prefs.modelSelectionExplicit)
  ) {
    const rawSavedModels =
      rawStoredPrefs?.selectedModelByProvider &&
      typeof rawStoredPrefs.selectedModelByProvider === 'object' &&
      !Array.isArray(rawStoredPrefs.selectedModelByProvider)
        ? rawStoredPrefs.selectedModelByProvider
        : null;
    prefs.modelSelectionExplicit = {
      antigravity: rawStoredModelExplicit
        ? Boolean(rawStoredModelExplicit.antigravity)
        : Boolean(
            rawSavedModels?.antigravity &&
              String(rawSavedModels.antigravity).trim() !== 'gemini-4-argon'
          ),
      claude: rawStoredModelExplicit
        ? Boolean(rawStoredModelExplicit.claude)
        : Boolean(
            rawSavedModels?.claude && String(rawSavedModels.claude).trim() !== 'claude-opus-4-7'
          )
    };
  }
  const effAgyCat = S.getEffectiveModelCatalog('antigravity');
  const effClaudeCat = S.getEffectiveModelCatalog('claude');
  const defaultAgyModelId = effAgyCat.find((m) => m.isDefault)?.id || effAgyCat[0]?.id || 'gemini-4-argon';
  const defaultClaudeModelId = effClaudeCat.find((m) => m.isDefault)?.id || effClaudeCat[0]?.id || 'claude-opus-4-7';
  if (
    !prefs.selectedModelByProvider ||
    typeof prefs.selectedModelByProvider !== 'object' ||
    Array.isArray(prefs.selectedModelByProvider)
  ) {
    prefs.selectedModelByProvider = { antigravity: defaultAgyModelId, claude: defaultClaudeModelId };
  } else {
    const agyMod = String(prefs.selectedModelByProvider.antigravity || '').trim();
    prefs.selectedModelByProvider.antigravity =
      prefs.modelSelectionExplicit.antigravity && effAgyCat.some((m) => m.id === agyMod)
        ? agyMod
        : defaultAgyModelId;
    const clMod = String(prefs.selectedModelByProvider.claude || '').trim();
    prefs.selectedModelByProvider.claude =
      prefs.modelSelectionExplicit.claude && effClaudeCat.some((m) => m.id === clMod)
        ? clMod
        : defaultClaudeModelId;
  }
  function syncDefaultModelPrefsIfAuto(provKey = 'antigravity') {
    const cleanProv = provKey === 'claude' ? 'claude' : 'antigravity';
    if (prefs.modelSelectionExplicit?.[cleanProv]) return;
    const hasLive =
      cleanProv === 'claude' ? S.liveClaudeCatalog.models.length > 0 : S.liveAntigravityCatalog.models.length > 0;
    if (!hasLive) return;
    const effCat = S.getEffectiveModelCatalog(cleanProv);
    const liveDefId = effCat.find((m) => m.isDefault)?.id || effCat[0]?.id || '';
    if (!liveDefId) return;
    if (!prefs.selectedModelByProvider || typeof prefs.selectedModelByProvider !== 'object') {
      prefs.selectedModelByProvider = { antigravity: 'gemini-4-argon', claude: 'claude-opus-4-7' };
    }
    prefs.selectedModelByProvider[cleanProv] = liveDefId;
  }
  if (
    !prefs.selectedThinkingEffort ||
    typeof prefs.selectedThinkingEffort !== 'object' ||
    Array.isArray(prefs.selectedThinkingEffort)
  ) {
    prefs.selectedThinkingEffort = { antigravity: 'high', claude: 'high' };
  } else {
    const agyEff = String(prefs.selectedThinkingEffort.antigravity || '').trim().toLowerCase();
    prefs.selectedThinkingEffort.antigravity = ['low', 'medium', 'high', 'xhigh'].includes(agyEff)
      ? agyEff
      : 'high';
    const clEff = String(prefs.selectedThinkingEffort.claude || '').trim().toLowerCase();
    prefs.selectedThinkingEffort.claude = ['low', 'medium', 'high', 'xhigh'].includes(clEff)
      ? clEff
      : 'high';
  }
  if (
    !prefs.threadModelConfig ||
    typeof prefs.threadModelConfig !== 'object' ||
    Array.isArray(prefs.threadModelConfig)
  ) {
    prefs.threadModelConfig = {};
  } else {
    const cleanThreadModelCfg = {};
    const validEntries = Object.entries(prefs.threadModelConfig)
      .filter(([tid, cfg]) => {
        if (!tid || tid === '__new__' || String(tid).startsWith('draft-new-')) return false;
        if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return false;
        const prov = cfg.provider === 'claude' ? 'claude' : 'antigravity';
        const cat = S.getEffectiveModelCatalog(prov);
        const catMatch = cat.find((m) => m.id === cfg.modelId);
        const mOk = Boolean(catMatch);
        const customOk = typeof cfg.customModel === 'string' && cfg.customModel.trim().length > 0;
        const effLow = String(cfg.effort || '').trim().toLowerCase();
        const eOk =
          ['low', 'medium', 'high', 'xhigh'].includes(effLow) ||
          (effLow === '' && catMatch?.supportsEffort === false);
        return (mOk || customOk) && eOk;
      })
      .sort((a, b) => Number(b[1]?.updatedAt || 0) - Number(a[1]?.updatedAt || 0))
      .slice(0, 100);
    for (const [tid, cfg] of validEntries) {
      const prov = cfg.provider === 'claude' ? 'claude' : 'antigravity';
      const customModel =
        typeof cfg.customModel === 'string' ? cfg.customModel.trim().slice(0, 80) : '';
      cleanThreadModelCfg[tid] = {
        modelId: customModel ? '' : String(cfg.modelId),
        ...(customModel ? { customModel } : {}),
        effort: String(cfg.effort).toLowerCase(),
        provider: prov,
        updatedAt: Number(cfg.updatedAt || Date.now())
      };
    }
    prefs.threadModelConfig = cleanThreadModelCfg;
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
    { devices: {}, repos: {}, threads: {}, commands: {}, skills: {}, checks: {} },
    prefs.freqUsage && typeof prefs.freqUsage === 'object' ? prefs.freqUsage : {}
  );
  prefs.freqUsage.devices = Object.assign({}, prefs.freqUsage.devices || {});
  prefs.freqUsage.repos = Object.assign({}, prefs.freqUsage.repos || {});
  prefs.freqUsage.threads = Object.assign({}, prefs.freqUsage.threads || {});
  prefs.freqUsage.commands = Object.assign({}, prefs.freqUsage.commands || {});
  prefs.freqUsage.skills = Object.assign({}, prefs.freqUsage.skills || {});
  prefs.freqUsage.checks = Object.assign({}, prefs.freqUsage.checks || {});
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
        S.refreshCloudConfig();
        S.resetTransportsForFreshPairing();
        const targetEdge = prefs.edgeRelayUrl || S.discoveredEdgeUrl || S.DEFAULT_EDGE_RELAY_URL;
        if (!isHeadlessBrowser && targetEdge) {
          S.connectEdgeWs(targetEdge).catch(() => {});
        }
        if (!isHeadlessBrowser) {
          S.syncData({ force: true, toast: true }).catch(() => {});
        }
        S.updateConnectionBanner();
        renderAll();
        showToast('✓ Device paired & connected to THEO Fleet');
      }
      return true;
    } catch {
      return false;
    }
  }

  const THEO_CF_MIGRATE_URL = 'https://theo.husseinbdeir.workers.dev/';
  const THEO_MIGRATE_META_KEY = 'theo_remote_migrated_from_v1';
  const THEO_MIGRATE_ALLOWLIST = new Set([
    STORAGE_KEYS.PREFS,
    STORAGE_KEYS.PIN,
    STORAGE_KEYS.PIN_HASH,
    STORAGE_KEYS.NOTIFS,
    STORAGE_KEYS.CHECKED_NOTIFS,
    STORAGE_KEYS.ANSWERED_QUESTIONS,
    STORAGE_KEYS.SEEN_QUOTA_ALERTS,
    STORAGE_KEYS.PERSONAL,
    STORAGE_KEYS.COMMAND
  ]);
  let pendingPinMigratePayload = null;
  let bootTheoMigrateErrorReason = '';
  let theoPushRegistryLock = Promise.resolve();

  function isTheoOldGithubOrigin() {
    try {
      return typeof location !== 'undefined' && location.hostname === 'husseinbdeir.github.io';
    } catch {
      return false;
    }
  }

  function getTheoMigrationMeta() {
    const v = loadJson(THEO_MIGRATE_META_KEY, null);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  }

  function saveTheoMigrationMeta(meta) {
    saveJson(THEO_MIGRATE_META_KEY, meta || null);
  }

  function stripProtoDeep(val, depth = 0) {
    if (depth > 8 || val === null || typeof val !== 'object') return val;
    if (Array.isArray(val)) return val.map((item) => stripProtoDeep(item, depth + 1));
    const clean = {};
    for (const [k, v] of Object.entries(val)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      clean[k] = stripProtoDeep(v, depth + 1);
    }
    return clean;
  }

  function sanitizeMigratedPrefs(rawPrefs) {
    if (!rawPrefs || typeof rawPrefs !== 'object' || Array.isArray(rawPrefs)) return null;
    const out = {};
    for (const [pk, pv] of Object.entries(rawPrefs)) {
      if (pk === '__proto__' || pk === 'constructor' || pk === 'prototype') continue;
      if (pv === undefined) continue;
      if (pk === 'cloudUrl') {
        if (typeof pv === 'string' && isSafeCloudEndpointUrl(pv)) out.cloudUrl = pv.trim();
        continue;
      }
      if (pk === 'edgeRelayUrl' || pk === 'customBridgeUrl') {
        if (typeof pv === 'string' && isSafeEdgeEndpointUrl(pv)) out[pk] = pv.trim();
        continue;
      }
      if (pk === 'pin' || pk === 'pinHash') continue;
      if (pk === 'notif' && (!pv || typeof pv !== 'object' || Array.isArray(pv))) continue;
      if ((pk === 'freqUsage' || pk === 'selectedModelByProvider' || pk === 'selectedThinkingEffort' || pk === 'threadModelConfig') && (!pv || typeof pv !== 'object' || Array.isArray(pv))) continue;
      if (pk === 'openEditorTabs' && !Array.isArray(pv)) continue;
      out[pk] = stripProtoDeep(pv);
    }
    return out;
  }

  function parseTheoHashMigrationSync() {
    try {
      if (!location.hash || !location.hash.startsWith('#migrate=')) return null;
      const rawToken = location.hash.slice(9);
      try {
        history.replaceState(history.state || null, '', location.pathname + (location.search || ''));
      } catch {}
      if (isTheoOldGithubOrigin()) return null;
      if (!rawToken || rawToken.length > 262144) return { ok: false, reason: 'size' };
      const b64 = rawToken.replace(/-/g, '+').replace(/_/g, '/');
      const pad = b64.length % 4 === 0 ? '' : '===='.slice(b64.length % 4);
      const bin = atob(b64 + pad);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const parsed = JSON.parse(new TextDecoder().decode(bytes));
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed) ||
        parsed.v !== 1 ||
        parsed.app !== 'theo' ||
        !parsed.kv ||
        typeof parsed.kv !== 'object' ||
        Array.isArray(parsed.kv)
      ) {
        return { ok: false, reason: 'schema' };
      }
      return { ok: true, payload: parsed };
    } catch {
      return { ok: false, reason: 'parse' };
    }
  }

  function applyTheoMigrationPayload(migRes) {
    if (!migRes || !migRes.ok || !migRes.payload) {
      return { ok: false, reason: migRes?.reason || 'invalid' };
    }
    const kv = migRes.payload.kv;
    const incomingPrefsRaw = kv[STORAGE_KEYS.PREFS];
    const incomingPrefs = incomingPrefsRaw ? sanitizeMigratedPrefs(incomingPrefsRaw) : null;
    if (incomingPrefsRaw && !incomingPrefs) return { ok: false, reason: 'schema' };

    // Never clobber an already-paired device with a different edge/cloud key
    const existingEdgeKey = String(prefs.edgeAccessKey || '').trim();
    const existingCloudKey = String(prefs.cloudKey || '').trim();
    const incEdgeKey = String(incomingPrefs?.edgeAccessKey || '').trim();
    const incCloudKey = String(incomingPrefs?.cloudKey || '').trim();
    if (existingEdgeKey || existingCloudKey) {
      const edgeMatches = !existingEdgeKey || (incEdgeKey && incEdgeKey === existingEdgeKey);
      const cloudMatches = !existingCloudKey || (incCloudKey && incCloudKey === existingCloudKey);
      if (!edgeMatches || !cloudMatches) {
        return { ok: false, reason: 'key-mismatch' };
      }
    }

    const existingPinHash = localStorage.getItem(STORAGE_KEYS.PIN_HASH) || '';
    const existingPin = localStorage.getItem(STORAGE_KEYS.PIN) || '';
    const importedKeys = [];

    for (const [k, v] of Object.entries(kv)) {
      if (
        typeof k !== 'string' ||
        k === '__proto__' ||
        k === 'constructor' ||
        k === 'prototype' ||
        !THEO_MIGRATE_ALLOWLIST.has(k)
      ) {
        continue;
      }
      if (v === undefined || v === null) continue;

      if (k === STORAGE_KEYS.PREFS) {
        if (incomingPrefs) {
          Object.assign(prefs, incomingPrefs);
          saveJson(STORAGE_KEYS.PREFS, prefs);
          S.refreshCloudConfig();
          importedKeys.push(k);
        }
      } else if (k === STORAGE_KEYS.PIN_HASH) {
        if (!existingPinHash && !existingPin && typeof v === 'string' && /^[a-f0-9]{64}$/i.test(v)) {
          localStorage.setItem(STORAGE_KEYS.PIN_HASH, v.toLowerCase());
          importedKeys.push(k);
        }
      } else if (k === STORAGE_KEYS.PIN) {
        if (!existingPinHash && !existingPin && typeof v === 'string' && /^\d{4}$/.test(v)) {
          localStorage.setItem(STORAGE_KEYS.PIN, v);
          importedKeys.push(k);
        }
      } else if (k === STORAGE_KEYS.NOTIFS) {
        if (Array.isArray(v)) {
          const safe = v.filter((x) => x && typeof x === 'object' && !Array.isArray(x)).slice(0, 60);
          if (!loadJson(k, []).length) {
            saveJson(k, safe);
            importedKeys.push(k);
          }
        }
      } else if (k === STORAGE_KEYS.CHECKED_NOTIFS || k === STORAGE_KEYS.SEEN_QUOTA_ALERTS) {
        if (Array.isArray(v)) {
          const cur = loadJson(k, []);
          const merged = Array.from(
            new Set([...(Array.isArray(cur) ? cur : []), ...v.filter((x) => typeof x === 'string' && x.length <= 160)])
          ).slice(-200);
          saveJson(k, merged);
          importedKeys.push(k);
        }
      } else if (
        k === STORAGE_KEYS.ANSWERED_QUESTIONS ||
        k === STORAGE_KEYS.PERSONAL ||
        k === STORAGE_KEYS.COMMAND
      ) {
        if (v && typeof v === 'object' && !Array.isArray(v) && localStorage.getItem(k) === null) {
          saveJson(k, v);
          importedKeys.push(k);
        }
      }
    }

    const oldPushDeviceId =
      typeof migRes.payload.oldPushDeviceId === 'string'
        ? migRes.payload.oldPushDeviceId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)
        : '';
    const curDevId = loadJson(STORAGE_KEYS.DEVID, '');
    if (oldPushDeviceId && curDevId === oldPushDeviceId) {
      saveJson(
        STORAGE_KEYS.DEVID,
        `theo_dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
      );
    }
    saveTheoMigrationMeta({
      oldPushDeviceId,
      pushRetired: !oldPushDeviceId,
      needsPushPrompt: true,
      importedCount: importedKeys.length,
      migratedAt: Date.now()
    });
    return { ok: true, oldPushDeviceId, importedKeys };
  }

  ingestLocationPairHash(false);
  const bootMigRes = parseTheoHashMigrationSync();

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

  let appState = cachedStore.state || null;
  let threadsCache = cachedStore.threads || {};
  let workspacesDetailCache = cachedStore.workspacesDetail || {};
  let outbox = loadJson(STORAGE_KEYS.OUTBOX, []);
  // Command types the hub no longer accepts. A copy queued offline by an older app version is dropped at boot:
  // the hub answers it "Unknown command type", so it would be re-sent on every sync and hold the queued badge.
  const LEGACY_DROPPED_CMD_TYPES = new Set(['setPinnedConstraint']);
  if (Array.isArray(outbox) && outbox.some((c) => c && LEGACY_DROPPED_CMD_TYPES.has(c.type))) {
    outbox = outbox.filter((c) => !(c && LEGACY_DROPPED_CMD_TYPES.has(c.type)));
    saveJson(STORAGE_KEYS.OUTBOX, outbox);
  }
  let hasExplicitBootUrlNav = false;
  let suppressHistoryPush = false;
  let pushSub = null;
  let pushBusy = false;
  let pushSyncTimer = null;
  let statePrimed = false;
  const seenApprovalIds = new Set();
  const prevRowStatuses = new Map();
  const prevRowSteps = new Map();
  const prevRowAts = new Map();
  function setBoundedMap(map, key, val, max = 120) {
    if (!map || !key) return;
    if (map.has(key)) map.delete(key);
    map.set(key, val);
    if (map.size > max) {
      const fk = map.keys().next().value;
      if (fk !== undefined) map.delete(fk);
    }
  }

  const CLAUDE_PERM_MODES = [
    {
      id: 'bypassPermissions',
      label: 'Bypass',
      desc: 'Full autonomous control across every PC (zero safety prompts)'
    },
    {
      id: 'auto',
      label: 'Auto',
      desc: 'Classifier safety check on sensitive actions across every PC'
    },
    {
      id: 'plan',
      label: 'Plan',
      desc: 'Read-only planning mode across every PC (no edits or shell writes)'
    }
  ];
  const CLAUDE_PERM_EXTRA_LABELS = {
    acceptEdits: 'Accept Edits',
    default: 'Ask Every Tool'
  };

  function normalizeClaudePermModeClient(raw) {
    const v = String(raw || '').trim();
    if (!v) return '';
    const low = v.toLowerCase();
    if (low === 'bypasspermissions' || low === 'bypass') return 'bypassPermissions';
    if (low === 'auto') return 'auto';
    if (low === 'plan') return 'plan';
    if (low === 'acceptedits') return 'acceptEdits';
    if (low === 'default') return 'default';
    return '';
  }

  function extractClaudeModeFields(rawDoc) {
    if (!rawDoc) return null;
    if (typeof rawDoc === 'string') {
      const mode = normalizeClaudePermModeClient(rawDoc);
      return mode
        ? { defaultMode: mode, rev: 0, updatedAt: 0, updatedBy: '', source: '' }
        : null;
    }
    if (typeof rawDoc !== 'object' || Array.isArray(rawDoc)) return null;
    const mode = normalizeClaudePermModeClient(rawDoc.defaultMode || rawDoc.mode);
    if (!mode) return null;
    const revNum = Number(rawDoc.rev);
    const tsNum = Number(rawDoc.updatedAt);
    return {
      defaultMode: mode,
      rev: Number.isFinite(revNum) && revNum >= 0 ? Math.floor(revNum) : 0,
      updatedAt: Number.isFinite(tsNum) && tsNum >= 0 ? Math.round(tsNum) : 0,
      updatedBy: String(rawDoc.updatedBy || '').trim().slice(0, 80),
      source: String(rawDoc.source || '').trim().slice(0, 60)
    };
  }

  const bootClaudeModeFields =
    extractClaudeModeFields(appState?.claudePermissionMode) ||
    extractClaudeModeFields(prefs.claudePermissionMode) || {
      defaultMode: 'bypassPermissions',
      rev: 0,
      updatedAt: 0,
      updatedBy: '',
      source: ''
    };
  if (
    prefs.claudePermissionMode &&
    !extractClaudeModeFields(prefs.claudePermissionMode)
  ) {
    prefs.claudePermissionMode = null;
  }

  let claudeModeState = { ...bootClaudeModeFields };
  let pendingClaudeModeOverride = null;
  let claudeModeMutationSeq = 0;
  let claudeModeWriteChain = Promise.resolve();

  function getEffectiveClaudePermissionMode() {
    if (
      pendingClaudeModeOverride &&
      Date.now() - Number(pendingClaudeModeOverride.setAt || 0) < 15000
    ) {
      return pendingClaudeModeOverride.defaultMode;
    }
    return claudeModeState.defaultMode || 'bypassPermissions';
  }

  function getClaudeModeDisplayLabel(modeId) {
    const clean = normalizeClaudePermModeClient(modeId) || 'bypassPermissions';
    const found = CLAUDE_PERM_MODES.find((m) => m.id === clean);
    if (found) return found.label;
    return CLAUDE_PERM_EXTRA_LABELS[clean] || clean;
  }

  function ingestClaudePermissionModeDoc(rawDoc, opts = {}) {
    const parsed = extractClaudeModeFields(rawDoc);
    if (!parsed) return false;
    const now = Date.now();

    if (
      pendingClaudeModeOverride &&
      now - Number(pendingClaudeModeOverride.setAt || 0) >= 15000
    ) {
      pendingClaudeModeOverride = null;
    }

    if (!opts.forceLocal) {
      if (pendingClaudeModeOverride) {
        if (parsed.defaultMode === pendingClaudeModeOverride.defaultMode) {
          if (parsed.rev >= pendingClaudeModeOverride.minRev && parsed.rev > 0) {
            pendingClaudeModeOverride = null;
          }
        } else {
          const authoritativeExternal =
            (opts.fromWsFrame || opts.fromStore || opts.fromStoreAck) &&
            parsed.rev >= Math.max(claudeModeState.rev, pendingClaudeModeOverride.minRev);
          if (!authoritativeExternal) {
            return false;
          }
          pendingClaudeModeOverride = null;
        }
      }

      if (claudeModeState.rev > 0) {
        if (parsed.rev <= 0 || parsed.rev < claudeModeState.rev) {
          return false;
        }
        if (parsed.rev === claudeModeState.rev) {
          if (parsed.defaultMode === claudeModeState.defaultMode) {
            return false;
          }
          if (
            !opts.fromStore &&
            parsed.updatedAt > 0 &&
            claudeModeState.updatedAt > 0 &&
            parsed.updatedAt < claudeModeState.updatedAt
          ) {
            return false;
          }
        }
      } else if (
        parsed.rev === 0 &&
        claudeModeState.updatedAt > 0 &&
        parsed.updatedAt > 0 &&
        parsed.updatedAt < claudeModeState.updatedAt
      ) {
        return false;
      }
    }

    const changed =
      claudeModeState.defaultMode !== parsed.defaultMode ||
      claudeModeState.rev !== parsed.rev ||
      claudeModeState.updatedAt !== parsed.updatedAt;
    claudeModeState = {
      defaultMode: parsed.defaultMode,
      rev: parsed.rev > 0 ? parsed.rev : 0,
      updatedAt: parsed.updatedAt || now,
      updatedBy: parsed.updatedBy || '',
      source: parsed.source || ''
    };
    prefs.claudePermissionMode = { ...claudeModeState };
    saveJson(STORAGE_KEYS.PREFS, prefs);
    if (appState && typeof appState === 'object') {
      appState.claudePermissionMode = { ...claudeModeState };
    }
    return changed;
  }

  function renderClaudeModeSelectorHtml(variant = 'settings') {
    const activeMode = getEffectiveClaudePermissionMode();
    const activeEntry = CLAUDE_PERM_MODES.find((m) => m.id === activeMode);
    const extraLabel = !activeEntry ? CLAUDE_PERM_EXTRA_LABELS[activeMode] || '' : '';
    const buttonsHtml = CLAUDE_PERM_MODES.map((m) => {
      const isSelected = activeMode === m.id;
      return `<button type="button" class="claude-mode-seg-btn${isSelected ? ' is-active' : ''}" data-set-claude-mode="${esc(m.id)}" aria-pressed="${isSelected ? 'true' : 'false'}" aria-label="Switch fleet Claude Code mode to ${esc(m.label)}: ${esc(m.desc)}">${esc(m.label)}</button>`;
    }).join('');
    const extraPillHtml = extraLabel
      ? `<span class="claude-mode-extra-pill" aria-label="Externally configured Claude permission mode">${esc(extraLabel)}</span>`
      : '';

    if (variant === 'sidebar') {
      return `
        <div class="claude-mode-bar is-sidebar" role="group" aria-label="Fleet Claude permission mode">
          <span class="claude-mode-kicker">Mode</span>
          <div class="claude-mode-seg">${buttonsHtml}</div>
          ${extraPillHtml}
        </div>
      `;
    }
    if (variant === 'quota') {
      return `
        <div class="claude-mode-bar is-quota" role="group" aria-label="Fleet Claude permission mode">
          <span class="claude-mode-kicker">Fleet Mode</span>
          <div class="claude-mode-seg">${buttonsHtml}</div>
          ${extraPillHtml}
        </div>
      `;
    }
    if (variant === 'modal') {
      return `
        <div class="claude-mode-bar is-modal" role="group" aria-label="Fleet Claude permission mode">
          <div class="claude-mode-head">
            <span class="claude-mode-kicker">Fleet Claude Mode</span>
            ${extraPillHtml}
          </div>
          <div class="claude-mode-seg">${buttonsHtml}</div>
        </div>
      `;
    }
    const activeDesc = activeEntry
      ? activeEntry.desc
      : `Custom shared mode (${extraLabel || activeMode}) — tap Bypass, Auto, or Plan to switch fleet-wide.`;
    const revMeta =
      claudeModeState.rev > 0
        ? `Store rev ${claudeModeState.rev}${claudeModeState.updatedAt ? ` · ${timeAgo(claudeModeState.updatedAt)}` : ''}`
        : 'Synced via THEO Store (Cloudflare)';
    return `
      <div class="claude-mode-bar is-settings" role="group" aria-label="Fleet Claude permission mode">
        <div class="claude-mode-seg is-wide">${buttonsHtml}</div>
        <div class="claude-mode-foot">
          <span class="claude-mode-desc">${esc(activeDesc)}</span>
          <span class="claude-mode-rev tabular">${esc(revMeta)}${extraLabel ? ` · ${esc(extraLabel)}` : ''}</span>
        </div>
      </div>
    `;
  }

  async function setFleetClaudeModeRemote(rawMode, opts = {}) {
    const nextMode = normalizeClaudePermModeClient(rawMode);
    if (!CLAUDE_PERM_MODES.some((m) => m.id === nextMode)) return { ok: false, error: 'invalid_mode' };
    S.refreshCloudConfig();
    const itemCreatedAt = Number(opts.createdAt || 0);
    if (
      opts.fromOutbox &&
      itemCreatedAt > 0 &&
      itemCreatedAt < Number(claudeModeState.updatedAt || 0)
    ) {
      return {
        ok: true,
        superseded: true,
        defaultMode: getEffectiveClaudePermissionMode()
      };
    }
    const now = opts.fromOutbox && itemCreatedAt > 0 ? itemCreatedAt : Date.now();
    const mySeq = opts.fromOutbox ? claudeModeMutationSeq : ++claudeModeMutationSeq;
    const baseRev = Math.max(0, Math.floor(Number(claudeModeState.rev || 0) || 0));
    const minExpectedRev = baseRev + 1;

    if (!opts.fromOutbox) {
      outbox = outbox.filter(
        (c) => c && c.id !== 'cmd-claude-mode' && c.type !== 'setClaudePermissionMode'
      );
      saveJson(STORAGE_KEYS.OUTBOX, outbox);
      S.renderOutboxBadge();
      pendingClaudeModeOverride = {
        defaultMode: nextMode,
        setAt: now,
        minRev: minExpectedRev
      };
      claudeModeState = {
        ...claudeModeState,
        defaultMode: nextMode,
        updatedAt: now,
        updatedBy: 'THEO Remote',
        source: 'theo-remote'
      };
      prefs.claudePermissionMode = { ...claudeModeState };
      saveJson(STORAGE_KEYS.PREFS, prefs);
      if (appState && typeof appState === 'object') {
        appState.claudePermissionMode = { ...claudeModeState };
      }
      recordFreqUsage('commands', `/mode-${nextMode === 'bypassPermissions' ? 'bypass' : nextMode}`);
      S.persistCache();
      renderAll();
      haptic(18);
      if (!opts.silent) {
        const label = getClaudeModeDisplayLabel(nextMode);
        showToast(`Fleet Claude Mode: ${label} across all PCs`);
      }
    }

    if (isHeadlessBrowser && !window.__THEO_ALLOW_PROBE_MOCK_FETCH) {
      return { ok: true, mode: 'headless', defaultMode: nextMode };
    }

    const runNetworkSync = async () => {
      if (
        mySeq !== claudeModeMutationSeq ||
        (opts.fromOutbox &&
          itemCreatedAt > 0 &&
          itemCreatedAt < Number(claudeModeState.updatedAt || 0))
      ) {
        return { ok: true, superseded: true, defaultMode: getEffectiveClaudePermissionMode() };
      }
      const liveBaseRev = Math.max(baseRev, Math.floor(Number(claudeModeState.rev || 0) || 0));
      let storePatched = false;
      let hostReached = false;
      let authoritativeDoc = null;

      // 1. Authoritative Cloudflare THEO Store patch (reaches every PC, including ones offline right now)
      if (S.cloudCfg.url && S.cloudCfg.key) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 12000);
        try {
          const res = await fetch(S.cloudCfg.url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            body: JSON.stringify({
              key: S.cloudCfg.key,
              op: 'patch',
              ackOnly: true,
              patch: {
                claude_permission_mode: {
                  defaultMode: nextMode,
                  ...(liveBaseRev > 0 ? { expectedRev: liveBaseRev } : {}),
                  source: 'theo-remote',
                  updatedBy: 'THEO Remote',
                  updatedAt: now
                }
              }
            }),
            signal: ctrl.signal
          });
          if (res.ok) {
            const ack = await res.json().catch(() => ({}));
            if (ack && ack.ok !== false) {
              storePatched = true;
              const retDoc =
                ack.claude_permission_mode || ack.docs?.claude_permission_mode || null;
              if (retDoc && typeof retDoc === 'object') {
                authoritativeDoc = retDoc;
                const retRev = Math.max(0, Math.floor(Number(retDoc.rev || 0) || 0));
                if (mySeq === claudeModeMutationSeq) {
                  const ackMode = normalizeClaudePermModeClient(
                    retDoc.defaultMode || retDoc.mode || ''
                  );
                  ingestClaudePermissionModeDoc(retDoc, { fromStoreAck: true });
                  if (ackMode && ackMode !== nextMode) {
                    S.persistCache();
                    renderAll();
                    if (!opts.silent) {
                      showToast(
                        `↻ Synced newer Fleet Mode (${getClaudeModeDisplayLabel(ackMode)})`
                      );
                    }
                    return {
                      ok: true,
                      conflictReconciled: true,
                      defaultMode: getEffectiveClaudePermissionMode(),
                      claudePermissionMode: { ...claudeModeState }
                    };
                  }
                } else if (retRev > Number(claudeModeState.rev || 0)) {
                  // Advance known Store revision for the queued newer tap without reverting its optimistic mode.
                  claudeModeState = { ...claudeModeState, rev: retRev };
                  if (pendingClaudeModeOverride) {
                    pendingClaudeModeOverride.minRev = Math.max(
                      Number(pendingClaudeModeOverride.minRev || 0),
                      retRev + 1
                    );
                  }
                }
              }
            }
          }
        } catch {} finally {
          clearTimeout(timer);
        }
      }

      if (mySeq !== claudeModeMutationSeq) {
        return { ok: true, superseded: true, defaultMode: getEffectiveClaudePermissionMode() };
      }

      const wsFrame = {
        type: 'claude_permission_mode',
        defaultMode: authoritativeDoc?.defaultMode || nextMode,
        rev: storePatched ? Number(authoritativeDoc?.rev || 0) : 0,
        alreadyStored: storePatched,
        updatedAt: Number(authoritativeDoc?.updatedAt || now),
        updatedBy: authoritativeDoc?.updatedBy || 'THEO Remote',
        source: authoritativeDoc?.source || 'theo-remote'
      };

      // 2. Instant <50ms Edge WebSocket fan-out to every online host & client
      let edgeSent = false;
      if (S.edgeWsAuthed && S.edgeWs && S.edgeWs.readyState === 1) {
        try {
          S.edgeWs.send(JSON.stringify(wsFrame));
          edgeSent = true;
          hostReached = true;
        } catch {}
      }

      // 3. Direct Local WebSocket or HTTP Loopback Bridge
      if (S.localWsAuthed && S.localWs && S.localWs.readyState === 1) {
        try {
          S.localWs.send(JSON.stringify({ ...wsFrame, edgeBroadcasted: edgeSent }));
          hostReached = true;
        } catch {}
      } else if (S.connMode === 'local' && S.localBridgeBase) {
        try {
          const res = await S.authFetchLocal(`${S.localBridgeBase}/api/claude-permission-mode`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              defaultMode: wsFrame.defaultMode,
              rev: wsFrame.rev,
              alreadyStored: storePatched,
              edgeBroadcasted: edgeSent,
              updatedAt: wsFrame.updatedAt,
              source: wsFrame.source,
              updatedBy: wsFrame.updatedBy
            })
          });
          if (res.ok) {
            const out = await res.json().catch(() => ({}));
            if (out?.claudePermissionMode && mySeq === claudeModeMutationSeq) {
              ingestClaudePermissionModeDoc(out.claudePermissionMode, { fromStoreAck: true });
            }
            hostReached = true;
          }
        } catch {}
      }

      if (mySeq !== claudeModeMutationSeq) {
        return { ok: true, superseded: true, defaultMode: getEffectiveClaudePermissionMode() };
      }

      // 4. Offline Outbox fallback (deduplicated single entry so offline taps replay cleanly on reconnect)
      if (!storePatched && !hostReached) {
        outbox = outbox.filter(
          (c) => c && c.id !== 'cmd-claude-mode' && c.type !== 'setClaudePermissionMode'
        );
        outbox.push({
          id: 'cmd-claude-mode',
          type: 'setClaudePermissionMode',
          defaultMode: nextMode,
          source: 'theo-remote',
          updatedBy: 'THEO Remote',
          createdAt: now,
          status: 'pending'
        });
        saveJson(STORAGE_KEYS.OUTBOX, outbox);
        S.renderOutboxBadge();
        return { ok: true, mode: 'queued', defaultMode: nextMode };
      }

      outbox = outbox.filter(
        (c) => c && c.id !== 'cmd-claude-mode' && c.type !== 'setClaudePermissionMode'
      );
      saveJson(STORAGE_KEYS.OUTBOX, outbox);
      S.renderOutboxBadge();
      if (mySeq === claudeModeMutationSeq) {
        S.persistCache();
        renderAll();
      }
      return {
        ok: true,
        mode: storePatched ? 'store' : 'ws',
        defaultMode: nextMode,
        claudePermissionMode: { ...claudeModeState }
      };
    };

    const p = claudeModeWriteChain.then(runNetworkSync, runNetworkSync);
    claudeModeWriteChain = p.catch(() => ({ ok: false }));
    return p;
  }
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

  let pendingHideThirdPartyQuota = null;

  function isThirdPartyQuotaBar(bar) {
    if (!bar || typeof bar !== 'object') return false;
    if (bar.pool === '3p') return true;
    if (/^3p-/i.test(String(bar.key || bar.bucketId || ''))) return true;
    return /claude\s*(?:&|and)\s*gpt/i.test(String(bar.label || ''));
  }

  function hasAnyAntigravityThirdPartyBars() {
    const prov = appState?.providers?.antigravity;
    const accts = Array.isArray(prov?.accounts) && prov.accounts.length ? prov.accounts : [];
    for (const a of accts) {
      const lims = Array.isArray(a?.usage?.limits) ? a.usage.limits : Array.isArray(a?.usage?.allLimits) ? a.usage.allLimits : [];
      if (lims.some(isThirdPartyQuotaBar)) return true;
    }
    const fallbackLims = Array.isArray(prov?.usage?.limits)
      ? prov.usage.limits
      : Array.isArray(appState?.usage?.limits)
        ? appState.usage.limits
        : [];
    return fallbackLims.some(isThirdPartyQuotaBar);
  }

  function isThirdPartyQuotaHidden() {
    if (pendingHideThirdPartyQuota) {
      if (Date.now() < pendingHideThirdPartyQuota.expiresAt) {
        return pendingHideThirdPartyQuota.value;
      }
      pendingHideThirdPartyQuota = null;
    }
    if (typeof prefs.hideThirdPartyQuota === 'boolean') {
      return prefs.hideThirdPartyQuota;
    }
    if (typeof appState?.hideThirdPartyQuota === 'boolean') {
      return appState.hideThirdPartyQuota;
    }
    return false;
  }

  async function setHideThirdPartyQuota(hide) {
    const next = Boolean(hide);
    const nowMs = Date.now();
    prefs.hideThirdPartyQuota = next;
    prefs.hideThirdPartyQuotaUpdatedAt = nowMs;
    saveJson(STORAGE_KEYS.PREFS, prefs);
    pendingHideThirdPartyQuota = { value: next, startedAt: nowMs, expiresAt: nowMs + 10000 };
    if (appState && typeof appState === 'object') {
      appState.hideThirdPartyQuota = next;
      appState.hideThirdPartyQuotaUpdatedAt = nowMs;
      S.persistCache();
    }
    S.renderPulseView();
    S.renderIdeSidebar();
    updateAppBadgeCount(false);
    if (prefs.activeTab === 'analytics') S.renderAnalyticsView();
    showToast(next ? 'Claude & GPT quota bars hidden' : 'Claude & GPT quota bars shown');
    S.dispatchRemoteCommand({
      type: 'sessionAction',
      action: 'setHideThirdPartyQuota',
      subAction: 'setHideThirdPartyQuota',
      hide: next,
      value: next
    }).catch(() => {});
  }

  let pendingHideClaudeDesktop = null;

  function isClaudeDesktopRow(r) {
    if (!r || typeof r !== 'object') return false;
    return Boolean(
      r.claudeDesktop ||
        r.origin === 'claude_desktop' ||
        r.source === 'claude_desktop' ||
        String(r.id || '').startsWith('claude-desktop:')
    );
  }

  function isClaudeDesktopHidden() {
    if (pendingHideClaudeDesktop) {
      if (Date.now() < pendingHideClaudeDesktop.expiresAt) {
        return pendingHideClaudeDesktop.value;
      }
      pendingHideClaudeDesktop = null;
    }
    if (typeof prefs.hideClaudeDesktop === 'boolean') {
      return prefs.hideClaudeDesktop;
    }
    if (typeof appState?.hideClaudeDesktop === 'boolean') {
      return appState.hideClaudeDesktop;
    }
    return false;
  }

  async function setHideClaudeDesktopRemote(hide) {
    const next = Boolean(hide);
    const nowMs = Date.now();
    prefs.hideClaudeDesktop = next;
    prefs.hideClaudeDesktopUpdatedAt = nowMs;
    saveJson(STORAGE_KEYS.PREFS, prefs);
    pendingHideClaudeDesktop = { value: next, startedAt: nowMs, expiresAt: nowMs + 10000 };
    if (appState && typeof appState === 'object') {
      appState.hideClaudeDesktop = next;
      appState.hideClaudeDesktopUpdatedAt = nowMs;
      S.persistCache();
    }
    S.renderIdeSidebar();
    S.renderSessionsView();
    showToast(next ? 'Claude Desktop sessions hidden' : 'Claude Desktop sessions shown');
    S.dispatchRemoteCommand({
      type: 'sessionAction',
      action: 'setHideClaudeDesktop',
      subAction: 'setHideClaudeDesktop',
      hide: next,
      value: next
    }).catch(() => {});
  }

  function formatQuotaResetLine(l, nowMs = Date.now()) {
    if (!l || typeof l !== 'object') return '';
    const resetMs = Number(l.reset || 0);
    if (l.expired || (resetMs > 0 && resetMs <= nowMs)) {
      return 'Window idle';
    }
    if (resetMs > nowMs) {
      const diffSec = Math.max(0, Math.round((resetMs - nowMs) / 1000));
      if (diffSec >= 86400) {
        const d = Math.floor(diffSec / 86400);
        const h = Math.floor((diffSec % 86400) / 3600);
        return h > 0 ? `Resets in ${d}d ${h}h` : `Resets in ${d}d`;
      }
      if (diffSec >= 3600) {
        const h = Math.floor(diffSec / 3600);
        const m = Math.floor((diffSec % 3600) / 60);
        return m > 0 ? `Resets in ${h}h ${m}m` : `Resets in ${h}h`;
      }
      const m = Math.max(1, Math.round(diffSec / 60));
      return `Resets in ${m}m`;
    }
    const rawTxt = String(l.resetText || '').trim();
    if (!rawTxt) return '';
    if (/^(window\s+idle|allowance\s+unavailable)$/i.test(rawTxt)) return rawTxt;
    if (/^resets\s+in\s+/i.test(rawTxt)) return rawTxt.replace(/^resets/i, 'Resets');
    if (/^in\s+\d/i.test(rawTxt)) return `Resets ${rawTxt}`;
    return rawTxt;
  }

  function collectHighUsageQuotaAlerts(stateObj, nowMs = Date.now()) {
    const highAlerts = [];
    const allActiveBuckets = [];
    if (!stateObj || typeof stateObj !== 'object') {
      return { highAlerts, allActiveBuckets };
    }
    const hide3p =
      typeof stateObj.hideThirdPartyQuota === 'boolean'
        ? stateObj.hideThirdPartyQuota
        : isThirdPartyQuotaHidden();

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
          if (provKey === 'antigravity' && hide3p && isThirdPartyQuotaBar(bar)) continue;
          const resetMs = Number(bar.reset || 0);
          const isExpired = Boolean(bar.expired || (resetMs > 0 && resetMs <= nowMs));
          const rawPct = bar.pct !== undefined ? bar.pct : bar.usedPercent;
          const pct = isExpired
            ? 0
            : Math.max(0, Math.min(100, Math.round(Number(rawPct || 0))));
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
    let skipHint = false;
    if (threadIdOrObj && typeof threadIdOrObj === 'object') {
      tid = threadIdOrObj.threadId || threadIdOrObj.sessionId || '';
      prov = threadIdOrObj.provider || '';
      ttl = threadIdOrObj.title || threadIdOrObj.sessionTitle || '';
      if (threadIdOrObj.durationMs) dur = Number(threadIdOrObj.durationMs);
      skipHint = Boolean(threadIdOrObj.skipPrewarmHint);
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
    if (!skipHint && typeof S.emitPrewarmHint === 'function') {
      try {
        S.emitPrewarmHint(pinnedNavThreadId, { provider: pinnedNavProvider, source: 'focus' });
      } catch {}
    }
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

  // Personal Ledger & Reminders are owned by Planner PWA (https://planner.husseinbdeir.workers.dev/)
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
    if (!S.cloudCfg.url || !S.cloudCfg.key) return null;
    const res = await fetch(S.cloudCfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(Object.assign({ key: S.cloudCfg.key }, body))
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

  function isHiddenThirdPartyNotifItem(x) {
    if (!isThirdPartyQuotaHidden() || !x) return false;
    return (
      /^theo-quota-antigravity-.*claude-.*gpt/i.test(String(x?.tag || '')) ||
      /^quota90:antigravity:.*claude-.*gpt/i.test(String(x?.id || ''))
    );
  }

  function computeTheoUnreadBadgeCount(items = null) {
    const list = Array.isArray(items) ? items : loadNotifLog();
    const uncheckedNotifs = list.filter((x) => x && !x.checked && !isHiddenThirdPartyNotifItem(x));
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
      S.renderNotifModal();
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
          body: String(a.detail || a.toolName || 'Waiting for confirmation'),
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
            !activeQuotaTags.has(it.tag) &&
            !isHiddenThirdPartyNotifItem(it)
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
      S.closeNotifModal();
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
    // All Prayer, Task, Reminder, Wait Timer, Delegation & 100% Score notifications are now owned by Planner (https://planner.husseinbdeir.workers.dev/)
    return;
  }

  async function cancelExactReminderPush(itemId) {
    if (isHeadlessBrowser || !S.cloudCfg.url || !S.cloudCfg.key || !itemId) return;
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
          const tabTxt = openTabs.length > 0 ? ` (${openTabs.length} open in VS Code)` : '';
          const body = `${waitTxt}${rows.length} active AI sessions across Antigravity & Claude Code${tabTxt}.`;
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
    if (S.localBridgeBase) {
      fetch(`${S.localBridgeBase}/api/push-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device: entry, enabled: Boolean(nf.enabled) })
      }).catch(() => {});
    }

    // 2. Register with the Edge relay store (its hourly slot dispatcher replaced Personal - THEO Remote Daily Push)
    // Note: Do NOT arm duplicate theo_brief_d* push_delay timers — Personal - THEO Remote Daily Push already dispatches entry.slots hourly!
    if (S.cloudCfg.url && S.cloudCfg.key) {
      theoPushRegistryLock = theoPushRegistryLock.then(async () => {
        try {
          const curRes = await callCloudPush({ op: 'get' });
          const curDocs = (curRes && curRes.docs) || curRes || {};
          const existing = Array.isArray(curDocs?.push_registry?.items)
            ? curDocs.push_registry.items
            : [];
          const mf = getTheoMigrationMeta();
          const oldDevToRetire = mf && !mf.pushRetired && mf.oldPushDeviceId ? mf.oldPushDeviceId : '';
          const others = existing.filter((x) => {
            if (!x || !x.id) return false;
            if (oldDevToRetire && x.id === oldDevToRetire) return false;
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
          const patchRes = await callCloudPush({
            op: 'patch',
            patch: patchObj
          });
          if (patchRes && patchRes.ok !== false && oldDevToRetire) {
            const latestMf = getTheoMigrationMeta();
            if (latestMf) {
              saveTheoMigrationMeta({ ...latestMf, pushRetired: true });
            }
          }
        } catch {}
      });
      await theoPushRegistryLock;
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
      const curMf = getTheoMigrationMeta();
      if (curMf && curMf.needsPushPrompt) {
        saveTheoMigrationMeta({ ...curMf, needsPushPrompt: false });
      }
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
      title: isWelcome ? 'THEO Notifications Active' : 'THEO',
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
      S.isNewSessionMode() ||
      String(prefs.selectedThreadId || '').startsWith('draft-new-') ||
      S.pendingNewSessionBind
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
        ? `Question from THEO: ${a.title || 'Session'}`
        : `Approval Needed · ${a.provider === 'claude' ? 'Claude Code' : 'Antigravity'}`;
      const notifBody = isQ
        ? `${a.detail || 'THEO is waiting for your answer.'}`
        : `${a.title || 'Session'}: ${a.toolName || 'Permission'}: ${a.detail || 'Waiting for confirmation'}`;
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
          ? `Question (${a.title || 'THEO'}): ${String(a.detail || 'Waiting for your answer').slice(0, 100)}`
          : `Approval Needed (${a.title || 'THEO'}): ${a.toolName || 'Permission'}`,
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

  // Theme, Studio Palettes & IDE Sidebar management
  let sidebarHoverTimer = null;
  let ideMicroTipTimer = null;
  let ideMicroTipAnchor = null;
  let ideMicroTipPendingAnchor = null;

  function hideIdeMicroTip() {
    if (ideMicroTipTimer) {
      clearTimeout(ideMicroTipTimer);
      ideMicroTipTimer = null;
    }
    ideMicroTipAnchor = null;
    ideMicroTipPendingAnchor = null;
    const tipEl = $('ide-micro-tip');
    if (tipEl) tipEl.hidden = true;
  }

  function isIdeMicroTipTargetHiddenOrDetached(el) {
    if (!el || !el.isConnected) return true;
    const rect = el.getBoundingClientRect?.();
    return Boolean(rect && (rect.width <= 0 || rect.height <= 0));
  }

  function reconcileIdeMicroTip() {
    if (
      (ideMicroTipAnchor && isIdeMicroTipTargetHiddenOrDetached(ideMicroTipAnchor)) ||
      (ideMicroTipPendingAnchor && isIdeMicroTipTargetHiddenOrDetached(ideMicroTipPendingAnchor))
    ) {
      hideIdeMicroTip();
    }
  }

  function showIdeMicroTip(anchorEl) {
    if (ideMicroTipTimer) {
      clearTimeout(ideMicroTipTimer);
      ideMicroTipTimer = null;
    }
    ideMicroTipPendingAnchor = null;
    if (isPinLocked() || !anchorEl || !anchorEl.isConnected) return;
    if (window.matchMedia && !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const ctxMenu = $('ide-context-menu');
    if (ctxMenu && !ctxMenu.hidden) return;
    const tipEl = $('ide-micro-tip');
    const label = String(anchorEl.dataset?.microTip || '').trim();
    if (!tipEl || !label) return;
    const rect = anchorEl.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const hoverCard = $('ide-hover-card');
    if (hoverCard) hoverCard.hidden = true;
    if (sidebarHoverTimer) {
      clearTimeout(sidebarHoverTimer);
      sidebarHoverTimer = null;
    }
    ideMicroTipAnchor = anchorEl;
    tipEl.textContent = label;
    tipEl.style.left = '6px';
    tipEl.style.top = '6px';
    tipEl.hidden = false;
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 800;
    const tipW = tipEl.offsetWidth || Math.min(240, Math.max(52, label.length * 6.5 + 16));
    const tipH = tipEl.offsetHeight || 22;
    const left = Math.round(Math.max(6, Math.min(rect.left + rect.width / 2 - tipW / 2, vw - tipW - 6)));
    const above = rect.top - tipH - 5;
    const top = above >= 6 ? above : Math.min(Math.max(6, vh - tipH - 6), rect.bottom + 5);
    tipEl.style.left = `${left}px`;
    tipEl.style.top = `${Math.round(top)}px`;
  }

  function closeFloatingUiMenus() {
    if (sidebarHoverTimer) {
      clearTimeout(sidebarHoverTimer);
      sidebarHoverTimer = null;
    }
    hideIdeMicroTip();
    const palPop = $('theme-palette-popover');
    if (palPop) palPop.hidden = true;
    $('btn-palette-picker')?.setAttribute('aria-expanded', 'false');
    const modPop = $('model-picker-popover');
    if (modPop) modPop.hidden = true;
    S.modelPickerAdjustEffortOpen = false;
    $('composer-model-btn')?.setAttribute('aria-expanded', 'false');
    const hoverCard = $('ide-hover-card');
    if (hoverCard) {
      hoverCard.hidden = true;
      hoverCard.innerHTML = '';
    }
    const ctxMenu = $('ide-context-menu');
    if (ctxMenu) {
      ctxMenu.hidden = true;
      ctxMenu.innerHTML = '';
    }
    const chatMoreMenu = $('chat-more-menu');
    if (chatMoreMenu) chatMoreMenu.hidden = true;
    $('btn-chat-more')?.setAttribute('aria-expanded', 'false');
    if (typeof S.ideMenuPinFreeze !== 'undefined' && S.ideMenuPinFreeze) {
      S.ideMenuPinFreeze = false;
      if (typeof S.flushDeferredIdeTreeOrder === 'function') S.flushDeferredIdeTreeOrder();
    }
  }

  function positionPalettePopover(anchorEl = null) {
    const palPop = $('theme-palette-popover');
    if (!palPop) return;
    const vw = Math.max(280, window.innerWidth || 1280);
    const vh = Math.max(320, window.innerHeight || 800);
    const popW = Math.min(264, vw - 16);
    palPop.style.width = `${popW}px`;
    if (vw <= 1024) {
      palPop.style.left = 'auto';
      palPop.style.right = '12px';
      palPop.style.top = '52px';
      palPop.style.bottom = 'auto';
      return;
    }
    const trigger = anchorEl || $('btn-palette-picker');
    const rect = trigger && typeof trigger.getBoundingClientRect === 'function' ? trigger.getBoundingClientRect() : null;
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      palPop.style.left = '12px';
      palPop.style.bottom = '48px';
      palPop.style.top = 'auto';
      palPop.style.right = 'auto';
      return;
    }
    const leftPx = Math.max(8, Math.min(Math.round(rect.left), vw - popW - 8));
    palPop.style.left = `${leftPx}px`;
    palPop.style.right = 'auto';
    if (rect.top > vh * 0.45) {
      palPop.style.bottom = `${Math.max(10, Math.round(vh - rect.top + 8))}px`;
      palPop.style.top = 'auto';
    } else {
      palPop.style.top = `${Math.max(8, Math.round(rect.bottom + 8))}px`;
      palPop.style.bottom = 'auto';
    }
  }

  function syncPalettePickerUi() {
    const activePal = prefs.theme === 'light' ? 'daylight' : prefs.palette || 'graphite';
    document.querySelectorAll('#palette-grid [data-set-palette]').forEach((btn) => {
      const match = btn.dataset.setPalette === activePal;
      btn.classList.toggle('active', match);
      btn.setAttribute('aria-pressed', match ? 'true' : 'false');
    });
    const themeBtn = $('btn-theme-toggle');
    if (themeBtn) {
      themeBtn.textContent = prefs.theme === 'light' ? 'Dark' : 'Light';
    }
    const soundBtn = $('btn-sound-toggle');
    if (soundBtn) {
      const on = prefs.sound !== false;
      soundBtn.classList.toggle('is-active', on);
      soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      soundBtn.textContent = on ? 'Chime On' : 'Muted';
    }
  }

  function applyTheme(theme, userExplicit = false) {
    prefs.theme = theme === 'dark' ? 'dark' : 'light';
    if (userExplicit) {
      prefs.themeUserSet = true;
    }
    if (prefs.theme === 'light') {
      if (['graphite', 'velvet', 'espresso'].includes(prefs.palette)) {
        prefs.lastDarkPalette = prefs.palette;
      }
      prefs.palette = 'daylight';
    } else {
      const darkPal = ['graphite', 'velvet', 'espresso'].includes(prefs.palette)
        ? prefs.palette
        : ['graphite', 'velvet', 'espresso'].includes(prefs.lastDarkPalette)
          ? prefs.lastDarkPalette
          : 'graphite';
      prefs.palette = darkPal;
      prefs.lastDarkPalette = darkPal;
    }
    document.documentElement.setAttribute('data-theme', prefs.theme);
    document.documentElement.setAttribute('data-palette', prefs.palette);
    document.documentElement.classList.toggle('sidebar-collapsed', Boolean(prefs.sidebarCollapsed));
    const meta = $('meta-theme-color');
    if (meta) {
      const metaHex =
        prefs.theme === 'light'
          ? '#F6F5F0'
          : prefs.palette === 'velvet'
            ? '#0C0D12'
            : prefs.palette === 'espresso'
              ? '#191614'
              : '#141417';
      meta.setAttribute('content', metaHex);
    }
    syncPalettePickerUi();
    saveJson(STORAGE_KEYS.PREFS, prefs);
  }

  function applyPalette(palName) {
    const clean = String(palName || '').trim().toLowerCase();
    if (!['graphite', 'velvet', 'espresso', 'daylight'].includes(clean)) return;
    if (clean === 'daylight') {
      applyTheme('light', true);
    } else {
      prefs.palette = clean;
      prefs.lastDarkPalette = clean;
      applyTheme('dark', true);
    }
  }

  function toggleIdeSidebar(forceCollapsed) {
    if (isPinLocked()) return;
    closeFloatingUiMenus();
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

  function pushUiHistoryState(overlay = '') {
    if (suppressHistoryPush) return;
    try {
      const fallbackTab = window.innerWidth >= 1025 ? 'chat' : 'pulse';
      history.pushState({ theoTab: prefs.activeTab || fallbackTab, overlay }, '');
    } catch {}
  }

  Object.assign(S, {
    CLAUDE_PERM_MODES,
    THEO_CF_MIGRATE_URL,
    THEO_MIGRATE_ALLOWLIST,
    applyPairPayloadToPrefs,
    applyTheme,
    bytesToB64,
    callCloudPush,
    checkLiveStateNotifications,
    clearPinnedNav,
    computeTheoUnreadBadgeCount,
    decodePairTokenString,
    defaultAgyModelId,
    defaultClaudeModelId,
    encodePairTokenString,
    extractClaudeModeFields,
    formatQuotaResetLine,
    getEffectiveClaudePermissionMode,
    getTheoMigrationMeta,
    haptic,
    hasAnyAntigravityThirdPartyBars,
    hideIdeMicroTip,
    ingestClaudePermissionModeDoc,
    isClaudeDesktopHidden,
    isClaudeDesktopRow,
    isFocusInsideContainerInputs,
    isPinLocked,
    isSafeEdgeEndpointUrl,
    isStandalone,
    isTheoOldGithubOrigin,
    isThirdPartyQuotaBar,
    isThirdPartyQuotaHidden,
    loadNotifLog,
    markNotificationsCheckedForSession,
    notifPerm,
    playChime,
    positionPalettePopover,
    prefs,
    pushSupported,
    pushUiHistoryState,
    rankByFreq,
    reconcileIdeMicroTip,
    recordFreqUsage,
    renderClaudeModeSelectorHtml,
    saveTheoMigrationMeta,
    schedulePushSync,
    seedUncheckedTheoNotifications,
    setBoundedMap,
    setFleetClaudeModeRemote,
    setHideThirdPartyQuota,
    setPinnedNav,
    showToast,
    syncDefaultModelPrefsIfAuto,
    syncPalettePickerUi
  });
  Object.defineProperties(S, {
    appState: { get: () => appState, set: (v) => { appState = v; }, enumerable: true, configurable: true },
    claudeModeState: { get: () => claudeModeState, set: (v) => { claudeModeState = v; }, enumerable: true, configurable: true },
    hasExplicitBootUrlNav: { get: () => hasExplicitBootUrlNav, set: (v) => { hasExplicitBootUrlNav = v; }, enumerable: true, configurable: true },
    lastPushScheduleSyncAt: { get: () => lastPushScheduleSyncAt, set: (v) => { lastPushScheduleSyncAt = v; }, enumerable: true, configurable: true },
    outbox: { get: () => outbox, set: (v) => { outbox = v; }, enumerable: true, configurable: true },
    pendingHideClaudeDesktop: { get: () => pendingHideClaudeDesktop, set: (v) => { pendingHideClaudeDesktop = v; }, enumerable: true, configurable: true },
    pendingHideThirdPartyQuota: { get: () => pendingHideThirdPartyQuota, set: (v) => { pendingHideThirdPartyQuota = v; }, enumerable: true, configurable: true },
    pinnedNavProvider: { get: () => pinnedNavProvider, set: (v) => { pinnedNavProvider = v; }, enumerable: true, configurable: true },
    pinnedNavThreadId: { get: () => pinnedNavThreadId, set: (v) => { pinnedNavThreadId = v; }, enumerable: true, configurable: true },
    pinnedNavTitle: { get: () => pinnedNavTitle, set: (v) => { pinnedNavTitle = v; }, enumerable: true, configurable: true },
    pinnedNavUntil: { get: () => pinnedNavUntil, set: (v) => { pinnedNavUntil = v; }, enumerable: true, configurable: true },
    pushBusy: { get: () => pushBusy, set: (v) => { pushBusy = v; }, enumerable: true, configurable: true },
    pushSub: { get: () => pushSub, set: (v) => { pushSub = v; }, enumerable: true, configurable: true },
    recentResumeUntil: { get: () => recentResumeUntil, set: (v) => { recentResumeUntil = v; }, enumerable: true, configurable: true },
    theoPushRegistryLock: { get: () => theoPushRegistryLock, set: (v) => { theoPushRegistryLock = v; }, enumerable: true, configurable: true },
    threadsCache: { get: () => threadsCache, set: (v) => { threadsCache = v; }, enumerable: true, configurable: true },
    workspacesDetailCache: { get: () => workspacesDetailCache, set: (v) => { workspacesDetailCache = v; }, enumerable: true, configurable: true }
  });
  factories.transport(S);
  factories.sidebar(S);
  factories.inspector(S);
  factories.chat(S);
  factories.views(S);


  // Navigation switching
  function switchTab(tabName) {
    if (tabName === 'discipline') {
      window.open('https://planner.husseinbdeir.workers.dev/', '_blank', 'noopener');
      return;
    }
    closeFloatingUiMenus();
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
    document.querySelectorAll('[data-sidebar-nav]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.sidebarNav === target);
    });
    $('btn-sidebar-brand')?.classList.toggle('active', target === 'chat');
    document.querySelectorAll('.mobile-bottom-dock .dock-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === target);
    });

    if (target === 'chat') {
      S.ensureSelectedThread();
      S.renderChatView(true);
      if (
        prefs.selectedThreadId &&
        prefs.selectedThreadId !== '__new__' &&
        !String(prefs.selectedThreadId).startsWith('draft-new-')
      ) {
        S.fetchThreadDetail(prefs.selectedThreadId, pinnedNavProvider || '');
      }
    } else if (target === 'workspaces') {
      S.renderWorkspacesView();
    } else if (target === 'analytics') {
      S.renderAnalyticsView();
    }
    S.renderIdeSidebar();
  }

  function renderAll() {
    seedUncheckedTheoNotifications();
    updateAppBadgeCount(false);
    S.updateConnectionBanner();
    S.renderOutboxBadge();
    S.renderPulseView();
    S.renderSessionsView();
    S.renderIdeSidebar();
    S.syncAndRenderEditorTabs();
    if (prefs.activeTab === 'chat') S.renderChatView();
    if (prefs.activeTab === 'workspaces') S.renderWorkspacesView();
    if (prefs.activeTab === 'analytics') S.renderAnalyticsView();
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
        S.finalizeInteractivePairSuccess(deferred).catch(() => {});
      }
      if (pendingPinMigratePayload) {
        const defMig = pendingPinMigratePayload;
        pendingPinMigratePayload = null;
        const applied = applyTheoMigrationPayload(defMig);
        if (applied.ok) {
          applyTheme(prefs.theme);
          loadPersonalLedgerFromLocal();
          renderAll();
          S.syncData({ force: true }).catch(() => {});
        } else {
          showToast(
            applied.reason === 'key-mismatch'
              ? 'Migration skipped: this device is already paired with another key.'
              : `Migration skipped (${applied.reason}).`
          );
        }
      }
      return;
    }
    overlay.hidden = false;
    S.teardownDeliverableInspectorFrames();
    if (appShell) appShell.inert = true;
    closeFloatingUiMenus();
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
            await S.finalizeInteractivePairSuccess(deferred);
          }
          if (pendingPinMigratePayload) {
            const defMig = pendingPinMigratePayload;
            pendingPinMigratePayload = null;
            const applied = applyTheoMigrationPayload(defMig);
            if (applied.ok) {
              applyTheme(prefs.theme);
              loadPersonalLedgerFromLocal();
              renderAll();
              S.syncData({ force: true }).catch(() => {});
            } else {
              showToast(
                applied.reason === 'key-mismatch'
                  ? 'Migration skipped: this device is already paired with another key.'
                  : `Migration skipped (${applied.reason}).`
              );
            }
          }
        } else {
          entered = '';
          updateDots();
          haptic(60);
        }
      }
    });
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
        const draft = S.getQuestionDraft(cardKey);
        draft.writeInByQ[qIdx] = qInput.value;
        const meta = S.renderedQuestionsByCardKey.get(cardKey);
        if (meta?.sessionId) {
          for (const [sibKey, sibMeta] of S.renderedQuestionsByCardKey.entries()) {
            if (sibKey !== cardKey && sibMeta?.sessionId === meta.sessionId) {
              const sibDraft = S.getQuestionDraft(sibKey);
              sibDraft.writeInByQ[qIdx] = qInput.value;
            }
          }
        }
        document.querySelectorAll('[data-q-card]').forEach((cardEl) => {
          const cKey = cardEl.dataset.qCard || '';
          const cMeta = S.renderedQuestionsByCardKey.get(cKey);
          if (cKey !== cardKey && (!meta?.sessionId || cMeta?.sessionId !== meta.sessionId)) return;
          cardEl.querySelectorAll(`[data-q-writein-input][data-q-idx="${qIdx}"]`).forEach((inp) => {
            if (inp !== qInput && document.activeElement !== inp && inp.value !== qInput.value) {
              inp.value = qInput.value;
            }
          });
          const cDraft = S.getQuestionDraft(cKey);
          const qCount = cMeta?.questions?.length || meta?.questions?.length || 1;
          const anyToolPerm = Boolean((cMeta?.questions || meta?.questions)?.some((q) => q.isToolPermission));
          const totalCount = S.countDraftSelections(cDraft, qCount);
          const subBtn = cardEl.querySelector('[data-q-submit]');
          if (subBtn) {
            const isShortSub = cardEl.classList.contains('sb-q-card');
            subBtn.textContent = isShortSub
              ? `✓ ${anyToolPerm ? 'Allow' : 'Submit'}${totalCount > 0 ? ` (${totalCount})` : ''}`
              : `✓ ${anyToolPerm ? (totalCount > 0 ? `Confirm (${totalCount})` : 'Yes (Allow)') : `Submit Answer${totalCount > 0 ? ` (${totalCount})` : ''}`}`;
          }
        });
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
          S.submitInteractiveQuestionCard(cardKey, false);
        }
      }
    });

    document.addEventListener('click', async (e) => {
      if (isPinLocked() && !e.target?.closest?.('#pin-overlay')) {
        e.preventDefault();
        return;
      }
      const claudeModeBtn = e.target.closest('[data-set-claude-mode]');
      if (claudeModeBtn) {
        e.preventDefault();
        e.stopPropagation();
        await setFleetClaudeModeRemote(claudeModeBtn.dataset.setClaudeMode);
        return;
      }
      const toggle3pBtn = e.target.closest('[data-toggle-3p-quota]');
      if (toggle3pBtn) {
        e.preventDefault();
        e.stopPropagation();
        await setHideThirdPartyQuota(toggle3pBtn.getAttribute('data-toggle-3p-quota') === 'hide');
        return;
      }
      if (
        S.slashPopoverItems.length > 0 &&
        !e.target?.closest?.('#composer-slash-popover') &&
        !e.target?.closest?.('#btn-composer-slash') &&
        !e.target?.closest?.('#btn-composer-mention') &&
        !e.target?.closest?.('#composer-input')
      ) {
        S.closeSlashPopover();
      }
      const palPop = $('theme-palette-popover');
      if (
        palPop &&
        !palPop.hidden &&
        !e.target?.closest?.('#theme-palette-popover') &&
        !e.target?.closest?.('#btn-palette-picker')
      ) {
        palPop.hidden = true;
        $('btn-palette-picker')?.setAttribute('aria-expanded', 'false');
      }
      const ctxMenuEl = $('ide-context-menu');
      if (
        ctxMenuEl &&
        !ctxMenuEl.hidden &&
        !e.target?.closest?.('#ide-context-menu') &&
        !e.target?.closest?.('[data-sess-ctx-menu]') &&
        !e.target?.closest?.('[data-group-ctx-menu]') &&
        !e.target?.closest?.('[data-acct-ctx-menu]')
      ) {
        S.closeIdeContextMenu();
      }
      const chatMoreMenu = $('chat-more-menu');
      if (
        chatMoreMenu &&
        !chatMoreMenu.hidden &&
        !e.target?.closest?.('#chat-more-wrap')
      ) {
        chatMoreMenu.hidden = true;
        $('btn-chat-more')?.setAttribute('aria-expanded', 'false');
      }
      const modPop = $('model-picker-popover');
      if (
        modPop &&
        !modPop.hidden &&
        !e.target?.closest?.('#model-picker-popover') &&
        !e.target?.closest?.('#composer-model-btn')
      ) {
        modPop.hidden = true;
        S.modelPickerAdjustEffortOpen = false;
        $('composer-model-btn')?.setAttribute('aria-expanded', 'false');
      }

      const modTriggerBtn = e.target.closest('#composer-model-btn');
      if (modTriggerBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (modPop) {
          const nextOpen = modPop.hidden || modTriggerBtn !== S.lastModelAnchorEl;
          const ctxPop = $('ctx-popover');
          if (ctxPop) ctxPop.hidden = true;
          const bgPop = $('bg-tasks-popover');
          if (bgPop) bgPop.hidden = true;
          if (!nextOpen) S.modelPickerAdjustEffortOpen = false;
          else if (modPop.hidden) S.modelPickerAdjustEffortOpen = false;
          S.renderChatView(false);
          modPop.hidden = !nextOpen;
          if (nextOpen) {
            S.positionModelPickerPopover(modTriggerBtn);
          }
          $('composer-model-btn')?.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
        }
        return;
      }
      if (e.target.closest('#btn-close-model-picker')) {
        if (modPop) modPop.hidden = true;
        S.modelPickerAdjustEffortOpen = false;
        $('composer-model-btn')?.setAttribute('aria-expanded', 'false');
        return;
      }
      if (e.target.closest('[data-toggle-model-effort-bar]')) {
        e.preventDefault();
        e.stopPropagation();
        S.modelPickerAdjustEffortOpen = true;
        S.renderChatView(false);
        S.positionModelPickerPopover($('composer-model-btn'));
        return;
      }
      const neonSwitchBtn = e.target.closest('[data-switch-neon-carbon]');
      if (neonSwitchBtn) {
        e.preventDefault();
        e.stopPropagation();
        haptic(8);
        const tid = String(neonSwitchBtn.dataset.switchNeonCarbon || prefs.selectedThreadId || '').trim();
        const cat = S.getEffectiveModelCatalog('antigravity');
        const rowObj = (appState?.rows || []).find((r) => r && r.id === tid);
        const curIsOrch = /orchestrator/i.test(String(rowObj?.model || ''));
        const targetCarbon =
          (curIsOrch ? cat.find((m) => m.id === 'orchestrator-carbon') : cat.find((m) => m.id === 'gemini-4-carbon')) ||
          cat.find((m) => m.id === 'orchestrator-carbon') ||
          cat.find((m) => m.id.includes('carbon')) ||
          cat.find((m) => m.id.includes('argon')) ||
          cat[0];
        if (tid && targetCarbon) {
          const cfg = S.setSessionModelConfig({
            threadId: tid,
            provider: 'antigravity',
            modelId: targetCarbon.id,
            effort: targetCarbon.supportsEffort === false ? '' : 'high'
          });
          showToast(`Switched session from Neon to ${cfg.displayLabel}`);
        }
        return;
      }
      const selComboBtn = e.target.closest('[data-select-model-combo]');
      if (selComboBtn) {
        e.preventDefault();
        e.stopPropagation();
        haptic(8);
        const rawCombo = String(selComboBtn.dataset.selectModelCombo || '');
        const [mId, effId = ''] = rawCombo.split(':');
        const prov = selComboBtn.dataset.modelProv || '';
        if (mId) {
          const cfg = S.setSessionModelConfig({ modelId: mId, effort: effId, provider: prov });
          S.modelPickerAdjustEffortOpen = false;
          if (modPop) modPop.hidden = true;
          $('composer-model-btn')?.setAttribute('aria-expanded', 'false');
          showToast(`Model set to ${cfg.displayLabel}`);
        }
        return;
      }
      const selModelBtn = e.target.closest('[data-select-ai-model]');
      if (selModelBtn) {
        e.preventDefault();
        e.stopPropagation();
        haptic(8);
        const mId = selModelBtn.dataset.selectAiModel || '';
        const prov = selModelBtn.dataset.modelProv || '';
        const comboAttr = String(selModelBtn.dataset.selectModelCombo || '');
        const comboEff = comboAttr.includes(':') ? comboAttr.split(':')[1] : '';
        if (mId) {
          const cfg = S.setSessionModelConfig({
            modelId: mId,
            effort: comboEff || undefined,
            provider: prov
          });
          showToast(`Model set to ${cfg.displayLabel}`);
        }
        return;
      }
      const selEffortBtn = e.target.closest('[data-select-ai-effort]');
      if (selEffortBtn) {
        e.preventDefault();
        e.stopPropagation();
        haptic(8);
        const effId = selEffortBtn.dataset.selectAiEffort || '';
        const prov = selEffortBtn.dataset.modelProv || '';
        if (effId) {
          const cfg = S.setSessionModelConfig({ effort: effId, provider: prov });
          showToast(`Thinking level set to ${cfg.effortLabel} (${cfg.displayLabel})`);
        }
        return;
      }
      const lpScopeBtn = e.target.closest('[data-launchpad-scope]');
      if (lpScopeBtn) {
        e.preventDefault();
        e.stopPropagation();
        haptic(8);
        const scopeVal = String(lpScopeBtn.dataset.launchpadScope || '').trim();
        prefs.composerRepoPrefix = scopeVal;
        if (scopeVal) {
          recordFreqUsage('repos', scopeVal);
          const matchedWs = (appState?.workspaces || []).find(
            (w) => w && (w.name === scopeVal || w.id === scopeVal)
          );
          if (matchedWs?.id) prefs.selectedRepoId = matchedWs.id;
        }
        saveJson(STORAGE_KEYS.PREFS, prefs);
        S.renderChatView(false);
        return;
      }

      // Palette Switcher & Split Inspector Controls
      if (e.target.closest('#btn-palette-picker')) {
        e.preventDefault();
        e.stopPropagation();
        if (palPop) {
          const nextOpen = palPop.hidden;
          syncPalettePickerUi();
          palPop.hidden = !nextOpen;
          if (nextOpen) positionPalettePopover($('btn-palette-picker'));
          $('btn-palette-picker')?.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
        }
        return;
      }
      if (e.target.closest('#btn-close-palette')) {
        if (palPop) palPop.hidden = true;
        $('btn-palette-picker')?.setAttribute('aria-expanded', 'false');
        return;
      }
      const setPalBtn = e.target.closest('[data-set-palette]');
      if (setPalBtn) {
        applyPalette(setPalBtn.dataset.setPalette || 'graphite', true);
        if (palPop) palPop.hidden = true;
        $('btn-palette-picker')?.setAttribute('aria-expanded', 'false');
        return;
      }
      if (e.target.closest('#btn-toggle-composer-route')) {
        prefs.composerRouteExpanded = !prefs.composerRouteExpanded;
        saveJson(STORAGE_KEYS.PREFS, prefs);
        S.updateComposerActionButton();
        return;
      }
      if (e.target.closest('#btn-chat-more')) {
        e.preventDefault();
        e.stopPropagation();
        const menu = $('chat-more-menu');
        if (menu) {
          const nextOpen = menu.hidden;
          menu.hidden = !nextOpen;
          $('btn-chat-more')?.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
        }
        return;
      }
      if (e.target.closest('#btn-chat-more-compact')) {
        e.preventDefault();
        e.stopPropagation();
        await S.triggerActiveSessionCompact();
        return;
      }
      if (e.target.closest('#btn-split-watch')) {
        prefs.splitWatchOpen = !prefs.splitWatchOpen;
        saveJson(STORAGE_KEYS.PREFS, prefs);
        const menu = $('chat-more-menu');
        if (menu) menu.hidden = true;
        $('btn-chat-more')?.setAttribute('aria-expanded', 'false');
        S.renderChatView(false);
        return;
      }
      if (e.target.closest('[data-split-watch-close]')) {
        prefs.splitWatchOpen = false;
        saveJson(STORAGE_KEYS.PREFS, prefs);
        S.renderChatView(false);
        return;
      }
      const splitSwapBtn = e.target.closest('[data-split-watch-swap]');
      if (splitSwapBtn) {
        const targetId = String(splitSwapBtn.dataset.splitWatchSwap || '').trim();
        if (targetId && targetId !== prefs.selectedThreadId) {
          const prevPrimary = prefs.selectedThreadId;
          prefs.splitWatchThreadId = prevPrimary;
          prefs.selectedThreadId = targetId;
          prefs.lastReplyThreadId = targetId;
          prefs.composerMode = 'reply';
          S.ensureEditorTabOpen(targetId);
          recordFreqUsage('threads', targetId);
          saveJson(STORAGE_KEYS.PREFS, prefs);
          S.emitPrewarmHint(targetId, { source: 'split-watch-swap' });
          S.renderChatView(true);
          S.renderIdeSidebar();
          S.fetchThreadDetail(targetId).catch(() => {});
        }
        return;
      }
      const quoteLineBtn = e.target.closest('[data-quote-line]');
      if (quoteLineBtn) {
        e.preventDefault();
        e.stopPropagation();
        const ref = String(quoteLineBtn.dataset.quoteLine || '').trim();
        const inp = $('composer-input');
        if (ref && inp) {
          const token = `@${ref} `;
          const cur = inp.value || '';
          inp.value = cur && !cur.endsWith(' ') ? `${cur} ${token}` : `${cur}${token}`;
          inp.focus();
          S.updateComposerActionButton();
          showToast(`Quoted ${token.trim()} in composer`);
        }
        return;
      }
      const askReviewBtn = e.target.closest('[data-insp-ask-review]');
      if (askReviewBtn) {
        const fp = String(askReviewBtn.dataset.inspAskReview || '').trim();
        const inp = $('composer-input');
        if (fp && inp) {
          inp.value = `Review changes in @${fp} for edge cases, regressions, and security invariants.`;
          inp.focus();
          S.updateComposerActionButton();
        }
        return;
      }
      const gitPromptBtn = e.target.closest('[data-git-prompt-action]');
      if (gitPromptBtn) {
        const act = gitPromptBtn.dataset.gitPromptAction;
        const inp = $('composer-input');
        if (inp) {
          inp.value =
            act === 'commit'
              ? 'Summarize all uncommitted working tree changes and stage a clean, verified commit.'
              : 'Review all modified files in the current git working tree and flag any potential issues.';
          inp.focus();
          S.updateComposerActionButton();
        }
        return;
      }
      if (e.target.closest('[data-studio-cap-refresh]')) {
        const activeRow = (appState?.rows || []).find((r) => r.id === prefs.selectedThreadId) || null;
        await S.fetchStudioCapabilities(activeRow, true);
        showToast('Refreshed workspace capabilities');
        return;
      }
      const runCheckBtn = e.target.closest('[data-run-studio-check]');
      if (runCheckBtn) {
        const chkId = String(runCheckBtn.dataset.runStudioCheck || '').trim();
        const activeRow = (appState?.rows || []).find((r) => r.id === prefs.selectedThreadId) || null;
        if (chkId) {
          await S.executeStudioCheck(chkId, activeRow);
        }
        return;
      }
      if (e.target.closest('#btn-toggle-inspector')) {
        haptic(8);
        S.setInspectorOpen(!prefs.inspectorOpen);
        return;
      }
      if (e.target.closest('#btn-close-inspector') || e.target.closest('#ide-inspector-backdrop')) {
        S.setInspectorOpen(false);
        return;
      }
      const inspTabBtn = e.target.closest('[data-insp-tab]');
      if (inspTabBtn) {
        S.setInspectorOpen(true, inspTabBtn.dataset.inspTab || 'files');
        return;
      }
      const inspModeBtn = e.target.closest('[data-insp-view-mode]');
      if (inspModeBtn) {
        const nextMode = inspModeBtn.dataset.inspViewMode;
        prefs.inspectorViewMode =
          nextMode === 'diff' ? 'diff' : nextMode === 'preview' ? 'preview' : 'source';
        if (prefs.inspectorViewMode !== 'preview') {
          S.teardownDeliverableInspectorFrames();
          prefs.inspectorFullStage = false;
        }
        saveJson(STORAGE_KEYS.PREFS, prefs);
        S.renderChatView(false);
        if (prefs.inspectorViewMode === 'preview' && S.activeInspectorFileTarget) {
          const parsedCur = S.parsePreviewTargetClient(S.activeInspectorFileTarget);
          const dKind = S.getDeliverableKindClient(parsedCur.filePath);
          if (dKind) {
            const sid = String(prefs.selectedThreadId || '').trim();
            const activeRow = (appState?.rows || []).find((r) => r && r.id === sid) || null;
            const wsId = S.resolveSessionWorkspaceContext(activeRow, threadsCache[sid] || null).wsId;
            const cacheKey = `${sid || wsId || 'global'}::${parsedCur.filePath.replace(/\\/g, '/')}`;
            const pageKey = `${cacheKey}::p${S.activeDeliverablePage}`;
            const hasEntry = dKind === 'pdf' || dKind === 'pptx'
              ? S.deliverablePageCache.has(pageKey)
              : S.deliverablePreviewCache.has(cacheKey);
            if (!hasEntry) {
              S.fetchDeliverablePreview(S.activeInspectorFileTarget, activeRow, { page: S.activeDeliverablePage }).catch(() => {});
            }
          }
        }
        return;
      }
      if (e.target.closest('[data-insp-full-stage]')) {
        prefs.inspectorFullStage = !prefs.inspectorFullStage;
        saveJson(STORAGE_KEYS.PREFS, prefs);
        S.renderChatView(false);
        return;
      }
      const inspSheetBtn = e.target.closest('[data-insp-sheet-idx]');
      if (inspSheetBtn) {
        S.activeDeliverableSheetIdx = Math.max(0, Number(inspSheetBtn.dataset.inspSheetIdx || 0));
        S.renderChatView(false);
        return;
      }
      const inspPageBtn = e.target.closest('[data-insp-dlv-page]');
      if (inspPageBtn) {
        const nextP = Math.max(1, Number(inspPageBtn.dataset.inspDlvPage || 1));
        if (nextP !== S.activeDeliverablePage) {
          S.activeDeliverablePage = nextP;
          const activeRow = (appState?.rows || []).find((r) => r && r.id === prefs.selectedThreadId) || null;
          S.renderChatView(false);
          if (S.activeInspectorFileTarget) {
            S.fetchDeliverablePreview(S.activeInspectorFileTarget, activeRow, { page: nextP }).catch(() => {});
          }
        }
        return;
      }
      const inspDeckModeBtn = e.target.closest('[data-insp-dlv-deck-mode]');
      if (inspDeckModeBtn) {
        S.activeDeliverableDeckMode = inspDeckModeBtn.dataset.inspDlvDeckMode === 'all' ? 'all' : 'single';
        S.renderChatView(false);
        return;
      }
      const inspZoomBtn = e.target.closest('[data-insp-dlv-zoom]');
      if (inspZoomBtn) {
        const act = inspZoomBtn.dataset.inspDlvZoom;
        if (act === 'fit') S.activeDeliverableZoomPct = 0;
        else if (act === 'in') S.activeDeliverableZoomPct = S.activeDeliverableZoomPct === 0 ? 115 : Math.min(200, S.activeDeliverableZoomPct + 20);
        else if (act === 'out') S.activeDeliverableZoomPct = S.activeDeliverableZoomPct === 0 ? 80 : Math.max(40, S.activeDeliverableZoomPct - 20);
        S.renderChatView(false);
        return;
      }
      const inspDlvAppBtn = e.target.closest('[data-insp-dlv-app]');
      if (inspDlvAppBtn) {
        const activeRow = (appState?.rows || []).find((r) => r && r.id === prefs.selectedThreadId) || null;
        await S.openActiveDeliverableInApp(inspDlvAppBtn.dataset.inspDlvApp || S.activeInspectorFileTarget, activeRow);
        return;
      }
      const inspDlvExportBtn = e.target.closest('[data-insp-dlv-export]');
      if (inspDlvExportBtn) {
        const activeRow = (appState?.rows || []).find((r) => r && r.id === prefs.selectedThreadId) || null;
        await S.exportActiveDeliverable(inspDlvExportBtn.dataset.inspDlvExport || S.activeInspectorFileTarget, activeRow);
        return;
      }
      const inspCopyBtn = e.target.closest('[data-insp-copy-code]');
      if (inspCopyBtn) {
        const key = inspCopyBtn.dataset.inspCopyCode || '';
        const cached = S.filePreviewCache.get(key);
        const diffCopy = String(cached?.gitDiff ?? cached?.diffPatch ?? cached?.diff ?? '');
        const srcCopy = String(cached?.content || '');
        const textToCopy =
          prefs.inspectorViewMode === 'diff' && diffCopy
            ? diffCopy
            : srcCopy || diffCopy;
        if (textToCopy) {
          try {
            await navigator.clipboard.writeText(textToCopy);
            showToast('📋 Copied preview to clipboard');
          } catch {}
        }
        return;
      }
      if (e.target.closest('[data-insp-refresh-agents]')) {
        const activeRow = (appState?.rows || []).find((r) => r.id === prefs.selectedThreadId) || null;
        S.fetchStudioCapabilities(activeRow, true).catch(() => {});
        if (prefs.selectedThreadId && !S.isNewSessionMode()) {
          const prov = activeRow?.provider || pinnedNavProvider || 'antigravity';
          await S.fetchThreadDetail(prefs.selectedThreadId, prov);
          const { allTasks } = S.getSessionBackgroundTasks(activeRow, threadsCache[prefs.selectedThreadId]);
          for (const t of allTasks.slice(0, 4)) {
            if (t?.id) {
              await S.fetchBgTaskLiveLog(prefs.selectedThreadId, t.fullId || t.id, prov);
            }
          }
          S.renderChatView(false);
          showToast('Refreshed Side Agents & Checks');
        }
        return;
      }
      const previewFileEl = e.target.closest('[data-preview-file]');
      if (previewFileEl) {
        e.preventDefault();
        e.stopPropagation();
        const fileTarget = previewFileEl.dataset.previewFile || '';
        const parsedClicked = S.parsePreviewTargetClient(fileTarget);
        const dlvKind = S.getDeliverableKindClient(parsedClicked.filePath);
        const viewMode =
          previewFileEl.dataset.previewMode === 'diff'
            ? 'diff'
            : dlvKind && dlvKind !== 'html'
              ? 'preview'
              : parsedClicked.startLine > 0
                ? 'source'
                : dlvKind
                  ? 'preview'
                  : 'source';
        if (fileTarget) {
          if (prefs.activeTab !== 'chat') switchTab('chat');
          S.setInspectorOpen(true, 'files', { fileTarget, viewMode });
        }
        return;
      }
      const openAgentBtn = e.target.closest('[data-insp-open-agent]');
      if (openAgentBtn) {
        e.preventDefault();
        e.stopPropagation();
        const agentId = openAgentBtn.dataset.inspOpenAgent || '';
        const sid = openAgentBtn.dataset.sessId || prefs.selectedThreadId || '';
        const prov = openAgentBtn.dataset.sessionProv || '';
        if (sid && sid !== prefs.selectedThreadId) {
          recentResumeUntil = 0;
          S.ensureEditorTabOpen(sid);
          setPinnedNav({ threadId: sid, provider: prov, durationMs: 45000 });
          prefs.selectedThreadId = sid;
          prefs.lastReplyThreadId = sid;
          prefs.composerMode = 'reply';
          saveJson(STORAGE_KEYS.PREFS, prefs);
          S.fetchThreadDetail(sid, prov).catch(() => {});
        }
        if (prefs.activeTab !== 'chat') switchTab('chat');
        S.setInspectorOpen(true, 'tasks', { agentId });
        if (sid && agentId) {
          S.fetchBgTaskLiveLog(sid, agentId, prov).catch(() => {});
        }
        S.renderIdeSidebar();
        return;
      }
      const openConvEl = e.target.closest('[data-open-conv]');
      if (openConvEl) {
        e.preventDefault();
        e.stopPropagation();
        const convId = String(openConvEl.dataset.openConv || '').trim();
        if (convId) {
          recentResumeUntil = 0;
          S.ensureEditorTabOpen(convId);
          setPinnedNav({ threadId: convId, durationMs: 45000 });
          prefs.selectedThreadId = convId;
          prefs.lastReplyThreadId = convId;
          prefs.composerMode = 'reply';
          saveJson(STORAGE_KEYS.PREFS, prefs);
          if (prefs.activeTab !== 'chat') switchTab('chat');
          S.renderChatView(true);
          S.renderIdeSidebar();
          S.fetchThreadDetail(convId).catch(() => {});
        }
        return;
      }
      const outlineJumpBtn = e.target.closest('[data-outline-jump]');
      if (outlineJumpBtn) {
        e.preventDefault();
        e.stopPropagation();
        const anchor = outlineJumpBtn.dataset.outlineJump || '';
        const detailKey = outlineJumpBtn.dataset.outlineDetail || '';
        const streamEl = $('chat-stream');
        if (streamEl && anchor) {
          const candidates = Array.from(streamEl.querySelectorAll('[data-turn-anchor]'));
          const targetEl = candidates.find((el) => el.dataset.turnAnchor === anchor);
          if (detailKey) {
            const detCandidates = Array.from(streamEl.querySelectorAll('details[data-chat-detail-key]'));
            const detEl = detCandidates.find((d) => d.dataset.chatDetailKey === detailKey);
            if (detEl) {
              detEl.open = true;
              detEl.dataset.renderedOpen = '1';
              const openMap = S.getThreadOpenDetailsMap(prefs.selectedThreadId, true);
              if (openMap) openMap.set(detailKey, true);
            }
          }
          if (window.innerWidth <= 1024) {
            S.setInspectorOpen(false);
          }
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
        return;
      }
      const bgSideActBtn = e.target.closest('[data-bg-side-act]');
      if (bgSideActBtn) {
        e.preventDefault();
        e.stopPropagation();
        const sideAct = bgSideActBtn.dataset.bgSideAct;
        if (sideAct === 'unpin') {
          prefs.pinnedBgSessionId = '';
          saveJson(STORAGE_KEYS.PREFS, prefs);
          S.renderIdeSidebar();
        } else if (sideAct === 'stop-all') {
          if (prefs.pinnedBgSessionId) {
            const pinnedRow = (appState?.rows || []).find((r) => r.id === prefs.pinnedBgSessionId);
            await S.cancelAllSessionBgTasks(prefs.pinnedBgSessionId, pinnedRow?.provider || 'antigravity');
          } else {
            const rows = (appState?.rows || []).filter((r) => r && r.id && !r.archived);
            for (const r of rows) {
              const { runningCount } = S.getSessionBackgroundTasks(r, threadsCache[r.id]);
              if (runningCount > 0) {
                await S.cancelAllSessionBgTasks(r.id, r.provider);
              }
            }
          }
        }
        return;
      }
      const sessCtxBtn = e.target.closest('[data-sess-ctx-menu]');
      if (sessCtxBtn) {
        e.preventDefault();
        e.stopPropagation();
        const rect = sessCtxBtn.getBoundingClientRect();
        S.openSessionContextMenu(sessCtxBtn.dataset.sessCtxMenu || '', rect.right - 160, rect.bottom + 4);
        return;
      }
      const ctxActBtn = e.target.closest('[data-ctx-menu-act]');
      if (ctxActBtn) {
        e.preventDefault();
        e.stopPropagation();
        S.closeIdeContextMenu(ctxActBtn.dataset.ctxMenuAct === 'rename');
        const cAct = ctxActBtn.dataset.ctxMenuAct;
        const sid = ctxActBtn.dataset.id || '';
        const prov = ctxActBtn.dataset.prov || 'antigravity';
        if (!sid) return;
        if (cAct === 'open' || cAct === 'inspect-outline') {
          recentResumeUntil = 0;
          S.ensureEditorTabOpen(sid);
          recordFreqUsage('threads', sid);
          setPinnedNav({ threadId: sid, provider: prov, durationMs: 45000 });
          prefs.selectedThreadId = sid;
          prefs.lastReplyThreadId = sid;
          prefs.composerMode = 'reply';
          saveJson(STORAGE_KEYS.PREFS, prefs);
          switchTab('chat');
          if (cAct === 'inspect-outline') {
            S.setInspectorOpen(true, 'tasks');
          }
          S.renderIdeSidebar();
          S.fetchThreadDetail(sid, prov).catch(() => {});
        } else if (cAct === 'rename') {
          S.beginIdeInlineRename('session', sid);
        } else if (cAct === 'pin-bg') {
          prefs.pinnedBgSessionId = prefs.pinnedBgSessionId === sid ? '' : sid;
          saveJson(STORAGE_KEYS.PREFS, prefs);
          S.renderIdeSidebar();
          showToast(prefs.pinnedBgSessionId ? '📌 Pinned session Side Agents in sidebar' : 'Unpinned Side Agents');
        } else if (cAct === 'open-vscode') {
          const revealRes = await S.dispatchRemoteCommand({
            type: 'sessionAction',
            action: 'open',
            subAction: 'open',
            id: sid,
            provider: prov
          });
          showToast(S.describeVsCodeOpenReply(revealRes, 'Opened session tab in desktop VS Code'));
        }
        return;
      }
      const qDockStepBtn = e.target.closest('[data-q-dock-step]');
      if (qDockStepBtn) {
        const cardKey = qDockStepBtn.dataset.cardKey || '';
        const nextStep = Number(qDockStepBtn.dataset.qDockStep || 0);
        if (cardKey && Number.isFinite(nextStep)) {
          S.activeDockStepByCardKey.set(cardKey, nextStep);
          S.renderChatView(false);
        }
        return;
      }

      // 0. Interactive VS Code Question & Recommendation Card Actions
      const qOptBtn = e.target.closest('[data-q-opt-toggle]');
      if (qOptBtn) {
        haptic(10);
        const cardKey = qOptBtn.dataset.cardKey || '';
        const qIdx = Number(qOptBtn.dataset.qIdx || 0);
        const optIdx = String(qOptBtn.dataset.optIdx || '0');
        const draft = S.getQuestionDraft(cardKey);
        const meta = S.renderedQuestionsByCardKey.get(cardKey);
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

        // Mirror selection across sibling question cards (sidebar / dock / chat stream) for the same session
        if (meta?.sessionId) {
          for (const [sibKey, sibMeta] of S.renderedQuestionsByCardKey.entries()) {
            if (sibKey !== cardKey && sibMeta?.sessionId === meta.sessionId) {
              const sibDraft = S.getQuestionDraft(sibKey);
              sibDraft.selectedByQ[qIdx] = new Set(selSet);
            }
          }
        }

        document.querySelectorAll('[data-q-card]').forEach((cardEl) => {
          const cKey = cardEl.dataset.qCard || '';
          const cMeta = S.renderedQuestionsByCardKey.get(cKey);
          if (cKey !== cardKey && (!meta?.sessionId || cMeta?.sessionId !== meta.sessionId)) return;
          const blockEl = cardEl.querySelector(`[data-q-block="${qIdx}"]`) || cardEl;
          blockEl.querySelectorAll(`[data-q-opt-toggle][data-q-idx="${qIdx}"]`).forEach((btn) => {
            const idx = String(btn.dataset.optIdx || '');
            const active = selSet.has(idx);
            btn.classList.toggle('is-selected', active);
            btn.classList.toggle('selected', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            const chk = btn.querySelector('.vs-q-check');
            if (chk) chk.textContent = active ? '✓' : '';
          });
          const cDraft = S.getQuestionDraft(cKey);
          const qCount = cMeta?.questions?.length || meta?.questions?.length || 1;
          const anyToolPerm = Boolean((cMeta?.questions || meta?.questions)?.some((q) => q.isToolPermission));
          const totalCount = S.countDraftSelections(cDraft, qCount);
          const subBtn = cardEl.querySelector('[data-q-submit]');
          if (subBtn) {
            const isShortSub = cardEl.classList.contains('sb-q-card');
            subBtn.textContent = isShortSub
              ? `✓ ${anyToolPerm ? 'Allow' : 'Submit'}${totalCount > 0 ? ` (${totalCount})` : ''}`
              : `✓ ${anyToolPerm ? (totalCount > 0 ? `Confirm (${totalCount})` : 'Yes (Allow)') : `Submit Answer${totalCount > 0 ? ` (${totalCount})` : ''}`}`;
          }
        });
        return;
      }

      const qSubmitBtn = e.target.closest('[data-q-submit]');
      if (qSubmitBtn) {
        const cardKey = qSubmitBtn.dataset.cardKey || '';
        if (cardKey) {
          await S.submitInteractiveQuestionCard(cardKey, false);
        }
        return;
      }

      const qSkipBtn = e.target.closest('[data-q-skip]');
      if (qSkipBtn) {
        const cardKey = qSkipBtn.dataset.cardKey || '';
        if (cardKey) {
          await S.submitInteractiveQuestionCard(cardKey, true);
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
          S.closeNotifModal();
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
          S.openNotifModal();
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
        } else if (act === 'cf-migrate-now') {
          if (pushBtn.disabled) return;
          pushBtn.disabled = true;
          try {
            window.location.href = S.buildTheoMigrationUrl();
          } finally {
            pushBtn.disabled = false;
          }
        } else if (act === 'cf-migrate-dismiss') {
          const curMf = getTheoMigrationMeta();
          if (curMf) saveTheoMigrationMeta({ ...curMf, needsPushPrompt: false });
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
        S.renderIdeSidebar();
        return;
      }

      const closeTabBtn = e.target.closest('[data-close-editor-tab]');
      if (closeTabBtn) {
        e.stopPropagation();
        haptic(8);
        S.closeEditorTab(closeTabBtn.dataset.closeEditorTab || '');
        return;
      }

      const editorTabEl = e.target.closest('[data-editor-tab-id]');
      if (editorTabEl && editorTabEl.dataset.editorTabId) {
        const tid = editorTabEl.dataset.editorTabId;
        if (tid === '__new__') return;
        recentResumeUntil = 0;
        S.ensureEditorTabOpen(tid);
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
        S.renderChatView(true);
        S.renderIdeSidebar();
        S.fetchThreadDetail(tid, editorTabEl.dataset.sessionProv || '');
        return;
      }

      const ideOpenRow = e.target.closest('[data-ide-open-session]');
      if (
        ideOpenRow &&
        ideOpenRow.dataset.ideOpenSession &&
        !e.target.closest('[data-sess-act], [data-sess-ctx-menu], [data-approve-act], [data-close-editor-tab], [data-switch-neon-carbon], [contenteditable="true"]')
      ) {
        const sid = ideOpenRow.dataset.ideOpenSession;
        const prov = ideOpenRow.dataset.sessionProv || '';
        recentResumeUntil = 0;
        S.ensureEditorTabOpen(sid);
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
        S.renderIdeSidebar();
        S.fetchThreadDetail(sid, prov);
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
          const openMap = S.getThreadOpenDetailsMap(prefs.selectedThreadId, true);
          detailsList.forEach((d) => {
            const key = d.dataset.chatDetailKey || '';
            d.dataset.renderedOpen = anyClosed ? '1' : '0';
            if (openMap && key) openMap.set(key, anyClosed);
            d.open = anyClosed;
          });
          const parentTools = stack.closest('details.tools-details[data-chat-detail-key]');
          if (parentTools) {
            if (anyClosed && !parentTools.open) {
              parentTools.open = true;
            }
            if (openMap && parentTools.dataset.chatDetailKey) {
              parentTools.dataset.renderedOpen = parentTools.open ? '1' : '0';
              openMap.set(parentTools.dataset.chatDetailKey, parentTools.open);
            }
          }
          toggleStepsBtn.textContent = anyClosed ? 'Collapse all' : 'Expand all';
        }
        return;
      }

      const stepFilterBtn = e.target.closest('[data-step-kind-filter]');
      if (stepFilterBtn) {
        e.preventDefault();
        e.stopPropagation();
        const kind = stepFilterBtn.dataset.stepKindFilter || 'all';
        const turnKey = stepFilterBtn.dataset.stepTurnKey || '';
        if (turnKey) {
          setBoundedMap(S.stepKindFilterByTurnKey, turnKey, kind);
        }
        const stack = stepFilterBtn.closest('.code-steps-stack');
        if (stack) {
          stack.querySelectorAll('[data-step-kind-filter]').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.stepKindFilter === kind);
          });
          stack.querySelectorAll('.code-step-card[data-step-kind]').forEach((card) => {
            const cardKind = card.dataset.stepKind || 'other';
            card.hidden = kind !== 'all' && cardKind !== kind;
          });
          const parentTools = stack.closest('details.tools-details[data-chat-detail-key]');
          if (parentTools && !parentTools.open) {
            parentTools.open = true;
            const openMap = S.getThreadOpenDetailsMap(prefs.selectedThreadId, true);
            if (openMap && parentTools.dataset.chatDetailKey) {
              parentTools.dataset.renderedOpen = '1';
              openMap.set(parentTools.dataset.chatDetailKey, true);
            }
          }
        }
        return;
      }

      const liveTraceBtn = e.target.closest('[data-toggle-live-trace]');
      if (liveTraceBtn && !e.target.closest('[data-preview-file]')) {
        e.preventDefault();
        e.stopPropagation();
        const turnBubble = liveTraceBtn.closest('.turn-bubble.assistant');
        if (turnBubble) {
          const thinkEl = turnBubble.querySelector('details.vs-thought-card');
          const toolsEl = turnBubble.querySelector('details.tools-details');
          const anyClosed = Boolean((thinkEl && !thinkEl.open) || (toolsEl && !toolsEl.open));
          const openMap = S.getThreadOpenDetailsMap(prefs.selectedThreadId, true);
          for (const d of [thinkEl, toolsEl]) {
            if (!d) continue;
            d.open = anyClosed;
            d.dataset.renderedOpen = anyClosed ? '1' : '0';
            if (openMap && d.dataset.chatDetailKey) {
              openMap.set(d.dataset.chatDetailKey, anyClosed);
            }
          }
          liveTraceBtn.classList.toggle('is-expanded', anyClosed);
          liveTraceBtn.setAttribute('aria-expanded', anyClosed ? 'true' : 'false');
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
          S.attachMentionItemToComposer({ name: fp, repoPath: fp, kind: 'repo', sizeLabel: 'file ref' });
          showToast(`Mentioned ${fp}`);
          $('composer-input')?.focus();
        }
        return;
      }

      const slashPickBtn = e.target.closest('[data-slash-pick]');
      if (slashPickBtn) {
        e.preventDefault();
        e.stopPropagation();
        await S.applySlashPopoverSelection(Number(slashPickBtn.dataset.slashPick || 0));
        return;
      }

      const sidebarNavBtn = e.target.closest('[data-sidebar-nav]');
      if (sidebarNavBtn) {
        e.preventDefault();
        e.stopPropagation();
        haptic(8);
        clearPinnedNav();
        const targetTab = String(sidebarNavBtn.dataset.sidebarNav || '').trim() || 'chat';
        switchTab(prefs.activeTab === targetTab ? 'chat' : targetTab);
        return;
      }

      if (e.target.closest('[data-open-conn-modal]')) {
        e.preventDefault();
        e.stopPropagation();
        S.openConnModal();
        S.syncData().catch(() => {});
        return;
      }

      if (e.target.closest('[data-open-cmd-palette]')) {
        e.preventDefault();
        e.stopPropagation();
        S.openCommandPalette();
        return;
      }

      if (e.target.closest('[data-chat-rename-btn]')) {
        e.preventDefault();
        e.stopPropagation();
        if (!S.isNewSessionMode() && S.cleanTargetThreadId(prefs.selectedThreadId)) {
          S.beginIdeInlineRename('chat-session', prefs.selectedThreadId);
        }
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
        S.closeConnModal();
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
        S.renderPulseView();
        S.renderIdeSidebar();
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
          S.persistCache();
          S.renderPulseView();
          S.renderIdeSidebar();
        }
        await S.dispatchRemoteCommand({
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
        if (ctxMenuEl && !ctxMenuEl.hidden && acctMoveBtn.closest('#ide-context-menu')) {
          S.closeIdeContextMenu();
        }
        const dir = acctMoveBtn.dataset.accountMove;
        const accountId = acctMoveBtn.dataset.accountId;
        const provider = acctMoveBtn.dataset.accountProv === 'claude' ? 'claude' : 'antigravity';
        if (accountId && (dir === 'up' || dir === 'down')) {
          await S.reorderPulseQuotaCard(accountId, { direction: dir, provider });
          S.renderIdeSidebar();
        }
        return;
      }

      const acctLabelBtn = e.target.closest('[data-account-label]');
      if (acctLabelBtn) {
        e.stopPropagation();
        const accountId = acctLabelBtn.dataset.accountLabel;
        const provider = acctLabelBtn.dataset.accountProv === 'claude' ? 'claude' : 'antigravity';
        const curNick = acctLabelBtn.dataset.accountNick || '';
        const surface = acctLabelBtn.dataset.accountSurface === 'sidebar' ? 'sidebar' : 'pulse';
        S.activeInlineAcctEdit = { accountId, provider, surface, value: curNick };
        if (surface === 'sidebar') S.renderIdeSidebar();
        else S.renderPulseView();
        setTimeout(() => {
          const inp = (surface === 'sidebar' ? $('ide-sidebar-accounts') : $('pulse-quota-grid'))?.querySelector('.ide-acct-inline-edit');
          inp?.focus();
          inp?.select();
        }, 20);
        return;
      }

      if (e.target.closest('[data-acct-label-cancel]')) {
        e.stopPropagation();
        const prevSurf = S.activeInlineAcctEdit?.surface || 'sidebar';
        S.activeInlineAcctEdit = null;
        if (prevSurf === 'sidebar') S.renderIdeSidebar();
        else S.renderPulseView();
        return;
      }

      const acctCtxBtn = e.target.closest('[data-acct-ctx-menu]');
      if (acctCtxBtn) {
        e.preventDefault();
        e.stopPropagation();
        const rect = acctCtxBtn.getBoundingClientRect();
        S.openAccountContextMenu(
          acctCtxBtn.dataset.acctCtxMenu || '',
          acctCtxBtn.dataset.acctProv || 'antigravity',
          rect.right - 180,
          rect.bottom + 4
        );
        return;
      }

      const acctMenuAct = e.target.closest('[data-acct-menu-act]');
      if (acctMenuAct) {
        e.preventDefault();
        e.stopPropagation();
        S.closeIdeContextMenu();
        const act = acctMenuAct.dataset.acctMenuAct;
        const accountId = acctMenuAct.dataset.accountId || '';
        const provider = acctMenuAct.dataset.accountProv === 'claude' ? 'claude' : 'antigravity';
        if (act === 'switch' && accountId) {
          const provList = appState?.providers?.[provider]?.accounts;
          if (Array.isArray(provList)) {
            for (const item of provList) item.active = item.id === accountId;
            S.persistCache();
            S.renderPulseView();
            S.renderIdeSidebar();
          }
          await S.dispatchRemoteCommand({
            type: 'sessionAction',
            action: 'accountSwitch',
            subAction: 'accountSwitch',
            accountId,
            provider
          });
          showToast(`⇄ Switched active ${provider === 'claude' ? 'Claude Code' : 'Antigravity'} account`);
        } else if (act === 'new-session' && accountId) {
          const curGrp = S.resolveCurrentActiveSessionGroupId();
          S.dispatchRemoteCommand({
            type: 'sessionAction',
            action: 'accountNewSession',
            subAction: 'accountNewSession',
            accountId,
            provider,
            group: curGrp
          }).catch(() => {});
          S.enterNewSessionMode(provider, { groupId: curGrp });
          showToast(`+ Starting new ${provider === 'claude' ? 'Claude Code' : 'Antigravity'} session`);
        } else if (act === 'label' && accountId) {
          const curNick = acctMenuAct.dataset.accountNick || '';
          S.activeInlineAcctEdit = { accountId, provider, surface: 'sidebar', value: curNick };
          S.renderIdeSidebar();
          setTimeout(() => {
            const inp = $('ide-sidebar-accounts')?.querySelector('.ide-acct-inline-edit');
            inp?.focus();
            inp?.select();
          }, 20);
        } else if (act === 'refresh') {
          const targetDeviceId = S.resolveLiveAccountHostForAdd()?.id || (prefs.selectedDeviceFilter && prefs.selectedDeviceFilter !== 'all' ? prefs.selectedDeviceFilter : '');
          await S.dispatchRemoteCommand({
            type: 'sessionAction',
            action: 'accountRefresh',
            subAction: 'accountRefresh',
            accountId,
            provider,
            ...(targetDeviceId ? { targetDeviceId } : {})
          }).catch(() => {});
          S.syncData({ toast: false });
          showToast('↻ Refreshing account quotas…');
        } else if (act === 'details') {
          S.openAccountDetailsModal();
        }
        return;
      }

      const acctRemoveBtn = e.target.closest('[data-account-remove]');
      if (acctRemoveBtn && ctxMenuEl && !ctxMenuEl.hidden && acctRemoveBtn.closest('#ide-context-menu')) {
        S.closeIdeContextMenu();
      }
      if (acctRemoveBtn) {
        e.stopPropagation();
        const accountId = acctRemoveBtn.dataset.accountRemove;
        const provider = acctRemoveBtn.dataset.accountProv === 'claude' ? 'claude' : 'antigravity';
        const email = acctRemoveBtn.dataset.accountEmail || accountId;
        const provLabel = provider === 'claude' ? 'Claude Code' : 'Antigravity';
        const provList = appState?.providers?.[provider]?.accounts;
        const signedInCount = Array.isArray(provList)
          ? provList.filter(S.isSignedInQuotaCard).length
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
          S.persistCache();
          S.renderPulseView();
          S.renderIdeSidebar();
        }
        await S.dispatchRemoteCommand({
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

      const addTrayBtn = e.target.closest('[data-account-add-tray]');
      if (addTrayBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (S.addAccountTrayState && S.addAccountTrayState.surface === 'tray') {
          S.closeAddAccountTray();
        } else {
          S.openAddAccountTray('');
        }
        return;
      }

      const addTrayProvTab = e.target.closest('[data-add-tray-prov]');
      if (addTrayProvTab && S.addAccountTrayState) {
        e.preventDefault();
        e.stopPropagation();
        const inpEl =
          S.addAccountTrayState.surface === 'modal'
            ? $('acct-modal-add-label')
            : $('ide-add-tray-label');
        S.addAccountTrayState.label = String(inpEl?.value || S.addAccountTrayState.label || '');
        S.addAccountTrayState.provider =
          addTrayProvTab.dataset.addTrayProv === 'claude' ? 'claude' : 'antigravity';
        const hostBox =
          S.addAccountTrayState.surface === 'modal' ? $('acct-signin-body') : $('ide-add-account-tray');
        if (hostBox) {
          hostBox.innerHTML = S.renderAddAccountTrayHtml(S.addAccountTrayState.surface);
        }
        return;
      }

      if (e.target.closest('[data-add-tray-cancel]')) {
        e.preventDefault();
        e.stopPropagation();
        S.closeAddAccountTray();
        return;
      }

      const addAcctRemoteBtn = e.target.closest('[data-account-add-remote]');
      if (addAcctRemoteBtn) {
        e.preventDefault();
        e.stopPropagation();
        const hintProv = addAcctRemoteBtn.dataset.accountAddRemote;
        S.openAddAccountTray(hintProv === 'claude' ? 'claude' : hintProv === 'antigravity' ? 'antigravity' : '', {
          preferModal: !addAcctRemoteBtn.closest('#ide-explorer-sidebar')
        });
        return;
      }

      if (e.target.closest('[data-account-details]')) {
        e.preventDefault();
        e.stopPropagation();
        S.openAccountDetailsModal();
        return;
      }

      if (e.target.closest('#acct-details-close') || e.target === $('acct-details-modal')) {
        S.closeAccountDetailsModal();
        return;
      }

      const acctDetailsAct = e.target.closest('[data-acct-details-act]');
      if (acctDetailsAct) {
        e.preventDefault();
        e.stopPropagation();
        const act = acctDetailsAct.dataset.acctDetailsAct;
        if (act === 'refresh') {
          const targetDeviceId = S.resolveLiveAccountHostForAdd()?.id || (prefs.selectedDeviceFilter && prefs.selectedDeviceFilter !== 'all' ? prefs.selectedDeviceFilter : '');
          await S.dispatchRemoteCommand({
            type: 'sessionAction',
            action: 'accountRefresh',
            subAction: 'accountRefresh',
            ...(targetDeviceId ? { targetDeviceId } : {})
          }).catch(() => {});
          S.syncData({ toast: false });
          showToast('↻ Refreshing quotas…');
        } else if (act === 'add') {
          S.closeAccountDetailsModal();
          S.openAddAccountTray('', { preferModal: true });
        }
        return;
      }

      const pendingLoginBtn = e.target.closest('[data-pending-login-act]');
      if (pendingLoginBtn) {
        e.preventDefault();
        e.stopPropagation();
        const pAct = pendingLoginBtn.dataset.pendingLoginAct;
        const pl = appState?.pendingAccountLogin;
        if (pAct === 'cancel') {
          const targetDeviceId = pl?.hostId || S.resolveLiveAccountHostForAdd()?.id || (prefs.selectedDeviceFilter && prefs.selectedDeviceFilter !== 'all' ? prefs.selectedDeviceFilter : '');
          await S.dispatchRemoteCommand({
            type: 'sessionAction',
            action: 'accountSignInCancel',
            subAction: 'accountSignInCancel',
            liveOnly: true,
            provider: pl?.provider || '',
            ...(targetDeviceId ? { targetDeviceId } : {})
          }).catch(() => {});
          if (appState) appState.pendingAccountLogin = null;
          for (const d of Array.isArray(appState?.devices) ? appState.devices : []) {
            if (d?.hostHealth?.pendingAccountLogin && (!targetDeviceId || d.id === targetDeviceId)) {
              d.hostHealth.pendingAccountLogin = null;
            }
          }
          for (const [devId, snap] of S.hostSnapshotsByDevice.entries()) {
            if (!snap || (targetDeviceId && devId !== targetDeviceId)) continue;
            if (snap.pendingAccountLogin) snap.pendingAccountLogin = null;
            if (snap.hostHealth?.pendingAccountLogin) snap.hostHealth.pendingAccountLogin = null;
          }
          for (const d of S.fleetDevicesMap.values()) {
            if (d?.hostHealth?.pendingAccountLogin && (!targetDeviceId || d.id === targetDeviceId)) {
              d.hostHealth.pendingAccountLogin = null;
            }
          }
          S.persistCache();
          S.renderIdePendingLoginBanner();
          showToast('Cancelled pending sign-in');
        } else if (pAct === 'resume') {
          const host = S.resolveLiveAccountHostForAdd();
          if (S.acctSignIn) {
            const modal = $('acct-signin-modal');
            if (modal) modal.hidden = false;
            S.renderAccountSignInModal();
          } else if (host && pl) {
            S.acctSignIn = {
              provider: pl.provider === 'claude' ? 'claude' : 'antigravity',
              label: String(pl.label || ''),
              hostId: host.id,
              hostName: host.name || 'the PC',
              phase: 'pending',
              progress: { pending: { ...pl } },
              error: '',
              note: '',
              linkLost: false,
              pollTimer: null
            };
            const modal = $('acct-signin-modal');
            if (modal) {
              const wasHidden = modal.hidden;
              modal.hidden = false;
              if (wasHidden) pushUiHistoryState('acct-signin-modal');
            }
            S.renderAccountSignInModal();
            S.acctSignIn.pollTimer = setInterval(() => S.pollAccountSignIn(S.acctSignIn), 2000);
            S.pollAccountSignIn(S.acctSignIn);
          } else {
            S.openAddAccountTray(pl?.provider || '', { preferModal: true });
          }
        }
        return;
      }

      const hostActBtn = e.target.closest('[data-host-act]');
      if (hostActBtn) {
        e.preventDefault();
        e.stopPropagation();
        const hAct = hostActBtn.dataset.hostAct;
        const targetDeviceId = hostActBtn.dataset.deviceId || '';
        if (hAct === 'checkPcSetup' || hAct === 'reload' || hAct === 'dismissAutoReloadFailure') {
          await S.dispatchRemoteCommand({
            type: 'sessionAction',
            action: hAct,
            subAction: hAct,
            ...(targetDeviceId ? { targetDeviceId } : {})
          }).catch(() => {});
          if (hAct === 'dismissAutoReloadFailure') {
            const clearArFailure = (arObj) => {
              if (!arObj || typeof arObj !== 'object') return;
              arObj.failure = null;
              arObj.canaryFailure = null;
              if (arObj.state === 'failed') {
                arObj.state = arObj.pending || arObj.pendingReload ? 'waiting' : 'idle';
              }
            };
            clearArFailure(appState?.autoReload);
            for (const d of Array.isArray(appState?.devices) ? appState.devices : []) {
              if (!targetDeviceId || d?.id === targetDeviceId) {
                clearArFailure(d?.hostHealth?.autoReload);
              }
            }
            for (const snap of S.hostSnapshotsByDevice.values()) {
              clearArFailure(snap?.autoReload);
              for (const d of Array.isArray(snap?.devices) ? snap.devices : []) {
                if (!targetDeviceId || d?.id === targetDeviceId) {
                  clearArFailure(d?.hostHealth?.autoReload);
                }
              }
            }
            if (targetDeviceId) {
              clearArFailure(S.fleetDevicesMap.get(targetDeviceId)?.hostHealth?.autoReload);
            } else {
              for (const d of S.fleetDevicesMap.values()) {
                clearArFailure(d?.hostHealth?.autoReload);
              }
            }
            S.persistCache();
            S.renderIdeHostHealthCards();
          }
          S.syncData({ toast: false });
          showToast(
            hAct === 'reload'
              ? '↻ Sent window reload to PC'
              : hAct === 'dismissAutoReloadFailure'
                ? 'Dismissed auto-reload alert'
                : '↻ Rechecking PC setup…'
          );
        }
        return;
      }

      if (e.target.closest('[data-toggle-hide-desktop]')) {
        e.preventDefault();
        e.stopPropagation();
        await setHideClaudeDesktopRemote(!isClaudeDesktopHidden());
        return;
      }

      const grpCtxBtn = e.target.closest('[data-group-ctx-menu]');
      if (grpCtxBtn) {
        e.preventDefault();
        e.stopPropagation();
        const rect = grpCtxBtn.getBoundingClientRect();
        S.openGroupContextMenu(grpCtxBtn.dataset.groupCtxMenu || '', rect.right - 170, rect.bottom + 4);
        return;
      }

      const acctSignInBtn = e.target.closest('[data-acct-signin-act]');
      if (acctSignInBtn) {
        e.preventDefault();
        e.stopPropagation();
        S.handleAccountSignInAct(acctSignInBtn.dataset.acctSigninAct);
        return;
      }
      if (e.target.closest('#acct-signin-close') || e.target === $('acct-signin-modal')) {
        S.closeAccountSignInModal();
        return;
      }

      const quickNew = e.target.closest('[data-quick-new]');
      if (quickNew) {
        S.enterNewSessionMode(quickNew.dataset.quickNew, { repoPrefix: '' });
        return;
      }

      if (e.target.closest('[data-clear-new-session-group]')) {
        prefs.newSessionGroupId = '';
        saveJson(STORAGE_KEYS.PREFS, prefs);
        S.renderChatView();
        S.renderIdeSidebar();
        return;
      }

      const launchRepo = e.target.closest('[data-launch-repo]');
      if (launchRepo) {
        const repoName = launchRepo.dataset.launchName;
        S.enterNewSessionMode('antigravity', { repoPrefix: repoName });
        const inp = $('composer-input');
        if (inp) {
          inp.value = `[${repoName}] `;
          S.updateComposerActionButton();
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
        S.ensureEditorTabOpen(targetSid);
        setPinnedNav({ threadId: targetSid, provider: targetProv, durationMs: 45000 });
        prefs.selectedThreadId = targetSid;
        prefs.lastReplyThreadId = targetSid;
        prefs.composerMode = 'reply';
        prefs.newSessionGroupId = '';
        saveJson(STORAGE_KEYS.PREFS, prefs);
        if (focusTask) {
          S.openBgTaskDetails.add(`${targetSid}:${focusTask}`);
        }
        markNotificationsCheckedForSession(targetSid);
        switchTab('chat');
        const ctxPop = $('ctx-popover');
        if (ctxPop) ctxPop.hidden = true;
        const bgPop = $('bg-tasks-popover');
        if (bgPop) bgPop.hidden = false;
        S.renderIdeSidebar();
        S.renderChatView(true);
        S.fetchThreadDetail(targetSid, targetProv).then(() => {
          if (focusTask) {
            S.fetchBgTaskLiveLog(targetSid, focusTask, targetProv);
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
          S.renderChatView();
          return;
        }
        if (act === 'refresh-log' && sid && tid) {
          S.openBgTaskDetails.add(`${sid}:${tid}`);
          const out = await S.fetchBgTaskLiveLog(sid, tid, prov);
          showToast(out ? 'Refreshed live task log' : 'Synced latest task snapshot');
          S.fetchThreadDetail(sid, prov).catch(() => {});
          return;
        }
        if (act === 'stop-task' && sid && tid) {
          await S.cancelSingleBgTask(sid, tid, prov);
          return;
        }
        if (act === 'stop-session-all' && sid) {
          await S.cancelAllSessionBgTasks(sid, prov);
          return;
        }
        if (act === 'stop-all-global') {
          const rows = (appState?.rows || []).filter((r) => r && r.id && !r.archived);
          for (const r of rows) {
            const { runningCount } = S.getSessionBackgroundTasks(r, threadsCache[r.id]);
            if (runningCount > 0) {
              await S.cancelAllSessionBgTasks(r.id, r.provider);
            }
          }
          return;
        }
        return;
      }

      const openChat = e.target.closest('[data-open-chat]');
      if (openChat && openChat.dataset.openChat) {
        clearPinnedNav();
        S.ensureEditorTabOpen(openChat.dataset.openChat);
        prefs.selectedThreadId = openChat.dataset.openChat;
        prefs.lastReplyThreadId = openChat.dataset.openChat;
        prefs.composerMode = 'reply';
        saveJson(STORAGE_KEYS.PREFS, prefs);
        markNotificationsCheckedForSession(prefs.selectedThreadId);
        S.emitPrewarmHint(prefs.selectedThreadId, { source: 'open-chat' });
        switchTab('chat');
        S.renderIdeSidebar();
        S.fetchThreadDetail(prefs.selectedThreadId);
        return;
      }

      const groupAct = e.target.closest('[data-group-act]');
      if (groupAct) {
        if (e.target.closest('[contenteditable="true"]')) return;
        e.stopPropagation();
        if (ctxMenuEl && !ctxMenuEl.hidden && groupAct.closest('#ide-context-menu')) {
          S.closeIdeContextMenu();
        }
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
          const attrExpanded = groupAct.getAttribute('aria-expanded');
          const cur =
            attrExpanded === 'false' || attrExpanded === 'true'
              ? attrExpanded === 'false'
              : S.isSessionGroupCollapsed(gId, Boolean(grpObj?.collapsed));
          const next = !cur;
          prefs.collapsedSessionGroups[gId] = next;
          if (grpObj) grpObj.collapsed = next;
          saveJson(STORAGE_KEYS.PREFS, prefs);
          S.persistCache();
          S.renderSessionsView();
          S.renderIdeSidebar();
          if (gId !== 'ungrouped' && gId !== 'archived') {
            S.dispatchRemoteCommand({
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
          S.noteGroupOverride(newId, { op: 'create', name: cleanName });
          if (appState) {
            appState.groups = [...(appState.groups || []), { id: newId, name: cleanName, collapsed: false }];
            S.persistCache();
            S.renderSessionsView();
            S.renderIdeSidebar();
          }
          await S.dispatchRemoteCommand({
            type: 'sessionAction',
            action: 'groupCreate',
            subAction: 'groupCreate',
            group: newId,
            name: cleanName
          });
          showToast(`Created group "${cleanName}"`);
          return;
        }
        if (act === 'rename' && gId) {
          if (S.beginIdeInlineRename('group', gId)) return;
          const nextName = prompt('Rename session group:', gName || '');
          if (!nextName || !nextName.trim()) return;
          const clean = nextName.trim();
          S.noteGroupOverride(gId, { op: 'rename', name: clean });
          const grpObj = (appState?.groups || []).find((g) => g.id === gId);
          if (grpObj) {
            grpObj.name = clean;
            S.persistCache();
            S.renderSessionsView();
            S.renderIdeSidebar();
          }
          await S.dispatchRemoteCommand({
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
          S.noteGroupOverride(gId, { op: 'delete', name: victimName });
          if (prefs.newSessionGroupId === gId) {
            prefs.newSessionGroupId = '';
            saveJson(STORAGE_KEYS.PREFS, prefs);
          }
          if (S.pendingNewSessionBind && S.pendingNewSessionBind.groupId === gId) {
            S.pendingNewSessionBind.groupId = '';
          }
          for (const [, ov] of S.pendingRowOverrides.entries()) {
            if (ov && ov.group === gId) {
              ov.group = '';
            }
          }
          if (prefs.collapsedSessionGroups && typeof prefs.collapsedSessionGroups === 'object') {
            delete prefs.collapsedSessionGroups[gId];
            saveJson(STORAGE_KEYS.PREFS, prefs);
          }
          if (appState) {
            appState.groups = (appState.groups || []).filter((g) => g.id !== gId);
            for (const r of appState.rows || []) {
              if (r.group === gId) {
                r.group = '';
                S.noteRowOverride(r.id, { group: '' });
              }
            }
            S.persistCache();
            S.renderSessionsView();
            S.renderIdeSidebar();
            if (S.isNewSessionMode()) S.renderChatView();
          }
          await S.dispatchRemoteCommand({
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
          S.enterNewSessionMode(
            S.hasSignedInProviderRemote('antigravity') ? 'antigravity' : 'claude',
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
                !isRowPinned(r) &&
                (!r.group || !groupIds.has(r.group)) &&
                !S.isSessionOpenTab(r) &&
                r.status !== 'working' &&
                r.status !== 'waiting' &&
                !r.unread
            )
            .map((r) => r.id);
          if (!closedIds.length) return;
          for (const r of appState?.rows || []) {
            if (closedIds.includes(r.id)) {
              r.archived = true;
              S.noteRowOverride(r.id, { archived: true });
            }
          }
          S.removeEditorTabIds(closedIds, true);
          S.persistCache();
          renderAll();
          await S.dispatchRemoteCommand({
            type: 'sessionAction',
            action: 'archive',
            subAction: 'archive',
            ids: closedIds,
            value: true
          });
          showToast(`Archived ${closedIds.length} closed sessions`);
          return;
        }
        if (act === 'unarchive-all') {
          const archivedIds = (appState?.rows || [])
            .filter((r) => r && r.id && r.archived)
            .map((r) => r.id);
          if (!archivedIds.length) return;
          for (const r of appState?.rows || []) {
            if (archivedIds.includes(r.id)) {
              r.archived = false;
              S.noteRowOverride(r.id, { archived: false });
            }
          }
          S.persistCache();
          renderAll();
          await S.dispatchRemoteCommand({
            type: 'sessionAction',
            action: 'archive',
            subAction: 'archive',
            ids: archivedIds,
            value: false
          });
          showToast(`Restored ${archivedIds.length} archived sessions`);
          return;
        }
        return;
      }

      const sessAct = e.target.closest('[data-sess-act]');
      if (sessAct) {
        e.stopPropagation();
        if (ctxMenuEl && !ctxMenuEl.hidden && sessAct.closest('#ide-context-menu')) {
          S.closeIdeContextMenu();
        }
        const action = sessAct.dataset.sessAct;
        const id = sessAct.dataset.id;
        const val = sessAct.dataset.val === 'true';
        if (action === 'stop' && id) {
          await S.stopActiveSession(id);
          return;
        }
        if (action === 'pin' && id) {
          const forceVal = sessAct.dataset.val !== undefined ? val : undefined;
          await S.toggleSessionPin(id, forceVal);
          return;
        }
        const targetRow = (appState?.rows || []).find((r) => r.id === id);
        if (action === 'group-remove' && targetRow) {
          const prevGrp = targetRow.group || '';
          targetRow.group = '';
          S.noteRowOverride(id, { group: '' });
          S.persistCache();
          renderAll();
          await S.dispatchRemoteCommand({
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
            S.noteRowOverride(id, { group: '' });
            S.persistCache();
            renderAll();
            await S.dispatchRemoteCommand({
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
            S.noteRowOverride(id, { group: matchedGrp.id });
            if (prefs.collapsedSessionGroups) {
              prefs.collapsedSessionGroups[matchedGrp.id] = false;
              saveJson(STORAGE_KEYS.PREFS, prefs);
            }
            S.persistCache();
            renderAll();
            await S.dispatchRemoteCommand({
              type: 'sessionAction',
              action: 'groupAdd',
              subAction: 'groupAdd',
              id,
              ids: [id],
              group: matchedGrp.id
            });
            showToast(`Moved to "${matchedGrp.name}"`);
          } else {
            const newId = `grp-${Date.now().toString(36)}`;
            S.noteGroupOverride(newId, { op: 'create', name: clean });
            S.noteRowOverride(id, { group: newId });
            if (appState) {
              appState.groups = [...groups, { id: newId, name: clean, collapsed: false }];
            }
            targetRow.group = newId;
            S.persistCache();
            renderAll();
            await S.dispatchRemoteCommand({
              type: 'sessionAction',
              action: 'groupCreate',
              subAction: 'groupCreate',
              id,
              ids: [id],
              group: newId,
              name: clean
            });
            showToast(`Created "${clean}" & moved session`);
          }
          return;
        }
        if (targetRow) {
          if (action === 'archive') {
            targetRow.archived = val;
            if (val) {
              const arcTs = Date.now();
              targetRow.group = '';
              targetRow.pinned = false;
              targetRow.pinnedAt = 0;
              targetRow.pinUpdatedAt = arcTs;
              S.noteRowOverride(id, {
                archived: true,
                group: '',
                pinned: false,
                pinnedAt: 0,
                pinUpdatedAt: arcTs
              });
              markNotificationsCheckedForSession(id);
              S.removeEditorTabIds([id], true);
            } else {
              const unarcTs = Math.max(Number(targetRow.pinUpdatedAt || 0), Date.now());
              targetRow.pinned = false;
              targetRow.pinnedAt = 0;
              targetRow.pinUpdatedAt = unarcTs;
              S.noteRowOverride(id, {
                archived: false,
                pinned: false,
                pinnedAt: 0,
                pinUpdatedAt: unarcTs
              });
              S.ensureEditorTabOpen(id);
            }
          }
          if (action === 'unread') {
            targetRow.unread = val;
            if (!val && targetRow.dot === 'unread') targetRow.dot = targetRow.open ? 'idle' : null;
            S.noteRowOverride(id, { unread: val });
            if (!val) markNotificationsCheckedForSession(id);
          }
          S.persistCache();
          renderAll();
        }
        await S.dispatchRemoteCommand({
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
        S.ensureEditorTabOpen(sessCard.dataset.sessionId);
        recordFreqUsage('threads', sessCard.dataset.sessionId);
        setPinnedNav({
          threadId: sessCard.dataset.sessionId,
          provider: sessCard.dataset.sessionProv || '',
          durationMs: 45000
        });
        prefs.selectedThreadId = sessCard.dataset.sessionId;
        prefs.lastReplyThreadId = sessCard.dataset.sessionId;
        prefs.composerMode = 'reply';
        prefs.newSessionGroupId = '';
        saveJson(STORAGE_KEYS.PREFS, prefs);
        markNotificationsCheckedForSession(prefs.selectedThreadId);
        switchTab('chat');
        S.renderIdeSidebar();
        S.fetchThreadDetail(prefs.selectedThreadId, sessCard.dataset.sessionProv);
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
          S.persistCache();
          renderAll();
        }
        const approveRes = await S.dispatchRemoteCommand({
          type: 'approve',
          decision,
          approvalId: appId,
          sessionId: sessId,
          provider: approveBtn.dataset.prov,
          selector: approveBtn.dataset.sel,
          label: approveBtn.dataset.lbl
        });
        // The PC says when an answer did not take effect (the request was already answered, or is gone):
        // say that, and reload the list, instead of reporting an approval that did nothing.
        const approveReply = S.readDirectPcReply(approveRes);
        if (approveReply.answered && approveReply.reply.resolved === false) {
          showToast(String(approveReply.reply.error || 'That request was no longer waiting for an answer.'));
          setTimeout(() => S.syncData(), 300);
        } else {
          showToast(decision === 'approve' ? '✓ Approved remote step' : '✕ Denied remote step');
        }
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
        S.renderPulseView();
        S.renderSessionsView();
        S.renderIdeSidebar();
        if (prefs.activeTab === 'chat') S.renderChatView();
        return;
      }

      if (e.target.closest('#composer-direct-toggle')) {
        prefs.composerDirectStream = !(prefs.composerDirectStream !== false);
        saveJson(STORAGE_KEYS.PREFS, prefs);
        S.syncComposerRoutingSelectors(null, S.isNewSessionMode());
        showToast(
          prefs.composerDirectStream
            ? 'Direct CLI Stream enabled (<25ms live tokens, works without VS Code)'
            : 'VS Code IDE Tab dispatch enabled'
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
        S.renderPulseView();
        S.renderSessionsView();
        S.renderIdeSidebar();
        return;
      }

      if (e.target.closest('#btn-empty-sync-now') || e.target.closest('#conn-modal-sync-btn')) {
        await S.syncData({ toast: true });
        return;
      }

      if (e.target.closest('#mobile-conn-pill') || e.target.closest('#rail-conn-btn')) {
        S.openConnModal();
        S.syncData().catch(() => {});
        return;
      }

      if (e.target.closest('#conn-modal-close') || e.target === $('conn-modal')) {
        S.closeConnModal();
        return;
      }

      if (e.target.closest('#notif-modal-close') || e.target === $('notif-modal')) {
        S.closeNotifModal();
        return;
      }

      if (e.target === $('cmd-modal')) {
        S.closeCommandPalette();
        return;
      }

      const provSeg = e.target.closest('#sess-provider-seg [data-prov]');
      if (provSeg) {
        prefs.sessProvider = provSeg.dataset.prov;
        saveJson(STORAGE_KEYS.PREFS, prefs);
        S.renderSessionsView();
        return;
      }

      const statusChip = e.target.closest('#sess-status-chips [data-status-filter]');
      if (statusChip) {
        prefs.sessStatus = statusChip.dataset.statusFilter;
        saveJson(STORAGE_KEYS.PREFS, prefs);
        S.renderSessionsView();
        return;
      }

      const compModeBtn = e.target.closest('[data-comp-mode]');
      if (compModeBtn) {
        const nextMode = compModeBtn.dataset.compMode;
        if (nextMode === 'new-antigravity') {
          S.enterNewSessionMode('antigravity');
        } else if (nextMode === 'new-claude') {
          S.enterNewSessionMode('claude');
        } else {
          S.exitNewSessionModeToReply();
        }
        return;
      }

      const slashChip = e.target.closest('[data-insert-prompt]');
      if (slashChip) {
        const inp = $('composer-input');
        if (inp) {
          inp.value = slashChip.dataset.insertPrompt;
          S.updateComposerActionButton();
          inp.focus();
        }
        return;
      }

      const repoBtn = e.target.closest('[data-select-repo]');
      if (repoBtn) {
        prefs.selectedRepoId = repoBtn.dataset.selectRepo;
        recordFreqUsage('repos', repoBtn.dataset.selectRepo);
        saveJson(STORAGE_KEYS.PREFS, prefs);
        S.renderWorkspacesView();
        return;
      }

      const telSeg = e.target.closest('#telemetry-prov-seg [data-tel-prov]');
      if (telSeg) {
        prefs.telemetryProv = telSeg.dataset.telProv;
        document.querySelectorAll('#telemetry-prov-seg .seg-btn').forEach((b) =>
          b.classList.toggle('active', b === telSeg)
        );
        S.renderAnalyticsView();
        return;
      }

      if (e.target.closest('#btn-save-edge-relay')) {
        const val = ($('input-edge-relay-url')?.value || '').trim();
        await S.saveEdgeRelayConfig(val);
        showToast(
          val
            ? 'Saved & broadcast Cloudflare Edge WS URL to all hosts'
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

      if (e.target.closest('[data-download-pc-setup]')) {
        await S.downloadPcSetupLauncher();
        return;
      }

      const applyPcSetupBtn = e.target.closest('[data-apply-pc-setup]');
      if (applyPcSetupBtn) {
        e.preventDefault();
        if (!applyPcSetupBtn.disabled) {
          await S.applyPcSetupOnDevice(applyPcSetupBtn.dataset.applyPcSetup);
        }
        return;
      }

      const pwaReadyToggle = e.target.closest('[data-pwa-ready-toggle]');
      if (pwaReadyToggle) {
        e.preventDefault();
        S.pwaReadyCardOpen = pwaReadyToggle.getAttribute('aria-expanded') !== 'true';
        S.renderPulseView();
        return;
      }

      if (e.target.closest('#btn-gen-pair-code')) {
        await S.generateSixDigitPairCode();
        return;
      }

      if (e.target.closest('#btn-claim-six-code')) {
        const val = ($('input-pair-six-code')?.value || '').trim();
        const ok = await S.claimSixDigitPairCode(val);
        if (ok && $('input-pair-six-code')) $('input-pair-six-code').value = '';
        return;
      }

      const quickCodeBtn = e.target.closest('[data-pair-code-submit]');
      if (quickCodeBtn) {
        const card = quickCodeBtn.closest('.quick-pair-card');
        const inp = card?.querySelector('[data-pair-code-input]');
        await S.claimSixDigitPairCode(inp?.value || '');
        return;
      }

      const quickToggleBtn = e.target.closest('[data-pair-toggle-link-box]');
      if (quickToggleBtn) {
        S.showQuickPairLinkFallback = !S.showQuickPairLinkFallback;
        const card = quickToggleBtn.closest('.quick-pair-card');
        const wrap = card?.querySelector('[data-pair-manual-wrap]');
        if (wrap) {
          wrap.hidden = !S.showQuickPairLinkFallback;
          quickToggleBtn.textContent = S.showQuickPairLinkFallback ? 'Hide Link Box' : 'Type / Paste Manually';
          if (S.showQuickPairLinkFallback) {
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
            await S.claimSixDigitPairCode(onlyDigits);
            return;
          }
          const parsedClip = decodePairTokenString(clipText);
          if (parsedClip) {
            await S.finalizeInteractivePairSuccess(parsedClip);
            return;
          }
        }
        S.showQuickPairLinkFallback = true;
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
            ? 'Clipboard did not contain a #pair= link: paste it below'
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
          await S.claimSixDigitPairCode(onlyDigits);
          return;
        }
        const parsed = decodePairTokenString(raw);
        if (!parsed) {
          showToast('Invalid #pair= URL or Access Key');
          return;
        }
        await S.finalizeInteractivePairSuccess(parsed);
        return;
      }

      if (e.target.closest('#btn-copy-mobile-pair')) {
        const info = await S.fetchPairingInfoFromBridge();
        let pairUrl = info?.pairUrl || info?.mobilePairUrl || '';
        if (!pairUrl) {
          S.refreshCloudConfig();
          const tok = encodePairTokenString({
            cloudUrl: S.cloudCfg.url,
            cloudKey: S.cloudCfg.key,
            edgeAccessKey: S.cloudCfg.edgeAccessKey,
            edgeRelayUrl: prefs.edgeRelayUrl || S.discoveredEdgeUrl,
            port: S.cloudCfg.port
          });
          if (tok) pairUrl = `https://theo.husseinbdeir.workers.dev/#pair=${tok}`;
        }
        if (!pairUrl) {
          showToast('Open Settings on your paired PC (http://127.0.0.1:4318) first to copy the Pair URL');
          return;
        }
        try {
          await navigator.clipboard.writeText(pairUrl);
          showToast('Copied 1-Tap Mobile Pairing URL (secret stays in #hash fragment)');
        } catch {
          prompt('Open this 1-Tap Pairing URL on your phone:', pairUrl);
        }
        return;
      }

      if (e.target.closest('#btn-copy-pc-install')) {
        const info = await S.fetchPairingInfoFromBridge();
        let cmd = info?.workstationCmd || info?.workstationBootstrapPs1 || '';
        if (!cmd) {
          S.refreshCloudConfig();
          const tok = encodePairTokenString({
            cloudUrl: S.cloudCfg.url,
            cloudKey: S.cloudCfg.key,
            edgeAccessKey: S.cloudCfg.edgeAccessKey,
            edgeRelayUrl: prefs.edgeRelayUrl || S.discoveredEdgeUrl,
            port: S.cloudCfg.port
          });
          cmd = tok
            ? `$env:THEO_PAIR_TOKEN='${tok}'; irm https://theo.husseinbdeir.workers.dev/install.ps1 | iex`
            : `irm https://theo.husseinbdeir.workers.dev/install.ps1 | iex`;
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
          const ok = await S.claimSixDigitPairCode(onlyDigits);
          if (ok && $('input-pair-token')) $('input-pair-token').value = '';
          return;
        }
        const parsed = decodePairTokenString(raw);
        if (!parsed) {
          showToast('Invalid Pair URL, 6-Digit Code, or Access Key');
          return;
        }
        if ($('input-pair-token')) $('input-pair-token').value = '';
        await S.finalizeInteractivePairSuccess(parsed);
        return;
      }

      if (e.target.closest('#btn-save-bridge')) {
        const val = ($('input-custom-bridge')?.value || '').trim();
        prefs.customBridgeUrl = val;
        saveJson(STORAGE_KEYS.PREFS, prefs);
        S.localBridgeBase = '';
        await S.syncData({ toast: true });
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
        S.renderAnalyticsView();
        return;
      }

      const removeAttachBtn = e.target.closest('[data-remove-attach]');
      if (removeAttachBtn) {
        const rmId = removeAttachBtn.dataset.removeAttach;
        S.composerAttachments = S.composerAttachments.filter((a) => a.id !== rmId);
        S.renderComposerAttachments();
        return;
      }

      const attachRepoBtn = e.target.closest('[data-cmd-attach-repo]');
      if (attachRepoBtn) {
        S.closeCommandPalette();
        const label = attachRepoBtn.dataset.cmdAttachRepo || '';
        const repoPath = attachRepoBtn.dataset.cmdRepoPath || '';
        if (label) {
          S.composerAttachments.push({
            id: `att-repo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            kind: 'repo',
            name: label,
            repoPath,
            sizeLabel: 'workspace'
          });
          S.renderComposerAttachments();
          switchTab('chat');
          showToast(`Attached ${label}`);
          setTimeout(() => $('composer-input')?.focus(), 40);
        }
        return;
      }

      const cmdItem = e.target.closest('[data-cmd-act], [data-cmd-thread]');
      if (cmdItem) {
        S.closeCommandPalette();
        clearPinnedNav();
        recentResumeUntil = 0;
        const act = cmdItem.dataset.cmdAct;
        const tid = cmdItem.dataset.cmdThread;
        if (tid) recordFreqUsage('threads', tid);
        else if (act) {
          recordFreqUsage('threads', act);
          recordFreqUsage('commands', act);
        }
        if (tid) {
          S.ensureEditorTabOpen(tid);
          setPinnedNav({ threadId: tid, durationMs: 45000 });
          prefs.selectedThreadId = tid;
          prefs.lastReplyThreadId = tid;
          prefs.composerMode = 'reply';
          prefs.newSessionGroupId = '';
          saveJson(STORAGE_KEYS.PREFS, prefs);
          switchTab('chat');
          S.renderIdeSidebar();
          S.fetchThreadDetail(tid);
        } else if (act === 'attach-file') {
          switchTab('chat');
          $('composer-file-input')?.click();
        } else if (act === 'pick-repo-file') {
          switchTab('chat');
          S.openRepoFilePicker();
        } else if (act === 'open-command-pwa' || act === 'open-discipline' || act === 'new-payment-hold') {
          window.open('https://planner.husseinbdeir.workers.dev/', '_blank', 'noopener');
        } else if (act === 'open-memory-vault') {
          window.open('https://memory.husseinbdeir.workers.dev/', '_blank', 'noopener');
        } else if (act === 'new-agy') {
          S.enterNewSessionMode('antigravity');
        } else if (act === 'new-claude') {
          S.enterNewSessionMode('claude');
        } else if (act === 'claude-mode-bypass') {
          await setFleetClaudeModeRemote('bypassPermissions');
        } else if (act === 'claude-mode-auto') {
          await setFleetClaudeModeRemote('auto');
        } else if (act === 'claude-mode-plan') {
          await setFleetClaudeModeRemote('plan');
        } else if (act === 'sync') {
          S.syncData({ toast: true });
        } else if (act === 'push-test') {
          await sendTestPush(false);
        } else if (act === 'bgtasks') {
          switchTab('chat');
          const ctxPop = $('ctx-popover');
          if (ctxPop) ctxPop.hidden = true;
          const bgPop = $('bg-tasks-popover');
          if (bgPop) bgPop.hidden = false;
          S.renderChatView();
        } else if (act === 'inspector') {
          if (prefs.activeTab !== 'chat') switchTab('chat');
          S.setInspectorOpen(!prefs.inspectorOpen);
        } else if (act === 'toggle-3p-quota') {
          await setHideThirdPartyQuota(!isThirdPartyQuotaHidden());
        } else if (act === 'palette') {
          const pPop = $('theme-palette-popover');
          if (pPop) {
            syncPalettePickerUi();
            pPop.hidden = false;
            positionPalettePopover($('btn-palette-picker'));
          }
        } else if (act === 'compact') {
          await S.triggerActiveSessionCompact();
        } else if (act === 'pin-chat') {
          await S.toggleSessionPin(prefs.selectedThreadId);
        } else if (act === 'tab-pulse') {
          switchTab('pulse');
        } else if (act === 'tab-sessions') {
          switchTab('sessions');
        } else if (act === 'tab-workspaces') {
          switchTab('workspaces');
        } else if (act === 'tab-analytics') {
          switchTab('analytics');
        } else if (act === 'theme') {
          applyTheme(prefs.theme === 'dark' ? 'light' : 'dark', true);
        }
      }
    });

    // Inline Account Label & Add-Account Tray Forms + Drag-and-Drop Reorder
    document.addEventListener('submit', async (e) => {
      if (isPinLocked()) return;
      const acctForm = e.target.closest?.('[data-acct-label-form]');
      if (acctForm) {
        e.preventDefault();
        const accountId = acctForm.dataset.acctLabelForm || '';
        const provider = acctForm.dataset.acctProv === 'claude' ? 'claude' : 'antigravity';
        const inp = acctForm.querySelector('.ide-acct-inline-edit');
        const cleanLabel = String(inp?.value || '').trim();
        S.activeInlineAcctEdit = null;
        const provList = appState?.providers?.[provider]?.accounts;
        if (Array.isArray(provList) && accountId) {
          const item = provList.find((x) => x.id === accountId);
          if (item) {
            item.nickname = cleanLabel;
            if (item.account) item.account.nickname = cleanLabel;
          }
          S.persistCache();
        }
        S.renderPulseView();
        S.renderIdeSidebar();
        if (accountId) {
          await S.dispatchRemoteCommand({
            type: 'sessionAction',
            action: 'accountLabel',
            subAction: 'accountLabel',
            accountId,
            provider,
            label: cleanLabel,
            prompt: false
          }).catch(() => {});
          showToast(cleanLabel ? `🏷️ Saved label "${cleanLabel}"` : 'Cleared account label');
        }
        return;
      }
      if (e.target.closest?.('[data-add-acct-form]')) {
        e.preventDefault();
        await S.submitAddAccountTray();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && e.target?.classList?.contains('ide-acct-inline-edit')) {
        e.preventDefault();
        e.stopPropagation();
        const surf = S.activeInlineAcctEdit?.surface || 'sidebar';
        S.activeInlineAcctEdit = null;
        if (surf === 'sidebar') S.renderIdeSidebar();
        else S.renderPulseView();
      }
    });

    // HTML5 Drag & Drop Account Card Reordering across Sidebar & Pulse
    let draggedAcctCardId = '';
    const attachAcctReorderDnd = (container) => {
      if (!container) return;
      container.addEventListener('dragstart', (e) => {
        const card = e.target.closest?.('[data-quota-card-id][draggable="true"]');
        if (!card) return;
        draggedAcctCardId = card.dataset.quotaCardId || '';
        card.classList.add('is-dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', draggedAcctCardId);
        }
      });
      container.addEventListener('dragover', (e) => {
        if (!draggedAcctCardId) return;
        const card = e.target.closest?.('[data-quota-card-id]');
        if (!card || card.dataset.quotaCardId === draggedAcctCardId) return;
        e.preventDefault();
        const rect = card.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        container.querySelectorAll('.drag-over-before, .drag-over-after').forEach((el) => {
          el.classList.remove('drag-over-before', 'drag-over-after');
        });
        card.classList.add(before ? 'drag-over-before' : 'drag-over-after');
      });
      container.addEventListener('drop', async (e) => {
        if (!draggedAcctCardId) return;
        const card = e.target.closest?.('[data-quota-card-id]');
        container.querySelectorAll('.is-dragging, .drag-over-before, .drag-over-after').forEach((el) => {
          el.classList.remove('is-dragging', 'drag-over-before', 'drag-over-after');
        });
        if (!card || !card.dataset.quotaCardId || card.dataset.quotaCardId === draggedAcctCardId) {
          draggedAcctCardId = '';
          return;
        }
        e.preventDefault();
        const targetId = card.dataset.quotaCardId;
        const rect = card.getBoundingClientRect();
        const position = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
        const srcId = draggedAcctCardId;
        draggedAcctCardId = '';
        await S.reorderPulseQuotaCard(srcId, {
          targetAccountId: targetId,
          position,
          provider: srcId.startsWith('claude:') ? 'claude' : 'antigravity'
        });
        S.renderIdeSidebar();
      });
      container.addEventListener('dragend', () => {
        draggedAcctCardId = '';
        container.querySelectorAll('.is-dragging, .drag-over-before, .drag-over-after').forEach((el) => {
          el.classList.remove('is-dragging', 'drag-over-before', 'drag-over-after');
        });
      });
    };
    attachAcctReorderDnd($('ide-sidebar-accounts'));
    attachAcctReorderDnd($('pulse-quota-grid'));

    // Desktop Sidebar Rich Hover Card, Pointer-Hover Order Freeze, Keyboard & Right-Click Context Menu
    const sideTree = $('ide-sidebar-tree');
    if (sideTree) {
      sideTree.addEventListener('pointerenter', (e) => {
        if (e.pointerType !== 'touch') S.idePointerInsideTree = true;
      });
      sideTree.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'touch') S.idePointerInsideTree = true;
      });
      sideTree.addEventListener('pointerleave', () => {
        S.idePointerInsideTree = false;
        S.flushDeferredIdeTreeOrder();
      });
      sideTree.addEventListener('contextmenu', (e) => {
        if (isPinLocked()) return;
        const rowEl = e.target.closest?.('.ide-tree-row[data-ide-open-session]');
        if (rowEl && rowEl.dataset.ideOpenSession) {
          e.preventDefault();
          S.openSessionContextMenu(rowEl.dataset.ideOpenSession, e.clientX, e.clientY);
          return;
        }
        const grpHdr = e.target.closest?.('.ide-tree-group-hdr');
        const grpEl = grpHdr?.closest?.('.ide-tree-group[data-ide-group]');
        const gid = grpEl?.dataset?.ideGroup || '';
        if (gid && gid !== 'ungrouped' && gid !== 'archived') {
          e.preventDefault();
          S.openGroupContextMenu(gid, e.clientX, e.clientY);
        }
      });
      sideTree.addEventListener('keydown', async (e) => {
        if (isPinLocked()) return;
        if (S.activeIdeRename) {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            S.finishIdeInlineRename(true);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            S.finishIdeInlineRename(false);
          }
          return;
        }
        const activeRowOrTarget =
          e.target.closest?.('.ide-tree-row[data-ide-open-session]') ||
          document.activeElement?.closest?.('.ide-tree-row[data-ide-open-session]');
        const activeGrpOrTarget =
          e.target.closest?.('.ide-tree-group-btn[data-group-id]') ||
          document.activeElement?.closest?.('.ide-tree-group-btn[data-group-id]');
        const rowEl = activeRowOrTarget || null;
        const grpBtn = activeGrpOrTarget || null;
        if (e.key === 'F2') {
          e.preventDefault();
          if (rowEl && rowEl.dataset.ideOpenSession) {
            S.beginIdeInlineRename('session', rowEl.dataset.ideOpenSession);
          } else if (grpBtn && grpBtn.dataset.groupId && grpBtn.dataset.groupId !== 'ungrouped' && grpBtn.dataset.groupId !== 'archived') {
            S.beginIdeInlineRename('group', grpBtn.dataset.groupId);
          }
          return;
        }
        if ((e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) && rowEl?.dataset?.ideOpenSession) {
          e.preventDefault();
          const rect = rowEl.getBoundingClientRect();
          S.openSessionContextMenu(rowEl.dataset.ideOpenSession, rect.left + 24, rect.bottom + 2);
          return;
        }
        if (e.key === 'Delete' && rowEl?.dataset?.ideOpenSession && e.target === rowEl) {
          const sid = rowEl.dataset.ideOpenSession;
          const r = (appState?.rows || []).find((x) => x && x.id === sid);
          if (r && !r.archived) {
            e.preventDefault();
            rowEl.querySelector('[data-sess-act="archive"]')?.click();
          }
          return;
        }
        if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && rowEl && e.target === rowEl) {
          e.preventDefault();
          const allVisible = Array.from(sideTree.querySelectorAll('.ide-tree-row[data-ide-open-session]')).filter(
            (n) => !n.closest('.ide-tree-group.collapsed')
          );
          const idx = allVisible.indexOf(rowEl);
          const nextIdx = e.key === 'ArrowDown' ? idx + 1 : idx - 1;
          if (nextIdx >= 0 && nextIdx < allVisible.length) {
            allVisible[nextIdx].focus();
          }
        }
      });
      sideTree.addEventListener('focusout', (e) => {
        if (S.activeIdeRename && e.target === S.activeIdeRename.el) {
          S.finishIdeInlineRename(true);
        }
      });
      sideTree.addEventListener('pointerover', (e) => {
        if (isPinLocked() || e.pointerType === 'touch') return;
        const microTarget = e.target.closest?.('[data-micro-tip]');
        if (microTarget) {
          if (sidebarHoverTimer) {
            clearTimeout(sidebarHoverTimer);
            sidebarHoverTimer = 0;
          }
          const hc = $('ide-hover-card');
          if (hc) hc.hidden = true;
          return;
        }
        const rowEl = e.target.closest?.('.ide-tree-row[data-ide-open-session]');
        if (!rowEl) return;
        if (sidebarHoverTimer) clearTimeout(sidebarHoverTimer);
        sidebarHoverTimer = setTimeout(() => {
          S.showSidebarHoverCard(rowEl);
        }, 200);
      });
      sideTree.addEventListener('pointerout', (e) => {
        const nextRow = e.relatedTarget?.closest?.('.ide-tree-row[data-ide-open-session]');
        const curRow = e.target?.closest?.('.ide-tree-row[data-ide-open-session]');
        if (curRow && curRow !== nextRow) {
          if (sidebarHoverTimer) {
            clearTimeout(sidebarHoverTimer);
            sidebarHoverTimer = 0;
          }
          const hc = $('ide-hover-card');
          if (hc) hc.hidden = true;
        }
      });
      sideTree.addEventListener(
        'scroll',
        () => {
          if (sidebarHoverTimer) {
            clearTimeout(sidebarHoverTimer);
            sidebarHoverTimer = 0;
          }
          const hc = $('ide-hover-card');
          if (hc) hc.hidden = true;
        },
        { passive: true }
      );
    }

    document.addEventListener('pointerover', (e) => {
      if (isPinLocked() || e.pointerType === 'touch') return;
      const microEl = e.target.closest?.('[data-micro-tip]');
      if (!microEl) return;
      if (microEl === ideMicroTipAnchor || microEl === ideMicroTipPendingAnchor) return;
      hideIdeMicroTip();
      ideMicroTipPendingAnchor = microEl;
      ideMicroTipTimer = setTimeout(() => showIdeMicroTip(microEl), 60);
    });
    document.addEventListener('pointerout', (e) => {
      if (!ideMicroTipAnchor && !ideMicroTipPendingAnchor && !ideMicroTipTimer) return;
      const rel = e.relatedTarget;
      const active = ideMicroTipAnchor || ideMicroTipPendingAnchor || e.target?.closest?.('[data-micro-tip]');
      if (active && rel && active.contains?.(rel)) return;
      hideIdeMicroTip();
    });
    document.addEventListener('pointerdown', hideIdeMicroTip, true);
    document.addEventListener('scroll', hideIdeMicroTip, true);
    document.addEventListener('focusin', (e) => {
      const microEl = e.target?.closest?.('[data-micro-tip]');
      if (microEl && e.target.matches?.(':focus-visible')) {
        showIdeMicroTip(microEl);
      }
    });
    document.addEventListener('focusout', hideIdeMicroTip);

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
      syncPalettePickerUi();
      showToast(prefs.sound ? 'Audio chimes enabled' : 'Audio chimes muted');
    });
    $('btn-sync-now')?.addEventListener('click', () => S.syncData({ toast: true }));
    $('mobile-sync-btn')?.addEventListener('click', () => S.syncData({ toast: true }));
    $('btn-refresh-git')?.addEventListener('click', () => S.renderWorkspacesView());

    document.addEventListener('change', (ev) => {
      if (isPinLocked()) return;
      if (ev.target && ev.target.id === 'split-watch-session-select') {
        const nextId = String(ev.target.value || '').trim();
        if (nextId) {
          prefs.splitWatchThreadId = nextId;
          recordFreqUsage('threads', nextId);
          saveJson(STORAGE_KEYS.PREFS, prefs);
          S.emitPrewarmHint(nextId, { source: 'split-watch' });
          S.renderSplitWatchPane();
          S.fetchThreadDetail(nextId).catch(() => {});
        }
      }
    });

    // Background Tasks & Context Window Popovers
    $('btn-bg-tasks')?.addEventListener('click', () => {
      const bgPop = $('bg-tasks-popover');
      const ctxPop = $('ctx-popover');
      const modPop = $('model-picker-popover');
      if (!bgPop) return;
      const nextOpen = bgPop.hidden;
      bgPop.hidden = !nextOpen;
      if (nextOpen) {
        if (ctxPop) ctxPop.hidden = true;
        if (modPop) modPop.hidden = true;
        S.modelPickerAdjustEffortOpen = false;
        $('composer-model-btn')?.setAttribute('aria-expanded', 'false');
      }
      S.renderChatView();
      if (nextOpen && prefs.selectedThreadId && !S.isNewSessionMode()) {
        S.fetchThreadDetail(prefs.selectedThreadId, pinnedNavProvider || '').catch(() => {});
      }
    });
    $('btn-close-bgtasks')?.addEventListener('click', () => {
      const bgPop = $('bg-tasks-popover');
      if (bgPop) bgPop.hidden = true;
      $('btn-bg-tasks')?.classList.remove('active');
      $('btn-bg-tasks')?.setAttribute('aria-expanded', 'false');
    });
    $('btn-refresh-bgtasks')?.addEventListener('click', async () => {
      if (!prefs.selectedThreadId || S.isNewSessionMode()) return;
      const activeRow = (appState?.rows || []).find((r) => r.id === prefs.selectedThreadId);
      const prov = activeRow?.provider || pinnedNavProvider || 'antigravity';
      await S.fetchThreadDetail(prefs.selectedThreadId, prov);
      for (const key of S.openBgTaskDetails) {
        if (key.startsWith(`${prefs.selectedThreadId}:`)) {
          const tid = key.slice(prefs.selectedThreadId.length + 1);
          await S.fetchBgTaskLiveLog(prefs.selectedThreadId, tid, prov);
        }
      }
      showToast('Refreshed background tasks & logs');
    });
    $('btn-stop-all-bgtasks')?.addEventListener('click', async () => {
      if (!prefs.selectedThreadId || S.isNewSessionMode()) return;
      const activeRow = (appState?.rows || []).find((r) => r.id === prefs.selectedThreadId);
      await S.cancelAllSessionBgTasks(prefs.selectedThreadId, activeRow?.provider || 'antigravity');
    });
    $('chat-stream')?.addEventListener(
      'toggle',
      (ev) => {
        const det = ev.target;
        if (!det || det.tagName !== 'DETAILS' || !det.dataset?.chatDetailKey) return;
        if (isPinLocked()) {
          det.open = det.dataset.renderedOpen === '1';
          return;
        }
        const key = det.dataset.chatDetailKey;
        const openMap = S.getThreadOpenDetailsMap(prefs.selectedThreadId, false);
        const renderedOpen = det.dataset.renderedOpen === '1';
        if (det.open === renderedOpen && !openMap?.has(key)) return;
        det.dataset.renderedOpen = det.open ? '1' : '0';
        const targetMap = openMap || S.getThreadOpenDetailsMap(prefs.selectedThreadId, true);
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
        if (isPinLocked()) {
          det.open = false;
          return;
        }
        const key = det.dataset.bgDetailKey;
        if (det.open) {
          S.openBgTaskDetails.add(key);
          const sid = det.dataset.sessId;
          const tid = det.dataset.taskId;
          const prov = det.dataset.prov || '';
          if (sid && tid) {
            S.fetchBgTaskLiveLog(sid, tid, prov).catch(() => {});
          }
        } else {
          S.openBgTaskDetails.delete(key);
        }
      },
      true
    );

    $('btn-ctx-window')?.addEventListener('click', () => {
      const pop = $('ctx-popover');
      const bgPop = $('bg-tasks-popover');
      const modPop = $('model-picker-popover');
      if (pop) {
        pop.hidden = !pop.hidden;
        if (!pop.hidden) {
          if (bgPop) bgPop.hidden = true;
          if (modPop) modPop.hidden = true;
          S.modelPickerAdjustEffortOpen = false;
          $('composer-model-btn')?.setAttribute('aria-expanded', 'false');
        }
      }
    });
    $('btn-close-ctx')?.addEventListener('click', () => {
      const pop = $('ctx-popover');
      if (pop) pop.hidden = true;
    });
    $('btn-ctx-compact')?.addEventListener('click', async () => {
      await S.triggerActiveSessionCompact();
    });

    $('btn-chat-open-vscode')?.addEventListener('click', async () => {
      const moreMenu = $('chat-more-menu');
      if (moreMenu) moreMenu.hidden = true;
      $('btn-chat-more')?.setAttribute('aria-expanded', 'false');
      const isNewDraft = S.isNewSessionMode();
      const activeRow = isNewDraft ? null : (appState?.rows || []).find((r) => r.id === prefs.selectedThreadId) || null;
      if (!S.isHostVsCodeOpenForSession(activeRow, isNewDraft)) {
        showToast('VS Code is not open on that PC. The session is fully usable here in THEO.');
        return;
      }
      if (isNewDraft) {
        const prov = prefs.composerMode === 'new-claude' ? 'claude' : 'antigravity';
        const newTabRes = await S.dispatchRemoteCommand({
          type: 'sessionAction',
          action: 'openNew',
          subAction: 'openNew',
          id: '',
          threadId: '',
          provider: prov,
          group: prefs.newSessionGroupId || ''
        });
        showToast(
          S.describeVsCodeOpenReply(
            newTabRes,
            `Opened new blank ${prov === 'claude' ? 'Claude Code' : 'Antigravity'} tab in VS Code`
          )
        );
        return;
      }
      const openTabRes = await S.dispatchRemoteCommand({
        type: 'sessionAction',
        action: 'open',
        subAction: 'open',
        id: prefs.selectedThreadId,
        provider: activeRow?.provider || 'antigravity'
      });
      showToast(S.describeVsCodeOpenReply(openTabRes, 'Opened session tab in VS Code'));
    });

    $('btn-chat-stop')?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await S.stopActiveSession(prefs.selectedThreadId);
    });

    $('composer-send-btn')?.addEventListener('click', async (e) => {
      const sendBtn = $('composer-send-btn');
      if (sendBtn?.classList.contains('is-stop')) {
        e.preventDefault();
        e.stopPropagation();
        await S.stopActiveSession(prefs.selectedThreadId);
      }
    });

    // Inline chat session title rename (header)
    const chatTitleEl = $('chat-session-title');
    chatTitleEl?.addEventListener('dblclick', (e) => {
      if (isPinLocked() || S.isNewSessionMode()) return;
      if (S.activeIdeRename && S.activeIdeRename.kind === 'chat-session') return;
      const tid = S.cleanTargetThreadId(prefs.selectedThreadId);
      if (!tid) return;
      e.preventDefault();
      e.stopPropagation();
      S.beginIdeInlineRename('chat-session', tid);
    });
    chatTitleEl?.addEventListener('keydown', (e) => {
      if (!S.activeIdeRename || S.activeIdeRename.kind !== 'chat-session') return;
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        S.finishIdeInlineRename(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        S.finishIdeInlineRename(false);
      }
    });
    chatTitleEl?.addEventListener('focusout', () => {
      if (S.activeIdeRename && S.activeIdeRename.kind === 'chat-session') {
        S.finishIdeInlineRename(true);
      }
    });

    // Search in Sessions & IDE Explorer Sidebar
    $('sess-search-input')?.addEventListener('input', () => S.renderSessionsView());
    $('ide-sidebar-search')?.addEventListener('input', () => S.renderIdeSidebar());

    // Middle-click to close open editor tab (VS Code parity)
    $('ide-editor-tabs')?.addEventListener('auxclick', (e) => {
      if (isPinLocked() || e.button !== 1) return;
      const tab = e.target.closest('[data-editor-tab-id]');
      if (tab?.dataset.editorTabId) {
        e.preventDefault();
        S.closeEditorTab(tab.dataset.editorTabId);
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
      S.slashPopoverActiveIdx = 0;
      S.updateComposerActionButton();
      S.updateComposerSlashPopover();
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
          await S.handleComposerFiles(files);
        }
      });
    }

    // Composer Multi-Device Host & Repo Selectors (Frequency-First)
    $('composer-device-select')?.addEventListener('change', (e) => {
      const val = e.target.value || 'auto';
      prefs.composerTargetDevice = val;
      if (val !== 'auto') recordFreqUsage('devices', val);
      saveJson(STORAGE_KEYS.PREFS, prefs);
      const dev = S.fleetDevicesMap.get(val);
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
      if (S.isNewSessionMode()) S.renderChatView();
    });

    // Composer File Attachments & @Repo Picker
    $('btn-composer-attach')?.addEventListener('click', () => {
      $('composer-file-input')?.click();
    });
    $('chip-attach-file')?.addEventListener('click', () => {
      $('composer-file-input')?.click();
    });
    $('chip-pick-repo-file')?.addEventListener('click', () => {
      S.openRepoFilePicker();
    });
    $('composer-file-input')?.addEventListener('change', async (e) => {
      const files = e.target.files;
      if (files && files.length) {
        await S.handleComposerFiles(files);
        e.target.value = '';
      }
    });
    $('composer-input')?.addEventListener('paste', async (e) => {
      const items = Array.from(e.clipboardData?.items || []);
      const fileItems = items.filter((it) => it.kind === 'file');
      if (fileItems.length > 0) {
        const files = fileItems.map((it) => it.getAsFile()).filter(Boolean);
        if (files.length > 0) {
          await S.handleComposerFiles(files);
        }
      }
    });
    $('composer-input')?.addEventListener('input', (e) => {
      const el = e.target;
      el.style.height = 'auto';
      el.style.height = `${Math.min(140, el.scrollHeight)}px`;
      S.slashPopoverActiveIdx = 0;
      S.updateComposerActionButton();
      S.updateComposerSlashPopover();
    });
    $('composer-input')?.addEventListener('click', () => {
      S.updateComposerSlashPopover();
    });

    // Composer Form Submit
    $('chat-composer-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (isPinLocked()) return;
      await S.submitComposerPrompt();
    });

    $('composer-input')?.addEventListener('keydown', async (e) => {
      if (isPinLocked()) return;
      const pop = $('composer-slash-popover');
      const popOpen = Boolean(pop && !pop.hidden && S.slashPopoverItems.length > 0);
      if (popOpen) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const len = S.slashPopoverItems.length;
          S.slashPopoverActiveIdx =
            e.key === 'ArrowDown'
              ? (S.slashPopoverActiveIdx + 1) % len
              : (S.slashPopoverActiveIdx - 1 + len) % len;
          pop.querySelectorAll('.slash-pop-item').forEach((btn, idx) => {
            const isAct = idx === S.slashPopoverActiveIdx;
            btn.classList.toggle('active', isAct);
            btn.setAttribute('aria-selected', isAct ? 'true' : 'false');
            if (isAct) btn.scrollIntoView({ block: 'nearest' });
          });
          return;
        }
        if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
          e.preventDefault();
          await S.applySlashPopoverSelection(S.slashPopoverActiveIdx);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          S.closeSlashPopover();
          return;
        }
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        await S.submitComposerPrompt();
      }
    });

    // Command Palette & IDE Sidebar shortcuts
    $('open-cmd-palette')?.addEventListener('click', S.openCommandPalette);
    $('mobile-cmd-btn')?.addEventListener('click', S.openCommandPalette);
    $('rail-vault-btn')?.addEventListener('click', (e) => {
      if (isPinLocked()) e.preventDefault();
    });
    $('mobile-vault-btn')?.addEventListener('click', (e) => {
      if (isPinLocked()) e.preventDefault();
    });
    $('cmd-close')?.addEventListener('click', S.closeCommandPalette);
    $('cmd-input')?.addEventListener('input', (e) => S.renderCommandPaletteResults(e.target.value));
    window.addEventListener('keydown', (e) => {
      if (isPinLocked()) return;
      if (S.activeIdeRename && S.activeIdeRename.kind === 'chat-session') {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          S.finishIdeInlineRename(true);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          S.finishIdeInlineRename(false);
          return;
        }
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        S.openCommandPalette();
      } else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleIdeSidebar();
      } else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        if (prefs.activeTab !== 'chat') switchTab('chat');
        S.setInspectorOpen(!prefs.inspectorOpen);
      } else if (
        e.key === 'F2' &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        prefs.activeTab === 'chat' &&
        !S.isNewSessionMode() &&
        S.cleanTargetThreadId(prefs.selectedThreadId) &&
        !e.target?.closest?.('#ide-sidebar-tree')
      ) {
        const ae = document.activeElement;
        const inField = Boolean(
          ae &&
            (ae.tagName === 'INPUT' ||
              ae.tagName === 'TEXTAREA' ||
              ae.tagName === 'SELECT' ||
              ae.isContentEditable)
        );
        const anyModalOpen = Boolean(
          ($('cmd-modal') && !$('cmd-modal').hidden) ||
            ($('conn-modal') && !$('conn-modal').hidden) ||
            ($('notif-modal') && !$('notif-modal').hidden) ||
            ($('acct-signin-modal') && !$('acct-signin-modal').hidden) ||
            ($('acct-details-modal') && !$('acct-details-modal').hidden)
        );
        if (!inField && !anyModalOpen) {
          e.preventDefault();
          S.beginIdeInlineRename('chat-session', prefs.selectedThreadId);
        }
      } else if (
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        /^[1-9]$/.test(e.key) &&
        prefs.activeTab === 'chat'
      ) {
        const ae = document.activeElement;
        const inField = Boolean(
          ae &&
            (ae.tagName === 'INPUT' ||
              ae.tagName === 'TEXTAREA' ||
              ae.tagName === 'SELECT' ||
              ae.isContentEditable)
        );
        const anyModalOpen = Boolean(
          ($('cmd-modal') && !$('cmd-modal').hidden) ||
            ($('conn-modal') && !$('conn-modal').hidden) ||
            ($('notif-modal') && !$('notif-modal').hidden) ||
            ($('acct-signin-modal') && !$('acct-signin-modal').hidden) ||
            ($('acct-details-modal') && !$('acct-details-modal').hidden)
        );
        const dock = $('chat-question-dock');
        if (!inField && !anyModalOpen && dock && !dock.hidden && getComputedStyle(dock).display !== 'none') {
          const optBtns = dock.querySelectorAll('[data-q-opt-toggle]');
          const targetOpt = optBtns[Number(e.key) - 1];
          if (targetOpt) {
            e.preventDefault();
            targetOpt.click();
          }
        }
      } else if (e.key === 'Enter' && !e.shiftKey) {
        const t = e.target;
        if (t && t.matches && t.matches('[data-pair-code-input], #input-pair-six-code')) {
          e.preventDefault();
          S.claimSixDigitPairCode(t.value || '');
        } else if (t && t.matches && t.matches('[data-pair-link-input]')) {
          e.preventDefault();
          t.closest('.quick-pair-card')?.querySelector('[data-pair-link-submit]')?.click();
        } else if (t && t.id === 'input-pair-token') {
          e.preventDefault();
          $('btn-apply-pair-token')?.click();
        }
      } else if (
        (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
        prefs.inspectorOpen &&
        prefs.inspectorTab === 'files' &&
        prefs.inspectorViewMode !== 'source' &&
        prefs.inspectorViewMode !== 'diff' &&
        S.activeInspectorFileTarget
      ) {
        const ae = document.activeElement;
        const inField = Boolean(
          ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable)
        );
        const parsedCur = S.parsePreviewTargetClient(S.activeInspectorFileTarget);
        const dKind = S.getDeliverableKindClient(parsedCur.filePath);
        if (!inField && (dKind === 'pdf' || dKind === 'pptx')) {
          const sid = String(prefs.selectedThreadId || '').trim();
          const activeRow = (appState?.rows || []).find((r) => r && r.id === sid) || null;
          const wsId = S.resolveSessionWorkspaceContext(activeRow, threadsCache[sid] || null).wsId;
          const cacheKey = `${sid || wsId || 'global'}::${parsedCur.filePath.replace(/\\/g, '/')}`;
          const dlv = S.deliverablePreviewCache.get(cacheKey);
          const total = Math.max(1, Number(dlv?.pageCount || dlv?.slides?.length || 1));
          const delta = e.key === 'ArrowRight' ? 1 : -1;
          const nextP = Math.max(1, Math.min(total, S.activeDeliverablePage + delta));
          if (nextP !== S.activeDeliverablePage) {
            e.preventDefault();
            S.activeDeliverablePage = nextP;
            S.renderChatView(false);
            S.fetchDeliverablePreview(S.activeInspectorFileTarget, activeRow, { page: nextP }).catch(() => {});
          }
        }
      } else if (e.key === 'Escape') {
        closeFloatingUiMenus();
        S.closeSlashPopover();
        S.closeCommandPalette();
        S.closeConnModal();
        S.closeNotifModal();
        if ($('acct-signin-modal') && !$('acct-signin-modal').hidden) {
          S.closeAccountSignInModal();
        }
        if ($('acct-details-modal') && !$('acct-details-modal').hidden) {
          S.closeAccountDetailsModal();
        }
        if (S.addAccountTrayState) {
          S.closeAddAccountTray();
        }
        if (S.activeInlineAcctEdit) {
          const prevSurf = S.activeInlineAcctEdit.surface;
          S.activeInlineAcctEdit = null;
          if (prevSurf === 'sidebar') S.renderIdeSidebar();
          else S.renderPulseView();
        }
        if (S.activeIdeRename) {
          S.finishIdeInlineRename(false);
        }
        if (prefs.inspectorOpen && prefs.inspectorFullStage) {
          prefs.inspectorFullStage = false;
          saveJson(STORAGE_KEYS.PREFS, prefs);
          S.renderChatView(false);
        } else if (
          prefs.inspectorOpen &&
          (window.innerWidth <= 1024 ||
            document.activeElement?.closest?.('#ide-inspector-pane') ||
            $('ide-inspector-pane')?.classList.contains('is-deliverable-wide'))
        ) {
          S.setInspectorOpen(false);
        }
        if (
          prefs.splitWatchOpen &&
          (window.innerWidth <= 900 || document.activeElement?.closest?.('#chat-split-watch-pane'))
        ) {
          prefs.splitWatchOpen = false;
          saveJson(STORAGE_KEYS.PREFS, prefs);
          S.renderSplitWatchPane();
        }
      }
    });

    window.addEventListener('hashchange', () => {
      ingestLocationPairHash(true);
    });

    window.addEventListener('popstate', (ev) => {
      if (isPinLocked()) return;
      const palPop = $('theme-palette-popover');
      const ctxMenu = $('ide-context-menu');
      const chatMoreMenu = $('chat-more-menu');
      const modPop = $('model-picker-popover');
      if ((palPop && !palPop.hidden) || (ctxMenu && !ctxMenu.hidden) || (chatMoreMenu && !chatMoreMenu.hidden) || (modPop && !modPop.hidden)) {
        closeFloatingUiMenus();
        return;
      }
      const cmdModal = $('cmd-modal');
      if (cmdModal && !cmdModal.hidden) {
        S.closeCommandPalette();
        return;
      }
      const connModal = $('conn-modal');
      if (connModal && !connModal.hidden) {
        S.closeConnModal();
        return;
      }
      const acctModal = $('acct-signin-modal');
      if (acctModal && !acctModal.hidden) {
        S.closeAccountSignInModal();
        return;
      }
      const detailsModal = $('acct-details-modal');
      if (detailsModal && !detailsModal.hidden) {
        S.closeAccountDetailsModal();
        return;
      }
      const notifModal = $('notif-modal');
      if (notifModal && !notifModal.hidden) {
        S.closeNotifModal();
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
      if (window.innerWidth <= 1024 && prefs.inspectorOpen) {
        S.setInspectorOpen(false);
        return;
      }
      if (window.innerWidth <= 900 && prefs.splitWatchOpen) {
        prefs.splitWatchOpen = false;
        saveJson(STORAGE_KEYS.PREFS, prefs);
        S.renderSplitWatchPane();
        return;
      }
      const targetTab = ev.state?.theoTab || (window.innerWidth >= 1025 ? 'chat' : 'pulse');
      if (targetTab && targetTab !== prefs.activeTab) {
        suppressHistoryPush = true;
        try {
          switchTab(targetTab);
        } finally {
          suppressHistoryPush = false;
        }
      }
    });

    let deckSwipeStartX = 0;
    let deckSwipeStartY = 0;
    document.addEventListener('touchstart', (e) => {
      if (isPinLocked() || !prefs.inspectorOpen || prefs.inspectorTab !== 'files') return;
      if (S.activeDeliverableDeckMode !== 'single' || !e.target?.closest?.('.insp-deck-stage')) return;
      const t = e.touches && e.touches[0];
      if (!t) return;
      deckSwipeStartX = t.clientX;
      deckSwipeStartY = t.clientY;
    }, { passive: true });
    document.addEventListener('touchend', (e) => {
      if (!deckSwipeStartX) return;
      const t = e.changedTouches && e.changedTouches[0];
      const sx = deckSwipeStartX;
      const sy = deckSwipeStartY;
      deckSwipeStartX = 0;
      deckSwipeStartY = 0;
      if (!t || !prefs.inspectorOpen || prefs.inspectorTab !== 'files' || S.activeDeliverableDeckMode !== 'single') return;
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      const parsedCur = S.parsePreviewTargetClient(S.activeInspectorFileTarget);
      const dKind = S.getDeliverableKindClient(parsedCur.filePath);
      if (dKind !== 'pdf' && dKind !== 'pptx') return;
      const sid = String(prefs.selectedThreadId || '').trim();
      const activeRow = (appState?.rows || []).find((r) => r && r.id === sid) || null;
      const wsId = S.resolveSessionWorkspaceContext(activeRow, threadsCache[sid] || null).wsId;
      const cacheKey = `${sid || wsId || 'global'}::${parsedCur.filePath.replace(/\\/g, '/')}`;
      const dlv = S.deliverablePreviewCache.get(cacheKey);
      const total = Math.max(1, Number(dlv?.pageCount || dlv?.slides?.length || 1));
      const nextP = Math.max(1, Math.min(total, S.activeDeliverablePage + (dx < 0 ? 1 : -1)));
      if (nextP !== S.activeDeliverablePage) {
        S.activeDeliverablePage = nextP;
        S.renderChatView(false);
        S.fetchDeliverablePreview(S.activeInspectorFileTarget, activeRow, { page: nextP }).catch(() => {});
      }
    }, { passive: true });
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
      S.ensureEditorTabOpen(threadId);
      prefs.selectedThreadId = threadId;
      prefs.lastReplyThreadId = threadId;
      prefs.composerMode = 'reply';
      prefs.activeTab = 'chat';
      saveJson(STORAGE_KEYS.PREFS, prefs);
      switchTab('chat');
      renderAll();
      S.fetchThreadDetail(threadId, nav.provider || pinnedNavProvider || '').catch(() => {});
    } else if (reminderId || tab === 'discipline') {
      window.location.href = `https://planner.husseinbdeir.workers.dev/${reminderId ? `?tab=tasks&taskId=${encodeURIComponent(reminderId)}` : ''}`;
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
      if (tab === 'workspaces') {
        // Evening git digest / unsaved-work push: land on the per-PC unsaved list at the top of the tab.
        setTimeout(() => {
          const panel = $('unsaved-work-panel');
          if (panel && !panel.hidden) panel.scrollIntoView({ behavior: 'auto', block: 'start' });
        }, 80);
      }
    }

    S.syncData({ force: true }).catch(() => {});
    return true;
  }

  async function consumePendingNotificationNav(opts = {}) {
    const allowUnseenPush = Boolean(opts && opts.allowUnseenPush);
    const inNewSessionFlow = Boolean(
      S.isNewSessionMode() ||
        String(prefs.selectedThreadId || '').startsWith('draft-new-') ||
        S.pendingNewSessionBind
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
            S.pendingNewSessionBind && Number(S.pendingNewSessionBind.createdAt || 0) > pendingTs
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
    if (S.initialNoSse || location.search.includes('nosse=1')) return;
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      let refreshingSw = false;
      const hadController = Boolean(navigator.serviceWorker.controller);
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || refreshingSw) return;
        refreshingSw = true;
        location.reload();
      });

      navigator.serviceWorker
        .register('sw.js?v=94', { updateViaCache: 'none' })
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
                S.syncData({ force: true });
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
              S.isNewSessionMode() ||
                String(prefs.selectedThreadId || '').startsWith('draft-new-') ||
                S.pendingNewSessionBind
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
          S.syncData({ force: true });
        }
      });
    }
  }

  // Bootstrap
  function init() {
    const storedPrefsSnapshot = loadJson(STORAGE_KEYS.PREFS, null);
    if (isStandalone()) {
      document.documentElement.classList.add('ios-standalone');
    }
    if (bootMigRes) {
      if (!bootMigRes.ok) {
        bootTheoMigrateErrorReason = bootMigRes.reason || 'invalid';
      } else if (isSessionCurrentlyPinLocked()) {
        pendingPinMigratePayload = bootMigRes;
      } else {
        const applied = applyTheoMigrationPayload(bootMigRes);
        if (!applied.ok) {
          bootTheoMigrateErrorReason = applied.reason || 'invalid';
        }
      }
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
    if (bootTheoMigrateErrorReason) {
      showToast(
        bootTheoMigrateErrorReason === 'key-mismatch'
          ? 'Migration skipped: this device is already paired with another key.'
          : `Migration link could not be imported (${bootTheoMigrateErrorReason}). Open THEO on GitHub Pages and tap Move again.`
      );
      bootTheoMigrateErrorReason = '';
    }


    window.addEventListener('focus', () => {
      const hiddenDur = wasAppHiddenAt > 0 ? Date.now() - wasAppHiddenAt : 0;
      if (hiddenDur >= 1500) {
        recentResumeUntil = Date.now() + 25000;
      }
      loadPersonalLedgerFromLocal();
      syncUnreadNotificationsWithSwCache();
      consumePendingNotificationNav({ allowUnseenPush: hiddenDur >= 1500 }).finally(() => {
        renderAll();
        S.syncData({ force: true }).catch(() => {});
      });
    });
    window.addEventListener('pageshow', (ev) => {
      if (ev && ev.persisted) {
        recentResumeUntil = Date.now() + 25000;
        consumePendingNotificationNav({ allowUnseenPush: true });
      }
    });
    window.addEventListener('offline', () => {
      S.updateConnectionBanner();
      if (prefs.activeTab === 'chat') S.renderChatView(false);
    });
    window.addEventListener('online', () => {
      S.updateConnectionBanner();
      if (prefs.activeTab === 'chat') S.renderChatView(false);
    });

    if (appState && typeof appState === 'object') {
      S.storeHostSnapshotEntry(appState, appState?.device?.id || '');
    }
    if (localBootInfo?.device?.id) {
      S.localWsDevice = localBootInfo.device;
      S.updateFleetDevices([{ ...localBootInfo.device, online: true, local: true, lastSeen: Date.now() }]);
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
      S.updateComposerModePills();
    }

    if (threadParam || remParam || tabParam || newParam) {
      try {
        const cleanUrl = location.pathname + (location.hash || '');
        const defaultTab = window.innerWidth >= 1025 ? 'chat' : 'pulse';
        history.replaceState({ theoTab: tabParam || (newParam ? 'chat' : prefs.activeTab || defaultTab), overlay: '' }, '', cleanUrl);
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
        `https://planner.husseinbdeir.workers.dev/${remParam ? `?tab=tasks&taskId=${encodeURIComponent(remParam)}` : ''}`
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
      try {
        history.replaceState({ theoTab: 'chat', overlay: '' }, '');
      } catch {}
      S.fetchThreadDetail(pinnedNavThreadId, pinnedNavProvider || '');
    } else {
      const isDesktopBoot = window.innerWidth >= 1025;
      let startTab =
        tabParam || (prefs.activeTab === 'discipline' ? 'pulse' : prefs.activeTab) || 'pulse';
      if (isDesktopBoot && !prefs.desktopWorkbenchBootV92) {
        prefs.desktopWorkbenchBootV92 = true;
        if (
          !tabParam &&
          (!storedPrefsSnapshot ||
            !storedPrefsSnapshot.activeTab ||
            startTab === 'pulse' ||
            startTab === 'sessions')
        ) {
          startTab = 'chat';
        }
        prefs.activeTab = startTab;
        saveJson(STORAGE_KEYS.PREFS, prefs);
      }
      suppressHistoryPush = true;
      try {
        switchTab(startTab);
      } finally {
        suppressHistoryPush = false;
      }
      try {
        history.replaceState({ theoTab: prefs.activeTab || startTab, overlay: '' }, '');
      } catch {}
    }

    // Clear boot nav lock after initial settle so normal user interactions work freely
    if (hasExplicitBootUrlNav) {
      setTimeout(() => {
        hasExplicitBootUrlNav = false;
      }, 8000);
    }

    if (appState) {
      S.applyAnsweredQuestionOverrides(appState);
    }
    renderAll();
    if (!hasExplicitBootUrlNav && !isHeadlessBrowser) {
      consumePendingNotificationNav({ allowUnseenPush: true });
    }
    if (!isHeadlessBrowser && (prefs.edgeRelayUrl || S.discoveredEdgeUrl)) {
      S.connectEdgeWs(prefs.edgeRelayUrl || S.discoveredEdgeUrl).catch(() => {});
    }
    if (!isHeadlessBrowser) {
      S.syncData();
      if (!S.initialNoSse) {
        setInterval(() => {
          if (document.hidden) return;
          if (!S.localWsAuthed || !S.localWs || S.localWs.readyState !== 1) {
            if (!S.hasAnyPairingCredentials() && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '')) {
              return;
            }
            S.syncData();
          } else {
            S.maybePollCloudClaudeModeBackstop();
          }
        }, 4500);

        setInterval(() => {
          if (document.hidden || prefs.activeTab !== 'chat') return;
          const nowMs = Date.now();
          document.querySelectorAll('#chat-stream [data-live-elapsed-start]').forEach((el) => {
            const startMs = Number(el.dataset.liveElapsedStart || 0);
            if (startMs > 0 && nowMs >= startMs) {
              const sec = Math.max(1, Math.round((nowMs - startMs) / 1000));
              el.textContent =
                sec >= 60
                  ? `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, '0')}s`
                  : `${sec}s`;
            }
          });
          const tid = prefs.selectedThreadId;
          if (
            tid &&
            tid !== '__new__' &&
            !String(tid).startsWith('draft-new-') &&
            S.isSessionActivelyRunning(tid) &&
            nowMs - (S.lastThreadDetailFetchAtById.get(tid) || 0) >= 1650 &&
            nowMs - (S.lastThreadDetailReceivedAtById.get(tid) || 0) >= 1350
          ) {
            S.fetchThreadDetail(tid, pinnedNavProvider || '').catch(() => {});
          }
        }, 1100);
      }
      registerServiceWorker();
    }
  }

  Object.assign(S, {
    renderAll,
    switchTab
  });


  window.__theoTestWs = {
    ...((isHeadlessBrowser || (typeof window !== 'undefined' && window.__THEO_ALLOW_PROBE_MOCK_FETCH))
      ? { buildMigrationUrl: () => S.buildTheoMigrationUrl(), renderSidebar: () => S.renderIdeSidebar() }
      : {}),
    connectLocalWs: S.connectLocalWs,
    connectEdgeWs: S.connectEdgeWs,
    noteRowOverride: S.noteRowOverride,
    emitPrewarmHint: S.emitPrewarmHint,
    resetPrewarmHintCooldowns: () => S.lastPrewarmHintById.clear(),
    getState: () => appState,
    getBaselineRows: (transport = 'local', devId = '') => {
      const sock = transport === 'edge' ? S.edgeWs : S.localWs;
      const m = sock ? S.wsBaselineBySocket.get(sock) : null;
      if (!m) return [];
      const entry = (devId && m.get(devId)) || m.get('__default__') || m.values().next().value;
      return Array.isArray(entry?.snapshot?.rows) ? entry.snapshot.rows.slice() : [];
    },
    disconnectLocal: () => {
      try {
        if (S.localWsReconnectTimer) {
          clearTimeout(S.localWsReconnectTimer);
          S.localWsReconnectTimer = null;
        }
        S.localBridgeBase = '';
        S.localBridgeWsPath = '/ws';
        S.localWs?.close();
      } catch {}
    },
    disconnectAll: () => {
      try {
        if (S.localWsReconnectTimer) {
          clearTimeout(S.localWsReconnectTimer);
          S.localWsReconnectTimer = null;
        }
        if (S.edgeWsReconnectTimer) {
          clearTimeout(S.edgeWsReconnectTimer);
          S.edgeWsReconnectTimer = null;
        }
        S.localBridgeBase = '';
        S.localBridgeWsPath = '/ws';
        S.localWs?.close();
        S.edgeWs?.close();
      } catch {}
      window.__THEO_ALLOW_MOCK_WS = false;
      delete window.__THEO_MOCK_BRIDGE_TOKEN;
    }
  };
init();
})();
