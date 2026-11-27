(() => {
  'use strict';

  window.__theoRegisterModule('sidebar', (S) => {
  let pendingNewSessionBind = null;
  const closedEditorTabIds = new Set();

  function ensureEditorTabOpen(tid) {
    const clean = String(tid || '').trim();
    if (!clean || clean === '__new__') return;
    closedEditorTabIds.delete(clean);
    if (!Array.isArray(S.prefs.openEditorTabs)) S.prefs.openEditorTabs = [];
    if (!S.prefs.openEditorTabs.includes(clean)) {
      S.prefs.openEditorTabs.push(clean);
      if (S.prefs.openEditorTabs.length > 12) {
        const dropIdx = S.prefs.openEditorTabs.findIndex((id) => id !== clean && id !== S.prefs.selectedThreadId);
        if (dropIdx >= 0) S.prefs.openEditorTabs.splice(dropIdx, 1);
      }
      S.saveJson(S.STORAGE_KEYS.PREFS, S.prefs);
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
    if (S.prefs.lastReplyThreadId && rmSet.has(S.prefs.lastReplyThreadId)) {
      S.prefs.lastReplyThreadId = '';
    }
    const curList = Array.isArray(S.prefs.openEditorTabs) ? [...S.prefs.openEditorTabs] : [];
    const activeWasRemoved = Boolean(S.prefs.selectedThreadId && rmSet.has(S.prefs.selectedThreadId));
    const removedIdx = activeWasRemoved ? curList.indexOf(S.prefs.selectedThreadId) : -1;
    const nextList = curList.filter((id) => id && !rmSet.has(id));
    S.prefs.openEditorTabs = nextList;

    if (advanceIfActive && activeWasRemoved) {
      const nonArchived = (S.appState?.rows || []).filter(
        (r) => r && r.id && !r.draft && !r.archived && !rmSet.has(r.id) && !closedEditorTabIds.has(r.id)
      );
      const fallbackTabId =
        nextList.length > 0
          ? nextList[Math.max(0, Math.min(removedIdx, nextList.length - 1))]
          : nonArchived[0]?.id || '';
      if (fallbackTabId) {
        S.prefs.selectedThreadId = fallbackTabId;
        S.prefs.lastReplyThreadId = fallbackTabId;
        S.prefs.composerMode = 'reply';
        ensureEditorTabOpen(fallbackTabId);
        if (S.prefs.activeTab === 'chat') {
          S.fetchThreadDetail(fallbackTabId).catch(() => {});
        }
      } else {
        S.prefs.composerMode = S.hasSignedInProviderRemote('antigravity') ? 'new-antigravity' : 'new-claude';
        S.prefs.selectedThreadId = '__new__';
      }
    }
    S.saveJson(S.STORAGE_KEYS.PREFS, S.prefs);
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
    S.renderChatView(true);
    renderIdeSidebar();
  }

  function syncAndRenderEditorTabs() {
    const tabsEl = S.$('ide-editor-tabs');
    if (!tabsEl) return;
    const prevSerialized = JSON.stringify(S.prefs.openEditorTabs || []);
    const rows = (S.appState?.rows || []).filter((r) => r && r.id && !r.draft);
    const rowById = new Map(rows.map((r) => [r.id, r]));
    const isNewDraft = isNewSessionMode();

    let list = Array.isArray(S.prefs.openEditorTabs)
      ? Array.from(
          new Set(
            S.prefs.openEditorTabs
              .map((x) => (typeof x === 'string' || typeof x === 'number' ? String(x).trim() : ''))
              .filter((x) => x && x !== '__new__')
          )
        )
      : [];

    if (rows.length > 0) {
      list = list.filter((id) => {
        if (String(id).startsWith('draft-new-')) return Boolean(S.threadsCache[id]);
        const r = rowById.get(id);
        if (r) return !r.archived;
        return Boolean(id === S.prefs.selectedThreadId && S.threadsCache[id]);
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

    const curTid = String(S.prefs.selectedThreadId || '').trim();
    if (!isNewDraft && curTid && curTid !== '__new__') {
      const curRow = rowById.get(curTid);
      if (!curRow?.archived && !list.includes(curTid)) {
        list.push(curTid);
      }
    }

    if (list.length > 12) {
      list = list.filter((id, idx) => idx >= list.length - 12 || id === curTid).slice(-12);
    }
    S.prefs.openEditorTabs = list;
    if (JSON.stringify(list) !== prevSerialized) {
      S.saveJson(S.STORAGE_KEYS.PREFS, S.prefs);
    }

    const tabsHtml = list
      .map((id) => {
        const r = rowById.get(id) || S.threadsCache[id] || { id, title: 'Session', provider: 'antigravity' };
        const provKey = r.provider === 'claude' ? 'claude' : 'antigravity';
        const isActive = !isNewDraft && id === curTid;
        const isRunningNow = S.isSessionActivelyRunning(id);
        const qCnt = getSessionPendingQuestionCount(r);
        const stCls = isRunningNow
          ? 'working'
          : r.status === 'waiting' || qCnt > 0
            ? 'waiting'
            : r.unread
              ? 'unread'
              : '';
        const rawTitle = String(r.title || S.threadsCache[id]?.title || 'Untitled Session').trim();
        const bgInfo = r.bgTask?.state === 'running' ? getSessionRunningBgInfo(r) : null;
        return `
          <div class="ide-editor-tab${isActive ? ' active' : ''}${r.unread ? ' is-unread' : ''}" role="tab" tabindex="0" aria-selected="${isActive}" data-editor-tab-id="${S.esc(id)}" data-session-prov="${provKey}">
            ${stCls ? `<span class="ide-dot ${stCls}"></span>` : ''}
            <span class="prov-glyph">${S.PROVIDER_ICONS[provKey]}</span>
            <span class="ide-tab-title">${S.esc(rawTitle)}</span>
            ${qCnt > 0 ? `<span class="ide-row-pill q-pill tabular">${S.UI_ICONS.question}<span>${qCnt}</span></span>` : ''}
            ${bgInfo ? `<span class="ide-row-pill bg-pill tabular">${bgInfo.isAgent ? S.UI_ICONS.subagent : S.UI_ICONS.terminal}<span>${bgInfo.count}</span></span>` : ''}
            <button type="button" class="ide-tab-close" data-close-editor-tab="${S.esc(id)}" aria-label="Close ${S.esc(rawTitle)}">${S.UI_ICONS.close}</button>
          </div>
        `;
      })
      .join('');

    const newDraftProv = S.prefs.composerMode === 'new-claude' ? 'claude' : 'antigravity';
    const newDraftTabHtml = isNewDraft
      ? `
        <div class="ide-editor-tab active is-draft" role="tab" tabindex="0" aria-selected="true" data-editor-tab-id="__new__" data-session-prov="${newDraftProv}">
          <span class="prov-glyph">${S.PROVIDER_ICONS[newDraftProv]}</span>
          <span class="ide-tab-title">New ${newDraftProv === 'claude' ? 'Claude' : 'Antigravity'} Session</span>
          <button type="button" class="ide-tab-close" data-close-editor-tab="__new__" aria-label="Close new session draft">${S.UI_ICONS.close}</button>
        </div>
      `
      : '';

    tabsEl.innerHTML = tabsHtml + newDraftTabHtml;
  }

  function isSessionOpenTab(r) {
    const sid = String(r?.id || '').trim();
    if (!sid) return false;
    if (Array.isArray(S.prefs.openEditorTabs) && S.prefs.openEditorTabs.includes(sid)) {
      return true;
    }
    return Boolean(r?.open && !closedEditorTabIds.has(sid));
  }

  function getRowLastWorkedMs(r) {
    if (!r) return 0;
    const sid = String(r.id || '').trim();
    const overrideWorkMs = sid ? Number(pendingRowOverrides.get(sid)?.lastWorkedAt || 0) : 0;
    return Math.max(Number(r.at || 0), Number(r.lastWorkedAt || 0), overrideWorkMs);
  }

  function shortSidebarAge(ts) {
    const n = Number(ts || 0);
    if (!n) return '';
    const raw = String(S.timeAgo(n) || '').trim();
    if (!raw || raw === 'just now') return 'now';
    return raw.replace(/\s*ago$/i, '');
  }

  function getSessionPendingQuestionsMeta(r) {
    const sid = String(r?.id || '').trim();
    if (!sid) return null;
    const provKey = r?.provider === 'claude' ? 'claude' : 'antigravity';
    const sessMsgs = S.coalesceThreadMessages(S.threadsCache[sid]?.messages || []);
    const lastTurn = sessMsgs.length > 0 ? sessMsgs[sessMsgs.length - 1] : null;
    const lastTurnId = lastTurn && lastTurn.role === 'assistant' ? String(lastTurn.id || '') : '';
    const qApproval = (Array.isArray(S.appState?.approvals) ? S.appState.approvals : []).find(
      (a) =>
        a &&
        a.sessionId === sid &&
        (a.kind === 'question' ||
          Boolean(a.isToolPermission) ||
          /question/i.test(String(a.toolName || '')) ||
          (Array.isArray(a.questions) && a.questions.length > 0) ||
          (Array.isArray(a.options) && a.options.length > 0))
    );
    let qList = [];
    if (qApproval) {
      qList = S.resolveQuestionsForApproval(qApproval, sessMsgs);
    } else if (r?.pendingQuestion?.questions?.length) {
      qList = S.normalizeFrontendQuestions(r.pendingQuestion.questions);
    } else if (lastTurn && lastTurn.role === 'assistant') {
      const alreadySrvAns =
        Array.isArray(lastTurn.questions) && lastTurn.questions.some((q) => Boolean(q?.answered));
      if (!alreadySrvAns) {
        qList = S.resolveQuestionsForTurn(lastTurn, null).questions;
      }
    }
    if (!qList.length) return null;
    const answered = S.lookupAnsweredQuestionState({
      sessionId: sid,
      approvalId: qApproval?.approvalId || '',
      turnId: lastTurnId,
      questions: qList,
      isLastTurn: true
    });
    if (answered?.answered) return null;
    const cardKey = `q-side-${sid}-${qApproval?.approvalId || lastTurnId || 'active'}`;
    if (S.getQuestionDraft(cardKey).submitted) return null;
    return {
      cardKey,
      sessionId: sid,
      sessionTitle: String(r?.title || qApproval?.title || 'Session').trim(),
      provider: provKey,
      approvalId: qApproval?.approvalId || sid,
      turnId: lastTurnId,
      stepIndex: qApproval?.stepIndex ?? r?.pendingQuestion?.stepIndex ?? null,
      selector: qApproval?.selector || '',
      questions: qList
    };
  }

  function getSessionPendingQuestionCount(r) {
    const meta = getSessionPendingQuestionsMeta(r);
    return meta ? meta.questions.length : 0;
  }

  function getSessionRunningBgInfo(r) {
    if (!r?.id) return null;
    const { runningTasks, runningCount } = S.getSessionBackgroundTasks(r, S.threadsCache[r.id]);
    if (runningCount <= 0) return null;
    const isAgent = runningTasks.some((t) => t.kind === 'subagent');
    return { count: runningCount, isAgent };
  }

  function getSessionRunningBgBadge(r) {
    const info = getSessionRunningBgInfo(r);
    if (!info) return '';
    if (info.isAgent) return info.count > 1 ? `${info.count} Agents` : 'Agent';
    return info.count > 1 ? `${info.count} Tasks` : 'Task';
  }

  // Phase 2 State: Inline Account Edit, Add Account Tray, Details Modal, Host Health & Tree Reconciler
  let activeInlineAcctEdit = null; // { accountId, provider, surface: 'sidebar'|'pulse', value }
  let addAccountTrayState = null; // { provider: 'antigravity'|'claude', label: '', surface: 'tray'|'modal' }
  let activeIdeRename = null; // { kind: 'session'|'group', id, origText, el }
  let idePointerInsideTree = false;
  let ideMenuPinFreeze = false;
  let ideDeferredTreeOrderChanged = false;
  const ideFrozenOrderByGroup = new Map();

  function flushDeferredIdeTreeOrder() {
    if (!idePointerInsideTree && !ideMenuPinFreeze && !activeIdeRename && ideDeferredTreeOrderChanged) {
      ideDeferredTreeOrderChanged = false;
      ideFrozenOrderByGroup.clear();
      renderIdeSidebar();
    } else if (!idePointerInsideTree && !ideMenuPinFreeze && !activeIdeRename) {
      ideFrozenOrderByGroup.clear();
    }
  }

  function closeIdeContextMenu(skipFlush = false) {
    const ctxMenuEl = S.$('ide-context-menu');
    if (ctxMenuEl) {
      ctxMenuEl.hidden = true;
      ctxMenuEl.innerHTML = '';
    }
    if (ideMenuPinFreeze) {
      ideMenuPinFreeze = false;
      if (!skipFlush) flushDeferredIdeTreeOrder();
    }
  }

  function resolveLiveAccountHostForAdd() {
    const allDevs = S.getUnifiedFleetDevices();
    const acctHosts = allDevs.filter((d) => d && d.online && d.pwaReady && d.pwaReady.signIn);
    const acctFilterDev =
      S.prefs.selectedDeviceFilter && S.prefs.selectedDeviceFilter !== 'all'
        ? String(S.prefs.selectedDeviceFilter).trim()
        : '';
    return (
      acctHosts.find((d) => d.id === acctFilterDev) ||
      acctHosts.find((d) => S.localWsDevice?.id && d.id === S.localWsDevice.id) ||
      acctHosts[0] ||
      allDevs.find((d) => d && d.online && d.id === acctFilterDev) ||
      allDevs.find((d) => d && d.online) ||
      null
    );
  }

  function renderAddAccountTrayHtml(targetMode = 'tray') {
    const st = addAccountTrayState || { provider: 'antigravity', label: '', surface: targetMode };
    const host = resolveLiveAccountHostForAdd();
    const hostTxt = host ? `on ${host.name || host.id}` : 'No PC online';
    return `
      <form class="ide-add-account-form" data-add-acct-form="1">
        <div class="ide-add-tray-prov">
          <button type="button" class="ide-add-tray-tab${st.provider === 'antigravity' ? ' active' : ''}" data-add-tray-prov="antigravity">Antigravity</button>
          <button type="button" class="ide-add-tray-tab claude${st.provider === 'claude' ? ' active' : ''}" data-add-tray-prov="claude">Claude Code</button>
        </div>
        <input type="text" class="ide-add-tray-input" id="${targetMode === 'modal' ? 'acct-modal-add-label' : 'ide-add-tray-label'}" placeholder="Optional label (e.g. Work, Personal)" value="${S.esc(st.label || '')}" maxlength="32" autocomplete="off">
        <div class="ide-add-tray-actions">
          <span class="meta-timestamp" style="margin-right:auto;font-size:var(--fs-2xs)">${S.esc(hostTxt)}</span>
          <button type="button" class="btn-ghost-sm" data-add-tray-cancel="1">Cancel</button>
          <button type="submit" class="btn-brass-sm" ${host ? '' : 'disabled'}>Sign In</button>
        </div>
      </form>
    `;
  }

  function openAddAccountTray(defaultProv = '', opts = {}) {
    const host = resolveLiveAccountHostForAdd();
    if (!host) {
      S.showToast('A PC has to be online to add an account. Nothing was sent.');
      return;
    }
    const prov =
      defaultProv === 'claude'
        ? 'claude'
        : defaultProv === 'antigravity'
          ? 'antigravity'
          : addAccountTrayState?.provider || 'antigravity';
    const trayEl = S.$('ide-add-account-tray');
    const sidebarHost = trayEl?.closest('#ide-explorer-sidebar');
    const sidebarVisible = Boolean(
      trayEl &&
        sidebarHost &&
        getComputedStyle(sidebarHost).display !== 'none' &&
        !S.prefs.sidebarCollapsed &&
        !opts.preferModal
    );
    if (sidebarVisible) {
      const sec = S.$('ide-sec-accounts');
      if (sec) sec.open = true;
      addAccountTrayState = { provider: prov, label: '', surface: 'tray' };
      trayEl.innerHTML = renderAddAccountTrayHtml('tray');
      trayEl.hidden = false;
      setTimeout(() => S.$('ide-add-tray-label')?.focus(), 20);
      return;
    }
    addAccountTrayState = { provider: prov, label: '', surface: 'modal' };
    const modal = S.$('acct-signin-modal');
    const titleEl = S.$('acct-signin-title');
    const bodyEl = S.$('acct-signin-body');
    const dotEl = S.$('acct-signin-dot');
    if (modal && bodyEl) {
      if (titleEl) titleEl.textContent = 'Add an account';
      if (dotEl) dotEl.className = 'conn-dot is-live';
      bodyEl.innerHTML = renderAddAccountTrayHtml('modal');
      const wasHidden = modal.hidden;
      modal.hidden = false;
      if (wasHidden) S.pushUiHistoryState('acct-signin-modal');
      setTimeout(() => S.$('acct-modal-add-label')?.focus(), 20);
    }
  }

  function closeAddAccountTray() {
    const wasModal = addAccountTrayState?.surface === 'modal';
    addAccountTrayState = null;
    const trayEl = S.$('ide-add-account-tray');
    if (trayEl) {
      trayEl.hidden = true;
      trayEl.innerHTML = '';
    }
    if (wasModal && !S.acctSignIn) {
      const modal = S.$('acct-signin-modal');
      if (modal) modal.hidden = true;
    }
  }

  async function submitAddAccountTray() {
    if (!addAccountTrayState) return;
    const labelEl =
      addAccountTrayState.surface === 'modal'
        ? S.$('acct-modal-add-label')
        : S.$('ide-add-tray-label');
    const provider = addAccountTrayState.provider === 'claude' ? 'claude' : 'antigravity';
    const label = String(labelEl?.value ?? addAccountTrayState.label ?? '').trim();
    const acctHosts = S.getUnifiedFleetDevices().filter((d) => d && d.online && d.pwaReady && d.pwaReady.signIn);
    const acctFilterDev =
      S.prefs.selectedDeviceFilter && S.prefs.selectedDeviceFilter !== 'all'
        ? String(S.prefs.selectedDeviceFilter).trim()
        : '';
    const acctSignInHost =
      acctHosts.find((d) => d.id === acctFilterDev) ||
      acctHosts.find((d) => S.localWsDevice?.id && d.id === S.localWsDevice.id) ||
      acctHosts[0] ||
      null;
    const anyOnlineHost = S.getUnifiedFleetDevices().find((d) => d && d.online) || null;
    if (!acctSignInHost && !anyOnlineHost) {
      S.showToast('A PC has to be online to add an account. Nothing was sent.');
      return;
    }
    closeAddAccountTray();
    if (acctSignInHost) {
      S.startAccountSignIn(provider, label, acctSignInHost);
      return;
    }
    const acctRes = await S.dispatchRemoteCommand({
      type: 'sessionAction',
      action: 'accountAdd',
      subAction: 'accountAdd',
      provider,
      label,
      switchOnComplete: true
    }).catch(() => null);
    const acctProvName = provider === 'claude' ? 'Claude Code' : 'Antigravity';
    const acctReplyInfo = S.readDirectPcReply(acctRes);
    const acctReply = acctReplyInfo.reply || {};
    S.showToast(
      acctReplyInfo.mode === 'quarantined'
        ? `🔐 ${acctProvName} sign-in requested on the PC. Existing accounts stay signed in.`
        : acctReplyInfo.answered && acctReply.started === false
          ? String(acctReply.error || `The PC could not start the ${acctProvName} sign-in.`)
          : acctReplyInfo.answered
            ? `🔐 ${acctProvName} sign-in requested on the PC. Existing accounts stay signed in.`
            : `The PC did not answer directly. The ${acctProvName} sign-in opens there only if VS Code is running when the request arrives.`
    );
  }

  function renderIdePendingLoginBanner() {
    const slot = S.$('ide-pending-login-slot');
    if (!slot) return;
    const pl = S.appState?.pendingAccountLogin;
    const hasPending = Boolean(pl && pl.active);
    if (!hasPending) {
      slot.hidden = true;
      slot.innerHTML = '';
      return;
    }
    const provLabel = pl.provider === 'claude' ? 'Claude Code' : 'Antigravity';
    const labelBadge = pl.label ? ` (${S.esc(pl.label)})` : '';
    const msg =
      String(pl.error || pl.message || '').trim() ||
      (pl.awaitingCode
        ? 'Waiting for sign-in confirmation code.'
        : pl.awaitingVerification
          ? 'Waiting for browser verification.'
          : 'Sign-in in progress on PC.');
    slot.hidden = false;
    slot.innerHTML = `
      <div class="ide-pending-login-banner">
        <div class="ide-pending-login-head">
          <span>Signing in: ${S.esc(provLabel)}${labelBadge}</span>
        </div>
        <div class="ide-pending-login-copy">${S.esc(msg)}</div>
        <div class="ide-pending-login-acts">
          <button type="button" class="btn-brass-sm" data-pending-login-act="resume">Open Sign-In</button>
          <button type="button" class="btn-ghost-sm" data-pending-login-act="cancel">Cancel</button>
        </div>
      </div>
    `;
  }

  function openAccountDetailsModal() {
    const modal = S.$('acct-details-modal');
    if (!modal) return;
    renderAccountDetailsModal();
    const wasHidden = modal.hidden;
    modal.hidden = false;
    if (wasHidden) S.pushUiHistoryState('acct-details-modal');
  }

  function closeAccountDetailsModal() {
    const modal = S.$('acct-details-modal');
    if (modal) modal.hidden = true;
  }

  function renderAccountDetailsModal() {
    const bodyEl = S.$('acct-details-body');
    if (!bodyEl) return;
    const { ordered } = S.getOrderedPulseQuotaCards();
    const signedInRows = ordered.filter(({ acct }) => S.isSignedInQuotaCard(acct));
    const fleetHosts = S.getUnifiedFleetDevices();
    const hostListHtml = fleetHosts.length
      ? fleetHosts
          .map((d) => {
            const ps = d.pcSetup;
            const setupTxt = ps
              ? ps.ok || ps.pendingCount === 0
                ? `PC Setup ready (${ps.okCount}/${ps.totalCount})`
                : `${ps.pendingCount} setup update(s) pending`
              : 'Setup state pending';
            return `<div class="acct-details-meta">${d.online ? '●' : '○'} <strong>${S.esc(d.name || d.id)}</strong> · ${S.esc(setupTxt)}</div>`;
          })
          .join('')
      : '<div class="acct-details-meta">No paired host connected yet.</div>';

    const acctsHtml = signedInRows.length
      ? signedInRows
          .map(({ acct, provKey }) => {
            const label = provKey === 'claude' ? 'Claude Code' : 'Antigravity';
            const nick = String(acct?.nickname || acct?.account?.nickname || '').trim();
            const email = String(acct?.account?.email || acct?.email || '').trim();
            const plan = String(acct?.account?.plan || acct?.plan || (provKey === 'claude' ? 'Max' : 'Pro')).trim();
            const isActive = acct?.active !== false;
            const limits = acct?.usage?.limits?.length ? acct.usage.limits : acct?.usage?.allLimits || [];
            const limSummary = limits.length
              ? limits
                  .slice(0, 3)
                  .map((l) => `${String(l.label || '').trim()}: ${l.known === false ? '—' : `${Math.round(Number(l.pct ?? l.usedPercent ?? 0))}%`}`)
                  .join(' · ')
              : acct?.usageMessage || 'Window idle';
            return `
              <div class="acct-details-item">
                <div class="acct-details-top">
                  <span>${S.esc(label)}${nick ? ` · ${S.esc(nick)}` : ''}</span>
                  <span class="${isActive ? 'ide-acct-live-pill' : 'ide-plan-tag'}">${isActive ? '● Active' : 'Standby'}</span>
                </div>
                <div class="acct-details-meta">${email ? `${S.esc(email)} · ` : ''}${S.esc(plan)}</div>
                <div class="acct-details-meta">${S.esc(limSummary)}</div>
              </div>
            `;
          })
          .join('')
      : '<div class="acct-details-meta">No signed-in accounts synced yet.</div>';

    bodyEl.innerHTML = `
      <div class="acct-details-section">
        <div class="acct-details-heading">Connected accounts (${signedInRows.length})</div>
        ${acctsHtml}
      </div>
      <div class="acct-details-section">
        <div class="acct-details-heading">Host storage &amp; setup</div>
        <div class="acct-details-item">
          <div class="acct-details-meta">Tokens stay encrypted in host local vault storage; OAuth URLs and home paths are excluded from remote snapshots.</div>
          ${hostListHtml}
        </div>
      </div>
      <div class="acct-details-foot">
        <button type="button" class="btn-ghost-sm" data-acct-details-act="refresh">↻ Refresh Quotas</button>
        <button type="button" class="btn-brass-sm" data-acct-details-act="add">+ Add Account</button>
      </div>
    `;
  }

  function renderIdeHostHealthCards() {
    const stackEl = S.$('ide-host-health-stack');
    if (!stackEl) return;
    const devFilter =
      S.prefs.selectedDeviceFilter && S.prefs.selectedDeviceFilter !== 'all'
        ? S.prefs.selectedDeviceFilter
        : '';
    const fleet = S.getUnifiedFleetDevices();
    const targetHosts = devFilter
      ? fleet.filter((d) => d && d.id === devFilter)
      : fleet.filter((d) => d && (d.online || d.local));
    const primaryHost = targetHosts[0] || fleet[0] || null;
    const primaryId = primaryHost?.id || '';
    const cards = [];

    // 1. This PC setup updates (scan every matching host so healthy peer never hides sibling alerts)
    const multiHostLabel = (d) =>
      targetHosts.length > 1 && (d?.name || d?.id) ? `${d.name || d.id} · ` : '';
    const setupHosts = targetHosts.filter(
      (d) => d.pcSetup && !d.pcSetup.ok && Number(d.pcSetup.pendingCount || 0) > 0
    );
    if (
      setupHosts.length === 0 &&
      !devFilter &&
      S.appState?.pcSetup &&
      !S.appState.pcSetup.ok &&
      Number(S.appState.pcSetup.pendingCount || 0) > 0
    ) {
      setupHosts.push({
        id: primaryId,
        name: primaryHost?.name || 'This PC',
        pcSetup: S.appState.pcSetup,
        online: true,
        pwaReady: primaryHost?.pwaReady
      });
    }
    for (const setupHost of setupHosts) {
      const ps = setupHost.pcSetup;
      const hint =
        Array.isArray(ps.pendingTitles) && ps.pendingTitles.length
          ? ps.pendingTitles.slice(0, 2).join(', ')
          : `${ps.pendingCount} item(s) pending`;
      const canApply = Boolean(setupHost.online && setupHost.pwaReady);
      cards.push(`
        <div class="ide-health-card is-warn" data-health-kind="pc-setup">
          <div class="ide-health-head">
            <span>${S.esc(multiHostLabel(setupHost))}This PC · Setup Updates (${ps.okCount}/${ps.totalCount})</span>
          </div>
          <div class="ide-health-sub">${S.esc(hint)}</div>
          <div class="ide-health-acts">
            ${canApply ? S.renderApplyPcSetupButtonHtml(setupHost, 'ide-link-pill') : ''}
            <button type="button" class="ide-link-pill" data-host-act="checkPcSetup" data-device-id="${S.esc(setupHost.id || primaryId)}">Recheck</button>
          </div>
        </div>
      `);
    }

    // Read hot-swap hold, auto-reload, and bridge notices across ALL matching target hosts
    const healthSources = [];
    const seenHealthIds = new Set();
    for (const d of targetHosts) {
      if (d?.hostHealth) {
        seenHealthIds.add(d.id);
        healthSources.push({
          devId: d.id,
          prefix: multiHostLabel(d),
          hh: d.hostHealth
        });
      }
    }
    if (!devFilter && (S.appState?.hotSwapHold || S.appState?.autoReload || S.appState?.bridge)) {
      const topHh = {
        ...(S.appState.hotSwapHold ? { hotSwapHold: S.appState.hotSwapHold } : {}),
        ...(S.appState.autoReload ? { autoReload: S.appState.autoReload } : {}),
        ...(S.appState.bridge?.skipMessage || S.appState.bridge?.patchSkipNotice
          ? { skipMessage: S.appState.bridge.skipMessage || S.appState.bridge.patchSkipNotice }
          : {}),
        ...(S.appState.bridge?.attachFailed
          ? { attachFailed: true, bridgeMessage: S.appState.bridge.message || '' }
          : {})
      };
      if (!healthSources.length || (!seenHealthIds.has(primaryId) && (topHh.hotSwapHold?.held || topHh.autoReload || topHh.skipMessage || topHh.attachFailed))) {
        healthSources.push({ devId: primaryId, prefix: '', hh: topHh });
      }
    }

    for (const { devId: hhDevId, prefix, hh } of healthSources) {
      const hold = hh.hotSwapHold?.held ? hh.hotSwapHold : null;
      if (hold) {
        const holdLabel = hold.file || hold.stage || hold.version || '';
        cards.push(`
          <div class="ide-health-card is-crit" data-health-kind="hot-swap-hold">
            <div class="ide-health-head">
              <span>${S.esc(prefix)}THEO updates held${holdLabel ? ` (${S.esc(holdLabel)})` : ''}</span>
            </div>
            <div class="ide-health-sub">${S.esc(hold.error || hold.reason || 'A recent extension hot-swap failed verification.')}</div>
          </div>
        `);
      }

      const arRaw =
        hh.autoReload &&
        (hh.autoReload.pending || hh.autoReload.failure || hh.autoReload.pendingReload || hh.autoReload.canaryFailure)
          ? hh.autoReload
          : null;
      if (arRaw) {
        const isCanaryFail = Boolean(arRaw.failure || arRaw.canaryFailure || arRaw.state === 'failed');
        const arPending = Boolean(arRaw.pending ?? arRaw.pendingReload);
        const arReasons = Array.isArray(arRaw.reasons) && arRaw.reasons.length ? arRaw.reasons.join(' · ') : '';
        const arBlockers = Array.isArray(arRaw.blockers) && arRaw.blockers.length
          ? arRaw.blockers.map((b) => b.label || b.code).filter(Boolean).join(', ')
          : '';
        const arTitle = arPending
          ? `${prefix}THEO update ready`
          : isCanaryFail
            ? `${prefix}THEO auto-reload check failed`
            : `${prefix}THEO update status`;
        const arSub =
          arRaw.canaryFailure?.reason ||
          arRaw.reason ||
          arReasons ||
          (arBlockers ? `Waiting on: ${arBlockers}` : isCanaryFail ? 'Previous canary reload failed.' : 'Reload the VS Code window to finish applying the bundle.');
        cards.push(`
          <div class="ide-health-card ${isCanaryFail ? 'is-crit' : 'is-info'}" data-health-kind="auto-reload">
            <div class="ide-health-head">
              <span>${S.esc(arTitle)}</span>
            </div>
            <div class="ide-health-sub">${S.esc(arSub)}</div>
            <div class="ide-health-acts">
              <button type="button" class="ide-link-pill" data-host-act="reload" data-device-id="${S.esc(hhDevId)}">Reload Window</button>
              ${
                isCanaryFail
                  ? `<button type="button" class="ide-link-pill" data-host-act="dismissAutoReloadFailure" data-device-id="${S.esc(hhDevId)}">Dismiss</button>`
                  : ''
              }
            </div>
          </div>
        `);
      }

      const skipNotice =
        hh.skipMessage ||
        (hh.attachFailed ? hh.bridgeMessage || 'Bridge attach failed.' : '');
      if (skipNotice) {
        cards.push(`
          <div class="ide-health-card is-info" data-health-kind="patch-skip">
            <div class="ide-health-head">
              <span>${S.esc(prefix)}Bridge Notice</span>
            </div>
            <div class="ide-health-sub">${S.esc(skipNotice)}</div>
          </div>
        `);
      }
    }

    if (cards.length === 0) {
      stackEl.hidden = true;
      stackEl.innerHTML = '';
    } else {
      stackEl.hidden = false;
      stackEl.innerHTML = cards.join('');
    }
  }

  function finishIdeInlineRename(commit = true) {
    const st = activeIdeRename;
    if (!st) return;
    activeIdeRename = null;
    const { kind, id, origText, el } = st;
    if (el) {
      el.contentEditable = 'false';
      el.removeAttribute('spellcheck');
    }
    const rawNext = String(el?.textContent || '').replace(/\s+/g, ' ').trim();
    if (!commit || !rawNext || rawNext === origText) {
      if (el) el.textContent = origText;
      flushDeferredIdeTreeOrder();
      return;
    }
    if (el) el.textContent = rawNext;
    if (kind === 'session' || kind === 'chat-session') {
      const row = (S.appState?.rows || []).find((r) => r && r.id === id);
      if (row) {
        row.title = rawNext;
        noteRowOverride(id, { title: rawNext });
        S.persistCache();
      }
      renderIdeSidebar();
      S.renderSessionsView();
      if (S.prefs.selectedThreadId === id) S.renderChatView();
      S.dispatchRemoteCommand({
        type: 'sessionAction',
        action: 'rename',
        subAction: 'rename',
        id,
        name: rawNext,
        provider: row?.provider || 'antigravity',
        targetDeviceId: row?.deviceId || ''
      }).catch(() => {});
      S.showToast(`Renamed to "${rawNext}"`);
    } else if (kind === 'group') {
      noteGroupOverride(id, { op: 'rename', name: rawNext });
      const grpObj = (S.appState?.groups || []).find((g) => g && g.id === id);
      if (grpObj) {
        grpObj.name = rawNext;
        S.persistCache();
      }
      S.renderSessionsView();
      if (isNewSessionMode()) S.renderChatView();
      S.dispatchRemoteCommand({
        type: 'sessionAction',
        action: 'groupRename',
        subAction: 'groupRename',
        group: id,
        name: rawNext
      }).catch(() => {});
      S.showToast(`Renamed group to "${rawNext}"`);
    }
    flushDeferredIdeTreeOrder();
  }

  function beginIdeInlineRename(kind, id) {
    if (S.isPinLocked() || !id || id === '__new__') return false;
    if (activeIdeRename) finishIdeInlineRename(false);
    let targetEl = null;
    if (kind === 'chat-session') {
      targetEl = S.$('chat-session-title');
    } else {
      const treeEl = S.$('ide-sidebar-tree');
      if (!treeEl) return false;
      if (kind === 'session') {
        const rowEl = Array.from(treeEl.querySelectorAll('.ide-tree-row[data-ide-open-session]')).find(
          (n) => n.dataset.ideOpenSession === id
        );
        targetEl = rowEl?.querySelector('.ide-tree-title') || null;
      } else if (kind === 'group') {
        const grpEl = Array.from(treeEl.querySelectorAll('.ide-tree-group[data-ide-group]')).find(
          (n) => n.dataset.ideGroup === id
        );
        targetEl = grpEl?.querySelector('.ide-tree-group-name') || null;
      }
    }
    if (!targetEl) return false;
    const origText = String(targetEl.textContent || '').trim();
    activeIdeRename = { kind, id, origText, el: targetEl };
    targetEl.contentEditable = 'true';
    targetEl.setAttribute('spellcheck', 'false');
    targetEl.focus();
    try {
      const range = document.createRange();
      range.selectNodeContents(targetEl);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    } catch {}
    return true;
  }

  function openAccountContextMenu(accountId, provKey, clientX, clientY) {
    if (S.isPinLocked() || !accountId) return;
    const menuEl = S.$('ide-context-menu');
    if (!menuEl) return;
    S.hideIdeMicroTip();
    const { ordered } = S.getOrderedPulseQuotaCards();
    const idx = ordered.findIndex((x) => x.id === accountId);
    const entry = idx >= 0 ? ordered[idx] : null;
    if (!entry) return;
    const { acct } = entry;
    const prov = provKey === 'claude' ? 'claude' : 'antigravity';
    const isActive = acct?.active !== false;
    const email = String(acct?.account?.email || acct?.email || '').trim();
    const nick = String(acct?.nickname || acct?.account?.nickname || '').trim();
    const signedInCount = ordered.filter((x) => x.provKey === prov && S.isSignedInQuotaCard(x.acct)).length;
    const canUp = ordered.length > 1 && idx > 0;
    const canDown = ordered.length > 1 && idx < ordered.length - 1;
    menuEl.innerHTML = `
      ${
        !isActive
          ? `<button type="button" class="ctx-menu-item" data-acct-menu-act="switch" data-account-id="${S.esc(accountId)}" data-account-prov="${prov}"><span class="ctx-menu-label"><span class="ctx-menu-ico">${S.UI_ICONS.swap}</span><span>Set Active Account</span></span></button>`
          : ''
      }
      <button type="button" class="ctx-menu-item" data-acct-menu-act="new-session" data-account-id="${S.esc(accountId)}" data-account-prov="${prov}">
        <span class="ctx-menu-label"><span class="ctx-menu-ico">${S.UI_ICONS.plus}</span><span>New Session with Account</span></span>
      </button>
      <button type="button" class="ctx-menu-item" data-acct-menu-act="label" data-account-id="${S.esc(accountId)}" data-account-prov="${prov}" data-account-nick="${S.esc(nick)}">
        <span class="ctx-menu-label"><span class="ctx-menu-ico">${S.UI_ICONS.pencil}</span><span>Edit Label…</span></span>
      </button>
      ${canUp ? `<button type="button" class="ctx-menu-item" data-account-move="up" data-account-id="${S.esc(accountId)}" data-account-prov="${prov}"><span class="ctx-menu-label"><span class="ctx-menu-ico">${S.UI_ICONS.arrowUp}</span><span>Move Up</span></span></button>` : ''}
      ${canDown ? `<button type="button" class="ctx-menu-item" data-account-move="down" data-account-id="${S.esc(accountId)}" data-account-prov="${prov}"><span class="ctx-menu-label"><span class="ctx-menu-ico">${S.UI_ICONS.arrowDown}</span><span>Move Down</span></span></button>` : ''}
      <button type="button" class="ctx-menu-item" data-acct-menu-act="refresh" data-account-id="${S.esc(accountId)}" data-account-prov="${prov}">
        <span>Refresh Quotas</span>
      </button>
      <button type="button" class="ctx-menu-item" data-acct-menu-act="details" data-account-id="${S.esc(accountId)}" data-account-prov="${prov}">
        <span>Details &amp; Storage…</span>
      </button>
      <button type="button" class="ctx-menu-item danger" data-account-remove="${S.esc(accountId)}" data-account-prov="${prov}" data-account-email="${S.esc(email)}">
        <span class="ctx-menu-label"><span class="ctx-menu-ico">${S.UI_ICONS.trash}</span><span>${signedInCount <= 1 ? 'Sign Out Account' : 'Disconnect Account'}</span></span>
      </button>
    `;
    menuEl.hidden = false;
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 800;
    const rect = menuEl.getBoundingClientRect();
    menuEl.style.left = `${Math.max(8, Math.min(clientX, vw - (rect.width || 210) - 8))}px`;
    menuEl.style.top = `${Math.max(8, Math.min(clientY, vh - (rect.height || 240) - 8))}px`;
  }

  function openGroupContextMenu(groupId, clientX, clientY) {
    if (S.isPinLocked() || !groupId) return;
    const grp = (S.appState?.groups || []).find((g) => g && g.id === groupId);
    if (!grp) return;
    const menuEl = S.$('ide-context-menu');
    if (!menuEl) return;
    S.hideIdeMicroTip();
    const hoverCard = S.$('ide-hover-card');
    if (hoverCard) hoverCard.hidden = true;
    ideMenuPinFreeze = true;
    menuEl.innerHTML = `
      <button type="button" class="ctx-menu-item" data-group-act="new-in-group" data-group-id="${S.esc(grp.id)}">
        <span class="ctx-menu-label"><span class="ctx-menu-ico">${S.UI_ICONS.plus}</span><span>New Session in Group</span></span>
      </button>
      <button type="button" class="ctx-menu-item" data-group-act="rename" data-group-id="${S.esc(grp.id)}" data-group-name="${S.esc(grp.name || '')}">
        <span class="ctx-menu-label"><span class="ctx-menu-ico">${S.UI_ICONS.pencil}</span><span>Rename Group</span></span><span class="meta-timestamp">F2</span>
      </button>
      <button type="button" class="ctx-menu-item danger" data-group-act="delete" data-group-id="${S.esc(grp.id)}" data-group-name="${S.esc(grp.name || '')}">
        <span class="ctx-menu-label"><span class="ctx-menu-ico">${S.UI_ICONS.trash}</span><span>Delete Group</span></span>
      </button>
    `;
    menuEl.hidden = false;
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 800;
    const rect = menuEl.getBoundingClientRect();
    menuEl.style.left = `${Math.max(8, Math.min(clientX, vw - (rect.width || 210) - 8))}px`;
    menuEl.style.top = `${Math.max(8, Math.min(clientY, vh - (rect.height || 180) - 8))}px`;
  }

  function openSessionContextMenu(sessionId, clientX, clientY) {
    if (S.isPinLocked() || !sessionId) return;
    const menuEl = S.$('ide-context-menu');
    if (!menuEl) return;
    S.hideIdeMicroTip();
    const hoverCard = S.$('ide-hover-card');
    if (hoverCard) hoverCard.hidden = true;
    const r = (S.appState?.rows || []).find((x) => x && x.id === sessionId);
    if (!r) return;
    ideMenuPinFreeze = true;
    const provKey = r.provider === 'claude' ? 'claude' : 'antigravity';
    const isRunning = S.isSessionActivelyRunning(r.id);
    const isPinnedBg = S.prefs.pinnedBgSessionId === r.id;
    const hasCustomGroup = Boolean(
      r.group && (S.appState?.groups || []).some((g) => g && g.id === r.group)
    );
    // "Reveal in VS Code" is offered only when connected and that host reports VS Code open and online.
    const canRevealInVsCode = S.isHostVsCodeOpenForSession(r, false);
    menuEl.innerHTML = `
      <button type="button" class="ctx-menu-item" data-ctx-menu-act="open" data-id="${S.esc(r.id)}" data-prov="${provKey}">
        <span>Open in Workbench</span><span class="meta-timestamp">↵</span>
      </button>
      <button type="button" class="ctx-menu-item" data-ctx-menu-act="rename" data-id="${S.esc(r.id)}" data-prov="${provKey}">
        <span class="ctx-menu-label"><span class="ctx-menu-ico">${S.UI_ICONS.pencil}</span><span>Rename Session</span></span><span class="meta-timestamp">F2</span>
      </button>
      <button type="button" class="ctx-menu-item" data-ctx-menu-act="inspect-outline" data-id="${S.esc(r.id)}" data-prov="${provKey}">
        <span>Inspect Outline &amp; Files</span><span class="meta-timestamp">${S.MOD_KEY}I</span>
      </button>
      <button type="button" class="ctx-menu-item" data-ctx-menu-act="pin-bg" data-id="${S.esc(r.id)}">
        <span>${isPinnedBg ? 'Unpin Side Agents' : 'Pin Side Agents in Sidebar'}</span>
      </button>
      ${
        canRevealInVsCode
          ? `<button type="button" class="ctx-menu-item" data-ctx-menu-act="open-vscode" data-id="${S.esc(r.id)}" data-prov="${provKey}">
        <span>Reveal in Desktop VS Code</span>
      </button>`
          : ''
      }
      <button type="button" class="ctx-menu-item" data-sess-act="pin" data-id="${S.esc(r.id)}" data-val="${S.isRowPinned(r) ? 'false' : 'true'}">
        <span>${S.isRowPinned(r) ? 'Unpin Chat' : 'Pin Chat'}</span>
      </button>
      <button type="button" class="ctx-menu-item" data-sess-act="group" data-id="${S.esc(r.id)}">
        <span>Move to Group…</span>
      </button>
      ${
        hasCustomGroup && !r.archived
          ? `<button type="button" class="ctx-menu-item" data-sess-act="group-remove" data-id="${S.esc(r.id)}"><span>Remove from Group</span></button>`
          : ''
      }
      <button type="button" class="ctx-menu-item" data-sess-act="unread" data-id="${S.esc(r.id)}" data-val="${r.unread ? 'false' : 'true'}">
        <span>${r.unread ? 'Mark as Read' : 'Mark as Unread'}</span>
      </button>
      ${
        isRunning
          ? `<button type="button" class="ctx-menu-item danger" data-sess-act="stop" data-id="${S.esc(r.id)}"><span class="ctx-menu-label"><span class="ctx-menu-ico">${S.UI_ICONS.stop}</span><span>Stop Running Session</span></span></button>`
          : ''
      }
      <button type="button" class="ctx-menu-item${r.archived ? '' : ' danger'}" data-sess-act="archive" data-id="${S.esc(r.id)}" data-val="${r.archived ? 'false' : 'true'}">
        <span class="ctx-menu-label"><span class="ctx-menu-ico">${r.archived ? S.UI_ICONS.restore : S.UI_ICONS.archive}</span><span>${r.archived ? 'Restore Session' : 'Archive Session'}</span></span>
      </button>
    `;
    menuEl.hidden = false;
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 800;
    const rect = menuEl.getBoundingClientRect();
    const left = Math.max(8, Math.min(clientX, vw - (rect.width || 210) - 8));
    const top = Math.max(8, Math.min(clientY, vh - (rect.height || 240) - 8));
    menuEl.style.left = `${left}px`;
    menuEl.style.top = `${top}px`;
  }

  function showSidebarHoverCard(rowEl) {
    if (S.isPinLocked() || !rowEl || window.innerWidth <= 1024) return;
    const ctxMenu = S.$('ide-context-menu');
    if (ctxMenu && !ctxMenu.hidden) return;
    const sid = rowEl.dataset.ideOpenSession;
    const card = S.$('ide-hover-card');
    if (!sid || !card) return;
    const r = (S.appState?.rows || []).find((x) => x && x.id === sid);
    if (!r) return;
    const td = S.threadsCache[sid];
    const msgs = S.coalesceThreadMessages(td?.messages || []);
    const lastAsst = [...msgs].reverse().find((m) => m && m.role === 'assistant' && m.text);
    const snippet = String(lastAsst?.text || r.preview || r.summary || '')
      .replace(/```[\s\S]*?```/g, '[code]')
      .replace(/[#*`_>\[\]]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180);
    const { runningCount, totalCount } = S.getSessionBackgroundTasks(r, td);
    const qCnt = getSessionPendingQuestionCount(r);
    card.innerHTML = `
      <div class="hc-title">${S.esc(r.title || 'Untitled Session')}</div>
      <div class="hc-meta tabular">
        <span>${r.provider === 'claude' ? 'Claude Code' : 'Antigravity'}</span>
        ${r.folder ? `<span>· ${S.esc(r.folder)}</span>` : ''}
        ${r.branch ? `<span>· ⎇ ${S.esc(r.branch)}</span>` : ''}
        ${r.at ? `<span>· ${S.esc(S.timeAgo(r.at))}</span>` : ''}
      </div>
      ${
        qCnt > 0 || runningCount > 0 || totalCount > 0
          ? `<div class="hc-meta tabular">${qCnt > 0 ? `<span style="color:var(--amber)">? ${qCnt} Question${qCnt > 1 ? 's' : ''}</span>` : ''}${runningCount > 0 ? `<span style="color:var(--emerald)">● ${runningCount} Live Agent/Task</span>` : totalCount > 0 ? `<span>${totalCount} Side Agent/Task</span>` : ''}</div>`
          : ''
      }
      ${snippet ? `<div class="hc-snippet">${S.esc(snippet)}</div>` : ''}
    `;
    card.hidden = false;
    const rRect = rowEl.getBoundingClientRect();
    const vh = window.innerHeight || 800;
    const vw = window.innerWidth || 1280;
    const left = Math.min(vw - 304, Math.max(12, rRect.right + 10));
    const top = Math.min(vh - 150, Math.max(12, rRect.top - 4));
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  function renderCollapsedGroupPinBadgeHtml(items, isCollapsed, clsName) {
    if (!isCollapsed || !Array.isArray(items) || items.length === 0) return '';
    const cnt = items.filter((r) => r && r.id && S.isRowPinned(r)).length;
    if (cnt <= 0) return '';
    const tip = cnt === 1 ? '1 pinned chat' : `${cnt} pinned chats`;
    return `<span class="${clsName} tabular" role="img" aria-label="${tip}" data-micro-tip="${tip}">${S.PIN_FILLED_SVG}<span>${cnt}</span></span>`;
  }

  function applyFrozenIdeOrder(secKey, rows, qActive) {
    const freezeOn = Boolean((idePointerInsideTree || ideMenuPinFreeze || activeIdeRename) && !qActive);
    if (!freezeOn) {
      ideFrozenOrderByGroup.set(secKey, rows.map((r) => r.id));
      return rows;
    }
    const frozenIds = ideFrozenOrderByGroup.get(secKey);
    if (!frozenIds || frozenIds.length === 0) {
      ideFrozenOrderByGroup.set(secKey, rows.map((r) => r.id));
      return rows;
    }
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = [];
    const seen = new Set();
    for (const id of frozenIds) {
      if (byId.has(id) && !seen.has(id)) {
        ordered.push(byId.get(id));
        seen.add(id);
      }
    }
    for (const r of rows) {
      if (!seen.has(r.id)) {
        ordered.push(r);
        seen.add(r.id);
      }
    }
    const liveIds = rows.map((r) => r.id);
    const frozenOutIds = ordered.map((r) => r.id);
    if (
      liveIds.length !== frozenOutIds.length ||
      liveIds.some((id, idx) => id !== frozenOutIds[idx])
    ) {
      ideDeferredTreeOrderChanged = true;
    }
    return ordered;
  }

  function buildIdeTreeRowInnerHtml(r, provKey, dotCls, isPinnedRow, qCnt, bgInfo, age, isOpenTab) {
    const isArc = Boolean(r.archived);
    const isDesktop = S.isClaudeDesktopRow(r);
    return `
      <span class="ide-dot ${dotCls}"></span>
      <span class="prov-glyph">${S.PROVIDER_ICONS[provKey]}</span>
      ${
        isPinnedRow
          ? `<span class="ide-pin-ind" aria-label="Pinned chat">${S.PIN_FILLED_SVG}</span>`
          : ''
      }
      <span class="ide-tree-title">${S.esc(r.title || 'Untitled Session')}</span>
      ${
        isDesktop
          ? `<span class="session-origin-pill" aria-label="Claude Desktop session">Desktop</span>`
          : ''
      }
      ${
        !isArc && provKey === 'antigravity' && (r.neonWarning || /neon/i.test(String(r.model || '')))
          ? `<button type="button" class="session-neon-pill" data-switch-neon-carbon="${S.esc(r.id)}" data-micro-tip="Switch session from Neon to Carbon" aria-label="Neon model active — switch to Carbon">Neon</button>`
          : ''
      }
      ${qCnt > 0 ? `<span class="ide-row-pill q-pill tabular">${S.UI_ICONS.question}<span>${qCnt}</span></span>` : ''}
      ${bgInfo ? `<span class="ide-row-pill bg-pill tabular">${bgInfo.isAgent ? S.UI_ICONS.subagent : S.UI_ICONS.terminal}<span>${bgInfo.count}</span></span>` : ''}
      <span class="ide-tree-age tabular">${S.esc(age)}</span>
      <span class="ide-tree-acts">
        ${
          dotCls === 'working'
            ? `<button type="button" class="ide-row-act stop" data-sess-act="stop" data-id="${S.esc(r.id)}" data-micro-tip="Stop session" aria-label="Stop session">${S.UI_ICONS.stop}</button>`
            : ''
        }
        ${
          isOpenTab
            ? `<button type="button" class="ide-row-act close-tab" data-close-editor-tab="${S.esc(r.id)}" data-micro-tip="Close open tab" aria-label="Close open tab">${S.UI_ICONS.close}</button>`
            : ''
        }
        ${
          !isArc
            ? `<button type="button" class="ide-row-act pin-act${isPinnedRow ? ' active' : ''}" data-sess-act="pin" data-id="${S.esc(r.id)}" data-val="${isPinnedRow ? 'false' : 'true'}" data-micro-tip="${isPinnedRow ? 'Unpin chat' : 'Pin chat'}" aria-pressed="${isPinnedRow}" aria-label="${isPinnedRow ? 'Unpin chat' : 'Pin chat'}">${isPinnedRow ? S.PIN_FILLED_SVG : S.PIN_OUTLINE_SVG}</button>`
            : ''
        }
        <button type="button" class="ide-row-act" data-sess-inline-rename="1" data-id="${S.esc(r.id)}" data-micro-tip="Rename session (F2)" aria-label="Rename session">${S.UI_ICONS.pencil}</button>
        <button type="button" class="ide-row-act" data-sess-ctx-menu="${S.esc(r.id)}" data-micro-tip="Session actions" aria-label="Session actions">${S.UI_ICONS.more}</button>
        <button type="button" class="ide-row-act" data-sess-act="archive" data-id="${S.esc(r.id)}" data-val="${isArc ? 'false' : 'true'}" data-micro-tip="${isArc ? 'Restore session' : 'Archive session'}" aria-label="${isArc ? 'Restore session' : 'Archive session'}">${isArc ? S.UI_ICONS.restore : S.UI_ICONS.archive}</button>
      </span>
    `;
  }

  function patchIdeTreeRowNode(rowEl, r, curSelected) {
    const provKey = r.provider === 'claude' ? 'claude' : 'antigravity';
    const isSelected = r.id === curSelected;
    const isRunningNow = S.isSessionActivelyRunning(r.id);
    const isOpenTab = isSessionOpenTab(r);
    const isPinnedRow = S.isRowPinned(r);
    const qCnt = getSessionPendingQuestionCount(r);
    const dotCls = isRunningNow
      ? 'working'
      : r.status === 'waiting' || qCnt > 0
        ? 'waiting'
        : r.unread
          ? 'unread'
          : isOpenTab
            ? 'open'
            : 'closed';
    const age = shortSidebarAge(getRowLastWorkedMs(r));
    const bgInfo = r.bgTask?.state === 'running' ? getSessionRunningBgInfo(r) : null;
    const bgSig = bgInfo ? `${bgInfo.count}:${bgInfo.isAgent ? 1 : 0}` : '';
    const isArc = Boolean(r.archived);
    const desiredClass = `ide-tree-row${isSelected ? ' active' : ''}${isPinnedRow ? ' is-pinned' : ''}${isOpenTab ? ' is-open-tab' : ''}${r.unread ? ' is-unread' : ''}${isArc ? ' is-archived' : ''}`;
    if (rowEl.className !== desiredClass) rowEl.className = desiredClass;
    if (rowEl.getAttribute('role') !== 'button') rowEl.setAttribute('role', 'button');
    if (rowEl.getAttribute('tabindex') !== '0') rowEl.setAttribute('tabindex', '0');
    if (rowEl.dataset.ideOpenSession !== r.id) rowEl.dataset.ideOpenSession = r.id;
    if (rowEl.dataset.sessionProv !== provKey) rowEl.dataset.sessionProv = provKey;

    if (activeIdeRename && activeIdeRename.kind === 'session' && activeIdeRename.id === r.id) {
      return;
    }

    const neon = Boolean(
      !isArc && provKey === 'antigravity' && (r.neonWarning || /neon/i.test(String(r.model || '')))
    );
    const desk = S.isClaudeDesktopRow(r);
    const sig = `${provKey}|${dotCls}|${isPinnedRow ? 1 : 0}|${r.title || ''}|${desk ? 1 : 0}|${neon ? 1 : 0}|${qCnt}|${bgSig}|${age}|${isOpenTab ? 1 : 0}|${isArc ? 1 : 0}|${r.unread ? 1 : 0}`;
    if (rowEl.dataset.rowRenderSig !== sig) {
      rowEl.dataset.rowRenderSig = sig;
      rowEl.innerHTML = buildIdeTreeRowInnerHtml(
        r,
        provKey,
        dotCls,
        isPinnedRow,
        qCnt,
        bgInfo,
        age,
        isOpenTab
      );
    }
  }

  function reconcileIdeRowsContainer(itemsEl, rows, curSelected) {
    const existingById = new Map();
    for (const child of Array.from(itemsEl.children)) {
      const sid = child.dataset?.ideOpenSession;
      if (child.classList?.contains('ide-tree-row') && sid) {
        existingById.set(sid, child);
      } else {
        child.remove();
      }
    }
    const wantIds = new Set(rows.map((r) => r.id));
    for (const [sid, el] of existingById.entries()) {
      if (!wantIds.has(sid)) {
        el.remove();
        existingById.delete(sid);
      }
    }
    rows.forEach((r, idx) => {
      let rowEl = existingById.get(r.id);
      if (!rowEl) {
        rowEl = document.createElement('div');
      }
      patchIdeTreeRowNode(rowEl, r, curSelected);
      const curAtIdx = itemsEl.children[idx];
      if (curAtIdx !== rowEl) {
        itemsEl.insertBefore(rowEl, curAtIdx || null);
      }
    });
  }

  function reconcileIdeTreeDOM(treeEl, groupSpecs, flatRows, curSelected) {
    if (!groupSpecs) {
      const sliceRows = Array.isArray(flatRows) ? flatRows : [];
      if (sliceRows.length === 0) return;
      for (const ch of Array.from(treeEl.children)) {
        if (!ch.classList?.contains('ide-tree-group-items') || ch.dataset?.flatRoot !== '1') {
          ch.remove();
        }
      }
      let flatContainer = treeEl.firstElementChild;
      if (!flatContainer || !flatContainer.classList.contains('ide-tree-group-items')) {
        flatContainer = document.createElement('div');
        flatContainer.className = 'ide-tree-group-items';
        flatContainer.dataset.flatRoot = '1';
        treeEl.appendChild(flatContainer);
      }
      reconcileIdeRowsContainer(flatContainer, sliceRows, curSelected);
      return;
    }

    const existingGroups = new Map();
    for (const ch of Array.from(treeEl.children)) {
      const gid = ch.dataset?.ideGroup;
      if (ch.classList?.contains('ide-tree-group') && gid) {
        existingGroups.set(gid, ch);
      } else {
        ch.remove();
      }
    }
    const wantKeys = new Set(groupSpecs.map((s) => s.key));
    for (const [gid, el] of existingGroups.entries()) {
      if (!wantKeys.has(gid)) {
        el.remove();
        existingGroups.delete(gid);
      }
    }

    groupSpecs.forEach((spec, gIdx) => {
      let grpEl = existingGroups.get(spec.key);
      if (!grpEl) {
        grpEl = document.createElement('div');
        grpEl.className = `ide-tree-group${spec.collapsed ? ' collapsed' : ''}`;
        grpEl.dataset.ideGroup = spec.key;
        grpEl.innerHTML = `
          <div class="ide-tree-group-hdr">
            <button type="button" class="ide-tree-group-btn" data-group-act="toggle" data-group-id="${S.esc(spec.key)}" aria-expanded="${!spec.collapsed}">
              <span class="ide-chevron-sm"></span>
              <span class="ide-tree-group-name"></span>
              <span class="ide-group-pin-slot"></span>
            </button>
            <div class="ide-tree-group-acts"></div>
            <span class="ide-group-pill tabular"></span>
          </div>
          <div class="ide-tree-group-items"></div>
        `;
      }
      const wantGrpCls = `ide-tree-group${spec.collapsed ? ' collapsed' : ''}`;
      if (grpEl.className !== wantGrpCls) grpEl.className = wantGrpCls;
      if (grpEl.dataset.ideGroup !== spec.key) grpEl.dataset.ideGroup = spec.key;

      const hdrBtn = grpEl.querySelector(':scope > .ide-tree-group-hdr > .ide-tree-group-btn');
      if (hdrBtn) {
        hdrBtn.setAttribute('aria-expanded', spec.collapsed ? 'false' : 'true');
        hdrBtn.dataset.groupId = spec.key;
        const chevEl = hdrBtn.querySelector('.ide-chevron-sm');
        const wantChev = spec.collapsed ? S.CHEVRON_RIGHT_SVG : S.CHEVRON_DOWN_SVG;
        if (chevEl && chevEl.dataset.chevDir !== (spec.collapsed ? 'r' : 'd')) {
          chevEl.dataset.chevDir = spec.collapsed ? 'r' : 'd';
          chevEl.innerHTML = wantChev;
        }
        const nameEl = hdrBtn.querySelector('.ide-tree-group-name');
        if (nameEl && !(activeIdeRename && activeIdeRename.kind === 'group' && activeIdeRename.id === spec.key)) {
          if (nameEl.textContent !== spec.name) nameEl.textContent = spec.name;
        }
        const pinSlot = hdrBtn.querySelector('.ide-group-pin-slot');
        const wantPinHtml = renderCollapsedGroupPinBadgeHtml(
          spec.items,
          spec.collapsed,
          'ide-group-pin-badge'
        );
        if (pinSlot && pinSlot.dataset.pinSig !== wantPinHtml) {
          pinSlot.dataset.pinSig = wantPinHtml;
          pinSlot.innerHTML = wantPinHtml;
        }
      }
      const pillEl = grpEl.querySelector(':scope > .ide-tree-group-hdr > .ide-group-pill');
      const countTxt = String(spec.items.length);
      if (pillEl && pillEl.textContent !== countTxt) pillEl.textContent = countTxt;

      const actsEl = grpEl.querySelector(':scope > .ide-tree-group-hdr > .ide-tree-group-acts');
      if (actsEl) {
        const wantActsHtml = spec.actionsHtml || '';
        const pinnedCls = `ide-tree-group-acts${spec.alwaysShowActions ? ' is-pinned-visible' : ''}`;
        if (actsEl.className !== pinnedCls) actsEl.className = pinnedCls;
        if (actsEl.dataset.actsSig !== wantActsHtml) {
          actsEl.dataset.actsSig = wantActsHtml;
          actsEl.innerHTML = wantActsHtml;
        }
      }

      let itemsEl = grpEl.querySelector(':scope > .ide-tree-group-items');
      if (spec.collapsed) {
        if (itemsEl) itemsEl.remove();
      } else {
        if (!itemsEl) {
          itemsEl = document.createElement('div');
          itemsEl.className = 'ide-tree-group-items';
          grpEl.appendChild(itemsEl);
        }
        reconcileIdeRowsContainer(itemsEl, spec.items, curSelected);
      }
      const curAtIdx = treeEl.children[gIdx];
      if (curAtIdx !== grpEl) {
        treeEl.insertBefore(grpEl, curAtIdx || null);
      }
    });
  }

  function renderIdeSidebar() {
    return S.runViewBoundary('sidebar', 'Explorer Sidebar', { elId: 'ide-sidebar-tree', mode: 'replace' }, () => {
    const accountsEl = S.$('ide-sidebar-accounts');
    const acctsCountEl = S.$('ide-accounts-count');
    const approvalsEl = S.$('ide-sidebar-approvals');
    const secQuestionsEl = S.$('ide-sec-questions');
    const questionsCountEl = S.$('ide-questions-count');
    const sidebarQuestionsEl = S.$('ide-sidebar-questions');
    const secBgTasksEl = S.$('ide-sec-bgtasks');
    const bgHeadingEl = S.$('ide-bgtasks-heading');
    const bgCountEl = S.$('ide-bgtasks-count');
    const bgUnpinBtn = S.$('ide-bgtasks-unpin');
    const bgStopAllBtn = S.$('ide-bgtasks-stop-all');
    const sidebarBgEl = S.$('ide-sidebar-bgtasks');
    const countEl = S.$('ide-sidebar-count');
    const treeEl = S.$('ide-sidebar-tree');
    if (!treeEl) return;

    // 1. Account & Usage compact VS Code Hub cards + Pending Login + Exception Host Health Cards
    renderIdePendingLoginBanner();
    renderIdeHostHealthCards();
    const hide3pSide = S.isThirdPartyQuotaHidden();
    const has3pSide = S.hasAnyAntigravityThirdPartyBars();
    const side3pPill = S.$('ide-toggle-3p-pill');
    if (side3pPill) {
      side3pPill.hidden = !(has3pSide || hide3pSide);
      side3pPill.setAttribute('data-toggle-3p-quota', hide3pSide ? 'show' : 'hide');
      side3pPill.textContent = hide3pSide ? '+ 3P' : 'Hide 3P';
      side3pPill.setAttribute('aria-pressed', hide3pSide ? 'true' : 'false');
    }
    if (accountsEl) {
      const { ordered, sameProvCounts } = S.getOrderedPulseQuotaCards();
      const signedInCards = ordered.filter(({ acct }) => S.isSignedInQuotaCard(acct));
      if (acctsCountEl) {
        acctsCountEl.hidden = signedInCards.length === 0;
        acctsCountEl.textContent = String(signedInCards.length);
      }
      const editingAccountInput = Boolean(
        activeInlineAcctEdit &&
          document.activeElement &&
          accountsEl.contains(document.activeElement) &&
          document.activeElement.matches('.ide-acct-inline-edit')
      );
      if (!editingAccountInput) {
        const nowMs = Date.now();
        const canReorderSide =
          ordered.length > 1 && ordered.every(({ acct }) => S.isSignedInQuotaCard(acct));
        accountsEl.innerHTML = ordered
          .map(({ acct, provKey }, cardIdx) => {
            const acctId = acct?.id || `${provKey}:default`;
            const label = provKey === 'claude' ? 'Claude Code' : 'Antigravity';
            if (!S.isSignedInQuotaCard(acct)) {
              return `
                <div class="ide-acct-card is-offline" data-quota-card-id="${S.esc(acctId)}" data-account-prov="${provKey}">
                  <div class="ide-acct-head">
                    <span class="ide-acct-left">
                      <span class="prov-glyph">${S.PROVIDER_ICONS[provKey]}</span>
                      <span class="ide-acct-name">${S.esc(label)}</span>
                    </span>
                    <button type="button" class="ide-acct-use-btn" data-account-add-remote="${provKey}">+ Sign in</button>
                  </div>
                </div>
              `;
            }
            const isActive = acct?.active !== false;
            const multi = (sameProvCounts[provKey] || 1) > 1;
            const collapseKey = multi ? acctId : provKey;
            const isCollapsed = S.isQuotaCardCollapsed(collapseKey, acctId, multi, isActive);
            const email = String(acct?.account?.email || acct?.email || '').trim();
            const shortEmail = email.includes('@') ? email.split('@')[0] : email;
            const plan = String(
              acct?.account?.plan || acct?.plan || (provKey === 'claude' ? 'Max' : 'Pro')
            )
              .replace(/^Google AI\s+/i, '')
              .trim();
            // Never fall back to acct?.label (provider name) so "Antigravity [Antigravity]" never occurs
            const nick = String(acct?.nickname || acct?.account?.nickname || '').trim();
            const badgeTxt =
              nick || (multi ? shortEmail || (isActive ? 'Primary' : 'Secondary') : '');
            const limits = acct?.usage?.limits?.length
              ? acct.usage.limits
              : acct?.usage?.allLimits || [];
            const renderSideRow = (l, isThirdParty) => {
              const passed = Boolean(l.expired || (l.reset && l.reset <= nowMs));
              const known = l.known !== false;
              const rawPct = l.pct !== undefined ? l.pct : l.usedPercent;
              const pct =
                passed || !known ? 0 : Math.min(100, Math.max(0, Math.round(Number(rawPct || 0))));
              const pctTxt = known ? `${pct}%` : '—';
              const barCls =
                pct >= 90
                  ? 'crit'
                  : pct >= 78
                    ? 'warn'
                    : isThirdParty
                      ? 'third-party'
                      : provKey === 'claude'
                        ? 'claude'
                        : 'agy';
              const rst = S.formatQuotaResetLine(l, nowMs);
              return `
                <div class="ide-qrow tabular">
                  <div class="ide-qlabels">
                    <span class="ide-qlbl">${S.esc(String(l.label || '').replace(/\s*Ledger$/i, ''))}</span>
                    <span class="ide-qmeta">${rst ? `<span class="ide-qrst">${S.esc(rst)}</span>` : ''}<strong>${pctTxt}</strong></span>
                  </div>
                  <div class="ide-qtrack"><div class="ide-qfill ${barCls}" style="width:${pct}%"></div></div>
                </div>
              `;
            };
            let barsHtml = '';
            if (!limits.length) {
              barsHtml = `<div class="ide-acct-empty-usage">${S.esc(acct?.usageMessage || (isActive ? 'Window idle' : 'Signed in · Standby'))}</div>`;
            } else if (provKey === 'antigravity') {
              const gemBars = limits.filter((l) => !S.isThirdPartyQuotaBar(l));
              const tpBars = limits.filter((l) => S.isThirdPartyQuotaBar(l));
              if (hide3pSide) {
                barsHtml = gemBars.length
                  ? gemBars.map((l) => renderSideRow(l, false)).join('')
                  : tpBars.length
                    ? `<div class="q-pool-hidden-note"><span>Claude &amp; GPT hidden</span><button type="button" class="q-pool-toggle-btn" data-toggle-3p-quota="show" aria-label="Show Claude and GPT quota bars">Show</button></div>`
                    : `<div class="ide-acct-empty-usage">${S.esc(acct?.usageMessage || 'Window idle')}</div>`;
              } else if (tpBars.length) {
                const gemHtml = gemBars.length
                  ? `<div class="ide-qpool-group"><div class="ide-qpool-head"><span class="q-pool-dot agy"></span><span class="q-pool-title">Gemini models</span></div>${gemBars.map((l) => renderSideRow(l, false)).join('')}</div>`
                  : '';
                const tpHtml = `<div class="ide-qpool-3p"><div class="ide-qpool-head"><span class="q-pool-dot third-party"></span><span class="q-pool-title">Claude &amp; GPT pool</span><button type="button" class="q-pool-toggle-btn" data-toggle-3p-quota="hide" aria-label="Hide Claude and GPT quota bars">Hide</button></div>${tpBars.map((l) => renderSideRow(l, true)).join('')}</div>`;
                barsHtml = gemHtml + tpHtml;
              } else {
                barsHtml = gemBars.map((l) => renderSideRow(l, false)).join('');
              }
            } else {
              barsHtml = limits.map((l) => renderSideRow(l, false)).join('');
            }
            const canMoveUp = canReorderSide && cardIdx > 0;
            const canMoveDown = canReorderSide && cardIdx < ordered.length - 1;
            const moveBtnsHtml =
              canReorderSide && (canMoveUp || canMoveDown)
                ? `<span class="ide-acct-move-group${canMoveUp && canMoveDown ? ' dual' : ''}">${
                    canMoveUp
                      ? `<button type="button" class="ide-acct-icon-btn ide-acct-move-btn" data-account-move="up" data-account-id="${S.esc(acctId)}" data-account-prov="${provKey}" data-micro-tip="Move up" aria-label="Move account up">${S.UI_ICONS.arrowUp}</button>`
                      : ''
                  }${
                    canMoveDown
                      ? `<button type="button" class="ide-acct-icon-btn ide-acct-move-btn" data-account-move="down" data-account-id="${S.esc(acctId)}" data-account-prov="${provKey}" data-micro-tip="Move down" aria-label="Move account down">${S.UI_ICONS.arrowDown}</button>`
                      : ''
                  }</span>`
                : '';
            const isEditingLabel = Boolean(
              activeInlineAcctEdit &&
                activeInlineAcctEdit.accountId === acctId &&
                activeInlineAcctEdit.surface === 'sidebar'
            );
            const editRowHtml = isEditingLabel
              ? `<form class="ide-acct-edit-row" data-acct-label-form="${S.esc(acctId)}" data-acct-prov="${provKey}"><input type="text" class="ide-acct-inline-edit" value="${S.esc(activeInlineAcctEdit.value ?? nick)}" placeholder="Label (e.g. Work, Personal)" maxlength="32" autocomplete="off"><button type="submit" class="ide-link-pill">Save</button><button type="button" class="ide-link-pill" data-acct-label-cancel="1">Cancel</button></form>`
              : '';
            return `
              <div class="ide-acct-card${isActive ? ' is-active' : ''}${multi ? ' is-multi' : ''}${isCollapsed ? ' collapsed' : ''}" data-quota-card-id="${S.esc(acctId)}" data-account-prov="${provKey}"${canReorderSide ? ' draggable="true"' : ''}>
                <div class="ide-acct-head">
                  <button type="button" class="ide-acct-toggle" data-quota-collapse="${S.esc(collapseKey)}" aria-expanded="${!isCollapsed}">
                    <span class="ide-chevron-sm">${isCollapsed ? S.CHEVRON_RIGHT_SVG : S.CHEVRON_DOWN_SVG}</span>
                    <span class="prov-glyph">${S.PROVIDER_ICONS[provKey]}</span>
                    <span class="ide-acct-name">${S.esc(label)}</span>
                    ${badgeTxt ? `<span class="ide-acct-role${isActive ? ' primary' : ''}">${S.esc(badgeTxt)}</span>` : ''}
                  </button>
                  <div class="ide-acct-actions">
                    ${
                      !isActive
                        ? `<button type="button" class="ide-acct-use-btn" data-account-switch="${S.esc(acctId)}" data-account-prov="${provKey}">${S.UI_ICONS.swap}<span>Use</span></button>`
                        : `<span class="ide-acct-live-pill"><span class="ide-acct-active-dot"></span><span>Active</span></span>`
                    }
                    ${moveBtnsHtml}
                    <button type="button" class="ide-acct-icon-btn" data-account-label="${S.esc(acctId)}" data-account-prov="${provKey}" data-account-nick="${S.esc(nick)}" data-account-surface="sidebar" data-micro-tip="Edit account label" aria-label="Edit account label">${S.UI_ICONS.pencil}</button>
                    <button type="button" class="ide-acct-icon-btn" data-acct-ctx-menu="${S.esc(acctId)}" data-acct-prov="${provKey}" data-micro-tip="Account actions" aria-label="Account actions">${S.UI_ICONS.more}</button>
                  </div>
                </div>
                ${
                  isCollapsed
                    ? editRowHtml
                    : `${editRowHtml}<div class="ide-acct-sub">${email ? `<span>${S.esc(email)}</span>` : '<span></span>'}<span class="ide-plan-tag">${S.esc(plan)}</span></div>${barsHtml ? `<div class="ide-qstack">${barsHtml}</div>` : ''}${provKey === 'claude' && isActive ? S.renderClaudeModeSelectorHtml('sidebar') : ''}`
                }
              </div>
            `;
          })
          .join('');
      }
    }

    // 2. Live Approvals Banner in Sidebar
    const devFilter =
      S.prefs.selectedDeviceFilter && S.prefs.selectedDeviceFilter !== 'all'
        ? S.prefs.selectedDeviceFilter
        : '';
    if (approvalsEl) {
      const approvals = (Array.isArray(S.appState?.approvals) ? S.appState.approvals : []).filter((a) => {
        if (!a) return false;
        if (!devFilter) return true;
        if (a.deviceId) return a.deviceId === devFilter;
        const linkedRow = (S.appState?.rows || []).find((r) => r && r.id === a.sessionId);
        return !linkedRow?.deviceId || linkedRow.deviceId === devFilter;
      });
      if (approvals.length === 0) {
        approvalsEl.hidden = true;
        approvalsEl.innerHTML = '';
      } else {
        approvalsEl.hidden = false;
        approvalsEl.innerHTML = `
          <div class="ide-appr-head tabular">
            <span>${approvals.length} Waiting for Input</span>
          </div>
          ${approvals
            .slice(0, 3)
            .map((a) => {
              const aProv = a.provider === 'claude' ? 'claude' : 'antigravity';
              const isQ = a.kind === 'question' || a.kind === 'waiting_session' || /question/i.test(String(a.toolName || ''));
              return `
                <div class="ide-appr-item">
                  <button type="button" class="ide-appr-open" data-ide-open-session="${S.esc(a.sessionId || '')}" data-session-prov="${aProv}">
                    <span class="ide-dot waiting"></span>
                    <span class="ide-appr-title">${S.esc(a.title || a.toolName || 'Pending Action')}</span>
                  </button>
                  ${
                    !isQ && a.approvalId
                      ? `<button type="button" class="ide-appr-ok" data-approve-act="approve" data-app-id="${S.esc(a.approvalId)}" data-sess-id="${S.esc(a.sessionId || '')}" data-prov="${aProv}" data-sel="${S.esc(a.selector || '')}" data-lbl="${S.esc(a.toolName || 'Accept')}">Approve</button>`
                      : `<button type="button" class="ide-appr-ok" data-ide-open-session="${S.esc(a.sessionId || '')}" data-session-prov="${aProv}">Reply</button>`
                  }
                </div>
              `;
            })
            .join('')}
        `;
      }
    }

    // 3. Session Manager Tree + Interactive QUESTIONS & SIDE AGENTS Sections
    const hideDesktop = S.isClaudeDesktopHidden();
    const rawHostRows = (S.appState?.rows || []).filter(
      (r) => r && r.id && (!devFilter || !r.deviceId || r.deviceId === devFilter)
    );
    const hasDesktopRows = rawHostRows.some(S.isClaudeDesktopRow);
    const hideDesktopChip = S.$('ide-hide-desktop-chip');
    if (hideDesktopChip) {
      hideDesktopChip.hidden = !(hasDesktopRows || hideDesktop);
      hideDesktopChip.classList.toggle('active', hideDesktop);
      hideDesktopChip.setAttribute('aria-pressed', hideDesktop ? 'true' : 'false');
      hideDesktopChip.textContent = hideDesktop ? 'Desktop Hidden' : 'Hide Desktop';
    }
    const visibleHostRows = hideDesktop ? rawHostRows.filter((r) => !S.isClaudeDesktopRow(r)) : rawHostRows;
    const allRows = visibleHostRows.filter((r) => !r.archived);
    const archivedRows = visibleHostRows.filter((r) => r.archived);
    if (countEl) countEl.textContent = String(allRows.length);

    // 3A. Sidebar Interactive QUESTIONS Section (VS Code Hub Parity)
    if (secQuestionsEl && sidebarQuestionsEl) {
      const qMetas = [];
      const seenQSess = new Set();
      for (const r of allRows) {
        const meta = getSessionPendingQuestionsMeta(r);
        if (meta && !seenQSess.has(meta.sessionId)) {
          seenQSess.add(meta.sessionId);
          qMetas.push(meta);
        }
      }
      const totalQItems = qMetas.reduce((acc, m) => acc + m.questions.length, 0);
      if (questionsCountEl) questionsCountEl.textContent = String(totalQItems);
      if (qMetas.length === 0) {
        secQuestionsEl.hidden = true;
        sidebarQuestionsEl.innerHTML = '';
      } else {
        secQuestionsEl.hidden = false;
        const activeInSidebarQ =
          document.activeElement &&
          sidebarQuestionsEl.contains(document.activeElement) &&
          document.activeElement.matches('[data-q-writein-input]');
        const focusedCardKey = activeInSidebarQ ? document.activeElement.dataset.cardKey || '' : '';
        const focusedStillActive = Boolean(
          focusedCardKey && qMetas.some((m) => m.cardKey === focusedCardKey)
        );
        if (!focusedStillActive) {
          sidebarQuestionsEl.innerHTML = qMetas
            .slice(0, 5)
            .map((meta) => {
              S.renderedQuestionsByCardKey.set(meta.cardKey, {
                cardKey: meta.cardKey,
                sessionId: meta.sessionId,
                provider: meta.provider,
                approvalId: meta.approvalId,
                turnId: meta.turnId,
                stepIndex: S.extractQuestionsStepIndex(meta.questions, meta.stepIndex),
                selector: meta.selector,
                questions: meta.questions,
                plainQuestionFallback: false
              });
              const draft = S.getQuestionDraft(meta.cardKey);
              const selectedCount = S.countDraftSelections(draft, meta.questions.length);
              const anyToolPerm = meta.questions.some((q) => q.isToolPermission);
              const qBlocks = meta.questions
                .map((qItem, qIdx) => {
                  const selSet = draft.selectedByQ[qIdx] || new Set();
                  const writeVal = String(draft.writeInByQ[qIdx] || '');
                  const opts = Array.isArray(qItem.options) ? qItem.options : [];
                  return `
                    <div data-q-block="${qIdx}" style="display:flex;flex-direction:column;gap:4px">
                      <div class="sb-q-text">${meta.questions.length > 1 ? `<span class="tabular" style="color:var(--amber);font-weight:700">Q${qIdx + 1}.</span> ` : ''}${S.esc(qItem.question || 'Question')}</div>
                      ${
                        opts.length > 0
                          ? `<div class="sb-q-opts">${opts
                              .map((opt, oIdx) => {
                                const isSel = selSet.has(String(oIdx));
                                return `<button type="button" class="sb-q-opt${isSel ? ' selected is-selected' : ''}" data-q-opt-toggle="1" data-card-key="${S.esc(meta.cardKey)}" data-q-idx="${qIdx}" data-opt-idx="${oIdx}" aria-pressed="${isSel ? 'true' : 'false'}"><span class="sb-q-num">${oIdx + 1}</span><span>${S.esc(opt.cleanText || opt.text)}</span>${opt.isRecommended && !qItem.isToolPermission ? `<span class="sb-q-rec">★ Rec</span>` : ''}</button>`;
                              })
                              .join('')}</div>`
                          : ''
                      }
                      <input type="text" class="sb-q-other" data-q-writein-input="1" data-card-key="${S.esc(meta.cardKey)}" data-q-idx="${qIdx}" placeholder="${S.esc(opts.length > 0 ? 'Other (custom answer)…' : 'Type your answer…')}" value="${S.esc(writeVal)}" autocomplete="off">
                    </div>
                  `;
                })
                .join('');
              return `
                <div class="sb-q-card" data-q-card="${S.esc(meta.cardKey)}">
                  <div class="sb-q-head" role="button" tabindex="0" data-ide-open-session="${S.esc(meta.sessionId)}" data-session-prov="${meta.provider}">
                    <span class="sb-q-sess">
                      <span class="prov-glyph">${S.PROVIDER_ICONS[meta.provider]}</span>
                      <span>${S.esc(meta.sessionTitle)}</span>
                    </span>
                    <span class="ide-side-count amber tabular">${meta.questions.length}Q</span>
                  </div>
                  ${qBlocks}
                  <div class="sb-q-actions">
                    <button type="button" class="sb-q-btn" data-q-skip="1" data-card-key="${S.esc(meta.cardKey)}">${anyToolPerm ? 'Deny' : 'Skip'}</button>
                    <button type="button" class="sb-q-btn primary" data-q-submit="1" data-card-key="${S.esc(meta.cardKey)}">✓ ${anyToolPerm ? (selectedCount > 0 ? `Confirm (${selectedCount})` : 'Yes (Allow)') : `Submit Answer${selectedCount > 0 ? ` (${selectedCount})` : ''}`}</button>
                  </div>
                </div>
              `;
            })
            .join('');
        }
      }
    }

    // 3B. Sidebar SIDE AGENTS & TASKS Section (VS Code Hub Parity + Pinning)
    const curSelected = isNewSessionMode() ? '' : String(S.prefs.selectedThreadId || '');
    if (secBgTasksEl && sidebarBgEl) {
      let pinnedRow = S.prefs.pinnedBgSessionId
        ? allRows.find((r) => r.id === S.prefs.pinnedBgSessionId)
        : null;
      if (S.prefs.pinnedBgSessionId && !pinnedRow) {
        S.prefs.pinnedBgSessionId = '';
        S.saveJson(S.STORAGE_KEYS.PREFS, S.prefs);
      }
      const bgEntries = [];
      if (pinnedRow) {
        const { allTasks } = S.getSessionBackgroundTasks(pinnedRow, S.threadsCache[pinnedRow.id]);
        for (const t of allTasks.slice(0, 12)) {
          bgEntries.push({ row: pinnedRow, task: t });
        }
      } else {
        const seenEntryKeys = new Set();
        for (const r of allRows) {
          const { allTasks } = S.getSessionBackgroundTasks(r, S.threadsCache[r.id]);
          for (const t of allTasks) {
            const isActiveTask =
              t.state === 'running' || t.state === 'stalled' || t.state === 'interrupted';
            const isSelectedSubagent = r.id === curSelected && t.kind === 'subagent';
            if (isActiveTask || isSelectedSubagent) {
              const eKey = `${r.id}:${t.id}`;
              if (!seenEntryKeys.has(eKey)) {
                seenEntryKeys.add(eKey);
                bgEntries.push({ row: r, task: t });
              }
            }
          }
        }
      }
      const runningBgCount = bgEntries.filter((e) => e.task.state === 'running').length;
      if (bgHeadingEl) {
        bgHeadingEl.textContent = pinnedRow
          ? `PINNED · ${String(pinnedRow.title || 'Session').slice(0, 14)}`
          : 'SIDE AGENTS & TASKS';
      }
      if (bgUnpinBtn) bgUnpinBtn.hidden = !pinnedRow;
      if (bgStopAllBtn) bgStopAllBtn.hidden = runningBgCount === 0;
      if (bgCountEl) {
        bgCountEl.textContent = runningBgCount > 0 ? `${runningBgCount} live` : String(bgEntries.length);
        bgCountEl.classList.toggle('is-live', runningBgCount > 0);
      }

      if (!pinnedRow && bgEntries.length === 0) {
        secBgTasksEl.hidden = true;
        sidebarBgEl.innerHTML = '';
      } else {
        secBgTasksEl.hidden = false;
        if (bgEntries.length === 0) {
          sidebarBgEl.innerHTML = `<div class="ide-tree-empty" style="padding:6px 4px">No side agents or tasks in pinned session.</div>`;
        } else {
          sidebarBgEl.innerHTML = bgEntries
            .slice(0, 10)
            .map(({ row, task }) => {
              const provKey = row.provider === 'claude' ? 'claude' : 'antigravity';
              const isRun = task.state === 'running';
              const bgIcon =
                task.kind === 'subagent'
                  ? S.UI_ICONS.subagent
                  : task.kind === 'timer' || task.kind === 'cron'
                    ? S.UI_ICONS.timer
                    : S.UI_ICONS.terminal;
              const titleTxt = task.subagentRole || task.summary || task.command || task.id || 'Side Agent';
              const subTxt = `${S.getBgKindLabel(task.kind)} · ${row.title || 'Session'}`;
              const ageStr = task.startedAt ? shortSidebarAge(task.startedAt) : isRun ? 'live' : 'done';
              return `
                <div class="ide-bg-row${isRun ? ' is-running' : ''}" role="button" tabindex="0" data-insp-open-agent="${S.esc(task.id)}" data-sess-id="${S.esc(row.id)}" data-session-prov="${provKey}">
                  <span class="ide-bg-ico${isRun ? ' is-running' : ''}">${bgIcon}</span>
                  <span class="prov-glyph">${S.PROVIDER_ICONS[provKey]}</span>
                  <span class="ide-bg-copy">
                    <span class="ide-bg-title">${S.esc(titleTxt)}</span>
                    <span class="ide-bg-sub">${S.esc(subTxt)}</span>
                  </span>
                  <span class="ide-bg-right tabular">
                    <span class="ide-bg-age">${S.esc(ageStr)}</span>
                    ${
                      isRun
                        ? `<button type="button" class="ide-bg-stop" data-bg-act="stop-task" data-sess-id="${S.esc(row.id)}" data-task-id="${S.esc(task.fullId || task.id)}" data-prov="${provKey}" aria-label="Stop ${S.esc(titleTxt)}">${S.UI_ICONS.stop}</button>`
                        : ''
                    }
                  </span>
                </div>
              `;
            })
            .join('');
        }
      }
    }

    document.querySelectorAll('#ide-sidebar-filters .ide-fchip[data-side-filter]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.sideFilter === S.prefs.sidebarFilter);
    });

    let provScope = ['all', 'antigravity', 'claude'].includes(S.prefs.sidebarProvider)
      ? S.prefs.sidebarProvider
      : 'all';
    const filterSourceRows = S.prefs.sidebarFilter === 'archived' ? archivedRows : allRows;
    const provCountAll = filterSourceRows.length;
    const provCountAgy = filterSourceRows.filter((r) => (r.provider === 'claude' ? 'claude' : 'antigravity') === 'antigravity').length;
    const provCountClaude = filterSourceRows.filter((r) => r.provider === 'claude').length;
    if (provScope === 'antigravity' && provCountAgy === 0) provScope = 'all';
    if (provScope === 'claude' && provCountClaude === 0) provScope = 'all';
    const provBarEl = S.$('ide-provider-bar');
    if (provBarEl) provBarEl.hidden = provCountAgy === 0 || provCountClaude === 0;
    if (S.$('ide-prov-count-all')) S.$('ide-prov-count-all').textContent = String(provCountAll);
    if (S.$('ide-prov-count-agy')) S.$('ide-prov-count-agy').textContent = String(provCountAgy);
    if (S.$('ide-prov-count-claude')) S.$('ide-prov-count-claude').textContent = String(provCountClaude);
    document.querySelectorAll('#ide-provider-bar .ide-provider-tab[data-side-prov]').forEach((btn) => {
      const on = btn.dataset.sideProv === provScope;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    const groups = Array.isArray(S.appState?.groups) ? S.appState.groups : [];
    const groupIds = new Set(groups.map((g) => g.id));
    const searchEl = S.$('ide-sidebar-search');
    const q = (searchEl?.value || '').trim().toLowerCase();
    searchEl?.closest('.ide-search-wrap')?.classList.toggle('has-query', Boolean(q));

    const rawFiltered = filterSourceRows.filter((r) => {
      const rowProv = r.provider === 'claude' ? 'claude' : 'antigravity';
      if (provScope !== 'all' && rowProv !== provScope) return false;
      if (S.prefs.sidebarFilter === 'working' && r.status !== 'working') return false;
      if (S.prefs.sidebarFilter === 'needs_input' && r.status !== 'waiting') return false;
      if (S.prefs.sidebarFilter === 'unread' && !r.unread) return false;
      if (S.prefs.sidebarFilter === 'open' && !isSessionOpenTab(r)) return false;
      if (q) {
        const grpName = r.group ? groups.find((g) => g.id === r.group)?.name || '' : '';
        const hay = `${r.title || ''} ${r.folder || ''} ${r.branch || ''} ${r.model || ''} ${r.provider || ''} ${grpName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // When searching (q !== ''), rank by exact match + operational frequency descending (Hard Rule #11).
    // When not searching (!q), order chronologically by most recently worked on (active running first, then lastWorkedMs desc).
    const nowRankMs = Date.now();
    const rowBaseWeight = (r) =>
      (r.status === 'working' ? 500 : r.status === 'waiting' ? 400 : 0) +
      Math.max(0, 299 - Math.min(299, Math.floor(Math.max(0, nowRankMs - getRowLastWorkedMs(r)) / 3600000)));
    const sortRowsChrono = (list) =>
      q
        ? S.rankSearchMatchesWithPinnedFirst(list, q, rowBaseWeight)
        : [...list].sort(
            (a, b) =>
              (S.isRowPinned(b) ? 1 : 0) - (S.isRowPinned(a) ? 1 : 0) ||
              (S.isSessionActivelyRunning(b.id) ? 1 : 0) - (S.isSessionActivelyRunning(a.id) ? 1 : 0) ||
              getRowLastWorkedMs(b) - getRowLastWorkedMs(a) ||
              Number(b.pinnedAt || 0) - Number(a.pinnedAt || 0)
          );
    const filtered = sortRowsChrono(rawFiltered);

    if (filtered.length === 0 && !(S.prefs.sidebarFilter === 'all' && !q && archivedRows.length > 0)) {
      const emptyTxt =
        S.prefs.sidebarFilter === 'archived'
          ? 'No archived sessions.'
          : allRows.length === 0
            ? 'No sessions synced yet.'
            : 'No matching sessions.';
      treeEl.innerHTML = `<div class="ide-tree-empty">${emptyTxt}</div>`;
      S.reconcileIdeMicroTip();
      return;
    }

    if (!q && S.prefs.sidebarFilter !== 'archived' && groups.length > 0) {
      const groupSpecs = [];
      for (const g of groups) {
        const gItems = applyFrozenIdeOrder(
          g.id,
          filtered.filter((r) => r.group === g.id),
          false
        );
        if (S.prefs.sidebarFilter !== 'all' && gItems.length === 0) continue;
        const collapsed =
          S.prefs.sidebarFilter !== 'all'
            ? false
            : S.isSessionGroupCollapsed(g.id, gItems.length === 0 ? true : Boolean(g.collapsed));
        groupSpecs.push({
          key: g.id,
          name: g.name || 'Group',
          collapsed,
          items: gItems,
          alwaysShowActions: false,
          actionsHtml: `
            <button type="button" class="ide-group-act-btn" data-group-act="new-in-group" data-group-id="${S.esc(g.id)}" data-micro-tip="New session in group" aria-label="New session in ${S.esc(g.name || 'group')}">${S.UI_ICONS.plus}</button>
            <button type="button" class="ide-group-act-btn" data-group-ctx-menu="${S.esc(g.id)}" data-micro-tip="Group actions" aria-label="Group actions for ${S.esc(g.name || 'group')}">${S.UI_ICONS.more}</button>
          `
        });
      }
      const ungrouped = applyFrozenIdeOrder(
        'ungrouped',
        filtered.filter((r) => !r.group || !groupIds.has(r.group)),
        false
      );
      if (ungrouped.length > 0) {
        const ugCollapsed =
          S.prefs.sidebarFilter !== 'all' ? false : S.isSessionGroupCollapsed('ungrouped', false);
        const archivableCount = ungrouped.filter(
          (r) =>
            r.id &&
            !r.archived &&
            !S.isRowPinned(r) &&
            !isSessionOpenTab(r) &&
            r.status !== 'working' &&
            r.status !== 'waiting' &&
            !r.unread
        ).length;
        groupSpecs.push({
          key: 'ungrouped',
          name: 'Ungrouped',
          collapsed: ugCollapsed,
          items: ungrouped,
          alwaysShowActions: false,
          actionsHtml:
            archivableCount > 0
              ? `<button type="button" class="ide-group-act-btn" data-group-act="archive-closed" data-micro-tip="Archive ${archivableCount} closed idle sessions" aria-label="Archive closed sessions">${S.UI_ICONS.archive}</button>`
              : ''
        });
      }
      if (S.prefs.sidebarFilter === 'all' && archivedRows.length > 0) {
        const arcSorted = applyFrozenIdeOrder('archived', sortRowsChrono(archivedRows), false);
        const arcCollapsed = S.isSessionGroupCollapsed('archived', true);
        groupSpecs.push({
          key: 'archived',
          name: 'Archived sessions',
          collapsed: arcCollapsed,
          items: arcSorted,
          alwaysShowActions: false,
          actionsHtml: `<button type="button" class="ide-group-act-btn" data-group-act="unarchive-all" data-micro-tip="Restore all archived sessions" aria-label="Unarchive all sessions">${S.UI_ICONS.restore}</button>`
        });
      }
      reconcileIdeTreeDOM(treeEl, groupSpecs, null, curSelected);
      S.reconcileIdeMicroTip();
      return;
    }

    const flatList = applyFrozenIdeOrder('__flat__', filtered.slice(0, 120), Boolean(q));
    reconcileIdeTreeDOM(treeEl, null, flatList, curSelected);
    S.reconcileIdeMicroTip();
    });
  }

  function isNewSessionMode() {
    return Boolean(
      S.prefs.selectedThreadId === '__new__' ||
        S.prefs.composerMode === 'new-antigravity' ||
        S.prefs.composerMode === 'new-claude'
    );
  }

  function resolveCurrentActiveSessionGroupId() {
    const hasGroups = Array.isArray(S.appState?.groups);
    const validGroupIds = hasGroups
      ? new Set(S.appState.groups.map((g) => g?.id).filter(Boolean))
      : null;
    const validateGroup = (gid) => {
      const clean = String(gid || '').trim();
      if (!clean || clean === 'ungrouped') return '';
      return validGroupIds ? (validGroupIds.has(clean) ? clean : '') : clean;
    };
    if (isNewSessionMode()) {
      return validateGroup(S.prefs.newSessionGroupId);
    }
    const curTid = String(S.prefs.selectedThreadId || '').trim();
    if (!curTid || curTid === '__new__') return '';
    if (
      pendingNewSessionBind &&
      pendingNewSessionBind.draftThreadId === curTid &&
      pendingNewSessionBind.groupId
    ) {
      return validateGroup(pendingNewSessionBind.groupId);
    }
    if (pendingRowOverrides.has(curTid)) {
      const ov = pendingRowOverrides.get(curTid);
      if (ov && Date.now() - Number(ov.at || 0) <= PENDING_OVERRIDE_TTL_MS && ov.group !== undefined) {
        return validateGroup(ov.group);
      }
    }
    const curRow = (S.appState?.rows || []).find((r) => r && r.id === curTid);
    if (curRow && !curRow.archived) {
      return validateGroup(curRow.group);
    }
    return '';
  }

  function enterNewSessionMode(provider = 'antigravity', opts = {}) {
    S.clearPinnedNav();
    S.recentResumeUntil = 0;
    if ('caches' in window) {
      caches
        .open(S.NAV_HANDOFF_CACHE)
        .then((c) => c.delete(S.LAST_PUSH_NAV_CACHE_URL))
        .catch(() => {});
    }
    const prov = provider === 'claude' ? 'claude' : 'antigravity';
    const hasGroups = Array.isArray(S.appState?.groups);
    const validGroupIds = hasGroups
      ? new Set(S.appState.groups.map((g) => g?.id).filter(Boolean))
      : null;
    const validateExplicitGroup = (gid) => {
      const clean = String(gid || '').trim();
      if (!clean || clean === 'ungrouped') return '';
      return validGroupIds ? (validGroupIds.has(clean) ? clean : '') : clean;
    };
    const nextGroupId =
      opts.groupId !== undefined
        ? validateExplicitGroup(opts.groupId)
        : resolveCurrentActiveSessionGroupId();
    if (
      S.prefs.selectedThreadId &&
      S.prefs.selectedThreadId !== '__new__' &&
      !String(S.prefs.selectedThreadId).startsWith('draft-new-')
    ) {
      S.prefs.lastReplyThreadId = S.prefs.selectedThreadId;
    }
    S.prefs.composerMode = prov === 'claude' ? 'new-claude' : 'new-antigravity';
    S.prefs.selectedThreadId = '__new__';
    S.prefs.newSessionGroupId = nextGroupId;
    if (nextGroupId) {
      if (!S.prefs.collapsedSessionGroups || typeof S.prefs.collapsedSessionGroups !== 'object') {
        S.prefs.collapsedSessionGroups = {};
      }
      S.prefs.collapsedSessionGroups[nextGroupId] = false;
    }
    if (opts.repoPrefix !== undefined) {
      S.prefs.composerRepoPrefix = opts.repoPrefix;
    }
    S.saveJson(S.STORAGE_KEYS.PREFS, S.prefs);
    S.switchTab('chat');
    S.updateComposerModePills();
    S.renderChatView(true);
    if (nextGroupId) renderIdeSidebar();
    setTimeout(() => S.$('composer-input')?.focus(), 30);
  }

  function exitNewSessionModeToReply(explicitThreadId = '', opts = {}) {
    const allowResurrectClosed = opts.allowResurrectClosed !== false;
    const rows = (S.appState?.rows || []).filter((r) => r && r.id && !r.draft && !r.archived);
    const isUsableReplyTarget = (id, respectClosed = true) => {
      const clean = String(id || '').trim();
      if (!clean || clean === '__new__') return false;
      if (respectClosed && closedEditorTabIds.has(clean)) return false;
      if (rows.some((x) => x.id === clean)) return true;
      return Boolean(
        S.threadsCache[clean] &&
          !(S.appState?.rows || []).some((x) => x && x.id === clean && x.archived)
      );
    };
    const openTabsRev = Array.isArray(S.prefs.openEditorTabs) ? [...S.prefs.openEditorTabs].reverse() : [];
    const candidateId =
      (explicitThreadId && isUsableReplyTarget(explicitThreadId, false) ? explicitThreadId : '') ||
      (isUsableReplyTarget(S.prefs.lastReplyThreadId, true) ? S.prefs.lastReplyThreadId : '') ||
      openTabsRev.find((id) => isUsableReplyTarget(id, true)) ||
      (
        rows.find((r) => !closedEditorTabIds.has(r.id) && r.active) ||
        rows.find((r) => !closedEditorTabIds.has(r.id) && r.open) ||
        rows.find((r) => !closedEditorTabIds.has(r.id))
      )?.id ||
      (allowResurrectClosed ? rows[0]?.id || '' : '');

    if (!candidateId) {
      S.prefs.composerMode = S.hasSignedInProviderRemote('antigravity') ? 'new-antigravity' : 'new-claude';
      S.prefs.selectedThreadId = '__new__';
      S.saveJson(S.STORAGE_KEYS.PREFS, S.prefs);
      S.updateComposerModePills();
      S.renderChatView(true);
      return;
    }

    ensureEditorTabOpen(candidateId);
    S.prefs.composerMode = 'reply';
    S.prefs.selectedThreadId = candidateId;
    S.prefs.lastReplyThreadId = candidateId;
    S.prefs.newSessionGroupId = '';
    S.saveJson(S.STORAGE_KEYS.PREFS, S.prefs);
    S.updateComposerModePills();
    S.renderChatView(true);
    S.fetchThreadDetail(candidateId);
  }

  function bindDraftThreadToRealSession(draftId, realId, provider = 'antigravity') {
    const cleanReal = String(realId || '').trim();
    if (!cleanReal) return false;
    const draftThread = draftId ? S.threadsCache[draftId] : null;
    if (draftThread && Array.isArray(draftThread.messages)) {
      if (!S.threadsCache[cleanReal]) {
        S.threadsCache[cleanReal] = {
          id: cleanReal,
          provider,
          title: draftThread.title || 'New Session',
          model: draftThread.model || '',
          effort: draftThread.effort || '',
          messages: []
        };
      } else {
        if (draftThread.model && !S.threadsCache[cleanReal].model) {
          S.threadsCache[cleanReal].model = draftThread.model;
        }
        if (draftThread.effort && !S.threadsCache[cleanReal].effort) {
          S.threadsCache[cleanReal].effort = draftThread.effort;
        }
      }
      const existingMsgs = Array.isArray(S.threadsCache[cleanReal].messages)
        ? S.threadsCache[cleanReal].messages
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
      S.threadsCache[cleanReal].messages = existingMsgs;
    }
    if (draftId && draftId !== cleanReal) {
      const draftLive = S.liveStreamsByThreadId.get(draftId);
      if (draftLive && !S.liveStreamsByThreadId.has(cleanReal)) {
        S.liveStreamsByThreadId.set(cleanReal, draftLive);
      }
      S.liveStreamsByThreadId.delete(draftId);
      if (S.chatOpenDetailsByThread.has(draftId)) {
        if (!S.chatOpenDetailsByThread.has(cleanReal)) {
          S.chatOpenDetailsByThread.set(cleanReal, S.chatOpenDetailsByThread.get(draftId));
        }
        S.chatOpenDetailsByThread.delete(draftId);
      }
      if (pendingRowOverrides.has(draftId)) {
        const draftOv = pendingRowOverrides.get(draftId);
        pendingRowOverrides.delete(draftId);
        noteRowOverride(cleanReal, draftOv);
      }
      if (S.prefs.threadModelConfig && S.prefs.threadModelConfig[draftId]) {
        S.prefs.threadModelConfig[cleanReal] = {
          ...S.prefs.threadModelConfig[draftId],
          updatedAt: Date.now()
        };
        delete S.prefs.threadModelConfig[draftId];
        S.saveJson(S.STORAGE_KEYS.PREFS, S.prefs);
      }
      delete S.threadsCache[draftId];
      if (Array.isArray(S.prefs.openEditorTabs)) {
        const idx = S.prefs.openEditorTabs.indexOf(draftId);
        if (idx >= 0) {
          S.prefs.openEditorTabs[idx] = cleanReal;
          S.prefs.openEditorTabs = Array.from(new Set(S.prefs.openEditorTabs));
        }
      }
    }
    ensureEditorTabOpen(cleanReal);
    if (
      !S.prefs.selectedThreadId ||
      S.prefs.selectedThreadId === draftId ||
      S.prefs.selectedThreadId === '__new__'
    ) {
      S.prefs.selectedThreadId = cleanReal;
      S.prefs.lastReplyThreadId = cleanReal;
      S.prefs.composerMode = 'reply';
      S.saveJson(S.STORAGE_KEYS.PREFS, S.prefs);
      S.setPinnedNav({
        threadId: cleanReal,
        provider,
        title: draftThread?.title || '',
        durationMs: 60000
      });
    }
    const boundGroupId = String(
      (pendingNewSessionBind && (!draftId || pendingNewSessionBind.draftThreadId === draftId)
        ? pendingNewSessionBind.groupId
        : '') ||
        (draftId && pendingRowOverrides.has(draftId) ? pendingRowOverrides.get(draftId)?.group : '') ||
        ''
    ).trim();
    if (boundGroupId) {
      noteRowOverride(cleanReal, { group: boundGroupId });
      const existingRealRow = (S.appState?.rows || []).find((r) => r && r.id === cleanReal);
      if (existingRealRow) {
        existingRealRow.group = boundGroupId;
      }
      if (!S.prefs.collapsedSessionGroups || typeof S.prefs.collapsedSessionGroups !== 'object') {
        S.prefs.collapsedSessionGroups = {};
      }
      S.prefs.collapsedSessionGroups[boundGroupId] = false;
      S.saveJson(S.STORAGE_KEYS.PREFS, S.prefs);
    }
    if (pendingNewSessionBind && (!draftId || pendingNewSessionBind.draftThreadId === draftId)) {
      pendingNewSessionBind = null;
    }
    S.persistCache();
    S.renderAll();
    S.fetchThreadDetail(cleanReal, provider).catch(() => {});
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
      const resolvedId = S.cleanTargetThreadId(
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
      if (S.prefs.selectedThreadId !== '__new__') {
        S.prefs.selectedThreadId = '__new__';
      }
      return;
    }
    if (String(S.prefs.selectedThreadId || '').startsWith('draft-new-')) {
      return;
    }
    const rows = (S.appState?.rows || []).filter((r) => r.id && !r.draft && !r.archived);
    const curRowObj = (S.appState?.rows || []).find((r) => r && r.id === S.prefs.selectedThreadId);
    if (curRowObj?.archived) {
      S.prefs.selectedThreadId = '';
    }
    const hasPinned =
      Boolean(S.pinnedNavThreadId) &&
      S.prefs.selectedThreadId === S.pinnedNavThreadId &&
      Date.now() < S.pinnedNavUntil &&
      !curRowObj?.archived;
    const hasCachedThread = Boolean(
      S.prefs.selectedThreadId && S.threadsCache[S.prefs.selectedThreadId] && !curRowObj?.archived
    );
    if (hasPinned || hasCachedThread) {
      return;
    }
    if (!S.prefs.selectedThreadId || (rows.length > 0 && !rows.some((r) => r.id === S.prefs.selectedThreadId))) {
      const openOrRecent = rows.find((r) => r.active) || rows.find((r) => r.open) || rows[0];
      if (openOrRecent) {
        S.prefs.selectedThreadId = openOrRecent.id;
        S.saveJson(S.STORAGE_KEYS.PREFS, S.prefs);
      }
    }
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

  async function toggleSessionPin(sessionId, forceVal) {
    if (S.isPinLocked()) return;
    const id = S.cleanTargetThreadId(sessionId);
    if (!id || id === '__new__') {
      S.showToast('Select an active session first to pin');
      return;
    }
    const targetRow = (S.appState?.rows || []).find((r) => r && r.id === id);
    if (!targetRow || targetRow.archived) return;
    const val = typeof forceVal === 'boolean' ? forceVal : !S.isRowPinned(targetRow);
    const ts = Date.now();
    targetRow.pinned = val;
    targetRow.pinnedAt = val ? ts : 0;
    targetRow.pinUpdatedAt = ts;
    noteRowOverride(id, {
      pinned: val,
      pinnedAt: val ? ts : 0,
      pinUpdatedAt: ts
    });
    if (Array.isArray(S.appState?.rows)) {
      S.appState.rows.sort(S.compareRowsPinnedFirst);
    }
    S.haptic(12);
    S.persistCache();
    S.renderAll();
    await S.dispatchRemoteCommand({
      type: 'sessionAction',
      action: 'pin',
      subAction: 'pin',
      id,
      ids: [id],
      provider: targetRow.provider || 'antigravity',
      value: val,
      updatedAt: ts,
      targetDeviceId: targetRow.deviceId || undefined
    });
    S.showToast(val ? 'Pinned chat' : 'Unpinned chat');
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
      const srvArchived = Boolean(r.archived);
      let settled = true;
      if ('unread' in rec) {
        if (Boolean(r.unread) !== rec.unread) {
          r.unread = rec.unread;
          if (!rec.unread && r.dot === 'unread') r.dot = r.open ? 'idle' : null;
          if (rec.unread && !r.dot && r.status !== 'working' && r.status !== 'waiting') r.dot = 'unread';
          settled = false;
        }
      }
      if ('title' in rec && rec.title) {
        if (String(r.title || '').trim() !== rec.title) {
          r.title = rec.title;
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
      if ('lastWorkedAt' in rec) {
        const wantMs = Number(rec.lastWorkedAt || 0);
        if (wantMs > Number(r.at || 0)) {
          r.at = wantMs;
          r.lastWorkedAt = wantMs;
          settled = false;
        }
      }
      if ('model' in rec && rec.model) {
        if (r.model !== rec.model) {
          r.model = rec.model;
          if (rec.effort) r.effort = rec.effort;
          if (Number(rec.limitTokens || 0) > 0) {
            r.limitTokens = Number(rec.limitTokens);
            const rUsed = Math.max(0, Math.round(Number(r.usedTokens || 0)));
            r.contextPct =
              rUsed > 0 ? Math.min(100, Math.max(1, Math.round((rUsed / r.limitTokens) * 100))) : 0;
          }
          settled = false;
        }
      }
      if ('pinned' in rec) {
        const srvPinned = Boolean(r.pinned && !srvArchived);
        const srvPinUpd = Number(r.pinUpdatedAt || (r.pinned ? r.pinnedAt : 0) || 0);
        const recPinUpd = Number(rec.pinUpdatedAt || rec.pinnedAt || rec.at || 0);
        if (r.archived) {
          r.pinned = false;
          r.pinnedAt = 0;
          r.pinUpdatedAt = Math.max(srvPinUpd, recPinUpd);
          if (srvArchived || srvPinUpd >= recPinUpd) {
            delete rec.pinned;
            delete rec.pinnedAt;
            delete rec.pinUpdatedAt;
          } else {
            settled = false;
          }
        } else if (srvPinUpd > recPinUpd || (srvPinned === Boolean(rec.pinned) && srvPinUpd >= recPinUpd)) {
          delete rec.pinned;
          delete rec.pinnedAt;
          delete rec.pinUpdatedAt;
        } else {
          r.pinned = Boolean(rec.pinned);
          r.pinnedAt = rec.pinned ? Number(rec.pinnedAt || recPinUpd || Date.now()) : 0;
          r.pinUpdatedAt = recPinUpd;
          settled = false;
        }
      }
      if (settled) pendingRowOverrides.delete(id);
    }
    rows.sort(
      (a, b) =>
        (S.isRowPinned(b) ? 1 : 0) - (S.isRowPinned(a) ? 1 : 0) ||
        Number(b?.at || 0) - Number(a?.at || 0) ||
        Number(b?.pinnedAt || 0) - Number(a?.pinnedAt || 0)
    );
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

  Object.assign(S, {
    applyPendingLocalOverrides,
    applyStoppedSessionOverrides,
    beginIdeInlineRename,
    bindDraftThreadToRealSession,
    closeAccountDetailsModal,
    closeAddAccountTray,
    closeEditorTab,
    closeIdeContextMenu,
    ensureEditorTabOpen,
    ensureSelectedThread,
    enterNewSessionMode,
    exitNewSessionModeToReply,
    finishIdeInlineRename,
    flushDeferredIdeTreeOrder,
    getRowLastWorkedMs,
    isNewSessionMode,
    isSessionOpenTab,
    noteGroupOverride,
    noteRowOverride,
    openAccountContextMenu,
    openAccountDetailsModal,
    openAddAccountTray,
    openGroupContextMenu,
    openSessionContextMenu,
    pendingRowOverrides,
    reconcilePendingNewSessionBind,
    removeEditorTabIds,
    renderAddAccountTrayHtml,
    renderCollapsedGroupPinBadgeHtml,
    renderIdeHostHealthCards,
    renderIdePendingLoginBanner,
    renderIdeSidebar,
    resolveCurrentActiveSessionGroupId,
    resolveLiveAccountHostForAdd,
    showSidebarHoverCard,
    stoppedSessionsById,
    submitAddAccountTray,
    syncAndRenderEditorTabs,
    toggleSessionPin
  });
  Object.defineProperties(S, {
    activeIdeRename: { get: () => activeIdeRename, set: (v) => { activeIdeRename = v; }, enumerable: true, configurable: true },
    activeInlineAcctEdit: { get: () => activeInlineAcctEdit, set: (v) => { activeInlineAcctEdit = v; }, enumerable: true, configurable: true },
    addAccountTrayState: { get: () => addAccountTrayState, set: (v) => { addAccountTrayState = v; }, enumerable: true, configurable: true },
    ideMenuPinFreeze: { get: () => ideMenuPinFreeze, set: (v) => { ideMenuPinFreeze = v; }, enumerable: true, configurable: true },
    idePointerInsideTree: { get: () => idePointerInsideTree, set: (v) => { idePointerInsideTree = v; }, enumerable: true, configurable: true },
    pendingNewSessionBind: { get: () => pendingNewSessionBind, set: (v) => { pendingNewSessionBind = v; }, enumerable: true, configurable: true }
  });

  });
})();
