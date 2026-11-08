'use strict';

const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function findEdgeBinary() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Could not find msedge.exe or chrome.exe for headless CDP verification');
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}

function startStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        const u = new URL(req.url, 'http://127.0.0.1');
        let rel = decodeURIComponent(u.pathname);
        if (rel === '/' || rel === '') rel = '/index.html';
        const filePath = path.resolve(rootDir, '.' + rel);
        if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
          'Cache-Control': 'no-store'
        });
        fs.createReadStream(filePath).pipe(res);
      } catch (e) {
        res.writeHead(500);
        res.end(String(e));
      }
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
    srv.on('error', reject);
  });
}

async function waitForJson(url, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {}
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error(`Timed out waiting for CDP endpoint: ${url}`);
}

class CdpSession {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.seq = 0;
    this.pending = new Map();
    this.events = [];
    this.onEvent = null;
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else p.resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
        if (this.onEvent) this.onEvent(msg);
      }
    });
  }

  send(method, params = {}, sessionId = undefined) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout on ${method}`));
      }, 12000);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        }
      });
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      this.ws.send(JSON.stringify(payload));
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

function buildSeedCachePayload() {
  const now = Date.now();
  return {
    updatedAt: now,
    state: {
      generatedAt: now,
      device: { id: 'theo-laptop', name: 'THEO Laptop <svg onload="window.__XSS=9">', role: 'secondary' },
      connection: {
        hostname: 'THEO-LAPTOP',
        lanUrl: 'javascript:window.__XSS=8',
        pwaUrl: 'https://husseinbdeir.github.io/theo/'
      },
      devices: [
        { id: 'main-workstation', name: 'Main Workstation', online: true, sessionCount: 2, lastSeen: now },
        { id: 'theo-laptop', name: 'THEO Laptop', online: true, local: true, sessionCount: 2, lastSeen: now }
      ],
      accountOrder: ['antigravity:hbdeir16@gmail.com', 'claude:hussein@bhfirms.com'],
      providers: {
        antigravity: {
          signedIn: true,
          accounts: [
            {
              id: 'antigravity:hbdeir16@gmail.com',
              email: 'hbdeir16@gmail.com',
              label: 'Primary',
              plan: 'Ultra (20x)',
              active: true,
              usage: {
                limits: [
                  { label: 'Gemini 4 Argon (High)', usedPercent: 34, reset: now + 3600000 }
                ]
              }
            }
          ]
        },
        claude: {
          signedIn: true,
          accounts: [
            {
              id: 'claude:hussein@bhfirms.com',
              email: 'hussein@bhfirms.com',
              label: 'Work',
              plan: 'Max 20x',
              active: true,
              usage: {
                limits: [
                  { label: 'Session (5hr)', usedPercent: 22, reset: now + 7200000 },
                  { label: 'Weekly (7 day)', usedPercent: 41, reset: now + 172800000 },
                  { label: 'Fable limit', usedPercent: 18, reset: now + 172800000 }
                ]
              }
            }
          ]
        }
      },
      summary: {
        today: { tokens: 420000, sessions: 4 },
        week: { tokens: 2850000, sessions: 19 },
        month: { tokens: 11400000, sessions: 74 }
      },
      groups: [{ id: 'grp-core', name: 'Priority Threads', collapsed: false }],
      approvals: [
        {
          id: 'app-1',
          approvalId: 'app-1',
          sessionId: 'sess-alpha',
          provider: 'antigravity',
          deviceId: 'main-workstation',
          deviceName: 'Main Workstation',
          title: 'Confirm deployment option',
          questions: [
            {
              question: 'Which mode should we use?',
              options: ['(Recommended) Hybrid Smart Routing', 'IDE Only']
            }
          ]
        }
      ],
      rows: [
        {
          id: 'sess-alpha',
          title: 'ISABI Command Center Audit & Multi-Host Mesh',
          provider: 'antigravity',
          model: 'Gemini 4 Argon (High)',
          cwd: 'C:\\Users\\HusseinBdeir\\bhfirms\\isabi-app',
          folder: 'isabi-app',
          branch: 'main',
          status: 'working',
          statusLabel: 'Running now',
          dot: 'running',
          open: true,
          group: 'grp-core',
          at: now - 60000,
          contextTokens: 84000,
          contextLimit: 256000,
          contextBreakdown: [
            { label: 'System & Rules', tokens: 28000, color: '#C0892F' },
            { label: 'Hostile CSS Color', tokens: 56000, color: 'red;background-image:url(javascript:1)' }
          ],
          backgroundTasks: [
            {
              id: 'task-101',
              kind: 'task',
              state: 'running',
              summary: 'Headless verification matrix',
              startedAt: now - 25000,
              outputPreview: '[PASS] 14/14 viewports verified'
            }
          ]
        },
        {
          id: 'sess-beta',
          title: 'THEO Studio Security Hardening & Edge Relay v2',
          provider: 'claude',
          model: 'Fable 5.1',
          cwd: 'C:\\Users\\hbdei\\bhfirms\\theo',
          folder: 'theo',
          branch: 'main',
          status: 'completed',
          statusLabel: 'Completed',
          dot: 'idle',
          open: true,
          at: now - 7200000,
          contextTokens: 112000,
          contextLimit: 1000000
        }
      ],
      workspaces: [
        {
          id: 'theo',
          name: 'theo',
          path: 'C:\\Users\\hbdei\\bhfirms\\theo',
          branch: 'main',
          dirtyCount: 0,
          ahead: 0,
          behind: 0,
          deviceId: 'theo-laptop',
          deviceName: 'THEO Laptop'
        }
      ]
    },
    threads: {
      'sess-alpha': {
        id: 'sess-alpha',
        provider: 'antigravity',
        title: 'ISABI Command Center Audit & Multi-Host Mesh',
        messages: [
          {
            id: 'm1',
            role: 'user',
            createdAt: new Date(now - 120000).toISOString(),
            text: 'Run full security and layout audit.'
          },
          {
            id: 'm2',
            role: 'assistant',
            createdAt: new Date(now - 60000).toISOString(),
            text: [
              'Audit summary with hostile markdown links:',
              '- [JS Link](javascript:window.__XSS=1)',
              '- [Quote Breakout](https://example.com/`"onclick="window.__XSS=2)',
              '- Raw HTML tag: <img src="x" onerror="window.__XSS=3">',
              '- Safe link: [THEO Live](https://husseinbdeir.github.io/theo/)'
            ].join('\n'),
            toolCalls: [
              {
                name: 'edit_file',
                badge: 'Edited',
                file: 'js/app.js',
                added: 42,
                removed: 11,
                diff: '+ const safe = true;\n- const unsafe = false;'
              }
            ]
          }
        ]
      }
    },
    workspacesDetail: {
      theo: {
        id: 'theo',
        name: 'theo',
        path: 'C:\\Users\\hbdei\\bhfirms\\theo',
        branch: 'main',
        statusFiles: [],
        recentCommits: [{ hash: '1234567', subject: 'Ship v56 multi-device studio hardening', relTime: '1m ago' }]
      }
    }
  };
}

async function main() {
  // Static Lockstep Cache-Version Check (PWA.md §3.1 / Red-Team M-2):
  // index.html (?v=N), sw.js (CACHE_NAME + CORE_SHELL ?v=N), manifest.json (?v=N), and js/app.js (register('sw.js?v=N')) MUST match.
  const indexSrc = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
  const swSrc = fs.readFileSync(path.join(REPO_ROOT, 'sw.js'), 'utf8');
  const manifestSrc = fs.readFileSync(path.join(REPO_ROOT, 'manifest.json'), 'utf8');
  const appJsSrc = fs.readFileSync(path.join(REPO_ROOT, 'js', 'app.js'), 'utf8');

  const swCacheMatch = swSrc.match(/CACHE_NAME\s*=\s*['"]theo-remote-v(\d+)['"]/);
  assert.ok(swCacheMatch, 'sw.js must define CACHE_NAME = theo-remote-vN');
  const expectedVer = swCacheMatch[1];
  for (const [label, src, regex] of [
    ['index.html css', indexSrc, /css\/theo\.css\?v=(\d+)/g],
    ['index.html app.js', indexSrc, /js\/app\.js\?v=(\d+)/g],
    ['index.html manifest', indexSrc, /manifest\.json\?v=(\d+)/g],
    ['sw.js shell assets', swSrc, /\?v=(\d+)/g],
    ['manifest.json icons', manifestSrc, /\?v=(\d+)/g],
    ['js/app.js registerServiceWorker', appJsSrc, /serviceWorker\s*\.register\(\s*['"]sw\.js\?v=(\d+)['"]/g]
  ]) {
    const matches = [...src.matchAll(regex)];
    assert.ok(matches.length > 0, `${label} must include ?v=${expectedVer}`);
    for (const m of matches) {
      assert.strictEqual(m[1], expectedVer, `Lockstep ?v= mismatch in ${label}: found v=${m[1]}, expected v=${expectedVer}`);
    }
  }
  console.log(`[PASS] Lockstep SW/Shell version parity verified (v${expectedVer})`);

  const edgeExe = findEdgeBinary();
  const cdpPort = await getFreePort();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'theo-cdp-verify-'));
  const { srv, port: httpPort } = await startStaticServer(REPO_ROOT);
  const baseUrl = `http://127.0.0.1:${httpPort}`;

  const edgeProc = spawn(
    edgeExe,
    [
      '--headless=new',
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${userDataDir}`,
      '--enable-automation',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--mute-audio',
      'about:blank'
    ],
    { stdio: 'ignore', windowsHide: true }
  );

  let cdp = null;
  try {
    const versionInfo = await waitForJson(`http://127.0.0.1:${cdpPort}/json/version`);
    cdp = new CdpSession(versionInfo.webSocketDebuggerUrl);
    await cdp.connect();

    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });

    const consoleErrors = [];
    const pageExceptions = [];
    const leakedExternalUrls = [];

    cdp.onEvent = (ev) => {
      if (ev.sessionId !== sessionId) return;
      if (ev.method === 'Runtime.exceptionThrown') {
        const desc =
          ev.params?.exceptionDetails?.exception?.description ||
          ev.params?.exceptionDetails?.text ||
          'Unknown exception';
        pageExceptions.push(desc);
      } else if (ev.method === 'Runtime.consoleAPICalled' && ev.params?.type === 'error') {
        const txt = (ev.params.args || []).map((a) => a.value || a.description || '').join(' ');
        if (!txt.includes('favicon')) consoleErrors.push(txt);
      } else if (ev.method === 'Network.requestWillBeSent') {
        const reqUrl = String(ev.params?.request?.url || '');
        if (/workers\.dev|dynamics\.com|logic\.azure\.com|powerplatform\.com/i.test(reqUrl)) {
          leakedExternalUrls.push(reqUrl);
        }
      }
    };

    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Network.enable', {}, sessionId);

    const seedCacheJson = JSON.stringify(buildSeedCachePayload());
    await cdp.send(
      'Page.addScriptToEvaluateOnNewDocument',
      {
        source: `
          window.__THEO_HEADLESS_TEST = true;
          if (!localStorage.getItem('theo_remote_cache_v3')) {
            localStorage.setItem('theo_remote_cache_v3', ${JSON.stringify(seedCacheJson)});
            localStorage.setItem('theo_remote_prefs_v1', JSON.stringify({
              theme: 'light',
              themeUserSet: true,
              sound: false,
              activeTab: 'pulse',
              selectedThreadId: 'sess-alpha',
              composerMode: 'reply',
              freqUsage: {
                devices: { 'theo-laptop': 5 },
                repos: {},
                threads: { 'sess-beta': 12, 'sess-alpha': 1 },
                commands: {}
              }
            }));
          }
        `
      },
      sessionId
    );

    const evalJs = async (expression) => {
      const res = await cdp.send(
        'Runtime.evaluate',
        { expression, returnByValue: true, awaitPromise: true },
        sessionId
      );
      if (res.exceptionDetails) {
        throw new Error(`Eval error: ${res.exceptionDetails.exception?.description || res.exceptionDetails.text}`);
      }
      return res.result?.value;
    };

    await cdp.send('Page.navigate', { url: `${baseUrl}/?nosse=1` }, sessionId);
    await new Promise((r) => setTimeout(r, 700));

    // Viewports × Themes matrix
    const viewports = [
      { w: 320, h: 568, mobile: true, label: '320x568' },
      { w: 375, h: 812, mobile: true, label: '375x812' },
      { w: 390, h: 844, mobile: true, label: '390x844' },
      { w: 844, h: 390, mobile: true, label: '844x390-landscape' },
      { w: 740, h: 360, mobile: true, label: '740x360-landscape' },
      { w: 768, h: 1024, mobile: true, label: '768x1024-tablet' },
      { w: 1440, h: 900, mobile: false, label: '1440x900-desktop' }
    ];
    const tabs = ['pulse', 'sessions', 'chat', 'workspaces', 'analytics'];

    for (const vp of viewports) {
      await cdp.send(
        'Emulation.setDeviceMetricsOverride',
        { width: vp.w, height: vp.h, deviceScaleFactor: 2, mobile: vp.mobile },
        sessionId
      );

      for (const theme of ['light', 'dark']) {
        for (const tab of tabs) {
          const probe = await evalJs(`(async () => {
            document.documentElement.setAttribute('data-theme', '${theme}');
            const navBtn = document.querySelector('[data-tab="${tab}"]');
            if (navBtn) navBtn.click();
            await new Promise((r) => setTimeout(r, 45));

            const docScrollW = document.documentElement.scrollWidth;
            const vw = window.innerWidth;
            const titleEls = document.querySelectorAll('[title]').length;
            const xssGlobal = window.__XSS || null;
            const jsLinks = document.querySelectorAll('a[href^="javascript:"]').length;
            const inlineHandlers = document.querySelectorAll('[onclick],[onerror],[onload]').length;

            let chatContainerOverflow = 0;
            let chatStreamH = null;
            if ('${tab}' === 'chat') {
              const vc = document.querySelector('.view-container.chat-active');
              if (vc && ${!vp.mobile}) {
                chatContainerOverflow = Math.max(0, vc.scrollHeight - vc.clientHeight);
              }
              const cs = document.getElementById('chat-stream');
              if (cs) chatStreamH = cs.clientHeight;
            }
            return { docScrollW, vw, titleEls, xssGlobal, jsLinks, inlineHandlers, chatContainerOverflow, chatStreamH };
          })()`);

          assert.ok(
            probe.docScrollW <= probe.vw + 1,
            `Horizontal overflow on ${vp.label} ${theme} ${tab}: scrollW=${probe.docScrollW} > vw=${probe.vw}`
          );
          assert.strictEqual(probe.titleEls, 0, `Found [title] attribute on ${vp.label} ${theme} ${tab}`);
          assert.strictEqual(probe.xssGlobal, null, `XSS executed on ${vp.label} ${theme} ${tab}`);
          assert.strictEqual(probe.jsLinks, 0, `javascript: href rendered on ${vp.label} ${theme} ${tab}`);
          assert.strictEqual(probe.inlineHandlers, 0, `Inline event handler rendered on ${vp.label} ${theme} ${tab}`);

          if (vp.w === 1440 && tab === 'chat') {
            assert.ok(
              probe.chatContainerOverflow <= 1,
              `Desktop .view-container.chat-active overflow=${probe.chatContainerOverflow}px`
            );
          }
          if ((vp.h === 390 || vp.h === 360) && tab === 'chat') {
            assert.ok(
              probe.chatStreamH >= 135,
              `Landscape #chat-stream too short (${probe.chatStreamH}px < 135px) on ${vp.label}`
            );
          }
        }

        // Check modals (#conn-modal, #notif-modal, #cmd-modal) on representative narrow & desktop viewports
        if (vp.w === 320 || vp.w === 1440) {
          const modalProbe = await evalJs(`(async () => {
            const out = {};
            document.getElementById('rail-conn-btn')?.click();
            await new Promise((r) => setTimeout(r, 30));
            out.connScrollW = document.documentElement.scrollWidth;
            out.connJsLinks = document.querySelectorAll('#conn-modal a[href^="javascript:"]').length;
            document.getElementById('conn-modal-close')?.click();

            document.getElementById('rail-push-btn')?.click();
            await new Promise((r) => setTimeout(r, 30));
            out.notifScrollW = document.documentElement.scrollWidth;
            document.getElementById('notif-modal-close')?.click();

            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
            await new Promise((r) => setTimeout(r, 30));
            out.cmdOpen = !document.getElementById('cmd-modal')?.hidden;
            out.cmdScrollW = document.documentElement.scrollWidth;
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            return { ...out, vw: window.innerWidth, titles: document.querySelectorAll('[title]').length };
          })()`);
          assert.strictEqual(modalProbe.connJsLinks, 0, 'lanUrl javascript: link must be blocked in #conn-modal');
          assert.strictEqual(modalProbe.cmdOpen, true, 'Ctrl+K should open #cmd-modal when unlocked');
          assert.ok(modalProbe.connScrollW <= modalProbe.vw + 1, `Conn modal overflow on ${vp.label}`);
          assert.ok(modalProbe.notifScrollW <= modalProbe.vw + 1, `Notif modal overflow on ${vp.label}`);
          assert.ok(modalProbe.cmdScrollW <= modalProbe.vw + 1, `Cmd modal overflow on ${vp.label}`);
          assert.strictEqual(modalProbe.titles, 0, `Modal [title] attribute found on ${vp.label}`);
        }
      }
    }
    console.log('[PASS] Matrix: 7 viewports × 2 themes × 5 tabs + 3 modals (0px overflow, 0 [title], 0 XSS)');

    // Adversarial Check #1: Frequency-first ranking strictly beats recency (#34, THEO.md Rule 11)
    const freqCheck = await evalJs(`(async () => {
      document.querySelector('[data-tab="sessions"]')?.click();
      const inp = document.getElementById('sess-search-input');
      inp.value = 'audit'; // matches sess-alpha; clear to 'e' which matches both sess-alpha & sess-beta
      inp.value = 'e';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 30));
      const cards = Array.from(document.querySelectorAll('#view-sessions .session-card[data-session-id]')).map(
        (el) => el.dataset.sessionId
      );
      const chatOpts = Array.from(document.querySelectorAll('#chat-session-select option'))
        .map((o) => o.value)
        .filter((v) => v.startsWith('sess-'));
      return { cards, chatOpts };
    })()`);
    assert.strictEqual(
      freqCheck.cards[0],
      'sess-beta',
      `Frequency-first violation in #sess-search-input: expected sess-beta (freq=12) before newer sess-alpha (freq=1), got ${JSON.stringify(freqCheck.cards)}`
    );
    assert.strictEqual(
      freqCheck.chatOpts[0],
      'sess-beta',
      `Frequency-first violation in #chat-session-select: expected sess-beta first, got ${JSON.stringify(freqCheck.chatOpts)}`
    );
    console.log('[PASS] Adversarial #1: Frequency-first ranking strictly dominates recency across search & select');

    // Adversarial Check #2: Legacy v55 plaintext PIN -> v56 SHA-256 migration, Ctrl+K bypass block, & 360px landscape keypad reachability (#17)
    for (const h of [390, 360]) {
      const w = h === 390 ? 844 : 740;
      await cdp.send(
        'Emulation.setDeviceMetricsOverride',
        { width: w, height: h, deviceScaleFactor: 2, mobile: true },
        sessionId
      );
      await evalJs(`(() => {
        localStorage.removeItem('theo_remote_pin_hash_v1');
        localStorage.setItem('theo_remote_pin_v1', '2468');
      })()`);
      await cdp.send('Page.navigate', { url: `${baseUrl}/?nosse=1` }, sessionId);
      await new Promise((r) => setTimeout(r, 450));

      const pinState = await evalJs(`(async () => {
        const overlay = document.getElementById('pin-overlay');
        const appShell = document.getElementById('app-shell');
        const card = document.querySelector('#pin-overlay .pin-card');
        const rect = card.getBoundingClientRect();
        const shellInertWhileLocked = Boolean(appShell && appShell.inert === true);

        // Attempt Ctrl+K AND programmatic click on #app-shell controls while locked
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
        document.getElementById('rail-conn-btn')?.click();
        const cmdHiddenWhileLocked = document.getElementById('cmd-modal')?.hidden !== false;
        const connHiddenWhileLocked = document.getElementById('conn-modal')?.hidden !== false;

        // Wait for async SHA-256 migration
        await new Promise((r) => setTimeout(r, 80));
        const rawLegacy = localStorage.getItem('theo_remote_pin_v1');
        const migratedHash = localStorage.getItem('theo_remote_pin_hash_v1') || '';

        // Re-run inline <script id="pre"> against migrated theo_remote_pin_hash_v1 to prove pre-paint lock class
        const preScriptCode = document.getElementById('pre')?.textContent || '';
        document.documentElement.classList.remove('pin-locked-boot');
        new Function(preScriptCode)();
        const prePaintClassApplied = document.documentElement.classList.contains('pin-locked-boot');
        document.documentElement.classList.remove('pin-locked-boot');

        // Tap wrong PIN 1111 -> must remain locked
        for (const d of ['1', '1', '1', '1']) {
          document.querySelector('#pin-pad button[data-digit="' + d + '"]')?.click();
        }
        await new Promise((r) => setTimeout(r, 80));
        const stillLockedAfterWrong = !overlay.hidden;

        // Tap right PIN 2468 -> must unlock & restore appShell interactivity
        for (const d of ['2', '4', '6', '8']) {
          document.querySelector('#pin-pad button[data-digit="' + d + '"]')?.click();
        }
        await new Promise((r) => setTimeout(r, 80));
        const unlockedAfterCorrect = overlay.hidden === true;
        const shellInteractiveAfterUnlock = Boolean(appShell && appShell.inert === false);

        return {
          lockedOnBoot: Boolean(overlay && !overlay.hidden) || stillLockedAfterWrong,
          cardBottom: Math.ceil(rect.bottom),
          vh: window.innerHeight,
          shellInertWhileLocked,
          cmdHiddenWhileLocked,
          connHiddenWhileLocked,
          prePaintClassApplied,
          rawLegacy,
          hashLen: migratedHash.length,
          stillLockedAfterWrong,
          unlockedAfterCorrect,
          shellInteractiveAfterUnlock
        };
      })()`);

      assert.strictEqual(pinState.rawLegacy, null, 'Plaintext v55 PIN must be purged after SHA-256 migration');
      assert.strictEqual(pinState.hashLen, 64, 'Migrated PIN hash must be 64-char hex SHA-256');
      assert.strictEqual(pinState.prePaintClassApplied, true, 'Inline <script id="pre"> must set pin-locked-boot when PIN hash exists');
      assert.strictEqual(pinState.shellInertWhileLocked, true, '#app-shell must be inert while PIN-locked');
      assert.strictEqual(pinState.cmdHiddenWhileLocked, true, 'Ctrl+K must NOT open Command Palette while PIN-locked');
      assert.strictEqual(pinState.connHiddenWhileLocked, true, 'Clicks inside #app-shell must be blocked while PIN-locked');
      assert.ok(
        pinState.cardBottom <= pinState.vh + 1,
        `Landscape ${w}x${h} PIN card clipped: bottom=${pinState.cardBottom} > vh=${pinState.vh}`
      );
      assert.strictEqual(pinState.stillLockedAfterWrong, true, 'Wrong PIN must keep overlay locked');
      assert.strictEqual(pinState.unlockedAfterCorrect, true, 'Correct migrated PIN must unlock overlay');
      assert.strictEqual(pinState.shellInteractiveAfterUnlock, true, '#app-shell inert must clear after PIN unlock');
      await evalJs(`localStorage.removeItem('theo_remote_pin_hash_v1')`);
    }
    console.log('[PASS] Adversarial #2: v55->v56 SHA-256 PIN migration, Ctrl+K lock guard, & 844x390 / 740x360 landscape reachability');

    // Adversarial Check #3: Cold-boot URL ?tab=chat&new=claude|antigravity precedence over stale pinned session & null providers (#29)
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
      sessionId
    );
    for (const prov of ['claude', 'antigravity']) {
      await evalJs(`(() => {
        sessionStorage.setItem('theo_pinned_nav_v1', JSON.stringify({
          threadId: 'sess-alpha',
          provider: 'antigravity',
          until: Date.now() + 60000
        }));
        const c = JSON.parse(localStorage.getItem('theo_remote_cache_v3') || '{}');
        if (c.state) delete c.state.providers;
        localStorage.setItem('theo_remote_cache_v3', JSON.stringify(c));
      })()`);
      await cdp.send('Page.navigate', { url: `${baseUrl}/?tab=chat&new=${prov}&nosse=1` }, sessionId);
      await new Promise((r) => setTimeout(r, 450));
      const bootNav = await evalJs(`(() => {
        const prefs = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');
        const chatActive = document.getElementById('view-chat')?.classList.contains('active');
        return { activeTab: prefs.activeTab, composerMode: prefs.composerMode, selectedThreadId: prefs.selectedThreadId, chatActive };
      })()`);
      assert.strictEqual(bootNav.activeTab, 'chat', `Expected chat tab for ?new=${prov}`);
      assert.strictEqual(bootNav.chatActive, true, `Expected #view-chat.active for ?new=${prov}`);
      assert.strictEqual(bootNav.composerMode, `new-${prov}`, `Expected new-${prov} preserved on cold boot`);
      assert.strictEqual(bootNav.selectedThreadId, '__new__', `Expected __new__ thread on cold boot`);
    }
    console.log('[PASS] Adversarial #3: Cold-boot ?tab=chat&new=claude|antigravity beats stale pinnedNav & unhydrated providers');

    // Adversarial Check #5: Cold Unpaired iOS Standalone / Browser Onboarding, Focus Guard, Multi-line #pair= & 6-Digit /pair/claim Lock
    await evalJs(`(() => {
      localStorage.removeItem('theo_remote_cache_v3');
      localStorage.setItem('theo_remote_prefs_v1', JSON.stringify({
        theme: 'light',
        themeUserSet: true,
        sound: false,
        activeTab: 'sessions'
      }));
    })()`);
    await cdp.send('Page.navigate', { url: `${baseUrl}/?nosse=1` }, sessionId);
    await new Promise((r) => setTimeout(r, 500));

    for (const uVp of [
      { w: 320, h: 568, mobile: true, label: '320x568-unpaired' },
      { w: 390, h: 844, mobile: true, label: '390x844-unpaired' },
      { w: 740, h: 360, mobile: true, label: '740x360-unpaired' },
      { w: 1440, h: 900, mobile: false, label: '1440x900-unpaired' }
    ]) {
      await cdp.send(
        'Emulation.setDeviceMetricsOverride',
        { width: uVp.w, height: uVp.h, deviceScaleFactor: 2, mobile: uVp.mobile },
        sessionId
      );
      const uLayout = await evalJs(`(async () => {
        const res = {};
        for (const t of ['pulse', 'sessions']) {
          document.querySelector('[data-tab="' + t + '"]')?.click();
          await new Promise((r) => setTimeout(r, 35));
          res[t + 'ScrollW'] = document.documentElement.scrollWidth;
          res[t + 'HasCard'] = Boolean(document.querySelector('#view-' + t + ' .quick-pair-card'));
        }
        document.getElementById('rail-conn-btn')?.click();
        await new Promise((r) => setTimeout(r, 30));
        res.connHasCard = Boolean(document.querySelector('#conn-modal .quick-pair-card'));
        res.connScrollW = document.documentElement.scrollWidth;
        document.getElementById('conn-modal-close')?.click();
        res.sessText = document.getElementById('sessions-full-list')?.textContent || '';
        res.mobConnTxt = document.getElementById('mobile-conn-text')?.textContent || '';
        res.railConnTxt = document.getElementById('rail-conn-title')?.textContent || '';
        res.vw = window.innerWidth;
        return res;
      })()`);
      assert.strictEqual(uLayout.pulseHasCard, true, `Pulse must render .quick-pair-card on ${uVp.label}`);
      assert.strictEqual(uLayout.sessionsHasCard, true, `Sessions must render .quick-pair-card on ${uVp.label}`);
      assert.strictEqual(uLayout.connHasCard, true, `#conn-modal must render .quick-pair-card on ${uVp.label}`);
      assert.ok(uLayout.pulseScrollW <= uLayout.vw + 1, `Unpaired Pulse overflow on ${uVp.label}`);
      assert.ok(uLayout.sessionsScrollW <= uLayout.vw + 1, `Unpaired Sessions overflow on ${uVp.label}`);
      assert.ok(uLayout.connScrollW <= uLayout.vw + 1, `Unpaired #conn-modal overflow on ${uVp.label}`);
      assert.strictEqual(
        uLayout.sessText.includes('Syncing live sessions from VS Code'),
        false,
        'Unpaired Sessions view must NEVER show misleading "Syncing live sessions from VS Code…" empty state'
      );
      assert.strictEqual(uLayout.mobConnTxt, 'Pair Device', 'Unpaired mobile pill must read "Pair Device"');
      assert.strictEqual(uLayout.railConnTxt, 'Pair This Device', 'Unpaired rail card must read "Pair This Device"');
    }

    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
      sessionId
    );
    const pairFlowRes = await evalJs(`(async () => {
      document.querySelector('[data-tab="sessions"]')?.click();
      await new Promise((r) => setTimeout(r, 30));
      const codeInput = document.querySelector('#view-sessions [data-pair-code-input]');
      codeInput.focus();
      codeInput.value = '482';
      codeInput.dispatchEvent(new Event('input', { bubbles: true }));
      // Trigger re-renders while focused — input focus & partial digits must survive (PWA.md §3.9)
      document.querySelector('[data-status-filter="all"]')?.click();
      await new Promise((r) => setTimeout(r, 30));
      const focusSurvived = document.activeElement === codeInput && codeInput.value === '482';

      // Mock fetch locally inside page (zero external network traffic) to test 6-digit claim negative & concurrency locks
      const origFetch = window.fetch;
      let claimCalls = 0;
      let releaseSlowClaim = null;
      const samplePayload = {
        v: 1,
        u: 'https://relay.example.invalid/api',
        k: 'mock-cloud-key',
        e: 'b'.repeat(64),
        r: 'wss://edge.example.invalid/ws',
        p: 4318
      };
      const validBundle = btoa(JSON.stringify(samplePayload))
        .replace(/\\+/g, '-')
        .replace(/\\//g, '_')
        .replace(/=+$/, '');

      window.__THEO_ALLOW_PAIR_MOCK_FETCH = true;
      window.fetch = async (url, init) => {
        if (String(url).endsWith('/pair/claim')) {
          claimCalls += 1;
          const body = JSON.parse(init?.body || '{}');
          if (body.code === '000000') {
            return new Response(JSON.stringify({ ok: false, error: 'Invalid or expired 6-digit code' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          if (body.code === '482917') {
            await new Promise((resolve) => { releaseSlowClaim = resolve; });
            return new Response(JSON.stringify({ ok: true, bundle: validBundle }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        }
        return new Response('{}', { status: 200 });
      };

      let result;
      try {
        const submitBtn = document.querySelector('#view-sessions [data-pair-code-submit]');
        // 1) Short 3-digit code ('482') must be rejected client-side with 0 network calls
        submitBtn.click();
        await new Promise((r) => setTimeout(r, 30));
        const callsAfterShort = claimCalls;

        // 2) Wrong 6-digit code ('000000') must reject cleanly & leave credentials empty
        codeInput.value = '000-000';
        submitBtn.click();
        await new Promise((r) => setTimeout(r, 50));
        const callsAfterWrong = claimCalls;
        const prefsAfterWrong = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');

        // 3) Double-click valid code ('482-917') while in-flight -> pairClaimInFlight lock allows only 1 request
        codeInput.value = '482-917';
        submitBtn.click();
        submitBtn.click();
        await new Promise((r) => setTimeout(r, 30));
        const callsDuringDoubleClick = claimCalls;
        if (releaseSlowClaim) releaseSlowClaim();
        await new Promise((r) => setTimeout(r, 60));
        const prefsAfterValid = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');
        const cardGoneAfterPair = !document.querySelector('#view-sessions .quick-pair-card');

        // 4) Reset prefs & test live hashchange #pair= ingestion + URL hash scrubbing + multi-line paste
        localStorage.setItem('theo_remote_prefs_v1', JSON.stringify({ theme: 'light', themeUserSet: true, activeTab: 'sessions' }));
        const hashPayload = { ...samplePayload, e: 'c'.repeat(64) };
        const hashBundle = btoa(JSON.stringify(hashPayload))
          .replace(/\\+/g, '-')
          .replace(/\\//g, '_')
          .replace(/=+$/, '');
        location.hash = '#pair=' + hashBundle;
        await new Promise((r) => setTimeout(r, 60));
        const hashScrubbed = location.hash === '';
        const prefsAfterHash = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');

        // 5) Multi-line mobile-pair-url.txt paste via manual link box
        const multiPayload = { ...samplePayload, e: 'd'.repeat(64) };
        const multiBundle = btoa(JSON.stringify(multiPayload))
          .replace(/\\+/g, '-')
          .replace(/\\//g, '_')
          .replace(/=+$/, '');
        document.querySelector('[data-tab="analytics"]')?.click();
        await new Promise((r) => setTimeout(r, 40));
        const tokInp = document.getElementById('input-pair-token');
        tokInp.value = '=== Header ===\\nhttps://husseinbdeir.github.io/theo/#pair=' + multiBundle + '\\n$env:FOO=1';
        document.getElementById('btn-apply-pair-token')?.click();
        await new Promise((r) => setTimeout(r, 50));
        const prefsAfterMulti = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');

        result = {
          focusSurvived,
          callsAfterShort,
          callsAfterWrong,
          emptyKeyAfterWrong: !prefsAfterWrong.edgeAccessKey,
          callsDuringDoubleClick,
          keyAfterValid: prefsAfterValid.edgeAccessKey,
          cardGoneAfterPair,
          hashScrubbed,
          keyAfterHash: prefsAfterHash.edgeAccessKey,
          keyAfterMulti: prefsAfterMulti.edgeAccessKey
        };
      } finally {
        window.__THEO_ALLOW_PAIR_MOCK_FETCH = false;
        window.fetch = origFetch;
      }
      return result;
    })()`);

    assert.strictEqual(pairFlowRes.focusSurvived, true, 'Typing 6-digit code must preserve input focus across re-renders');
    assert.strictEqual(pairFlowRes.callsAfterShort, 0, 'Short <6-digit code must not fire /pair/claim');
    assert.strictEqual(pairFlowRes.callsAfterWrong, 1, 'Wrong 6-digit code must hit /pair/claim once');
    assert.strictEqual(pairFlowRes.emptyKeyAfterWrong, true, 'Rejected 6-digit code must not persist credentials');
    assert.strictEqual(pairFlowRes.callsDuringDoubleClick, 2, 'Duplicate click while /pair/claim in-flight must be blocked by pairClaimInFlight');
    assert.strictEqual(pairFlowRes.keyAfterValid, 'b'.repeat(64), 'Valid 6-digit code must persist decoded edgeAccessKey');
    assert.strictEqual(pairFlowRes.cardGoneAfterPair, true, '.quick-pair-card must disappear immediately once paired');
    assert.strictEqual(pairFlowRes.hashScrubbed, true, 'hashchange #pair= must scrub secret fragment via history.replaceState');
    assert.strictEqual(pairFlowRes.keyAfterHash, 'c'.repeat(64), 'hashchange #pair= must apply credentials immediately without reload');
    assert.strictEqual(pairFlowRes.keyAfterMulti, 'd'.repeat(64), 'Multi-line mobile-pair-url.txt paste must decode cleanly');
    console.log('[PASS] Adversarial #5: Unpaired onboarding, focus guard, 6-digit single-flight/401, hashchange #pair=, & multi-line paste');

    // Adversarial Check #6: Red-Team C-1 (partial #pair= exfil block), H-1 (unauthed /api/ping), & H-2 (PIN-locked #pair= deferral)
    await evalJs(`(() => {
      localStorage.setItem('theo_remote_prefs_v1', JSON.stringify({
        theme: 'light',
        themeUserSet: true,
        activeTab: 'sessions',
        cloudUrl: 'https://legit.example.invalid/relay',
        cloudKey: 'legit-cloud-secret',
        edgeAccessKey: 'e'.repeat(64)
      }));
    })()`);
    await cdp.send('Page.navigate', { url: `${baseUrl}/?nosse=1` }, sessionId);
    await new Promise((r) => setTimeout(r, 400));
    const secCheck = await evalJs(`(async () => {
      // C-1: Inject hostile partial #pair= (u without k, and secret-less u) against live hydrated prefs
      const encodeJson = (o) => btoa(JSON.stringify(o)).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
      location.hash = '#pair=' + encodeJson({ v: 1, u: 'https://evil.example/steal', k: '', e: '' });
      await new Promise((r) => setTimeout(r, 45));
      location.hash = '#pair=' + encodeJson({ v: 1, u: 'https://evil.example/steal', k: '', e: 'f'.repeat(64) });
      await new Promise((r) => setTimeout(r, 45));
      const prefsAfterHostile = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');

      // C-1r: Cloud-only #pair= (k present, e empty, custom r) MUST clear pre-existing edgeAccessKey so old edgeAccessKey is never sent to r
      location.hash = '#pair=' + encodeJson({
        v: 1,
        u: 'https://dummy.example.invalid/x',
        k: 'dummy-cloud-key',
        e: '',
        r: 'wss://evil.example.invalid/ws'
      });
      await new Promise((r) => setTimeout(r, 45));
      const prefsAfterCloudOnlyPair = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');

      // Clear credentials for H-1 test next
      localStorage.setItem('theo_remote_prefs_v1', JSON.stringify({
        theme: 'light',
        themeUserSet: true,
        activeTab: 'sessions'
      }));
      return {
        cloudUrlIntact: prefsAfterHostile.cloudUrl === 'https://legit.example.invalid/relay',
        edgeKeyNotOverwrittenByPartial: prefsAfterHostile.edgeAccessKey === 'e'.repeat(64),
        edgeKeyClearedOnCloudOnlyPair: prefsAfterCloudOnlyPair.edgeAccessKey === ''
      };
    })()`);
    assert.strictEqual(secCheck.cloudUrlIntact, true, 'Hostile partial #pair= must NOT overwrite stored cloudUrl (C-1)');
    assert.strictEqual(
      secCheck.edgeKeyNotOverwrittenByPartial,
      true,
      'Hostile partial #pair= with cloudUrl+no cloudKey must be rejected atomically (C-1)'
    );
    assert.strictEqual(
      secCheck.edgeKeyClearedOnCloudOnlyPair,
      true,
      'Cloud-only #pair= with empty edgeAccessKey MUST clear prior edgeAccessKey so it cannot leak to new edgeRelayUrl (C-1r)'
    );

    // Reload unpaired & test H-1 (unauthenticated /api/ping must not suppress .quick-pair-card)
    await cdp.send('Page.navigate', { url: `${baseUrl}/?nosse=1` }, sessionId);
    await new Promise((r) => setTimeout(r, 400));
    const h1Check = await evalJs(`(async () => {
      const origFetch = window.fetch;
      let pingHitCount = 0;
      window.__THEO_ALLOW_PROBE_MOCK_FETCH = true;
      window.fetch = async (url) => {
        if (String(url).endsWith('/api/ping')) {
          pingHitCount += 1;
          return new Response(JSON.stringify({
            ok: true,
            authenticated: false,
            authRequired: true,
            service: 'THEO Remote Bridge'
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('{}', { status: 401 });
      };
      try {
        document.querySelector('[data-tab="sessions"]')?.click();
        document.getElementById('mobile-sync-btn')?.click();
        await new Promise((r) => setTimeout(r, 90));
        return {
          pingHitCount,
          cardStillVisible: Boolean(document.querySelector('#view-sessions .quick-pair-card')),
          mobPill: document.getElementById('mobile-conn-text')?.textContent || ''
        };
      } finally {
        window.__THEO_ALLOW_PROBE_MOCK_FETCH = false;
        window.fetch = origFetch;
      }
    })()`);
    assert.ok(h1Check.pingHitCount >= 1, 'probeLocalBridge must hit mocked /api/ping');
    assert.strictEqual(h1Check.cardStillVisible, true, 'Unauthenticated /api/ping must NOT hide .quick-pair-card (H-1)');
    assert.strictEqual(h1Check.mobPill, 'Pair Device', 'Unauthenticated /api/ping must keep Pair Device pill (H-1)');

    // H-2: Boot with PIN lock active AND #pair= fragment -> URL hash scrubbed immediately, credentials deferred until PIN unlock
    const pinPairBundle = Buffer.from(
      JSON.stringify({
        v: 1,
        u: 'https://relay.example.invalid/api',
        k: 'pin-unlocked-cloud-key',
        e: '9'.repeat(64),
        r: 'wss://edge.example.invalid/ws',
        p: 4318
      }),
      'utf8'
    )
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    await evalJs(`(() => {
      localStorage.removeItem('theo_remote_pin_hash_v1');
      localStorage.setItem('theo_remote_pin_v1', '2468');
      localStorage.setItem('theo_remote_prefs_v1', JSON.stringify({
        theme: 'light',
        themeUserSet: true,
        activeTab: 'sessions'
      }));
    })()`);
    await cdp.send('Page.navigate', { url: `${baseUrl}/?nosse=1&pinboot=1#pair=${pinPairBundle}` }, sessionId);
    await new Promise((r) => setTimeout(r, 450));
    const h2Check = await evalJs(`(async () => {
      const hashWhileLocked = location.hash;
      const overlayLocked = !document.getElementById('pin-overlay')?.hidden;
      const prefsWhileLocked = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');
      for (const d of ['2', '4', '6', '8']) {
        document.querySelector('#pin-pad button[data-digit="' + d + '"]')?.click();
      }
      await new Promise((r) => setTimeout(r, 90));
      const prefsAfterUnlock = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');
      return {
        hashWhileLocked,
        overlayLocked,
        emptyWhileLocked: !prefsWhileLocked.edgeAccessKey && !prefsWhileLocked.cloudKey,
        keyAfterUnlock: prefsAfterUnlock.edgeAccessKey,
        cloudKeyAfterUnlock: prefsAfterUnlock.cloudKey
      };
    })()`);
    assert.strictEqual(h2Check.overlayLocked, true, 'PIN overlay must be locked on boot');
    assert.strictEqual(h2Check.hashWhileLocked, '', '#pair= hash must be scrubbed from address bar even while PIN-locked (H-2)');
    assert.strictEqual(h2Check.emptyWhileLocked, true, '#pair= credentials must NOT write to localStorage before PIN unlock (H-2)');
    assert.strictEqual(h2Check.keyAfterUnlock, '9'.repeat(64), 'Deferred #pair= edgeAccessKey must apply immediately on PIN unlock (H-2)');
    assert.strictEqual(h2Check.cloudKeyAfterUnlock, 'pin-unlocked-cloud-key', 'Deferred #pair= cloudKey must apply on PIN unlock (H-2)');
    console.log('[PASS] Adversarial #6: C-1 partial #pair= block, H-1 unauthed /api/ping guard, & H-2 PIN-locked #pair= deferral');

    // Final error & network quarantine assertions (#18)
    assert.strictEqual(pageExceptions.length, 0, `Uncaught page exceptions: ${JSON.stringify(pageExceptions)}`);
    assert.strictEqual(consoleErrors.length, 0, `Console errors: ${JSON.stringify(consoleErrors)}`);
    assert.strictEqual(
      leakedExternalUrls.length,
      0,
      `Headless quarantine violation — outbound requests leaked: ${JSON.stringify(leakedExternalUrls)}`
    );
    console.log('[PASS] Adversarial #4: 0 console errors, 0 uncaught exceptions, 0 outbound Cloud/Edge requests');
    console.log('ALL_THEO_PWA_CDP_CHECKS_PASSED');
  } finally {
    if (cdp) cdp.close();
    try {
      edgeProc.kill();
    } catch {}
    await new Promise((r) => srv.close(r));
    setTimeout(() => {
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true });
      } catch {}
    }, 400);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
