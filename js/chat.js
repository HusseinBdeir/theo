(() => {
  'use strict';

  window.__theoRegisterModule('chat', (S) => {
  let lastRenderedThreadId = '';
  let lastRenderedMsgCount = 0;
  const stepKindFilterByTurnKey = new Map();

  // ---------- Interactive Question & Recommendation Cards (VS Code Parity) ----------
  const questionDrafts = new Map();
  const renderedQuestionsByCardKey = new Map();
  const pendingAnsweredSessions = new Map();
  let answeredQuestionsLedger = S.loadJson(S.STORAGE_KEYS.ANSWERED_QUESTIONS, {});

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
    S.saveJson(S.STORAGE_KEYS.ANSWERED_QUESTIONS, answeredQuestionsLedger);

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
      const firstPrompt = String(questions[0]?.question || (anyToolPerm ? 'Tool Permission' : 'Question')).trim();
      const promptsListHtml = questions
        .map((q, idx) => {
          const qTitle = String(q?.question || '').trim();
          if (!qTitle) return '';
          return `
            <div class="vs-q-answered-item">
              ${questions.length > 1 ? `<span class="vs-q-answered-num tabular">Q${idx + 1}</span>` : ''}
              <span class="vs-q-answered-qtext">${S.esc(qTitle)}</span>
            </div>
          `;
        })
        .filter(Boolean)
        .join('');
      const showSummaryLine = Boolean(summaryText && (!hasFollowingTurn || isSkipped || anyToolPerm));
      const ansDetailKey = `${cardKey}:ans`;
      const savedMap = S.getThreadOpenDetailsMap(sessionId, false);
      const isAnsOpen = Boolean(savedMap && savedMap.get(ansDetailKey) === true);

      return `
        <details class="vs-answered-q vs-question-card is-answered" data-q-card="${S.esc(cardKey)}" data-chat-detail-key="${S.esc(ansDetailKey)}" data-rendered-open="${isAnsOpen ? '1' : '0'}"${isAnsOpen ? ' open' : ''}>
          <summary>
            <span class="vs-answered-badge">${isSkipped ? 'Skipped' : anyToolPerm ? '✓ Resolved' : '✓ Answered'}</span>
            <span style="font-weight:500;color:var(--text-heading);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1">${S.esc(questions.length > 1 ? `${questions.length} Questions · ${firstPrompt}` : firstPrompt)}</span>
            ${summaryText ? `<span style="color:var(--text-muted);font-size:var(--fs-xs);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:38%">${S.esc(summaryText)}</span>` : ''}
            <span class="vs-thought-chev" aria-hidden="true">${S.CHEVRON_RIGHT_SVG}</span>
          </summary>
          <div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border-hairline)">
            ${sessionTitle ? `<div class="approval-title">${S.esc(sessionTitle)}</div>` : ''}
            ${promptsListHtml ? `<div class="vs-q-answered-prompts">${promptsListHtml}</div>` : ''}
            ${showSummaryLine || summaryText ? `<div class="vs-q-answered-summary">${S.esc(summaryText)}</div>` : ''}
          </div>
        </details>
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
                data-card-key="${S.esc(cardKey)}"
                data-q-idx="${qIdx}"
                data-opt-idx="${oIdx}"
                aria-pressed="${isSelected ? 'true' : 'false'}"
              >
                <span class="vs-q-check ${q.isMultiSelect ? 'is-checkbox' : 'is-radio'}" aria-hidden="true">${isSelected ? '✓' : ''}</span>
                <span class="vs-q-num tabular">${oIdx + 1}</span>
                <span class="vs-q-opt-body">
                  <span class="vs-q-opt-title-row">
                    <span class="vs-q-opt-text">${S.esc(opt.cleanText || opt.text)}</span>
                    ${opt.isRecommended && !q.isToolPermission ? `<span class="vs-q-rec-badge">★ Recommended</span>` : ''}
                  </span>
                  ${opt.description ? `<span class="vs-q-opt-desc">${S.esc(opt.description)}</span>` : ''}
                </span>
              </button>
            `;
          })
          .join('');

        return `
          <div class="vs-q-block" data-q-block="${qIdx}">
            <div class="vs-q-prompt-row">
              <div class="vs-q-prompt">${S.esc(q.question || 'Question')}</div>
              ${optionsList.length > 0 ? `<span class="vs-q-mode-pill">${S.esc(modeHint)}</span>` : ''}
            </div>
            ${q.codePreview ? `<pre class="code-step-snippet mono" style="margin:6px 0 4px;padding:8px 10px;border-radius:var(--r-md);white-space:pre-wrap;word-break:break-all">${S.esc(q.codePreview)}</pre>` : ''}
            ${q.description ? `<div class="vs-q-opt-desc" style="margin-bottom:6px">${S.esc(q.description)}</div>` : ''}
            ${optionsList.length > 0 ? `<div class="vs-q-options-list">${optionsHtml}</div>` : ''}
            <div class="vs-q-writein-wrap">
              <input
                type="text"
                class="vs-q-writein-input"
                data-q-writein-input="1"
                data-card-key="${S.esc(cardKey)}"
                data-q-idx="${qIdx}"
                placeholder="${S.esc(writeInPh)}"
                value="${S.esc(writeInVal)}"
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
      <div class="vs-question-card" data-q-card="${S.esc(cardKey)}">
        <div class="vs-q-card-top">
          <span class="approval-prov">
            <span class="prov-glyph">${S.PROVIDER_ICONS[provider]}</span>
            <span>${provider === 'claude' ? 'Claude Code' : 'Antigravity'} · ${anyToolPerm ? 'Tool Permission' : 'Question'}</span>
          </span>
          <span class="approval-tool-badge tabular">${S.esc(badgeRight)}</span>
        </div>
        ${sessionTitle ? `<div class="approval-title">${S.esc(sessionTitle)}</div>` : ''}
        ${blocksHtml}
        <div class="vs-q-actions">
          <button
            type="button"
            class="btn-approve btn-q-submit"
            data-q-submit="1"
            data-card-key="${S.esc(cardKey)}"
          >✓ ${anyToolPerm ? (selectedCount > 0 ? `Confirm (${selectedCount})` : 'Yes (Allow)') : `Submit Answer${selectedCount > 0 ? ` (${selectedCount})` : ''}`}</button>
          <button
            type="button"
            class="btn-inspect btn-q-skip"
            data-q-skip="1"
            data-card-key="${S.esc(cardKey)}"
          >${anyToolPerm ? '✕ Deny' : 'Skip'}</button>
          ${showInspectBtn && sessionId ? `<button type="button" class="btn-inspect" data-open-chat="${S.esc(sessionId)}">Inspect</button>` : ''}
        </div>
      </div>
    `;
  }

  // Background Tasks & Subagents Telemetry + Control (Antigravity + Claude Code)
  const bgTaskLogsCache = new Map();
  const openBgTaskDetails = new Set();
  const locallyCancelledBgTasks = new Map();

  function coalesceThreadMessages(rawMessages) {
    if (!Array.isArray(rawMessages) || rawMessages.length === 0) return [];
    const merged = [];
    for (const m of rawMessages) {
      if (!m) continue;
      if (m.role === 'checkpoint') {
        merged.push({ ...m, toolCalls: [], questions: [], artifacts: [], thoughtBlocks: [] });
        continue;
      }
      const prev = merged[merged.length - 1];
      const prevHasAnsweredQuestion =
        Array.isArray(prev?.questions) && prev.questions.some((q) => q && q.answered);
      if (prev && prev.role === 'assistant' && m.role === 'assistant' && !prevHasAnsweredQuestion) {
        const prevBlocks =
          Array.isArray(prev.thoughtBlocks) && prev.thoughtBlocks.length
            ? [...prev.thoughtBlocks]
            : prev.thinking
              ? [{ text: prev.thinking, durationSec: Number(prev.thinkingDurationSec || 0) }]
              : [];
        const nextBlocks =
          Array.isArray(m.thoughtBlocks) && m.thoughtBlocks.length
            ? m.thoughtBlocks.map((b) => ({ ...b }))
            : m.thinking
              ? [{ text: m.thinking, durationSec: Number(m.thinkingDurationSec || 0) }]
              : [];
        if (nextBlocks.length) {
          prev.thoughtBlocks = [...prevBlocks, ...nextBlocks].slice(-18);
        }
        if (m.text) {
          prev.text = prev.text ? `${prev.text}\n\n${m.text}` : m.text;
        }
        if (m.thinking) {
          prev.thinking = prev.thinking ? `${prev.thinking}\n\n${m.thinking}` : m.thinking;
        }
        if (m.latestThinking) {
          prev.latestThinking = m.latestThinking;
        }
        prev.thinkingDurationSec =
          Number(prev.thinkingDurationSec || 0) + Number(m.thinkingDurationSec || 0);
        prev.turnDurationSec =
          Number(prev.turnDurationSec || 0) + Number(m.turnDurationSec || 0);
        if (Array.isArray(m.toolCalls) && m.toolCalls.length) {
          prev.toolCalls = [...(prev.toolCalls || []), ...m.toolCalls].slice(-32);
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
          thoughtBlocks: Array.isArray(m.thoughtBlocks)
            ? m.thoughtBlocks.map((b) => ({ ...b }))
            : m.thinking
              ? [{ text: m.thinking, durationSec: Number(m.thinkingDurationSec || 0) }]
              : [],
          toolCalls: Array.isArray(m.toolCalls) ? [...m.toolCalls] : [],
          questions: Array.isArray(m.questions) ? [...m.questions] : [],
          artifacts: Array.isArray(m.artifacts) ? [...m.artifacts] : []
        });
      }
    }
    return merged;
  }

  function extractThoughtStepTitle(rawText) {
    const firstLine = String(rawText || '')
      .replace(/```[\s\S]*?```/g, '')
      .split(/\r?\n/)
      .map((l) => l.replace(/^[#>*\-\d.)\s`]+/, '').replace(/[*`_~]+/g, '').trim())
      .find((l) => l.length >= 4);
    if (!firstLine) return '';
    const clause = firstLine.split(/(?<=[.!?])\s+|\s+—\s+|\s+-\s+/)[0] || firstLine;
    return clause.length > 56 ? `${clause.slice(0, 54).trim()}…` : clause;
  }

  function cleanCheckpointPreview(rawText) {
    let s = String(rawText || '').trim();
    if (!s) return 'Context compacted';
    s = s
      .replace(/^#+\s*Resuming from a compaction\b[^\r\n]*/im, '')
      .replace(/You are continuing work on the task described above,?\s*but your[^\r\n.]*\.?/gi, '')
      .replace(/The following is a summary of the conversation history[^\r\n.]*\.?/gi, '')
      .replace(/This summary was generated at[^\r\n.]*\.?/gi, '')
      .replace(/^#+\s*(?:User Requests|Previous Session Summary|Task Overview|Progress|Active Context|Next Steps)\s*:?/gim, '')
      .replace(/<\/?summary>/gi, '')
      .replace(/[*`#_>]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!s || s.length < 3) return 'Context compacted';
    return s.slice(0, 76);
  }

  function stripClaudeInternalTags(raw) {
    return String(raw || '')
      .replace(/<agent-message\b[^>]*>[\s\S]*?<\/agent-message>/gi, '')
      .replace(/<browser_instruction>[\s\S]*?<\/browser_instruction>/gi, '')
      .replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/gi, '')
      .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, '')
      .replace(/<command-name>[\s\S]*?<\/command-name>/gi, '')
      .replace(/<command-message>[\s\S]*?<\/command-message>/gi, '')
      .replace(/<command-args>[\s\S]*?<\/command-args>/gi, '')
      .replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/gi, '')
      .replace(/<ide_opened_file>[\s\S]*?<\/ide_opened_file>/gi, '')
      .replace(/<ide_selection>[\s\S]*?<\/ide_selection>/gi, '')
      .replace(/\[Request interrupted[^\]]*\]/gi, '')
      .trim();
  }

  function extractTaskNotificationsFromText(rawText, preExtracted = []) {
    const notifications = [];
    const seen = new Set();
    const pushUnique = (item) => {
      if (!item) return;
      const taskIds = Array.isArray(item.taskIds)
        ? item.taskIds.map((x) => String(x || '').trim()).filter((x) => x && !x.startsWith('__orphan_summary__'))
        : [];
      const status = String(item.status || 'info').toLowerCase() || 'info';
      const summary = String(item.summary || '').trim();
      const note = String(item.note || '').trim();
      if (!summary && !note && taskIds.length === 0) return;
      const key = `${status}|${summary}|${taskIds.join(',')}`;
      if (seen.has(key)) return;
      seen.add(key);
      notifications.push({ taskIds, status, summary, note });
    };

    if (Array.isArray(preExtracted)) {
      for (const item of preExtracted) pushUnique(item);
    }

    const src = String(rawText || '');
    const blockRe = /<task-notification>([\s\S]*?)<\/task-notification>/gi;
    let m;
    while ((m = blockRe.exec(src)) !== null) {
      const body = m[1] || '';
      const taskIds = [];
      const tidRe = /<task-id>([\s\S]*?)<\/task-id>/gi;
      let tm;
      while ((tm = tidRe.exec(body)) !== null) {
        const cleanTid = String(tm[1] || '').trim();
        if (cleanTid && !cleanTid.startsWith('__orphan_summary__')) {
          taskIds.push(cleanTid);
        }
      }
      const getTag = (tag) => {
        const mTag = body.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
        return mTag ? String(mTag[1] || '').trim() : '';
      };
      pushUnique({
        taskIds,
        status: getTag('status').toLowerCase() || 'info',
        summary: getTag('summary'),
        note: getTag('note') || getTag('result')
      });
    }

    const stripped = stripClaudeInternalTags(
      src.replace(/<task-notification>[\s\S]*?<\/task-notification>/gi, '')
    );
    return { notifications, humanText: stripped };
  }

  function renderTaskNotificationsHtml(notifications, turnIdKey, createdAt = '', savedOpenMap = null) {
    if (!Array.isArray(notifications) || notifications.length === 0) return '';
    const relTime = createdAt ? S.timeAgo(Date.parse(createdAt)) : '';
    return notifications
      .map((tn, idx) => {
        const statusKey = tn.status === 'completed' || tn.status === 'done'
          ? 'completed'
          : tn.status === 'failed' || tn.status === 'error'
            ? 'failed'
            : tn.status === 'stopped' || tn.status === 'cancelled'
              ? 'stopped'
              : 'info';
        const statusLbl = statusKey === 'completed'
          ? 'Completed'
          : statusKey === 'failed'
            ? 'Failed'
            : statusKey === 'stopped'
              ? 'Stopped'
              : 'Notice';
        const shownIds = tn.taskIds.slice(0, 2);
        const extraIdCount = Math.max(0, tn.taskIds.length - shownIds.length);
        const idsHtml = shownIds.length
          ? `${shownIds.map((id) => `<span class="vs-tn-id mono">${S.esc(id)}</span>`).join('')}${extraIdCount > 0 ? `<span class="vs-tn-id tabular">+${extraIdCount}</span>` : ''}`
          : '';
        const summaryTxt = tn.summary || (shownIds.length ? `Background task ${shownIds.join(', ')} ${statusLbl.toLowerCase()}` : 'Background task update');
        const headHtml = `
          <span class="vs-tn-ico" aria-hidden="true">${S.UI_ICONS.terminal}</span>
          <span class="vs-tn-badge is-${statusKey}">${S.esc(statusLbl)}</span>
          <span class="vs-tn-summary">${S.esc(summaryTxt)}</span>
          ${idsHtml}
          ${idx === 0 && relTime ? `<span class="vs-tn-time tabular">${S.esc(relTime)}</span>` : ''}
        `;
        if (!tn.note) {
          return `<div class="vs-task-notif-card is-static"><div class="vs-task-notif-summary">${headHtml}</div></div>`;
        }
        const tnKey = `${turnIdKey}:tn:${idx}`;
        const isOpen = Boolean(savedOpenMap && savedOpenMap.get(tnKey) === true);
        return `
          <details class="vs-task-notif-card" data-chat-detail-key="${S.esc(tnKey)}" data-rendered-open="${isOpen ? '1' : '0'}"${isOpen ? ' open' : ''}>
            <summary class="vs-task-notif-summary">${headHtml}<span class="vs-thought-chev" aria-hidden="true">${S.CHEVRON_RIGHT_SVG}</span></summary>
            <div class="vs-task-notif-body">${S.esc(tn.note)}</div>
          </details>
        `;
      })
      .join('');
  }

  function cleanUserPromptPreview(rawText) {
    const { notifications, humanText } = extractTaskNotificationsFromText(rawText);
    let text = humanText;
    if (!text && notifications.length > 0) {
      return (notifications[0].summary || 'Background task update').replace(/\s+/g, ' ').trim();
    }
    if (!text) return '';
    if (/^\/compact\b/i.test(text) && text.length <= 24) return '/compact';
    const ctxMatch = text.match(/^\[LIVE WORKSTATION CONTEXT(?:\s*[—-]\s*([^\]]+))?\]\s*\r?\n([\s\S]*?)(?:\r?\n\s*\r?\n|$)/i);
    if (ctxMatch) {
      text = text.slice(ctxMatch[0].length).trim();
    }
    const attachMatch = text.match(/\r?\n*\[Attached Files saved on workstation\]:\s*((?:\r?\n\s*-\s*[^\r\n]+)+)\s*$/i);
    if (attachMatch) {
      text = text.slice(0, text.length - attachMatch[0].length).trim();
    }
    return text.replace(/\s+/g, ' ').trim() || 'Workstation context prompt';
  }

  function renderUserTurnContentHtml(rawText, turnIdKey, createdAt = '', savedOpenMap = null) {
    let text = String(rawText || '').trim();
    const relTime = createdAt ? S.timeAgo(Date.parse(createdAt)) : '';
    if (/^\/compact\b/i.test(text) && text.length <= 24) {
      return `
        <div class="user-compact-cmd-wrap">
          ${relTime ? `<span class="user-turn-time tabular">${S.esc(relTime)}</span>` : ''}
          <span class="user-compact-cmd-pill mono">/compact</span>
        </div>
      `;
    }

    let ctxHeader = '';
    let ctxBody = '';
    const ctxMatch = text.match(/^\[LIVE WORKSTATION CONTEXT(?:\s*[—-]\s*([^\]]+))?\]\s*\r?\n([\s\S]*?)(?:\r?\n\s*\r?\n|$)/i);
    if (ctxMatch) {
      ctxHeader = String(ctxMatch[1] || 'Live').trim();
      ctxBody = String(ctxMatch[2] || '').trim();
      text = text.slice(ctxMatch[0].length).trim();
    }

    const attachedFiles = [];
    const attachMatch = text.match(/\r?\n*\[Attached Files saved on workstation\]:\s*((?:\r?\n\s*-\s*[^\r\n]+)+)\s*$/i);
    if (attachMatch) {
      const rawList = String(attachMatch[1] || '').split(/\r?\n/);
      for (const line of rawList) {
        const mFile = line.match(/^\s*-\s*([^:]+):\s*['"]?([^'"]+)['"]?\s*$/);
        if (mFile) {
          attachedFiles.push({
            name: mFile[1].trim(),
            path: mFile[2].trim()
          });
        }
      }
      text = text.slice(0, text.length - attachMatch[0].length).trim();
    }

    const ctxKey = `${turnIdKey}:userctx`;
    const isCtxOpen = Boolean(savedOpenMap && savedOpenMap.get(ctxKey) === true);
    const ctxHtml = ctxBody
      ? `<details class="user-ctx-chip" data-chat-detail-key="${S.esc(ctxKey)}" data-rendered-open="${isCtxOpen ? '1' : '0'}"${isCtxOpen ? ' open' : ''}>
          <summary class="user-ctx-summary">
            <span>Workstation Context${ctxHeader ? ` · ${S.esc(ctxHeader)}` : ''}</span>
            <span class="vs-thought-chev" aria-hidden="true">${S.CHEVRON_RIGHT_SVG}</span>
          </summary>
          <div class="user-ctx-body mono">${S.esc(ctxBody)}</div>
        </details>`
      : '';

    const attachHtml = attachedFiles.length
      ? `<div class="user-attach-strip">${attachedFiles
          .map(
            (af) =>
              `<span class="user-attach-chip"><span class="mono">${S.esc(af.name)}</span></span>`
          )
          .join('')}</div>`
      : '';

    return `
      ${relTime ? `<div class="user-turn-meta tabular">${S.esc(relTime)}</div>` : ''}
      ${text ? `<div class="turn-text">${S.esc(text)}</div>` : ''}
      ${attachHtml}
      ${ctxHtml}
    `;
  }

  function deriveClientLiveActivity(m, stepToolCalls, threadDetail, isThreadActivelyWorking) {
    if (!isThreadActivelyWorking) return null;
    const srv = threadDetail?.liveActivity;
    const tools = Array.isArray(stepToolCalls) ? stepToolCalls : [];
    const lastTool = tools.length > 0 ? tools[tools.length - 1] : null;
    const rawThinking = String(m?.latestThinking || m?.thinking || '').trim();
    const lastThoughtLine =
      (rawThinking.replace(/```[\s\S]*?```/g, '').split(/\r?\n/).filter(Boolean).pop() || '')
        .replace(/[*`#_>]+/g, '')
        .trim()
        .slice(0, 120);

    let verb = srv?.active && srv?.verb ? String(srv.verb) : 'Thinking…';
    let target = srv?.active && srv?.target ? String(srv.target) : '';
    let file = srv?.active && srv?.file ? String(srv.file) : '';
    let relPath = srv?.active && srv?.relPath ? String(srv.relPath) : '';
    let lineRange = srv?.active && srv?.lineRange ? String(srv.lineRange) : '';
    let kind = srv?.active && srv?.kind ? String(srv.kind) : 'thinking';

    if (lastTool) {
      const k = String(lastTool.kind || 'tool').toLowerCase();
      kind = k;
      file = String(lastTool.file || file || '').trim();
      relPath = String(lastTool.relPath || file || relPath || '').trim();
      lineRange = String(lastTool.lineRange || lineRange || '').trim();
      if (k === 'read' || /view|read/i.test(String(lastTool.name || ''))) {
        verb = 'Reading';
        target = file || lastTool.summary || 'file';
      } else if (k === 'edit' || /edit|replace/i.test(String(lastTool.name || ''))) {
        verb = 'Editing';
        target = file || lastTool.summary || 'file';
      } else if (k === 'write' || /write|create/i.test(String(lastTool.name || ''))) {
        verb = 'Creating';
        target = file || lastTool.summary || 'file';
      } else if (k === 'command' || k === 'cmd' || /command|bash/i.test(String(lastTool.name || ''))) {
        verb = 'Running';
        target = lastTool.summary || lastTool.command || 'command';
      } else if (k === 'search' || /grep|find|search/i.test(String(lastTool.name || ''))) {
        verb = 'Searching';
        target = lastTool.summary || 'workspace';
      } else {
        verb = 'Working on';
        target = file || lastTool.summary || lastTool.label || 'step';
      }
    } else if (m?.activeTool) {
      verb = 'Running';
      target = String(m.activeTool);
      kind = 'command';
    }

    const cleanTarget = String(target || '')
      .replace(/^(?:Read|Viewed|Analyzed|Updated|Wrote|Pattern)\s+/i, '')
      .trim()
      .slice(0, 96);
    const startIso = m?.startedAt || m?.createdAt || srv?.startedAt || '';
    const parsedStart = startIso ? Date.parse(startIso) : 0;
    const startMs =
      Number.isFinite(parsedStart) && parsedStart > 0 && Date.now() - parsedStart < 3600000
        ? parsedStart
        : Date.now() - Math.max(1, Number(m?.turnDurationSec || m?.thinkingDurationSec || 2)) * 1000;
    const elapsedSec = Math.max(1, Math.round((Date.now() - startMs) / 1000));
    const elapsedLabel =
      elapsedSec >= 60
        ? `${Math.floor(elapsedSec / 60)}m ${String(elapsedSec % 60).padStart(2, '0')}s`
        : `${elapsedSec}s`;

    return {
      verb,
      target: cleanTarget,
      file,
      relPath,
      lineRange,
      kind,
      thoughtPreview: srv?.thoughtPreview || lastThoughtLine,
      stepCount: Math.max(Number(m?.totalTurnTools || 0), tools.length, Number(srv?.stepCount || 0)),
      startMs,
      elapsedLabel
    };
  }

  function renderLiveActivityBarHtml(liveAct, turnIdKey, isExpanded = false) {
    if (!liveAct) return '';
    const activeDotIdx = Math.min(5, Math.max(1, (Number(liveAct.stepCount || 1) % 6)));
    const railDotsHtml = [0, 1, 2, 3, 4, 5]
      .map(
        (idx) =>
          `<span class="vs-rail-dot${idx === activeDotIdx ? ' is-active' : idx < activeDotIdx ? ' is-done' : ''}"></span>`
      )
      .join('');
    const targetBadgeHtml = liveAct.file
      ? `<span class="vs-live-target-chip mono" data-preview-file="${S.esc(liveAct.relPath || liveAct.file)}">${S.esc(liveAct.file)}${liveAct.lineRange ? `<span class="vs-live-range">#${S.esc(liveAct.lineRange)}</span>` : ''}</span>`
      : liveAct.target
        ? `<span class="vs-live-target-text mono">${S.esc(liveAct.target)}</span>`
        : '';
    const subPreview =
      !liveAct.file && !liveAct.target && liveAct.thoughtPreview
        ? `<span class="vs-live-thought-sub">${S.esc(liveAct.thoughtPreview)}</span>`
        : '';

    return `
      <div class="vs-live-activity-row" data-live-activity-row="1">
        <div class="vs-live-step-rail" aria-hidden="true">${railDotsHtml}</div>
        <button type="button" class="vs-live-activity-bar${isExpanded ? ' is-expanded' : ''}" aria-expanded="${isExpanded ? 'true' : 'false'}" data-toggle-live-trace="${S.esc(turnIdKey)}">
          <span class="vs-live-pulse-dot" aria-hidden="true"></span>
          <span class="vs-live-verb vs-shimmer-text">${S.esc(liveAct.verb)}</span>
          ${targetBadgeHtml}
          ${subPreview}
          <span class="vs-live-meta tabular">
            ${liveAct.stepCount > 0 ? `<span class="vs-live-step-count">${liveAct.stepCount} ${liveAct.stepCount === 1 ? 'step' : 'steps'}</span>` : ''}
            <span class="vs-live-elapsed" data-live-elapsed-start="${Number(liveAct.startMs || Date.now())}">${S.esc(liveAct.elapsedLabel)}</span>
          </span>
          <span class="vs-thought-chev" aria-hidden="true">${S.CHEVRON_RIGHT_SVG}</span>
        </button>
      </div>
    `;
  }

  function renderCompactedThoughtHtml({ m, turnIdKey, isLastTurn, isActivelyWorking, cleanedText, hasTurnQuestions, savedOpenMap, isStreamingTurn = false }) {
    const rawBlocks =
      Array.isArray(m?.thoughtBlocks) && m.thoughtBlocks.length
        ? m.thoughtBlocks.filter((b) => b && String(b.text || '').trim())
        : m?.thinking
          ? [{ text: String(m.thinking), durationSec: Number(m.thinkingDurationSec || 0) }]
          : !cleanedText && !hasTurnQuestions && m?.latestThinking
            ? [{ text: String(m.latestThinking), durationSec: 0 }]
            : [];
    if (!rawBlocks.length) return '';

    const thinkKey = `${turnIdKey}:think`;
    const isThinkOpen = Boolean(savedOpenMap && savedOpenMap.get(thinkKey) === true);
    const isLiveThinking = Boolean(isLastTurn && isActivelyWorking && !cleanedText && !hasTurnQuestions);
    const totalSec = Math.max(
      0,
      Math.round(
        Number(
          m?.thinkingDurationSec ||
            rawBlocks.reduce((acc, b) => acc + Number(b.durationSec || 0), 0) ||
            0
        )
      )
    );
    const labelTxt = isLiveThinking
      ? 'Thinking…'
      : totalSec > 0
        ? `Thought for ${totalSec}s`
        : rawBlocks.length > 1
          ? `Thought (${rawBlocks.length} steps)`
          : 'Thought process';

    const lastBlockTxt = String(rawBlocks[rawBlocks.length - 1]?.text || '').trim();
    const previewLine = (lastBlockTxt.split(/\n+/).filter(Boolean).pop() || '')
      .replace(/[*`#_>]+/g, '')
      .trim()
      .slice(0, 96);

    const stepsBodyHtml =
      rawBlocks.length > 1
        ? rawBlocks
            .map((b, idx) => {
              const stepTitle = extractThoughtStepTitle(b.text);
              return `
                <div class="vs-thought-step">
                  <div class="vs-thought-step-head">
                    <span class="vs-thought-step-dot" aria-hidden="true"></span>
                    <span class="vs-thought-step-meta tabular">Step ${idx + 1}${stepTitle ? ` · ${S.esc(stepTitle)}` : ''}${b.durationSec ? ` · ${Math.round(Number(b.durationSec))}s` : ''}</span>
                  </div>
                  <div class="vs-thought-step-text md-rich"${idx === rawBlocks.length - 1 && isStreamingTurn ? ' data-stream-think-body="1"' : ''}>${formatTurnMarkdown(String(b.text || '').trim())}</div>
                </div>
              `;
            })
            .join('')
        : `<div class="vs-thought-step-text md-rich"${isStreamingTurn ? ' data-stream-think-body="1"' : ''}>${formatTurnMarkdown(lastBlockTxt)}</div>`;

    return `
      <details class="vs-thought-card thinking-details${isStreamingTurn ? ' is-streaming' : ''}" data-chat-detail-key="${S.esc(thinkKey)}" data-rendered-open="${isThinkOpen ? '1' : '0'}"${isStreamingTurn ? ' data-stream-think-wrap="1"' : ''}${isThinkOpen ? ' open' : ''}>
        <summary class="vs-thought-summary">
          ${
            isLiveThinking
              ? '<span class="vs-thought-live-dot" aria-hidden="true"></span>'
              : '<svg class="vs-thought-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 4.8v3.4l2.2 1.3"/></svg>'
          }
          <span class="vs-thought-lbl tabular">${S.esc(labelTxt)}</span>
          ${rawBlocks.length > 1 ? `<span class="vs-thought-step-pill tabular">${rawBlocks.length} steps</span>` : ''}
          ${previewLine ? `<span class="vs-thought-preview"${isStreamingTurn ? ' data-stream-think-preview="1"' : ''}>${S.esc(previewLine)}</span>` : ''}
          <span class="vs-thought-chev" aria-hidden="true">${S.CHEVRON_RIGHT_SVG}</span>
        </summary>
        <div class="vs-thought-body">${stepsBodyHtml}</div>
      </details>
    `;
  }

  function renderInlineSubagentsHtml(toolCalls, sessionBgTasks, sessionId, provKey) {
    const subCalls = (Array.isArray(toolCalls) ? toolCalls : []).filter(
      (tc) => tc && tc.kind === 'subagent'
    );
    if (!subCalls.length) return '';
    const allTasks = sessionBgTasks?.allTasks || [];
    const cards = subCalls
      .map((sc, idx) => {
        const rawName = String(sc.name || '').toLowerCase();
        const isDefine = rawName === 'define_subagent';
        const isSendMsg = rawName === 'send_message';
        const convId = String(sc.subagentConversationId || '').trim();
        const matchedTask = allTasks.find(
          (t) =>
            (convId && (t.id === convId || t.subagentConversationId === convId)) ||
            (sc.id && t.id === sc.id) ||
            (sc.subagentRole && t.subagentRole === sc.subagentRole)
        );
        const isRunning = matchedTask?.state === 'running';
        const roleTitle =
          sc.subagentRole ||
          matchedTask?.subagentRole ||
          sc.summary ||
          sc.label ||
          (isDefine ? 'Defined Subagent' : 'Side Agent');
        const agentType = sc.subagentType || matchedTask?.subagentType || '';
        const promptPreview = String(sc.subagentPrompt || sc.command || matchedTask?.command || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 190);
        const inspectTargetId = String(matchedTask?.id || convId || sc.id || `subagent-${idx}`);
        const hasLinkedThread = Boolean(
          convId && (S.appState?.rows || []).some((r) => r && r.id === convId)
        );
        const badgeLbl = isDefine
          ? 'Defined'
          : isSendMsg
            ? 'Message'
            : isRunning
              ? '● Running'
              : 'Side Agent';
        return `
          <div class="vs-subagent-card${isRunning ? ' is-running' : ''}">
            <div class="vs-subagent-top">
              <span class="vs-subagent-left">
                <span class="vs-subagent-badge">${S.esc(badgeLbl)}</span>
                <span class="vs-subagent-role">${S.esc(roleTitle)}</span>
                ${agentType ? `<span class="vs-subagent-type">${S.esc(agentType)}</span>` : ''}
              </span>
              <span class="vs-subagent-actions">
                <button type="button" class="insp-mini-btn" data-insp-open-agent="${S.esc(inspectTargetId)}" data-sess-id="${S.esc(sessionId)}" data-session-prov="${provKey}">Inspect Trace</button>
                ${hasLinkedThread ? `<button type="button" class="insp-mini-btn" data-open-conv="${S.esc(convId)}">Open Thread</button>` : ''}
                ${isRunning && matchedTask?.id ? `<button type="button" class="ide-bg-stop" style="display:inline-flex" data-bg-act="stop-task" data-sess-id="${S.esc(sessionId)}" data-task-id="${S.esc(matchedTask.fullId || matchedTask.id)}" data-prov="${provKey}">■ Stop</button>` : ''}
              </span>
            </div>
            ${promptPreview ? `<div class="vs-subagent-prompt">${S.esc(promptPreview)}</div>` : ''}
          </div>
        `;
      })
      .join('');
    return `<div class="vs-subagents-stack">${cards}</div>`;
  }

  function renderChatQuestionDock(activeRow, messages, matchingQuestionApproval, provKey, isNewDraft) {
    const dockEl = S.$('chat-question-dock');
    if (!dockEl) return false;
    if (isNewDraft || !activeRow?.id || activeRow.id === '__new__') {
      dockEl.hidden = true;
      dockEl.innerHTML = '';
      return false;
    }

    const sid = activeRow.id;
    const lastTurn = messages.length > 0 ? messages[messages.length - 1] : null;
    const lastTurnId = lastTurn && lastTurn.role === 'assistant' ? String(lastTurn.id || `turn-${messages.length - 1}`) : '';
    let qList = [];
    let effectiveApproval = matchingQuestionApproval || null;

    if (lastTurn && lastTurn.role === 'assistant') {
      const srvAns = Array.isArray(lastTurn.questions) && lastTurn.questions.some((q) => Boolean(q?.answered));
      if (!srvAns) {
        qList = resolveQuestionsForTurn(lastTurn, effectiveApproval).questions;
      }
    }
    if (!qList.length && effectiveApproval) {
      qList = resolveQuestionsForApproval(effectiveApproval, messages);
    }
    if (!qList.length && activeRow?.pendingQuestion?.questions?.length) {
      qList = normalizeFrontendQuestions(activeRow.pendingQuestion.questions);
    }

    if (!qList.length) {
      dockEl.hidden = true;
      dockEl.innerHTML = '';
      return false;
    }

    const answered = lookupAnsweredQuestionState({
      sessionId: sid,
      approvalId: effectiveApproval?.approvalId || '',
      turnId: lastTurnId,
      questions: qList,
      isLastTurn: true
    });
    const cardKey = `q-dock-${sid}-${effectiveApproval?.approvalId || lastTurnId || 'active'}`;
    const draft = getQuestionDraft(cardKey);
    if (answered?.answered || draft.submitted) {
      dockEl.hidden = true;
      dockEl.innerHTML = '';
      return false;
    }

    renderedQuestionsByCardKey.set(cardKey, {
      cardKey,
      sessionId: sid,
      provider: provKey,
      approvalId: effectiveApproval?.approvalId || sid,
      turnId: lastTurnId,
      stepIndex: extractQuestionsStepIndex(qList, effectiveApproval?.stepIndex ?? null),
      selector: effectiveApproval?.selector || '',
      questions: qList,
      plainQuestionFallback: !effectiveApproval && (!Array.isArray(lastTurn?.questions) || lastTurn.questions.length === 0)
    });

    if (
      document.activeElement &&
      dockEl.contains(document.activeElement) &&
      document.activeElement.matches('[data-q-writein-input]') &&
      document.activeElement.dataset.cardKey === cardKey
    ) {
      dockEl.hidden = false;
      return true;
    }

    let stepIdx = Number(S.activeDockStepByCardKey.get(cardKey) || 0);
    if (!Number.isFinite(stepIdx) || stepIdx < 0 || stepIdx >= qList.length) {
      stepIdx = 0;
    }
    const curQ = qList[stepIdx];
    const selSet = draft.selectedByQ[stepIdx] || new Set();
    const writeVal = String(draft.writeInByQ[stepIdx] || '');
    const opts = Array.isArray(curQ?.options) ? curQ.options : [];
    const anyToolPerm = qList.some((q) => q.isToolPermission);
    const totalSelected = countDraftSelections(draft, qList.length);

    const stepsHtml =
      qList.length > 1
        ? `<span class="q-dock-steps">${qList
            .map((_, idx) => {
              const hasAns =
                Boolean(draft.selectedByQ[idx]?.size) ||
                Boolean(String(draft.writeInByQ[idx] || '').trim());
              return `<button type="button" class="q-step-pill tabular${idx === stepIdx ? ' active' : hasAns ? ' done' : ''}" data-q-dock-step="${idx}" data-card-key="${S.esc(cardKey)}">Q${idx + 1}</button>`;
            })
            .join('')}</span>`
        : '';

    const optsHtml = opts
      .map((opt, oIdx) => {
        const isSel = selSet.has(String(oIdx));
        return `
          <button type="button" class="q-dock-opt${isSel ? ' selected is-selected' : ''}" data-q-opt-toggle="1" data-card-key="${S.esc(cardKey)}" data-q-idx="${stepIdx}" data-opt-idx="${oIdx}" aria-pressed="${isSel ? 'true' : 'false'}">
            <span class="q-dock-kbd">${oIdx + 1}</span>
            <span style="min-width:0;flex:1">${S.esc(opt.cleanText || opt.text)}</span>
            ${opt.isRecommended && !curQ.isToolPermission ? `<span class="sb-q-rec">★ Rec</span>` : ''}
          </button>
        `;
      })
      .join('');

    dockEl.hidden = false;
    dockEl.innerHTML = `
      <div class="q-dock-card" data-q-card="${S.esc(cardKey)}" data-q-active-step="${stepIdx}">
        <div class="q-dock-top">
          <span class="q-dock-kicker">
            <span class="prov-glyph">${S.PROVIDER_ICONS[provKey]}</span>
            <span>${anyToolPerm ? 'Tool Permission Required' : qList.length > 1 ? `Question ${stepIdx + 1} of ${qList.length}` : 'Question Waiting for Your Choice'}</span>
          </span>
          ${stepsHtml}
        </div>
        <div data-q-block="${stepIdx}" style="display:flex;flex-direction:column;gap:6px">
          <div class="q-dock-prompt">${S.esc(curQ?.question || 'Select an option')}</div>
          ${opts.length > 0 ? `<div class="q-dock-options">${optsHtml}</div>` : ''}
          <div class="q-dock-foot">
            <input type="text" class="q-dock-other" data-q-writein-input="1" data-card-key="${S.esc(cardKey)}" data-q-idx="${stepIdx}" placeholder="${S.esc(opts.length > 0 ? 'Or type custom answer…' : 'Type your answer…')}" value="${S.esc(writeVal)}" autocomplete="off">
            <button type="button" class="sb-q-btn" data-q-skip="1" data-card-key="${S.esc(cardKey)}">${anyToolPerm ? '✕ Deny' : 'Skip'}</button>
            ${
              qList.length > 1 && stepIdx < qList.length - 1
                ? `<button type="button" class="sb-q-btn" data-q-dock-step="${stepIdx + 1}" data-card-key="${S.esc(cardKey)}">Next ›</button>`
                : ''
            }
            <button type="button" class="sb-q-btn primary" data-q-submit="1" data-card-key="${S.esc(cardKey)}">✓ ${anyToolPerm ? (totalSelected > 0 ? `Confirm (${totalSelected})` : 'Yes (Allow)') : `Submit Answer${totalSelected > 0 ? ` (${totalSelected})` : ''}`}</button>
          </div>
        </div>
      </div>
    `;
    return true;
  }

  function renderToolCallCardHtml(tc, detailKey = '', savedOpenMap = null, activeKindFilter = 'all') {
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
      if ((kind === 'command' || kind === 'cmd') && /^ran command$/i.test(label)) label = 'Ran';
    }
    const filterCat =
      kind === 'edit' || kind === 'write'
        ? 'edit'
        : kind === 'read'
          ? 'read'
          : kind === 'command' || kind === 'cmd'
            ? 'cmd'
            : kind === 'search'
              ? 'search'
              : 'other';
    const isFilteredOut =
      Boolean(activeKindFilter && activeKindFilter !== 'all' && activeKindFilter !== filterCat);

    const fileBase = String(tc?.file || '').trim();
    const fileStem = fileBase.split('#')[0].trim();
    const relPath = String(tc?.relPath || fileStem || '').trim();
    const lineRange = String(tc?.lineRange || (fileBase.includes('#') ? fileBase.split('#')[1] : '') || '').trim();
    const added = Number(tc?.addedLines ?? tc?.added ?? 0);
    const removed = Number(tc?.removedLines ?? tc?.removed ?? 0);
    const summaryText = String(tc?.summary || '').trim();
    const commandText = String(tc?.command || '').trim();
    const snippet = String(tc?.snippet || tc?.diff || '').trim();

    const chipLabel = lineRange && !fileBase.includes('#') ? `${fileBase}#${lineRange}` : fileBase;
    const chipTarget = relPath
      ? lineRange && !relPath.includes('#')
        ? `${relPath}#${lineRange}`
        : relPath
      : chipLabel;
    const fileChip = fileBase ? renderFileChipHtml(chipLabel, chipTarget) : '';
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
    const detailKeyAttrs = `${
      detailKey
        ? ` data-chat-detail-key="${S.esc(detailKey)}" data-rendered-open="${isStepOpen ? '1' : '0'}"${isStepOpen ? ' open' : ''}`
        : ''
    } data-step-kind="${S.esc(filterCat)}"${isFilteredOut ? ' hidden' : ''}`;

    const headInner = `
      <div class="code-step-head">
        <span class="code-step-badge kind-${S.esc(kind)}">${S.esc(label)}</span>
        ${fileChip}
        ${displaySummary ? `<span class="code-step-summary${kind === 'command' || kind === 'cmd' ? ' mono' : ''}">${S.esc(displaySummary)}</span>` : ''}
        ${diffBadge}
        ${hasInspectableBody ? `<span class="code-step-chevron" aria-hidden="true">${S.CHEVRON_RIGHT_SVG}</span>` : ''}
      </div>
    `;

    if (snippet) {
      return `
        <details class="code-step-card has-snippet is-interactive"${detailKeyAttrs}>
          <summary>${headInner}</summary>
          <div class="code-step-detail-box">
            ${relPath ? `<div class="code-step-detail-bar"><span class="mono">${S.esc(relPath)}${lineRange ? `#${S.esc(lineRange)}` : ''}</span><span style="display:inline-flex;gap:5px"><button type="button" class="ide-step-mention-btn" data-preview-file="${S.esc(chipTarget)}">Inspect</button><button type="button" class="ide-step-mention-btn" data-step-mention-file="${S.esc(relPath)}">@ Mention</button></span></div>` : ''}
            <pre class="code-step-snippet mono">${S.formatGitDiffHtml(snippet)}</pre>
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
              <span class="mono">${S.esc(detailLine)}</span>
              ${relPath ? `<span style="display:inline-flex;gap:5px"><button type="button" class="ide-step-mention-btn" data-preview-file="${S.esc(chipTarget)}">Inspect</button><button type="button" class="ide-step-mention-btn" data-step-mention-file="${S.esc(relPath)}">@ Mention</button></span>` : ''}
            </div>
            ${summaryText && summaryText !== detailLine ? `<div class="code-step-detail-note">${S.esc(summaryText)}</div>` : ''}
          </div>
        </details>
      `;
    }

    return `<div class="code-step-card" data-step-kind="${S.esc(filterCat)}"${isFilteredOut ? ' hidden' : ''}>${headInner}</div>`;
  }

  function syncComposerRoutingSelectors(activeRow, isNewDraft) {
    const devSel = S.$('composer-device-select');
    const repoSel = S.$('composer-repo-select');
    const directBtn = S.$('composer-direct-toggle');
    const fleetDevices = S.getUnifiedFleetDevices();

    if (devSel && document.activeElement !== devSel) {
      const wantDev = !isNewDraft && activeRow?.deviceId
        ? activeRow.deviceId
        : S.prefs.composerTargetDevice || 'auto';
      const opts = [
        `<option value="auto" ${wantDev === 'auto' ? 'selected' : ''}>Auto (${S.esc(S.localWsDevice?.name || 'Active Host')})</option>`
      ];
      for (const d of fleetDevices) {
        const sel = wantDev === d.id ? 'selected' : '';
        opts.push(
          `<option value="${S.esc(d.id)}" ${sel}>${d.online ? '● ' : '◐ '}${S.esc(d.name || d.id)}</option>`
        );
      }
      devSel.innerHTML = opts.join('');
      devSel.disabled = Boolean(!isNewDraft && activeRow?.deviceId);
    }

    if (repoSel && document.activeElement !== repoSel) {
      const rawWorkspaces = Array.isArray(S.appState?.workspaces) ? S.appState.workspaces : [];
      const rankedWorkspaces = S.rankByFreq(
        rawWorkspaces,
        'repos',
        (w) => w.name || w.id,
        (w) => Number(w.dirtyCount || 0) * 10
      );
      const curRepo = String(S.prefs.composerRepoPrefix || '').trim();
      const repoOpts = [
        `<option value="" ${!curRepo ? 'selected' : ''}>Default Workspace</option>`
      ];
      for (const w of rankedWorkspaces) {
        const val = w.name || w.id;
        const sel = curRepo.toLowerCase() === String(val).toLowerCase() ? 'selected' : '';
        repoOpts.push(
          `<option value="${S.esc(val)}" ${sel}>${S.esc(w.name)}${w.branch ? ` (${S.esc(w.branch)})` : ''}</option>`
        );
      }
      repoSel.innerHTML = repoOpts.join('');
    }

    if (directBtn) {
      const isDirect = S.prefs.composerDirectStream !== false;
      directBtn.classList.toggle('active', isDirect);
      directBtn.textContent = isDirect ? 'Direct' : 'IDE Tab';
    }

    const routeLblEl = S.$('composer-route-pill-label');
    if (routeLblEl) {
      const curRepo = String(S.prefs.composerRepoPrefix || '').trim();
      const targetDev = String(S.prefs.composerTargetDevice || 'auto').trim();
      const devEntry = targetDev !== 'auto' ? fleetDevices.find((d) => d && d.id === targetDev) : null;
      const devName = devEntry?.name || (targetDev !== 'auto' ? targetDev : '');
      let nextRouteLbl = 'Route';
      if (isNewDraft) {
        if (curRepo && devName) nextRouteLbl = `${devName} · ${curRepo}`;
        else if (curRepo) nextRouteLbl = curRepo;
        else if (devName) nextRouteLbl = devName;
      } else {
        const sessFolder = String(activeRow?.folder || '').trim();
        if (sessFolder && !/^workspace$/i.test(sessFolder)) {
          nextRouteLbl = sessFolder;
        } else if (curRepo) {
          nextRouteLbl = curRepo;
        }
      }
      if (routeLblEl.textContent !== nextRouteLbl) routeLblEl.textContent = nextRouteLbl;
    }
  }

  function syncComposerGitAndModeControls(activeRow, threadDetail, provKey, isNewDraft) {
    const modeBtn = S.$('composer-claude-mode-btn');
    if (modeBtn) {
      if (provKey === 'claude') {
        const activeMode =
          typeof S.getEffectiveClaudePermissionMode === 'function'
            ? S.getEffectiveClaudePermissionMode()
            : S.claudeModeState?.defaultMode || 'bypassPermissions';
        const shortLabel =
          activeMode === 'bypassPermissions'
            ? 'Bypass'
            : activeMode === 'auto'
              ? 'Auto'
              : activeMode === 'plan'
                ? 'Plan'
                : 'Default';
        const modeCls =
          activeMode === 'bypassPermissions'
            ? 'is-bypass'
            : activeMode === 'auto'
              ? 'is-auto'
              : activeMode === 'plan'
                ? 'is-plan'
                : '';
        modeBtn.hidden = false;
        modeBtn.className = `composer-claude-mode-pill${modeCls ? ` ${modeCls}` : ''}`;
        modeBtn.dataset.curClaudeMode = activeMode;
        const wantHtml = `<span class="claude-mode-pill-dot" aria-hidden="true"></span><span>${S.esc(shortLabel)}</span>`;
        if (modeBtn.dataset.modeHtmlSig !== `${activeMode}:${shortLabel}`) {
          modeBtn.dataset.modeHtmlSig = `${activeMode}:${shortLabel}`;
          modeBtn.innerHTML = wantHtml;
        }
      } else {
        modeBtn.hidden = true;
      }
    }

    const gitStripEl = S.$('composer-git-strip');
    if (!gitStripEl) return;
    if (isNewDraft || !activeRow?.id || activeRow.id === '__new__') {
      gitStripEl.hidden = true;
      gitStripEl.innerHTML = '';
      gitStripEl.dataset.gitSig = '';
      return;
    }
    const wsCtx =
      typeof S.resolveSessionWorkspaceContext === 'function'
        ? S.resolveSessionWorkspaceContext(activeRow, threadDetail)
        : null;
    const ws = wsCtx?.matchedWs || null;
    const wsDet = ws?.id ? S.workspacesDetailCache?.[ws.id] : null;
    const hasExplicitCleanWs = typeof ws?.dirtyCount === 'number' && Number(ws.dirtyCount) <= 0;
    const modList = hasExplicitCleanWs
      ? []
      : Array.isArray(wsDet?.modifiedFiles) && wsDet.modifiedFiles.length
        ? wsDet.modifiedFiles
        : Array.isArray(ws?.modifiedFiles)
          ? ws.modifiedFiles
          : [];
    const dirtyCnt = hasExplicitCleanWs ? 0 : Math.max(Number(ws?.dirtyCount || 0), modList.length);
    if (!ws || ws.noGit || ws.id === 'theo-memory' || dirtyCnt <= 0) {
      gitStripEl.hidden = true;
      gitStripEl.innerHTML = '';
      gitStripEl.dataset.gitSig = '';
      return;
    }
    const ins = Number(
      wsDet?.insertions ??
        ws.insertions ??
        modList.reduce((acc, f) => acc + Number(f?.added ?? f?.insertions ?? 0), 0)
    );
    const del = Number(
      wsDet?.deletions ??
        ws.deletions ??
        modList.reduce((acc, f) => acc + Number(f?.removed ?? f?.deletions ?? 0), 0)
    );
    const diffHtml =
      ins > 0 || del > 0
        ? `<span class="composer-git-diff">${ins > 0 ? `<span class="diff-add">+${S.esc(String(ins))}</span>` : ''}${del > 0 ? `<span class="diff-del">-${S.esc(String(del))}</span>` : ''}</span>`
        : '';
    const metaLabel = ws.name ? `${ws.name}${ws.branch ? ` · ${ws.branch}` : ''}` : '';
    const gitSig = `${ws.id}:${dirtyCnt}:${ins}:${del}:${metaLabel}`;
    if (gitStripEl.dataset.gitSig !== gitSig) {
      gitStripEl.dataset.gitSig = gitSig;
      gitStripEl.innerHTML = `
        <button type="button" class="composer-git-info-btn" data-open-git-review="${S.esc(ws.id || '')}" data-micro-tip="Inspect uncommitted changes in Split Inspector">
          <svg class="ui-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="4.5" cy="4" r="1.5"/><circle cx="4.5" cy="12" r="1.5"/><circle cx="11.5" cy="7.5" r="1.5"/><path d="M4.5 5.5v5M6 4h2.5a3 3 0 0 1 3 2"/></svg>
          <strong>${dirtyCnt} ${dirtyCnt === 1 ? 'file' : 'files'} changed</strong>
          ${diffHtml}
          ${metaLabel ? `<span class="composer-git-ws">${S.esc(metaLabel)}</span>` : ''}
          <span class="composer-git-chev" aria-hidden="true">${S.CHEVRON_RIGHT_SVG}</span>
        </button>
        <button type="button" class="composer-git-review-btn" data-open-git-review="${S.esc(ws.id || '')}">Review</button>
      `;
    }
    gitStripEl.hidden = false;
  }

  function renderNewSessionLaunchpadHtml(provKey, modelCfg, grpObj) {
    const cleanProv = provKey === 'claude' ? 'claude' : 'antigravity';
    const rawWorkspaces = Array.isArray(S.appState?.workspaces) ? S.appState.workspaces : [];
    const rankedWorkspaces = S.rankByFreq(
      rawWorkspaces,
      'repos',
      (w) => w.name || w.id,
      (w) => Number(w.dirtyCount || 0) * 10
    ).slice(0, 5);
    const curScope = String(S.prefs.composerRepoPrefix || '').trim();

    const scopeChips = [
      `<button type="button" class="lp-scope-chip${!curScope ? ' active' : ''}" data-launchpad-scope="">Default Workspace</button>`,
      ...rankedWorkspaces.map((w) => {
        const name = String(w.name || w.id || '').trim();
        const isSel = curScope.toLowerCase() === name.toLowerCase();
        return `<button type="button" class="lp-scope-chip${isSel ? ' active' : ''}" data-launchpad-scope="${S.esc(name)}">${S.esc(name)}</button>`;
      })
    ].join('');

    return `
      <div class="new-session-launchpad is-minimal" data-launchpad-prov="${cleanProv}">
        <div class="lp-head">
          <div class="lp-prov-switch" role="group" aria-label="Select AI Provider">
            <button type="button" class="lp-prov-btn${cleanProv === 'antigravity' ? ' active' : ''}" data-comp-mode="new-antigravity">
              <span class="prov-glyph">${S.PROVIDER_ICONS.antigravity}</span>
              <span>Antigravity</span>
            </button>
            <button type="button" class="lp-prov-btn${cleanProv === 'claude' ? ' active' : ''}" data-comp-mode="new-claude">
              <span class="prov-glyph">${S.PROVIDER_ICONS.claude}</span>
              <span>Claude Code</span>
            </button>
          </div>
          ${
            grpObj
              ? `<div class="lp-title">
                   <span class="lp-group-chip">
                     <span class="lp-group-chip-lbl">${S.esc(grpObj.name)}</span>
                     <button type="button" class="lp-group-clear-btn" data-clear-new-session-group="1" data-micro-tip="Open in Ungrouped instead" aria-label="Open in Ungrouped instead of ${S.esc(grpObj.name)}">× Ungrouped</button>
                   </span>
                 </div>`
              : ''
          }
        </div>
        ${
          rankedWorkspaces.length > 0
            ? `<div class="lp-scope-row" role="group" aria-label="Workspace scope">${scopeChips}</div>`
            : ''
        }
      </div>
    `;
  }

  function resolveSessionHostDevice(activeRow = null, isNewDraft = false) {
    if ((typeof navigator !== 'undefined' && navigator.onLine === false) || S.connMode === 'offline') {
      return null;
    }
    const fleet = S.getUnifiedFleetDevices();
    let hostDev = null;
    if (!isNewDraft && activeRow?.deviceId) {
      hostDev = fleet.find((d) => d && d.id === activeRow.deviceId) || null;
    } else if (isNewDraft) {
      const targetDev =
        S.prefs.composerTargetDevice && S.prefs.composerTargetDevice !== 'auto'
          ? String(S.prefs.composerTargetDevice).trim()
          : S.prefs.selectedDeviceFilter && S.prefs.selectedDeviceFilter !== 'all'
            ? String(S.prefs.selectedDeviceFilter).trim()
            : '';
      if (targetDev) {
        hostDev = fleet.find((d) => d && d.id === targetDev) || null;
      }
      const fallbackNewDevId = S.localWsDevice?.id || S.appState?.device?.id || '';
      if (!hostDev && fallbackNewDevId) {
        hostDev = fleet.find((d) => d && d.id === fallbackNewDevId) || null;
      }
      if (!hostDev) {
        hostDev = fleet.find((d) => d && d.isSelf) || fleet.find((d) => d && d.online) || null;
      }
    } else {
      const fallbackDevId = S.localWsDevice?.id || S.appState?.device?.id || '';
      if (fallbackDevId) {
        hostDev = fleet.find((d) => d && d.id === fallbackDevId) || null;
      }
      if (!hostDev) {
        hostDev = fleet.find((d) => d && d.isSelf) || fleet.find((d) => d && d.online) || null;
      }
    }
    return hostDev;
  }

  function isHostVsCodeOpenForSession(activeRow = null, isNewDraft = false) {
    const hostDev = resolveSessionHostDevice(activeRow, isNewDraft);
    return Boolean(hostDev && hostDev.online !== false && hostDev.pwaReady && hostDev.pwaReady.vscodeOpen === true);
  }

  const pendingCompactByThread = new Map();
  const compactionWatermarkByThread = new Map();

  function clearPendingCompactState(tid) {
    const entry = pendingCompactByThread.get(tid);
    if (!entry) return;
    for (const tm of entry.timers || []) {
      clearTimeout(tm);
    }
    pendingCompactByThread.delete(tid);
  }

  function reconcileCompactionContextTokens(tid, activeRow, threadDetail) {
    const rawCtx = threadDetail?.contextWindow || {};
    const msgs = Array.isArray(threadDetail?.messages) ? threadDetail.messages : [];
    const nonOptMsgs = msgs.filter((m) => m && !m.optimistic);
    let cpCount = 0;
    let lastCpIdx = -1;
    for (let i = 0; i < nonOptMsgs.length; i++) {
      if (nonOptMsgs[i].role === 'checkpoint') {
        cpCount += 1;
        lastCpIdx = i;
      }
    }
    const lastNonOptIsCp = lastCpIdx >= 0 && lastCpIdx === nonOptMsgs.length - 1;
    const afterCpMsgs = lastCpIdx >= 0 ? nonOptMsgs.slice(lastCpIdx + 1) : [];
    const hasUserAfterCp = afterCpMsgs.some((m) => m.role === 'user');
    const ctxUsedNum = Number(rawCtx.usedTokens);
    const rowUsedNum = Number(activeRow?.usedTokens ?? activeRow?.contextTokens);
    const hasCtxUsed = rawCtx.usedTokens != null && rawCtx.usedTokens !== '' && Number.isFinite(ctxUsedNum);
    const hasRowUsed = (activeRow?.usedTokens != null || activeRow?.contextTokens != null) && Number.isFinite(rowUsedNum);

    let justCompacted = false;
    const pending = tid ? pendingCompactByThread.get(tid) : null;
    if (pending && tid) {
      const cpIncreased = cpCount > pending.baselineCheckpoints;
      const tokensDropped =
        (hasCtxUsed && pending.prevUsedTokens > 0 && ctxUsedNum < pending.prevUsedTokens * 0.88) ||
        (hasRowUsed && pending.prevUsedTokens > 0 && rowUsedNum < pending.prevUsedTokens * 0.88);
      if (cpIncreased || tokensDropped) {
        justCompacted = true;
        clearPendingCompactState(tid);
      } else if (Date.now() - pending.startedAt > 90000) {
        clearPendingCompactState(tid);
      }
    }

    if (hasCtxUsed && hasRowUsed && ctxUsedNum !== rowUsedNum) {
      const wm = tid ? compactionWatermarkByThread.get(tid) : null;
      const atBoundary =
        justCompacted ||
        lastNonOptIsCp ||
        (lastCpIdx >= 0 &&
          !hasUserAfterCp &&
          (!wm || wm.cpCount !== cpCount || ctxUsedNum < rowUsedNum * 0.88 || rowUsedNum < ctxUsedNum * 0.88));
      if (atBoundary) {
        const minUsed = Math.min(ctxUsedNum, rowUsedNum);
        if (tid) compactionWatermarkByThread.set(tid, { cpCount, baselineTokens: minUsed });
        if (activeRow) activeRow.usedTokens = minUsed;
        if (threadDetail?.contextWindow) threadDetail.contextWindow.usedTokens = minUsed;
        return minUsed;
      }
      // Once subsequent turns run after the checkpoint, trust the higher (newer) token count
      if (cpCount > 0) {
        return Math.max(ctxUsedNum, rowUsedNum);
      }
    }
    if (hasCtxUsed) return ctxUsedNum;
    if (hasRowUsed) return rowUsedNum;
    return 0;
  }

  async function triggerActiveSessionCompact() {
    if (S.isPinLocked()) return;
    const tid = S.cleanTargetThreadId(S.prefs.selectedThreadId);
    if (S.isNewSessionMode() || !tid) {
      S.showToast('Select an active session first to run /compact');
      return;
    }
    const existing = pendingCompactByThread.get(tid);
    if (existing && Date.now() - existing.startedAt < 4000) {
      S.showToast('Compaction already dispatched for this session');
      return;
    }

    const activeRow = (S.appState?.rows || []).find((r) => r && r.id === tid) || null;
    const td = S.threadsCache[tid] || null;
    const prov = activeRow?.provider || td?.provider || 'antigravity';
    const prevUsedTokens = reconcileCompactionContextTokens(tid, activeRow, td);
    const msgs = Array.isArray(td?.messages) ? td.messages : [];
    const baselineCheckpoints = msgs.filter((m) => m && m.role === 'checkpoint').length;

    const ctxPop = S.$('ctx-popover');
    if (ctxPop) ctxPop.hidden = true;
    const moreMenu = S.$('chat-more-menu');
    if (moreMenu) moreMenu.hidden = true;
    S.$('btn-chat-more')?.setAttribute('aria-expanded', 'false');

    const optMsgId = `local-compact-${Date.now()}`;
    if (!S.threadsCache[tid]) {
      S.threadsCache[tid] = { id: tid, provider: prov, messages: [] };
    }
    const curMsgs = Array.isArray(S.threadsCache[tid].messages) ? S.threadsCache[tid].messages : [];
    const lastMsg = curMsgs[curMsgs.length - 1];
    let pushedOpt = false;
    if (!lastMsg || !(lastMsg.role === 'user' && /^\/compact\b/i.test(String(lastMsg.text || '').trim()))) {
      curMsgs.push({
        id: optMsgId,
        role: 'user',
        createdAt: new Date().toISOString(),
        text: '/compact',
        toolCalls: [],
        optimistic: true,
        optimisticAt: Date.now()
      });
      S.threadsCache[tid].messages = curMsgs;
      pushedOpt = true;
    }

    clearPendingCompactState(tid);
    const timers = [];
    pendingCompactByThread.set(tid, {
      startedAt: Date.now(),
      prevUsedTokens,
      baselineCheckpoints,
      timers
    });
    renderChatView(true);

    const res = await S.dispatchRemoteCommand({
      type: 'sessionAction',
      action: 'compact',
      subAction: 'compact',
      id: tid,
      provider: prov
    });
    const innerFailed = res?.ok === false || res?.out?.ok === false || res?.out?.result?.ok === false;
    if (innerFailed) {
      clearPendingCompactState(tid);
      if (pushedOpt && S.threadsCache[tid]?.messages) {
        S.threadsCache[tid].messages = S.threadsCache[tid].messages.filter((m) => m && m.id !== optMsgId);
      }
      renderChatView(false);
      S.showToast(res?.out?.error || res?.error || 'Unable to dispatch /compact to session');
      return;
    }

    if (!S.isHeadlessBrowser) {
      for (const delay of [1800, 4500, 9000, 16000]) {
        const tm = setTimeout(() => {
          if (!pendingCompactByThread.has(tid)) return;
          S.syncData().catch(() => {});
          S.fetchThreadDetail(tid, prov).catch(() => {});
        }, delay);
        timers.push(tm);
      }
    }

    S.showToast(
      res?.mode === 'quarantined'
        ? 'Sent /compact to active session'
        : res?.mode === 'cloud'
          ? 'Queued /compact via Cloud Store (refreshes on sync)'
          : res?.mode === 'queued'
            ? 'Offline: /compact queued in outbox'
            : 'Compacting context window…'
    );
  }

  // VIEW 3: Render Live Chat Workbench
  function renderChatView(forceScroll = false) {
    return S.runViewBoundary('chat', 'Chat Workbench', { elId: 'chat-stream', mode: 'replace' }, () => {
    S.ensureSelectedThread();
    S.syncAndRenderEditorTabs();
    updateComposerModePills();
    const rows = (S.appState?.rows || []).filter((r) => r.id && !r.draft);
    const isNewDraft = S.isNewSessionMode();
    const newProv = S.prefs.composerMode === 'new-claude' ? 'claude' : 'antigravity';
    const threadDetail = isNewDraft ? null : S.threadsCache[S.prefs.selectedThreadId] || null;
    const matchedRow = isNewDraft ? null : rows.find((r) => r.id === S.prefs.selectedThreadId);
    syncComposerRoutingSelectors(matchedRow, isNewDraft);
    const initialDraftModelCfg = S.getEffectiveSessionModelConfig(null, newProv, true);
    const activeRow = isNewDraft
      ? {
          id: '__new__',
          title: `New ${newProv === 'claude' ? 'Claude Code' : 'Antigravity'} Session`,
          provider: newProv,
          folder: S.prefs.composerRepoPrefix
            ? `Scope: ${S.prefs.composerRepoPrefix}`
            : 'Workspace',
          model: initialDraftModelCfg.displayLabel,
          effort: initialDraftModelCfg.effort,
          status: 'idle',
          at: Date.now()
        }
      : matchedRow ||
        (S.prefs.selectedThreadId
          ? {
              id: S.prefs.selectedThreadId,
              title:
                threadDetail?.title ||
                S.pinnedNavTitle ||
                'Task Session',
              provider:
                threadDetail?.provider ||
                S.pinnedNavProvider ||
                'antigravity',
              folder: threadDetail?.folder || '',
              model: threadDetail?.model || '',
              modelUpdatedAt: Number(threadDetail?.modelUpdatedAt || 0),
              status: 'done',
              at: Date.now()
            }
          : rows[0]);

    const titleEl = S.$('chat-session-title');
    const editingHeaderTitle = Boolean(
      S.activeIdeRename &&
        S.activeIdeRename.kind === 'chat-session' &&
        activeRow?.id &&
        S.activeIdeRename.id === activeRow.id
    );
    if (titleEl && !editingHeaderTitle) {
      titleEl.textContent = String(activeRow?.title || 'New Session');
    }
    const renameBtn = S.$('btn-chat-rename-title');
    if (renameBtn) {
      renameBtn.hidden = Boolean(isNewDraft || !activeRow?.id || activeRow.id === '__new__');
    }

    const provKey = isNewDraft
      ? newProv
      : (threadDetail?.provider || activeRow?.provider) === 'claude'
        ? 'claude'
        : 'antigravity';

    const badgeEl = S.$('chat-prov-badge');
    if (badgeEl) {
      badgeEl.innerHTML = `<span class="prov-glyph">${S.PROVIDER_ICONS[provKey]}</span>`;
    }
    const folderLabel = isNewDraft
      ? S.prefs.composerRepoPrefix
        ? `Scope: ${S.prefs.composerRepoPrefix}`
        : 'Workspace'
      : threadDetail?.folder ||
        activeRow?.folder ||
        (S.prefs.composerRepoPrefix ? `Scope: ${S.prefs.composerRepoPrefix}` : 'Workspace');
    const folderEl = S.$('chat-folder-pill');
    if (folderEl) {
      folderEl.textContent = folderLabel;
    }

    const activeTidForCompact = S.cleanTargetThreadId(activeRow?.id || S.prefs.selectedThreadId);
    const openIdeBtn = S.$('btn-chat-open-vscode');
    if (openIdeBtn) {
      openIdeBtn.hidden = !isHostVsCodeOpenForSession(activeRow, isNewDraft);
    }
    const moreCompactBtn = S.$('btn-chat-more-compact');
    if (moreCompactBtn) {
      moreCompactBtn.hidden = Boolean(isNewDraft || !activeTidForCompact);
    }
    const moreBtn = S.$('btn-chat-more');
    if (moreBtn) {
      moreBtn.classList.toggle('is-active', Boolean(S.prefs.splitWatchOpen));
    }
    const splitStateEl = S.$('chat-more-split-state');
    if (splitStateEl) {
      splitStateEl.textContent = S.prefs.splitWatchOpen ? 'On' : 'Off';
    }
    const splitWatchMenuBtn = S.$('btn-split-watch');
    if (splitWatchMenuBtn) {
      splitWatchMenuBtn.classList.toggle('active', Boolean(S.prefs.splitWatchOpen));
      splitWatchMenuBtn.setAttribute('aria-pressed', S.prefs.splitWatchOpen ? 'true' : 'false');
      splitWatchMenuBtn.setAttribute('aria-checked', S.prefs.splitWatchOpen ? 'true' : 'false');
    }
    const ctxCompactBtn = S.$('btn-ctx-compact');
    if (ctxCompactBtn) {
      const isCompacting = Boolean(activeTidForCompact && pendingCompactByThread.has(activeTidForCompact));
      ctxCompactBtn.disabled = isCompacting;
      ctxCompactBtn.innerHTML = isCompacting ? 'Compacting…' : 'Run <code>/compact</code>';
    }

    const rawCtx = threadDetail?.contextWindow || {};
    const effectiveRowForModel =
      !isNewDraft &&
      activeRow &&
      (!activeRow.model || /^gemini$/i.test(String(activeRow.model).trim())) &&
      (rawCtx.modelLabel || threadDetail?.model)
        ? { ...activeRow, model: rawCtx.modelLabel || threadDetail.model }
        : activeRow;
    const modelCfg = S.getEffectiveSessionModelConfig(effectiveRowForModel, provKey, isNewDraft);
    const resolvedModelLabel = modelCfg.displayLabel;
    const compModelEl = S.$('composer-model-label');
    if (compModelEl) {
      compModelEl.textContent = resolvedModelLabel;
    }
    const chatNeonPill = S.$('chat-neon-pill');
    if (chatNeonPill) {
      const showChatNeon = Boolean(
        !isNewDraft &&
          activeRow?.id &&
          !activeRow?.archived &&
          provKey === 'antigravity' &&
          (activeRow?.neonWarning || /neon/i.test(String(resolvedModelLabel || '')))
      );
      chatNeonPill.hidden = !showChatNeon;
      chatNeonPill.dataset.switchNeonCarbon = showChatNeon ? String(activeRow.id) : '';
    }
    S.renderModelPickerPopover(provKey, modelCfg);

    // Context Window Pill & Popover (512k / 840k on Antigravity, 1M / 200k on Claude Code)
    const activeTidForOv = activeRow?.id || S.prefs.selectedThreadId || '';
    const savedHeaderOv = !isNewDraft && activeTidForOv ? S.prefs.threadModelConfig?.[activeTidForOv] : null;
    const hasThreadModelOverride = Boolean(
      savedHeaderOv && !(Number(activeRow?.modelUpdatedAt || 0) > Number(savedHeaderOv.updatedAt || 0))
    );
    const modelForLimit =
      !isNewDraft && !hasThreadModelOverride
        ? rawCtx.modelLabel || rawCtx.modelName || threadDetail?.model || activeRow?.model || resolvedModelLabel
        : resolvedModelLabel;
    const rawUsed = isNewDraft
      ? 0
      : reconcileCompactionContextTokens(activeTidForCompact, activeRow, threadDetail);
    const rawLimit = hasThreadModelOverride
      ? S.inferDefaultContextLimit(provKey, resolvedModelLabel)
      : Number(
          rawCtx.limitTokens ||
            rawCtx.maxContextTokens ||
            (!isNewDraft ? activeRow?.limitTokens || activeRow?.contextLimit : 0) ||
            0
        );
    const rawHardMax = hasThreadModelOverride ? 0 : Number(rawCtx.hardMaxTokens || activeRow?.hardMaxTokens || 0);
    const {
      usedTokens,
      limitTokens,
      hardMaxTokens,
      pct,
      remainingTokens,
      overrunTokens,
      isSoftOverrun,
      overrunArcPct
    } = S.resolveDisplayContextMetrics(provKey, modelForLimit, rawUsed, rawLimit, isNewDraft, rawHardMax);
    const breakdownArr =
      isNewDraft || usedTokens <= 0
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
              { label: 'Conversation & Responses', tokens: Math.max(0, usedTokens - Math.round(usedTokens * 0.8)), color: '#4F8FD6' }
            ];
    const ctx = {
      usedTokens,
      limitTokens,
      hardMaxTokens,
      pct,
      remainingTokens,
      overrunTokens,
      isSoftOverrun,
      overrunArcPct,
      modelLabel: resolvedModelLabel,
      breakdown: breakdownArr
    };
    const pillBtn = S.$('btn-ctx-window');
    if (pillBtn) {
      pillBtn.classList.toggle('is-soft-overrun', Boolean(ctx.isSoftOverrun));
    }
    const pillLbl = S.$('ctx-pill-label');
    if (pillLbl) {
      pillLbl.textContent = `${S.fmtCompact(ctx.usedTokens)} / ${S.fmtCompact(ctx.limitTokens)} · ${ctx.pct}%`;
    }
    const circle = S.$('ctx-ring-circle');
    if (circle) {
      const circum = 56.5;
      const offset = circum - (Math.min(100, Math.max(isNewDraft ? 0 : 2, ctx.pct)) / 100) * circum;
      circle.setAttribute('stroke-dashoffset', String(offset));
    }
    const overrunCircle = S.$('ctx-ring-overrun-circle');
    if (overrunCircle) {
      if (ctx.isSoftOverrun) {
        const circum = 56.5;
        const arcOffset = circum - (Math.min(100, Math.max(6, ctx.overrunArcPct)) / 100) * circum;
        overrunCircle.setAttribute('stroke-dashoffset', String(arcOffset));
        overrunCircle.hidden = false;
      } else {
        overrunCircle.setAttribute('stroke-dashoffset', '56.5');
        overrunCircle.hidden = true;
      }
    }
    const overrunPill = S.$('ctx-overrun-pill');
    if (overrunPill) {
      if (ctx.isSoftOverrun) {
        overrunPill.textContent = `+${S.fmtCompact(ctx.overrunTokens)}`;
        overrunPill.hidden = false;
      } else {
        overrunPill.textContent = '';
        overrunPill.hidden = true;
      }
    }

    try {
      renderContextPopover(ctx);
    } catch (err) {
      console.warn('[THEO] Context popover render error:', err?.message || err);
    }
    try {
      S.renderChatBgTasks(activeRow, threadDetail, provKey, isNewDraft);
    } catch (err) {
      console.warn('[THEO] Chat bg tasks render error:', err?.message || err);
    }
    syncComposerGitAndModeControls(activeRow, threadDetail, provKey, isNewDraft);

    const messages = isNewDraft ? [] : coalesceThreadMessages(threadDetail?.messages || []);
    const sessionApprovals = isNewDraft
      ? []
      : (S.appState?.approvals || []).filter((a) => a && a.sessionId === S.prefs.selectedThreadId);
    const matchingQuestionApproval = sessionApprovals.find(
      (a) =>
        a.kind === 'question' ||
        Boolean(a.isToolPermission) ||
        /question/i.test(String(a.toolName || '')) ||
        (Array.isArray(a.questions) && a.questions.length > 0) ||
        (Array.isArray(a.options) && a.options.length > 0)
    );

    try {
      renderChatQuestionDock(activeRow, messages, matchingQuestionApproval, provKey, isNewDraft);
    } catch (err) {
      console.warn('[THEO] Question dock render error:', err?.message || err);
    }
    S.renderSplitWatchPane();
    S.renderSplitInspector(activeRow, threadDetail, messages, provKey, isNewDraft);

    // Conversation Stream
    const streamEl = S.$('chat-stream');
    if (!streamEl) return;
    if (isNewDraft) {
      const grpObj = S.prefs.newSessionGroupId
        ? (S.appState?.groups || []).find((g) => g && g.id === S.prefs.newSessionGroupId)
        : null;
      streamEl.innerHTML = renderNewSessionLaunchpadHtml(provKey, modelCfg, grpObj);
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
    const isSyncingThread =
      S.connMode === 'cloud' &&
      S.prefs.selectedThreadId &&
      S.pendingThreadRequests.has(S.prefs.selectedThreadId);
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
                cardKey: `q-chat-${S.prefs.selectedThreadId}-${a.approvalId || 'active'}`,
                sessionId: S.prefs.selectedThreadId,
                provider: aProv,
                approvalId: a.approvalId || S.prefs.selectedThreadId,
                selector: a.selector || '',
                questions: qList
              });
            }
          }
          if (a.kind === 'waiting_session' && skipQuestionApprovals) {
            return '';
          }
          return `
            <div class="approval-card" data-approval-id="${S.esc(a.id)}" style="margin-top:8px">
              <div class="approval-top">
                <span class="approval-prov">
                  <span class="prov-glyph">${S.PROVIDER_ICONS[aProv]}</span>
                  <span>${aProv === 'claude' ? 'Claude Code' : 'Antigravity'} · Action Required</span>
                </span>
                <span class="approval-tool-badge tabular">${S.esc(a.toolName || 'Permission')}</span>
              </div>
              <div class="approval-title">${S.esc(a.title || activeRow?.title || 'Session')}</div>
              <div class="approval-detail mono">${S.esc(a.detail || '')}</div>
              ${
                a.kind === 'waiting_session'
                  ? `<div class="meta-timestamp" style="margin-top:6px">Waiting for your response — type your reply in the composer below.</div>`
                  : `<div class="approval-actions">
                      <button type="button" class="btn-approve" data-approve-act="approve" data-app-id="${S.esc(a.approvalId)}" data-sess-id="${S.esc(a.sessionId)}" data-prov="${aProv}" data-sel="${S.esc(a.selector || '')}" data-lbl="${S.esc(a.toolName || 'Accept')}">✓ Approve</button>
                      <button type="button" class="btn-reject" data-approve-act="reject" data-app-id="${S.esc(a.approvalId)}" data-sess-id="${S.esc(a.sessionId)}" data-prov="${aProv}" data-sel="${S.esc(a.selector || '')}">✕ Deny</button>
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
            <span class="turn-role">${isSyncingThread ? 'Syncing Transcript…' : 'THEO Bridge'}</span>
            <span>${isSyncingThread ? 'Cloud Relay' : 'Ready'}</span>
          </div>
          <div class="turn-text">
            ${
              isSyncingThread
                ? `Requesting live transcript for <strong>${S.esc(activeRow?.title || 'Session')}</strong> from the PC…`
                : `Select any session from the sidebar or ${S.MOD_KEY}K to view the live transcript from <strong>${S.esc(activeRow?.title || 'your PC')}</strong>.`
            }
          </div>
        </div>
        ${buildSessionApprovalHtml(false)}
      `;
      lastRenderedThreadId = S.prefs.selectedThreadId;
      lastRenderedMsgCount = 0;
    } else {
      const savedOpenMap = S.getThreadOpenDetailsMap(S.prefs.selectedThreadId, false);
      const sessionBgTasks = S.getSessionBackgroundTasks(activeRow, threadDetail);
      const isThreadActivelyWorking = isSessionActivelyRunning(S.prefs.selectedThreadId);
      let lastSubstantiveIdx = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg && msg.kind !== 'task-notification' && msg.role !== 'checkpoint') {
          lastSubstantiveIdx = i;
          break;
        }
      }
      const turnsHtml = messages
        .map((m, msgIdx) => {
          const isUser = m.role === 'user';
          const isLastTurn =
            msgIdx === messages.length - 1 ||
            (lastSubstantiveIdx >= 0 && msgIdx >= lastSubstantiveIdx);
          const turnIdKey = String(m.id || `turn-${msgIdx}`);

          if (m.role === 'checkpoint') {
            const cpKey = `${turnIdKey}:checkpoint`;
            const isCpOpen = Boolean(savedOpenMap && savedOpenMap.get(cpKey) === true);
            const cpPreview = cleanCheckpointPreview(m.text);
            return `
              <details class="vs-checkpoint-divider" data-turn-anchor="${S.esc(turnIdKey)}" data-chat-detail-key="${S.esc(cpKey)}" data-rendered-open="${isCpOpen ? '1' : '0'}"${isCpOpen ? ' open' : ''}>
                <summary class="vs-checkpoint-summary">
                  <span class="vs-checkpoint-pill">
                    <span class="vs-compact-badge"><svg class="vs-compact-scissors" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="4.5" cy="4.5" r="2"/><circle cx="4.5" cy="11.5" r="2"/><path d="M13.5 3.5L6.2 10.2M6.2 5.8l7.3 6.7"/></svg><span>compact</span></span>
                    <span class="vs-checkpoint-topic">${S.esc(cpPreview)}</span>
                    <span class="vs-thought-chev" aria-hidden="true">${S.CHEVRON_RIGHT_SVG}</span>
                  </span>
                </summary>
                <div class="vs-checkpoint-body turn-text md-rich">${formatTurnMarkdown(m.text || 'Context compacted.')}</div>
              </details>
            `;
          }

          if (isUser) {
            const { notifications, humanText } = extractTaskNotificationsFromText(
              m.text || '',
              m.taskNotifications
            );
            const hasSpecialUserMarkup = Boolean(
              /^\/compact\b/i.test(humanText) ||
                /\[LIVE WORKSTATION CONTEXT/i.test(m.text || '') ||
                /\[Attached Files saved on workstation\]/i.test(m.text || '')
            );
            const tnHtml = notifications.length
              ? `<div class="turn-task-notif-wrap" data-turn-anchor="${S.esc(turnIdKey)}">${renderTaskNotificationsHtml(
                  notifications,
                  turnIdKey,
                  m.createdAt || '',
                  savedOpenMap
                )}</div>`
              : '';
            if (m.kind === 'task-notification' || (!humanText && !hasSpecialUserMarkup)) {
              return tnHtml;
            }
            return `
              <div class="turn-bubble user" data-turn-anchor="${S.esc(turnIdKey)}">
                ${renderUserTurnContentHtml(humanText, turnIdKey, m.createdAt || '', savedOpenMap)}
              </div>
              ${tnHtml}
            `;
          }

          const toolCalls = Array.isArray(m.toolCalls) ? m.toolCalls : [];
          const stepToolCalls = toolCalls.filter((t) => t && t.kind !== 'subagent');
          const subagentsHtml = renderInlineSubagentsHtml(
            toolCalls,
            sessionBgTasks,
            S.prefs.selectedThreadId,
            provKey
          );
          const toolCount = Number(m.totalTurnTools || stepToolCalls.length);
          const editTools = stepToolCalls.filter((t) => t.kind === 'edit' || t.kind === 'write');
          const readTools = stepToolCalls.filter((t) => t.kind === 'read');
          const cmdTools = stepToolCalls.filter((t) => t.kind === 'command' || t.kind === 'cmd');
          const searchTools = stepToolCalls.filter((t) => t.kind === 'search');
          const changedFilesSet = new Set(
            editTools.map((t) => t.relPath || t.file || t.summary).filter(Boolean)
          );
          const filesChangedCount = changedFilesSet.size || editTools.length;
          const totalAdded = editTools.reduce((acc, t) => acc + Number(t.addedLines || 0), 0);
          const totalRemoved = editTools.reduce((acc, t) => acc + Number(t.removedLines || 0), 0);

          const summaryHtmlParts = [];
          const lastTool = stepToolCalls[stepToolCalls.length - 1];
          if (filesChangedCount > 0) {
            const diffHtml =
              totalAdded > 0 || totalRemoved > 0
                ? ` <span class="tabular"><span class="diff-add">+${totalAdded}</span> <span class="diff-del">-${totalRemoved}</span></span>`
                : '';
            summaryHtmlParts.push(
              `<span>${filesChangedCount} ${filesChangedCount === 1 ? 'file' : 'files'} changed${diffHtml}</span>`
            );
          } else if (readTools.length > 0) {
            summaryHtmlParts.push(
              `<span>Analyzed ${readTools.length} ${readTools.length === 1 ? 'file' : 'files'}</span>`
            );
          }
          if (cmdTools.length > 0 && filesChangedCount === 0) {
            summaryHtmlParts.push(
              `<span>${cmdTools.length} ${cmdTools.length === 1 ? 'command' : 'commands'}</span>`
            );
          }
          summaryHtmlParts.push(
            `<span>${toolCount} ${toolCount === 1 ? 'step' : 'steps'}</span>`
          );
          const summaryLabelHtml = `<span class="tools-summary-left">${summaryHtmlParts.join(' <span style="opacity:0.45">·</span> ')}</span><span class="tools-summary-chevron" aria-hidden="true">${S.CHEVRON_DOWN_SVG}</span>`;

          const activeKindFilter = stepKindFilterByTurnKey.get(turnIdKey) || 'all';
          const filterPills = [];
          if (stepToolCalls.length >= 2) {
            filterPills.push({ key: 'all', label: `All (${stepToolCalls.length})` });
            if (editTools.length > 0) filterPills.push({ key: 'edit', label: `Edits (${editTools.length})` });
            if (readTools.length > 0) filterPills.push({ key: 'read', label: `Reads (${readTools.length})` });
            if (cmdTools.length > 0) filterPills.push({ key: 'cmd', label: `Cmds (${cmdTools.length})` });
            if (searchTools.length > 0) filterPills.push({ key: 'search', label: `Search (${searchTools.length})` });
          }
          const filterBarHtml =
            filterPills.length > 2
              ? `<div class="code-steps-filters">${filterPills
                  .map(
                    (fp) =>
                      `<button type="button" class="ide-step-filter-pill${activeKindFilter === fp.key ? ' is-active' : ''}" data-step-kind-filter="${S.esc(fp.key)}" data-step-turn-key="${S.esc(turnIdKey)}">${S.esc(fp.label)}</button>`
                  )
                  .join('')}</div>`
              : '<span></span>';

          const allStepsSavedOpen =
            stepToolCalls.length >= 2 &&
            Boolean(savedOpenMap) &&
            stepToolCalls.every((_, sIdx) => savedOpenMap.get(`${turnIdKey}:step:${sIdx}`) === true);
          const stepsToolbarHtml =
            stepToolCalls.length >= 2
              ? `<div class="code-steps-toolbar">${filterBarHtml}<button type="button" class="ide-steps-toggle-all" data-toggle-all-steps="1">${allStepsSavedOpen ? 'Collapse all' : 'Expand all'}</button></div>`
              : '';
          const toolCardsHtml = stepToolCalls.length
            ? `<div class="code-steps-stack" data-steps-stack-turn="${S.esc(turnIdKey)}">${stepsToolbarHtml}${stepToolCalls.map((tc, sIdx) => renderToolCallCardHtml(tc, `${turnIdKey}:step:${sIdx}`, savedOpenMap, activeKindFilter)).join('')}</div>`
            : '';

          const artifacts = Array.isArray(m.artifacts) ? m.artifacts : [];
          const artifactsHtml = artifacts
            .map((art, aIdx) => {
              const artKey = `${turnIdKey}:art:${aIdx}`;
              const isArtOpen = Boolean(savedOpenMap && savedOpenMap.get(artKey) === true);
              return `
                <details class="vs-artifact-card" data-chat-detail-key="${S.esc(artKey)}" data-rendered-open="${isArtOpen ? '1' : '0'}"${isArtOpen ? ' open' : ''}>
                  <summary class="vs-artifact-summary">
                    <div class="vs-artifact-head">
                      <svg class="vs-artifact-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2H7a1.5 1.5 0 0 1 1.5 1.5v10A1.5 1.5 0 0 0 7 12H3.5A1.5 1.5 0 0 1 2 10.5v-7z"/>
                        <path d="M14 3.5A1.5 1.5 0 0 0 12.5 2H9a1.5 1.5 0 0 0-1.5 1.5v10A1.5 1.5 0 0 1 9 12h3.5a1.5 1.5 0 0 0 1.5-1.5v-7z"/>
                      </svg>
                      <span>${S.esc(art.title || 'Walkthrough')}</span>
                    </div>
                    ${art.summary ? `<div class="vs-artifact-desc">${formatTurnMarkdown(art.summary)}</div>` : ''}
                  </summary>
                  ${art.content ? `<div class="vs-artifact-body turn-text md-rich">${formatTurnMarkdown(art.content)}</div>` : ''}
                </details>
              `;
            })
            .join('');

          const timeLabel = m.createdAt ? S.timeAgo(Date.parse(m.createdAt)) : '';

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
                sessionId: S.prefs.selectedThreadId,
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
          const defaultToolsOpen = false;
          const isToolsOpen =
            savedOpenMap && savedOpenMap.has(toolsKey)
              ? savedOpenMap.get(toolsKey)
              : defaultToolsOpen;
          const toolsPanelCls =
            cleanedText || hasTurnQuestions ? 'tools-details' : 'tools-details active-tools-panel';

          const changedMap = new Map();
          for (const et of editTools) {
            const fp = String(et.relPath || et.file || '').split('#')[0].trim();
            if (!fp) continue;
            const k = fp.replace(/\\/g, '/').toLowerCase();
            const prev = changedMap.get(k);
            changedMap.set(k, {
              target: fp,
              base: fp.split(/[\\/]/).pop() || fp,
              added: Number(prev?.added || 0) + Number(et.addedLines ?? et.added ?? 0),
              removed: Number(prev?.removed || 0) + Number(et.removedLines ?? et.removed ?? 0)
            });
          }
          const changedChips = Array.from(changedMap.values()).slice(0, 6);
          const isTurnActivelyWorking = Boolean(isLastTurn && isThreadActivelyWorking && lastTool);
          const changeSetStripHtml =
            changedChips.length > 0
              ? `<div class="turn-changeset-strip">
                  <div class="turn-cs-files"><span class="turn-cs-kicker">Changed</span>${changedChips
                    .map(
                      (cf) =>
                        `<button type="button" class="turn-cs-chip" data-preview-file="${S.esc(cf.target)}" data-preview-mode="diff"><span>${S.esc(cf.base)}</span>${cf.added > 0 ? `<span class="turn-cs-add tabular">+${cf.added}</span>` : ''}${cf.removed > 0 ? `<span class="turn-cs-del tabular">-${cf.removed}</span>` : ''}</button>`
                    )
                    .join('')}</div>
                  ${
                    isTurnActivelyWorking
                      ? `<span class="turn-cs-live"><span class="turn-cs-pulse"></span><span>${S.esc(lastTool.label || 'Running')} ${S.esc(lastTool.file || lastTool.summary || lastTool.command || '')}</span></span>`
                      : ''
                  }
                </div>`
              : '';

          const toolsHtml = stepToolCalls.length
            ? `${changeSetStripHtml}<details class="${toolsPanelCls}" data-chat-detail-key="${S.esc(toolsKey)}" data-rendered-open="${isToolsOpen ? '1' : '0'}"${isToolsOpen ? ' open' : ''}><summary>${summaryLabelHtml}</summary>${toolCardsHtml}</details>`
            : '';

          const isLiveStreamingTurn = Boolean(isLastTurn && m.isStreaming);
          const liveAct =
            isLastTurn && isThreadActivelyWorking
              ? deriveClientLiveActivity(m, stepToolCalls, threadDetail, isThreadActivelyWorking)
              : null;
          const isLiveTraceExpanded = Boolean(
            savedOpenMap?.get(`${turnIdKey}:think`) === true || savedOpenMap?.get(`${turnIdKey}:tools`) === true
          );
          const liveActivityHtml = liveAct ? renderLiveActivityBarHtml(liveAct, turnIdKey, isLiveTraceExpanded) : '';

          const streamThinkHtml = renderCompactedThoughtHtml({
            m,
            turnIdKey,
            isLastTurn,
            isActivelyWorking: isThreadActivelyWorking,
            cleanedText,
            hasTurnQuestions,
            savedOpenMap,
            isStreamingTurn: isLiveStreamingTurn
          });

          const questionCardHtml = hasTurnQuestions
            ? renderInteractiveQuestionCardHtml({
                cardKey:
                  isLastTurn && effectiveTurnApproval
                    ? `q-chat-${S.prefs.selectedThreadId}-${effectiveTurnApproval.approvalId || 'active'}`
                    : `q-turn-${S.prefs.selectedThreadId}-${turnIdKey}`,
                sessionId: S.prefs.selectedThreadId,
                provider: provKey,
                approvalId:
                  (isLastTurn && effectiveTurnApproval?.approvalId) || S.prefs.selectedThreadId,
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

          const liveHeadHtml = isLiveStreamingTurn
            ? `<div class="stream-live-head"><span data-stream-status-lbl="1">Live Stream${m.deviceName ? ` · ${S.esc(m.deviceName)}` : ''}</span></div>`
            : '';
          const liveToolHtml = isLiveStreamingTurn
            ? `<div class="live-tool-chip mono" data-stream-tool-slot="1" ${m.activeTool ? '' : 'hidden'}>${m.activeTool ? `${S.esc(m.activeTool)}` : ''}</div>`
            : '';
          const streamTextHtml = isLiveStreamingTurn
            ? `<div class="turn-text md-rich" data-stream-text-body="1">${cleanedText ? formatTurnMarkdown(cleanedText) : ''}<span class="stream-cursor"></span></div>`
            : cleanedText
              ? `<div class="turn-text md-rich">${formatTurnMarkdown(cleanedText)}</div>`
              : '';
          const showTurnFoot = Boolean(timeLabel && !(liveAct && !cleanedText));

          return `
            <div class="turn-bubble assistant ${isLiveStreamingTurn ? 'is-streaming' : ''}${liveAct ? ' is-live-working' : ''}" data-turn-anchor="${S.esc(turnIdKey)}" ${isLiveStreamingTurn ? 'data-streaming-turn="1"' : ''}>
              ${liveHeadHtml}
              ${liveActivityHtml}
              ${streamThinkHtml}
              ${liveToolHtml}
              ${subagentsHtml}
              ${toolsHtml}
              ${streamTextHtml}
              ${artifactsHtml}
              ${questionCardHtml}
              ${showTurnFoot ? `<div class="turn-foot tabular">${S.esc(timeLabel)}</div>` : ''}
            </div>
          `;
        })
        .join('');

      streamEl.innerHTML = turnsHtml + buildSessionApprovalHtml(questionRenderedInTurn);

      if (
        forceScroll ||
        S.prefs.selectedThreadId !== lastRenderedThreadId ||
        messages.length > lastRenderedMsgCount ||
        wasNearBottom
      ) {
        streamEl.scrollTop = streamEl.scrollHeight;
      }
      lastRenderedThreadId = S.prefs.selectedThreadId;
      lastRenderedMsgCount = messages.length;
    }
    updateComposerActionButton();
    });
  }

  function renderFileChipHtml(rawLabel, rawTargetHref = '') {
    const clean = String(rawLabel || '')
      .trim()
      .replace(/^`+|`+$/g, '');
    const href = String(rawTargetHref || '').trim();
    if (/^conversation:\/\//i.test(href)) {
      const convId = href
        .replace(/^conversation:\/\/+/i, '')
        .replace(/[)\s]+$/g, '')
        .trim();
      return `<span class="md-file-chip is-clickable" role="button" tabindex="0" data-open-conv="${S.esc(convId)}"><span class="md-chip-ico">⇄</span><span>${S.esc(clean)}</span></span>`;
    }

    let ico = 'File';
    let icoCls = '';
    const extProbe = `${clean} ${href.split('?')[0]}`;
    if (/\.md(#|$|\s)/i.test(extProbe)) {
      ico = 'M↓';
      icoCls = ' md';
    } else if (/\.py(#|$|\s)/i.test(extProbe)) {
      ico = 'py';
      icoCls = ' py';
    } else if (/\.(ts|tsx)(#|$|\s)/i.test(extProbe)) {
      ico = 'TS';
      icoCls = ' ts';
    } else if (/\.(js|jsx|cjs|mjs)(#|$|\s)/i.test(extProbe)) {
      ico = 'JS';
      icoCls = ' js';
    } else if (/\.cs(#|$|\s)/i.test(extProbe)) {
      ico = 'C#';
      icoCls = ' cs';
    } else if (/\.(sh|ps1|bat|cmd)(#|$|\s)/i.test(extProbe)) {
      ico = '>_';
      icoCls = ' sh';
    } else if (/\.json(#|$|\s)/i.test(extProbe)) {
      ico = '{}';
      icoCls = ' json';
    } else if (/\.pdf(#|$|\s)/i.test(extProbe)) {
      ico = 'PDF';
      icoCls = ' pdf';
    } else if (/\.(pptx|ppsx|pptm)(#|$|\s)/i.test(extProbe)) {
      ico = 'PPT';
      icoCls = ' ppt';
    } else if (/\.(xlsx|xlsm|xls|xlsb|csv|tsv)(#|$|\s)/i.test(extProbe)) {
      ico = 'XLS';
      icoCls = ' xls';
    } else if (/\.(docx?)(#|$|\s)/i.test(extProbe)) {
      ico = 'DOC';
      icoCls = ' doc';
    } else if (/\.(html?|xhtml)(#|$|\s)/i.test(extProbe)) {
      ico = 'HTML';
      icoCls = ' html';
    } else if (/\.(css|svg)(#|$|\s)/i.test(extProbe)) {
      ico = '<>';
      icoCls = ' css';
    }

    let previewTarget = '';
    if (/^file:\/\//i.test(href)) {
      const stripped = href.replace(/^file:\/\/\/?/i, '').replace(/[)\s]+$/g, '');
      try {
        previewTarget = decodeURIComponent(stripped);
      } catch {
        previewTarget = stripped;
      }
    } else if (href) {
      previewTarget = href;
    } else if (
      /\.(md|py|js|jsx|ts|tsx|cjs|mjs|json|css|html?|xhtml|svg|ps1|sh|bat|cmd|cs|sql|yml|yaml|toml|xml|pdf|pptx|ppsx|pptm|xlsx|xlsm|xls|xlsb|csv|tsv|docx?|png|jpe?g|webp)(#L?\d+(?:-L?\d+)?|:\d+(?:-\d+)?|$)/i.test(
        clean
      )
    ) {
      previewTarget = clean;
    }

    if (previewTarget) {
      return `<span class="md-file-chip is-clickable" role="button" tabindex="0" data-preview-file="${S.esc(previewTarget)}"><span class="md-chip-ico${icoCls}">${ico}</span><span>${S.esc(clean)}</span></span>`;
    }
    return `<span class="md-file-chip"><span class="md-chip-ico${icoCls}">${ico}</span><span>${S.esc(clean)}</span></span>`;
  }

  function formatTurnMarkdown(rawText) {
    if (!rawText) return '';
    let src = String(rawText)
      .replace(/\r\n/g, '\n')
      .replace(/<truncated\s+\d+\s+bytes>/gi, '…');

    const codeBlocks = [];
    src = src.replace(/```(\w*)\n([\s\S]*?)```/g, (_, _lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push(`<pre><code>${S.esc(code.replace(/\n$/, ''))}</code></pre>`);
      return `\n\x00CODEBLOCK_${idx}\x00\n`;
    });

    const chips = [];
    const pushChip = (label, targetHref = '') => {
      const idx = chips.length;
      chips.push(renderFileChipHtml(label, targetHref));
      return `\x00CHIP_${idx}\x00`;
    };

    // Convert [label](file:///...) or [`label`](file:///...) or [label](conversation://...) (even if truncated mid-URL) into VS Code file chips
    src = src.replace(
      /\[`?([^`\]\n]+)`?\]\(((?:file|conversation):\/\/[^)\s]*)\)?/gi,
      (_, label, targetUrl) => pushChip(label, targetUrl)
    );
    // Convert any bare file:/// URLs into compact basename chips
    src = src.replace(/(^|[\s(])file:\/\/\/([^\s)]+)/gi, (_, prefix, rawPath) => {
      let base = rawPath;
      try {
        base = decodeURIComponent(rawPath).split(/[\\/]/).pop() || rawPath;
      } catch {
        base = rawPath.split(/[\\/]/).pop() || rawPath;
      }
      return `${prefix}${pushChip(base, `file:///${rawPath}`)}`;
    });

    const inlineCodes = [];
    src = src.replace(/`([^`\n]+)`/g, (_, code) => {
      const trimmedCode = String(code || '').trim();
      if (
        !/[\s"'`<>|;&$]/.test(trimmedCode) &&
        /\.(html?|xhtml|pdf|pptx|ppsx|pptm|xlsx|xlsm|xls|xlsb|csv|tsv|docx?)(#L?\d+(?:-L?\d+)?|:\d+(?:-\d+)?)?$/i.test(
          trimmedCode
        )
      ) {
        return pushChip(trimmedCode, trimmedCode);
      }
      const idx = inlineCodes.length;
      inlineCodes.push(`<code class="md-inline-code">${S.esc(code)}</code>`);
      return `\x00INLINECODE_${idx}\x00`;
    });

    // Convert bare deliverable filenames (e.g. "open aeg_clerk_assistant_prototype.html.") into clickable chips
    src = src.replace(
      /(^|[\s(])(?!https?:\/\/|file:\/\/\/)([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\.(?:html?|xhtml|pdf|pptx|ppsx|pptm|xlsx|xlsm|xls|xlsb))(?=$|[\s.,;:!?)\n])/gi,
      (_, prefix, fileName) => `${prefix}${pushChip(fileName, fileName)}`
    );

    const formatInline = (lineStr) => {
      let s = S.esc(lineStr);
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
        return `<a href="${S.esc(cleanHref)}" target="_blank" rel="noopener noreferrer">${labelHtml}</a>`;
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
        const cls = lvl <= 2 ? 'md-h2' : lvl === 3 ? 'md-h3' : 'md-h4';
        const tag = lvl <= 2 ? 'h2' : lvl === 3 ? 'h3' : 'h4';
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
          `<div class="md-list-item${isNested ? ' nested' : ''}"><span class="md-bullet tabular">${S.esc(olMatch[2])}</span><div class="md-list-body">${formatInline(olMatch[3])}</div></div>`
        );
        continue;
      }

      paraBuf.push(formatInline(trimmed));
    }
    flushPara();

    return out.join('');
  }

  function renderContextPopover(ctx) {
    const sumEl = S.$('ctx-meter-summary');
    const barEl = S.$('ctx-stacked-bar');
    const listEl = S.$('ctx-breakdown-list');
    if (!sumEl || !barEl || !listEl) return;

    const overrun = Math.max(0, Number(ctx.usedTokens || 0) - Number(ctx.limitTokens || 0));
    const rem = Math.max(
      0,
      Number.isFinite(Number(ctx.remainingTokens))
        ? Number(ctx.remainingTokens)
        : Number(ctx.limitTokens || 0) - Number(ctx.usedTokens || 0)
    );
    sumEl.innerHTML =
      overrun > 0
        ? `<strong>${S.fmtInt(ctx.usedTokens)}</strong> tokens used of <strong>${S.fmtInt(ctx.limitTokens)}</strong> (${ctx.pct}%) · <span>+${S.fmtInt(overrun)} over soft target (auto-compacts next turn)</span>`
        : `<strong>${S.fmtInt(ctx.usedTokens)}</strong> tokens used of <strong>${S.fmtInt(ctx.limitTokens)}</strong> (${ctx.pct}%) · <span>${S.fmtInt(rem)} remaining</span>`;
    const bannerEl = S.$('ctx-overrun-banner');
    if (bannerEl) {
      if (ctx.isSoftOverrun && Number(ctx.hardMaxTokens || 0) > Number(ctx.limitTokens || 0)) {
        bannerEl.textContent = `Soft compaction target ${S.fmtCompact(ctx.limitTokens)} · Hard context ceiling ${S.fmtCompact(ctx.hardMaxTokens)} (+${S.fmtInt(overrun)} headroom before wall)`;
        bannerEl.hidden = false;
      } else {
        bannerEl.textContent = '';
        bannerEl.hidden = true;
      }
    }
    const bd = Array.isArray(ctx.breakdown) ? ctx.breakdown : [];
    const totalBd = Math.max(1, bd.reduce((acc, item) => acc + Number(item.tokens || 0), 0));
    const safeCssColor = (c) => (/^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/.test(String(c || '').trim()) ? String(c).trim() : '#D9A54A');
    barEl.innerHTML = bd
      .map((item) => {
        const w = Math.max(4, Math.round((Number(item.tokens || 0) / totalBd) * 100));
        return `<div style="width:${w}%;background:${safeCssColor(item.color)}" aria-label="${S.esc(item.label)}"></div>`;
      })
      .join('');
    listEl.innerHTML = bd
      .map(
        (item) => `
        <div class="ctx-bd-item">
          <span style="display:flex;align-items:center;gap:6px">
            <span style="width:8px;height:8px;border-radius:50%;background:${safeCssColor(item.color)}"></span>
            <span>${S.esc(item.label)}</span>
          </span>
          <strong>${S.fmtCompact(item.tokens)}</strong>
        </div>
      `
      )
      .join('');
  }

  // Unsaved work per PC, at the top of Workspaces (the evening digest's unsaved-work notification opens here).
  // Each PC: every unsaved git working folder (repo, branch, owner, idle time), folders idle past the report's
  // threshold (24 h) marked amber; a PC with none shows one quiet "all saved" line; a report older than 2 h
  // says when it was last checked.
  const uwExpandedPcs = new Set();
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
    { id: '/mode-bypass', label: '/mode-bypass', desc: 'Fleet Claude Mode: Bypass (full control across every PC)', kind: 'action', act: 'claude-mode-bypass', baseWeight: 73 },
    { id: '/mode-auto', label: '/mode-auto', desc: 'Fleet Claude Mode: Auto (classifier safety check across every PC)', kind: 'action', act: 'claude-mode-auto', baseWeight: 71 },
    { id: '/mode-plan', label: '/mode-plan', desc: 'Fleet Claude Mode: Plan (read-only planning across every PC)', kind: 'action', act: 'claude-mode-plan', baseWeight: 70 },
    { id: '/inspector', label: '/inspector', desc: 'Toggle Split Inspector (Files & Preview, Git, Tasks & Outline)', kind: 'action', act: 'inspector', baseWeight: 72 },
    { id: '/bgtasks', label: '/bgtasks', desc: 'Inspect live background tasks & subagents', kind: 'action', act: 'bgtasks', baseWeight: 68 },
    { id: '/stop', label: '/stop', desc: 'Interrupt the currently running session', kind: 'action', act: 'stop', baseWeight: 64 },
    { id: '/sync', label: '/sync', desc: 'Force immediate Bridge & Cloud Relay sync', kind: 'action', act: 'sync', baseWeight: 60 },
    { id: '/palette', label: '/palette', desc: 'Switch Color Palette (Graphite, Velvet, Espresso, Daylight)', kind: 'action', act: 'palette', baseWeight: 56 },
    { id: '/theme', label: '/theme', desc: 'Toggle between Dark and Daylight themes', kind: 'action', act: 'theme', baseWeight: 52 }
  ];

  function closeSlashPopover() {
    const pop = S.$('composer-slash-popover');
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
    const inp = S.$('composer-input');
    const pop = S.$('composer-slash-popover');
    if (!inp || !pop || S.isPinLocked()) {
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
        .concat(S.rankByFreq(rest, 'commands', (c) => c.id, (c) => c.baseWeight))
        .slice(0, 8);
    } else if (trig.mode === 'mention') {
      const q = trig.query;
      const candidates = [];
      const seenKeys = new Set();
      for (const w of S.appState?.workspaces || []) {
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
        const det = S.workspacesDetailCache[w.id];
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
      const activeTd = S.threadsCache[S.prefs.selectedThreadId];
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
        .concat(S.rankByFreq(rest, 'repos', (m) => m.freqKey, (m) => m.baseWeight))
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
            <span class="slash-pop-lbl mono">${S.esc(it.label)}</span>
            <span class="slash-pop-desc">${S.esc(it.desc)}</span>
          </button>
        `
      )
      .join('');
  }

  async function applySlashPopoverSelection(idx) {
    const item = slashPopoverItems[idx];
    const trig = slashPopoverTrigger;
    const inp = S.$('composer-input');
    closeSlashPopover();
    if (!item || !inp) return;

    const val = String(inp.value || '');
    const before = trig ? val.slice(0, trig.startIdx) : '';
    const after = trig ? val.slice(trig.endIdx) : '';

    if (item.kind === 'prompt') {
      S.recordFreqUsage('commands', item.id);
      const nextVal = `${item.insert}${after.replace(/^\s+/, '')}`;
      inp.value = nextVal;
      inp.focus();
      inp.setSelectionRange(item.insert.length, item.insert.length);
      updateComposerActionButton();
      return;
    }

    if (item.kind === 'action') {
      S.recordFreqUsage('commands', item.id);
      inp.value = after.trim();
      inp.style.height = 'auto';
      updateComposerActionButton();
      if (item.act === 'compact') {
        await triggerActiveSessionCompact();
      } else if (item.act === 'new-agy') {
        S.enterNewSessionMode('antigravity');
      } else if (item.act === 'new-claude') {
        S.enterNewSessionMode('claude');
      } else if (item.act === 'claude-mode-bypass') {
        await S.setFleetClaudeModeRemote('bypassPermissions');
      } else if (item.act === 'claude-mode-auto') {
        await S.setFleetClaudeModeRemote('auto');
      } else if (item.act === 'claude-mode-plan') {
        await S.setFleetClaudeModeRemote('plan');
      } else if (item.act === 'bgtasks') {
        const ctxPop = S.$('ctx-popover');
        if (ctxPop) ctxPop.hidden = true;
        const bgPop = S.$('bg-tasks-popover');
        if (bgPop) bgPop.hidden = false;
        renderChatView();
      } else if (item.act === 'inspector') {
        if (S.prefs.activeTab !== 'chat') S.switchTab('chat');
        S.setInspectorOpen(!S.prefs.inspectorOpen);
      } else if (item.act === 'toggle-3p-quota') {
        await S.setHideThirdPartyQuota(!S.isThirdPartyQuotaHidden());
      } else if (item.act === 'palette') {
        const pPop = S.$('theme-palette-popover');
        if (pPop) {
          S.syncPalettePickerUi();
          pPop.hidden = false;
          S.positionPalettePopover(S.$('btn-palette-picker'));
        }
      } else if (item.act === 'stop') {
        await stopActiveSession(S.prefs.selectedThreadId);
      } else if (item.act === 'sync') {
        await S.syncData({ toast: true });
      } else if (item.act === 'theme') {
        S.applyTheme(S.prefs.theme === 'dark' ? 'light' : 'dark', true);
      }
      return;
    }

    if (item.kind === 'mention-repo' || item.kind === 'mention-file') {
      S.recordFreqUsage('repos', item.freqKey);
      attachMentionItemToComposer({
        name: item.attachName,
        repoPath: item.repoPath,
        kind: 'repo',
        sizeLabel: item.kind === 'mention-repo' ? 'workspace' : 'file ref'
      });
      if (item.kind === 'mention-repo' && item.repoPrefix && S.isNewSessionMode()) {
        S.prefs.composerRepoPrefix = item.repoPrefix;
        S.saveJson(S.STORAGE_KEYS.PREFS, S.prefs);
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
    const tray = S.$('composer-attachments');
    if (!tray) return;
    if (!composerAttachments.length) {
      tray.hidden = true;
      tray.innerHTML = '';
      updateComposerActionButton();
      return;
    }
    const activeRow = (S.appState?.rows || []).find((r) => r.id === S.prefs.selectedThreadId) || null;
    const targetDev =
      activeRow?.deviceId ||
      (S.prefs.composerTargetDevice && S.prefs.composerTargetDevice !== 'auto' ? S.prefs.composerTargetDevice : '');
    const liveWs = S.hasLiveAttachmentTransport(targetDev);
    const fileAtts = composerAttachments.filter((a) => a && a.kind !== 'repo');
    const cloudChars = S.calcAttachmentsPayloadChars(S.compactAttachmentsForCloudFallback(fileAtts));
    const cloudExceeded = !liveWs && fileAtts.length > 0 && cloudChars > S.MAX_CLOUD_FALLBACK_CHARS;

    tray.hidden = false;
    tray.innerHTML =
      composerAttachments
        .map((a) => {
          const iconHtml =
            a.kind === 'image' && a.dataUrl
              ? `<img src="${S.esc(a.dataUrl)}" class="composer-attach-thumb" alt="">`
              : a.kind === 'repo'
                ? `<span class="composer-attach-kind">Repo</span>`
                : `<span class="composer-attach-kind">File</span>`;
          const isLargeChunk = liveWs && String(a.dataUrl || '').length > 520000;
          const isOverCloud = !liveWs && a.kind !== 'repo' && !a.textContent && String(a.dataUrl || '').length > S.MAX_CLOUD_FALLBACK_CHARS;
          const metaTxt = [a.sizeLabel, isLargeChunk ? 'chunked WS' : ''].filter(Boolean).join(' · ');
          return `
          <span class="composer-attach-pill${isOverCloud ? ' is-over-cloud-cap' : ''}">
            ${iconHtml}
            <span class="composer-attach-name">${S.esc(a.name)}</span>
            ${metaTxt ? `<span class="composer-attach-meta tabular">${S.esc(metaTxt)}</span>` : ''}
            <button type="button" class="composer-attach-remove" data-remove-attach="${S.esc(a.id)}" aria-label="Remove attachment">✕</button>
          </span>
        `;
        })
        .join('') +
      (cloudExceeded
        ? `<div class="composer-attach-warn">Cloud Store fallback limits attachments to ~250 KB total. Connect live Edge WS for chunked uploads up to 8 MB, or remove large files.</div>`
        : '');
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

  async function compressImageFile(file, opts = {}) {
    const rawDataUrl = await readFileAsDataUrl(file);
    const maxDim = Number(opts.maxDim || 1440);
    const quality = Number(opts.quality || 0.82);
    if (file.size <= 220 * 1024 && !opts.force) return rawDataUrl;
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
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
          resolve(canvas.toDataURL('image/jpeg', quality));
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
    let addedCount = 0;
    const isNewFileCtx = Boolean(S.isNewSessionMode() || !S.prefs.selectedThreadId || S.prefs.selectedThreadId === '__new__');
    const activeFileRow = !isNewFileCtx ? (S.appState?.rows || []).find((r) => r && r.id === S.prefs.selectedThreadId) || null : null;
    const targetFileDev = isNewFileCtx
      ? (S.prefs.composerTargetDevice && S.prefs.composerTargetDevice !== 'auto' ? S.prefs.composerTargetDevice : '')
      : activeFileRow?.deviceId || '';
    const liveWs = S.hasLiveAttachmentTransport(targetFileDev);
    for (const file of files) {
      if (composerAttachments.length >= 8) {
        S.showToast('Maximum 8 attachments per message');
        break;
      }
      if (Number(file.size || 0) > S.MAX_LIVE_WS_ATTACHMENT_BYTES) {
        S.showToast(`${file.name || 'File'} (${fmtFileBytes(file.size)}) exceeds the 8 MB limit`);
        continue;
      }
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
          if (!liveWs && dataUrl.length > S.MAX_CLOUD_FALLBACK_CHARS) {
            const smaller = await compressImageFile(file, { maxDim: 1024, quality: 0.72, force: true });
            if (smaller && smaller.length < dataUrl.length) dataUrl = smaller;
          }
        } else {
          if (isText && file.size <= 512 * 1024 && typeof file.text === 'function') {
            textContent = (await file.text()).slice(0, 64000);
          }
          dataUrl = await readFileAsDataUrl(file);
        }
        if (!dataUrl && !textContent) {
          S.showToast(`Unable to read ${file.name || 'file'}`);
          continue;
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
        addedCount += 1;
      } catch {}
    }
    renderComposerAttachments();
    if (addedCount > 0) {
      S.showToast(`Attached ${addedCount} file${addedCount === 1 ? '' : 's'}`);
    }
    S.$('composer-input')?.focus();
  }

  function openRepoFilePicker() {
    if (S.isPinLocked()) return;
    S.cmdPaletteMode = 'repo-file';
    const modal = S.$('cmd-modal');
    const input = S.$('cmd-input');
    if (!modal || !input) return;
    const wasHidden = modal.hidden;
    modal.hidden = false;
    if (wasHidden) S.pushUiHistoryState('cmd-modal');
    input.placeholder = 'Filter BHFIRMS workspace or modified git file to attach…';
    input.value = '';
    S.renderCommandPaletteResults('');
    setTimeout(() => input.focus(), 30);
  }

  async function submitInteractiveQuestionCard(cardKey, skipped = false) {
    const meta = renderedQuestionsByCardKey.get(cardKey);
    if (!meta) return;
    const draft = getQuestionDraft(cardKey);
    const questions = Array.isArray(meta.questions) ? meta.questions : [];
    const sessId = String(meta.sessionId || S.prefs.selectedThreadId || '').trim();
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
        S.showToast('Tap one or more options above (or type a custom answer) first');
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

    const row = (S.appState?.rows || []).find((r) => r.id === sessId);
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

    S.haptic(20);
    S.playChime('approve');

    if (Array.isArray(S.appState?.approvals)) {
      S.appState.approvals = S.appState.approvals.filter(
        (a) => a.approvalId !== meta.approvalId && a.sessionId !== sessId
      );
    }
    if (sessId) {
      S.markNotificationsCheckedForSession(sessId);
    }

    if (row) {
      row.pendingQuestion = null;
      row.status = 'working';
      row.statusLabel = 'Running';
      row.dot = 'running';
      row.at = Date.now();
      S.noteRowOverride(row.id, { lastWorkedAt: row.at });
      if (Array.isArray(S.appState?.rows)) {
        S.appState.rows.sort(S.compareRowsPinnedFirst);
      }
    }

    if (sessId && questions.length > 0 && Array.isArray(S.threadsCache[sessId]?.messages)) {
      const lastAsstMsg = [...S.threadsCache[sessId].messages]
        .reverse()
        .find((m) => m && m.role === 'assistant');
      if (lastAsstMsg) {
        const stampedQs = questions.map((q) => ({
          ...q,
          answered: true,
          skipped: Boolean(skipped),
          answerSummary: humanSummary
        }));
        lastAsstMsg.questions = stampedQs;
      }
    }

    if (sessId && !skipped) {
      if (!S.threadsCache[sessId]) {
        S.threadsCache[sessId] = {
          id: sessId,
          provider,
          title: row?.title || 'Session',
          messages: []
        };
      }
      if (!Array.isArray(S.threadsCache[sessId].messages)) {
        S.threadsCache[sessId].messages = [];
      }
      const baseCountBeforePush = S.threadsCache[sessId].messages.filter((m) => !m?.optimistic).length;
      S.threadsCache[sessId].messages.push({
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

    S.persistCache();
    S.renderAll();

    await S.dispatchRemoteCommand({
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

    S.showToast(
      skipped
        ? 'Skipped remote question'
        : `✓ Answered: ${humanSummary.slice(0, 85)}${humanSummary.length > 85 ? '…' : ''}`
    );
  }

  function isSessionActivelyRunning(tid) {
    const cleanId = String(tid || S.prefs.selectedThreadId || '').trim();
    if (!cleanId) return false;
    const row = (S.appState?.rows || []).find((r) => r.id === cleanId);
    const detail = S.threadsCache[cleanId] || null;
    const msgs = coalesceThreadMessages(detail?.messages || []);
    const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
    const nonOptMsgs = msgs.filter((m) => !m.optimistic);
    const lastNonOptMsg = nonOptMsgs.length > 0 ? nonOptMsgs[nonOptMsgs.length - 1] : null;

    const stopRec = S.stoppedSessionsById.get(cleanId);
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
        S.stoppedSessionsById.delete(cleanId);
      } else if (Date.now() - stopRec.at < 300000) {
        return false;
      } else {
        S.stoppedSessionsById.delete(cleanId);
      }
    }

    const liveStream = S.liveStreamsByThreadId.get(cleanId);
    if (liveStream && liveStream.status === 'working' && Date.now() - Number(liveStream.receivedAt || 0) < 45000) {
      return true;
    }
    if (S.isRowHostOffline?.(row)) {
      return false;
    }
    if (row?.status === 'waiting' || row?.pendingQuestion) {
      return false;
    }
    if (
      row?.status === 'working' ||
      row?.dot === 'running' ||
      row?.bgTask?.state === 'running' ||
      Number(row?.bgRunningCount || 0) > 0 ||
      (Array.isArray(row?.bgTasks) && row.bgTasks.some((t) => t && t.state === 'running'))
    ) {
      return true;
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
    const running = isSessionActivelyRunning(S.prefs.selectedThreadId);
    const inp = S.$('composer-input');
    const hasDraft = Boolean((inp && inp.value.trim().length > 0) || composerAttachments.length > 0);
    const isReplyMode = !S.prefs.composerMode || S.prefs.composerMode === 'reply';
    const shouldShowStop = isReplyMode && !hasDraft && running;

    const compBox = S.$('composer-box');
    const routeToggleBtn = S.$('btn-toggle-composer-route');
    if (compBox) {
      compBox.classList.toggle('is-reply-compact', isReplyMode && !S.isNewSessionMode());
      compBox.classList.toggle('is-route-open', Boolean(S.prefs.composerRouteExpanded || S.isNewSessionMode()));
    }
    if (routeToggleBtn) {
      routeToggleBtn.hidden = S.isNewSessionMode();
      routeToggleBtn.classList.toggle('active', Boolean(S.prefs.composerRouteExpanded));
      routeToggleBtn.setAttribute('aria-expanded', S.prefs.composerRouteExpanded ? 'true' : 'false');
    }

    const stopHdrBtn = S.$('btn-chat-stop');
    if (stopHdrBtn) {
      stopHdrBtn.hidden = !(running && !shouldShowStop);
    }
    const btn = S.$('composer-send-btn');
    if (!btn) return;
    const shouldBrighten = !shouldShowStop && hasDraft;
    btn.classList.toggle('is-stop', shouldShowStop);
    btn.classList.toggle('is-ready', shouldBrighten);
    btn.removeAttribute('title');
    btn.setAttribute('aria-label', shouldShowStop ? 'Stop running session' : 'Dispatch Prompt');
  }

  async function stopActiveSession(explicitId = '') {
    const tid = String(explicitId || S.prefs.selectedThreadId || '').trim();
    if (!tid) return;
    const isDraftNew = tid.startsWith('draft-new-');
    const boundTargetDev =
      isDraftNew && S.pendingNewSessionBind && S.pendingNewSessionBind.draftThreadId === tid
        ? S.pendingNewSessionBind.targetDeviceId || ''
        : '';
    if (isDraftNew && S.pendingNewSessionBind && S.pendingNewSessionBind.draftThreadId === tid) {
      S.pendingNewSessionBind = null;
    }
    const row = (S.appState?.rows || []).find((r) => r.id === tid);
    const detail = S.threadsCache[tid] || null;
    if (detail && Array.isArray(detail.messages)) {
      detail.messages = detail.messages.filter((m) => !m.optimistic);
    }
    const msgs = coalesceThreadMessages(detail?.messages || []);
    const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
    const provider = (detail?.provider || row?.provider) === 'claude' ? 'claude' : 'antigravity';

    S.stoppedSessionsById.set(tid, {
      at: Date.now(),
      msgCount: msgs.length,
      lastMsgId: lastMsg?.id || ''
    });
    S.liveStreamsByThreadId.delete(tid);

    if (row) {
      row.status = 'completed';
      row.statusLabel = 'Stopped';
      row.dot = row.open ? 'idle' : null;
      row.category = 'completed';
      row.unread = false;
      row.elsewhere = false;
      row.reason = null;
      row.bgTask = null;
      row.bgRunningCount = 0;
      if (Array.isArray(row.bgTasks)) {
        row.bgTasks = row.bgTasks.map((t) => (t && t.state === 'running' ? { ...t, state: 'cancelled' } : t));
      }
    }

    S.haptic(20);
    S.persistCache();
    updateComposerActionButton();
    S.renderAll();
    S.showToast('■ Stopped session');

    await S.dispatchRemoteCommand({
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
    S.syncProviderNewSessionButtons();
    document.querySelectorAll('[data-comp-mode]').forEach((b) => {
      b.classList.toggle('active', b.dataset.compMode === S.prefs.composerMode);
    });
    updateComposerActionButton();
  }

  async function submitComposerPrompt() {
    closeSlashPopover();
    const inp = S.$('composer-input');
    if (!inp) return;
    const sendBtn = S.$('composer-send-btn');
    const rawText = inp.value.trim();
    if (!rawText && composerAttachments.length === 0) {
      if (sendBtn?.classList.contains('is-stop') || isSessionActivelyRunning(S.prefs.selectedThreadId)) {
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

    const repoRefs = composerAttachments.filter((a) => a.kind === 'repo');
    const fileRefs = composerAttachments.filter((a) => a.kind !== 'repo');
    const activeRowPre = (S.appState?.rows || []).find((r) => r.id === S.prefs.selectedThreadId) || null;
    const isNewPre = Boolean(
      S.prefs.composerMode === 'new-antigravity' ||
        S.prefs.composerMode === 'new-claude' ||
        !S.prefs.selectedThreadId ||
        S.prefs.selectedThreadId === '__new__'
    );
    const targetDevPre = isNewPre
      ? S.prefs.composerTargetDevice && S.prefs.composerTargetDevice !== 'auto'
        ? S.prefs.composerTargetDevice
        : ''
      : activeRowPre?.deviceId || '';
    const liveWsPre = S.hasLiveAttachmentTransport(targetDevPre);
    let preparedFileAttachments = fileRefs.map((f) => ({
      name: f.name,
      mime: f.mime,
      size: f.size,
      dataUrl: f.dataUrl || '',
      textContent: f.textContent || ''
    }));
    if (fileRefs.length > 0 && (!liveWsPre && (!S.isHeadlessBrowser || window.__THEO_TEST_FORCE_TRANSPORT_MODE === 'cloud'))) {
      preparedFileAttachments = S.compactAttachmentsForCloudFallback(preparedFileAttachments);
      if (S.calcAttachmentsPayloadChars(preparedFileAttachments) > S.MAX_CLOUD_FALLBACK_CHARS) {
        renderComposerAttachments();
        S.showToast('Attachment exceeds 250 KB Cloud Store fallback limit (connect live Edge WS for up to 8 MB)');
        return;
      }
    }

    const sentAttachments = [...composerAttachments];
    const prevSelectedThreadId = S.prefs.selectedThreadId;
    const prevComposerMode = S.prefs.composerMode;
    const prevNewSessionGroupId = S.prefs.newSessionGroupId;
    const prevOpenEditorTabs = Array.isArray(S.prefs.openEditorTabs) ? [...S.prefs.openEditorTabs] : [];
    const optMsgId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    composerAttachments = [];
    renderComposerAttachments();

    inp.value = '';
    inp.style.height = 'auto';
    S.haptic(15);
    S.playChime('send');

    const contextHeader = repoRefs.length
      ? `${repoRefs
          .map((r) => {
            const relMatch = String(r.repoPath || '').replace(/\\/g, '/').match(/\/bhfirms\/([^\n]+)$/i);
            return relMatch ? `${r.name} (bhfirms/${relMatch[1]})` : r.name;
          })
          .join(', ')}\n`
      : '';
    const attachDisplayLine = sentAttachments.length
      ? `\n\nAttached: ${sentAttachments.map((a) => a.name).join(', ')}`
      : '';
    const text = `${contextHeader}${rawText || (fileRefs.length ? `Please inspect the attached file(s): ${fileRefs.map((f) => f.name).join(', ')}` : '')}`.trim();

    const activeRow = (S.appState?.rows || []).find((r) => r.id === S.prefs.selectedThreadId);
    const isNewAgy =
      S.prefs.composerMode === 'new-antigravity' ||
      (S.prefs.selectedThreadId === '__new__' && S.prefs.composerMode !== 'new-claude');
    const isNewClaude = S.prefs.composerMode === 'new-claude';
    const isNew = Boolean(
      isNewAgy || isNewClaude || !S.prefs.selectedThreadId || S.prefs.selectedThreadId === '__new__'
    );
    const provider = isNewClaude
      ? 'claude'
      : isNewAgy
        ? 'antigravity'
        : activeRow?.provider || S.threadsCache[S.prefs.selectedThreadId]?.provider || 'antigravity';
    const targetId = isNew ? '' : S.prefs.selectedThreadId;
    const targetGroupObj =
      isNew && S.prefs.newSessionGroupId
        ? Array.isArray(S.appState?.groups)
          ? S.appState.groups.find((g) => g && g.id === S.prefs.newSessionGroupId) || null
          : { id: S.prefs.newSessionGroupId, name: '' }
        : null;
    const targetGroupId = targetGroupObj ? targetGroupObj.id : '';
    const targetGroupName = targetGroupObj?.name || '';
    const modelCfg = S.getEffectiveSessionModelConfig(activeRow, provider, isNew);

    const prevRowSnapshot = activeRow
      ? {
          pendingQuestion: activeRow.pendingQuestion,
          status: activeRow.status,
          statusLabel: activeRow.statusLabel,
          dot: activeRow.dot,
          at: activeRow.at,
          lastWorkedAt: activeRow.lastWorkedAt,
          model: activeRow.model,
          effort: activeRow.effort
        }
      : null;
    const hadCacheBefore = Boolean(targetId && S.threadsCache[targetId]);
    const prevCacheModel = targetId ? S.threadsCache[targetId]?.model : undefined;
    const hadPrevOverride = Boolean(targetId && S.pendingRowOverrides.has(targetId));
    const prevOverrideVal = hadPrevOverride ? { ...S.pendingRowOverrides.get(targetId) } : null;
    const prevApprovals = Array.isArray(S.appState?.approvals) ? [...S.appState.approvals] : null;
    const prevCollapsedGroups =
      S.prefs.collapsedSessionGroups && typeof S.prefs.collapsedSessionGroups === 'object'
        ? { ...S.prefs.collapsedSessionGroups }
        : null;

    let draftId = '';
    if (isNew) {
      draftId = `draft-new-${Date.now()}`;
      if (!S.prefs.threadModelConfig || typeof S.prefs.threadModelConfig !== 'object') {
        S.prefs.threadModelConfig = {};
      }
      S.prefs.threadModelConfig[draftId] = {
        modelId: modelCfg.modelId,
        effort: modelCfg.effort,
        provider,
        updatedAt: Date.now()
      };
      const knownIds = new Set((S.appState?.rows || []).map((r) => r && r.id).filter(Boolean));
      const cleanTitle =
        (rawText || text).replace(/\s+/g, ' ').trim().slice(0, 56) || 'New Session';
      S.threadsCache[draftId] = {
        id: draftId,
        provider,
        title: cleanTitle,
        model: modelCfg.displayLabel,
        effort: modelCfg.effort,
        folder: S.prefs.composerRepoPrefix
          ? `Scope: ${S.prefs.composerRepoPrefix}`
          : 'BHFIRMS Workspace',
        contextWindow: {
          usedTokens: Math.max(120, Math.round(text.length / 4)),
          limitTokens: S.inferDefaultContextLimit(provider, modelCfg.displayLabel),
          modelLabel: modelCfg.displayLabel
        },
        messages: [
          {
            id: optMsgId,
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
        S.prefs.composerTargetDevice && S.prefs.composerTargetDevice !== 'auto'
          ? String(S.prefs.composerTargetDevice).trim()
          : S.prefs.selectedDeviceFilter && S.prefs.selectedDeviceFilter !== 'all'
            ? String(S.prefs.selectedDeviceFilter).trim()
            : '';
      S.pendingNewSessionBind = {
        draftThreadId: draftId,
        provider,
        targetDeviceId: boundDev,
        promptText: rawText || text,
        groupId: targetGroupId,
        knownIds,
        createdAt: Date.now()
      };
      if (targetGroupId) {
        S.noteRowOverride(draftId, { group: targetGroupId });
        if (!S.prefs.collapsedSessionGroups || typeof S.prefs.collapsedSessionGroups !== 'object') {
          S.prefs.collapsedSessionGroups = {};
        }
        S.prefs.collapsedSessionGroups[targetGroupId] = false;
      }
      S.ensureEditorTabOpen(draftId);
      S.prefs.selectedThreadId = draftId;
      S.prefs.composerMode = 'reply';
      S.prefs.newSessionGroupId = '';
      S.saveJson(S.STORAGE_KEYS.PREFS, S.prefs);
      S.persistCache();
      updateComposerModePills();
      renderChatView(true);
      S.renderIdeSidebar();
    } else if (targetId) {
      S.stoppedSessionsById.delete(targetId);
      const hadPendingQ = Boolean(
        activeRow?.pendingQuestion ||
          (Array.isArray(S.appState?.approvals) && S.appState.approvals.some((a) => a && a.sessionId === targetId))
      );
      const existingMsgs = coalesceThreadMessages(S.threadsCache[targetId]?.messages || []);
      const lastExistingMsg = existingMsgs.length > 0 ? existingMsgs[existingMsgs.length - 1] : null;
      const lastTurnQs =
        lastExistingMsg && lastExistingMsg.role === 'assistant'
          ? resolveQuestionsForTurn(lastExistingMsg, null).questions
          : [];
      if (hadPendingQ || lastTurnQs.length > 0) {
        const matchedApp = (S.appState?.approvals || []).find((a) => a && a.sessionId === targetId);
        recordQuestionAnswered({
          sessionId: targetId,
          approvalId: matchedApp?.approvalId || '',
          turnId: String(lastExistingMsg?.id || ''),
          stepIndex: activeRow?.pendingQuestion?.stepIndex ?? activeRow?.stepCount ?? null,
          questions: lastTurnQs.length > 0 ? lastTurnQs : normalizeFrontendQuestions(activeRow?.pendingQuestion?.questions),
          summary: `${rawText || text}`,
          skipped: false
        });
        if (Array.isArray(S.appState?.approvals)) {
          S.appState.approvals = S.appState.approvals.filter((a) => a && a.sessionId !== targetId);
        }
        S.markNotificationsCheckedForSession(targetId);
      }
      const workedNowMs = Date.now();
      S.noteRowOverride(targetId, {
        lastWorkedAt: workedNowMs,
        model: modelCfg.displayLabel,
        effort: modelCfg.effort
      });
      if (activeRow) {
        activeRow.pendingQuestion = null;
        activeRow.status = 'working';
        activeRow.statusLabel = 'Running';
        activeRow.dot = 'running';
        activeRow.at = workedNowMs;
        activeRow.lastWorkedAt = workedNowMs;
        activeRow.model = modelCfg.displayLabel;
        activeRow.effort = modelCfg.effort;
        if (Array.isArray(S.appState?.rows)) {
          S.appState.rows.sort(S.compareRowsPinnedFirst);
        }
      }
      if (!S.threadsCache[targetId]) {
        S.threadsCache[targetId] = { id: targetId, provider, model: modelCfg.displayLabel, messages: [] };
      } else {
        S.threadsCache[targetId].model = modelCfg.displayLabel;
      }
      const baseCountBeforePush = (S.threadsCache[targetId].messages || []).filter((m) => !m?.optimistic).length;
      S.threadsCache[targetId].messages.push({
        id: optMsgId,
        role: 'user',
        createdAt: new Date().toISOString(),
        text: `${rawText || text}${attachDisplayLine}`,
        toolCalls: [],
        optimistic: true,
        optimisticQuestionAnswer: hadPendingQ,
        baseMsgCount: baseCountBeforePush,
        optimisticAt: Date.now()
      });
      S.persistCache();
      S.renderAll();
    }

    const res = await S.dispatchRemoteCommand({
      type: 'send',
      id: targetId,
      threadId: targetId,
      draftThreadId: draftId || undefined,
      provider,
      model: modelCfg.cliModel,
      effort: modelCfg.effort,
      displayModel: modelCfg.displayLabel,
      prompt: text,
      group: targetGroupId || undefined,
      groupName: targetGroupName || undefined,
      attachments: preparedFileAttachments,
      newSession: isNew
    });

    if (res && res.ok === false) {
      composerAttachments = sentAttachments;
      inp.value = rawText;
      updateComposerActionButton();
      if (isNew && draftId) {
        S.pendingNewSessionBind = null;
        delete S.threadsCache[draftId];
        if (S.prefs.threadModelConfig) delete S.prefs.threadModelConfig[draftId];
        S.pendingRowOverrides.delete(draftId);
        S.prefs.selectedThreadId = prevSelectedThreadId;
        S.prefs.composerMode = prevComposerMode;
        S.prefs.newSessionGroupId = prevNewSessionGroupId;
        S.prefs.openEditorTabs = prevOpenEditorTabs;
        if (prevCollapsedGroups) S.prefs.collapsedSessionGroups = prevCollapsedGroups;
        S.saveJson(S.STORAGE_KEYS.PREFS, S.prefs);
      } else if (targetId) {
        if (!hadCacheBefore) {
          delete S.threadsCache[targetId];
        } else if (S.threadsCache[targetId]) {
          if (prevCacheModel !== undefined) S.threadsCache[targetId].model = prevCacheModel;
          S.threadsCache[targetId].messages = (S.threadsCache[targetId].messages || []).filter(
            (m) => m && m.id !== optMsgId
          );
        }
        if (activeRow && prevRowSnapshot) {
          Object.assign(activeRow, prevRowSnapshot);
          if (Array.isArray(S.appState?.rows)) {
            S.appState.rows.sort(S.compareRowsPinnedFirst);
          }
        }
        if (hadPrevOverride && prevOverrideVal) S.pendingRowOverrides.set(targetId, prevOverrideVal);
        else S.pendingRowOverrides.delete(targetId);
        if (prevApprovals && Array.isArray(S.appState?.approvals)) {
          S.appState.approvals = prevApprovals;
        }
      }
      S.persistCache();
      renderComposerAttachments();
      updateComposerModePills();
      renderChatView(true);
      S.renderIdeSidebar();
      S.showToast(res.error || 'Failed to send message');
      return;
    }

    S.recentResumeUntil = 0;
    if (isNew) {
      if (S.pendingNewSessionBind && res?.id) {
        S.pendingNewSessionBind.cmdId = res.id;
      }
      const returnedRealId = S.cleanTargetThreadId(
        res?.out?.id || res?.out?.result?.id || res?.out?.result?.sessionId || ''
      );
      if (returnedRealId) {
        S.bindDraftThreadToRealSession(draftId, returnedRealId, provider);
      }
    }

    if (res.mode === 'cloud') {
      setTimeout(() => S.syncData(), 1800);
      setTimeout(() => S.syncData(), 4000);
      setTimeout(() => S.syncData(), 7500);
      setTimeout(() => S.syncData(), 12000);
      if (res.id) {
        setTimeout(() => {
          const q = S.lastCloudQueue || {};
          const hasResult = Boolean(q.results && q.results[res.id]);
          const inQueue =
            Array.isArray(q.commands) && q.commands.some((c) => c && c.id === res.id);
          const stillUnbound =
            !isNew || (S.pendingNewSessionBind && S.pendingNewSessionBind.cmdId === res.id);
          if (!hasResult && !inQueue && stillUnbound) {
            S.dispatchRemoteCommand({
              type: 'send',
              id: res.id,
              threadId: targetId,
              draftThreadId: draftId || undefined,
              provider,
              model: modelCfg.cliModel,
              effort: modelCfg.effort,
              displayModel: modelCfg.displayLabel,
              prompt: text,
              group: targetGroupId || undefined,
              groupName: targetGroupName || undefined,
              attachments: preparedFileAttachments,
              newSession: isNew
            }).catch(() => {});
          }
        }, 4500);
      }
    }

    S.showToast(
      res.mode === 'local_ws' || res.mode === 'edge_ws'
        ? `Streaming live from ${provider === 'claude' ? 'Claude Code' : 'Antigravity'} (${res.mode === 'edge_ws' ? 'Edge WS' : 'Direct WS'})`
        : res.mode === 'cloud'
          ? `Dispatched via THEO Cloud Relay`
          : res.mode === 'local'
            ? `Sent to ${provider === 'claude' ? 'Claude Code' : 'Antigravity'} (Direct Host)`
            : `Queued in Outbox (will send when online)`
    );
  }

  Object.assign(S, {
    applyAnsweredQuestionOverrides,
    applySlashPopoverSelection,
    attachMentionItemToComposer,
    bgTaskLogsCache,
    cleanCheckpointPreview,
    cleanUserPromptPreview,
    closeSlashPopover,
    coalesceThreadMessages,
    countDraftSelections,
    extractQuestionsStepIndex,
    formatTurnMarkdown,
    getQuestionDraft,
    handleComposerFiles,
    isHostVsCodeOpenForSession,
    isSessionActivelyRunning,
    locallyCancelledBgTasks,
    lookupAnsweredQuestionState,
    normalizeFrontendQuestions,
    openBgTaskDetails,
    openRepoFilePicker,
    renderChatView,
    renderComposerAttachments,
    renderInteractiveQuestionCardHtml,
    renderedQuestionsByCardKey,
    resolveQuestionsForApproval,
    resolveQuestionsForTurn,
    stepKindFilterByTurnKey,
    stopActiveSession,
    submitComposerPrompt,
    submitInteractiveQuestionCard,
    syncComposerRoutingSelectors,
    triggerActiveSessionCompact,
    updateComposerActionButton,
    updateComposerModePills,
    updateComposerSlashPopover,
    uwExpandedPcs
  });
  Object.defineProperties(S, {
    composerAttachments: { get: () => composerAttachments, set: (v) => { composerAttachments = v; }, enumerable: true, configurable: true },
    slashPopoverActiveIdx: { get: () => slashPopoverActiveIdx, set: (v) => { slashPopoverActiveIdx = v; }, enumerable: true, configurable: true },
    slashPopoverItems: { get: () => slashPopoverItems, set: (v) => { slashPopoverItems = v; }, enumerable: true, configurable: true }
  });

  if (!answeredQuestionsLedger || typeof answeredQuestionsLedger !== 'object') {
    answeredQuestionsLedger = {};
  }
  for (const [k, v] of Object.entries(answeredQuestionsLedger)) {
    if (k.startsWith('sess:') && v && Date.now() - Number(v.at || 0) < 240000) {
      const sid = k.slice(5);
      if (sid) pendingAnsweredSessions.set(sid, v);
    }
  }
  });
})();
