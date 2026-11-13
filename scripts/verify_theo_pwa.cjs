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
                  { label: 'Session (5hr)', pct: 2, usedPercent: 2, reset: now + 3600000 },
                  { label: 'Weekly (7 day)', pct: 88, usedPercent: 88, reset: now + 129600000 },
                  { label: 'Claude & GPT (5hr)', pct: 91, usedPercent: 91, reset: now + 18000000 },
                  { label: 'Claude & GPT (7 day)', pct: 14, usedPercent: 14, expired: true, reset: 0, resetText: 'Window idle' }
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

  // Static Equal-Hosts Check (v65): the app knows no PC by name or folder. A session belongs to the host that
  // published it (the `deviceId` stamped on the row), and every direct command carries its command id so that a
  // host can recognise the queued copy of a command it has already run.
  {
    for (const banned of [/users[\\/]+husseinbdeir/i, /users[\\/]+hbdei\b/i, /main-workstation/i, /theo-laptop/i, /Main Workstation/, /Hussein-Laptop/i]) {
      assert.strictEqual(banned.test(appJsSrc), false, `js/app.js must not contain ${banned} (no PC is special)`);
    }
    const directPayloads = appJsSrc.match(/\.\.\.cmd,\s*(?:attachments: \w+,\s*)?cmdId: cmd\.id,\s*id: cmd\.newSession \? '' : targetThreadId,/g) || [];
    assert.strictEqual(directPayloads.length, 3, 'local WS, edge WS and local HTTP command payloads must each carry cmdId');
    console.log('[PASS] Static: no PC named in the app, and all 3 direct command paths carry the command id');
  }

  // Static Edge-Store Derivation Check (v64): the store key is derived in-page by a hand-written synchronous SHA-256.
  // It must agree with Node's crypto on every block-boundary length, and refreshCloudConfig must prefer the derived
  // Edge store over any stored legacy relay URL or key whenever the device holds an edge access key.
  {
    const nodeCrypto = require('crypto');
    const vm = require('vm');
    const pick = (name, endToken) => {
      const start = appJsSrc.indexOf(`  function ${name}(`);
      assert.ok(start >= 0, `js/app.js must define ${name}`);
      const end = appJsSrc.indexOf(endToken, start);
      assert.ok(end > start, `could not find the end of ${name}`);
      return appJsSrc.slice(start, end + endToken.length);
    };
    const src = [
      pick('sha256HexSync', '\n  }\n'),
      'let edgeStoreKeySrc = ""; let edgeStoreKeyHex = "";',
      pick('getEdgeStoreKeyHex', '\n  }\n'),
      pick('getEdgeStoreUrl', '\n  }\n'),
      'const cloudCfg = { url: "", key: "", edgeAccessKey: "", port: 4318 };',
      pick('refreshCloudConfig', '\n  }\n'),
      'this.api = { sha256HexSync, refreshCloudConfig };'
    ].join('\n');
    const prefsBox = {};
    const sandbox = {
      TextEncoder,
      Uint8Array,
      Uint32Array,
      DataView,
      Math,
      String,
      Number,
      atob: (s) => Buffer.from(s, 'base64').toString('binary'),
      prefs: prefsBox,
      window: { THEO_CLOUD_CFG: { u: '', k: '', port: 4318, edgeRelayUrl: 'https://theo-edge-relay.husseinbdeir.workers.dev/ws' } },
      deriveEdgeAuthTokenHex: async () => ''
    };
    vm.runInNewContext(src, sandbox, { filename: 'app-edge-store-extract.js' });
    const ref = (s) => nodeCrypto.createHash('sha256').update(s, 'utf8').digest('hex');
    for (const s of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'a'.repeat(119), 'a'.repeat(120), '😀 ملاحظة résumé']) {
      assert.strictEqual(sandbox.api.sha256HexSync(s), ref(s), `sha256HexSync must match Node crypto for a ${s.length}-char input`);
    }
    const edgeKey = 'e'.repeat(64);
    Object.assign(prefsBox, {
      edgeAccessKey: edgeKey,
      cloudUrl: 'https://legacy.example.invalid/relay',
      cloudKey: 'legacy-key'
    });
    let cfgOut = sandbox.api.refreshCloudConfig();
    assert.strictEqual(cfgOut.url, 'https://theo-edge-relay.husseinbdeir.workers.dev/store', 'an edge-paired device must use the Edge store URL');
    assert.strictEqual(cfgOut.key, ref(`theo-edge-v1:${edgeKey}`), 'the store key must be SHA-256("theo-edge-v1:" + edgeAccessKey)');
    prefsBox.edgeRelayUrl = 'wss://custom-relay.example.workers.dev/ws';
    assert.strictEqual(sandbox.api.refreshCloudConfig().url, 'https://custom-relay.example.workers.dev/store', 'the store follows a custom edge relay URL');
    prefsBox.edgeRelayUrl = 'ws://evil.example/ws';
    cfgOut = sandbox.api.refreshCloudConfig();
    assert.strictEqual(cfgOut.url, 'https://legacy.example.invalid/relay', 'a non-TLS remote edge URL must never receive the derived store key');
    assert.strictEqual(cfgOut.key, 'legacy-key');
    delete prefsBox.edgeRelayUrl;
    prefsBox.edgeAccessKey = '';
    cfgOut = sandbox.api.refreshCloudConfig();
    assert.strictEqual(cfgOut.url, 'https://legacy.example.invalid/relay', 'a device without an edge key keeps its stored relay');
    console.log('[PASS] Static: sync SHA-256 matches Node crypto and edge-paired devices derive the Edge store URL and key');
  }

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

    // -------------------------------------------------------------------------
    // Adversarial Check #12: v61 Composer De-clutter (No Direct/Reply pills),
    // Desktop Breadcrumb De-duplication, Interactive Model & Thinking Level
    // Selector (Gemini 4 Argon / Gemini 3.8 Flash + Low|Medium|High), Sidebar
    // Open-Tab Grey Dot (.ide-dot.open), Last-Worked-On Sidebar Ordering,
    // Studio Launchpad, & >= 3 Negative Assertions
    // -------------------------------------------------------------------------
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
      sessionId
    );
    await evalJs(`(() => {
      // Negative #1 seed: corrupt/hostile selectedModelByProvider & selectedThinkingEffort in localStorage
      const prefs = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');
      prefs.selectedModelByProvider = { antigravity: '<img src=x onerror="window.__XSS=610">', claude: 'invalid-model' };
      prefs.selectedThinkingEffort = { antigravity: 'ultra-bogus', claude: 'bogus' };
      prefs.threadModelConfig = {
        'draft-new-123': { modelId: 'gemini-3.8-flash', effort: 'low', provider: 'antigravity' },
        'sess-corrupt': { modelId: 'bogus-model', effort: 'high', provider: 'antigravity' },
        'sess-beta': { modelId: 'gemini-3.8-flash', effort: 'low', provider: 'antigravity', updatedAt: Date.now() }
      };
      prefs.openEditorTabs = ['sess-alpha'];
      prefs.selectedThreadId = 'sess-alpha';
      prefs.composerMode = 'reply';
      prefs.activeTab = 'chat';
      localStorage.setItem('theo_remote_prefs_v1', JSON.stringify(prefs));

      const cache = JSON.parse(localStorage.getItem('theo_remote_cache_v3') || '{}');
      const now = Date.now();
      cache.state.rows = [
        {
          id: 'sess-alpha',
          title: 'Alpha Newer Session',
          provider: 'antigravity',
          model: 'Gemini 3.1 Pro',
          folder: 'theo',
          status: 'completed',
          open: true,
          at: now - 60000
        },
        {
          id: 'sess-beta',
          title: 'Beta Older Session',
          provider: 'antigravity',
          model: 'Gemini 4 Argon (High)',
          folder: 'isabi-app',
          status: 'completed',
          open: false,
          at: now - 3600000 * 11
        }
      ];
      localStorage.setItem('theo_remote_cache_v3', JSON.stringify(cache));
    })()`);

    await cdp.send('Page.navigate', { url: `${baseUrl}/?nosse=1` }, sessionId);
    await new Promise((r) => setTimeout(r, 600));

    const v61Probe = await evalJs(`(async () => {
      // 1. Removed redundant bottom composer buttons
      const directToggleGone = document.getElementById('composer-direct-toggle') === null;
      const modePillsGone = document.getElementById('composer-mode-pills') === null;

      // 2. Desktop breadcrumb de-duplication (#view-chat .chat-title-row hidden on >=1025px)
      const titleRow = document.querySelector('#view-chat .chat-title-row');
      const desktopTitleRowHidden = Boolean(titleRow && getComputedStyle(titleRow).display === 'none');

      // Negative #1 verification: hostile model/effort sanitized to 'gemini-4-argon' / 'high' and legacy 'Gemini 3.1 Pro' upgraded to 'Gemini 4 Argon (High)'
      const bootPrefs = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');
      const sanitizedModel = bootPrefs.selectedModelByProvider?.antigravity;
      const sanitizedEffort = bootPrefs.selectedThinkingEffort?.antigravity;
      const draftCfgPurgedOnBoot = !('draft-new-123' in (bootPrefs.threadModelConfig || {})) && !('sess-corrupt' in (bootPrefs.threadModelConfig || {}));
      const initialPillText = document.getElementById('chat-model-pill')?.textContent?.trim() || '';

      // 3. Interactive Model & Thinking Level Selector (switch to Gemini 3.8 Flash + Medium)
      document.getElementById('chat-model-picker-btn')?.click();
      await new Promise((r) => setTimeout(r, 25));
      const modelPopOpen = document.getElementById('model-picker-popover')?.hidden === false;
      document.querySelector('#model-picker-popover [data-select-ai-model="gemini-3.8-flash"]')?.click();
      await new Promise((r) => setTimeout(r, 25));
      document.querySelector('#model-picker-popover [data-select-ai-effort="medium"]')?.click();
      await new Promise((r) => setTimeout(r, 25));
      const updatedHeaderPill = document.getElementById('chat-model-pill')?.textContent?.trim() || '';
      const updatedComposerPill = document.getElementById('composer-model-label')?.textContent?.trim() || '';
      // Escape closes #model-picker-popover
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise((r) => setTimeout(r, 20));
      const modelPopClosedByEscape = document.getElementById('model-picker-popover')?.hidden === true;

      // Negative #2: PIN lock blocks model/effort mutation
      const pinOverlay = document.getElementById('pin-overlay');
      if (pinOverlay) pinOverlay.hidden = false;
      document.querySelector('#model-picker-popover [data-select-ai-model="gemini-4-argon"]')?.click();
      document.querySelector('#model-picker-popover [data-select-ai-effort="low"]')?.click();
      await new Promise((r) => setTimeout(r, 20));
      const pillAfterPinBlocked = document.getElementById('chat-model-pill')?.textContent?.trim() || '';
      if (pinOverlay) pinOverlay.hidden = true;

      // 4. Sidebar Open-Tab Grey Dot (.ide-dot.open) vs Closed Idle Session (.ide-dot.closed)
      const alphaDot = document.querySelector('#ide-sidebar-tree [data-ide-open-session="sess-alpha"] .ide-dot');
      const betaDot = document.querySelector('#ide-sidebar-tree [data-ide-open-session="sess-beta"] .ide-dot');
      const openTabHasGreyDot = Boolean(
        alphaDot &&
          alphaDot.classList.contains('open') &&
          getComputedStyle(alphaDot).display !== 'none'
      );
      const closedTabDotHidden = Boolean(
        betaDot &&
          betaDot.classList.contains('closed') &&
          getComputedStyle(betaDot).display === 'none'
      );

      // 5. Sidebar Ordering by Last Worked On: initially sess-alpha (1m ago) is #1 before sess-beta (11h ago)
      const orderBeforeWork = Array.from(
        document.querySelectorAll('#ide-sidebar-tree .ide-tree-row[data-ide-open-session]')
      ).map((el) => el.dataset.ideOpenSession);

      // Open sess-beta -> now both sess-alpha and sess-beta are open tabs
      document.querySelector('#ide-sidebar-tree [data-ide-open-session="sess-beta"]')?.click();
      await new Promise((r) => setTimeout(r, 35));
      const betaDotAfterOpen = document.querySelector('#ide-sidebar-tree [data-ide-open-session="sess-beta"] .ide-dot');
      const betaNowHasGreyDot = Boolean(
        betaDotAfterOpen &&
          betaDotAfterOpen.classList.contains('open') &&
          getComputedStyle(betaDotAfterOpen).display !== 'none'
      );

      // Negative #3: Clicking sidebar [data-close-editor-tab="sess-alpha"] closes sess-alpha tab & removes its grey dot WITHOUT switching active session to sess-alpha
      document.querySelector('#ide-sidebar-tree [data-ide-open-session="sess-alpha"] [data-close-editor-tab="sess-alpha"]')?.click();
      await new Promise((r) => setTimeout(r, 35));
      const alphaDotAfterClose = document.querySelector('#ide-sidebar-tree [data-ide-open-session="sess-alpha"] .ide-dot');
      const alphaGreyDotRemovedOnClose = Boolean(
        alphaDotAfterClose && getComputedStyle(alphaDotAfterClose).display === 'none'
      );
      const activeStayedBeta = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}').selectedThreadId === 'sess-beta';

      // Submit a prompt in sess-beta -> sess-beta is worked on now, so it MUST move to #1 in the sidebar above sess-alpha!
      const compInp = document.getElementById('composer-input');
      if (compInp) {
        compInp.value = 'Verify last-worked-on sidebar ordering';
        document.getElementById('chat-composer-form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
      await new Promise((r) => setTimeout(r, 50));
      const orderAfterWork = Array.from(
        document.querySelectorAll('#ide-sidebar-tree .ide-tree-row[data-ide-open-session]')
      ).map((el) => el.dataset.ideOpenSession);

      // 6. Click + Antigravity -> opens active draft tab + renders .new-session-launchpad (no verbose paragraph)
      document.getElementById('rail-new-agy')?.click();
      await new Promise((r) => setTimeout(r, 35));
      const hasDraftTab = Boolean(document.querySelector('#ide-editor-tabs [data-editor-tab-id="__new__"].active'));
      const hasLaunchpad = Boolean(document.querySelector('#chat-stream .new-session-launchpad'));
      const hasOldVerboseText = Boolean(
        document.getElementById('chat-stream')?.textContent?.includes('Starting a brand-new, unrelated')
      );
      document.querySelector('#chat-stream .new-session-launchpad [data-open-lens="agents"]')?.click();
      await new Promise((r) => setTimeout(r, 30));
      const launchpadChecksOpenedAgentsLens =
        document.getElementById('ide-inspector-pane')?.hidden === false &&
        JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}').inspectorTab === 'agents';
      document.getElementById('btn-close-inspector')?.click();

      return {
        directToggleGone,
        modePillsGone,
        desktopTitleRowHidden,
        sanitizedModel,
        sanitizedEffort,
        draftCfgPurgedOnBoot,
        initialPillText,
        modelPopOpen,
        modelPopClosedByEscape,
        updatedHeaderPill,
        updatedComposerPill,
        pillAfterPinBlocked,
        openTabHasGreyDot,
        closedTabDotHidden,
        orderBeforeWork,
        betaNowHasGreyDot,
        alphaGreyDotRemovedOnClose,
        activeStayedBeta,
        orderAfterWork,
        hasDraftTab,
        hasLaunchpad,
        hasOldVerboseText,
        launchpadChecksOpenedAgentsLens,
        titleAttrsCount: document.querySelectorAll('[title]').length,
        xssTriggered: Boolean(window.__XSS)
      };
    })()`);

    assert.strictEqual(v61Probe.xssTriggered, false, 'Negative #1: Hostile model/effort in localStorage must never trigger XSS');
    assert.strictEqual(v61Probe.directToggleGone, true, '#composer-direct-toggle (⚡ Direct) must be removed from bottom composer');
    assert.strictEqual(v61Probe.modePillsGone, true, '#composer-mode-pills (Reply | + AGY | + Claude) must be removed from bottom composer');
    assert.strictEqual(v61Probe.desktopTitleRowHidden, true, 'Duplicate #chat-session-select title row must be hidden on desktop (>=1025px)');
    assert.strictEqual(v61Probe.sanitizedModel, 'gemini-4-argon', 'Negative #1: Invalid stored model ID must sanitize to gemini-4-argon');
    assert.strictEqual(v61Probe.sanitizedEffort, 'high', 'Negative #1: Invalid stored thinking effort must sanitize to high');
    assert.strictEqual(v61Probe.draftCfgPurgedOnBoot, true, 'Corrupt or draft-new-* threadModelConfig entries must be purged on boot');
    assert.strictEqual(v61Probe.initialPillText, 'Gemini 4 Argon (High)', 'Legacy Gemini 3.1 Pro must upgrade to Gemini 4 Argon (High)');
    assert.strictEqual(v61Probe.modelPopOpen, true, 'Clicking #chat-model-picker-btn must open #model-picker-popover');
    assert.strictEqual(v61Probe.modelPopClosedByEscape, true, 'Escape must close #model-picker-popover');
    assert.strictEqual(v61Probe.updatedHeaderPill, 'Gemini 3.8 Flash (Medium)', 'Selecting Gemini 3.8 Flash + Medium must update #chat-model-pill');
    assert.strictEqual(v61Probe.updatedComposerPill, 'Gemini 3.8 Flash · Medium', 'Selecting Gemini 3.8 Flash + Medium must update #composer-model-label');
    assert.strictEqual(v61Probe.pillAfterPinBlocked, 'Gemini 3.8 Flash (Medium)', 'Negative #2: PIN lock must block model/effort changes');
    assert.strictEqual(v61Probe.openTabHasGreyDot, true, 'Open idle tab in sidebar must display subtle grey dot (.ide-dot.open)');
    assert.strictEqual(v61Probe.closedTabDotHidden, true, 'Closed idle session in sidebar must hide dot (.ide-dot.closed)');
    assert.strictEqual(v61Probe.orderBeforeWork[0], 'sess-alpha', `Expected newer sess-alpha first before work, got ${JSON.stringify(v61Probe.orderBeforeWork)}`);
    assert.strictEqual(v61Probe.betaNowHasGreyDot, true, 'Opening sess-beta tab must immediately show .ide-dot.open in sidebar');
    assert.strictEqual(v61Probe.alphaGreyDotRemovedOnClose, true, 'Negative #3: Closing sess-alpha tab from sidebar must remove its grey dot');
    assert.strictEqual(v61Probe.activeStayedBeta, true, 'Negative #3: Clicking sidebar close-tab button must not open that row');
    assert.strictEqual(v61Probe.orderAfterWork[0], 'sess-beta', `Expected newly worked-on sess-beta to move to #1 in sidebar, got ${JSON.stringify(v61Probe.orderAfterWork)}`);
    assert.strictEqual(v61Probe.hasDraftTab, true, '+ New Session mode must render active draft tab in #ide-editor-tabs');
    assert.strictEqual(v61Probe.hasLaunchpad, true, '+ New Session mode must render interactive .new-session-launchpad');
    assert.strictEqual(v61Probe.hasOldVerboseText, false, 'Redundant verbose New Session paragraph must be gone');
    assert.strictEqual(v61Probe.launchpadChecksOpenedAgentsLens, true, 'Launchpad Studio Checks & Agents card must open the agents Inspector lens');
    assert.strictEqual(v61Probe.titleAttrsCount, 0, 'Zero [title] attributes allowed anywhere in v61 DOM');
    console.log('[PASS] Adversarial #12: v61 Composer De-clutter, Desktop Tab De-duplication, Interactive Model & Thinking Level Selector, Sidebar Open-Tab Grey Dot, Last-Worked-On Ordering & 3 Negative Guards verified');

    // -------------------------------------------------------------------------
    // Adversarial Check #13: v62 Proportions (#chat-live-bgtasks aligned with
    // #composer-box, crisp vector .ui-chev SVGs, 1-line #rail-conn-title +
    // 24/7 Daemon), Floating VS Code Model Dropdown (position:fixed, zero
    // clipping, 1-click [data-select-model-combo], MODEL_PLACEHOLDER_M* enum
    // normalization), & >= 3 v62 Negative Assertions
    // -------------------------------------------------------------------------
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
      sessionId
    );
    const v62Probe = await evalJs(`(async () => {
      // Seed sess-alpha with live background task + MODEL_PLACEHOLDER_M319 enum to test normalization + #chat-live-bgtasks proportions
      const cache = JSON.parse(localStorage.getItem('theo_remote_cache_v3') || '{}');
      const now = Date.now();
      const alpha = (cache.state?.rows || []).find((r) => r.id === 'sess-alpha');
      if (alpha) {
        alpha.model = 'MODEL_PLACEHOLDER_M319';
        alpha.status = 'working';
        alpha.backgroundTasks = [
          {
            id: 'task-cf-v62',
            kind: 'task',
            state: 'running',
            summary: 'Deploy to Cloudflare Pages via deploy_cloudflare.py',
            startedAt: now - 8000,
            outputPreview: 'Uploading 58 assets...'
          }
        ];
      }
      const prefs = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');
      delete prefs.threadModelConfig?.['sess-alpha'];
      prefs.selectedThreadId = 'sess-alpha';
      prefs.composerMode = 'reply';
      prefs.edgeAccessKey = '9'.repeat(64);
      localStorage.setItem('theo_remote_prefs_v1', JSON.stringify(prefs));
      localStorage.setItem('theo_remote_cache_v3', JSON.stringify(cache));
      location.reload();
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 650));

    const v62DesktopResult = await evalJs(`(async () => {
      // 1. Verify MODEL_PLACEHOLDER_M319 normalized to 'Gemini 3.8 Flash (Medium)'
      const m319HeaderPill = document.getElementById('chat-model-pill')?.textContent?.trim() || '';

      // 2. Verify #chat-live-bgtasks is constrained to #composer-box width & left alignment (<= 2px delta)
      const bgBar = document.getElementById('chat-live-bgtasks');
      const compBox = document.getElementById('composer-box');
      const bgRect = bgBar?.getBoundingClientRect();
      const compRect = compBox?.getBoundingClientRect();
      const bgVisible = Boolean(bgBar && !bgBar.hidden && bgRect && bgRect.height > 20);
      const bgWidthMatchesComposer = Boolean(
        bgRect && compRect &&
        Math.abs(bgRect.width - compRect.width) <= 2 &&
        Math.abs(bgRect.left - compRect.left) <= 2 &&
        bgRect.width <= 862
      );

      // 3. Verify crisp vector .ui-chev SVGs and single-line #rail-conn-title + 24/7 Daemon badge
      const vectorChevCount = document.querySelectorAll('svg.ui-chev').length;
      const connTitleEl = document.getElementById('rail-conn-title');
      const connSubEl = document.getElementById('rail-conn-sub');
      const connTitleSingleLine = Boolean(connTitleEl && connTitleEl.clientHeight <= 20);
      const connSubHasDaemon = String(connSubEl?.textContent || '').includes('24/7 Daemon');

      // 4. Verify #model-picker-popover is position:fixed, opens below header button without clipping, and above composer button
      const headerBtn = document.getElementById('chat-model-picker-btn');
      headerBtn?.click();
      await new Promise((r) => setTimeout(r, 25));
      const pop = document.getElementById('model-picker-popover');
      const popStyle = pop ? getComputedStyle(pop) : null;
      const popFixed = popStyle?.position === 'fixed';
      const popRectHeader = pop?.getBoundingClientRect();
      const headerRect = headerBtn?.getBoundingClientRect();
      const anchoredBelowHeader = Boolean(
        popRectHeader && headerRect &&
        popRectHeader.top >= headerRect.bottom - 2 &&
        popRectHeader.bottom <= window.innerHeight - 4 &&
        pop.scrollHeight <= pop.clientHeight + 2
      );
      const comboItemsCount = pop ? pop.querySelectorAll('.vs-model-menu-item[data-select-model-combo]').length : 0;

      // Close and open from bottom #composer-model-btn -> must anchor ABOVE composer pill
      const compBtn = document.getElementById('composer-model-btn');
      compBtn?.click();
      await new Promise((r) => setTimeout(r, 25));
      const popRectComp = pop?.getBoundingClientRect();
      const compBtnRect = compBtn?.getBoundingClientRect();
      const anchoredAboveComposer = Boolean(
        pop && !pop.hidden && popRectComp && compBtnRect &&
        popRectComp.bottom <= compBtnRect.top + 4 &&
        popRectComp.top >= 4
      );

      // 1-click VS Code model combo selection: 'gemini-4-argon:low'
      pop?.querySelector('[data-select-model-combo="gemini-4-argon:low"]')?.click();
      await new Promise((r) => setTimeout(r, 25));
      const autoClosedAfterCombo = pop?.hidden === true;
      const pillAfterCombo = document.getElementById('chat-model-pill')?.textContent?.trim() || '';
      const compLabelAfterCombo = document.getElementById('composer-model-label')?.textContent?.trim() || '';

      // Negative #1: Inject hostile/bogus [data-select-model-combo] and click it -> must NOT mutate state or execute XSS
      const bogusCombo = document.createElement('button');
      bogusCombo.setAttribute('data-select-model-combo', '<img src=x onerror="window.__XSS=620">:bogus');
      document.body.appendChild(bogusCombo);
      bogusCombo.click();
      bogusCombo.remove();
      await new Promise((r) => setTimeout(r, 20));
      const pillAfterHostileCombo = document.getElementById('chat-model-pill')?.textContent?.trim() || '';

      // Negative #2: PIN lock blocks [data-select-model-combo]
      const pinOverlay = document.getElementById('pin-overlay');
      if (pinOverlay) pinOverlay.hidden = false;
      pop?.querySelector('[data-select-model-combo="gemini-3.8-flash:high"]')?.click();
      await new Promise((r) => setTimeout(r, 20));
      const pillAfterPinCombo = document.getElementById('chat-model-pill')?.textContent?.trim() || '';
      if (pinOverlay) pinOverlay.hidden = true;

      // Leave popover open for Negative #3 narrow viewport clamping test
      headerBtn?.click();
      await new Promise((r) => setTimeout(r, 20));
      const headDisplay = pop?.querySelector('.vs-model-menu-head')
        ? getComputedStyle(pop.querySelector('.vs-model-menu-head')).display
        : '';
      const checkGutterWidth = pop?.querySelector('.vs-model-item-check')
        ? getComputedStyle(pop.querySelector('.vs-model-item-check')).width
        : '';
      const collapsedGroupChevTransform = document.querySelector('.ide-tree-group.collapsed .ide-chevron-sm .ui-chev')
        ? getComputedStyle(document.querySelector('.ide-tree-group.collapsed .ide-chevron-sm .ui-chev')).transform
        : 'none';

      return {
        m319HeaderPill,
        bgVisible,
        bgWidthMatchesComposer,
        vectorChevCount,
        connTitleSingleLine,
        connSubHasDaemon,
        popFixed,
        anchoredBelowHeader,
        comboItemsCount,
        anchoredAboveComposer,
        autoClosedAfterCombo,
        pillAfterCombo,
        compLabelAfterCombo,
        pillAfterHostileCombo,
        pillAfterPinCombo,
        headDisplay,
        checkGutterWidth,
        collapsedGroupChevTransform,
        xssTriggered: Boolean(window.__XSS),
        titleAttrsCount: document.querySelectorAll('[title]').length
      };
    })()`);

    // Negative #3: Resize to 320x568 with #model-picker-popover open -> must clamp inside 320px viewport with 0px overflow
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 320, height: 568, deviceScaleFactor: 2, mobile: true },
      sessionId
    );
    const v62NarrowClamp = await evalJs(`(async () => {
      window.dispatchEvent(new Event('resize'));
      await new Promise((r) => setTimeout(r, 30));
      const pop = document.getElementById('model-picker-popover');
      const rect = pop?.getBoundingClientRect();
      const clampedIn320 = Boolean(rect && rect.left >= 4 && rect.right <= 316 && rect.bottom <= 564);
      const docOverflowX = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      const composerExpandedAfterEsc = document.getElementById('composer-model-btn')?.getAttribute('aria-expanded');
      return { clampedIn320, docOverflowX, composerExpandedAfterEsc };
    })()`);

    assert.strictEqual(v62DesktopResult.xssTriggered, false, 'v62 Negative #1: Hostile data-select-model-combo must never execute XSS');
    assert.strictEqual(v62DesktopResult.m319HeaderPill, 'Gemini 3.8 Flash (Medium)', 'MODEL_PLACEHOLDER_M319 must normalize to Gemini 3.8 Flash (Medium)');
    assert.strictEqual(v62DesktopResult.bgVisible, true, '#chat-live-bgtasks must be visible when session has running background tasks');
    assert.strictEqual(v62DesktopResult.bgWidthMatchesComposer, true, '#chat-live-bgtasks width and left edge must match #composer-box within <=2px (max 860px)');
    assert.ok(v62DesktopResult.vectorChevCount >= 8, `Expected >=8 crisp vector .ui-chev SVGs in DOM, got ${v62DesktopResult.vectorChevCount}`);
    assert.strictEqual(v62DesktopResult.connTitleSingleLine, true, '#rail-conn-title ("Theo Laptop · WS 1ms") must stay on 1 line without wrapping');
    assert.strictEqual(v62DesktopResult.connSubHasDaemon, true, '#rail-conn-sub must indicate 24/7 Daemon continuity');
    assert.strictEqual(v62DesktopResult.popFixed, true, '#model-picker-popover must use position:fixed so it is never clipped by #view-chat');
    assert.strictEqual(v62DesktopResult.anchoredBelowHeader, true, 'Model menu opened from header must anchor cleanly below #chat-model-picker-btn with 0 scroll clipping');
    assert.strictEqual(v62DesktopResult.comboItemsCount, 6, 'Antigravity VS Code model menu must list all 6 model+thinking combinations');
    assert.strictEqual(v62DesktopResult.anchoredAboveComposer, true, 'Model menu opened from composer must anchor cleanly above #composer-model-btn');
    assert.strictEqual(v62DesktopResult.autoClosedAfterCombo, true, '1-click [data-select-model-combo] must select and close menu immediately');
    assert.strictEqual(v62DesktopResult.pillAfterCombo, 'Gemini 4 Argon (Low)', '1-click combo must update #chat-model-pill to Gemini 4 Argon (Low)');
    assert.strictEqual(v62DesktopResult.compLabelAfterCombo, 'Gemini 4 Argon · Low', '1-click combo must update #composer-model-label to Gemini 4 Argon · Low');
    assert.strictEqual(v62DesktopResult.pillAfterHostileCombo, 'Gemini 4 Argon (Low)', 'v62 Negative #1: Bogus/hostile combo must be rejected without mutating selection');
    assert.strictEqual(v62DesktopResult.pillAfterPinCombo, 'Gemini 4 Argon (Low)', 'v62 Negative #2: PIN lock must block [data-select-model-combo] clicks');
    assert.strictEqual(v62DesktopResult.headDisplay, 'flex', '.vs-model-menu-head must render as display:flex');
    assert.strictEqual(v62DesktopResult.checkGutterWidth, '14px', '.vs-model-item-check must reserve a 14px check gutter');
    assert.strictEqual(v62DesktopResult.collapsedGroupChevTransform, 'none', 'Collapsed sidebar group chevron must not be double-rotated by CSS');
    assert.strictEqual(v62DesktopResult.titleAttrsCount, 0, 'Zero [title] attributes allowed anywhere in v62 DOM');
    assert.strictEqual(v62NarrowClamp.clampedIn320, true, 'v62 Negative #3: Fixed model menu must clamp inside 320px viewport on resize');
    assert.strictEqual(v62NarrowClamp.docOverflowX, 0, 'v62 Negative #3: 0px horizontal overflow at 320px with model menu open');
    assert.strictEqual(v62NarrowClamp.composerExpandedAfterEsc, 'false', '#composer-model-btn aria-expanded must reset to false on close');
    console.log('[PASS] Adversarial #13: v62 Constrained #chat-live-bgtasks Proportions, Vector .ui-chev SVGs, Floating VS Code Model Dropdown, MODEL_PLACEHOLDER_M* Parity & 3 Negative Guards verified');

    // ---------------------------------------------------------------------------
    // Adversarial Check #14: v63 VS Code-Grade Interactive Thinking & Execution Mode
    // (Live Activity Shimmer Bar + 6-Dot Step Rail, Zero Empty .turn-changeset-strip,
    // Rich Markdown Thought Steps, Clean ✂ compact Pill, User Context/Attachment Chips,
    // Interactive Step-Kind Filter Pills & >= 3 Negative Assertions)
    // ---------------------------------------------------------------------------
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
      sessionId
    );
    const v63Result = await evalJs(`(async () => {
      window.__XSS_V63 = false;
      const rawCache = JSON.parse(localStorage.getItem('theo_remote_cache_v3') || '{}');
      const state = rawCache.state || {};
      const rows = Array.isArray(state.rows) ? state.rows : [];
      const targetRow = rows.find((r) => r && r.id === 'sess-alpha') || rows[0];
      const targetId = targetRow ? targetRow.id : 'sess-alpha';
      if (targetRow) {
        targetRow.status = 'working';
        targetRow.dot = 'running';
      }
      rawCache.threads = rawCache.threads || {};
      rawCache.threads[targetId] = {
        id: targetId,
        provider: 'antigravity',
        title: 'Theo Avatar Redesign and Upgrade',
        status: 'working',
        liveActivity: {
          active: true,
          verb: 'Reading',
          target: 'core3d.js',
          file: 'core3d.js',
          relPath: 'js/core3d.js',
          lineRange: 'L1-L120',
          kind: 'read',
          stepCount: 3
        },
        messages: [
          {
            id: 'u-compact-1',
            role: 'user',
            createdAt: new Date(Date.now() - 300000).toISOString(),
            text: '/compact'
          },
          {
            id: 'cp-compact-1',
            role: 'checkpoint',
            createdAt: new Date(Date.now() - 290000).toISOString(),
            text: '# Resuming from a compaction\\nYou are continuing work on the task described above, but your prior context was compacted.\\n# Task Overview\\nAuditing SAPI grammar confidence and 3D avatar ear geometry.'
          },
          {
            id: 'u-ctx-1',
            role: 'user',
            createdAt: new Date(Date.now() - 240000).toISOString(),
            text: '[LIVE WORKSTATION CONTEXT — 09/11/2026, 19:25]\\n• Active Screen Window: VS Code\\n• Focused IDE Session: THEO\\n\\nthere are still many issues with thinking mode<img src=x onerror="window.__XSS_V63=true">\\n\\n[Attached Files saved on workstation]:\\n- Code-192516.png: \\'C:\\\\Users\\\\hbdei\\\\.claude\\\\theo-uploads\\\\Code-192516.png\\''
          },
          {
            id: 'a-live-work-1',
            role: 'assistant',
            createdAt: new Date(Date.now() - 15000).toISOString(),
            startedAt: new Date(Date.now() - 15000).toISOString(),
            status: 'RUNNING',
            text: '',
            thinking: 'Auditing **SAPI grammar** in \`TheoAvatarHost.cs\` and \`core3d.js\` <img src=x onerror="window.__XSS_V63=true">',
            thinkingDurationSec: 6,
            thoughtBlocks: [
              {
                id: 'th-v63-1',
                text: 'Inspecting **SAPI confidence** in \`TheoAvatarHost.cs\` <script>window.__XSS_V63=true</script>',
                durationSec: 3
              },
              {
                id: 'th-v63-2',
                text: 'Checking ear mesh geometry in \`core3d.js\` <img src=x onerror="window.__XSS_V63=true">',
                durationSec: 3
              }
            ],
            totalTurnTools: 3,
            toolCalls: [
              {
                id: 'tc-r1',
                name: 'read_file',
                kind: 'read',
                label: 'Viewed',
                file: 'TheoAvatarHost.cs',
                relPath: 'TheoAvatarHost.cs',
                summary: 'Read TheoAvatarHost.cs'
              },
              {
                id: 'tc-c1',
                name: 'run_command',
                kind: 'cmd',
                label: 'Ran command',
                command: 'dotnet build',
                summary: 'dotnet build'
              },
              {
                id: 'tc-r2',
                name: 'read_file',
                kind: 'read',
                label: 'Viewed',
                file: 'core3d.js',
                relPath: 'js/core3d.js',
                lineRange: 'L1-L120',
                summary: 'Read core3d.js (L1-L120)'
              }
            ]
          }
        ]
      };
      localStorage.setItem('theo_remote_cache_v3', JSON.stringify(rawCache));
      const prefs = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');
      prefs.activeTab = 'chat';
      prefs.selectedThreadId = targetId;
      prefs.composerMode = 'reply';
      localStorage.setItem('theo_remote_prefs_v1', JSON.stringify(prefs));
      location.reload();
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 650));

    const v63Verify = await evalJs(`(async () => {
      // Negative #1: Zero .turn-changeset-strip when working turn has only read/cmd steps (0 edited files)
      const changeSetCountOnReadOnlyTurn = document.querySelectorAll('#chat-stream .turn-changeset-strip').length;

      // Live Activity Bar & 6-Dot Vertical Step Rail
      const liveBar = document.querySelector('#chat-stream .vs-live-activity-bar[data-toggle-live-trace]');
      const railDotsCount = document.querySelectorAll('#chat-stream .vs-live-step-rail .vs-rail-dot').length;
      const liveVerbText = document.querySelector('#chat-stream .vs-live-verb')?.textContent?.trim() || '';
      const liveTargetText = document.querySelector('#chat-stream .vs-live-target-chip')?.textContent?.trim() || '';
      const hasElapsedBadge = Boolean(document.querySelector('#chat-stream .vs-live-elapsed[data-live-elapsed-start]'));

      // Clean ✂ compact checkpoint pill (stripped of "# Resuming from a compaction")
      const cpPillText = document.querySelector('#chat-stream .vs-checkpoint-pill')?.textContent?.replace(/\\s+/g, ' ').trim() || '';
      const hasCompactBadge = Boolean(document.querySelector('#chat-stream .vs-compact-badge'));
      const strippedBoilerplate = !cpPillText.includes('Resuming from a compaction') && !cpPillText.includes('continuing work on the task');

      // Clean User Bubble Context & Attachment Chips & /compact command pill
      const hasCompactCmdPill = Boolean(document.querySelector('#chat-stream .user-compact-cmd-pill'));
      const userCtxDetails = document.querySelector('#chat-stream details.user-ctx-chip');
      const userCtxCollapsedByDefault = Boolean(userCtxDetails && userCtxDetails.open === false);
      const userAttachChipText = document.querySelector('#chat-stream .user-attach-chip')?.textContent?.trim() || '';

      // Rich Markdown inside .vs-thought-step-text.md-rich
      const thoughtRichStrong = Boolean(document.querySelector('#chat-stream .vs-thought-step-text.md-rich strong'));
      const thoughtRichCode = Boolean(document.querySelector('#chat-stream .vs-thought-step-text.md-rich code'));

      // Clicking live activity bar toggles open both thinking & tools details and sets .is-expanded
      liveBar?.click();
      await new Promise((r) => setTimeout(r, 25));
      const thinkCard = document.querySelector('#chat-stream details.vs-thought-card');
      const toolsCard = document.querySelector('#chat-stream details.tools-details');
      const liveClickOpenedTrace = Boolean(thinkCard?.open && toolsCard?.open && liveBar?.classList.contains('is-expanded'));

      // Check Outline tab in Split Inspector strips [LIVE WORKSTATION CONTEXT] & "# Resuming from a compaction"
      const outlineTabBtn = document.querySelector('.insp-tab[data-insp-tab="outline"]');
      outlineTabBtn?.click();
      await new Promise((r) => setTimeout(r, 25));
      const outlineText = document.getElementById('split-inspector-body')?.textContent || '';
      const outlineClean =
        !outlineText.includes('LIVE WORKSTATION CONTEXT') &&
        !outlineText.includes('Resuming from a compaction');

      // Interactive Step-Kind Filter Pills (All / Reads / Cmds)
      const cmdFilterBtn = document.querySelector('#chat-stream [data-step-kind-filter="cmd"]');
      cmdFilterBtn?.click();
      await new Promise((r) => setTimeout(r, 20));
      const visibleStepsWhenCmd = Array.from(document.querySelectorAll('#chat-stream .code-step-card')).filter((el) => !el.hidden).length;
      const allFilterBtn = document.querySelector('#chat-stream [data-step-kind-filter="all"]');
      allFilterBtn?.click();
      await new Promise((r) => setTimeout(r, 20));
      const visibleStepsWhenAll = Array.from(document.querySelectorAll('#chat-stream .code-step-card')).filter((el) => !el.hidden).length;

      // Negative #3: PIN-lock quarantine blocks [data-step-kind-filter] & [data-toggle-live-trace]
      const pinOverlay = document.getElementById('pin-overlay');
      if (pinOverlay) pinOverlay.hidden = false;
      document.documentElement.classList.add('pin-locked-boot');
      cmdFilterBtn?.click();
      const visibleDuringPinLock = Array.from(document.querySelectorAll('#chat-stream .code-step-card')).filter((el) => !el.hidden).length;
      if (pinOverlay) pinOverlay.hidden = true;
      document.documentElement.classList.remove('pin-locked-boot');

      const docOverflowX = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
      const titleAttrsCount = document.querySelectorAll('[title]').length;

      return {
        changeSetCountOnReadOnlyTurn,
        hasLiveBar: Boolean(liveBar),
        railDotsCount,
        liveVerbText,
        liveTargetText,
        hasElapsedBadge,
        hasCompactBadge,
        strippedBoilerplate,
        hasCompactCmdPill,
        userCtxCollapsedByDefault,
        userAttachChipText,
        thoughtRichStrong,
        thoughtRichCode,
        liveClickOpenedTrace,
        outlineClean,
        visibleStepsWhenCmd,
        visibleStepsWhenAll,
        visibleDuringPinLock,
        xssTriggered: Boolean(window.__XSS_V63),
        docOverflowX,
        titleAttrsCount
      };
    })()`);

    assert.strictEqual(v63Verify.changeSetCountOnReadOnlyTurn, 0, 'v63 Negative #1: Read/cmd-only working turn must NOT render an empty .turn-changeset-strip box');
    assert.strictEqual(v63Verify.xssTriggered, false, 'v63 Negative #2: Hostile HTML in markdown thought blocks and user workstation context must never execute');
    assert.strictEqual(v63Verify.hasLiveBar, true, 'Active working turn must render VS Code .vs-live-activity-bar');
    assert.strictEqual(v63Verify.railDotsCount, 6, 'Active working turn must render 6-dot .vs-live-step-rail');
    assert.strictEqual(v63Verify.liveVerbText, 'Reading', 'Live activity bar must show progressive verb "Reading"');
    assert.ok(v63Verify.liveTargetText.includes('core3d.js'), `Expected liveTargetText to include core3d.js, got ${v63Verify.liveTargetText}`);
    assert.strictEqual(v63Verify.hasElapsedBadge, true, 'Live activity bar must render [data-live-elapsed-start] ticker');
    assert.strictEqual(v63Verify.hasCompactBadge, true, 'Checkpoint divider must render VS Code ✂ compact badge');
    assert.strictEqual(v63Verify.strippedBoilerplate, true, 'Checkpoint pill must strip "# Resuming from a compaction" boilerplate');
    assert.strictEqual(v63Verify.hasCompactCmdPill, true, '/compact user turn must render as .user-compact-cmd-pill');
    assert.strictEqual(v63Verify.userCtxCollapsedByDefault, true, '[LIVE WORKSTATION CONTEXT] must compact into a collapsed-by-default <details.user-ctx-chip>');
    assert.ok(v63Verify.userAttachChipText.includes('Code-192516.png'), 'Attached workstation file must render as compact .user-attach-chip');
    assert.strictEqual(v63Verify.thoughtRichStrong, true, 'Thought step text must render rich markdown <strong>');
    assert.strictEqual(v63Verify.thoughtRichCode, true, 'Thought step text must render rich markdown <code>');
    assert.strictEqual(v63Verify.liveClickOpenedTrace, true, 'Clicking .vs-live-activity-bar must expand thinking & tool steps and set .is-expanded');
    assert.strictEqual(v63Verify.outlineClean, true, 'Split Inspector Outline tab must strip [LIVE WORKSTATION CONTEXT] and compaction boilerplate');
    assert.strictEqual(v63Verify.visibleStepsWhenCmd, 1, 'Clicking [data-step-kind-filter="cmd"] must filter to the 1 command step');
    assert.strictEqual(v63Verify.visibleStepsWhenAll, 3, 'Clicking [data-step-kind-filter="all"] must restore all 3 steps');
    assert.strictEqual(v63Verify.visibleDuringPinLock, 3, 'v63 Negative #3: PIN lock must block [data-step-kind-filter] clicks');
    assert.strictEqual(v63Verify.docOverflowX, 0, '0px horizontal overflow on v63 Chat view');
    assert.strictEqual(v63Verify.titleAttrsCount, 0, 'Zero [title] attributes allowed in v63 DOM');
    console.log('[PASS] Adversarial #14: v63 VS Code-Grade Interactive Thinking & Execution Mode, Live Activity Shimmer Bar, Rich Thought Markdown, Compact Checkpoint/Context Chips & 3 Negative Guards verified');

    // Adversarial Check #15: v66 One-Tap Fleet Claude Permission Mode selector (Bypass | Auto | Plan) across Settings, Pulse, IDE Sidebar, #conn-modal, ⌘K & /mode-*, Store ack/rev anti-revert, rapid double-tap race guard, offline outbox dedup, & PIN-lock block
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false },
      sessionId
    );
    const v66Probe = await evalJs(`(async () => {
      const origFetch = window.fetch;
      const storePosts = [];
      let releaseFirstPost = null;

      // Seed paired Edge credentials pointing to a mock in-page store (intercepted before network)
      const prefsInit = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');
      prefsInit.edgeAccessKey = 'a'.repeat(64);
      prefsInit.edgeRelayUrl = 'wss://mock-edge.example.invalid/ws';
      prefsInit.activeTab = 'analytics';
      localStorage.setItem('theo_remote_prefs_v1', JSON.stringify(prefsInit));
      localStorage.removeItem('theo_remote_outbox_v1');

      // Navigate fresh to hydrate paired config cleanly under headless quarantine
      return true;
    })()`);
    assert.strictEqual(v66Probe, true);
    await cdp.send('Page.navigate', { url: `${baseUrl}/?nosse=1` }, sessionId);
    await new Promise((r) => setTimeout(r, 550));

    const v66Run = await evalJs(`(async () => {
      const origFetch = window.fetch;
      const storePatches = [];
      const localApiCalls = [];
      let lastConflictExpectedRev = null;
      let highestMockRev = 10;
      let shouldFailNetwork = false;
      let slowAutoPromise = null;
      let releaseSlowAuto = null;

      window.__THEO_ALLOW_PROBE_MOCK_FETCH = true;
      window.fetch = async (url, init) => {
        const uStr = String(url || '');
        if (uStr.endsWith('/store')) {
          if (shouldFailNetwork) {
            throw new Error('simulated_offline');
          }
          const body = JSON.parse(init?.body || '{}');
          if (body.op === 'patch' && body.patch?.claude_permission_mode) {
            const pObj = body.patch.claude_permission_mode;
            const pMode = pObj.defaultMode;
            storePatches.push(pMode);
            if (window.__SIMULATE_CAS_CONFLICT) {
              lastConflictExpectedRev = pObj.expectedRev;
              highestMockRev = Math.max(highestMockRev, 25);
              return new Response(
                JSON.stringify({
                  ok: true,
                  serverTime: Date.now(),
                  claude_permission_mode: {
                    defaultMode: 'bypassPermissions',
                    rev: 25,
                    updatedAt: Date.now() + 5000,
                    updatedBy: 'Workstation',
                    source: 'theo-hub'
                  }
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
              );
            }
            if (pMode === 'auto' && !slowAutoPromise) {
              slowAutoPromise = new Promise((r) => { releaseSlowAuto = r; });
              await slowAutoPromise;
            }
            highestMockRev += 1;
            const rev = highestMockRev;
            return new Response(
              JSON.stringify({
                ok: true,
                serverTime: Date.now(),
                claude_permission_mode: {
                  defaultMode: pMode,
                  rev,
                  updatedAt: Date.now(),
                  updatedBy: 'THEO Remote',
                  source: 'theo-remote'
                }
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return new Response(JSON.stringify({ ok: true, docs: {} }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        if (uStr.endsWith('/api/claude-permission-mode')) {
          const lBody = JSON.parse(init?.body || '{}');
          localApiCalls.push(lBody);
          return new Response(
            JSON.stringify({
              ok: true,
              defaultMode: lBody.defaultMode,
              claudePermissionMode: {
                defaultMode: lBody.defaultMode,
                rev: lBody.rev || 0,
                updatedAt: lBody.updatedAt || Date.now()
              }
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return origFetch(url, init);
      };

      try {
        // 1) Verify selector renders in Settings (#settings-claude-mode-card), Pulse (.quota-card), Desktop IDE Sidebar (.ide-acct-card), and #conn-modal
        document.querySelector('[data-tab="analytics"]')?.click();
        await new Promise((r) => setTimeout(r, 30));
        const settingsBtns = document.querySelectorAll('#settings-claude-mode-card [data-set-claude-mode]').length;

        document.querySelector('[data-tab="pulse"]')?.click();
        await new Promise((r) => setTimeout(r, 30));
        const pulseBtns = document.querySelectorAll('#view-pulse .quota-card [data-set-claude-mode]').length;

        document.querySelector('[data-tab="chat"]')?.click();
        await new Promise((r) => setTimeout(r, 30));
        const sidebarBtns = document.querySelectorAll('#ide-sidebar-accounts [data-set-claude-mode]').length;

        document.getElementById('rail-conn-btn')?.click();
        await new Promise((r) => setTimeout(r, 30));
        const modalBtns = document.querySelectorAll('#conn-modal [data-set-claude-mode]').length;
        document.getElementById('conn-modal-close')?.click();

        // 2) Rapid double-tap race guard: tap Auto (held in-flight) then immediately tap Plan -> Plan must win across all surfaces and Auto's late ack must NOT revert UI
        document.querySelector('[data-tab="analytics"]')?.click();
        await new Promise((r) => setTimeout(r, 25));
        document.querySelector('#settings-claude-mode-card [data-set-claude-mode="auto"]')?.click();
        await new Promise((r) => setTimeout(r, 15));
        document.querySelector('#settings-claude-mode-card [data-set-claude-mode="plan"]')?.click();
        await new Promise((r) => setTimeout(r, 15));
        if (releaseSlowAuto) releaseSlowAuto();
        await new Promise((r) => setTimeout(r, 90));

        const activeInSettingsAfterRace = document.querySelector('#settings-claude-mode-card [data-set-claude-mode][aria-pressed="true"]')?.dataset?.setClaudeMode || '';
        const activeInSidebarAfterRace = document.querySelector('#ide-sidebar-accounts [data-set-claude-mode][aria-pressed="true"]')?.dataset?.setClaudeMode || '';
        const storedPrefsAfterRace = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');

        // 3) Slash command /mode-bypass switches back to bypassPermissions
        document.querySelector('[data-tab="chat"]')?.click();
        await new Promise((r) => setTimeout(r, 30));
        const inp = document.getElementById('composer-input');
        inp.focus();
        inp.value = '/mode-bypass';
        inp.setSelectionRange(12, 12);
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 25));
        const slashHasModeBypass = Boolean(document.querySelector('#composer-slash-popover [data-slash-pick="0"]'));
        document.querySelector('#composer-slash-popover [data-slash-pick="0"]')?.click();
        await new Promise((r) => setTimeout(r, 70));
        const activeAfterSlash = document.querySelector('#ide-sidebar-accounts [data-set-claude-mode][aria-pressed="true"]')?.dataset?.setClaudeMode || '';

        // 3b) Stale-expectedRev CAS conflict rejection: Store returns rev=25 ('bypassPermissions') when tapping 'plan' -> UI reconciles immediately to 'bypassPermissions' and never broadcasts 'plan'
        localApiCalls.length = 0;
        window.__SIMULATE_CAS_CONFLICT = true;
        document.querySelector('#ide-sidebar-accounts [data-set-claude-mode="plan"]')?.click();
        await new Promise((r) => setTimeout(r, 75));
        window.__SIMULATE_CAS_CONFLICT = false;
        const activeAfterConflict = document.querySelector('#ide-sidebar-accounts [data-set-claude-mode][aria-pressed="true"]')?.dataset?.setClaudeMode || '';
        const localCallsDuringConflict = localApiCalls.length;
        const revAfterConflict = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}')?.claudePermissionMode?.rev || 0;

        // 3c) Dual-channel (cloudCfg + local HTTP bridge active simultaneously): 1 tap sends at most 1 /store patch and passes alreadyStored=true locally
        const pDual = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');
        pDual.connMode = 'local';
        pDual.customBridgeUrl = location.origin;
        localStorage.setItem('theo_remote_prefs_v1', JSON.stringify(pDual));
        document.getElementById('rail-conn-btn')?.click();
        await new Promise((r) => setTimeout(r, 20));
        document.querySelector('#conn-modal [data-conn-mode="local"]')?.click();
        await new Promise((r) => setTimeout(r, 25));
        document.getElementById('conn-modal-close')?.click();
        const patchesBeforeDual = storePatches.length;
        localApiCalls.length = 0;
        document.querySelector('#ide-sidebar-accounts [data-set-claude-mode="auto"]')?.click();
        await new Promise((r) => setTimeout(r, 85));
        const dualStoreDelta = storePatches.length - patchesBeforeDual;
        const dualLocalAlreadyStored = localApiCalls.length === 0 ? true : Boolean(localApiCalls[0]?.alreadyStored);

        // 4) Offline outbox deduplication: fail network and tap Auto then Plan -> only 1 deduplicated setClaudePermissionMode item in outbox
        shouldFailNetwork = true;
        const origLocalCallBehavior = true;
        window.fetch = async (url, init) => {
          if (shouldFailNetwork) throw new Error('simulated_offline');
          return origFetch(url, init);
        };
        document.querySelector('#ide-sidebar-accounts [data-set-claude-mode="auto"]')?.click();
        await new Promise((r) => setTimeout(r, 40));
        document.querySelector('#ide-sidebar-accounts [data-set-claude-mode="plan"]')?.click();
        await new Promise((r) => setTimeout(r, 50));
        const outboxWhileOffline = JSON.parse(localStorage.getItem('theo_remote_outbox_v1') || '[]');
        shouldFailNetwork = false;
        window.fetch = origFetch;

        // 4b) Foreground tap while offline outbox holds an older entry purges outbox immediately, and stale createdAt outbox item never overwrites newer state on online flush
        document.querySelector('#ide-sidebar-accounts [data-set-claude-mode="bypassPermissions"]')?.click();
        const outboxAfterForegroundPurge = JSON.parse(localStorage.getItem('theo_remote_outbox_v1') || '[]');
        await new Promise((r) => setTimeout(r, 75));
        const patchesBeforeStaleFlush = storePatches.length;
        localStorage.setItem(
          'theo_remote_outbox_v1',
          JSON.stringify([
            {
              id: 'cmd-claude-mode',
              type: 'setClaudePermissionMode',
              defaultMode: 'auto',
              createdAt: 1000,
              status: 'pending'
            }
          ])
        );
        window.dispatchEvent(new Event('online'));
        await new Promise((r) => setTimeout(r, 60));
        const activeAfterStaleOutbox =
          document.querySelector('#ide-sidebar-accounts [data-set-claude-mode][aria-pressed="true"]')?.dataset
            ?.setClaudeMode || '';
        const staleFlushPatches = storePatches.length - patchesBeforeStaleFlush;
        localStorage.removeItem('theo_remote_outbox_v1');

        // 4c) Unversioned rev=0 host snapshot with newer updatedAt must NEVER overwrite or poison versioned Store rev (Finding 2)
        document.querySelector('#ide-sidebar-accounts [data-set-claude-mode="plan"]')?.click();
        await new Promise((r) => setTimeout(r, 80));
        const revAtPlan = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}')?.claudePermissionMode?.rev || 0;
        const origStateFetch = window.fetch;
        window.fetch = async (url, init) => {
          const u = String(url || '');
          if (u.includes('/api/state')) {
            return new Response(
              JSON.stringify({
                ok: true,
                state: {
                  generatedAt: Date.now() + 20000,
                  device: { id: 'host-booting', name: 'BootingHost', role: 'host' },
                  claudePermissionMode: {
                    defaultMode: 'bypassPermissions',
                    rev: 0,
                    updatedAt: Date.now() + 20000,
                    source: 'shared_file'
                  },
                  rows: JSON.parse(localStorage.getItem('theo_remote_cache_v3') || '{}')?.snapshot?.rows || []
                }
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return origStateFetch(url, init);
        };
        document.getElementById('rail-conn-btn')?.click();
        await new Promise((r) => setTimeout(r, 15));
        document.getElementById('conn-modal-sync-now')?.click();
        await new Promise((r) => setTimeout(r, 85));
        document.getElementById('conn-modal-close')?.click();
        window.fetch = origStateFetch;
        const activeAfterRev0HostSnap =
          document.querySelector('#ide-sidebar-accounts [data-set-claude-mode][aria-pressed="true"]')?.dataset
            ?.setClaudeMode || '';
        const revAfterRev0HostSnap =
          JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}')?.claudePermissionMode?.rev || 0;

        // Restore bypassPermissions before PIN-lock check
        document.querySelector('#ide-sidebar-accounts [data-set-claude-mode="bypassPermissions"]')?.click();
        await new Promise((r) => setTimeout(r, 75));

        // 5) PIN-lock block: clicking [data-set-claude-mode="plan"] while PIN-locked must NOT change mode
        const pinOverlay = document.getElementById('pin-overlay');
        if (pinOverlay) pinOverlay.hidden = false;
        document.documentElement.classList.add('pin-locked-boot');
        document.querySelector('#ide-sidebar-accounts [data-set-claude-mode="plan"]')?.click();
        await new Promise((r) => setTimeout(r, 30));
        const activeWhilePinLocked = document.querySelector('#ide-sidebar-accounts [data-set-claude-mode][aria-pressed="true"]')?.dataset?.setClaudeMode || '';
        if (pinOverlay) pinOverlay.hidden = true;
        document.documentElement.classList.remove('pin-locked-boot');

        return {
          settingsBtns,
          pulseBtns,
          sidebarBtns,
          modalBtns,
          storePatches,
          activeInSettingsAfterRace,
          activeInSidebarAfterRace,
          storedRev: storedPrefsAfterRace.claudePermissionMode?.rev || 0,
          slashHasModeBypass,
          activeAfterSlash,
          lastConflictExpectedRev,
          activeAfterConflict,
          localCallsDuringConflict,
          revAfterConflict,
          dualStoreDelta,
          dualLocalAlreadyStored,
          outboxCount: outboxWhileOffline.length,
          outboxMode: outboxWhileOffline[0]?.defaultMode || '',
          outboxPurgedCount: outboxAfterForegroundPurge.length,
          activeAfterStaleOutbox,
          staleFlushPatches,
          revAtPlan,
          activeAfterRev0HostSnap,
          revAfterRev0HostSnap,
          activeWhilePinLocked,
          titlesCount: document.querySelectorAll('[title]').length,
          overflowX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
        };
      } finally {
        window.__SIMULATE_CAS_CONFLICT = false;
        window.__THEO_ALLOW_PROBE_MOCK_FETCH = false;
        window.fetch = origFetch;
      }
    })()`);

    assert.strictEqual(v66Run.settingsBtns, 3, 'Settings #settings-claude-mode-card must render 3 mode pills');
    assert.strictEqual(v66Run.pulseBtns, 3, 'Pulse active Claude quota card must render 3 mode pills');
    assert.strictEqual(v66Run.sidebarBtns, 3, 'Desktop IDE sidebar active Claude card must render 3 mode pills');
    assert.strictEqual(v66Run.modalBtns, 3, '#conn-modal must render 3 mode pills');
    assert.strictEqual(v66Run.activeInSettingsAfterRace, 'plan', 'Rapid Auto->Plan double-tap must settle on Plan in Settings');
    assert.strictEqual(v66Run.activeInSidebarAfterRace, 'plan', 'Rapid Auto->Plan double-tap must settle on Plan in IDE Sidebar');
    assert.ok(v66Run.storedRev >= 11, `Expected monotonic Store rev >= 11 persisted in prefs, got ${v66Run.storedRev}`);
    assert.strictEqual(v66Run.slashHasModeBypass, true, '/mode-bypass must appear in composer slash popover');
    assert.strictEqual(v66Run.activeAfterSlash, 'bypassPermissions', '/mode-bypass slash action must switch fleet mode to bypassPermissions');
    assert.ok(v66Run.lastConflictExpectedRev > 0, `Expected Store patch to send expectedRev > 0, got ${v66Run.lastConflictExpectedRev}`);
    assert.strictEqual(v66Run.activeAfterConflict, 'bypassPermissions', 'CAS conflict rejection must immediately reconcile UI back to authoritative Store mode');
    assert.strictEqual(v66Run.localCallsDuringConflict, 0, 'CAS conflict rejection must never broadcast rejected mode locally');
    assert.strictEqual(v66Run.revAfterConflict, 25, 'CAS conflict rejection must adopt authoritative Store rev=25');
    assert.strictEqual(v66Run.dualStoreDelta, 1, 'Dual-channel tap must send strictly 1 /store patch');
    assert.strictEqual(v66Run.dualLocalAlreadyStored, true, 'Dual-channel local fallback must pass alreadyStored=true');
    assert.strictEqual(v66Run.outboxCount, 1, 'Offline mode switches must deduplicate to a single outbox command');
    assert.strictEqual(v66Run.outboxMode, 'plan', 'Deduplicated offline outbox command must carry latest chosen mode (plan)');
    assert.strictEqual(v66Run.outboxPurgedCount, 0, 'Foreground mode tap must immediately purge any stale offline outbox mode item');
    assert.strictEqual(v66Run.activeAfterStaleOutbox, 'bypassPermissions', 'Stale createdAt outbox item must NOT overwrite newer foreground mode');
    assert.strictEqual(v66Run.staleFlushPatches, 0, 'Stale createdAt outbox item must NOT patch Store on reconnect');
    assert.ok(v66Run.revAtPlan > 0, 'Store-acked Plan switch must carry positive rev');
    assert.strictEqual(v66Run.activeAfterRev0HostSnap, 'plan', 'Unversioned rev=0 host snapshot must NEVER overwrite versioned Store mode');
    assert.strictEqual(v66Run.revAfterRev0HostSnap, v66Run.revAtPlan, 'Unversioned rev=0 host snapshot must preserve Store rev');
    assert.strictEqual(v66Run.activeWhilePinLocked, 'bypassPermissions', 'PIN lock must block [data-set-claude-mode] clicks');
    assert.strictEqual(v66Run.titlesCount, 0, 'Zero [title] attributes allowed on v66 mode controls');
    assert.strictEqual(v66Run.overflowX, 0, '0px horizontal overflow with v66 mode controls');
    console.log('[PASS] Adversarial #15: v66 Fleet Claude Permission Mode 1-tap selector, Store rev ack, double-tap race guard, /mode-* slash, offline dedup, & PIN-lock verified');

    // Adversarial #16: Zero-Terminal PC Setup Launcher & Fleet Readiness Pills
    await evalJs(`(() => {
      const rawCache = JSON.parse(localStorage.getItem('theo_remote_cache_v3') || '{}');
      const snap = rawCache.snapshot || rawCache.state || {};
      snap.devices = [
        {
          id: 'host-alpha',
          name: 'Alpha',
          online: true,
          sessionCount: 2,
          pcSetup: { ok: true, checkedAt: Date.now(), totalCount: 11, okCount: 11, pendingCount: 0, pendingIds: [], pendingTitles: [] }
        }
      ];
      if (rawCache.snapshot) rawCache.snapshot = snap;
      else rawCache.state = snap;
      localStorage.setItem('theo_remote_cache_v3', JSON.stringify(rawCache));
      const prefs = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');
      prefs.activeTab = 'pulse';
      prefs.edgeAccessKey = 'a'.repeat(64);
      prefs.edgeRelayUrl = 'wss://theo-edge-relay.husseinbdeir.workers.dev/ws';
      localStorage.setItem('theo_remote_prefs_v1', JSON.stringify(prefs));
      location.reload();
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 650));

    const pcSetupReadyCheck = await evalJs(`(async () => {
      const pulseCardWhenReady = Boolean(document.getElementById('pulse-pc-setup-card'));
      document.querySelector('[data-tab="analytics"]')?.click();
      await new Promise((r) => setTimeout(r, 35));
      const readyPillText = document.querySelector('#pairing-grid .fleet-setup-pill.is-ready')?.textContent?.trim() || '';
      return { pulseCardWhenReady, readyPillText };
    })()`);
    assert.strictEqual(pcSetupReadyCheck.pulseCardWhenReady, false, 'Pulse #pulse-pc-setup-card must stay hidden when all fleet PCs are 11/11 ready');
    assert.strictEqual(pcSetupReadyCheck.readyPillText, '✓ 11/11', 'Settings #pairing-grid must show ✓ 11/11 pill for ready PC');

    await evalJs(`(() => {
      const rawCache = JSON.parse(localStorage.getItem('theo_remote_cache_v3') || '{}');
      const snap = rawCache.snapshot || rawCache.state || {};
      snap.devices = [
        {
          id: 'host-beta',
          name: 'Beta',
          online: true,
          sessionCount: 3,
          pcSetup: {
            ok: false,
            checkedAt: Date.now(),
            totalCount: 11,
            okCount: 9,
            pendingCount: 2,
            pendingIds: ['claude-automode', 'pc-setup-shortcut'],
            pendingTitles: ['Claude AutoMode Rules', 'PC Setup Shortcut']
          }
        }
      ];
      if (rawCache.snapshot) rawCache.snapshot = snap;
      else rawCache.state = snap;
      localStorage.setItem('theo_remote_cache_v3', JSON.stringify(rawCache));
      const prefs = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');
      prefs.activeTab = 'pulse';
      localStorage.setItem('theo_remote_prefs_v1', JSON.stringify(prefs));
      location.reload();
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 650));

    const pcSetupVerify = await evalJs(`(async () => {
      const origFetch = window.fetch;
      let pairCreateCalled = 0;
      window.__THEO_ALLOW_PAIR_MOCK_FETCH = true;
      window.__THEO_CAPTURE_PC_SETUP_CMD = true;
      window.__THEO_CAPTURED_PC_SETUP = null;
      window.fetch = async (url, opts) => {
        const u = String(url || '');
        if (u.endsWith('/pair/create')) {
          pairCreateCalled += 1;
          return new Response(JSON.stringify({ ok: true, code: '739184', formatted: '739-184', expiresAt: Date.now() + 600000 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return origFetch(url, opts);
      };
      try {
        const pulseNoticeText = document.getElementById('pulse-pc-setup-card')?.textContent || '';
        const fleetChipSetupText = document.querySelector('#pulse-fleet-strip .fleet-chip-setup')?.textContent?.trim() || '';
        document.querySelector('[data-tab="analytics"]')?.click();
        await new Promise((r) => setTimeout(r, 40));
        const pendingPillText = document.querySelector('#pairing-grid .fleet-setup-pill.is-pending')?.textContent?.trim() || '';
        const dlBtn = document.getElementById('btn-download-pc-setup');
        const hasDownloadBtn = Boolean(dlBtn);
        dlBtn?.click();
        dlBtn?.click(); // rapid second click while in-flight/fresh must NOT mint a second code
        await new Promise((r) => setTimeout(r, 70));
        dlBtn?.click(); // immediate repeat within 15s reuse window must also reuse minted code
        await new Promise((r) => setTimeout(r, 40));
        const captured = window.__THEO_CAPTURED_PC_SETUP;
        const titleCount = document.querySelectorAll('[title]').length;
        const overflowX = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
        return {
          pulseNoticeText,
          fleetChipSetupText,
          pendingPillText,
          hasDownloadBtn,
          pairCreateCalled,
          captured,
          titleCount,
          overflowX
        };
      } finally {
        window.fetch = origFetch;
        delete window.__THEO_ALLOW_PAIR_MOCK_FETCH;
        delete window.__THEO_CAPTURE_PC_SETUP_CMD;
      }
    })()`);
    assert.ok(pcSetupVerify.pulseNoticeText.includes('Beta (9/11'), 'Pulse #pulse-pc-setup-card must display host name and 9/11 readiness when pending');
    assert.strictEqual(pcSetupVerify.fleetChipSetupText, '! 9/11', 'Pulse fleet chip must show ! 9/11 pill when pending');
    assert.strictEqual(pcSetupVerify.pendingPillText, '! 9/11', 'Settings #pairing-grid must show ! 9/11 pill when pending');
    assert.strictEqual(pcSetupVerify.hasDownloadBtn, true, '#pairing-grid must render #btn-download-pc-setup');
    assert.strictEqual(pcSetupVerify.pairCreateCalled, 1, 'Clicking Download PC Setup on a paired device must mint a single-use 6-digit code via /pair/create');
    assert.ok(pcSetupVerify.captured && pcSetupVerify.captured.fileName === 'Set-Up-THEO-PC.cmd', 'Download PC Setup must build Set-Up-THEO-PC.cmd');
    assert.ok(
      pcSetupVerify.captured.cmdText.includes('set "THEO_PAIR_CODE=739184"') &&
        pcSetupVerify.captured.cmdText.includes('Setup-THEO-PC.ps1') &&
        pcSetupVerify.captured.cmdText.includes('-Gui') &&
        pcSetupVerify.captured.cmdText.includes('MessageBox'),
      'Downloaded Set-Up-THEO-PC.cmd must carry THEO_PAIR_CODE=739184, launch Setup-THEO-PC.ps1 -Gui, and surface hidden-window bootstrap errors via MessageBox'
    );
    assert.strictEqual(
      /THEO_PAIR_TOKEN|edgeAccessKey|aaaa/i.test(pcSetupVerify.captured.cmdText),
      false,
      'Set-Up-THEO-PC.cmd must NEVER embed permanent THEO_PAIR_TOKEN or raw edgeAccessKey'
    );
    assert.strictEqual(pcSetupVerify.titleCount, 0, 'Zero [title] attributes allowed after PC setup UI render');
    assert.strictEqual(pcSetupVerify.overflowX, 0, '0px horizontal overflow after PC setup UI render');
    console.log('[PASS] Adversarial #16: Zero-Terminal PC Setup Launcher (6-digit single-use code, zero permanent secret) & Fleet Readiness Pills verified');

    // Adversarial #17: Full multi-pool quota bars (Gemini + Claude & GPT on Antigravity, plus usedPercent-only Fable on Claude) across Pulse and Desktop IDE Sidebar
    const quotaPoolVerify = await evalJs(`(async () => {
      document.querySelector('[data-tab="pulse"]')?.click();
      await new Promise((r) => setTimeout(r, 30));
      const pulseBars = Array.from(document.querySelectorAll('#view-pulse .quota-card .q-bar-row')).map((row) => ({
        label: row.querySelector('.q-bar-labels > span:first-child')?.textContent?.trim() || '',
        pct: row.querySelector('.q-pct')?.textContent?.trim() || '',
        reset: row.querySelector('.q-reset')?.textContent?.trim() || '',
        crit: Boolean(row.querySelector('.q-fill.crit'))
      }));
      document.querySelector('[data-tab="chat"]')?.click();
      await new Promise((r) => setTimeout(r, 30));
      const sidebarBars = Array.from(document.querySelectorAll('#ide-sidebar-accounts .ide-acct-card .ide-qrow')).map((row) => ({
        label: row.querySelector('.ide-qlbl')?.textContent?.trim() || '',
        pct: row.querySelector('.ide-qmeta strong')?.textContent?.trim() || '',
        reset: row.querySelector('.ide-qrst')?.textContent?.trim() || '',
        crit: Boolean(row.querySelector('.ide-qfill.crit'))
      }));
      return { pulseBars, sidebarBars };
    })()`);
    const expectedPairs = [
      ['Session (5hr)', '2%'],
      ['Weekly (7 day)', '88%'],
      ['Claude & GPT (5hr)', '91%'],
      ['Claude & GPT (7 day)', '0%'],
      ['Fable limit', '18%']
    ];
    for (const [expLabel, expPct] of expectedPairs) {
      const pMatch = quotaPoolVerify.pulseBars.find((b) => b.label === expLabel && b.pct === expPct);
      assert.ok(
        pMatch,
        `Pulse quota cards must render (${expLabel}, ${expPct}), got ${JSON.stringify(quotaPoolVerify.pulseBars)}`
      );
      const sMatch = quotaPoolVerify.sidebarBars.find((b) => b.label === expLabel && b.pct === expPct);
      assert.ok(
        sMatch,
        `Desktop IDE sidebar must render (${expLabel}, ${expPct}), got ${JSON.stringify(quotaPoolVerify.sidebarBars)}`
      );
    }
    const pulse3p5h = quotaPoolVerify.pulseBars.find((b) => b.label === 'Claude & GPT (5hr)');
    const side3p5h = quotaPoolVerify.sidebarBars.find((b) => b.label === 'Claude & GPT (5hr)');
    const pulse3p7d = quotaPoolVerify.pulseBars.find((b) => b.label === 'Claude & GPT (7 day)');
    const side3p7d = quotaPoolVerify.sidebarBars.find((b) => b.label === 'Claude & GPT (7 day)');
    assert.strictEqual(pulse3p5h.crit, true, 'Claude & GPT (5hr) >= 90% must render .crit bar on Pulse');
    assert.strictEqual(side3p5h.crit, true, 'Claude & GPT (5hr) >= 90% must render .crit bar on Desktop IDE sidebar');
    assert.strictEqual(pulse3p7d.reset, 'Window idle', 'Expired Claude & GPT (7 day) must show Window idle on Pulse');
    assert.strictEqual(side3p7d.reset, 'Idle', 'Expired Claude & GPT (7 day) must show compact Idle on Desktop IDE sidebar');

    // Pool distinction + hide/show toggle parity + stale-snapshot resistance + 90% alert muting across Pulse and Desktop IDE Sidebar
    const togglePoolVerify = await evalJs(`(async () => {
      document.querySelector('[data-tab="pulse"]')?.click();
      await new Promise((r) => setTimeout(r, 30));
      const badgeBeforeHide = document.getElementById('mobile-push-badge')?.textContent?.trim() || '';
      const pulsePoolCardCount = document.querySelectorAll('#view-pulse .q-pool-3p').length;
      const pulse3pFillCount = document.querySelectorAll('#view-pulse .q-pool-3p .q-fill.third-party').length;
      const pulseHideBtn = document.querySelector('#view-pulse .q-pool-3p [data-toggle-3p-quota="hide"]');
      pulseHideBtn?.click();
      await new Promise((r) => setTimeout(r, 40));
      const badgeWhileHidden = document.getElementById('mobile-push-badge')?.textContent?.trim() || '';
      const hiddenPulseLabels = Array.from(document.querySelectorAll('#view-pulse .quota-card .q-bar-labels > span:first-child')).map((el) => el.textContent?.trim() || '');
      const showBtnText = document.getElementById('btn-toggle-3p-quota')?.textContent?.trim() || '';

      // Inject a stale host /api/state snapshot with hideThirdPartyQuota=false while pending optimistic guard is active
      window.__THEO_ALLOW_PROBE_MOCK_FETCH = true;
      const origFetch = window.fetch;
      const rawCache = JSON.parse(localStorage.getItem('theo_remote_cache_v3') || '{}');
      const cachedSnap = rawCache.state || rawCache.snapshot || {};
      window.fetch = async (url, init) => {
        const u = String(url || '');
        if (u.includes('/api/state') || u.includes('/store')) {
          return new Response(
            JSON.stringify({
              ok: true,
              state: {
                ...cachedSnap,
                generatedAt: Date.now(),
                device: { id: 'host-stale', name: 'StalePeer', role: 'host' },
                hideThirdPartyQuota: false,
                hideThirdPartyQuotaUpdatedAt: Date.now() - 5000
              }
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return origFetch(url, init);
      };
      try {
        document.getElementById('rail-conn-btn')?.click();
        await new Promise((r) => setTimeout(r, 15));
        document.getElementById('conn-modal-sync-btn')?.click();
        await new Promise((r) => setTimeout(r, 85));
        document.getElementById('conn-modal-close')?.click();
      } finally {
        window.fetch = origFetch;
        window.__THEO_ALLOW_PROBE_MOCK_FETCH = false;
      }

      const stalePulseLabels = Array.from(document.querySelectorAll('#view-pulse .quota-card .q-bar-labels > span:first-child')).map((el) => el.textContent?.trim() || '');
      const prefsWhileHidden = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');

      document.querySelector('[data-tab="chat"]')?.click();
      await new Promise((r) => setTimeout(r, 30));
      const hiddenSideLabels = Array.from(document.querySelectorAll('#ide-sidebar-accounts .ide-qlbl')).map((el) => el.textContent?.trim() || '');
      const sideShowPillText = document.getElementById('ide-toggle-3p-pill')?.textContent?.trim() || '';
      const sidePoolBeforeRestore = document.querySelectorAll('#ide-sidebar-accounts .ide-qpool-3p').length;
      const badgeBeforeSideRestore = document.getElementById('mobile-push-badge')?.textContent?.trim() || '';
      document.getElementById('ide-toggle-3p-pill')?.click();
      await new Promise((r) => setTimeout(r, 40));
      const restoredSideLabels = Array.from(document.querySelectorAll('#ide-sidebar-accounts .ide-qlbl')).map((el) => el.textContent?.trim() || '');
      const restoredSidePoolCount = document.querySelectorAll('#ide-sidebar-accounts .ide-qpool-3p').length;
      const badgeAfterRestore = document.getElementById('mobile-push-badge')?.textContent?.trim() || '';
      const titleCount = document.querySelectorAll('[title]').length;
      const overflowX = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
      return {
        badgeBeforeHide,
        pulsePoolCardCount,
        pulse3pFillCount,
        badgeWhileHidden,
        hiddenPulseLabels,
        stalePulseLabels,
        prefsHideThirdPartyQuota: Boolean(prefsWhileHidden.hideThirdPartyQuota),
        showBtnText,
        hiddenSideLabels,
        sideShowPillText,
        sidePoolBeforeRestore,
        badgeBeforeSideRestore,
        restoredSideLabels,
        restoredSidePoolCount,
        badgeAfterRestore,
        titleCount,
        overflowX
      };
    })()`);
    assert.ok(togglePoolVerify.pulsePoolCardCount >= 1, 'Pulse must isolate Claude & GPT inside .q-pool-3p');
    assert.ok(togglePoolVerify.pulse3pFillCount >= 1, 'Non-critical Claude & GPT bar must use .third-party fill class');
    assert.ok(togglePoolVerify.hiddenPulseLabels.includes('Session (5hr)') && togglePoolVerify.hiddenPulseLabels.includes('Weekly (7 day)'), 'Hiding 3P must keep Gemini quota bars on Pulse');
    assert.strictEqual(togglePoolVerify.hiddenPulseLabels.some((l) => /Claude\s*&\s*GPT/i.test(l)), false, 'Hiding 3P must remove Claude & GPT bars from Pulse');
    assert.strictEqual(togglePoolVerify.stalePulseLabels.some((l) => /Claude\s*&\s*GPT/i.test(l)), false, 'Stale incoming /api/state snapshot with hideThirdPartyQuota=false must NOT revert optimistic hide toggle');
    assert.strictEqual(togglePoolVerify.prefsHideThirdPartyQuota, true, 'Persisted prefs.hideThirdPartyQuota must stay true despite stale host snapshot');
    assert.strictEqual(Number(togglePoolVerify.badgeBeforeHide || 0), Number(togglePoolVerify.badgeWhileHidden || 0) + 1, 'Hiding 3P >= 90% bar must decrement the quota alert badge count by 1');
    assert.strictEqual(togglePoolVerify.showBtnText, 'Show Claude & GPT', 'Pulse header button must switch to Show Claude & GPT when hidden');
    assert.strictEqual(togglePoolVerify.hiddenSideLabels.some((l) => /Claude\s*&\s*GPT/i.test(l)), false, 'Hiding 3P must remove Claude & GPT bars from Desktop IDE sidebar');
    assert.strictEqual(togglePoolVerify.sidePoolBeforeRestore, 0, 'Desktop IDE sidebar must not render .ide-qpool-3p while hidden');
    assert.strictEqual(togglePoolVerify.sideShowPillText, '+ 3P', 'Desktop IDE sidebar header must show + 3P pill when hidden');
    assert.ok(togglePoolVerify.restoredSideLabels.includes('Claude & GPT (5hr)') && togglePoolVerify.restoredSideLabels.includes('Claude & GPT (7 day)'), 'Clicking + 3P must restore Claude & GPT bars');
    assert.ok(togglePoolVerify.restoredSidePoolCount >= 1, 'Restoring 3P must re-render .ide-qpool-3p in Desktop IDE sidebar');
    assert.strictEqual(Number(togglePoolVerify.badgeAfterRestore || 0), Number(togglePoolVerify.badgeBeforeSideRestore || 0) + 1, 'Restoring 3P >= 90% bar must increment the quota alert badge count by 1');
    assert.strictEqual(togglePoolVerify.titleCount, 0, 'Zero [title] attributes allowed after pool toggle');
    assert.strictEqual(togglePoolVerify.overflowX, 0, '0px horizontal overflow after pool toggle');
    console.log('[PASS] Adversarial #17: Antigravity Gemini vs Claude & GPT pool distinction, hide/show toggle, and Claude Fable (usedPercent fallback) parity verified across Pulse and Desktop IDE Sidebar');

    // Adversarial #18: v71 Unsaved work per PC at the top of Workspaces (carried on each fleet device like pcSetup),
    // on an iPhone viewport: 50-folder cap with "+N more", 24 h+ marking, all-saved line, stale-report line,
    // no report = nothing, XSS-safe, notification tap and cold ?tab=workspaces both land on the block.
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 390, height: 844, deviceScaleFactor: 3, mobile: true },
      sessionId
    );
    const seedUnsaved = (withData) => `(() => {
      const now = Date.now();
      const rawCache = JSON.parse(localStorage.getItem('theo_remote_cache_v3') || '{}');
      const snap = rawCache.snapshot || rawCache.state || {};
      const items = [];
      for (let i = 0; i < 50; i++) {
        items.push({
          repo: i === 3 ? 'isabi-app' : 'repo' + i,
          branch: i === 3 ? '<img src=x onerror="window.__uwXss=1">' : 'wt/very-long-branch-name-for-folder-number-' + i,
          where: i % 2 ? 'shared worktree' : 'Claude session 203ca257',
          why: (i + 1) + ' uncommitted file(s)',
          path: '~\\\\bhfirms\\\\.worktrees\\\\a-really-long-worktree-folder-name-that-must-wrap-on-a-phone-' + i,
          idleHours: 62 - i,
          stale: 62 - i >= 24
        });
      }
      const withUw = ${withData ? 'true' : 'false'};
      snap.devices = [
        { id: 'host-delta', name: 'Delta', online: false, sessionCount: 0,
          unsavedWork: withUw ? { checkedAt: now - 5 * 3600000, staleHours: 24, unsavedCount: 2, staleCount: 1, unchecked: 0,
            items: [
              { repo: 'pos', branch: 'wt/till', where: 'Antigravity session', why: '2 commit(s) not pushed to GitHub', path: '~\\\\bhfirms\\\\pos', idleHours: 30, stale: true },
              { repo: 'fitness', branch: 'main', where: 'main checkout', why: '1 uncommitted file(s)', path: '~\\\\bhfirms\\\\fitness', idleHours: 2, stale: false }
            ] } : null },
        { id: 'host-beta', name: 'Beta', online: true, sessionCount: 1,
          unsavedWork: withUw ? { checkedAt: now - 3 * 3600000 - 60000, staleHours: 24, unsavedCount: 0, staleCount: 0, unchecked: 0, items: [] } : null },
        { id: 'host-gamma', name: 'Gamma', online: true, sessionCount: 1, unsavedWork: null },
        { id: 'host-alpha', name: 'Alpha', online: true, sessionCount: 2,
          unsavedWork: withUw ? { checkedAt: now - 5 * 60000, staleHours: 24, unsavedCount: 55, staleCount: 42, unchecked: 0, items } : null }
      ];
      if (snap.device) snap.device = { ...snap.device, unsavedWork: null };
      if (rawCache.snapshot) rawCache.snapshot = snap;
      else rawCache.state = snap;
      localStorage.setItem('theo_remote_cache_v3', JSON.stringify(rawCache));
      const prefs = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');
      prefs.activeTab = 'pulse';
      localStorage.setItem('theo_remote_prefs_v1', JSON.stringify(prefs));
      // The evening unsaved-work push as the app's notification ledger records it (same fields theo-hub sends).
      const log = JSON.parse(localStorage.getItem('theo_remote_notifications_v1') || '[]');
      const keep = Array.isArray(log) ? log.filter((x) => x && x.id !== 'theo-unsaved-test') : [];
      keep.unshift({
        id: 'theo-unsaved-test',
        tag: 'theo-unsaved-2026-11-13-host-alpha',
        title: 'Unsaved work on Alpha',
        body: '42 folders with unsaved work untouched 24 h+: isabi-app wt/x (Claude session 203ca257) and 41 more. Push or clear it on purpose.',
        tab: 'workspaces',
        url: './?tab=workspaces',
        at: now,
        ts: now,
        checked: false
      });
      localStorage.setItem('theo_remote_notifications_v1', JSON.stringify(keep));
      return true;
    })()`;
    await evalJs(seedUnsaved(true));
    await cdp.send('Page.navigate', { url: `${baseUrl}/?nosse=1` }, sessionId);
    await new Promise((r) => setTimeout(r, 900));
    const uwProbe = (label) => `(async () => {
      const panel = document.getElementById('unsaved-work-panel');
      const pcIds = Array.from(document.querySelectorAll('#unsaved-work-panel .uw-pc')).map((el) => el.dataset.uwPc);
      const alpha = document.querySelector('#unsaved-work-panel .uw-pc[data-uw-pc="host-alpha"]');
      const beta = document.querySelector('#unsaved-work-panel .uw-pc[data-uw-pc="host-beta"]');
      const delta = document.querySelector('#unsaved-work-panel .uw-pc[data-uw-pc="host-delta"]');
      const rect = panel ? panel.getBoundingClientRect() : null;
      const rows = Array.from(document.querySelectorAll('#unsaved-work-panel .uw-pc, #unsaved-work-panel .uw-item'));
      const maxRight = rows.reduce((m, el) => Math.max(m, el.getBoundingClientRect().right), 0);
      return {
        activeTab: document.querySelector('.view-pane.active')?.dataset?.view || '',
        hidden: panel ? panel.hidden : null,
        panelTop: rect ? Math.round(rect.top) : -1,
        panelVisible: Boolean(rect && rect.height > 0 && rect.top >= 0 && rect.top < window.innerHeight - 120),
        headText: document.querySelector('#unsaved-work-panel .uw-total')?.textContent?.trim() || '',
        pcIds,
        alphaItems: alpha ? alpha.querySelectorAll('.uw-item').length : 0,
        alphaVisibleItems: alpha ? alpha.querySelectorAll(':scope > .uw-list > .uw-item').length : 0,
        alphaStale: alpha ? alpha.querySelectorAll('.uw-item.is-stale').length : 0,
        alphaStalePill: alpha?.querySelector('.uw-item.is-stale .uw-stale-pill')?.textContent?.trim() || '',
        alphaMoreSum: alpha?.querySelector('.uw-more-sum')?.textContent?.trim() || '',
        alphaOverflow: alpha?.querySelector('.uw-overflow')?.textContent?.trim() || '',
        alphaChecked: alpha?.querySelector('.uw-checked')?.textContent?.trim() || '',
        alphaFirstIdle: alpha?.querySelector('.uw-item .uw-idle')?.textContent?.trim() || '',
        alphaFirstOwner: alpha?.querySelector('.uw-item .uw-line2')?.textContent?.trim() || '',
        betaText: beta ? beta.textContent.replace(/\\s+/g, ' ').trim() : '',
        betaClean: Boolean(beta && beta.classList.contains('is-clean')),
        deltaChecked: delta?.querySelector('.uw-checked.is-old')?.textContent?.trim() || '',
        xssFired: Boolean(window.__uwXss),
        imgInPanel: document.querySelectorAll('#unsaved-work-panel img').length,
        escapedBranch: Array.from(document.querySelectorAll('#unsaved-work-panel .uw-branch')).some((el) => el.textContent.includes('<img')),
        maxRight: Math.round(maxRight),
        overflowX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
        titleCount: document.querySelectorAll('[title]').length
      };
    })()`;
    // (a) The app is open on Pulse; the unsaved-work notification is tapped. Under ?nosse=1 there is no Service
    // Worker, so tap it in the app's own Notification Center: both paths end in applyNotificationNav(tab: 'workspaces').
    const uwBeforeTap = await evalJs(`document.querySelector('.view-pane.active')?.dataset?.view || ''`);
    const uwTapped = await evalJs(`(async () => {
      document.querySelector('[data-push-act="header-bell"]')?.click();
      await new Promise((r) => setTimeout(r, 60));
      const row = document.querySelector('[data-notif-open="theo-unsaved-test"]');
      if (!row) return false;
      row.click();
      return true;
    })()`);
    assert.strictEqual(uwTapped, true, 'The unsaved-work notification is listed in the Notification Center');
    await new Promise((r) => setTimeout(r, 400));
    const uwTap = await evalJs(uwProbe('tap'));
    if (process.env.THEO_PWA_SHOT_DIR) {
      // Opt-in visual check of the iPhone layout: THEO_PWA_SHOT_DIR=<folder> node scripts/verify_theo_pwa.cjs
      for (const theme of ['dark', 'light']) {
        await evalJs(`(() => { document.documentElement.setAttribute('data-theme', '${theme}'); return true; })()`);
        await new Promise((r) => setTimeout(r, 60));
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
        fs.writeFileSync(path.join(process.env.THEO_PWA_SHOT_DIR, `unsaved-work-390-${theme}.png`), Buffer.from(shot.data, 'base64'));
      }
    }
    assert.strictEqual(uwBeforeTap, 'pulse', 'Unsaved-work check starts on Pulse');
    assert.strictEqual(uwTap.activeTab, 'workspaces', 'The unsaved-work notification tap must open the Workspaces tab');
    assert.strictEqual(uwTap.hidden, false, '#unsaved-work-panel must be shown when a PC reports unsaved work');
    assert.strictEqual(uwTap.panelVisible, true, `#unsaved-work-panel must be on screen after the tap (top ${uwTap.panelTop})`);
    assert.deepStrictEqual(uwTap.pcIds, ['host-alpha', 'host-delta', 'host-beta'], 'PCs with idle 24 h+ folders first; a PC with no report (Gamma) is not listed');
    assert.strictEqual(uwTap.headText, '57 folders on 2 PCs · 43 idle 24 h+', 'Panel head totals folders and 24 h+ folders across PCs');
    assert.strictEqual(uwTap.alphaItems, 50, 'All 50 sent folders of a PC are listed');
    assert.strictEqual(uwTap.alphaVisibleItems, 8, 'Only the first 8 show before "Show N more"');
    assert.strictEqual(uwTap.alphaMoreSum, 'Show 42 more');
    assert.strictEqual(uwTap.alphaOverflow, '+5 more on Alpha (not listed)', 'Beyond the 50-folder cap the PC says +N more');
    assert.strictEqual(uwTap.alphaStale, 39, 'Folders idle 24 h+ are marked (and only those)');
    assert.strictEqual(uwTap.alphaStalePill, '24 h+');
    assert.strictEqual(uwTap.alphaFirstIdle, 'idle 3 d');
    assert.strictEqual(uwTap.alphaFirstOwner, 'Claude session 203ca257 · 1 uncommitted file(s)', 'Each folder names its owner and why it is unsaved');
    assert.strictEqual(uwTap.alphaChecked, '', 'A fresh report (5 min) shows no "last checked" line');
    assert.ok(uwTap.betaClean && /Beta all saved last checked 3h ago/.test(uwTap.betaText), `A PC with nothing unsaved shows one quiet line with the stale-report time: "${uwTap.betaText}"`);
    assert.strictEqual(uwTap.deltaChecked, 'last checked 5h ago', 'A report older than 2 h says when it was last checked');
    assert.strictEqual(uwTap.xssFired, false, 'Branch names are escaped (no script runs)');
    assert.strictEqual(uwTap.imgInPanel, 0, 'No injected element in the panel');
    assert.strictEqual(uwTap.escapedBranch, true, 'The escaped branch text is shown literally');
    assert.ok(uwTap.maxRight <= 390, `Every PC block and folder row fits the 390 px phone width (right edge ${uwTap.maxRight})`);
    assert.strictEqual(uwTap.overflowX, 0, '0px horizontal overflow with the unsaved-work panel at 390 px');
    assert.strictEqual(uwTap.titleCount, 0, 'Zero [title] attributes with the unsaved-work panel');

    // (b) "Show 42 more" stays open across a re-render.
    const uwKeepOpen = await evalJs(`(async () => {
      const det = document.querySelector('#unsaved-work-panel .uw-more[data-uw-more="host-alpha"]');
      det.open = true;
      await new Promise((r) => setTimeout(r, 30));
      document.querySelector('.mobile-bottom-dock [data-tab="pulse"]')?.click();
      await new Promise((r) => setTimeout(r, 30));
      document.querySelector('.mobile-bottom-dock [data-tab="workspaces"]')?.click();
      await new Promise((r) => setTimeout(r, 60));
      const again = document.querySelector('#unsaved-work-panel .uw-more[data-uw-more="host-alpha"]');
      return { open: Boolean(again && again.open), overflowX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth) };
    })()`);
    assert.strictEqual(uwKeepOpen.open, true, 'An opened "Show N more" stays open after the tab re-renders');
    assert.strictEqual(uwKeepOpen.overflowX, 0, '0px horizontal overflow with every folder expanded');

    // (c) Cold start from the notification URL (app closed): ?tab=workspaces lands on the block.
    await cdp.send('Page.navigate', { url: `${baseUrl}/?tab=workspaces&nosse=1` }, sessionId);
    await new Promise((r) => setTimeout(r, 900));
    const uwCold = await evalJs(uwProbe('cold'));
    assert.strictEqual(uwCold.activeTab, 'workspaces', 'Cold ?tab=workspaces opens the Workspaces tab');
    assert.strictEqual(uwCold.panelVisible, true, `Cold start shows #unsaved-work-panel on screen (top ${uwCold.panelTop})`);
    assert.strictEqual(uwCold.alphaItems, 50);

    // (d) No PC has a report (older builds, or none yet): the panel stays hidden.
    await evalJs(seedUnsaved(false));
    await cdp.send('Page.navigate', { url: `${baseUrl}/?tab=workspaces&nosse=1` }, sessionId);
    await new Promise((r) => setTimeout(r, 900));
    const uwEmpty = await evalJs(uwProbe('empty'));
    assert.strictEqual(uwEmpty.activeTab, 'workspaces');
    assert.strictEqual(uwEmpty.hidden, true, '#unsaved-work-panel is hidden when no PC has a report');
    assert.deepStrictEqual(uwEmpty.pcIds, []);
    assert.strictEqual(uwEmpty.overflowX, 0);
    console.log('[PASS] Adversarial #18: v71 Unsaved work per PC on Workspaces (50 cap +N more, 24 h+ marks, all-saved & stale-report lines, XSS-safe, tap & cold-start landing at 390 px)');

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
