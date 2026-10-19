(() => {
  'use strict';

  const STORAGE_KEYS = {
    CACHE: 'theo_remote_cache_v1',
    PREFS: 'theo_remote_prefs_v1',
    OUTBOX: 'theo_remote_outbox_v1',
    PIN: 'theo_remote_pin_v1'
  };

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
    customBridgeUrl: ''
  });

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
    if (prefs.customBridgeUrl) {
      candidates.push(prefs.customBridgeUrl.replace(/\/+$/, ''));
    }
    if (location.port === String(cloudCfg.port) || location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      candidates.push(`http://localhost:${cloudCfg.port}`);
    }
    candidates.push(`http://127.0.0.1:${cloudCfg.port}`);

    for (const base of candidates) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 1400);
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
            appState = payload.state;
            if (!sseSource) connectSse(bridgeBase);
            persistCache();
            renderAll();
            flushOutbox().catch(() => {});
            if (prefs.selectedThreadId) {
              fetchThreadDetail(prefs.selectedThreadId).catch(() => {});
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
          const store = await res.json();
          connMode = 'cloud';
          if (store?.state?.snapshot) {
            appState = store.state.snapshot;
          }
          if (store?.threads && typeof store.threads === 'object') {
            threadsCache = { ...threadsCache, ...store.threads };
          }
          if (store?.state?.workspacesDetail && typeof store.state.workspacesDetail === 'object') {
            workspacesDetailCache = { ...workspacesDetailCache, ...store.state.workspacesDetail };
          }
          persistCache();
          renderAll();
          flushOutbox().catch(() => {});
          if (options.toast) {
            showToast('Synced with THEO Cloud Relay');
          }
          return true;
        }
      } catch {}
    }

    connMode = 'offline';
    renderAll();
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
            threadsCache[threadId] = data.thread;
            persistCache();
            if (prefs.activeTab === 'chat' && prefs.selectedThreadId === threadId) {
              renderChatView();
            }
            return data.thread;
          }
        }
      } catch {}
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
        const curStore = curRes.ok ? await curRes.json() : {};
        const existingCmds = Array.isArray(curStore?.queue?.commands)
          ? curStore.queue.commands.slice(-18)
          : [];
        existingCmds.push(cmd);

        const postRes = await fetch(cloudCfg.url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({
            key: cloudCfg.key,
            op: 'patch',
            patch: {
              queue: {
                ...(curStore.queue || {}),
                commands: existingCmds
              }
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

    if (connMode === 'local') {
      if (dotRail) dotRail.className = 'conn-dot live';
      if (titleRail) titleRail.textContent = 'Direct Bridge · Live SSE';
      if (subRail) subRail.textContent = localBridgeBase.replace(/^https?:\/\//, '');
      if (dotMob) dotMob.className = 'conn-dot live';
      if (textMob) textMob.textContent = 'Direct SSE';
    } else if (connMode === 'cloud') {
      if (dotRail) dotRail.className = 'conn-dot cloud';
      if (titleRail) titleRail.textContent = 'Cloud Relay · Active';
      if (subRail) subRail.textContent = `Dataverse Sync · ${timeAgo(appState?.generatedAt)}`;
      if (dotMob) dotMob.className = 'conn-dot cloud';
      if (textMob) textMob.textContent = 'Cloud Relay';
    } else {
      if (dotRail) dotRail.className = 'conn-dot';
      if (titleRail) titleRail.textContent = 'Offline Snapshot';
      if (subRail) subRail.textContent = appState?.generatedAt ? `Cached ${timeAgo(appState.generatedAt)}` : 'Waiting for connection';
      if (dotMob) dotMob.className = 'conn-dot';
      if (textMob) textMob.textContent = 'Cached';
    }
  }

  // Navigation switching
  function switchTab(tabName) {
    const valid = ['pulse', 'sessions', 'chat', 'workspaces', 'analytics'];
    const target = valid.includes(tabName) ? tabName : 'pulse';
    prefs.activeTab = target;
    saveJson(STORAGE_KEYS.PREFS, prefs);

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
    const rows = appState?.rows || [];
    const approvals = appState?.approvals || [];
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
      badgeSessions.textContent = String(rows.filter((r) => !r.archived).length);
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
    let limits = provInfo?.usage?.allLimits?.length
      ? provInfo.usage.allLimits
      : provInfo?.usage?.limits || [];

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
      <div class="quota-card">
        <div class="quota-card-head">
          <div class="quota-prov-title">
            <span class="prov-glyph">${PROVIDER_ICONS[key]}</span>
            <div>
              <div>${esc(label)}</div>
              ${email ? `<div class="meta-timestamp">${esc(email)}</div>` : ''}
            </div>
          </div>
          <span class="plan-pill">${esc(plan)}</span>
        </div>
        <div class="quota-bars-stack">${barsHtml}</div>
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
    const rows = appState?.rows || [];
    const q = ($('sess-search-input')?.value || '').trim().toLowerCase();

    const filtered = rows.filter((r) => {
      if (!r.id) return false;
      if (prefs.sessProvider !== 'all' && r.provider !== prefs.sessProvider) return false;
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
      container.innerHTML = `<div class="ledger-panel meta-timestamp">No sessions match the current filter.</div>`;
      return;
    }

    container.innerHTML = filtered.map((r) => renderSessionCardHtml(r)).join('');
  }

  // VIEW 3: Render Live Chat Workbench
  function renderChatView() {
    ensureSelectedThread();
    const rows = (appState?.rows || []).filter((r) => r.id && !r.draft);
    const selectEl = $('chat-session-select');
    if (selectEl) {
      selectEl.innerHTML = rows
        .slice(0, 45)
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
        threadDetail?.folder || activeRow?.folder || ( prefs.composerRepoPrefix ? `Scope: ${prefs.composerRepoPrefix}` : 'BHFIRMS Workspace');
    }
    const modelEl = $('chat-model-pill');
    if (modelEl) {
      modelEl.textContent = threadDetail?.model || activeRow?.model || (provKey === 'claude' ? 'Claude Opus 4.7' : 'Gemini 2.5 Pro');
    }

    // Context Window Pill & Popover
    const ctx = threadDetail?.contextWindow || {
      usedTokens: 16400,
      limitTokens: provKey === 'claude' ? 200000 : 1000000,
      pct: provKey === 'claude' ? 8 : 2,
      modelLabel: modelEl?.textContent || 'Model',
      breakdown: [
        { label: 'THEO.md & System Rules', tokens: 12400, color: '#D9A54A' },
        { label: 'Conversation Turns', tokens: 2400, color: '#4F8FD6' },
        { label: 'Tool I/O & File Reads', tokens: 1600, color: '#3186FF' }
      ]
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
    const messages = threadDetail?.messages || [];
    if (messages.length === 0) {
      streamEl.innerHTML = `
        <div class="turn-bubble">
          <div class="turn-head"><span class="turn-role">THEO Remote Bridge</span><span>Ready</span></div>
          <div class="turn-text">Select any session above or send a prompt below to start or continue working remotely in <strong>${esc(activeRow?.title || 'VS Code')}</strong>.</div>
        </div>
      `;
    } else {
      streamEl.innerHTML = messages
        .map((m) => {
          const isUser = m.role === 'user';
          const toolsHtml =
            Array.isArray(m.toolCalls) && m.toolCalls.length
              ? `<div class="tool-calls-grid">${m.toolCalls
                  .map(
                    (tc) =>
                      `<span class="tool-pill mono"><strong>${esc(tc.name)}</strong><span>${esc(String(tc.summary || '').slice(0, 70))}</span></span>`
                  )
                  .join('')}</div>`
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
              ${m.text ? `<div class="turn-text">${formatTurnMarkdown(m.text)}</div>` : ''}
              ${toolsHtml}
            </div>
          `;
        })
        .join('');
      streamEl.scrollTop = streamEl.scrollHeight;
    }
  }

  function formatTurnMarkdown(rawText) {
    let safe = esc(rawText);
    safe = safe.replace(/```(\w*)\n([\s\S]*?)```/g, (_, _lang, code) => `<pre><code>${code}</code></pre>`);
    safe = safe.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return safe;
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
    document.addEventListener('click', async (e) => {
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
        await dispatchRemoteCommand({
          type: 'sessionAction',
          action,
          id,
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
        haptic(20);
        playChime('approve');
        await dispatchRemoteCommand({
          type: 'approve',
          decision,
          approvalId: approveBtn.dataset.appId,
          sessionId: approveBtn.dataset.sessId,
          provider: approveBtn.dataset.prov,
          selector: approveBtn.dataset.sel,
          label: approveBtn.dataset.lbl
        });
        showToast(decision === 'approve' ? '✓ Approved remote step' : '✕ Denied remote step');
        return;
      }

      const provSeg = e.target.closest('#sess-provider-seg [data-prov]');
      if (provSeg) {
        prefs.sessProvider = provSeg.dataset.prov;
        document.querySelectorAll('#sess-provider-seg .seg-btn').forEach((b) =>
          b.classList.toggle('active', b === provSeg)
        );
        renderSessionsView();
        return;
      }

      const statusChip = e.target.closest('#sess-status-chips [data-status-filter]');
      if (statusChip) {
        prefs.sessStatus = statusChip.dataset.statusFilter;
        document.querySelectorAll('#sess-status-chips .chip').forEach((c) =>
          c.classList.toggle('active', c === statusChip)
        );
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
        } else if (act === 'compact') {
          dispatchRemoteCommand({ type: 'sessionAction', action: 'compact', id: prefs.selectedThreadId });
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
    $('rail-conn-btn')?.addEventListener('click', () => syncData({ toast: true }));
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
        id: prefs.selectedThreadId,
        provider: activeRow?.provider || 'antigravity'
      });
      showToast('Opened session tab in VS Code');
    });

    // Session select change in Chat
    $('chat-session-select')?.addEventListener('change', (e) => {
      prefs.selectedThreadId = e.target.value;
      saveJson(STORAGE_KEYS.PREFS, prefs);
      renderChatView();
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
        toolCalls: []
      });
      renderChatView();
    }

    const res = await dispatchRemoteCommand({
      type: 'send',
      id: targetId,
      provider,
      prompt: text,
      newSession: Boolean(isNewAgy || isNewClaude || !targetId)
    });

    showToast(
      res.mode === 'local'
        ? `Sent to ${provider === 'claude' ? 'Claude Code' : 'Antigravity'} (Direct Bridge)`
        : res.mode === 'cloud'
          ? `Dispatched via THEO Cloud Relay`
          : `Queued in Outbox (will send when online)`
    );
  }

  // Register Service Worker
  function registerServiceWorker() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
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
    const newParam = urlParams.get('new');
    if (newParam === 'antigravity' || newParam === 'claude') {
      prefs.composerMode = `new-${newParam}`;
      updateComposerModePills();
    }
    switchTab(tabParam || prefs.activeTab || 'pulse');
    renderAll();
    syncData();
    setInterval(() => {
      if (!document.hidden) syncData();
    }, 12000);
    registerServiceWorker();
  }

  init();
})();
