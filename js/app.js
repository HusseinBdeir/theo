(() => {
  'use strict';

  const STORAGE_KEYS = {
    CACHE: 'theo_remote_cache_v3',
    PREFS: 'theo_remote_prefs_v1',
    OUTBOX: 'theo_remote_outbox_v1',
    PIN: 'theo_remote_pin_v1',
    DEVID: 'theo_remote_devid_v1',
    PUSH_HINT: 'theo_remote_pushhint_v1',
    PERSONAL: 'theo_personal_ledger_v1',
    COMMAND: 'theo_command_state_v1',
    CONSUMED_NOTIF: 'theo_remote_consumed_notif_v1'
  };
  const PINNED_NAV_SESSION_KEY = 'theo_pinned_nav_v1';
  const NAV_HANDOFF_CACHE = 'theo-nav-handoff-v1';
  const PENDING_NAV_CACHE_URL = './__theo_pending_nav.json';
  const LAST_PUSH_NAV_CACHE_URL = './__theo_last_push_nav.json';

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

  // ---------- Daily 100-Point Discipline Ledger (5 Do's & 5 Don'ts · Starts at 50%) ----------
  const DAILY_DOS = [
    { id: 'wake', label: 'Waking up early', icon: '☀️', sub: 'Up on time & morning routine', hint: 'Up on time & morning routine' },
    { id: 'work', label: 'Work', icon: '💼', sub: 'Focused executive & ops output', hint: 'Focused executive & ops output' },
    { id: 'skills', label: 'Skills', icon: '🧠', sub: 'Deliberate learning & craft', hint: 'Deliberate learning & craft' },
    { id: 'fitness', label: 'Fitness', icon: '💪', sub: 'Gym, calisthenics, football or padel', hint: 'Gym, calisthenics, football or padel' },
    { id: 'social', label: 'Socializing', icon: '🤝', sub: 'Meaningful connection & presence', hint: 'Meaningful connection & presence' }
  ];

  const DAILY_DONTS = [
    { id: 'games', label: 'Video games', icon: '🎮', sub: '10% held intact when avoided', hint: '10% held intact when avoided' },
    { id: 'series', label: 'Series', icon: '📺', sub: '10% held intact when avoided', hint: '10% held intact when avoided' },
    { id: 'music', label: 'Music', icon: '🎧', sub: '10% held intact when avoided', hint: '10% held intact when avoided' },
    { id: 'socialmedia', label: 'Social media', icon: '📱', sub: '10% held intact when avoided', hint: '10% held intact when avoided' },
    { id: 'nsfw', label: '18+ things', icon: '🚫', sub: '10% held intact when avoided', hint: '10% held intact when avoided' }
  ];

  // ---------- Universal Smart Clusters (Life, People, Verification, Shipping, Work, Family, Payments, Ideas) ----------
  const REM_CATEGORIES = {
    people: {
      id: 'people',
      label: 'People to Talk To & Follow-Ups',
      shortLabel: 'People',
      icon: '🗣️',
      color: 'emerald',
      desc: 'Calls, check-ins, and reminders to talk to specific people'
    },
    verify: {
      id: 'verify',
      label: 'Verify & App Sync ("Did It Show Up?")',
      shortLabel: 'Verify / App',
      icon: '🔍',
      color: 'amber',
      desc: 'Paid for something & waiting for it to show up on an app, bank, or statement'
    },
    shipping: {
      id: 'shipping',
      label: 'Shipping, Orders & Deliveries',
      shortLabel: 'Shipping',
      icon: '📦',
      color: 'steel',
      desc: 'Shipping time countdowns, packages, spare parts & order arrivals'
    },
    work: {
      id: 'work',
      label: 'Work & Specific Projects',
      shortLabel: 'Work',
      icon: '💼',
      color: 'brass',
      desc: 'Operational tasks across Resorts, WTC/Manufacturing, Trading, Holding & Tech'
    },
    family: {
      id: 'family',
      label: 'Family & Home',
      shortLabel: 'Family',
      icon: '👨‍👩‍👧',
      color: 'emerald',
      desc: 'Family commitments, parents, home errands & personal life'
    },
    payments: {
      id: 'payments',
      label: 'Payments & Wait-to-Pay Holds',
      shortLabel: 'Payments',
      icon: '💸',
      color: 'brass',
      desc: 'Cooling-off wait timers when someone asks for a payment or wire'
    },
    want_to_do: {
      id: 'want_to_do',
      label: 'Things I Want To Do',
      shortLabel: 'Want to Do',
      icon: '🌟',
      color: 'emerald',
      desc: 'Personal goals, places to try, activities, weekend plans & bucket list'
    },
    ideas: {
      id: 'ideas',
      label: 'Ideas for Later',
      shortLabel: 'Ideas',
      icon: '💡',
      color: 'steel',
      desc: 'Brainstorms, product concepts, automations & future ideas'
    }
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

  // Decode Dataverse Cloud Relay endpoints
  function getCloudConfig() {
    const cfg = window.THEO_CLOUD_CFG || {};
    let url = '';
    let key = '';
    try {
      url = cfg.u ? atob(cfg.u) : '';
      key = cfg.k ? atob(cfg.k) : '';
    } catch {}
    return { url, key, port: cfg.port || 4318 };
  }

  const cloudCfg = getCloudConfig();
  const prefs = loadJson(STORAGE_KEYS.PREFS, {
    theme: 'light',
    themeUserSet: false,
    sound: true,
    activeTab: 'pulse',
    sessProvider: 'all',
    sessStatus: 'all',
    telemetryProv: 'all',
    selectedThreadId: '',
    selectedRepoId: 'resort-operations',
    composerMode: 'reply',
    composerRepoPrefix: '',
    customBridgeUrl: '',
    remGroupBy: 'urgency',
    remShowDone: false,
    notif: { ...DEFAULT_NOTIF }
  });
  if (!prefs.themeUserSet) {
    prefs.theme = 'light';
  }
  prefs.notif = Object.assign({ ...DEFAULT_NOTIF }, prefs.notif || {});

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
  let connMode = 'probing'; // 'local' | 'cloud' | 'offline'
  let localBridgeBase = '';
  let sseSource = null;
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

  let pinnedNavThreadId = '';
  let pinnedNavProvider = '';
  let pinnedNavTitle = '';
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

  // ---------- Personal Ledger State (Daily 100% Score + Smart Reminders / Payment Holds) ----------
  function localIsoDate(dt = new Date()) {
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  function shiftIsoDate(iso, deltaDays) {
    const [y, m, d] = String(iso || localIsoDate())
      .split('-')
      .map(Number);
    const dt = new Date(y, (m || 1) - 1, (d || 1) + Number(deltaDays || 0));
    return localIsoDate(dt);
  }

  function fmtDateNice(iso) {
    const today = localIsoDate();
    if (iso === today) return 'Today';
    if (iso === shiftIsoDate(today, -1)) return 'Yesterday';
    const [y, m, d] = String(iso || today)
      .split('-')
      .map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  let personalLedger = loadJson(STORAGE_KEYS.PERSONAL, {
    reminders: [],
    deletedIds: [],
    dailyScores: {},
    teamRoster: [],
    updatedAt: 0
  });
  if (!personalLedger || typeof personalLedger !== 'object') {
    personalLedger = { reminders: [], deletedIds: [], dailyScores: {}, teamRoster: [], updatedAt: 0 };
  }
  if (!Array.isArray(personalLedger.reminders)) personalLedger.reminders = [];
  if (!Array.isArray(personalLedger.deletedIds)) personalLedger.deletedIds = [];
  if (!personalLedger.dailyScores || typeof personalLedger.dailyScores !== 'object') {
    personalLedger.dailyScores = {};
  }
  if (!Array.isArray(personalLedger.teamRoster)) personalLedger.teamRoster = [];

  function normalizeDayScoreRecord(rec, iso = '') {
    if (!rec || typeof rec !== 'object') {
      return { iso, date: iso, dos: {}, donts: {}, updatedAt: 0 };
    }
    const rawDos = rec.dos && typeof rec.dos === 'object' ? rec.dos : {};
    const rawDonts = rec.donts && typeof rec.donts === 'object' ? rec.donts : {};

    const normDo = (v) => (v === 'full' || v === 'half' ? v : 'none');
    const normDontTheo = (v) => {
      if (v === 'broken' || v === 'slip') return 'broken';
      if (v === 'half') return 'half';
      return 'clean';
    };
    const toCmdDont = (theoVal) =>
      theoVal === 'broken' ? 'slip' : theoVal === 'half' ? 'half' : 'intact';

    const socialVal = normDo(
      rawDos.social && rawDos.social !== 'none' ? rawDos.social : rawDos.socializing
    );
    const dos = {
      ...rawDos,
      wake: normDo(rawDos.wake),
      work: normDo(rawDos.work),
      skills: normDo(rawDos.skills),
      fitness: normDo(rawDos.fitness),
      social: socialVal,
      socializing: socialVal
    };

    const gamesTheo = normDontTheo(
      rawDonts.games && rawDonts.games !== 'clean' && rawDonts.games !== 'intact'
        ? rawDonts.games
        : rawDonts.videogames || rawDonts.games
    );
    const seriesTheo = normDontTheo(rawDonts.series);
    const musicTheo = normDontTheo(rawDonts.music);
    const socialmediaTheo = normDontTheo(rawDonts.socialmedia);
    const nsfwTheo = normDontTheo(
      rawDonts.nsfw && rawDonts.nsfw !== 'clean' && rawDonts.nsfw !== 'intact'
        ? rawDonts.nsfw
        : rawDonts.adult18 || rawDonts.nsfw
    );

    const donts = {
      ...rawDonts,
      games: gamesTheo,
      videogames: toCmdDont(gamesTheo),
      series: seriesTheo,
      music: musicTheo,
      socialmedia: socialmediaTheo,
      nsfw: nsfwTheo,
      adult18: toCmdDont(nsfwTheo)
    };

    return {
      ...rec,
      iso: rec.iso || rec.date || iso,
      date: rec.date || rec.iso || iso,
      dos,
      donts,
      updatedAt: Number(rec.updatedAt || 0)
    };
  }

  function normalizeReminderItem(rem) {
    if (!rem || typeof rem !== 'object') return rem;
    const completed = Boolean(rem.completed || rem.status === 'done');
    const subTag =
      rem.subTag ||
      rem.subGroup ||
      rem.customGroup ||
      (rem.assigneeName ? `👤 ${rem.assigneeName}` : '');
    const isParkedIdea =
      (rem.category === 'ideas' || rem.category === 'want_to_do') &&
      !rem.matureAt &&
      rem.kind !== 'wait';
    return {
      ...rem,
      completed,
      status: completed ? 'done' : 'open',
      subTag,
      subGroup: rem.subGroup || subTag,
      kind: isParkedIdea ? 'parked' : rem.kind || 'task',
      dueAt: isParkedIdea ? 0 : Number(rem.dueAt || 0),
      matureAt: Number(rem.matureAt || 0),
      recur: isParkedIdea ? 'none' : rem.recur || 'none'
    };
  }

  function savePersonalLedgerToLocal() {
    for (const [iso, rec] of Object.entries(personalLedger.dailyScores || {})) {
      personalLedger.dailyScores[iso] = normalizeDayScoreRecord(rec, iso);
    }
    personalLedger.deletedIds = Array.from(new Set(personalLedger.deletedIds || [])).slice(-400);
    saveJson(STORAGE_KEYS.PERSONAL, personalLedger);
    saveJson(STORAGE_KEYS.COMMAND, personalLedger);
  }

  function loadPersonalLedgerFromLocal() {
    const p1 = loadJson(STORAGE_KEYS.PERSONAL, null);
    if (p1 && typeof p1 === 'object') mergePersonalLedger(p1, { skipSave: true });
    const p2 = loadJson(STORAGE_KEYS.COMMAND, null);
    if (p2 && typeof p2 === 'object') mergePersonalLedger(p2, { skipSave: true });
    savePersonalLedgerToLocal();
  }

  let selectedScoreDate = localIsoDate();
  const remDraft = {
    kind: 'auto', // 'auto' | 'wait' | 'task' | 'recurring' | 'parked' | 'payment'
    title: '',
    amount: '',
    waitChoice: 'auto', // 'auto' | 'none' | '1h' | '3h' | 'tonight' | '1d' | '2d' | '3d' | '4d' | '5d' | '7d' | '10d' | '14d' | 'nextmon'
    recur: 'daily', // 'daily' | 'weekdays' | 'weekly' | 'monthly'
    categoryOverride: '',
    customGroup: ''
  };

  function getDayRecord(iso = localIsoDate()) {
    return normalizeDayScoreRecord(personalLedger.dailyScores?.[iso], iso);
  }

  function computeDayDiscipline(isoOrRec = localIsoDate()) {
    const rec = typeof isoOrRec === 'string' ? getDayRecord(isoOrRec) : normalizeDayScoreRecord(isoOrRec, isoOrRec?.iso || localIsoDate());
    let doEarned = 0;
    let doFullCount = 0;
    let doHalfCount = 0;
    for (const item of DAILY_DOS) {
      const st = rec.dos?.[item.id] || 'none';
      if (st === 'full') {
        doEarned += 10;
        doFullCount++;
      } else if (st === 'half') {
        doEarned += 5;
        doHalfCount++;
      }
    }

    let dontLost = 0;
    let dontCleanCount = 0;
    let dontSlipCount = 0;
    for (const item of DAILY_DONTS) {
      const st = rec.donts?.[item.id] || 'clean';
      if (st === 'broken' || st === 'slip') {
        dontLost += 10;
        dontSlipCount++;
      } else if (st === 'half') {
        dontLost += 5;
        dontSlipCount++;
      } else {
        dontCleanCount++;
      }
    }

    const dontKept = 50 - dontLost;
    const score = Math.max(0, Math.min(100, 50 + doEarned - dontLost));
    const deltaFromStart = score - 50;
    const tone =
      score >= 80 ? 'emerald' : score >= 50 ? 'brass' : score >= 35 ? 'amber' : 'crimson';
    const hasInteracted = Boolean(rec.updatedAt > 0 || doEarned > 0 || dontLost > 0);

    return {
      iso: rec.iso,
      score,
      deltaFromStart,
      doEarned,
      dontLost,
      dontKept,
      doFullCount,
      doHalfCount,
      dontCleanCount,
      dontSlipCount,
      tone,
      hasInteracted,
      dos: rec.dos,
      donts: rec.donts
    };
  }

  function setHabitState(iso, group, habitId, nextVal) {
    const cur = getDayRecord(iso);
    if (group === 'do') {
      const val = nextVal === 'full' || nextVal === 'half' ? nextVal : 'none';
      cur.dos[habitId] = val;
      if (habitId === 'social' || habitId === 'socializing') {
        cur.dos.social = val;
        cur.dos.socializing = val;
      }
    } else {
      const val = nextVal === 'broken' || nextVal === 'slip' ? 'broken' : nextVal === 'half' ? 'half' : 'clean';
      cur.donts[habitId] = val;
      if (habitId === 'games' || habitId === 'videogames') {
        cur.donts.games = val;
        cur.donts.videogames = val === 'broken' ? 'slip' : val === 'half' ? 'half' : 'intact';
      } else if (habitId === 'nsfw' || habitId === 'adult18') {
        cur.donts.nsfw = val;
        cur.donts.adult18 = val === 'broken' ? 'slip' : val === 'half' ? 'half' : 'intact';
      }
    }
    cur.updatedAt = Date.now();
    personalLedger.dailyScores[iso] = normalizeDayScoreRecord(cur, iso);
    personalLedger.updatedAt = Date.now();
    persistAndSyncPersonalLedger();
    renderAll();
  }

  function parseAmountFromText(text, explicitAmt = '') {
    const cleanExp = String(explicitAmt ?? '').replace(/[$,\s]/g, '');
    if (cleanExp && !Number.isNaN(Number(cleanExp)) && Number(cleanExp) > 0) {
      return Number(cleanExp);
    }
    const s = String(text || '');
    const m =
      s.match(/\$\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(k)?/i) ||
      s.match(/\b(\d+(?:,\d{3})*(?:\.\d+)?)\s*(k)?\s*(?:usd|dollars|\$)\b/i) ||
      s.match(/\b(\d+(?:\.\d+)?)\s*k\s*(?:usd|payment|wire|invoice)?\b/i);
    if (!m) return 0;
    const num = Number(String(m[1]).replace(/,/g, ''));
    if (Number.isNaN(num)) return 0;
    const hasK = Boolean(m[2] || /\bk\b/i.test(m[0]));
    return hasK ? num * 1000 : num;
  }

  function extractContextTags(text) {
    const raw = String(text || '').trim();
    const s = raw.toLowerCase();
    const tags = [];
    let personTag = '';
    let appTag = '';
    let workSubTag = '';

    // 1. Explicit @person or natural "talk to / call / ask / message / meet [Name]"
    const atMatch = raw.match(/@([A-Za-z][A-Za-z0-9_-]{1,20})/);
    const personMatch = raw.match(
      /\b(?:talk\s+to|speak\s+(?:to|with)|call|message|text|whatsapp|ask|remind\s+me\s+to\s+tell|check\s+with|follow\s+up\s+with|meet\s+with|meet)\s+([A-Z][a-z]{1,18}|mom|dad|mama|baba|brother|sister|lawyer|accountant|auditor|broker)\b/i
    );
    if (atMatch) {
      personTag = atMatch[1];
    } else if (personMatch) {
      const p = personMatch[1];
      if (!/^(the|a|an|my|our|him|her|them|someone|about|on|for|at|in|to)$/i.test(p)) {
        personTag = p.charAt(0).toUpperCase() + p.slice(1);
      }
    }
    if (personTag) tags.push(`👤 ${personTag}`);

    // 2. App / Bank / Platform name for "paid and didn't show up on app"
    const appMatch = raw.match(
      /\b(?:on|in|via|from)\s+(whish|omt|bob|bank\s*audi|audi|blom|byblos|neo|revolut|wise|stripe|paypal|apple\s*pay|binance|brains|dataverse|power\s*bi|tally|meta|instagram|whatsapp|amazon|dhl|aramex|fedex|aliexpress|shein)\b/i
    );
    if (appMatch) {
      const a = appMatch[1];
      appTag = a.charAt(0).toUpperCase() + a.slice(1);
      tags.push(`📱 ${appTag}`);
    } else if (/\b(didn'?t\s+show\s+up|not\s+showing|pending\s+on\s+app|on\s+the\s+app|app\s+balance)\b/i.test(s)) {
      appTag = 'App Sync';
      tags.push('📱 App Sync');
    }

    // 3. Specific Work Area sub-tags ("certain things at work")
    if (/\b(blanca|la\s*una|launa|palms|voile|platinum|resort|hotel|cabana|pos|kitchen|guest|beach|hospitality)\b/i.test(s)) {
      workSubTag = '🏖️ Resorts';
    } else if (/\b(wtc|bbc|bbconstruction|lions|quarry|crusher|asphalt|concrete|filter\s*press|plant|diesel|mixer|manufacturing)\b/i.test(s)) {
      workSubTag = '🏗️ WTC · Mfg';
    } else if (/\b(korri|shacman|truck|trucks|spare\s*parts|workshop|vin|trading)\b/i.test(s)) {
      workSubTag = '🚛 Korri · Trading';
    } else if (/\b(property|properties|tenant|lease|rent|villa|apartment|real\s*estate|insurance|policy|claim|broker|underwriter)\b/i.test(s)) {
      workSubTag = '🏢 Real Estate · Ins';
    } else if (/\b(holding|brains|vat|tax|audit|kyc|payroll|salary|lawyer|contract|soa|board)\b/i.test(s)) {
      workSubTag = '🏛️ Holding · Finance';
    } else if (/\b(theo|claude|antigravity|pwa|power\s*bi|flow|dataverse|github|script|automation)\b/i.test(s)) {
      workSubTag = '⚡ Tech · THEO';
    }
    if (workSubTag) tags.push(workSubTag);

    // 4. Explicit #hashtag
    const hashMatch = raw.match(/#([A-Za-z0-9_-]{2,24})/);
    if (hashMatch) {
      tags.push(`#${hashMatch[1]}`);
    }

    return {
      personTag,
      appTag,
      workSubTag,
      subTag: tags[0] || '',
      allTags: tags
    };
  }

  function getCategoryMeta(catId, customGroup = '') {
    if (customGroup) {
      return {
        id: `custom:${customGroup}`,
        label: customGroup,
        shortLabel: customGroup,
        icon: '🏷️',
        color: 'brass',
        desc: 'Custom smart group'
      };
    }
    if (catId && String(catId).startsWith('custom:')) {
      const name = String(catId).slice(7);
      return {
        id: catId,
        label: name,
        shortLabel: name,
        icon: '🏷️',
        color: 'brass',
        desc: 'Custom smart group'
      };
    }
    // Map legacy company categories seamlessly to the new universal clusters
    const legacyMap = {
      hospitality: REM_CATEGORIES.work,
      trading: REM_CATEGORIES.work,
      manufacturing: REM_CATEGORIES.work,
      realestate_ins: REM_CATEGORIES.work,
      holding: REM_CATEGORIES.work,
      personal: REM_CATEGORIES.want_to_do
    };
    return REM_CATEGORIES[catId] || legacyMap[catId] || REM_CATEGORIES.work;
  }

  function detectRelevanceCategory(text, kind = 'auto', override = '', customGroup = '') {
    if (customGroup) return getCategoryMeta('', customGroup);
    if (override) return getCategoryMeta(override);

    const s = String(text || '').toLowerCase();

    // 1. "Paid for something and it didn't show up on an app" / pending verification / refund / statement check
    if (
      /\b(didn'?t\s+show|not\s+showing|show\s+up|showed\s+up|reflect|reflected|pending|still\s+pending|didn'?t\s+go\s+through|didn'?t\s+arrive\s+on|verify|reconcil|refund|chargeback|receipt\s+missing|balance\s+update|app\s+sync|check\s+if.*paid|paid.*app)\b/i.test(
        s
      )
    ) {
      return REM_CATEGORIES.verify;
    }

    // 2. Shipping time / packages / orders / tracking / delivery / customs
    if (
      /\b(ship|shipping|shipment|delivery|deliver|delivered|package|parcel|order|ordered|tracking|dhl|fedex|aramex|ups|container|cargo|freight|customs\s+clearance|arrives?\s+in|transit|aliexpress|amazon)\b/i.test(
        s
      )
    ) {
      return REM_CATEGORIES.shipping;
    }

    // 3. Ideas for later / brainstorms / future concepts
    if (
      /\b(idea|ideas|idea\s+for\s+later|brainstorm|concept|maybe\s+build|could\s+build|what\s+if\s+we|future\s+feature|feature\s+idea|someday\s+build|automation\s+idea)\b/i.test(
        s
      )
    ) {
      return REM_CATEGORIES.ideas;
    }

    // 4. Things I want to do / bucket list / personal plans / try out
    if (
      /\b(want\s+to\s+do|things\s+i\s+want|i\s+want\s+to|wanna|bucket\s+list|try\s+out|place\s+to\s+visit|watch|read\s+book|learn\s+how|trip\s+to|hobby|weekend\s+plan|someday)\b/i.test(
        s
      )
    ) {
      return REM_CATEGORIES.want_to_do;
    }

    // 5. Family & Home
    if (
      /\b(family|mom|mother|dad|father|mama|baba|parents|brother|sister|wife|kids|home|house|apartment\s+repair|groceries|dinner\s+with\s+family|lunch\s+with\s+family|doctor|dentist|gift\s+for)\b/i.test(
        s
      )
    ) {
      return REM_CATEGORIES.family;
    }

    // 6. Reminders to talk to certain people / call / message / follow up with someone
    if (
      /\b(talk\s+to|speak\s+to|speak\s+with|call|phone|text|whatsapp|message|reach\s+out|check\s+in\s+with|check\s+with|follow\s+up\s+with|ask\s+[a-z]+|tell\s+[a-z]+|meet\s+with|catch\s+up\s+with)\b/i.test(
        s
      )
    ) {
      return REM_CATEGORIES.people;
    }

    // 7. Payments & Wait-to-Pay (when they ask for payments and you want to wait a bit)
    if (
      kind === 'payment' ||
      /\b(pay|payment|payments|asked\s+for\s+payment|invoice|wire|transfer|cheque|supplier\s+payout|advance|deposit|disburse|remit|bill|\$\s*\d+)\b/i.test(
        s
      )
    ) {
      return REM_CATEGORIES.payments;
    }

    // 8. Default to Work & Specific Projects (or Personal if no work signal)
    const ctx = extractContextTags(text);
    if (
      ctx.workSubTag ||
      /\b(work|office|team|project|report|client|staff|manager|approve|review|check|audit|meeting|schedule|ops|operations)\b/i.test(
        s
      )
    ) {
      return REM_CATEGORIES.work;
    }

    return REM_CATEGORIES.want_to_do;
  }

  function parseNaturalWaitFromText(text) {
    const s = String(text || '').toLowerCase();
    const now = new Date();
    const nowMs = now.getTime();

    // Check recurring keywords first
    if (/\b(every\s*day|daily)\b/i.test(s)) {
      return {
        matched: true,
        isRecurring: true,
        recur: 'daily',
        waitDays: 1,
        waitMs: 24 * 3600 * 1000,
        label: '🔁 Daily Routine'
      };
    }
    if (/\b(every\s*weekday|weekdays|mon-fri)\b/i.test(s)) {
      return {
        matched: true,
        isRecurring: true,
        recur: 'weekdays',
        waitDays: 1,
        waitMs: 24 * 3600 * 1000,
        label: '🔁 Weekdays (Mon–Fri)'
      };
    }
    if (/\b(every\s*week|weekly)\b/i.test(s)) {
      return {
        matched: true,
        isRecurring: true,
        recur: 'weekly',
        waitDays: 7,
        waitMs: 7 * 24 * 3600 * 1000,
        label: '🔁 Weekly Routine'
      };
    }
    if (/\b(every\s*month|monthly)\b/i.test(s)) {
      return {
        matched: true,
        isRecurring: true,
        recur: 'monthly',
        waitDays: 30,
        waitMs: 30 * 24 * 3600 * 1000,
        label: '🔁 Monthly Routine'
      };
    }

    // Explicit "in X min/hours/days/weeks" or "wait X days" or "shipping X days" or "for X days"
    const minMatch = s.match(/\b(?:in|wait|after)\s+(\d+)\s*(?:m|min|mins|minutes)\b/i);
    if (minMatch) {
      const mins = Math.max(1, Number(minMatch[1]));
      return {
        matched: true,
        waitDays: +(mins / 1440).toFixed(2),
        waitMs: mins * 60 * 1000,
        label: `In ${mins}m (parsed from text)`
      };
    }

    const hrMatch = s.match(/\b(?:in|wait|after|for)\s+(\d+)\s*(?:h|hr|hrs|hour|hours)\b/i);
    if (hrMatch) {
      const hrs = Math.max(1, Number(hrMatch[1]));
      return {
        matched: true,
        waitDays: +(hrs / 24).toFixed(2),
        waitMs: hrs * 3600 * 1000,
        label: `Wait ${hrs}h (parsed from text)`
      };
    }

    const dayMatch = s.match(
      /\b(?:in|wait|after|for|shipping|takes|within)\s+(\d+)\s*(?:d|day|days)\b/i
    );
    if (dayMatch) {
      const days = Math.max(1, Number(dayMatch[1]));
      return {
        matched: true,
        waitDays: days,
        waitMs: days * 24 * 3600 * 1000,
        label: `Wait ${days}d (parsed from text)`
      };
    }

    const wkMatch = s.match(/\b(?:in|wait|after|for)\s+(\d+)\s*(?:w|wk|wks|week|weeks)\b/i);
    if (wkMatch) {
      const wks = Math.max(1, Number(wkMatch[1]));
      const days = wks * 7;
      return {
        matched: true,
        waitDays: days,
        waitMs: days * 24 * 3600 * 1000,
        label: `Wait ${wks}w / ${days}d (parsed from text)`
      };
    }

    if (/\b(tonight|this\s+evening)\b/i.test(s)) {
      const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 0, 0);
      const waitMs = Math.max(3600 * 1000, dt.getTime() - nowMs);
      return {
        matched: true,
        waitDays: 0.4,
        waitMs,
        label: 'Tonight 20:00 (parsed from text)'
      };
    }

    if (/\btomorrow\b/i.test(s)) {
      const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 10, 0, 0);
      return {
        matched: true,
        waitDays: 1,
        waitMs: Math.max(3600 * 1000, dt.getTime() - nowMs),
        label: 'Tomorrow 10:00 (parsed from text)'
      };
    }

    if (/\bnext\s+week\b/i.test(s)) {
      return {
        matched: true,
        waitDays: 7,
        waitMs: 7 * 24 * 3600 * 1000,
        label: 'In 7 days (parsed from text)'
      };
    }

    return { matched: false };
  }

  function suggestPaymentWait(text, rawAmount = '') {
    const s = String(text || '').toLowerCase();
    const amt = parseAmountFromText(text, rawAmount);
    const cat = detectRelevanceCategory(text, remDraft.kind, remDraft.categoryOverride, remDraft.customGroup);
    const nat = parseNaturalWaitFromText(text);

    // If user typed a natural duration ("in 3 days", "wait 48 hours", "shipping 6 days", "tomorrow"), honor it!
    if (nat.matched) {
      return {
        waitDays: nat.waitDays,
        waitMs: nat.waitMs,
        isRecurring: Boolean(nat.isRecurring),
        recur: nat.recur || '',
        isParked: false,
        inferredKind: nat.isRecurring ? 'recurring' : 'wait',
        tier: nat.label,
        amt,
        reason: `Automatically extracted timing (${nat.label}) directly from your note.`
      };
    }

    // 1. Verify / "Paid for something and it didn't show up on an app"
    if (cat.id === 'verify') {
      const days = /\b(bank|wire|swift|international)\b/i.test(s) ? 2 : 1;
      return {
        waitDays: days,
        waitMs: days * 24 * 3600 * 1000,
        isParked: false,
        inferredKind: 'wait',
        tier: `Verify in ${days === 1 ? '24h' : '48h'} · App / Settlement Check`,
        amt,
        reason:
          days === 1
            ? '24-hour wait timer — reminds you tomorrow to verify if the payment or update showed up on the app.'
            : '48-hour settlement timer — reminds you in 2 days to verify bank/app reflection.'
      };
    }

    // 2. Shipping time / package / order delivery
    if (cat.id === 'shipping') {
      const isLocal = /\b(local|beirut|lebanon|aramex\s+local|today|tomorrow)\b/i.test(s);
      const isSea = /\b(container|sea|vessel|freight|china)\b/i.test(s);
      const days = isSea ? 14 : isLocal ? 2 : 5;
      return {
        waitDays: days,
        waitMs: days * 24 * 3600 * 1000,
        isParked: false,
        inferredKind: 'wait',
        tier: `Shipping Timer (${days}d)`,
        amt,
        reason: `Auto-set ${days}-day shipping countdown — you'll get a push when it's time to check tracking/arrival.`
      };
    }

    // 3. Ideas for later OR Things I want to do -> Parked (no noisy alarm unless chosen)
    if (cat.id === 'ideas' || cat.id === 'want_to_do') {
      return {
        waitDays: 0,
        waitMs: 0,
        isParked: true,
        inferredKind: 'parked',
        tier: cat.id === 'ideas' ? '💡 Parked in Ideas (No Alarm)' : '🌟 Saved in Want-to-Do (No Alarm)',
        amt,
        reason:
          'Kept cleanly in your organized cluster without a noisy timer (tap any timer chip below if you want a reminder).'
      };
    }

    // 4. People to talk to / follow-ups
    if (cat.id === 'people') {
      const now = new Date();
      const tom = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 10, 0, 0);
      const waitMs = Math.max(2 * 3600 * 1000, tom.getTime() - now.getTime());
      return {
        waitDays: 1,
        waitMs,
        isParked: false,
        inferredKind: 'task',
        tier: '🗣️ People Follow-Up (Tomorrow 10:00)',
        amt,
        reason: 'Grouped under People to Talk To — nudges you tomorrow morning at 10:00.'
      };
    }

    // 5. Family & Home
    if (cat.id === 'family') {
      const now = new Date();
      const eve = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 19, 30, 0);
      const waitMs =
        eve.getTime() > now.getTime() + 1800 * 1000
          ? eve.getTime() - now.getTime()
          : 20 * 3600 * 1000;
      return {
        waitDays: 1,
        waitMs,
        isParked: false,
        inferredKind: 'task',
        tier: '👨‍👩‍👧 Family & Home (Evening / 24h)',
        amt,
        reason: 'Grouped under Family & Home — reminds you this evening after work hours.'
      };
    }

    // 6. Payments & Wait-to-Pay Holds
    if (cat.id === 'payments' || remDraft.kind === 'payment') {
      if (/\b(salary|payroll|wage|electricity|edl|water|tax|vat|customs|urgent|emergency)\b/i.test(s)) {
        return {
          waitDays: 1,
          waitMs: 24 * 3600 * 1000,
          isParked: false,
          inferredKind: 'payment',
          tier: 'Urgent / Statutory (24h)',
          amt,
          reason: 'Statutory, payroll, or utility item — 24h verification hold.'
        };
      }
      if (amt > 15000) {
        return {
          waitDays: 10,
          waitMs: 10 * 24 * 3600 * 1000,
          isParked: false,
          inferredKind: 'payment',
          tier: `Strategic Payment Hold · $${fmtInt(amt)} (10d)`,
          amt,
          reason: 'High-value payout (>$15k) — 10-day cooling-off hold.'
        };
      }
      if (amt > 5000) {
        return {
          waitDays: 7,
          waitMs: 7 * 24 * 3600 * 1000,
          isParked: false,
          inferredKind: 'payment',
          tier: `Major Payment Hold · $${fmtInt(amt)} (7d)`,
          amt,
          reason: 'Major payout ($5k–$15k) — 7-day cooling-off hold.'
        };
      }
      if (amt >= 1000) {
        return {
          waitDays: 4,
          waitMs: 4 * 24 * 3600 * 1000,
          isParked: false,
          inferredKind: 'payment',
          tier: `Medium Payment Hold · $${fmtInt(amt)} (4d)`,
          amt,
          reason: 'Medium payout ($1k–$5k) — 4-day cooling-off hold.'
        };
      }
      if (amt > 0) {
        return {
          waitDays: 2,
          waitMs: 2 * 24 * 3600 * 1000,
          isParked: false,
          inferredKind: 'payment',
          tier: `Routine Payment Hold · $${fmtInt(amt)} (2d)`,
          amt,
          reason: 'Routine payout (<$1k) — 48h cooling-off hold.'
        };
      }
      return {
        waitDays: 3,
        waitMs: 3 * 24 * 3600 * 1000,
        isParked: false,
        inferredKind: 'payment',
        tier: 'Payment Wait-Timer (3d)',
        amt: 0,
        reason: '3-day cooling-off hold before paying (type an amount like $800 or $6,000 in the note to auto-scale).'
      };
    }

    // 7. Work & Projects default
    return {
      waitDays: 1,
      waitMs: 24 * 3600 * 1000,
      isParked: false,
      inferredKind: 'task',
      tier: '💼 Work Follow-Up (+24h)',
      amt,
      reason: 'Auto-grouped under Work & Projects with a 24-hour reminder timer.'
    };
  }

  function computeTargetTimestampFromChoice(choice, text, rawAmount) {
    const now = new Date();
    const nowMs = now.getTime();
    if (choice === 'none') {
      return {
        targetMs: 0,
        waitDays: 0,
        isParked: true,
        inferredKind: 'parked',
        label: 'No Timer (Parked)',
        reason: 'Saved in its smart group with no timer.'
      };
    }
    if (choice === 'auto') {
      const sug = suggestPaymentWait(text, rawAmount);
      return {
        targetMs: sug.isParked ? 0 : nowMs + sug.waitMs,
        waitDays: sug.waitDays,
        isParked: Boolean(sug.isParked),
        isRecurring: Boolean(sug.isRecurring),
        recur: sug.recur || '',
        inferredKind: sug.inferredKind || 'task',
        label: sug.tier,
        reason: sug.reason
      };
    }
    if (choice === '1h') {
      return { targetMs: nowMs + 3600 * 1000, waitDays: 0.04, label: 'In 1 hour', reason: '1-hour quick reminder.' };
    }
    if (choice === '3h') {
      return { targetMs: nowMs + 3 * 3600 * 1000, waitDays: 0.125, label: 'In 3 hours', reason: '3-hour same-day wait.' };
    }
    if (choice === 'tonight') {
      const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 30, 0);
      const tMs = dt.getTime() > nowMs ? dt.getTime() : nowMs + 2 * 3600 * 1000;
      return { targetMs: tMs, waitDays: 0.5, label: 'Tonight 20:30', reason: 'Scheduled for tonight at 20:30.' };
    }
    if (choice === 'nextmon') {
      const day = now.getDay();
      const daysUntilMon = ((8 - day) % 7) || 7;
      const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilMon, 9, 0, 0);
      return {
        targetMs: dt.getTime(),
        waitDays: daysUntilMon,
        label: `Next Mon (${daysUntilMon}d)`,
        reason: 'Scheduled for Monday 09:00.'
      };
    }
    const dayMatch = String(choice || '').match(/^(\d+)d$/);
    const dCount = dayMatch ? Number(dayMatch[1]) : 3;
    return {
      targetMs: nowMs + dCount * 24 * 3600 * 1000,
      waitDays: dCount,
      label: `Wait ${dCount} day${dCount === 1 ? '' : 's'}`,
      reason: `Manual ${dCount}-day wait timer.`
    };
  }

  function formatHoldCountdown(targetMs, nowMs = Date.now()) {
    if (!targetMs) return 'Parked · No alarm';
    const diff = Number(targetMs) - nowMs;
    if (diff <= 0) {
      const agoMin = Math.floor(Math.abs(diff) / 60000);
      if (agoMin < 60) return `Ready · ${agoMin}m ago`;
      const agoHrs = Math.floor(agoMin / 60);
      if (agoHrs < 24) return `Ready · ${agoHrs}h ago`;
      return `Ready · ${Math.floor(agoHrs / 24)}d ago`;
    }
    const totalMin = Math.ceil(diff / 60000);
    if (totalMin < 60) return `${totalMin}m wait left`;
    const hrs = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    if (hrs < 48) return `${hrs}h ${mins}m left`;
    const days = Math.floor(hrs / 24);
    const remHrs = hrs % 24;
    return `${days}d ${remHrs}h left`;
  }

  function isTimerItem(r) {
    if (!r || r.completed || r.deleted) return false;
    if (r.category === 'ideas' || r.category === 'want_to_do') return Boolean(r.matureAt > 0);
    return Boolean(
      r.matureAt > 0 ||
        r.kind === 'wait' ||
        r.kind === 'payment' ||
        r.category === 'verify' ||
        r.category === 'shipping' ||
        r.category === 'payments'
    );
  }

  function isDelegatedItem(r) {
    if (!r || r.completed || r.deleted) return false;
    if (r.category === 'ideas' || r.category === 'want_to_do') return Boolean(r.isDelegated || r.assigneeName);
    return Boolean(r.isDelegated || r.assigneeName || r.category === 'people');
  }

  function classifyReminderBucket(item, nowMs = Date.now()) {
    if (item.completed) return 'completed';
    if (item.delegationStatus === 'done') return 'urgent_matured';
    if (item.kind === 'recurring') {
      const targetMs = Number(item.matureAt || item.dueAt || 0);
      if (targetMs && nowMs >= targetMs) return 'urgent_matured';
      return 'recurring';
    }
    const targetMs = Number(item.matureAt || item.dueAt || 0);
    if (!targetMs || item.kind === 'parked' || item.category === 'ideas' || item.category === 'want_to_do') {
      if (targetMs && nowMs >= targetMs) return 'urgent_matured';
      if (!targetMs) return 'parked';
    }
    const isHold = isTimerItem(item);
    if (isHold) {
      if (targetMs && nowMs >= targetMs) {
        return 'urgent_matured';
      }
      return 'holding';
    }
    if (targetMs && nowMs >= targetMs) {
      return 'urgent_matured';
    }
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    if (targetMs && targetMs <= endOfToday.getTime()) {
      return 'today';
    }
    return 'upcoming';
  }

  function mergePersonalLedger(incoming, opts = {}) {
    if (!incoming || typeof incoming !== 'object') return false;
    let changed = false;

    const delSet = new Set(personalLedger.deletedIds || []);
    if (Array.isArray(incoming.deletedIds)) {
      for (const dId of incoming.deletedIds) {
        if (dId && !delSet.has(dId)) {
          delSet.add(dId);
          changed = true;
        }
      }
    }

    for (const r of personalLedger.reminders || []) {
      if (r && r.id && r.deleted && !delSet.has(r.id)) {
        delSet.add(r.id);
        changed = true;
      }
    }
    if (Array.isArray(incoming.reminders)) {
      for (const r of incoming.reminders) {
        if (r && r.id && r.deleted && !delSet.has(r.id)) {
          delSet.add(r.id);
          changed = true;
        }
      }
    }

    const beforeCount = (personalLedger.reminders || []).length;
    personalLedger.reminders = (personalLedger.reminders || [])
      .filter((r) => r && r.id && !r.deleted && !delSet.has(r.id))
      .map((r) => normalizeReminderItem(r));
    if (personalLedger.reminders.length !== beforeCount) changed = true;

    // 1. Merge reminders by id using updatedAt
    if (Array.isArray(incoming.reminders)) {
      const map = new Map();
      for (const r of personalLedger.reminders || []) {
        if (r && r.id && !delSet.has(r.id)) map.set(r.id, r);
      }
      for (const rawRem of incoming.reminders) {
        if (!rawRem || !rawRem.id || rawRem.deleted || delSet.has(rawRem.id)) continue;
        const rem = normalizeReminderItem(rawRem);
        const cur = map.get(rem.id);
        if (!cur || Number(rem.updatedAt || 0) >= Number(cur.updatedAt || 0)) {
          map.set(rem.id, rem);
          changed = true;
        }
      }
      const seenActiveTitle = new Map();
      const deduped = [];
      const sorted = Array.from(map.values()).sort(
        (a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0)
      );
      for (const item of sorted) {
        if (!item.completed) {
          const normTitle = String(item.title || '').trim().toLowerCase();
          if (seenActiveTitle.has(normTitle)) {
            delSet.add(item.id);
            changed = true;
            continue;
          }
          seenActiveTitle.set(normTitle, item.id);
        }
        deduped.push(item);
      }
      personalLedger.reminders = deduped.sort(
        (a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)
      );
    }

    personalLedger.deletedIds = Array.from(delSet).slice(-400);

    for (const [iso, curRec] of Object.entries(personalLedger.dailyScores || {})) {
      personalLedger.dailyScores[iso] = normalizeDayScoreRecord(curRec, iso);
    }

    // 2. Merge dailyScores by date key using updatedAt
    if (incoming.dailyScores && typeof incoming.dailyScores === 'object') {
      for (const [iso, rec] of Object.entries(incoming.dailyScores)) {
        if (!rec || typeof rec !== 'object') continue;
        const normInc = normalizeDayScoreRecord(rec, iso);
        const cur = personalLedger.dailyScores[iso];
        if (!cur || Number(normInc.updatedAt || 0) >= Number(cur.updatedAt || 0)) {
          personalLedger.dailyScores[iso] = normInc;
          changed = true;
        }
      }
    }

    if (Array.isArray(incoming.teamRoster) && incoming.teamRoster.length) {
      personalLedger.teamRoster = incoming.teamRoster;
      changed = true;
    }

    if (incoming.prayerConfig && typeof incoming.prayerConfig === 'object') {
      const curTs = Number(personalLedger.prayerConfig?.updatedAt || 0);
      const incTs = Number(incoming.prayerConfig.updatedAt || 0);
      if (!personalLedger.prayerConfig || incTs >= curTs) {
        if (JSON.stringify(personalLedger.prayerConfig || null) !== JSON.stringify(incoming.prayerConfig)) {
          personalLedger.prayerConfig = incoming.prayerConfig;
          changed = true;
        }
      }
    }

    if (changed && !opts.skipSave) {
      personalLedger.updatedAt = Math.max(
        Number(personalLedger.updatedAt || 0),
        Number(incoming.updatedAt || Date.now())
      );
      savePersonalLedgerToLocal();
    } else if (!opts.skipSave) {
      savePersonalLedgerToLocal();
    }
    return changed;
  }

  let personalSyncTimer = null;
  function persistAndSyncPersonalLedger() {
    savePersonalLedgerToLocal();
    schedulePushSync();
    clearTimeout(personalSyncTimer);
    personalSyncTimer = setTimeout(() => {
      pushPersonalLedgerToCloud().catch(() => {});
    }, 350);
  }

  async function pushPersonalLedgerToCloud() {
    // 1. Sync with Direct Local Bridge (:4318) if connected
    if (localBridgeBase) {
      try {
        const bRes = await fetch(`${localBridgeBase}/api/personal-ledger`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ personalLedger })
        });
        if (bRes.ok) {
          const bData = await bRes.json();
          if (bData?.personalLedger) {
            mergePersonalLedger(bData.personalLedger);
          }
        }
      } catch {}
    }
    // 2. Sync with Dataverse Cloud Relay (fetch & merge first so we never clobber Command edits)
    if (cloudCfg.url && cloudCfg.key) {
      try {
        const getRes = await callCloudPush({ op: 'get' }).catch(() => null);
        const getDocs = getRes?.docs && typeof getRes.docs === 'object' ? getRes.docs : getRes || {};
        if (getDocs?.personal_ledger && typeof getDocs.personal_ledger === 'object') {
          mergePersonalLedger(getDocs.personal_ledger);
        }
        const res = await callCloudPush({
          op: 'patch',
          patch: {
            personal_ledger: personalLedger
          }
        });
        const remoteLedger = res?.docs?.personal_ledger || res?.personal_ledger;
        if (remoteLedger) {
          mergePersonalLedger(remoteLedger);
        }
      } catch {}
    }
  }

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

  function swLocalNotif(payload) {
    try {
      if (navigator.serviceWorker) {
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'show-notification', payload });
        } else {
          navigator.serviceWorker.ready
            .then((reg) => {
              if (reg && reg.showNotification) {
                reg.showNotification(payload.title || 'THEO Workbench', {
                  body: payload.body || '',
                  icon: './icon-192.png',
                  badge: './icon-192.png',
                  tag: payload.tag || 'theo-local',
                  renotify: true,
                  data: {
                    id: payload.id || payload.tag || `local-${Date.now()}`,
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
    if (!cloudCfg.url || !cloudCfg.key || !itemId) return;
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

  function schedulePushSync() {
    if (!pushSub) return;
    clearTimeout(pushSyncTimer);
    pushSyncTimer = setTimeout(() => {
      syncPushSchedule().catch(() => {});
    }, 600);
  }

  async function syncPushSchedule() {
    if (!pushSub || !pushSub.endpoint) return;
    const nf = Object.assign({ ...DEFAULT_NOTIF }, prefs.notif || {});
    const devId = getDeviceId();
    const slots = nf.enabled ? await buildPushSlots(pushSub, 14) : {};
    const p256dh = (pushSub.keys && pushSub.keys.p256dh) || '';
    const auth = (pushSub.keys && pushSub.keys.auth) || '';
    const entry = {
      id: devId,
      app: 'theo',
      endpoint: pushSub.endpoint,
      p256dh,
      auth,
      keys: { p256dh, auth },
      prefs: nf,
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
    if (cloudCfg.url && cloudCfg.key) {
      try {
        const curRes = await callCloudPush({ op: 'get' });
        const curDocs = (curRes && curRes.docs) || curRes || {};
        const existing = Array.isArray(curDocs?.push_registry?.items)
          ? curDocs.push_registry.items
          : [];
        const others = existing.filter(
          (x) => x && x.id && x.id !== devId && x.endpoint !== pushSub.endpoint
        );
        const nextItems = nf.enabled ? others.concat([entry]) : others;
        await callCloudPush({
          op: 'patch',
          patch: {
            push_registry: {
              items: nextItems,
              updatedAt: new Date().toISOString()
            }
          }
        });
      } catch {}
    }
  }

  async function enablePush() {
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
      await syncPushSchedule();
      showToast('Push notifications enabled! Sending confirmation banner…');
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
      await enablePush();
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
      } else if (res && res.pushStatus === 410) {
        pushSub = null;
        showToast('Subscription expired on device — re-subscribing…');
        await enablePush();
      } else {
        swLocalNotif(msg);
        if (!isWelcome) showToast('Notification displayed.');
      }
    } catch {
      swLocalNotif(msg);
      if (!isWelcome) showToast('Offline fallback notification shown.');
    }
  }

  function checkServerLastNotificationOnResume(nextState) {
    const ln = nextState && nextState.lastNotification;
    if (!ln || typeof ln !== 'object') return;
    const notifId = String(ln.id || ln.tag || '');
    const notifTag = String(ln.tag || '');
    if (!notifId && !ln.threadId) return;
    if (isNotifConsumed(notifId, notifTag)) return;

    const ageMs = Date.now() - Number(ln.at || ln.ts || 0);
    if (ageMs < 0 || ageMs > 25 * 60 * 1000) {
      markNotifConsumed(notifId, notifTag);
      return;
    }

    // If the user explicitly navigated via ?thread= URL param or notification tap, do not hijack their target
    if (pinnedNavThreadId && Date.now() < pinnedNavUntil) {
      markNotifConsumed(notifId, notifTag);
      return;
    }

    // If the user just launched or resumed the PWA from background after a task notification fired, jump to that task
    if (Date.now() < recentResumeUntil && (ln.threadId || ln.reminderId)) {
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

    // If the app is actively open in foreground (not a fresh resume), mark consumed so future resumes don't replay it
    if (!document.hidden && Date.now() >= recentResumeUntil) {
      markNotifConsumed(notifId, notifTag);
    }
  }

  function checkLiveStateNotifications(nextState) {
    if (!nextState) return;
    const nf = Object.assign({ ...DEFAULT_NOTIF }, prefs.notif || {});
    const approvals = Array.isArray(nextState.approvals) ? nextState.approvals : [];
    const rows = Array.isArray(nextState.rows) ? nextState.rows : [];

    checkServerLastNotificationOnResume(nextState);

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
      const tag = `theo-app-${a.id}`;
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
        (document.hidden || !document.hasFocus()) &&
        notifPerm() === 'granted'
      ) {
        swLocalNotif({
          title: isQ
            ? `❓ Question from THEO — ${a.title || 'Session'}`
            : `⚡ Approval Needed · ${a.provider === 'claude' ? 'Claude Code' : 'Antigravity'}`,
          body: isQ
            ? `${a.detail || 'THEO is waiting for your answer.'}`
            : `${a.title || 'Session'}: ${a.toolName || 'Permission'} — ${a.detail || 'Waiting for confirmation'}`,
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
      const transitionedFromWorking = prevStatus === 'working' && isDone;
      const fastTurnCompleted =
        Boolean(prevStatus) &&
        prevStatus !== 'working' &&
        isDone &&
        prevStep > 0 &&
        curStep > prevStep &&
        curAt > prevAt &&
        Date.now() - curAt < 90000 &&
        Boolean(r.lastAssistantText);

      if ((transitionedFromWorking || fastTurnCompleted) && !newlyNotifiedSessions.has(r.id)) {
        const lastText = String(r.lastAssistantText || '').trim();
        const endsWithQ = /\?\s*["')*\]]*\s*$/.test(lastText);
        const doneId = `done-${r.id}-${curStep || curAt || Date.now()}`;
        const tag = `theo-done-${r.id}-${curStep || Date.now()}`;
        const navTarget = {
          id: doneId,
          tag,
          tab: 'chat',
          threadId: r.id,
          provider: r.provider || 'antigravity',
          sessionTitle: r.title || 'Session',
          url: `./?tab=chat&thread=${encodeURIComponent(r.id)}&provider=${encodeURIComponent(r.provider || 'antigravity')}`
        };
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
          (document.hidden || !document.hasFocus()) &&
          notifPerm() === 'granted'
        ) {
          swLocalNotif({
            title: endsWithQ
              ? `❓ Question from THEO — ${r.title || 'Session'}`
              : `✓ Task Complete — ${r.title || 'Session'}`,
            body: lastText
              ? lastText.slice(0, 160)
              : `${r.title || 'Session'} (${r.folder || 'Workspace'}) finished running. Tap to inspect.`,
            ...navTarget
          });
        }
      }
    }
  }

  // Web Audio Synthesizer for subtle executive chimes
  function playChime(kind = 'confirm') {
    if (!prefs.sound) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
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

  // Theme management
  function applyTheme(theme, userExplicit = false) {
    prefs.theme = theme === 'dark' ? 'dark' : 'light';
    if (userExplicit) {
      prefs.themeUserSet = true;
    }
    document.documentElement.setAttribute('data-theme', prefs.theme);
    const meta = $('meta-theme-color');
    if (meta) {
      meta.setAttribute('content', prefs.theme === 'light' ? '#F4F2EE' : '#0B1730');
    }
    saveJson(STORAGE_KEYS.PREFS, prefs);
  }

  // Inject provider SVG icons
  function hydrateStaticIcons() {
    document.querySelectorAll('[data-prov-icon]').forEach((el) => {
      const k = el.getAttribute('data-prov-icon');
      el.innerHTML = PROVIDER_ICONS[k] || PROVIDER_ICONS.antigravity;
    });
  }

  // Connectivity Engine: Probes Direct Local Bridge (:4318) first, then Cloud Relay fallback
  async function probeLocalBridge() {
    const candidates = [];
    // If opened directly from the VS Code LAN/local bridge (e.g. http://192.168.3.129:4318), use location.origin first
    if (
      location.port === String(cloudCfg.port) ||
      (location.protocol === 'http:' && !location.hostname.endsWith('.github.io'))
    ) {
      candidates.push(location.origin.replace(/\/+$/, ''));
    }
    if (prefs.customBridgeUrl) {
      candidates.push(prefs.customBridgeUrl.replace(/\/+$/, ''));
    }
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      candidates.push(`http://localhost:${cloudCfg.port}`);
    }
    candidates.push(`http://127.0.0.1:${cloudCfg.port}`);

    const seen = new Set();
    for (const base of candidates) {
      if (!base || seen.has(base)) continue;
      seen.add(base);
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 900);
        const res = await fetch(`${base}/api/ping`, { signal: ctrl.signal });
        clearTimeout(timer);
        if (res.ok) {
          const data = await res.json();
          if (data && data.ok) {
            localBridgeBase = base;
            return base;
          }
        }
      } catch {}
    }
    return '';
  }

  const initialNoSse = location.search.includes('nosse=1');

  function connectSse(base) {
    if (initialNoSse || location.search.includes('nosse=1')) {
      return;
    }
    if (sseSource) {
      try {
        sseSource.close();
      } catch {}
      sseSource = null;
    }
    try {
      const es = new EventSource(`${base}/api/events`);
      es.addEventListener('state', (ev) => {
        try {
          const st = JSON.parse(ev.data);
          if (st) {
            applyStoppedSessionOverrides(st);
            applyPendingLocalOverrides(st);
            checkLiveStateNotifications(st);
            appState = st;
            if (st.personalLedger) {
              mergePersonalLedger(st.personalLedger);
            }
            persistCache();
            renderAll();
          }
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
        const optimisticMsgs = existing.messages.filter(
          (m) =>
            m.optimistic &&
            now - Number(m.optimisticAt || 0) < 45000 &&
            !remoteMsgs.some((rm) => rm.role === 'user' && String(rm.text || '').trim() === String(m.text || '').trim())
        );
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
    updateConnectionBanner('syncing');

    // 1. Try Direct Local Bridge first
    const bridgeBase = localBridgeBase || (await probeLocalBridge());
    if (bridgeBase) {
      try {
        const res = await fetch(`${bridgeBase}/api/state`);
        if (res.ok) {
          const payload = await res.json();
          if (payload?.state) {
            connMode = 'local';
            applyStoppedSessionOverrides(payload.state);
            applyPendingLocalOverrides(payload.state);
            checkLiveStateNotifications(payload.state);
            appState = payload.state;
            if (payload.state.personalLedger) {
              mergePersonalLedger(payload.state.personalLedger);
            }
            if (!sseSource) connectSse(bridgeBase);
            persistCache();
            renderAll();
            flushOutbox().catch(() => {});
            if (prefs.selectedThreadId) {
              fetchThreadDetail(prefs.selectedThreadId, pinnedNavProvider || '').catch(() => {});
            }
            if (options.toast) {
              showToast(`Connected to VS Code Direct Bridge (${(appState.rows || []).length} sessions)`);
            }
            return true;
          }
        }
      } catch {
        localBridgeBase = '';
      }
    }

    // 2. Fallback to Dataverse Cloud Relay (Zero-VPN worldwide access)
    if (cloudCfg.url && cloudCfg.key) {
      try {
        const res = await fetch(cloudCfg.url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({ key: cloudCfg.key, op: 'get' })
        });
        if (res.ok) {
          const rawStore = await res.json();
          const store =
            rawStore?.docs && typeof rawStore.docs === 'object' ? rawStore.docs : rawStore || {};
          connMode = 'cloud';
          if (store?.state?.snapshot) {
            applyStoppedSessionOverrides(store.state.snapshot);
            applyPendingLocalOverrides(store.state.snapshot);
            checkLiveStateNotifications(store.state.snapshot);
            appState = store.state.snapshot;
          }
          if (store?.personal_ledger && typeof store.personal_ledger === 'object') {
            mergePersonalLedger(store.personal_ledger);
          }
          if (store?.threads && typeof store.threads === 'object') {
            mergeRemoteThreads(store.threads);
          }
          if (store?.state?.workspacesDetail && typeof store.state.workspacesDetail === 'object') {
            workspacesDetailCache = { ...workspacesDetailCache, ...store.state.workspacesDetail };
          }
          persistCache();
          renderAll();
          flushOutbox().catch(() => {});
          if (prefs.selectedThreadId) {
            fetchThreadDetail(prefs.selectedThreadId, pinnedNavProvider || '').catch(() => {});
          }
          if (options.toast) {
            showToast(`Synced with VS Code Cloud Relay (${(appState?.rows || []).length} sessions)`);
          }
          return true;
        }
      } catch {}
    }

    connMode = 'offline';
    renderAll();
    if (options.toast) {
      showToast('Offline — showing cached snapshot');
    }
    return false;
  }

  async function fetchThreadDetail(threadId, providerHint = '') {
    if (!threadId) return null;
    if (connMode === 'local' && localBridgeBase) {
      try {
        const res = await fetch(
          `${localBridgeBase}/api/thread?id=${encodeURIComponent(threadId)}&provider=${encodeURIComponent(providerHint)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data?.thread) {
            mergeRemoteThreads({ [threadId]: data.thread });
            persistCache();
            if (prefs.activeTab === 'chat' && prefs.selectedThreadId === threadId) {
              renderChatView(true);
            }
            return threadsCache[threadId];
          }
        }
      } catch {}
    } else if (connMode === 'cloud' && cloudCfg.url && cloudCfg.key) {
      const cached = threadsCache[threadId];
      const hasMessages = Array.isArray(cached?.messages) && cached.messages.length > 0;
      const lastReq = pendingThreadRequests.get(threadId) || 0;
      if (Date.now() - lastReq > 15000) {
        pendingThreadRequests.set(threadId, Date.now());
        if (!hasMessages && prefs.activeTab === 'chat' && prefs.selectedThreadId === threadId) {
          renderChatView();
        }
        dispatchRemoteCommand({
          type: 'requestThread',
          id: threadId,
          threadId,
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
    if (connMode === 'local' && localBridgeBase) {
      try {
        const q = `id=${encodeURIComponent(repoId)}${fileRel ? `&file=${encodeURIComponent(fileRel)}` : ''}`;
        const res = await fetch(`${localBridgeBase}/api/workspace?${q}`);
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
    return { workspace: workspacesDetailCache[repoId] || null, file: null };
  }

  async function dispatchRemoteCommand(cmdObj) {
    const targetThreadId = String(cmdObj?.threadId || cmdObj?.id || '').trim();
    const cmd = {
      ...cmdObj,
      id:
        cmdObj?.id && String(cmdObj.id).startsWith('cmd-')
          ? cmdObj.id
          : `cmd-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
      threadId: targetThreadId,
      createdAt: cmdObj?.createdAt || Date.now(),
      status: 'pending'
    };

    // 1. Direct Local Bridge
    if (connMode === 'local' && localBridgeBase) {
      try {
        const endpoint =
          cmd.type === 'send'
            ? '/api/send'
            : cmd.type === 'approve' || cmd.type === 'answerQuestion'
              ? '/api/approve'
              : '/api/session-action';
        const res = await fetch(`${localBridgeBase}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...cmd, id: targetThreadId || cmd.id })
        });
        if (res.ok) {
          const out = await res.json();
          setTimeout(() => syncData(), 500);
          return { ok: true, mode: 'local', out };
        }
      } catch {}
    }

    // 2. Cloud Relay Command Queue (text/plain POST avoids CORS preflight)
    if (cloudCfg.url && cloudCfg.key) {
      try {
        const curRes = await fetch(cloudCfg.url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({ key: cloudCfg.key, op: 'get' })
        });
        const rawCur = curRes.ok ? await curRes.json() : {};
        const curStore =
          rawCur?.docs && typeof rawCur.docs === 'object' ? rawCur.docs : rawCur || {};
        const existingCmds = Array.isArray(curStore?.queue?.commands)
          ? curStore.queue.commands.slice(-14)
          : [];
        existingCmds.push(cmd);

        const nextQueue = {
          ...(curStore.queue || {}),
          commands: existingCmds
        };
        if ((cmd.type === 'requestThread' || cmd.subAction === 'requestThread') && targetThreadId) {
          nextQueue.activeThreadId = targetThreadId;
        }


        const postRes = await fetch(cloudCfg.url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({
            key: cloudCfg.key,
            op: 'patch',
            patch: {
              queue: nextQueue
            }
          })
        });
        if (postRes.ok) {
          return { ok: true, mode: 'cloud', id: cmd.id };
        }
      } catch {}
    }

    // 3. Offline Outbox Queue
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
    const dotMob = $('mobile-conn-dot');
    const textMob = $('mobile-conn-text');

    if (overrideState === 'syncing') {
      if (titleRail) titleRail.textContent = 'Syncing Bridge…';
      if (textMob) textMob.textContent = 'Syncing…';
      return;
    }

    const rowCount = (appState?.rows || []).length;
    const snapAge = appState?.generatedAt ? timeAgo(appState.generatedAt) : '';

    if (connMode === 'local') {
      if (dotRail) dotRail.className = 'conn-dot live';
      if (titleRail) titleRail.textContent = 'Direct Bridge · Live SSE';
      if (subRail) subRail.textContent = `${localBridgeBase.replace(/^https?:\/\//, '')} · ${rowCount} sess`;
      if (dotMob) dotMob.className = 'conn-dot live';
      if (textMob) textMob.textContent = 'Direct SSE';
    } else if (connMode === 'cloud') {
      if (dotRail) dotRail.className = 'conn-dot cloud';
      if (titleRail) titleRail.textContent = 'Cloud Relay · Connected';
      if (subRail) subRail.textContent = `VS Code Sync ${snapAge || 'live'} · ${rowCount} sess`;
      if (dotMob) dotMob.className = 'conn-dot cloud';
      if (textMob) textMob.textContent = snapAge ? `Live · ${snapAge.replace(' ago', '')}` : 'Cloud Live';
    } else {
      if (dotRail) dotRail.className = 'conn-dot';
      if (titleRail) titleRail.textContent = 'Offline Snapshot';
      if (subRail) subRail.textContent = snapAge ? `Cached ${snapAge}` : 'Waiting for connection';
      if (dotMob) dotMob.className = 'conn-dot';
      if (textMob) textMob.textContent = 'Cached';
    }

    const pushDot = $('mobile-push-dot');
    const pushBtn = $('mobile-push-btn');
    const nf = Object.assign({ ...DEFAULT_NOTIF }, prefs.notif || {});
    const pushActive = Boolean(nf.enabled && pushSub && notifPerm() === 'granted');
    if (pushDot) {
      pushDot.className = `conn-dot ${pushActive ? 'live' : ''}`;
    }
    if (pushBtn) {
      pushBtn.style.borderColor = pushActive ? 'var(--emerald)' : 'var(--brass)';
      pushBtn.style.color = pushActive ? 'var(--emerald)' : 'var(--brass)';
      pushBtn.title = pushActive
        ? 'Web Push Notifications Active (Tap to test / configure)'
        : 'Tap to Enable Web Push Notifications';
    }

    const connModal = $('conn-modal');
    if (connModal && !connModal.hidden) {
      renderConnModal();
    }
  }

  function openConnModal() {
    const modal = $('conn-modal');
    if (!modal) return;
    renderConnModal();
    modal.hidden = false;
  }

  function closeConnModal() {
    const modal = $('conn-modal');
    if (modal) modal.hidden = true;
  }

  function renderConnModal() {
    const dotEl = $('conn-modal-dot');
    const titleEl = $('conn-modal-title');
    const bodyEl = $('conn-modal-body');
    if (!bodyEl) return;

    const conn = appState?.connection || {};
    const lanUrl = conn.lanUrl || '';
    const hostName = conn.hostname || 'Hussein-Laptop';
    const rowCount = (appState?.rows || []).length;
    const activeCount = (appState?.rows || []).filter((r) => !r.archived).length;
    const threadCount = Object.keys(threadsCache || {}).length;
    const snapTime = appState?.generatedAt ? timeAgo(appState.generatedAt) : '—';
    const nf = Object.assign({ ...DEFAULT_NOTIF }, prefs.notif || {});
    const pushActive = Boolean(nf.enabled && pushSub && notifPerm() === 'granted');

    if (dotEl) {
      dotEl.className = `conn-dot ${connMode === 'local' ? 'live' : connMode === 'cloud' ? 'cloud' : ''}`;
    }
    if (titleEl) {
      titleEl.textContent =
        connMode === 'local'
          ? 'Connected · Direct Wi-Fi Bridge (SSE)'
          : connMode === 'cloud'
            ? 'Connected · Dataverse Cloud Relay'
            : 'Offline · Local Snapshot Cache';
    }

    bodyEl.innerHTML = `
      <div class="conn-stat-grid tabular">
        <div class="conn-stat-box">
          <span class="conn-stat-lbl">VS Code Host</span>
          <span class="conn-stat-val">${esc(hostName)}</span>
        </div>
        <div class="conn-stat-box">
          <span class="conn-stat-lbl">Last VS Code Sync</span>
          <span class="conn-stat-val">${esc(snapTime)}</span>
        </div>
        <div class="conn-stat-box">
          <span class="conn-stat-lbl">Synced Sessions</span>
          <span class="conn-stat-val">${activeCount} active / ${rowCount} total</span>
        </div>
        <div class="conn-stat-box">
          <span class="conn-stat-lbl">Web Push Alerts</span>
          <span class="conn-stat-val" style="color:${pushActive ? 'var(--emerald)' : 'var(--amber)'}">${pushActive ? '🔔 Active' : 'Off'}</span>
        </div>
      </div>
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
            ? `<button type="button" class="btn-ghost-sm" data-push-act="test">🔔 Test Push</button>`
            : `<button type="button" class="btn-ghost-sm" data-push-act="enable">${pushBusy ? 'Enabling…' : '🔔 Enable Push'}</button>`
        }
        ${
          lanUrl && connMode !== 'local'
            ? `<a href="${esc(lanUrl)}" class="btn-ghost-sm" style="text-decoration:none;display:inline-flex;align-items:center">Open Wi-Fi Direct (${esc(lanUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''))})</a>`
            : ''
        }
      </div>
    `;
  }

  function renderPulseNotifBannerHtml() {
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
                <strong>Quota threshold (≥90%) &amp; stalled-task watchdog alerts</strong>
                <span>Alerts if a 5-hour/weekly quota window reaches 90% or if a background task stalls</span>
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
      window.open('https://husseinbdeir.github.io/command/', '_blank', 'noopener');
      return;
    }
    const valid = ['pulse', 'sessions', 'chat', 'workspaces', 'analytics'];
    const target = valid.includes(tabName) ? tabName : 'pulse';
    prefs.activeTab = target;
    saveJson(STORAGE_KEYS.PREFS, prefs);

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
      fetchThreadDetail(prefs.selectedThreadId, pinnedNavProvider || '');
    } else if (target === 'workspaces') {
      renderWorkspacesView();
    } else if (target === 'analytics') {
      renderAnalyticsView();
    }
  }

  function ensureSelectedThread() {
    const rows = (appState?.rows || []).filter((r) => r.id && !r.draft);
    const hasPinned =
      Boolean(pinnedNavThreadId) &&
      prefs.selectedThreadId === pinnedNavThreadId &&
      Date.now() < pinnedNavUntil;
    const hasCachedThread = Boolean(prefs.selectedThreadId && threadsCache[prefs.selectedThreadId]);
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
          isMultiSelect: Boolean(explicitMulti),
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
    const selector = String(opts.selector || '').trim();
    const sessionTitle = String(opts.sessionTitle || '').trim();
    const showInspectBtn = Boolean(opts.showInspectBtn);
    const plainQuestionFallback = Boolean(opts.plainQuestionFallback);
    const questions = Array.isArray(opts.questions) ? opts.questions : [];

    renderedQuestionsByCardKey.set(cardKey, {
      cardKey,
      sessionId,
      provider,
      approvalId,
      selector,
      questions,
      plainQuestionFallback
    });

    const draft = getQuestionDraft(cardKey);
    const selectedCount = countDraftSelections(draft, questions.length);
    const anyMulti = questions.some((q) => q.isMultiSelect);

    if (draft.submitted) {
      return `
        <div class="vs-question-card is-answered" data-q-card="${esc(cardKey)}">
          <div class="vs-q-card-top">
            <span class="approval-prov">
              <span class="prov-glyph">${PROVIDER_ICONS[provider]}</span>
              <span>${provider === 'claude' ? 'Claude Code' : 'Antigravity'} · Answered</span>
            </span>
            <span class="pill-count emerald">✓ Dispatched</span>
          </div>
          <div class="vs-q-answered-summary">${esc(draft.submittedSummary || 'Response sent to VS Code')}</div>
        </div>
      `;
    }

    const blocksHtml = questions
      .map((q, qIdx) => {
        const selSet = draft.selectedByQ[qIdx] || new Set();
        const writeInVal = String(draft.writeInByQ[qIdx] || '');
        const optionsList = Array.isArray(q.options) ? q.options : [];
        const modeHint = q.isMultiSelect ? 'Select all that apply' : 'Select one option';

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
                    ${opt.isRecommended ? `<span class="vs-q-rec-badge">★ Recommended</span>` : ''}
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
            ${optionsList.length > 0 ? `<div class="vs-q-options-list">${optionsHtml}</div>` : ''}
            <div class="vs-q-writein-wrap">
              <input
                type="text"
                class="vs-q-writein-input"
                data-q-writein-input="1"
                data-card-key="${esc(cardKey)}"
                data-q-idx="${qIdx}"
                placeholder="${optionsList.length > 0 ? 'Other (type custom answer or notes)…' : 'Type your answer…'}"
                value="${esc(writeInVal)}"
                autocomplete="off"
              >
            </div>
          </div>
        `;
      })
      .join('');

    return `
      <div class="vs-question-card" data-q-card="${esc(cardKey)}">
        <div class="vs-q-card-top">
          <span class="approval-prov">
            <span class="prov-glyph">${PROVIDER_ICONS[provider]}</span>
            <span>${provider === 'claude' ? 'Claude Code' : 'Antigravity'} · Question</span>
          </span>
          <span class="approval-tool-badge tabular">${anyMulti ? 'Multi-Select' : 'Interactive Choice'}</span>
        </div>
        ${sessionTitle ? `<div class="approval-title">${esc(sessionTitle)}</div>` : ''}
        ${blocksHtml}
        <div class="vs-q-actions">
          <button
            type="button"
            class="btn-approve btn-q-submit"
            data-q-submit="1"
            data-card-key="${esc(cardKey)}"
          >✓ Submit Answer${selectedCount > 0 ? ` (${selectedCount})` : ''}</button>
          <button
            type="button"
            class="btn-inspect btn-q-skip"
            data-q-skip="1"
            data-card-key="${esc(cardKey)}"
          >Skip</button>
          ${showInspectBtn && sessionId ? `<button type="button" class="btn-inspect" data-open-chat="${esc(sessionId)}">Inspect</button>` : ''}
        </div>
      </div>
    `;
  }

  // VIEW 1: Render Pulse
  function renderPulseView() {
    const bannerEl = $('pulse-notif-banner');
    if (bannerEl) {
      bannerEl.innerHTML = renderPulseNotifBannerHtml();
    }

    const rows = appState?.rows || [];
    const approvals = appState?.approvals || [];
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
          <span class="kpi-lbl">Running</span>
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

    // Quota Cards
    const quotaGrid = $('pulse-quota-grid');
    const updatedLbl = $('quota-updated-at');
    if (updatedLbl) {
      updatedLbl.textContent = appState?.generatedAt
        ? `Synced ${timeAgo(appState.generatedAt)}`
        : 'Live telemetry';
    }
    if (quotaGrid) {
      const agy = appState?.providers?.antigravity;
      const claude = appState?.providers?.claude;
      quotaGrid.innerHTML =
        renderQuotaCardHtml(agy, 'antigravity') + renderQuotaCardHtml(claude, 'claude');
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

  function renderQuotaCardHtml(provInfo, key) {
    const label = key === 'claude' ? 'Claude Code' : 'Google Antigravity';
    const plan = provInfo?.account?.plan || (key === 'claude' ? 'Claude Max' : 'Google AI Pro');
    const email = provInfo?.account?.email || '';
    const isCollapsed = Boolean(prefs.collapsedQuotaCards && prefs.collapsedQuotaCards[key]);
    let limits = provInfo?.usage?.limits?.length
      ? provInfo.usage.limits
      : provInfo?.usage?.allLimits || [];

    if (!limits.length && key === 'claude') {
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
                  <span>${pct}% used</span>
                </div>
                <div class="q-track">
                  <div class="q-fill ${cls}" style="width:${pct}%"></div>
                </div>
                ${resetTxt ? `<span class="q-reset">${esc(resetTxt)}</span>` : ''}
              </div>
            `;
          })
          .join('')
      : `<div class="meta-timestamp">${esc(provInfo?.usageMessage || 'Quota telemetry ready.')}</div>`;

    return `
      <div class="quota-card${isCollapsed ? ' collapsed' : ''}">
        <button type="button" class="quota-card-head quota-card-toggle" data-quota-collapse="${key}" aria-expanded="${!isCollapsed}" title="${isCollapsed ? 'Show' : 'Hide'} ${esc(label)} usage">
          <div class="quota-prov-title">
            <svg class="quota-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>
            <span class="prov-glyph">${PROVIDER_ICONS[key]}</span>
            <div>
              <div>${esc(label)}</div>
              ${!isCollapsed && email ? `<div class="meta-timestamp">${esc(email)}</div>` : ''}
            </div>
          </div>
          <span class="plan-pill">${esc(plan)}</span>
        </button>
        ${isCollapsed ? '' : `<div class="quota-bars-stack">${barsHtml}</div>`}
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
    return `
      <div class="session-card ${statusCls}" data-session-id="${esc(r.id || '')}" data-session-prov="${provKey}">
        <div class="sess-left">
          <span class="sess-status-dot ${statusCls}" title="${esc(r.status || 'idle')}"></span>
          <span class="prov-glyph">${PROVIDER_ICONS[provKey]}</span>
          <div class="sess-body">
            <div class="sess-title-row">
              <span class="sess-title">${esc(r.title || 'Untitled Session')}</span>
            </div>
            <div class="sess-sub-row tabular">
              ${r.folder ? `<span class="tag-pill">${esc(r.folder)}</span>` : ''}
              ${r.branch ? `<span>⎇ ${esc(r.branch)}</span>` : ''}
              <span>${esc(displayModel)}</span>
              ${
                safeUsed > 0
                  ? `<span class="tag-pill tabular" title="Context window usage">${fmtCompact(safeUsed)} / ${fmtCompact(limTok)} · ${ctxPct}%</span>`
                  : ''
              }
              <span>· ${timeAgo(r.at)}</span>
              ${r.open ? `<span class="tag-pill" style="color:var(--brass)">Open Tab</span>` : ''}
            </div>
          </div>
        </div>
        <div class="sess-right">
          ${
            r.status === 'working' || r.dot === 'running' || r.bgTask?.state === 'running'
              ? `<button type="button" class="sess-act-btn stop-btn" data-sess-act="stop" data-id="${esc(r.id || '')}" title="Stop / interrupt running session">■ Stop</button>`
              : ''
          }
          <button type="button" class="sess-act-btn" data-sess-act="group" data-id="${esc(r.id || '')}" title="Assign or move session to a group">
            📁 ${esc(grpObj ? grpObj.name : 'Group')}
          </button>
          <button type="button" class="sess-act-btn" data-sess-act="unread" data-id="${esc(r.id || '')}" data-val="${!r.unread}" title="Toggle unread">
            ${r.unread ? '● Unread' : '○ Read'}
          </button>
          <button type="button" class="sess-act-btn" data-sess-act="archive" data-id="${esc(r.id || '')}" data-val="${!r.archived}" title="${r.archived ? 'Unarchive' : 'Archive'}">
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
        <button type="button" class="group-act-btn" data-group-act="new-in-group" data-group-id="${esc(id)}" title="Start new session">+ New</button>
        <button type="button" class="group-act-btn" data-group-act="rename" data-group-id="${esc(id)}" data-group-name="${esc(name)}" title="Rename group">✎</button>
        <button type="button" class="group-act-btn" data-group-act="delete" data-group-id="${esc(id)}" data-group-name="${esc(name)}" title="Delete group">✕</button>
      `
      : archivableIds.length > 0
        ? `<button type="button" class="group-act-btn" data-group-act="archive-closed" title="Archive ${archivableIds.length} closed idle sessions">Archive closed (${archivableIds.length})</button>`
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
    const container = $('sessions-full-list');
    if (!container) return;
    const rows = (appState?.rows || []).filter((r) => r.id);
    const groups = Array.isArray(appState?.groups) ? appState.groups : [];
    const groupIds = new Set(groups.map((g) => g.id));
    const q = ($('sess-search-input')?.value || '').trim().toLowerCase();

    const activeTotalAll = rows.filter((r) => !r.archived).length;
    const sumPill = $('sess-header-summary-pill');
    if (sumPill) {
      sumPill.textContent =
        groups.length > 0
          ? `${activeTotalAll} Active · ${groups.length} Group${groups.length === 1 ? '' : 's'}`
          : `${activeTotalAll} Active`;
    }

    // Sync active state & live counts on provider segmented buttons
    const provCounts = {
      all: rows.filter((r) => !r.archived).length,
      antigravity: rows.filter((r) => !r.archived && r.provider !== 'claude').length,
      claude: rows.filter((r) => !r.archived && r.provider === 'claude').length
    };
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

    const provRows = rows.filter(
      (r) => prefs.sessProvider === 'all' || r.provider === prefs.sessProvider
    );
    const chipCounts = {
      all: provRows.filter((r) => !r.archived).length,
      needs_input: provRows.filter((r) => !r.archived && r.status === 'waiting').length,
      working: provRows.filter((r) => !r.archived && r.status === 'working').length,
      unread: provRows.filter((r) => !r.archived && r.unread).length,
      open: provRows.filter((r) => !r.archived && r.open).length,
      archived: provRows.filter((r) => r.archived).length
    };
    const chipLabels = {
      all: 'All Active',
      needs_input: 'Needs Input',
      working: 'Working',
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

    const filtered = provRows.filter((r) => {
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
        const hay = `${r.title} ${r.folder} ${r.branch} ${r.model} ${r.provider} ${grpName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (filtered.length === 0 && (q || prefs.sessStatus !== 'all' || groups.length === 0)) {
      const hasActiveFilters = prefs.sessProvider !== 'all' || prefs.sessStatus !== 'all' || Boolean(q);
      container.innerHTML = `
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
                ? `<button type="button" class="btn-ghost-sm" id="btn-reset-sess-filters">Reset Filters (${rows.filter((r) => !r.archived).length} Active)</button>`
                : ''
            }
            <button type="button" class="btn-brass-sm" id="btn-empty-sync-now">↻ Sync VS Code</button>
          </div>
        </div>
      `;
      return;
    }

    // Render collapsible Group sections at top when groups exist and not in Archived-only mode
    if (groups.length > 0 && prefs.sessStatus !== 'archived') {
      const groupPalette = ['blue', 'green', 'amber', 'purple', 'steel'];
      let sectionsHtml = '';
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

    container.innerHTML = filtered.map((r) => renderSessionCardHtml(r)).join('');
  }

  function coalesceThreadMessages(rawMessages) {
    if (!Array.isArray(rawMessages) || rawMessages.length === 0) return [];
    const merged = [];
    for (const m of rawMessages) {
      if (!m) continue;
      const prev = merged[merged.length - 1];
      if (prev && prev.role === 'assistant' && m.role === 'assistant') {
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

  function renderToolCallCardHtml(tc) {
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
        label = 'Viewed';
      } else if (low.includes('command') || low === 'bash') {
        kind = 'command';
        label = 'Ran command';
      } else if (low.includes('grep') || low.includes('find') || low.includes('glob') || low.includes('search')) {
        kind = 'search';
        label = 'Searched';
      }
    }

    const fileBase = String(tc?.file || '').trim();
    const lineRange = String(tc?.lineRange || '').trim();
    const added = Number(tc?.addedLines || 0);
    const removed = Number(tc?.removedLines || 0);
    const summaryText = String(tc?.summary || '').trim();
    const snippet = String(tc?.snippet || '').trim();

    const fileChip = fileBase
      ? renderFileChipHtml(lineRange ? `${fileBase}#${lineRange}` : fileBase)
      : '';
    const diffBadge =
      added > 0 || removed > 0
        ? `<span class="code-diff-stat tabular">${added > 0 ? `<span class="diff-add">+${added}</span>` : ''}${removed > 0 ? `<span class="diff-del">-${removed}</span>` : ''}</span>`
        : '';

    const displaySummary =
      fileBase && summaryText === fileBase
        ? ''
        : summaryText.slice(0, 110);

    const headInner = `
      <div class="code-step-head">
        <span class="code-step-badge kind-${esc(kind)}">${esc(label)}</span>
        ${fileChip}
        ${displaySummary ? `<span class="code-step-summary mono">${esc(displaySummary)}</span>` : ''}
        ${diffBadge}
      </div>
    `;

    if (snippet) {
      return `
        <details class="code-step-card has-snippet">
          <summary>${headInner}</summary>
          <pre class="code-step-snippet mono">${formatGitDiffHtml(snippet)}</pre>
        </details>
      `;
    }
    return `<div class="code-step-card">${headInner}</div>`;
  }

  // VIEW 3: Render Live Chat Workbench
  function renderChatView(forceScroll = false) {
    ensureSelectedThread();
    updateComposerModePills();
    const rows = (appState?.rows || []).filter((r) => r.id && !r.draft);
    const threadDetail = threadsCache[prefs.selectedThreadId] || null;
    const matchedRow = rows.find((r) => r.id === prefs.selectedThreadId);
    const activeRow =
      matchedRow ||
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
    if (selectEl) {
      const topRows = rows.slice(0, 80);
      if (prefs.selectedThreadId && activeRow && !topRows.some((r) => r.id === prefs.selectedThreadId)) {
        topRows.unshift(activeRow);
      }
      selectEl.innerHTML = topRows
        .map(
          (r) =>
            `<option value="${esc(r.id)}" ${r.id === prefs.selectedThreadId ? 'selected' : ''}>[${r.provider === 'claude' ? 'Claude' : 'AGY'}] ${esc(r.title)} (${timeAgo(r.at)})</option>`
        )
        .join('');
    }

    const provKey = (threadDetail?.provider || activeRow?.provider) === 'claude' ? 'claude' : 'antigravity';

    const badgeEl = $('chat-prov-badge');
    if (badgeEl) {
      badgeEl.innerHTML = `<span class="prov-glyph">${PROVIDER_ICONS[provKey]}</span>`;
    }
    const folderLabel =
      threadDetail?.folder ||
      activeRow?.folder ||
      (prefs.composerRepoPrefix ? `Scope: ${prefs.composerRepoPrefix}` : 'BHFIRMS Workspace');
    const folderEl = $('chat-folder-pill');
    if (folderEl) {
      folderEl.textContent = folderLabel;
    }

    // Keep selectedRepoId aligned with the active session's workspace if a matching repo exists
    if (folderLabel && Array.isArray(appState?.workspaces)) {
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
    let usedTokens = Number(rawCtx.usedTokens || activeRow?.usedTokens || 22019);
    if (provKey === 'antigravity' && (rawLimit === 1000000 || usedTokens > 256000)) {
      usedTokens = Math.min(220000, Math.max(22019, Math.round(usedTokens * 0.145)));
    }
    const pct = Math.min(
      100,
      Math.max(1, Math.round((usedTokens / Math.max(1, limitTokens)) * 100))
    );
    const breakdownArr = Array.isArray(rawCtx.breakdown)
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
      const offset = circum - (Math.min(100, Math.max(2, ctx.pct)) / 100) * circum;
      circle.setAttribute('stroke-dashoffset', String(offset));
    }

    renderContextPopover(ctx);

    // Conversation Stream
    const streamEl = $('chat-stream');
    if (!streamEl) return;
    if (
      !forceScroll &&
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
      (a) => a && a.sessionId === prefs.selectedThreadId && a.kind !== 'waiting_session'
    );
    const matchingQuestionApproval = sessionApprovals.find(
      (a) =>
        a.kind === 'question' ||
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
              <div class="approval-actions">
                <button type="button" class="btn-approve" data-approve-act="approve" data-app-id="${esc(a.approvalId)}" data-sess-id="${esc(a.sessionId)}" data-prov="${aProv}" data-sel="${esc(a.selector || '')}" data-lbl="${esc(a.toolName || 'Accept')}">✓ Approve</button>
                <button type="button" class="btn-reject" data-approve-act="reject" data-app-id="${esc(a.approvalId)}" data-sess-id="${esc(a.sessionId)}" data-prov="${aProv}" data-sel="${esc(a.selector || '')}">✕ Deny</button>
              </div>
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
      const turnsHtml = messages
        .map((m, msgIdx) => {
          const isUser = m.role === 'user';
          const isLastTurn = msgIdx === messages.length - 1;
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
            `<span>⚡ ${toolCount} tool ${toolCount === 1 ? 'step' : 'steps'}</span>`
          );
          const summaryLabelHtml = `<span class="tools-summary-left">${summaryHtmlParts.join(' <span style="opacity:0.5">·</span> ')}</span><span class="tools-summary-chevron">›</span>`;

          const toolCardsHtml = toolCalls.length
            ? `<div class="code-steps-stack">${toolCalls.map((tc) => renderToolCallCardHtml(tc)).join('')}</div>`
            : '';

          const artifacts = Array.isArray(m.artifacts) ? m.artifacts : [];
          const artifactsHtml = artifacts
            .map(
              (art) => `
                <details class="vs-artifact-card">
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
              `
            )
            .join('');

          const timeLabel = m.createdAt ? timeAgo(Date.parse(m.createdAt)) : '';

          if (isUser) {
            return `
              <div class="turn-bubble user">
                <div class="turn-text">${esc(m.text || '')}</div>
              </div>
            `;
          }

          const { questions: turnQuestions, cleanedText } = resolveQuestionsForTurn(
            m,
            isLastTurn ? matchingQuestionApproval : null
          );
          const hasTurnQuestions = turnQuestions.length > 0;
          if (isLastTurn && hasTurnQuestions) {
            questionRenderedInTurn = true;
          }

          const toolsHtml = toolCalls.length
            ? cleanedText || hasTurnQuestions
              ? `<details class="tools-details" ${isLastTurn && activeRow?.status === 'working' ? 'open' : ''}><summary>${summaryLabelHtml}</summary>${toolCardsHtml}</details>`
              : `<div class="active-tools-panel"><div class="active-tools-hdr">${summaryHtmlParts.join(' · ')}</div>${toolCardsHtml}</div>`
            : '';

          const liveThought =
            !cleanedText && !hasTurnQuestions && (m.latestThinking || m.thinking)
              ? String(m.latestThinking || m.thinking)
                  .trim()
                  .split(/\n\n+/)
                  .pop()
              : '';

          const thinkHtml = m.thinking
            ? `<details class="thinking-details" ${!cleanedText && !hasTurnQuestions && isLastTurn ? 'open' : ''}><summary>Reasoning &amp; Internal Thought</summary><div class="turn-text mono" style="margin-top:6px">${esc(m.thinking)}</div></details>`
            : liveThought
              ? `<div class="thinking-details"><div class="turn-text mono">${esc(liveThought)}</div></div>`
              : '';

          const questionCardHtml = hasTurnQuestions
            ? renderInteractiveQuestionCardHtml({
                cardKey:
                  isLastTurn && matchingQuestionApproval
                    ? `q-chat-${prefs.selectedThreadId}-${matchingQuestionApproval.approvalId || 'active'}`
                    : `q-turn-${prefs.selectedThreadId}-${m.id || msgIdx}`,
                sessionId: prefs.selectedThreadId,
                provider: provKey,
                approvalId:
                  (isLastTurn && matchingQuestionApproval?.approvalId) || prefs.selectedThreadId,
                selector: (isLastTurn && matchingQuestionApproval?.selector) || '',
                plainQuestionFallback:
                  !matchingQuestionApproval && (!Array.isArray(m.questions) || m.questions.length === 0),
                questions: turnQuestions
              })
            : '';

          return `
            <div class="turn-bubble assistant">
              ${thinkHtml}
              ${cleanedText ? `<div class="turn-text md-rich">${formatTurnMarkdown(cleanedText)}</div>` : ''}
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
      s = s.replace(
        /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener">$1</a>'
      );
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
    barEl.innerHTML = bd
      .map((item) => {
        const w = Math.max(4, Math.round((Number(item.tokens || 0) / totalBd) * 100));
        return `<div style="width:${w}%;background:${item.color || '#D9A54A'}" title="${esc(item.label)}"></div>`;
      })
      .join('');
    listEl.innerHTML = bd
      .map(
        (item) => `
        <div class="ctx-bd-item">
          <span style="display:flex;align-items:center;gap:6px">
            <span style="width:8px;height:8px;border-radius:50%;background:${item.color || '#D9A54A'}"></span>
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

    const fetched = await fetchWorkspaceDetail(prefs.selectedRepoId);
    const repo =
      fetched?.workspace ||
      workspacesDetailCache[prefs.selectedRepoId] ||
      workspaces.find((w) => w.id === prefs.selectedRepoId);

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

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px;margin:14px 0">
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

    // Pairing & Security Configuration
    const pairingGrid = $('pairing-grid');
    if (pairingGrid) {
      const conn = appState?.connection || {};
      const lanUrl = conn.lanUrl || `http://localhost:${cloudCfg.port}/`;
      const pwaUrl = conn.pwaUrl || 'https://husseinbdeir.github.io/theo/';
      const hasPin = Boolean(localStorage.getItem(STORAGE_KEYS.PIN));

      pairingGrid.innerHTML = `
        <div class="pairing-card">
          <div class="eyebrow">HYBRID BRIDGE ENDPOINTS</div>
          <p class="meta-timestamp" style="margin:6px 0">Automatic switch between local Wi-Fi SSE (:4318) and zero-VPN Dataverse Cloud Relay.</p>
          <div class="mono" style="font-size:11.5px;margin-top:8px">
            <div><strong>Hosted PWA:</strong> ${esc(pwaUrl)}</div>
            <div style="margin-top:4px"><strong>LAN Direct:</strong> ${esc(lanUrl)}</div>
          </div>
          <label style="display:block;font-size:11.5px;margin-top:10px;color:var(--text-muted)">
            Custom Direct Bridge URL (optional LAN IP / Tunnel):
            <input type="url" class="input-field mono" id="input-custom-bridge" value="${esc(prefs.customBridgeUrl || '')}" placeholder="http://192.168.1.x:4318">
          </label>
          <button type="button" class="btn-brass-sm" id="btn-save-bridge" style="margin-top:8px">Save &amp; Probe Bridge</button>
        </div>

        <div class="pairing-card">
          <div class="eyebrow">SECURITY &amp; CACHE</div>
          <p class="meta-timestamp" style="margin:6px 0">Protect remote mobile access with a 4-digit PIN lock on launch.</p>
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
            <button type="button" class="btn-ghost-sm" id="btn-set-pin">${hasPin ? 'Change / Clear 4-Digit PIN' : 'Enable 4-Digit PIN Lock'}</button>
            <a href="reset.html" class="btn-ghost-sm" style="text-decoration:none;display:inline-flex;align-items:center">Reset PWA Cache</a>
          </div>
        </div>
      `;
    }
  }

  // ---------- Daily 100-Point Discipline & Smart Reminders Views ----------
  function getActiveRemindersSummary(nowMs = Date.now()) {
    const delSet = new Set(personalLedger.deletedIds || []);
    const all = (personalLedger.reminders || []).filter((r) => r && r.id && !r.deleted && !delSet.has(r.id));
    const active = all.filter((r) => !r.completed);
    const completed = all.filter((r) => r.completed);
    let maturedCount = 0;
    let holdingCount = 0;
    let dueTodayCount = 0;
    let nextHoldItem = null;

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const eodMs = endOfToday.getTime();

    for (const item of active) {
      const b = classifyReminderBucket(item, nowMs);
      const tMs = Number(item.matureAt || item.dueAt || 0);
      if (b === 'urgent_matured') {
        maturedCount++;
      } else if (b === 'holding') {
        holdingCount++;
        if (tMs && (!nextHoldItem || tMs < Number(nextHoldItem.matureAt || nextHoldItem.dueAt || Infinity))) {
          nextHoldItem = item;
        }
      } else if (b === 'today' || (tMs && tMs <= eodMs)) {
        dueTodayCount++;
      }
    }

    const timersCount = active.filter(isTimerItem).length;
    const delegatedCount = active.filter(isDelegatedItem).length;

    return {
      all,
      active,
      completed,
      maturedCount,
      holdingCount,
      timersCount,
      delegatedCount,
      dueTodayCount,
      urgentTotal: maturedCount + dueTodayCount,
      nextHoldItem
    };
  }

  function updateDisciplineBadges() {
    const todayDisc = computeDayDiscipline(localIsoDate());
    const remSum = getActiveRemindersSummary();
    const railBadge = $('badge-discipline');
    const dockBadge = $('dock-badge-discipline');

    const label = remSum.maturedCount > 0 ? `${remSum.maturedCount}!` : `${todayDisc.score}%`;
    if (railBadge) {
      railBadge.textContent = label;
      railBadge.classList.toggle('alert', remSum.maturedCount > 0 || todayDisc.score < 50);
    }
    if (dockBadge) {
      dockBadge.textContent = label;
      dockBadge.hidden = false;
      dockBadge.classList.toggle('alert', remSum.maturedCount > 0 || todayDisc.score < 50);
    }
  }

  function renderPulseDisciplineSectionHtml() {
    const todayIso = localIsoDate();
    const d = computeDayDiscipline(todayIso);
    const remSum = getActiveRemindersSummary();
    const scoreColor =
      d.tone === 'emerald'
        ? 'var(--emerald)'
        : d.tone === 'brass'
          ? 'var(--brass)'
          : d.tone === 'amber'
            ? 'var(--amber)'
            : 'var(--crimson)';
    const deltaSign = d.deltaFromStart > 0 ? `+${d.deltaFromStart}%` : `${d.deltaFromStart}%`;

    const maturedItems = remSum.active
      .filter((r) => classifyReminderBucket(r) === 'urgent_matured')
      .slice(0, 2);
    const holdingItems = remSum.active
      .filter((r) => classifyReminderBucket(r) === 'holding')
      .sort((a, b) => Number(a.matureAt || a.dueAt || 0) - Number(b.matureAt || b.dueAt || 0))
      .slice(0, 2);
    const activeClusterCount = new Set(
      remSum.active.map(
        (r) =>
          r.customGroup ||
          getCategoryMeta(r.category || detectRelevanceCategory(r.title, r.kind).id).id
      )
    ).size;

    const delegatedCount = remSum.delegatedCount;
    const cmdUrl = './command/';

    return `
      <div class="pulse-disc-grid">
        <div class="pulse-disc-card" data-goto-tab="discipline">
          <div>
            <div class="eyebrow">DAILY 100-POINT DISCIPLINE · TODAY</div>
            <div class="pulse-disc-score-row" style="margin-top:4px">
              <div class="pulse-disc-big tabular" style="color:${scoreColor}">${d.score}%</div>
              <div>
                <div style="font-size:12px;font-weight:700;color:var(--text-primary)">
                  Starts at 50% · <span class="mono" style="color:${scoreColor}">${deltaSign} net</span>
                </div>
                <div class="meta-timestamp">
                  Do's: <strong style="color:var(--emerald)">+${d.doEarned}%</strong> (${d.doFullCount} full, ${d.doHalfCount} half) · Don'ts: <strong style="color:${d.dontLost > 0 ? 'var(--crimson)' : 'var(--text-secondary)'}">-${d.dontLost}%</strong> (${d.dontCleanCount}/5 clean)
                </div>
              </div>
            </div>
            <div class="disc-bar-track" style="margin-top:8px">
              <div class="disc-bar-midline" title="50% Starting Baseline"></div>
              <div class="disc-bar-fill" style="width:${d.score}%;background:${scoreColor}"></div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
            <a href="${cmdUrl}" class="chip-btn active" onclick="event.stopPropagation()" style="text-decoration:none">🎯 Command PWA ↗</a>
          </div>
        </div>

        <div class="pulse-disc-card" data-goto-tab="discipline">
          <div style="min-width:0;flex:1">
            <div class="eyebrow">THEO COMMAND · ZERO-SCROLL RADAR &amp; BHFIRMS DELEGATION</div>
            <div style="display:flex;gap:14px;align-items:baseline;margin-top:4px;flex-wrap:wrap">
              <div>
                <span class="pulse-disc-big tabular" style="font-size:24px;color:${remSum.maturedCount > 0 ? 'var(--amber)' : 'var(--text-primary)'}">${remSum.maturedCount}</span>
                <span class="meta-timestamp"> ready now</span>
              </div>
              <div>
                <span class="pulse-disc-big tabular" style="font-size:24px;color:var(--brass)">${remSum.timersCount}</span>
                <span class="meta-timestamp"> timers</span>
              </div>
              <div>
                <span class="pulse-disc-big tabular" style="font-size:24px;color:var(--emerald)">${delegatedCount}</span>
                <span class="meta-timestamp"> delegated</span>
              </div>
              <div>
                <span class="pulse-disc-big tabular" style="font-size:24px;color:var(--steel)">${remSum.active.length}</span>
                <span class="meta-timestamp"> across ${activeClusterCount || 0} cluster${activeClusterCount === 1 ? '' : 's'}</span>
              </div>
            </div>
            <div class="meta-timestamp" style="margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${
                maturedItems.length
                  ? `🔥 Ready: <strong>${esc(maturedItems[0].title)}</strong>`
                  : holdingItems.length
                    ? `⏳ Waiting: <strong>${esc(holdingItems[0].title)}</strong> (${formatHoldCountdown(holdingItems[0].matureAt || holdingItems[0].dueAt)})`
                    : `2×4 Zero-Scroll Bento Radar, Wait Timers & @Person WhatsApp Delegation.`
              }
            </div>
          </div>
          <div>
            <a href="${cmdUrl}" class="chip-btn active" onclick="event.stopPropagation()" style="text-decoration:none">Open Radar ↗</a>
          </div>
        </div>
      </div>
    `;
  }

  function renderWaitAdvisorInnerHtml() {
    const cat = detectRelevanceCategory(
      remDraft.title,
      remDraft.kind,
      remDraft.categoryOverride,
      remDraft.customGroup
    );
    const ctx = extractContextTags(remDraft.title);
    const sug = suggestPaymentWait(remDraft.title, remDraft.amount);
    const targetInfo = computeTargetTimestampFromChoice(
      remDraft.waitChoice,
      remDraft.title,
      remDraft.amount
    );
    const targetDateStr = targetInfo.targetMs
      ? new Date(targetInfo.targetMs).toLocaleString([], {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      : 'No alarm (Parked in cluster)';

    const isRecurring =
      remDraft.kind === 'recurring' ||
      (remDraft.kind === 'auto' && Boolean(targetInfo.isRecurring));

    const autoBtnLbl = sug.isParked
      ? `✨ Auto (Park · No Alarm)`
      : `✨ Auto (${sug.waitDays >= 1 ? `${sug.waitDays}d` : `${Math.max(1, Math.round(sug.waitDays * 24))}h`})`;

    const waitChips = [
      { k: 'auto', lbl: autoBtnLbl },
      { k: 'none', lbl: '📌 Park (No Timer)' },
      { k: '3h', lbl: 'In 3h' },
      { k: 'tonight', lbl: 'Tonight 20:30' },
      { k: '1d', lbl: '+24h / Tmrw' },
      { k: '2d', lbl: '+2d' },
      { k: '4d', lbl: '+4d' },
      { k: '5d', lbl: '+5d (Ship)' },
      { k: '7d', lbl: '+7d' },
      { k: '14d', lbl: '+14d' },
      { k: 'nextmon', lbl: 'Next Mon' }
    ];

    const recurChips = [
      { k: 'daily', lbl: '🔁 Daily' },
      { k: 'weekdays', lbl: '🏢 Weekdays (Mon–Fri)' },
      { k: 'weekly', lbl: '📅 Weekly' },
      { k: 'monthly', lbl: '🗓️ Monthly' }
    ];

    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap">
        <div style="min-width:0;flex:1">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--brass)">
            🧠 Smart Auto-Classifier · ${esc(targetInfo.label)}
          </div>
          <div class="meta-timestamp" style="margin-top:2px">
            ${esc(targetInfo.reason || sug.reason)}
          </div>
        </div>
        <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap">
          <span class="rem-badge cat" id="rem-auto-cat-chip" title="Auto-detected cluster">${cat.icon} ${esc(cat.label)}</span>
          ${ctx.allTags
            .map((t) => `<span class="rem-badge hold" title="Extracted context tag">${esc(t)}</span>`)
            .join('')}
          ${
            sug.amt > 0
              ? `<span class="rem-badge amt" title="Extracted amount">$${fmtInt(sug.amt)}</span>`
              : ''
          }
        </div>
      </div>

      <div class="wait-chip-row">
        ${waitChips
          .map(
            (c) => `
          <button type="button" class="wait-chip ${remDraft.waitChoice === c.k ? 'active' : ''}" data-wait-choice="${c.k}">
            ${esc(c.lbl)}
          </button>
        `
          )
          .join('')}
      </div>

      ${
        isRecurring
          ? `
        <div class="wait-chip-row" style="margin-top:6px;padding-top:6px;border-top:1px dashed var(--border-subtle)">
          <span class="meta-timestamp" style="align-self:center;margin-right:4px">Repeat:</span>
          ${recurChips
            .map(
              (rc) => `
            <button type="button" class="wait-chip ${remDraft.recur === rc.k ? 'active' : ''}" data-recur-choice="${rc.k}">
              ${esc(rc.lbl)}
            </button>
          `
            )
            .join('')}
        </div>
      `
          : ''
      }

      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:6px;border-top:1px solid var(--border-subtle);flex-wrap:wrap;gap:6px">
        <span class="meta-timestamp">
          🔔 Reminder / Wait Target: <strong class="mono" style="color:var(--text-primary)">${esc(targetDateStr)}</strong>
        </span>
        <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
          <span class="meta-timestamp" style="font-size:10.5px">Cluster:</span>
          <button type="button" class="wait-chip ${!remDraft.categoryOverride && !remDraft.customGroup ? 'active' : ''}" style="padding:2px 7px;font-size:10.5px" data-cat-override="">✨ Auto</button>
          ${Object.values(REM_CATEGORIES)
            .map(
              (c) => `
            <button type="button" class="wait-chip ${remDraft.categoryOverride === c.id && !remDraft.customGroup ? 'active' : ''}" style="padding:2px 7px;font-size:10.5px" data-cat-override="${c.id}" title="${esc(c.label)}">
              ${c.icon} ${esc(c.shortLabel || c.label)}
            </button>
          `
            )
            .join('')}
          <button type="button" class="wait-chip ${remDraft.customGroup ? 'active' : ''}" style="padding:2px 7px;font-size:10.5px" data-cat-custom="1" title="Create or assign a custom group">
            ${remDraft.customGroup ? `🏷️ ${esc(remDraft.customGroup)}` : '+ Custom'}
          </button>
        </div>
      </div>
    `;
  }

  function renderReminderCardHtml(item, nowMs = Date.now()) {
    const cat = getCategoryMeta(
      item.category || detectRelevanceCategory(item.title, item.kind).id,
      item.customGroup || ''
    );
    const ctx = extractContextTags(item.title);
    const subTag = item.subTag || ctx.subTag || '';
    const targetMs = Number(item.matureAt || item.dueAt || 0);
    const isParked = !targetMs || item.kind === 'parked';
    const isHold =
      !isParked &&
      (item.kind === 'payment' ||
        item.kind === 'wait' ||
        cat.id === 'verify' ||
        cat.id === 'shipping' ||
        cat.id === 'payments');
    const isMatured = !isParked && isHold && targetMs && nowMs >= targetMs && !item.completed;
    const isHolding = !isParked && isHold && targetMs && nowMs < targetMs && !item.completed;
    const isOverdue = !isParked && !isHold && targetMs && nowMs >= targetMs && !item.completed;

    const cardStateClass = item.completed
      ? 'completed'
      : isMatured
        ? 'matured'
        : isHolding
          ? 'holding'
          : isOverdue
            ? 'overdue'
            : '';

    const countdownTxt = formatHoldCountdown(targetMs, nowMs);
    const targetFormatted = targetMs
      ? new Date(targetMs).toLocaleString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      : '';

    let progressPct = 0;
    if (isHold && item.createdAt && targetMs > item.createdAt) {
      progressPct = Math.max(
        3,
        Math.min(100, Math.round(((nowMs - item.createdAt) / (targetMs - item.createdAt)) * 100))
      );
    } else if (isMatured) {
      progressPct = 100;
    }

    let kindBadge = '';
    if (isParked) {
      kindBadge = `<span class="rem-badge cat">📌 Parked · No Alarm</span>`;
    } else if (cat.id === 'verify') {
      kindBadge = `<span class="rem-badge ${isMatured ? 'matured' : 'hold'}">${isMatured ? '🔍 Check Now · Did It Show Up?' : `⏳ Verify Wait · ${countdownTxt}`}</span>`;
    } else if (cat.id === 'shipping') {
      kindBadge = `<span class="rem-badge ${isMatured ? 'matured' : 'hold'}">${isMatured ? '📦 Check Delivery / Tracking' : `📦 Shipping Timer · ${countdownTxt}`}</span>`;
    } else if (item.kind === 'payment' || cat.id === 'payments') {
      kindBadge = `<span class="rem-badge ${isMatured ? 'matured' : 'hold'}">${isMatured ? '🔓 Wait Complete · Ready to Pay' : `⏳ Payment Wait · ${countdownTxt}`}</span>`;
    } else if (item.kind === 'wait') {
      kindBadge = `<span class="rem-badge ${isMatured ? 'matured' : 'hold'}">${isMatured ? '🔓 Wait Complete' : `⏳ Waiting · ${countdownTxt}`}</span>`;
    } else if (item.kind === 'recurring') {
      kindBadge = `<span class="rem-badge recur">🔁 ${esc(item.recur || 'daily')} · ${esc(countdownTxt)}</span>`;
    } else {
      kindBadge = `<span class="rem-badge ${isOverdue ? 'matured' : 'cat'}">⏰ ${esc(countdownTxt)}</span>`;
    }

    const doneLabel =
      cat.id === 'verify'
        ? '✓ Verified'
        : cat.id === 'shipping'
          ? '✓ Received'
          : cat.id === 'people'
            ? '✓ Spoke'
            : item.kind === 'payment' || cat.id === 'payments'
              ? '✓ Paid / Done'
              : item.kind === 'recurring'
                ? '✓ Done & Roll'
                : '✓ Done';

    let delBadge = '';
    if (item.isDelegated || item.assigneeName) {
      const st = item.delegationStatus || 'assigned';
      const who = item.assigneeName || 'Team';
      const stLbl =
        st === 'done'
          ? `✅ ${who} · Done (Verify)`
          : st === 'working'
            ? `⚙️ ${who} · Working`
            : st === 'seen'
              ? `👀 ${who} · Seen`
              : st === 'sent'
                ? `📨 ${who} · Sent`
                : `👤 ${who}`;
      delBadge = `<span class="rem-badge ${st === 'done' ? 'matured' : 'hold'}">${esc(stLbl)}</span>`;
    } else if (subTag) {
      delBadge = `<span class="rem-badge hold">${esc(subTag)}</span>`;
    }

    const isHighlightedRem =
      Boolean(pinnedNavReminderId) &&
      pinnedNavReminderId === item.id &&
      Date.now() < pinnedNavUntil;

    return `
      <div class="rem-card ${cardStateClass}" data-rem-id="${esc(item.id)}" ${isHighlightedRem ? 'style="outline:2px solid var(--brass);box-shadow:0 0 0 4px rgba(217,165,74,0.22)"' : ''}>
        <div class="rem-card-top">
          <div class="rem-card-body" style="flex:1 1 240px;min-width:0">
            <div class="rem-card-title">${esc(item.title)}</div>
            <div class="rem-card-meta">
              <span class="rem-badge cat">${cat.icon} ${esc(cat.shortLabel || cat.label)}</span>
              ${delBadge}
              ${item.amount > 0 ? `<span class="rem-badge amt">$${fmtInt(item.amount)}</span>` : ''}
              ${kindBadge}
              ${targetFormatted ? `<span class="meta-timestamp">Target: ${esc(targetFormatted)}</span>` : ''}
            </div>
            ${
              item.staffNote
                ? `<div class="meta-timestamp" style="margin-top:4px;color:var(--emerald)">💬 <strong>${esc(item.assigneeName || 'Staff')}:</strong> ${esc(item.staffNote)}</div>`
                : ''
            }
          </div>
          <div class="rem-actions">
            ${
              !item.completed
                ? `
              <button type="button" class="rem-act-btn done" data-rem-act="done" data-rem-id="${esc(item.id)}">
                ${doneLabel}
              </button>
              <button type="button" class="rem-act-btn" data-rem-act="wait1d" data-rem-id="${esc(item.id)}" title="Wait / Snooze +24 hours">+24h</button>
              <button type="button" class="rem-act-btn" data-rem-act="wait3d" data-rem-id="${esc(item.id)}" title="Wait +3 days">+3d</button>
              ${
                isHolding
                  ? `<button type="button" class="rem-act-btn" data-rem-act="release" data-rem-id="${esc(item.id)}" title="Mark ready right now">Ready Now</button>`
                  : ''
              }
              <button type="button" class="rem-act-btn" data-rem-act="move-group" data-rem-id="${esc(item.id)}" title="Change group / sub-topic">🏷️</button>
            `
                : `
              <button type="button" class="rem-act-btn" data-rem-act="reopen" data-rem-id="${esc(item.id)}">↺ Reopen</button>
            `
            }
            <button type="button" class="rem-act-btn" data-rem-act="delete" data-rem-id="${esc(item.id)}" title="Delete">✕</button>
          </div>
        </div>
        ${
          isHold && !item.completed
            ? `
          <div class="hold-progress-track" title="Wait elapsed: ${progressPct}%">
            <div class="hold-progress-fill" style="width:${progressPct}%;background:${isMatured ? 'var(--emerald)' : 'var(--brass)'}"></div>
          </div>
        `
            : ''
        }
      </div>
    `;
  }

  function renderRemindersListHtml() {
    const nowMs = Date.now();
    const remSum = getActiveRemindersSummary(nowMs);
    const groupMode = prefs.remGroupMode || 'clusters'; // 'clusters' | 'subtopics' | 'urgency'
    const showDone = Boolean(prefs.remShowCompleted);

    if (!remSum.active.length && (!showDone || !remSum.completed.length)) {
      return `
        <div class="empty-card" style="padding:28px;text-align:center">
          <div style="font-size:15px;font-weight:700;color:var(--text-primary)">Your Smart Reminder &amp; Idea Clusters Are Clear</div>
          <p class="meta-timestamp" style="max-width:540px;margin:6px auto 0">
            Drop anything above — people to talk to, something you paid for that hasn't shown up on an app yet, shipping times, family tasks, specific work items, payments to hold, things you want to do, or ideas for later. THEO groups and times them automatically.
          </p>
        </div>
      `;
    }

    const groups = [];
    if (groupMode === 'urgency') {
      const buckets = [
        {
          id: 'urgent_matured',
          title: '🔥 Action Ready & Matured Wait Timers',
          sub: 'Wait timer expired or due right now — ready to check, talk, or act'
        },
        {
          id: 'holding',
          title: '⏳ Active Wait Timers (App Verify, Shipping & Payment Holds)',
          sub: 'Cooling off or in transit — THEO will push your phone when the timer matures'
        },
        {
          id: 'today',
          title: '⚡ Today & Due Soon',
          sub: 'Scheduled for today'
        },
        {
          id: 'recurring',
          title: '🔁 Recurring Routines',
          sub: 'Automatically rolls forward to the next cycle when marked done'
        },
        {
          id: 'upcoming',
          title: '📅 Upcoming Scheduled',
          sub: 'Future scheduled reminders'
        },
        {
          id: 'parked',
          title: '💡 Ideas for Later & Things I Want To Do (Parked)',
          sub: 'Saved cleanly in your clusters without a noisy alarm'
        }
      ];

      for (const b of buckets) {
        const items = remSum.active
          .filter((r) => classifyReminderBucket(r, nowMs) === b.id)
          .sort((x, y) => Number(x.matureAt || x.dueAt || 0) - Number(y.matureAt || y.dueAt || 0));
        if (items.length) {
          groups.push({ ...b, items });
        }
      }
    } else if (groupMode === 'subtopics') {
      // Dynamic Sub-Topics grouping: splits Work into Resorts / WTC / Trading / Holding, People by person, Verify by app, etc.
      const subMap = new Map();
      for (const item of remSum.active) {
        const cat = getCategoryMeta(
          item.category || detectRelevanceCategory(item.title, item.kind).id,
          item.customGroup || ''
        );
        const ctx = extractContextTags(item.title);
        const sub = item.subTag || ctx.subTag || '';
        const key = sub ? `${cat.icon} ${cat.shortLabel} · ${sub}` : `${cat.icon} ${cat.label}`;
        if (!subMap.has(key)) {
          subMap.set(key, {
            id: key,
            title: key,
            sub: cat.desc || 'Auto-detected sub-topic cluster',
            items: []
          });
        }
        subMap.get(key).items.push(item);
      }
      for (const g of subMap.values()) {
        g.items.sort(
          (x, y) =>
            Number(x.matureAt || x.dueAt || Infinity) - Number(y.matureAt || y.dueAt || Infinity)
        );
        groups.push(g);
      }
    } else {
      // Default: 'clusters' — Smart Life & Work Clusters (People, Verify/App, Shipping, Work, Family, Payments, Want-to-Do, Ideas + Custom)
      const bucketMap = new Map();
      for (const cat of Object.values(REM_CATEGORIES)) {
        bucketMap.set(cat.id, {
          id: cat.id,
          title: `${cat.icon} ${cat.label}`,
          sub: cat.desc,
          items: []
        });
      }
      for (const item of remSum.active) {
        const cat = getCategoryMeta(
          item.category || detectRelevanceCategory(item.title, item.kind).id,
          item.customGroup || ''
        );
        if (!bucketMap.has(cat.id)) {
          bucketMap.set(cat.id, {
            id: cat.id,
            title: `${cat.icon} ${cat.label}`,
            sub: 'Custom smart cluster',
            items: []
          });
        }
        bucketMap.get(cat.id).items.push(item);
      }
      for (const g of bucketMap.values()) {
        if (g.items.length) {
          g.items.sort(
            (x, y) =>
              Number(x.matureAt || x.dueAt || Infinity) - Number(y.matureAt || y.dueAt || Infinity)
          );
          groups.push(g);
        }
      }
    }

    return `
      <div class="rem-groups-grid">
        ${groups
          .map(
            (g) => `
          <div class="rem-group-block">
            <div class="rem-group-hdr">
              <div>
                <div class="rem-group-title">${esc(g.title)}</div>
                <div class="meta-timestamp" style="font-size:11px">${esc(g.sub || '')}</div>
              </div>
              <span class="chip-btn" style="pointer-events:none;font-size:11px;padding:2px 8px">${g.items.length}</span>
            </div>
            <div class="rem-list">
              ${g.items.map((item) => renderReminderCardHtml(item, nowMs)).join('')}
            </div>
          </div>
        `
          )
          .join('')}

        ${
          showDone && remSum.completed.length
            ? `
          <div class="rem-group-block">
            <div class="rem-group-hdr">
              <div class="rem-group-title">✓ Recently Completed (${remSum.completed.length})</div>
              <button type="button" class="btn-ghost-sm" data-rem-act="clear-done" style="font-size:11px;padding:2px 8px">Clear Completed</button>
            </div>
            <div class="rem-list">
              ${remSum.completed
                .slice(0, 15)
                .map((item) => renderReminderCardHtml(item, nowMs))
                .join('')}
            </div>
          </div>
        `
            : ''
        }
      </div>
    `;
  }

  function renderDisciplineView() {
    const root = $('discipline-view-root');
    if (!root) return;

    const todayIso = localIsoDate();
    if (!selectedScoreDate) selectedScoreDate = todayIso;
    const curDisc = computeDayDiscipline(selectedScoreDate);
    const isToday = selectedScoreDate === todayIso;

    const scoreColor =
      curDisc.tone === 'emerald'
        ? 'var(--emerald)'
        : curDisc.tone === 'brass'
          ? 'var(--brass)'
          : curDisc.tone === 'amber'
            ? 'var(--amber)'
            : 'var(--crimson)';
    const deltaSign =
      curDisc.deltaFromStart > 0 ? `+${curDisc.deltaFromStart}%` : `${curDisc.deltaFromStart}%`;

    // Build 7-day trend array ending today
    const historyDays = [];
    let sevenDaySum = 0;
    for (let i = 6; i >= 0; i--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - i);
      const iso = localIsoDate(dt);
      const dayStat = computeDayDiscipline(iso);
      sevenDaySum += dayStat.score;
      const dayName =
        i === 0
          ? 'Today'
          : dt.toLocaleDateString([], { weekday: 'short' });
      historyDays.push({
        iso,
        label: dayName,
        score: dayStat.score,
        tone: dayStat.tone,
        selected: iso === selectedScoreDate
      });
    }
    const sevenDayAvg = Math.round(sevenDaySum / 7);
    const remSum = getActiveRemindersSummary();
    const groupMode = prefs.remGroupMode || 'clusters';

    const cmdUrl = './command/';

    root.innerHTML = `
      ${renderPulseNotifBannerHtml()}

      <div class="push-banner-card" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;border-color:var(--brass)">
        <div style="min-width:220px;flex:1">
          <div class="eyebrow" style="color:var(--brass)">STANDALONE ZERO-SCROLL EXECUTIVE APP</div>
          <div style="font-size:15px;font-weight:800;margin-top:2px">🎯 THEO Command — 2×4 Bento Radar, Wait Timers &amp; BHFIRMS Delegation</div>
          <div class="meta-timestamp" style="margin-top:3px">
            Zero-scroll 8-cluster Radar grid, 52px Top Discipline HUD, @Person WhatsApp delegation &amp; private 1-task staff status links.
          </div>
        </div>
        <a href="${cmdUrl}" class="btn-brass-sm" style="text-decoration:none;display:inline-flex;align-items:center;gap:6px">
          🚀 Open THEO Command PWA ↗
        </a>
      </div>

      <!-- 1. Daily 100-Point Discipline Hero Banner -->
      <div class="disc-hero-card">
        <div class="disc-score-head">
          <div>
            <div class="eyebrow">DAILY 100-POINT PERSONAL DISCIPLINE LEDGER</div>
            <div class="disc-score-big-wrap" style="margin-top:4px">
              <div class="disc-score-big tabular" style="color:${scoreColor}">${curDisc.score}%</div>
              <div class="disc-score-delta">
                <span class="chip-btn active" style="pointer-events:none;font-size:11px;padding:2px 9px">
                  Baseline 50% · ${deltaSign}
                </span>
                <span class="meta-timestamp">
                  7-Day Avg: <strong class="mono">${sevenDayAvg}%</strong>
                </span>
              </div>
            </div>
          </div>

          <div class="disc-date-nav">
            <button type="button" data-disc-date-act="prev" title="Previous day">‹ Prev</button>
            <span class="disc-date-label mono">${isToday ? `Today · ${selectedScoreDate}` : selectedScoreDate}</span>
            <button type="button" data-disc-date-act="today" ${isToday ? 'disabled style="opacity:0.4"' : ''}>Today</button>
            <button type="button" data-disc-date-act="next" ${isToday ? 'disabled style="opacity:0.4"' : ''} title="Next day">Next ›</button>
          </div>
        </div>

        <div class="disc-bar-track">
          <div class="disc-bar-midline" title="50% Day-Start Baseline (All 5 Don'ts Intact)"></div>
          <div class="disc-bar-fill" style="width:${curDisc.score}%;background:${scoreColor}"></div>
        </div>

        <div class="disc-formula-pills">
          <span class="disc-pill">🛡️ Day Start: <strong>50%</strong> (5 Don'ts intact)</span>
          <span class="disc-pill good">⚡ 5 Do's Earned: <strong>+${curDisc.doEarned}%</strong> / +50%</span>
          <span class="disc-pill ${curDisc.dontLost > 0 ? 'bad' : ''}">🚫 5 Don'ts Penalties: <strong>-${curDisc.dontLost}%</strong> (${curDisc.dontKept}% kept)</span>
          <button type="button" class="btn-ghost-sm" data-disc-date-act="reset-day" style="margin-left:auto;font-size:11px;padding:3px 9px">Reset ${isToday ? 'Today' : selectedScoreDate} to 50%</button>
        </div>

        <!-- 7-Day Spark Strip -->
        <div class="disc-history-strip">
          ${historyDays
            .map((hd) => {
              const c =
                hd.tone === 'emerald'
                  ? 'var(--emerald)'
                  : hd.tone === 'brass'
                    ? 'var(--brass)'
                    : hd.tone === 'amber'
                      ? 'var(--amber)'
                      : 'var(--crimson)';
              return `
                <div class="disc-day-cell ${hd.selected ? 'today' : ''}" data-disc-pick-date="${hd.iso}">
                  <div class="disc-day-lbl">${esc(hd.label)}</div>
                  <div class="disc-day-val tabular" style="color:${c}">${hd.score}%</div>
                  <div class="disc-day-mini-bar">
                    <div class="disc-day-mini-fill" style="width:${hd.score}%;background:${c}"></div>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>

      <!-- 2. Two-Column 5 DO'S (+50%) & 5 DON'TS (50% Shield) -->
      <div class="disc-top-grid">
        <!-- 5 DO'S -->
        <div class="disc-col-card">
          <div class="disc-col-hdr">
            <div>
              <div class="disc-col-title" style="color:var(--emerald)">✅ The 5 Daily Do's (+10% Full · +5% Partial)</div>
              <div class="meta-timestamp">Build momentum upward from your 50% baseline</div>
            </div>
            <span class="chip-btn active" style="pointer-events:none">+${curDisc.doEarned}% / 50%</span>
          </div>

          <div class="habit-list">
            ${DAILY_DOS.map((item) => {
              const st = curDisc.dos[item.id] || 'none';
              return `
                <div class="habit-row">
                  <div class="habit-info">
                    <span class="habit-icon">${item.icon}</span>
                    <div style="min-width:0">
                      <div class="habit-name">${esc(item.label)}</div>
                      <div class="habit-sub">${esc(item.sub || item.hint || '')}</div>
                    </div>
                  </div>
                  <div class="habit-btn-group">
                    <button type="button" class="habit-btn ${st === 'none' ? 'active-neutral' : ''}" data-habit-group="do" data-habit-id="${item.id}" data-habit-val="none">0%</button>
                    <button type="button" class="habit-btn ${st === 'half' ? 'active-do-half' : ''}" data-habit-group="do" data-habit-id="${item.id}" data-habit-val="half">+5% Half</button>
                    <button type="button" class="habit-btn ${st === 'full' ? 'active-do-full' : ''}" data-habit-group="do" data-habit-id="${item.id}" data-habit-val="full">+10% Full</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- 5 DON'TS -->
        <div class="disc-col-card">
          <div class="disc-col-hdr">
            <div>
              <div class="disc-col-title" style="color:var(--brass)">🛡️ The 5 Daily Don'ts (Start w/ 50% · -5% Half · -10% Slip)</div>
              <div class="meta-timestamp">You start with all 50% intact — protect your shield</div>
            </div>
            <span class="chip-btn ${curDisc.dontLost > 0 ? '' : 'active'}" style="pointer-events:none;${curDisc.dontLost > 0 ? 'border-color:var(--crimson);color:var(--crimson)' : ''}">
              ${curDisc.dontKept}% / 50% Kept
            </span>
          </div>

          <div class="habit-list">
            ${DAILY_DONTS.map((item) => {
              const st = curDisc.donts[item.id] || 'clean';
              return `
                <div class="habit-row">
                  <div class="habit-info">
                    <span class="habit-icon">${item.icon}</span>
                    <div style="min-width:0">
                      <div class="habit-name">${esc(item.label)}</div>
                      <div class="habit-sub">${esc(item.sub || item.hint || '')}</div>
                    </div>
                  </div>
                  <div class="habit-btn-group">
                    <button type="button" class="habit-btn ${st === 'clean' ? 'active-dont-clean' : ''}" data-habit-group="dont" data-habit-id="${item.id}" data-habit-val="clean">10% Kept</button>
                    <button type="button" class="habit-btn ${st === 'half' ? 'active-dont-half' : ''}" data-habit-group="dont" data-habit-id="${item.id}" data-habit-val="half">-5% Half</button>
                    <button type="button" class="habit-btn ${st === 'broken' ? 'active-dont-broke' : ''}" data-habit-group="dont" data-habit-id="${item.id}" data-habit-val="broken">-10% Slip</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- 3. Universal Brain-Dump & Smart Auto-Grouping Composer -->
      <div class="rem-composer-card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
          <div>
            <div class="eyebrow">SMART REMINDERS · AI AUTO-GROUPING &amp; WAIT TIMERS</div>
            <h3 style="font-size:15px;font-weight:700;margin:2px 0 0">Drop Anything — Auto-Grouped by Context, Topic &amp; Wait Time</h3>
          </div>
          <div class="rem-type-seg">
            <button type="button" class="${remDraft.kind === 'auto' ? 'active' : ''}" data-rem-kind="auto">✨ Smart Auto</button>
            <button type="button" class="${remDraft.kind === 'wait' ? 'active' : ''}" data-rem-kind="wait">⏳ Wait / Verify</button>
            <button type="button" class="${remDraft.kind === 'task' ? 'active' : ''}" data-rem-kind="task">⚡ Task / Reach Out</button>
            <button type="button" class="${remDraft.kind === 'recurring' ? 'active' : ''}" data-rem-kind="recurring">🔁 Recurring</button>
            <button type="button" class="${remDraft.kind === 'parked' ? 'active' : ''}" data-rem-kind="parked">💡 Idea / Later</button>
          </div>
        </div>

        <form class="rem-composer-form" id="rem-composer-form">
          <div class="rem-input-row">
            <input
              type="text"
              class="rem-input"
              id="rem-title-input"
              value="${esc(remDraft.title)}"
              placeholder="e.g., Talk to Rami about WTC · Paid $45 on Whish &amp; didn't show up · Shipping 6 days for parts · Family dinner · Idea for later…"
              autocomplete="off"
            >
            <button type="submit" class="btn-brass-sm" style="padding:10px 18px;font-size:13px;white-space:nowrap">
              + Add &amp; Auto-Group
            </button>
          </div>

          <div class="wait-advisor-box" id="wait-advisor-live">
            ${renderWaitAdvisorInnerHtml()}
          </div>
        </form>
      </div>

      <!-- 4. Auto-Grouping Controls & Active Reminders Stream -->
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="eyebrow">VIEW GROUPS BY:</span>
          <div class="seg-control">
            <button type="button" class="seg-btn ${groupMode === 'clusters' ? 'active' : ''}" data-rem-group-mode="clusters">
              🧠 Smart Clusters (${remSum.active.length})
            </button>
            <button type="button" class="seg-btn ${groupMode === 'subtopics' ? 'active' : ''}" data-rem-group-mode="subtopics">
              🏷️ Sub-Topics &amp; People
            </button>
            <button type="button" class="seg-btn ${groupMode === 'urgency' ? 'active' : ''}" data-rem-group-mode="urgency">
              🔥 Urgency &amp; Timers
            </button>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <button type="button" class="chip-btn active" data-rem-act="ai-regroup" title="Re-analyze and organize all active tasks into smart clusters &amp; sub-topics">
            ✨ AI Auto-Group All
          </button>
          <button type="button" class="chip-btn ${prefs.remShowCompleted ? 'active' : ''}" data-rem-toggle-done="1">
            ${prefs.remShowCompleted ? 'Hide' : 'Show'} Completed (${remSum.completed.length})
          </button>
        </div>
      </div>

      <div id="rem-list-live">
        ${renderRemindersListHtml()}
      </div>

      <div style="margin-top:16px">
        ${renderPushSettingsCardHtml()}
      </div>
    `;

    if (pinnedNavReminderId && Date.now() < pinnedNavUntil) {
      setTimeout(() => {
        const targetEl = root.querySelector(`[data-rem-id="${CSS.escape(pinnedNavReminderId)}"]`);
        if (targetEl && typeof targetEl.scrollIntoView === 'function') {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 60);
    }
  }

  function addReminderFromDraft() {
    const titleEl = $('rem-title-input');
    const amtEl = $('rem-amt-input');
    if (titleEl) remDraft.title = titleEl.value.trim();
    if (amtEl) remDraft.amount = amtEl.value.trim();

    if (!remDraft.title) {
      showToast('Type any reminder, wait check, person to talk to, or idea first');
      titleEl?.focus();
      return;
    }

    const nowMs = Date.now();
    const amount = parseAmountFromText(remDraft.title, remDraft.amount);
    const cat = detectRelevanceCategory(
      remDraft.title,
      remDraft.kind,
      remDraft.categoryOverride,
      remDraft.customGroup
    );
    const ctx = extractContextTags(remDraft.title);
    const targetInfo = computeTargetTimestampFromChoice(
      remDraft.waitChoice,
      remDraft.title,
      remDraft.amount
    );

    const resolvedKind =
      remDraft.kind === 'auto'
        ? targetInfo.inferredKind ||
          (cat.id === 'verify' || cat.id === 'shipping'
            ? 'wait'
            : cat.id === 'payments'
              ? 'payment'
              : cat.id === 'ideas' || cat.id === 'want_to_do'
                ? 'parked'
                : 'task')
        : remDraft.kind;

    const isHoldType =
      resolvedKind === 'payment' ||
      resolvedKind === 'wait' ||
      cat.id === 'verify' ||
      cat.id === 'shipping' ||
      cat.id === 'payments';

    const isDelegated = Boolean(ctx.personTag);
    const newItem = {
      id: `rem_${nowMs.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      title: remDraft.title,
      kind: resolvedKind,
      amount: amount > 0 ? amount : 0,
      category: cat.id,
      customGroup: remDraft.customGroup || '',
      subTag: ctx.subTag || '',
      subGroup: ctx.subTag || '',
      waitDays: targetInfo.waitDays,
      waitLabel: targetInfo.label,
      recur:
        resolvedKind === 'recurring'
          ? targetInfo.recur || remDraft.recur || 'daily'
          : 'none',
      createdAt: nowMs,
      updatedAt: nowMs,
      matureAt: isHoldType && targetInfo.targetMs ? targetInfo.targetMs : 0,
      dueAt: targetInfo.targetMs || 0,
      completed: false,
      status: 'open',
      completedAt: 0,
      isDelegated,
      assigneeName: ctx.personTag || '',
      delegationStatus: isDelegated ? 'assigned' : ''
    };

    personalLedger.reminders.unshift(newItem);
    personalLedger.updatedAt = nowMs;

    // Reset draft inputs
    remDraft.title = '';
    remDraft.amount = '';
    remDraft.waitChoice = 'auto';
    remDraft.categoryOverride = '';
    remDraft.customGroup = '';

    haptic(15);
    playChime('send');
    persistAndSyncPersonalLedger();
    if (newItem.dueAt || newItem.matureAt) {
      scheduleExactReminderPush(newItem);
    }
    renderAll();

    showToast(`${cat.icon} Grouped in "${cat.shortLabel || cat.label}" · ${targetInfo.label}`);
  }

  async function runAiSmartGrouping() {
    const nowMs = Date.now();
    let updatedCount = 0;
    for (const r of personalLedger.reminders || []) {
      if (!r || r.deleted) continue;
      const cat = detectRelevanceCategory(r.title, r.kind, '', r.customGroup || '');
      const ctx = extractContextTags(r.title);
      if (r.category !== cat.id || r.subTag !== (ctx.subTag || '')) {
        r.category = cat.id;
        r.subTag = ctx.subTag || '';
        r.updatedAt = nowMs;
        updatedCount++;
      }
      if (!r.amount) {
        const amt = parseAmountFromText(r.title);
        if (amt > 0) {
          r.amount = amt;
          r.updatedAt = nowMs;
        }
      }
    }

    // Also invoke local bridge AI cluster refinement if connected
    if (localBridgeBase) {
      try {
        const res = await fetch(`${localBridgeBase}/api/ai-group-reminders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reminders: personalLedger.reminders })
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.personalLedger) {
            mergePersonalLedger(data.personalLedger);
          }
        }
      } catch {}
    }

    personalLedger.updatedAt = nowMs;
    persistAndSyncPersonalLedger();
    renderAll();
    showToast(
      `✨ Smart Auto-Grouping complete (${updatedCount} item${updatedCount === 1 ? '' : 's'} refined)`
    );
  }

  function promptMoveReminderGroup(id) {
    const item = (personalLedger.reminders || []).find((r) => r && r.id === id);
    if (!item) return;
    const next = prompt(
      'Enter group name (or people, verify, shipping, work, family, payments, want_to_do, ideas):',
      item.customGroup || item.category || ''
    );
    if (next === null) return;
    const clean = next.trim();
    const key = clean.toLowerCase().replace(/\s+/g, '_');
    if (!clean) {
      item.customGroup = '';
      item.category = detectRelevanceCategory(item.title, item.kind).id;
    } else if (REM_CATEGORIES[key]) {
      item.category = key;
      item.customGroup = '';
    } else {
      item.customGroup = clean;
      item.category = `custom:${clean}`;
    }
    item.updatedAt = Date.now();
    personalLedger.updatedAt = Date.now();
    persistAndSyncPersonalLedger();
    renderAll();
    showToast(`🏷️ Moved to ${item.customGroup || REM_CATEGORIES[item.category]?.label || clean}`);
  }

  function completeReminder(id) {
    const item = (personalLedger.reminders || []).find((r) => r && r.id === id);
    if (!item) return;
    const nowMs = Date.now();

    if (item.kind === 'recurring' && !item.completed) {
      // Roll recurring task forward to its next cycle
      let nextStepMs = 24 * 3600 * 1000;
      if (item.recur === 'weekly') nextStepMs = 7 * 24 * 3600 * 1000;
      else if (item.recur === 'monthly') nextStepMs = 30 * 24 * 3600 * 1000;
      else if (item.recur === 'weekdays') {
        const d = new Date();
        const dow = d.getDay();
        const addDays = dow === 5 ? 3 : dow === 6 ? 2 : 1;
        nextStepMs = addDays * 24 * 3600 * 1000;
      }
      item.lastCompletedAt = nowMs;
      item.dueAt = nowMs + nextStepMs;
      item.matureAt = item.dueAt;
      item.updatedAt = nowMs;
      personalLedger.updatedAt = nowMs;
      haptic(15);
      playChime('approve');
      persistAndSyncPersonalLedger();
      scheduleExactReminderPush(item);
      renderAll();
      showToast(`🔁 Completed & rolled forward (${item.recur || 'daily'})`);
      return;
    }

    item.completed = true;
    item.completedAt = nowMs;
    item.updatedAt = nowMs;
    personalLedger.updatedAt = nowMs;
    haptic(15);
    playChime('approve');
    cancelExactReminderPush(item.id);
    persistAndSyncPersonalLedger();
    renderAll();
    showToast('✓ Marked complete');
  }

  function reopenReminder(id) {
    const item = (personalLedger.reminders || []).find((r) => r && r.id === id);
    if (!item) return;
    item.completed = false;
    item.completedAt = 0;
    item.updatedAt = Date.now();
    personalLedger.updatedAt = Date.now();
    persistAndSyncPersonalLedger();
    renderAll();
    showToast('↺ Reminder reopened');
  }

  function extendReminderHold(id, extraDays) {
    const item = (personalLedger.reminders || []).find((r) => r && r.id === id);
    if (!item) return;
    const nowMs = Date.now();
    const baseMs = Math.max(nowMs, Number(item.matureAt || item.dueAt || nowMs));
    const nextMs = baseMs + extraDays * 24 * 3600 * 1000;
    item.matureAt = nextMs;
    item.dueAt = nextMs;
    if (item.kind === 'parked') item.kind = 'wait';
    item.waitDays = Number(item.waitDays || 0) + extraDays;
    item.updatedAt = nowMs;
    personalLedger.updatedAt = nowMs;
    alertedReminderIds.delete(item.id);
    haptic(10);
    persistAndSyncPersonalLedger();
    scheduleExactReminderPush(item);
    renderAll();
    showToast(`⏳ Extended timer by +${extraDays}d`);
  }

  function releaseReminderHoldNow(id) {
    const item = (personalLedger.reminders || []).find((r) => r && r.id === id);
    if (!item) return;
    const nowMs = Date.now();
    item.matureAt = nowMs - 1000;
    item.dueAt = nowMs - 1000;
    item.updatedAt = nowMs;
    personalLedger.updatedAt = nowMs;
    haptic(12);
    cancelExactReminderPush(item.id);
    persistAndSyncPersonalLedger();
    renderAll();
    showToast('🔓 Marked ready now');
  }

  function deleteReminder(id) {
    const item = (personalLedger.reminders || []).find((r) => r && r.id === id);
    if (!item && !id) return;
    if (!Array.isArray(personalLedger.deletedIds)) personalLedger.deletedIds = [];
    if (id && !personalLedger.deletedIds.includes(id)) {
      personalLedger.deletedIds.push(id);
    }
    personalLedger.reminders = (personalLedger.reminders || []).filter((r) => r && r.id !== id);
    personalLedger.updatedAt = Date.now();
    cancelExactReminderPush(id);
    persistAndSyncPersonalLedger();
    renderAll();
    showToast('Reminder removed');
  }

  function clearCompletedReminders() {
    const nowMs = Date.now();
    if (!Array.isArray(personalLedger.deletedIds)) personalLedger.deletedIds = [];
    for (const r of personalLedger.reminders || []) {
      if (r && r.completed && !r.deleted) {
        r.deleted = true;
        r.updatedAt = nowMs;
        if (r.id && !personalLedger.deletedIds.includes(r.id)) {
          personalLedger.deletedIds.push(r.id);
        }
      }
    }
    personalLedger.reminders = (personalLedger.reminders || []).filter((r) => r && !r.deleted);
    personalLedger.updatedAt = nowMs;
    persistAndSyncPersonalLedger();
    renderAll();
    showToast('Cleared completed items');
  }

  function stepScoreDate(deltaDays) {
    const parts = String(selectedScoreDate || localIsoDate()).split('-').map(Number);
    const dt = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
    dt.setDate(dt.getDate() + deltaDays);
    const nextIso = localIsoDate(dt);
    const todayIso = localIsoDate();
    selectedScoreDate = nextIso > todayIso ? todayIso : nextIso;
    renderDisciplineView();
  }

  function renderAll() {
    updateConnectionBanner();
    renderOutboxBadge();
    renderPulseView();
    renderSessionsView();
    if (prefs.activeTab === 'chat') renderChatView();
    if (prefs.activeTab === 'workspaces') renderWorkspacesView();
    if (prefs.activeTab === 'analytics') renderAnalyticsView();
  }

  let cmdPaletteMode = 'default';
  let composerAttachments = [];

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
            <button type="button" class="composer-attach-remove" data-remove-attach="${esc(a.id)}" title="Remove attachment">✕</button>
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
    cmdPaletteMode = 'repo-file';
    const modal = $('cmd-modal');
    const input = $('cmd-input');
    if (!modal || !input) return;
    modal.hidden = false;
    input.placeholder = 'Filter BHFIRMS workspace or modified git file to attach…';
    input.value = '';
    renderCommandPaletteResults('');
    setTimeout(() => input.focus(), 30);
  }

  // Command Palette (⌘K)
  function openCommandPalette() {
    cmdPaletteMode = 'default';
    const modal = $('cmd-modal');
    const input = $('cmd-input');
    if (!modal || !input) return;
    modal.hidden = false;
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
      const matchedRepos = repoItems.filter(
        (it) => !q || `${it.title} ${it.sub}`.toLowerCase().includes(q)
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
      { title: '🎯 Open Planner PWA (Planning, Tasks, Delegation, Score, Prayers)', sub: 'Standalone PWA ↗', act: 'open-command-pwa' },
      { title: '+ New Google Antigravity Session', sub: 'Action', act: 'new-agy' },
      { title: '+ New Claude Code Session', sub: 'Action', act: 'new-claude' },
      { title: 'Sync with VS Code & Cloud Relay Now', sub: 'Connectivity', act: 'sync' },
      { title: 'Enable / Test Web Push Notifications', sub: 'Notifications', act: 'push-test' },
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

    const matched = items.filter(
      (it) => !q || `${it.title} ${it.sub}`.toLowerCase().includes(q)
    );

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

  // PIN Lock Check
  function initPinLock() {
    const savedPin = localStorage.getItem(STORAGE_KEYS.PIN);
    if (!savedPin) return;
    const overlay = $('pin-overlay');
    if (!overlay) return;
    overlay.hidden = false;
    let entered = '';
    const updateDots = () => {
      document.querySelectorAll('#pin-dots span').forEach((s, idx) => {
        s.classList.toggle('filled', idx < entered.length);
      });
    };
    $('pin-pad')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-digit]');
      if (!btn) return;
      const d = btn.dataset.digit;
      if (d === 'clear') entered = '';
      else if (d === 'back') entered = entered.slice(0, -1);
      else if (entered.length < 4) entered += d;
      updateDots();
      if (entered.length === 4) {
        if (entered === savedPin) {
          overlay.hidden = true;
          playChime('confirm');
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
    draft.submittedSummary = humanSummary;

    haptic(20);
    playChime('approve');

    if (Array.isArray(appState?.approvals)) {
      appState.approvals = appState.approvals.filter(
        (a) => a.approvalId !== meta.approvalId && a.sessionId !== sessId
      );
    }

    const row = (appState?.rows || []).find((r) => r.id === sessId);
    if (row) {
      row.pendingQuestion = null;
      row.status = 'working';
      row.statusLabel = 'Running';
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
      threadsCache[sessId].messages.push({
        id: `opt-ans-${Date.now()}`,
        role: 'user',
        text: humanSummary,
        createdAt: new Date().toISOString(),
        optimistic: true,
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
      if (e.target.id === 'rem-title-input' || e.target.id === 'rem-amt-input') {
        const tEl = $('rem-title-input');
        const aEl = $('rem-amt-input');
        if (tEl) remDraft.title = tEl.value;
        if (aEl) remDraft.amount = aEl.value;
        const adv = $('wait-advisor-live');
        if (adv) adv.innerHTML = renderWaitAdvisorInnerHtml();
        return;
      }

      const qInput = e.target.closest('[data-q-writein-input]');
      if (qInput) {
        const cardKey = qInput.dataset.cardKey || '';
        const qIdx = Number(qInput.dataset.qIdx || 0);
        const draft = getQuestionDraft(cardKey);
        draft.writeInByQ[qIdx] = qInput.value;
        const meta = renderedQuestionsByCardKey.get(cardKey);
        const qCount = meta?.questions?.length || 1;
        const count = countDraftSelections(draft, qCount);
        const cardEl = qInput.closest('[data-q-card]');
        const subBtn = cardEl?.querySelector('[data-q-submit]');
        if (subBtn) {
          subBtn.textContent = `✓ Submit Answer${count > 0 ? ` (${count})` : ''}`;
        }
      }
    });

    document.addEventListener('keydown', (e) => {
      const qInput = e.target.closest?.('[data-q-writein-input]');
      if (qInput && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const cardKey = qInput.dataset.cardKey || '';
        if (cardKey) {
          submitInteractiveQuestionCard(cardKey, false);
        }
      }
    });

    document.addEventListener('submit', (e) => {
      if (e.target.id === 'rem-composer-form') {
        e.preventDefault();
        addReminderFromDraft();
      }
    });

    document.addEventListener('click', async (e) => {
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
          const totalCount = countDraftSelections(draft, qCount);
          const subBtn = cardEl.querySelector('[data-q-submit]');
          if (subBtn) {
            subBtn.textContent = `✓ Submit Answer${totalCount > 0 ? ` (${totalCount})` : ''}`;
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
      // 1. Daily 100-Point Habit Buttons (5 Do's & 5 Don'ts)
      const habitBtn = e.target.closest('[data-habit-group]');
      if (habitBtn) {
        haptic(12);
        const group = habitBtn.dataset.habitGroup;
        const habitId = habitBtn.dataset.habitId;
        const val = habitBtn.dataset.habitVal;
        setHabitState(selectedScoreDate || localIsoDate(), group, habitId, val);
        const updated = computeDayDiscipline(selectedScoreDate || localIsoDate());
        playChime(group === 'do' && val !== 'none' ? 'approve' : 'send');
        showToast(`Daily Score: ${updated.score}% (Do's +${updated.doEarned}%, Don'ts -${updated.dontLost}%)`);
        return;
      }

      // 2. Discipline Date Navigator & 7-Day Spark Strip
      const pickDateEl = e.target.closest('[data-disc-pick-date]');
      if (pickDateEl) {
        selectedScoreDate = pickDateEl.dataset.discPickDate || localIsoDate();
        renderDisciplineView();
        return;
      }

      const dateActBtn = e.target.closest('[data-disc-date-act]');
      if (dateActBtn) {
        const act = dateActBtn.dataset.discDateAct;
        if (act === 'prev') stepScoreDate(-1);
        else if (act === 'next') stepScoreDate(1);
        else if (act === 'today') {
          selectedScoreDate = localIsoDate();
          renderDisciplineView();
        } else if (act === 'reset-day') {
          const targetIso = selectedScoreDate || localIsoDate();
          personalLedger.dailyScores[targetIso] = {
            iso: targetIso,
            dos: {},
            donts: {},
            updatedAt: Date.now()
          };
          personalLedger.updatedAt = Date.now();
          persistAndSyncPersonalLedger();
          renderAll();
          showToast(`Reset ${targetIso} to 50% starting baseline`);
        }
        return;
      }

      // 3. Reminder Composer Mode & Wait Advisor Chips
      const kindBtn = e.target.closest('[data-rem-kind]');
      if (kindBtn) {
        remDraft.kind = kindBtn.dataset.remKind;
        if (remDraft.kind === 'parked') {
          remDraft.waitChoice = 'none';
        } else {
          remDraft.waitChoice = 'auto';
        }
        renderDisciplineView();
        $('rem-title-input')?.focus();
        return;
      }

      const waitChip = e.target.closest('[data-wait-choice]');
      if (waitChip) {
        remDraft.waitChoice = waitChip.dataset.waitChoice;
        const adv = $('wait-advisor-live');
        if (adv) adv.innerHTML = renderWaitAdvisorInnerHtml();
        return;
      }

      const recurChip = e.target.closest('[data-recur-choice]');
      if (recurChip) {
        remDraft.recur = recurChip.dataset.recurChoice;
        const adv = $('wait-advisor-live');
        if (adv) adv.innerHTML = renderWaitAdvisorInnerHtml();
        return;
      }

      const customCatBtn = e.target.closest('[data-cat-custom]');
      if (customCatBtn) {
        const nextGrp = prompt('Enter a custom group name (e.g., Travel, Shopping, Cars, Quarry):', remDraft.customGroup || '');
        if (nextGrp !== null) {
          remDraft.customGroup = nextGrp.trim();
          if (remDraft.customGroup) remDraft.categoryOverride = '';
          const adv = $('wait-advisor-live');
          if (adv) adv.innerHTML = renderWaitAdvisorInnerHtml();
        }
        return;
      }

      const catChip = e.target.closest('[data-cat-override]');
      if (catChip) {
        remDraft.categoryOverride = catChip.dataset.catOverride || '';
        remDraft.customGroup = '';
        const adv = $('wait-advisor-live');
        if (adv) adv.innerHTML = renderWaitAdvisorInnerHtml();
        return;
      }

      const grpModeBtn = e.target.closest('[data-rem-group-mode]');
      if (grpModeBtn) {
        prefs.remGroupMode = grpModeBtn.dataset.remGroupMode;
        saveJson(STORAGE_KEYS.PREFS, prefs);
        renderDisciplineView();
        return;
      }

      const toggleDoneBtn = e.target.closest('[data-rem-toggle-done]');
      if (toggleDoneBtn) {
        prefs.remShowCompleted = !prefs.remShowCompleted;
        saveJson(STORAGE_KEYS.PREFS, prefs);
        renderDisciplineView();
        return;
      }

      const remActBtn = e.target.closest('[data-rem-act]');
      if (remActBtn) {
        const act = remActBtn.dataset.remAct;
        const id = remActBtn.dataset.remId;
        if (act === 'done') completeReminder(id);
        else if (act === 'reopen') reopenReminder(id);
        else if (act === 'wait1d') extendReminderHold(id, 1);
        else if (act === 'wait2d') extendReminderHold(id, 2);
        else if (act === 'wait3d') extendReminderHold(id, 3);
        else if (act === 'wait7d') extendReminderHold(id, 7);
        else if (act === 'release') releaseReminderHoldNow(id);
        else if (act === 'move-group') promptMoveReminderGroup(id);
        else if (act === 'ai-regroup') await runAiSmartGrouping();
        else if (act === 'delete') deleteReminder(id);
        else if (act === 'clear-done') clearCompletedReminders();
        return;
      }

      const pushBtn = e.target.closest('[data-push-act]');
      if (pushBtn) {
        haptic(10);
        const act = pushBtn.dataset.pushAct;
        if (act === 'header-bell') {
          const nf = Object.assign({ ...DEFAULT_NOTIF }, prefs.notif || {});
          const active = Boolean(nf.enabled && pushSub && notifPerm() === 'granted');
          if (!active) {
            saveJson(STORAGE_KEYS.PUSH_HINT, 0);
            await enablePush();
          } else {
            await sendTestPush(false);
          }
          return;
        }
        if (act === 'enable') {
          await enablePush();
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

      const tabBtn = e.target.closest('[data-tab]');
      if (tabBtn) {
        haptic(8);
        clearPinnedNav();
        switchTab(tabBtn.dataset.tab);
        return;
      }

      const gotoBtn = e.target.closest('[data-goto-tab]');
      if (gotoBtn) {
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
        return;
      }

      const quickNew = e.target.closest('[data-quick-new]');
      if (quickNew) {
        clearPinnedNav();
        const prov = quickNew.dataset.quickNew;
        prefs.composerMode = prov === 'claude' ? 'new-claude' : 'new-antigravity';
        switchTab('chat');
        updateComposerModePills();
        $('composer-input')?.focus();
        return;
      }

      const launchRepo = e.target.closest('[data-launch-repo]');
      if (launchRepo) {
        clearPinnedNav();
        const repoName = launchRepo.dataset.launchName;
        prefs.composerRepoPrefix = repoName;
        prefs.composerMode = 'new-antigravity';
        switchTab('chat');
        updateComposerModePills();
        const inp = $('composer-input');
        if (inp) {
          inp.value = `[${repoName}] `;
          updateComposerActionButton();
          inp.focus();
        }
        return;
      }

      const openChat = e.target.closest('[data-open-chat]');
      if (openChat && openChat.dataset.openChat) {
        clearPinnedNav();
        prefs.selectedThreadId = openChat.dataset.openChat;
        prefs.composerMode = 'reply';
        saveJson(STORAGE_KEYS.PREFS, prefs);
        switchTab('chat');
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
          clearPinnedNav();
          prefs.composerMode = 'new-antigravity';
          switchTab('chat');
          updateComposerModePills();
          $('composer-input')?.focus();
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
            noteRowOverride(id, { archived: val });
          }
          if (action === 'unread') {
            targetRow.unread = val;
            if (!val && targetRow.dot === 'unread') targetRow.dot = targetRow.open ? 'idle' : null;
            noteRowOverride(id, { unread: val });
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
        clearPinnedNav();
        prefs.selectedThreadId = sessCard.dataset.sessionId;
        prefs.composerMode = 'reply';
        saveJson(STORAGE_KEYS.PREFS, prefs);
        switchTab('chat');
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

      if (e.target.closest('#btn-reset-sess-filters')) {
        prefs.sessProvider = 'all';
        prefs.sessStatus = 'all';
        saveJson(STORAGE_KEYS.PREFS, prefs);
        const sInput = $('sess-search-input');
        if (sInput) sInput.value = '';
        renderSessionsView();
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
        prefs.composerMode = compModeBtn.dataset.compMode;
        updateComposerModePills();
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

      if (e.target.closest('#btn-save-bridge')) {
        const val = ($('input-custom-bridge')?.value || '').trim();
        prefs.customBridgeUrl = val;
        saveJson(STORAGE_KEYS.PREFS, prefs);
        localBridgeBase = '';
        await syncData({ toast: true });
        return;
      }

      if (e.target.closest('#btn-set-pin')) {
        const cur = localStorage.getItem(STORAGE_KEYS.PIN);
        const next = prompt(
          cur
            ? 'Enter new 4-digit PIN (or leave empty to disable PIN lock):'
            : 'Enter a 4-digit PIN to lock THEO Remote on launch:'
        );
        if (next === null) return;
        const clean = next.trim();
        if (!clean) {
          localStorage.removeItem(STORAGE_KEYS.PIN);
          showToast('PIN lock disabled');
        } else if (/^\d{4}$/.test(clean)) {
          localStorage.setItem(STORAGE_KEYS.PIN, clean);
          showToast('4-digit PIN lock saved');
        } else {
          showToast('PIN must be 4 digits');
        }
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
        const act = cmdItem.dataset.cmdAct;
        const tid = cmdItem.dataset.cmdThread;
        if (tid) {
          prefs.selectedThreadId = tid;
          prefs.composerMode = 'reply';
          saveJson(STORAGE_KEYS.PREFS, prefs);
          switchTab('chat');
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
          prefs.composerMode = 'new-antigravity';
          switchTab('chat');
          updateComposerModePills();
        } else if (act === 'new-claude') {
          prefs.composerMode = 'new-claude';
          switchTab('chat');
          updateComposerModePills();
        } else if (act === 'sync') {
          syncData({ toast: true });
        } else if (act === 'push-test') {
          await sendTestPush(false);
        } else if (act === 'compact') {
          dispatchRemoteCommand({ type: 'sessionAction', action: 'compact', subAction: 'compact', id: prefs.selectedThreadId });
          showToast('Dispatched /compact');
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

    // Context Window Popover
    $('btn-ctx-window')?.addEventListener('click', () => {
      const pop = $('ctx-popover');
      if (pop) pop.hidden = !pop.hidden;
    });
    $('btn-close-ctx')?.addEventListener('click', () => {
      const pop = $('ctx-popover');
      if (pop) pop.hidden = true;
    });
    $('btn-ctx-compact')?.addEventListener('click', async () => {
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
      clearPinnedNav();
      prefs.selectedThreadId = e.target.value;
      prefs.composerMode = 'reply';
      saveJson(STORAGE_KEYS.PREFS, prefs);
      renderChatView(true);
      fetchThreadDetail(prefs.selectedThreadId);
    });

    // Search in Sessions
    $('sess-search-input')?.addEventListener('input', () => renderSessionsView());

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
      el.style.height = `${Math.min(110, el.scrollHeight)}px`;
      updateComposerActionButton();
    });

    // Composer Form Submit
    $('chat-composer-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await submitComposerPrompt();
    });

    $('composer-input')?.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        await submitComposerPrompt();
      }
    });

    // Command Palette shortcuts
    $('open-cmd-palette')?.addEventListener('click', openCommandPalette);
    $('mobile-cmd-btn')?.addEventListener('click', openCommandPalette);
    $('cmd-close')?.addEventListener('click', closeCommandPalette);
    $('cmd-input')?.addEventListener('input', (e) => renderCommandPaletteResults(e.target.value));
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openCommandPalette();
      } else if (e.key === 'Escape') {
        closeCommandPalette();
        closeConnModal();
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
    btn.setAttribute('title', shouldShowStop ? 'Stop / End Running Session' : 'Dispatch Prompt');
    btn.setAttribute('aria-label', shouldShowStop ? 'Stop running session' : 'Dispatch Prompt');
  }

  async function stopActiveSession(explicitId = '') {
    const tid = String(explicitId || prefs.selectedThreadId || '').trim();
    if (!tid) return;
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
      id: tid,
      threadId: tid,
      provider
    });
  }

  function updateComposerModePills() {
    document.querySelectorAll('[data-comp-mode]').forEach((b) => {
      b.classList.toggle('active', b.dataset.compMode === prefs.composerMode);
    });
    updateComposerActionButton();
  }

  async function submitComposerPrompt() {
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
      ? `${repoRefs.map((r) => `${r.name}${r.repoPath ? ` (${r.repoPath})` : ''}`).join(', ')}\n`
      : '';
    const attachDisplayLine = sentAttachments.length
      ? `\n\n📎 Attached: ${sentAttachments.map((a) => a.name).join(', ')}`
      : '';
    const text = `${contextHeader}${rawText || (fileRefs.length ? `Please inspect the attached file(s): ${fileRefs.map((f) => f.name).join(', ')}` : '')}`.trim();

    const activeRow = (appState?.rows || []).find((r) => r.id === prefs.selectedThreadId);
    const isNewAgy = prefs.composerMode === 'new-antigravity';
    const isNewClaude = prefs.composerMode === 'new-claude';
    const provider = isNewClaude
      ? 'claude'
      : isNewAgy
        ? 'antigravity'
        : activeRow?.provider || 'antigravity';
    const targetId = isNewAgy || isNewClaude ? '' : prefs.selectedThreadId;

    // Optimistically append turn to local thread view
    if (targetId) {
      stoppedSessionsById.delete(targetId);
      if (activeRow) {
        activeRow.status = 'working';
        activeRow.dot = 'running';
      }
      if (!threadsCache[targetId]) {
        threadsCache[targetId] = { id: targetId, provider, messages: [] };
      }
      threadsCache[targetId].messages.push({
        id: `local-${Date.now()}`,
        role: 'user',
        createdAt: new Date().toISOString(),
        text: `${rawText || text}${attachDisplayLine}`,
        toolCalls: [],
        optimistic: true,
        optimisticAt: Date.now()
      });
      persistCache();
      renderChatView(true);
    }

    const res = await dispatchRemoteCommand({
      type: 'send',
      id: targetId,
      provider,
      prompt: text,
      attachments: fileRefs.map((f) => ({
        name: f.name,
        mime: f.mime,
        size: f.size,
        dataUrl: f.dataUrl || '',
        textContent: f.textContent || ''
      })),
      newSession: Boolean(isNewAgy || isNewClaude || !targetId)
    });

    if (isNewAgy || isNewClaude) {
      prefs.composerMode = 'reply';
      saveJson(STORAGE_KEYS.PREFS, prefs);
      updateComposerModePills();
    }

    if (res.mode === 'cloud') {
      setTimeout(() => syncData(), 3500);
      setTimeout(() => syncData(), 8000);
    }

    showToast(
      res.mode === 'cloud'
        ? `Dispatched via THEO Cloud Relay`
        : res.mode === 'local'
          ? `Sent to ${provider === 'claude' ? 'Claude Code' : 'Antigravity'} (Direct Bridge)`
          : `Queued in Outbox (will send when online)`
    );
  }

  function applyNotificationNav(nav) {
    if (!nav || typeof nav !== 'object') return false;
    const threadId = String(nav.threadId || nav.sessionId || '').trim();
    const reminderId = String(nav.reminderId || '').trim();
    const tab = String(nav.tab || '').trim();
    if (!threadId && !reminderId && !tab) return false;

    const notifKey = String(nav.id || nav.tag || '').trim();
    if (notifKey) {
      markNotifConsumed(notifKey);
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
      reminderId
    });

    if (threadId) {
      prefs.selectedThreadId = threadId;
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
      prefs.activeTab = tab;
      saveJson(STORAGE_KEYS.PREFS, prefs);
      switchTab(tab);
      renderAll();
    }

    syncData().catch(() => {});
    return true;
  }

  async function consumePendingNotificationNav(opts = {}) {
    const allowUnseenPush = Boolean(opts && opts.allowUnseenPush);
    try {
      if ('caches' in window) {
        const cache = await caches.open(NAV_HANDOFF_CACHE);
        const pendingRes = await cache.match(PENDING_NAV_CACHE_URL);
        if (pendingRes) {
          await cache.delete(PENDING_NAV_CACHE_URL);
          await cache.delete(LAST_PUSH_NAV_CACHE_URL);
          const pending = await pendingRes.json().catch(() => null);
          if (pending && Date.now() - Number(pending.ts || 0) < 10 * 60 * 1000) {
            return applyNotificationNav(pending);
          }
        }
        if (allowUnseenPush) {
          const lastPushRes = await cache.match(LAST_PUSH_NAV_CACHE_URL);
          if (lastPushRes) {
            await cache.delete(LAST_PUSH_NAV_CACHE_URL);
            const lastPush = await lastPushRes.json().catch(() => null);
            const pushKey = String(lastPush?.id || lastPush?.tag || '').trim();
            if (
              lastPush &&
              Date.now() - Number(lastPush.ts || 0) < 15 * 60 * 1000 &&
              (!pushKey || !isNotifConsumed(pushKey))
            ) {
              return applyNotificationNav(lastPush);
            }
          }
        }
      }
    } catch {}

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
        .register('sw.js?v=30', { updateViaCache: 'none' })
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
            if (!document.hidden) {
              reg.update().catch(() => {});
              consumePendingNotificationNav({ allowUnseenPush: true }).finally(() => {
                syncData();
              });
            }
          });
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
            showToast(
              `${p.title}${p.body ? ': ' + String(p.body).slice(0, 95) : ''}`,
              navTarget
            );
          }
          syncData();
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

    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEYS.PERSONAL || e.key === STORAGE_KEYS.COMMAND) {
        loadPersonalLedgerFromLocal();
        renderAll();
      }
    });
    window.addEventListener('focus', () => {
      loadPersonalLedgerFromLocal();
      consumePendingNotificationNav({ allowUnseenPush: true }).finally(() => {
        renderAll();
        syncData().catch(() => {});
      });
    });
    window.addEventListener('pageshow', () => {
      consumePendingNotificationNav({ allowUnseenPush: true });
    });

    restorePinnedNavFromSession();

    const urlParams = new URLSearchParams(location.search);
    const tabParam = urlParams.get('tab');
    const threadParam = urlParams.get('thread');
    const provParam = urlParams.get('provider');
    const remParam = urlParams.get('rem');
    const newParam = urlParams.get('new');
    if (newParam === 'antigravity' || newParam === 'claude') {
      prefs.composerMode = `new-${newParam}`;
      updateComposerModePills();
    }

    if (threadParam || remParam || tabParam || newParam) {
      try {
        const cleanUrl = location.pathname + (location.hash || '');
        history.replaceState(null, '', cleanUrl);
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
    } else if (pinnedNavThreadId && Date.now() < pinnedNavUntil) {
      prefs.selectedThreadId = pinnedNavThreadId;
      prefs.composerMode = 'reply';
      prefs.activeTab = 'chat';
      saveJson(STORAGE_KEYS.PREFS, prefs);
      switchTab('chat');
      fetchThreadDetail(pinnedNavThreadId, pinnedNavProvider || '');
    } else {
      const startTab =
        tabParam || (prefs.activeTab === 'discipline' ? 'pulse' : prefs.activeTab) || 'pulse';
      switchTab(startTab);
    }

    renderAll();
    consumePendingNotificationNav({ allowUnseenPush: true });
    syncData();
    if (!initialNoSse) {
      setInterval(() => {
        if (!document.hidden) syncData();
      }, 12000);
    }
    registerServiceWorker();
  }

  init();
})();
