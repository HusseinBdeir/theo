(() => {
  'use strict';

  window.__theoRegisterModule('inspector', (S) => {
  const chatOpenDetailsByThread = new Map();
  const filePreviewCache = new Map();
  const deliverablePreviewCache = new Map();
  const deliverablePageCache = new Map();
  const deliverableInFlightKeys = new Set();
  const activeDeliverableBlobUrls = new Set();
  const activeDockStepByCardKey = new Map();
  let activeInspectorFileTarget = '';
  let activeInspectorSessionId = '';
  let activeInspectorAgentId = '';
  let lastScrolledInspectorHlKey = '';
  let inspectorFetchSeq = 0;
  let activeDeliverablePage = 1;
  let activeDeliverableDeckMode = 'single';
  let activeDeliverableZoomPct = 0;
  let activeDeliverableSheetIdx = 0;

  function revokeActiveDeliverableBlobs() {
    for (const u of activeDeliverableBlobUrls) {
      try { URL.revokeObjectURL(u); } catch {}
    }
    activeDeliverableBlobUrls.clear();
    for (const entry of deliverablePreviewCache.values()) {
      if (entry && entry.blobUrl) entry.blobUrl = '';
    }
    for (const entry of deliverablePageCache.values()) {
      if (entry && entry.blobUrl) entry.blobUrl = '';
    }
  }

  function teardownDeliverableInspectorFrames() {
    const bodyEl = S.$('ide-inspector-body');
    if (bodyEl) {
      bodyEl.querySelectorAll('iframe.insp-html-frame').forEach((fr) => {
        try { fr.removeAttribute('srcdoc'); } catch {}
        try { fr.src = 'about:blank'; } catch {}
      });
    }
    revokeActiveDeliverableBlobs();
  }

  function getDeliverableKindClient(filePath) {
    const s = String(filePath || '').trim().split(/[?#]/)[0];
    if (!s) return '';
    if (/\.(html?|xhtml)$/i.test(s)) return 'html';
    if (/\.pdf$/i.test(s)) return 'pdf';
    if (/\.(pptx|ppsx|pptm)$/i.test(s)) return 'pptx';
    if (/\.(xlsx|xlsm|xls|xlsb|csv|tsv)$/i.test(s)) return 'spreadsheet';
    return '';
  }

  function injectOpaqueStorageShimClient(rawHtml) {
    const html = String(rawHtml || '');
    if (html.includes('data-theo-storage-shim="1"')) return html;
    const shim =
      '(function(){function mk(){var d=Object.create(null);return{get length(){return Object.keys(d).length;},clear:function(){d=Object.create(null);},getItem:function(k){k=String(k);return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null;},key:function(i){var ks=Object.keys(d);return i>=0&&i<ks.length?ks[i]:null;},removeItem:function(k){delete d[String(k)];},setItem:function(k,v){d[String(k)]=String(v);}};}["localStorage","sessionStorage"].forEach(function(p){try{var s=window[p];s.setItem("__t","1");s.removeItem("__t");}catch(_e){try{Object.defineProperty(window,p,{value:mk(),configurable:true});}catch(_e2){}}});})();';
    const tag = `<script data-theo-storage-shim="1">${shim}</script>`;
    if (/<head(?:\s[^>]*)?>/i.test(html)) return html.replace(/<head(?:\s[^>]*)?>/i, (m) => m + tag);
    if (/<html(?:\s[^>]*)?>/i.test(html)) return html.replace(/<html(?:\s[^>]*)?>/i, (m) => m + tag);
    return tag + html;
  }

  function mapMemoryPathForVaultR2(rawTarget, activeRow = null) {
    const parsed = parsePreviewTargetClient(rawTarget);
    let clean = String(parsed.filePath || '').replace(/\\/g, '/').trim();
    if (!clean) return '';
    const memIdx = clean.toLowerCase().indexOf('/bhfirms/memory/');
    if (memIdx >= 0) {
      clean = clean.slice(memIdx + '/bhfirms/memory/'.length);
    } else if (/^[A-Za-z]:\//.test(clean) || clean.startsWith('/')) {
      return '';
    } else {
      const wsId = resolveStudioWorkspaceId(activeRow);
      if (wsId && wsId !== 'theo-memory' && wsId !== 'memory') {
        // Still allow well-known memory subfolders when mentioned without full path
        if (!/^(AEG-boxMind|ISABI|Docs|Reports|memory|Phases)\//i.test(clean)) return '';
      }
    }
    clean = clean.replace(/^\/+/, '');
    const low = clean.toLowerCase();
    if (!clean || low.startsWith('private/') || low === 'private' || low.includes('..')) return '';
    if (low.includes('bank-kyc-ali-bdeir') || low.includes('user-passports-antigua-lebanon')) return '';
    return clean;
  }

  function hasPdfMagicHeaderClient(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 5) return false;
    const maxScan = Math.min(bytes.length - 5, 1024);
    for (let i = 0; i <= maxScan; i++) {
      if (bytes[i] === 0x25 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x44 && bytes[i + 3] === 0x46 && bytes[i + 4] === 0x2d) {
        return true;
      }
    }
    return false;
  }

  async function fetchDeliverableFromVaultR2(rawTarget, kind, activeRow = null) {
    if (S.isHeadlessBrowser) return null;
    S.refreshCloudConfig();
    if (!S.cloudCfg.edgeAccessKey) return null;
    const rel = mapMemoryPathForVaultR2(rawTarget, activeRow);
    if (!rel) return null;
    const vaultBase = String(
      window.THEO_CLOUD_CFG?.memoryVaultUrl || 'https://memory.husseinbdeir.workers.dev'
    ).replace(/\/+$/, '');
    const token = S.getEdgeStoreKeyHex(S.cloudCfg.edgeAccessKey);
    if (!token) return null;

    const tryVaultRaw = async (vaultPath) => {
      const res = await fetch(`${vaultBase}/api/file/raw?path=${encodeURIComponent(vaultPath)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return null;
      const metaHdr = res.headers.get('X-Vault-File-Meta') || '';
      let meta = null;
      try { meta = metaHdr ? JSON.parse(decodeURIComponent(metaHdr)) : null; } catch {}
      if (meta && meta.encrypted) return null;
      const buf = new Uint8Array(await res.arrayBuffer());
      return { buf, meta, vaultPath };
    };

    try {
      if (kind === 'html') {
        const got = await tryVaultRaw(rel);
        if (!got) return null;
        const sourceHtml = new TextDecoder('utf-8', { fatal: false }).decode(got.buf);
        return {
          ok: true,
          kind: 'html',
          sourceKind: 'vault-r2',
          file: rel.split('/').pop() || rel,
          relPath: rel,
          size: got.buf.length,
          sourceHtml,
          sandboxedHtml: injectOpaqueStorageShimClient(sourceHtml)
        };
      }
      if (kind === 'pdf' || kind === 'pptx') {
        const probeRel = kind === 'pptx' ? rel.replace(/\.(pptx|ppsx|pptm)$/i, '.pdf') : rel;
        const got = await tryVaultRaw(probeRel);
        if (got && hasPdfMagicHeaderClient(got.buf)) {
          const blob = new Blob([got.buf], { type: 'application/pdf' });
          const blobUrl = URL.createObjectURL(blob);
          activeDeliverableBlobUrls.add(blobUrl);
          return {
            ok: true,
            kind,
            sourceKind: 'vault-r2-pdf',
            file: rel.split('/').pop() || rel,
            downloadFile: probeRel.split('/').pop() || probeRel,
            rawMime: 'application/pdf',
            relPath: probeRel,
            size: got.buf.length,
            blobUrl,
            rawBytes: got.buf
          };
        }
        if (kind === 'pptx') {
          const rawPpt = await tryVaultRaw(rel);
          if (rawPpt) {
            return {
              ok: true,
              kind: 'pptx',
              sourceKind: 'vault-r2-download',
              file: rel.split('/').pop() || rel,
              downloadFile: rel.split('/').pop() || rel,
              rawMime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
              relPath: rel,
              size: rawPpt.buf.length,
              rawBytes: rawPpt.buf
            };
          }
        }
      }
    } catch {}
    return null;
  }

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

  function parsePreviewTargetClient(rawTarget) {
    let raw = String(rawTarget || '').trim();
    if (!raw) return { filePath: '', startLine: 0, endLine: 0, displayBase: '' };
    if (/^file:\/\//i.test(raw)) {
      raw = raw.replace(/^file:\/\/\/?/i, '');
      try {
        raw = decodeURIComponent(raw);
      } catch {}
      if (/^[a-zA-Z]:\//.test(raw) === false && /^[a-zA-Z]:\\/.test(raw) === false && /^\/[a-zA-Z]:\//.test(`/${raw}`)) {
        raw = raw.replace(/^\/+/, '');
      }
    }
    let filePath = raw;
    let startLine = 0;
    let endLine = 0;
    const hashIdx = raw.indexOf('#');
    if (hashIdx >= 0) {
      filePath = raw.slice(0, hashIdx).trim();
      const frag = raw.slice(hashIdx + 1).trim();
      const m = frag.match(/^L?(\d+)(?:\s*-\s*L?(\d+))?$/i);
      if (m) {
        startLine = Math.max(1, Number(m[1]) || 0);
        endLine = Math.max(startLine, Number(m[2] || m[1]) || startLine);
      }
    } else {
      const colMatch = raw.match(/:(\d+)(?:-(\d+))?$/);
      if (colMatch && !/^[a-zA-Z]:$/.test(raw.slice(0, colMatch.index + 1))) {
        filePath = raw.slice(0, colMatch.index).trim();
        startLine = Math.max(1, Number(colMatch[1]) || 0);
        endLine = Math.max(startLine, Number(colMatch[2] || colMatch[1]) || startLine);
      }
    }
    const displayBase = filePath.split(/[\\/]/).pop() || filePath;
    return { filePath, startLine, endLine, displayBase };
  }

  function collectSessionTouchedFiles(messages) {
    const map = new Map();
    for (const m of messages || []) {
      if (!m) continue;
      for (const tc of m.toolCalls || []) {
        if (!tc) continue;
        const targetRaw = String(tc.relPath || tc.file || '').trim();
        if (!targetRaw) continue;
        const parsed = parsePreviewTargetClient(
          tc.lineRange && !targetRaw.includes('#') ? `${targetRaw}#${tc.lineRange}` : targetRaw
        );
        if (!parsed.filePath) continue;
        const key = parsed.filePath.replace(/\\/g, '/').toLowerCase();
        const isEdit = tc.kind === 'edit' || tc.kind === 'write';
        const prev = map.get(key);
        map.set(key, {
          key,
          target: parsed.startLine
            ? `${parsed.filePath}#L${parsed.startLine}${parsed.endLine > parsed.startLine ? `-L${parsed.endLine}` : ''}`
            : parsed.filePath,
          filePath: parsed.filePath,
          displayBase: parsed.displayBase,
          isEdit: Boolean(prev?.isEdit || isEdit),
          snippet: String(tc.snippet || tc.diff || prev?.snippet || '').trim(),
          added: Number(tc.addedLines ?? tc.added ?? prev?.added ?? 0),
          removed: Number(tc.removedLines ?? tc.removed ?? prev?.removed ?? 0)
        });
      }
      const txt = String(m.text || '');
      const linkRe = /\[`?([^`\]\n]+)`?\]\((file:\/\/[^)\s]+)\)/gi;
      let lm;
      while ((lm = linkRe.exec(txt)) !== null) {
        const parsed = parsePreviewTargetClient(lm[2]);
        if (!parsed.filePath) continue;
        const key = parsed.filePath.replace(/\\/g, '/').toLowerCase();
        if (!map.has(key)) {
          map.set(key, {
            key,
            target: lm[2],
            filePath: parsed.filePath,
            displayBase: parsed.displayBase || lm[1],
            isEdit: false,
            snippet: '',
            added: 0,
            removed: 0
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => Number(b.isEdit) - Number(a.isEdit));
  }

  function buildOfflinePreviewFallback(parsed, activeRow) {
    const sid = String(activeRow?.id || S.prefs.selectedThreadId || '').trim();
    const msgs = S.coalesceThreadMessages(S.threadsCache[sid]?.messages || []);
    const touched = collectSessionTouchedFiles(msgs);
    const normWant = parsed.filePath.replace(/\\/g, '/').toLowerCase();
    const baseWant = parsed.displayBase.toLowerCase();
    const match = touched.find(
      (t) =>
        t.key === normWant ||
        t.key.endsWith(`/${normWant}`) ||
        normWant.endsWith(`/${t.key}`) ||
        t.displayBase.toLowerCase() === baseWant
    );
    if (match?.snippet) {
      return {
        ok: true,
        relPath: match.filePath,
        content: '',
        diffPatch: match.snippet,
        lineCount: 0,
        startLine: parsed.startLine || 0,
        endLine: parsed.endLine || 0,
        fallbackOnly: true
      };
    }
    return {
      ok: false,
      relPath: parsed.filePath,
      error: S.isHeadlessBrowser
        ? 'Live workstation bridge preview ready when connected to :4318 or Edge WS.'
        : 'Connect to workstation bridge (:4318 or Edge WS) to stream full file contents.'
    };
  }

  const filePreviewInFlightKeys = new Set();

  async function reassembleChunkedDeliverable(firstPayload, rawTarget, sid, wsId, effectiveLocalBase, allowProbeHttp, targetDeviceId) {
    const chunks = [];
    const firstBytes = Uint8Array.from(atob(firstPayload.chunkBase64 || ''), (c) => c.charCodeAt(0));
    chunks.push(firstBytes);
    let offset = Number(firstPayload.nextOffset || firstBytes.length);
    const total = Number(firstPayload.totalBytes || firstBytes.length);
    let safety = 0;
    while (offset < total && safety < 24) {
      safety += 1;
      let part = null;
      if (!S.isHeadlessBrowser && S.edgeWsAuthed && S.edgeWs && S.edgeWs.readyState === 1) {
        const rpcOut = await S.sendWsRpc(
          S.edgeWs,
          {
            type: 'rpc_cmd',
            targetDeviceId,
            cmd: {
              type: 'getDeliverableChunk',
              path: rawTarget,
              sessionId: sid,
              workspaceId: wsId,
              offset,
              length: 512 * 1024,
              channel: firstPayload.channel || 'sandboxed'
            }
          },
          15000
        );
        part = rpcOut?.result && typeof rpcOut.result === 'object' ? rpcOut.result : rpcOut;
      }
      if (!part || !part.ok || !part.chunkBase64) break;
      const b = Uint8Array.from(atob(part.chunkBase64), (c) => c.charCodeAt(0));
      chunks.push(b);
      offset = Number(part.nextOffset || offset + b.length);
      if (part.done || b.length === 0) break;
    }
    const mergedLen = chunks.reduce((a, b) => a + b.length, 0);
    const merged = new Uint8Array(mergedLen);
    let pos = 0;
    for (const c of chunks) {
      merged.set(c, pos);
      pos += c.length;
    }
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(merged);
    return {
      ...firstPayload,
      chunked: false,
      sandboxedHtml: decoded,
      sourceHtml: firstPayload.sourceHtml || decoded
    };
  }

  async function fetchDeliverablePreview(rawTarget, activeRow = null, opts = {}) {
    const parsed = parsePreviewTargetClient(rawTarget);
    const kind = getDeliverableKindClient(parsed.filePath);
    if (!parsed.filePath || !kind) return null;
    const page = Math.max(1, Number(opts.page || 1));
    const forceRefresh = Boolean(opts.forceRefresh);
    const sid = String(activeRow?.id || S.prefs.selectedThreadId || '').trim();
    const matchedRow = activeRow || (S.appState?.rows || []).find((r) => r && r.id === sid) || null;
    const wsCtx = resolveSessionWorkspaceContext(matchedRow, S.threadsCache[sid] || null);
    const wsId = wsCtx.wsId;
    const rpcWsId = wsCtx.rpcWsId;
    const cacheKey = `${sid || wsId || 'global'}::${parsed.filePath.replace(/\\/g, '/')}`;
    const pageKey = `${cacheKey}::p${page}`;

    if (!forceRefresh) {
      if (kind === 'pdf' || kind === 'pptx') {
        const cachedPage = deliverablePageCache.get(pageKey);
        if (cachedPage && cachedPage.ok) return cachedPage;
      } else {
        const cachedDoc = deliverablePreviewCache.get(cacheKey);
        if (cachedDoc && cachedDoc.ok) return cachedDoc;
      }
    }

    const seq = (opts.backgroundPrefetch || opts.batchRender) ? inspectorFetchSeq : ++inspectorFetchSeq;
    const targetDeviceId = matchedRow?.deviceId || '';
    const isRemote = Boolean(targetDeviceId && S.localWsDevice?.id && targetDeviceId !== S.localWsDevice.id);
    const effectiveLocalBase =
      S.connMode === 'local' && S.localBridgeBase && !isRemote
        ? S.localBridgeBase
        : !isRemote && S.prefs.customBridgeUrl
          ? String(S.prefs.customBridgeUrl).trim().replace(/\/+$/, '')
          : '';
    const allowProbeHttp =
      !S.isHeadlessBrowser || Boolean(S.prefs.customBridgeUrl) || Boolean(window.__THEO_ALLOW_PROBE_MOCK_FETCH);

    deliverableInFlightKeys.add(pageKey);
    let result = null;
    try {
      if (effectiveLocalBase && allowProbeHttp) {
        try {
          const q = `path=${encodeURIComponent(parsed.filePath)}&sessionId=${encodeURIComponent(sid)}&workspaceId=${encodeURIComponent(rpcWsId)}&page=${page}`;
          const res = await S.authFetchLocal(`${effectiveLocalBase}/api/deliverable-preview?${q}`);
          const data = await res.json().catch(() => null);
          if (data && typeof data === 'object') result = data;
        } catch {}
      }

      if (!result && !S.isHeadlessBrowser && S.edgeWsAuthed && S.edgeWs && S.edgeWs.readyState === 1) {
        try {
          const rpcOut = await S.sendWsRpc(
            S.edgeWs,
            {
              type: 'rpc_cmd',
              targetDeviceId,
              cmd: {
                type: 'getDeliverablePreview',
                path: parsed.filePath,
                sessionId: sid,
                workspaceId: rpcWsId,
                page,
                transport: 'ws'
              }
            },
            28000
          );
          const payload = rpcOut?.result && typeof rpcOut.result === 'object' ? rpcOut.result : rpcOut;
          if (payload && typeof payload === 'object' && ('ok' in payload || 'error' in payload)) {
            if (payload.ok && payload.chunked && payload.kind === 'html') {
              result = await reassembleChunkedDeliverable(
                payload,
                parsed.filePath,
                sid,
                rpcWsId,
                effectiveLocalBase,
                allowProbeHttp,
                targetDeviceId
              );
            } else {
              result = payload;
            }
          }
        } catch {}
      }

      if ((!result || !result.ok) && !opts.backgroundPrefetch) {
        const vaultRes = await fetchDeliverableFromVaultR2(parsed.filePath, kind, matchedRow);
        if (vaultRes && vaultRes.ok) {
          result = vaultRes;
        }
      }

      if (!result) {
        result = {
          ok: false,
          kind,
          file: parsed.displayBase,
          relPath: parsed.filePath,
          error: S.isHeadlessBrowser
            ? 'Live deliverable preview ready when connected to :4318 or Edge WS.'
            : 'Connect to workstation bridge (:4318 or Edge WS) or sync to Memory Vault to preview.'
        };
      }
    } finally {
      deliverableInFlightKeys.delete(pageKey);
    }

    if (result) {
      if (result.ok || !deliverablePreviewCache.has(cacheKey)) {
        if (deliverablePreviewCache.size >= 24 && !deliverablePreviewCache.has(cacheKey)) {
          const oldest = deliverablePreviewCache.keys().next().value;
          if (oldest) deliverablePreviewCache.delete(oldest);
        }
        deliverablePreviewCache.set(cacheKey, result);
      }
      if (kind === 'pdf' || kind === 'pptx') {
        if (deliverablePageCache.size >= 80 && !deliverablePageCache.has(pageKey)) {
          const oldestP = deliverablePageCache.keys().next().value;
          if (oldestP) deliverablePageCache.delete(oldestP);
        }
        deliverablePageCache.set(pageKey, result);
      }
    }

    if (
      !opts.backgroundPrefetch &&
      (seq === inspectorFetchSeq || opts.batchRender) &&
      S.prefs.inspectorOpen &&
      S.prefs.activeTab === 'chat' &&
      sid === String(S.prefs.selectedThreadId || '').trim()
    ) {
      const activeParsed = parsePreviewTargetClient(activeInspectorFileTarget);
      if (activeParsed.filePath.replace(/\\/g, '/').toLowerCase() === parsed.filePath.replace(/\\/g, '/').toLowerCase()) {
        const td = S.threadsCache[sid] || null;
        const msgs = S.coalesceThreadMessages(td?.messages || []);
        const provKey = (td?.provider || matchedRow?.provider) === 'claude' ? 'claude' : 'antigravity';
        renderSplitInspector(matchedRow, td, msgs, provKey, S.isNewSessionMode(), true);
      }
    }

    if (
      !opts.backgroundPrefetch &&
      !opts.batchRender &&
      result &&
      result.ok &&
      (kind === 'pdf' || kind === 'pptx') &&
      Number(result.pageCount || 0) > page &&
      !result.blobUrl &&
      !deliverablePageCache.has(`${cacheKey}::p${page + 1}`) &&
      !deliverableInFlightKeys.has(`${cacheKey}::p${page + 1}`)
    ) {
      fetchDeliverablePreview(rawTarget, matchedRow, { page: page + 1, backgroundPrefetch: true }).catch(() => {});
    }

    return result;
  }

  async function openActiveDeliverableInApp(rawTarget, activeRow = null) {
    const parsed = parsePreviewTargetClient(rawTarget);
    if (!parsed.filePath) return;
    const sid = String(activeRow?.id || S.prefs.selectedThreadId || '').trim();
    const matchedRow = activeRow || (S.appState?.rows || []).find((r) => r && r.id === sid) || null;
    const rpcWsId = resolveSessionWorkspaceContext(matchedRow, S.threadsCache[sid] || null).rpcWsId;
    const targetDeviceId = matchedRow?.deviceId || '';
    const isRemote = Boolean(targetDeviceId && S.localWsDevice?.id && targetDeviceId !== S.localWsDevice.id);
    const effectiveLocalBase =
      S.connMode === 'local' && S.localBridgeBase && !isRemote
        ? S.localBridgeBase
        : !isRemote && S.prefs.customBridgeUrl
          ? String(S.prefs.customBridgeUrl).trim().replace(/\/+$/, '')
          : '';
    let out = null;
    if (effectiveLocalBase) {
      try {
        const res = await S.authFetchLocal(`${effectiveLocalBase}/api/open-deliverable-app`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: parsed.filePath, sessionId: sid, workspaceId: rpcWsId })
        });
        out = await res.json().catch(() => null);
      } catch {}
    } else if (!S.isHeadlessBrowser && S.edgeWsAuthed && S.edgeWs && S.edgeWs.readyState === 1) {
      try {
        const rpcOut = await S.sendWsRpc(
          S.edgeWs,
          {
            type: 'rpc_cmd',
            targetDeviceId,
            cmd: { type: 'openDeliverableApp', path: parsed.filePath, sessionId: sid, workspaceId: rpcWsId }
          },
          10000
        );
        out = rpcOut?.result && typeof rpcOut.result === 'object' ? rpcOut.result : rpcOut;
      } catch {}
    }
    if (out && out.ok) {
      S.showToast(`Opened ${out.file || parsed.displayBase} on host`);
    } else {
      S.showToast(out?.error || 'Connect to workstation bridge to open desktop app');
    }
  }

  async function exportActiveDeliverable(rawTarget, activeRow = null) {
    const parsed = parsePreviewTargetClient(rawTarget);
    if (!parsed.filePath) return;
    const sid = String(activeRow?.id || S.prefs.selectedThreadId || '').trim();
    const matchedRow = activeRow || (S.appState?.rows || []).find((r) => r && r.id === sid) || null;
    const wsCtx = resolveSessionWorkspaceContext(matchedRow, S.threadsCache[sid] || null);
    const wsId = wsCtx.wsId;
    const rpcWsId = wsCtx.rpcWsId;
    const cacheKey = `${sid || wsId || 'global'}::${parsed.filePath.replace(/\\/g, '/')}`;
    const cached = deliverablePreviewCache.get(cacheKey);
    const targetDeviceId = matchedRow?.deviceId || '';
    const isRemote = Boolean(targetDeviceId && S.localWsDevice?.id && targetDeviceId !== S.localWsDevice.id);
    const effectiveLocalBase =
      S.connMode === 'local' && S.localBridgeBase && !isRemote
        ? S.localBridgeBase
        : !isRemote && S.prefs.customBridgeUrl
          ? String(S.prefs.customBridgeUrl).trim().replace(/\/+$/, '')
          : '';

    let blob = null;
    let fileName = cached?.file || parsed.displayBase || 'deliverable';
    if (cached?.rawBytes instanceof Uint8Array) {
      fileName = cached?.downloadFile || cached?.file || parsed.displayBase || 'deliverable';
      blob = new Blob([cached.rawBytes], { type: cached?.rawMime || 'application/octet-stream' });
    } else if (effectiveLocalBase) {
      try {
        const q = `path=${encodeURIComponent(parsed.filePath)}&sessionId=${encodeURIComponent(sid)}&workspaceId=${encodeURIComponent(rpcWsId)}`;
        const res = await S.authFetchLocal(`${effectiveLocalBase}/api/deliverable-raw?${q}`);
        if (res.ok) {
          blob = await res.blob();
        }
      } catch {}
    } else if (!S.isHeadlessBrowser && S.edgeWsAuthed && S.edgeWs && S.edgeWs.readyState === 1) {
      try {
        const chunks = [];
        let offset = 0;
        for (let i = 0; i < 48; i++) {
          const rpcOut = await S.sendWsRpc(
            S.edgeWs,
            {
              type: 'rpc_cmd',
              targetDeviceId,
              cmd: { type: 'getDeliverableChunk', path: parsed.filePath, sessionId: sid, workspaceId: rpcWsId, offset, length: 512 * 1024, channel: 'raw' }
            },
            15000
          );
          const part = rpcOut?.result && typeof rpcOut.result === 'object' ? rpcOut.result : rpcOut;
          if (!part || !part.ok || !part.chunkBase64) break;
          const b = Uint8Array.from(atob(part.chunkBase64), (c) => c.charCodeAt(0));
          chunks.push(b);
          offset = Number(part.nextOffset || offset + b.length);
          if (part.done || b.length === 0) break;
        }
        if (chunks.length) blob = new Blob(chunks, { type: 'application/octet-stream' });
      } catch {}
    }
    if (!blob && cached?.sourceHtml) {
      blob = new Blob([cached.sourceHtml], { type: 'text/html;charset=utf-8' });
    }
    if (!blob) {
      S.showToast('Connect to bridge or Vault to download this file');
      return;
    }

    const prefersShare =
      Boolean(window.navigator?.standalone) ||
      Boolean(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      Boolean(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    if (prefersShare && typeof navigator.share === 'function') {
      try {
        const fileObj = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
        if (!navigator.canShare || navigator.canShare({ files: [fileObj] })) {
          await navigator.share({ files: [fileObj], title: fileName });
          return;
        }
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }

    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => { try { URL.revokeObjectURL(u); } catch {} }, 1500);
  }

  async function fetchSafeFilePreview(rawTarget, activeRow = null, forceRefresh = false) {
    const parsed = parsePreviewTargetClient(rawTarget);
    if (!parsed.filePath) return null;
    const sid = String(activeRow?.id || S.prefs.selectedThreadId || '').trim();
    const matchedRow = activeRow || (S.appState?.rows || []).find((r) => r && r.id === sid) || null;
    const wsCtx = resolveSessionWorkspaceContext(matchedRow, S.threadsCache[sid] || null);
    const wsId = wsCtx.wsId;
    const rpcWsId = wsCtx.rpcWsId;
    const cacheKey = `${sid || wsId || 'global'}::${parsed.filePath.replace(/\\/g, '/')}`;
    const seq = ++inspectorFetchSeq;
    if (!forceRefresh && filePreviewCache.has(cacheKey)) {
      return filePreviewCache.get(cacheKey);
    }

    const targetDeviceId = matchedRow?.deviceId || '';
    const isRemote = Boolean(targetDeviceId && S.localWsDevice?.id && targetDeviceId !== S.localWsDevice.id);
    let result = null;

    const effectiveLocalBase =
      S.connMode === 'local' && S.localBridgeBase && !isRemote
        ? S.localBridgeBase
        : !isRemote && S.prefs.customBridgeUrl
          ? String(S.prefs.customBridgeUrl).trim().replace(/\/+$/, '')
          : '';
    const allowProbeHttp =
      !S.isHeadlessBrowser || Boolean(S.prefs.customBridgeUrl) || Boolean(window.__THEO_ALLOW_PROBE_MOCK_FETCH);

    filePreviewInFlightKeys.add(cacheKey);
    try {
      if (effectiveLocalBase && allowProbeHttp) {
        try {
          const q = `path=${encodeURIComponent(rawTarget)}&sessionId=${encodeURIComponent(sid)}&workspaceId=${encodeURIComponent(rpcWsId)}`;
          const res = await S.authFetchLocal(`${effectiveLocalBase}/api/file-preview?${q}`);
          const data = await res.json().catch(() => null);
          if (data && typeof data === 'object') {
            result = data;
          }
        } catch {}
      }

      if (!result && !S.isHeadlessBrowser && S.edgeWsAuthed && S.edgeWs && S.edgeWs.readyState === 1) {
        try {
          const rpcOut = await S.sendWsRpc(
            S.edgeWs,
            {
              type: 'rpc_cmd',
              targetDeviceId,
              cmd: { type: 'getFilePreview', path: rawTarget, sessionId: sid, workspaceId: rpcWsId }
            },
            6500
          );
          const payload = rpcOut?.result && typeof rpcOut.result === 'object' ? rpcOut.result : rpcOut;
          if (payload && typeof payload === 'object' && ('ok' in payload || 'content' in payload || 'error' in payload)) {
            result = payload;
          }
        } catch {}
      }

      if (!result) {
        result = buildOfflinePreviewFallback(parsed, matchedRow);
      }
    } finally {
      filePreviewInFlightKeys.delete(cacheKey);
    }

    if (seq === inspectorFetchSeq || !filePreviewCache.has(cacheKey)) {
      if (filePreviewCache.size >= 40 && !filePreviewCache.has(cacheKey)) {
        const oldest = filePreviewCache.keys().next().value;
        if (oldest) filePreviewCache.delete(oldest);
      }
      filePreviewCache.set(cacheKey, result);
    }

    const activeParsed = parsePreviewTargetClient(activeInspectorFileTarget);
    if (
      seq === inspectorFetchSeq &&
      S.prefs.inspectorOpen &&
      S.prefs.activeTab === 'chat' &&
      sid === String(S.prefs.selectedThreadId || '').trim() &&
      activeParsed.filePath.replace(/\\/g, '/').toLowerCase() === parsed.filePath.replace(/\\/g, '/').toLowerCase()
    ) {
      const td = S.threadsCache[sid] || null;
      const msgs = S.coalesceThreadMessages(td?.messages || []);
      const provKey = (td?.provider || matchedRow?.provider) === 'claude' ? 'claude' : 'antigravity';
      renderSplitInspector(matchedRow, td, msgs, provKey, S.isNewSessionMode(), true);
    }
    return result;
  }

  const studioCapabilitiesCache = new Map();
  const studioCapInFlightKeys = new Set();
  const studioCheckResultsById = new Map();
  let studioCapFetchSeq = 0;
  let studioCheckBusy = false;

  function resolveSessionWorkspaceContext(activeRow = null, threadDetail = null) {
    const wsList = Array.isArray(S.appState?.workspaces) ? S.appState.workspaces : [];
    const activeWorkspaces = wsList.filter(
      (w) => w && !w.retired && !S.RETIRED_WORKSPACE_IDS.has(String(w.id || ''))
    );
    const pool = activeWorkspaces.length ? activeWorkspaces : wsList;
    const normSlashes = (p) => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    const matchWsByHint = (hint) => {
      const raw = String(hint || '').replace(/^Scope:\s*/i, '').trim();
      if (!raw) return null;
      const low = raw.toLowerCase();
      if (['workspace', 'bhfirms workspace', 'session', 'task session', 'claude desktop', 'default', 'auto'].includes(low)) {
        return null;
      }
      const normRaw = normSlashes(raw);
      // 1. Direct id / name / full path match
      let matched = pool.find((w) => {
        const wPath = normSlashes(w.path);
        return (
          String(w.id || '').toLowerCase() === low ||
          String(w.name || '').toLowerCase() === low ||
          (wPath && (normRaw === wPath || normRaw.startsWith(`${wPath}/`) || wPath.endsWith(`/${low}`)))
        );
      });
      if (matched) return matched;
      // 2. Match /bhfirms/<dir> segment from cwd strings even across host junctions (e.g. ~/bhfirms/theo-hub)
      const bhMatch = normRaw.match(/(?:^|\/)bhfirms\/([^/]+)/i);
      if (bhMatch && bhMatch[1]) {
        const seg = bhMatch[1].toLowerCase();
        const alias = seg === 'memory' ? 'theo-memory' : seg === 'command' ? 'planner' : seg;
        matched = pool.find(
          (w) =>
            String(w.id || '').toLowerCase() === alias ||
            String(w.id || '').toLowerCase() === seg ||
            normSlashes(w.path).endsWith(`/${seg}`)
        );
        if (matched) return matched;
        if (!S.RETIRED_WORKSPACE_IDS.has(alias)) {
          return { id: alias, name: alias, branch: 'main', dirtyCount: 0, modifiedFiles: [], recentCommits: [] };
        }
      }
      return null;
    };

    const isDraft = activeRow ? activeRow.id === '__new__' : S.isNewSessionMode();
    if (isDraft) {
      const mPref = matchWsByHint(S.prefs.composerRepoPrefix);
      const fb = mPref || pool.find((w) => w.id === 'isabi-app') || pool[0] || null;
      const id = fb?.id || String(S.prefs.composerRepoPrefix || '').trim() || 'isabi-app';
      return { wsId: id, rpcWsId: id, matchedWs: fb };
    }

    const sid = S.cleanTargetThreadId(activeRow?.id || S.prefs.selectedThreadId || '');
    const td = threadDetail || (sid ? S.threadsCache[sid] : null);
    const candidates = [
      activeRow?.workspaceId,
      td?.workspaceId,
      activeRow?.cwd,
      td?.cwd,
      activeRow?.folder,
      td?.folder
    ];
    // Pass 1: resolve against registered active workspaces across all metadata fields first.
    for (const cand of candidates) {
      const m = matchWsByHint(cand);
      if (m && m.id && !S.RETIRED_WORKSPACE_IDS.has(m.id)) {
        return { wsId: m.id, rpcWsId: m.id, matchedWs: m };
      }
    }
    // Pass 2: accept a clean single-token workspace slug only when no registered workspace matched.
    for (const cand of candidates) {
      const cleanCand = String(cand || '').replace(/^Scope:\s*/i, '').trim();
      if (
        cleanCand &&
        /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(cleanCand) &&
        !['workspace', 'session', 'default', 'auto'].includes(cleanCand.toLowerCase()) &&
        !S.RETIRED_WORKSPACE_IDS.has(cleanCand.toLowerCase())
      ) {
        return { wsId: cleanCand, rpcWsId: cleanCand, matchedWs: null };
      }
    }

    // No client-side workspace hint on this session: pass empty workspaceId so the host resolves thread.cwd directly.
    return { wsId: 'auto', rpcWsId: '', matchedWs: null };
  }

  function resolveStudioWorkspaceId(activeRow = null) {
    return resolveSessionWorkspaceContext(activeRow, null).wsId;
  }

  function buildOfflineStudioCapabilitiesFallback(wsId, activeRow = null) {
    const wsList = Array.isArray(S.appState?.workspaces) ? S.appState.workspaces : [];
    const activeList = wsList.filter(
      (w) => w && !w.retired && !S.RETIRED_WORKSPACE_IDS.has(String(w.id || ''))
    );
    const pool = activeList.length ? activeList : wsList;
    const cleanWs = wsId && wsId !== 'auto' ? wsId : '';
    const folderClean = String(activeRow?.folder || '').replace(/^Scope:\s*/i, '').trim();
    const wsObj =
      (cleanWs && pool.find((w) => w && (w.id === cleanWs || w.name === cleanWs))) ||
      pool.find((w) => w && w.id === 'isabi-app') ||
      pool[0] || {
        id: cleanWs || 'theo',
        name: folderClean || cleanWs || 'Workspace',
        branch: 'main',
        dirtyCount: 0,
        modifiedFiles: [],
        recentCommits: []
      };
    return {
      ok: true,
      workspace: wsObj,
      checks: [
        { id: 'git:status', label: 'Git Status & Branch', category: 'git', commandPreview: 'git status --short --branch' },
        { id: 'git:diff-stat', label: 'Git Diff Summary', category: 'git', commandPreview: 'git diff --stat' },
        { id: 'syntax:js-all', label: 'Syntax Check · All JS', category: 'lint', commandPreview: 'node --check js/*.js' }
      ],
      ports: [],
      fallbackOnly: true
    };
  }

  async function fetchStudioCapabilities(activeRow = null, forceRefresh = false) {
    const sid = String(activeRow?.id || S.prefs.selectedThreadId || '').trim();
    const matchedRow = activeRow || (S.appState?.rows || []).find((r) => r && r.id === sid) || null;
    const wsCtx = resolveSessionWorkspaceContext(matchedRow, S.threadsCache[sid] || null);
    const wsId = wsCtx.wsId;
    const rpcWsId = wsCtx.rpcWsId;
    const cacheKey = `${sid || 'global'}::${wsId}`;
    const seq = ++studioCapFetchSeq;
    if (!forceRefresh && studioCapabilitiesCache.has(cacheKey)) {
      return studioCapabilitiesCache.get(cacheKey);
    }

    const targetDeviceId = matchedRow?.deviceId || '';
    const isRemote = Boolean(targetDeviceId && S.localWsDevice?.id && targetDeviceId !== S.localWsDevice.id);
    const effectiveLocalBase =
      S.connMode === 'local' && S.localBridgeBase && !isRemote
        ? S.localBridgeBase
        : !isRemote && S.prefs.customBridgeUrl
          ? String(S.prefs.customBridgeUrl).trim().replace(/\/+$/, '')
          : '';
    const allowProbeHttp =
      !S.isHeadlessBrowser || Boolean(S.prefs.customBridgeUrl) || Boolean(window.__THEO_ALLOW_PROBE_MOCK_FETCH);

    let result = null;
    studioCapInFlightKeys.add(cacheKey);
    try {
      if (effectiveLocalBase && allowProbeHttp) {
        try {
          const q = `workspaceId=${encodeURIComponent(rpcWsId)}&sessionId=${encodeURIComponent(sid)}&diff=1`;
          const res = await S.authFetchLocal(`${effectiveLocalBase}/api/studio-capabilities?${q}`);
          const data = await res.json().catch(() => null);
          if (data && typeof data === 'object' && data.ok) {
            result = data;
          }
        } catch {}
      }

      if (!result && !S.isHeadlessBrowser && S.edgeWsAuthed && S.edgeWs && S.edgeWs.readyState === 1) {
        try {
          const rpcOut = await S.sendWsRpc(
            S.edgeWs,
            {
              type: 'rpc_cmd',
              targetDeviceId,
              cmd: { type: 'getStudioCapabilities', workspaceId: rpcWsId, sessionId: sid, includeDiff: true }
            },
            7000
          );
          const payload = rpcOut?.result && typeof rpcOut.result === 'object' ? rpcOut.result : rpcOut;
          if (payload && typeof payload === 'object' && payload.ok) {
            result = payload;
          }
        } catch {}
      }

      if (!result) {
        result = buildOfflineStudioCapabilitiesFallback(wsId, matchedRow);
      }
    } finally {
      studioCapInFlightKeys.delete(cacheKey);
    }

    if (seq === studioCapFetchSeq || !studioCapabilitiesCache.has(cacheKey)) {
      if (studioCapabilitiesCache.size >= 24 && !studioCapabilitiesCache.has(cacheKey)) {
        const oldest = studioCapabilitiesCache.keys().next().value;
        if (oldest) studioCapabilitiesCache.delete(oldest);
      }
      studioCapabilitiesCache.set(cacheKey, result);
    }

    if (
      seq === studioCapFetchSeq &&
      S.prefs.inspectorOpen &&
      S.prefs.activeTab === 'chat' &&
      sid === String(S.prefs.selectedThreadId || '').trim() &&
      ['files', 'git', 'tasks'].includes(S.prefs.inspectorTab)
    ) {
      const td = S.threadsCache[sid] || null;
      const msgs = S.coalesceThreadMessages(td?.messages || []);
      const provKey = (td?.provider || matchedRow?.provider) === 'claude' ? 'claude' : 'antigravity';
      renderSplitInspector(matchedRow, td, msgs, provKey, S.isNewSessionMode(), true);
    }
    return result;
  }

  async function executeStudioCheck(checkId, activeRow = null) {
    if (S.isPinLocked() || studioCheckBusy) return null;
    const cleanId = String(checkId || '').trim();
    if (!cleanId) return null;
    S.recordFreqUsage('checks', cleanId);
    const sid = String(activeRow?.id || S.prefs.selectedThreadId || '').trim();
    const matchedRow = activeRow || (S.appState?.rows || []).find((r) => r && r.id === sid) || null;
    const wsCtx = resolveSessionWorkspaceContext(matchedRow, S.threadsCache[sid] || null);
    const wsId = wsCtx.wsId;
    const rpcWsId = wsCtx.rpcWsId;
    const checkResKey = `${wsId}::${cleanId}`;
    const targetDeviceId = matchedRow?.deviceId || '';
    const isRemote = Boolean(targetDeviceId && S.localWsDevice?.id && targetDeviceId !== S.localWsDevice.id);
    const effectiveLocalBase =
      S.connMode === 'local' && S.localBridgeBase && !isRemote
        ? S.localBridgeBase
        : !isRemote && S.prefs.customBridgeUrl
          ? String(S.prefs.customBridgeUrl).trim().replace(/\/+$/, '')
          : '';
    const allowProbeHttp =
      !S.isHeadlessBrowser || Boolean(S.prefs.customBridgeUrl) || Boolean(window.__THEO_ALLOW_PROBE_MOCK_FETCH);

    studioCheckBusy = true;
    studioCheckResultsById.set(checkResKey, { running: true, checkId: cleanId, output: 'Running check…' });
    S.renderChatView(false);

    try {
      let result = null;
      if (effectiveLocalBase && allowProbeHttp) {
        try {
          const res = await S.authFetchLocal(`${effectiveLocalBase}/api/studio-check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workspaceId: rpcWsId, sessionId: sid, checkId: cleanId })
          });
          const data = await res.json().catch(() => null);
          result = data || { ok: false, status: res.status, error: `HTTP ${res.status}` };
        } catch (err) {
          result = { ok: false, error: err?.message || 'Check request failed' };
        }
      } else if (!S.isHeadlessBrowser && S.edgeWsAuthed && S.edgeWs && S.edgeWs.readyState === 1) {
        try {
          const rpcOut = await S.sendWsRpc(
            S.edgeWs,
            {
              type: 'rpc_cmd',
              targetDeviceId,
              cmd: { type: 'runStudioCheck', workspaceId: rpcWsId, sessionId: sid, checkId: cleanId }
            },
            22000
          );
          result = rpcOut?.result && typeof rpcOut.result === 'object' ? rpcOut.result : rpcOut;
        } catch (err) {
          result = { ok: false, error: err?.message || 'Edge RPC check failed' };
        }
      } else {
        result = {
          ok: false,
          error: 'Connect to workstation bridge (:4318 or Edge WS) to execute live checks.'
        };
      }
      studioCheckResultsById.set(checkResKey, result);
      return result;
    } finally {
      studioCheckBusy = false;
      S.renderChatView(false);
    }
  }

  function renderSplitWatchPane() {
    return S.runViewBoundary(
      'split-watch',
      'Split-Watch',
      {
        elId: 'chat-split-watch-pane',
        hideElId: 'chat-split-watch-pane',
        mode: 'replace',
        whenVisibleOnly: () => Boolean(S.prefs.splitWatchOpen)
      },
      () => {
    const paneEl = S.$('chat-split-watch-pane');
    const btnEl = S.$('btn-split-watch');
    if (btnEl) {
      btnEl.classList.toggle('active', Boolean(S.prefs.splitWatchOpen));
      btnEl.setAttribute('aria-pressed', S.prefs.splitWatchOpen ? 'true' : 'false');
    }
    if (!paneEl) return;
    if (!S.prefs.splitWatchOpen) {
      paneEl.hidden = true;
      return;
    }

    const allRows = (S.appState?.rows || []).filter((r) => r && r.id && !r.archived && r.id !== S.prefs.selectedThreadId);
    const rankedRows = S.rankByFreq(
      allRows,
      'threads',
      (r) => r.id,
      (r) => (S.isSessionActivelyRunning(r.id) ? 500 : r.status === 'waiting' ? 350 : 0)
    );
    if (!S.prefs.splitWatchThreadId || S.prefs.splitWatchThreadId === S.prefs.selectedThreadId || !rankedRows.some((r) => r.id === S.prefs.splitWatchThreadId)) {
      S.prefs.splitWatchThreadId = rankedRows[0]?.id || '';
    }
    const watchedId = S.prefs.splitWatchThreadId;
    const watchedRow = rankedRows.find((r) => r.id === watchedId) || null;
    const watchedDetail = watchedId ? S.threadsCache[watchedId] || null : null;
    if (watchedId && !watchedDetail) {
      S.fetchThreadDetail(watchedId, watchedRow?.provider || '').catch(() => {});
    }
    const watchedMsgs = S.coalesceThreadMessages(watchedDetail?.messages || []);
    const isRunning = watchedId ? S.isSessionActivelyRunning(watchedId) : false;

    const optsHtml = rankedRows.length
      ? rankedRows
          .map(
            (r) =>
              `<option value="${S.esc(r.id)}" ${r.id === watchedId ? 'selected' : ''}>${S.isSessionActivelyRunning(r.id) ? '◎ ' : ''}${S.esc(r.title || r.id)} (${r.provider === 'claude' ? 'Claude' : 'AGY'})</option>`
          )
          .join('')
      : `<option value="">No secondary session available</option>`;

    const turnsHtml = watchedMsgs.length
      ? watchedMsgs
          .slice(-6)
          .map((m) => {
            const roleLbl = m.role === 'user' ? 'You' : watchedRow?.provider === 'claude' ? 'Claude' : 'Antigravity';
            const rawSnippet =
              m.role === 'user'
                ? S.cleanUserPromptPreview(m.text)
                : m.role === 'checkpoint'
                  ? S.cleanCheckpointPreview(m.text)
                  : String(m.text || m.thinking || '');
            const snippet = String(rawSnippet || '')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 260);
            const stepsCnt = Array.isArray(m.toolCalls) ? m.toolCalls.length : 0;
            return `
              <div class="split-watch-turn${m.role === 'user' ? ' is-user' : ''}">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:3px">
                  <strong style="font-size:11px;color:var(--text-heading)">${S.esc(roleLbl)}</strong>
                  ${stepsCnt > 0 ? `<span class="meta-timestamp tabular">${stepsCnt} step${stepsCnt === 1 ? '' : 's'}</span>` : ''}
                </div>
                <div style="color:var(--text-secondary)">${S.esc(snippet || (stepsCnt > 0 ? 'Executing workspace tool steps…' : 'Ready.'))}</div>
              </div>
            `;
          })
          .join('')
      : `<div class="insp-empty">Monitoring <strong style="color:var(--text-heading)">${S.esc(watchedRow?.title || 'Secondary Session')}</strong>.${isRunning ? ' Active turn in progress…' : ''}</div>`;

    paneEl.hidden = false;
    const existingBody = paneEl.querySelector('.split-watch-body');
    if (document.activeElement?.id === 'split-watch-session-select' && existingBody) {
      existingBody.innerHTML = turnsHtml;
      return;
    }
    paneEl.innerHTML = `
      <div class="split-watch-head">
        <select id="split-watch-session-select" class="split-watch-select" aria-label="Select secondary session to monitor">${optsHtml}</select>
        ${watchedId ? `<button type="button" class="insp-mini-btn" id="btn-split-watch-swap" data-split-watch-swap="${S.esc(watchedId)}">⇄ Swap</button>` : ''}
        <button type="button" class="icon-btn-sm" id="btn-split-watch-close" data-split-watch-close="1" aria-label="Close Split Watch">✕</button>
      </div>
      <div class="split-watch-body">${turnsHtml}</div>
    `;
      }
    );
  }

  function setInspectorOpen(openBool, tab = '', opts = {}) {
    if (S.isPinLocked()) return;
    S.prefs.inspectorOpen = Boolean(openBool);
    if (!S.prefs.inspectorOpen || opts.fileTarget !== undefined) {
      ++inspectorFetchSeq;
      teardownDeliverableInspectorFrames();
    }
    if (tab) {
      const normTab = S.normalizeInspectorTab(tab);
      if (S.prefs.inspectorTab === 'files' && normTab !== 'files') {
        teardownDeliverableInspectorFrames();
      }
      S.prefs.inspectorTab = normTab;
    } else {
      S.prefs.inspectorTab = S.normalizeInspectorTab(S.prefs.inspectorTab);
    }
    if (!S.prefs.inspectorOpen || S.prefs.inspectorTab !== 'files') {
      S.prefs.inspectorFullStage = false;
    }
    if (opts.fileTarget !== undefined) {
      activeInspectorFileTarget = String(opts.fileTarget || '');
      activeDeliverablePage = 1;
      activeDeliverableDeckMode = 'single';
      activeDeliverableZoomPct = 0;
      activeDeliverableSheetIdx = 0;
      if (opts.viewMode && ['preview', 'source', 'diff'].includes(opts.viewMode)) {
        S.prefs.inspectorViewMode = opts.viewMode;
      }
    } else if (
      S.prefs.inspectorOpen &&
      S.prefs.inspectorTab === 'files' &&
      activeInspectorFileTarget &&
      S.prefs.inspectorViewMode !== 'diff'
    ) {
      const parsedCur = parsePreviewTargetClient(activeInspectorFileTarget);
      if (getDeliverableKindClient(parsedCur.filePath) && !parsedCur.startLine && S.prefs.inspectorViewMode === 'source') {
        S.prefs.inspectorViewMode = 'preview';
      }
    }
    if (opts.agentId !== undefined) {
      activeInspectorAgentId = String(opts.agentId || '');
    }
    S.saveJson(S.STORAGE_KEYS.PREFS, S.prefs);
    const sid = S.prefs.selectedThreadId || '';
    const cleanSid = S.cleanTargetThreadId(sid);
    const inspSessKey = S.isNewSessionMode() ? '__new__' : cleanSid || sid;
    if (opts.fileTarget === undefined && inspSessKey && activeInspectorSessionId && inspSessKey !== activeInspectorSessionId) {
      activeInspectorFileTarget = '';
      activeDeliverablePage = 1;
      activeDeliverableDeckMode = 'single';
      activeDeliverableZoomPct = 0;
      activeDeliverableSheetIdx = 0;
      teardownDeliverableInspectorFrames();
      ++inspectorFetchSeq;
    }
    if (inspSessKey) {
      activeInspectorSessionId = inspSessKey;
    }
    const row = (S.appState?.rows || []).find((r) => r && r.id === sid) || null;
    const td = S.isNewSessionMode() ? null : S.threadsCache[sid] || null;
    const msgs = S.coalesceThreadMessages(td?.messages || []);
    const provKey = (td?.provider || row?.provider) === 'claude' ? 'claude' : 'antigravity';
    renderSplitInspector(row, td, msgs, provKey, S.isNewSessionMode(), true);
    if (S.prefs.inspectorOpen && S.prefs.inspectorTab === 'files' && activeInspectorFileTarget) {
      const parsedTgt = parsePreviewTargetClient(activeInspectorFileTarget);
      const dKind = getDeliverableKindClient(parsedTgt.filePath);
      if (dKind && S.prefs.inspectorViewMode === 'preview') {
        fetchDeliverablePreview(activeInspectorFileTarget, row, {
          page: activeDeliverablePage,
          forceRefresh: Boolean(opts.forceRefresh)
        }).catch(() => {});
      } else {
        fetchSafeFilePreview(activeInspectorFileTarget, row, Boolean(opts.forceRefresh)).catch(() => {});
      }
    }
    if (S.prefs.inspectorOpen && ['files', 'git', 'tasks'].includes(S.prefs.inspectorTab)) {
      fetchStudioCapabilities(row, Boolean(opts.forceRefresh)).catch(() => {});
    }
    if (S.prefs.inspectorOpen && S.prefs.inspectorTab === 'tasks' && sid && activeInspectorAgentId) {
      S.fetchBgTaskLiveLog(sid, activeInspectorAgentId, provKey).catch(() => {});
    }
    if (S.prefs.inspectorOpen && sid && !S.isNewSessionMode()) {
      S.emitPrewarmHint(sid, { provider: provKey, source: 'inspector' });
    }
  }

  function formatInspectorDiffHtml(diffText) {
    return String(diffText || '')
      .split('\n')
      .map((ln) => {
        const cls =
          ln.startsWith('+') && !ln.startsWith('+++')
            ? 'add'
            : ln.startsWith('-') && !ln.startsWith('---')
              ? 'del'
              : ln.startsWith('@@')
                ? 'hunk'
                : '';
        return `<span class="insp-diff-ln${cls ? ` ${cls}` : ''}">${S.esc(ln)}</span>`;
      })
      .join('');
  }

  function renderSplitInspector(activeRow, threadDetail, messages, provKey, isNewDraft, skipAutoFetch = false) {
    return S.runViewBoundary(
      'inspector',
      'Inspector',
      {
        elId: 'ide-inspector-body',
        hideElId: 'ide-inspector-pane',
        backdropElId: 'ide-inspector-backdrop',
        mode: 'replace',
        whenVisibleOnly: () => Boolean(S.prefs.inspectorOpen)
      },
      () => {
    const paneEl = S.$('ide-inspector-pane');
    const backdropEl = S.$('ide-inspector-backdrop');
    const toggleBtn = S.$('btn-toggle-inspector');
    const pillBadge = S.$('inspector-pill-count');
    const agentsBadge = S.$('insp-agents-badge');
    const subbarEl = S.$('ide-inspector-subbar');
    const bodyEl = S.$('ide-inspector-body');
    if (!paneEl || !bodyEl) return;

    S.prefs.inspectorTab = S.normalizeInspectorTab(S.prefs.inspectorTab);
    const { allTasks, runningCount } = isNewDraft
      ? { allTasks: [], runningCount: 0 }
      : S.getSessionBackgroundTasks(activeRow, threadDetail);
    const touchedFiles = isNewDraft ? [] : collectSessionTouchedFiles(messages);

    const sid = String(activeRow?.id || S.prefs.selectedThreadId || '').trim();
    const cleanSid = S.cleanTargetThreadId(sid);
    const inspSessKey = isNewDraft ? '__new__' : cleanSid || sid;
    if (inspSessKey && activeInspectorSessionId && inspSessKey !== activeInspectorSessionId) {
      activeInspectorFileTarget = '';
      activeDeliverablePage = 1;
      activeDeliverableDeckMode = 'single';
      activeDeliverableZoomPct = 0;
      activeDeliverableSheetIdx = 0;
      teardownDeliverableInspectorFrames();
      ++inspectorFetchSeq;
    }
    if (inspSessKey) {
      activeInspectorSessionId = inspSessKey;
    }
    const wsCtx = resolveSessionWorkspaceContext(activeRow, threadDetail);
    const wsId = wsCtx.wsId;
    const capCacheKey = `${sid || 'global'}::${wsId}`;
    const studioCap = studioCapabilitiesCache.get(capCacheKey) || null;
    const liveWsFiles = Array.isArray(studioCap?.workspace?.modifiedFiles)
      ? studioCap.workspace.modifiedFiles
      : Array.isArray(wsCtx.matchedWs?.modifiedFiles)
        ? wsCtx.matchedWs.modifiedFiles
        : [];
    const mergedFiles = [...touchedFiles];
    const seenFileKeys = new Set(mergedFiles.map((f) => f.key));
    for (const mf of liveWsFiles) {
      const mPath = String(mf?.path || '').trim();
      if (!mPath) continue;
      const parsedMf = parsePreviewTargetClient(mPath);
      if (!parsedMf.filePath) continue;
      const key = parsedMf.filePath.replace(/\\/g, '/').toLowerCase();
      if (seenFileKeys.has(key)) continue;
      seenFileKeys.add(key);
      mergedFiles.push({
        key,
        target: parsedMf.filePath,
        filePath: parsedMf.filePath,
        displayBase: parsedMf.displayBase,
        isEdit: true,
        gitStatus: String(mf.status || 'M'),
        added: 0,
        removed: 0
      });
    }

    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', S.prefs.inspectorOpen ? 'true' : 'false');
    }
    if (pillBadge) {
      const badgeNum = runningCount > 0 ? runningCount : allTasks.length > 0 ? allTasks.length : mergedFiles.length;
      if (badgeNum > 0) {
        pillBadge.hidden = false;
        pillBadge.textContent = String(badgeNum);
      } else {
        pillBadge.hidden = true;
      }
    }
    if (agentsBadge) {
      if (allTasks.length > 0) {
        agentsBadge.hidden = false;
        agentsBadge.textContent = String(runningCount > 0 ? runningCount : allTasks.length);
      } else {
        agentsBadge.hidden = true;
      }
    }

    document.querySelectorAll('#ide-inspector-tabs [data-insp-tab]').forEach((btn) => {
      const isAct = btn.dataset.inspTab === S.prefs.inspectorTab;
      btn.classList.toggle('active', isAct);
      btn.setAttribute('aria-selected', isAct ? 'true' : 'false');
    });

    if (!S.prefs.inspectorOpen) {
      teardownDeliverableInspectorFrames();
      paneEl.classList.remove('is-deliverable-wide', 'is-full-stage');
      paneEl.hidden = true;
      if (backdropEl) backdropEl.hidden = true;
      if (subbarEl) subbarEl.hidden = true;
      return;
    }

    paneEl.hidden = false;
    if (S.prefs.inspectorTab !== 'files') {
      paneEl.classList.remove('is-deliverable-wide', 'is-full-stage');
    }
    if (backdropEl) {
      backdropEl.hidden = window.innerWidth > 1024;
    }

    if (
      !skipAutoFetch &&
      !studioCap &&
      !studioCapInFlightKeys.has(capCacheKey) &&
      ['files', 'git', 'tasks'].includes(S.prefs.inspectorTab)
    ) {
      fetchStudioCapabilities(activeRow).catch(() => {});
    }

    if (S.prefs.inspectorTab === 'files') {
      if (!activeInspectorFileTarget && mergedFiles.length > 0) {
        activeInspectorFileTarget = mergedFiles[0].target;
      }
      const parsed = parsePreviewTargetClient(activeInspectorFileTarget);
      const cacheKey = parsed.filePath
        ? `${sid || wsId || 'global'}::${parsed.filePath.replace(/\\/g, '/')}`
        : '';
      const deliverableKind = getDeliverableKindClient(parsed.filePath);
      const pageCacheKey = `${cacheKey}::p${activeDeliverablePage}`;
      const cached = cacheKey ? filePreviewCache.get(cacheKey) : null;
      const delivCached =
        deliverableKind === 'pdf' || deliverableKind === 'pptx'
          ? deliverablePageCache.get(pageCacheKey) || deliverablePreviewCache.get(cacheKey)
          : deliverablePreviewCache.get(cacheKey);

      const pillsHtml = mergedFiles.length
        ? `<div class="insp-file-pills">${mergedFiles
            .slice(0, 18)
            .map((tf) => {
              const isCur =
                parsed.filePath &&
                tf.filePath.replace(/\\/g, '/').toLowerCase() ===
                  parsed.filePath.replace(/\\/g, '/').toLowerCase();
              const statSuffix = tf.added || tf.removed
                ? ` <span class="tabular" style="opacity:0.8">${tf.added ? `+${tf.added}` : ''}${tf.removed ? ` -${tf.removed}` : ''}</span>`
                : tf.gitStatus
                  ? ` <span class="tabular" style="opacity:0.75">${S.esc(tf.gitStatus)}</span>`
                  : '';
              return `<button type="button" class="insp-mini-btn${isCur ? ' active' : ''}" data-preview-file="${S.esc(tf.target)}">${S.esc(tf.displayBase)}${statSuffix}</button>`;
            })
            .join('')}</div>`
        : '';

      if (!parsed.filePath) {
        paneEl.classList.remove('is-deliverable-wide', 'is-full-stage');
        if (subbarEl) subbarEl.hidden = true;
        bodyEl.innerHTML = `${pillsHtml}<div class="insp-empty">Click any file chip in the conversation, change-set strip, or Git tab to inspect deliverables (HTML, PDF, PPTX, Excel), view source with <code class="md-inline-code">@L</code> line quoting, or review diffs.</div>`;
        return;
      }

      const displayPath = String(delivCached?.relPath || cached?.relPath || parsed.filePath);
      const rangeSuffix = parsed.startLine
        ? `#L${parsed.startLine}${parsed.endLine > parsed.startLine ? `-L${parsed.endLine}` : ''}`
        : '';
      const diffText = String(cached?.gitDiff ?? cached?.diffPatch ?? cached?.diff ?? '');
      const hasDiff = Boolean(diffText.trim());
      const hasSource = Boolean(
        (cached && cached.ok && typeof cached.content === 'string' && !cached.fallbackOnly) ||
          (delivCached && delivCached.ok && typeof delivCached.sourceHtml === 'string')
      );
      const allowSourceTab = !deliverableKind || deliverableKind === 'html';
      const effectiveMode =
        S.prefs.inspectorViewMode === 'diff' && hasDiff
          ? 'diff'
          : deliverableKind && S.prefs.inspectorViewMode === 'preview'
            ? 'preview'
            : hasSource && allowSourceTab
              ? 'source'
              : hasDiff
                ? 'diff'
                : deliverableKind
                  ? 'preview'
                  : 'source';

      paneEl.classList.toggle('is-deliverable-wide', Boolean(deliverableKind && effectiveMode === 'preview'));
      paneEl.classList.toggle('is-full-stage', Boolean(deliverableKind && effectiveMode === 'preview' && S.prefs.inspectorFullStage));

      if (!skipAutoFetch) {
        if (effectiveMode === 'preview' && deliverableKind) {
          if (!delivCached && !deliverableInFlightKeys.has(pageCacheKey)) {
            fetchDeliverablePreview(activeInspectorFileTarget, activeRow, { page: activeDeliverablePage }).catch(() => {});
          }
        } else if (!cached && !filePreviewInFlightKeys.has(cacheKey)) {
          fetchSafeFilePreview(activeInspectorFileTarget, activeRow).catch(() => {});
        }
      }

      if (subbarEl) {
        subbarEl.hidden = false;
        const previewBtnHtml = deliverableKind
          ? `<button type="button" class="insp-mini-btn${effectiveMode === 'preview' ? ' active' : ''}" data-insp-view-mode="preview">Preview</button>`
          : '';
        const sourceBtnHtml = allowSourceTab
          ? `<button type="button" class="insp-mini-btn${effectiveMode === 'source' ? ' active' : ''}" data-insp-view-mode="source">Source</button>`
          : '';
        const fullStageBtnHtml = deliverableKind
          ? `<button type="button" class="insp-mini-btn${S.prefs.inspectorFullStage ? ' active' : ''}" data-insp-full-stage="1">${S.prefs.inspectorFullStage ? 'Split' : 'Full Stage'}</button>`
          : '';
        const copyOrShareHtml = deliverableKind
          ? `<button type="button" class="insp-mini-btn" data-insp-dlv-export="${S.esc(parsed.filePath)}">${window.navigator?.standalone ? 'Share' : 'Download'}</button>`
          : `<button type="button" class="insp-mini-btn" data-insp-copy-code="${S.esc(cacheKey)}">Copy</button>`;
        subbarEl.innerHTML = `
          <span class="insp-sub-path">
            <span class="insp-sub-path-txt">${S.esc(displayPath)}${S.esc(rangeSuffix)}</span>
          </span>
          <span class="insp-sub-actions">
            ${previewBtnHtml}
            ${sourceBtnHtml}
            <button type="button" class="insp-mini-btn${effectiveMode === 'diff' ? ' active' : ''}" data-insp-view-mode="diff" ${hasDiff ? '' : 'disabled'}>Diff</button>
            ${fullStageBtnHtml}
            <button type="button" class="insp-mini-btn" data-step-mention-file="${S.esc(displayPath)}">@ Mention</button>
            ${!deliverableKind ? `<button type="button" class="insp-mini-btn" data-insp-ask-review="${S.esc(displayPath)}">Ask AI Review</button>` : ''}
            ${copyOrShareHtml}
          </span>
        `;
      }

      if (effectiveMode === 'preview' && deliverableKind) {
        if (!delivCached) {
          bodyEl.innerHTML = `${pillsHtml}<div class="insp-empty">Rendering <span class="mono">${S.esc(displayPath)}</span>…</div>`;
          return;
        }
        const docMeta = deliverablePreviewCache.get(cacheKey);
        if (!delivCached.ok && !(docMeta && docMeta.ok && (deliverableKind === 'pdf' || deliverableKind === 'pptx'))) {
          bodyEl.innerHTML = `${pillsHtml}<div class="insp-empty">${S.esc(delivCached.error || 'Unable to preview deliverable.')}</div>`;
          return;
        }
        if (deliverableKind === 'html') {
          const existingFrame = bodyEl.querySelector('iframe.insp-html-frame');
          if (existingFrame && existingFrame.dataset.dlvKey === cacheKey) {
            return;
          }
          teardownDeliverableInspectorFrames();
          bodyEl.innerHTML = `${pillsHtml}<div class="insp-deliverable-stage"><iframe class="insp-html-frame" sandbox="allow-scripts allow-forms allow-modals" referrerpolicy="no-referrer"></iframe></div>`;
          const fr = bodyEl.querySelector('iframe.insp-html-frame');
          if (fr) {
            fr.dataset.dlvKey = cacheKey;
            fr.srcdoc = String(delivCached.sandboxedHtml || delivCached.sourceHtml || '');
          }
          return;
        }
        if (deliverableKind === 'spreadsheet') {
          const sheets = Array.isArray(delivCached.sheets) ? delivCached.sheets : [];
          if (!sheets.length) {
            bodyEl.innerHTML = `${pillsHtml}<div class="insp-empty">${delivCached.unsupportedBinary ? 'Legacy binary workbook — open in Excel to view.' : 'Empty workbook.'}</div>`;
            return;
          }
          const idx = Math.max(0, Math.min(sheets.length - 1, activeDeliverableSheetIdx));
          const sh = sheets[idx];
          const tabsHtml = sheets
            .map((s, si) => `<button type="button" class="insp-thumb-btn${si === idx ? ' active' : ''}" data-insp-sheet-idx="${si}">${S.esc(s.name || `Sheet${si + 1}`)}</button>`)
            .join('');
          const maxRows = Math.min(sh.grid?.length || 0, 200);
          const maxCols = Math.min(sh.colCount || 0, 32);
          let hdrCols = '<tr><th>#</th>';
          for (let c = 0; c < maxCols; c++) {
            let n = c + 1;
            let colLbl = '';
            while (n > 0) {
              const rem = (n - 1) % 26;
              colLbl = String.fromCharCode(65 + rem) + colLbl;
              n = Math.floor((n - 1) / 26);
            }
            hdrCols += `<th>${colLbl}</th>`;
          }
          hdrCols += '</tr>';
          let bodyRowsHtml = '';
          for (let r = 0; r < maxRows; r++) {
            const rowArr = sh.grid[r] || [];
            let tds = `<td class="num">${r + 1}</td>`;
            for (let c = 0; c < maxCols; c++) {
              const cell = rowArr[c];
              const cls = cell && cell.a === 'right' ? ' class="num"' : '';
              tds += `<td${cls}>${S.esc(cell ? cell.t : '')}</td>`;
            }
            bodyRowsHtml += `<tr>${tds}</tr>`;
          }
          bodyEl.innerHTML = `${pillsHtml}<div class="insp-deliverable-stage"><div class="insp-deliverable-bar"><span class="insp-deliverable-label">${S.esc(delivCached.file || displayPath)} · ${sh.totalRowsInSheet || maxRows} rows</span><span class="insp-deliverable-grp"><button type="button" class="insp-mini-btn" data-insp-dlv-app="${S.esc(parsed.filePath)}">Open in Excel</button></span></div><div class="insp-sheet-tabs">${tabsHtml}</div><div class="insp-sheet-grid-wrap"><table class="insp-sheet-grid"><thead>${hdrCols}</thead><tbody>${bodyRowsHtml}</tbody></table></div></div>`;
          return;
        }
        // PDF or PPTX deck stage
        const unitLabel = deliverableKind === 'pptx' ? 'Slide' : 'Page';
        const pageMetaSrc = delivCached.ok ? delivCached : (deliverablePreviewCache.get(cacheKey) || delivCached);
        const pageCount = Math.max(1, Number(pageMetaSrc.pageCount || (Array.isArray(pageMetaSrc.slides) ? pageMetaSrc.slides.length : 1) || 1));
        const curPage = Math.max(1, Math.min(pageCount, activeDeliverablePage));
        activeDeliverablePage = curPage;
        const canOpenBridgeApp = Boolean(
          (S.connMode === 'local' && S.localBridgeBase) ||
            S.prefs.customBridgeUrl ||
            (S.edgeWsAuthed && S.edgeWs && S.edgeWs.readyState === 1)
        );
        if (!delivCached.blobUrl && delivCached.rawBytes instanceof Uint8Array && (delivCached.sourceKind === 'vault-r2-pdf' || deliverableKind === 'pdf')) {
          const freshBlob = new Blob([delivCached.rawBytes], { type: delivCached.rawMime || 'application/pdf' });
          delivCached.blobUrl = URL.createObjectURL(freshBlob);
          activeDeliverableBlobUrls.add(delivCached.blobUrl);
        }
        const appBtnLabel = deliverableKind === 'pptx' ? 'PowerPoint' : 'Open App';
        const barHtml = `
          <div class="insp-deliverable-bar">
            <span class="insp-deliverable-grp">
              <button type="button" class="insp-mini-btn" data-insp-dlv-page="${curPage - 1}" ${curPage <= 1 ? 'disabled' : ''}>←</button>
              <span class="insp-deliverable-label tabular">${unitLabel} ${curPage} / ${pageCount}</span>
              <button type="button" class="insp-mini-btn" data-insp-dlv-page="${curPage + 1}" ${curPage >= pageCount ? 'disabled' : ''}>→</button>
              ${delivCached.blobUrl ? '' : `<button type="button" class="insp-mini-btn${activeDeliverableDeckMode === 'single' ? ' active' : ''}" data-insp-dlv-deck-mode="single">Single</button><button type="button" class="insp-mini-btn${activeDeliverableDeckMode === 'all' ? ' active' : ''}" data-insp-dlv-deck-mode="all">All</button>`}
            </span>
            <span class="insp-deliverable-grp">
              ${delivCached.blobUrl ? '' : `<button type="button" class="insp-mini-btn" data-insp-dlv-zoom="out">−</button><button type="button" class="insp-mini-btn${activeDeliverableZoomPct === 0 ? ' active' : ''}" data-insp-dlv-zoom="fit">${activeDeliverableZoomPct === 0 ? 'Fit' : `${activeDeliverableZoomPct}%`}</button><button type="button" class="insp-mini-btn" data-insp-dlv-zoom="in">+</button>`}
              ${canOpenBridgeApp ? `<button type="button" class="insp-mini-btn" data-insp-dlv-app="${S.esc(parsed.filePath)}">${appBtnLabel}</button>` : ''}
            </span>
          </div>
        `;

        let stageHtml = '';
        if (delivCached.blobUrl) {
          const isStandaloneTouch = Boolean(window.navigator?.standalone);
          if (isStandaloneTouch) {
            stageHtml = `<div class="insp-empty">PDF ready from Memory Vault (${S.esc(delivCached.file)}). Tap <strong>Share</strong> above to open full-screen in iOS QuickLook or Files.</div>`;
          } else {
            stageHtml = `<iframe class="insp-html-frame" src="${S.esc(delivCached.blobUrl)}"></iframe>`;
          }
        } else if (delivCached.sourceKind === 'vault-r2-download') {
          stageHtml = `<div class="insp-empty">${S.esc(delivCached.file)} (${Math.round((delivCached.size || 0) / 1024)} KB) is stored in Memory Vault without a PDF twin. Connect to workstation or tap Download / Share above to open in PowerPoint.</div>`;
        } else if (Array.isArray(delivCached.slides) && !delivCached.pageImageBase64) {
          if (delivCached.slides.length === 0) {
            stageHtml = `<div class="insp-empty">No slides found in this presentation.</div>`;
          } else {
            const indices = activeDeliverableDeckMode === 'all' ? delivCached.slides.map((_, i) => i + 1) : [curPage];
            stageHtml = `<div class="insp-deck-stage">${indices.map((pNum) => {
              const s = delivCached.slides[pNum - 1];
              if (!s) return '';
              const bulletsHtml = (s.bullets || []).map((b) => `<li dir="auto">${S.esc(b)}</li>`).join('');
              const imgHtml = s.imageDataUri ? `<img src="${S.esc(s.imageDataUri)}" alt="Slide ${pNum}" style="max-width:100%;border-radius:6px">` : '';
              return `<div class="insp-ooxml-card"><div class="insp-ooxml-title" dir="auto">${S.esc(s.title || `Slide ${pNum}`)}</div>${bulletsHtml ? `<ul class="insp-ooxml-bullets">${bulletsHtml}</ul>` : ''}${imgHtml}</div>`;
            }).join('')}</div>`;
          }
        } else {
          const pagesToRender = activeDeliverableDeckMode === 'all'
            ? Array.from({ length: Math.min(pageCount, 30) }, (_, i) => i + 1)
            : [curPage];
          const cardsHtml = pagesToRender.map((pNum) => {
            const pObj = pNum === curPage && delivCached.page === curPage
              ? delivCached
              : deliverablePageCache.get(`${cacheKey}::p${pNum}`);
            if (!pObj) {
              if (!deliverableInFlightKeys.has(`${cacheKey}::p${pNum}`)) {
                fetchDeliverablePreview(activeInspectorFileTarget, activeRow, { page: pNum, batchRender: true }).catch(() => {});
              }
              return `<div class="insp-empty">Rendering ${unitLabel} ${pNum}…</div>`;
            }
            if (!pObj.ok || !pObj.pageImageBase64) {
              return `<div class="insp-empty">${S.esc(pObj.error || `Unable to render ${unitLabel} ${pNum}.`)}</div>`;
            }
            const widthStyle = activeDeliverableZoomPct > 0 ? ` style="width:${activeDeliverableZoomPct}%"` : '';
            const imgStyle = activeDeliverableZoomPct > 0 ? ' style="width:100%"' : '';
            return `<div class="insp-page-card"${widthStyle}><img src="data:${S.esc(pObj.pageMime || 'image/png')};base64,${pObj.pageImageBase64}" alt="${unitLabel} ${pNum}"${imgStyle}><div class="insp-page-cap">${unitLabel} ${pNum} of ${pageCount}</div></div>`;
          }).join('');
          stageHtml = `<div class="insp-deck-stage">${cardsHtml}</div>`;
        }

        const thumbsHtml = !delivCached.blobUrl && pageCount > 1
          ? `<div class="insp-thumb-strip">${Array.from({ length: pageCount }, (_, i) => i + 1).map((pNum) => `<button type="button" class="insp-thumb-btn${pNum === curPage ? ' active' : ''}" data-insp-dlv-page="${pNum}">${pNum}</button>`).join('')}</div>`
          : '';
        bodyEl.innerHTML = `${pillsHtml}<div class="insp-deliverable-stage">${barHtml}${stageHtml}${thumbsHtml}</div>`;
        return;
      }

      if (!cached) {
        if (deliverableKind === 'html' && delivCached && delivCached.ok && delivCached.sourceHtml) {
          // Allow instant Source view from already-loaded HTML deliverable
        } else {
          bodyEl.innerHTML = `${pillsHtml}<div class="insp-empty">Loading preview for <span class="mono">${S.esc(displayPath)}</span>…</div>`;
          return;
        }
      }

      if (cached && !cached.ok && !hasDiff) {
        bodyEl.innerHTML = `${pillsHtml}<div class="insp-empty">${S.esc(cached.error || 'Unable to preview this file path.')}</div>`;
        return;
      }

      if (effectiveMode === 'diff' && hasDiff) {
        bodyEl.innerHTML = `${pillsHtml}<div class="insp-code-surface"><pre class="insp-diff-pre mono">${formatInspectorDiffHtml(diffText)}</pre></div>`;
        return;
      }

      const sourceContent = cached && typeof cached.content === 'string' && !cached.fallbackOnly
        ? cached.content
        : (delivCached?.sourceHtml || '');
      const rawLines = String(sourceContent).replace(/\r\n/g, '\n').split('\n');
      const maxRenderLines = 900;
      const hlStart = Number(parsed.startLine || cached?.startLine || 0);
      const hlEnd = Math.max(hlStart, Number(parsed.endLine || cached?.endLine || hlStart));
      let sliceStart = 0;
      if (rawLines.length > maxRenderLines && hlStart > maxRenderLines - 80) {
        sliceStart = Math.max(0, hlStart - 120);
      }
      const visibleLines = rawLines.slice(sliceStart, sliceStart + maxRenderLines);
      const rowsHtml = visibleLines
        .map((txt, idx) => {
          const ln = sliceStart + idx + 1;
          const isHl = hlStart > 0 && ln >= hlStart && ln <= hlEnd;
          return `<div class="insp-code-row${isHl ? ' is-hl' : ''}" data-ln="${ln}"><button type="button" class="insp-quote-line-btn" data-quote-line="${S.esc(displayPath)}#L${ln}" aria-label="Quote ${S.esc(displayPath)} line ${ln} in chat">@L${ln}</button><span class="insp-ln tabular">${ln}</span><span class="insp-code-txt">${S.esc(txt)}</span></div>`;
        })
        .join('');
      const truncNote =
        cached?.truncated || rawLines.length > maxRenderLines
          ? `<div class="meta-timestamp tabular" style="padding:2px 4px">Showing lines ${sliceStart + 1}–${sliceStart + visibleLines.length} of ${cached?.lineCount || rawLines.length}</div>`
          : '';
      bodyEl.innerHTML = `${pillsHtml}<div class="insp-code-surface">${rowsHtml}</div>${truncNote}`;

      const hlScrollKey = `${cacheKey}#${hlStart}-${hlEnd}`;
      if (hlStart > 0 && lastScrolledInspectorHlKey !== hlScrollKey) {
        lastScrolledInspectorHlKey = hlScrollKey;
        const firstHl = bodyEl.querySelector('.insp-code-row.is-hl');
        if (firstHl) {
          firstHl.scrollIntoView({ block: 'center' });
        }
      }
      return;
    }

    if (S.prefs.inspectorTab === 'git') {
      const wsInfo = studioCap?.workspace ||
        wsCtx.matchedWs || {
          name: (activeRow?.folder && !/^workspace$/i.test(activeRow.folder) ? activeRow.folder : '') || (wsId !== 'auto' ? wsId : 'Workspace'),
          branch: 'main',
          dirtyCount: touchedFiles.length,
          modifiedFiles: touchedFiles.map((tf) => ({ status: 'M', path: tf.filePath })),
          recentCommits: []
        };
      const isNoGitWs = Boolean(wsInfo?.noGit || wsInfo?.id === 'theo-memory');
      const modFiles = isNoGitWs
        ? []
        : Array.isArray(wsInfo.modifiedFiles) && wsInfo.modifiedFiles.length
          ? wsInfo.modifiedFiles
          : touchedFiles.map((tf) => ({ status: tf.isEdit ? 'M' : 'R', path: tf.filePath }));
      const commits = isNoGitWs ? [] : Array.isArray(wsInfo.recentCommits) ? wsInfo.recentCommits : [];

      if (subbarEl) {
        subbarEl.hidden = false;
        subbarEl.innerHTML = `
          <span class="insp-sub-path"><span class="insp-sub-path-txt">${S.esc(wsInfo.name || wsId)} · <code class="md-inline-code">${S.esc(isNoGitWs ? 'Vault Sync' : wsInfo.branch || 'main')}</code>${isNoGitWs ? '' : ` · ${modFiles.length} changed`}</span></span>
          <span class="insp-sub-actions">
            <button type="button" class="insp-mini-btn" data-studio-cap-refresh="1">↻ Refresh</button>
            ${isNoGitWs ? '' : `<button type="button" class="insp-mini-btn" data-git-prompt-action="commit">Summarize &amp; Commit</button>`}
          </span>
        `;
      }

      if (isNoGitWs) {
        bodyEl.innerHTML = `
          <div class="studio-lens-section">
            <div class="studio-lens-head"><span class="studio-lens-title">Memory Vault Workspace</span></div>
            <div class="meta-timestamp">Synced two-way via Cloudflare Memory Vault (git history retired for <code class="md-inline-code">bhfirms/memory</code>).</div>
          </div>
        `;
        return;
      }

      const modHtml = modFiles.length
        ? modFiles
            .slice(0, 24)
            .map(
              (f) => `
              <div class="studio-git-file-row">
                <span style="display:inline-flex;align-items:center;gap:6px;min-width:0;flex:1">
                  <span class="studio-git-status">${S.esc(f.status || 'M')}</span>
                  <span class="mono" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${S.esc(f.path)}</span>
                </span>
                <span style="display:inline-flex;gap:4px;flex-shrink:0">
                  <button type="button" class="insp-mini-btn" data-preview-file="${S.esc(f.path)}" data-preview-mode="diff">Diff</button>
                  <button type="button" class="insp-mini-btn" data-step-mention-file="${S.esc(f.path)}">@ Mention</button>
                </span>
              </div>
            `
            )
            .join('')
        : `<div class="meta-timestamp">Working tree clean — zero uncommitted files.</div>`;

      const commitsHtml = commits.length
        ? commits
            .slice(0, 6)
            .map(
              (c) => `
              <div class="studio-git-file-row">
                <span class="mono" style="color:var(--brass);font-size:10.5px">${S.esc(c.hash || '')}</span>
                <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${S.esc(c.subject || '')}</span>
                <span class="meta-timestamp tabular">${S.esc(c.relativeTime || '')}</span>
              </div>
            `
            )
            .join('')
        : `<div class="meta-timestamp">Connect to workstation bridge to inspect commit history.</div>`;

      bodyEl.innerHTML = `
        <div class="studio-lens-section">
          <div class="studio-lens-head">
            <span class="studio-lens-title">Working Tree Changes (${modFiles.length})</span>
            <button type="button" class="insp-mini-btn" data-git-prompt-action="review">Ask AI to Review All</button>
          </div>
          ${modHtml}
        </div>
        <div class="studio-lens-section">
          <div class="studio-lens-head">
            <span class="studio-lens-title">Recent Commits</span>
          </div>
          ${commitsHtml}
        </div>
      `;
      return;
    }

    // Tab 3: Tasks & Outline (Turn/Artifact Outline + Side Agents/Bg Tasks + Allowlisted Checks)
    const rawChecks = Array.isArray(studioCap?.checks) ? studioCap.checks : [];
    const rankedChecks = S.rankByFreq(rawChecks, 'checks', (c) => c.id);
    const outlineItems = [];
    let promptNum = 0;
    (messages || []).forEach((m, idx) => {
      if (!m) return;
      const anchor = String(m.id || `turn-${idx}`);
      if (m.role === 'user') {
        promptNum += 1;
        outlineItems.push({
          kicker: `Prompt #${promptNum}`,
          title: S.cleanUserPromptPreview(m.text).slice(0, 140) || 'User prompt',
          anchor,
          detailKey: ''
        });
      } else if (m.role === 'checkpoint') {
        outlineItems.push({
          kicker: '✂ compact',
          title: S.cleanCheckpointPreview(m.text).slice(0, 140),
          anchor,
          detailKey: `${anchor}:checkpoint`
        });
      } else if (Array.isArray(m.artifacts) && m.artifacts.length > 0) {
        m.artifacts.forEach((art, aIdx) => {
          if (!art) return;
          outlineItems.push({
            kicker: 'Artifact',
            title: String(art.title || art.file || 'Walkthrough').trim(),
            anchor,
            detailKey: `${anchor}:art:${aIdx}`
          });
        });
      }
    });

    if (subbarEl) {
      subbarEl.hidden = false;
      subbarEl.innerHTML = `
        <span class="insp-sub-path"><span class="insp-sub-path-txt">${allTasks.length} Task${allTasks.length === 1 ? '' : 's'}${runningCount > 0 ? ` (${runningCount} Live)` : ''} · ${outlineItems.length} Outline · ${rankedChecks.length} Check${rankedChecks.length === 1 ? '' : 's'}</span></span>
        <span class="insp-sub-actions">
          <button type="button" class="insp-mini-btn" data-insp-refresh-agents="1">↻ Refresh</button>
          ${runningCount > 0 && sid ? `<button type="button" class="insp-mini-btn" style="color:var(--crimson)" data-bg-act="stop-session-all" data-sess-id="${S.esc(sid)}" data-prov="${provKey}">■ Stop All</button>` : ''}
        </span>
      `;
    }

    const outlineHtml = outlineItems.length === 0
      ? `<div class="meta-timestamp">Prompts, <code class="md-inline-code">/compact</code> checkpoints, and artifacts appear here for 1-click navigation.</div>`
      : outlineItems
          .map(
            (it) => `
            <button type="button" class="insp-outline-item" data-outline-jump="${S.esc(it.anchor)}" ${it.detailKey ? `data-outline-detail="${S.esc(it.detailKey)}"` : ''}>
              <span class="insp-outline-kicker tabular">${S.esc(it.kicker)}</span>
              <span class="insp-outline-title">${S.esc(it.title)}</span>
            </button>
          `
          )
          .join('');

    const agentsHtml =
      allTasks.length === 0
        ? `<div class="meta-timestamp">No Side Agents or background tasks recorded in this session yet.</div>`
        : allTasks
            .map((t) => {
              const stInfo = S.getBgStateBadgeInfo(t.state);
              const cacheKey = `${sid}:${t.id}`;
              const isFocused = activeInspectorAgentId && (t.id === activeInspectorAgentId || t.fullId === activeInspectorAgentId);
              const titleTxt = t.subagentRole || t.summary || t.command || t.id || 'Side Agent';
              const liveOut =
                S.bgTaskLogsCache.get(cacheKey) ||
                t.outputPreview ||
                (t.state === 'running'
                  ? 'Agent/task is running — click Tail to load live output.'
                  : 'Completed cleanly.');
              const linkedConvId = String(t.subagentConversationId || '').trim();
              const hasLinkedSession = Boolean(
                linkedConvId && (S.appState?.rows || []).some((r) => r && r.id === linkedConvId)
              );
              return `
                <div class="insp-agent-card${t.state === 'running' ? ' is-running' : ''}" ${isFocused ? 'style="border-color:var(--brass)"' : ''}>
                  <div class="insp-agent-head">
                    <span class="insp-agent-title">${S.esc(titleTxt)}</span>
                    <span class="bg-kind-badge ${stInfo.cls}">${S.esc(S.getBgKindLabel(t.kind))} · ${S.esc(stInfo.label)}</span>
                  </div>
                  ${t.command ? `<div class="meta-timestamp mono" style="white-space:pre-wrap;word-break:break-word">${S.esc(String(t.command).slice(0, 260))}</div>` : ''}
                  <pre class="insp-agent-log mono" data-bg-log-key="${S.esc(cacheKey)}">${S.esc(liveOut)}</pre>
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
                    <span class="meta-timestamp tabular">${S.esc(t.id)}${t.startedAt ? ` · ${S.esc(S.timeAgo(t.startedAt))}` : ''}</span>
                    <span style="display:inline-flex;gap:5px">
                      <button type="button" class="insp-mini-btn" data-bg-act="refresh-log" data-sess-id="${S.esc(sid)}" data-task-id="${S.esc(t.id)}" data-prov="${provKey}">↻ Tail</button>
                      ${hasLinkedSession ? `<button type="button" class="insp-mini-btn" data-open-conv="${S.esc(linkedConvId)}">Open Thread</button>` : ''}
                      ${t.state === 'running' ? `<button type="button" class="ide-bg-stop" style="display:inline-flex" data-bg-act="stop-task" data-sess-id="${S.esc(sid)}" data-task-id="${S.esc(t.fullId || t.id)}" data-prov="${provKey}">■ Stop</button>` : ''}
                    </span>
                  </div>
                </div>
              `;
            })
            .join('');

    const checksHtml = rankedChecks.length
      ? rankedChecks
          .map((chk) => {
            const res = studioCheckResultsById.get(`${wsId}::${chk.id}`);
            const diags = Array.isArray(res?.diagnostics) ? res.diagnostics : [];
            const statusBadge = res
              ? res.running
                ? `<span class="meta-timestamp">Running…</span>`
                : res.ok && res.passed
                  ? `<span style="color:var(--emerald);font-weight:600;font-size:11px">✓ Passed (${res.durationMs || 1}ms)</span>`
                  : `<span style="color:var(--crimson);font-weight:600;font-size:11px">✕ Failed</span>`
              : '';
            const diagsHtml = diags.length
              ? `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:5px">${diags
                  .map(
                    (d) =>
                      `<button type="button" class="studio-diag-pill" data-preview-file="${S.esc(d.relPath)}#L${d.line}">⚠ ${S.esc(d.relPath)}:${d.line} · ${S.esc(String(d.message || '').slice(0, 64))}</button>`
                  )
                  .join('')}</div>`
              : '';
            return `
              <div style="display:flex;flex-direction:column;gap:4px">
                <div class="studio-check-row">
                  <div style="min-width:0;flex:1">
                    <div style="font-weight:600;color:var(--text-heading)">${S.esc(chk.label)}</div>
                    <div class="meta-timestamp mono">${S.esc(chk.commandPreview || chk.id)}</div>
                  </div>
                  ${statusBadge}
                  <button type="button" class="insp-mini-btn" data-run-studio-check="${S.esc(chk.id)}" ${studioCheckBusy ? 'disabled' : ''}>▶ Run</button>
                </div>
                ${diagsHtml}
                ${res && (res.output || res.error) ? `<pre class="studio-check-output">${S.esc(res.output || res.error)}</pre>` : ''}
              </div>
            `;
          })
          .join('')
      : `<div class="meta-timestamp">Discovering allowlisted workspace checks…</div>`;

    bodyEl.innerHTML = `
      <div class="studio-lens-section">
        <div class="studio-lens-head"><span class="studio-lens-title">Turn &amp; Artifact Outline (${outlineItems.length})</span></div>
        ${outlineHtml}
      </div>
      <div class="studio-lens-section">
        <div class="studio-lens-head"><span class="studio-lens-title">Background Tasks &amp; Subagents (${allTasks.length})</span></div>
        ${agentsHtml}
      </div>
      <div class="studio-lens-section">
        <div class="studio-lens-head"><span class="studio-lens-title">Workspace Verification Checks (${rankedChecks.length})</span></div>
        ${checksHtml}
      </div>
    `;
      }
    );
  }

  Object.assign(S, {
    activeDockStepByCardKey,
    chatOpenDetailsByThread,
    deliverablePageCache,
    deliverablePreviewCache,
    executeStudioCheck,
    exportActiveDeliverable,
    fetchDeliverablePreview,
    fetchStudioCapabilities,
    filePreviewCache,
    getDeliverableKindClient,
    getThreadOpenDetailsMap,
    openActiveDeliverableInApp,
    parsePreviewTargetClient,
    renderSplitInspector,
    renderSplitWatchPane,
    resolveSessionWorkspaceContext,
    setInspectorOpen,
    teardownDeliverableInspectorFrames
  });
  Object.defineProperties(S, {
    activeDeliverableDeckMode: { get: () => activeDeliverableDeckMode, set: (v) => { activeDeliverableDeckMode = v; }, enumerable: true, configurable: true },
    activeDeliverablePage: { get: () => activeDeliverablePage, set: (v) => { activeDeliverablePage = v; }, enumerable: true, configurable: true },
    activeDeliverableSheetIdx: { get: () => activeDeliverableSheetIdx, set: (v) => { activeDeliverableSheetIdx = v; }, enumerable: true, configurable: true },
    activeDeliverableZoomPct: { get: () => activeDeliverableZoomPct, set: (v) => { activeDeliverableZoomPct = v; }, enumerable: true, configurable: true },
    activeInspectorFileTarget: { get: () => activeInspectorFileTarget, set: (v) => { activeInspectorFileTarget = v; }, enumerable: true, configurable: true }
  });

  });
})();
