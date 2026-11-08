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
        if (u.pathname === '/api/ping') {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ ok: true, service: 'theo-mock-local', authRequired: false }));
          return;
        }
        if (u.pathname === '/api/file-preview') {
          const reqPath = String(u.searchParams.get('path') || '').trim();
          if (!reqPath || reqPath.includes('..') || /\.(env|dev\.vars|sqlite)/i.test(reqPath)) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Blocked sensitive or outside-workspace path' }));
            return;
          }
          const isSlow = /slow\d*\.js/i.test(reqPath);
          const delayMs = isSlow ? 130 : 8;
          const lines = Array.from({ length: 30 }, (_, i) => `const line_${i + 1} = "${reqPath.replace(/"/g, '')}:${i + 1}";`);
          setTimeout(() => {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            res.end(
              JSON.stringify({
                ok: true,
                workspaceId: 'theo',
                workspaceName: 'theo',
                relPath: reqPath.replace(/^.*bhfirms[\\/]+theo[\\/]+/i, '').replace(/\\/g, '/'),
                lineCount: lines.length,
                truncated: false,
                content: lines.join('\n'),
                gitDiff: `@@ -10,2 +10,2 @@\n-const oldVal = false;\n+const newVal = true;`
              })
            );
          }, delayMs);
          return;
        }
        if (u.pathname === '/api/studio-capabilities') {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(
            JSON.stringify({
              ok: true,
              workspace: {
                id: 'theo',
                name: 'THEO Remote PWA',
                branch: 'main',
                dirtyCount: 2,
                modifiedFiles: [
                  { status: 'M', path: 'js/app.js' },
                  { status: 'M', path: 'css/theo.css' }
                ],
                recentCommits: [
                  { hash: '15493cd', subject: 'Ship v60 Studio Lenses', relativeTime: '2m ago', author: 'THEO' }
                ]
              },
              checks: [
                { id: 'git:status', label: 'Git Status & Branch', category: 'git', commandPreview: 'git status --short --branch' },
                { id: 'syntax:js/app.js', label: 'Syntax Check · js/app.js', category: 'lint', commandPreview: 'node --check js/app.js' }
              ],
              skills: [
                { id: 'red-team-gate', name: 'red-team-gate', description: 'Dynamic Pre-Handoff 7-Axis Red-Team Auditor', scope: 'user' },
                { id: 'generative_ui', name: 'generative_ui', description: 'Interactive HTML widgets & data visualizations', scope: 'builtin' }
              ],
              ports: [
                { port: 4318, label: 'THEO Workstation Bridge', url: 'http://127.0.0.1:4318/' }
              ]
            })
          );
          return;
        }
        if (u.pathname === '/api/studio-check' && req.method === 'POST') {
          let bodyRaw = '';
          req.on('data', (c) => {
            bodyRaw += c;
          });
          req.on('end', () => {
            let parsed = {};
            try {
              parsed = JSON.parse(bodyRaw || '{}');
            } catch {}
            const chkId = String(parsed.checkId || '');
            const allowed = ['git:status', 'syntax:js/app.js'];
            if (!allowed.includes(chkId)) {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, status: 403, error: 'Check ID is not in workspace allowlist' }));
              return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            res.end(
              JSON.stringify({
                ok: true,
                passed: true,
                exitCode: 0,
                checkId: chkId,
                durationMs: 14,
                output: 'js/app.js:12:4: Verified syntax & diagnostic jump anchor',
                diagnostics: [
                  {
                    file: 'app.js',
                    relPath: 'js/app.js',
                    line: 12,
                    col: 4,
                    severity: 'warning',
                    message: 'Diagnostic anchor at line 12'
                  }
                ]
              })
            );
          });
          return;
        }
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
        },
        {
          id: 'isabi-app',
          name: 'isabi-app',
          path: 'C:\\Users\\HusseinBdeir\\bhfirms\\isabi-app',
          branch: 'main',
          dirtyCount: 1,
          ahead: 0,
          behind: 0,
          deviceId: 'main-workstation',
          deviceName: 'Main Workstation'
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
                name: 'read_file',
                badge: 'Viewed',
                file: 'ISABICommand.md#L1-119',
                summary: 'Read ISABICommand.md lines 1-119'
              },
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
    ['index.html icon.svg', indexSrc, /icon\.svg\?v=(\d+)/g],
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
            const inlineExp = document.getElementById('btn-expand-sidebar-inline');
            const inlineExpandDisplay = inlineExp ? getComputedStyle(inlineExp).display : 'none';
            return { docScrollW, vw, titleEls, xssGlobal, jsLinks, inlineHandlers, chatContainerOverflow, chatStreamH, inlineExpandDisplay };
          })()`);

          assert.ok(
            probe.docScrollW <= probe.vw + 1,
            `Horizontal overflow on ${vp.label} ${theme} ${tab}: scrollW=${probe.docScrollW} > vw=${probe.vw}`
          );
          assert.strictEqual(probe.titleEls, 0, `Found [title] attribute on ${vp.label} ${theme} ${tab}`);
          assert.strictEqual(probe.xssGlobal, null, `XSS executed on ${vp.label} ${theme} ${tab}`);
          assert.strictEqual(probe.jsLinks, 0, `javascript: href rendered on ${vp.label} ${theme} ${tab}`);
          assert.strictEqual(probe.inlineHandlers, 0, `Inline event handler rendered on ${vp.label} ${theme} ${tab}`);
          if (vp.w <= 1024 && tab === 'chat') {
            assert.strictEqual(
              probe.inlineExpandDisplay,
              'none',
              `#btn-expand-sidebar-inline must be hidden on <=1024px (${vp.label}), got ${probe.inlineExpandDisplay}`
            );
          }

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

    // Adversarial Check #7: v57->v58 Carbon Dark upgrade continuity, malformed openEditorTabs sanitization, XSS session title in tabs/sidebar, tab-close neighbor fallback, & PIN-locked Ctrl+B guard
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false },
      sessionId
    );
    const v58Seed = buildSeedCachePayload();
    v58Seed.state.rows.push({
      id: 'sess-xss',
      title: 'Hostile <img src=x onerror="window.__XSS=77"> Tab',
      provider: 'antigravity',
      model: 'Gemini 4 Argon (High)',
      folder: 'theo',
      status: 'completed',
      open: true,
      at: Date.now() - 120000
    });
    await evalJs(`(() => {
      localStorage.removeItem('theo_remote_pin_hash_v1');
      localStorage.removeItem('theo_remote_pin_v1');
      localStorage.setItem('theo_remote_cache_v3', ${JSON.stringify(JSON.stringify(v58Seed))});
      localStorage.setItem('theo_remote_prefs_v1', JSON.stringify({
        theme: 'light',
        themeUserSet: false,
        activeTab: 'chat',
        selectedThreadId: 'sess-alpha',
        composerMode: 'reply',
        openEditorTabs: [null, '', 42, '__new__', 'sess-alpha', 'sess-beta', 'sess-xss', 'sess-alpha'],
        freqUsage: {
          devices: { 'theo-laptop': 5 },
          repos: { 'isabi-app': 25, 'theo': 2 },
          threads: { 'sess-beta': 12, 'sess-alpha': 4 },
          commands: { '/sync': 19 }
        }
      }));
    })()`);
    await cdp.send('Page.navigate', { url: `${baseUrl}/?nosse=1` }, sessionId);
    await new Promise((r) => setTimeout(r, 450));

    const v58UpgradeProbe = await evalJs(`(async () => {
      const upgradedTheme = document.documentElement.getAttribute('data-theme');
      const prefsBoot = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');
      const tabEls = Array.from(document.querySelectorAll('#ide-editor-tabs [data-editor-tab-id]'));
      const tabIdsBefore = tabEls.map((el) => el.dataset.editorTabId);
      const inlineHandlers = document.querySelectorAll('[onclick],[onerror],[onload]').length;
      const xssVal = window.__XSS || null;

      // Close active tab sess-alpha -> must fall back cleanly to neighbor sess-beta
      document.querySelector('#ide-editor-tabs [data-close-editor-tab="sess-alpha"]')?.click();
      await new Promise((r) => setTimeout(r, 40));
      const prefsAfterClose = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');

      // Ctrl+B toggles sidebar when unlocked
      const collapsedBefore = document.documentElement.classList.contains('sidebar-collapsed');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }));
      await new Promise((r) => setTimeout(r, 30));
      const collapsedAfterToggle = document.documentElement.classList.contains('sidebar-collapsed');
      // Restore expanded sidebar
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }));
      await new Promise((r) => setTimeout(r, 30));

      return {
        upgradedTheme,
        openTabsBoot: prefsBoot.openEditorTabs,
        tabIdsBefore,
        inlineHandlers,
        xssVal,
        selectedAfterClose: prefsAfterClose.selectedThreadId,
        collapsedBefore,
        collapsedAfterToggle
      };
    })()`);

    assert.strictEqual(v58UpgradeProbe.upgradedTheme, 'dark', 'v57->v58 upgrade with themeUserSet:false must default to Carbon Dark');
    assert.strictEqual(v58UpgradeProbe.xssVal, null, 'Hostile session title in editor tabs / sidebar must never execute XSS');
    assert.strictEqual(v58UpgradeProbe.inlineHandlers, 0, 'Zero inline handlers allowed in tabs or sidebar');
    assert.strictEqual(
      v58UpgradeProbe.openTabsBoot.some((x) => !x || typeof x !== 'string' || x === '__new__'),
      false,
      `Malformed openEditorTabs entries must be sanitized on boot: ${JSON.stringify(v58UpgradeProbe.openTabsBoot)}`
    );
    assert.strictEqual(v58UpgradeProbe.selectedAfterClose, 'sess-beta', 'Closing active editor tab must switch to adjacent open tab');
    assert.strictEqual(v58UpgradeProbe.collapsedBefore, false, 'Sidebar should start expanded on desktop');
    assert.strictEqual(v58UpgradeProbe.collapsedAfterToggle, true, 'Ctrl+B must collapse sidebar when unlocked');

    // Verify Ctrl+B is strictly blocked when PIN-locked
    await evalJs(`localStorage.setItem('theo_remote_pin_v1', '2468')`);
    await cdp.send('Page.navigate', { url: `${baseUrl}/?nosse=1` }, sessionId);
    await new Promise((r) => setTimeout(r, 400));
    const pinCtrlBProbe = await evalJs(`(async () => {
      const before = document.documentElement.classList.contains('sidebar-collapsed');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }));
      await new Promise((r) => setTimeout(r, 30));
      const after = document.documentElement.classList.contains('sidebar-collapsed');
      for (const d of ['2', '4', '6', '8']) {
        document.querySelector('#pin-pad button[data-digit="' + d + '"]')?.click();
      }
      await new Promise((r) => setTimeout(r, 80));
      localStorage.removeItem('theo_remote_pin_hash_v1');
      return { before, after };
    })()`);
    assert.strictEqual(pinCtrlBProbe.before, pinCtrlBProbe.after, 'Ctrl+B must NOT toggle sidebar while PIN-locked');
    console.log('[PASS] Adversarial #7: v57->v58 Carbon upgrade, openEditorTabs sanitization, XSS title neutralization, tab close fallback, & PIN Ctrl+B guard');

    // Adversarial Check #8: Composer @mention & /slash autocomplete, Frequency-First order (Rule 11), Escape dismiss, & local /theme action
    const slashMentionProbe = await evalJs(`(async () => {
      // Re-open sess-alpha in editor workbench
      document.querySelector('#ide-sidebar-tree [data-ide-open-session="sess-alpha"]')?.click();
      await new Promise((r) => setTimeout(r, 40));
      const inp = document.getElementById('composer-input');
      const pop = document.getElementById('composer-slash-popover');

      // 1) Type '@' -> @isabi-app (freq=25) MUST rank above @theo (freq=2) despite theo being first in state.workspaces
      inp.focus();
      inp.value = '@';
      inp.setSelectionRange(1, 1);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 30));
      const mentionOpen = !pop.hidden;
      const mentionLabels = Array.from(pop.querySelectorAll('.slash-pop-lbl')).map((el) => el.textContent.trim());

      // Press Enter to select top @isabi-app -> must attach pill WITHOUT submitting empty prompt
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 40));
      const pillTexts = Array.from(document.querySelectorAll('#composer-attachments .composer-attach-name')).map((el) => el.textContent.trim());

      // Clear attachment pill
      document.querySelector('#composer-attachments [data-remove-attach]')?.click();
      await new Promise((r) => setTimeout(r, 20));

      // 2) Type '/' -> /sync (freq=19) MUST rank first via rankByFreq, and Escape must dismiss cleanly
      inp.value = '/';
      inp.setSelectionRange(1, 1);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 30));
      const slashLabels = Array.from(pop.querySelectorAll('.slash-pop-lbl')).map((el) => el.textContent.trim());
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 20));
      const closedOnEsc = pop.hidden === true;

      // 2b) Clicking '/' button on a non-empty draft ("fix layout") must prepend '/ ' and open slash menu
      inp.value = 'fix layout';
      document.getElementById('btn-composer-slash')?.click();
      await new Promise((r) => setTimeout(r, 30));
      const slashBtnOnDraftOpen = !pop.hidden && pop.querySelectorAll('.slash-pop-item').length >= 5;
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      inp.value = '';

      // 2c) Typing '@ISABICommand' must offer '@ISABICommand.md' WITHOUT '#L1-119' fragment
      inp.value = '@isabicommand';
      inp.setSelectionRange(inp.value.length, inp.value.length);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 30));
      const fileMentionLabels = Array.from(pop.querySelectorAll('.slash-pop-lbl')).map((el) => el.textContent.trim());
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      inp.value = '';

      // 3) Submit standalone '/theme' -> executes local theme switch without creating user chat turn
      const themeBefore = document.documentElement.getAttribute('data-theme');
      const turnsBefore = document.querySelectorAll('#chat-stream .turn-bubble.user').length;
      inp.value = '/theme';
      document.getElementById('chat-composer-form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 40));
      const themeAfter = document.documentElement.getAttribute('data-theme');
      const turnsAfter = document.querySelectorAll('#chat-stream .turn-bubble.user').length;
      // Switch back to dark
      inp.value = '/theme';
      document.getElementById('chat-composer-form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 30));

      return {
        mentionOpen,
        mentionLabels,
        pillTexts,
        slashLabels,
        closedOnEsc,
        slashBtnOnDraftOpen,
        fileMentionLabels,
        themeToggled: themeBefore !== themeAfter,
        turnsUnchanged: turnsBefore === turnsAfter
      };
    })()`);

    assert.strictEqual(slashMentionProbe.mentionOpen, true, 'Typing @ in composer must open #composer-slash-popover');
    assert.strictEqual(
      slashMentionProbe.mentionLabels[0],
      '@isabi-app',
      `Frequency-first violation in @mention popover: expected @isabi-app (freq=25) first, got ${JSON.stringify(slashMentionProbe.mentionLabels)}`
    );
    assert.ok(
      slashMentionProbe.pillTexts.some((t) => t.includes('isabi-app')),
      `Enter on @mention item must attach workspace pill without submitting form: got ${JSON.stringify(slashMentionProbe.pillTexts)}`
    );
    assert.strictEqual(
      slashMentionProbe.slashLabels[0],
      '/sync',
      `Frequency-first violation in /slash popover: expected /sync (freq=19) first, got ${JSON.stringify(slashMentionProbe.slashLabels)}`
    );
    assert.strictEqual(slashMentionProbe.closedOnEsc, true, 'Escape must dismiss #composer-slash-popover');
    assert.strictEqual(slashMentionProbe.slashBtnOnDraftOpen, true, 'Clicking / button on non-empty draft must open slash command menu');
    assert.ok(
      slashMentionProbe.fileMentionLabels.includes('@ISABICommand.md') &&
        !slashMentionProbe.fileMentionLabels.some((l) => l.includes('#')),
      `Touched file @mention must strip #L fragments: got ${JSON.stringify(slashMentionProbe.fileMentionLabels)}`
    );
    assert.strictEqual(slashMentionProbe.themeToggled, true, 'Standalone /theme must toggle theme locally');
    assert.strictEqual(slashMentionProbe.turnsUnchanged, true, 'Standalone local /theme action must NOT append literal "/theme" user bubble');
    console.log('[PASS] Adversarial #8: @mention & /slash autocomplete, Frequency-First order, non-empty / trigger, #L strip, & local /theme interception');

    // Adversarial Check #9: Desktop Split-Workbench Geometry, Re-Render <details> Persistence, Tab/Nested Keydown Guards & Inline Expand Button
    const workbenchProbe = await evalJs(`(async () => {
      const actBar = document.querySelector('.ide-activity-bar')?.getBoundingClientRect();
      const sideBar = document.getElementById('ide-explorer-sidebar')?.getBoundingClientRect();
      const tabsBar = document.getElementById('ide-editor-tabs-bar')?.getBoundingClientRect();
      const stream = document.getElementById('chat-stream')?.getBoundingClientRect();
      const vc = document.querySelector('.view-container.chat-active');

      // Inline expand sidebar button MUST be display:none when sidebar is open, and inline-flex when collapsed on desktop
      const inlineExpandBtn = document.getElementById('btn-expand-sidebar-inline');
      const expandBtnDisplayWhenOpen = inlineExpandBtn ? getComputedStyle(inlineExpandBtn).display : 'missing';
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }));
      await new Promise((r) => setTimeout(r, 25));
      const expandBtnDisplayWhenCollapsed = inlineExpandBtn ? getComputedStyle(inlineExpandBtn).display : 'missing';
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }));
      await new Promise((r) => setTimeout(r, 25));

      const expandBtn = document.querySelector('#chat-stream [data-toggle-all-steps]');
      expandBtn?.click();
      await new Promise((r) => setTimeout(r, 30));
      let allSteps = Array.from(document.querySelectorAll('#chat-stream details.code-step-card'));
      const allExpanded = allSteps.length >= 2 && allSteps.every((d) => d.open === true);
      const hasDetailBox = Boolean(document.querySelector('#chat-stream .code-step-detail-box'));

      // Force a full renderChatView() overwrite via #btn-bg-tasks toggle -> expanded <details.code-step-card> MUST remain open!
      document.getElementById('btn-bg-tasks')?.click();
      await new Promise((r) => setTimeout(r, 30));
      document.getElementById('btn-close-bgtasks')?.click();
      await new Promise((r) => setTimeout(r, 20));
      allSteps = Array.from(document.querySelectorAll('#chat-stream details.code-step-card'));
      const survivedReRender = allSteps.length >= 2 && allSteps.every((d) => d.open === true);

      // Click @ Mention button inside expanded tool step
      document.querySelector('#chat-stream [data-step-mention-file]')?.click();
      await new Promise((r) => setTimeout(r, 30));
      const stepAttached = document.querySelectorAll('#composer-attachments .composer-attach-pill').length >= 1;

      // Collapse all steps again
      document.querySelector('#chat-stream [data-toggle-all-steps]')?.click();
      await new Promise((r) => setTimeout(r, 30));
      allSteps = Array.from(document.querySelectorAll('#chat-stream details.code-step-card'));
      const allCollapsed = allSteps.every((d) => d.open === false);

      // Keyboard Enter on role="tab" editor tab activates sess-beta, while Enter on nested .ide-row-act does NOT hijack to open sess-xss
      const betaTab = document.querySelector('#ide-editor-tabs [data-editor-tab-id="sess-beta"]');
      betaTab?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 35));
      const selectedAfterTabEnter = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}').selectedThreadId;

      const xssArchiveBtn = document.querySelector('#ide-sidebar-tree [data-ide-open-session="sess-xss"] .ide-row-act[data-sess-act="archive"]');
      let defaultPreventedOnNestedBtn = true;
      if (xssArchiveBtn) {
        const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        xssArchiveBtn.dispatchEvent(ev);
        defaultPreventedOnNestedBtn = ev.defaultPrevented;
      }
      const selectedAfterNestedKeydown = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}').selectedThreadId;

      // Open + AGY draft tab and close '__new__' -> must return cleanly to sess-beta without resurrecting closed/archived tabs
      document.getElementById('rail-new-agy')?.click();
      await new Promise((r) => setTimeout(r, 30));
      document.querySelector('#ide-editor-tabs [data-close-editor-tab="__new__"]')?.click();
      await new Promise((r) => setTimeout(r, 35));
      const selectedAfterCloseNew = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}').selectedThreadId;

      return {
        actW: Math.round(actBar?.width || 0),
        sideW: Math.round(sideBar?.width || 0),
        tabsH: Math.round(tabsBar?.height || 0),
        streamH: Math.round(stream?.height || 0),
        vcOverflow: Math.max(0, (vc?.scrollHeight || 0) - (vc?.clientHeight || 0)),
        expandBtnDisplayWhenOpen,
        expandBtnDisplayWhenCollapsed,
        allExpanded,
        survivedReRender,
        hasDetailBox,
        stepAttached,
        allCollapsed,
        selectedAfterTabEnter,
        defaultPreventedOnNestedBtn,
        selectedAfterNestedKeydown,
        selectedAfterCloseNew
      };
    })()`);

    assert.strictEqual(workbenchProbe.actW, 48, `Expected 48px VS Code Activity Bar, got ${workbenchProbe.actW}px`);
    assert.ok(workbenchProbe.sideW >= 260, `Expected visible Explorer Sidebar (>=260px), got ${workbenchProbe.sideW}px`);
    assert.ok(workbenchProbe.tabsH >= 32, `Expected visible Editor Tabs Bar (>=32px), got ${workbenchProbe.tabsH}px`);
    assert.ok(workbenchProbe.streamH >= 400, `Expected spacious Editor Stream (>=400px), got ${workbenchProbe.streamH}px`);
    assert.ok(workbenchProbe.vcOverflow <= 1, `Expected 0px desktop chat overflow, got ${workbenchProbe.vcOverflow}px`);
    assert.strictEqual(workbenchProbe.expandBtnDisplayWhenOpen, 'none', '#btn-expand-sidebar-inline must be display:none when sidebar is expanded');
    assert.ok(
      workbenchProbe.expandBtnDisplayWhenCollapsed === 'flex' || workbenchProbe.expandBtnDisplayWhenCollapsed === 'inline-flex',
      `#btn-expand-sidebar-inline must be flex/inline-flex when sidebar is collapsed on desktop, got ${workbenchProbe.expandBtnDisplayWhenCollapsed}`
    );
    assert.strictEqual(workbenchProbe.allExpanded, true, 'Expand all button must open every interactive tool step');
    assert.strictEqual(workbenchProbe.survivedReRender, true, 'Expanded <details.code-step-card> must stay open across renderChatView() re-renders');
    assert.strictEqual(workbenchProbe.hasDetailBox, true, 'Expanded tool step must render .code-step-detail-box');
    assert.strictEqual(workbenchProbe.stepAttached, true, '@ Mention inside tool step must attach file pill to composer');
    assert.strictEqual(workbenchProbe.allCollapsed, true, 'Clicking Collapse all must close every tool step');
    assert.strictEqual(workbenchProbe.selectedAfterTabEnter, 'sess-beta', 'Pressing Enter on [role="tab"] editor tab must activate that session');
    assert.strictEqual(workbenchProbe.defaultPreventedOnNestedBtn, false, 'Pressing Enter on nested .ide-row-act button must NOT be hijacked by outer .ide-tree-row');
    assert.strictEqual(workbenchProbe.selectedAfterNestedKeydown, 'sess-beta', 'Nested action keydown must not open outer session row');
    assert.strictEqual(workbenchProbe.selectedAfterCloseNew, 'sess-beta', 'Closing __new__ draft tab must return cleanly to last reply tab');
    console.log('[PASS] Adversarial #9: Desktop split-workbench geometry, <details> re-render persistence, keyboard tab/action guards & draft-tab close verified');

    // -------------------------------------------------------------------------
    // Adversarial Check #10: v59 Studio Depth — 4-Palette Switcher, Sidebar
    // Questions & Side Agents, Compacted Thinking/Checkpoints, Docked Question
    // Stepper, Split Inspector (Code/Diff/Agents/Outline), Race & PIN Guards
    // -------------------------------------------------------------------------
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
      sessionId
    );
    const v59DesktopProbe = await evalJs(`(async () => {
      // Point customBridgeUrl to local test server so fetchSafeFilePreview exercises live HTTP /api/file-preview without external network
      const prefsRaw = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');
      prefsRaw.customBridgeUrl = location.origin;
      localStorage.setItem('theo_remote_prefs_v1', JSON.stringify(prefsRaw));

      // 1. Test 4-Palette Switcher + Negative Test #1 (invalid/hostile palette fallback)
      document.getElementById('btn-palette-picker')?.click();
      await new Promise((r) => setTimeout(r, 25));
      const popOpen = document.getElementById('theme-palette-popover')?.hidden === false;

      document.querySelector('[data-set-palette="velvet"]')?.click();
      await new Promise((r) => setTimeout(r, 20));
      const palVelvet = document.documentElement.dataset.palette;
      const themeVelvet = document.documentElement.dataset.theme;

      document.getElementById('btn-palette-picker')?.click();
      document.querySelector('[data-set-palette="daylight"]')?.click();
      await new Promise((r) => setTimeout(r, 20));
      const palDaylight = document.documentElement.dataset.palette;
      const themeDaylight = document.documentElement.dataset.theme;

      // Negative #1: Inject hostile palette button and click it -> must reject unknown palette without mutating state or triggering XSS
      const bogusBtn = document.createElement('button');
      bogusBtn.setAttribute('data-set-palette', '<img src=x onerror="window.__XSS=90">');
      document.body.appendChild(bogusBtn);
      bogusBtn.click();
      bogusBtn.remove();
      await new Promise((r) => setTimeout(r, 20));
      const palAfterHostile = document.documentElement.dataset.palette;

      // Switch to default VS Code Graphite palette
      document.getElementById('btn-palette-picker')?.click();
      document.querySelector('[data-set-palette="graphite"]')?.click();
      await new Promise((r) => setTimeout(r, 20));
      const palGraphite = document.documentElement.dataset.palette;
      const themeGraphite = document.documentElement.dataset.theme;
      const metaThemeGraphite = document.getElementById('meta-theme-color')?.getAttribute('content');

      // 2. Seed rich v59 session with multi-step thoughtBlocks, /compact checkpoint, invoke_subagent, file chips, and multi-question approval
      const cache = JSON.parse(localStorage.getItem('theo_remote_cache_v3') || '{}');
      const now = Date.now();
      cache.state.rows.unshift({
        id: 'sess-v59',
        title: 'Studio v59 Deep Upgrade',
        provider: 'antigravity',
        model: 'Gemini 3.1 Pro',
        cwd: 'C:\\\\Users\\\\hbdei\\\\bhfirms\\\\theo',
        folder: 'theo',
        branch: 'main',
        status: 'waiting',
        statusLabel: 'Waiting for input',
        dot: 'waiting',
        open: true,
        at: now,
        backgroundTasks: [
          {
            id: 'task-v59-live',
            kind: 'task',
            state: 'running',
            summary: 'Live CDP verification runner',
            startedAt: now - 12000,
            outputPreview: '[PASS] Watching studio layout'
          }
        ]
      });
      cache.state.approvals = [
        {
          id: 'app-v59',
          approvalId: 'app-v59',
          sessionId: 'sess-v59',
          provider: 'antigravity',
          title: 'Architecture Alignment',
          questions: [
            {
              question: 'Which Studio palette should be default? <img src=x onerror="window.__XSS=91">',
              options: ['(Recommended) VS Code Graphite', 'Obsidian Velvet']
            },
            {
              question: 'Enable Split Inspector shortcut?',
              options: ['(Recommended) Yes (Ctrl+I)', 'Manual button only']
            }
          ]
        }
      ];
      cache.threads['sess-v59'] = {
        id: 'sess-v59',
        provider: 'antigravity',
        title: 'Studio v59 Deep Upgrade',
        messages: [
          { id: 'u-1', role: 'user', createdAt: new Date(now - 90000).toISOString(), text: 'Upgrade THEO Studio depth.' },
          { id: 'cp-1', role: 'checkpoint', createdAt: new Date(now - 60000).toISOString(), text: 'Compacted 184k tokens into clean Studio v59 checkpoint.' },
          {
            id: 'a-1',
            role: 'assistant',
            createdAt: new Date(now - 15000).toISOString(),
            thinking: 'Step 1 analysis\\n\\nStep 2 verify layout',
            thinkingDurationSec: 9,
            thoughtBlocks: [
              { text: 'Mapped VS Code Graphite tokens and sand inline code.', durationSec: 4 },
              { text: 'Audited 7 axes <img src=x onerror="window.__XSS=92">', durationSec: 5 }
            ],
            text: 'Updated [app.js#L10-L14](file:///C:/Users/hbdei/bhfirms/theo/js/app.js#L10-L14), [slow.js](file:///C:/Users/hbdei/bhfirms/theo/js/slow.js), [slow2.js](file:///C:/Users/hbdei/bhfirms/theo/js/slow2.js), [.env](file:///C:/Users/hbdei/bhfirms/theo/.env), and \`inlineSymbol\` pill.',
            artifacts: [
              { title: 'Studio v59 Walkthrough', summary: 'Visual and interactive architecture summary.', content: 'All checks green.' }
            ],
            toolCalls: [
              {
                id: 'sub-call-1',
                name: 'invoke_subagent',
                kind: 'subagent',
                subagentRole: 'Red-Team Gate Auditor <img src=x onerror="window.__XSS=93">',
                subagentType: 'red-team-gate',
                subagentPrompt: 'Audit git diff across all 7 Universal Axes.',
                subagentConversationId: 'sess-beta'
              },
              {
                name: 'edit_file',
                kind: 'edit',
                file: 'js/app.js#L10-L14',
                relPath: 'js/app.js',
                lineRange: 'L10-L14',
                addedLines: 18,
                removedLines: 4,
                snippet: '@@ -10,2 +10,2 @@\\n-old\\n+new'
              }
            ]
          }
        ]
      };
      localStorage.setItem('theo_remote_cache_v3', JSON.stringify(cache));
      return {
        popOpen,
        palVelvet,
        themeVelvet,
        palDaylight,
        themeDaylight,
        palAfterHostile,
        palGraphite,
        themeGraphite,
        metaThemeGraphite
      };
    })()`);

    assert.strictEqual(v59DesktopProbe.popOpen, true, 'Palette picker popover must open on #btn-palette-picker click');
    assert.strictEqual(v59DesktopProbe.palVelvet, 'velvet', 'Expected velvet palette');
    assert.strictEqual(v59DesktopProbe.themeVelvet, 'dark', 'Velvet must keep dark base theme');
    assert.strictEqual(v59DesktopProbe.palDaylight, 'daylight', 'Expected daylight palette');
    assert.strictEqual(v59DesktopProbe.themeDaylight, 'light', 'Daylight must switch base theme to light');
    assert.strictEqual(v59DesktopProbe.palAfterHostile, 'daylight', 'Hostile palette string must be rejected by strict allowlist without mutating current palette');
    assert.strictEqual(v59DesktopProbe.palGraphite, 'graphite', 'Clicking graphite preset must apply graphite');
    assert.strictEqual(v59DesktopProbe.themeGraphite, 'dark', 'Graphite must set dark theme');
    assert.strictEqual(v59DesktopProbe.metaThemeGraphite, '#141417', 'Graphite #meta-theme-color must be #141417');

    // Navigate fresh after seeding sess-v59
    await cdp.send('Page.navigate', { url: `${baseUrl}/?nosse=1` }, sessionId);
    await new Promise((r) => setTimeout(r, 650));

    const v59InteractiveProbe = await evalJs(`(async () => {
      // Ensure customBridgeUrl points to local origin for /api/file-preview
      document.querySelector('[data-tab="analytics"]')?.click();
      await new Promise((r) => setTimeout(r, 25));
      const bridgeInp = document.getElementById('input-custom-bridge');
      if (bridgeInp) {
        bridgeInp.value = location.origin;
        document.getElementById('btn-save-bridge')?.click();
        await new Promise((r) => setTimeout(r, 40));
      }

      // Open sess-v59 in Workbench
      document.querySelector('#ide-sidebar-tree [data-ide-open-session="sess-v59"]')?.click();
      await new Promise((r) => setTimeout(r, 45));

      const inlineCodeEl = document.querySelector('#chat-stream .md-inline-code');
      const inlineCodeColor = inlineCodeEl ? getComputedStyle(inlineCodeEl).color : '';

      const secQuestionsVisible = document.getElementById('ide-sec-questions')?.hidden === false;
      const secBgVisible = document.getElementById('ide-sec-bgtasks')?.hidden === false;
      const dockEl = document.getElementById('chat-question-dock');
      const dockVisibleDesktop = Boolean(dockEl && !dockEl.hidden && getComputedStyle(dockEl).display !== 'none');

      // Negative #2: Focus sidebar question write-in input, type text -> mirrors to dock & survives renderIdeSidebar()
      const sbWriteIn = document.querySelector('#ide-sidebar-questions .sb-q-other[data-q-writein-input]');
      let writeInFocusSurvived = false;
      let writeInMirroredToDock = false;
      if (sbWriteIn) {
        sbWriteIn.focus();
        sbWriteIn.value = 'Keep my focus safe';
        sbWriteIn.dispatchEvent(new Event('input', { bubbles: true }));
        const dockWriteIn = document.querySelector('#chat-question-dock [data-q-writein-input][data-q-idx="0"]');
        writeInMirroredToDock = Boolean(dockWriteIn && dockWriteIn.value === 'Keep my focus safe');
        document.querySelector('[data-side-filter="all"]')?.click();
        await new Promise((r) => setTimeout(r, 25));
        writeInFocusSurvived = document.activeElement === sbWriteIn && sbWriteIn.value === 'Keep my focus safe';
        sbWriteIn.value = '';
        sbWriteIn.dispatchEvent(new Event('input', { bubbles: true }));
        sbWriteIn.blur();
      }

      // Compacted Thought, Checkpoint & Side-Agent card assertions
      const thoughtDet = document.querySelector('#chat-stream details.vs-thought-card');
      const thoughtCollapsedDefault = Boolean(thoughtDet && thoughtDet.open === false);
      const thoughtLabel = thoughtDet?.querySelector('.vs-thought-lbl')?.textContent?.trim() || '';
      const thoughtStepsCount = thoughtDet ? thoughtDet.querySelectorAll('.vs-thought-step').length : 0;
      thoughtDet?.querySelector('summary')?.click();
      await new Promise((r) => setTimeout(r, 25));
      // Trigger re-render and verify thought stays open
      document.getElementById('btn-bg-tasks')?.click();
      document.getElementById('btn-close-bgtasks')?.click();
      await new Promise((r) => setTimeout(r, 25));
      const thoughtStayedOpen = Boolean(document.querySelector('#chat-stream details.vs-thought-card')?.open === true);

      const cpDet = document.querySelector('#chat-stream details.vs-checkpoint-divider');
      const cpCollapsedDefault = Boolean(cpDet && cpDet.open === false);
      const subCard = document.querySelector('#chat-stream .vs-subagent-card');
      const hasSubagentCard = Boolean(subCard && subCard.textContent.includes('Red-Team Gate Auditor'));

      // Keyboard '1' quick-select on docked question bar -> syncs sidebar & dock selection, then Submit compacts into .vs-answered-q
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 25));
      const dockOpt1Selected = Boolean(document.querySelector('#chat-question-dock [data-q-opt-toggle][data-opt-idx="0"].selected'));
      const sideOpt1Selected = Boolean(document.querySelector('#ide-sidebar-questions [data-q-opt-toggle][data-opt-idx="0"].selected'));

      // Step to Q2 in dock, then submit
      document.querySelector('#chat-question-dock [data-q-dock-step="1"]')?.click();
      await new Promise((r) => setTimeout(r, 25));
      const dockSteppedToQ2 = Boolean(document.querySelector('#chat-question-dock')?.textContent?.includes('Question 2 of 2'));
      document.querySelector('#chat-question-dock [data-q-submit]')?.click();
      await new Promise((r) => setTimeout(r, 45));
      const dockHiddenAfterSubmit = Boolean(document.getElementById('chat-question-dock')?.hidden === true);
      const answeredCompactedInStream = Boolean(document.querySelector('#chat-stream details.vs-answered-q'));

      // Negative #3a: Out-of-order file preview race cancellation (slow.js 130ms vs js/app.js#L10-L14 8ms)
      const chips = Array.from(document.querySelectorAll('#chat-stream .md-file-chip[data-preview-file]'));
      const slowChip = chips.find((c) => (c.dataset.previewFile || '').includes('slow.js'));
      const slow2Chip = chips.find((c) => (c.dataset.previewFile || '').includes('slow2.js'));
      const envChip = chips.find((c) => (c.dataset.previewFile || '').includes('.env'));
      const fastChip = chips.find((c) => (c.dataset.previewFile || '').includes('app.js'));
      slowChip?.click();
      fastChip?.click();
      await new Promise((r) => setTimeout(r, 210));

      // Negative #3b: Cache-hit race cancellation (uncached slow2.js 130ms -> already-cached app.js 0ms)
      slow2Chip?.click();
      fastChip?.click();
      await new Promise((r) => setTimeout(r, 210));
      const inspOpen = document.getElementById('ide-inspector-pane')?.hidden === false;
      const inspSubPath = document.querySelector('#ide-inspector-subbar .insp-sub-path-txt')?.textContent || '';
      const focusedCodeLines = document.querySelectorAll('#ide-inspector-body .insp-code-row.is-hl').length;

      // Negative #3c: Sensitive .env preview returns 403 error without rendering source rows
      envChip?.click();
      await new Promise((r) => setTimeout(r, 45));
      const envBlockedOk =
        document.querySelectorAll('#ide-inspector-body .insp-code-row').length === 0 &&
        Boolean(document.getElementById('ide-inspector-body')?.textContent?.includes('Blocked sensitive'));

      // Switch back to app.js, then test Diff mode (gitDiff), Side Agents tab, and Outline tab
      fastChip?.click();
      await new Promise((r) => setTimeout(r, 20));
      document.querySelector('#ide-inspector-subbar [data-insp-view-mode="diff"]')?.click();
      await new Promise((r) => setTimeout(r, 25));
      const diffRendered = Boolean(document.querySelector('#ide-inspector-body')?.textContent?.includes('newVal'));

      document.querySelector('#ide-inspector-pane [data-insp-tab="agents"]')?.click();
      await new Promise((r) => setTimeout(r, 25));
      const agentsTabRendered = Boolean(document.querySelector('#ide-inspector-body .insp-agent-card'));

      document.querySelector('#ide-inspector-pane [data-insp-tab="outline"]')?.click();
      await new Promise((r) => setTimeout(r, 25));
      document.querySelector('#ide-inspector-body [data-outline-jump="cp-1"]')?.click();
      await new Promise((r) => setTimeout(r, 35));
      const cpOpenedByOutline = Boolean(document.querySelector('#chat-stream details.vs-checkpoint-divider')?.open === true);

      const desktopOverflowX = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
      const titleAttrsCount = document.querySelectorAll('[title]').length;

      return {
        inlineCodeColor,
        secQuestionsVisible,
        secBgVisible,
        dockVisibleDesktop,
        writeInFocusSurvived,
        writeInMirroredToDock,
        thoughtCollapsedDefault,
        thoughtLabel,
        thoughtStepsCount,
        thoughtStayedOpen,
        cpCollapsedDefault,
        hasSubagentCard,
        dockOpt1Selected,
        sideOpt1Selected,
        dockSteppedToQ2,
        dockHiddenAfterSubmit,
        answeredCompactedInStream,
        inspOpen,
        inspSubPath,
        focusedCodeLines,
        envBlockedOk,
        diffRendered,
        agentsTabRendered,
        cpOpenedByOutline,
        desktopOverflowX,
        titleAttrsCount,
        xssTriggered: Boolean(window.__XSS)
      };
    })()`);

    assert.strictEqual(v59InteractiveProbe.xssTriggered, false, 'Hostile HTML in thoughtBlocks, subagents, questions & palettes must never execute');
    assert.strictEqual(v59InteractiveProbe.inlineCodeColor, 'rgb(223, 201, 163)', `Expected warm sand inline code rgb(223, 201, 163), got ${v59InteractiveProbe.inlineCodeColor}`);
    assert.strictEqual(v59InteractiveProbe.secQuestionsVisible, true, 'Sidebar #ide-sec-questions must be visible when questions are pending');
    assert.strictEqual(v59InteractiveProbe.secBgVisible, true, 'Sidebar #ide-sec-bgtasks must be visible when Side Agents / tasks exist');
    assert.strictEqual(v59InteractiveProbe.dockVisibleDesktop, true, '#chat-question-dock must be visible above composer on desktop');
    assert.strictEqual(v59InteractiveProbe.writeInMirroredToDock, true, 'Typing in sidebar write-in input must mirror draft text to #chat-question-dock');
    assert.strictEqual(v59InteractiveProbe.writeInFocusSurvived, true, 'Focused .sb-q-other input in sidebar must survive background renderIdeSidebar() calls');
    assert.strictEqual(v59InteractiveProbe.thoughtCollapsedDefault, true, '.vs-thought-card must render compacted (closed) by default');
    assert.strictEqual(v59InteractiveProbe.thoughtLabel, 'Thought for 9s', `Expected "Thought for 9s", got "${v59InteractiveProbe.thoughtLabel}"`);
    assert.strictEqual(v59InteractiveProbe.thoughtStepsCount, 2, 'Expected 2 multi-step thoughtBlocks inside .vs-thought-card');
    assert.strictEqual(v59InteractiveProbe.thoughtStayedOpen, true, 'Expanded .vs-thought-card must stay open across renderChatView() re-renders');
    assert.strictEqual(v59InteractiveProbe.cpCollapsedDefault, true, '.vs-checkpoint-divider must render compacted by default');
    assert.strictEqual(v59InteractiveProbe.hasSubagentCard, true, '.vs-subagent-card must render inline for invoke_subagent tool calls');
    assert.strictEqual(v59InteractiveProbe.dockOpt1Selected, true, 'Pressing "1" must select option 1 in #chat-question-dock');
    assert.strictEqual(v59InteractiveProbe.sideOpt1Selected, true, 'Option selection must mirror across sidebar and dock question cards');
    assert.strictEqual(v59InteractiveProbe.dockSteppedToQ2, true, 'Clicking Q2/Next in dock must advance multi-question stepper');
    assert.strictEqual(v59InteractiveProbe.dockHiddenAfterSubmit, true, 'Submitting question in dock must hide #chat-question-dock');
    assert.strictEqual(v59InteractiveProbe.answeredCompactedInStream, true, 'Answered question must compact into 1-line <details.vs-answered-q>');
    assert.strictEqual(v59InteractiveProbe.inspOpen, true, 'Clicking .md-file-chip[data-preview-file] must open #ide-inspector-pane');
    assert.ok(
      v59InteractiveProbe.inspSubPath.includes('js/app.js') && !v59InteractiveProbe.inspSubPath.includes('slow'),
      `Stale slow.js / slow2.js responses must be discarded even on cache hits; got "${v59InteractiveProbe.inspSubPath}"`
    );
    assert.strictEqual(v59InteractiveProbe.focusedCodeLines, 5, `Expected 5 highlighted lines (#L10-L14), got ${v59InteractiveProbe.focusedCodeLines}`);
    assert.strictEqual(v59InteractiveProbe.envBlockedOk, true, 'Sensitive .env file preview must return 403 error and render 0 source rows');
    assert.strictEqual(v59InteractiveProbe.diffRendered, true, 'Diff mode in Split Inspector must render gitDiff hunks');
    assert.strictEqual(v59InteractiveProbe.agentsTabRendered, true, 'Side Agents tab in Split Inspector must render live subagent/task cards');
    assert.strictEqual(v59InteractiveProbe.cpOpenedByOutline, true, 'Clicking checkpoint in Outline tab must auto-expand .vs-checkpoint-divider');
    assert.strictEqual(v59InteractiveProbe.desktopOverflowX, 0, 'Desktop Split Inspector must cause 0px horizontal overflow');
    assert.strictEqual(v59InteractiveProbe.titleAttrsCount, 0, 'Zero [title] attributes allowed anywhere in v59 DOM');

    // Mobile bottom-sheet Inspector geometry + Negative #4: PIN-lock blocks Ctrl+I and [data-preview-file]
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 375, height: 812, deviceScaleFactor: 3, mobile: true },
      sessionId
    );
    const v59MobileAndPinProbe = await evalJs(`(async () => {
      await new Promise((r) => setTimeout(r, 30));
      const mobileOverflowX = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
      const inspRect = document.getElementById('ide-inspector-pane')?.getBoundingClientRect();
      const fitsMobileViewport = Boolean(inspRect && inspRect.width <= 376 && inspRect.bottom <= 813);

      // Mobile Back/popstate closes #ide-inspector-pane bottom sheet first without switching away from chat tab
      window.dispatchEvent(new PopStateEvent('popstate', { state: { theoTab: 'pulse' } }));
      await new Promise((r) => setTimeout(r, 20));
      const popstateClosedSheetOnly =
        document.getElementById('ide-inspector-pane')?.hidden === true &&
        document.getElementById('view-chat')?.classList.contains('active') === true;

      // Simulate active PIN lock and verify Ctrl+I + [data-preview-file] are completely blocked
      const pinOverlay = document.getElementById('pin-overlay');
      if (pinOverlay) pinOverlay.hidden = false;

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', ctrlKey: true, bubbles: true, cancelable: true }));
      document.querySelector('#chat-stream .md-file-chip[data-preview-file]')?.click();
      await new Promise((r) => setTimeout(r, 25));
      const blockedWhilePinLocked = document.getElementById('ide-inspector-pane')?.hidden === true;

      if (pinOverlay) pinOverlay.hidden = true;
      return { mobileOverflowX, fitsMobileViewport, popstateClosedSheetOnly, blockedWhilePinLocked };
    })()`);

    assert.strictEqual(v59MobileAndPinProbe.mobileOverflowX, 0, 'Mobile bottom-sheet Inspector must have 0px horizontal overflow');
    assert.strictEqual(v59MobileAndPinProbe.fitsMobileViewport, true, 'Mobile bottom-sheet Inspector must fit cleanly inside 375x812 viewport');
    assert.strictEqual(v59MobileAndPinProbe.popstateClosedSheetOnly, true, 'Mobile popstate must close Inspector bottom sheet first without switching tabs');
    assert.strictEqual(v59MobileAndPinProbe.blockedWhilePinLocked, true, 'Ctrl+I and [data-preview-file] must be blocked while #pin-overlay is active');
    console.log('[PASS] Adversarial #10: v59 4-Palette Switcher, Sidebar Questions/Agents, Compacted Thinking/Checkpoints, Split Inspector, Race Cancellation & PIN Guards verified');

    // -------------------------------------------------------------------------
    // Adversarial Check #11: v60 Calm Chromatics, De-Duplication, 31-Step
    // Change-Set Compaction, @L Quote Line, 5 Native Studio Lenses (Code, Git,
    // Canvas Data Grid/Sandbox/Skills, Checks & Error Lens), Parallel Split-Watch
    // & Negative Security Assertions
    // -------------------------------------------------------------------------
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
      sessionId
    );
    await evalJs(`(() => {
      // Seed a 31-step turn with Markdown table + HTML snippet on sess-alpha before Page.navigate hydration
      const cacheRaw = JSON.parse(localStorage.getItem('theo_remote_cache_v3') || '{}');
      const alphaRow = (cacheRaw.state?.rows || []).find((r) => r.id === 'sess-alpha');
      if (alphaRow) alphaRow.status = 'working';
      const stepCalls = Array.from({ length: 31 }, (_, i) => ({
        id: 'tc-31-' + i,
        kind: i % 5 === 0 ? 'edit' : 'read',
        label: i % 5 === 0 ? 'Edited' : 'Analyzed',
        file: i % 5 === 0 ? 'js/app.js' : 'css/theo.css',
        relPath: i % 5 === 0 ? 'js/app.js' : 'css/theo.css',
        addedLines: i % 5 === 0 ? 7 : 0,
        removedLines: i % 5 === 0 ? 2 : 0,
        summary: 'Step ' + (i + 1)
      }));
      cacheRaw.threads = cacheRaw.threads || {};
      cacheRaw.threads['sess-alpha'] = {
        id: 'sess-alpha',
        provider: 'antigravity',
        title: 'Alpha 31-Step Studio Session',
        folder: 'theo',
        messages: [
          { id: 'u-v60', role: 'user', createdAt: new Date(Date.now() - 40000).toISOString(), text: 'Upgrade THEO Studio Lenses' },
          {
            id: 'a-v60',
            role: 'assistant',
            createdAt: new Date().toISOString(),
            text: 'Here is the capability matrix:\\n\\n| Lens | Replaces | Status |\\n| --- | --- | --- |\\n| Git Lens | GitLens & PRs | Active |\\n| Canvas | Data Grid & Live Server | Active |\\n\\n\`\`\`html\\n<div class="demo-card">Hello Studio Canvas</div>\\n\`\`\`',
            toolCalls: stepCalls
          }
        ]
      };
      localStorage.setItem('theo_remote_cache_v3', JSON.stringify(cacheRaw));
    })()`);

    await cdp.send('Page.navigate', { url: `${baseUrl}/?nosse=1` }, sessionId);
    await new Promise((r) => setTimeout(r, 650));

    const v60Probe = await evalJs(`(async () => {
      document.querySelector('[data-tab="analytics"]')?.click();
      await new Promise((r) => setTimeout(r, 25));
      const bridgeInp = document.getElementById('input-custom-bridge');
      if (bridgeInp) {
        bridgeInp.value = location.origin;
        document.getElementById('btn-save-bridge')?.click();
        await new Promise((r) => setTimeout(r, 40));
      }

      document.querySelector('#rail-nav [data-tab="chat"]')?.click();
      await new Promise((r) => setTimeout(r, 30));

      // 1. Calm Chromatics & De-Duplication checks
      const pushBadge = document.getElementById('rail-push-badge');
      const pushBadgeBg = pushBadge ? getComputedStyle(pushBadge).backgroundColor : '';
      const stopSendBtn = document.getElementById('composer-send-btn');
      stopSendBtn?.classList.add('is-stop');
      const stopBtnBg = stopSendBtn ? getComputedStyle(stopSendBtn).backgroundImage + ' ' + getComputedStyle(stopSendBtn).backgroundColor : '';
      const sessionsNavBadgeDisp = getComputedStyle(document.getElementById('badge-sessions')).display;
      const workspacesNavBadgeDisp = getComputedStyle(document.getElementById('badge-workspaces')).display;

      const betaTabDots = document.querySelectorAll('#ide-editor-tabs [data-editor-tab-id="sess-beta"] .ide-dot').length;
      document.querySelector('#ide-sidebar-tree [data-ide-open-session="sess-alpha"]')?.click();
      await new Promise((r) => setTimeout(r, 45));

      // Verify single Stop button rule when running with empty draft
      const inp = document.getElementById('composer-input');
      if (inp) {
        inp.value = '';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const headerStopHiddenWhenEmptyDraft = document.getElementById('btn-chat-stop')?.hidden === true;
      const composerStopShownWhenRunning = document.getElementById('composer-send-btn')?.classList.contains('is-stop') === true;

      // Verify 31-step turn starts compacted (open === false) and renders .turn-changeset-strip
      const toolsDetails = document.querySelector('#chat-stream details.tools-details');
      const toolsCollapsedByDefault = Boolean(toolsDetails && toolsDetails.open === false);
      const changeSetChip = document.querySelector('#chat-stream .turn-changeset-strip .turn-cs-chip[data-preview-file="js/app.js"]');
      const hasChangeSetStrip = Boolean(changeSetChip);

      // Click Change-Set chip -> opens Split Inspector in Diff mode
      changeSetChip?.click();
      await new Promise((r) => setTimeout(r, 50));
      const diffOpenedFromChip = Boolean(document.querySelector('#ide-inspector-body .insp-diff-pre'));

      // Switch to Source mode & test @L Quote Line button
      document.querySelector('#ide-inspector-subbar [data-insp-view-mode="source"]')?.click();
      await new Promise((r) => setTimeout(r, 35));
      const quoteLineBtn = document.querySelector('#ide-inspector-body [data-quote-line="js/app.js#L1"]');
      quoteLineBtn?.click();
      await new Promise((r) => setTimeout(r, 25));
      const quotedInComposer = String(document.getElementById('composer-input')?.value || '').includes('@js/app.js#L1');

      // 2. Test Built-in Git Lens
      document.querySelector('#studio-lens-bar [data-open-lens="git"]')?.click();
      await new Promise((r) => setTimeout(r, 60));
      const gitFilesRendered = document.querySelectorAll('#ide-inspector-body .studio-git-file-row').length >= 2;
      document.querySelector('#ide-inspector-subbar [data-git-prompt-action="commit"]')?.click();
      const gitCommitPrompted = String(document.getElementById('composer-input')?.value || '').includes('Summarize all uncommitted');

      // 3. Test Built-in Canvas Lens (Port Radar, Searchable Data Grid, Sandboxed Preview & Skills)
      document.querySelector('#studio-lens-bar [data-open-lens="canvas"]')?.click();
      await new Promise((r) => setTimeout(r, 50));
      const gridRowsBefore = document.querySelectorAll('#ide-inspector-body .canvas-data-grid tbody tr').length;
      const gridSearch = document.getElementById('canvas-grid-search');
      if (gridSearch) {
        gridSearch.focus();
        gridSearch.value = 'GitLens';
        gridSearch.dispatchEvent(new Event('input', { bubbles: true }));
      }
      await new Promise((r) => setTimeout(r, 30));
      const gridSearchKeptFocus = document.activeElement?.id === 'canvas-grid-search';
      const gridRowsAfter = document.querySelectorAll('#ide-inspector-body .canvas-data-grid tbody tr').length;
      const sandboxFrame = document.querySelector('#ide-inspector-body iframe.canvas-sandbox-frame');
      const sandboxAttr = sandboxFrame ? sandboxFrame.getAttribute('sandbox') : null;
      document.querySelector('#ide-inspector-body [data-use-studio-skill="red-team-gate"]')?.click();
      const skillInserted = String(document.getElementById('composer-input')?.value || '').includes('Use the red-team-gate skill:');

      // 4. Test Built-in Checks & Error Lens + Negative Test on unallowlisted checkId + Cross-Workspace Isolation
      document.querySelector('#studio-lens-bar [data-open-lens="agents"]')?.click();
      await new Promise((r) => setTimeout(r, 50));
      const hostileCheckRes = await fetch('/api/studio-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: 'theo', checkId: 'rm -rf /' })
      });
      const hostileBlocked403 = hostileCheckRes.status === 403;

      document.querySelector('#ide-inspector-body [data-run-studio-check="syntax:js/app.js"]')?.click();
      await new Promise((r) => setTimeout(r, 80));
      const diagPill = document.querySelector('#ide-inspector-body .studio-diag-pill[data-preview-file="js/app.js#L12"]');
      const diagRendered = Boolean(diagPill);
      diagPill?.click();
      await new Promise((r) => setTimeout(r, 50));
      const jumpedToLine12 = Boolean(document.querySelector('#ide-inspector-body .insp-code-row.is-hl[data-ln="12"]'));

      // 5. Test Parallel Split-Watch (⊞ Split) & Swap
      document.getElementById('btn-split-watch')?.click();
      await new Promise((r) => setTimeout(r, 40));
      const splitPane = document.getElementById('chat-split-watch-pane');
      const splitWatchOpen = Boolean(splitPane && !splitPane.hidden);
      const splitOverflowX = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
      const swapBtn = document.getElementById('btn-split-watch-swap');
      const watchedTarget = swapBtn?.dataset.splitWatchSwap || '';
      swapBtn?.click();
      await new Promise((r) => setTimeout(r, 40));
      const swappedPrimary = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}').selectedThreadId === watchedTarget;
      document.getElementById('btn-split-watch-close')?.click();
      await new Promise((r) => setTimeout(r, 25));

      // 6. Negative Test: PIN-lock blocks new v60 actions ([data-quote-line], [data-run-studio-check], #btn-split-watch)
      if (inp) inp.value = '';
      const pinOverlay = document.getElementById('pin-overlay');
      if (pinOverlay) pinOverlay.hidden = false;
      document.getElementById('btn-split-watch')?.click();
      document.querySelector('#ide-inspector-body [data-quote-line="js/app.js#L1"]')?.click();
      await new Promise((r) => setTimeout(r, 25));
      const blockedByPin =
        document.getElementById('chat-split-watch-pane')?.hidden === true &&
        document.getElementById('composer-input')?.value === '';
      if (pinOverlay) pinOverlay.hidden = true;

      // Leave Inspector on 'canvas' lens to test reload persistence
      document.querySelector('#studio-lens-bar [data-open-lens="canvas"]')?.click();
      await new Promise((r) => setTimeout(r, 25));

      return {
        pushBadgeBg,
        stopBtnBg,
        sessionsNavBadgeDisp,
        workspacesNavBadgeDisp,
        betaTabDots,
        headerStopHiddenWhenEmptyDraft,
        composerStopShownWhenRunning,
        toolsCollapsedByDefault,
        hasChangeSetStrip,
        diffOpenedFromChip,
        quotedInComposer,
        gitFilesRendered,
        gitCommitPrompted,
        gridRowsBefore,
        gridRowsAfter,
        gridSearchKeptFocus,
        sandboxAttr,
        skillInserted,
        hostileBlocked403,
        diagRendered,
        jumpedToLine12,
        splitWatchOpen,
        splitOverflowX,
        swappedPrimary,
        blockedByPin,
        titleAttrsCount: document.querySelectorAll('[title]').length
      };
    })()`);

    // Verify 'canvas' lens survives reload and mobile Escape closes Split-Watch
    await cdp.send('Page.navigate', { url: `${baseUrl}/?nosse=1` }, sessionId);
    await new Promise((r) => setTimeout(r, 550));
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 375, height: 812, deviceScaleFactor: 3, mobile: true },
      sessionId
    );
    const v60ReloadAndMobileProbe = await evalJs(`(async () => {
      const savedPrefs = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');
      const canvasTabSurvivedReload = savedPrefs.inspectorTab === 'canvas';
      document.getElementById('btn-split-watch')?.click();
      await new Promise((r) => setTimeout(r, 25));
      const openedOnMobile = document.getElementById('chat-split-watch-pane')?.hidden === false;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise((r) => setTimeout(r, 25));
      const closedByEscapeOnMobile = document.getElementById('chat-split-watch-pane')?.hidden === true;
      return { canvasTabSurvivedReload, openedOnMobile, closedByEscapeOnMobile };
    })()`);

    assert.ok(!v60Probe.pushBadgeBg.includes('255, 59, 48'), `Push badge must not use harsh neon #FF3B30, got ${v60Probe.pushBadgeBg}`);
    assert.ok(!v60Probe.stopBtnBg.includes('239, 68, 68'), `Stop button must not use harsh neon #EF4444 gradient, got ${v60Probe.stopBtnBg}`);
    assert.strictEqual(v60Probe.sessionsNavBadgeDisp, 'none', 'Passive #badge-sessions on Activity Bar must be hidden');
    assert.strictEqual(v60Probe.workspacesNavBadgeDisp, 'none', 'Passive #badge-workspaces on Activity Bar must be hidden');
    assert.strictEqual(v60Probe.betaTabDots, 0, 'Idle/open editor tabs must render 0 colored dots');
    assert.strictEqual(v60Probe.headerStopHiddenWhenEmptyDraft, true, '#btn-chat-stop must hide when composer Stop button is already shown');
    assert.strictEqual(v60Probe.composerStopShownWhenRunning, true, '#composer-send-btn.is-stop must show when session is running');
    assert.strictEqual(v60Probe.toolsCollapsedByDefault, true, '31-step turn must start compacted (tools-details.open === false)');
    assert.strictEqual(v60Probe.hasChangeSetStrip, true, 'Turn must render 1-row .turn-changeset-strip');
    assert.strictEqual(v60Probe.diffOpenedFromChip, true, 'Clicking .turn-cs-chip must open Diff view in Split Inspector');
    assert.strictEqual(v60Probe.quotedInComposer, true, 'Clicking @L button in Code Inspector must quote @file#L in composer');
    assert.strictEqual(v60Probe.gitFilesRendered, true, 'Git Lens must render modified working tree files');
    assert.strictEqual(v60Probe.gitCommitPrompted, true, 'Summarize & Commit in Git Lens must populate composer prompt');
    assert.strictEqual(v60Probe.gridRowsBefore, 2, 'Canvas Data Grid must extract 2 rows from Markdown table');
    assert.strictEqual(v60Probe.gridRowsAfter, 1, 'Canvas Data Grid search must filter rows live');
    assert.strictEqual(v60Probe.gridSearchKeptFocus, true, 'Canvas Data Grid search input must retain focus across re-render');
    assert.strictEqual(v60Probe.sandboxAttr, '', 'Canvas HTML preview iframe must enforce strict sandbox=""');
    assert.strictEqual(v60Probe.skillInserted, true, 'Clicking Use Skill in Canvas Lens must insert skill instruction');
    assert.strictEqual(v60Probe.hostileBlocked403, true, 'Hostile/unlisted checkId must be rejected with HTTP 403');
    assert.strictEqual(v60Probe.diagRendered, true, 'Running studio check must render clickable Error Lens diagnostic pill');
    assert.strictEqual(v60Probe.jumpedToLine12, true, 'Clicking Error Lens diagnostic pill must highlight line 12 in Code Inspector');
    assert.strictEqual(v60Probe.splitWatchOpen, true, 'Clicking ⊞ Split must open #chat-split-watch-pane');
    assert.strictEqual(v60Probe.splitOverflowX, 0, 'Parallel Split-Watch + Inspector must cause 0px horizontal overflow');
    assert.strictEqual(v60Probe.swappedPrimary, true, 'Clicking ⇄ Swap in Split-Watch must swap primary and watched sessions');
    assert.strictEqual(v60Probe.blockedByPin, true, 'PIN lock must block Split-Watch and @L quote actions');
    assert.strictEqual(v60Probe.titleAttrsCount, 0, 'Zero [title] attributes allowed anywhere in v60 DOM');
    assert.strictEqual(v60ReloadAndMobileProbe.canvasTabSurvivedReload, true, 'Canvas/Git inspectorTab must survive page reload');
    assert.strictEqual(v60ReloadAndMobileProbe.openedOnMobile, true, 'Split-Watch must open when triggered');
    assert.strictEqual(v60ReloadAndMobileProbe.closedByEscapeOnMobile, true, 'Escape on mobile (<=900px) must close Split-Watch overlay');
    console.log('[PASS] Adversarial #11: v60 Calm Chromatics, 31-Step Change-Set Compaction, @L Quote, 5 Built-in Studio Lenses, Parallel Split-Watch & PIN/403 Guards verified');

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
