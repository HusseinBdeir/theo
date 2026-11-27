(() => {
  'use strict';

  window.__theoRegisterModule('views', (S) => {
  function openNotifModal() {
    const modal = S.$('notif-modal');
    if (!modal) return;
    S.seedUncheckedTheoNotifications();
    renderNotifModal();
    const wasHidden = modal.hidden;
    modal.hidden = false;
    if (wasHidden) S.pushUiHistoryState('notif-modal');
  }

  function closeNotifModal() {
    const modal = S.$('notif-modal');
    if (modal) modal.hidden = true;
  }

  function renderNotifModal() {
    const dotEl = S.$('notif-modal-dot');
    const titleEl = S.$('notif-modal-title');
    const bodyEl = S.$('notif-modal-body');
    if (!bodyEl) return;

    const nf = Object.assign({ ...S.DEFAULT_NOTIF }, S.prefs.notif || {});
    const pushActive = Boolean(nf.enabled && S.pushSub && S.notifPerm() === 'granted');
    const items = S.loadNotifLog();
    const unchecked = items.filter((x) => x && !x.checked);
    const checked = items.filter((x) => x && x.checked);
    const badgeCount = S.computeTheoUnreadBadgeCount(items);

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
        ? `<div class="meta-timestamp" style="padding:14px 12px;border-radius:var(--r-lg);background:var(--bg-ink);border:1px solid var(--border-subtle);text-align:center">No unchecked notifications — Home Screen badge is clear (0).</div>`
        : `<div class="notif-inbox-list">
            ${items
              .slice(0, 25)
              .map(
                (it) => `
              <div class="notif-item-row ${it.checked ? 'checked' : 'unchecked'}" data-notif-open="${S.esc(it.id || it.tag)}">
                <div class="notif-item-body">
                  <div class="notif-item-title">${S.esc(it.title || 'THEO Notification')}</div>
                  ${it.body ? `<div class="notif-item-sub">${S.esc(it.body)}</div>` : ''}
                  <div class="notif-item-meta tabular">${S.timeAgo(it.ts)} · ${it.checked ? '✓ Checked' : '● Unchecked (on Home Screen badge)'}</div>
                </div>
                ${
                  !it.checked
                    ? `<button type="button" class="notif-check-btn" data-notif-check="${S.esc(it.id || it.tag)}" aria-label="Mark checked &amp; decrement Home Screen badge">✓ Check</button>`
                    : `<span class="pill-count steel" style="font-size:var(--fs-2xs)">Done</span>`
                }
              </div>
            `
              )
              .join('')}
          </div>`;

    bodyEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <span class="meta-timestamp">
          Home Screen Badge: <strong class="tabular" style="color:${badgeCount > 0 ? 'var(--crimson)' : 'var(--emerald)'}">${badgeCount > 0 ? `${badgeCount} Unchecked` : '0 (All Clear)'}</strong> · Push: <strong style="color:${pushActive ? 'var(--emerald)' : 'var(--amber)'}">${pushActive ? 'Active' : 'Off'}</strong>
        </span>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${
            unchecked.length > 0 || badgeCount > 0
              ? `<button type="button" class="btn-brass-sm" data-notif-act="check-all" style="padding:5px 10px;font-size:var(--fs-sm)">✓ Mark All Checked (${badgeCount})</button>`
              : ''
          }
          ${
            checked.length > 0
              ? `<button type="button" class="btn-ghost-sm" data-notif-act="clear-checked" style="padding:5px 10px;font-size:var(--fs-sm)">Clear Checked</button>`
              : ''
          }
        </div>
      </div>
      ${listHtml}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;padding-top:8px;border-top:1px solid var(--border-subtle)">
        ${
          pushActive
            ? `<button type="button" class="btn-brass-sm" data-push-act="test">🔔 Send Test Push</button><button type="button" class="btn-ghost-sm" data-push-act="reset">🔄 Re-Pair Push</button>`
            : `<button type="button" class="btn-brass-sm" data-push-act="enable">${S.pushBusy ? 'Enabling…' : '🔔 Enable Web Push'}</button>`
        }
        <button type="button" class="btn-ghost-sm" data-notif-act="open-settings" style="margin-left:auto">⚙️ Push Settings</button>
      </div>
    `;
  }

  function renderPwaReadyPulseCardHtml() {
    const hosts = S.getUnifiedFleetDevices().filter((d) => d && d.pwaReady);
    if (hosts.length === 0) return '';
    const online = hosts.filter((d) => d.online);
    const readyOnline = online.filter((d) => d.pwaReady.ready);
    let tone = 'is-pending';
    let title = 'Not ready for phone-only use yet';
    let sub = 'Fix the items marked below, then VS Code can stay closed.';
    if (online.length === 0) {
      tone = 'is-off';
      title = 'No PC is online';
      sub = 'THEO needs one PC switched on and awake to run sessions.';
    } else if (readyOnline.length === online.length) {
      tone = 'is-ready';
      title =
        online.length === 1
          ? `${online[0].name || online[0].id} is ready for phone-only use`
          : `${online.length} PCs are ready for phone-only use`;
      sub = 'VS Code can stay closed. Keep one PC switched on and awake.';
    } else if (readyOnline.length > 0) {
      tone = 'is-partial';
      title = `${readyOnline.length} of ${online.length} online PCs are ready for phone-only use`;
      sub = 'Sessions on a ready PC work with VS Code closed. The others need the items below.';
    }
    const hasNotes = hosts.some((d) =>
      d.pwaReady.checks.some((c) => !c.ok && (c.level === 'info' ? d.online : true))
    );
    const open = S.pwaReadyCardOpen === null ? tone !== 'is-ready' : S.pwaReadyCardOpen;
    const hostsHtml = hosts
      .map((d) => {
        const pr = d.pwaReady;
        // Every required item, and a note only when it is not met.
        const shown = pr.checks.filter((c) => c.level === 'required' || !c.ok);
        const needsSetup = pr.checks.some(
          (c) => !c.ok && (c.id === 'keepalive' || c.id === 'autostart')
        );
        const rows = shown
          .map((c) => {
            const kind = c.ok ? 'is-ok' : c.level === 'required' ? 'is-fail' : 'is-note';
            const mark = c.ok ? '✓' : c.level === 'required' ? '✕' : 'i';
            return `<li class="pwa-ready-row ${kind}"><span class="pwa-ready-mark" aria-hidden="true">${mark}</span><span class="pwa-ready-text"><strong>${S.esc(c.title)}</strong> <span class="pwa-ready-detail">${S.esc(c.detail)}</span></span></li>`;
          })
          .join('');
        return `
          <div class="pwa-ready-host">
            <div class="pwa-ready-host-head">
              <span class="sess-device-badge ${d.online ? 'is-online' : ''}">${d.online ? '●' : '◐'} ${S.esc(d.name || d.id)}</span>
              <span class="fleet-setup-pill ${pr.ready ? 'is-ready' : 'is-pending'} tabular">${pr.ready ? '✓' : '!'} ${pr.okCount}/${pr.totalCount}</span>
              <span class="meta-timestamp">${d.online ? (pr.vscodeOpen ? 'VS Code open' : 'VS Code closed') : 'offline, last report'}</span>
            </div>
            <ul class="pwa-ready-list">${rows}</ul>
            ${needsSetup && d.online ? `<div class="pwa-ready-host-actions">${S.renderApplyPcSetupButtonHtml(d, 'btn-ghost-sm')}</div>` : ''}
          </div>`;
      })
      .join('');
    return `
      <div class="pwa-ready-card ${tone} ${open ? 'is-open' : ''}" id="pulse-pwa-ready-card">
        <button type="button" class="pwa-ready-head" data-pwa-ready-toggle="1" aria-expanded="${open ? 'true' : 'false'}" aria-controls="pulse-pwa-ready-body">
          <span class="pwa-ready-head-main">
            <span class="pwa-ready-title">${S.esc(title)}</span>
            <span class="meta-timestamp">${S.esc(sub)}${tone === 'is-ready' && hasNotes ? ' One note inside.' : ''}</span>
          </span>
          <span class="pwa-ready-chevron" aria-hidden="true">${open ? '▾' : '▸'}</span>
        </button>
        <div class="pwa-ready-body" id="pulse-pwa-ready-body" ${open ? '' : 'hidden'}>${hostsHtml}</div>
      </div>
    `;
  }

  function renderPulseNotifBannerHtml() {
    const migHtml = S.renderTheoMigrationBannerHtml();
    if (
      !S.hasAnyPairingCredentials() &&
      S.connMode !== 'local' &&
      S.connMode !== 'edge' &&
      S.connMode !== 'cloud'
    ) {
      return `${migHtml}${S.renderQuickPairOnboardingCardHtml('pulse')}`;
    }
    const pcSetupNotice = `${migHtml}${renderPwaReadyPulseCardHtml()}${S.renderFleetPcSetupPulseBannerHtml()}`;
    const nf = Object.assign({ ...S.DEFAULT_NOTIF }, S.prefs.notif || {});
    const perm = S.notifPerm();
    const active = Boolean(nf.enabled && S.pushSub && perm === 'granted');
    if (active || S.loadJson(S.STORAGE_KEYS.PUSH_HINT, 0)) return pcSetupNotice;
    const ua = String((typeof navigator !== 'undefined' && navigator.userAgent) || '');
    const ios = /iPhone|iPad|iPod/.test(ua);
    if (!S.pushSupported() && !ios) return pcSetupNotice;
    return `${pcSetupNotice}
      <div class="push-banner-card">
        <div class="push-banner-top">
          <strong>Push Notifications</strong>
        </div>
        <div class="meta-timestamp" style="color:var(--text-secondary);font-size:var(--fs-md)">
          Get lock-screen alerts for tool approvals, session completions, and quota warnings.
        </div>
        <div class="push-banner-actions">
          <button type="button" class="btn-brass-sm" data-push-act="enable">
            ${S.pushBusy ? 'Enabling…' : 'Enable Push Notifications'}
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
          `<option value="${S.esc(k)}" ${String(k) === String(selectedVal) ? 'selected' : ''}>${S.esc(lbl)}</option>`
      )
      .join('');
  }

  function renderPushSettingsCardHtml() {
    const nf = Object.assign({ ...S.DEFAULT_NOTIF }, S.prefs.notif || {});
    const perm = S.notifPerm();
    const active = Boolean(nf.enabled && S.pushSub && perm === 'granted');
    const ua = String((typeof navigator !== 'undefined' && navigator.userAgent) || '');
    const iosNeedsInstall = /iPhone|iPad|iPod/.test(ua) && !S.isStandalone();
    const statusChip = active
      ? '<span class="pill-count emerald">Active on this device</span>'
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
        : 'Encrypted RFC 8291 (aes128gcm) + VAPID ES256 alerts dispatch directly from your PC and THEO Edge Relay.';

    return `
      <div class="push-settings-card">
        <div class="section-head" style="margin-bottom:0">
          <div>
            <h2 class="section-title" style="font-size:var(--fs-xl);margin-top:2px">Push Notifications</h2>
            <div class="brass-rule-single"></div>
          </div>
          ${statusChip}
        </div>
        <div class="meta-timestamp" style="line-height:1.45">${S.esc(descText)}</div>
        <div class="push-pref-list">
          <div class="push-pref-row">
            <label class="push-pref-label">
              <input type="checkbox" data-nf="approvals" ${nf.approvals !== false ? 'checked' : ''}>
              <div class="push-pref-text">
                <strong>Tool approvals &amp; input requests</strong>
                <span>Alert when Antigravity or Claude Code pauses for permission or input</span>
              </div>
            </label>
          </div>
          <div class="push-pref-row">
            <label class="push-pref-label">
              <input type="checkbox" data-nf="completed" ${nf.completed !== false ? 'checked' : ''}>
              <div class="push-pref-text">
                <strong>Session turn &amp; task completions</strong>
                <span>Alert when a running session finishes its turn while you are away</span>
              </div>
            </label>
          </div>
          <div class="push-pref-row">
            <label class="push-pref-label">
              <input type="checkbox" data-nf="quota" ${nf.quota !== false ? 'checked' : ''}>
              <div class="push-pref-text">
                <strong>Usage threshold (≥90%) &amp; stalled-task alerts</strong>
                <span>Alert when a quota window reaches 90% or a task stalls</span>
              </div>
            </label>
          </div>
          <div class="push-pref-row">
            <label class="push-pref-label">
              <input type="checkbox" data-nf="morning" ${nf.morning !== false ? 'checked' : ''}>
              <div class="push-pref-text">
                <strong>Morning Brief</strong>
                <span>Daily morning summary of pending approvals and active sessions</span>
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
                <strong>Evening Digest</strong>
                <span>Evening summary of daily token usage and uncommitted git repos</span>
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
                <button type="button" class="btn-brass-sm" data-push-act="test">Send Test Push</button>
                <button type="button" class="btn-ghost-sm" data-push-act="reset" aria-label="Unsubscribe and mint a brand-new APNs push token">${S.pushBusy ? 'Re-pairing…' : 'Re-Pair Push'}</button>
                <button type="button" class="btn-ghost-sm" data-push-act="sync">↻ Refresh Schedule</button>
                <button type="button" class="btn-ghost-sm" data-push-act="disable">Turn Off</button>
              `
              : `
                <button type="button" class="btn-brass-sm" data-push-act="enable">${S.pushBusy ? 'Enabling…' : 'Enable Push Notifications'}</button>
                ${perm === 'granted' ? `<button type="button" class="btn-ghost-sm" data-push-act="test">Send Test Push</button>` : ''}
              `
          }
        </div>
      </div>
    `;
  }

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
    for (const [k, ts] of S.locallyCancelledBgTasks.entries()) {
      if (now - ts > 90000) S.locallyCancelledBgTasks.delete(k);
    }
    const rawDetail = Array.isArray(threadDetail?.backgroundTasks)
      ? threadDetail.backgroundTasks
      : [];
    const rawRow = [
      ...(Array.isArray(row?.bgTasks) ? row.bgTasks : []),
      ...(Array.isArray(row?.backgroundTasks) ? row.backgroundTasks : [])
    ];
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
    if (Array.isArray(threadDetail?.messages)) {
      for (const m of threadDetail.messages) {
        if (!Array.isArray(m?.toolCalls)) continue;
        for (let idx = 0; idx < m.toolCalls.length; idx++) {
          const tc = m.toolCalls[idx];
          if (!tc || tc.kind !== 'subagent') continue;
          const synthId = String(
            tc.subagentConversationId || tc.id || `subagent-${m.id || 'turn'}-${idx}`
          );
          if (!byId.has(synthId)) {
            byId.set(synthId, {
              id: synthId,
              kind: 'subagent',
              state: 'completed',
              subagentRole: tc.subagentRole || '',
              subagentType: tc.subagentType || '',
              subagentConversationId: tc.subagentConversationId || '',
              summary: tc.subagentRole
                ? `${tc.subagentRole}${tc.subagentType ? ` (${tc.subagentType})` : ''}`
                : tc.summary || tc.label || 'Side Agent',
              command: tc.subagentPrompt || tc.command || '',
              outputPreview: tc.snippet || '',
              startedAt: m.createdAt ? Date.parse(m.createdAt) || 0 : 0
            });
          }
        }
      }
    }
    const allTasks = Array.from(byId.values()).map((t) => {
      const cancelKey = `${sid}:${t.id}`;
      const cancelFullKey = t.fullId ? `${sid}:${t.fullId}` : '';
      const isLocCancelled =
        S.locallyCancelledBgTasks.has(cancelKey) ||
        (cancelFullKey && S.locallyCancelledBgTasks.has(cancelFullKey));
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
    if (S.isHeadlessBrowser || !sessionId || !taskId) return '';
    const cacheKey = `${sessionId}:${taskId}`;
    const matchedRow = (S.appState?.rows || []).find((r) => r && r.id === sessionId);
    const targetDeviceId = matchedRow?.deviceId || '';
    const isRemote = Boolean(targetDeviceId && S.localWsDevice?.id && targetDeviceId !== S.localWsDevice.id);

    if (S.connMode === 'local' && S.localBridgeBase && !isRemote) {
      try {
        const q = `id=${encodeURIComponent(sessionId)}&taskId=${encodeURIComponent(taskId)}&provider=${encodeURIComponent(provider)}`;
        const res = await S.authFetchLocal(`${S.localBridgeBase}/api/bg-task-log?${q}`);
        if (res.ok) {
          const data = await res.json();
          if (typeof data?.output === 'string' && data.output.trim()) {
            S.bgTaskLogsCache.set(cacheKey, data.output);
            document
              .querySelectorAll(`[data-bg-log-key="${CSS.escape(cacheKey)}"]`)
              .forEach((preEl) => {
                preEl.textContent = data.output;
              });
            return data.output;
          }
        }
      } catch {}
    }

    if (S.edgeWsAuthed && S.edgeWs && S.edgeWs.readyState === 1) {
      try {
        const rpcOut = await S.sendWsRpc(
          S.edgeWs,
          {
            type: 'rpc_cmd',
            targetDeviceId,
            cmd: { type: 'getBgTaskLog', id: sessionId, taskId, provider }
          },
          6500
        );
        const outStr = rpcOut?.result?.output ?? rpcOut?.output ?? '';
        if (typeof outStr === 'string' && outStr.trim()) {
          S.bgTaskLogsCache.set(cacheKey, outStr);
          document
            .querySelectorAll(`[data-bg-log-key="${CSS.escape(cacheKey)}"]`)
            .forEach((preEl) => {
              preEl.textContent = outStr;
            });
          return outStr;
        }
      } catch {}
    }
    return S.bgTaskLogsCache.get(cacheKey) || '';
  }

  async function cancelSingleBgTask(sessionId, taskId, provider = '') {
    if (!sessionId || !taskId) return;
    const now = Date.now();
    S.locallyCancelledBgTasks.set(`${sessionId}:${taskId}`, now);
    const shortId = String(taskId).split('/').pop();
    if (shortId) S.locallyCancelledBgTasks.set(`${sessionId}:${shortId}`, now);
    const row = (S.appState?.rows || []).find((r) => r.id === sessionId);
    for (const list of [row?.bgTasks, row?.backgroundTasks]) {
      if (!Array.isArray(list)) continue;
      for (const t of list) {
        if (t && (t.id === taskId || t.fullId === taskId || t.id === shortId)) {
          t.state = 'cancelled';
        }
      }
    }
    if (row) {
      const mergedList = [
        ...(Array.isArray(row.bgTasks) ? row.bgTasks : []),
        ...(Array.isArray(row.backgroundTasks) ? row.backgroundTasks : [])
      ];
      row.bgRunningCount = mergedList.filter((t) => t && t.state === 'running').length;
    }
    const td = S.threadsCache[sessionId];
    if (td && Array.isArray(td.backgroundTasks)) {
      for (const t of td.backgroundTasks) {
        if (t && (t.id === taskId || t.fullId === taskId || t.id === shortId)) {
          t.state = 'cancelled';
        }
      }
    }
    S.persistCache();
    S.renderAll();
    await S.dispatchRemoteCommand({
      type: 'sessionAction',
      action: 'cancelBgTask',
      subAction: 'cancelBgTask',
      id: sessionId,
      sessionId,
      taskId,
      provider: provider || row?.provider || 'antigravity'
    });
    S.showToast(`Stopped background task ${shortId || taskId}`);
  }

  async function cancelAllSessionBgTasks(sessionId, provider = '') {
    if (!sessionId) return;
    const now = Date.now();
    const row = (S.appState?.rows || []).find((r) => r.id === sessionId);
    const td = S.threadsCache[sessionId];
    for (const list of [row?.bgTasks, row?.backgroundTasks, td?.backgroundTasks]) {
      if (!Array.isArray(list)) continue;
      for (const t of list) {
        if (t && t.state === 'running') {
          t.state = 'cancelled';
          S.locallyCancelledBgTasks.set(`${sessionId}:${t.id}`, now);
          if (t.fullId) S.locallyCancelledBgTasks.set(`${sessionId}:${t.fullId}`, now);
        }
      }
    }
    if (row) row.bgRunningCount = 0;
    S.persistCache();
    S.renderAll();
    await S.dispatchRemoteCommand({
      type: 'sessionAction',
      action: 'cancelAllBgTasks',
      subAction: 'cancelAllBgTasks',
      id: sessionId,
      sessionId,
      provider: provider || row?.provider || 'antigravity'
    });
    S.showToast('Stopped all running background tasks');
  }

  function renderPulseBgTasksSection() {
    const secEl = S.$('pulse-bgtasks-section');
    const pillEl = S.$('pulse-bgtasks-count-pill');
    const stopAllBtn = S.$('btn-pulse-stop-all-bg');
    const listEl = S.$('pulse-bgtasks-list');
    if (!secEl || !listEl) return;

    const rows = (S.appState?.rows || []).filter((r) => r && r.id && !r.archived);
    const activeEntries = [];
    for (const r of rows) {
      const { allTasks } = getSessionBackgroundTasks(r, S.threadsCache[r.id]);
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
        const timeStr = task.startedAt ? S.timeAgo(task.startedAt) : 'Active';
        return `
          <div class="pulse-bgtask-card">
            <div class="pulse-bgtask-top">
              <span class="pulse-bgtask-sess" data-open-bgtasks="${S.esc(row.id)}" data-session-prov="${provKey}" data-focus-task="${S.esc(task.id)}">
                <span class="prov-glyph">${S.PROVIDER_ICONS[provKey]}</span>
                <span class="pulse-bgtask-sess-title">${S.esc(row.title || 'Session')}</span>
              </span>
              <span class="bg-kind-badge ${stInfo.cls}">
                ${getBgKindSvg(task.kind)}
                <span>${S.esc(getBgKindLabel(task.kind))} · ${S.esc(stInfo.label)}</span>
              </span>
            </div>
            <div class="pulse-bgtask-summary">${S.esc(expl)}</div>
            ${task.command ? `<div class="pulse-bgtask-cmd mono">${S.esc(task.command)}</div>` : ''}
            <div class="pulse-bgtask-foot">
              <span class="meta-timestamp tabular">${S.esc(task.id)} · ${S.esc(timeStr)}</span>
              <div class="pulse-bgtask-btns">
                <button type="button" class="btn-ghost-sm" data-open-bgtasks="${S.esc(row.id)}" data-session-prov="${provKey}" data-focus-task="${S.esc(task.id)}">Inspect Log</button>
                ${
                  task.state === 'running'
                    ? `<button type="button" class="btn-ghost-sm bg-stop-task-btn" data-bg-act="stop-task" data-sess-id="${S.esc(row.id)}" data-task-id="${S.esc(task.fullId || task.id)}" data-prov="${provKey}">■ Stop</button>`
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
    const pillBtn = S.$('btn-bg-tasks');
    const pillDot = S.$('bg-pill-dot');
    const pillLbl = S.$('bg-tasks-pill-label');
    const popEl = S.$('bg-tasks-popover');
    const popTitle = S.$('bg-popover-title');
    const popStopAll = S.$('btn-stop-all-bgtasks');
    const popList = S.$('bg-tasks-popover-list');
    const liveStrip = S.$('chat-live-bgtasks');

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
          <span class="chat-live-bg-text">${S.esc(expl)}${S.esc(extra)}</span>
          <div class="chat-live-bg-btns">
            <button type="button" class="btn-ghost-sm" data-bg-act="open-popover">Inspect (${runningCount})</button>
            <button type="button" class="bg-stop-task-btn" data-bg-act="${runningCount > 1 ? 'stop-session-all' : 'stop-task'}" data-sess-id="${S.esc(sid)}" data-task-id="${S.esc(primary?.fullId || primary?.id || '')}" data-prov="${provKey}">■ Stop${runningCount > 1 ? ' All' : ''}</button>
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
        const isOpen = S.openBgTaskDetails.has(cacheKey);
        const stInfo = getBgStateBadgeInfo(t.state);
        const expl = t.summary || t.command || t.id || 'Background task';
        const liveOut =
          S.bgTaskLogsCache.get(cacheKey) ||
          t.outputPreview ||
          (t.state === 'running'
            ? 'Task is running — expand or tap Refresh Log to tail output.'
            : 'No console log output captured for this task.');
        const timeStr = t.startedAt ? S.timeAgo(t.startedAt) : '';
        return `
          <details class="bg-task-item ${t.state === 'running' ? 'is-running' : ''}" data-bg-detail-key="${S.esc(cacheKey)}" data-sess-id="${S.esc(sid)}" data-task-id="${S.esc(t.id)}" data-prov="${provKey}" ${isOpen ? 'open' : ''}>
            <summary class="bg-task-summary">
              <span class="bg-task-ico">${getBgKindSvg(t.kind)}</span>
              <span class="bg-task-main">
                <span class="bg-task-expl">${S.esc(expl)}</span>
                <span class="bg-task-meta tabular">
                  <span>${S.esc(getBgKindLabel(t.kind))}</span>
                  <span>·</span>
                  <span>${S.esc(t.id)}</span>
                  ${timeStr ? `<span>· ${S.esc(timeStr)}</span>` : ''}
                </span>
              </span>
              <span class="bg-task-right">
                <span class="bg-kind-badge ${stInfo.cls}">${S.esc(stInfo.label)}</span>
                ${
                  t.state === 'running'
                    ? `<button type="button" class="bg-stop-task-btn" data-bg-act="stop-task" data-sess-id="${S.esc(sid)}" data-task-id="${S.esc(t.fullId || t.id)}" data-prov="${provKey}" aria-label="Stop this background task">■ Stop</button>`
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
                <pre class="bg-detail-pre mono">${S.esc(t.command)}</pre>
              `
                  : ''
              }
              <div class="bg-detail-label-row">
                <span>Live Output / Trace</span>
                <button type="button" class="btn-ghost-sm" style="padding:2px 8px;font-size:var(--fs-xs)" data-bg-act="refresh-log" data-sess-id="${S.esc(sid)}" data-task-id="${S.esc(t.id)}" data-prov="${provKey}">↻ Refresh Log</button>
              </div>
              <pre class="bg-detail-pre mono" data-bg-log-key="${S.esc(cacheKey)}">${S.esc(liveOut)}</pre>
            </div>
          </details>
        `;
      })
      .join('');
    popList.scrollTop = prevScroll;
  }

  function syncPulseNavBadges() {
    const fleetDevices = S.getUnifiedFleetDevices();
    if (
      S.prefs.selectedDeviceFilter &&
      S.prefs.selectedDeviceFilter !== 'all' &&
      fleetDevices.length > 0 &&
      !fleetDevices.some((d) => d.id === S.prefs.selectedDeviceFilter)
    ) {
      S.prefs.selectedDeviceFilter = 'all';
    }
    const allRows = S.appState?.rows || [];
    const rows =
      S.prefs.selectedDeviceFilter && S.prefs.selectedDeviceFilter !== 'all'
        ? allRows.filter((r) => !r.deviceId || r.deviceId === S.prefs.selectedDeviceFilter)
        : allRows;
    const approvals =
      S.prefs.selectedDeviceFilter && S.prefs.selectedDeviceFilter !== 'all'
        ? (S.appState?.approvals || []).filter(
            (a) => !a.deviceId || a.deviceId === S.prefs.selectedDeviceFilter
          )
        : S.appState?.approvals || [];
    const activeTotal = rows.filter((r) => r.id && !r.archived).length;
    const waitingCount = approvals.length;

    const badgePulse = S.$('badge-pulse');
    const dockPulse = S.$('dock-badge-pulse');
    if (badgePulse) {
      badgePulse.hidden = waitingCount === 0;
      badgePulse.textContent = String(waitingCount);
    }
    if (dockPulse) {
      dockPulse.hidden = waitingCount === 0;
    }
    const badgeSessions = S.$('badge-sessions');
    if (badgeSessions) {
      badgeSessions.textContent = String(activeTotal);
    }
    const dockSessions = S.$('dock-badge-sessions');
    if (dockSessions) {
      dockSessions.hidden = activeTotal === 0;
      dockSessions.textContent = String(activeTotal);
    }
    const dirtyRepoCount = (S.appState?.workspaces || []).filter((w) => Number(w?.dirtyCount || 0) > 0).length;
    const badgeWorkspaces = S.$('badge-workspaces');
    if (badgeWorkspaces) {
      badgeWorkspaces.hidden = dirtyRepoCount === 0;
      badgeWorkspaces.textContent = String(dirtyRepoCount);
    }
    return { fleetDevices, allRows, rows, approvals, activeTotal, waitingCount };
  }

  // VIEW 1: Render Pulse
  function renderPulseView() {
    let pulseMeta = null;
    try {
      pulseMeta = syncPulseNavBadges();
    } catch (err) {
      console.warn('[THEO] Pulse badge sync error:', err?.message || err);
    }
    if (S.prefs.activeTab !== 'pulse') return;
    return S.runViewBoundary('pulse', 'Pulse', { elId: 'view-pulse', mode: 'prepend' }, () => {
    const { fleetDevices, allRows, rows, approvals, activeTotal, waitingCount } =
      pulseMeta || syncPulseNavBadges();
    const bannerEl = S.$('pulse-notif-banner');
    if (bannerEl && !S.isFocusInsideContainerInputs(bannerEl)) {
      bannerEl.innerHTML = renderPulseNotifBannerHtml();
    }

    const fleetEl = S.$('pulse-fleet-strip');
    if (fleetEl) {
      if (fleetDevices.length === 0 && !S.localWsAuthed && !S.edgeWsAuthed) {
        fleetEl.hidden = true;
      } else {
        fleetEl.hidden = false;
        const activeTotalAll = allRows.filter((r) => r.id && !r.archived).length;
        const transportHtml = S.localWsAuthed
          ? `<span class="fleet-latency-badge tabular">${S.localWsRttMs || 2}ms Direct WS</span>`
          : S.edgeWsAuthed
            ? `<span class="fleet-latency-badge tabular">${S.edgeWsRttMs || 18}ms Edge WS</span>`
            : `<span class="fleet-latency-badge cloud-mode tabular">Cloud Relay</span>`;
        fleetEl.innerHTML = `
          <span class="fleet-strip-head">Connected Fleet</span>
          <button type="button" class="fleet-chip ${S.prefs.selectedDeviceFilter === 'all' ? 'active' : ''}" data-fleet-filter="all">
            <span>All Hosts</span>
            <span class="fleet-chip-meta tabular">${activeTotalAll}</span>
          </button>
          ${fleetDevices
            .map((d) => {
              const cnt = allRows.filter((r) => !r.archived && r.deviceId === d.id).length || Number(d.sessionCount || 0);
              const isAct = S.prefs.selectedDeviceFilter === d.id;
              const stWtCnt = S.getFleetStalledWtCount(d);
              return `
                <button type="button" class="fleet-chip ${isAct ? 'active' : ''}" data-fleet-filter="${S.esc(d.id)}" aria-label="${S.esc(d.hostname || d.name || d.id)} · ${d.online ? 'Live WebSocket / Bridge' : 'Synced via Cloud Relay'}">
                  <span class="fleet-chip-dot ${d.online ? 'online' : 'synced'}"></span>
                  <span>${S.esc(d.name || d.id)}</span>
                  ${d.pcSetup && d.pcSetup.pendingCount > 0 ? `<span class="fleet-chip-setup tabular">! ${d.pcSetup.okCount}/${d.pcSetup.totalCount}</span>` : ''}
                  ${stWtCnt > 0 ? `<span class="fleet-chip-stalled tabular">⎇ ${stWtCnt} wt/*</span>` : ''}
                  <span class="fleet-chip-meta tabular">${cnt}</span>
                </button>
              `;
            })
            .join('')}
          ${transportHtml}
        `;
      }
    }

    const workingCount = rows.filter((r) => r.status === 'working' && !r.archived).length;
    const unreadCount = rows.filter((r) => r.unread && !r.archived).length;
    const openCount = rows.filter((r) => r.open && !r.archived).length;

    const kpisEl = S.$('pulse-kpis');
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
    const pillEl = S.$('approvals-count-pill');
    const listEl = S.$('approvals-list');
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
                const sessMsgs = S.coalesceThreadMessages(S.threadsCache[a.sessionId]?.messages || []);
                const qList = S.resolveQuestionsForApproval(a, sessMsgs);
                if (qList.length > 0) {
                  return S.renderInteractiveQuestionCardHtml({
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
                <div class="approval-card" data-approval-id="${S.esc(a.id)}">
                  <div class="approval-top">
                    <span class="approval-prov">
                      <span class="prov-glyph">${S.PROVIDER_ICONS[provKey]}</span>
                      <span>${provKey === 'claude' ? 'Claude Code' : 'Antigravity'}</span>
                    </span>
                    <span class="approval-tool-badge tabular">${S.esc(a.toolName || 'Permission')}</span>
                  </div>
                  <div class="approval-title">${S.esc(a.title || 'Session')}</div>
                  <div class="approval-detail mono">${S.esc(a.detail || '')}</div>
                  <div class="approval-actions">
                    ${
                      a.kind === 'waiting_session'
                        ? `<button type="button" class="btn-approve" data-open-chat="${S.esc(a.sessionId)}">Open &amp; Reply →</button>`
                        : `
                          <button type="button" class="btn-approve" data-approve-act="approve" data-app-id="${S.esc(a.approvalId)}" data-sess-id="${S.esc(a.sessionId)}" data-prov="${provKey}" data-sel="${S.esc(a.selector || '')}" data-lbl="${S.esc(a.toolName || 'Accept')}">✓ Approve</button>
                          <button type="button" class="btn-reject" data-approve-act="reject" data-app-id="${S.esc(a.approvalId)}" data-sess-id="${S.esc(a.sessionId)}" data-prov="${provKey}" data-sel="${S.esc(a.selector || '')}">✕ Deny</button>
                          <button type="button" class="btn-inspect" data-open-chat="${S.esc(a.sessionId)}">Inspect</button>
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
    const quotaGrid = S.$('pulse-quota-grid');
    const updatedLbl = S.$('quota-updated-at');
    const toggle3pBtn = S.$('btn-toggle-3p-quota');
    const hide3pPulse = S.isThirdPartyQuotaHidden();
    const has3pPulse = S.hasAnyAntigravityThirdPartyBars();
    if (toggle3pBtn) {
      toggle3pBtn.hidden = !(has3pPulse || hide3pPulse);
      toggle3pBtn.setAttribute('data-toggle-3p-quota', hide3pPulse ? 'show' : 'hide');
      toggle3pBtn.textContent = hide3pPulse ? 'Show Claude & GPT' : 'Hide Claude & GPT';
      toggle3pBtn.setAttribute('aria-pressed', hide3pPulse ? 'true' : 'false');
    }
    if (updatedLbl) {
      updatedLbl.textContent = S.appState?.generatedAt
        ? `Synced ${S.timeAgo(S.appState.generatedAt)}`
        : 'Live telemetry';
    }
    if (quotaGrid && !(S.activeInlineAcctEdit && document.activeElement && quotaGrid.contains(document.activeElement) && document.activeElement.matches('.ide-acct-inline-edit'))) {
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
    const repoGrid = S.$('pulse-repo-launchers');
    if (repoGrid) {
      const workspaces = S.appState?.workspaces || [];
      repoGrid.innerHTML = workspaces
        .slice(0, 8)
        .map(
          (w) => `
          <button type="button" class="repo-launch-tile" data-launch-repo="${S.esc(w.id)}" data-launch-name="${S.esc(w.name)}">
            <div class="repo-tile-top">
              <span class="repo-tile-group">${S.esc(w.group || 'BHFIRMS')}</span>
              <span class="tag-pill tabular">${S.esc(w.branch || 'main')}</span>
            </div>
            <div class="repo-tile-name">${S.esc(w.name)}</div>
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
    const recentEl = S.$('pulse-recent-sessions');
    if (recentEl) {
      const topRows = rows.filter((r) => !r.archived).slice(0, 6);
      recentEl.innerHTML = topRows.map((r) => renderSessionCardHtml(r)).join('');
    }
    });
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
    if (!S.appState?.providers) return true;
    const prov = provKey === 'claude' ? 'claude' : 'antigravity';
    const raw = S.appState.providers[prov];
    const list = Array.isArray(raw?.accounts) && raw.accounts.length ? raw.accounts : [raw || {}];
    return list.some(isSignedInQuotaCard);
  }

  function syncProviderNewSessionButtons() {
    const hasAgy = hasSignedInProviderRemote('antigravity');
    const hasClaude = hasSignedInProviderRemote('claude');
    const railWrap = document.querySelector('.rail-launchers');
    const railAgyBtn = S.$('rail-new-agy');
    const railClaudeBtn = S.$('rail-new-claude');
    if (railAgyBtn) railAgyBtn.hidden = !hasAgy;
    if (railClaudeBtn) railClaudeBtn.hidden = !hasClaude;
    if (railWrap) {
      railWrap.hidden = !hasAgy && !hasClaude;
      railWrap.style.gridTemplateColumns =
        (hasAgy && !hasClaude) || (!hasAgy && hasClaude)
          ? 'minmax(0, 1fr)'
          : 'repeat(2, minmax(0, 1fr))';
    }
    const sessRow = S.$('sess-new-btns') || document.querySelector('#view-sessions .toolbar-new-btns');
    const sessAgyBtn = S.$('btn-sess-new-agy') || document.querySelector('#view-sessions [data-quick-new="antigravity"]');
    const sessClaudeBtn = S.$('btn-sess-new-claude') || document.querySelector('#view-sessions [data-quick-new="claude"]');
    if (sessAgyBtn) sessAgyBtn.hidden = !hasAgy;
    if (sessClaudeBtn) sessClaudeBtn.hidden = !hasClaude;
    if (sessRow) {
      sessRow.classList.toggle('single-prov', (hasAgy && !hasClaude) || (!hasAgy && hasClaude));
      sessRow.classList.toggle('no-prov', !hasAgy && !hasClaude);
    }
    const compPills = S.$('composer-mode-pills') || document.querySelector('.composer-mode-pills');
    const compAgyBtn = S.$('comp-mode-new-agy');
    const compClaudeBtn = S.$('comp-mode-new-claude');
    if (compAgyBtn) compAgyBtn.hidden = !hasAgy;
    if (compClaudeBtn) compClaudeBtn.hidden = !hasClaude;
    if (compPills) {
      compPills.classList.toggle('single-prov', (hasAgy && !hasClaude) || (!hasAgy && hasClaude));
      compPills.classList.toggle('no-prov', !hasAgy && !hasClaude);
    }
    // Only downgrade explicit new-session mode if live provider telemetry has hydrated (#29)
    if (S.hasProvidersHydrated && !S.hasExplicitBootUrlNav) {
      if (S.prefs.composerMode === 'new-claude' && !hasClaude) {
        S.prefs.composerMode = hasAgy ? 'new-antigravity' : 'reply';
      } else if (S.prefs.composerMode === 'new-antigravity' && !hasAgy) {
        S.prefs.composerMode = hasClaude ? 'new-claude' : 'reply';
      }
    }
  }

  function getOrderedPulseQuotaCards() {
    const agy = S.appState?.providers?.antigravity;
    const claude = S.appState?.providers?.claude;
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
      Array.isArray(S.appState?.accountOrder) && S.appState.accountOrder.length
        ? S.appState.accountOrder
        : Array.isArray(S.prefs.accountOrder)
          ? S.prefs.accountOrder
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
    const existingExtra = (Array.isArray(S.appState?.accountOrder) ? S.appState.accountOrder : []).filter(
      (id) => id && !nextIds.includes(id)
    );
    const fullOrder = [...nextIds, ...existingExtra];
    S.prefs.accountOrder = fullOrder;
    S.saveJson(S.STORAGE_KEYS.PREFS, S.prefs);
    if (S.appState) {
      S.appState.accountOrder = fullOrder;
      for (const pk of ['antigravity', 'claude']) {
        const list = S.appState.providers?.[pk]?.accounts;
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
      S.persistCache();
    }
    renderPulseView();
    await S.dispatchRemoteCommand({
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
        <div class="quota-card is-secondary" data-quota-card-id="${S.esc(acctId)}">
          <div class="quota-card-head">
            <div class="quota-prov-title">
              <span class="prov-glyph">${S.PROVIDER_ICONS[key]}</span>
              <div>
                <div class="quota-title-line"><span class="quota-title-name">${S.esc(label)}</span></div>
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
    const isCollapsed = S.isQuotaCardCollapsed(collapseKey, acctId, multi, isActive);
    const cardIndex = typeof orderCtx?.index === 'number' ? orderCtx.index : 0;
    const totalCards = typeof orderCtx?.totalCards === 'number' ? orderCtx.totalCards : sameProvCount;
    const canReorder = totalCards > 1;
    const canMoveUp = canReorder && cardIndex > 0;
    const canMoveDown = canReorder && cardIndex < totalCards - 1;
    const limits = provInfo?.usage?.limits?.length
      ? provInfo.usage.limits
      : provInfo?.usage?.allLimits || [];

    const nowMs = Date.now();
    const renderPulseBar = (l, isThirdParty) => {
      const passed = Boolean(l.expired || (l.reset && l.reset <= nowMs));
      const known = l.known !== false;
      const rawPct = l.pct !== undefined ? l.pct : l.usedPercent;
      const pct = passed || !known ? 0 : Math.min(100, Math.max(0, Math.round(Number(rawPct || 0))));
      const pctTxt = known ? `${pct}%` : '—';
      const cls = pct >= 90 ? 'crit' : pct >= 78 ? 'warn' : isThirdParty ? 'third-party' : key === 'claude' ? 'claude' : '';
      const resetTxt = S.formatQuotaResetLine(l, nowMs);
      return `
        <div class="q-bar-row tabular">
          <div class="q-bar-labels">
            <span>${S.esc(l.label)}</span>
            <span class="q-bar-meta">${resetTxt ? `<span class="q-reset">${S.esc(resetTxt)}</span>` : ''}<span class="q-pct">${pctTxt}</span></span>
          </div>
          <div class="q-track">
            <div class="q-fill ${cls}" style="width:${pct}%"></div>
          </div>
        </div>
      `;
    };
    let barsHtml = '';
    if (!limits.length) {
      barsHtml = `<div class="meta-timestamp">${S.esc(provInfo?.usageMessage || (isActive ? 'Quota telemetry ready.' : 'Signed in · Standby'))}</div>`;
    } else if (key === 'antigravity') {
      const hide3p = S.isThirdPartyQuotaHidden();
      const gemBars = limits.filter((l) => !S.isThirdPartyQuotaBar(l));
      const tpBars = limits.filter((l) => S.isThirdPartyQuotaBar(l));
      if (hide3p) {
        barsHtml = gemBars.length
          ? gemBars.map((l) => renderPulseBar(l, false)).join('')
          : tpBars.length
            ? `<div class="q-pool-hidden-note"><span>Claude &amp; GPT pool hidden</span><button type="button" class="q-pool-toggle-btn" data-toggle-3p-quota="show" aria-label="Show Claude and GPT quota bars">Show</button></div>`
            : `<div class="meta-timestamp">${S.esc(provInfo?.usageMessage || (isActive ? 'Quota telemetry ready.' : 'Signed in · Standby'))}</div>`;
      } else if (tpBars.length) {
        const gemHtml = gemBars.length
          ? `<div class="q-pool-group"><div class="q-pool-head"><span class="q-pool-dot agy"></span><span class="q-pool-title">Gemini models</span></div>${gemBars.map((l) => renderPulseBar(l, false)).join('')}</div>`
          : '';
        const tpHtml = `<div class="q-pool-3p"><div class="q-pool-head"><span class="q-pool-dot third-party"></span><span class="q-pool-title">Claude &amp; GPT pool</span><button type="button" class="q-pool-toggle-btn" data-toggle-3p-quota="hide" aria-label="Hide Claude and GPT quota bars">Hide</button></div>${tpBars.map((l) => renderPulseBar(l, true)).join('')}</div>`;
        barsHtml = gemHtml + tpHtml;
      } else {
        barsHtml = gemBars.map((l) => renderPulseBar(l, false)).join('');
      }
    } else {
      barsHtml = limits.map((l) => renderPulseBar(l, false)).join('');
    }

    const shortEmail = email.includes('@') ? email.split('@')[0] : email;
    const shortPlan = /^Google AI\s+/i.test(plan) ? plan.replace(/^Google AI\s+/i, '') : plan;
    const headerNickHtml = nick
      ? `<span class="quota-nick-pill${key === 'claude' ? ' claude' : ''}">${S.esc(nick)}</span>`
      : multi && shortEmail
        ? `<span class="quota-nick-pill${key === 'claude' ? ' claude' : ''}">${S.esc(shortEmail)}</span>`
        : '';

    const statusControlHtml = !isActive
      ? `<button type="button" class="quota-switch-btn" data-account-switch="${S.esc(acctId)}" data-account-prov="${key}" aria-label="Switch active ${S.esc(label)} account to ${S.esc(email || label)} (keeps other accounts signed in)">${S.UI_ICONS.swap}<span>Use</span></button>`
      : multi
        ? `<span class="quota-active-pill" aria-label="Currently active for new ${S.esc(label)} sessions"><span class="quota-active-dot"></span>Active</span>`
        : '';

    const moveBtnsHtml = canReorder && (canMoveUp || canMoveDown)
      ? `<span class="ide-acct-move-group${canMoveUp && canMoveDown ? ' dual' : ''}">${
          canMoveUp ? `<button type="button" class="quota-nick-btn ide-acct-move-btn" data-account-move="up" data-account-id="${S.esc(acctId)}" data-account-prov="${key}" aria-label="Move account up">${S.UI_ICONS.arrowUp}</button>` : ''
        }${
          canMoveDown ? `<button type="button" class="quota-nick-btn ide-acct-move-btn" data-account-move="down" data-account-id="${S.esc(acctId)}" data-account-prov="${key}" aria-label="Move account down">${S.UI_ICONS.arrowDown}</button>` : ''
        }</span>`
      : '';

    return `
      <div class="quota-card${isCollapsed ? ' collapsed' : ''}${isActive ? ' is-active' : ' is-secondary'}${multi ? ' multi' : ''}" data-quota-card-id="${S.esc(acctId)}" ${canReorder ? 'draggable="true"' : ''}>
        <div class="quota-card-head">
          <button type="button" class="quota-card-toggle" data-quota-collapse="${S.esc(collapseKey)}" aria-expanded="${!isCollapsed}" aria-label="${isCollapsed ? 'Show' : 'Hide'} ${S.esc(email || label)} usage">
            <div class="quota-prov-title">
              <svg class="quota-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>
              <span class="prov-glyph">${S.PROVIDER_ICONS[key]}</span>
              <div class="quota-title-stack">
                <div class="quota-title-line"><span class="quota-title-name">${S.esc(label)}</span>${headerNickHtml}</div>
              </div>
            </div>
          </button>
          <div class="quota-head-actions">
            ${statusControlHtml}
            ${isCollapsed && !multi ? `<span class="plan-pill">${S.esc(shortPlan)}</span>` : ''}
            ${moveBtnsHtml}
            <button type="button" class="quota-nick-btn" data-account-label="${S.esc(acctId)}" data-account-prov="${key}" data-account-nick="${S.esc(nick)}" aria-label="${nick ? 'Edit account label' : 'Set account label (e.g. Friend, Work)'}">${S.UI_ICONS.pencil}</button>
            <button type="button" class="quota-nick-btn" data-account-remove="${S.esc(acctId)}" data-account-prov="${key}" data-account-email="${S.esc(email)}" aria-label="${multi ? 'Disconnect account' : 'Sign out account'}">${S.UI_ICONS.close}</button>
          </div>
        </div>
        ${
          isCollapsed
            ? ''
            : `${
                S.activeInlineAcctEdit && S.activeInlineAcctEdit.accountId === acctId && S.activeInlineAcctEdit.surface === 'pulse'
                  ? `<form class="ide-acct-edit-row" data-acct-label-form="${S.esc(acctId)}" data-acct-prov="${key}"><input type="text" class="ide-acct-inline-edit" value="${S.esc(S.activeInlineAcctEdit.value ?? nick)}" placeholder="Nickname (e.g. Work, Personal)" maxlength="32" autocomplete="off"><button type="submit" class="ide-link-pill">Save</button><button type="button" class="ide-link-pill" data-acct-label-cancel="1">Cancel</button></form>`
                  : ''
              }<div class="quota-sub-line">${email ? `<span class="meta-timestamp">${S.esc(email)}</span>` : '<span></span>'}<span class="plan-pill">${S.esc(shortPlan)}</span></div><div class="quota-bars-stack">${barsHtml}</div>${key === 'claude' && isActive ? S.renderClaudeModeSelectorHtml('quota') : ''}`
        }
      </div>
    `;
  }

  function renderSessionCardHtml(r) {
    const provKey = r.provider === 'claude' ? 'claude' : 'antigravity';
    const groups = Array.isArray(S.appState?.groups) ? S.appState.groups : [];
    const grpObj = r.group ? groups.find((g) => g && g.id === r.group) : null;
    const td = S.threadsCache[r.id];
    const ctxW = td?.contextWindow;
    const savedCardOverride = r.id && S.prefs.threadModelConfig ? S.prefs.threadModelConfig[r.id] : null;
    const hasThreadModelOverride = Boolean(
      savedCardOverride && !(Number(r.modelUpdatedAt || 0) > Number(savedCardOverride.updatedAt || 0))
    );
    const cardCfg = hasThreadModelOverride
      ? S.getEffectiveSessionModelConfig(r, provKey, false)
      : null;
    const rawCardModel = hasThreadModelOverride
      ? cardCfg.displayLabel
      : ctxW?.modelLabel || ctxW?.modelName || td?.model || r.model;
    const displayModel = hasThreadModelOverride
      ? cardCfg.displayLabel
      : S.normalizeDisplayModel(rawCardModel, provKey);
    const showNeonCardPill = Boolean(
      !r.archived && provKey === 'antigravity' && (r.neonWarning || /neon/i.test(String(displayModel || '')))
    );
    const rawUsedTok = ctxW?.usedTokens ?? r.usedTokens ?? r.contextTokens ?? 0;
    const rawLimTok = hasThreadModelOverride
      ? S.inferDefaultContextLimit(provKey, displayModel)
      : ctxW?.limitTokens || ctxW?.maxContextTokens || r.limitTokens || r.contextLimit || 0;
    const {
      usedTokens: safeUsed,
      limitTokens: limTok,
      pct: ctxPct
    } = S.resolveDisplayContextMetrics(provKey, rawCardModel || displayModel, rawUsedTok, rawLimTok, false);
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
        ? `<button type="button" class="sess-bgtask-pill tabular is-running" data-open-bgtasks="${S.esc(r.id || '')}" data-session-prov="${provKey}" aria-label="Inspect running background tasks">${getBgKindSvg(sessBgRunningTasks[0]?.kind || 'task')}<span class="sess-bgtask-pill-txt">${sessBgRunning} live${sessBgRunningTasks[0]?.summary ? ` · ${S.esc(sessBgRunningTasks[0].summary)}` : ''}</span></button>`
        : '';
    const devEntry = r.deviceId ? S.fleetDevicesMap.get(r.deviceId) : null;
    const devLabel = r.deviceName || devEntry?.name || '';
    const devBadgeHtml = devLabel
      ? `<span class="sess-device-badge ${devEntry?.online ? 'is-online' : ''}" aria-label="Host machine: ${S.esc(devLabel)}">${devEntry?.online ? '●' : '◐'} ${S.esc(devLabel)}</span>`
      : '';
    const isPinnedCard = S.isRowPinned(r);
    return `
      <div class="session-card ${statusCls}${isPinnedCard ? ' is-pinned' : ''}" data-session-id="${S.esc(r.id || '')}" data-session-prov="${provKey}">
        <div class="sess-left">
          <span class="sess-status-dot ${statusCls}" aria-label="${S.esc(r.status || 'idle')}"></span>
          <span class="prov-glyph">${S.PROVIDER_ICONS[provKey]}</span>
          <div class="sess-body">
            <div class="sess-title-row">
              ${isPinnedCard ? `<span class="sess-pin-glyph" aria-label="Pinned chat">${S.PIN_FILLED_SVG}</span>` : ''}
              <span class="sess-title">${S.esc(r.title || 'Untitled Session')}</span>
            </div>
            <div class="sess-sub-row tabular">
              ${devBadgeHtml}
              ${S.isClaudeDesktopRow(r) ? `<span class="session-origin-pill">Desktop</span>` : ''}
              ${r.folder ? `<span class="tag-pill">${S.esc(r.folder)}</span>` : ''}
              ${r.branch ? `<span>⎇ ${S.esc(r.branch)}</span>` : ''}
              <span>${S.esc(displayModel)}</span>
              ${
                showNeonCardPill && r.id
                  ? `<button type="button" class="session-neon-pill" data-switch-neon-carbon="${S.esc(r.id)}" data-micro-tip="Switch session from Neon to Carbon" aria-label="Neon model active — switch to Carbon">Neon</button>`
                  : ''
              }
              ${
                safeUsed > 0
                  ? `<span class="tag-pill tabular" aria-label="Context window usage">${S.fmtCompact(safeUsed)} / ${S.fmtCompact(limTok)} · ${ctxPct}%</span>`
                  : ''
              }
              ${bgPillHtml}
              <span>· ${S.timeAgo(S.getRowLastWorkedMs(r))}</span>
              ${S.isSessionOpenTab(r) ? `<span class="tag-pill" style="color:var(--brass)">Open Tab</span>` : ''}
            </div>
          </div>
        </div>
        <div class="sess-right">
          ${
            r.status === 'working' || r.dot === 'running' || r.bgTask?.state === 'running'
              ? `<button type="button" class="sess-act-btn stop-btn" data-sess-act="stop" data-id="${S.esc(r.id || '')}" aria-label="Stop / interrupt running session">■ Stop</button>`
              : ''
          }
          ${
            !r.archived && r.id
              ? `<button type="button" class="sess-act-btn pin-btn${isPinnedCard ? ' active' : ''}" data-sess-act="pin" data-id="${S.esc(r.id)}" data-val="${!isPinnedCard}" aria-pressed="${isPinnedCard}" aria-label="${isPinnedCard ? 'Unpin chat' : 'Pin chat'}">${isPinnedCard ? S.PIN_FILLED_SVG : S.PIN_OUTLINE_SVG}<span>${isPinnedCard ? 'Pinned' : 'Pin'}</span></button>`
              : ''
          }
          <button type="button" class="sess-act-btn" data-sess-act="group" data-id="${S.esc(r.id || '')}" aria-label="Assign or move session to a group">
            ${S.esc(grpObj ? grpObj.name : 'Group')}
          </button>
          ${
            grpObj && !r.archived
              ? `<button type="button" class="sess-act-btn" data-sess-act="group-remove" data-id="${S.esc(r.id || '')}" aria-label="Remove from ${S.esc(grpObj.name)}">✕</button>`
              : ''
          }
          <button type="button" class="sess-act-btn" data-sess-act="unread" data-id="${S.esc(r.id || '')}" data-val="${!r.unread}" aria-label="Toggle unread">
            ${r.unread ? '● Unread' : '○ Read'}
          </button>
          <button type="button" class="sess-act-btn" data-sess-act="archive" data-id="${S.esc(r.id || '')}" data-val="${!r.archived}" aria-label="${r.archived ? 'Unarchive' : 'Archive'}">
            ${r.archived ? 'Restore' : 'Archive'}
          </button>
        </div>
      </div>
    `;
  }

  function isSessionGroupCollapsed(groupId, defaultCollapsed = false) {
    if (
      S.prefs.collapsedSessionGroups &&
      typeof S.prefs.collapsedSessionGroups === 'object' &&
      groupId in S.prefs.collapsedSessionGroups
    ) {
      return Boolean(S.prefs.collapsedSessionGroups[groupId]);
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
      : `<div class="meta-timestamp" style="padding:8px 10px">No sessions in <strong>${S.esc(name)}</strong> yet. Use <strong>Group</strong> on any session card to move it here.</div>`;

    const actionsHtml = isCustomGroup
      ? `
        <button type="button" class="group-act-btn" data-group-act="new-in-group" data-group-id="${S.esc(id)}" data-micro-tip="Start new session in group" aria-label="Start new session">+ New</button>
        <button type="button" class="group-act-btn" data-group-act="rename" data-group-id="${S.esc(id)}" data-group-name="${S.esc(name)}" data-micro-tip="Rename group" aria-label="Rename group">✎</button>
        <button type="button" class="group-act-btn" data-group-act="delete" data-group-id="${S.esc(id)}" data-group-name="${S.esc(name)}" data-micro-tip="Delete group" aria-label="Delete group">✕</button>
      `
      : archivableIds.length > 0
        ? `<button type="button" class="group-act-btn" data-group-act="archive-closed" data-micro-tip="Archive ${archivableIds.length} closed idle sessions" aria-label="Archive ${archivableIds.length} closed idle sessions">Archive closed (${archivableIds.length})</button>`
        : '';

    const pinBadgeHtml = S.renderCollapsedGroupPinBadgeHtml(items, isCollapsed, 'group-pin-badge');

    return `
      <div class="session-group-block ${isCollapsed ? 'collapsed' : ''}" data-session-group="${S.esc(id)}">
        <div class="session-group-header">
          <button type="button" class="session-group-toggle" data-group-act="toggle" data-group-id="${S.esc(id)}" aria-expanded="${!isCollapsed}">
            <svg class="group-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>
            <span class="group-color-dot ${S.esc(color)}"></span>
            <span class="group-title">${S.esc(name)}</span>
            ${pinBadgeHtml}<span class="group-count-pill tabular">${items.length}</span>
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
    try {
      syncProviderNewSessionButtons();
    } catch (err) {
      console.warn('[THEO] Provider button sync error:', err?.message || err);
    }
    if (S.prefs.activeTab !== 'sessions') return;
    return S.runViewBoundary('sessions', 'Sessions', { elId: 'sessions-full-list', mode: 'replace' }, () => {
    const container = S.$('sessions-full-list');
    if (!container) return;
    const hideDesktop = S.isClaudeDesktopHidden();
    const rows = (S.appState?.rows || []).filter(
      (r) => r.id && (!hideDesktop || !S.isClaudeDesktopRow(r))
    );
    const groups = Array.isArray(S.appState?.groups) ? S.appState.groups : [];
    const groupIds = new Set(groups.map((g) => g.id));
    const q = (S.$('sess-search-input')?.value || '').trim().toLowerCase();

    const activeTotalAll = rows.filter((r) => !r.archived).length;
    const runningNowCount = rows.filter((r) => !r.archived && r.status === 'working').length;
    const sumPill = S.$('sess-header-summary-pill');
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
      (S.prefs.sessProvider === 'claude' && !showClaudeSeg) ||
      (S.prefs.sessProvider === 'antigravity' && !showAgySeg)
    ) {
      S.prefs.sessProvider = 'all';
      S.saveJson(S.STORAGE_KEYS.PREFS, S.prefs);
    }
    const provSegEl = S.$('sess-provider-seg');
    if (provSegEl) {
      provSegEl.hidden = !(showAgySeg && showClaudeSeg);
    }
    document.querySelectorAll('#sess-provider-seg .seg-btn').forEach((b) => {
      const p = b.dataset.prov;
      b.classList.toggle('active', p === S.prefs.sessProvider);
      const cnt = provCounts[p] ?? 0;
      if (p === 'all') {
        b.innerHTML = `<span>All</span><span class="seg-count tabular">${cnt}</span>`;
      } else if (p === 'antigravity') {
        b.innerHTML = `<span class="prov-glyph">${S.PROVIDER_ICONS.antigravity}</span><span>Antigravity</span><span class="seg-count tabular">${cnt}</span>`;
      } else if (p === 'claude') {
        b.innerHTML = `<span class="prov-glyph">${S.PROVIDER_ICONS.claude}</span><span>Claude</span><span class="seg-count tabular">${cnt}</span>`;
      }
    });

    const provOnlyRows = rows.filter(
      (r) => S.prefs.sessProvider === 'all' || r.provider === S.prefs.sessProvider
    );
    const fleetDevices = S.getUnifiedFleetDevices();
    const devChipsEl = S.$('sess-device-chips');
    if (devChipsEl) {
      if (fleetDevices.length <= 1) {
        devChipsEl.hidden = true;
      } else {
        devChipsEl.hidden = false;
        const allDevCnt = provOnlyRows.filter((r) => !r.archived).length;
        devChipsEl.innerHTML =
          `<button type="button" class="chip ${S.prefs.selectedDeviceFilter === 'all' ? 'active' : ''}" data-fleet-filter="all"><span class="chip-label">All Hosts</span><span class="chip-count tabular">${allDevCnt}</span></button>` +
          fleetDevices
            .map((d) => {
              const cnt = provOnlyRows.filter((r) => !r.archived && r.deviceId === d.id).length;
              return `<button type="button" class="chip ${S.prefs.selectedDeviceFilter === d.id ? 'active' : ''}" data-fleet-filter="${S.esc(d.id)}"><span class="chip-label">${d.online ? '● ' : ''}${S.esc(d.name || d.id)}</span><span class="chip-count tabular">${cnt}</span></button>`;
            })
            .join('');
      }
    }

    const provRows =
      S.prefs.selectedDeviceFilter && S.prefs.selectedDeviceFilter !== 'all'
        ? provOnlyRows.filter((r) => !r.deviceId || r.deviceId === S.prefs.selectedDeviceFilter)
        : provOnlyRows;
    const chipCounts = {
      all: provRows.filter((r) => !r.archived).length,
      needs_input: provRows.filter((r) => !r.archived && r.status === 'waiting').length,
      working: provRows.filter((r) => !r.archived && r.status === 'working').length,
      unread: provRows.filter((r) => !r.archived && r.unread).length,
      open: provRows.filter((r) => !r.archived && S.isSessionOpenTab(r)).length,
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
      c.classList.toggle('active', k === S.prefs.sessStatus);
      if (chipLabels[k] !== undefined) {
        c.innerHTML = `<span class="chip-label">${S.esc(chipLabels[k])}</span><span class="chip-count tabular">${chipCounts[k] ?? 0}</span>`;
      }
    });

    const rawFiltered = provRows.filter((r) => {
      if (S.prefs.sessStatus === 'archived') {
        if (!r.archived) return false;
      } else {
        if (r.archived) return false;
        if (S.prefs.sessStatus === 'needs_input' && r.status !== 'waiting') return false;
        if (S.prefs.sessStatus === 'working' && r.status !== 'working') return false;
        if (S.prefs.sessStatus === 'unread' && !r.unread) return false;
        if (S.prefs.sessStatus === 'open' && !S.isSessionOpenTab(r)) return false;
      }
      if (q) {
        const grpName = r.group ? groups.find((g) => g.id === r.group)?.name || '' : '';
        const hay = `${r.title} ${r.folder} ${r.branch} ${r.model} ${r.provider} ${r.deviceName || ''} ${grpName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const filtered = q
      ? S.rankSearchMatchesWithPinnedFirst(
          rawFiltered,
          q,
          (r) =>
            (r.status === 'working' ? 500 : r.status === 'waiting' ? 400 : 0) +
            Math.max(0, 299 - Math.min(299, Math.floor(Math.max(0, Date.now() - S.getRowLastWorkedMs(r)) / 3600000)))
        )
      : [...rawFiltered].sort(
          (a, b) =>
            (S.isRowPinned(b) ? 1 : 0) - (S.isRowPinned(a) ? 1 : 0) ||
            (S.isSessionActivelyRunning(b.id) ? 1 : 0) - (S.isSessionActivelyRunning(a.id) ? 1 : 0) ||
            S.getRowLastWorkedMs(b) - S.getRowLastWorkedMs(a) ||
            Number(b.pinnedAt || 0) - Number(a.pinnedAt || 0)
        );

    if (S.isFocusInsideContainerInputs(container)) return;
    const unpairedBannerHtml =
      !S.hasAnyPairingCredentials() &&
      S.connMode !== 'local' &&
      S.connMode !== 'edge' &&
      S.connMode !== 'cloud'
        ? S.renderQuickPairOnboardingCardHtml('sessions')
        : '';

    if (rows.length === 0 && unpairedBannerHtml) {
      container.innerHTML = unpairedBannerHtml;
      S.reconcileIdeMicroTip();
      return;
    }

    if (filtered.length === 0 && (q || S.prefs.sessStatus !== 'all' || groups.length === 0)) {
      const hasActiveFilters = S.prefs.sessProvider !== 'all' || S.prefs.sessStatus !== 'all' || Boolean(q);
      container.innerHTML = `${unpairedBannerHtml}
        <div class="ledger-panel" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div class="meta-timestamp">
            ${
              rows.length === 0
                ? 'Syncing live sessions from your PC…'
                : 'No sessions match the current filter.'
            }
          </div>
          <div style="display:flex;gap:8px">
            ${
              hasActiveFilters
                ? `<button type="button" class="btn-ghost-sm" id="btn-reset-sess-filters">Reset Filters (Show All ${rows.filter((r) => !r.archived).length} Sessions)</button>`
                : ''
            }
            <button type="button" class="btn-brass-sm" id="btn-empty-sync-now">↻ Sync now</button>
          </div>
        </div>
      `;
      S.reconcileIdeMicroTip();
      return;
    }

    // Render collapsible Group sections at top when not searching and not in Archived-only mode
    if (!q && groups.length > 0 && S.prefs.sessStatus !== 'archived') {
      const groupPalette = ['blue', 'green', 'amber', 'purple', 'steel'];
      let sectionsHtml = unpairedBannerHtml;
      groups.forEach((g, idx) => {
        const gItems = filtered.filter((r) => r.group === g.id);
        if ((q || S.prefs.sessStatus !== 'all') && gItems.length === 0) {
          return;
        }
        const isCollapsed =
          q || S.prefs.sessStatus !== 'all'
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
              !S.isRowPinned(r) &&
              !S.isSessionOpenTab(r) &&
              r.status !== 'working' &&
              r.status !== 'waiting' &&
              !r.unread
          )
          .map((r) => r.id);
        const isUngroupedCollapsed =
          q || S.prefs.sessStatus !== 'all'
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
      S.reconcileIdeMicroTip();
      return;
    }

    container.innerHTML =
      unpairedBannerHtml + filtered.map((r) => renderSessionCardHtml(r)).join('');
    S.reconcileIdeMicroTip();
    });
  }
  const UW_VISIBLE_ROWS = 8;
  function fmtUnsavedIdle(h) {
    if (h == null || !Number.isFinite(Number(h))) return 'idle ?';
    const n = Number(h);
    if (n < 1) return 'idle <1 h';
    if (n < 48) return `idle ${Math.round(n)} h`;
    return `idle ${Math.round(n / 24)} d`;
  }
  function fmtStalledAge(h) {
    if (h == null || !Number.isFinite(Number(h))) return '? h old';
    const n = Number(h);
    if (n < 1) return '<1 h old';
    if (n < 48) return `${Math.round(n)} h old`;
    return `${Math.round(n / 24)} d old`;
  }
  function buildUnsavedWorkPanelHtml(now = Date.now()) {
    const pcs = S.getUnifiedFleetDevices()
      .map((d) => ({ d, uw: d && d.unsavedWork ? S.sanitizeFleetUnsavedWork(d.unsavedWork, now, { age: true }) : null }))
      .filter((x) => x.uw);
    if (!pcs.length) return '';
    pcs.sort(
      (a, b) =>
        b.uw.staleCount - a.uw.staleCount ||
        b.uw.unsavedCount - a.uw.unsavedCount ||
        String(a.d.name || a.d.id).localeCompare(String(b.d.name || b.d.id))
    );
    // Collect and deduplicate unshipped remote origin/wt/* branches across all hosts (shared GitHub remote).
    const stalledMap = new Map();
    let maxCutoffHours = 24;
    for (const { d, uw } of pcs) {
      const sw = uw && uw.stalledWt;
      if (!sw || !Array.isArray(sw.items)) continue;
      if (Number.isFinite(sw.cutoffHours)) maxCutoffHours = Math.max(maxCutoffHours, sw.cutoffHours);
      const checked = Number(sw.checkedAt || uw.checkedAt || 0);
      const reporter = String(d.name || d.hostname || d.id || 'PC');
      for (const it of sw.items) {
        const key = `${it.repo}::${it.branch}`;
        const prev = stalledMap.get(key);
        if (!prev) {
          stalledMap.set(key, { ...it, checkedAt: checked, reporters: [reporter] });
        } else {
          const reps = prev.reporters.includes(reporter) ? prev.reporters : prev.reporters.concat(reporter);
          if (checked > prev.checkedAt || (checked === prev.checkedAt && Number(it.ageHours || 0) > Number(prev.ageHours || 0))) {
            stalledMap.set(key, { ...it, checkedAt: checked, reporters: reps });
          } else {
            prev.reporters = reps;
          }
        }
      }
    }
    const stalledItems = Array.from(stalledMap.values()).sort(
      (a, b) => Number(b.ageHours || 0) - Number(a.ageHours || 0) || a.repo.localeCompare(b.repo) || a.branch.localeCompare(b.branch)
    );
    const totalUnsaved = pcs.reduce((s, x) => s + x.uw.unsavedCount, 0);
    const totalStale = pcs.reduce((s, x) => s + x.uw.staleCount, 0);
    const pcsWithWork = pcs.filter((x) => x.uw.unsavedCount > 0).length;
    const thr = Math.round(pcs[0].uw.staleHours || 24);
    const stalledHeadSuffix = stalledItems.length > 0 ? ` · ${stalledItems.length} stalled wt/*` : '';
    const headTxt =
      totalUnsaved === 0
        ? `All saved on ${pcs.length} PC${pcs.length === 1 ? '' : 's'}${stalledHeadSuffix}`
        : `${totalUnsaved} folder${totalUnsaved === 1 ? '' : 's'} on ${pcsWithWork} PC${pcsWithWork === 1 ? '' : 's'}` +
          (totalStale > 0 ? ` · ${totalStale} idle ${thr} h+` : '') +
          stalledHeadSuffix;
    const itemHtml = (it, hrs) => `
      <li class="uw-item${it.stale ? ' is-stale' : ''}">
        <div class="uw-line1">
          <span class="uw-repo">${S.esc(it.repo)}</span>
          <span class="uw-branch mono">⎇ ${S.esc(it.branch)}</span>
          ${it.stale ? `<span class="uw-stale-pill tabular">${hrs} h+</span>` : ''}
          <span class="uw-idle tabular">${S.esc(fmtUnsavedIdle(it.idleHours))}</span>
        </div>
        <div class="uw-line2">${S.esc(it.where || 'owner unknown')}${it.why ? ` · ${S.esc(it.why)}` : ''}</div>
        ${it.path ? `<div class="uw-path mono">${S.esc(it.path)}</div>` : ''}
      </li>`;
    const pcHtml = pcs
      .map(({ d, uw }) => {
        const pcId = String(d.id || '');
        const name = String(d.name || d.hostname || d.id || 'PC');
        const hrs = Math.round(uw.staleHours || 24);
        const ageMs = Math.max(0, now - uw.checkedAt);
        const old = ageMs > S.UNSAVED_WORK_OLD_AFTER_MS;
        const checkedHtml = old
          ? `<span class="uw-checked is-old tabular">last checked ${S.esc(S.timeAgo(uw.checkedAt))}</span>`
          : '';
        const uncheckedTxt = uw.unchecked > 0 ? ` · ${uw.unchecked} not checked` : '';
        if (uw.unsavedCount === 0) {
          return `
          <div class="uw-pc is-clean" data-uw-pc="${S.esc(pcId)}">
            <div class="uw-pc-head">
              <span class="uw-pc-name">${S.esc(name)}</span>
              <span class="uw-pc-meta">all saved${S.esc(uncheckedTxt)}</span>
              ${checkedHtml}
            </div>
          </div>`;
        }
        const shown = uw.items.slice(0, UW_VISIBLE_ROWS);
        const rest = uw.items.slice(UW_VISIBLE_ROWS);
        const notSent = Math.max(0, uw.unsavedCount - uw.items.length);
        const meta =
          `${uw.unsavedCount} unsaved` + (uw.staleCount > 0 ? ` · ${uw.staleCount} idle ${hrs} h+` : '') + uncheckedTxt;
        return `
          <div class="uw-pc${uw.staleCount > 0 ? ' has-stale' : ''}" data-uw-pc="${S.esc(pcId)}">
            <div class="uw-pc-head">
              <span class="uw-pc-name">${S.esc(name)}</span>
              <span class="uw-pc-meta tabular">${S.esc(meta)}</span>
              ${checkedHtml}
            </div>
            <ul class="uw-list">${shown.map((it) => itemHtml(it, hrs)).join('')}</ul>
            ${
              rest.length
                ? `<details class="uw-more" data-uw-more="${S.esc(pcId)}"${S.uwExpandedPcs.has(pcId) ? ' open' : ''}>
                    <summary class="uw-more-sum">Show ${rest.length} more</summary>
                    <ul class="uw-list">${rest.map((it) => itemHtml(it, hrs)).join('')}</ul>
                  </details>`
                : ''
            }
            ${notSent > 0 ? `<div class="uw-overflow tabular">+${notSent} more on ${S.esc(name)} (not listed)</div>` : ''}
          </div>`;
      })
      .join('');
    const stalledItemHtml = (it) => `
      <li class="uw-item is-stale uw-stalled-item">
        <div class="uw-line1">
          <span class="uw-repo">${S.esc(it.repo)}</span>
          <span class="uw-branch mono">⎇ ${S.esc(it.branch)}</span>
          ${it.ahead > 0 ? `<span class="uw-stale-pill tabular">+${it.ahead}</span>` : ''}
          <span class="uw-idle tabular">${S.esc(fmtStalledAge(it.ageHours))}</span>
        </div>
        <div class="uw-line2">${it.sha ? `<span class="mono">${S.esc(it.sha)}</span> · ` : ''}${S.esc(it.subject || 'unshipped commits')}</div>
      </li>`;
    const stalledShown = stalledItems.slice(0, UW_VISIBLE_ROWS);
    const stalledRest = stalledItems.slice(UW_VISIBLE_ROWS);
    const stalledSectionHtml = stalledItems.length
      ? `
      <div class="uw-stalled" id="uw-stalled-section">
        <div class="uw-stalled-head">
          <span class="eyebrow">Stalled wt/* Branches</span>
          <span class="uw-pc-meta tabular">${stalledItems.length} unshipped · ${Math.round(maxCutoffHours)} h+</span>
        </div>
        <ul class="uw-list">${stalledShown.map(stalledItemHtml).join('')}</ul>
        ${
          stalledRest.length
            ? `<details class="uw-more" data-uw-more="__stalled_wt__"${S.uwExpandedPcs.has('__stalled_wt__') ? ' open' : ''}>
                <summary class="uw-more-sum">Show ${stalledRest.length} more</summary>
                <ul class="uw-list">${stalledRest.map(stalledItemHtml).join('')}</ul>
              </details>`
            : ''
        }
      </div>`
      : '';
    return `
      <div class="uw-head">
        <span class="eyebrow">Unsaved Work</span>
        <span class="uw-total tabular">${S.esc(headTxt)}</span>
      </div>
      <div class="uw-pcs">${pcHtml}</div>${stalledSectionHtml}`;
  }
  function renderUnsavedWorkPanel() {
    const el = S.$('unsaved-work-panel');
    if (!el) return;
    const html = buildUnsavedWorkPanelHtml();
    if (!html) {
      el.hidden = true;
      if (el.__uwHtml) {
        el.innerHTML = '';
        el.__uwHtml = '';
      }
      return;
    }
    el.hidden = false;
    // Patch only when the content changed, so an open "Show N more" and the scroll position survive syncs.
    if (el.__uwHtml !== html) {
      el.innerHTML = html;
      el.__uwHtml = html;
    }
    if (!el.__uwBound) {
      el.__uwBound = true;
      el.addEventListener(
        'toggle',
        (ev) => {
          const det = ev.target;
          const id = det && det.dataset ? det.dataset.uwMore : '';
          if (!id) return;
          if (det.open) S.uwExpandedPcs.add(id);
          else S.uwExpandedPcs.delete(id);
          el.__uwHtml = '';
        },
        true
      );
    }
  }

  // VIEW 4: Render Workspaces & Git Inspector
  function renderWorkspacesView() {
    return S.runViewBoundary('workspaces', 'Repositories & Git', { elId: 'view-workspaces', mode: 'prepend' }, async () => {
    const listEl = S.$('repo-selector-list');
    const detailEl = S.$('repo-detail-panel');
    renderUnsavedWorkPanel();
    if (!listEl || !detailEl) return;

    const workspaces = S.appState?.workspaces || [];
    if (!workspaces.length) {
      listEl.innerHTML = `<div class="meta-timestamp">Loading repositories…</div>`;
      return;
    }

    if (!workspaces.some((w) => w.id === S.prefs.selectedRepoId)) {
      const preferredDefault =
        workspaces.find((w) => w && !w.retired && !S.RETIRED_WORKSPACE_IDS.has(w.id)) || workspaces[0];
      S.prefs.selectedRepoId = preferredDefault.id;
    }

    listEl.innerHTML = workspaces
      .map(
        (w) => `
        <button type="button" class="repo-item-btn ${w.id === S.prefs.selectedRepoId ? 'active' : ''}" data-select-repo="${S.esc(w.id)}">
          <div>
            <div style="font-weight:700;font-size:var(--fs-md)">${S.esc(w.name)}</div>
            <div class="meta-timestamp tabular">⎇ ${S.esc(w.branch || 'main')}</div>
          </div>
          <span class="tag-pill tabular" style="color:${w.dirtyCount > 0 ? 'var(--amber)' : 'var(--emerald)'}">
            ${w.dirtyCount > 0 ? `${w.dirtyCount}Δ` : 'Clean'}
          </span>
        </button>
      `
      )
      .join('');

    const reqSeq = ++S.wsRenderSeq;
    const requestedRepoId = S.prefs.selectedRepoId;
    const fetched = await S.fetchWorkspaceDetail(requestedRepoId);
    if (reqSeq !== S.wsRenderSeq || S.prefs.selectedRepoId !== requestedRepoId) return;
    const repo =
      fetched?.workspace ||
      S.workspacesDetailCache[requestedRepoId] ||
      workspaces.find((w) => w.id === requestedRepoId);

    if (!repo) return;

    const modFiles = repo.modifiedFiles || [];
    const commits = repo.recentCommits || [];
    const diffHtml = formatGitDiffHtml(repo.diffPatch || '');

    detailEl.innerHTML = `
      <div class="section-head">
        <div>
          <div class="eyebrow">${S.esc(repo.group || 'Repository')}</div>
          <h2 class="section-title" style="font-size:var(--fs-2xl)">${S.esc(repo.name)} <span class="tag-pill tabular">⎇ ${S.esc(repo.branch)}</span></h2>
          <div class="meta-timestamp mono">${S.esc(repo.path || '')}</div>
        </div>
        <button type="button" class="btn-brass-sm" data-launch-repo="${S.esc(repo.id)}" data-launch-name="${S.esc(repo.name)}">
          + Prompt in Repo
        </button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:14px;margin:14px 0">
        <div class="pairing-card">
          <div class="eyebrow" style="margin-bottom:6px">Working Tree (${modFiles.length} modified)</div>
          ${
            modFiles.length === 0
              ? `<div class="meta-timestamp">Working tree is clean.</div>`
              : modFiles
                  .slice(0, 12)
                  .map(
                    (f) =>
                      `<div class="mono" style="font-size:var(--fs-sm);padding:3px 0;display:flex;justify-content:space-between"><span>${S.esc(f.path)}</span><strong style="color:var(--amber)">${S.esc(f.status)}</strong></div>`
                  )
                  .join('')
          }
        </div>
        <div class="pairing-card">
          <div class="eyebrow" style="margin-bottom:6px">Recent Commits</div>
          ${commits
            .slice(0, 5)
            .map(
              (c) =>
                `<div style="font-size:var(--fs-sm);padding:4px 0;border-bottom:1px solid var(--border-subtle)"><code style="color:var(--brass)">${S.esc(c.hash)}</code> ${S.esc(c.subject)} <span class="meta-timestamp">(${S.esc(c.relativeTime)})</span></div>`
            )
            .join('')}
        </div>
      </div>

      <div class="eyebrow" style="margin:14px 0 6px">Git Diff Inspector</div>
      <pre class="diff-viewer mono">${diffHtml || 'No uncommitted diff lines in working tree.'}</pre>
    `;
    });
  }

  function formatGitDiffHtml(patch) {
    if (!patch) return '';
    return patch
      .split(/\r?\n/)
      .slice(0, 260)
      .map((line) => {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          return `<span class="diff-line-add">${S.esc(line)}</span>`;
        }
        if (line.startsWith('-') && !line.startsWith('---')) {
          return `<span class="diff-line-del">${S.esc(line)}</span>`;
        }
        if (line.startsWith('@@') || line.startsWith('diff --git')) {
          return `<span class="diff-line-hdr">${S.esc(line)}</span>`;
        }
        return S.esc(line);
      })
      .join('\n');
  }

  // VIEW 5: Render Telemetry & Pairing
  function renderAnalyticsView() {
    return S.runViewBoundary('analytics', 'Analytics & Settings', { elId: 'view-analytics', mode: 'prepend' }, () => {
    const prov = S.prefs.telemetryProv || 'all';
    const summaryObj = S.appState?.summaryByProvider?.[prov] || S.appState?.summary || {
      today: { tokens: 0, turns: 0, sessions: 0, input: 0, cached: 0, output: 0 },
      week: { tokens: 0, turns: 0, sessions: 0, input: 0, cached: 0, output: 0 },
      days: []
    };

    const kpiGrid = S.$('telemetry-kpi-grid');
    if (kpiGrid) {
      kpiGrid.innerHTML = `
        <div class="ledger-panel">
          <div class="eyebrow">Today (5-Hour / Daily)</div>
          <div class="hero-headline" style="color:var(--brass)">${S.fmtCompact(summaryObj.today?.tokens)} <span style="font-size:var(--fs-md);color:var(--text-muted)">tokens</span></div>
          <div class="meta-timestamp">${S.fmtInt(summaryObj.today?.turns)} turns · ${S.fmtInt(summaryObj.today?.sessions)} sessions</div>
          <div class="meta-timestamp" style="margin-top:6px">In: ${S.fmtCompact(summaryObj.today?.input)} · Cache: ${S.fmtCompact(summaryObj.today?.cached)} · Out: ${S.fmtCompact(summaryObj.today?.output)}</div>
        </div>
        <div class="ledger-panel">
          <div class="eyebrow">7-Day Usage</div>
          <div class="hero-headline" style="color:var(--steel)">${S.fmtCompact(summaryObj.week?.tokens)} <span style="font-size:var(--fs-md);color:var(--text-muted)">tokens</span></div>
          <div class="meta-timestamp">${S.fmtInt(summaryObj.week?.turns)} turns · ${S.fmtInt(summaryObj.week?.sessions)} active sessions</div>
          <div class="meta-timestamp" style="margin-top:6px">In: ${S.fmtCompact(summaryObj.week?.input)} · Cache: ${S.fmtCompact(summaryObj.week?.cached)} · Out: ${S.fmtCompact(summaryObj.week?.output)}</div>
        </div>
      `;
    }

    // 7-Day Bar Chart
    const days = Array.isArray(summaryObj.days) ? summaryObj.days : [];
    const maxTok = Math.max(1, ...days.map((d) => Number(d.tokens || 0)));
    const chartStage = S.$('telemetry-chart-stage');
    const chartLbl = S.$('chart-total-label');
    if (chartLbl) {
      chartLbl.textContent = `Peak day: ${S.fmtCompact(maxTok)} tokens`;
    }
    if (chartStage) {
      chartStage.innerHTML = `
        <div class="chart-bars tabular">
          ${days
            .map((d) => {
              const hPct = Math.max(5, Math.round((Number(d.tokens || 0) / maxTok) * 100));
              return `
                <div class="chart-col">
                  <span class="meta-timestamp" style="font-size:var(--fs-xs)">${S.fmtCompact(d.tokens)}</span>
                  <div class="chart-bar-wrap">
                    <div class="chart-bar-fill" style="height:${hPct}%"></div>
                  </div>
                  <span style="font-size:var(--fs-xs);font-weight:600">${S.esc(d.label || d.key)}</span>
                </div>
              `;
            })
            .join('')}
        </div>
      `;
    }

    // Top Sessions Ledger Table
    const topTable = S.$('telemetry-top-table');
    if (topTable) {
      const topList = (
        Array.isArray(S.appState?.topSessions) && S.appState.topSessions.length
          ? S.appState.topSessions
          : S.appState?.rows || []
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
                <tr data-open-chat="${S.esc(t.id || '')}" style="cursor:pointer">
                  <td><strong>${S.esc(t.title || 'Session')}</strong></td>
                  <td>${t.provider === 'claude' ? 'Claude Code' : 'Antigravity'}</td>
                  <td>${S.esc(t.workspaceLabel || t.folder || 'BHFIRMS')}</td>
                  <td style="text-align:right">${t.totalTokens ? S.fmtCompact(t.totalTokens) + ' tok' : S.timeAgo(t.at || (t.updatedAt ? t.updatedAt * 1000 : 0))}</td>
                </tr>
              `
              )
              .join('')}
          </tbody>
        </table>
      `;
    }

    // Web Push Notifications Settings Card
    const pushPanel = S.$('push-settings-panel');
    if (pushPanel) {
      pushPanel.innerHTML = renderPushSettingsCardHtml();
    }

    // Pairing & Security Configuration (#16, #17.5, #30.2)
    const pairingGrid = S.$('pairing-grid');
    if (
      pairingGrid &&
      !(document.activeElement && pairingGrid.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName))
    ) {
      if (S.localBridgeBase && !S.cachedPairingInfo) {
        S.fetchPairingInfoFromBridge().then((info) => {
          if (info && S.prefs.activeTab === 'analytics') renderAnalyticsView();
        });
      }
      const conn = S.appState?.connection || {};
      const lanUrl = conn.lanUrl || `http://127.0.0.1:${S.cloudCfg.port}/`;
      const pwaUrl = conn.pwaUrl || 'https://theo.husseinbdeir.workers.dev/';
      const hasPin = Boolean(
        localStorage.getItem(S.STORAGE_KEYS.PIN_HASH) || localStorage.getItem(S.STORAGE_KEYS.PIN)
      );
      const isPaired = S.hasAnyPairingCredentials();

      const fleetDevices = S.getUnifiedFleetDevices();
      const effectiveEdgeUrl = S.prefs.edgeRelayUrl || S.discoveredEdgeUrl || '';
      const liveCode =
        S.activeGeneratedPairCode && Number(S.activeGeneratedPairCode.expiresAt || 0) > Date.now()
          ? S.activeGeneratedPairCode
          : null;

      const hide3pSettings = S.isThirdPartyQuotaHidden();
      pairingGrid.innerHTML = `
        <div class="pairing-card claude-fleet-mode-card" id="settings-claude-mode-card">
          <div class="eyebrow">Fleet Claude Permission Mode</div>
          <p class="meta-timestamp" style="margin:6px 0">One tap switches Claude Code across every paired PC, phone CLI run, and open tab through THEO Store on Cloudflare. A PC that is offline picks up the new mode as soon as it reconnects.</p>
          ${S.renderClaudeModeSelectorHtml('settings')}
        </div>

        <div class="pairing-card" id="settings-agy-3p-quota-card">
          <div class="eyebrow">Antigravity Quota Display</div>
          <p class="meta-timestamp" style="margin:6px 0">Show Gemini models together with the separate Claude &amp; GPT third-party quota pool, or hide the third-party pool across all THEO views.</p>
          <div class="claude-mode-seg is-wide" role="group" aria-label="Antigravity third-party quota visibility">
            <button type="button" class="claude-mode-seg-btn${!hide3pSettings ? ' is-active' : ''}" data-toggle-3p-quota="show" aria-pressed="${!hide3pSettings ? 'true' : 'false'}">Gemini + Claude &amp; GPT</button>
            <button type="button" class="claude-mode-seg-btn${hide3pSettings ? ' is-active' : ''}" data-toggle-3p-quota="hide" aria-pressed="${hide3pSettings ? 'true' : 'false'}">Gemini Only</button>
          </div>
        </div>

        <div class="pairing-card">
          <div class="eyebrow">Fleet &amp; Device Pairing</div>
          <p class="meta-timestamp" style="margin:6px 0">Zero secrets in git/bundle. Pair iOS Home Screen apps via 6-digit code, browsers via 1-tap hash link, or new PCs via the visual <strong>Set Up This PC</strong> app.</p>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0">
            ${
              fleetDevices.length > 0
                ? fleetDevices
                    .map(
                      (d) =>
                        `<span class="sess-device-badge ${d.online ? 'is-online' : ''}">${d.online ? '●' : '◐'} ${S.esc(d.name || d.id)}${d.sessionCount ? ` (${d.sessionCount})` : ''}${S.renderFleetPcSetupPillHtml(d)}${S.renderFleetStalledWtPillHtml(d)}</span>`
                    )
                    .join('')
                : `<span class="meta-timestamp">${isPaired ? 'Probing connected hosts…' : 'Not paired yet: enter 6-digit code or paste Pair Link below'}</span>`
            }
          </div>
          ${
            liveCode
              ? `<div class="pair-code-live-banner mono">6-Digit Fleet Code: <strong>${S.esc(liveCode.formatted)}</strong> <span class="meta-timestamp">(10m single-use)</span></div>`
              : ''
          }
          <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
            <button type="button" class="btn-brass-sm" id="btn-gen-pair-code" aria-label="Generate 6-digit pairing code for iPhone or PC">6-Digit Pair Code</button>
            <button type="button" class="btn-ghost-sm" id="btn-download-pc-setup" data-download-pc-setup="1" aria-label="Download double-clickable Windows PC Setup app with single-use 6-digit code">Download PC Setup</button>
            <button type="button" class="btn-ghost-sm" id="btn-copy-mobile-pair" aria-label="Copy 1-tap mobile pairing URL">Copy Mobile Pair URL</button>
          </div>
          <label style="display:block;font-size:var(--fs-sm);margin-top:10px;color:var(--text-muted)">
            Pair via 6-Digit Code (from PC):
            <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">
              <input type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="24" class="input-field mono" id="input-pair-six-code" style="flex:1;min-width:140px" value="" placeholder="e.g. 482-917">
              <button type="button" class="btn-brass-sm" id="btn-claim-six-code">Connect Code</button>
            </div>
          </label>
          <label style="display:block;font-size:var(--fs-sm);margin-top:10px;color:var(--text-muted)">
            Or Paste <code>#pair=...</code> URL / Access Key:
            <input type="text" class="input-field mono pin-masked" id="input-pair-token" value="" placeholder="${isPaired ? 'Paired (paste new link to rotate)' : 'Paste #pair=... link or 64-hex key'}" autocomplete="off" spellcheck="false">
          </label>
          <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
            <button type="button" class="btn-ghost-sm" id="btn-apply-pair-token">Apply Pair Token</button>
            <button type="button" class="btn-ghost-sm" id="btn-copy-edge-deploy" aria-label="Copy Cloudflare Worker deploy command">Copy Edge Deploy Cmd</button>
          </div>
          <label style="display:block;font-size:var(--fs-sm);margin-top:10px;color:var(--text-muted)">
            Cloudflare Edge Relay URL (<code>wss://...</code>):
            <input type="url" class="input-field mono" id="input-edge-relay-url" value="${S.esc(effectiveEdgeUrl)}" placeholder="wss://theo-edge-relay.husseinbdeir.workers.dev/ws">
          </label>
          <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
            <button type="button" class="btn-ghost-sm" id="btn-save-edge-relay">Save Edge URL</button>
          </div>
        </div>

        <div class="pairing-card">
          <div class="eyebrow">Bridge Endpoints</div>
          <p class="meta-timestamp" style="margin:6px 0">Loopback WebSocket (<code>127.0.0.1:4318/ws</code>), Cloudflare Edge WS, and Cloud Relay backstop.</p>
          <div class="mono" style="font-size:var(--fs-sm);margin-top:8px">
            <div><strong>Hosted PWA:</strong> ${S.esc(pwaUrl)}</div>
            <div style="margin-top:4px"><strong>Local Bridge:</strong> ${S.esc(lanUrl)}</div>
          </div>
          <label style="display:block;font-size:var(--fs-sm);margin-top:10px;color:var(--text-muted)">
            Custom Direct Bridge URL (optional opt-in LAN / Tunnel):
            <input type="url" class="input-field mono" id="input-custom-bridge" value="${S.esc(S.prefs.customBridgeUrl || '')}" placeholder="http://127.0.0.1:4318">
          </label>
          <button type="button" class="btn-brass-sm" id="btn-save-bridge" style="margin-top:8px">Save &amp; Probe Bridge</button>
        </div>

        <div class="pairing-card">
          <div class="eyebrow">Security &amp; Cache</div>
          <p class="meta-timestamp" style="margin:6px 0">Protect remote mobile access with a SHA-256 4-digit PIN lock on launch.</p>
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
            <button type="button" class="btn-ghost-sm" id="btn-set-pin">${hasPin ? 'Change / Clear 4-Digit PIN' : 'Enable 4-Digit PIN Lock'}</button>
            <a href="reset.html" class="btn-ghost-sm" data-reset-theo-cache="1" style="text-decoration:none;display:inline-flex;align-items:center">Reset PWA Cache</a>
          </div>
          <div id="pin-inline-editor" class="pin-inline-editor" hidden>
            ${
              hasPin
                ? `<label style="font-size:var(--fs-sm);color:var(--text-muted)">Current 4-digit PIN (required):<input type="text" inputmode="numeric" maxlength="4" class="input-field pin-masked" id="input-pin-current" placeholder="••••" autocomplete="off"></label>`
                : ''
            }
            <label style="font-size:var(--fs-sm);color:var(--text-muted)">New 4-digit PIN ${hasPin ? '(leave empty to disable PIN)' : ''}:<input type="text" inputmode="numeric" maxlength="4" class="input-field pin-masked" id="input-pin-next" placeholder="4 digits" autocomplete="off"></label>
            <div class="pin-editor-row">
              <button type="button" class="btn-brass-sm" id="btn-pin-editor-save">Save PIN</button>
              <button type="button" class="btn-ghost-sm" id="btn-pin-editor-cancel">Cancel</button>
            </div>
          </div>
        </div>
      `;
    }
    });
  }

  let cmdPaletteMode = 'default';

  // Command Palette (⌘K)
  function openCommandPalette() {
    if (S.isPinLocked()) return;
    cmdPaletteMode = 'default';
    const modal = S.$('cmd-modal');
    const input = S.$('cmd-input');
    if (!modal || !input) return;
    const wasHidden = modal.hidden;
    modal.hidden = false;
    if (wasHidden) S.pushUiHistoryState('cmd-modal');
    input.placeholder = 'Jump to session, repo, or run a remote THEO command…';
    input.value = '';
    renderCommandPaletteResults('');
    setTimeout(() => input.focus(), 30);
  }

  function closeCommandPalette() {
    const modal = S.$('cmd-modal');
    if (modal) modal.hidden = true;
    cmdPaletteMode = 'default';
  }

  function renderCommandPaletteResults(query) {
    const resEl = S.$('cmd-results');
    if (!resEl) return;
    const q = query.trim().toLowerCase();

    if (cmdPaletteMode === 'repo-file') {
      const repoItems = [];
      for (const w of S.appState?.workspaces || []) {
        repoItems.push({
          title: `[${w.name}] Workspace Root`,
          sub: `${w.group || 'BHFIRMS'} · ⎇ ${w.branch || 'main'}${w.dirtyCount ? ` · ${w.dirtyCount} modified` : ''}`,
          repoLabel: `[${w.name}]`,
          repoPath: w.path || w.name
        });
        const det = S.workspacesDetailCache[w.id];
        if (det && Array.isArray(det.files)) {
          for (const f of det.files.slice(0, 20)) {
            const fPath = f.path || f.file || '';
            if (fPath) {
              repoItems.push({
                title: `[${w.name}] ${fPath}`,
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
      const matchedRepos = S.rankByFreq(
        rawMatchedRepos,
        'repos',
        (it) => String(it.repoLabel || '').replace(/^[\[]|[\]]$/g, '').split(' ')[0]
      );
      resEl.innerHTML = matchedRepos
        .slice(0, 16)
        .map(
          (it) => `
          <button type="button" class="cmd-item" data-cmd-attach-repo="${S.esc(it.repoLabel)}" data-cmd-repo-path="${S.esc(it.repoPath)}">
            <strong>${S.esc(it.title)}</strong>
            <span class="meta-timestamp">${S.esc(it.sub)}</span>
          </button>
        `
        )
        .join('');
      return;
    }

    const items = [
      { title: 'Attach File or Photo to Prompt', sub: 'Workbench Composer', act: 'attach-file' },
      { title: 'Attach Workspace / Modified Git File (@Repo)', sub: 'Workbench Composer', act: 'pick-repo-file' },
      ...(hasSignedInProviderRemote('antigravity')
        ? [{ title: '+ New Google Antigravity Session', sub: 'Action', act: 'new-agy' }]
        : []),
      ...(hasSignedInProviderRemote('claude')
        ? [{ title: '+ New Claude Code Session', sub: 'Action', act: 'new-claude' }]
        : []),
      { title: 'Open Pulse Overview (Approvals, Accounts & Quotas)', sub: 'View', act: 'tab-pulse' },
      { title: 'Open All Sessions (Filter, Search & Bulk Archive)', sub: 'View', act: 'tab-sessions' },
      { title: 'Open Repos & Git Inspector', sub: 'View', act: 'tab-workspaces' },
      { title: 'Open Settings & Fleet Pairing', sub: 'View', act: 'tab-analytics' },
      ...(() => {
        const curMode = S.getEffectiveClaudePermissionMode();
        return S.CLAUDE_PERM_MODES.map((m) => ({
          title: `${curMode === m.id ? '✓ ' : ''}Fleet Claude Mode: ${m.label}`,
          sub: `${curMode === m.id ? 'Active across all PCs · ' : ''}${m.desc}`,
          act: `claude-mode-${m.id === 'bypassPermissions' ? 'bypass' : m.id}`
        }));
      })(),
      { title: 'Sync with the PC & Cloud Relay Now', sub: 'Connectivity', act: 'sync' },
      { title: 'Open THEO Memory Vault (Reports, Notes & Docs)', sub: 'Cloudflare Vault · memory.husseinbdeir.workers.dev', act: 'open-memory-vault' },
      { title: `${S.isThirdPartyQuotaHidden() ? 'Show' : 'Hide'} Antigravity Claude & GPT Quota Pool`, sub: 'Quota Display', act: 'toggle-3p-quota' },
      { title: 'Toggle Split Inspector (Files & Preview, Git, Tasks & Outline)', sub: `Workbench · ${S.MOD_KEY}I`, act: 'inspector' },
      { title: 'Switch Color Palette (Graphite · Velvet · Espresso · Daylight)', sub: 'Appearance', act: 'palette' },
      { title: 'Enable / Test Web Push Notifications', sub: 'Notifications', act: 'push-test' },
      { title: 'Inspect Background Tasks & Subagents', sub: 'Workbench Overview', act: 'bgtasks' },
      { title: 'Run /compact on Active Session', sub: 'Context Window', act: 'compact' },
      { title: 'Pin / Unpin Active Chat in Session List', sub: 'Sessions', act: 'pin-chat' },
      { title: 'Switch Dark / Daylight Theme', sub: 'Appearance', act: 'theme' }
    ];

    for (const r of (S.appState?.rows || []).slice(0, 20)) {
      if (r.id) {
        items.push({
          title: r.title,
          sub: `${r.provider === 'claude' ? 'Claude Code' : 'Antigravity'} · ${r.folder || 'Session'}`,
          threadId: r.id
        });
      }
    }

    const CMD_VIEW_ROUTE_ACTS = new Set([
      'tab-pulse',
      'tab-sessions',
      'tab-workspaces',
      'tab-analytics'
    ]);
    const rawMatched = items.filter(
      (it) => !q || `${it.title} ${it.sub}`.toLowerCase().includes(q)
    );
    const matched = q
      ? (() => {
          const exact = rawMatched.filter((it) => String(it.title || '').toLowerCase() === q);
          const rest = rawMatched.filter((it) => String(it.title || '').toLowerCase() !== q);
          const freqOrdered = S.rankByFreq(
            rest,
            'threads',
            (it) => it.threadId || it.act || it.title
          );
          return exact.concat(freqOrdered).slice(0, 12);
        })()
      : (() => {
          const viewRoutes = S.rankByFreq(
            rawMatched.filter((it) => CMD_VIEW_ROUTE_ACTS.has(it.act)),
            'commands',
            (it) => it.act
          );
          const restItems = S.rankByFreq(
            rawMatched.filter((it) => !CMD_VIEW_ROUTE_ACTS.has(it.act)),
            'threads',
            (it) => it.threadId || it.act || it.title,
            (it) => Number(S.prefs.freqUsage?.commands?.[it.act] || 0) * 10
          );
          return viewRoutes.concat(restItems.slice(0, 10));
        })();

    resEl.innerHTML = matched
      .map(
        (it) => `
        <button type="button" class="cmd-item" data-cmd-act="${S.esc(it.act || '')}" data-cmd-thread="${S.esc(it.threadId || '')}">
          <strong>${S.esc(it.title)}</strong>
          <span class="meta-timestamp">${S.esc(it.sub)}</span>
        </button>
      `
      )
      .join('');
  }

  Object.assign(S, {
    cancelAllSessionBgTasks,
    cancelSingleBgTask,
    closeCommandPalette,
    closeNotifModal,
    fetchBgTaskLiveLog,
    formatGitDiffHtml,
    getBgKindLabel,
    getBgStateBadgeInfo,
    getOrderedPulseQuotaCards,
    getSessionBackgroundTasks,
    hasSignedInProviderRemote,
    isSessionGroupCollapsed,
    isSignedInQuotaCard,
    openCommandPalette,
    openNotifModal,
    renderAnalyticsView,
    renderChatBgTasks,
    renderCommandPaletteResults,
    renderNotifModal,
    renderPulseView,
    renderSessionsView,
    renderWorkspacesView,
    reorderPulseQuotaCard,
    syncProviderNewSessionButtons
  });
  Object.defineProperties(S, {
    cmdPaletteMode: { get: () => cmdPaletteMode, set: (v) => { cmdPaletteMode = v; }, enumerable: true, configurable: true }
  });

  });
})();
