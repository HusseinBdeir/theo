(() => {
  'use strict';
  const theoModuleQueue = [];
  Object.defineProperties(window, {
    __theoRegisterModule: {
      configurable: true,
      enumerable: false,
      writable: false,
      value: (name, fn) => { theoModuleQueue.push([name, fn]); }
    },
    __theoConsumeModules: {
      configurable: true,
      enumerable: false,
      writable: false,
      value: () => {
        delete window.__theoRegisterModule;
        delete window.__theoConsumeModules;
        return theoModuleQueue.slice();
      }
    }
  });

  window.__theoRegisterModule('models', (S) => {
  const MODEL_CATALOG = {
    antigravity: [
      {
        id: 'gemini-4-argon',
        label: 'Gemini 4 Argon',
        shortLabel: 'Gemini 4 Argon',
        badge: 'Deep Reasoning',
        desc: 'Primary frontier coding & architecture model with configurable thinking depth',
        cliModel: 'gemini-4-argon',
        supportsEffort: true
      },
      {
        id: 'gemini-3.8-flash',
        label: 'Gemini 3.8 Flash',
        shortLabel: 'Gemini 3.8 Flash',
        badge: 'Ultra-Fast',
        desc: 'High-speed, low-latency model with configurable thinking depth',
        cliModel: 'gemini-3.8-flash',
        supportsEffort: true
      }
    ],
    claude: [
      {
        id: 'claude-opus-4-7',
        label: 'Claude Opus 4.7 (1M)',
        shortLabel: 'Claude Opus 4.7',
        badge: '1M Context',
        desc: 'Deep reasoning across 1M-token context window',
        cliModel: 'claude-opus-4-7',
        supportsEffort: true
      },
      {
        id: 'claude-sonnet-4-6',
        label: 'Claude Sonnet 4.6',
        shortLabel: 'Claude Sonnet 4.6',
        badge: 'Balanced',
        desc: 'Fast multi-file coding & verification',
        cliModel: 'claude-sonnet-4-6',
        supportsEffort: true
      },
      {
        id: 'fable-5-1',
        label: 'Fable 5.1',
        shortLabel: 'Fable 5.1',
        badge: 'Frontier',
        desc: 'Frontier autonomous synthesis & verification',
        cliModel: 'fable-5-1',
        supportsEffort: true
      }
    ]
  };

  const THINKING_EFFORT_LEVELS = [
    { id: 'low', label: 'Low', desc: 'Fastest turnaround · concise reasoning' },
    { id: 'medium', label: 'Medium', desc: 'Balanced speed & multi-step verification' },
    { id: 'high', label: 'High', desc: 'Deep thinking & edge-case rigor' },
    { id: 'xhigh', label: 'XHigh', desc: 'Maximum extended reasoning budget' }
  ];

  const CHEVRON_DOWN_SVG = `<svg class="ui-chev" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 6L8 9.5L11.5 6"/></svg>`;
  const CHEVRON_RIGHT_SVG = `<svg class="ui-chev" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4.5L9.5 8L6 11.5"/></svg>`;
  const CHECK_MARK_SVG = `<svg class="vs-model-check-ico" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-6.5"/></svg>`;

  let liveAntigravityCatalog = {
    updatedAt: 0,
    source: '',
    activeDefaultModelId: '',
    activeDefaultLabel: '',
    orchestratorPlannerModelId: '',
    clientModelSorts: [],
    families: [],
    models: [],
    byAlias: new Map()
  };

  let liveClaudeCatalog = {
    updatedAt: 0,
    sourceKind: '',
    sourceVersion: '',
    activeDefaultModelId: '',
    activeDefaultLabel: '',
    latestPerFamily: {},
    models: [],
    byAlias: new Map()
  };

  function normalizeCatalogLookupKey(raw = '') {
    return String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function stripEffortSuffixForCatalog(raw = '') {
    return String(raw || '')
      .replace(/\s*[\(\[]\s*(?:low|medium|high|xhigh|1m|thinking)\s*[\)\]]\s*/gi, ' ')
      .replace(/\s*[·\-]\s*(?:low|medium|high|xhigh)\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function slugCatalogModelId(label = '') {
    return String(label || '')
      .trim()
      .toLowerCase()
      .replace(/\s*\((low|medium|high|xhigh)\)\s*$/i, '')
      .replace(/[^a-z0-9.]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function formatEffortWord(effId = '') {
    const low = String(effId || '').trim().toLowerCase();
    if (low === 'xhigh') return 'XHigh';
    if (low === 'low') return 'Low';
    if (low === 'medium') return 'Medium';
    if (low === 'high') return 'High';
    return '';
  }

  function ingestLiveAntigravityCatalog(catObj) {
    if (!catObj || typeof catObj !== 'object' || !Array.isArray(catObj.models)) return;
    const nextAt = Number(catObj.updatedAt || 0);
    if (
      nextAt > 0 &&
      liveAntigravityCatalog.updatedAt > 0 &&
      nextAt < liveAntigravityCatalog.updatedAt &&
      liveAntigravityCatalog.models.length > 0
    ) {
      return;
    }
    const cleanModels = [];
    const byAlias = new Map();
    const pendingEntries = [];
    for (const rawEntry of catObj.models) {
      if (!rawEntry || typeof rawEntry !== 'object') continue;
      const modelId = String(rawEntry.modelId || '').trim();
      const label = String(rawEntry.label || '').trim();
      const baseLabel = String(rawEntry.baseLabel || stripEffortSuffixForCatalog(label) || label).trim();
      if (!modelId && !label && !baseLabel) continue;
      const isOwnOrchestrator = Boolean(
        rawEntry.isOrchestrator ||
          /orchestrator|model_placeholder_m66[79]|model_placeholder_m681|model_placeholder_m537/i.test(
            `${modelId} ${label}`
          )
      );
      const filteredAliases = Array.isArray(rawEntry.aliases)
        ? rawEntry.aliases
            .map((a) => String(a || '').trim())
            .filter((a) => a && (isOwnOrchestrator || !/^\s*orchestrator\s*\((?:carbon|argon|neon)\)\s*$/i.test(a)))
        : [];
      const entry = {
        modelId,
        slugId: String(rawEntry.slugId || '').trim(),
        label: label || baseLabel,
        baseLabel: baseLabel || label,
        aliases: filteredAliases,
        isFirstPartyGemini: Boolean(rawEntry.isFirstPartyGemini),
        isClaudeLike: Boolean(rawEntry.isClaudeLike),
        isOrchestrator: isOwnOrchestrator,
        isNeon: Boolean(rawEntry.isNeon || /neon|model_placeholder_m53[2-57]/i.test(`${modelId} ${label}`)),
        supportsThinking: rawEntry.supportsThinking === true || (!isOwnOrchestrator && rawEntry.supportsThinking !== false),
        isRecommended: Boolean(rawEntry.isRecommended),
        inClientPicker: rawEntry.inClientPicker !== false,
        sortOrder: Number.isFinite(Number(rawEntry.sortOrder)) ? Number(rawEntry.sortOrder) : cleanModels.length,
        tagTitle: String(rawEntry.tagTitle || '').trim(),
        tagDescription: String(rawEntry.tagDescription || '').trim(),
        quotaRemainingFraction:
          typeof rawEntry.quotaRemainingFraction === 'number' && Number.isFinite(rawEntry.quotaRemainingFraction)
            ? rawEntry.quotaRemainingFraction
            : null,
        effortTier: String(rawEntry.effortTier || '').trim().toLowerCase(),
        maxContextTokens: Number(rawEntry.maxContextTokens || 0),
        softCompactionTargetTokens: Number(rawEntry.softCompactionTargetTokens || 0),
        hardMaxTokens: Number(rawEntry.hardMaxTokens || 0)
      };
      cleanModels.push(entry);
      pendingEntries.push(entry);
    }
    // Pass 1: secondary aliases; Pass 2: primary baseLabel -> label -> slugId -> modelId always win
    for (const entry of pendingEntries) {
      for (const k of entry.aliases) {
        const nk = normalizeCatalogLookupKey(k);
        if (nk && !byAlias.has(nk)) byAlias.set(nk, entry);
        const sk = normalizeCatalogLookupKey(stripEffortSuffixForCatalog(k));
        if (sk && !byAlias.has(sk)) byAlias.set(sk, entry);
      }
    }
    for (const entry of pendingEntries) {
      const bk = normalizeCatalogLookupKey(entry.baseLabel);
      if (bk) byAlias.set(bk, entry);
      const sbk = normalizeCatalogLookupKey(stripEffortSuffixForCatalog(entry.baseLabel));
      if (sbk && !byAlias.has(sbk)) byAlias.set(sbk, entry);
    }
    for (const entry of pendingEntries) {
      const lk = normalizeCatalogLookupKey(entry.label);
      if (lk) byAlias.set(lk, entry);
      const sk = normalizeCatalogLookupKey(entry.slugId);
      if (sk) byAlias.set(sk, entry);
      const mk = normalizeCatalogLookupKey(entry.modelId);
      if (mk) byAlias.set(mk, entry);
    }
    liveAntigravityCatalog = {
      updatedAt: nextAt || Date.now(),
      source: String(catObj.source || ''),
      activeDefaultModelId: String(catObj.activeDefaultModelId || '').trim(),
      activeDefaultLabel: String(catObj.activeDefaultLabel || '').trim(),
      orchestratorPlannerModelId: String(catObj.orchestratorPlannerModelId || '').trim(),
      clientModelSorts: Array.isArray(catObj.clientModelSorts) ? catObj.clientModelSorts : [],
      families: Array.isArray(catObj.families) ? catObj.families : [],
      models: cleanModels,
      byAlias
    };
  }

  function ingestLiveClaudeCatalog(catObj) {
    if (!catObj || typeof catObj !== 'object' || !Array.isArray(catObj.models)) return;
    const nextAt = Number(catObj.updatedAt || 0);
    if (
      nextAt > 0 &&
      liveClaudeCatalog.updatedAt > 0 &&
      nextAt < liveClaudeCatalog.updatedAt &&
      liveClaudeCatalog.models.length > 0
    ) {
      return;
    }
    const cleanModels = [];
    const byAlias = new Map();
    for (const rawEntry of catObj.models) {
      if (!rawEntry || typeof rawEntry !== 'object') continue;
      const modelId = String(rawEntry.modelId || rawEntry.slugId || '').trim();
      const label = String(rawEntry.label || rawEntry.displayName || modelId).trim();
      if (!modelId && !label) continue;
      const effs = Array.isArray(rawEntry.efforts)
        ? rawEntry.efforts.map((e) => String(e || '').trim().toLowerCase()).filter(Boolean)
        : [];
      const entry = {
        modelId,
        slugId: String(rawEntry.slugId || modelId).trim(),
        family: String(rawEntry.family || '').trim().toLowerCase(),
        label,
        displayName: String(rawEntry.displayName || label).trim(),
        defaultEffort: String(rawEntry.defaultEffort || '').trim().toLowerCase(),
        efforts: effs,
        supportsThinking: rawEntry.supportsThinking !== false,
        supportsXHigh: Boolean(rawEntry.supportsXHigh || effs.includes('xhigh')),
        supports1m: Boolean(rawEntry.supports1m || Number(rawEntry.contextLimit || 0) >= 1000000),
        contextLimit: Number(rawEntry.contextLimit || (rawEntry.supports1m ? 1000000 : 200000)),
        inClientPicker: rawEntry.inClientPicker !== false,
        isLatest: Boolean(rawEntry.isLatest),
        tagTitle: String(rawEntry.tagTitle || '').trim(),
        tagDescription: String(rawEntry.tagDescription || '').trim(),
        cliValue: String(rawEntry.cliValue || modelId).trim()
      };
      cleanModels.push(entry);
      for (const k of [
        entry.modelId,
        entry.slugId,
        entry.displayName,
        entry.label,
        entry.cliValue,
        slugCatalogModelId(entry.label)
      ]) {
        const nk = normalizeCatalogLookupKey(k);
        if (nk) byAlias.set(nk, entry);
      }
    }
    liveClaudeCatalog = {
      updatedAt: nextAt || Date.now(),
      sourceKind: String(catObj.sourceKind || ''),
      sourceVersion: String(catObj.sourceVersion || ''),
      activeDefaultModelId: String(catObj.activeDefaultModelId || '').trim(),
      activeDefaultLabel: String(catObj.activeDefaultLabel || '').trim(),
      latestPerFamily:
        catObj.latestPerFamily && typeof catObj.latestPerFamily === 'object' ? catObj.latestPerFamily : {},
      models: cleanModels,
      byAlias
    };
  }

  function lookupPwaLiveCatalogModel(rawModel = '') {
    const exact = normalizeCatalogLookupKey(rawModel);
    if (!exact || !(liveAntigravityCatalog.byAlias instanceof Map) || liveAntigravityCatalog.byAlias.size === 0) {
      return null;
    }
    const hit = liveAntigravityCatalog.byAlias.get(exact);
    if (hit) return hit;
    const stripped = normalizeCatalogLookupKey(stripEffortSuffixForCatalog(rawModel));
    return stripped ? liveAntigravityCatalog.byAlias.get(stripped) || null : null;
  }

  function lookupPwaClaudeCatalogModel(rawModel = '') {
    const exact = normalizeCatalogLookupKey(rawModel);
    if (!exact || !(liveClaudeCatalog.byAlias instanceof Map) || liveClaudeCatalog.byAlias.size === 0) {
      return null;
    }
    const hit = liveClaudeCatalog.byAlias.get(exact);
    if (hit) return hit;
    const stripped = normalizeCatalogLookupKey(stripEffortSuffixForCatalog(rawModel).replace(/\[1m\]$/i, ''));
    return stripped ? liveClaudeCatalog.byAlias.get(stripped) || null : null;
  }

  function getEffectiveModelCatalog(provKey = 'antigravity') {
    const cleanProv = provKey === 'claude' ? 'claude' : 'antigravity';
    const base = MODEL_CATALOG[cleanProv] || MODEL_CATALOG.antigravity;
    if (cleanProv === 'claude') {
      if (!liveClaudeCatalog.models.length) {
        return base;
      }
      const rawPicker = liveClaudeCatalog.models.filter((m) => m && m.inClientPicker !== false);
      const sourceList = rawPicker.length ? rawPicker : liveClaudeCatalog.models;
      const mapped = sourceList.map((m) => {
        const effList = m.supportsThinking === false
          ? []
          : Array.isArray(m.efforts) && m.efforts.length
            ? m.efforts
            : ['low', 'medium', 'high'];
        return {
          id: m.modelId,
          label: m.label,
          shortLabel: m.displayName || m.label,
          badge: m.tagTitle || (m.supports1m ? '1M' : m.isLatest ? 'Latest' : 'Claude'),
          tagTitle: m.tagTitle || '',
          tagDescription: m.tagDescription || '',
          desc: m.tagDescription || (m.supports1m ? '1M-token context window' : 'Claude Code model'),
          cliModel: m.cliValue || m.modelId,
          supportsEffort: effList.length > 0,
          efforts: effList,
          contextLimit: Number(m.contextLimit || 200000),
          isDefault: Boolean(liveClaudeCatalog.activeDefaultModelId && m.modelId === liveClaudeCatalog.activeDefaultModelId),
          liveCatalogEntry: m
        };
      });
      return mapped.length ? mapped : base;
    }

    if (!liveAntigravityCatalog.models.length) {
      return base;
    }
    const pickerEntries = liveAntigravityCatalog.models.filter((e) => e && e.inClientPicker !== false);
    const ordered = (pickerEntries.length ? pickerEntries : liveAntigravityCatalog.models)
      .slice()
      .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));

    const groups = [];
    const groupByKey = new Map();
    for (const entry of ordered) {
      const cleanBase = String(stripEffortSuffixForCatalog(entry.baseLabel || entry.label) || entry.label).trim();
      if (!cleanBase) continue;
      const isOrch = Boolean(entry.isOrchestrator || /orchestrator/i.test(cleanBase));
      const key = isOrch ? cleanBase.toLowerCase() : stripEffortSuffixForCatalog(cleanBase).toLowerCase();
      let grp = groupByKey.get(key);
      if (!grp) {
        grp = { key, cleanBase, entries: [] };
        groupByKey.set(key, grp);
        groups.push(grp);
      }
      grp.entries.push(entry);
    }

    const activeDefId = String(liveAntigravityCatalog.activeDefaultModelId || '').toLowerCase();
    const out = [];
    const seenIds = new Set();
    for (const grp of groups) {
      const first = grp.entries[0];
      const isOrch = grp.entries.some((e) => e.isOrchestrator || /orchestrator/i.test(`${e.label} ${e.modelId}`));
      const isGptOss = grp.entries.length === 1 && /gpt[-_\s]*oss/i.test(grp.cleanBase);
      const isSingleNonThinking = grp.entries.length === 1 && first.supportsThinking === false;
      const isFixedSingleTier = isOrch || isGptOss || isSingleNonThinking;
      const isNeon = grp.entries.some((e) => e.isNeon || /neon/i.test(`${e.label} ${e.modelId}`));
      const effortModelIds = {};
      const effortsSet = new Set();
      for (const e of grp.entries) {
        if (isFixedSingleTier) continue;
        const tier =
          e.effortTier ||
          inferEffortIdFromRaw(`${e.modelId || ''} ${e.label || ''}`, '');
        if (tier && ['low', 'medium', 'high', 'xhigh'].includes(tier)) {
          effortsSet.add(tier);
          if (e.modelId && !effortModelIds[tier]) {
            effortModelIds[tier] = e.modelId;
          }
        }
      }
      const efforts = ['low', 'medium', 'high', 'xhigh'].filter((t) => effortsSet.has(t));
      const supportsEffort = !isFixedSingleTier && efforts.length > 0;
      const displayLabel = supportsEffort ? grp.cleanBase : first.label || grp.cleanBase;
      const baseSlug = slugCatalogModelId(isFixedSingleTier ? displayLabel : grp.cleanBase);
      if (!baseSlug || seenIds.has(baseSlug)) continue;
      seenIds.add(baseSlug);

      const tagTitle = (grp.entries.find((e) => e.tagTitle)?.tagTitle || '').trim();
      const tagDescription = (grp.entries.find((e) => e.tagDescription)?.tagDescription || '').trim();
      const qEntry = grp.entries.find((e) => typeof e.quotaRemainingFraction === 'number');
      const quotaRemainingFraction = qEntry ? qEntry.quotaRemainingFraction : null;
      const isDefault = Boolean(
        activeDefId && grp.entries.some((e) => String(e.modelId || '').toLowerCase() === activeDefId)
      );
      const defaultCliModel = supportsEffort
        ? effortModelIds.high || effortModelIds.xhigh || effortModelIds.medium || effortModelIds.low || first.modelId
        : first.modelId || displayLabel;

      out.push({
        id: baseSlug,
        label: displayLabel,
        shortLabel: displayLabel,
        badge:
          tagTitle ||
          (isNeon
            ? 'Neon'
            : isOrch
              ? 'Auto'
              : efforts.includes('xhigh')
                ? 'XHigh'
                : first.isRecommended
                  ? 'Recommended'
                  : 'Live'),
        tagTitle,
        tagDescription,
        quotaRemainingFraction,
        desc: tagDescription || (isOrch ? 'Antigravity multi-step Orchestrator' : 'Live Antigravity model'),
        cliModel: defaultCliModel,
        supportsEffort,
        efforts,
        isOrchestrator: isOrch,
        isNeon,
        isDefault,
        liveCatalogEntry: first,
        effortModelIds
      });
    }
    return out.length ? out : base;
  }

  function inferEffortIdFromRaw(rawModel = '', effortHint = '') {
    const eff = String(effortHint || '').trim().toLowerCase();
    if (eff === 'low' || eff === 'medium' || eff === 'high' || eff === 'xhigh') return eff;
    const low = String(rawModel || '').toLowerCase();
    if (
      low === 'model_placeholder_m528' ||
      low === 'model_placeholder_m535' ||
      low.includes('(xhigh)') ||
      low.endsWith('-xhigh') ||
      low.includes('· xhigh') ||
      /\sxhigh$/i.test(low)
    ) {
      return 'xhigh';
    }
    if (
      low === 'model_placeholder_m419' ||
      low === 'model_placeholder_m438' ||
      low === 'model_placeholder_m527' ||
      low === 'model_placeholder_m320' ||
      low === 'model_placeholder_m400' ||
      low === 'model_placeholder_m403' ||
      low.includes('(low)') ||
      low.endsWith('-low') ||
      low.includes('· low')
    ) {
      return 'low';
    }
    if (
      low === 'model_placeholder_m418' ||
      low === 'model_placeholder_m437' ||
      low === 'model_placeholder_m526' ||
      low === 'model_placeholder_m319' ||
      low === 'model_placeholder_m401' ||
      low === 'model_placeholder_m404' ||
      low.includes('(medium)') ||
      low.endsWith('-medium') ||
      low.includes('· medium')
    ) {
      return 'medium';
    }
    if (
      low === 'model_placeholder_m417' ||
      low === 'model_placeholder_m427' ||
      low === 'model_placeholder_m525' ||
      low === 'model_placeholder_m318' ||
      low === 'model_placeholder_m322' ||
      low === 'model_placeholder_m402' ||
      low === 'model_placeholder_m405' ||
      low.includes('(high)') ||
      low.endsWith('-high') ||
      low.includes('· high')
    ) {
      return 'high';
    }
    return '';
  }

  function inferModelIdFromRaw(rawModel = '', provider = 'antigravity') {
    const provKey = provider === 'claude' ? 'claude' : 'antigravity';
    const low = String(rawModel || '').trim().toLowerCase();
    const effCatalog = getEffectiveModelCatalog(provKey);

    if (provKey === 'claude') {
      const liveClaudeHit = lookupPwaClaudeCatalogModel(rawModel);
      if (liveClaudeHit && effCatalog.some((m) => m.id === liveClaudeHit.modelId)) {
        return liveClaudeHit.modelId;
      }
      const cleanLow = low.replace(/\[1m\]/gi, '').replace(/\s*\((low|medium|high|xhigh|1m)\)\s*/gi, '').trim();
      const slugMatch = effCatalog.find(
        (m) =>
          m.id.toLowerCase() === cleanLow ||
          String(m.label || '').toLowerCase() === cleanLow ||
          String(m.shortLabel || '').toLowerCase() === cleanLow
      );
      if (slugMatch) return slugMatch.id;
      if (low.includes('fable')) {
        return effCatalog.find((m) => m.id.includes('fable'))?.id || 'fable-5-1';
      }
      if (low.includes('haiku')) {
        return effCatalog.find((m) => m.id.includes('haiku'))?.id || '';
      }
      if (low.includes('sonnet')) {
        return effCatalog.find((m) => m.id.includes('sonnet'))?.id || 'claude-sonnet-4-6';
      }
      if (low.includes('opus')) {
        return effCatalog.find((m) => m.id.includes('opus'))?.id || 'claude-opus-4-7';
      }
      return '';
    }

    const liveMatch = lookupPwaLiveCatalogModel(rawModel);
    if (liveMatch) {
      const isOrch = Boolean(liveMatch.isOrchestrator || /orchestrator/i.test(`${liveMatch.modelId} ${liveMatch.label}`));
      const isGptOss = /gpt[-_\s]*oss/i.test(`${liveMatch.modelId} ${liveMatch.label}`);
      const candId = slugCatalogModelId(
        isOrch || isGptOss ? liveMatch.label || liveMatch.baseLabel : stripEffortSuffixForCatalog(liveMatch.baseLabel || liveMatch.label)
      );
      if (candId && effCatalog.some((m) => m.id === candId)) {
        return candId;
      }
    }
    if (effCatalog.length) {
      if (
        low === 'model_placeholder_m667' ||
        low === 'model_placeholder_m669' ||
        low === 'gemini-pro-orchestrator' ||
        low === 'gemini-flash-worker-agy' ||
        (low.includes('orchestrator') && low.includes('carbon'))
      ) {
        const hit = effCatalog.find((m) => m.id === 'orchestrator-carbon');
        if (hit) return hit.id;
      }
      if (low === 'model_placeholder_m681' || (low.includes('orchestrator') && low.includes('argon'))) {
        const hit = effCatalog.find((m) => m.id === 'orchestrator-argon');
        if (hit) return hit.id;
      }
      if (low === 'model_placeholder_m537' || (low.includes('orchestrator') && low.includes('neon'))) {
        const hit = effCatalog.find((m) => m.id === 'orchestrator-neon');
        if (hit) return hit.id;
      }
      const exactCatHit = effCatalog.find((m) => {
        if (m.id.toLowerCase() === low || String(m.label || '').toLowerCase() === low) return true;
        if (String(m.cliModel || '').toLowerCase() === low) return true;
        if (m.effortModelIds && Object.values(m.effortModelIds).some((v) => String(v || '').toLowerCase() === low)) {
          return true;
        }
        return false;
      });
      if (exactCatHit) return exactCatHit.id;
    }
    if (
      low === 'model_placeholder_m318' ||
      low === 'model_placeholder_m319' ||
      low === 'model_placeholder_m320' ||
      low === 'model_placeholder_m322' ||
      low.includes('3.8') ||
      low.includes('flash')
    ) {
      return effCatalog.find((m) => m.id.includes('flash'))?.id || 'gemini-3.8-flash';
    }
    if (
      low === 'model_placeholder_m417' ||
      low === 'model_placeholder_m418' ||
      low === 'model_placeholder_m419' ||
      (low.includes('argon') &&
        !low.includes('orchestrator') &&
        !low.includes('carbon') &&
        !low.includes('hydrogen'))
    ) {
      return effCatalog.find((m) => m.id.includes('argon') && !m.isOrchestrator)?.id || 'gemini-4-argon';
    }
    if (
      low === 'model_placeholder_m427' ||
      low === 'model_placeholder_m437' ||
      low === 'model_placeholder_m438' ||
      (low.includes('carbon') && !low.includes('orchestrator'))
    ) {
      return effCatalog.find((m) => m.id.includes('carbon') && !m.isOrchestrator)?.id || '';
    }
    if (
      low === 'model_placeholder_m525' ||
      low === 'model_placeholder_m526' ||
      low === 'model_placeholder_m527' ||
      low === 'model_placeholder_m528' ||
      low.includes('hydrogen')
    ) {
      return effCatalog.find((m) => m.id.includes('hydrogen'))?.id || '';
    }
    if (
      low === 'model_placeholder_m532' ||
      low === 'model_placeholder_m533' ||
      low === 'model_placeholder_m534' ||
      low === 'model_placeholder_m535' ||
      (low.includes('neon') && !low.includes('orchestrator'))
    ) {
      return effCatalog.find((m) => m.id.includes('neon') && !m.isOrchestrator)?.id || '';
    }
    if (
      low === 'model_placeholder_m400' ||
      low === 'model_placeholder_m401' ||
      low === 'model_placeholder_m402' ||
      low.includes('opus-5-5') ||
      low.includes('opus 5.5')
    ) {
      return effCatalog.find((m) => m.id.includes('opus'))?.id || '';
    }
    if (
      low === 'model_placeholder_m403' ||
      low === 'model_placeholder_m404' ||
      low === 'model_placeholder_m405' ||
      low.includes('sonnet-5-5') ||
      low.includes('sonnet 5.5')
    ) {
      return effCatalog.find((m) => m.id.includes('sonnet'))?.id || '';
    }
    if (low === 'model_openai_gpt_oss_120b_medium' || low.includes('gpt-oss-120b')) {
      return effCatalog.find((m) => m.id.includes('gpt-oss'))?.id || '';
    }
    return '';
  }

  function normalizeDisplayModel(rawModel, provider = 'antigravity', effortHint = '') {
    const provKey = provider === 'claude' ? 'claude' : 'antigravity';
    const s = String(rawModel || '').trim();
    const low = s.toLowerCase();
    const effId = inferEffortIdFromRaw(s, effortHint) || 'high';
    const effCap = formatEffortWord(effId) || 'High';
    if (provKey === 'antigravity') {
      if (low === 'model_placeholder_m537' || (low.includes('orchestrator') && low.includes('neon'))) {
        return 'Orchestrator (Neon)';
      }
      if (
        low === 'model_placeholder_m667' ||
        low === 'model_placeholder_m669' ||
        low === 'gemini-pro-orchestrator' ||
        low === 'gemini-flash-worker-agy' ||
        (low.includes('orchestrator') && low.includes('carbon'))
      ) {
        return 'Orchestrator (Carbon)';
      }
      if (low === 'model_placeholder_m681' || (low.includes('orchestrator') && low.includes('argon'))) {
        return 'Orchestrator (Argon)';
      }
      if (low.includes('orchestrator')) {
        return s;
      }
      if (
        low === 'model_placeholder_m400' ||
        low === 'model_placeholder_m401' ||
        low === 'model_placeholder_m402' ||
        low.includes('opus-5-5') ||
        low.includes('opus 5.5')
      ) {
        return `Claude Opus 5.5 (${effCap})`;
      }
      if (
        low === 'model_placeholder_m403' ||
        low === 'model_placeholder_m404' ||
        low === 'model_placeholder_m405' ||
        low.includes('sonnet-5-5') ||
        low.includes('sonnet 5.5')
      ) {
        return `Claude Sonnet 5.5 (${effCap})`;
      }
      if (low === 'model_openai_gpt_oss_120b_medium' || low.includes('gpt-oss-120b')) {
        return 'GPT-OSS 120B (Medium)';
      }
      if (low === 'model_placeholder_m535' || (low.includes('neon') && low.includes('xhigh'))) {
        return 'Gemini 4 Neon (XHigh)';
      }
      if (
        low === 'model_placeholder_m532' ||
        low === 'model_placeholder_m533' ||
        low === 'model_placeholder_m534' ||
        low.includes('neon')
      ) {
        return `Gemini 4 Neon (${effCap})`;
      }
      if (
        low === 'model_placeholder_m427' ||
        low === 'model_placeholder_m437' ||
        low === 'model_placeholder_m438' ||
        low.includes('carbon')
      ) {
        return `Gemini 4 Carbon (${effCap})`;
      }
      if (low === 'model_placeholder_m528' || (low.includes('hydrogen') && low.includes('xhigh'))) {
        return 'Gemini 4 Hydrogen (XHigh)';
      }
      if (
        low === 'model_placeholder_m525' ||
        low === 'model_placeholder_m526' ||
        low === 'model_placeholder_m527' ||
        low.includes('hydrogen')
      ) {
        return `Gemini 4 Hydrogen (${effCap})`;
      }
      if (
        low === 'model_placeholder_m318' ||
        low === 'model_placeholder_m319' ||
        low === 'model_placeholder_m320' ||
        low === 'model_placeholder_m322' ||
        low.includes('3.8') ||
        low.includes('flash')
      ) {
        return `Gemini 3.8 Flash (${effCap})`;
      }
      if (
        !s ||
        low === 'gemini' ||
        low === 'antigravity' ||
        low.includes('3.1') ||
        low === 'model_placeholder_m417' ||
        low === 'model_placeholder_m418' ||
        low === 'model_placeholder_m419' ||
        low.includes('argon')
      ) {
        return `Gemini 4 Argon (${effCap})`;
      }
      const liveMatch = lookupPwaLiveCatalogModel(s);
      if (liveMatch) {
        const cleanBase = String(stripEffortSuffixForCatalog(liveMatch.baseLabel || liveMatch.label) || s).trim();
        if (liveMatch.supportsThinking === false || liveMatch.isOrchestrator || /orchestrator/i.test(cleanBase)) {
          return liveMatch.label || cleanBase;
        }
        return `${cleanBase} (${effCap})`;
      }
      return s;
    }
    const explicitEff = inferEffortIdFromRaw(s, effortHint);
    const explicitWord = formatEffortWord(explicitEff);
    const claudeSuffix = explicitWord ? ` (${explicitWord})` : '';
    const liveClaudeMatch = lookupPwaClaudeCatalogModel(s);
    if (liveClaudeMatch && liveClaudeMatch.label) {
      return `${liveClaudeMatch.label}${claudeSuffix}`;
    }
    if (low.includes('opus-5-5') || low.includes('opus 5.5')) return `Claude Opus 5.5${claudeSuffix}`;
    if (low.includes('sonnet-5-5') || low.includes('sonnet 5.5')) return `Claude Sonnet 5.5${claudeSuffix}`;
    if (low.includes('haiku-5-5') || low.includes('haiku 5.5')) return `Claude Haiku 5.5${claudeSuffix}`;
    if (low.includes('fable-5-2') || low.includes('fable 5.2')) return `Fable 5.2${claudeSuffix}`;
    if (low.includes('sonnet-4-6') || low.includes('sonnet 4.6') || low.includes('sonnet')) {
      return `Claude Sonnet 4.6${claudeSuffix}`;
    }
    if (low.includes('fable')) {
      return `Fable 5.1${claudeSuffix}`;
    }
    if (!s || low === 'claude' || low.includes('opus-4-7') || low.includes('opus 4.7') || low.includes('opus')) {
      return `Claude Opus 4.7 (1M)${claudeSuffix}`;
    }
    if (low.includes('haiku')) return `Claude Haiku 4.5${claudeSuffix}`;
    return s;
  }

  function inferDefaultContextLimit(provider, modelLabel = '') {
    const low = String(modelLabel || '').trim().toLowerCase();
    if (provider === 'claude') {
      const liveClaude = lookupPwaClaudeCatalogModel(modelLabel);
      if (liveClaude && Number(liveClaude.contextLimit || 0) > 0) {
        return Number(liveClaude.contextLimit);
      }
      if (
        low.includes('[1m]') ||
        low.includes('1m') ||
        low.includes('fable') ||
        low.includes('mythos') ||
        low.includes('opus-4-7') ||
        low.includes('opus 4.7') ||
        low.includes('opus-4-8') ||
        low.includes('opus 4.8') ||
        low.includes('sonnet-5') ||
        low.includes('sonnet 5') ||
        low.includes('opus-5') ||
        low.includes('opus 5') ||
        /\b5\.[0-9]/.test(low)
      ) {
        return 1000000;
      }
      if (
        low.includes('4.5') ||
        low.includes('4-5') ||
        low.includes('4.6') ||
        low.includes('4-6') ||
        low.includes('haiku')
      ) {
        return 200000;
      }
      return 1000000;
    }
    if (!low) return 512000;
    const isExplicit200k = /(?:^|[^a-z0-9])200k(?:[^a-z0-9]|$)/.test(low);
    const isClaudeLike = !isExplicit200k && /(?:^|[^a-z0-9])(model_placeholder_m40[0-5]|claude|opus|sonnet)(?:[^a-z0-9]|$)/.test(low);
    if (isExplicit200k) return 200000;
    const liveEntry = lookupPwaLiveCatalogModel(modelLabel);
    const liveSoft = liveEntry ? Number(liveEntry.softCompactionTargetTokens || liveEntry.maxContextTokens || 0) : 0;
    if (liveSoft > 0) {
      const combined = `${low} ${String(liveEntry?.label || '')} ${String(liveEntry?.modelId || '')}`.toLowerCase();
      const isExplicit200kEntry =
        (isClaudeLike || liveEntry?.isClaudeLike) && /(?:^|[^a-z0-9])200k(?:[^a-z0-9]|$)/.test(combined);
      const isUnqualifiedHardware1M =
        !isClaudeLike &&
        !liveEntry?.isClaudeLike &&
        Boolean(liveEntry?.isFirstPartyGemini) &&
        (liveSoft === 1000000 || liveSoft === 1048576) &&
        !/(?:^|[^a-z0-9])(1m|2m)(?:[^a-z0-9]|$)/.test(combined);
      if (isExplicit200kEntry) {
        return liveSoft <= 200000 ? liveSoft : 200000;
      }
      if (isClaudeLike || liveEntry?.isClaudeLike) {
        return isUnqualifiedHardware1M ? 840000 : Math.max(840000, liveSoft);
      }
      if (
        !isUnqualifiedHardware1M &&
        Boolean(liveEntry?.isFirstPartyGemini) &&
        liveSoft === 256000 &&
        !/(?:^|[^a-z0-9])(128k|200k|256k)(?:[^a-z0-9]|$)/.test(combined)
      ) {
        return 512000;
      }
      if (!isUnqualifiedHardware1M) {
        return liveSoft;
      }
    }
    if (/(?:^|[^a-z0-9])1m(?:[^a-z0-9]|$)/.test(low)) return 1000000;
    if (/(?:^|[^a-z0-9])2m(?:[^a-z0-9]|$)/.test(low)) return 2000000;
    if (/(?:^|[^a-z0-9])900k(?:[^a-z0-9]|$)/.test(low)) return 900000;
    if (/(?:^|[^a-z0-9])840k(?:[^a-z0-9]|$)/.test(low)) return 840000;
    if (/(?:^|[^a-z0-9])512k(?:[^a-z0-9]|$)/.test(low)) return 512000;
    if (/(?:^|[^a-z0-9])256k(?:[^a-z0-9]|$)/.test(low)) return 256000;
    if (/(?:^|[^a-z0-9])128k(?:[^a-z0-9]|$)/.test(low) || /gpt[-_\s]*oss[-_\s]*120b|model_openai_gpt_oss_120b/.test(low)) return 128000;
    if (isClaudeLike) return 840000;
    return 512000;
  }

  function resolveDisplayContextMetrics(provKey, modelLabel, rawUsed, rawLimit, isNewDraft = false, rawHardMax = 0) {
    const defaultLim = inferDefaultContextLimit(provKey, modelLabel);
    const liveEntry = provKey === 'antigravity' ? lookupPwaLiveCatalogModel(modelLabel) : null;
    const parsedLim = Number(rawLimit);
    const numLim = Number.isFinite(parsedLim) ? parsedLim : 0;
    const upgradeClaude1M = provKey === 'claude' && numLim === 200000 && defaultLim === 1000000;
    const upgradeAgyHigher = provKey === 'antigravity' && numLim === 256000 && defaultLim > 256000;
    const limitTokens =
      upgradeClaude1M || upgradeAgyHigher
        ? defaultLim
        : numLim > 0
          ? numLim
          : defaultLim;
    const lowModel = String(modelLabel || '').trim().toLowerCase();
    const isClaudeLike = /(?:^|[^a-z0-9])(model_placeholder_m40[0-5]|claude|opus|sonnet)(?:[^a-z0-9]|$)/.test(lowModel);
    const isThirdParty = /(?:^|[^a-z0-9])(gpt|openai|o1|o3|o4|deepseek|llama|qwen|mistral|grok|kimi|glm|command|nemotron)(?:[^a-z0-9]|$)/.test(lowModel);
    const isFirstPartyGemini =
      provKey === 'antigravity' &&
      !isClaudeLike &&
      !isThirdParty &&
      (liveEntry
        ? Boolean(liveEntry.isFirstPartyGemini)
        : !lowModel ||
          /(?:^|[^a-z0-9])(gemini|orchestrator|carbon|hydrogen|argon|flash)(?:[^a-z0-9]|$)/.test(lowModel) ||
          /^model_placeholder_m\d+$/.test(lowModel));
    const hardMaxTokens = Math.max(
      limitTokens,
      Number(rawHardMax || 0) ||
        Number(liveEntry?.hardMaxTokens || liveEntry?.maxContextTokens || 0) ||
        (isFirstPartyGemini && limitTokens <= 512000 ? 1000000 : limitTokens)
    );
    const parsedUsed = Number(rawUsed);
    const safeUsed = Number.isFinite(parsedUsed) ? parsedUsed : 0;
    const usedTokens = isNewDraft ? 0 : Math.max(0, Math.round(safeUsed));
    const pct =
      !isNewDraft && usedTokens > 0
        ? Math.min(100, Math.max(1, Math.round((usedTokens / Math.max(1, limitTokens)) * 100)))
        : 0;
    const remainingTokens = Math.max(0, limitTokens - usedTokens);
    const overrunTokens = Math.max(0, usedTokens - limitTokens);
    const isSoftOverrun = Boolean(
      !isNewDraft &&
        provKey === 'antigravity' &&
        overrunTokens > 0 &&
        hardMaxTokens > limitTokens &&
        usedTokens < Math.round(hardMaxTokens * 0.95)
    );
    const overrunArcPct = isSoftOverrun
      ? Math.min(
          100,
          Math.max(
            6,
            Math.round((overrunTokens / Math.max(1, hardMaxTokens - limitTokens)) * 100)
          )
        )
      : 0;
    return {
      usedTokens,
      limitTokens,
      hardMaxTokens,
      pct,
      remainingTokens,
      overrunTokens,
      isSoftOverrun,
      overrunArcPct
    };
  }

  function getEffectiveSessionModelConfig(activeRow = null, provKey = 'antigravity', isNewDraft = false) {
    const cleanProv = provKey === 'claude' ? 'claude' : 'antigravity';
    const catalog = getEffectiveModelCatalog(cleanProv);
    const tid = !isNewDraft ? String(activeRow?.id || S.prefs.selectedThreadId || '').trim() : '';
    const rawSavedThreadCfg =
      tid && tid !== '__new__' && S.prefs.threadModelConfig && typeof S.prefs.threadModelConfig === 'object'
        ? S.prefs.threadModelConfig[tid] || null
        : null;
    const serverModelAt = !isNewDraft ? Number(activeRow?.modelUpdatedAt || 0) : 0;
    const savedAt = Number(rawSavedThreadCfg?.updatedAt || 0);
    const savedThreadCfg =
      rawSavedThreadCfg && !(serverModelAt > 0 && serverModelAt > savedAt) ? rawSavedThreadCfg : null;
    const savedCatalogMatch = Boolean(
      savedThreadCfg && catalog.some((m) => m.id === savedThreadCfg.modelId)
    );
    const savedCustomModel = String(savedThreadCfg?.customModel || '').trim();

    const rawRowModel = savedCustomModel || String(activeRow?.model || '').trim();
    const inferredRowModelId = inferModelIdFromRaw(rawRowModel, cleanProv);
    const inferredRowEffort = inferEffortIdFromRaw(rawRowModel, activeRow?.effort || '');

    const isNonCatalogSessionModel =
      !isNewDraft &&
      !savedCatalogMatch &&
      (Boolean(savedCustomModel) ||
        (!inferredRowModelId &&
          Boolean(rawRowModel) &&
          !/gemini\s*3\.1|antigravity|^gemini$/i.test(rawRowModel)));

    const defaultModelObj = catalog.find((m) => m.isDefault) || catalog[0];
    let modelId =
      (savedCatalogMatch && savedThreadCfg.modelId) ||
      (inferredRowModelId && catalog.some((m) => m.id === inferredRowModelId) && inferredRowModelId) ||
      (S.prefs.selectedModelByProvider &&
        catalog.some((m) => m.id === S.prefs.selectedModelByProvider[cleanProv]) &&
        S.prefs.selectedModelByProvider[cleanProv]) ||
      defaultModelObj.id;

    // If the user explicitly changed their thread config (and server isn't newer), honor it over generic server defaults
    if (savedCatalogMatch) {
      modelId = savedThreadCfg.modelId;
    } else if (
      isNewDraft ||
      !rawRowModel ||
      /gemini\s*3\.1|antigravity|^gemini$/i.test(rawRowModel)
    ) {
      const prefMod = S.prefs.selectedModelByProvider?.[cleanProv];
      if (prefMod && catalog.some((m) => m.id === prefMod)) {
        modelId = prefMod;
      } else {
        modelId = defaultModelObj.id;
      }
    }

    const modelEntry = catalog.find((m) => m.id === modelId) || defaultModelObj;
    const modelSupportsEffort =
      isNonCatalogSessionModel ||
      (modelEntry?.supportsEffort !== false &&
        (!Array.isArray(modelEntry?.efforts) || modelEntry.efforts.length > 0));
    const allowedEfforts =
      !isNonCatalogSessionModel && Array.isArray(modelEntry?.efforts) && modelEntry.efforts.length > 0
        ? modelEntry.efforts
        : ['low', 'medium', 'high', 'xhigh'];

    let effort = '';
    if (modelSupportsEffort) {
      const validEffs = new Set(allowedEfforts);
      const savedEff = String(savedThreadCfg?.effort || '').toLowerCase();
      const prefEff = String(S.prefs.selectedThinkingEffort?.[cleanProv] || '').toLowerCase();
      effort = isNonCatalogSessionModel
        ? (validEffs.has(savedEff) && savedEff) ||
          (validEffs.has(inferredRowEffort) && inferredRowEffort) ||
          (validEffs.has(prefEff) && prefEff) ||
          'high'
        : (validEffs.has(savedEff) && savedEff) ||
          (validEffs.has(inferredRowEffort) && inferredRowEffort) ||
          (validEffs.has(prefEff) && prefEff) ||
          (validEffs.has('high') ? 'high' : allowedEfforts[allowedEfforts.length - 1] || 'high');
    }

    const effortEntry = modelSupportsEffort
      ? THINKING_EFFORT_LEVELS.find((e) => e.id === effort) || THINKING_EFFORT_LEVELS[2]
      : null;
    const displayLabel = isNonCatalogSessionModel
      ? normalizeDisplayModel(rawRowModel, cleanProv, effortEntry?.id || 'high')
      : !modelSupportsEffort
        ? modelEntry.label
        : `${modelEntry.label} (${effortEntry.label})`;
    const compactLabel = isNonCatalogSessionModel
      ? displayLabel.replace(/\s*\((Low|Medium|High|XHigh)\)$/i, ' · $1')
      : !modelSupportsEffort
        ? modelEntry.shortLabel || modelEntry.label
        : `${modelEntry.shortLabel || modelEntry.label} · ${effortEntry.label}`;
    return {
      provider: cleanProv,
      isNonCatalog: isNonCatalogSessionModel,
      customModel: isNonCatalogSessionModel ? rawRowModel : '',
      modelId: isNonCatalogSessionModel ? '' : modelEntry.id,
      cliModel: isNonCatalogSessionModel
        ? displayLabel || rawRowModel
        : !modelSupportsEffort
          ? modelEntry.cliModel || modelEntry.id
          : (modelEntry.effortModelIds && modelEntry.effortModelIds[effortEntry.id]) ||
            modelEntry.cliModel ||
            modelEntry.id,
      supportsEffort: modelSupportsEffort,
      efforts: modelSupportsEffort ? allowedEfforts : [],
      effort: effortEntry ? effortEntry.id : '',
      effortLabel: effortEntry ? effortEntry.label : '',
      modelEntry: isNonCatalogSessionModel ? null : modelEntry,
      displayLabel,
      compactLabel
    };
  }

  function setSessionModelConfig({ modelId, effort, provider, threadId } = {}) {
    const targetTidArg = String(threadId || '').trim();
    const isNewDraft = !targetTidArg && S.isNewSessionMode();
    const lookupTid = targetTidArg || S.prefs.selectedThreadId;
    const activeRow = !isNewDraft
      ? (S.appState?.rows || []).find((r) => r && r.id === lookupTid)
      : null;
    const cleanProv =
      (provider || (isNewDraft ? (S.prefs.composerMode === 'new-claude' ? 'claude' : 'antigravity') : activeRow?.provider)) ===
      'claude'
        ? 'claude'
        : 'antigravity';
    const current = getEffectiveSessionModelConfig(activeRow, cleanProv, isNewDraft);
    const catalog = getEffectiveModelCatalog(cleanProv);
    const explicitCatalogModelId =
      modelId && catalog.some((m) => m.id === modelId) ? modelId : '';
    const keepNonCatalog = Boolean(!explicitCatalogModelId && current.isNonCatalog && !isNewDraft);
    const defaultMod = catalog.find((m) => m.isDefault) || catalog[0];
    const nextModelId = explicitCatalogModelId || (keepNonCatalog ? '' : current.modelId || defaultMod.id);
    const nextModelObj = catalog.find((m) => m.id === nextModelId) || defaultMod;
    const nextSupportsEffort =
      keepNonCatalog ||
      (nextModelObj?.supportsEffort !== false &&
        (!Array.isArray(nextModelObj?.efforts) || nextModelObj.efforts.length > 0));
    const nextCustomModel = keepNonCatalog
      ? String(current.customModel || current.displayLabel || '').trim()
      : '';
    const allowedNextEfforts =
      !keepNonCatalog && Array.isArray(nextModelObj?.efforts) && nextModelObj.efforts.length > 0
        ? nextModelObj.efforts
        : ['low', 'medium', 'high', 'xhigh'];
    const reqEff = String(effort ?? '').trim().toLowerCase();
    let nextEffort = '';
    if (nextSupportsEffort) {
      if (reqEff && ['low', 'medium', 'high', 'xhigh'].includes(reqEff) && allowedNextEfforts.includes(reqEff)) {
        nextEffort = reqEff;
      } else if (reqEff === 'xhigh' && !allowedNextEfforts.includes('xhigh')) {
        nextEffort = allowedNextEfforts.includes('high')
          ? 'high'
          : allowedNextEfforts[allowedNextEfforts.length - 1] || 'high';
      } else if (current.effort && allowedNextEfforts.includes(current.effort)) {
        nextEffort = current.effort;
      } else {
        nextEffort = allowedNextEfforts.includes('high')
          ? 'high'
          : allowedNextEfforts[allowedNextEfforts.length - 1] || 'high';
      }
    }

    if (!S.prefs.selectedModelByProvider || typeof S.prefs.selectedModelByProvider !== 'object') {
      S.prefs.selectedModelByProvider = { antigravity: S.defaultAgyModelId, claude: S.defaultClaudeModelId };
    }
    if (!S.prefs.selectedThinkingEffort || typeof S.prefs.selectedThinkingEffort !== 'object') {
      S.prefs.selectedThinkingEffort = { antigravity: 'high', claude: 'high' };
    }
    if (!S.prefs.threadModelConfig || typeof S.prefs.threadModelConfig !== 'object') {
      S.prefs.threadModelConfig = {};
    }

    if (nextModelId) {
      S.prefs.selectedModelByProvider[cleanProv] = nextModelId;
      if (explicitCatalogModelId) {
        if (!S.prefs.modelSelectionExplicit || typeof S.prefs.modelSelectionExplicit !== 'object') {
          S.prefs.modelSelectionExplicit = { antigravity: false, claude: false };
        }
        S.prefs.modelSelectionExplicit[cleanProv] = true;
      }
    }
    if (nextEffort) {
      S.prefs.selectedThinkingEffort[cleanProv] = nextEffort;
    }

    const nowAt = Date.now();
    const targetTid = !isNewDraft ? String(targetTidArg || S.prefs.selectedThreadId || '').trim() : '';
    if (targetTid && targetTid !== '__new__') {
      S.prefs.threadModelConfig[targetTid] = {
        modelId: nextModelId,
        ...(nextCustomModel ? { customModel: nextCustomModel } : {}),
        effort: nextEffort,
        provider: cleanProv,
        updatedAt: nowAt
      };
      const keys = Object.keys(S.prefs.threadModelConfig);
      if (keys.length > 120) {
        keys
          .sort(
            (a, b) =>
              Number(S.prefs.threadModelConfig[a]?.updatedAt || 0) -
              Number(S.prefs.threadModelConfig[b]?.updatedAt || 0)
          )
          .slice(0, keys.length - 120)
          .forEach((k) => delete S.prefs.threadModelConfig[k]);
      }
    }
    S.saveJson(S.STORAGE_KEYS.PREFS, S.prefs);

    const updatedCfg = getEffectiveSessionModelConfig(activeRow, cleanProv, isNewDraft);
    const nextLimit = inferDefaultContextLimit(cleanProv, updatedCfg.displayLabel);
    if (activeRow) {
      activeRow.model = updatedCfg.displayLabel;
      activeRow.effort = updatedCfg.effort;
      activeRow.modelUpdatedAt = nowAt;
      activeRow.neonWarning = Boolean(
        !activeRow.archived && cleanProv !== 'claude' && /neon/i.test(updatedCfg.displayLabel)
      );
      if (nextLimit > 0) {
        activeRow.limitTokens = nextLimit;
        const rowUsed = Math.max(0, Math.round(Number(activeRow.usedTokens || 0)));
        activeRow.contextPct =
          rowUsed > 0 ? Math.min(100, Math.max(1, Math.round((rowUsed / nextLimit) * 100))) : 0;
      }
      S.noteRowOverride(activeRow.id, {
        model: updatedCfg.displayLabel,
        effort: updatedCfg.effort,
        modelUpdatedAt: nowAt,
        neonWarning: activeRow.neonWarning,
        ...(nextLimit > 0 ? { limitTokens: nextLimit } : {})
      });
    }
    if (targetTid && S.threadsCache[targetTid]) {
      S.threadsCache[targetTid].model = updatedCfg.displayLabel;
      S.threadsCache[targetTid].modelUpdatedAt = nowAt;
      if (S.threadsCache[targetTid].contextWindow) {
        const cw = S.threadsCache[targetTid].contextWindow;
        cw.modelLabel = updatedCfg.displayLabel;
        if (nextLimit > 0) {
          const cwUsed = Math.max(0, Math.round(Number(cw.usedTokens || 0)));
          cw.limitTokens = nextLimit;
          cw.maxContextTokens = nextLimit;
          cw.remainingTokens = Math.max(0, nextLimit - cwUsed);
          cw.overrunTokens = Math.max(0, cwUsed - nextLimit);
          cw.pct =
            cwUsed > 0 ? Math.min(100, Math.max(1, Math.round((cwUsed / nextLimit) * 100))) : 0;
        }
      }
    }
    S.persistCache();
    S.renderChatView(false);
    S.renderIdeSidebar();
    S.renderSessionsView();
    S.renderPulseView();

    if (targetTid && targetTid !== '__new__' && !targetTid.startsWith('draft-new-')) {
      S.dispatchRemoteCommand({
        type: 'sessionAction',
        action: 'setModel',
        subAction: 'setModel',
        id: targetTid,
        sessionId: targetTid,
        provider: cleanProv,
        model: updatedCfg.cliModel,
        effort: updatedCfg.effort,
        displayModel: updatedCfg.displayLabel
      }).catch(() => {});
    }
    return updatedCfg;
  }

  let lastModelAnchorEl = null;
  let modelPickerAdjustEffortOpen = false;

  function positionModelPickerPopover(anchorEl = null) {
    const modPop = S.$('model-picker-popover');
    if (!modPop) return;
    if (anchorEl) {
      lastModelAnchorEl = anchorEl;
    }
    const trigger = anchorEl || lastModelAnchorEl || S.$('composer-model-btn');
    if (!trigger || typeof trigger.getBoundingClientRect !== 'function') return;
    const rect = trigger.getBoundingClientRect();
    const vw = Math.max(280, window.innerWidth || 1280);
    const vh = Math.max(320, window.innerHeight || 800);
    const menuW = Math.min(280, vw - 16);
    const clampedLeft = Math.max(8, Math.min(Math.round(rect.left), vw - menuW - 8));
    modPop.style.width = `${menuW}px`;
    modPop.style.left = `${clampedLeft}px`;
    modPop.style.right = 'auto';
    if (rect.top > vh * 0.52) {
      const bottomPx = Math.max(10, Math.round(vh - rect.top + 6));
      modPop.style.bottom = `${bottomPx}px`;
      modPop.style.top = 'auto';
      modPop.style.maxHeight = `${Math.max(160, vh - bottomPx - 10)}px`;
    } else {
      const topPx = Math.max(8, Math.round(rect.bottom + 6));
      modPop.style.top = `${topPx}px`;
      modPop.style.bottom = 'auto';
      modPop.style.maxHeight = `${Math.max(160, vh - topPx - 10)}px`;
    }
  }

  function renderModelPickerPopover(provKey, modelCfg) {
    const bodyEl = S.$('model-picker-body');
    const titleEl = S.$('model-popover-title');
    if (!bodyEl) return;
    const cleanProv = provKey === 'claude' ? 'claude' : 'antigravity';
    const catalog = getEffectiveModelCatalog(cleanProv);
    if (titleEl) {
      titleEl.textContent = cleanProv === 'claude' ? 'Claude Code Model' : 'Model Selection';
    }
    const effortOrder = ['xhigh', 'high', 'medium', 'low'];
    const tagClassFor = (txt) => {
      const l = String(txt || '').toLowerCase();
      if (l.includes('leaving')) return ' tag-leaving';
      if (l.includes('new')) return ' tag-new';
      if (l.includes('1m')) return ' tag-1m';
      if (l.includes('notice') || l.includes('neon')) return ' tag-notice';
      return '';
    };
    const familyGroupsHtml = catalog
      .map((m, famIdx) => {
        const tagTxt = String(
          m.tagTitle ||
            (cleanProv === 'antigravity'
              ? m.id.includes('flash')
                ? 'Fast'
                : m.badge === 'Live' || m.badge === 'Recommended'
                  ? m.badge
                  : ''
              : m.badge) ||
            ''
        ).trim();
        const tagHtml = tagTxt ? `<span class="vs-model-item-tag${tagClassFor(tagTxt)}">${S.esc(tagTxt)}</span>` : '';
        const quotaPct =
          typeof m.quotaRemainingFraction === 'number' && Number.isFinite(m.quotaRemainingFraction)
            ? Math.max(0, Math.min(100, Math.round(m.quotaRemainingFraction * 100)))
            : null;
        const quotaCls = quotaPct == null ? '' : quotaPct <= 10 ? ' is-crit' : quotaPct <= 25 ? ' is-low' : '';
        const quotaBarHtml =
          quotaPct == null
            ? ''
            : `<span class="vs-model-quota${quotaCls}" aria-hidden="true"><span class="vs-model-quota-bar"><i style="width:${quotaPct}%"></i></span><span class="vs-model-quota-pct tabular">${quotaPct}%</span></span>`;
        const quotaAttr =
          quotaPct != null
            ? ` data-micro-tip="Quota remaining: ${quotaPct}%"`
            : '';
        const modelSupportsEff =
          m.supportsEffort !== false && (!Array.isArray(m.efforts) || m.efforts.length > 0);
        if (!modelSupportsEff) {
          const isSel = m.id === modelCfg.modelId;
          return `${famIdx > 0 ? '<div class="vs-model-menu-sep" role="separator"></div>' : ''}
            <button type="button" role="menuitemradio" aria-checked="${isSel ? 'true' : 'false'}" class="vs-model-menu-item${isSel ? ' active' : ''}" data-select-model-combo="${S.esc(`${m.id}:`)}" data-select-ai-model="${S.esc(m.id)}" data-model-prov="${cleanProv}"${quotaAttr}>
              <span class="vs-model-item-check">${isSel ? CHECK_MARK_SVG : ''}</span>
              <span class="vs-model-item-name">${S.esc(m.label)}</span>
              ${quotaBarHtml}
              ${tagHtml}
            </button>
          `;
        }
        const mEffs = Array.isArray(m.efforts) && m.efforts.length ? m.efforts : ['low', 'medium', 'high'];
        const visibleEffs = effortOrder.filter((e) => mEffs.includes(e));
        const rowsHtml = visibleEffs
          .map((effId) => {
            const effObj =
              THINKING_EFFORT_LEVELS.find((e) => e.id === effId) || THINKING_EFFORT_LEVELS[2];
            const isSel = m.id === modelCfg.modelId && effObj.id === modelCfg.effort;
            const isPrimaryFamilyMatch = effObj.id === modelCfg.effort;
            return `
              <button type="button" role="menuitemradio" aria-checked="${isSel ? 'true' : 'false'}" class="vs-model-menu-item${isSel ? ' active' : ''}" data-select-model-combo="${S.esc(`${m.id}:${effObj.id}`)}"${isPrimaryFamilyMatch ? ` data-select-ai-model="${S.esc(m.id)}"` : ''} data-model-prov="${cleanProv}"${quotaAttr}>
                <span class="vs-model-item-check">${isSel ? CHECK_MARK_SVG : ''}</span>
                <span class="vs-model-item-name">${S.esc(`${m.label} (${effObj.label})`)}</span>
                ${quotaBarHtml}
                ${tagHtml}
              </button>
            `;
          })
          .join('');
        return `${famIdx > 0 ? '<div class="vs-model-menu-sep" role="separator"></div>' : ''}${rowsHtml}`;
      })
      .join('');

    const showEffortBar = modelCfg?.supportsEffort !== false;
    const activeInCatalog = catalog.some((m) => m.id === modelCfg.modelId);
    const barEfforts = Array.isArray(modelCfg?.efforts) && modelCfg.efforts.length
      ? THINKING_EFFORT_LEVELS.filter((e) => modelCfg.efforts.includes(e.id))
      : THINKING_EFFORT_LEVELS;
    const effortsBarHtml = barEfforts
      .map((eff) => {
        const isSel = eff.id === modelCfg.effort;
        return `<button type="button" class="vs-effort-pill${isSel ? ' active' : ''}" data-select-ai-effort="${S.esc(eff.id)}" data-model-prov="${cleanProv}" aria-pressed="${isSel ? 'true' : 'false'}">${S.esc(eff.label)}</button>`;
      })
      .join('');

    const effortFooterHtml = !showEffortBar
      ? ''
      : !activeInCatalog || modelPickerAdjustEffortOpen
        ? `<div class="vs-model-menu-sep" role="separator"></div>
           <div class="vs-model-effort-bar" role="group" aria-label="Thinking Level">
             <span class="vs-model-effort-lbl">Thinking</span>
             <div class="vs-model-effort-pills">${effortsBarHtml}</div>
           </div>`
        : `<div class="vs-model-menu-sep" role="separator"></div>
           <div class="vs-model-effort-toggle-row">
             <button type="button" class="vs-effort-adjust-btn" data-toggle-model-effort-bar="1">Thinking: ${S.esc(modelCfg.effortLabel || 'High')} · Adjust</button>
           </div>`;

    bodyEl.innerHTML = `
      <div class="vs-model-menu-list">${familyGroupsHtml}</div>
      ${effortFooterHtml}
    `;
  }

  Object.assign(S, {
    CHEVRON_DOWN_SVG,
    CHEVRON_RIGHT_SVG,
    getEffectiveModelCatalog,
    getEffectiveSessionModelConfig,
    inferDefaultContextLimit,
    ingestLiveAntigravityCatalog,
    ingestLiveClaudeCatalog,
    normalizeDisplayModel,
    positionModelPickerPopover,
    renderModelPickerPopover,
    resolveDisplayContextMetrics,
    setSessionModelConfig
  });
  Object.defineProperties(S, {
    lastModelAnchorEl: { get: () => lastModelAnchorEl, set: (v) => { lastModelAnchorEl = v; }, enumerable: true, configurable: true },
    liveAntigravityCatalog: { get: () => liveAntigravityCatalog, set: (v) => { liveAntigravityCatalog = v; }, enumerable: true, configurable: true },
    liveClaudeCatalog: { get: () => liveClaudeCatalog, set: (v) => { liveClaudeCatalog = v; }, enumerable: true, configurable: true },
    modelPickerAdjustEffortOpen: { get: () => modelPickerAdjustEffortOpen, set: (v) => { modelPickerAdjustEffortOpen = v; }, enumerable: true, configurable: true }
  });


  window.addEventListener(
    'resize',
    () => {
      const modPop = S.$('model-picker-popover');
      if (modPop && !modPop.hidden) {
        positionModelPickerPopover();
      }
      const palPop = S.$('theme-palette-popover');
      if (palPop && !palPop.hidden) {
        S.positionPalettePopover();
      }
    },
    { passive: true }
  );
  });
})();
