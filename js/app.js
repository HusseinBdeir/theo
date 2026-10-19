(() => {
  'use strict';

  const STORAGE_KEYS = {
    CACHE: 'theo_remote_cache_v1',
    PREFS: 'theo_remote_prefs_v1',
    OUTBOX: 'theo_remote_outbox_v1',
    PIN: 'theo_remote_pin_v1',
    DEVID: 'theo_remote_devid_v1',
    PUSH_HINT: 'theo_remote_pushhint_v1',
    PERSONAL: 'theo_personal_ledger_v1'
  };

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
    { id: 'wake', label: 'Waking up early', icon: '☀️', hint: 'Up on time & morning routine' },
    { id: 'work', label: 'Work', icon: '💼', hint: 'Focused executive & ops output' },
    { id: 'skills', label: 'Skills', icon: '🧠', hint: 'Deliberate learning & craft' },
    { id: 'fitness', label: 'Fitness', icon: '💪', hint: 'Gym, calisthenics, football or padel' },
    { id: 'social', label: 'Socializing', icon: '🤝', hint: 'Meaningful connection & presence' }
  ];

  const DAILY_DONTS = [
    { id: 'games', label: 'Video games', icon: '🎮', hint: '10% held intact when avoided' },
    { id: 'series', label: 'Series', icon: '📺', hint: '10% held intact when avoided' },
    { id: 'music', label: 'Music', icon: '🎧', hint: '10% held intact when avoided' },
    { id: 'socialmedia', label: 'Social media', icon: '📱', hint: '10% held intact when avoided' },
    { id: 'nsfw', label: '18+ things', icon: '🚫', hint: '10% held intact when avoided' }
  ];

  // ---------- Automated Relevance / Domain Classifier ----------
  const REM_CATEGORIES = {
    payments: { id: 'payments', label: 'Payments & Treasury', icon: '💸', color: 'brass' },
    hospitality: { id: 'hospitality', label: 'Hospitality · Resorts', icon: '🏖️', color: 'emerald' },
    trading: { id: 'trading', label: 'Trading · Korri / Shacman', icon: '🚛', color: 'amber' },
    manufacturing: { id: 'manufacturing', label: 'Manufacturing · WTC / BBC / Lions', icon: '🏗️', color: 'steel' },
    realestate_ins: { id: 'realestate_ins', label: 'Real Estate & Insurance', icon: '🏢', color: 'steel' },
    holding: { id: 'holding', label: 'Bdeir Holding & Finance', icon: '🏛️', color: 'brass' },
    personal: { id: 'personal', label: 'Personal & Growth', icon: '🎯', color: 'emerald' }
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

  const fmtCompact = (n) =>
    new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(n || 0));
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
    theme: 'dark',
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
  const pendingThreadRequests = new Map();
  const alertedReminderIds = new Set();

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
    dailyScores: {},
    updatedAt: 0
  });
  if (!personalLedger || typeof personalLedger !== 'object') {
    personalLedger = { reminders: [], dailyScores: {}, updatedAt: 0 };
  }
  if (!Array.isArray(personalLedger.reminders)) personalLedger.reminders = [];
  if (!personalLedger.dailyScores || typeof personalLedger.dailyScores !== 'object') {
    personalLedger.dailyScores = {};
  }

  let selectedScoreDate = localIsoDate();
  const remDraft = {
    kind: 'payment', // 'payment' | 'task' | 'wait' | 'recurring'
    title: '',
    amount: '',
    waitChoice: 'auto', // 'auto' | '1h' | '3h' | 'tonight' | '1d' | '2d' | '3d' | '4d' | '7d' | '10d' | 'nextmon'
    recur: 'daily', // 'daily' | 'weekdays' | 'weekly' | 'monthly'
    categoryOverride: ''
  };

  function getDayRecord(iso = localIsoDate()) {
    const rec = personalLedger.dailyScores?.[iso] || {};
    const dos = {};
    const donts = {};
    for (const item of DAILY_DOS) {
      const v = rec?.dos?.[item.id];
      dos[item.id] = v === 'full' || v === 'half' ? v : 'none';
    }
    for (const item of DAILY_DONTS) {
      const v = rec?.donts?.[item.id];
      donts[item.id] = v === 'broken' || v === 'half' ? v : 'clean';
    }
    return {
      iso,
      dos,
      donts,
      updatedAt: Number(rec.updatedAt || 0)
    };
  }

  function computeDayDiscipline(isoOrRec = localIsoDate()) {
    const rec = typeof isoOrRec === 'string' ? getDayRecord(isoOrRec) : isoOrRec;
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
      if (st === 'broken') {
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
      cur.dos[habitId] = nextVal === 'full' || nextVal === 'half' ? nextVal : 'none';
    } else {
      cur.donts[habitId] = nextVal === 'broken' || nextVal === 'half' ? nextVal : 'clean';
    }
    cur.updatedAt = Date.now();
    personalLedger.dailyScores[iso] = cur;
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
      s.match(/\b(\d+(?:\.\d+)?)\s*k\b/i);
    if (!m) return 0;
    const num = Number(String(m[1]).replace(/,/g, ''));
    if (Number.isNaN(num)) return 0;
    const hasK = Boolean(m[2] || /\bk\b/i.test(m[0]));
    return hasK ? num * 1000 : num;
  }

  function detectRelevanceCategory(text, kind = 'task', override = '') {
    if (override && REM_CATEGORIES[override]) return REM_CATEGORIES[override];
    const s = String(text || '').toLowerCase();
    if (
      kind === 'payment' ||
      /\b(pay|payment|invoice|wire|transfer|cheque|check|supplier|advance|deposit|disburse|remit|\$|usd)\b/i.test(s)
    ) {
      return REM_CATEGORIES.payments;
    }
    if (/\b(blanca|la\s*una|launa|palms|voile|platinum|resort|hotel|cabana|pos|kitchen|guest|beach)\b/i.test(s)) {
      return REM_CATEGORIES.hospitality;
    }
    if (/\b(korri|shacman|truck|trucks|spare|parts|workshop|vin|trading|customs|shipment)\b/i.test(s)) {
      return REM_CATEGORIES.trading;
    }
    if (/\b(wtc|bbc|bbconstruction|lions|quarry|crusher|asphalt|concrete|filter\s*press|plant|diesel|mixer)\b/i.test(s)) {
      return REM_CATEGORIES.manufacturing;
    }
    if (/\b(property|properties|tenant|lease|rent|villa|apartment|real\s*estate|insurance|policy|claim|broker|underwriter)\b/i.test(s)) {
      return REM_CATEGORIES.realestate_ins;
    }
    if (/\b(holding|brains|vat|tax|audit|bank|audi|kyc|payroll|salary|lawyer|contract|soa|board)\b/i.test(s)) {
      return REM_CATEGORIES.holding;
    }
    return REM_CATEGORIES.personal;
  }

  function suggestPaymentWait(text, rawAmount = '') {
    const s = String(text || '').toLowerCase();
    const amt = parseAmountFromText(text, rawAmount);

    if (/\b(salary|payroll|wage|electricity|edl|water|tax|vat|customs|urgent|emergency)\b/i.test(s)) {
      return {
        waitDays: 1,
        waitMs: 24 * 3600 * 1000,
        tier: 'Urgent / Statutory (24h)',
        amt,
        reason: 'Statutory, payroll, or utility item — 24h verification hold so operations never stall.'
      };
    }
    if (/\b(deposit|advance|retainer|down\s*payment)\b/i.test(s) && amt <= 5000) {
      return {
        waitDays: 3,
        waitMs: 3 * 24 * 3600 * 1000,
        tier: 'Advance / Deposit (3d)',
        amt,
        reason: 'Advance / deposit request — 3-day cooling-off to verify delivery schedule & terms.'
      };
    }
    if (amt > 15000) {
      return {
        waitDays: 10,
        waitMs: 10 * 24 * 3600 * 1000,
        tier: `Strategic · $${fmtInt(amt)} (10d)`,
        amt,
        reason: 'High-value disbursement (>$15k) — 10-day treasury hold + full Statement of Account check.'
      };
    }
    if (amt > 5000) {
      return {
        waitDays: 7,
        waitMs: 7 * 24 * 3600 * 1000,
        tier: `Major · $${fmtInt(amt)} (7d)`,
        amt,
        reason: 'Major payout ($5k–$15k) — 7-day hold to confirm goods receipt & Brains/ERP reconciliation.'
      };
    }
    if (amt >= 1000) {
      return {
        waitDays: 4,
        waitMs: 4 * 24 * 3600 * 1000,
        tier: `Medium · $${fmtInt(amt)} (4d)`,
        amt,
        reason: 'Medium operational invoice ($1k–$5k) — 4-day hold batches weekly supplier disbursements.'
      };
    }
    if (amt > 0) {
      return {
        waitDays: 2,
        waitMs: 2 * 24 * 3600 * 1000,
        tier: `Routine · $${fmtInt(amt)} (2d)`,
        amt,
        reason: 'Routine payout (<$1k) — 48h cooling-off keeps cash-out discipline without friction.'
      };
    }
    return {
      waitDays: 3,
      waitMs: 3 * 24 * 3600 * 1000,
      tier: 'Standard Cooling-Off (3d)',
      amt: 0,
      reason: 'Standard 3-day payment hold (enter an amount like $800, $2,500, or $8,000 to auto-scale wait time).'
    };
  }

  function computeTargetTimestampFromChoice(choice, text, rawAmount) {
    const now = new Date();
    const nowMs = now.getTime();
    if (choice === 'auto') {
      const sug = suggestPaymentWait(text, rawAmount);
      return { targetMs: nowMs + sug.waitMs, waitDays: sug.waitDays, label: sug.tier, reason: sug.reason };
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
        reason: 'Held until Monday 09:00 weekly disbursement run.'
      };
    }
    const dayMatch = String(choice || '').match(/^(\d+)d$/);
    const dCount = dayMatch ? Number(dayMatch[1]) : 3;
    return {
      targetMs: nowMs + dCount * 24 * 3600 * 1000,
      waitDays: dCount,
      label: `Wait ${dCount} day${dCount === 1 ? '' : 's'}`,
      reason: `Manual ${dCount}-day hold timer.`
    };
  }

  function formatHoldCountdown(targetMs, nowMs = Date.now()) {
    if (!targetMs) return 'No timer';
    const diff = Number(targetMs) - nowMs;
    if (diff <= 0) {
      const agoMin = Math.floor(Math.abs(diff) / 60000);
      if (agoMin < 60) return `Matured ${agoMin}m ago`;
      const agoHrs = Math.floor(agoMin / 60);
      if (agoHrs < 24) return `Matured ${agoHrs}h ago`;
      return `Matured ${Math.floor(agoHrs / 24)}d ago`;
    }
    const totalMin = Math.ceil(diff / 60000);
    if (totalMin < 60) return `${totalMin}m wait left`;
    const hrs = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    if (hrs < 48) return `${hrs}h ${mins}m wait left`;
    const days = Math.floor(hrs / 24);
    const remHrs = hrs % 24;
    return `${days}d ${remHrs}h wait left`;
  }

  function classifyReminderBucket(item, nowMs = Date.now()) {
    if (item.completed) return 'completed';
    const isHold = item.kind === 'payment' || item.kind === 'wait';
    const targetMs = Number(item.matureAt || item.dueAt || 0);
    if (isHold) {
      if (targetMs && nowMs >= targetMs) {
        return 'urgent_matured';
      }
      return 'holding';
    }
    if (targetMs && targetMs <= nowMs + 2 * 3600 * 1000) {
      return 'urgent_matured';
    }
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    if (targetMs && targetMs <= endOfToday.getTime()) {
      return 'today';
    }
    if (item.kind === 'recurring') {
      return 'recurring';
    }
    return 'upcoming';
  }

  function mergePersonalLedger(incoming) {
    if (!incoming || typeof incoming !== 'object') return false;
    let changed = false;

    // 1. Merge reminders by id using updatedAt
    if (Array.isArray(incoming.reminders)) {
      const map = new Map();
      for (const r of personalLedger.reminders || []) {
        if (r && r.id) map.set(r.id, r);
      }
      for (const rem of incoming.reminders) {
        if (!rem || !rem.id) continue;
        const cur = map.get(rem.id);
        if (!cur || Number(rem.updatedAt || 0) > Number(cur.updatedAt || 0)) {
          map.set(rem.id, rem);
          changed = true;
        }
      }
      personalLedger.reminders = Array.from(map.values()).sort(
        (a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)
      );
    }

    // 2. Merge dailyScores by date key using updatedAt
    if (incoming.dailyScores && typeof incoming.dailyScores === 'object') {
      for (const [iso, rec] of Object.entries(incoming.dailyScores)) {
        if (!rec || typeof rec !== 'object') continue;
        const cur = personalLedger.dailyScores[iso];
        if (!cur || Number(rec.updatedAt || 0) > Number(cur.updatedAt || 0)) {
          personalLedger.dailyScores[iso] = rec;
          changed = true;
        }
      }
    }

    if (changed) {
      personalLedger.updatedAt = Math.max(
        Number(personalLedger.updatedAt || 0),
        Number(incoming.updatedAt || Date.now())
      );
      saveJson(STORAGE_KEYS.PERSONAL, personalLedger);
    }
    return changed;
  }

  let personalSyncTimer = null;
  function persistAndSyncPersonalLedger() {
    saveJson(STORAGE_KEYS.PERSONAL, personalLedger);
    schedulePushSync();
    clearTimeout(personalSyncTimer);
    personalSyncTimer = setTimeout(() => {
      pushPersonalLedgerToCloud().catch(() => {});
    }, 350);
  }

  async function pushPersonalLedgerToCloud() {
    // 1. Sync with Direct Local Bridge (:4318) if connected
    if (localBridgeBase) {
      fetch(`${localBridgeBase}/api/personal-ledger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personalLedger })
      }).catch(() => {});
    }
    // 2. Sync with Dataverse Cloud Relay
    if (cloudCfg.url && cloudCfg.key) {
      try {
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
                    url: payload.url || './',
                    tab: payload.tab || 'pulse',
                    threadId: payload.threadId || '',
                    provider: payload.provider || ''
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

  async function scheduleExactReminderPush(item) {
    const nf = Object.assign({ ...DEFAULT_NOTIF }, prefs.notif || {});
    if (!nf.enabled || nf.paymentHolds === false || !pushSub || !pushSub.endpoint || !item) return;
    const targetMs = Number(item.matureAt || item.dueAt || 0);
    if (!targetMs) return;
    const delaySec = Math.round((targetMs - Date.now()) / 1000);
    if (delaySec < 5 || delaySec > 7 * 86400) return;

    const isPayment = item.kind === 'payment';
    const isWait = item.kind === 'wait';
    const amtTxt = item.amount > 0 ? ` ($${fmtInt(item.amount)})` : '';
    const title = isPayment
      ? `💸 Payment Hold Matured${amtTxt}`
      : isWait
        ? `⏳ Cooling-Off Complete · Ready to Act`
        : `⏰ THEO Reminder Due`;
    const body = isPayment
      ? `${item.title}${amtTxt} — ${item.waitDays || 3}d wait period is over. Tap to review or release.`
      : `${item.title} — Tap to open THEO Reminders & Daily 100%.`;

    try {
      const exp = Math.floor(targetMs / 1000) + 43200;
      const [vapid, bodyB64] = await Promise.all([
        signVapid(pushSub.endpoint, exp),
        encryptWebPush(pushSub, {
          title,
          body,
          tag: `theo-rem-${item.id}`,
          url: './?tab=discipline',
          tab: 'discipline'
        })
      ]);
      await callCloudPush({
        op: 'push_delay',
        timerKey: `timer/rem_${item.id}`,
        timerId: String(item.updatedAt || Date.now()),
        delaySec,
        endpoint: pushSub.endpoint,
        vapid,
        bodyB64
      });
    } catch {}
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
    const nowMs = Date.now();
    const activeItems = (personalLedger.reminders || []).filter(
      (r) => r && !r.deleted && !r.completed
    );
    let anyChanged = false;
    for (const item of activeItems) {
      const targetMs = Number(item.matureAt || item.dueAt || 0);
      if (!targetMs) continue;
      if (nowMs >= targetMs && nowMs - targetMs < 3600 * 1000 && !alertedReminderIds.has(item.id)) {
        alertedReminderIds.add(item.id);
        anyChanged = true;
        playChime('approve');
        const amtTxt = item.amount > 0 ? ` ($${fmtInt(item.amount)})` : '';
        const msgTitle =
          item.kind === 'payment'
            ? `💸 Payment Hold Matured${amtTxt}`
            : item.kind === 'wait'
              ? `⏳ Wait Timer Complete`
              : `⏰ Reminder Due`;
        showToast(`${msgTitle}: ${item.title}`);
        if (notifPerm() === 'granted' && document.hidden) {
          swLocalNotif({
            title: msgTitle,
            body: `${item.title}${amtTxt} is ready for your action.`,
            tag: `theo-rem-${item.id}`,
            tab: 'discipline',
            url: './?tab=discipline'
          });
        }
      }
    }
    if (anyChanged || prefs.activeTab === 'discipline' || prefs.activeTab === 'pulse') {
      if (prefs.activeTab === 'discipline') renderDisciplineView(true);
      if (prefs.activeTab === 'pulse') renderPulseView();
    }
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
    const activeRems = (personalLedger.reminders || []).filter(
      (r) => r && !r.deleted && !r.completed
    );

    for (let d = 0; d < daysCount; d++) {
      const baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
      const dayStartMs = baseDate.getTime();
      const dayEndMs = dayStartMs + 86400 * 1000;
      const iso = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}-${String(baseDate.getDate()).padStart(2, '0')}`;
      const dayDisc = computeDayDiscipline(iso);

      const maturingToday = activeRems.filter((r) => {
        const t = Number(r.matureAt || r.dueAt || 0);
        return t > 0 && t <= dayEndMs && (d === 0 || t >= dayStartMs);
      });
      const paymentHoldsMaturing = maturingToday.filter((r) => r.kind === 'payment');

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
          const holdTxt =
            paymentHoldsMaturing.length > 0
              ? `💸 ${paymentHoldsMaturing.length} payment hold${paymentHoldsMaturing.length === 1 ? '' : 's'} ready · `
              : maturingToday.length > 0
                ? `⏰ ${maturingToday.length} task${maturingToday.length === 1 ? '' : 's'} due today · `
                : '';
          const waitTxt =
            approvals.length > 0
              ? `${approvals.length} approval${approvals.length === 1 ? '' : 's'} · `
              : '';
          const title =
            paymentHoldsMaturing.length > 0
              ? `THEO Morning · ${paymentHoldsMaturing.length} Payment Hold${paymentHoldsMaturing.length === 1 ? '' : 's'} Ready 💸`
              : `THEO Morning Brief · Day Starts at 50% ☀️`;
          const body = `${holdTxt}${waitTxt}Daily Ledger at 50% (5/5 Don'ts intact — earn +50% across Wake, Work, Skills, Fitness & Social). ${rows.length} active sessions (${openTabs.length} open).`;
          const exp = Math.floor(dtAm.getTime() / 1000) + 57600;
          const [vapid, bodyB64] = await Promise.all([
            signVapid(subJson.endpoint, exp),
            encryptWebPush(subJson, {
              title,
              body,
              tag: `theo-am-${iso}`,
              url: './?tab=discipline',
              tab: 'discipline'
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
              ? ` · ${dirtyRepos.length} dirty repo${dirtyRepos.length === 1 ? '' : 's'}`
              : '';
          const tokTxt = todayTok > 0 && d === 0 ? ` · ${fmtCompact(todayTok)} tok` : '';
          const title =
            d === 0 && dayDisc.hasInteracted
              ? `THEO Evening Scorecard · ${dayDisc.score}% Today 🎯`
              : `THEO Evening Check-In · Score Today's 5 Do's & Don'ts 🎯`;
          const body =
            d === 0 && dayDisc.hasInteracted
              ? `Today's score is ${dayDisc.score}% (${dayDisc.doFullCount + dayDisc.doHalfCount}/5 Do's, ${dayDisc.dontCleanCount}/5 Don'ts clean)${dirtyTxt}${tokTxt}. Tap to finalize today's ledger.`
              : `Started at 50% — check off Waking Early, Work, Skills, Fitness & Socializing (+10% full / +5% partial) and verify your 5 Don'ts${dirtyTxt}.`;
          const exp = Math.floor(dtPm.getTime() / 1000) + 57600;
          const [vapid, bodyB64] = await Promise.all([
            signVapid(subJson.endpoint, exp),
            encryptWebPush(subJson, {
              title,
              body,
              tag: `theo-pm-${iso}`,
              url: './?tab=discipline',
              tab: 'discipline'
            })
          ]);
          slots[slotKey] = { vapid, bodyB64 };
        }
      }
    }

    // Also populate hourly slot entries for any Payment Holds or Timed Reminders maturing in the next 14 days
    if (nf.paymentHolds !== false) {
      for (const item of activeRems) {
        const targetMs = Number(item.matureAt || item.dueAt || 0);
        if (!targetMs || targetMs <= nowMs - 1800000 || targetMs > nowMs + daysCount * 86400 * 1000) {
          continue;
        }
        const dtTarget = new Date(targetMs);
        const slotKey = dtTarget.toISOString().slice(0, 13);
        const amtTxt = item.amount > 0 ? ` ($${fmtInt(item.amount)})` : '';
        const title =
          item.kind === 'payment'
            ? `💸 Payment Hold Matured${amtTxt}`
            : item.kind === 'wait'
              ? `⏳ Wait Period Complete · ${item.title}`
              : `⏰ THEO Reminder · ${item.title}`;
        const body =
          item.kind === 'payment'
            ? `${item.title}${amtTxt} — ${item.waitDays || 3}d cooling-off finished. Ready to review or release.`
            : `${item.title} is due now. Tap to open THEO Reminders.`;
        const exp = Math.floor(targetMs / 1000) + 57600;
        const [vapid, bodyB64] = await Promise.all([
          signVapid(subJson.endpoint, exp),
          encryptWebPush(subJson, {
            title,
            body,
            tag: `theo-rem-slot-${item.id}`,
            url: './?tab=discipline',
            tab: 'discipline'
          })
        ]);
        slots[slotKey] = { vapid, bodyB64 };
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
    const entry = {
      id: devId,
      endpoint: pushSub.endpoint,
      p256dh: (pushSub.keys && pushSub.keys.p256dh) || '',
      auth: (pushSub.keys && pushSub.keys.auth) || '',
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

  function checkLiveStateNotifications(nextState) {
    if (!nextState) return;
    const nf = Object.assign({ ...DEFAULT_NOTIF }, prefs.notif || {});
    const approvals = Array.isArray(nextState.approvals) ? nextState.approvals : [];
    const rows = Array.isArray(nextState.rows) ? nextState.rows : [];

    if (!statePrimed) {
      statePrimed = true;
      for (const a of approvals) {
        if (a && a.id) seenApprovalIds.add(a.id);
      }
      for (const r of rows) {
        if (r && r.id) prevRowStatuses.set(r.id, r.status || 'idle');
      }
      return;
    }

    // 1. New pending approval / waiting session
    for (const a of approvals) {
      if (!a || !a.id || seenApprovalIds.has(a.id)) continue;
      seenApprovalIds.add(a.id);
      playChime('approve');
      if (nf.enabled && nf.approvals !== false && document.hidden && notifPerm() === 'granted') {
        swLocalNotif({
          title: `⚡ Approval Needed · ${a.provider === 'claude' ? 'Claude Code' : 'Antigravity'}`,
          body: `${a.title || 'Session'}: ${a.toolName || 'Permission'} — ${a.detail || 'Waiting for confirmation'}`,
          tag: `theo-app-${a.id}`,
          tab: 'pulse',
          threadId: a.sessionId || ''
        });
      }
    }

    // 2. Session transitioned from working -> idle/done
    for (const r of rows) {
      if (!r || !r.id) continue;
      const prevStatus = prevRowStatuses.get(r.id);
      const curStatus = r.status || 'idle';
      prevRowStatuses.set(r.id, curStatus);
      if (prevStatus === 'working' && (curStatus === 'idle' || curStatus === 'done')) {
        playChime('confirm');
        if (nf.enabled && nf.completed !== false && document.hidden && notifPerm() === 'granted') {
          swLocalNotif({
            title: `✓ Turn Complete · ${r.provider === 'claude' ? 'Claude Code' : 'Antigravity'}`,
            body: `${r.title || 'Session'} (${r.folder || 'Workspace'}) finished running. Tap to inspect.`,
            tag: `theo-done-${r.id}`,
            tab: 'chat',
            threadId: r.id,
            provider: r.provider || 'antigravity'
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

  function showToast(msg) {
    const stack = $('toast-stack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, 3200);
  }

  // Theme management
  function applyTheme(theme) {
    prefs.theme = theme === 'light' ? 'light' : 'dark';
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

  function connectSse(base) {
    if (location.search.includes('nosse=1')) {
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
            checkLiveStateNotifications(st);
            appState = st;
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
            checkLiveStateNotifications(payload.state);
            appState = payload.state;
            if (!sseSource) connectSse(bridgeBase);
            persistCache();
            renderAll();
            flushOutbox().catch(() => {});
            if (prefs.selectedThreadId) {
              fetchThreadDetail(prefs.selectedThreadId).catch(() => {});
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
            checkLiveStateNotifications(store.state.snapshot);
            appState = store.state.snapshot;
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
              renderChatView();
            }
            return threadsCache[threadId];
          }
        }
      } catch {}
    } else if (connMode === 'cloud' && cloudCfg.url && cloudCfg.key) {
      const cached = threadsCache[threadId];
      const hasMessages = Array.isArray(cached?.messages) && cached.messages.length > 0;
      const hasTruncated =
        hasMessages &&
        cached.messages.some((m) => String(m.text || '').includes('<truncated '));
      const lastReq = pendingThreadRequests.get(threadId) || 0;
      if ((!hasMessages || hasTruncated) && Date.now() - lastReq > 15000) {
        pendingThreadRequests.set(threadId, Date.now());
        if (prefs.activeTab === 'chat' && prefs.selectedThreadId === threadId) {
          renderChatView();
        }
        dispatchRemoteCommand({
          type: 'requestThread',
          id: threadId,
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
    const cmd = {
      id: `cmd-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
      createdAt: Date.now(),
      status: 'pending',
      ...cmdObj
    };

    // 1. Direct Local Bridge
    if (connMode === 'local' && localBridgeBase) {
      try {
        const endpoint =
          cmd.type === 'send'
            ? '/api/send'
            : cmd.type === 'approve'
              ? '/api/approve'
              : '/api/session-action';
        const res = await fetch(`${localBridgeBase}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cmd)
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
          ? curStore.queue.commands.slice(-18)
          : [];
        existingCmds.push(cmd);

        const nextQueue = {
          ...(curStore.queue || {}),
          commands: existingCmds
        };
        if (cmd.type === 'requestThread' && cmd.id) {
          nextQueue.activeThreadId = cmd.id;
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
      if (textMob) textMob.textContent = snapAge ? `VS Code · ${snapAge}` : 'Cloud Live';
    } else {
      if (dotRail) dotRail.className = 'conn-dot';
      if (titleRail) titleRail.textContent = 'Offline Snapshot';
      if (subRail) subRail.textContent = snapAge ? `Cached ${snapAge}` : 'Waiting for connection';
      if (dotMob) dotMob.className = 'conn-dot';
      if (textMob) textMob.textContent = 'Cached';
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
          <span class="pill-count amber">NEW</span>
        </div>
        <div class="meta-timestamp" style="color:var(--text-secondary);font-size:12.5px">
          Get native lock-screen alerts when Antigravity or Claude Code needs 1-tap tool approval, finishes a background turn, or hits a quota window, plus daily workbench briefings.
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
      8: '08:00',
      9: '09:00',
      10: '10:00',
      11: '11:00',
      12: '12:00'
    };
    const pmHours = {
      18: '18:00',
      19: '19:00',
      20: '20:00',
      21: '21:00',
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
            <div class="eyebrow">WEB PUSH NOTIFICATIONS</div>
            <h2 class="section-title" style="font-size:17px;margin-top:2px">Lock-Screen Alerts &amp; Daily Briefings</h2>
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
                <strong>Morning Executive Command Pulse briefing</strong>
                <span>Daily morning summary of active sessions, pending approvals, and quota readiness</span>
              </div>
            </label>
            <select class="push-hour-select tabular" data-nf="morningHour" aria-label="Morning briefing time">
              ${renderHourOptions(amHours, nf.morningHour || 9)}
            </select>
          </div>
          <div class="push-pref-row">
            <label class="push-pref-label">
              <input type="checkbox" data-nf="evening" ${nf.evening !== false ? 'checked' : ''}>
              <div class="push-pref-text">
                <strong>Evening Uncommitted Git &amp; Open Workbench digest</strong>
                <span>Daily evening summary of modified repositories, open tabs, and daily token burn</span>
              </div>
            </label>
            <select class="push-hour-select tabular" data-nf="eveningHour" aria-label="Evening digest time">
              ${renderHourOptions(pmHours, nf.eveningHour || 20)}
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
      renderChatView();
      fetchThreadDetail(prefs.selectedThreadId);
    } else if (target === 'workspaces') {
      renderWorkspacesView();
    } else if (target === 'analytics') {
      renderAnalyticsView();
    }
  }

  function ensureSelectedThread() {
    const rows = (appState?.rows || []).filter((r) => r.id && !r.draft);
    if (!prefs.selectedThreadId || !rows.some((r) => r.id === prefs.selectedThreadId)) {
      const openOrRecent = rows.find((r) => r.active) || rows.find((r) => r.open) || rows[0];
      if (openOrRecent) {
        prefs.selectedThreadId = openOrRecent.id;
        saveJson(STORAGE_KEYS.PREFS, prefs);
      }
    }
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
              <span>${esc(r.model || (provKey === 'claude' ? 'Claude' : 'Gemini'))}</span>
              <span>· ${timeAgo(r.at)}</span>
              ${r.open ? `<span class="tag-pill" style="color:var(--brass)">Open Tab</span>` : ''}
            </div>
          </div>
        </div>
        <div class="sess-right">
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

  // VIEW 2: Render Sessions List
  function renderSessionsView() {
    const container = $('sessions-full-list');
    if (!container) return;
    const rows = (appState?.rows || []).filter((r) => r.id);
    const q = ($('sess-search-input')?.value || '').trim().toLowerCase();

    // Sync active state on provider & status filter buttons
    document.querySelectorAll('#sess-provider-seg .seg-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.prov === prefs.sessProvider);
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
      open: 'Open in VS Code',
      archived: 'Archived'
    };
    document.querySelectorAll('#sess-status-chips .chip').forEach((c) => {
      const k = c.dataset.statusFilter;
      c.classList.toggle('active', k === prefs.sessStatus);
      if (chipLabels[k] !== undefined) {
        c.innerHTML = `${esc(chipLabels[k])} <span class="chip-count tabular">${chipCounts[k] ?? 0}</span>`;
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
        const hay = `${r.title} ${r.folder} ${r.branch} ${r.model} ${r.provider}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
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
        if (Array.isArray(m.toolCalls) && m.toolCalls.length) {
          prev.toolCalls = [...(prev.toolCalls || []), ...m.toolCalls].slice(-24);
        }
        if (m.createdAt) prev.createdAt = m.createdAt;
      } else {
        merged.push({
          ...m,
          toolCalls: Array.isArray(m.toolCalls) ? [...m.toolCalls] : []
        });
      }
    }
    return merged;
  }

  // VIEW 3: Render Live Chat Workbench
  function renderChatView(forceScroll = false) {
    ensureSelectedThread();
    updateComposerModePills();
    const rows = (appState?.rows || []).filter((r) => r.id && !r.draft);
    const selectEl = $('chat-session-select');
    if (selectEl) {
      selectEl.innerHTML = rows
        .slice(0, 80)
        .map(
          (r) =>
            `<option value="${esc(r.id)}" ${r.id === prefs.selectedThreadId ? 'selected' : ''}>[${r.provider === 'claude' ? 'Claude' : 'AGY'}] ${esc(r.title)} (${timeAgo(r.at)})</option>`
        )
        .join('');
    }

    const activeRow = rows.find((r) => r.id === prefs.selectedThreadId) || rows[0];
    const threadDetail = threadsCache[prefs.selectedThreadId] || null;
    const provKey = (threadDetail?.provider || activeRow?.provider) === 'claude' ? 'claude' : 'antigravity';

    const badgeEl = $('chat-prov-badge');
    if (badgeEl) {
      badgeEl.innerHTML = `<span class="prov-glyph">${PROVIDER_ICONS[provKey]}</span>`;
    }
    const folderEl = $('chat-folder-pill');
    if (folderEl) {
      folderEl.textContent =
        threadDetail?.folder || activeRow?.folder || (prefs.composerRepoPrefix ? `Scope: ${prefs.composerRepoPrefix}` : 'BHFIRMS Workspace');
    }
    const rawCtx = threadDetail?.contextWindow || {};
    const resolvedModelLabel =
      rawCtx.modelLabel ||
      (threadDetail?.model && threadDetail.model !== 'Antigravity' ? threadDetail.model : '') ||
      (activeRow?.model && activeRow.model !== 'Antigravity' ? activeRow.model : '') ||
      (provKey === 'claude' ? 'Claude Opus 4.7' : 'Gemini 4 Argon High');
    const modelEl = $('chat-model-pill');
    if (modelEl) {
      modelEl.textContent = resolvedModelLabel;
    }

    // Context Window Pill & Popover
    const usedTokens = Number(rawCtx.usedTokens || 16400);
    const limitTokens = Number(rawCtx.limitTokens || rawCtx.maxContextTokens || (provKey === 'claude' ? 200000 : 1000000));
    const pct = Number(rawCtx.pct ?? Math.min(100, Math.max(1, Math.round((usedTokens / Math.max(1, limitTokens)) * 100))));
    const breakdownArr = Array.isArray(rawCtx.breakdown)
      ? rawCtx.breakdown
      : [
          { label: 'THEO.md & System Rules', tokens: 12400, color: '#D9A54A' },
          { label: 'Conversation Turns', tokens: 2400, color: '#4F8FD6' },
          { label: 'Tool I/O & File Reads', tokens: 1600, color: '#3186FF' }
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
    const wasNearBottom =
      streamEl.scrollHeight - streamEl.scrollTop - streamEl.clientHeight < 100;
    const messages = coalesceThreadMessages(threadDetail?.messages || []);
    const isSyncingThread =
      connMode === 'cloud' &&
      prefs.selectedThreadId &&
      pendingThreadRequests.has(prefs.selectedThreadId);

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
                ? `Requesting live transcript for <strong>${esc(activeRow?.title || 'Session')}</strong> from VS Code… You can also send a prompt below immediately.`
                : `Select any session above or send a prompt below to start or continue working remotely in <strong>${esc(activeRow?.title || 'VS Code')}</strong>.`
            }
          </div>
        </div>
      `;
      lastRenderedThreadId = prefs.selectedThreadId;
      lastRenderedMsgCount = 0;
    } else {
      streamEl.innerHTML = messages
        .map((m) => {
          const isUser = m.role === 'user';
          const toolCount = Array.isArray(m.toolCalls) ? m.toolCalls.length : 0;
          const toolPillsInner = toolCount
            ? `<div class="tool-calls-grid">${m.toolCalls
                .map(
                  (tc) =>
                    `<span class="tool-pill mono"><strong>${esc(tc.name)}</strong><span>${esc(String(tc.summary || '').slice(0, 70))}</span></span>`
                )
                .join('')}</div>`
            : '';
          const toolsHtml = toolCount
            ? m.text
              ? `<details class="tools-details"><summary>⚡ ${toolCount} tool ${toolCount === 1 ? 'step' : 'steps'} executed</summary>${toolPillsInner}</details>`
              : toolPillsInner
            : '';
          const thinkHtml = m.thinking
            ? `<details class="thinking-details"><summary>Reasoning &amp; Internal Thought</summary><div class="turn-text mono" style="margin-top:6px">${esc(m.thinking)}</div></details>`
            : '';
          return `
            <div class="turn-bubble ${isUser ? 'user' : 'assistant'}">
              <div class="turn-head">
                <span class="turn-role">${isUser ? 'Hussein Bdeir' : provKey === 'claude' ? 'THEO · Claude Code' : 'THEO · Antigravity'}</span>
                <span class="tabular">${m.createdAt ? timeAgo(Date.parse(m.createdAt)) : ''}</span>
              </div>
              ${thinkHtml}
              ${m.text ? `<div class="turn-text md-rich">${formatTurnMarkdown(m.text)}</div>` : ''}
              ${toolsHtml}
            </div>
          `;
        })
        .join('');

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
      inlineCodes.push(`<code>${esc(code)}</code>`);
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

      const ulMatch = rawLine.match(/^\s*[-*•]\s+(.+)$/);
      if (ulMatch) {
        flushPara();
        out.push(
          `<div class="md-list-item"><span class="md-bullet">•</span><div>${formatInline(ulMatch[1])}</div></div>`
        );
        continue;
      }

      const olMatch = rawLine.match(/^\s*(\d+\.)\s+(.+)$/);
      if (olMatch) {
        flushPara();
        out.push(
          `<div class="md-list-item"><span class="md-bullet tabular">${esc(olMatch[1])}</span><div>${formatInline(olMatch[2])}</div></div>`
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

  function renderAll() {
    updateConnectionBanner();
    renderOutboxBadge();
    renderPulseView();
    renderSessionsView();
    if (prefs.activeTab === 'chat') renderChatView();
    if (prefs.activeTab === 'workspaces') renderWorkspacesView();
    if (prefs.activeTab === 'analytics') renderAnalyticsView();
  }

  // Command Palette (⌘K)
  function openCommandPalette() {
    const modal = $('cmd-modal');
    const input = $('cmd-input');
    if (!modal || !input) return;
    modal.hidden = false;
    input.value = '';
    renderCommandPaletteResults('');
    setTimeout(() => input.focus(), 30);
  }

  function closeCommandPalette() {
    const modal = $('cmd-modal');
    if (modal) modal.hidden = true;
  }

  function renderCommandPaletteResults(query) {
    const resEl = $('cmd-results');
    if (!resEl) return;
    const q = query.trim().toLowerCase();
    const items = [
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

    document.addEventListener('click', async (e) => {
      const pushBtn = e.target.closest('[data-push-act]');
      if (pushBtn) {
        haptic(10);
        const act = pushBtn.dataset.pushAct;
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
          renderPulseView();
        }
        return;
      }

      const tabBtn = e.target.closest('[data-tab]');
      if (tabBtn) {
        haptic(8);
        switchTab(tabBtn.dataset.tab);
        return;
      }

      const gotoBtn = e.target.closest('[data-goto-tab]');
      if (gotoBtn) {
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
        const prov = quickNew.dataset.quickNew;
        prefs.composerMode = prov === 'claude' ? 'new-claude' : 'new-antigravity';
        switchTab('chat');
        updateComposerModePills();
        $('composer-input')?.focus();
        return;
      }

      const launchRepo = e.target.closest('[data-launch-repo]');
      if (launchRepo) {
        const repoName = launchRepo.dataset.launchName;
        prefs.composerRepoPrefix = repoName;
        prefs.composerMode = 'new-antigravity';
        switchTab('chat');
        updateComposerModePills();
        const inp = $('composer-input');
        if (inp) {
          inp.value = `[${repoName}] `;
          inp.focus();
        }
        return;
      }

      const openChat = e.target.closest('[data-open-chat]');
      if (openChat && openChat.dataset.openChat) {
        prefs.selectedThreadId = openChat.dataset.openChat;
        prefs.composerMode = 'reply';
        saveJson(STORAGE_KEYS.PREFS, prefs);
        switchTab('chat');
        fetchThreadDetail(prefs.selectedThreadId);
        return;
      }

      const sessAct = e.target.closest('[data-sess-act]');
      if (sessAct) {
        e.stopPropagation();
        const action = sessAct.dataset.sessAct;
        const id = sessAct.dataset.id;
        const val = sessAct.dataset.val === 'true';
        const targetRow = (appState?.rows || []).find((r) => r.id === id);
        if (targetRow) {
          if (action === 'archive') targetRow.archived = val;
          if (action === 'unread') targetRow.unread = val;
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
          renderPulseView();
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

      const cmdItem = e.target.closest('[data-cmd-act], [data-cmd-thread]');
      if (cmdItem) {
        closeCommandPalette();
        const act = cmdItem.dataset.cmdAct;
        const tid = cmdItem.dataset.cmdThread;
        if (tid) {
          prefs.selectedThreadId = tid;
          prefs.composerMode = 'reply';
          saveJson(STORAGE_KEYS.PREFS, prefs);
          switchTab('chat');
          fetchThreadDetail(tid);
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
          applyTheme(prefs.theme === 'dark' ? 'light' : 'dark');
        }
      }
    });

    // Theme, Sound, Sync buttons
    $('btn-theme-toggle')?.addEventListener('click', () =>
      applyTheme(prefs.theme === 'dark' ? 'light' : 'dark')
    );
    $('mobile-theme-btn')?.addEventListener('click', () =>
      applyTheme(prefs.theme === 'dark' ? 'light' : 'dark')
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

    // Session select change in Chat
    $('chat-session-select')?.addEventListener('change', (e) => {
      prefs.selectedThreadId = e.target.value;
      prefs.composerMode = 'reply';
      saveJson(STORAGE_KEYS.PREFS, prefs);
      renderChatView(true);
      fetchThreadDetail(prefs.selectedThreadId);
    });

    // Search in Sessions
    $('sess-search-input')?.addEventListener('input', () => renderSessionsView());

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

  function updateComposerModePills() {
    document.querySelectorAll('[data-comp-mode]').forEach((b) => {
      b.classList.toggle('active', b.dataset.compMode === prefs.composerMode);
    });
  }

  async function submitComposerPrompt() {
    const inp = $('composer-input');
    if (!inp) return;
    const text = inp.value.trim();
    if (!text) return;

    inp.value = '';
    haptic(15);
    playChime('send');

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
      if (!threadsCache[targetId]) {
        threadsCache[targetId] = { id: targetId, provider, messages: [] };
      }
      threadsCache[targetId].messages.push({
        id: `local-${Date.now()}`,
        role: 'user',
        createdAt: new Date().toISOString(),
        text,
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
      res.mode === 'local'
        ? `Sent to ${provider === 'claude' ? 'Claude Code' : 'Antigravity'} (Direct Bridge)`
        : res.mode === 'cloud'
          ? `Dispatched via THEO Cloud Relay`
          : `Queued in Outbox (will send when online)`
    );
  }

  // Register Service Worker & Push Navigation Listener
  function registerServiceWorker() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker
        .register('sw.js')
        .then(() => checkExistingPushSub())
        .catch(() => {});

      navigator.serviceWorker.addEventListener('message', (e) => {
        const m = e && e.data;
        if (!m) return;
        if (m.type === 'theo-nav') {
          if (m.threadId) {
            prefs.selectedThreadId = m.threadId;
            prefs.composerMode = 'reply';
            saveJson(STORAGE_KEYS.PREFS, prefs);
            switchTab('chat');
            fetchThreadDetail(m.threadId, m.provider || '');
          } else if (m.tab) {
            switchTab(m.tab);
          }
          syncData();
        } else if (m.type === 'theo-push') {
          syncData();
        }
      });
    }
  }

  // Bootstrap
  function init() {
    applyTheme(prefs.theme);
    hydrateStaticIcons();
    initPinLock();
    bindEvents();

    const urlParams = new URLSearchParams(location.search);
    const tabParam = urlParams.get('tab');
    const threadParam = urlParams.get('thread');
    const provParam = urlParams.get('provider');
    const newParam = urlParams.get('new');
    if (newParam === 'antigravity' || newParam === 'claude') {
      prefs.composerMode = `new-${newParam}`;
      updateComposerModePills();
    }
    if (threadParam) {
      prefs.selectedThreadId = threadParam;
      prefs.composerMode = 'reply';
      saveJson(STORAGE_KEYS.PREFS, prefs);
      switchTab('chat');
      fetchThreadDetail(threadParam, provParam || '');
    } else {
      switchTab(tabParam || prefs.activeTab || 'pulse');
    }
    renderAll();
    syncData();
    setInterval(() => {
      if (!document.hidden) syncData();
    }, 12000);
    registerServiceWorker();
  }

  init();
})();
