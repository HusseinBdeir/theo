/* ============================================================================
   THEO COMMAND — ZERO-SCROLL EXECUTIVE RADAR, DELEGATION & 100% DISCIPLINE PWA
   ============================================================================ */
(() => {
  'use strict';

  const STORAGE_KEY = 'theo_command_state_v1';
  const LEGACY_LEDGER_KEY = 'theo_personal_ledger_v1';
  const PUSH_REG_KEY = 'theo_command_push_v1';

  const VAPID_PUBLIC_B64 =
    'BKAC6gWORFSoi6Yf7XuS3voZnBgflXmG1GzW0K1pt4hcNoY7FNYPK-Jn-gAghKvphbSM_-ieA6U8w0E9yEgKB68';
  const VAPID_PRIVATE_JWK = {
    kty: 'EC',
    crv: 'P-256',
    x: 'oALqBY5EVKjppp_de5Pe-gZ2B-VeadrYbLXTbWm3iFw',
    y: '2gP8V1g8r4mf4ACCEq-mFsIz_6J4DpTzDQT3ISAoHrw',
    d: 'rI4p2nB099C-x2Z_yU1c7-mN9vK3qW8zL5pX1dF6hJ0'
  };

  const DAILY_DOS = [
    { id: 'wake', label: 'Waking up early', short: 'Wake', icon: '☀️', sub: 'Up on time & morning routine' },
    { id: 'work', label: 'Work', short: 'Work', icon: '💼', sub: 'Focused executive & ops output' },
    { id: 'skills', label: 'Skills', short: 'Skills', icon: '🧠', sub: 'Deliberate learning & craft' },
    { id: 'fitness', label: 'Fitness', short: 'Fit', icon: '💪', sub: 'Gym, calisthenics, football or padel' },
    { id: 'socializing', label: 'Socializing', short: 'Social', icon: '🤝', sub: 'Meaningful connection & presence' }
  ];

  const DAILY_DONTS = [
    { id: 'videogames', label: 'Video games', short: 'Games', icon: '🎮', sub: '10% held intact when avoided' },
    { id: 'series', label: 'Series', short: 'Series', icon: '📺', sub: '10% held intact when avoided' },
    { id: 'music', label: 'Music', short: 'Music', icon: '🎧', sub: '10% held intact when avoided' },
    { id: 'socialmedia', label: 'Social media', short: 'Social', icon: '📱', sub: '10% held intact when avoided' },
    { id: 'adult18', label: '18+ things', short: '18+', icon: '🔞', sub: '10% held intact when avoided' }
  ];

  const CLUSTERS = [
    {
      id: 'people',
      label: 'People & Follow-Ups',
      shortLabel: 'People',
      icon: '🗣️',
      sub: 'Calls, check-ins & delegated follow-ups'
    },
    {
      id: 'verify',
      label: 'Verify / App Sync',
      shortLabel: 'Verify / App',
      icon: '🔍',
      sub: 'Paid & waiting to show up on app / bank'
    },
    {
      id: 'shipping',
      label: 'Shipping & Orders',
      shortLabel: 'Shipping',
      icon: '📦',
      sub: 'Packages, spare parts & arrival timers'
    },
    {
      id: 'work',
      label: 'Work & BUs',
      shortLabel: 'Work',
      icon: '💼',
      sub: 'Resorts, WTC, Korri, Real Estate, Ins, Holding'
    },
    {
      id: 'payments',
      label: 'Payments & Holds',
      shortLabel: 'Payments',
      icon: '💸',
      sub: 'Wait-to-pay cooling-off holds & wires'
    },
    {
      id: 'family',
      label: 'Family & Home',
      shortLabel: 'Family',
      icon: '👨‍👩‍👧',
      sub: 'Family plans, parents & home errands'
    },
    {
      id: 'want_to_do',
      label: 'Want To Do',
      shortLabel: 'Want to Do',
      icon: '🌟',
      sub: 'Personal plans, places & weekend list'
    },
    {
      id: 'ideas',
      label: 'Ideas for Later',
      shortLabel: 'Ideas',
      icon: '💡',
      sub: 'Product concepts & future automations'
    }
  ];

  const BHFIRMS_BUS = [
    { id: 'hospitality', label: '🏖️ Hospitality (Resorts)', short: '🏖️ Resorts' },
    { id: 'manufacturing', label: '🏗️ Manufacturing (WTC / BBC / Lions)', short: '🏗️ WTC · Mfg' },
    { id: 'trading', label: '🚛 Trading (Korri / Shacman)', short: '🚛 Korri · Trading' },
    { id: 'realestate_ins', label: '🏢 Real Estate & Insurance', short: '🏢 RE · Ins' },
    { id: 'holding', label: '🏛️ Holding & Finance', short: '🏛️ Holding' },
    { id: 'tech', label: '⚡ Platform & Tech (THEO)', short: '⚡ Tech' }
  ];

  const DEFAULT_TEAM_ROSTER = [
    { id: 'tm_rami', name: 'Rami', role: 'Plant & Maintenance Ops', bu: 'manufacturing', phone: '' },
    { id: 'tm_nadine', name: 'Nadine', role: 'Finance & Accounting', bu: 'holding', phone: '' },
    { id: 'tm_jad', name: 'Jad', role: 'Trading & Customs Ops', bu: 'trading', phone: '' },
    { id: 'tm_karim', name: 'Karim', role: 'Resort Operations', bu: 'hospitality', phone: '' },
    { id: 'tm_maya', name: 'Maya', role: 'Real Estate & Brokerage', bu: 'realestate_ins', phone: '' }
  ];

  const cfg = window.THEO_CLOUD_CFG || {};
  const CLOUD_URL = cfg.u ? atob(cfg.u) : '';
  const CLOUD_KEY = cfg.k ? atob(cfg.k) : '';
  const BRIDGE_PORT = cfg.port || 4318;

  function todayIso() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function randomToken(len = 16) {
    const arr = new Uint8Array(len);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtInt(n) {
    const v = Number(n || 0);
    return Number.isFinite(v) ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '0';
  }

  const state = {
    theme: localStorage.getItem('theo_cmd_theme') || 'dark',
    activeTab: 'radar',
    scoreDate: todayIso(),
    boardFilter: 'all',
    boardGroupBy: 'cluster', // 'cluster' | 'subtopic'
    timerFilter: 'all',
    delegatedBuFilter: 'all',
    delegatedStatusFilter: 'all',
    expandedRowId: '',
    openClusterSheetId: '',
    bridgeOrigin: '',
    syncMode: 'cloud',
    reminders: [],
    deletedIds: [],
    dailyScores: {},
    teamRoster: [...DEFAULT_TEAM_ROSTER],
    delegatedCloudMap: {},
    updatedAt: 0,
    draft: {
      text: '',
      waitChoice: 'auto',
      clusterOverride: '',
      customGroup: '',
      assigneeId: '',
      assigneeName: '',
      assigneeBu: '',
      recur: 'none'
    }
  };

  /* ============================================================================
     LOCAL PERSISTENCE & LEGACY MIGRATION
     ============================================================================ */
  function loadLocalState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (raw && typeof raw === 'object') {
        if (Array.isArray(raw.reminders)) state.reminders = raw.reminders;
        if (Array.isArray(raw.deletedIds)) state.deletedIds = raw.deletedIds;
        if (raw.dailyScores && typeof raw.dailyScores === 'object') state.dailyScores = raw.dailyScores;
        if (Array.isArray(raw.teamRoster) && raw.teamRoster.length) state.teamRoster = raw.teamRoster;
        state.updatedAt = Number(raw.updatedAt || 0);
      }
      // Also merge any items saved in theo_personal_ledger_v1 on same origin
      const legacy = JSON.parse(localStorage.getItem(LEGACY_LEDGER_KEY) || 'null');
      if (legacy && typeof legacy === 'object') {
        mergeIncomingLedger(legacy, false);
      }
    } catch {}
  }

  function saveLocalState() {
    state.updatedAt = Date.now();
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          reminders: state.reminders,
          deletedIds: state.deletedIds.slice(-300),
          dailyScores: state.dailyScores,
          teamRoster: state.teamRoster,
          updatedAt: state.updatedAt
        })
      );
      localStorage.setItem(
        LEGACY_LEDGER_KEY,
        JSON.stringify({
          reminders: state.reminders,
          deletedIds: state.deletedIds.slice(-300),
          dailyScores: state.dailyScores,
          updatedAt: state.updatedAt
        })
      );
    } catch {}
  }

  function mergeIncomingLedger(incoming, renderAfter = true) {
    if (!incoming || typeof incoming !== 'object') return false;
    let changed = false;

    const delSet = new Set(state.deletedIds || []);
    if (Array.isArray(incoming.deletedIds)) {
      for (const dId of incoming.deletedIds) {
        if (dId && !delSet.has(dId)) {
          delSet.add(dId);
          changed = true;
        }
      }
      state.deletedIds = Array.from(delSet).slice(-300);
    }

    if (Array.isArray(incoming.reminders)) {
      const map = new Map();
      for (const r of state.reminders) {
        if (r && r.id && !delSet.has(r.id)) map.set(r.id, r);
      }
      for (const rem of incoming.reminders) {
        if (!rem || !rem.id || delSet.has(rem.id)) continue;
        const cur = map.get(rem.id);
        if (!cur || Number(rem.updatedAt || 0) > Number(cur.updatedAt || 0)) {
          map.set(rem.id, rem);
          changed = true;
        }
      }
      // Deduplicate active items with identical normalized title + category + assignee
      const seenActiveKey = new Map();
      const deduped = [];
      const sorted = Array.from(map.values()).sort(
        (a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0)
      );
      for (const item of sorted) {
        if (!item.completed) {
          const normKey = `${String(item.title || '').trim().toLowerCase()}|${item.category || ''}|${String(item.assigneeName || '').trim().toLowerCase()}`;
          if (seenActiveKey.has(normKey)) {
            changed = true;
            continue;
          }
          seenActiveKey.set(normKey, item.id);
        }
        deduped.push(item);
      }
      state.reminders = deduped.sort(
        (a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)
      );
    }

    if (incoming.dailyScores && typeof incoming.dailyScores === 'object') {
      for (const [iso, rec] of Object.entries(incoming.dailyScores)) {
        if (!rec || typeof rec !== 'object') continue;
        const cur = state.dailyScores[iso];
        if (!cur || Number(rec.updatedAt || 0) > Number(cur.updatedAt || 0)) {
          state.dailyScores[iso] = rec;
          changed = true;
        }
      }
    }

    if (Array.isArray(incoming.teamRoster) && incoming.teamRoster.length) {
      const rMap = new Map();
      for (const m of state.teamRoster) rMap.set(m.id, m);
      for (const m of incoming.teamRoster) {
        if (m && m.id) rMap.set(m.id, m);
      }
      state.teamRoster = Array.from(rMap.values());
    }

    if (changed) {
      saveLocalState();
      if (renderAfter) renderAll();
    }
    return changed;
  }

  function mergeDelegatedCloudStatus(delegatedMap) {
    if (!delegatedMap || typeof delegatedMap !== 'object') return;
    state.delegatedCloudMap = delegatedMap;
    let changed = false;
    for (const rem of state.reminders) {
      if (!rem || !rem.id) continue;
      const dTask = delegatedMap[rem.id];
      if (!dTask) continue;
      const staffTs = dTask.staffUpdatedAt ? new Date(dTask.staffUpdatedAt).getTime() : 0;
      if (
        dTask.delegationStatus &&
        dTask.delegationStatus !== rem.delegationStatus &&
        staffTs >= Number(rem.ownerStatusAt || 0)
      ) {
        rem.delegationStatus = dTask.delegationStatus;
        rem.staffNote = dTask.staffNote || rem.staffNote || '';
        rem.staffUpdatedAt = dTask.staffUpdatedAt || '';
        rem.updatedAt = Math.max(Number(rem.updatedAt || 0), staffTs || Date.now());
        changed = true;
      } else if (dTask.staffNote && dTask.staffNote !== rem.staffNote) {
        rem.staffNote = dTask.staffNote;
        changed = true;
      }
    }
    if (changed) {
      saveLocalState();
      renderAll();
    }
  }

  /* ============================================================================
     DAILY 100-POINT PERSONAL DISCIPLINE ENGINE (50% BASELINE + 5 DO'S - 5 DON'TS)
     ============================================================================ */
  function getDayRecord(iso = state.scoreDate) {
    if (!state.dailyScores[iso]) {
      state.dailyScores[iso] = {
        date: iso,
        dos: {},
        donts: {},
        updatedAt: 0
      };
    }
    return state.dailyScores[iso];
  }

  function computeDayScore(iso = state.scoreDate) {
    const rec = getDayRecord(iso);
    let doEarned = 0;
    let dontLost = 0;
    for (const d of DAILY_DOS) {
      const v = rec.dos?.[d.id] || 'none';
      if (v === 'full') doEarned += 10;
      else if (v === 'half') doEarned += 5;
    }
    for (const dn of DAILY_DONTS) {
      const v = rec.donts?.[dn.id] || 'intact';
      if (v === 'slip') dontLost += 10;
      else if (v === 'half') dontLost += 5;
    }
    const total = Math.max(0, Math.min(100, 50 + doEarned - dontLost));
    return {
      baseline: 50,
      doEarned,
      dontLost,
      dontKept: 50 - dontLost,
      total,
      netDelta: doEarned - dontLost
    };
  }

  function cycleHabitQuick(group, habitId, iso = todayIso()) {
    const rec = getDayRecord(iso);
    if (group === 'do') {
      const cur = rec.dos[habitId] || 'none';
      rec.dos[habitId] = cur === 'none' ? 'half' : cur === 'half' ? 'full' : 'none';
    } else {
      const cur = rec.donts[habitId] || 'intact';
      rec.donts[habitId] = cur === 'intact' ? 'half' : cur === 'half' ? 'slip' : 'intact';
    }
    rec.updatedAt = Date.now();
    saveLocalState();
    renderAll();
    syncAll().catch(() => {});
  }

  function setHabitState(group, habitId, val, iso = state.scoreDate) {
    const rec = getDayRecord(iso);
    if (group === 'do') {
      rec.dos[habitId] = val;
    } else {
      rec.donts[habitId] = val;
    }
    rec.updatedAt = Date.now();
    saveLocalState();
    renderAll();
    syncAll().catch(() => {});
  }

  /* ============================================================================
     NATURAL-LANGUAGE SMART CLASSIFIER, CONTEXT TAGS & @PERSON DELEGATION PARSER
     ============================================================================ */
  function extractSmartContext(rawText = '') {
    const text = String(rawText || '').trim();
    const s = text.toLowerCase();

    // 1. Check explicit @Person or "delegate to / tell / ask / talk to [Name]"
    let assigneeName = '';
    let assigneeId = '';
    let assigneeBu = '';
    let isDelegation = false;

    const atMatch = text.match(/@([A-Za-z][A-Za-z0-9_]{1,18})/);
    if (atMatch && atMatch[1]) {
      assigneeName = atMatch[1].charAt(0).toUpperCase() + atMatch[1].slice(1);
      isDelegation = true;
    } else {
      const delMatch = text.match(
        /\b(?:delegate to|assign to|tell|have|ask)\s+([A-Z][a-z]{2,15})\s+(?:to\b|about\b)/
      );
      if (delMatch && delMatch[1]) {
        assigneeName = delMatch[1];
        isDelegation = true;
      } else {
        const talkMatch = text.match(
          /\b(?:talk to|call|text|whatsapp|message|ping|check with|follow up with|remind)\s+([A-Z][a-z]{2,15})\b/
        );
        const STOP = new Set(['The', 'And', 'For', 'About', 'Tomorrow', 'Today', 'Tonight', 'Work', 'App', 'Bank', 'Mom', 'Dad']);
        if (talkMatch && talkMatch[1] && !STOP.has(talkMatch[1])) {
          assigneeName = talkMatch[1];
        }
      }
    }

    // Match against BHFIRMS Team Roster
    if (!assigneeName) {
      for (const m of state.teamRoster) {
        const rx = new RegExp(`\\b${m.name}\\b`, 'i');
        if (rx.test(text)) {
          assigneeName = m.name;
          assigneeId = m.id;
          assigneeBu = m.bu;
          if (/\b(check|prepare|send|fix|inspect|verify|handle|complete|follow up|update|review)\b/i.test(s)) {
            isDelegation = true;
          }
          break;
        }
      }
    } else {
      const found = state.teamRoster.find(
        (m) => m.name.toLowerCase() === assigneeName.toLowerCase()
      );
      if (found) {
        assigneeId = found.id;
        assigneeName = found.name;
        assigneeBu = found.bu;
      }
    }

    // 2. Detect Business Unit (BU)
    let buId = assigneeBu || '';
    let buTag = '';
    const buRules = [
      { id: 'hospitality', tag: '🏖️ Resorts', rx: /\b(blanca|la\s*una|palms|voile|platinum|resort|hospitality|beach|cabana|kitchen|pos)\b/i },
      { id: 'manufacturing', tag: '🏗️ WTC · Mfg', rx: /\b(wtc|bbc|bbconstruction|lions|concrete|batch|cement|quarry|filter\s*press|mixer|manufacturing|plant)\b/i },
      { id: 'trading', tag: '🚛 Korri · Trading', rx: /\b(korri|shacman|truck|vin|customs|spare\s*part|workshop|trading)\b/i },
      { id: 'realestate_ins', tag: '🏢 RE · Ins', rx: /\b(real\s*estate|tenant|lease|rent|unit|insurance|policy|brokerage|claim|underwrit)\b/i },
      { id: 'holding', tag: '🏛️ Holding', rx: /\b(holding|vat|tax|audit|coa|payroll|accounting|journal|soa)\b/i },
      { id: 'tech', tag: '⚡ Tech', rx: /\b(theo|claude|antigravity|pwa|flow|power\s*automate|script|github|vscode)\b/i }
    ];
    for (const r of buRules) {
      if (r.rx.test(text)) {
        buId = r.id;
        buTag = r.tag;
        break;
      }
    }
    if (!buTag && buId) {
      const bMeta = BHFIRMS_BUS.find((b) => b.id === buId);
      if (bMeta) buTag = bMeta.short;
    }

    // 3. Detect App / Bank Tag
    let appTag = '';
    const appRules = [
      { label: '📱 Whish', rx: /\b(whish|wish money)\b/i },
      { label: '📱 OMT', rx: /\b(omt)\b/i },
      { label: '📱 Bank', rx: /\b(bank|audi|blom|byblos|fransabank|neo|statement|wire)\b/i },
      { label: '📱 Stripe/Wise', rx: /\b(stripe|paypal|wise|revolut)\b/i },
      { label: '📱 App Sync', rx: /\b(on the app|certain app|in the app|show up|didn'?t show|not showing)\b/i }
    ];
    for (const a of appRules) {
      if (a.rx.test(text)) {
        appTag = a.label;
        break;
      }
    }

    // 4. Extract Dollar Amount
    let amount = 0;
    const amtMatch =
      text.match(/\$\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)/) ||
      text.match(/\b([0-9]+(?:,[0-9]{3})*)\s*(?:usd|dollars|\$)\b/i);
    if (amtMatch && amtMatch[1]) {
      amount = Number(amtMatch[1].replace(/,/g, '')) || 0;
    }

    return {
      assigneeId,
      assigneeName,
      buId,
      buTag,
      appTag,
      amount,
      isDelegation
    };
  }

  function detectCluster(text = '', override = '') {
    if (override) {
      return CLUSTERS.find((c) => c.id === override) || CLUSTERS[0];
    }
    const s = String(text || '').toLowerCase();
    // 1. Ideas for later & Want to do (unless explicitly @Person delegated)
    if (
      !/^@[A-Za-z]/.test(text) &&
      /\b(idea|concept|maybe build|brainstorm|feature idea|automation idea|side project|someday|what if|prototype|experiment|for later)\b/i.test(s)
    ) {
      return CLUSTERS.find((c) => c.id === 'ideas');
    }
    if (
      !/^@[A-Za-z]/.test(text) &&
      /\b(want to|wanna|bucket list|try out|visit|travel|trip|watch|read|buy for myself|weekend|hobby|learn|explore|plan to do|things to do|padel)\b/i.test(s)
    ) {
      return CLUSTERS.find((c) => c.id === 'want_to_do');
    }
    // 2. Explicit @Person delegation or talking to someone
    if (
      /@[A-Za-z]/.test(text) ||
      /\b(talk to|call|text|message|follow up|reach out|check in with|speak with|speak to|ask |meet with|remind |reply to|contact |delegate to|tell )\b/i.test(s)
    ) {
      return CLUSTERS.find((c) => c.id === 'people');
    }
    // 3. App Sync / Verification ("paid and didn't show up on app")
    if (
      /\b(didn'?t show|did not show|not showing|show up|showed up|on the app|in the app|certain app|pending transaction|verify|reconcile|cleared|reflected|refund)\b/i.test(s) ||
      (/\b(paid|sent|transferred)\b/i.test(s) && /\b(app|account|show|check|pending|yet|still|whish|omt)\b/i.test(s))
    ) {
      return CLUSTERS.find((c) => c.id === 'verify');
    }
    // 4. Shipping & Orders
    if (
      /\b(ship|shipping|shipment|delivery|deliver|package|parcel|courier|tracking|dhl|aramex|fedex|cargo|container|arrival|arrive|ordered|order status|freight|transit)\b/i.test(s)
    ) {
      return CLUSTERS.find((c) => c.id === 'shipping');
    }
    // 5. Family & Home
    if (
      /\b(family|mom|mother|dad|father|parents|wife|kids|brother|sister|uncle|aunt|cousin|home|house|groceries|dinner|lunch with|birthday|doctor|dentist|school|pharmacy|gift)\b/i.test(s)
    ) {
      return CLUSTERS.find((c) => c.id === 'family');
    }
    // 6. Payments & Wait Holds
    if (
      /\b(pay|payment|invoice|supplier|vendor|installment|transfer|settle|wire|deposit|cheque|hold payment|wait to pay)\b/i.test(s)
    ) {
      return CLUSTERS.find((c) => c.id === 'payments');
    }
    return CLUSTERS.find((c) => c.id === 'work');
  }

  function parseNaturalTiming(text = '', clusterId = 'work', amount = 0) {
    const s = String(text || '').toLowerCase();
    const now = Date.now();

    const minM = s.match(/\b(?:in|wait|for|after)\s+(\d{1,3})\s*(?:m|min|mins|minute|minutes)\b/);
    if (minM) {
      const m = Number(minM[1]);
      return { targetAt: now + m * 60000, label: `In ${m}m`, isHold: true, recur: 'none' };
    }
    const hrM = s.match(/\b(?:in|wait|for|after)\s+(\d{1,3})\s*(?:h|hr|hrs|hour|hours)\b/);
    if (hrM) {
      const h = Number(hrM[1]);
      return { targetAt: now + h * 3600000, label: `In ${h}h`, isHold: true, recur: 'none' };
    }
    const dayM = s.match(/\b(?:in|wait|for|after|shipping|delivery|takes?)\s+(\d{1,3})\s*(?:d|day|days)\b/);
    if (dayM) {
      const d = Number(dayM[1]);
      return { targetAt: now + d * 86400000, label: `${d}d Timer`, isHold: true, recur: 'none' };
    }
    if (/\b(tonight|this evening)\b/.test(s)) {
      const t = new Date();
      t.setHours(20, 0, 0, 0);
      if (t.getTime() <= now) t.setTime(now + 2 * 3600000);
      return { targetAt: t.getTime(), label: 'Tonight 20:00', isHold: false, recur: 'none' };
    }
    if (/\b(tomorrow)\b/.test(s)) {
      const t = new Date(now + 86400000);
      const hrMatch = s.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
      if (hrMatch) {
        let hr = Number(hrMatch[1]);
        const mn = Number(hrMatch[2] || 0);
        if (hrMatch[3] === 'pm' && hr < 12) hr += 12;
        if (hrMatch[3] === 'am' && hr === 12) hr = 0;
        t.setHours(hr, mn, 0, 0);
      } else {
        t.setHours(10, 0, 0, 0);
      }
      return { targetAt: t.getTime(), label: 'Tomorrow', isHold: false, recur: 'none' };
    }
    if (/\b(next week)\b/.test(s)) {
      return { targetAt: now + 7 * 86400000, label: 'In 7d', isHold: true, recur: 'none' };
    }
    if (/\b(every day|daily)\b/.test(s)) {
      return { targetAt: now + 86400000, label: 'Daily', isHold: false, recur: 'daily' };
    }
    if (/\b(every week|weekly)\b/.test(s)) {
      return { targetAt: now + 7 * 86400000, label: 'Weekly', isHold: false, recur: 'weekly' };
    }

    // Smart cluster defaults
    if (clusterId === 'ideas' || clusterId === 'want_to_do') {
      return { targetAt: 0, label: 'Parked (No Alarm)', isHold: false, recur: 'none' };
    }
    if (clusterId === 'verify') {
      return { targetAt: now + 24 * 3600000, label: '24h Verify Wait', isHold: true, recur: 'none' };
    }
    if (clusterId === 'shipping') {
      return { targetAt: now + 5 * 86400000, label: '5d Shipping Timer', isHold: true, recur: 'none' };
    }
    if (clusterId === 'payments') {
      const days = amount >= 15000 ? 10 : amount >= 5000 ? 7 : amount >= 1000 ? 4 : 2;
      return { targetAt: now + days * 86400000, label: `${days}d Payment Hold`, isHold: true, recur: 'none' };
    }
    if (clusterId === 'family') {
      const t = new Date();
      t.setHours(20, 0, 0, 0);
      if (t.getTime() <= now) t.setTime(now + 12 * 3600000);
      return { targetAt: t.getTime(), label: 'Evening 20:00', isHold: false, recur: 'none' };
    }
    return { targetAt: now + 24 * 3600000, label: '+24h Follow-Up', isHold: false, recur: 'none' };
  }

  function resolveTimingFromChoice(choice, text, clusterId, amount) {
    const now = Date.now();
    if (choice === 'park') return { targetAt: 0, label: 'Parked (No Alarm)', isHold: false };
    if (choice === '3h') return { targetAt: now + 3 * 3600000, label: 'In 3h', isHold: true };
    if (choice === 'tonight') {
      const t = new Date();
      t.setHours(20, 30, 0, 0);
      if (t.getTime() <= now) t.setTime(now + 3 * 3600000);
      return { targetAt: t.getTime(), label: 'Tonight 20:30', isHold: false };
    }
    if (choice === '1d') return { targetAt: now + 24 * 3600000, label: '+24h', isHold: true };
    if (choice === '2d') return { targetAt: now + 2 * 86400000, label: '2d Wait', isHold: true };
    if (choice === '4d') return { targetAt: now + 4 * 86400000, label: '4d Wait', isHold: true };
    if (choice === '5d') return { targetAt: now + 5 * 86400000, label: '5d Shipping', isHold: true };
    if (choice === '7d') return { targetAt: now + 7 * 86400000, label: '7d Wait', isHold: true };
    return parseNaturalTiming(text, clusterId, amount);
  }

  function formatCountdown(targetAt, now = Date.now()) {
    if (!targetAt) return 'Parked';
    const diff = targetAt - now;
    if (diff <= 0) return 'Ready Now';
    const mins = Math.ceil(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(diff / 3600000);
    if (hrs < 48) {
      const remM = Math.floor((diff % 3600000) / 60000);
      return remM > 0 ? `${hrs}h ${remM}m` : `${hrs}h`;
    }
    const days = Math.floor(diff / 86400000);
    const remH = Math.floor((diff % 86400000) / 3600000);
    return remH > 0 ? `${days}d ${remH}h` : `${days}d`;
  }

  /* ============================================================================
     RFC 8291 (aes128gcm) + RFC 8292 (VAPID) WEB PUSH ENGINE
     ============================================================================ */
  function b64UrlToU8(b64u) {
    const pad = '='.repeat((4 - (b64u.length % 4)) % 4);
    const b64 = (b64u + pad).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function u8ToB64Url(u8) {
    let bin = '';
    for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function u8ToB64(u8) {
    let bin = '';
    for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    return btoa(bin);
  }

  function concatU8(...arrays) {
    const total = arrays.reduce((acc, a) => acc + a.length, 0);
    const res = new Uint8Array(total);
    let off = 0;
    for (const a of arrays) {
      res.set(a, off);
      off += a.length;
    }
    return res;
  }

  async function signVapid(endpoint) {
    const u = new URL(endpoint);
    const aud = `${u.protocol}//${u.host}`;
    const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
    const enc = new TextEncoder();
    const hdr = u8ToB64Url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
    const pay = u8ToB64Url(
      enc.encode(JSON.stringify({ aud, exp, sub: 'mailto:hussein@bhfirms.com' }))
    );
    const unsigned = `${hdr}.${pay}`;
    const key = await crypto.subtle.importKey(
      'jwk',
      VAPID_PRIVATE_JWK,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );
    const sig = new Uint8Array(
      await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        enc.encode(unsigned)
      )
    );
    return `vapid t=${unsigned}.${u8ToB64Url(sig)}, k=${VAPID_PUBLIC_B64}`;
  }

  async function hkdfExtractAndExpand(salt, ikm, info, len) {
    const keyHmac = await crypto.subtle.importKey(
      'raw',
      salt,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const prk = new Uint8Array(await crypto.subtle.sign('HMAC', keyHmac, ikm));
    const prkKey = await crypto.subtle.importKey(
      'raw',
      prk,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const out = new Uint8Array(
      await crypto.subtle.sign('HMAC', prkKey, concatU8(info, new Uint8Array([1])))
    );
    return out.slice(0, len);
  }

  async function encryptWebPush(subKeys, payloadObj) {
    const enc = new TextEncoder();
    const uaPub = b64UrlToU8(subKeys.p256dh);
    const authSecret = b64UrlToU8(subKeys.auth);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const asKeyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );
    const asPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', asKeyPair.publicKey));
    const uaPubKey = await crypto.subtle.importKey(
      'raw',
      uaPub,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );
    const sharedSecret = new Uint8Array(
      await crypto.subtle.deriveBits({ name: 'ECDH', public: uaPubKey }, asKeyPair.privateKey, 256)
    );
    const keyInfo = concatU8(enc.encode('WebPush: info\0'), uaPub, asPubRaw);
    const ikm = await hkdfExtractAndExpand(authSecret, sharedSecret, keyInfo, 32);
    const cek = await hkdfExtractAndExpand(
      salt,
      ikm,
      enc.encode('Content-Encoding: aes128gcm\0'),
      16
    );
    const nonce = await hkdfExtractAndExpand(
      salt,
      ikm,
      enc.encode('Content-Encoding: nonce\0'),
      12
    );
    const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, [
      'encrypt'
    ]);
    const plain = concatU8(enc.encode(JSON.stringify(payloadObj)), new Uint8Array([2]));
    const cipher = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plain)
    );
    const rs = new Uint8Array(4);
    new DataView(rs.buffer).setUint32(0, 4096, false);
    const idlen = new Uint8Array([asPubRaw.length]);
    return u8ToB64(concatU8(salt, rs, idlen, asPubRaw, cipher));
  }

  function getSavedPushSub() {
    try {
      return JSON.parse(localStorage.getItem(PUSH_REG_KEY) || 'null');
    } catch {
      return null;
    }
  }

  async function buildPreSignedOwnerPush(title, body, tab = 'delegated', taskId = '') {
    const sub = getSavedPushSub();
    if (!sub || !sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return null;
    try {
      const vapid = await signVapid(sub.endpoint);
      const bodyB64 = await encryptWebPush(sub.keys, {
        title,
        body,
        tag: `cmd-del-${taskId || Date.now()}`,
        tab,
        taskId,
        url: './?tab=delegated'
      });
      return {
        endpoint: sub.endpoint,
        vapid,
        bodyB64
      };
    } catch {
      return null;
    }
  }

  async function scheduleCloudTimerPush(item) {
    const sub = getSavedPushSub();
    if (!sub || !sub.endpoint || !sub.keys?.p256dh || !CLOUD_URL || !CLOUD_KEY) return;
    const targetAt = Number(item.matureAt || item.dueAt || 0);
    if (!targetAt) return;
    const delaySec = Math.round((targetAt - Date.now()) / 1000);
    if (delaySec < 5 || delaySec > 25 * 86400) return;
    try {
      const vapid = await signVapid(sub.endpoint);
      const bodyB64 = await encryptWebPush(sub.keys, {
        title: `⏳ Timer Ready — ${item.title.slice(0, 42)}`,
        body: `${item.subTag ? `${item.subTag} · ` : ''}Tap to verify or complete in THEO Command.`,
        tag: `cmd-timer-${item.id}`,
        tab: 'timers',
        taskId: item.id,
        url: './?tab=timers'
      });
      await fetch(CLOUD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({
          key: CLOUD_KEY,
          op: 'push_delay',
          timerKey: `timer_${item.id}`,
          timerId: `${item.id}_${targetAt}`,
          delaySec,
          endpoint: sub.endpoint,
          vapid,
          bodyB64
        })
      });
    } catch {}
  }

  /* ============================================================================
     ADD / UPDATE / DELEGATE TASK ACTIONS
     ============================================================================ */
  async function addTaskFromDraft(sendWhatsAppImmediately = false) {
    const rawText = state.draft.text.trim();
    if (!rawText) {
      showToast('Type a task, reminder, wait check, or @Person first');
      return;
    }

    const ctx = extractSmartContext(rawText);
    const cluster = detectCluster(rawText, state.draft.clusterOverride);
    const timing = resolveTimingFromChoice(
      state.draft.waitChoice,
      rawText,
      cluster.id,
      ctx.amount
    );

    const assigneeName = state.draft.assigneeName || ctx.assigneeName || '';
    const assigneeId = state.draft.assigneeId || ctx.assigneeId || '';
    const buId = state.draft.assigneeBu || ctx.buId || '';
    const buMeta = BHFIRMS_BUS.find((b) => b.id === buId);
    const subTag =
      state.draft.customGroup ||
      (assigneeName ? `👤 ${assigneeName}` : '') ||
      ctx.appTag ||
      ctx.buTag ||
      (buMeta ? buMeta.short : '');

    // Clean @Person prefix from display title if desired while keeping it readable
    const cleanTitle = rawText.replace(/^@[A-Za-z0-9_]+\s*[:,-]?\s*/, '').trim() || rawText;
    const id = `rem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const isDelegated = Boolean(assigneeName);
    const taskToken = isDelegated ? randomToken(12) : '';

    const newItem = {
      id,
      title: cleanTitle,
      category: cluster.id,
      customGroup: state.draft.customGroup || '',
      subTag,
      buId,
      amount: ctx.amount || 0,
      kind: timing.targetAt === 0 ? 'parked' : timing.isHold ? 'wait' : 'task',
      recur: timing.recur || 'none',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      dueAt: timing.targetAt || 0,
      matureAt: timing.isHold ? timing.targetAt : 0,
      completed: false,
      isDelegated,
      assigneeId,
      assigneeName,
      delegationStatus: isDelegated ? 'assigned' : '',
      taskToken,
      staffNote: '',
      staffUpdatedAt: ''
    };

    // If new assignee name isn't in roster yet, add them automatically
    if (assigneeName && !state.teamRoster.some((m) => m.name.toLowerCase() === assigneeName.toLowerCase())) {
      state.teamRoster.push({
        id: `tm_${Date.now().toString(36)}`,
        name: assigneeName,
        role: 'Team Member',
        bu: buId || 'holding',
        phone: ''
      });
    }

    state.reminders.unshift(newItem);
    state.draft = {
      text: '',
      waitChoice: 'auto',
      clusterOverride: '',
      customGroup: '',
      assigneeId: '',
      assigneeName: '',
      assigneeBu: '',
      recur: 'none'
    };
    const inp = document.getElementById('capture-input');
    if (inp) inp.value = '';

    saveLocalState();
    renderAll();

    if (newItem.matureAt || newItem.dueAt) {
      scheduleCloudTimerPush(newItem).catch(() => {});
    }
    await syncAll(newItem);

    if (sendWhatsAppImmediately && isDelegated) {
      dispatchWhatsAppDelegation(newItem.id);
    } else {
      showToast(
        isDelegated
          ? `Assigned to 👤 ${assigneeName} (${cluster.shortLabel})`
          : `Added to ${cluster.icon} ${cluster.shortLabel}`
      );
    }
  }

  function getDelegationMagicUrl(item) {
    const base = window.location.origin + window.location.pathname.replace(/index\.html$/, '');
    return `${base}?task=${encodeURIComponent(item.id)}&token=${encodeURIComponent(item.taskToken || '')}`;
  }

  function dispatchWhatsAppDelegation(remId, isNudge = false) {
    const item = state.reminders.find((r) => r.id === remId);
    if (!item) return;
    if (!item.taskToken) {
      item.taskToken = randomToken(12);
    }
    item.isDelegated = true;
    if (!item.delegationStatus || item.delegationStatus === 'assigned') {
      item.delegationStatus = 'sent';
    }
    item.ownerStatusAt = Date.now();
    item.updatedAt = Date.now();
    saveLocalState();
    renderAll();
    syncAll(item).catch(() => {});

    const member = state.teamRoster.find(
      (m) =>
        (item.assigneeId && m.id === item.assigneeId) ||
        (item.assigneeName && m.name.toLowerCase() === item.assigneeName.toLowerCase())
    );
    const phone = (member?.phone || '').replace(/[^0-9]/g, '');
    const buMeta = BHFIRMS_BUS.find((b) => b.id === (item.buId || member?.bu));
    const targetStr =
      item.dueAt || item.matureAt
        ? new Date(item.dueAt || item.matureAt).toLocaleString([], {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
        : 'As soon as possible';

    const link = getDelegationMagicUrl(item);
    const msg = isNudge
      ? `🔔 *Follow-Up — Hussein Bdeir (BHFIRMS)*\nHi ${item.assigneeName || 'team'}, please update the status on:\n• *${item.title}*\n\n👇 *Tap to mark Seen / Working / Done:*\n${link}`
      : `📋 *Task from Hussein Bdeir (BHFIRMS)*\n• *Task:* ${item.title}${buMeta ? `\n• *Unit:* ${buMeta.short}` : ''}\n• *Target:* ${targetStr}\n\n👇 *Tap to update live status (Seen / Working / Done):*\n${link}`;

    const waUrl = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank', 'noopener');
  }

  /* ============================================================================
     CLOUD RELAY & WORKSTATION BRIDGE SYNC
     ============================================================================ */
  async function probeBridge() {
    const origins = [];
    if (location.port === String(BRIDGE_PORT)) {
      origins.push(location.origin);
    }
    origins.push(`http://127.0.0.1:${BRIDGE_PORT}`, `http://localhost:${BRIDGE_PORT}`);
    for (const orig of origins) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 1100);
        const r = await fetch(`${orig}/api/ping`, { signal: ctrl.signal });
        clearTimeout(t);
        if (r.ok) {
          state.bridgeOrigin = orig;
          state.syncMode = 'bridge';
          return orig;
        }
      } catch {}
    }
    state.bridgeOrigin = '';
    state.syncMode = 'cloud';
    return '';
  }

  let syncInFlight = false;
  let syncPending = false;
  let pendingDelegatedItem = null;

  async function syncAll(newlyDelegatedItem = null) {
    if (newlyDelegatedItem) pendingDelegatedItem = newlyDelegatedItem;
    if (syncInFlight) {
      syncPending = true;
      return;
    }
    syncInFlight = true;
    try {
      do {
        syncPending = false;
        const delItem = pendingDelegatedItem;
        pendingDelegatedItem = null;
        await runSingleSync(delItem);
      } while (syncPending);
    } finally {
      syncInFlight = false;
    }
  }

  async function runSingleSync(newlyDelegatedItem = null) {
    const dot = document.getElementById('sync-dot');
    const lbl = document.getElementById('sync-label');

    // 1. Try Local Bridge if reachable
    if (!state.bridgeOrigin) {
      await probeBridge();
    }
    if (state.bridgeOrigin) {
      try {
        const res = await fetch(`${state.bridgeOrigin}/api/personal-ledger`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            personalLedger: {
              reminders: state.reminders,
              deletedIds: state.deletedIds.slice(-300),
              dailyScores: state.dailyScores,
              teamRoster: state.teamRoster,
              updatedAt: state.updatedAt
            }
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.personalLedger) {
            mergeIncomingLedger(data.personalLedger, true);
          }
          if (dot) dot.className = 'sync-dot';
          if (lbl) lbl.textContent = 'Bridge';
        }
      } catch {
        state.bridgeOrigin = '';
      }
    }

    // 2. Sync with Dataverse Cloud Relay (including delegated_tasks map!)
    if (!CLOUD_URL || !CLOUD_KEY) return;
    try {
      const getRes = await fetch(CLOUD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ key: CLOUD_KEY, op: 'get' })
      });
      if (getRes.ok) {
        const store = await getRes.json();
        const docs = store?.docs || store || {};
        if (docs.personal_ledger) {
          mergeIncomingLedger(docs.personal_ledger, false);
        }
        if (docs.delegated_tasks && typeof docs.delegated_tasks === 'object') {
          mergeDelegatedCloudStatus(docs.delegated_tasks);
        }

        // Build updated delegated_tasks map so staff links work 100% serverlessly
        const nextDelMap = { ...(docs.delegated_tasks || {}) };
        for (const rem of state.reminders) {
          if (!rem || !rem.isDelegated || !rem.id) continue;
          if (!rem.taskToken) rem.taskToken = randomToken(12);
          const existing = nextDelMap[rem.id] || {};
          let pushOnDone = existing.pushOnDone || null;
          if (newlyDelegatedItem && newlyDelegatedItem.id === rem.id && !pushOnDone) {
            pushOnDone = await buildPreSignedOwnerPush(
              `✅ ${rem.assigneeName || 'Team'} updated task`,
              `${rem.title} — tap to verify in THEO Command`,
              'delegated',
              rem.id
            );
          }
          nextDelMap[rem.id] = {
            id: rem.id,
            token: rem.taskToken,
            title: rem.title,
            assigneeName: rem.assigneeName || '',
            assigneeBu: rem.buId || '',
            subTag: rem.subTag || '',
            dueAt: rem.dueAt || rem.matureAt || 0,
            delegationStatus: rem.delegationStatus || existing.delegationStatus || 'sent',
            staffNote: rem.staffNote || existing.staffNote || '',
            staffUpdatedAt: rem.staffUpdatedAt || existing.staffUpdatedAt || '',
            pushOnDone
          };
        }

        await fetch(CLOUD_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({
            key: CLOUD_KEY,
            op: 'patch',
            patch: {
              personal_ledger: {
                reminders: state.reminders,
                deletedIds: state.deletedIds.slice(-300),
                dailyScores: state.dailyScores,
                teamRoster: state.teamRoster,
                updatedAt: state.updatedAt
              },
              delegated_tasks: nextDelMap
            }
          })
        });

        if (dot) dot.className = state.bridgeOrigin ? 'sync-dot' : 'sync-dot cloud';
        if (lbl) lbl.textContent = state.bridgeOrigin ? 'Bridge+Cloud' : 'Cloud Live';
        renderAll();
      }
    } catch {}
  }

  /* ============================================================================
     RENDERING: TOP 52PX HUD RIBBON + LIVE ADVISOR + 5 ZERO-SCROLL VIEWS
     ============================================================================ */
  function renderHudRibbon() {
    const todaySc = computeDayScore(todayIso());
    const scoreValEl = document.getElementById('hud-score-val');
    const scoreDeltaEl = document.getElementById('hud-score-delta');
    const dockScoreEl = document.getElementById('dock-badge-score');

    if (scoreValEl) {
      scoreValEl.textContent = `${todaySc.total}%`;
      scoreValEl.style.color =
        todaySc.total >= 75
          ? 'var(--emerald)'
          : todaySc.total >= 50
            ? 'var(--brass-bright)'
            : 'var(--crimson)';
    }
    if (scoreDeltaEl) {
      const sign = todaySc.netDelta >= 0 ? `+${todaySc.netDelta}%` : `${todaySc.netDelta}%`;
      scoreDeltaEl.textContent = `50% ${sign}`;
    }
    if (dockScoreEl) {
      dockScoreEl.textContent = `${todaySc.total}%`;
    }

    const strip = document.getElementById('hud-habit-strip');
    if (!strip) return;
    const rec = getDayRecord(todayIso());

    const doChips = DAILY_DOS.map((d) => {
      const st = rec.dos?.[d.id] || 'none';
      const cls = st === 'full' ? 'do-full' : st === 'half' ? 'do-half' : '';
      const badge = st === 'full' ? '+10' : st === 'half' ? '+5' : '';
      return `
        <button type="button" class="hud-habit-chip ${cls}" data-hud-habit="do:${d.id}" title="${esc(d.label)} (Tap to cycle 0% → +5% → +10%)">
          <span>${d.icon}</span>
          <span>${esc(d.short)}</span>
          ${badge ? `<strong class="tabular">${badge}</strong>` : ''}
        </button>
      `;
    }).join('');

    const dontChips = DAILY_DONTS.map((dn) => {
      const st = rec.donts?.[dn.id] || 'intact';
      const cls = st === 'slip' ? 'dont-slip' : st === 'half' ? 'dont-half' : 'dont-kept';
      const badge = st === 'slip' ? '-10' : st === 'half' ? '-5' : '';
      return `
        <button type="button" class="hud-habit-chip ${cls}" data-hud-habit="dont:${dn.id}" title="${esc(dn.label)} (Intact 10% · Tap if slipped -5% / -10%)">
          <span>${dn.icon}</span>
          <span>${esc(dn.short)}</span>
          ${badge ? `<strong class="tabular">${badge}</strong>` : ''}
        </button>
      `;
    }).join('');

    strip.innerHTML = `${doChips}<span class="hud-divider"></span>${dontChips}`;
  }

  function renderLiveAdvisorDrawer() {
    const drawer = document.getElementById('live-advisor-drawer');
    const delBtn = document.getElementById('btn-pick-assignee');
    const delLbl = document.getElementById('capture-assignee-label');
    if (!drawer) return;

    const text = state.draft.text.trim();
    const ctx = extractSmartContext(text);
    const activeAssignee = state.draft.assigneeName || ctx.assigneeName || '';

    if (delBtn && delLbl) {
      if (activeAssignee) {
        delBtn.classList.add('active');
        delLbl.textContent = `@${activeAssignee}`;
      } else {
        delBtn.classList.remove('active');
        delLbl.textContent = '@Delegate';
      }
    }

    if (!text && !state.draft.assigneeName && !state.draft.clusterOverride) {
      drawer.hidden = true;
      drawer.innerHTML = '';
      return;
    }

    drawer.hidden = false;
    const cluster = detectCluster(text, state.draft.clusterOverride);
    const timing = resolveTimingFromChoice(
      state.draft.waitChoice,
      text,
      cluster.id,
      ctx.amount
    );

    const timeChips = [
      { k: 'auto', lbl: `✨ Auto (${timing.label})` },
      { k: 'park', lbl: '📌 Park (No Timer)' },
      { k: '3h', lbl: 'In 3h' },
      { k: 'tonight', lbl: 'Tonight 20:30' },
      { k: '1d', lbl: '+24h' },
      { k: '2d', lbl: '+2d' },
      { k: '5d', lbl: '+5d (Ship)' },
      { k: '7d', lbl: '+7d' }
    ];

    drawer.innerHTML = `
      <div class="advisor-top-row">
        <div class="advisor-detected-badges">
          <span class="t-pill" style="border-color:var(--brass);color:var(--brass-bright)">
            ${cluster.icon} ${esc(cluster.label)}
          </span>
          ${
            activeAssignee
              ? `<span class="t-pill person">👤 Delegate: ${esc(activeAssignee)}</span>`
              : ''
          }
          ${ctx.buTag ? `<span class="t-pill">${esc(ctx.buTag)}</span>` : ''}
          ${ctx.appTag ? `<span class="t-pill timer">${esc(ctx.appTag)}</span>` : ''}
          ${ctx.amount > 0 ? `<span class="t-pill amt">$${fmtInt(ctx.amount)}</span>` : ''}
          <span class="t-pill ${timing.targetAt ? 'timer' : ''}">
            ⏳ ${esc(timing.label)}
          </span>
        </div>
        ${
          activeAssignee
            ? `<button type="button" class="mini-chip wa-btn" id="btn-add-and-whatsapp">📲 Add &amp; Send WhatsApp</button>`
            : ''
        }
      </div>

      <div class="advisor-chip-strip">
        ${timeChips
          .map(
            (c) => `
          <button type="button" class="mini-chip ${state.draft.waitChoice === c.k ? 'active' : ''}" data-wait-chip="${c.k}">
            ${esc(c.lbl)}
          </button>
        `
          )
          .join('')}
      </div>

      <div class="advisor-chip-strip">
        <button type="button" class="mini-chip ${!state.draft.clusterOverride ? 'active' : ''}" data-cluster-chip="">✨ Auto Cluster</button>
        ${CLUSTERS.map(
          (c) => `
          <button type="button" class="mini-chip ${state.draft.clusterOverride === c.id ? 'active' : ''}" data-cluster-chip="${c.id}">
            ${c.icon} ${esc(c.shortLabel)}
          </button>
        `
        ).join('')}
      </div>
    `;
  }

  /* ============================================================================
     COMPACT 44PX SINGLE-LINE TICKER ROW RENDERER
     ============================================================================ */
  function renderTickerRowHtml(item, now = Date.now()) {
    const cluster = CLUSTERS.find((c) => c.id === item.category) || CLUSTERS[3];
    const targetAt = Number(item.matureAt || item.dueAt || 0);
    const isHold = Boolean(item.matureAt || item.kind === 'wait' || cluster.id === 'verify' || cluster.id === 'shipping' || cluster.id === 'payments');
    const isMatured = !item.completed && targetAt > 0 && now >= targetAt && isHold;
    const isOverdue = !item.completed && targetAt > 0 && now >= targetAt && !isHold;
    const isHolding = !item.completed && targetAt > now && isHold;
    const isExpanded = state.expandedRowId === item.id;

    const rowCls = [
      'ticker-row-card',
      item.completed ? 'completed' : isMatured ? 'matured' : isOverdue ? 'overdue' : isHolding ? 'holding' : '',
      isExpanded ? 'expanded' : ''
    ]
      .filter(Boolean)
      .join(' ');

    const countdown = formatCountdown(targetAt, now);
    let progressPct = 0;
    if (isHold && !item.completed && item.createdAt && targetAt > item.createdAt) {
      progressPct = Math.max(4, Math.min(100, Math.round(((now - item.createdAt) / (targetAt - item.createdAt)) * 100)));
    }

    let delBadge = '';
    if (item.isDelegated) {
      const st = item.delegationStatus || 'assigned';
      const stMap = {
        assigned: { lbl: `👤 ${item.assigneeName || 'Team'}`, cls: 'person' },
        sent: { lbl: `📨 ${item.assigneeName} · Sent`, cls: 'person' },
        seen: { lbl: `👀 ${item.assigneeName} · Seen`, cls: 'person' },
        working: { lbl: `⚙️ ${item.assigneeName} · Working`, cls: 'timer' },
        done: { lbl: `✅ ${item.assigneeName} · Done (Verify)`, cls: 'matured' }
      };
      const meta = stMap[st] || stMap.assigned;
      delBadge = `<span class="t-pill ${meta.cls}">${esc(meta.lbl)}</span>`;
    } else if (item.subTag) {
      delBadge = `<span class="t-pill">${esc(item.subTag)}</span>`;
    }

    const doneVerb =
      item.delegationStatus === 'done'
        ? '✓ Verify & Close'
        : cluster.id === 'verify'
          ? '✓ Verified'
          : cluster.id === 'shipping'
            ? '✓ Received'
            : cluster.id === 'people'
              ? '✓ Spoke'
              : cluster.id === 'payments'
                ? '✓ Paid'
                : '✓ Done';

    return `
      <div class="${rowCls}" data-row-id="${esc(item.id)}">
        <div class="ticker-main-line" data-row-toggle="${esc(item.id)}">
          <button
            type="button"
            class="ticker-check-btn"
            data-act="toggle-done"
            data-id="${esc(item.id)}"
            title="${esc(doneVerb)}"
          >✓</button>
          <span class="ticker-title">${esc(item.title)}</span>
          <div class="ticker-pills">
            ${delBadge}
            ${item.amount > 0 ? `<span class="t-pill amt">$${fmtInt(item.amount)}</span>` : ''}
            ${
              targetAt > 0
                ? `<span class="t-pill ${isMatured || item.delegationStatus === 'done' ? 'matured' : 'timer'} tabular">${
                    isMatured ? '🔓 Ready' : `⏳ ${esc(countdown)}`
                  }</span>`
                : ''
            }
          </div>
        </div>

        ${
          item.staffNote
            ? `<div style="padding:0 12px 6px 40px;font-size:11.5px;color:var(--emerald)">💬 <strong>${esc(
                item.assigneeName || 'Staff'
              )}:</strong> ${esc(item.staffNote)}</div>`
            : ''
        }

        <div class="ticker-action-drawer" ${isExpanded ? '' : 'hidden'}>
          <div class="ticker-act-btns">
            ${
              !item.completed
                ? `
              <button type="button" class="t-act-btn primary" data-act="toggle-done" data-id="${esc(item.id)}">${esc(doneVerb)}</button>
              <button type="button" class="t-act-btn wa" data-act="whatsapp" data-id="${esc(item.id)}">
                📲 ${item.isDelegated ? `WhatsApp ${esc(item.assigneeName)}` : 'Delegate / WhatsApp'}
              </button>
              ${
                item.isDelegated
                  ? `<button type="button" class="t-act-btn" data-act="copy-link" data-id="${esc(item.id)}">🔗 Copy Status Link</button>`
                  : ''
              }
              <button type="button" class="t-act-btn" data-act="snooze-1d" data-id="${esc(item.id)}">+24h</button>
              <button type="button" class="t-act-btn" data-act="snooze-3d" data-id="${esc(item.id)}">+3d</button>
              ${
                isHolding
                  ? `<button type="button" class="t-act-btn" data-act="release-now" data-id="${esc(item.id)}">Ready Now</button>`
                  : ''
              }
              <button type="button" class="t-act-btn" data-act="move-cluster" data-id="${esc(item.id)}">🏷️ Cluster</button>
            `
                : `
              <button type="button" class="t-act-btn" data-act="toggle-done" data-id="${esc(item.id)}">↺ Reopen</button>
            `
            }
            <button type="button" class="t-act-btn danger" data-act="delete" data-id="${esc(item.id)}">✕</button>
          </div>
        </div>

        ${
          isHold && !item.completed && targetAt > 0
            ? `<div class="ticker-progress-bar"><div class="ticker-progress-fill" style="width:${progressPct}%;background:${
                isMatured ? 'var(--emerald)' : 'var(--brass)'
              }"></div></div>`
            : ''
        }
      </div>
    `;
  }

  /* ============================================================================
     TAB 1: ZERO-SCROLL 2X4 BENTO RADAR GRID
     ============================================================================ */
  function renderRadarView() {
    const root = document.getElementById('view-radar');
    if (!root) return;
    const now = Date.now();
    const active = state.reminders.filter((r) => !r.completed);

    // Urgent / Matured / Staff-Completed strip
    const urgentItems = active.filter((r) => {
      const t = Number(r.matureAt || r.dueAt || 0);
      return (t > 0 && now >= t) || r.delegationStatus === 'done';
    });

    const urgentHtml = urgentItems.length
      ? `
      <div class="radar-urgent-strip">
        <strong style="font-size:11px;color:var(--emerald);flex-shrink:0;text-transform:uppercase;letter-spacing:0.05em">
          🔥 Ready Now (${urgentItems.length})
        </strong>
        ${urgentItems
          .slice(0, 6)
          .map(
            (u) => `
          <div class="urgent-pill-item">
            <button type="button" class="bento-micro-check" data-act="toggle-done" data-id="${esc(u.id)}" title="Complete">✓</button>
            <span>${esc(u.title.slice(0, 38))}</span>
            ${
              u.delegationStatus === 'done'
                ? `<span class="bento-micro-tag matured">✅ ${esc(u.assigneeName)} Done</span>`
                : `<span class="bento-micro-tag matured">Ready</span>`
            }
          </div>
        `
          )
          .join('')}
      </div>
    `
      : '';

    const tilesHtml = CLUSTERS.map((c) => {
      const items = active.filter((r) => (r.category || 'work') === c.id);
      const maturedCount = items.filter((r) => {
        const t = Number(r.matureAt || r.dueAt || 0);
        return (t > 0 && now >= t) || r.delegationStatus === 'done';
      }).length;

      const tileCls = [
        'bento-tile',
        maturedCount > 0 ? 'has-matured' : ''
      ]
        .filter(Boolean)
        .join(' ');

      const topRows = items.slice(0, 3).map((it) => {
        const t = Number(it.matureAt || it.dueAt || 0);
        const isReady = (t > 0 && now >= t) || it.delegationStatus === 'done';
        const tagTxt = it.assigneeName
          ? `👤 ${it.assigneeName}`
          : t > 0
            ? formatCountdown(t, now)
            : it.subTag
              ? it.subTag.replace(/^[^\w]+/, '').trim().slice(0, 8)
              : '';
        return `
          <div class="bento-micro-row" data-micro-id="${esc(it.id)}">
            <button
              type="button"
              class="bento-micro-check"
              data-act="toggle-done"
              data-id="${esc(it.id)}"
              title="Complete now"
            >✓</button>
            <span class="bento-micro-text">${esc(it.title)}</span>
            ${
              tagTxt
                ? `<span class="bento-micro-tag ${isReady ? 'matured' : ''} tabular">${esc(tagTxt)}</span>`
                : ''
            }
          </div>
        `;
      });

      return `
        <div class="${tileCls}" data-open-cluster="${c.id}">
          <div class="bento-head">
            <div class="bento-title-wrap">
              <span class="bento-icon">${c.icon}</span>
              <span class="bento-title">${esc(c.label)}</span>
            </div>
            <div class="bento-count-wrap">
              ${
                maturedCount > 0
                  ? `<span class="bento-count matured tabular">${maturedCount} ready</span>`
                  : ''
              }
              <span class="bento-count ${items.length ? 'active' : ''} tabular">${items.length}</span>
            </div>
          </div>

          <div class="bento-items">
            ${
              topRows.length
                ? topRows.join('')
                : `<div class="bento-empty"><span>${esc(c.sub)}</span><span>+</span></div>`
            }
          </div>

          <div class="bento-foot">
            <span>${items.length > 3 ? `+${items.length - 3} more · Tap to expand` : 'Tap to open or + add'}</span>
            <span>↗</span>
          </div>
        </div>
      `;
    }).join('');

    root.innerHTML = `
      ${urgentHtml}
      <div class="bento-radar-grid">
        ${tilesHtml}
      </div>
    `;
  }

  /* ============================================================================
     TAB 2: TIMERS & HOLDS (VERIFY APP SYNC, SHIPPING, PAYMENT HOLDS)
     ============================================================================ */
  function renderTimersView() {
    const root = document.getElementById('view-timers');
    if (!root) return;
    const now = Date.now();
    const allTimed = state.reminders.filter(
      (r) =>
        !r.completed &&
        (r.matureAt > 0 ||
          r.dueAt > 0 ||
          r.category === 'verify' ||
          r.category === 'shipping' ||
          r.category === 'payments')
    );

    const filters = [
      { id: 'all', lbl: `All Timers (${allTimed.length})` },
      {
        id: 'ready',
        lbl: `🔓 Ready Now (${allTimed.filter((r) => (r.matureAt || r.dueAt) && now >= (r.matureAt || r.dueAt)).length})`
      },
      { id: 'verify', lbl: `🔍 Verify / App (${allTimed.filter((r) => r.category === 'verify').length})` },
      { id: 'shipping', lbl: `📦 Shipping (${allTimed.filter((r) => r.category === 'shipping').length})` },
      { id: 'payments', lbl: `💸 Payment Holds (${allTimed.filter((r) => r.category === 'payments').length})` }
    ];

    const filtered = allTimed
      .filter((r) => {
        if (state.timerFilter === 'ready') {
          const t = Number(r.matureAt || r.dueAt || 0);
          return t > 0 && now >= t;
        }
        if (state.timerFilter !== 'all') return r.category === state.timerFilter;
        return true;
      })
      .sort((a, b) => Number(a.matureAt || a.dueAt || 0) - Number(b.matureAt || b.dueAt || 0));

    root.innerHTML = `
      <div class="view-filter-bar">
        <div class="horiz-pill-strip">
          ${filters
            .map(
              (f) => `
            <button type="button" class="filter-pill ${state.timerFilter === f.id ? 'active' : ''}" data-timer-filter="${f.id}">
              ${esc(f.lbl)}
            </button>
          `
            )
            .join('')}
        </div>
      </div>
      <div class="ticker-list">
        ${
          filtered.length
            ? filtered.map((it) => renderTickerRowHtml(it, now)).join('')
            : `<div style="padding:28px;text-align:center;color:var(--text-muted)">No active wait timers in this filter. Drop a verify check, shipping countdown, or payment hold above!</div>`
        }
      </div>
    `;
  }

  /* ============================================================================
     TAB 3: BHFIRMS ORGANIZATIONAL DELEGATION & TEAM ACCOUNTABILITY MATRIX
     ============================================================================ */
  function renderDelegatedView() {
    const root = document.getElementById('view-delegated');
    if (!root) return;
    const now = Date.now();
    const delegated = state.reminders.filter(
      (r) => !r.completed && (r.isDelegated || r.assigneeName || r.category === 'people')
    );

    const statusCounts = {
      all: delegated.length,
      waiting: delegated.filter((r) => !r.delegationStatus || r.delegationStatus === 'assigned' || r.delegationStatus === 'sent').length,
      seen: delegated.filter((r) => r.delegationStatus === 'seen').length,
      working: delegated.filter((r) => r.delegationStatus === 'working').length,
      done: delegated.filter((r) => r.delegationStatus === 'done').length
    };

    const filtered = delegated.filter((r) => {
      if (state.delegatedBuFilter !== 'all' && r.buId !== state.delegatedBuFilter) return false;
      if (state.delegatedStatusFilter === 'waiting') {
        return !r.delegationStatus || r.delegationStatus === 'assigned' || r.delegationStatus === 'sent';
      }
      if (state.delegatedStatusFilter !== 'all' && r.delegationStatus !== state.delegatedStatusFilter) {
        return false;
      }
      return true;
    });

    // Group by Assignee
    const byPerson = new Map();
    for (const r of filtered) {
      const inferred =
        r.assigneeName ||
        (r.subTag && r.subTag.startsWith('👤') ? r.subTag.replace(/^👤\s*/, '').trim() : '') ||
        extractSmartContext(r.title).assigneeName ||
        'General Follow-Up';
      if (!byPerson.has(inferred)) byPerson.set(inferred, []);
      byPerson.get(inferred).push(r);
    }

    root.innerHTML = `
      <div class="view-filter-bar">
        <div class="horiz-pill-strip">
          <button type="button" class="filter-pill ${state.delegatedBuFilter === 'all' ? 'active' : ''}" data-del-bu="all">
            All BHFIRMS BUs (${delegated.length})
          </button>
          ${BHFIRMS_BUS.map(
            (b) => `
            <button type="button" class="filter-pill ${state.delegatedBuFilter === b.id ? 'active' : ''}" data-del-bu="${b.id}">
              ${esc(b.short)}
            </button>
          `
          ).join('')}
        </div>
        <button type="button" class="filter-pill active" id="btn-manage-roster">👥 Team Roster (${state.teamRoster.length})</button>
      </div>

      <div class="horiz-pill-strip" style="flex:0 0 auto">
        <button type="button" class="mini-chip ${state.delegatedStatusFilter === 'all' ? 'active' : ''}" data-del-status="all">All (${statusCounts.all})</button>
        <button type="button" class="mini-chip ${state.delegatedStatusFilter === 'waiting' ? 'active' : ''}" data-del-status="waiting">📨 Sent / Waiting (${statusCounts.waiting})</button>
        <button type="button" class="mini-chip ${state.delegatedStatusFilter === 'seen' ? 'active' : ''}" data-del-status="seen">👀 Seen (${statusCounts.seen})</button>
        <button type="button" class="mini-chip ${state.delegatedStatusFilter === 'working' ? 'active' : ''}" data-del-status="working">⚙️ Working (${statusCounts.working})</button>
        <button type="button" class="mini-chip ${state.delegatedStatusFilter === 'done' ? 'active' : ''}" data-del-status="done">✅ Done · Verify (${statusCounts.done})</button>
      </div>

      <div class="ticker-list">
        ${
          byPerson.size
            ? Array.from(byPerson.entries())
                .map(([person, items]) => {
                  const member = state.teamRoster.find(
                    (m) => m.name.toLowerCase() === person.toLowerCase()
                  );
                  const buMeta = BHFIRMS_BUS.find((b) => b.id === member?.bu);
                  return `
                  <div class="ticker-group-header">
                    <span>👤 ${esc(person)} ${buMeta ? `· ${esc(buMeta.short)}` : ''} ${member?.role ? `(${esc(member.role)})` : ''}</span>
                    <span>${items.length} task${items.length === 1 ? '' : 's'}</span>
                  </div>
                  ${items.map((it) => renderTickerRowHtml(it, now)).join('')}
                `;
                })
                .join('')
            : `<div style="padding:28px;text-align:center;color:var(--text-muted)">No delegated tasks in this filter. Type <strong>@Name</strong> in the top bar (e.g. <em>@Rami check WTC filter press</em>) to delegate and send a 1-tap WhatsApp tracking link!</div>`
        }
      </div>
    `;
  }

  /* ============================================================================
     TAB 4: HORIZONTAL CATEGORY & SUB-TOPIC BOARD (ZERO VERTICAL SCROLL)
     ============================================================================ */
  function renderBoardView() {
    const root = document.getElementById('view-board');
    if (!root) return;
    const now = Date.now();
    const active = state.reminders.filter((r) => !r.completed);
    const completed = state.reminders.filter((r) => r.completed);

    const filtered =
      state.boardFilter === 'completed'
        ? completed
        : state.boardFilter === 'all'
          ? active
          : active.filter((r) => (r.category || 'work') === state.boardFilter);

    let listHtml = '';
    if (state.boardGroupBy === 'subtopic' && state.boardFilter !== 'completed') {
      const groups = new Map();
      for (const r of filtered) {
        const cl = CLUSTERS.find((c) => c.id === (r.category || 'work')) || CLUSTERS[3];
        const key = r.subTag ? `${cl.icon} ${cl.shortLabel} · ${r.subTag}` : `${cl.icon} ${cl.label}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
      }
      listHtml = Array.from(groups.entries())
        .map(
          ([gName, items]) => `
          <div class="ticker-group-header">
            <span>${esc(gName)}</span>
            <span>${items.length}</span>
          </div>
          ${items.map((it) => renderTickerRowHtml(it, now)).join('')}
        `
        )
        .join('');
    } else {
      listHtml = filtered.map((it) => renderTickerRowHtml(it, now)).join('');
    }

    root.innerHTML = `
      <div class="view-filter-bar">
        <div class="horiz-pill-strip">
          <button type="button" class="filter-pill ${state.boardFilter === 'all' ? 'active' : ''}" data-board-filter="all">
            All Active (${active.length})
          </button>
          ${CLUSTERS.map((c) => {
            const cnt = active.filter((r) => (r.category || 'work') === c.id).length;
            return `
              <button type="button" class="filter-pill ${state.boardFilter === c.id ? 'active' : ''}" data-board-filter="${c.id}">
                ${c.icon} ${esc(c.shortLabel)} (${cnt})
              </button>
            `;
          }).join('')}
          <button type="button" class="filter-pill ${state.boardFilter === 'completed' ? 'active' : ''}" data-board-filter="completed">
            ✓ Done (${completed.length})
          </button>
        </div>
        <button
          type="button"
          class="mini-chip ${state.boardGroupBy === 'subtopic' ? 'active' : ''}"
          id="btn-toggle-subtopic-group"
        >🏷️ Sub-Topics &amp; BUs</button>
      </div>

      <div class="ticker-list">
        ${
          listHtml ||
          `<div style="padding:28px;text-align:center;color:var(--text-muted)">No items in this category yet.</div>`
        }
      </div>
    `;
  }

  /* ============================================================================
     TAB 5: DAILY 100-POINT PERSONAL DISCIPLINE LEDGER
     ============================================================================ */
  function renderScoreView() {
    const root = document.getElementById('view-score');
    if (!root) return;

    const sc = computeDayScore(state.scoreDate);
    const rec = getDayRecord(state.scoreDate);
    const scoreColor =
      sc.total >= 75 ? 'var(--emerald)' : sc.total >= 50 ? 'var(--brass-bright)' : 'var(--crimson)';

    // Last 7 days strip
    const days = [];
    const baseD = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(baseD.getTime() - i * 86400000);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const daySc = computeDayScore(iso);
      days.push({
        iso,
        lbl: i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' }),
        total: daySc.total
      });
    }

    root.innerHTML = `
      <div class="score-summary-card">
        <div class="score-top-row">
          <div style="display:flex;align-items:baseline;gap:10px">
            <span class="score-big-num tabular" style="color:${scoreColor}">${sc.total}%</span>
            <span style="font-size:12px;color:var(--text-secondary)">
              Start <strong>50%</strong> · Do's <strong style="color:var(--emerald)">+${sc.doEarned}%</strong> · Don'ts <strong style="color:var(--crimson)">-${sc.dontLost}%</strong> (${sc.dontKept}% kept)
            </span>
          </div>
          <div style="display:flex;align-items:center;gap:5px">
            <button type="button" class="mini-chip" id="btn-score-today">Today (${todayIso()})</button>
            <button type="button" class="mini-chip" id="btn-score-reset">Reset to 50%</button>
          </div>
        </div>

        <div class="score-bar-track">
          <div class="score-bar-fill" style="width:${sc.total}%;background:${scoreColor}"></div>
        </div>

        <div class="score-week-strip">
          ${days
            .map(
              (dy) => `
            <div class="week-day-pill ${dy.iso === state.scoreDate ? 'active' : ''}" data-score-date="${dy.iso}">
              <div style="font-size:10px;color:var(--text-muted)">${esc(dy.lbl)}</div>
              <div class="tabular" style="font-size:12.5px;font-weight:800;color:${
                dy.total >= 75 ? 'var(--emerald)' : dy.total >= 50 ? 'var(--brass-bright)' : 'var(--crimson)'
              }">${dy.total}%</div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>

      <div class="score-two-col">
        <div class="habit-col-box">
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:12.5px;font-weight:800;color:var(--emerald)">
            <span>✅ 5 Daily Do's (+10% Full · +5% Half)</span>
            <span class="tabular">+${sc.doEarned}% / 50%</span>
          </div>
          ${DAILY_DOS.map((d) => {
            const val = rec.dos?.[d.id] || 'none';
            return `
              <div class="habit-compact-row">
                <div>
                  <div style="font-size:13px;font-weight:700">${d.icon} ${esc(d.label)}</div>
                  <div style="font-size:10.5px;color:var(--text-muted)">${esc(d.sub)}</div>
                </div>
                <div class="habit-seg-btns">
                  <button type="button" class="h-seg-btn ${val === 'none' ? 'active-amber' : ''}" data-set-habit="do:${d.id}:none">0%</button>
                  <button type="button" class="h-seg-btn ${val === 'half' ? 'active-amber' : ''}" data-set-habit="do:${d.id}:half">+5%</button>
                  <button type="button" class="h-seg-btn ${val === 'full' ? 'active-emerald' : ''}" data-set-habit="do:${d.id}:full">+10%</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <div class="habit-col-box">
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:12.5px;font-weight:800;color:var(--crimson)">
            <span>🛡️ 5 Daily Don'ts (Start 50% · -5% · -10%)</span>
            <span class="tabular">${sc.dontKept}% / 50% Kept</span>
          </div>
          ${DAILY_DONTS.map((dn) => {
            const val = rec.donts?.[dn.id] || 'intact';
            return `
              <div class="habit-compact-row">
                <div>
                  <div style="font-size:13px;font-weight:700">${dn.icon} ${esc(dn.label)}</div>
                  <div style="font-size:10.5px;color:var(--text-muted)">${esc(dn.sub)}</div>
                </div>
                <div class="habit-seg-btns">
                  <button type="button" class="h-seg-btn ${val === 'intact' ? 'active-emerald' : ''}" data-set-habit="dont:${dn.id}:intact">10% Kept</button>
                  <button type="button" class="h-seg-btn ${val === 'half' ? 'active-amber' : ''}" data-set-habit="dont:${dn.id}:half">-5%</button>
                  <button type="button" class="h-seg-btn ${val === 'slip' ? 'active-crimson' : ''}" data-set-habit="dont:${dn.id}:slip">-10%</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  /* ============================================================================
     SLIDE-UP SHEETS: CLUSTER DRILLDOWN & BHFIRMS TEAM ROSTER MANAGER
     ============================================================================ */
  function openClusterSheet(clusterId) {
    state.openClusterSheetId = clusterId;
    const cluster = CLUSTERS.find((c) => c.id === clusterId) || CLUSTERS[0];
    const backdrop = document.getElementById('sheet-backdrop');
    const titleWrap = document.getElementById('sheet-title-wrap');
    const body = document.getElementById('sheet-body');
    if (!backdrop || !titleWrap || !body) return;

    const now = Date.now();
    const items = state.reminders.filter(
      (r) => !r.completed && (r.category || 'work') === clusterId
    );

    titleWrap.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:18px">${cluster.icon}</span>
        <div>
          <strong style="font-size:15px">${esc(cluster.label)} (${items.length})</strong>
          <div style="font-size:11px;color:var(--text-muted)">${esc(cluster.sub)}</div>
        </div>
      </div>
    `;

    body.innerHTML = `
      <div style="display:flex;gap:6px">
        <input
          type="text"
          id="sheet-quick-input"
          class="capture-input"
          style="padding:8px 10px;border-radius:9px;background:var(--bg-card);border:1px solid var(--border-strong)"
          placeholder="Quick add to ${esc(cluster.shortLabel)}…"
        >
        <button type="button" class="capture-submit-btn" id="sheet-quick-add" data-cluster="${cluster.id}">+ Add</button>
      </div>
      <div class="ticker-list" style="max-height:60vh">
        ${
          items.length
            ? items.map((it) => renderTickerRowHtml(it, now)).join('')
            : `<div style="padding:20px;text-align:center;color:var(--text-muted)">No active items in ${esc(cluster.label)}.</div>`
        }
      </div>
    `;
    backdrop.hidden = false;
  }

  function openTeamRosterSheet(pickForDraft = false) {
    const backdrop = document.getElementById('sheet-backdrop');
    const titleWrap = document.getElementById('sheet-title-wrap');
    const body = document.getElementById('sheet-body');
    if (!backdrop || !titleWrap || !body) return;

    titleWrap.innerHTML = `
      <div>
        <strong style="font-size:15px">👥 BHFIRMS Organization Roster &amp; Delegation</strong>
        <div style="font-size:11px;color:var(--text-muted)">Tap any person to assign a task or add team members with WhatsApp numbers</div>
      </div>
    `;

    body.innerHTML = `
      <form id="roster-add-form" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:10px;border-radius:10px;background:var(--bg-card);border:1px solid var(--border-subtle)">
        <input type="text" id="roster-name" placeholder="Name (e.g. Rami)" required style="padding:7px 9px;border-radius:7px;background:var(--bg-ink);border:1px solid var(--border-subtle);font-size:12.5px">
        <input type="text" id="roster-role" placeholder="Role (e.g. Plant Manager)" style="padding:7px 9px;border-radius:7px;background:var(--bg-ink);border:1px solid var(--border-subtle);font-size:12.5px">
        <select id="roster-bu" style="padding:7px 9px;border-radius:7px;background:var(--bg-ink);border:1px solid var(--border-subtle);font-size:12.5px">
          ${BHFIRMS_BUS.map((b) => `<option value="${b.id}">${esc(b.label)}</option>`).join('')}
        </select>
        <div style="display:flex;gap:5px">
          <input type="tel" id="roster-phone" placeholder="WhatsApp (+961...)" style="flex:1;min-width:0;padding:7px 9px;border-radius:7px;background:var(--bg-ink);border:1px solid var(--border-subtle);font-size:12.5px">
          <button type="submit" class="capture-submit-btn" style="padding:6px 10px">+ Save</button>
        </div>
      </form>

      <div class="ticker-list">
        ${state.teamRoster
          .map((m) => {
            const buMeta = BHFIRMS_BUS.find((b) => b.id === m.bu);
            return `
              <div class="habit-compact-row">
                <div style="min-width:0;flex:1">
                  <div style="font-size:13.5px;font-weight:700">👤 ${esc(m.name)} <span class="t-pill">${esc(buMeta ? buMeta.short : m.bu)}</span></div>
                  <div style="font-size:11px;color:var(--text-muted)">${esc(m.role || 'Team')} ${m.phone ? `· 📱 ${esc(m.phone)}` : '· No phone set'}</div>
                </div>
                <div style="display:flex;gap:5px">
                  <button type="button" class="t-act-btn primary" data-pick-member="${esc(m.id)}">
                    ${pickForDraft ? 'Assign in Bar' : '+ Delegate Task'}
                  </button>
                  <button type="button" class="t-act-btn danger" data-del-member="${esc(m.id)}">✕</button>
                </div>
              </div>
            `;
          })
          .join('')}
      </div>
    `;
    backdrop.hidden = false;
  }

  function updateDockBadges() {
    const now = Date.now();
    const active = state.reminders.filter((r) => !r.completed);
    const timersCnt = active.filter(
      (r) => r.matureAt > 0 || r.category === 'verify' || r.category === 'shipping' || r.category === 'payments'
    ).length;
    const delCnt = active.filter((r) => r.isDelegated || r.assigneeName).length;

    const setBadge = (id, count) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (count > 0) {
        el.hidden = false;
        el.textContent = String(count);
      } else {
        el.hidden = true;
      }
    };
    setBadge('dock-badge-radar', active.length);
    setBadge('dock-badge-timers', timersCnt);
    setBadge('dock-badge-delegated', delCnt);
    setBadge('dock-badge-board', active.length);
  }

  function renderAll() {
    document.documentElement.setAttribute('data-theme', state.theme);
    renderHudRibbon();
    renderLiveAdvisorDrawer();
    updateDockBadges();

    for (const v of document.querySelectorAll('.cmd-view')) {
      const isMatch = v.getAttribute('data-view') === state.activeTab;
      v.hidden = !isMatch;
      v.classList.toggle('active', isMatch);
    }
    for (const b of document.querySelectorAll('.cmd-dock-btn')) {
      b.classList.toggle('active', b.getAttribute('data-tab') === state.activeTab);
    }

    if (state.activeTab === 'radar') renderRadarView();
    else if (state.activeTab === 'timers') renderTimersView();
    else if (state.activeTab === 'delegated') renderDelegatedView();
    else if (state.activeTab === 'board') renderBoardView();
    else if (state.activeTab === 'score') renderScoreView();

    if (state.openClusterSheetId && !document.getElementById('sheet-backdrop')?.hidden) {
      openClusterSheet(state.openClusterSheetId);
    }
  }

  function showToast(msg) {
    const stack = document.getElementById('toast-stack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = 'toast-item';
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  /* ============================================================================
     ISOLATED STAFF DELEGATION PORTAL (?task=<id>&token=<tok>)
     ============================================================================ */
  async function bootStaffPortalMode(taskId, token) {
    const staffRoot = document.getElementById('staff-portal-root');
    const ownerShell = document.getElementById('owner-app-shell');
    const bottomDock = document.getElementById('cmd-bottom-dock');
    if (ownerShell) ownerShell.hidden = true;
    if (bottomDock) bottomDock.style.display = 'none';
    if (!staffRoot) return;
    staffRoot.hidden = false;

    staffRoot.innerHTML = `
      <div class="staff-card">
        <div style="display:flex;align-items:center;gap:10px">
          <img src="icon.svg" alt="BHFIRMS" style="width:34px;height:34px;border-radius:9px">
          <div>
            <div style="font-size:11px;font-weight:800;letter-spacing:0.06em;color:var(--brass);text-transform:uppercase">BHFIRMS Executive Task Portal</div>
            <div style="font-size:13px;color:var(--text-secondary)">Loading assigned task…</div>
          </div>
        </div>
      </div>
    `;

    try {
      const res = await fetch(CLOUD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ op: 'delegate_get', taskId, token })
      });
      const data = await res.json();
      let taskObj = res.ok && data?.ok && data?.task ? data.task : null;
      if (!taskObj) {
        // Fallback: check local state if opened on the same origin before cloud sync finishes
        try {
          const loc = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
          const found = (loc?.reminders || []).find((r) => r.id === taskId && r.taskToken === token);
          if (found) {
            taskObj = {
              id: found.id,
              token: found.taskToken,
              title: found.title,
              assigneeName: found.assigneeName || 'Team',
              assigneeBu: found.buId || '',
              subTag: found.subTag || '',
              dueAt: found.dueAt || found.matureAt || 0,
              delegationStatus: found.delegationStatus || 'sent',
              staffNote: found.staffNote || ''
            };
          }
        } catch {}
      }
      if (!taskObj) {
        staffRoot.innerHTML = `
          <div class="staff-card">
            <strong style="font-size:16px;color:var(--crimson)">Task Link Expired or Invalid</strong>
            <p style="font-size:13px;color:var(--text-secondary)">Please ask Hussein Bdeir for an updated task link.</p>
          </div>
        `;
        return;
      }

      const renderStaffTask = (t) => {
        const st = t.delegationStatus || 'sent';
        const targetStr = t.dueAt
          ? new Date(Number(t.dueAt)).toLocaleString([], {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })
          : 'As soon as possible';

        staffRoot.innerHTML = `
          <div class="staff-card">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
              <div style="display:flex;align-items:center;gap:10px">
                <img src="icon.svg" alt="BHFIRMS" style="width:34px;height:34px;border-radius:9px">
                <div>
                  <div style="font-size:10.5px;font-weight:800;letter-spacing:0.06em;color:var(--brass);text-transform:uppercase">BHFIRMS · Assigned by Hussein Bdeir</div>
                  <div style="font-size:13px;font-weight:700">👤 Assigned to: ${esc(t.assigneeName || 'Team')}</div>
                </div>
              </div>
              ${t.subTag ? `<span class="t-pill">${esc(t.subTag)}</span>` : ''}
            </div>

            <div style="padding:14px;border-radius:12px;background:var(--bg-ink);border:1px solid var(--border-subtle)">
              <div style="font-size:16px;font-weight:800;line-height:1.4">${esc(t.title)}</div>
              <div style="margin-top:8px;font-size:12px;color:var(--text-secondary)">⏰ Target: <strong>${esc(targetStr)}</strong></div>
            </div>

            <div style="display:flex;flex-direction:column;gap:6px">
              <label style="font-size:11.5px;font-weight:700;color:var(--text-secondary)">Optional Update Note / Completion Details:</label>
              <textarea
                id="staff-note-input"
                rows="2"
                placeholder="Add a quick note (e.g. Done, pressure checked at 14 bar)…"
                style="padding:9px 11px;border-radius:10px;background:var(--bg-ink);border:1px solid var(--border-subtle);font-size:13px"
              >${esc(t.staffNote || '')}</textarea>
            </div>

            <div class="staff-status-grid">
              <button type="button" class="staff-status-btn ${st === 'seen' ? 'active-seen' : ''}" data-staff-status="seen">
                <span>👀 Seen / Acknowledged</span>
                <span>${st === 'seen' ? '✓ Current' : 'Tap'}</span>
              </button>
              <button type="button" class="staff-status-btn ${st === 'working' ? 'active-working' : ''}" data-staff-status="working">
                <span>⚙️ Working On It</span>
                <span>${st === 'working' ? '✓ Current' : 'Tap'}</span>
              </button>
              <button type="button" class="staff-status-btn ${st === 'done' ? 'active-done' : ''}" data-staff-status="done">
                <span>✅ Completed</span>
                <span>${st === 'done' ? '✓ Notified Hussein' : 'Tap to Complete'}</span>
              </button>
            </div>

            <div id="staff-feedback-msg" style="font-size:12px;text-align:center;color:var(--emerald)"></div>
          </div>
        `;

        staffRoot.querySelectorAll('[data-staff-status]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const newStatus = btn.getAttribute('data-staff-status');
            const noteVal = document.getElementById('staff-note-input')?.value?.trim() || '';
            const fb = document.getElementById('staff-feedback-msg');
            if (fb) fb.textContent = 'Saving status update…';
            try {
              const uRes = await fetch(CLOUD_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
                body: JSON.stringify({
                  op: 'delegate_update',
                  taskId,
                  token,
                  status: newStatus,
                  staffNote: noteVal
                })
              });
              const uData = await uRes.json();
              if (uData?.ok && uData?.task) {
                renderStaffTask(uData.task);
                const fb2 = document.getElementById('staff-feedback-msg');
                if (fb2) fb2.textContent = '✓ Status updated and synced with Hussein Bdeir!';
              }
            } catch {}
          });
        });
      };

      renderStaffTask(taskObj);
    } catch {
      staffRoot.innerHTML = `<div class="staff-card">Could not reach BHFIRMS Cloud Relay. Check your connection.</div>`;
    }
  }

  /* ============================================================================
     EVENT BINDINGS & INITIALIZATION
     ============================================================================ */
  function bindOwnerEvents() {
    // Top HUD Score button -> switch to 100% Score tab
    document.getElementById('hud-score-btn')?.addEventListener('click', () => {
      state.activeTab = 'score';
      renderAll();
    });

    // Top HUD 10-Chip Quick Habit Strip
    document.getElementById('hud-habit-strip')?.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-hud-habit]');
      if (!chip) return;
      const [group, id] = chip.getAttribute('data-hud-habit').split(':');
      cycleHabitQuick(group, id);
    });

    // Sync, Push, Theme buttons
    document.getElementById('btn-sync-now')?.addEventListener('click', () => {
      showToast('Syncing with Cloud Relay & Bridge…');
      syncAll();
    });

    document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theo_cmd_theme', state.theme);
      renderAll();
    });

    document.getElementById('btn-push-toggle')?.addEventListener('click', async () => {
      if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        showToast('Add Command to your Home Screen first to enable iOS Web Push');
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        showToast('Notification permission not granted');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64UrlToU8(VAPID_PUBLIC_B64)
      });
      localStorage.setItem(PUSH_REG_KEY, JSON.stringify(sub.toJSON()));
      const pDot = document.getElementById('push-dot');
      if (pDot) pDot.hidden = false;
      showToast('🔔 Lock-Screen Web Push Active!');
    });

    // Capture Bar input & submit
    const capInp = document.getElementById('capture-input');
    capInp?.addEventListener('input', () => {
      state.draft.text = capInp.value;
      renderLiveAdvisorDrawer();
    });

    document.getElementById('capture-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      addTaskFromDraft(false);
    });

    document.getElementById('btn-pick-assignee')?.addEventListener('click', () => {
      openTeamRosterSheet(true);
    });

    // Live Advisor Drawer clicks
    document.getElementById('live-advisor-drawer')?.addEventListener('click', (e) => {
      const wChip = e.target.closest('[data-wait-chip]');
      if (wChip) {
        state.draft.waitChoice = wChip.getAttribute('data-wait-chip');
        renderLiveAdvisorDrawer();
        return;
      }
      const cChip = e.target.closest('[data-cluster-chip]');
      if (cChip) {
        state.draft.clusterOverride = cChip.getAttribute('data-cluster-chip');
        renderLiveAdvisorDrawer();
        return;
      }
      if (e.target.closest('#btn-add-and-whatsapp')) {
        addTaskFromDraft(true);
      }
    });

    // Bottom Dock Tab Navigation
    document.getElementById('cmd-bottom-dock')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      state.activeTab = btn.getAttribute('data-tab');
      renderAll();
    });

    // Delegated clicks inside Main Stage & Slide-Up Sheet
    const handleTaskInteraction = (e) => {
      const actBtn = e.target.closest('[data-act]');
      if (actBtn) {
        e.stopPropagation();
        const act = actBtn.getAttribute('data-act');
        const id = actBtn.getAttribute('data-id');
        const item = state.reminders.find((r) => r.id === id);
        if (!item) return;

        if (act === 'toggle-done') {
          item.completed = !item.completed;
          if (item.completed && item.isDelegated) {
            item.delegationStatus = 'verified';
          }
          item.updatedAt = Date.now();
          saveLocalState();
          renderAll();
          syncAll().catch(() => {});
          showToast(item.completed ? '✓ Marked complete' : '↺ Reopened task');
          return;
        }
        if (act === 'whatsapp') {
          if (!item.assigneeName) {
            const who = prompt('Assign & send via WhatsApp to who? (e.g. Rami, Nadine, Jad):', '');
            if (!who) return;
            item.assigneeName = who.trim();
            item.isDelegated = true;
          }
          dispatchWhatsAppDelegation(item.id);
          return;
        }
        if (act === 'copy-link') {
          if (!item.taskToken) item.taskToken = randomToken(12);
          const url = getDelegationMagicUrl(item);
          navigator.clipboard?.writeText(url);
          saveLocalState();
          syncAll(item).catch(() => {});
          showToast('🔗 Private staff status link copied!');
          return;
        }
        if (act === 'snooze-1d' || act === 'snooze-3d') {
          const addMs = act === 'snooze-1d' ? 86400000 : 3 * 86400000;
          const base = Math.max(Date.now(), Number(item.matureAt || item.dueAt || Date.now()));
          if (item.matureAt) item.matureAt = base + addMs;
          else item.dueAt = base + addMs;
          item.updatedAt = Date.now();
          saveLocalState();
          renderAll();
          syncAll().catch(() => {});
          showToast(`⏳ Snoozed ${act === 'snooze-1d' ? '+24h' : '+3d'}`);
          return;
        }
        if (act === 'release-now') {
          item.matureAt = Date.now() - 1000;
          item.dueAt = Date.now() - 1000;
          item.updatedAt = Date.now();
          saveLocalState();
          renderAll();
          syncAll().catch(() => {});
          showToast('🔓 Marked Ready Now');
          return;
        }
        if (act === 'move-cluster') {
          const idx = CLUSTERS.findIndex((c) => c.id === item.category);
          const next = CLUSTERS[(idx + 1) % CLUSTERS.length];
          item.category = next.id;
          item.updatedAt = Date.now();
          saveLocalState();
          renderAll();
          syncAll().catch(() => {});
          showToast(`Moved to ${next.icon} ${next.shortLabel}`);
          return;
        }
        if (act === 'delete') {
          if (!state.deletedIds.includes(id)) {
            state.deletedIds.push(id);
          }
          state.reminders = state.reminders.filter((r) => r.id !== id);
          saveLocalState();
          renderAll();
          syncAll().catch(() => {});
          showToast('Removed item');
          return;
        }
      }

      // Expand / collapse 44px ticker row
      const rowToggle = e.target.closest('[data-row-toggle]');
      if (rowToggle) {
        const rId = rowToggle.getAttribute('data-row-toggle');
        state.expandedRowId = state.expandedRowId === rId ? '' : rId;
        renderAll();
        return;
      }

      // Open Bento Cluster Sheet
      const tile = e.target.closest('[data-open-cluster]');
      if (tile) {
        openClusterSheet(tile.getAttribute('data-open-cluster'));
        return;
      }

      // Filter pills
      const tf = e.target.closest('[data-timer-filter]');
      if (tf) {
        state.timerFilter = tf.getAttribute('data-timer-filter');
        renderTimersView();
        return;
      }
      const dbu = e.target.closest('[data-del-bu]');
      if (dbu) {
        state.delegatedBuFilter = dbu.getAttribute('data-del-bu');
        renderDelegatedView();
        return;
      }
      const dst = e.target.closest('[data-del-status]');
      if (dst) {
        state.delegatedStatusFilter = dst.getAttribute('data-del-status');
        renderDelegatedView();
        return;
      }
      const bf = e.target.closest('[data-board-filter]');
      if (bf) {
        state.boardFilter = bf.getAttribute('data-board-filter');
        renderBoardView();
        return;
      }
      if (e.target.closest('#btn-toggle-subtopic-group')) {
        state.boardGroupBy = state.boardGroupBy === 'subtopic' ? 'cluster' : 'subtopic';
        renderBoardView();
        return;
      }
      if (e.target.closest('#btn-manage-roster')) {
        openTeamRosterSheet(false);
        return;
      }

      // 100% Score tab controls
      const sh = e.target.closest('[data-set-habit]');
      if (sh) {
        const [grp, hId, val] = sh.getAttribute('data-set-habit').split(':');
        setHabitState(grp, hId, val);
        return;
      }
      const sd = e.target.closest('[data-score-date]');
      if (sd) {
        state.scoreDate = sd.getAttribute('data-score-date');
        renderScoreView();
        return;
      }
      if (e.target.closest('#btn-score-today')) {
        state.scoreDate = todayIso();
        renderScoreView();
        return;
      }
      if (e.target.closest('#btn-score-reset')) {
        state.dailyScores[state.scoreDate] = {
          date: state.scoreDate,
          dos: {},
          donts: {},
          updatedAt: Date.now()
        };
        saveLocalState();
        renderAll();
        syncAll().catch(() => {});
        showToast('Reset day to 50% baseline');
      }
    };

    document.getElementById('cmd-stage')?.addEventListener('click', handleTaskInteraction);

    // Sheet interactions
    const backdrop = document.getElementById('sheet-backdrop');
    document.getElementById('sheet-close-btn')?.addEventListener('click', () => {
      state.openClusterSheetId = '';
      if (backdrop) backdrop.hidden = true;
    });
    backdrop?.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        state.openClusterSheetId = '';
        backdrop.hidden = true;
      }
    });

    document.getElementById('sheet-body')?.addEventListener('click', (e) => {
      const quickAdd = e.target.closest('#sheet-quick-add');
      if (quickAdd) {
        const cId = quickAdd.getAttribute('data-cluster');
        const qInp = document.getElementById('sheet-quick-input');
        if (qInp && qInp.value.trim()) {
          state.draft.text = qInp.value.trim();
          state.draft.clusterOverride = cId;
          addTaskFromDraft(false);
        }
        return;
      }
      const pickM = e.target.closest('[data-pick-member]');
      if (pickM) {
        const mId = pickM.getAttribute('data-pick-member');
        const mem = state.teamRoster.find((m) => m.id === mId);
        if (mem) {
          state.draft.assigneeId = mem.id;
          state.draft.assigneeName = mem.name;
          state.draft.assigneeBu = mem.bu;
          if (backdrop) backdrop.hidden = true;
          renderLiveAdvisorDrawer();
          document.getElementById('capture-input')?.focus();
          showToast(`Delegating to 👤 ${mem.name}`);
        }
        return;
      }
      const delM = e.target.closest('[data-del-member]');
      if (delM) {
        const mId = delM.getAttribute('data-del-member');
        state.teamRoster = state.teamRoster.filter((m) => m.id !== mId);
        saveLocalState();
        openTeamRosterSheet(false);
        return;
      }
      handleTaskInteraction(e);
    });

    document.getElementById('sheet-body')?.addEventListener('submit', (e) => {
      if (e.target.id === 'roster-add-form') {
        e.preventDefault();
        const name = document.getElementById('roster-name')?.value?.trim();
        const role = document.getElementById('roster-role')?.value?.trim();
        const bu = document.getElementById('roster-bu')?.value || 'holding';
        const phone = document.getElementById('roster-phone')?.value?.trim() || '';
        if (!name) return;
        state.teamRoster.push({
          id: `tm_${Date.now().toString(36)}`,
          name,
          role,
          bu,
          phone
        });
        saveLocalState();
        openTeamRosterSheet(false);
        syncAll().catch(() => {});
        showToast(`Added 👤 ${name} to BHFIRMS Roster`);
      }
    });
  }

  async function init() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
    }

    const params = new URLSearchParams(window.location.search);
    const taskId = params.get('task');
    const token = params.get('token');
    if (taskId && token) {
      await bootStaffPortalMode(taskId, token);
      return;
    }

    const initTab = params.get('tab');
    if (initTab && ['radar', 'timers', 'delegated', 'board', 'score'].includes(initTab)) {
      state.activeTab = initTab;
    }

    loadLocalState();
    if (getSavedPushSub()) {
      const pDot = document.getElementById('push-dot');
      if (pDot) pDot.hidden = false;
    }
    bindOwnerEvents();
    renderAll();

    await syncAll();
    setInterval(() => {
      renderAll();
    }, 30000);
    setInterval(() => {
      syncAll().catch(() => {});
    }, 18000);
  }

  init();
})();
