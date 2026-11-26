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
        if (u.pathname === '/api/deliverable-preview') {
          const reqPath = String(u.searchParams.get('path') || '').trim();
          const page = Math.max(1, Number(u.searchParams.get('page') || 1));
          if (!reqPath || reqPath.includes('..') || /\.(env|dev\.vars|sqlite)/i.test(reqPath) || reqPath.includes('bank-kyc-ali-bdeir')) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Blocked sensitive deliverable path' }));
            return;
          }
          if (reqPath.includes('deck_err') && page === 2) {
            res.writeHead(500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify({ ok: false, error: 'Page 2 failed to rasterize' }));
            return;
          }
          const isHtml = /\.html?$/i.test(reqPath);
          const isPptx = /\.pptx$/i.test(reqPath);
          const isPdf = /\.pdf$/i.test(reqPath);
          const samplePngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          if (isHtml) {
            res.end(JSON.stringify({
              ok: true,
              kind: 'html',
              file: path.basename(reqPath),
              relPath: reqPath,
              size: 1200,
              sourceHtml: '<!doctype html><html><body><h1>Demo Prototype</h1></body></html>',
              sandboxedHtml: '<!doctype html><html><body><h1 id="proto-h1">Demo Prototype</h1></body></html>'
            }));
          } else {
            res.end(JSON.stringify({
              ok: true,
              kind: isPptx ? 'pptx' : isPdf ? 'pdf' : 'pdf',
              sourceKind: isPptx ? 'sibling-pdf' : 'pdf',
              file: path.basename(reqPath),
              relPath: reqPath,
              size: 4096,
              pageCount: 3,
              page,
              width: 1920,
              height: 1080,
              pageMime: 'image/png',
              pageImageBase64: samplePngB64
            }));
          }
          return;
        }
        if (u.pathname === '/api/deliverable-raw') {
          res.writeHead(200, { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' });
          res.end('%PDF-1.4\n%%EOF\n');
          return;
        }
        if (u.pathname === '/api/open-deliverable-app') {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ ok: true, mode: 'dryRun', file: 'TransRep_Demo.pptx' }));
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
    ['index.html endpoints.js', indexSrc, /js\/endpoints\.js\?v=(\d+)/g],
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

  // Static/VM deliverable checks: multi-device bridge isolation, WS chunk continuation & :line parsing
  {
    const vm = require('vm');
    const appText = fs.readFileSync(path.join(REPO_ROOT, 'js', 'app.js'), 'utf8');
    const fnStart = appText.indexOf('function revokeActiveDeliverableBlobs()');
    const fnEnd = appText.indexOf('function getThreadOpenDetailsMap(');
    const fnStart2 = appText.indexOf('function parsePreviewTargetClient(');
    const fnEnd2 = appText.indexOf('function collectSessionTouchedFiles(');
    const fnStart3 = appText.indexOf('async function reassembleChunkedDeliverable(');
    const fnEnd3 = appText.indexOf('async function openActiveDeliverableInApp(');
    assert.ok(fnStart > 0 && fnEnd > fnStart && fnStart2 > 0 && fnEnd2 > fnStart2 && fnStart3 > 0 && fnEnd3 > fnStart3);
    const dlvSlice = [
      appText.slice(fnStart, fnEnd),
      appText.slice(fnStart2, fnEnd2),
      appText.slice(fnStart3, fnEnd3),
      'this.__dlvApi = { revokeActiveDeliverableBlobs, fetchDeliverableFromVaultR2, parsePreviewTargetClient, reassembleChunkedDeliverable, fetchDeliverablePreview, blobMap, deliverablePreviewCache, deliverablePageCache, activeDeliverableBlobUrls };'
    ].join('\n');
    const httpCalls = [];
    const wsCalls = [];
    const revoked = [];
    const blobMap = new Map();
    const vmBox = {
      URL: {
        createObjectURL: (b) => { const u = `blob:mock-${blobMap.size + 1}`; blobMap.set(u, b); return u; },
        revokeObjectURL: (u) => { revoked.push(u); blobMap.delete(u); }
      },
      Blob: function MockBlob(parts, opts) { this.parts = parts; this.type = opts?.type || ''; },
      Uint8Array,
      TextDecoder,
      TextEncoder,
      atob: (s) => Buffer.from(s, 'base64').toString('binary'),
      btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
      window: { THEO_CLOUD_CFG: { memoryVaultUrl: 'https://memory.example.workers.dev' }, __THEO_ALLOW_PROBE_MOCK_FETCH: true },
      document: { currentScript: null },
      $: () => null,
      connMode: 'local',
      localBridgeBase: 'http://127.0.0.1:4318',
      localWsDevice: { id: 'dev-local' },
      localWsAuthed: false,
      localWs: null,
      edgeWsAuthed: true,
      edgeWs: { readyState: 1 },
      prefs: { activeTab: 'chat', inspectorOpen: true, selectedThreadId: 's-rem', customBridgeUrl: '' },
      appState: { rows: [{ id: 's-rem', deviceId: 'dev-remote-mac', folder: 'ws1' }] },
      threadsCache: {},
      cloudCfg: { edgeAccessKey: 'k'.repeat(64) },
      refreshCloudConfig: () => ({ edgeAccessKey: 'k'.repeat(64) }),
      getEdgeStoreKeyHex: () => 'deadbeef',
      isHeadlessBrowser: false,
      inspectorFetchSeq: 0,
      activeInspectorFileTarget: 'deck.pdf',
      deliverablePreviewCache: new Map(),
      deliverablePageCache: new Map(),
      deliverableInFlightKeys: new Set(),
      activeDeliverableBlobUrls: new Set(),
      isNewSessionMode: () => false,
      resolveStudioWorkspaceId: (ws) => String(ws || 'memory'),
      coalesceThreadMessages: () => [],
      renderSplitInspector: () => {},
      authFetchLocal: async (u) => { httpCalls.push(u); return { ok: true, json: async () => ({ ok: true }) }; },
      sendWsRpc: async (_ws, body) => {
        wsCalls.push(body);
        if (body.cmd?.type === 'getDeliverableChunk') {
          return { ok: true, chunkBase64: Buffer.from('</body></html>').toString('base64'), nextOffset: 24, done: true };
        }
        return { ok: true, kind: 'pdf', file: 'deck.pdf', pageCount: 1, page: 1, pageImageBase64: 'AA==' };
      },
      fetch: async (u) => {
        if (String(u).includes('/api/file/raw?')) {
          return {
            ok: true,
            headers: { get: () => '' },
            arrayBuffer: async () => new TextEncoder().encode('%PDF-1.4\n%%EOF\n').buffer
          };
        }
        return { ok: false };
      },
      blobMap
    };
    vm.runInNewContext(dlvSlice, vmBox, { filename: 'app-deliverable-extract.js' });
    const api = vmBox.__dlvApi;

    assert.strictEqual(api.parsePreviewTargetClient('TransRep_Deck.pdf:2').filePath, 'TransRep_Deck.pdf');
    assert.strictEqual(api.parsePreviewTargetClient('AEG/proto.html:42').filePath, 'AEG/proto.html');
    assert.strictEqual(api.parsePreviewTargetClient('AEG/proto.html:10-20').startLine, 10);

    // Multi-device isolation: remote session with connMode==='local' must dispatch over Edge WS, never localBridgeBase HTTP
    await api.fetchDeliverablePreview('remote_deck.pdf', { id: 's-rem', deviceId: 'dev-remote-mac', folder: 'ws1' }, { page: 1 });
    assert.strictEqual(httpCalls.length, 0, 'Remote-device deliverable must NEVER query localBridgeBase HTTP');
    assert.strictEqual(wsCalls.some((c) => c.targetDeviceId === 'dev-remote-mac' && c.cmd?.type === 'getDeliverablePreview'), true);

    // Chunk reassembly must NOT abort when effectiveLocalBase is truthy
    const merged = await api.reassembleChunkedDeliverable(
      { ok: true, kind: 'html', chunkBase64: Buffer.from('<html><body>').toString('base64'), nextOffset: 12, totalBytes: 26 },
      'big.html',
      's-rem',
      'ws1',
      'http://127.0.0.1:4318',
      true,
      'dev-remote-mac'
    );
    assert.strictEqual(merged.sandboxedHtml, '<html><body></body></html>', 'Chunk reassembly must finish even with localBridgeBase set');

    // Vault R2 + revokeActiveDeliverableBlobs clears stale blobUrl on teardown
    const vaultRes = await api.fetchDeliverableFromVaultR2('AEG-boxMind/deck.pptx', 'pptx', { folder: 'memory' });
    assert.strictEqual(vaultRes.sourceKind, 'vault-r2-pdf');
    assert.strictEqual(vaultRes.downloadFile, 'deck.pdf');
    assert.ok(vaultRes.blobUrl.startsWith('blob:mock-'));
    api.deliverablePageCache.set('k::p1', vaultRes);
    api.revokeActiveDeliverableBlobs();
    assert.strictEqual(revoked.length, 1);
    assert.strictEqual(vaultRes.blobUrl, '', 'revokeActiveDeliverableBlobs must clear cached blobUrl to prevent dead iframe');
    console.log('[PASS] Static: Deliverable multi-device isolation, WS chunk continuation, :line target strip & blobUrl revocation verified');
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
          if (window === window.top) {
            try {
              if (!localStorage.getItem('theo_remote_cache_v3')) {
                localStorage.setItem('theo_remote_cache_v3', ${JSON.stringify(seedCacheJson)});
                localStorage.setItem('theo_remote_prefs_v1', JSON.stringify({
                  theme: 'light',
                  themeUserSet: true,
                  sound: false,
                  activeTab: 'pulse',
                  desktopWorkbenchBootV92: true,
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
            } catch {}
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
      document.getElementById('open-cmd-palette')?.click();
      await new Promise((r) => setTimeout(r, 30));
      const cmdThreads = Array.from(document.querySelectorAll('#cmd-results [data-cmd-thread]'))
        .map((b) => b.dataset.cmdThread)
        .filter((v) => String(v || '').startsWith('sess-'));
      document.getElementById('cmd-close')?.click();
      return { cards, cmdThreads };
    })()`);
    assert.strictEqual(
      freqCheck.cards[0],
      'sess-beta',
      `Frequency-first violation in #sess-search-input: expected sess-beta (freq=12) before newer sess-alpha (freq=1), got ${JSON.stringify(freqCheck.cards)}`
    );
    assert.strictEqual(
      freqCheck.cmdThreads[0],
      'sess-beta',
      `Frequency-first violation in #cmd-modal: expected sess-beta first, got ${JSON.stringify(freqCheck.cmdThreads)}`
    );
    console.log('[PASS] Adversarial #1: Frequency-first ranking strictly dominates recency across search & command palette');

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
        uLayout.sessText.includes('Syncing live sessions from your PC'),
        false,
        'Unpaired Sessions view must NEVER show misleading "Syncing live sessions from your PC…" empty state'
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
      const actBarGone = document.querySelector('.ide-activity-bar') === null;
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
        actBarGone,
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

    assert.strictEqual(workbenchProbe.actBarGone, true, 'Far-left .ide-activity-bar must be removed in Phase 3 unified sidebar');
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
      await new Promise((r) => setTimeout(r, 120));
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

      document.getElementById('btn-sidebar-brand')?.click();
      await new Promise((r) => setTimeout(r, 30));

      // 1. Calm Chromatics & De-Duplication checks
      const pushBadge = document.getElementById('rail-push-badge');
      const pushBadgeBg = pushBadge ? getComputedStyle(pushBadge).backgroundColor : '';
      const stopSendBtn = document.getElementById('composer-send-btn');
      stopSendBtn?.classList.add('is-stop');
      const stopBtnBg = stopSendBtn ? getComputedStyle(stopSendBtn).backgroundImage + ' ' + getComputedStyle(stopSendBtn).backgroundColor : '';
      const sessionsNavBadgeGone = document.getElementById('badge-sessions') === null;
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
        sessionsNavBadgeGone,
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
    assert.strictEqual(v60Probe.sessionsNavBadgeGone, true, 'Removed Activity Bar #badge-sessions must not exist');
    assert.strictEqual(v60Probe.workspacesNavBadgeDisp, 'none', 'Passive #badge-workspaces in sidebar footer must stay hidden');
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

      // 2. Desktop Single-Control header (#chat-session-select & #chat-model-picker-btn removed; visible .chat-title-row + #chat-session-title)
      const sessionSelectGone = document.getElementById('chat-session-select') === null;
      const headerModelBtnGone = document.getElementById('chat-model-picker-btn') === null;
      const titleRow = document.querySelector('#view-chat .chat-title-row');
      const desktopTitleRowVisible = Boolean(titleRow && getComputedStyle(titleRow).display !== 'none');
      const headerTitleText = document.getElementById('chat-session-title')?.textContent?.trim() || '';

      // Negative #1 verification: hostile model/effort sanitized to 'gemini-4-argon' / 'high' and legacy 'Gemini 3.1 Pro' upgraded to 'Gemini 4 Argon (High)'
      const bootPrefs = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');
      const sanitizedModel = bootPrefs.selectedModelByProvider?.antigravity;
      const sanitizedEffort = bootPrefs.selectedThinkingEffort?.antigravity;
      const draftCfgPurgedOnBoot = !('draft-new-123' in (bootPrefs.threadModelConfig || {})) && !('sess-corrupt' in (bootPrefs.threadModelConfig || {}));
      const initialPillText = document.getElementById('composer-model-label')?.textContent?.trim() || '';

      // 3. Interactive Model & Thinking Level Selector (switch to Gemini 3.8 Flash + Medium via Adjust)
      document.getElementById('composer-model-btn')?.click();
      await new Promise((r) => setTimeout(r, 25));
      const modelPopOpen = document.getElementById('model-picker-popover')?.hidden === false;
      document.querySelector('#model-picker-popover [data-select-ai-model="gemini-3.8-flash"]')?.click();
      await new Promise((r) => setTimeout(r, 25));
      document.querySelector('#model-picker-popover [data-toggle-model-effort-bar="1"]')?.click();
      await new Promise((r) => setTimeout(r, 25));
      document.querySelector('#model-picker-popover [data-select-ai-effort="medium"]')?.click();
      await new Promise((r) => setTimeout(r, 25));
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
      const pillAfterPinBlocked = document.getElementById('composer-model-label')?.textContent?.trim() || '';
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

      // 6. Click + Antigravity -> opens active draft tab + renders minimal .new-session-launchpad (no starter grid or verbose paragraph)
      document.getElementById('rail-new-agy')?.click();
      await new Promise((r) => setTimeout(r, 35));
      const hasDraftTab = Boolean(document.querySelector('#ide-editor-tabs [data-editor-tab-id="__new__"].active'));
      const hasLaunchpad = Boolean(document.querySelector('#chat-stream .new-session-launchpad'));
      const hasOldVerboseText = Boolean(
        document.getElementById('chat-stream')?.textContent?.includes('Starting a brand-new, unrelated')
      );
      const duplicateStarterCardsCount = document.querySelectorAll(
        '#chat-stream .new-session-launchpad .lp-starter-card, #chat-stream .new-session-launchpad [data-open-lens]'
      ).length;

      return {
        directToggleGone,
        modePillsGone,
        sessionSelectGone,
        headerModelBtnGone,
        desktopTitleRowVisible,
        headerTitleText,
        sanitizedModel,
        sanitizedEffort,
        draftCfgPurgedOnBoot,
        initialPillText,
        modelPopOpen,
        modelPopClosedByEscape,
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
        duplicateStarterCardsCount,
        titleAttrsCount: document.querySelectorAll('[title]').length,
        xssTriggered: Boolean(window.__XSS)
      };
    })()`);

    assert.strictEqual(v61Probe.xssTriggered, false, 'Negative #1: Hostile model/effort in localStorage must never trigger XSS');
    assert.strictEqual(v61Probe.directToggleGone, true, '#composer-direct-toggle must be removed from bottom composer');
    assert.strictEqual(v61Probe.modePillsGone, true, '#composer-mode-pills (Reply | + AGY | + Claude) must be removed from bottom composer');
    assert.strictEqual(v61Probe.sessionSelectGone, true, 'Duplicate #chat-session-select dropdown must be removed in Phase 3');
    assert.strictEqual(v61Probe.headerModelBtnGone, true, 'Duplicate #chat-model-picker-btn must be removed from header in Phase 3');
    assert.strictEqual(v61Probe.desktopTitleRowVisible, true, 'Clean .chat-title-row with #chat-session-title must remain visible on desktop (>=1025px)');
    assert.ok(v61Probe.headerTitleText.length > 0, '#chat-session-title must render active session title');
    assert.strictEqual(v61Probe.sanitizedModel, 'gemini-4-argon', 'Negative #1: Invalid stored model ID must sanitize to gemini-4-argon');
    assert.strictEqual(v61Probe.sanitizedEffort, 'high', 'Negative #1: Invalid stored thinking effort must sanitize to high');
    assert.strictEqual(v61Probe.draftCfgPurgedOnBoot, true, 'Corrupt or draft-new-* threadModelConfig entries must be purged on boot');
    assert.strictEqual(v61Probe.initialPillText, 'Gemini 4 Argon (High)', 'Legacy Gemini 3.1 Pro must upgrade to Gemini 4 Argon (High)');
    assert.strictEqual(v61Probe.modelPopOpen, true, 'Clicking #composer-model-btn must open #model-picker-popover');
    assert.strictEqual(v61Probe.modelPopClosedByEscape, true, 'Escape must close #model-picker-popover');
    assert.strictEqual(v61Probe.updatedComposerPill, 'Gemini 3.8 Flash (Medium)', 'Selecting Gemini 3.8 Flash + Medium must update #composer-model-label');
    assert.strictEqual(v61Probe.pillAfterPinBlocked, 'Gemini 3.8 Flash (Medium)', 'Negative #2: PIN lock must block model/effort changes');
    assert.strictEqual(v61Probe.openTabHasGreyDot, true, 'Open idle tab in sidebar must display subtle grey dot (.ide-dot.open)');
    assert.strictEqual(v61Probe.closedTabDotHidden, true, 'Closed idle session in sidebar must hide dot (.ide-dot.closed)');
    assert.strictEqual(v61Probe.orderBeforeWork[0], 'sess-alpha', `Expected newer sess-alpha first before work, got ${JSON.stringify(v61Probe.orderBeforeWork)}`);
    assert.strictEqual(v61Probe.betaNowHasGreyDot, true, 'Opening sess-beta tab must immediately show .ide-dot.open in sidebar');
    assert.strictEqual(v61Probe.alphaGreyDotRemovedOnClose, true, 'Negative #3: Closing sess-alpha tab from sidebar must remove its grey dot');
    assert.strictEqual(v61Probe.activeStayedBeta, true, 'Negative #3: Clicking sidebar close-tab button must not open that row');
    assert.strictEqual(v61Probe.orderAfterWork[0], 'sess-beta', `Expected newly worked-on sess-beta to move to #1 in sidebar, got ${JSON.stringify(v61Probe.orderAfterWork)}`);
    assert.strictEqual(v61Probe.hasDraftTab, true, '+ New Session mode must render active draft tab in #ide-editor-tabs');
    assert.strictEqual(v61Probe.hasLaunchpad, true, '+ New Session mode must render minimal .new-session-launchpad');
    assert.strictEqual(v61Probe.hasOldVerboseText, false, 'Redundant verbose New Session paragraph must be gone');
    assert.strictEqual(v61Probe.duplicateStarterCardsCount, 0, 'Duplicate Launchpad starter cards must be removed in Phase 3');
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
      const m319HeaderPill = document.getElementById('composer-model-label')?.textContent?.trim() || '';

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

      // 4. Verify #model-picker-popover is position:fixed and opens above composer button with 0 clipping
      const pop = document.getElementById('model-picker-popover');
      const compBtn = document.getElementById('composer-model-btn');
      compBtn?.click();
      await new Promise((r) => setTimeout(r, 25));
      const popStyle = pop ? getComputedStyle(pop) : null;
      const popFixed = popStyle?.position === 'fixed';
      const comboItemsCount = pop ? pop.querySelectorAll('.vs-model-menu-item[data-select-model-combo]').length : 0;
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
      const compLabelAfterCombo = document.getElementById('composer-model-label')?.textContent?.trim() || '';

      // Negative #1: Inject hostile/bogus [data-select-model-combo] and click it -> must NOT mutate state or execute XSS
      const bogusCombo = document.createElement('button');
      bogusCombo.setAttribute('data-select-model-combo', '<img src=x onerror="window.__XSS=620">:bogus');
      document.body.appendChild(bogusCombo);
      bogusCombo.click();
      bogusCombo.remove();
      await new Promise((r) => setTimeout(r, 20));
      const pillAfterHostileCombo = document.getElementById('composer-model-label')?.textContent?.trim() || '';

      // Negative #2: PIN lock blocks [data-select-model-combo]
      const pinOverlay = document.getElementById('pin-overlay');
      if (pinOverlay) pinOverlay.hidden = false;
      pop?.querySelector('[data-select-model-combo="gemini-3.8-flash:high"]')?.click();
      await new Promise((r) => setTimeout(r, 20));
      const pillAfterPinCombo = document.getElementById('composer-model-label')?.textContent?.trim() || '';
      if (pinOverlay) pinOverlay.hidden = true;

      // Leave popover open for Negative #3 narrow viewport clamping test
      compBtn?.click();
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
        comboItemsCount,
        anchoredAboveComposer,
        autoClosedAfterCombo,
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
    assert.strictEqual(v62DesktopResult.comboItemsCount, 6, 'Antigravity VS Code model menu must list all 6 model+thinking combinations');
    assert.strictEqual(v62DesktopResult.anchoredAboveComposer, true, 'Model menu opened from composer must anchor cleanly above #composer-model-btn');
    assert.strictEqual(v62DesktopResult.autoClosedAfterCombo, true, '1-click [data-select-model-combo] must select and close menu immediately');
    assert.strictEqual(v62DesktopResult.compLabelAfterCombo, 'Gemini 4 Argon (Low)', '1-click combo must update #composer-model-label to Gemini 4 Argon (Low)');
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

    // Adversarial #16b: Phone-only readiness card on Pulse, Apply PC setup from the phone, honest account sign-in
    const setFleetDevices = async (devices) => {
      await evalJs(`(() => {
        const rawCache = JSON.parse(localStorage.getItem('theo_remote_cache_v3') || '{}');
        const snap = rawCache.snapshot || rawCache.state || {};
        snap.devices = ${JSON.stringify(devices)};
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
    };
    const readyChecks = (over = {}) =>
      [
        { id: 'keepalive', ok: true, level: 'required', title: 'Background service', detail: 'Running. THEO works with VS Code closed.' },
        { id: 'claude-cli', ok: true, level: 'required', title: 'Claude engine', detail: 'Found. Claude sessions run without VS Code.' },
        { id: 'claude-prompts', ok: true, level: 'required', title: 'Claude approvals and questions', detail: 'Sent to the phone from sessions running without VS Code.' },
        { id: 'agy-approvals', ok: false, level: 'info', title: 'Antigravity Run and Accept prompts', detail: 'Need the live Antigravity engine, which is not running right now.' }
      ].map((c) => (over[c.id] ? { ...c, ...over[c.id] } : c));
    const pendingSetup = {
      ok: false, checkedAt: Date.now(), totalCount: 11, okCount: 10, pendingCount: 1,
      pending: [{ id: 'theo-hub', name: 'THEO extension' }]
    };

    // (a) one online PC with a failing required item, forged counts and markup in every text field
    await setFleetDevices([
      {
        id: 'host-gamma',
        name: 'Gamma <img src=x onerror="window.__pwaXss=1">',
        online: true,
        sessionCount: 1,
        pcSetup: pendingSetup,
        pwaReady: {
          ready: true, okCount: 99, totalCount: 99, vscodeOpen: false, signIn: true,
          checks: readyChecks({
            keepalive: { ok: false, title: 'Background service <b>x</b>', detail: 'Not running <script>window.__pwaXss=2</script>' }
          }).concat([{ id: 'bad id!', ok: true, level: 'required', title: 'dropped' }])
        }
      },
      { id: 'host-old', name: 'OldBuild', online: true, sessionCount: 0 }
    ]);
    const readyA = await evalJs(`(async () => {
      const card = document.getElementById('pulse-pwa-ready-card');
      const out = {
        hasCard: Boolean(card),
        classes: card ? card.className : '',
        title: card?.querySelector('.pwa-ready-title')?.textContent?.trim() || '',
        bodyHidden: card?.querySelector('.pwa-ready-body')?.hasAttribute('hidden'),
        expanded: card?.querySelector('[data-pwa-ready-toggle]')?.getAttribute('aria-expanded'),
        hostCount: card ? card.querySelectorAll('.pwa-ready-host').length : 0,
        pill: card?.querySelector('.fleet-setup-pill')?.textContent?.trim() || '',
        failRows: card ? card.querySelectorAll('.pwa-ready-row.is-fail').length : 0,
        okRows: card ? card.querySelectorAll('.pwa-ready-row.is-ok').length : 0,
        noteRows: card ? card.querySelectorAll('.pwa-ready-row.is-note').length : 0,
        injected: card ? card.querySelectorAll('img, script, b').length : -1,
        xssFlag: window.__pwaXss || 0,
        cardText: card?.textContent || '',
        setupCardText: document.getElementById('pulse-pc-setup-card')?.textContent || '',
        applyInSetup: document.querySelectorAll('#pulse-pc-setup-card [data-apply-pc-setup]').length,
        applyInReady: card ? card.querySelectorAll('[data-apply-pc-setup]').length : 0
      };
      const applyBtn = document.querySelector('#pulse-pc-setup-card [data-apply-pc-setup]');
      out.applyLabel = applyBtn?.textContent?.trim() || '';
      window.__theoLastQuarantinedCmd = null;
      applyBtn?.click();
      await new Promise((r) => setTimeout(r, 60));
      const cmd = window.__theoLastQuarantinedCmd || {};
      out.cmd = { type: cmd.type, subAction: cmd.subAction, targetDeviceId: cmd.targetDeviceId, threadId: cmd.threadId || '' };
      const after = document.querySelector('#pulse-pc-setup-card [data-apply-pc-setup]');
      out.afterDisabled = Boolean(after?.disabled);
      out.afterLabel = after?.textContent?.trim() || '';
      window.__theoLastQuarantinedCmd = null;
      after?.click();
      await new Promise((r) => setTimeout(r, 40));
      out.secondCmd = window.__theoLastQuarantinedCmd ? 1 : 0;
      // Account sign-in with VS Code closed on the PC: inline/modal form opens without prompt(), and starts sign-in on that PC.
      let promptCalls = 0;
      const origPrompt = window.prompt;
      window.prompt = () => { promptCalls += 1; return 'claude'; };
      window.__theoLastQuarantinedCmd = null;
      const probe = document.createElement('button');
      probe.dataset.accountAddRemote = 'claude';
      document.body.appendChild(probe);
      probe.click();
      await new Promise((r) => setTimeout(r, 30));
      document.querySelector('[data-add-acct-form]')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 60));
      probe.remove();
      window.prompt = origPrompt;
      out.promptCalls = promptCalls;
      const acctCmd = window.__theoLastQuarantinedCmd || {};
      out.accountCmd = { subAction: acctCmd.subAction, targetDeviceId: acctCmd.targetDeviceId, provider: acctCmd.provider, liveOnly: acctCmd.liveOnly };
      const sheet = document.getElementById('acct-signin-modal');
      out.sheetOpen = Boolean(sheet && !sheet.hidden);
      out.sheetTitle = document.getElementById('acct-signin-title')?.textContent || '';
      out.sheetInjected = sheet ? sheet.querySelectorAll('img, script, b').length : -1;
      out.sheetText = document.getElementById('acct-signin-body')?.textContent || '';
      // Closing the sheet while the sign-in runs stops it on the PC.
      window.__theoLastQuarantinedCmd = null;
      document.getElementById('acct-signin-close')?.click();
      await new Promise((r) => setTimeout(r, 40));
      out.sheetClosed = Boolean(sheet && sheet.hidden);
      const cancelCmd = window.__theoLastQuarantinedCmd || {};
      out.cancelCmd = { subAction: cancelCmd.subAction, targetDeviceId: cancelCmd.targetDeviceId, liveOnly: cancelCmd.liveOnly };
      out.toastText = document.querySelector('.toast, #toast, .theo-toast')?.textContent || '';
      out.titleCount = document.querySelectorAll('[title]').length;
      out.overflowX = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
      return out;
    })()`);
    assert.strictEqual(readyA.hasCard, true, 'Pulse must show #pulse-pwa-ready-card when a PC reports phone-only readiness');
    assert.ok(readyA.classes.includes('is-pending') && readyA.classes.includes('is-open'), `a failing required item opens the card as pending, got "${readyA.classes}"`);
    assert.strictEqual(readyA.title, 'Not ready for phone-only use yet');
    assert.strictEqual(readyA.bodyHidden, false);
    assert.strictEqual(readyA.expanded, 'true');
    assert.strictEqual(readyA.hostCount, 1, 'a PC whose build reports nothing is not listed');
    assert.strictEqual(readyA.pill, '! 2/3', 'counts are rebuilt from the checks, never taken from the wire');
    assert.deepStrictEqual([readyA.failRows, readyA.okRows, readyA.noteRows], [1, 2, 1]);
    assert.strictEqual(readyA.injected, 0, 'host-supplied text is escaped');
    assert.strictEqual(readyA.xssFlag, 0, 'no script from a host name or a check text runs');
    assert.ok(readyA.cardText.includes('VS Code closed') && !readyA.cardText.includes('dropped'));
    assert.ok(readyA.setupCardText.includes('THEO extension'), 'pending step names from pending[] are shown');
    assert.strictEqual(readyA.applyInSetup, 1, 'one Apply button per online PC that takes the request');
    assert.strictEqual(readyA.applyInReady, 1, 'a PC with the background service down offers the setup in the card');
    assert.ok(readyA.applyLabel.startsWith('Apply on Gamma'));
    assert.deepStrictEqual(readyA.cmd, { type: 'sessionAction', subAction: 'applyPcSetup', targetDeviceId: 'host-gamma', threadId: '' });
    assert.strictEqual(readyA.afterDisabled, true, 'the button locks while the PC applies its setup');
    assert.ok(readyA.afterLabel.startsWith('Applying on Gamma'));
    assert.strictEqual(readyA.secondCmd, 0, 'a second tap does not send a second request');
    assert.strictEqual(readyA.promptCalls, 0, 'adding an account uses the add-account form with zero window.prompt calls');
    assert.deepStrictEqual(
      readyA.accountCmd,
      { subAction: 'accountAdd', targetDeviceId: 'host-gamma', provider: 'claude', liveOnly: true },
      'the sign-in is started on that PC, over a live link only'
    );
    assert.strictEqual(readyA.sheetOpen, true, 'the sign-in sheet opens');
    assert.ok(readyA.sheetTitle.startsWith('Add a Claude Code account on Gamma'), readyA.sheetTitle);
    assert.strictEqual(readyA.sheetInjected, 0, 'a PC name with markup is escaped in the sign-in sheet');
    assert.ok(/sign-in/i.test(readyA.sheetText));
    assert.strictEqual(readyA.sheetClosed, true);
    assert.deepStrictEqual(
      readyA.cancelCmd,
      { subAction: 'accountSignInCancel', targetDeviceId: 'host-gamma', liveOnly: true },
      'closing the sheet stops the sign-in on the PC'
    );
    assert.strictEqual(readyA.titleCount, 0, 'Zero [title] attributes allowed on the readiness card');
    assert.strictEqual(readyA.overflowX, 0, '0px horizontal overflow with the readiness card open');

    // (b) every online PC ready: one collapsed line, opens and closes on tap, the choice survives a re-render
    await setFleetDevices([
      { id: 'host-gamma', name: 'Gamma', online: true, sessionCount: 1, pwaReady: { vscodeOpen: true, signIn: true, checks: readyChecks({ 'agy-approvals': { ok: true } }) } },
      { id: 'host-delta', name: 'Delta', online: false, sessionCount: 0, pwaReady: { vscodeOpen: false, checks: readyChecks({ keepalive: { ok: false } }) } }
    ]);
    const readyB = await evalJs(`(async () => {
      const q = () => document.getElementById('pulse-pwa-ready-card');
      const out = {
        classes: q()?.className || '',
        title: q()?.querySelector('.pwa-ready-title')?.textContent?.trim() || '',
        hiddenAtFirst: q()?.querySelector('.pwa-ready-body')?.hasAttribute('hidden'),
        setupCard: Boolean(document.getElementById('pulse-pc-setup-card'))
      };
      q()?.querySelector('[data-pwa-ready-toggle]')?.click();
      await new Promise((r) => setTimeout(r, 40));
      out.hiddenAfterTap = q()?.querySelector('.pwa-ready-body')?.hasAttribute('hidden');
      out.hostCount = q()?.querySelectorAll('.pwa-ready-host').length;
      out.offlineText = q()?.textContent.includes('offline, last report');
      out.openHostText = q()?.textContent.includes('VS Code open');
      out.overflowOpen = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
      document.querySelector('[data-tab="sessions"]')?.click();
      await new Promise((r) => setTimeout(r, 30));
      document.querySelector('[data-tab="pulse"]')?.click();
      await new Promise((r) => setTimeout(r, 40));
      out.stillOpen = !q()?.querySelector('.pwa-ready-body')?.hasAttribute('hidden');
      q()?.querySelector('[data-pwa-ready-toggle]')?.click();
      await new Promise((r) => setTimeout(r, 40));
      out.hiddenAgain = q()?.querySelector('.pwa-ready-body')?.hasAttribute('hidden');
      // With VS Code open on a PC, the sign-in is sent to that PC by id via the add-account form (zero prompt()).
      window.__theoLastQuarantinedCmd = null;
      const probe = document.createElement('button');
      probe.dataset.accountAddRemote = 'claude';
      document.body.appendChild(probe);
      probe.click();
      await new Promise((r) => setTimeout(r, 30));
      const lblInp = document.getElementById('acct-modal-add-label') || document.getElementById('ide-add-tray-label');
      if (lblInp) lblInp.value = 'Work';
      document.querySelector('[data-add-acct-form]')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 50));
      probe.remove();
      const cmd = window.__theoLastQuarantinedCmd || {};
      out.accountCmd = { subAction: cmd.subAction, targetDeviceId: cmd.targetDeviceId, provider: cmd.provider, label: cmd.label };

      // The sign-in sheet in each state, drawn from what a PC would answer.
      const api = window.__theoAccountSignIn;
      const body = () => document.getElementById('acct-signin-body');
      const draw = (over) => {
        api.set({
          provider: 'claude', label: '', hostId: 'host-gamma', hostName: 'Gamma <img src=x onerror="window.__acctXss=1">',
          phase: 'pending', progress: null, error: '', note: '', linkLost: false, pollTimer: null, ...over
        });
        api.render();
      };
      draw({ progress: { pending: { provider: 'claude', needsCode: true, authUrl: 'https://claude.ai/oauth/authorize?abc', message: 'Open the link <b>now</b>' } } });
      out.claude = {
        link: body().querySelector('a.btn-brass-sm')?.getAttribute('href') || '',
        linkRel: body().querySelector('a.btn-brass-sm')?.getAttribute('rel') || '',
        hasCode: Boolean(body().querySelector('#acct-signin-code')),
        codeFont: parseFloat(getComputedStyle(body().querySelector('#acct-signin-code')).fontSize),
        openOnPc: body().querySelectorAll('[data-acct-signin-act="open-on-pc"]').length,
        injected: body().querySelectorAll('img, b, script').length
      };
      // A link that is not https is never drawn as a link.
      draw({ progress: { pending: { provider: 'claude', needsCode: true, authUrl: 'javascript:alert(1)' } } });
      out.badLink = { links: body().querySelectorAll('a').length, text: body().textContent };
      // The code goes out as a live-only command; an empty field sends nothing.
      draw({ progress: { pending: { provider: 'claude', needsCode: true, authUrl: 'https://claude.ai/oauth/authorize?abc' } } });
      window.__theoLastQuarantinedCmd = null;
      body().querySelector('[data-acct-signin-act="submit-code"]').click();
      await new Promise((r) => setTimeout(r, 30));
      out.emptyCodeCmd = window.__theoLastQuarantinedCmd ? 1 : 0;
      body().querySelector('#acct-signin-code').value = 'abc123#state';
      body().querySelector('[data-acct-signin-act="submit-code"]').click();
      await new Promise((r) => setTimeout(r, 30));
      const codeCmd = window.__theoLastQuarantinedCmd || {};
      out.codeCmd = { subAction: codeCmd.subAction, code: codeCmd.code, liveOnly: codeCmd.liveOnly, targetDeviceId: codeCmd.targetDeviceId };
      // Antigravity: the page is opened on the PC, not on this device.
      draw({ provider: 'antigravity', progress: { pending: { provider: 'antigravity', authUrl: 'https://accounts.google.com/o/oauth2/auth?x=1' } } });
      out.agy = {
        links: body().querySelectorAll('a').length,
        openOnPc: body().querySelectorAll('[data-acct-signin-act="open-on-pc"]').length,
        copy: body().querySelectorAll('[data-acct-signin-act="copy-link"]').length,
        code: body().querySelectorAll('#acct-signin-code').length
      };
      draw({ provider: 'antigravity', progress: { pending: { provider: 'antigravity', awaitingVerification: true, verificationUrl: 'https://accounts.google.com/verify', authUrl: '' } } });
      out.verify = {
        link: body().querySelector('a')?.getAttribute('href') || '',
        continueBtn: body().querySelectorAll('[data-acct-signin-act="verified"]').length
      };
      draw({ phase: 'failed', error: "Couldn't log in: <i>that code</i> wasn't accepted." });
      out.failed = {
        text: body().querySelector('.acct-signin-error')?.textContent || '',
        retry: body().querySelectorAll('[data-acct-signin-act="retry"]').length,
        injected: body().querySelectorAll('i, img').length
      };
      out.acctXss = window.__acctXss || 0;
      const sheetEl = document.getElementById('acct-signin-modal');
      sheetEl.hidden = false;
      out.sheetOverflow = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
      out.sheetTitles = sheetEl.querySelectorAll('[title]').length;
      api.set(null);
      sheetEl.hidden = true;
      out.titleCount = document.querySelectorAll('[title]').length;
      return out;
    })()`);
    assert.deepStrictEqual(
      [readyB.claude.link, readyB.claude.linkRel, readyB.claude.hasCode, readyB.claude.openOnPc, readyB.claude.injected],
      ['https://claude.ai/oauth/authorize?abc', 'noopener noreferrer', true, 1, 0],
      'Claude sign-in: a link, a code field, and nothing injected by the PC'
    );
    assert.ok(readyB.claude.codeFont >= 16, 'the code field does not trigger the iOS zoom');
    assert.strictEqual(readyB.badLink.links, 0, 'a link that is not https is never offered');
    assert.strictEqual(readyB.emptyCodeCmd, 0, 'an empty code sends nothing');
    assert.deepStrictEqual(
      readyB.codeCmd,
      { subAction: 'accountSignInCode', code: 'abc123#state', liveOnly: true, targetDeviceId: 'host-gamma' },
      'the code is sent to that PC, over a live link only'
    );
    assert.deepStrictEqual(
      [readyB.agy.links, readyB.agy.openOnPc, readyB.agy.copy, readyB.agy.code],
      [0, 1, 1, 0],
      'Antigravity sign-in: opened on the PC, no code field'
    );
    assert.deepStrictEqual([readyB.verify.link, readyB.verify.continueBtn], ['https://accounts.google.com/verify', 1]);
    assert.ok(readyB.failed.text.includes("wasn't accepted") && readyB.failed.retry === 1 && readyB.failed.injected === 0);
    assert.strictEqual(readyB.acctXss, 0, 'no script from a PC name or a sign-in message runs');
    assert.strictEqual(readyB.sheetOverflow, 0, '0px horizontal overflow with the sign-in sheet open');
    assert.strictEqual(readyB.sheetTitles, 0);
    assert.ok(readyB.classes.includes('is-ready') && !readyB.classes.includes('is-open'), `all online PCs ready collapses the card, got "${readyB.classes}"`);
    assert.strictEqual(readyB.title, 'Gamma is ready for phone-only use', 'an offline PC does not hold the fleet back');
    assert.strictEqual(readyB.hiddenAtFirst, true);
    assert.strictEqual(readyB.setupCard, false);
    assert.strictEqual(readyB.hiddenAfterTap, false, 'a tap opens the checklist');
    assert.strictEqual(readyB.hostCount, 2);
    assert.strictEqual(readyB.offlineText, true);
    assert.strictEqual(readyB.openHostText, true);
    assert.strictEqual(readyB.overflowOpen, 0);
    assert.strictEqual(readyB.stillOpen, true, 'the open state survives a re-render');
    assert.strictEqual(readyB.hiddenAgain, true);
    assert.deepStrictEqual(readyB.accountCmd, { subAction: 'accountAdd', targetDeviceId: 'host-gamma', provider: 'claude', label: 'Work' });
    assert.strictEqual(readyB.titleCount, 0);

    // (c) no PC online, and (d) no PC reporting: the card says so, or is absent
    await setFleetDevices([
      { id: 'host-gamma', name: 'Gamma', online: false, sessionCount: 0, pwaReady: { vscodeOpen: false, checks: readyChecks() } }
    ]);
    const readyC = await evalJs(`(() => {
      const card = document.getElementById('pulse-pwa-ready-card');
      return { classes: card?.className || '', title: card?.querySelector('.pwa-ready-title')?.textContent?.trim() || '' };
    })()`);
    assert.ok(readyC.classes.includes('is-off'));
    assert.strictEqual(readyC.title, 'No PC is online');
    await setFleetDevices([{ id: 'host-beta', name: 'Beta', online: true, sessionCount: 3, pcSetup: { ok: false, checkedAt: Date.now(), totalCount: 11, okCount: 9, pendingCount: 2, pendingIds: ['claude-automode', 'pc-setup-shortcut'], pendingTitles: ['Claude AutoMode Rules', 'PC Setup Shortcut'] } }]);
    const readyD = await evalJs(`(async () => {
      const out = {
        hasCard: Boolean(document.getElementById('pulse-pwa-ready-card')),
        applyButtons: document.querySelectorAll('[data-apply-pc-setup]').length,
        setupText: document.getElementById('pulse-pc-setup-card')?.textContent || ''
      };
      // A PC on an older build cannot report a sign-in's progress: no sheet, the request goes out as before.
      window.__theoLastQuarantinedCmd = null;
      const probe = document.createElement('button');
      probe.dataset.accountAddRemote = 'claude';
      document.body.appendChild(probe);
      probe.click();
      await new Promise((r) => setTimeout(r, 30));
      document.querySelector('[data-add-acct-form]')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 60));
      probe.remove();
      const cmd = window.__theoLastQuarantinedCmd || {};
      out.legacyCmd = { subAction: cmd.subAction, liveOnly: cmd.liveOnly === true, targetDeviceId: cmd.targetDeviceId || '' };
      out.sheetOpen = !document.getElementById('acct-signin-modal').hidden;
      return out;
    })()`);
    assert.deepStrictEqual(readyD.legacyCmd, { subAction: 'accountAdd', liveOnly: false, targetDeviceId: '' });
    assert.strictEqual(readyD.sheetOpen, false, 'no sign-in sheet for a PC whose build cannot report the sign-in');
    // "Setup started" is said only when that PC answered that it started.
    const replyWording = await evalJs(`(() => {
      const d = window.__theoDescribePcSetupReply;
      const say = (res) => { const r = d('Beta', res); return [/^Setup started/.test(r.toast), r.inProgress, r.toast]; };
      return {
        started: say({ ok: true, mode: 'edge_ws', out: { ok: true, started: true } }),
        startedWrapped: say({ ok: true, mode: 'local_ws', out: { ok: true, result: { ok: true, started: true } } }),
        queuedOnOtherPc: say({ ok: true, mode: 'local', out: { ok: true, queued: true } }),
        unconfirmed: say({ ok: true, mode: 'local_ws', out: { ok: true } }),
        storeQueue: say({ ok: true, mode: 'cloud', id: 'cmd-1' }),
        outbox: say({ ok: true, mode: 'queued', id: 'cmd-1' }),
        sessions: say({ ok: true, mode: 'edge_ws', out: { ok: true, busy: true, started: false, reason: 'sessions_running' } }),
        busy: say({ ok: true, mode: 'edge_ws', out: { ok: true, busy: true, started: false } }),
        stale: say({ ok: true, mode: 'edge_ws', out: { ok: true, started: false, skipped: 'stale_request' } }),
        refused: say({ ok: true, mode: 'edge_ws', out: { ok: true, started: false, refused: 'unavailable' } }),
        none: say(null)
      };
    })()`);
    assert.deepStrictEqual(replyWording.started.slice(0, 2), [true, true]);
    assert.deepStrictEqual(replyWording.startedWrapped.slice(0, 2), [true, true]);
    for (const k of ['queuedOnOtherPc', 'unconfirmed', 'storeQueue', 'outbox', 'sessions', 'stale', 'refused', 'none']) {
      assert.deepStrictEqual(replyWording[k].slice(0, 2), [false, false], `"${k}" must not read as a started setup: ${replyWording[k][2]}`);
    }
    assert.deepStrictEqual(replyWording.busy.slice(0, 2), [false, true], 'a PC already applying keeps the button locked');
    assert.ok(/queued/.test(replyWording.queuedOnOtherPc[2]) && /queued/.test(replyWording.storeQueue[2]));
    assert.ok(/offline/.test(replyWording.outbox[2]));
    assert.strictEqual(readyD.hasCard, false, 'no card while no PC reports phone-only readiness');
    assert.strictEqual(readyD.applyButtons, 0, 'a PC on an older build gets no Apply button');
    assert.ok(readyD.setupText.includes('Apply Setup'), 'and keeps the instruction for that PC');
    console.log('[PASS] Adversarial #16b: Phone-only readiness card, Apply PC setup from the phone & honest account sign-in verified');

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
    assert.strictEqual(side3p7d.reset, 'Window idle', 'Expired Claude & GPT (7 day) must show Window idle on Desktop IDE sidebar');

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
          repo: i === 3 ? 'isabi-app' : i === 5 ? 'manufacturing-operations-long-repo-name1' : 'repo' + i,
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
              { repo: 'fitness', branch: 'main', where: 'main checkout', why: '1 uncommitted file(s)', path: '~\\\\bhfirms\\\\fitness', idleHours: 20, stale: false }
            ] } : null },
        { id: 'host-beta', name: 'Beta', online: true, sessionCount: 1,
          unsavedWork: withUw ? { checkedAt: now - 3 * 3600000 - 60000, staleHours: 24, unsavedCount: 0, staleCount: 0, unchecked: 0, items: [] } : null },
        { id: 'host-gamma', name: 'Gamma', online: true, sessionCount: 1, unsavedWork: null },
        { id: 'host-alpha', name: 'Alpha', online: true, sessionCount: 2,
          unsavedWork: withUw ? { checkedAt: now - 5 * 60000, staleHours: 24, unsavedCount: 55, staleCount: 42, unchecked: 0, items } : null }
      ];
      if (snap.device) {
        const { unsavedWork: _dropUw, ...restDev } = snap.device;
        snap.device = restDev;
      }
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
        deltaMeta: delta?.querySelector('.uw-pc-meta')?.textContent?.trim() || '',
        deltaIdles: delta ? Array.from(delta.querySelectorAll('.uw-item .uw-idle')).map((el) => el.textContent.trim()) : [],
        alphaClean: Boolean(alpha && alpha.classList.contains('is-clean')),
        alphaRepos: alpha ? Array.from(alpha.querySelectorAll('.uw-item .uw-repo')).map((el) => el.textContent.trim()) : [],
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
    assert.strictEqual(uwTap.headText, '57 folders on 2 PCs · 44 idle 24 h+', 'Panel head totals folders and 24 h+ folders across PCs');
    assert.deepStrictEqual(uwTap.deltaIdles, ['idle 35 h', 'idle 25 h'], 'Idle times age from the last check (Delta checked 5 h ago)');
    assert.strictEqual(uwTap.deltaMeta, '2 unsaved · 2 idle 24 h+', 'A folder that crossed 24 h since the last check is marked');
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

    // (e) The app stays open while reports change: the newest report wins, an older copy of the list carried in
    // another host's device list never re-applies, and only the PC's own entry may clear its list.
    const uwFeed = (state) => `(async () => {
      window.__THEO_ALLOW_PROBE_MOCK_FETCH = true;
      const origFetch = window.fetch;
      const body = JSON.stringify({ ok: true, state: ${state} });
      window.fetch = async (url, init) => {
        const u = String(url || '');
        if (u.includes('/api/state') || u.includes('/store')) {
          return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return origFetch(url, init);
      };
      try {
        document.getElementById('rail-conn-btn')?.click();
        await new Promise((r) => setTimeout(r, 15));
        document.getElementById('conn-modal-sync-btn')?.click();
        await new Promise((r) => setTimeout(r, 120));
        document.getElementById('conn-modal-close')?.click();
        await new Promise((r) => setTimeout(r, 40));
      } finally {
        window.fetch = origFetch;
        window.__THEO_ALLOW_PROBE_MOCK_FETCH = false;
      }
      return true;
    })()`;
    const oldAlphaCopy = `{ checkedAt: Date.now() - 5 * 60000, staleHours: 24, unsavedCount: 55, staleCount: 42, unchecked: 0,
      items: [{ repo: 'stale-copy', branch: 'wt/old', where: 'shared worktree', why: '1 uncommitted file(s)', path: '~\\\\old', idleHours: 30, stale: true }] }`;
    const fromAlpha = (uw) => `{ generatedAt: Date.now(), rows: [], device: { id: 'host-alpha', name: 'Alpha', role: 'host', unsavedWork: ${uw} } }`;
    const fromBetaWithOldAlpha = `{ generatedAt: Date.now(), rows: [],
      device: { id: 'host-beta', name: 'Beta', role: 'host', unsavedWork: { checkedAt: Date.now(), staleHours: 24, unsavedCount: 0, staleCount: 0, unchecked: 0, items: [] } },
      devices: [{ id: 'host-alpha', name: 'Alpha', online: true, unsavedWork: ${oldAlphaCopy} }] }`;
    // A: Alpha itself reports all saved (newer than the cached 55-folder list).
    await evalJs(uwFeed(fromAlpha(`{ checkedAt: Date.now(), staleHours: 24, unsavedCount: 0, staleCount: 0, unchecked: 0, items: [] }`)));
    const uwA = await evalJs(uwProbe('A'));
    // B: Beta's state arrives carrying an older copy of Alpha's list.
    await evalJs(uwFeed(fromBetaWithOldAlpha));
    const uwB = await evalJs(uwProbe('B'));
    // C: Alpha reports one new unsaved folder.
    await evalJs(uwFeed(fromAlpha(`{ checkedAt: Date.now(), staleHours: 24, unsavedCount: 1, staleCount: 0, unchecked: 0,
      items: [{ repo: 'theo', branch: 'wt/new', where: 'Claude session 11111111', why: '1 uncommitted file(s)', path: '~\\\\bhfirms\\\\theo', idleHours: 0.2, stale: false }] }`)));
    const uwC = await evalJs(uwProbe('C'));
    // D: Alpha's own entry clears its report; then Beta's old copy arrives again.
    await evalJs(uwFeed(fromAlpha('null')));
    await evalJs(uwFeed(fromBetaWithOldAlpha));
    const uwD = await evalJs(uwProbe('D'));
    // E: a report stamped two days in the future is not a report.
    await evalJs(uwFeed(fromAlpha(`{ checkedAt: Date.now() + 2 * 86400000, staleHours: 24, unsavedCount: 3, staleCount: 3, unchecked: 0, items: [] }`)));
    const uwE = await evalJs(uwProbe('E'));
    assert.strictEqual(uwA.alphaClean, true, `(e-A) Alpha's own newer all-saved report replaces the cached list (${JSON.stringify(uwA.pcIds)})`);
    assert.strictEqual(uwB.alphaClean, true, '(e-B) An older copy of Alpha\'s list from Beta\'s device list never re-applies');
    assert.deepStrictEqual(uwC.alphaRepos, ['theo'], '(e-C) Alpha\'s newer report with one folder shows that folder');
    assert.strictEqual(uwD.pcIds.includes('host-alpha'), false, '(e-D) Alpha\'s own entry clearing its report removes it, and an older copy cannot refill it');
    assert.strictEqual(uwE.pcIds.includes('host-alpha'), false, '(e-E) A future-dated report is ignored');
    assert.strictEqual(uwE.overflowX, 0);

    // (c2) Overlapping stalledWt across two PCs with unsavedCount=0: panel stays visible, deduplicated, XSS-safe, host badges & chips show count
    await evalJs(`(() => {
      const now = Date.now();
      const rawCache = JSON.parse(localStorage.getItem('theo_remote_cache_v3') || '{}');
      const snap = rawCache.snapshot || rawCache.state || {};
      snap.devices = [
        {
          id: 'host-alpha',
          name: 'Alpha',
          online: true,
          sessionCount: 2,
          unsavedWork: {
            checkedAt: now - 60000,
            staleHours: 24,
            unsavedCount: 0,
            staleCount: 0,
            unchecked: 0,
            items: [],
            stalledWt: {
              checkedAt: now - 3 * 3600 * 1000,
              cutoffHours: 24,
              stalledCount: 2,
              items: [
                { repo: 'isabi-app', branch: 'wt/all-five-typo-hygiene-recs', sha: '6c9da1b104', ageHours: 55.5, ahead: 1, subject: 'Typo hygiene' },
                { repo: 'isabi', branch: '<script>window.__stXss=1</script>', sha: 'ede4dd5443', ageHours: 30, ahead: 2, subject: '<b>Subject</b>' }
              ]
            }
          }
        },
        {
          id: 'host-beta',
          name: 'Beta',
          online: true,
          sessionCount: 1,
          unsavedWork: {
            checkedAt: now - 30000,
            staleHours: 24,
            unsavedCount: 0,
            staleCount: 0,
            unchecked: 0,
            items: [],
            stalledWt: {
              checkedAt: now - 30000,
              cutoffHours: 24,
              stalledCount: 2,
              items: [
                { repo: 'isabi-app', branch: 'wt/all-five-typo-hygiene-recs', sha: '6c9da1b104', ageHours: 56.0, ahead: 1, subject: 'Typo hygiene' },
                { repo: 'isabi-app', branch: 'wt/kpi-order', sha: '86029be17b', ageHours: 186.4, ahead: 1, subject: 'KPI order' }
              ]
            }
          }
        }
      ];
      if (snap.device) {
        const { unsavedWork: _dropUw, ...restDev } = snap.device;
        snap.device = restDev;
      }
      if (rawCache.snapshot) rawCache.snapshot = snap;
      else rawCache.state = snap;
      localStorage.setItem('theo_remote_cache_v3', JSON.stringify(rawCache));
      return true;
    })()`);
    await cdp.send('Page.navigate', { url: `${baseUrl}/?tab=workspaces&nosse=1` }, sessionId);
    await new Promise((r) => setTimeout(r, 900));
    const stProbe = await evalJs(`(async () => {
      const panel = document.getElementById('unsaved-work-panel');
      const sec = document.getElementById('uw-stalled-section');
      const stItems = sec ? Array.from(sec.querySelectorAll('.uw-stalled-item')) : [];
      const pulseBtn = document.querySelector('.mobile-bottom-dock [data-tab="pulse"]');
      pulseBtn?.click();
      await new Promise((r) => setTimeout(r, 80));
      const pulsePills = Array.from(document.querySelectorAll('.fleet-chip-stalled')).map((el) => el.textContent.trim());
      document.querySelector('.mobile-bottom-dock [data-tab="analytics"]')?.click();
      await new Promise((r) => setTimeout(r, 80));
      const analyticsPills = Array.from(document.querySelectorAll('.fleet-stalled-pill')).map((el) => el.textContent.trim());
      document.getElementById('rail-conn-btn')?.click();
      await new Promise((r) => setTimeout(r, 80));
      const modalPills = Array.from(document.querySelectorAll('#conn-modal .fleet-stalled-pill')).map((el) => el.textContent.trim());
      document.getElementById('conn-modal-close')?.click();
      await new Promise((r) => setTimeout(r, 40));
      document.querySelector('.mobile-bottom-dock [data-tab="workspaces"]')?.click();
      await new Promise((r) => setTimeout(r, 80));
      return {
        hidden: panel ? panel.hidden : null,
        hasSection: Boolean(sec),
        rowCount: stItems.length,
        branches: stItems.map((el) => el.querySelector('.uw-branch')?.textContent?.trim() || ''),
        stalledAges: stItems.map((el) => el.textContent || ''),
        xssFired: Boolean(window.__stXss),
        titleCount: document.querySelectorAll('[title]').length,
        overflowX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
        pulsePills,
        settingsPills: analyticsPills.concat(modalPills)
      };
    })()`);
    assert.strictEqual(stProbe.hidden, false, '#unsaved-work-panel stays visible when only stalledWt is present');
    assert.strictEqual(stProbe.hasSection, true, '#uw-stalled-section renders inside #unsaved-work-panel');
    assert.strictEqual(stProbe.rowCount, 3, `Overlapping stalledWt branches deduplicated across PCs (got ${stProbe.rowCount}: ${JSON.stringify(stProbe.branches)})`);
    assert.strictEqual(stProbe.stalledAges.some((t) => /\b33\s*h\b/.test(t) && /<script>/.test(t)), true, `stalledWt ages from rawSt.checkedAt (+3h -> 33h), not frozen by outer checkedAt (got ${JSON.stringify(stProbe.stalledAges)})`);
    assert.strictEqual(stProbe.xssFired, false, 'Stalled wt/* branch & subject are XSS-safe');
    assert.strictEqual(stProbe.branches.some((b) => b.includes('<script>')), true, 'Escaped script tag rendered literally');
    assert.strictEqual(stProbe.titleCount, 0, 'Zero [title] attributes with stalled wt/* section');
    assert.strictEqual(stProbe.overflowX, 0, '0px horizontal overflow with stalled wt/* section at 390px');
    assert.ok(stProbe.pulsePills.includes('⎇ 2 wt/*'), `Pulse fleet chip shows stalled pill (${JSON.stringify(stProbe.pulsePills)})`);
    assert.ok(stProbe.settingsPills.includes('⎇ 2 wt/*'), `Host badge shows stalled pill (${JSON.stringify(stProbe.settingsPills)})`);

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

    // Adversarial #19: v72 Antigravity 840k Claude capacity, >256k Gemini soft-overrun telemetry,
    // Orchestrator/Carbon/Hydrogen labels, & 0-remaining boundary
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 390, height: 844, deviceScaleFactor: 3, mobile: true },
      sessionId
    );
    await evalJs(`(() => {
      const now = Date.now();
      const rawCache = JSON.parse(localStorage.getItem('theo_remote_cache_v3') || '{}');
      const snap = rawCache.snapshot || rawCache.state || {};
      snap.rows = [
        {
          id: 'sess-ctx-claude840',
          title: 'Antigravity Claude 840k',
          provider: 'antigravity',
          model: 'MODEL_PLACEHOLDER_M402',
          folder: 'theo-hub',
          status: 'completed',
          usedTokens: 412000,
          limitTokens: 840000,
          at: now - 10000
        },
        {
          id: 'sess-ctx-overrun',
          title: 'Orchestrator Soft Overrun',
          provider: 'antigravity',
          model: 'MODEL_PLACEHOLDER_M667',
          folder: 'isabi-app',
          status: 'completed',
          usedTokens: 524592,
          limitTokens: 512000,
          at: now - 20000
        },
        {
          id: 'sess-ctx-zero',
          title: 'Carbon Exact 512k',
          provider: 'antigravity',
          model: 'MODEL_PLACEHOLDER_M437',
          folder: 'theo',
          status: 'completed',
          usedTokens: 512000,
          limitTokens: 512000,
          at: now - 30000
        },
        {
          id: 'sess-ctx-legacy840',
          title: 'Legacy Cache M402 at 256k',
          provider: 'antigravity',
          model: 'MODEL_PLACEHOLDER_M402',
          folder: 'theo',
          status: 'completed',
          usedTokens: 412000,
          limitTokens: 256000,
          at: now - 40000
        },
        {
          id: 'sess-ctx-orch-argon',
          title: 'Orchestrator Argon NonCatalog',
          provider: 'antigravity',
          model: 'MODEL_PLACEHOLDER_M681',
          folder: 'theo-hub',
          status: 'completed',
          usedTokens: 64000,
          limitTokens: 256000,
          at: now - 50000
        },
        {
          id: 'sess-ctx-worker-agy',
          title: 'Worker Carbon Display',
          provider: 'antigravity',
          model: 'gemini-flash-worker-agy',
          folder: 'theo-hub',
          status: 'completed',
          usedTokens: 442266,
          limitTokens: 0,
          at: now - 55000
        },
        {
          id: 'sess-ctx-sonnet1m',
          title: 'Claude Sonnet 4.6 1M Omit Limit',
          provider: 'claude',
          model: 'Claude Sonnet 4.6 (1M)',
          folder: 'theo',
          status: 'completed',
          usedTokens: 300000,
          limitTokens: 0,
          at: now - 60000
        },
        {
          id: 'sess-ctx-nan',
          title: 'Malformed Used Tokens Guard',
          provider: 'antigravity',
          model: 'MODEL_PLACEHOLDER_M405',
          folder: 'theo',
          status: 'completed',
          usedTokens: 'unknown',
          limitTokens: 0,
          at: now - 70000
        },
        {
          id: 'sess-ctx-claude1m-switch',
          title: 'Claude Switch 1M to 200k',
          provider: 'claude',
          model: 'claude-opus-4-7',
          folder: 'theo',
          status: 'completed',
          usedTokens: 150000,
          limitTokens: 1000000,
          at: now - 80000
        }
      ];
      rawCache.snapshot = snap;
      rawCache.state = snap;
      rawCache.threads = rawCache.threads || {};
      rawCache.threads['sess-ctx-claude840'] = {
        id: 'sess-ctx-claude840',
        provider: 'antigravity',
        model: 'MODEL_PLACEHOLDER_M402',
        contextWindow: {
          provider: 'antigravity',
          modelLabel: 'MODEL_PLACEHOLDER_M402',
          usedTokens: 412000,
          limitTokens: 840000,
          remainingTokens: 428000,
          pct: 49,
          breakdown: [{ key: 'user', label: 'Prompts & Replies', tokens: 412000 }]
        },
        messages: [{ id: 'ctx-m1', role: 'user', text: 'Verify 840k window.', createdAt: new Date(now - 10000).toISOString() }]
      };
      rawCache.threads['sess-ctx-overrun'] = {
        id: 'sess-ctx-overrun',
        provider: 'antigravity',
        model: 'MODEL_PLACEHOLDER_M667',
        contextWindow: {
          provider: 'antigravity',
          modelLabel: 'MODEL_PLACEHOLDER_M667',
          usedTokens: 524592,
          limitTokens: 512000,
          remainingTokens: 0,
          pct: 100,
          breakdown: [{ key: 'tools', label: 'Tool Outputs', tokens: 524592 }]
        },
        messages: [{ id: 'ctx-m2', role: 'user', text: 'Verify soft overrun.', createdAt: new Date(now - 20000).toISOString() }]
      };
      rawCache.threads['sess-ctx-zero'] = {
        id: 'sess-ctx-zero',
        provider: 'antigravity',
        model: 'MODEL_PLACEHOLDER_M437',
        contextWindow: {
          provider: 'antigravity',
          modelLabel: 'MODEL_PLACEHOLDER_M437',
          usedTokens: 512000,
          limitTokens: 512000,
          remainingTokens: 0,
          pct: 100,
          breakdown: [{ key: 'user', label: 'Prompts & Replies', tokens: 512000 }]
        },
        messages: [{ id: 'ctx-m3', role: 'user', text: 'Verify zero remaining.', createdAt: new Date(now - 30000).toISOString() }]
      };
      rawCache.threads['sess-ctx-legacy840'] = {
        id: 'sess-ctx-legacy840',
        provider: 'antigravity',
        model: 'MODEL_PLACEHOLDER_M402',
        contextWindow: {
          provider: 'antigravity',
          modelLabel: 'MODEL_PLACEHOLDER_M402',
          usedTokens: 412000,
          limitTokens: 256000,
          remainingTokens: 0,
          pct: 100,
          breakdown: [{ key: 'user', label: 'Prompts & Replies', tokens: 412000 }]
        },
        messages: [{ id: 'ctx-m4', role: 'user', text: 'Verify pre-v72 256k -> 840k upgrade.', createdAt: new Date(now - 40000).toISOString() }]
      };
      rawCache.threads['sess-ctx-orch-argon'] = {
        id: 'sess-ctx-orch-argon',
        provider: 'antigravity',
        model: 'MODEL_PLACEHOLDER_M681',
        contextWindow: {
          provider: 'antigravity',
          modelLabel: 'MODEL_PLACEHOLDER_M681',
          usedTokens: 64000,
          limitTokens: 256000,
          remainingTokens: 192000,
          pct: 25
        },
        messages: [{ id: 'ctx-m5', role: 'user', text: 'Verify Orchestrator (Argon) non-catalog preservation.', createdAt: new Date(now - 50000).toISOString() }]
      };
      rawCache.threads['sess-ctx-nan'] = {
        id: 'sess-ctx-nan',
        provider: 'antigravity',
        model: 'MODEL_PLACEHOLDER_M405',
        contextWindow: {
          provider: 'antigravity',
          modelLabel: 'MODEL_PLACEHOLDER_M405',
          usedTokens: 'unknown',
          limitTokens: 0
        },
        messages: [{ id: 'ctx-m6', role: 'user', text: 'Verify malformed token guard.', createdAt: new Date(now - 70000).toISOString() }]
      };
      rawCache.threads['sess-ctx-claude1m-switch'] = {
        id: 'sess-ctx-claude1m-switch',
        provider: 'claude',
        model: 'claude-opus-4-7',
        contextWindow: {
          provider: 'claude',
          modelLabel: 'Claude Opus 4.7 (1M)',
          usedTokens: 150000,
          limitTokens: 1000000,
          remainingTokens: 850000,
          pct: 15
        },
        messages: [{ id: 'ctx-m7', role: 'user', text: 'Verify 1M to 200k switch.', createdAt: new Date(now - 80000).toISOString() }]
      };
      localStorage.setItem('theo_remote_cache_v3', JSON.stringify(rawCache));
      const prefs = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');
      prefs.activeTab = 'sessions';
      prefs.selectedThreadId = 'sess-ctx-claude840';
      prefs.threadModelConfig = {};
      localStorage.setItem('theo_remote_prefs_v1', JSON.stringify(prefs));
      return true;
    })()`);
    await cdp.send('Page.navigate', { url: `${baseUrl}/?nosse=1` }, sessionId);
    await new Promise((r) => setTimeout(r, 700));

    const ctxCardsProbe = await evalJs(`(() => {
      const readCard = (id) => {
        const el = document.querySelector('#view-sessions .session-card[data-session-id="' + id + '"]');
        return el ? el.textContent.replace(/\\s+/g, ' ').trim() : '';
      };
      return {
        claude: readCard('sess-ctx-claude840'),
        overrun: readCard('sess-ctx-overrun'),
        zero: readCard('sess-ctx-zero'),
        legacy840: readCard('sess-ctx-legacy840'),
        orchArgon: readCard('sess-ctx-orch-argon'),
        workerAgy: readCard('sess-ctx-worker-agy'),
        sonnet1m: readCard('sess-ctx-sonnet1m'),
        nanGuard: readCard('sess-ctx-nan'),
        titleCount: document.querySelectorAll('[title]').length,
        overflowX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
      };
    })()`);
    assert.ok(ctxCardsProbe.claude.includes('Claude Opus 5.5 (High)'), `Expected Claude Opus 5.5 (High) card label, got: ${ctxCardsProbe.claude}`);
    assert.ok(ctxCardsProbe.claude.includes('412k / 840k · 49%'), `Expected 412k / 840k · 49% on card, got: ${ctxCardsProbe.claude}`);
    assert.ok(ctxCardsProbe.overrun.includes('Orchestrator (Carbon)'), `Expected Orchestrator (Carbon) card label, got: ${ctxCardsProbe.overrun}`);
    assert.ok(ctxCardsProbe.overrun.includes('525k / 512k · 100%'), `Expected 525k / 512k · 100% on card, got: ${ctxCardsProbe.overrun}`);
    assert.ok(ctxCardsProbe.zero.includes('Gemini 4 Carbon (Medium)'), `Expected Gemini 4 Carbon (Medium) card label, got: ${ctxCardsProbe.zero}`);
    assert.ok(ctxCardsProbe.zero.includes('512k / 512k · 100%'), `Expected 512k / 512k · 100% on card, got: ${ctxCardsProbe.zero}`);
    assert.ok(ctxCardsProbe.legacy840.includes('412k / 840k · 49%'), `Legacy 256k cache for M402 must auto-upgrade to 840k, got: ${ctxCardsProbe.legacy840}`);
    assert.ok(ctxCardsProbe.orchArgon.includes('Orchestrator (Argon)'), `Expected Orchestrator (Argon) card label, got: ${ctxCardsProbe.orchArgon}`);
    assert.ok(ctxCardsProbe.workerAgy.includes('Orchestrator (Carbon)') && ctxCardsProbe.workerAgy.includes('442k / 512k · 86%'), `Expected Orchestrator (Carbon) at 442k / 512k · 86% for gemini-flash-worker-agy, got: ${ctxCardsProbe.workerAgy}`);
    assert.ok(ctxCardsProbe.sonnet1m.includes('300k / 1M · 30%'), `Expected Claude Sonnet 4.6 (1M) card at 300k / 1M, got: ${ctxCardsProbe.sonnet1m}`);
    assert.ok(ctxCardsProbe.nanGuard.includes('Claude Sonnet 5.5 (High)'), `Malformed usedTokens card should keep clean model label, got: ${ctxCardsProbe.nanGuard}`);
    assert.strictEqual(ctxCardsProbe.nanGuard.includes('NaN'), false, 'Card text must never render NaN');
    assert.strictEqual(ctxCardsProbe.titleCount, 0, 'PWA must keep zero [title] attributes');
    assert.strictEqual(ctxCardsProbe.overflowX, 0, 'Mobile sessions list must have 0px horizontal overflow');

    const probeChatContext = async (tid) => {
      await evalJs(`(() => {
        const prefs = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');
        prefs.activeTab = 'chat';
        prefs.selectedThreadId = ${JSON.stringify(tid)};
        localStorage.setItem('theo_remote_prefs_v1', JSON.stringify(prefs));
        return true;
      })()`);
      await cdp.send('Page.navigate', { url: `${baseUrl}/?nosse=1` }, sessionId);
      const navDeadline = Date.now() + 5000;
      while (Date.now() < navDeadline) {
        const ready = await evalJs(`Boolean(document.getElementById('view-chat')?.classList.contains('active') && document.getElementById('ctx-pill-label')?.textContent?.trim() && document.getElementById('ctx-pill-label').textContent.trim() !== '0 / 512k · 0%')`);
        if (ready) break;
        await new Promise((r) => setTimeout(r, 80));
      }
      await new Promise((r) => setTimeout(r, 60));
      return evalJs(`(() => {
        document.getElementById('btn-ctx-window')?.click();
        return {
          modelPill: document.getElementById('composer-model-label')?.textContent?.trim() || '',
          ctxPill: document.getElementById('ctx-pill-label')?.textContent?.trim() || '',
          summary: document.getElementById('ctx-meter-summary')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
          titleCount: document.querySelectorAll('[title]').length,
          overflowX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
        };
      })()`);
    };

    const chatClaude840 = await probeChatContext('sess-ctx-claude840');
    assert.strictEqual(chatClaude840.modelPill, 'Claude Opus 5.5 (High)');
    assert.strictEqual(chatClaude840.ctxPill, '412k / 840k · 49%');
    assert.ok(chatClaude840.summary.includes('412,000 tokens used of 840,000 (49%)'), `Unexpected 840k summary: ${chatClaude840.summary}`);
    assert.ok(chatClaude840.summary.includes('428,000 remaining'), `Expected 428,000 remaining, got: ${chatClaude840.summary}`);
    assert.strictEqual(chatClaude840.titleCount, 0);
    assert.strictEqual(chatClaude840.overflowX, 0);

    const chatOverrun = await probeChatContext('sess-ctx-overrun');
    assert.strictEqual(chatOverrun.modelPill, 'Orchestrator (Carbon)');
    assert.strictEqual(chatOverrun.ctxPill, '525k / 512k · 100%');
    assert.ok(chatOverrun.summary.includes('524,592 tokens used of 512,000 (100%)'), `Unexpected overrun summary: ${chatOverrun.summary}`);
    assert.ok(chatOverrun.summary.includes('+12,592 over soft target (auto-compacts next turn)'), `Expected soft overrun copy, got: ${chatOverrun.summary}`);
    assert.strictEqual(chatOverrun.titleCount, 0);
    assert.strictEqual(chatOverrun.overflowX, 0);

    const chatZero = await probeChatContext('sess-ctx-zero');
    assert.strictEqual(chatZero.modelPill, 'Gemini 4 Carbon (Medium)');
    assert.strictEqual(chatZero.ctxPill, '512k / 512k · 100%');
    assert.ok(chatZero.summary.includes('0 remaining'), `Expected explicit 0 remaining on exact 512k boundary, got: ${chatZero.summary}`);
    assert.strictEqual(chatZero.summary.includes('over soft target'), false, 'Exact 512k boundary must not claim soft overrun');
    assert.strictEqual(chatZero.titleCount, 0);
    assert.strictEqual(chatZero.overflowX, 0);

    // Pre-v72 M402 cache at 256k must auto-upgrade to 840k in chat pill & popover
    const chatLegacy840 = await probeChatContext('sess-ctx-legacy840');
    assert.strictEqual(chatLegacy840.modelPill, 'Claude Opus 5.5 (High)');
    assert.strictEqual(chatLegacy840.ctxPill, '412k / 840k · 49%');
    assert.ok(chatLegacy840.summary.includes('428,000 remaining'), `Expected legacy M402 upgrade to 840k, got: ${chatLegacy840.summary}`);

    // Toggle effort on non-catalog Claude Opus 5.5 must preserve Claude Opus 5.5 (Medium) across reload
    const afterEffortNonCatalog = await evalJs(`(() => {
      document.getElementById('composer-model-btn')?.click();
      const activeMenuCount = document.querySelectorAll('#model-picker-body .vs-model-menu-item.active').length;
      document.querySelector('#model-picker-body [data-toggle-model-effort-bar="1"]')?.click();
      document.querySelector('#model-picker-body [data-select-ai-effort="medium"]')?.click();
      return {
        activeMenuCount,
        pillAfterEffort: document.getElementById('composer-model-label')?.textContent?.trim() || ''
      };
    })()`);
    assert.strictEqual(afterEffortNonCatalog.activeMenuCount, 0, 'Non-catalog session must not check a catalog model item');
    assert.strictEqual(afterEffortNonCatalog.pillAfterEffort, 'Claude Opus 5.5 (Medium)');
    await cdp.send('Page.navigate', { url: `${baseUrl}/?nosse=1` }, sessionId);
    await new Promise((r) => setTimeout(r, 550));
    const pillAfterReload = await evalJs(`document.getElementById('composer-model-label')?.textContent?.trim() || ''`);
    assert.strictEqual(pillAfterReload, 'Claude Opus 5.5 (Medium)', 'Non-catalog customModel effort override must survive reload');

    // Orchestrator (Argon) must auto-upgrade stale 256k -> 512k, not alias to Gemini 4 Argon, and effort toggle must preserve Orchestrator (Argon)
    const chatOrchArgon = await probeChatContext('sess-ctx-orch-argon');
    assert.strictEqual(chatOrchArgon.modelPill, 'Orchestrator (Argon)');
    assert.strictEqual(chatOrchArgon.ctxPill, '64k / 512k · 13%');
    const orchAfterEffort = await evalJs(`(() => {
      document.getElementById('composer-model-btn')?.click();
      document.querySelector('#model-picker-body [data-toggle-model-effort-bar="1"]')?.click();
      document.querySelector('#model-picker-body [data-select-ai-effort="medium"]')?.click();
      return document.getElementById('composer-model-label')?.textContent?.trim() || '';
    })()`);
    assert.strictEqual(orchAfterEffort, 'Orchestrator (Argon)');

    // Malformed usedTokens must never emit NaN in chat popover
    const chatNan = await probeChatContext('sess-ctx-nan');
    assert.strictEqual(chatNan.ctxPill, '0 / 840k · 0%');
    assert.strictEqual(chatNan.summary.includes('NaN'), false, `Chat summary must not contain NaN: ${chatNan.summary}`);

    // Switching active 1M Claude session -> Claude Sonnet 4.6 must immediately update denominator 1M -> 200k
    const chatBeforeSwitch = await probeChatContext('sess-ctx-claude1m-switch');
    assert.strictEqual(chatBeforeSwitch.ctxPill, '150k / 1M · 15%');
    const chatAfterSwitch = await evalJs(`(() => {
      document.getElementById('composer-model-btn')?.click();
      document.querySelector('#model-picker-body [data-select-model-combo="claude-sonnet-4-6:high"]')?.click();
      return {
        modelPill: document.getElementById('composer-model-label')?.textContent?.trim() || '',
        ctxPill: document.getElementById('ctx-pill-label')?.textContent?.trim() || ''
      };
    })()`);
    assert.strictEqual(chatAfterSwitch.modelPill, 'Claude Sonnet 4.6 (High)');
    assert.strictEqual(chatAfterSwitch.ctxPill, '150k / 200k · 75%');
    console.log('[PASS] Adversarial #19: v72 840k Claude-on-Antigravity, >256k Gemini soft-overrun telemetry, Orchestrator/Carbon/Hydrogen labels, 256k->840k upgrade, model switch recompute & NaN guard verified');

    // Adversarial #20: Incremental WS rowPatch delta sync, cross-provider bare-id guard, seq resync & dual-socket failover
    {
      const nodeCrypto = require('crypto');
      const wsClients = new Set();
      const wsByRole = { local: null, edge: null };
      const recvLocalMsgs = [];
      const recvEdgeMsgs = [];
      let localAuthDone = false;
      let edgeAuthDone = false;

      const encodeWsTextFrame = (obj) => {
        const payload = Buffer.from(JSON.stringify(obj), 'utf8');
        const len = payload.length;
        let header;
        if (len < 126) {
          header = Buffer.allocUnsafe(2);
          header[0] = 0x81;
          header[1] = len;
        } else if (len < 65536) {
          header = Buffer.allocUnsafe(4);
          header[0] = 0x81;
          header[1] = 126;
          header.writeUInt16BE(len, 2);
        } else {
          header = Buffer.allocUnsafe(10);
          header[0] = 0x81;
          header[1] = 127;
          header.writeBigUInt64BE(BigInt(len), 2);
        }
        return Buffer.concat([header, payload]);
      };

      const sendWsJson = (sock, obj) => {
        if (!sock || sock.destroyed || !sock.writable) return false;
        sock.write(encodeWsTextFrame(obj));
        return true;
      };

      const mockWsSrv = http.createServer((_req, res) => {
        res.writeHead(404);
        res.end();
      });

      mockWsSrv.on('upgrade', (req, socket) => {
        const key = req.headers['sec-websocket-key'];
        if (!key) {
          socket.destroy();
          return;
        }
        const accept = nodeCrypto
          .createHash('sha1')
          .update(String(key).trim() + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
          .digest('base64');
        socket.write(
          [
            'HTTP/1.1 101 Switching Protocols',
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Accept: ${accept}`,
            '',
            ''
          ].join('\r\n')
        );
        wsClients.add(socket);
        const reqPath = String(req.url || '/');
        const isEdge = reqPath.startsWith('/edge/ws');
        if (isEdge) wsByRole.edge = socket;
        else wsByRole.local = socket;

        let buf = Buffer.alloc(0);
        socket.on('data', (chunk) => {
          buf = Buffer.concat([buf, chunk]);
          while (buf.length >= 2) {
            const b0 = buf[0];
            const b1 = buf[1];
            const opcode = b0 & 0x0f;
            const masked = (b1 & 0x80) !== 0;
            let len = b1 & 0x7f;
            let offset = 2;
            if (len === 126) {
              if (buf.length < 4) return;
              len = buf.readUInt16BE(2);
              offset = 4;
            } else if (len === 127) {
              if (buf.length < 10) return;
              len = Number(buf.readBigUInt64BE(2));
              offset = 10;
            }
            const totalNeeded = offset + (masked ? 4 : 0) + len;
            if (buf.length < totalNeeded) return;
            const maskKey = masked ? buf.subarray(offset, offset + 4) : null;
            const payloadStart = offset + (masked ? 4 : 0);
            const rawPayload = Buffer.from(buf.subarray(payloadStart, payloadStart + len));
            buf = buf.subarray(totalNeeded);
            if (masked && maskKey) {
              for (let i = 0; i < rawPayload.length; i += 1) {
                rawPayload[i] ^= maskKey[i % 4];
              }
            }
            if (opcode === 0x8) {
              try {
                socket.end();
              } catch {}
              return;
            }
            if (opcode === 0x9) {
              if (!socket.destroyed && socket.writable) {
                const pongHdr = Buffer.from([0x8a, Math.min(125, rawPayload.length)]);
                socket.write(Buffer.concat([pongHdr, rawPayload.subarray(0, 125)]));
              }
              continue;
            }
            if (opcode !== 0x1) continue;
            let msg = null;
            try {
              msg = JSON.parse(rawPayload.toString('utf8'));
            } catch {
              continue;
            }
            if (!msg || typeof msg !== 'object') continue;
            if (isEdge) recvEdgeMsgs.push(msg);
            else recvLocalMsgs.push(msg);
            if (msg.type === 'auth' || msg.type === 'auth_client') {
              if (msg.token === 'test-token-hex') {
                if (isEdge) edgeAuthDone = true;
                else localAuthDone = true;
                sendWsJson(socket, {
                  type: 'auth_ok',
                  device: { id: 'ws-dev-1', name: 'WS Dev 1', role: 'primary' },
                  devices: [{ id: 'ws-dev-1', name: 'WS Dev 1', online: true, local: !isEdge, sessionCount: 620 }]
                });
              } else {
                sendWsJson(socket, { type: 'auth_err' });
              }
            } else if (msg.type === 'ping') {
              sendWsJson(socket, { type: 'pong', echoTs: msg.ts });
            }
          }
        });
        socket.on('close', () => wsClients.delete(socket));
        socket.on('error', () => wsClients.delete(socket));
      });

      const waitForCond = async (fn, label, timeoutMs = 5000) => {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          const val = await fn();
          if (val) return val;
          await new Promise((r) => setTimeout(r, 40));
        }
        throw new Error(`Adversarial #20 timed out waiting for: ${label}`);
      };

      await new Promise((resolve, reject) => {
        mockWsSrv.listen(0, '127.0.0.1', resolve);
        mockWsSrv.on('error', reject);
      });

      try {
        const wsPort = mockWsSrv.address().port;
        const wsHttpBase = `http://127.0.0.1:${wsPort}`;
        const baseAt = Date.now();
        const fullRows620 = [];
        for (let i = 0; i < 618; i += 1) {
          fullRows620.push({
            id: `ws-r-${i}`,
            key: `antigravity:ws-r-${i}`,
            provider: 'antigravity',
            title: `WS Row ${i}`,
            status: 'idle',
            at: baseAt - i * 100
          });
        }
        fullRows620.push({
          id: 'shared-x',
          key: 'antigravity:shared-x',
          provider: 'antigravity',
          title: 'AG Shared',
          status: 'idle',
          at: baseAt + 200
        });
        fullRows620.push({
          id: 'shared-x',
          key: 'claude:shared-x',
          provider: 'claude',
          title: 'Claude Shared',
          status: 'idle',
          at: baseAt + 100
        });
        fullRows620.push({
          id: 'keyless-shared',
          provider: 'claude',
          title: 'Keyless Claude',
          status: 'idle',
          at: baseAt + 300
        });
        fullRows620.push({
          id: 'keyless-shared',
          key: 'antigravity:keyless-shared',
          provider: 'antigravity',
          title: 'AG Keyed Shared',
          status: 'idle',
          at: baseAt + 250
        });
        fullRows620.push({
          id: 'keyless-del',
          provider: 'claude',
          title: 'Keyless To Delete',
          status: 'idle',
          at: baseAt + 50
        });
        const expectedInitRawRows = fullRows620.length; // 623
        const expectedInitUnifiedRows = 621; // 618 + shared-x + keyless-shared + keyless-del
        const expectedAfterPatchUnifiedRows = 621; // +ws-r-new -keyless-del (claude:shared-x remains)
        const expectedAfterPatchRawRows = 622; // 623 + ws-r-new - antigravity:shared-x - keyless-del

        const buildWsSnapshot = (rowsArr, genAt = Date.now()) => ({
          generatedAt: genAt,
          device: { id: 'ws-dev-1', name: 'WS Dev 1', role: 'primary' },
          devices: [{ id: 'ws-dev-1', name: 'WS Dev 1', online: true, local: true, sessionCount: rowsArr.length, lastSeen: genAt }],
          total: rowsArr.length,
          rows: rowsArr,
          providers: {
            antigravity: { signedIn: true, accounts: [] },
            claude: { signedIn: true, accounts: [] }
          },
          summary: { today: { tokens: 12000, sessions: rowsArr.length } },
          topSessions: rowsArr.slice(0, 5)
        });

        // 1. Connect localWs on /api/ws and receive initial seq: 1 state (620 rows)
        await evalJs(`(() => {
          window.__THEO_ALLOW_MOCK_WS = true;
          window.__THEO_MOCK_BRIDGE_TOKEN = 'test-token-hex';
          window.__theoTestWs.connectLocalWs(${JSON.stringify(wsHttpBase)}, { wsPath: '/api/ws' });
          return true;
        })()`);
        await waitForCond(() => localAuthDone && wsByRole.local, 'localWs auth');
        const localAuthMsg = recvLocalMsgs.find((m) => m.type === 'auth');
        assert(localAuthMsg, 'Expected localWs auth message');
        assert.strictEqual(localAuthMsg.protocol, 2, 'Expected protocol === 2 on localWs auth');
        assert.strictEqual(localAuthMsg.supportsRowPatch, true, 'Expected supportsRowPatch === true on localWs auth');
        sendWsJson(wsByRole.local, {
          type: 'state',
          seq: 1,
          deviceId: 'ws-dev-1',
          state: buildWsSnapshot(fullRows620, baseAt)
        });

        const s1 = await waitForCond(
          () =>
            evalJs(`(() => {
              const st = window.__theoTestWs.getState();
              const stats = window.__theoWsDeltaStats || {};
              const devRows = (st?.rows || []).filter((r) => r.deviceId === 'ws-dev-1');
              const baseRows = window.__theoTestWs.getBaselineRows('local', 'ws-dev-1');
              if (stats.stateFrames < 1 || stats.lastSeq !== 1 || devRows.length !== ${expectedInitUnifiedRows}) return null;
              return { devRowsCount: devRows.length, baseRowsCount: baseRows.length, stats: { ...stats } };
            })()`),
          'initial seq:1 baseline state'
        );
        assert.strictEqual(
          s1.devRowsCount,
          expectedInitUnifiedRows,
          `Initial unified ws-dev-1 rows should equal ${expectedInitUnifiedRows}`
        );
        assert.strictEqual(
          s1.baseRowsCount,
          expectedInitRawRows,
          `Initial baseline ws-dev-1 raw rows should equal ${expectedInitRawRows}`
        );

        // 2. Apply local optimistic override on ws-r-1, then send seq: 2 rowPatch with upsert, add, keyless promotion/removal & cross-provider shared-id removal
        await evalJs(`(() => {
          window.__theoTestWs.noteRowOverride('ws-r-1', { unread: true });
          return true;
        })()`);
        sendWsJson(wsByRole.local, {
          type: 'rowPatch',
          seq: 2,
          deviceId: 'ws-dev-1',
          generatedAt: baseAt + 2000,
          total: expectedAfterPatchRawRows,
          upserts: [
            {
              id: 'ws-r-2',
              key: 'antigravity:ws-r-2',
              provider: 'antigravity',
              title: 'WS Row 2',
              status: 'running',
              at: baseAt + 500
            },
            {
              id: 'ws-r-new',
              key: 'antigravity:ws-r-new',
              provider: 'antigravity',
              title: 'Added By Patch',
              status: 'running',
              at: baseAt + 400
            },
            {
              id: 'keyless-shared',
              key: 'claude:keyless-shared',
              provider: 'claude',
              title: 'Promoted Claude Keyless',
              status: 'running',
              at: baseAt + 600
            }
          ],
          removedIds: ['shared-x', 'keyless-del'],
          removedKeys: ['antigravity:shared-x']
        });

        const s2 = await waitForCond(
          () =>
            evalJs(`(() => {
              const stats = window.__theoWsDeltaStats || {};
              if (stats.patchFrames < 1 || stats.lastSeq < 2) return null;
              const rows = (window.__theoTestWs.getState()?.rows || []).filter((r) => r.deviceId === 'ws-dev-1');
              const baseRows = window.__theoTestWs.getBaselineRows('local', 'ws-dev-1');
              const r1 = rows.find((r) => r.id === 'ws-r-1');
              const r2 = rows.find((r) => r.id === 'ws-r-2');
              const rNew = rows.find((r) => r.id === 'ws-r-new');
              const rShared = rows.find((r) => r.id === 'shared-x');
              const keylessShared = baseRows.filter((r) => r.id === 'keyless-shared');
              const promotedClaude = keylessShared.find((r) => r.key === 'claude:keyless-shared');
              const agKeyed = keylessShared.find((r) => r.key === 'antigravity:keyless-shared');
              return {
                devRowsCount: rows.length,
                baseRowsCount: baseRows.length,
                r1Unread: Boolean(r1?.unread),
                r2Status: r2?.status || '',
                rNewTitle: rNew?.title || '',
                rSharedProvider: rShared?.provider || '',
                rSharedTitle: rShared?.title || '',
                rSharedKey: rShared?.key || '',
                keylessSharedCount: keylessShared.length,
                promotedStatus: promotedClaude?.status || '',
                promotedTitle: promotedClaude?.title || '',
                agKeyedTitle: agKeyed?.title || '',
                hasKeylessDel: baseRows.some((r) => r.id === 'keyless-del')
              };
            })()`),
          'seq:2 rowPatch with override & cross-provider/keyless guards'
        );
        assert.strictEqual(
          s2.devRowsCount,
          expectedAfterPatchUnifiedRows,
          `After removing antigravity:shared-x and keyless-del and adding ws-r-new, unified row count should be ${expectedAfterPatchUnifiedRows}`
        );
        assert.strictEqual(
          s2.baseRowsCount,
          expectedAfterPatchRawRows,
          `Baseline raw rows after seq:2 rowPatch should be ${expectedAfterPatchRawRows}`
        );
        assert.strictEqual(s2.r1Unread, true, 'Local optimistic override (unread: true) on ws-r-1 must survive rowPatch');
        assert.strictEqual(s2.r2Status, 'running', 'rowPatch upsert should update ws-r-2 status');
        assert.strictEqual(s2.rNewTitle, 'Added By Patch', 'rowPatch should insert ws-r-new');
        assert.strictEqual(s2.rSharedProvider, 'claude', 'Cross-provider shared-id removal must keep claude:shared-x intact');
        assert.strictEqual(s2.rSharedTitle, 'Claude Shared');
        assert.strictEqual(s2.keylessSharedCount, 2, 'Keyless row promotion must update existing keyless entry without duplicating provider row');
        assert.strictEqual(s2.promotedStatus, 'running');
        assert.strictEqual(s2.promotedTitle, 'Promoted Claude Keyless');
        assert.strictEqual(s2.agKeyedTitle, 'AG Keyed Shared');
        assert.strictEqual(s2.hasKeylessDel, false, 'Explicit removedKeys must still delete baseline rows with empty raw key matched via removedIds');

        // 3. Connect edgeWs sending 100-row compact host_state for ws-dev-1; assert suppressed while localWs is authoritative
        await evalJs(`(() => {
          window.__theoTestWs.connectEdgeWs(${JSON.stringify(wsHttpBase + '/edge/ws')});
          return true;
        })()`);
        await waitForCond(() => edgeAuthDone && wsByRole.edge, 'edgeWs auth');
        const edgeAuthMsg = recvEdgeMsgs.find((m) => m.type === 'auth_client');
        assert(edgeAuthMsg, 'Expected edgeWs auth_client message');
        assert.strictEqual(edgeAuthMsg.protocol, 2, 'Expected protocol === 2 on edgeWs auth_client');
        assert.strictEqual(edgeAuthMsg.supportsRowPatch, true, 'Expected supportsRowPatch === true on edgeWs auth_client');
        const edgeRows100 = [];
        for (let i = 0; i < 100; i += 1) {
          edgeRows100.push({
            id: `edge-r-${i}`,
            key: `antigravity:edge-r-${i}`,
            provider: 'antigravity',
            title: `Edge Row ${i}`,
            status: 'idle',
            at: baseAt + 4000 - i
          });
        }
        sendWsJson(wsByRole.edge, {
          type: 'host_state',
          deviceId: 'ws-dev-1',
          snapshot: buildWsSnapshot(edgeRows100, baseAt + 5000)
        });
        const s3 = await waitForCond(
          () =>
            evalJs(`(() => {
              const stats = window.__theoWsDeltaStats || {};
              if (stats.edgeSuppressedForLocal < 1) return null;
              const rows = (window.__theoTestWs.getState()?.rows || []).filter((r) => r.deviceId === 'ws-dev-1');
              return { devRowsCount: rows.length, hasWs0: rows.some((r) => r.id === 'ws-r-0'), hasEdge0: rows.some((r) => r.id === 'edge-r-0') };
            })()`),
          'edgeWs suppression while localWs authoritative'
        );
        assert.strictEqual(
          s3.devRowsCount,
          expectedAfterPatchUnifiedRows,
          'Compact edge host_state must not truncate authoritative localWs rows'
        );
        assert.strictEqual(s3.hasWs0, true);
        assert.strictEqual(s3.hasEdge0, false);

        // 4. Out-of-order seq: 9 rowPatch deletes ws-r-4 -> rejected + triggers resync_state -> seq: 10 state + seq: 11 rowPatch recovers
        sendWsJson(wsByRole.local, {
          type: 'rowPatch',
          seq: 9,
          deviceId: 'ws-dev-1',
          generatedAt: baseAt + 7000,
          upserts: [],
          removedIds: ['ws-r-4'],
          removedKeys: ['antigravity:ws-r-4']
        });
        await waitForCond(
          () => recvLocalMsgs.some((m) => m.type === 'resync_state'),
          'server receipt of resync_state on seq gap'
        );
        const midCheck = await evalJs(`(() => {
          const stats = window.__theoWsDeltaStats || {};
          const rows = (window.__theoTestWs.getState()?.rows || []).filter((r) => r.deviceId === 'ws-dev-1');
          return { resyncRequests: stats.resyncRequests, hasWs4: rows.some((r) => r.id === 'ws-r-4'), lastSeq: stats.lastSeq };
        })()`);
        assert(midCheck.resyncRequests >= 1, 'Expected resyncRequests >= 1 on seq gap');
        assert.strictEqual(midCheck.hasWs4, true, 'Out-of-order seq:9 removal must not apply before resync');
        assert.strictEqual(midCheck.lastSeq, 2);

        sendWsJson(wsByRole.local, {
          type: 'state',
          seq: 10,
          deviceId: 'ws-dev-1',
          state: buildWsSnapshot(fullRows620, baseAt + 8000)
        });
        await new Promise((r) => setTimeout(r, 40));
        sendWsJson(wsByRole.local, {
          type: 'rowPatch',
          seq: 11,
          deviceId: 'ws-dev-1',
          generatedAt: baseAt + 9000,
          upserts: [
            {
              id: 'ws-r-4',
              key: 'antigravity:ws-r-4',
              provider: 'antigravity',
              title: 'Recovered After Resync',
              status: 'running',
              at: baseAt + 900
            }
          ],
          removedIds: [],
          removedKeys: []
        });
        const s4 = await waitForCond(
          () =>
            evalJs(`(() => {
              const stats = window.__theoWsDeltaStats || {};
              if (stats.lastSeq !== 11) return null;
              const r4 = (window.__theoTestWs.getState()?.rows || []).find((r) => r.id === 'ws-r-4' && r.deviceId === 'ws-dev-1');
              return { lastSeq: stats.lastSeq, r4Title: r4?.title || '' };
            })()`),
          'seq:10 state + seq:11 recovery'
        );
        assert.strictEqual(s4.r4Title, 'Recovered After Resync');

        // 5. Edge failover when newer edge host_state is cached and localWs closes
        sendWsJson(wsByRole.edge, {
          type: 'host_state',
          deviceId: 'ws-dev-1',
          snapshot: buildWsSnapshot(edgeRows100, baseAt + 25000)
        });
        await waitForCond(
          () => evalJs('(window.__theoWsDeltaStats?.edgeSuppressedForLocal || 0) >= 2'),
          'second edge host_state cached while suppressed'
        );
        await evalJs(`(() => {
          window.__theoTestWs.disconnectLocal();
          return true;
        })()`);
        const s5 = await waitForCond(
          () =>
            evalJs(`(() => {
              const rows = (window.__theoTestWs.getState()?.rows || []).filter((r) => r.deviceId === 'ws-dev-1');
              if (rows.length !== 100) return null;
              return { devRowsCount: rows.length, hasEdge0: rows.some((r) => r.id === 'edge-r-0') };
            })()`),
          'edgeWs failover on localWs close'
        );
        assert.strictEqual(s5.devRowsCount, 100);
        assert.strictEqual(s5.hasEdge0, true);

        // 6. Edge WS host_row_patch seq gap -> rpc_cmd getState -> cooldown suppression when seq omitted -> seq:26 recovery + seq:27 patch
        const edgeRpcCmdCount = () =>
          recvEdgeMsgs.filter((m) => m.type === 'rpc_cmd' && m.action === 'getState').length;
        const patchFramesBeforeEdge = await evalJs('(window.__theoWsDeltaStats?.patchFrames || 0)');
        sendWsJson(wsByRole.edge, {
          type: 'host_row_patch',
          deviceId: 'ws-dev-1',
          seq: 25,
          generatedAt: baseAt + 26000,
          upserts: [
            {
              id: 'edge-r-0',
              key: 'antigravity:edge-r-0',
              provider: 'antigravity',
              title: 'Premature',
              status: 'running',
              at: baseAt + 26000
            }
          ],
          removedIds: [],
          removedKeys: []
        });
        const firstEdgeRpc = await waitForCond(
          () => recvEdgeMsgs.find((m) => m.type === 'rpc_cmd' && m.action === 'getState'),
          'Edge WS rpc_cmd getState on host_row_patch seq gap'
        );
        sendWsJson(wsByRole.edge, {
          type: 'rpc_res',
          reqId: firstEdgeRpc.reqId,
          deviceId: 'ws-dev-1',
          ok: true,
          result: { ok: true, state: buildWsSnapshot(edgeRows100, baseAt + 26500) }
        });
        await new Promise((r) => setTimeout(r, 80));
        const resyncCountBeforeCooldown = await evalJs('(window.__theoWsDeltaStats?.resyncRequests || 0)');
        sendWsJson(wsByRole.edge, {
          type: 'host_row_patch',
          deviceId: 'ws-dev-1',
          seq: 25,
          generatedAt: baseAt + 26600,
          upserts: [
            {
              id: 'edge-r-0',
              key: 'antigravity:edge-r-0',
              provider: 'antigravity',
              title: 'Premature 2',
              status: 'running',
              at: baseAt + 26600
            }
          ],
          removedIds: [],
          removedKeys: []
        });
        await new Promise((r) => setTimeout(r, 60));
        const cooldownCheck = await evalJs(`(() => ({
          resyncRequests: window.__theoWsDeltaStats?.resyncRequests || 0,
          edge0Title: (window.__theoTestWs.getState()?.rows || []).find((r) => r.id === 'edge-r-0' && r.deviceId === 'ws-dev-1')?.title || ''
        }))()`);
        assert.strictEqual(
          cooldownCheck.resyncRequests,
          resyncCountBeforeCooldown,
          '1500ms resync cooldown must suppress immediate duplicate Edge getState after seq-less rpc_res'
        );
        assert.strictEqual(edgeRpcCmdCount(), 1, 'Expected only 1 Edge getState RPC during cooldown window');
        assert.strictEqual(cooldownCheck.edge0Title, 'Edge Row 0', 'Out-of-order seq:25 patch must not mutate edge-r-0');

        await new Promise((r) => setTimeout(r, 1550));
        sendWsJson(wsByRole.edge, {
          type: 'host_row_patch',
          deviceId: 'ws-dev-1',
          seq: 25,
          generatedAt: baseAt + 26800,
          upserts: [
            {
              id: 'edge-r-0',
              key: 'antigravity:edge-r-0',
              provider: 'antigravity',
              title: 'Premature 3',
              status: 'running',
              at: baseAt + 26800
            }
          ],
          removedIds: [],
          removedKeys: []
        });
        const secondEdgeRpc = await waitForCond(
          () => recvEdgeMsgs.find((m) => m.type === 'rpc_cmd' && m.action === 'getState' && m.reqId !== firstEdgeRpc.reqId),
          'Second Edge WS rpc_cmd getState after cooldown'
        );
        sendWsJson(wsByRole.edge, {
          type: 'rpc_res',
          reqId: secondEdgeRpc.reqId,
          deviceId: 'ws-dev-1',
          ok: true,
          result: { ok: true, seq: 26, state: buildWsSnapshot(edgeRows100, baseAt + 27000) }
        });
        await waitForCond(
          () => evalJs('(window.__theoWsDeltaStats?.lastSeq || 0) === 26'),
          'Edge WS getState seq:26 recovery'
        );
        sendWsJson(wsByRole.edge, {
          type: 'host_row_patch',
          deviceId: 'ws-dev-1',
          seq: 27,
          generatedAt: baseAt + 28000,
          upserts: [
            {
              id: 'edge-r-0',
              key: 'antigravity:edge-r-0',
              provider: 'antigravity',
              title: 'Edge Patched Seq 27',
              status: 'running',
              at: baseAt + 28000
            }
          ],
          removedIds: [],
          removedKeys: []
        });
        const s6 = await waitForCond(
          () =>
            evalJs(`(() => {
              const stats = window.__theoWsDeltaStats || {};
              const row = (window.__theoTestWs.getState()?.rows || []).find((r) => r.id === 'edge-r-0' && r.deviceId === 'ws-dev-1');
              if (stats.lastSeq !== 27 || !row || row.title !== 'Edge Patched Seq 27') return null;
              return { lastSeq: stats.lastSeq, patchFrames: stats.patchFrames, title: row.title, status: row.status };
            })()`),
          'Edge WS host_row_patch seq:27 apply'
        );
        assert.strictEqual(s6.lastSeq, 27);
        assert(s6.patchFrames > patchFramesBeforeEdge, 'Expected patchFrames to increment on Edge seq:27 patch');
        assert.strictEqual(s6.title, 'Edge Patched Seq 27');
        assert.strictEqual(s6.status, 'running');

        await cdp.send(
          'Emulation.setDeviceMetricsOverride',
          { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false },
          sessionId
        );
        await new Promise((r) => setTimeout(r, 80));
        const uiGate = await evalJs(`(() => ({
          titles: document.querySelectorAll('[title]').length,
          overflow: document.documentElement.scrollWidth - window.innerWidth
        }))()`);
        assert.strictEqual(uiGate.titles, 0, 'Expected 0 [title] elements after WS delta updates');
        assert(uiGate.overflow <= 0, `Expected <= 0 horizontal overflow on desktop, got ${uiGate.overflow}`);
        console.log('[PASS] Adversarial #20: Incremental WS rowPatch delta sync, cross-provider bare-id guard, seq gap resync & dual-socket failover verified');
      } finally {
        try {
          await evalJs('window.__theoTestWs?.disconnectAll?.()');
        } catch {}
        for (const s of wsClients) {
          try {
            s.destroy();
          } catch {}
        }
        await new Promise((r) => mockWsSrv.close(r));
      }
    }

    // Adversarial #21: v74 Live GetUserStatus model-capacity sync, dual-tone +Nk soft-overrun ring,
    // and (v76) Pinned Constraints removed: no strip, no composer button, no /pin command, stale cached pins inert
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sessionId);
    const v73SeedOk = await evalJs(`(() => {
      const now = Date.now();
      const rawCache = JSON.parse(localStorage.getItem('theo_remote_cache_v3') || '{}');
      const snap = rawCache.snapshot || rawCache.state || {};
      snap.antigravityModelCatalog = {
        source: 'GetUserStatus',
        updatedAt: now,
        models: [
          {
            modelId: 'MODEL_PLACEHOLDER_M777',
            label: 'Gemini 5 Nova (High)',
            baseLabel: 'Gemini 5 Nova',
            aliases: ['MODEL_PLACEHOLDER_M777', 'Gemini 5 Nova'],
            isFirstPartyGemini: true,
            isClaudeLike: false,
            supportsThinking: true,
            maxContextTokens: 512000,
            softCompactionTargetTokens: 512000,
            hardMaxTokens: 1000000
          },
          {
            modelId: 'MODEL_PLACEHOLDER_M402',
            label: 'Claude Opus 5.5 (High)',
            baseLabel: 'Claude Opus 5.5',
            aliases: ['MODEL_PLACEHOLDER_M402', 'Claude Opus 5.5'],
            isFirstPartyGemini: false,
            isClaudeLike: true,
            supportsThinking: true,
            maxContextTokens: 256000,
            softCompactionTargetTokens: 256000,
            hardMaxTokens: 256000
          },
          {
            modelId: 'MODEL_OPENAI_GPT_OSS_120B_MEDIUM',
            label: 'GPT-OSS 120B (Medium)',
            baseLabel: 'GPT-OSS 120B',
            aliases: ['MODEL_OPENAI_GPT_OSS_120B_MEDIUM', 'GPT-OSS 120B'],
            isFirstPartyGemini: false,
            isClaudeLike: false,
            supportsThinking: false,
            maxContextTokens: 128000,
            softCompactionTargetTokens: 128000,
            hardMaxTokens: 128000
          },
          {
            modelId: 'MODEL_PLACEHOLDER_M409',
            label: 'Claude Opus 6 (High)',
            baseLabel: 'Claude Opus 6',
            aliases: ['MODEL_PLACEHOLDER_M409', 'Claude Opus 6'],
            isFirstPartyGemini: false,
            isClaudeLike: true,
            supportsThinking: true,
            maxContextTokens: 1000000,
            softCompactionTargetTokens: 1000000,
            hardMaxTokens: 1000000
          },
          {
            modelId: 'MODEL_PLACEHOLDER_M779',
            label: 'Gemini Pro3',
            baseLabel: 'Gemini Pro3',
            aliases: ['MODEL_PLACEHOLDER_M779', 'Gemini Pro3'],
            isFirstPartyGemini: true,
            isClaudeLike: false,
            supportsThinking: true,
            maxContextTokens: 1000000,
            softCompactionTargetTokens: 1000000,
            hardMaxTokens: 1000000
          },
          {
            modelId: 'MODEL_PLACEHOLDER_M437',
            label: 'Gemini 4 Carbon (Medium)',
            baseLabel: 'Gemini 4 Carbon',
            aliases: ['MODEL_PLACEHOLDER_M437', 'Gemini 4 Carbon (Medium)', 'Orchestrator (Carbon)'],
            isFirstPartyGemini: true,
            isClaudeLike: false,
            supportsThinking: false,
            maxContextTokens: 0,
            softCompactionTargetTokens: 256000,
            hardMaxTokens: 1000000
          },
          {
            modelId: 'MODEL_PLACEHOLDER_M667',
            label: 'Orchestrator (Carbon)',
            baseLabel: 'Orchestrator (Carbon)',
            aliases: ['MODEL_PLACEHOLDER_M667', 'Orchestrator (Carbon)'],
            isFirstPartyGemini: true,
            isClaudeLike: false,
            supportsThinking: false,
            maxContextTokens: 256000,
            softCompactionTargetTokens: 256000,
            hardMaxTokens: 1000000
          }
        ]
      };
      snap.rows = Array.isArray(snap.rows) ? snap.rows : [];
      const ovRow = snap.rows.find((r) => r && r.id === 'sess-ctx-overrun');
      if (ovRow) ovRow.deviceId = 'pc-workstation-b';
      snap.rows.unshift(
        {
          id: 'sess-ctx-live777',
          title: 'Live GetUserStatus Catalog 512k',
          provider: 'antigravity',
          model: 'MODEL_PLACEHOLDER_M777',
          effort: 'high',
          folder: 'isabi-app',
          status: 'completed',
          usedTokens: 256000,
          limitTokens: 0,
          at: now - 5000
        },
        {
          id: 'sess-ctx-gpt128',
          title: 'GPT-OSS 120B 128k Guard',
          provider: 'antigravity',
          model: 'MODEL_OPENAI_GPT_OSS_120B_MEDIUM',
          effort: 'medium',
          folder: 'isabi-app',
          status: 'completed',
          usedTokens: 140000,
          limitTokens: 128000,
          at: now - 5500
        },
        {
          id: 'sess-ctx-claude1m-agy',
          title: 'Claude 1M Antigravity Parity',
          provider: 'antigravity',
          model: 'MODEL_PLACEHOLDER_M409',
          effort: 'high',
          folder: 'isabi-app',
          status: 'completed',
          usedTokens: 900000,
          limitTokens: 1000000,
          hardMaxTokens: 1000000,
          at: now - 6000
        },
        {
          id: 'sess-ctx-pro3',
          title: 'Gemini Pro3 512k Soft Overrun',
          provider: 'antigravity',
          model: 'Gemini Pro3',
          effort: 'high',
          folder: 'isabi-app',
          status: 'completed',
          usedTokens: 524600,
          limitTokens: 0,
          at: now - 6100
        },
        {
          id: 'sess-ctx-claude200',
          title: 'Claude Underscore 200K Guard',
          provider: 'antigravity',
          model: 'MODEL_CLAUDE_3_5_SONNET_200K',
          effort: 'high',
          folder: 'isabi-app',
          status: 'completed',
          usedTokens: 100000,
          limitTokens: 0,
          at: now - 6200
        },
        {
          id: 'sess-ctx-gpt4o128',
          title: 'GPT Underscore 128K Guard',
          provider: 'antigravity',
          model: 'MODEL_OPENAI_GPT_4O_128K',
          effort: 'medium',
          folder: 'isabi-app',
          status: 'completed',
          usedTokens: 64000,
          limitTokens: 0,
          at: now - 6300
        },
        {
          id: 'sess-ctx-gemini1m',
          title: 'Gemini Underscore 1M Explicit',
          provider: 'antigravity',
          model: 'MODEL_GEMINI_2_5_PRO_1M',
          effort: 'high',
          folder: 'isabi-app',
          status: 'completed',
          usedTokens: 900000,
          limitTokens: 0,
          at: now - 6400
        },
        {
          id: 'sess-ctx-legacy-m667',
          title: 'Legacy M667 256k Catalog & Row Upgrade',
          provider: 'antigravity',
          model: 'MODEL_PLACEHOLDER_M667',
          effort: 'high',
          folder: 'isabi-app',
          status: 'completed',
          usedTokens: 442266,
          limitTokens: 256000,
          at: now - 4500
        }
      );
      rawCache.snapshot = snap;
      rawCache.state = snap;
      rawCache.threads = rawCache.threads || {};
      if (rawCache.threads['sess-ctx-overrun']) {
        rawCache.threads['sess-ctx-overrun'].deviceId = 'pc-workstation-b';
      }
      rawCache.threads['sess-ctx-gpt128'] = {
        id: 'sess-ctx-gpt128',
        provider: 'antigravity',
        model: 'MODEL_OPENAI_GPT_OSS_120B_MEDIUM',
        effort: 'medium',
        contextWindow: {
          provider: 'antigravity',
          modelLabel: 'MODEL_OPENAI_GPT_OSS_120B_MEDIUM',
          usedTokens: 140000,
          limitTokens: 128000
        },
        messages: [{ id: 'ctx-mgpt', role: 'user', text: 'Verify 128k third-party hard wall.', createdAt: new Date(now - 5500).toISOString() }]
      };
      rawCache.threads['sess-ctx-claude1m-agy'] = {
        id: 'sess-ctx-claude1m-agy',
        provider: 'antigravity',
        model: 'MODEL_PLACEHOLDER_M409',
        effort: 'high',
        contextWindow: {
          provider: 'antigravity',
          modelLabel: 'MODEL_PLACEHOLDER_M409',
          usedTokens: 900000,
          limitTokens: 1000000,
          hardMaxTokens: 1000000
        },
        messages: [{ id: 'ctx-mc1m', role: 'user', text: 'Verify 1M Claude parity on Antigravity.', createdAt: new Date(now - 6000).toISOString() }]
      };
      rawCache.threads['sess-ctx-live777'] = {
        id: 'sess-ctx-live777',
        provider: 'antigravity',
        model: 'MODEL_PLACEHOLDER_M777',
        effort: 'high',
        contextWindow: {
          provider: 'antigravity',
          modelLabel: 'MODEL_PLACEHOLDER_M777',
          usedTokens: 256000,
          limitTokens: 0
        },
        messages: [{ id: 'ctx-m777', role: 'user', text: 'Verify live M777 512k catalog.', createdAt: new Date(now - 5000).toISOString() }]
      };
      rawCache.threads['sess-ctx-pro3'] = {
        id: 'sess-ctx-pro3',
        provider: 'antigravity',
        model: 'Gemini Pro3',
        effort: 'high',
        contextWindow: {
          provider: 'antigravity',
          modelLabel: 'Gemini Pro3',
          usedTokens: 524600,
          limitTokens: 0
        },
        messages: [{ id: 'ctx-mpro3', role: 'user', text: 'Verify Gemini Pro3 512k soft overrun.', createdAt: new Date(now - 6100).toISOString() }]
      };
      rawCache.threads['sess-ctx-claude200'] = {
        id: 'sess-ctx-claude200',
        provider: 'antigravity',
        model: 'MODEL_CLAUDE_3_5_SONNET_200K',
        effort: 'high',
        contextWindow: {
          provider: 'antigravity',
          modelLabel: 'MODEL_CLAUDE_3_5_SONNET_200K',
          usedTokens: 100000,
          limitTokens: 0
        },
        messages: [{ id: 'ctx-mc200', role: 'user', text: 'Verify underscore 200k Claude.', createdAt: new Date(now - 6200).toISOString() }]
      };
      rawCache.threads['sess-ctx-gpt4o128'] = {
        id: 'sess-ctx-gpt4o128',
        provider: 'antigravity',
        model: 'MODEL_OPENAI_GPT_4O_128K',
        effort: 'medium',
        contextWindow: {
          provider: 'antigravity',
          modelLabel: 'MODEL_OPENAI_GPT_4O_128K',
          usedTokens: 64000,
          limitTokens: 0
        },
        messages: [{ id: 'ctx-mg4o', role: 'user', text: 'Verify underscore 128k GPT-4o.', createdAt: new Date(now - 6300).toISOString() }]
      };
      rawCache.threads['sess-ctx-gemini1m'] = {
        id: 'sess-ctx-gemini1m',
        provider: 'antigravity',
        model: 'MODEL_GEMINI_2_5_PRO_1M',
        effort: 'high',
        contextWindow: {
          provider: 'antigravity',
          modelLabel: 'MODEL_GEMINI_2_5_PRO_1M',
          usedTokens: 900000,
          limitTokens: 0
        },
        messages: [{ id: 'ctx-mg1m', role: 'user', text: 'Verify underscore 1M Gemini.', createdAt: new Date(now - 6400).toISOString() }]
      };
      rawCache.threads['sess-ctx-legacy-m667'] = {
        id: 'sess-ctx-legacy-m667',
        provider: 'antigravity',
        model: 'MODEL_PLACEHOLDER_M667',
        effort: 'high',
        contextWindow: {
          provider: 'antigravity',
          modelLabel: 'MODEL_PLACEHOLDER_M667',
          usedTokens: 442266,
          limitTokens: 256000
        },
        messages: [{ id: 'ctx-legm667', role: 'user', text: 'Verify legacy M667 256k -> 512k catalog and row upgrade.', createdAt: new Date(now - 4500).toISOString() }]
      };
      localStorage.setItem('theo_remote_cache_v3', JSON.stringify(rawCache));
      localStorage.removeItem('theo_remote_outbox_v1');
      const prefs = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');
      prefs.selectedThreadId = 'sess-ctx-live777';
      prefs.threadModelConfig = {};
      prefs.selectedThinkingEffort = {};
      prefs.pendingRowOverrides = {};
      prefs.edgeRelayUrl = '';
      prefs.edgeAccessKey = '';
      prefs.cloudUrl = '';
      prefs.cloudKey = '';
      localStorage.setItem('theo_remote_prefs_v1', JSON.stringify(prefs));
      return true;
    })()`);
    assert.strictEqual(v73SeedOk, true);
    await cdp.send('Page.navigate', { url: `${baseUrl}/?nosse=1` }, sessionId);
    await new Promise((r) => setTimeout(r, 650));

    // 1. Live GetUserStatus M777 -> 512k resolution, picker entry, and M402 Claude 840k non-downgrade guard
    const v73CatalogCheck = await evalJs(`(() => {
      document.getElementById('composer-model-btn')?.click();
      const pickerHtml = document.getElementById('model-picker-body')?.innerHTML || '';
      document.getElementById('composer-model-btn')?.click();
      return {
        modelPill: document.getElementById('composer-model-label')?.textContent?.trim() || '',
        ctxPill: document.getElementById('ctx-pill-label')?.textContent?.trim() || '',
        pickerHasLiveModel: pickerHtml.includes('Gemini 5 Nova'),
        titleCount: document.querySelectorAll('[title]').length,
        overflowX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
      };
    })()`);
    assert.strictEqual(v73CatalogCheck.modelPill, 'Gemini 5 Nova (High)');
    assert.strictEqual(v73CatalogCheck.ctxPill, '256k / 512k · 50%');
    assert.strictEqual(v73CatalogCheck.pickerHasLiveModel, true, 'Model picker must expose live-synced Gemini 5 Nova');
    assert.strictEqual(v73CatalogCheck.titleCount, 0);
    assert.strictEqual(v73CatalogCheck.overflowX, 0);

    // M402 non-Gemini Claude entry must NOT be downgraded to 256k by an untrusted/mismatched catalog entry
    const chatM402Guard = await probeChatContext('sess-ctx-claude840');
    assert.strictEqual(chatM402Guard.ctxPill, '412k / 840k · 49%');
    const chatLegacyM402Guard = await probeChatContext('sess-ctx-legacy840');
    assert.strictEqual(chatLegacyM402Guard.ctxPill, '412k / 840k · 49%');

    // Override from a Gemini 1M-hardMax session to Claude Opus 5.5 (840k) must NOT leak stale hardMaxTokens: 1M
    await evalJs(`(() => {
      const now = Date.now();
      const rawCache = JSON.parse(localStorage.getItem('theo_remote_cache_v3') || '{}');
      const snap = rawCache.snapshot || rawCache.state || {};
      snap.rows = Array.isArray(snap.rows) ? snap.rows : [];
      if (!snap.rows.some((r) => r && r.id === 'sess-ctx-gemini-1m-override')) {
        snap.rows.unshift({
          id: 'sess-ctx-gemini-1m-override',
          title: 'Gemini 1M Override Guard',
          provider: 'antigravity',
          model: 'MODEL_PLACEHOLDER_M667',
          effort: 'high',
          folder: 'isabi-app',
          status: 'completed',
          usedTokens: 900000,
          limitTokens: 256000,
          hardMaxTokens: 1000000,
          at: now - 4000
        });
      }
      rawCache.snapshot = snap;
      rawCache.state = snap;
      rawCache.threads = rawCache.threads || {};
      rawCache.threads['sess-ctx-gemini-1m-override'] = {
        id: 'sess-ctx-gemini-1m-override',
        provider: 'antigravity',
        model: 'MODEL_PLACEHOLDER_M667',
        effort: 'high',
        contextWindow: {
          provider: 'antigravity',
          modelLabel: 'MODEL_PLACEHOLDER_M667',
          usedTokens: 900000,
          limitTokens: 256000,
          hardMaxTokens: 1000000
        },
        messages: [{ id: 'ctx-m1m-ov', role: 'user', text: 'Verify override drops stale 1M hardMax.', createdAt: new Date(now - 4000).toISOString() }]
      };
      localStorage.setItem('theo_remote_cache_v3', JSON.stringify(rawCache));
      const prefs = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');
      prefs.threadModelConfig = prefs.threadModelConfig && typeof prefs.threadModelConfig === 'object' ? prefs.threadModelConfig : {};
      prefs.threadModelConfig['sess-ctx-gemini-1m-override'] = {
        customModel: 'Claude Opus 5.5',
        modelId: 'claude-opus-5-5',
        effort: 'high'
      };
      localStorage.setItem('theo_remote_prefs_v1', JSON.stringify(prefs));
      return true;
    })()`);
    const chatOverrideNo1MLeak = await probeChatContext('sess-ctx-gemini-1m-override');
    const overrideDomState = await evalJs(`(() => {
      const btn = document.getElementById('btn-ctx-window');
      const arc = document.getElementById('ctx-ring-overrun-circle');
      const banner = document.getElementById('ctx-overrun-banner');
      const state = {
        modelPill: document.getElementById('composer-model-label')?.textContent?.trim() || '',
        ctxPill: document.getElementById('ctx-pill-label')?.textContent?.trim() || '',
        isSoftOverrun: Boolean(btn?.classList?.contains('is-soft-overrun')),
        arcHidden: Boolean(arc?.hidden),
        bannerHidden: Boolean(banner?.hidden)
      };
      const prefs = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');
      prefs.threadModelConfig = {};
      localStorage.setItem('theo_remote_prefs_v1', JSON.stringify(prefs));
      return state;
    })()`);
    assert.strictEqual(chatOverrideNo1MLeak.modelPill, 'Claude Opus 5.5 (High)');
    assert.strictEqual(overrideDomState.modelPill, 'Claude Opus 5.5 (High)');
    assert.strictEqual(overrideDomState.ctxPill, '900k / 840k · 100%');
    assert.strictEqual(overrideDomState.isSoftOverrun, false, 'Claude 840k override must not inherit Gemini 1M hardMax as soft overrun');
    assert.strictEqual(overrideDomState.arcHidden, true, 'Claude 840k override must hide soft-overrun violet arc');
    assert.strictEqual(overrideDomState.bannerHidden, true, 'Claude 840k override must hide soft-overrun banner');

    // 2. Dual-tone +Nk soft-overrun progress ring on sess-ctx-overrun vs exact 256k non-overrun on sess-ctx-zero & Pinned Constraints DOM removed
    await probeChatContext('sess-ctx-overrun');
    const v73Overrun = await evalJs(`(() => {
      const btn = document.getElementById('btn-ctx-window');
      const arc = document.getElementById('ctx-ring-overrun-circle');
      const pill = document.getElementById('ctx-overrun-pill');
      const banner = document.getElementById('ctx-overrun-banner');
      return {
        isSoftOverrun: Boolean(btn?.classList?.contains('is-soft-overrun')),
        arcHidden: Boolean(arc?.hidden),
        arcStroke: arc ? getComputedStyle(arc).stroke : '',
        arcOffset: Number(arc?.getAttribute('stroke-dashoffset') || 56.5),
        overrunPillHidden: Boolean(pill?.hidden),
        overrunPillText: pill?.textContent?.trim() || '',
        ctxPill: document.getElementById('ctx-pill-label')?.textContent?.trim() || '',
        bannerHidden: Boolean(banner?.hidden),
        bannerText: banner?.textContent?.trim() || '',
        pinNodeCount: document.querySelectorAll('[id*="chat-pin"], [id*="pin-constraints"], [class*="chat-pin"], .composer-pin-btn').length,
        titleCount: document.querySelectorAll('[title]').length,
        overflowX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
      };
    })()`);
    assert.strictEqual(v73Overrun.isSoftOverrun, true);
    assert.strictEqual(v73Overrun.arcHidden, false);
    assert.strictEqual(v73Overrun.arcStroke, 'rgb(168, 85, 247)', 'Overrun ring must render violet #a855f7');
    assert.ok(v73Overrun.arcOffset < 56.5, `Expected non-empty overrun arc stroke, got offset ${v73Overrun.arcOffset}`);
    assert.strictEqual(v73Overrun.overrunPillHidden, false);
    assert.strictEqual(v73Overrun.overrunPillText, '+12.6k');
    assert.strictEqual(v73Overrun.ctxPill, '525k / 512k · 100%');
    assert.strictEqual(v73Overrun.bannerHidden, false);
    assert.ok(v73Overrun.bannerText.includes('Soft compaction target 512k') && v73Overrun.bannerText.includes('Hard context ceiling 1M'), `Unexpected overrun banner: ${v73Overrun.bannerText}`);
    assert.strictEqual(v73Overrun.pinNodeCount, 0, 'Pinned constraints strip and composer pin button must not exist at >=85% context (removed in v76)');
    assert.strictEqual(v73Overrun.titleCount, 0);
    assert.strictEqual(v73Overrun.overflowX, 0);

    // Non-overrun exact 512k boundary must hide dual-tone overrun arc/pill/banner
    await probeChatContext('sess-ctx-zero');
    const v73ZeroCheck = await evalJs(`(() => ({
      isSoftOverrun: Boolean(document.getElementById('btn-ctx-window')?.classList?.contains('is-soft-overrun')),
      arcHidden: Boolean(document.getElementById('ctx-ring-overrun-circle')?.hidden),
      overrunPillHidden: Boolean(document.getElementById('ctx-overrun-pill')?.hidden),
      bannerHidden: Boolean(document.getElementById('ctx-overrun-banner')?.hidden)
    }))()`);
    assert.strictEqual(v73ZeroCheck.isSoftOverrun, false);
    assert.strictEqual(v73ZeroCheck.arcHidden, true);
    assert.strictEqual(v73ZeroCheck.overrunPillHidden, true);
    assert.strictEqual(v73ZeroCheck.bannerHidden, true);

    // Non-Gemini third-party 128k (GPT-OSS 120B) & 1M Claude-on-Antigravity parity guards
    await probeChatContext('sess-ctx-gpt128');
    const v73Gpt128 = await evalJs(`(() => ({
      ctxPill: document.getElementById('ctx-pill-label')?.textContent?.trim() || '',
      isSoftOverrun: Boolean(document.getElementById('btn-ctx-window')?.classList?.contains('is-soft-overrun')),
      arcHidden: Boolean(document.getElementById('ctx-ring-overrun-circle')?.hidden)
    }))()`);
    assert.strictEqual(v73Gpt128.ctxPill, '140k / 128k · 100%');
    assert.strictEqual(v73Gpt128.isSoftOverrun, false, 'Third-party 128k model must never trigger Gemini soft-overrun headroom');
    assert.strictEqual(v73Gpt128.arcHidden, true);

    await probeChatContext('sess-ctx-claude1m-agy');
    const v73Claude1M = await evalJs(`(() => ({
      ctxPill: document.getElementById('ctx-pill-label')?.textContent?.trim() || '',
      isSoftOverrun: Boolean(document.getElementById('btn-ctx-window')?.classList?.contains('is-soft-overrun')),
      arcHidden: Boolean(document.getElementById('ctx-ring-overrun-circle')?.hidden)
    }))()`);
    assert.strictEqual(v73Claude1M.ctxPill, '900k / 1M · 90%');
    assert.strictEqual(v73Claude1M.isSoftOverrun, false, 'Explicit 1M Claude config on Antigravity must agree with backend 1M soft target');
    assert.strictEqual(v73Claude1M.arcHidden, true);

    // Axis 7 negative boundary assertions in live PWA DOM: Pro3 o3 guard, _200K, _128K, and _1M underscore boundaries
    await probeChatContext('sess-ctx-pro3');
    const v74Pro3 = await evalJs(`(() => ({
      ctxPill: document.getElementById('ctx-pill-label')?.textContent?.trim() || '',
      isSoftOverrun: Boolean(document.getElementById('btn-ctx-window')?.classList?.contains('is-soft-overrun')),
      arcHidden: Boolean(document.getElementById('ctx-ring-overrun-circle')?.hidden)
    }))()`);
    assert.strictEqual(v74Pro3.ctxPill, '525k / 512k · 100%');
    assert.strictEqual(v74Pro3.isSoftOverrun, true, 'Gemini Pro3 must keep 512k soft compaction target');
    assert.strictEqual(v74Pro3.arcHidden, false);

    await probeChatContext('sess-ctx-claude200');
    const v74C200 = await evalJs(`(() => ({
      ctxPill: document.getElementById('ctx-pill-label')?.textContent?.trim() || '',
      isSoftOverrun: Boolean(document.getElementById('btn-ctx-window')?.classList?.contains('is-soft-overrun'))
    }))()`);
    assert.strictEqual(v74C200.ctxPill, '100k / 200k · 50%');
    assert.strictEqual(v74C200.isSoftOverrun, false);

    await probeChatContext('sess-ctx-gpt4o128');
    const v74G128 = await evalJs(`(() => ({
      ctxPill: document.getElementById('ctx-pill-label')?.textContent?.trim() || '',
      isSoftOverrun: Boolean(document.getElementById('btn-ctx-window')?.classList?.contains('is-soft-overrun'))
    }))()`);
    assert.strictEqual(v74G128.ctxPill, '64k / 128k · 50%');
    assert.strictEqual(v74G128.isSoftOverrun, false);

    await probeChatContext('sess-ctx-gemini1m');
    const v74Gem1M = await evalJs(`(() => ({
      ctxPill: document.getElementById('ctx-pill-label')?.textContent?.trim() || '',
      isSoftOverrun: Boolean(document.getElementById('btn-ctx-window')?.classList?.contains('is-soft-overrun'))
    }))()`);
    assert.strictEqual(v74Gem1M.ctxPill, '900k / 1M · 90%');
    assert.strictEqual(v74Gem1M.isSoftOverrun, false);

    // Legacy M667 row + catalog 256k must auto-upgrade to 512k in both chat header and sessions list cards while keeping 128k / 840k cards intact
    const chatLegacyM667 = await probeChatContext('sess-ctx-legacy-m667');
    assert.strictEqual(chatLegacyM667.modelPill, 'Orchestrator (Carbon)');
    assert.strictEqual(chatLegacyM667.ctxPill, '442k / 512k · 86%');
    await evalJs(`(() => {
      const prefs = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');
      prefs.activeTab = 'sessions';
      localStorage.setItem('theo_remote_prefs_v1', JSON.stringify(prefs));
      return true;
    })()`);
    await cdp.send('Page.navigate', { url: `${baseUrl}/?nosse=1` }, sessionId);
    await new Promise((r) => setTimeout(r, 600));
    const legacyCardProbe = await evalJs(`(() => {
      const readCard = (id) => {
        const el = document.querySelector('#view-sessions .session-card[data-session-id="' + id + '"]');
        return el ? el.textContent.replace(/\\s+/g, ' ').trim() : '';
      };
      return {
        legacyM667: readCard('sess-ctx-legacy-m667'),
        gpt128: readCard('sess-ctx-gpt128'),
        claude840: readCard('sess-ctx-claude840'),
        titleCount: document.querySelectorAll('[title]').length,
        overflowX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
      };
    })()`);
    assert.ok(
      legacyCardProbe.legacyM667.includes('Orchestrator (Carbon)') && legacyCardProbe.legacyM667.includes('442k / 512k · 86%'),
      `Session card for legacy 256k M667 must auto-upgrade to 442k / 512k · 86%, got: ${legacyCardProbe.legacyM667}`
    );
    assert.ok(legacyCardProbe.gpt128.includes('140k / 128k · 100%'), `GPT-OSS 120B card must stay 140k / 128k · 100%, got: ${legacyCardProbe.gpt128}`);
    assert.ok(legacyCardProbe.claude840.includes('412k / 840k · 49%'), `Claude Opus 5.5 card must stay 412k / 840k · 49%, got: ${legacyCardProbe.claude840}`);
    assert.strictEqual(legacyCardProbe.titleCount, 0);
    assert.strictEqual(legacyCardProbe.overflowX, 0);

    // 3. Pinned Constraints removed (v76). A cache written by v74 / v75 still carries pinnedConstraint on rows and
    // threads and a queued setPinnedConstraint in the outbox: none of it may render, throw or be re-sent as a pin.
    await evalJs(`(() => {
      const rawCache = JSON.parse(localStorage.getItem('theo_remote_cache_v3') || '{}');
      const staleText = 'Stale v75 pin <img src=x onerror=alert(1)>';
      for (const key of ['snapshot', 'state']) {
        const rows = Array.isArray(rawCache?.[key]?.rows) ? rawCache[key].rows : [];
        for (const r of rows) {
          if (r && (r.id === 'sess-ctx-live777' || r.id === 'sess-ctx-overrun')) {
            r.pinnedConstraint = staleText;
            r.pinnedConstraintUpdatedAt = Date.now();
          }
        }
      }
      for (const tid of ['sess-ctx-live777', 'sess-ctx-overrun']) {
        if (rawCache.threads?.[tid]) {
          rawCache.threads[tid].pinnedConstraint = staleText;
          rawCache.threads[tid].pinnedConstraintUpdatedAt = Date.now();
        }
      }
      localStorage.setItem('theo_remote_cache_v3', JSON.stringify(rawCache));
      // A pin queued offline under v75, next to an ordinary queued command that must survive the boot clean-up.
      let staleOutbox = [];
      try { staleOutbox = JSON.parse(localStorage.getItem('theo_remote_outbox_v1') || '[]'); } catch {}
      if (!Array.isArray(staleOutbox)) staleOutbox = [];
      staleOutbox.push(
        { id: 'cmd-stale-pin', type: 'setPinnedConstraint', sessionId: 'sess-ctx-overrun', text: 'x', updatedAt: Date.now(), createdAt: Date.now() },
        { id: 'cmd-keep-rename', type: 'renameSession', sessionId: 'sess-ctx-overrun', title: 'Kept', createdAt: Date.now() }
      );
      localStorage.setItem('theo_remote_outbox_v1', JSON.stringify(staleOutbox));
      window.__theoLastQuarantinedCmd = null;
      return true;
    })()`);
    // Boot only (no sync yet): the stale pin is dropped from storage at load, the ordinary command is kept.
    const { identifier: v76BootProbeId } = await cdp.send(
      'Page.addScriptToEvaluateOnNewDocument',
      { source: `try { window.__theoOutboxAtBoot = localStorage.getItem('theo_remote_outbox_v1'); } catch {}` },
      sessionId
    );
    await probeChatContext('sess-ctx-overrun');
    await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: v76BootProbeId }, sessionId);
    const v76OutboxClean = await evalJs(`(() => {
      const before = JSON.parse(window.__theoOutboxAtBoot || '[]');
      const after = JSON.parse(localStorage.getItem('theo_remote_outbox_v1') || '[]');
      const state = {
        seededPin: before.filter((c) => c && c.type === 'setPinnedConstraint').length,
        pinAfter: after.filter((c) => c && c.type === 'setPinnedConstraint').length,
        keptAfter: after.filter((c) => c && c.id === 'cmd-keep-rename').length,
        lastCmdType: window.__theoLastQuarantinedCmd?.type || ''
      };
      localStorage.setItem('theo_remote_outbox_v1', JSON.stringify(after.filter((c) => c && c.id !== 'cmd-keep-rename')));
      return state;
    })()`);
    assert.strictEqual(v76OutboxClean.seededPin, 1, 'The stale pin command must have been in storage when v76 booted');
    // pinAfter is the check that catches a broken clean-up: this harness never flushes the outbox during #21
    // (no local bridge, no mock WebSocket), so the two "dispatched / sent" checks below only guard a future change.
    assert.strictEqual(v76OutboxClean.pinAfter, 0, 'A setPinnedConstraint queued under v75 must be dropped from the outbox at boot');
    assert.notStrictEqual(v76OutboxClean.lastCmdType, 'setPinnedConstraint', 'The stale pin command must never be dispatched');
    assert.ok(
      v76OutboxClean.keptAfter === 1 || v76OutboxClean.lastCmdType === 'renameSession',
      `An ordinary queued command must survive the boot clean-up (still queued, or sent): ${JSON.stringify(v76OutboxClean)}`
    );
    const v76PinGoneOverrun = await evalJs(`({
      pinNodeCount: document.querySelectorAll('[id*="chat-pin"], [id*="pin-constraints"], [class*="chat-pin"], .composer-pin-btn').length,
      staleShown: document.body.innerHTML.includes('Stale v75 pin'),
      composerPresent: Boolean(document.getElementById('composer-input')),
      titleCount: document.querySelectorAll('[title]').length,
      overflowX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
    })`);
    assert.strictEqual(v76PinGoneOverrun.pinNodeCount, 0, 'No pin strip or pin button may exist on a >=85% session');
    assert.strictEqual(v76PinGoneOverrun.staleShown, false, 'A stale cached pinnedConstraint must never render');
    assert.strictEqual(v76PinGoneOverrun.composerPresent, true);
    assert.strictEqual(v76PinGoneOverrun.titleCount, 0);
    assert.strictEqual(v76PinGoneOverrun.overflowX, 0);

    await probeChatContext('sess-ctx-live777');
    const v76SlashPin = await evalJs(`(async () => {
      const composer = document.getElementById('composer-input');
      const sendBtn = document.getElementById('composer-send-btn');
      const pop = document.getElementById('composer-slash-popover');
      composer.focus();
      composer.value = '/pi';
      composer.setSelectionRange(3, 3);
      composer.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 40));
      const slashLabels = Array.from(pop.querySelectorAll('.slash-pop-lbl')).map((el) => el.textContent.trim());
      composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 20));
      composer.value = '/';
      composer.setSelectionRange(1, 1);
      composer.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 40));
      const allSlashLabels = Array.from(pop.querySelectorAll('.slash-pop-lbl')).map((el) => el.textContent.trim());
      composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 20));

      // "/pin <text>" is no longer intercepted: it goes to the session as an ordinary prompt, unchanged.
      window.__theoLastQuarantinedCmd = null;
      composer.value = '/pin Zero Microsoft deps';
      composer.dispatchEvent(new Event('input', { bubbles: true }));
      sendBtn.click();
      await new Promise((r) => setTimeout(r, 80));
      const sent = window.__theoLastQuarantinedCmd || null;
      const outbox = JSON.parse(localStorage.getItem('theo_remote_outbox_v1') || '[]');
      return {
        slashLabels,
        allSlashLabels,
        sentType: sent?.type || '',
        sentPrompt: String(sent?.prompt || ''),
        sentId: String(sent?.id || sent?.threadId || ''),
        outboxPinCmds: (Array.isArray(outbox) ? outbox : []).filter((c) => c && c.type === 'setPinnedConstraint').length,
        pinNodeCount: document.querySelectorAll('[id*="chat-pin"], [id*="pin-constraints"], [class*="chat-pin"], .composer-pin-btn').length,
        staleShown: document.body.innerHTML.includes('Stale v75 pin'),
        composerValue: composer.value
      };
    })()`);
    assert.ok(!v76SlashPin.slashLabels.includes('/pin'), `/pin must be gone from the slash menu, got: ${v76SlashPin.slashLabels.join(', ')}`);
    assert.ok(v76SlashPin.allSlashLabels.includes('/compact'), `Slash menu must still list /compact, got: ${v76SlashPin.allSlashLabels.join(', ')}`);
    assert.ok(!v76SlashPin.allSlashLabels.includes('/pin'), '/pin must be gone from the full slash menu');
    assert.strictEqual(v76SlashPin.sentType, 'send', 'A "/pin ..." message must be sent as an ordinary prompt');
    assert.strictEqual(v76SlashPin.sentPrompt, '/pin Zero Microsoft deps', 'The prompt must be forwarded unchanged');
    assert.strictEqual(v76SlashPin.outboxPinCmds, 0, 'No setPinnedConstraint command may be queued');
    assert.strictEqual(v76SlashPin.pinNodeCount, 0);
    assert.strictEqual(v76SlashPin.staleShown, false);
    assert.strictEqual(v76SlashPin.composerValue, '', 'Composer must clear after the send');

    // Static: the shipped app, shell and stylesheet carry no pin-constraint code at all.
    {
      const fsPin = require('fs');
      const pathPin = require('path');
      const rootPin = pathPin.join(__dirname, '..');
      const pinRe = /pinnedConstraint|setPinnedConstraint|chat-pin|pin-constraints|PinStrip|composer-pin-btn|act === 'pin'/;
      for (const rel of ['js/app.js', 'index.html', 'css/theo.css', 'sw.js']) {
        // The one allowed mention: the boot clean-up that names the retired command type in order to drop it.
        const src = fsPin
          .readFileSync(pathPin.join(rootPin, rel), 'utf8')
          .split('\n')
          .filter((ln) => !ln.includes('LEGACY_DROPPED_CMD_TYPES = new Set('))
          .join('\n');
        const hit = src.match(pinRe);
        assert.strictEqual(hit, null, `${rel} still carries pin-constraint code: ${hit ? hit[0] : ''}`);
      }
    }

    // The PIN lock (unrelated to pin constraints, but its lock path called the removed helper) still engages cleanly.
    // (An exception on the lock path also fails the run through the suite-wide pageExceptions count.)
    await evalJs(`(() => { localStorage.setItem('theo_remote_pin_v1', '4321'); return true; })()`);
    await cdp.send('Page.navigate', { url: `${baseUrl}/?nosse=1` }, sessionId);
    await new Promise((r) => setTimeout(r, 600));
    const v76PinLockAfter = await evalJs(`(() => {
      const overlay = document.getElementById('pin-overlay');
      const state = {
        overlayShown: Boolean(overlay && !overlay.hidden),
        shellInert: Boolean(document.querySelector('.app-shell')?.inert),
        bootClassCleared: !document.documentElement.classList.contains('pin-locked-boot')
      };
      localStorage.removeItem('theo_remote_pin_v1');
      localStorage.removeItem('theo_remote_pin_hash_v1');
      return state;
    })()`);
    assert.strictEqual(v76PinLockAfter.overlayShown, true, 'PIN lock overlay must show after reload with a PIN set (lock path must not throw)');
    assert.strictEqual(v76PinLockAfter.shellInert, true, 'App shell must be inert while PIN-locked');
    assert.strictEqual(v76PinLockAfter.bootClassCleared, true, 'pin-locked-boot must clear once the overlay is up (the lock function ran to the end)');
    await evalJs(`(() => {
      const prefs = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');
      prefs.selectedThreadId = 'sess-ctx-live777';
      localStorage.setItem('theo_remote_prefs_v1', JSON.stringify(prefs));
      return true;
    })()`);
    await cdp.send('Page.navigate', { url: `${baseUrl}/?nosse=1` }, sessionId);
    await new Promise((r) => setTimeout(r, 600));
    const v76Unlocked = await evalJs(`({
      overlayHidden: Boolean(document.getElementById('pin-overlay')?.hidden),
      shellInert: Boolean(document.querySelector('.app-shell')?.inert)
    })`);
    assert.strictEqual(v76Unlocked.overlayHidden, true, 'PIN overlay must be gone once the test PIN is removed');
    assert.strictEqual(v76Unlocked.shellInert, false);
    console.log('[PASS] Adversarial #21: v74 Live GetUserStatus model-capacity sync, dual-tone +Nk soft-overrun ring, legacy 840k & override guards, & v76 Pinned Constraints removal (no strip, no button, no /pin, stale cached pins inert, PIN lock intact) verified');

    // -------------------------------------------------------------------------
    // Adversarial #22: v75 Cross-device prewarm_hint emission, deduplication & guards
    // -------------------------------------------------------------------------
    {
      const nodeCrypto22 = require('crypto');
      const hintSockets = new Set();
      const recvHints = [];

      const encodeHintWsFrame = (obj) => {
        const payload = Buffer.from(JSON.stringify(obj), 'utf8');
        const len = payload.length;
        let header;
        if (len < 126) {
          header = Buffer.from([0x81, len]);
        } else if (len < 65536) {
          header = Buffer.allocUnsafe(4);
          header[0] = 0x81;
          header[1] = 126;
          header.writeUInt16BE(len, 2);
        } else {
          header = Buffer.allocUnsafe(10);
          header[0] = 0x81;
          header[1] = 127;
          header.writeBigUInt64BE(BigInt(len), 2);
        }
        return Buffer.concat([header, payload]);
      };
      const sendHintWsJson = (sock, obj) => {
        if (!sock || sock.destroyed || !sock.writable) return false;
        sock.write(encodeHintWsFrame(obj));
        return true;
      };

      const hintWsServer = http.createServer((_req, res) => {
        res.writeHead(404);
        res.end();
      });
      hintWsServer.on('upgrade', (req, socket) => {
        const key = req.headers['sec-websocket-key'];
        if (!key) {
          socket.destroy();
          return;
        }
        const accept = nodeCrypto22
          .createHash('sha1')
          .update(String(key).trim() + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
          .digest('base64');
        socket.write(
          [
            'HTTP/1.1 101 Switching Protocols',
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Accept: ${accept}`,
            '',
            ''
          ].join('\r\n')
        );
        hintSockets.add(socket);
        const isEdge = String(req.url || '/').startsWith('/edge/ws');
        let buf = Buffer.alloc(0);
        socket.on('data', (chunk) => {
          buf = Buffer.concat([buf, chunk]);
          while (buf.length >= 2) {
            const opcode = buf[0] & 0x0f;
            const masked = (buf[1] & 0x80) !== 0;
            let len = buf[1] & 0x7f;
            let offset = 2;
            if (len === 126) {
              if (buf.length < 4) return;
              len = buf.readUInt16BE(2);
              offset = 4;
            } else if (len === 127) {
              if (buf.length < 10) return;
              len = Number(buf.readBigUInt64BE(2));
              offset = 10;
            }
            const totalNeeded = offset + (masked ? 4 : 0) + len;
            if (buf.length < totalNeeded) return;
            const maskKey = masked ? buf.subarray(offset, offset + 4) : null;
            const payloadStart = offset + (masked ? 4 : 0);
            const rawPayload = Buffer.from(buf.subarray(payloadStart, payloadStart + len));
            buf = buf.subarray(totalNeeded);
            if (masked && maskKey) {
              for (let i = 0; i < rawPayload.length; i += 1) rawPayload[i] ^= maskKey[i % 4];
            }
            if (opcode === 0x8) {
              try { socket.end(); } catch {}
              return;
            }
            if (opcode === 0x9) {
              if (!socket.destroyed && socket.writable) {
                socket.write(Buffer.concat([Buffer.from([0x8a, Math.min(125, rawPayload.length)]), rawPayload.subarray(0, 125)]));
              }
              continue;
            }
            if (opcode !== 0x1) continue;
            let m;
            try { m = JSON.parse(rawPayload.toString('utf8')); } catch { continue; }
            if (!m || typeof m !== 'object') continue;
            if (m.type === 'auth' || m.type === 'auth_client') {
              sendHintWsJson(socket, {
                type: 'auth_ok',
                role: 'client',
                device: { id: 'hint-dev-local', name: 'Local PC', role: 'host' },
                devices: [
                  { id: 'hint-dev-local', name: 'Local PC', online: true, local: !isEdge },
                  { id: 'hint-dev-peer', name: 'Peer PC', online: true }
                ],
                ...(!isEdge
                  ? {
                      state: {
                        generatedAt: Date.now(),
                        device: { id: 'hint-dev-local', name: 'Local PC' },
                        rows: [
                          {
                            id: 'hint-local-1',
                            key: 'antigravity:hint-local-1',
                            deviceId: 'hint-dev-local',
                            provider: 'antigravity',
                            title: 'Local Session',
                            status: 'completed',
                            at: Date.now() - 1000
                          }
                        ],
                        groups: []
                      }
                    }
                  : {})
              });
              if (isEdge) {
                sendHintWsJson(socket, {
                  type: 'host_state',
                  deviceId: 'hint-dev-peer',
                  deviceName: 'Peer PC',
                  seq: 1,
                  snapshot: {
                    generatedAt: Date.now(),
                    device: { id: 'hint-dev-peer', name: 'Peer PC' },
                    rows: [
                      {
                        id: 'hint-peer-2',
                        key: 'claude:hint-peer-2',
                        deviceId: 'hint-dev-peer',
                        provider: 'claude',
                        title: 'Peer Session',
                        status: 'completed',
                        at: Date.now() - 2000
                      }
                    ],
                    groups: []
                  }
                });
              }
            } else if (m.type === 'ping') {
              sendHintWsJson(socket, { type: 'pong', echoTs: m.ts });
            } else if (m.type === 'prewarm_hint') {
              recvHints.push({ transport: isEdge ? 'edge' : 'local', ...m });
            }
          }
        });
        socket.on('close', () => hintSockets.delete(socket));
        socket.on('error', () => hintSockets.delete(socket));
      });

      const waitHintCond = async (fn, label, timeoutMs = 5000) => {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          const val = await fn();
          if (val) return val;
          await new Promise((r) => setTimeout(r, 40));
        }
        throw new Error(`Adversarial #22 timed out waiting for: ${label}`);
      };

      await new Promise((resolve, reject) => {
        hintWsServer.listen(0, '127.0.0.1', resolve);
        hintWsServer.on('error', reject);
      });
      const hintPort = hintWsServer.address().port;

      try {
        await evalJs(`(() => {
          window.__THEO_ALLOW_MOCK_WS = true;
          window.__THEO_MOCK_BRIDGE_TOKEN = 'test-token-hex';
          window.__theoTestWs.resetPrewarmHintCooldowns();
          window.__theoTestWs.connectLocalWs('http://127.0.0.1:${hintPort}', { wsPath: '/ws' });
          window.__theoTestWs.connectEdgeWs('ws://127.0.0.1:${hintPort}/edge/ws');
          return true;
        })()`);
        await waitHintCond(
          () => evalJs(`(() => {
            const rows = window.__theoTestWs.getState()?.rows || [];
            return rows.some((r) => r.id === 'hint-local-1') && rows.some((r) => r.id === 'hint-peer-2');
          })()`),
          'Adversarial #22 dual WS auth_ok'
        );

        const hintCheck = await evalJs(`(() => {
          const before = window.__theoWsDeltaStats?.prewarmHintsSent || 0;
          const rNew = window.__theoTestWs.emitPrewarmHint('__new__');
          const rDraft = window.__theoTestWs.emitPrewarmHint('draft-new-99');
          const rLocal1 = window.__theoTestWs.emitPrewarmHint('hint-local-1', { source: 'tap' });
          const rLocalDup = window.__theoTestWs.emitPrewarmHint('hint-local-1', { source: 'tap' });
          const rPeer = window.__theoTestWs.emitPrewarmHint('hint-peer-2', { source: 'inspector' });
          return {
            rNew, rDraft, rLocal1, rLocalDup, rPeer,
            deltaSent: (window.__theoWsDeltaStats?.prewarmHintsSent || 0) - before
          };
        })()`);
        assert.strictEqual(hintCheck.rNew, false, '__new__ must never emit prewarm_hint');
        assert.strictEqual(hintCheck.rDraft, false, 'draft-new-* must never emit prewarm_hint');
        assert.strictEqual(hintCheck.rLocal1, 'local', 'Local row routes prewarm_hint via local WS');
        assert.strictEqual(hintCheck.rLocalDup, false, '12s cooldown must suppress immediate duplicate prewarm_hint');
        assert.strictEqual(hintCheck.rPeer, 'edge', 'Peer device row routes prewarm_hint via Edge WS');
        assert.strictEqual(hintCheck.deltaSent, 2);

        await waitHintCond(() => recvHints.length >= 2, 'Server receives both prewarm_hint frames');
        assert.strictEqual(recvHints[0].transport, 'local');
        assert.strictEqual(recvHints[0].threadId, 'hint-local-1');
        assert.strictEqual(recvHints[0].provider, 'antigravity');
        assert.strictEqual(recvHints[1].transport, 'edge');
        assert.strictEqual(recvHints[1].threadId, 'hint-peer-2');
        assert.strictEqual(recvHints[1].targetDeviceId, 'hint-dev-peer');
        assert.strictEqual(recvHints[1].source, 'inspector');

        // Clicking a rendered session card emits prewarm_hint via setPinnedNav
        const clickedCard = await evalJs(`(() => {
          window.__theoTestWs.resetPrewarmHintCooldowns();
          document.querySelector('[data-tab="sessions"]')?.click();
          const card = document.querySelector('.session-card[data-session-id="hint-local-1"]');
          if (card) card.click();
          return Boolean(card);
        })()`);
        assert.strictEqual(clickedCard, true, 'Expected rendered .session-card for hint-local-1');
        await waitHintCond(
          () => recvHints.filter((m) => m.threadId === 'hint-local-1').length >= 2,
          'Session card click emits prewarm_hint'
        );
        // Cold-boot queued hint: disconnect WS, focus session while offline, reconnect -> flushes on welcome/auth_ok
        await evalJs(`(() => {
          window.__theoTestWs.disconnectAll();
          return true;
        })()`);
        await new Promise((r) => setTimeout(r, 80));
        const queuedCardOk = await evalJs(`(() => {
          window.__THEO_ALLOW_MOCK_WS = true;
          window.__THEO_MOCK_BRIDGE_TOKEN = 'test-token-hex';
          window.__theoTestWs.resetPrewarmHintCooldowns();
          document.querySelector('[data-tab="sessions"]')?.click();
          const card = document.querySelector('.session-card[data-session-id="hint-local-1"]');
          if (card) card.click();
          window.__theoTestWs.connectLocalWs('http://127.0.0.1:${hintPort}', { wsPath: '/ws' });
          return Boolean(card);
        })()`);
        assert.strictEqual(queuedCardOk, true, 'Expected rendered .session-card for offline cold-boot check');
        await waitHintCond(
          () => recvHints.filter((m) => m.threadId === 'hint-local-1').length >= 3,
          'Pending cold-boot prewarm_hint flushes immediately upon WS welcome/auth_ok'
        );

        console.log('[PASS] Adversarial #22: v75 Cross-device prewarm_hint emission, cold-boot flush, cooldown dedup, & invalid-id guards verified');
      } finally {
        try { await evalJs('window.__theoTestWs?.disconnectAll?.()'); } catch {}
        for (const s of hintSockets) { try { s.destroy(); } catch {} }
        await new Promise((r) => hintWsServer.close(r));
      }
    }

    // -------------------------------------------------------------------------
    // Adversarial #23: v76 Cross-Device Chat Pinning UI, Sorting, Archive & LWW Sync
    // -------------------------------------------------------------------------
    {
      const nodeCrypto23 = require('crypto');
      const pinSockets = new Set();
      let pinZeroGroupsMode = false;
      const now23 = Date.now();
      const basePinRows = [
        {
          id: 'pin-grp-old-pinned',
          key: 'antigravity:pin-grp-old-pinned',
          deviceId: 'pin-dev-local',
          provider: 'antigravity',
          title: 'Group Old Pinned',
          status: 'completed',
          group: 'grp-alpha',
          open: false,
          pinned: true,
          pinnedAt: now23 - 5000,
          pinUpdatedAt: now23 - 5000,
          at: now23 - 90000
        },
        {
          id: 'pin-grp-new-unpinned',
          key: 'claude:pin-grp-new-unpinned',
          deviceId: 'pin-dev-local',
          provider: 'claude',
          title: 'Group New Unpinned',
          status: 'completed',
          group: 'grp-alpha',
          open: false,
          pinned: false,
          pinnedAt: 0,
          pinUpdatedAt: 0,
          at: now23 - 1000
        },
        {
          id: 'pin-ug-pinned-closed',
          key: 'antigravity:pin-ug-pinned-closed',
          deviceId: 'pin-dev-local',
          provider: 'antigravity',
          title: 'Ungrouped Pinned Closed',
          status: 'completed',
          unread: false,
          open: false,
          pinned: true,
          pinnedAt: now23 - 4000,
          pinUpdatedAt: now23 - 4000,
          at: now23 - 80000
        },
        {
          id: 'pin-ug-new-unpinned',
          key: 'claude:pin-ug-new-unpinned',
          deviceId: 'pin-dev-local',
          provider: 'claude',
          title: 'Ungrouped New Unpinned',
          status: 'completed',
          unread: false,
          open: false,
          pinned: false,
          pinnedAt: 0,
          pinUpdatedAt: 0,
          at: now23 - 500
        }
      ];

      const encodePinWsFrame = (obj) => {
        const payload = Buffer.from(JSON.stringify(obj), 'utf8');
        const len = payload.length;
        let header;
        if (len < 126) header = Buffer.from([0x81, len]);
        else if (len < 65536) {
          header = Buffer.allocUnsafe(4);
          header[0] = 0x81;
          header[1] = 126;
          header.writeUInt16BE(len, 2);
        } else {
          header = Buffer.allocUnsafe(10);
          header[0] = 0x81;
          header[1] = 127;
          header.writeBigUInt64BE(BigInt(len), 2);
        }
        return Buffer.concat([header, payload]);
      };
      const sendPinWsJson = (sock, obj) => {
        if (!sock || sock.destroyed || !sock.writable) return false;
        sock.write(encodePinWsFrame(obj));
        return true;
      };

      const pinWsServer = http.createServer((_req, res) => {
        res.writeHead(404);
        res.end();
      });
      pinWsServer.on('upgrade', (req, socket) => {
        const key = req.headers['sec-websocket-key'];
        if (!key) {
          socket.destroy();
          return;
        }
        const accept = nodeCrypto23
          .createHash('sha1')
          .update(String(key).trim() + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
          .digest('base64');
        socket.write(
          ['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${accept}`, '', ''].join('\r\n')
        );
        pinSockets.add(socket);
        let buf = Buffer.alloc(0);
        socket.on('data', (chunk) => {
          buf = Buffer.concat([buf, chunk]);
          while (buf.length >= 2) {
            const opcode = buf[0] & 0x0f;
            const masked = (buf[1] & 0x80) !== 0;
            let len = buf[1] & 0x7f;
            let offset = 2;
            if (len === 126) {
              if (buf.length < 4) return;
              len = buf.readUInt16BE(2);
              offset = 4;
            } else if (len === 127) {
              if (buf.length < 10) return;
              len = Number(buf.readBigUInt64BE(2));
              offset = 10;
            }
            const totalNeeded = offset + (masked ? 4 : 0) + len;
            if (buf.length < totalNeeded) return;
            const maskKey = masked ? buf.subarray(offset, offset + 4) : null;
            const rawPayload = Buffer.from(buf.subarray(offset + (masked ? 4 : 0), totalNeeded));
            buf = buf.subarray(totalNeeded);
            if (masked && maskKey) for (let i = 0; i < rawPayload.length; i += 1) rawPayload[i] ^= maskKey[i % 4];
            if (opcode === 0x8) { try { socket.end(); } catch {} return; }
            if (opcode === 0x9) {
              if (!socket.destroyed && socket.writable) {
                socket.write(Buffer.concat([Buffer.from([0x8a, Math.min(125, rawPayload.length)]), rawPayload.subarray(0, 125)]));
              }
              continue;
            }
            if (opcode !== 0x1) continue;
            let m;
            try { m = JSON.parse(rawPayload.toString('utf8')); } catch { continue; }
            if (m && (m.type === 'auth' || m.type === 'auth_client')) {
              sendPinWsJson(socket, {
                type: 'auth_ok',
                role: 'client',
                supportsRowPatch: true,
                seq: 1,
                device: { id: 'pin-dev-local', name: 'Pin Local PC', role: 'host' },
                devices: [{ id: 'pin-dev-local', name: 'Pin Local PC', online: true, local: true }],
                state: pinZeroGroupsMode
                  ? {
                      generatedAt: now23 + 5000,
                      device: { id: 'pin-dev-local', name: 'Pin Local PC' },
                      groups: [],
                      rows: [
                        {
                          id: 'zg-pinned',
                          key: 'zg-pinned',
                          provider: 'antigravity',
                          title: 'Zero Group Pinned',
                          status: 'completed',
                          at: now23 - 200000,
                          pinned: true,
                          pinnedAt: now23 + 4000,
                          pinUpdatedAt: now23 + 4000,
                          archived: false,
                          group: null
                        },
                        {
                          id: 'zg-unpinned',
                          key: 'zg-unpinned',
                          provider: 'claude',
                          title: 'Zero Group Unpinned',
                          status: 'completed',
                          at: now23 - 1000,
                          pinned: false,
                          pinnedAt: 0,
                          pinUpdatedAt: 0,
                          archived: false,
                          group: null
                        }
                      ]
                    }
                  : {
                      generatedAt: now23,
                      device: { id: 'pin-dev-local', name: 'Pin Local PC' },
                      groups: [{ id: 'grp-alpha', name: 'Alpha', color: 'blue', collapsed: false }],
                      rows: basePinRows.map((r) => ({ ...r }))
                    }
              });
            } else if (m && m.type === 'ping') {
              sendPinWsJson(socket, { type: 'pong', echoTs: m.ts });
            }
          }
        });
        socket.on('close', () => pinSockets.delete(socket));
        socket.on('error', () => pinSockets.delete(socket));
      });

      const waitPinCond = async (fn, label, timeoutMs = 5000) => {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          const val = await fn();
          if (val) return val;
          await new Promise((r) => setTimeout(r, 40));
        }
        throw new Error(`Adversarial #23 timed out waiting for: ${label}`);
      };

      await new Promise((resolve, reject) => {
        pinWsServer.listen(0, '127.0.0.1', resolve);
        pinWsServer.on('error', reject);
      });
      const pinPort = pinWsServer.address().port;

      try {
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false }, sessionId);
        await evalJs(`(() => {
          localStorage.removeItem('theo_remote_prefs_v1');
          window.__THEO_ALLOW_MOCK_WS = true;
          window.__THEO_MOCK_BRIDGE_TOKEN = 'test-token-hex';
          window.__theoLastQuarantinedCmd = null;
          window.__theoTestWs.connectLocalWs('http://127.0.0.1:${pinPort}', { wsPath: '/ws' });
          document.querySelector('[data-tab="chat"]')?.click();
          return true;
        })()`);
        await waitPinCond(
          () => evalJs(`Boolean((window.__theoTestWs.getState()?.rows || []).some((r) => r.id === 'pin-grp-old-pinned'))`),
          'Adversarial #23 initial pin state loaded'
        );

        const appJsSrc23 = fs.readFileSync(path.join(REPO_ROOT, 'js', 'app.js'), 'utf8');
        assert.ok(!appJsSrc23.includes('M9.8 2.4l3.8 3.8'), 'Legacy crooked pin polygon must stay replaced in js/app.js');

        // 1. Desktop IDE sidebar: pinned-first sort inside group & Ungrouped, pin indicator, hover click & contextmenu close
        const ideDesktopCheck = await evalJs(`(() => {
          const treeIds = [...document.querySelectorAll('#ide-sidebar-tree .ide-tree-row[data-ide-open-session]')].map((el) => el.dataset.ideOpenSession);
          const grpPinnedEl = document.querySelector('#ide-sidebar-tree .ide-tree-row[data-ide-open-session="pin-grp-old-pinned"]');
          const ugUnpinnedRow = document.querySelector('#ide-sidebar-tree .ide-tree-row[data-ide-open-session="pin-ug-new-unpinned"]');
          const pinBtn = ugUnpinnedRow?.querySelector('.ide-row-act.pin-act');
          const hasPinInd = Boolean(grpPinnedEl?.classList.contains('is-pinned') && grpPinnedEl?.querySelector('.ide-pin-ind'));
          return { treeIds, hasPinInd, hasPinBtn: Boolean(pinBtn), titles: document.querySelectorAll('[title]').length };
        })()`);
        assert.strictEqual(ideDesktopCheck.hasPinInd, true, 'Pinned IDE row must carry .is-pinned and .ide-pin-ind');
        assert.strictEqual(ideDesktopCheck.hasPinBtn, true);
        assert.strictEqual(ideDesktopCheck.titles, 0);
        assert.ok(
          ideDesktopCheck.treeIds.indexOf('pin-grp-old-pinned') < ideDesktopCheck.treeIds.indexOf('pin-grp-new-unpinned'),
          `Pinned older group chat must sort before newer unpinned chat: ${JSON.stringify(ideDesktopCheck.treeIds)}`
        );
        assert.ok(
          ideDesktopCheck.treeIds.indexOf('pin-ug-pinned-closed') < ideDesktopCheck.treeIds.indexOf('pin-ug-new-unpinned'),
          `Pinned older ungrouped chat must sort before newer unpinned chat: ${JSON.stringify(ideDesktopCheck.treeIds)}`
        );

        // 1b. Hovering .ide-pin-ind keeps it visible & avoids swapping archive/menu under cursor; keyboard :focus-within keeps .ide-tree-acts open
        const pinHoverRect = await evalJs(`(() => {
          const ind = document.querySelector('#ide-sidebar-tree .ide-tree-row[data-ide-open-session="pin-grp-old-pinned"] .ide-pin-ind');
          if (!ind) return null;
          ind.scrollIntoView({ block: 'center', inline: 'nearest' });
          const rect = ind.getBoundingClientRect();
          return { cx: Math.round(rect.left + rect.width / 2), cy: Math.round(rect.top + rect.height / 2) };
        })()`);
        assert.ok(pinHoverRect && pinHoverRect.cx > 0 && pinHoverRect.cy > 0, 'Must resolve bounding center of .ide-pin-ind');
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pinHoverRect.cx, y: pinHoverRect.cy }, sessionId);
        await new Promise((r) => setTimeout(r, 40));
        const pinHoverCheck = await evalJs(`(() => {
          const ind = document.querySelector('#ide-sidebar-tree .ide-tree-row[data-ide-open-session="pin-grp-old-pinned"] .ide-pin-ind');
          const hit = document.elementFromPoint(${pinHoverRect.cx}, ${pinHoverRect.cy});
          return {
            indDisplay: ind ? getComputedStyle(ind).display : 'missing',
            hitIsPinInd: Boolean(hit?.closest('.ide-pin-ind')),
            hitDangerous: Boolean(hit?.closest('[data-sess-act="archive"], [data-sess-ctx-menu]')),
            indRole: ind?.getAttribute('role') || null,
            indTag: ind?.tagName || ''
          };
        })()`);
        assert.notStrictEqual(pinHoverCheck.indDisplay, 'none', 'Passive .ide-pin-ind must stay visible on hover');
        assert.strictEqual(pinHoverCheck.hitIsPinInd, true, 'Hovering .ide-pin-ind must keep .ide-pin-ind under cursor');
        assert.strictEqual(pinHoverCheck.hitDangerous, false, 'Hovering .ide-pin-ind must never swap archive or context menu under cursor');
        assert.strictEqual(pinHoverCheck.indTag, 'SPAN', '.ide-pin-ind must be a passive span');
        assert.strictEqual(pinHoverCheck.indRole, null);

        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 }, sessionId);
        await new Promise((r) => setTimeout(r, 40));
        await evalJs(`(() => {
          const row = document.querySelector('#ide-sidebar-tree .ide-tree-row[data-ide-open-session="pin-ug-new-unpinned"]');
          row?.focus?.();
          return true;
        })()`);
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', modifiers: 8, windowsVirtualKeyCode: 9 }, sessionId);
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', modifiers: 8, windowsVirtualKeyCode: 9 }, sessionId);
        const rowFocusVisCheck = await evalJs(`(() => {
          const row = document.querySelector('#ide-sidebar-tree .ide-tree-row[data-ide-open-session="pin-ug-new-unpinned"]');
          const acts = row?.querySelector('.ide-tree-acts');
          row?.focus?.();
          return {
            actsWidth: acts ? acts.getBoundingClientRect().width : 0,
            opacity: acts ? getComputedStyle(acts).opacity : '0'
          };
        })()`);
        assert.ok(rowFocusVisCheck.actsWidth > 0, 'Keyboard :focus-visible on .ide-tree-row must expand .ide-tree-acts');
        assert.strictEqual(rowFocusVisCheck.opacity, '1', 'Keyboard :focus-visible on .ide-tree-row must reveal .ide-tree-acts opacity');

        await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, sessionId);
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, sessionId);
        const ideTabChildCheck = await evalJs(`(() => {
          const row = document.querySelector('#ide-sidebar-tree .ide-tree-row[data-ide-open-session="pin-ug-new-unpinned"]');
          const acts = row?.querySelector('.ide-tree-acts');
          return {
            inActs: Boolean(document.activeElement?.closest('.ide-tree-acts')),
            inSameRow: document.activeElement?.closest('.ide-tree-row') === row,
            actsWidth: acts ? acts.getBoundingClientRect().width : 0,
            opacity: acts ? getComputedStyle(acts).opacity : '0'
          };
        })()`);
        assert.strictEqual(ideTabChildCheck.inActs && ideTabChildCheck.inSameRow, true, 'Real Tab key must step into .ide-tree-acts without dropping focus');
        assert.ok(ideTabChildCheck.actsWidth > 0 && ideTabChildCheck.opacity === '1', 'Tabbing into .ide-tree-acts must keep .ide-tree-acts expanded');

        // 1c. Pinned chats stay inside their group or Ungrouped (no separate Pinned shelf, no .grp-pill); collapsing group shows .ide-group-pin-badge & expands on badge click with #ide-micro-tip dismissal; hovering .ide-row-act.pin-act opens #ide-micro-tip
        const ideShelfCheck = await evalJs(`(() => {
          const pinShelf = document.querySelector('#ide-sidebar-tree [data-ide-group="pinned"]');
          const grpAlpha = document.querySelector('#ide-sidebar-tree [data-ide-group="grp-alpha"]');
          const badgeWhileExpanded = grpAlpha?.querySelectorAll('.ide-group-pin-badge').length || 0;
          const grpAlphaRows = [...(grpAlpha?.querySelectorAll('.ide-tree-row[data-ide-open-session]') || [])].map((el) => el.dataset.ideOpenSession);
          const grpAlphaCount = grpAlpha?.querySelector('.ide-group-pill')?.textContent?.trim() || '';
          const ugGroup = document.querySelector('#ide-sidebar-tree [data-ide-group="ungrouped"]');
          const ugRows = [...(ugGroup?.querySelectorAll('.ide-tree-row[data-ide-open-session]') || [])].map((el) => el.dataset.ideOpenSession);
          const grpPillCount = document.querySelectorAll('#ide-sidebar-tree .ide-row-pill.grp-pill').length;
          const alphaBtn = document.querySelector('#ide-sidebar-tree [data-group-act="toggle"][data-group-id="grp-alpha"]');
          alphaBtn?.click();
          const badgeEl = document.querySelector('#ide-sidebar-tree [data-ide-group="grp-alpha"] .ide-group-pin-badge');
          const badgeBox = badgeEl?.getBoundingClientRect();
          const collapsedCountPill = document.querySelector('#ide-sidebar-tree [data-ide-group="grp-alpha"] .ide-group-pill')?.textContent?.trim() || '';
          const inTreeWhileAlphaCollapsed = Boolean(document.querySelector('#ide-sidebar-tree .ide-tree-row[data-ide-open-session="pin-grp-old-pinned"]'));
          const unpinnedHiddenAfterAlphaCollapse = !document.querySelector('#ide-sidebar-tree .ide-tree-row[data-ide-open-session="pin-grp-new-unpinned"]');
          const ugPinVisibleWhileAlphaCollapsed = Boolean(document.querySelector('#ide-sidebar-tree [data-ide-group="ungrouped"] .ide-tree-row[data-ide-open-session="pin-ug-pinned-closed"]'));
          return {
            hasPinShelf: Boolean(pinShelf),
            badgeWhileExpanded,
            grpAlphaRows,
            grpAlphaCount,
            ugRows,
            grpPillCount,
            badgeText: badgeEl?.textContent?.trim() || '',
            badgeTip: badgeEl?.dataset?.microTip || '',
            badgeAria: badgeEl?.getAttribute('aria-label') || '',
            badgeRole: badgeEl?.getAttribute('role') || '',
            badgeHasSvg: Boolean(badgeEl?.querySelector('svg')),
            badgePt: badgeBox && badgeBox.width > 0 ? { cx: Math.round(badgeBox.left + badgeBox.width / 2), cy: Math.round(badgeBox.top + badgeBox.height / 2) } : null,
            collapsedCountPill,
            inTreeWhileAlphaCollapsed,
            unpinnedHiddenAfterAlphaCollapse,
            ugPinVisibleWhileAlphaCollapsed
          };
        })()`);
        assert.strictEqual(ideShelfCheck.hasPinShelf, false, 'Desktop IDE sidebar must NOT render a separate [data-ide-group="pinned"] section');
        assert.strictEqual(ideShelfCheck.badgeWhileExpanded, 0, 'Expanded IDE group must render 0 .ide-group-pin-badge');
        assert.strictEqual(ideShelfCheck.grpPillCount, 0, 'Desktop IDE sidebar must NOT render .grp-pill badges');
        assert.strictEqual(ideShelfCheck.grpAlphaCount, '2', 'Group count pill must include pinned chats inside that group');
        assert.deepStrictEqual(ideShelfCheck.grpAlphaRows, ['pin-grp-old-pinned', 'pin-grp-new-unpinned'], 'Pinned chat inside grp-alpha must render first within grp-alpha');
        assert.ok(
          ideShelfCheck.ugRows[0] === 'pin-ug-pinned-closed' &&
            ideShelfCheck.ugRows.indexOf('pin-ug-new-unpinned') > 0,
          `Pinned ungrouped chat must render first within ungrouped ahead of newer unpinned chat: ${JSON.stringify(ideShelfCheck.ugRows.slice(0, 6))}`
        );
        assert.strictEqual(ideShelfCheck.badgeText, '1', 'Collapsed IDE grp-alpha must show .ide-group-pin-badge with count 1');
        assert.strictEqual(ideShelfCheck.badgeTip, '1 pinned chat');
        assert.strictEqual(ideShelfCheck.badgeAria, '1 pinned chat');
        assert.strictEqual(ideShelfCheck.badgeRole, 'img');
        assert.strictEqual(ideShelfCheck.badgeHasSvg, true);
        assert.strictEqual(ideShelfCheck.collapsedCountPill, '2', 'Collapsed group total count pill must remain 2');
        assert.ok(ideShelfCheck.badgePt, 'Collapsed .ide-group-pin-badge must expose positive bounding rect');
        assert.strictEqual(ideShelfCheck.inTreeWhileAlphaCollapsed, false, 'Collapsing grp-alpha must hide pinned chat belonging to grp-alpha');
        assert.strictEqual(ideShelfCheck.unpinnedHiddenAfterAlphaCollapse && ideShelfCheck.ugPinVisibleWhileAlphaCollapsed, true, 'Collapsing grp-alpha hides its unpinned chat while leaving Ungrouped pins visible');

        // Hovering .ide-group-pin-badge opens #ide-micro-tip; clicking the badge directly expands grp-alpha, removes badge, and hides #ide-micro-tip
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: ideShelfCheck.badgePt.cx, y: ideShelfCheck.badgePt.cy }, sessionId);
        await new Promise((r) => setTimeout(r, 110));
        const ideBadgeHoverExpand = await evalJs(`(() => {
          const tip = document.getElementById('ide-micro-tip');
          const tipVisibleBeforeExpand = tip ? !tip.hidden : false;
          const tipText = tip?.textContent?.trim() || '';
          const badge = document.querySelector('#ide-sidebar-tree [data-ide-group="grp-alpha"] .ide-group-pin-badge');
          badge?.click();
          const tipHiddenAfterExpand = tip ? tip.hidden : true;
          const badgeAfterExpand = document.querySelectorAll('#ide-sidebar-tree [data-ide-group="grp-alpha"] .ide-group-pin-badge').length;
          const duplicateCount = document.querySelectorAll('#ide-sidebar-tree .ide-tree-row[data-ide-open-session="pin-grp-old-pinned"]').length;
          return { tipVisibleBeforeExpand, tipText, tipHiddenAfterExpand, badgeAfterExpand, duplicateCount };
        })()`);
        assert.strictEqual(ideBadgeHoverExpand.tipVisibleBeforeExpand, true, 'Hovering .ide-group-pin-badge must reveal #ide-micro-tip');
        assert.strictEqual(ideBadgeHoverExpand.tipText, '1 pinned chat');
        assert.strictEqual(ideBadgeHoverExpand.badgeAfterExpand, 0, 'Clicking .ide-group-pin-badge must expand grp-alpha and remove badge');
        assert.strictEqual(ideBadgeHoverExpand.tipHiddenAfterExpand, true, 'Expanding via .ide-group-pin-badge click must dismiss #ide-micro-tip');
        assert.strictEqual(ideBadgeHoverExpand.duplicateCount, 1, 'Pinned chat must appear exactly once inside its group');
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 }, sessionId);

        // Collapse grp-alpha and verify collapsed state + .ide-group-pin-badge + zero Pinned shelf survive full page reload (also resets in-memory hostSnapshotsByDevice)
        await evalJs(`(() => {
          document.querySelector('#ide-sidebar-tree [data-group-act="toggle"][data-group-id="grp-alpha"]')?.click();
          window.__theoPreReload = 1;
          localStorage.setItem('theo_remote_cache_v3', '{}');
          location.reload();
          return true;
        })()`);
        await waitPinCond(
          () => evalJs(`Boolean(!window.__theoPreReload && document.readyState === 'complete' && window.__theoTestWs)`),
          'Adversarial #23 group collapse reload committed'
        );
        await evalJs(`(() => {
          window.__THEO_ALLOW_MOCK_WS = true;
          window.__THEO_MOCK_BRIDGE_TOKEN = 'test-token-hex';
          window.__theoLastQuarantinedCmd = null;
          window.__theoTestWs.connectLocalWs('http://127.0.0.1:${pinPort}', { wsPath: '/ws' });
          return true;
        })()`);
        await waitPinCond(
          () => evalJs(`Boolean((window.__theoTestWs.getState()?.rows || []).some((r) => r.id === 'pin-grp-old-pinned'))`),
          'Adversarial #23 reconnect after group collapse reload check'
        );
        const grpAfterReload = await evalJs(`(() => {
          const hasPinShelf = Boolean(document.querySelector('#ide-sidebar-tree [data-ide-group="pinned"]'));
          const collapsedAfterReload = Boolean(document.querySelector('#ide-sidebar-tree [data-ide-group="grp-alpha"]')?.classList.contains('collapsed'));
          const reloadBadgeText = document.querySelector('#ide-sidebar-tree [data-ide-group="grp-alpha"] .ide-group-pin-badge')?.textContent?.trim() || '';
          document.querySelector('#ide-sidebar-tree [data-group-act="toggle"][data-group-id="grp-alpha"]')?.click();
          const expandedAfterRestore = !document.querySelector('#ide-sidebar-tree [data-ide-group="grp-alpha"]')?.classList.contains('collapsed');
          const badgeAfterRestore = document.querySelectorAll('#ide-sidebar-tree [data-ide-group="grp-alpha"] .ide-group-pin-badge').length;
          return { hasPinShelf, collapsedAfterReload, reloadBadgeText, expandedAfterRestore, badgeAfterRestore };
        })()`);
        assert.strictEqual(grpAfterReload.hasPinShelf, false, 'Reload must not render a separate Pinned shelf');
        assert.strictEqual(grpAfterReload.collapsedAfterReload, true, 'Group collapsed state must survive page reload');
        assert.strictEqual(grpAfterReload.reloadBadgeText, '1', '.ide-group-pin-badge must survive page reload on collapsed group');
        assert.strictEqual(grpAfterReload.expandedAfterRestore && grpAfterReload.badgeAfterRestore === 0, true);

        // v81 -> v82 upgrade continuity: pre-existing localStorage with collapsedSessionGroups.pinned=true & ungrouped=true keeps pinned chats visible inside expanded groups and shows .ide-group-pin-badge on collapsed ungrouped
        await evalJs(`(() => {
          window.__theoPreReload = 1;
          localStorage.setItem('theo_remote_cache_v3', '{}');
          localStorage.setItem('theo_remote_prefs_v1', JSON.stringify({ collapsedSessionGroups: { pinned: true, ungrouped: true } }));
          location.reload();
          return true;
        })()`);
        await waitPinCond(
          () => evalJs(`Boolean(!window.__theoPreReload && document.readyState === 'complete' && window.__theoTestWs)`),
          'Adversarial #23 v81->v82 reload committed'
        );
        await evalJs(`(() => {
          window.__THEO_ALLOW_MOCK_WS = true;
          window.__THEO_MOCK_BRIDGE_TOKEN = 'test-token-hex';
          window.__theoLastQuarantinedCmd = null;
          window.__theoTestWs.connectLocalWs('http://127.0.0.1:${pinPort}', { wsPath: '/ws' });
          document.querySelector('[data-tab="chat"]')?.click();
          return true;
        })()`);
        await waitPinCond(
          () => evalJs(`Boolean(document.querySelector('#ide-sidebar-tree [data-ide-group="grp-alpha"] .ide-tree-row[data-ide-open-session="pin-grp-old-pinned"]'))`),
          'Adversarial #23 reconnect after v81->v82 localStorage upgrade seed'
        );
        const v81UpgradeGrouped = await evalJs(`(() => {
          const idePinShelf = document.querySelector('#ide-sidebar-tree [data-ide-group="pinned"]');
          const mobPinShelf = document.querySelector('#view-sessions [data-session-group="pinned"]');
          const ideGrpPinned = document.querySelector('#ide-sidebar-tree [data-ide-group="grp-alpha"] .ide-tree-row[data-ide-open-session="pin-grp-old-pinned"]');
          const ugEl = document.querySelector('#ide-sidebar-tree [data-ide-group="ungrouped"]');
          const ugCollapsedBeforeClick = Boolean(ugEl?.classList.contains('collapsed'));
          const ugCollapsedPinBadge = ugEl?.querySelector('.ide-group-pin-badge')?.textContent?.trim() || '';
          document.querySelector('#ide-sidebar-tree [data-group-act="toggle"][data-group-id="ungrouped"]')?.click();
          const ugExpandedAfterClick = !document.querySelector('#ide-sidebar-tree [data-ide-group="ungrouped"]')?.classList.contains('collapsed');
          const ugBadgeAfterExpand = document.querySelectorAll('#ide-sidebar-tree [data-ide-group="ungrouped"] .ide-group-pin-badge').length;
          const hasUgUnpinnedAfterExpand = Boolean(document.querySelector('#ide-sidebar-tree .ide-tree-row[data-ide-open-session="pin-ug-new-unpinned"]'));
          return {
            hasIdePinShelf: Boolean(idePinShelf),
            hasMobPinShelf: Boolean(mobPinShelf),
            hasIdeGrpPinned: Boolean(ideGrpPinned),
            ugCollapsedBeforeClick,
            ugCollapsedPinBadge,
            ugExpandedAfterClick,
            ugBadgeAfterExpand,
            hasUgUnpinnedAfterExpand
          };
        })()`);
        assert.strictEqual(v81UpgradeGrouped.hasIdePinShelf, false, 'Upgraded v81 client must not render [data-ide-group="pinned"]');
        assert.strictEqual(v81UpgradeGrouped.hasMobPinShelf, false, 'Upgraded v81 client must not render [data-session-group="pinned"]');
        assert.strictEqual(v81UpgradeGrouped.hasIdeGrpPinned, true, 'Upgraded v81 client must render pinned chat inside expanded grp-alpha');
        assert.strictEqual(v81UpgradeGrouped.ugCollapsedBeforeClick, true, 'Legacy collapsedSessionGroups.ungrouped must stay collapsed until expanded');
        assert.strictEqual(v81UpgradeGrouped.ugCollapsedPinBadge, '1', 'Collapsed ungrouped section holding pinned chat must show .ide-group-pin-badge');
        assert.strictEqual(v81UpgradeGrouped.ugExpandedAfterClick && v81UpgradeGrouped.ugBadgeAfterExpand === 0 && v81UpgradeGrouped.hasUgUnpinnedAfterExpand, true, 'Expanding ungrouped must remove badge and reveal pin-ug-new-unpinned');

        // Hover row first to expand .ide-tree-acts, then hover .ide-row-act.pin-act -> #ide-micro-tip reveals and #ide-hover-card stays hidden, then test toggleIdeSidebar + Escape + scroll + pointerdown dismissal & .group-act-btn tip
        const hoverRowTitlePt = await evalJs(`(() => {
          const t = document.querySelector('#ide-sidebar-tree .ide-tree-row[data-ide-open-session="pin-grp-old-pinned"] .ide-tree-title');
          const r = t?.getBoundingClientRect();
          return r ? { cx: Math.round(r.left + Math.min(24, r.width / 2)), cy: Math.round(r.top + r.height / 2) } : null;
        })()`);
        assert.ok(hoverRowTitlePt);
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hoverRowTitlePt.cx, y: hoverRowTitlePt.cy }, sessionId);
        await new Promise((r) => setTimeout(r, 30));
        const pinActPt = await evalJs(`(() => {
          const b = document.querySelector('#ide-sidebar-tree .ide-tree-row[data-ide-open-session="pin-grp-old-pinned"] .ide-row-act.pin-act');
          const r = b?.getBoundingClientRect();
          return r && r.width > 0 ? { cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) } : null;
        })()`);
        assert.ok(pinActPt, 'Expanded .ide-row-act.pin-act must expose positive hover box');
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pinActPt.cx, y: pinActPt.cy }, sessionId);
        await new Promise((r) => setTimeout(r, 230));
        const ideMicroTipCheck = await evalJs(`(() => {
          const tip = document.getElementById('ide-micro-tip');
          const hc = document.getElementById('ide-hover-card');
          const r = tip?.getBoundingClientRect();
          const tipVisibleBeforeToggle = tip ? !tip.hidden : false;
          const tipText = tip?.textContent?.trim() || '';
          const hcHidden = hc ? hc.hidden : true;
          const clamped = Boolean(r && r.left >= 6 && r.right <= window.innerWidth - 6);
          document.getElementById('btn-toggle-sidebar')?.click();
          const tipHiddenAfterSidebarToggle = tip ? tip.hidden : true;
          document.getElementById('btn-expand-sidebar-inline')?.click();
          return { tipVisibleBeforeToggle, tipText, hcHidden, clamped, tipHiddenAfterSidebarToggle };
        })()`);
        assert.strictEqual(ideMicroTipCheck.tipVisibleBeforeToggle, true, 'Hovering .ide-row-act.pin-act must open #ide-micro-tip');
        assert.strictEqual(ideMicroTipCheck.tipText, 'Unpin chat');
        assert.strictEqual(ideMicroTipCheck.hcHidden, true, '#ide-hover-card must stay hidden while hovering .ide-row-act');
        assert.strictEqual(ideMicroTipCheck.clamped, true, '#ide-micro-tip must clamp inside viewport');
        assert.strictEqual(ideMicroTipCheck.tipHiddenAfterSidebarToggle, true, 'Collapsing IDE sidebar must dismiss #ide-micro-tip');
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 }, sessionId);
        await new Promise((r) => setTimeout(r, 30));

        // Verify Desktop Sessions .group-act-btn[data-micro-tip] opens #ide-micro-tip and Escape/scroll/pointerdown dismiss it
        await evalJs(`(() => { document.querySelector('[data-tab="sessions"]')?.click(); return true; })()`);
        await new Promise((r) => setTimeout(r, 50));
        const grpActPt = await evalJs(`(() => {
          const b = document.querySelector('#view-sessions [data-group-act="rename"][data-group-id="grp-alpha"]');
          b?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
          const r = b?.getBoundingClientRect();
          return r && r.width > 0 ? { cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) } : null;
        })()`);
        assert.ok(grpActPt, 'Must locate Desktop Sessions .group-act-btn[data-group-act="rename"]');
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: grpActPt.cx, y: grpActPt.cy }, sessionId);
        await new Promise((r) => setTimeout(r, 100));
        const grpTipOpen = await evalJs(`(() => {
          const tip = document.getElementById('ide-micro-tip');
          const shown = tip ? !tip.hidden : false;
          const text = tip?.textContent?.trim() || '';
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          const hiddenOnEsc = tip ? tip.hidden : false;
          return { shown, text, hiddenOnEsc };
        })()`);
        assert.strictEqual(grpTipOpen.shown && grpTipOpen.text === 'Rename group', true, 'Hovering .group-act-btn must open #ide-micro-tip');
        assert.strictEqual(grpTipOpen.hiddenOnEsc, true, 'Escape must dismiss #ide-micro-tip');
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 }, sessionId);
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: grpActPt.cx, y: grpActPt.cy }, sessionId);
        await new Promise((r) => setTimeout(r, 100));
        const grpTipScrollCheck = await evalJs(`(() => {
          const tip = document.getElementById('ide-micro-tip');
          const shownBeforeScroll = tip ? !tip.hidden : false;
          document.dispatchEvent(new Event('scroll', { bubbles: false }));
          const hiddenAfterScroll = tip ? tip.hidden : false;
          return { shownBeforeScroll, hiddenAfterScroll };
        })()`);
        assert.strictEqual(grpTipScrollCheck.shownBeforeScroll && grpTipScrollCheck.hiddenAfterScroll, true, 'scroll must hide #ide-micro-tip');
        await evalJs(`(() => { document.querySelector('[data-tab="chat"]')?.click(); return true; })()`);
        await new Promise((r) => setTimeout(r, 50));

        const titleClickPt = await evalJs(`(() => {
          const titleEl = document.querySelector('#ide-sidebar-tree .ide-tree-row[data-ide-open-session="pin-ug-new-unpinned"] .ide-tree-title');
          titleEl?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
          const r = titleEl?.getBoundingClientRect();
          return r ? { cx: Math.round(r.left + Math.min(20, r.width / 2)), cy: Math.round(r.top + r.height / 2) } : null;
        })()`);
        assert.ok(titleClickPt && titleClickPt.cx > 0 && titleClickPt.cy > 0);
        await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: titleClickPt.cx, y: titleClickPt.cy, button: 'left', clickCount: 1 }, sessionId);
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: titleClickPt.cx, y: titleClickPt.cy, button: 'left', clickCount: 1 }, sessionId);
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 }, sessionId);
        await new Promise((r) => setTimeout(r, 40));
        const afterClickLeave = await evalJs(`(() => {
          const acts = document.querySelector('#ide-sidebar-tree .ide-tree-row[data-ide-open-session="pin-ug-new-unpinned"] .ide-tree-acts');
          return {
            actsWidth: acts ? acts.getBoundingClientRect().width : -1,
            opacity: acts ? getComputedStyle(acts).opacity : ''
          };
        })()`);
        assert.strictEqual(afterClickLeave.actsWidth, 0, 'Mouse click on row + pointer leave must not latch .ide-tree-acts open');
        assert.strictEqual(afterClickLeave.opacity, '0', 'Mouse click on row + pointer leave must keep .ide-tree-acts opacity 0');
        await evalJs(`(() => {
          document.querySelector('[data-close-editor-tab="pin-ug-new-unpinned"]')?.click();
          return true;
        })()`);

        const idePinToggle = await evalJs(`(() => {
          window.__theoLastQuarantinedCmd = null;
          const btn = document.querySelector('#ide-sidebar-tree .ide-tree-row[data-ide-open-session="pin-ug-new-unpinned"] .ide-row-act.pin-act');
          btn?.click();
          const cmdAfterPin = window.__theoLastQuarantinedCmd;
          const rowAfterPin = document.querySelector('#ide-sidebar-tree .ide-tree-row[data-ide-open-session="pin-ug-new-unpinned"]');
          const isNowPinned = Boolean(rowAfterPin?.classList.contains('is-pinned') && rowAfterPin?.querySelector('.ide-pin-ind'));
          rowAfterPin?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 80, clientY: 120 }));
          const ctxEl = document.getElementById('ide-context-menu');
          const ctxBtn = ctxEl?.querySelector('[data-sess-act="pin"][data-id="pin-ug-new-unpinned"]');
          const ctxLabel = ctxBtn?.textContent?.trim() || '';
          const ctxVisible = Boolean(ctxEl && !ctxEl.hidden);
          window.__theoLastQuarantinedCmd = null;
          ctxBtn?.click();
          const ctxClosedAfterClick = Boolean(document.getElementById('ide-context-menu')?.hidden);
          const unpinnedRow = (window.__theoTestWs.getState()?.rows || []).find((r) => r.id === 'pin-ug-new-unpinned');
          return {
            cmdAfterPin,
            isNowPinned,
            ctxVisible,
            ctxLabel,
            ctxClosedAfterClick,
            cmdAfterCtxUnpin: window.__theoLastQuarantinedCmd,
            finalPinned: Boolean(unpinnedRow?.pinned)
          };
        })()`);
        assert.strictEqual(idePinToggle.cmdAfterPin?.action, 'pin');
        assert.strictEqual(idePinToggle.cmdAfterPin?.subAction, 'pin');
        assert.strictEqual(idePinToggle.cmdAfterPin?.threadId, 'pin-ug-new-unpinned');
        assert.deepStrictEqual(idePinToggle.cmdAfterPin?.ids, ['pin-ug-new-unpinned']);
        assert.strictEqual(idePinToggle.cmdAfterPin?.value, true);
        assert.strictEqual(idePinToggle.isNowPinned, true);
        assert.strictEqual(idePinToggle.ctxVisible, true);
        assert.strictEqual(idePinToggle.ctxLabel, 'Unpin Chat');
        assert.strictEqual(idePinToggle.ctxClosedAfterClick, true, 'Context menu Pin click must close #ide-context-menu');
        assert.strictEqual(idePinToggle.cmdAfterCtxUnpin?.action, 'pin');
        assert.strictEqual(idePinToggle.cmdAfterCtxUnpin?.value, false);
        assert.strictEqual(idePinToggle.finalPinned, false);

        // 2. Command Palette (⌘K) pin-chat toggles selected active chat
        const cmdPalettePin = await evalJs(`(async () => {
          document.querySelector('#ide-sidebar-tree .ide-tree-row[data-ide-open-session="pin-grp-new-unpinned"]')?.click();
          await new Promise((r) => setTimeout(r, 30));
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
          const inp = document.getElementById('cmd-input');
          if (inp) {
            inp.value = 'pin';
            inp.dispatchEvent(new Event('input', { bubbles: true }));
          }
          const pinItem = document.querySelector('#cmd-results [data-cmd-act="pin-chat"]');
          const foundLabel = pinItem?.textContent?.trim() || '';
          window.__theoLastQuarantinedCmd = null;
          pinItem?.click();
          const rowPinned = Boolean((window.__theoTestWs.getState()?.rows || []).find((r) => r.id === 'pin-grp-new-unpinned')?.pinned);
          const cmdSent = window.__theoLastQuarantinedCmd;
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          // Unpin via same pin-chat action back to baseline
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
          const inp2 = document.getElementById('cmd-input');
          if (inp2) { inp2.value = 'pin'; inp2.dispatchEvent(new Event('input', { bubbles: true })); }
          document.querySelector('#cmd-results [data-cmd-act="pin-chat"]')?.click();
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          return { foundLabel, rowPinned, cmdSent };
        })()`);
        assert.ok(cmdPalettePin.foundLabel.includes('Pin / Unpin Active Chat'), `Expected Pin / Unpin Active Chat in Cmd Palette, got: ${cmdPalettePin.foundLabel}`);
        assert.strictEqual(cmdPalettePin.rowPinned, true);
        assert.strictEqual(cmdPalettePin.cmdSent?.action, 'pin');
        assert.strictEqual(cmdPalettePin.cmdSent?.threadId, 'pin-grp-new-unpinned');
        assert.deepStrictEqual(cmdPalettePin.cmdSent?.ids, ['pin-grp-new-unpinned']);
        assert.strictEqual(cmdPalettePin.cmdSent?.value, true);

        // 2b. Desktop #ide-sidebar-search flat results keep older/low-freq pinned chat above high-freq/newer unpinned match & omit Pinned shelf while searching
        const ideSearchPinOrder = await evalJs(`(() => {
          const inp = document.getElementById('ide-sidebar-search');
          inp.value = 'group';
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          const hasPinnedShelf = Boolean(document.querySelector('#ide-sidebar-tree [data-ide-group="pinned"]'));
          const ids = [...document.querySelectorAll('#ide-sidebar-tree .ide-tree-row[data-ide-open-session]')].map((el) => el.dataset.ideOpenSession);
          inp.value = '';
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          return { ids, hasPinnedShelf };
        })()`);
        assert.strictEqual(ideSearchPinOrder.hasPinnedShelf, false, 'Desktop #ide-sidebar-search must hide [data-ide-group="pinned"] shelf during search');
        assert.ok(
          ideSearchPinOrder.ids.indexOf('pin-grp-old-pinned') >= 0 &&
            ideSearchPinOrder.ids.indexOf('pin-grp-old-pinned') < ideSearchPinOrder.ids.indexOf('pin-grp-new-unpinned'),
          `Desktop #ide-sidebar-search must keep pinned chat first above higher-frequency unpinned match: ${JSON.stringify(ideSearchPinOrder.ids)}`
        );

        // 3. Mobile (390x844) Sessions cards, inline pinned order inside groups & Ungrouped, dark/light themes, 0px horizontal overflow, bulk archive & single archive auto-unpin
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sessionId);
        for (const theme of ['dark', 'light']) {
          const mobPin = await evalJs(`(async () => {
            document.documentElement.setAttribute('data-theme', '${theme}');
            document.querySelector('[data-tab="sessions"]')?.click();
            await new Promise((r) => setTimeout(r, 60));
            const pinShelf = document.querySelector('#view-sessions [data-session-group="pinned"]');
            const alphaGrp = document.querySelector('#view-sessions [data-session-group="grp-alpha"]');
            const alphaPinBadgeExpanded = alphaGrp?.querySelectorAll('.group-pin-badge').length || 0;
            const alphaCardIds = [...(alphaGrp?.querySelectorAll('.session-card[data-session-id]') || [])].map((c) => c.dataset.sessionId);
            const alphaCount = alphaGrp?.querySelector('.group-count-pill')?.textContent?.trim() || '';
            const ugGrp = document.querySelector('#view-sessions [data-session-group="ungrouped"]');
            const ugCardIds = [...(ugGrp?.querySelectorAll('.session-card[data-session-id]') || [])].map((c) => c.dataset.sessionId);
            const ugCount = ugGrp?.querySelector('.group-count-pill')?.textContent?.trim() || '';
            document.querySelector('#view-sessions [data-group-act="toggle"][data-group-id="grp-alpha"]')?.click();
            const alphaCollapsed = Boolean(document.querySelector('#view-sessions [data-session-group="grp-alpha"]')?.classList.contains('collapsed'));
            const alphaBadgeEl = document.querySelector('#view-sessions [data-session-group="grp-alpha"] .group-pin-badge');
            const alphaBadgeText = alphaBadgeEl?.textContent?.trim() || '';
            const alphaBadgeColor = alphaBadgeEl ? getComputedStyle(alphaBadgeEl).color : '';
            const alphaBadgeRole = alphaBadgeEl?.getAttribute('role') || '';
            const alphaBadgeAria = alphaBadgeEl?.getAttribute('aria-label') || '';
            const overflowXCollapsed = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
            alphaBadgeEl?.click();
            const alphaReexpandedByBadge = !document.querySelector('#view-sessions [data-session-group="grp-alpha"]')?.classList.contains('collapsed');
            const alphaPinBadgeAfterExpand = document.querySelectorAll('#view-sessions [data-session-group="grp-alpha"] .group-pin-badge').length;
            const totalOccurrences = document.querySelectorAll('#view-sessions .session-card[data-session-id="pin-grp-old-pinned"]').length;
            const cardIds = [...document.querySelectorAll('#view-sessions .session-card[data-session-id]')].map((c) => c.dataset.sessionId);
            const pCard = document.querySelector('#view-sessions .session-card[data-session-id="pin-ug-pinned-closed"]');
            const hasGlyph = Boolean(pCard?.querySelector('.sess-pin-glyph'));
            const activePinBtn = pCard?.querySelector('.sess-act-btn.pin-btn.active');
            const hasActiveBtn = Boolean(activePinBtn);
            const activePinColor = activePinBtn ? getComputedStyle(activePinBtn).color : '';
            const overflowX = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
            const titles = document.querySelectorAll('[title]').length;
            return { cardIds, hasPinShelf: Boolean(pinShelf), alphaPinBadgeExpanded, alphaCardIds, alphaCount, ugCardIds, ugCount, alphaCollapsed, alphaBadgeText, alphaBadgeColor, alphaBadgeRole, alphaBadgeAria, overflowXCollapsed, alphaReexpandedByBadge, alphaPinBadgeAfterExpand, totalOccurrences, hasGlyph, hasActiveBtn, activePinColor, overflowX, titles };
          })()`);
          assert.strictEqual(mobPin.hasPinShelf, false, `Mobile ${theme} Sessions must NOT render [data-session-group="pinned"] shelf`);
          assert.strictEqual(mobPin.alphaPinBadgeExpanded, 0, `Mobile ${theme} expanded group must render 0 .group-pin-badge`);
          assert.strictEqual(mobPin.alphaCount, '2', `Mobile ${theme} grp-alpha count must include pinned card`);
          assert.deepStrictEqual(mobPin.alphaCardIds, ['pin-grp-old-pinned', 'pin-grp-new-unpinned'], `Mobile ${theme} Sessions must keep pinned card first inside grp-alpha`);
          assert.strictEqual(mobPin.ugCount, String(mobPin.ugCardIds.length), `Mobile ${theme} Ungrouped count must match all ungrouped cards including pinned`);
          assert.ok(
            mobPin.ugCardIds[0] === 'pin-ug-pinned-closed' &&
              mobPin.ugCardIds.indexOf('pin-ug-new-unpinned') > 0,
            `Mobile ${theme} Sessions must keep pinned card first inside Ungrouped: ${JSON.stringify(mobPin.ugCardIds.slice(0, 6))}`
          );
          assert.strictEqual(mobPin.alphaCollapsed && mobPin.totalOccurrences === 1, true, `Mobile ${theme} Sessions must toggle grp-alpha cleanly with 1 occurrence`);
          assert.strictEqual(mobPin.alphaBadgeText, '1', `Mobile ${theme} collapsed grp-alpha must show .group-pin-badge "1"`);
          assert.strictEqual(mobPin.alphaBadgeRole, 'img');
          assert.strictEqual(mobPin.alphaBadgeAria, '1 pinned chat');
          assert.strictEqual(mobPin.overflowXCollapsed, 0, `Mobile 390x844 ${theme} collapsed group with pin badge must have 0px overflow`);
          assert.strictEqual(mobPin.alphaReexpandedByBadge && mobPin.alphaPinBadgeAfterExpand === 0, true, `Mobile ${theme} clicking .group-pin-badge must expand grp-alpha and remove badge`);
          assert.strictEqual(mobPin.hasGlyph, true, `Mobile ${theme} session card must show .sess-pin-glyph`);
          assert.strictEqual(mobPin.hasActiveBtn, true, `Mobile ${theme} session card must mark .sess-act-btn.pin-btn.active`);
          if (theme === 'light') {
            assert.strictEqual(mobPin.activePinColor, 'rgb(138, 92, 24)', 'Light theme .sess-act-btn.pin-btn.active must use --brass-deep for WCAG AA contrast');
            assert.strictEqual(mobPin.alphaBadgeColor, 'rgb(138, 92, 24)', 'Light theme .group-pin-badge must use --brass-deep for WCAG AA contrast');
          }
          assert.strictEqual(mobPin.overflowX, 0, `Mobile 390x844 ${theme} Sessions with pins must have 0px overflow`);
          assert.strictEqual(mobPin.titles, 0);
          assert.ok(
            mobPin.cardIds.indexOf('pin-ug-pinned-closed') < mobPin.cardIds.indexOf('pin-ug-new-unpinned'),
            `Mobile ${theme} cards must order pinned ungrouped chat first: ${JSON.stringify(mobPin.cardIds)}`
          );
        }

        const mobSearchPinOrder = await evalJs(`(() => {
          const sInp = document.getElementById('sess-search-input');
          sInp.value = 'ungrouped';
          sInp.dispatchEvent(new Event('input', { bubbles: true }));
          const hasPinnedShelf = Boolean(document.querySelector('#view-sessions [data-session-group="pinned"]'));
          const ids = [...document.querySelectorAll('#view-sessions .session-card[data-session-id]')].map((c) => c.dataset.sessionId);
          sInp.value = '';
          sInp.dispatchEvent(new Event('input', { bubbles: true }));
          return { ids, hasPinnedShelf };
        })()`);
        assert.strictEqual(mobSearchPinOrder.hasPinnedShelf, false, 'Mobile #sess-search-input must hide [data-session-group="pinned"] shelf during search');
        assert.ok(
          mobSearchPinOrder.ids.indexOf('pin-ug-pinned-closed') >= 0 &&
            mobSearchPinOrder.ids.indexOf('pin-ug-pinned-closed') < mobSearchPinOrder.ids.indexOf('pin-ug-new-unpinned'),
          `Mobile #sess-search-input must keep pinned chat ahead of newer unpinned match: ${JSON.stringify(mobSearchPinOrder.ids)}`
        );

        const archivePinCheck = await evalJs(`(() => {
          window.__theoLastQuarantinedCmd = null;
          document.querySelector('[data-group-act="archive-closed"]')?.click();
          const bulkCmd = window.__theoLastQuarantinedCmd;
          const rowsAfterBulk = window.__theoTestWs.getState()?.rows || [];
          const ugUnpArch = Boolean(rowsAfterBulk.find((r) => r.id === 'pin-ug-new-unpinned')?.archived);
          const ugPinArch = Boolean(rowsAfterBulk.find((r) => r.id === 'pin-ug-pinned-closed')?.archived);
          const ugPinStillPinned = Boolean(rowsAfterBulk.find((r) => r.id === 'pin-ug-pinned-closed')?.pinned);
          window.__theoLastQuarantinedCmd = null;
          document.querySelector('#view-sessions .session-card[data-session-id="pin-ug-pinned-closed"] [data-sess-act="archive"]')?.click();
          const singleCmd = window.__theoLastQuarantinedCmd;
          const rowsAfterSingle = window.__theoTestWs.getState()?.rows || [];
          const pinnedAfterArch = rowsAfterSingle.find((r) => r.id === 'pin-ug-pinned-closed');
          return { bulkCmd, ugUnpArch, ugPinArch, ugPinStillPinned, singleCmd, pinnedAfterArch };
        })()`);
        assert.ok(archivePinCheck.bulkCmd?.ids?.includes('pin-ug-new-unpinned'), 'Archive closed must archive unpinned closed ungrouped chat');
        assert.strictEqual(archivePinCheck.bulkCmd?.ids?.includes('pin-ug-pinned-closed'), false, 'Archive closed must exclude pinned chat');
        assert.strictEqual(archivePinCheck.ugUnpArch, true);
        assert.strictEqual(archivePinCheck.ugPinArch, false);
        assert.strictEqual(archivePinCheck.ugPinStillPinned, true);
        assert.strictEqual(archivePinCheck.singleCmd?.action, 'archive');
        assert.strictEqual(archivePinCheck.pinnedAfterArch?.archived, true);
        assert.strictEqual(archivePinCheck.pinnedAfterArch?.pinned, false, 'Single archive must auto-unpin the session');

        // Unarchiving a previously pinned session must NOT resurrect its old pin even if a stale snapshot arrives
        const unarchiveRes = await evalJs(`(() => {
          document.querySelector('#sess-status-chips [data-status-filter="archived"]')?.click();
          document.querySelector('#view-sessions .session-card[data-session-id="pin-ug-pinned-closed"] [data-sess-act="archive"]')?.click();
          document.querySelector('#sess-status-chips [data-status-filter="all"]')?.click();
          const row = (window.__theoTestWs.getState()?.rows || []).find((r) => r.id === 'pin-ug-pinned-closed');
          return { archived: Boolean(row?.archived), pinned: Boolean(row?.pinned) };
        })()`);
        assert.strictEqual(unarchiveRes.archived, false);
        assert.strictEqual(unarchiveRes.pinned, false, 'Unarchiving must keep pinned === false');

        // 4. Multi-Host LWW override vs stale snapshot, then newer WS rowPatch(seq:2) re-pin
        const lwwPrep = await evalJs(`(() => {
          document.querySelector('#view-sessions .session-card[data-session-id="pin-grp-old-pinned"] .sess-act-btn.pin-btn')?.click();
          const rowPinned = Boolean((window.__theoTestWs.getState()?.rows || []).find((r) => r.id === 'pin-grp-old-pinned')?.pinned);
          const hasMobPinnedShelf = Boolean(document.querySelector('#view-sessions [data-session-group="pinned"]'));
          const mobAlphaOrder = [...document.querySelectorAll('#view-sessions [data-session-group="grp-alpha"] .session-card[data-session-id]')].map((c) => c.dataset.sessionId);
          const hasIdePinnedShelf = Boolean(document.querySelector('#ide-sidebar-tree [data-ide-group="pinned"]'));
          const ideAlphaOrder = [...document.querySelectorAll('#ide-sidebar-tree [data-ide-group="grp-alpha"] .ide-tree-row[data-ide-open-session]')].map((r) => r.dataset.ideOpenSession);
          // Collapsing a group with 0 pinned chats must render 0 badges on both Mobile and Desktop
          document.querySelector('#view-sessions [data-group-act="toggle"][data-group-id="grp-alpha"]')?.click();
          const zeroMobPinBadges = document.querySelectorAll('#view-sessions [data-session-group="grp-alpha"] .group-pin-badge').length;
          const zeroIdePinBadges = document.querySelectorAll('#ide-sidebar-tree [data-ide-group="grp-alpha"] .ide-group-pin-badge').length;
          document.querySelector('#view-sessions [data-group-act="toggle"][data-group-id="grp-alpha"]')?.click();
          return { rowPinned, hasMobPinnedShelf, mobAlphaOrder, hasIdePinnedShelf, ideAlphaOrder, zeroMobPinBadges, zeroIdePinBadges };
        })()`);
        assert.strictEqual(lwwPrep.rowPinned, false);
        assert.strictEqual(lwwPrep.hasMobPinnedShelf, false);
        assert.deepStrictEqual(lwwPrep.mobAlphaOrder, ['pin-grp-new-unpinned', 'pin-grp-old-pinned'], 'Unpinning chat inside grp-alpha must keep it in grp-alpha sorted below newer unpinned chat on Mobile');
        assert.strictEqual(lwwPrep.hasIdePinnedShelf, false);
        assert.deepStrictEqual(lwwPrep.ideAlphaOrder, ['pin-grp-new-unpinned', 'pin-grp-old-pinned'], 'Unpinning chat inside grp-alpha must keep it in grp-alpha sorted below newer unpinned chat on Desktop');
        assert.strictEqual(lwwPrep.zeroMobPinBadges === 0 && lwwPrep.zeroIdePinBadges === 0, true, 'Collapsed grp-alpha with 0 pinned chats after unpinning must show 0 pin badges');
        for (const s of pinSockets) {
          sendPinWsJson(s, {
            type: 'state',
            deviceId: 'pin-dev-local',
            seq: 1,
            state: {
              generatedAt: now23 + 1000,
              device: { id: 'pin-dev-local', name: 'Pin Local PC' },
              groups: [{ id: 'grp-alpha', name: 'Alpha', color: 'blue', collapsed: false }],
              rows: basePinRows.map((r) => ({ ...r }))
            }
          });
        }
        await new Promise((r) => setTimeout(r, 120));
        const staleBlocked = await evalJs(`Boolean((window.__theoTestWs.getState()?.rows || []).find((r) => r.id === 'pin-grp-old-pinned')?.pinned)`);
        assert.strictEqual(staleBlocked, false, 'Stale WS snapshot must not resurrect locally unpinned chat');

        const futurePinTs = Date.now() + 60000;
        for (const s of pinSockets) {
          sendPinWsJson(s, {
            type: 'rowPatch',
            deviceId: 'pin-dev-local',
            seq: 2,
            generatedAt: futurePinTs,
            upserts: [
              {
                ...basePinRows[0],
                pinned: true,
                pinnedAt: futurePinTs,
                pinUpdatedAt: futurePinTs
              }
            ],
            removedIds: [],
            removedKeys: []
          });
        }
        await waitPinCond(
          () => evalJs(`Boolean((window.__theoTestWs.getState()?.rows || []).find((r) => r.id === 'pin-grp-old-pinned')?.pinned)`),
          'Newer WS rowPatch re-pins chat over stale local override'
        );
        const finalMobOrder = await evalJs(`[...document.querySelectorAll('#view-sessions .session-card[data-session-id]')].map((c) => c.dataset.sessionId)`);
        assert.ok(
          finalMobOrder.indexOf('pin-grp-old-pinned') < finalMobOrder.indexOf('pin-grp-new-unpinned'),
          `Newer WS rowPatch pin must re-sort pinned chat above newer unpinned chat: ${JSON.stringify(finalMobOrder)}`
        );
        const ugAfterStaleSnap = await evalJs(`Boolean((window.__theoTestWs.getState()?.rows || []).find((r) => r.id === 'pin-ug-pinned-closed')?.pinned)`);
        assert.strictEqual(ugAfterStaleSnap, false, 'Stale WS state must not resurrect pin on unarchived session');

        // While grp-alpha is collapsed: rowPatch pins second chat -> plural "2 pinned chats", light-theme .ide-group-pin-badge contrast, and long group name ellipsis truncation with 0px overflow
        await evalJs(`document.querySelector('#view-sessions [data-group-act="toggle"][data-group-id="grp-alpha"]')?.click()`);
        for (const s of pinSockets) {
          sendPinWsJson(s, {
            type: 'state',
            deviceId: 'pin-dev-local',
            seq: 3,
            state: {
              generatedAt: futurePinTs + 1000,
              device: { id: 'pin-dev-local', name: 'Pin Local PC' },
              groups: [{ id: 'grp-alpha', name: 'Very Long Project Group Name That Must Truncate Cleanly Beside Pin Badge', color: 'blue', collapsed: true }],
              rows: basePinRows.map((r) => ({ ...r }))
            }
          });
        }
        await waitPinCond(
          () => evalJs(`document.querySelector('#view-sessions [data-session-group="grp-alpha"] .group-title')?.textContent?.includes('Very Long Project Group Name')`),
          'Collapsed long-name grp-alpha rendered before plural rowPatch'
        );
        const pluralPinTs = futurePinTs + 5000;
        for (const s of pinSockets) {
          sendPinWsJson(s, {
            type: 'rowPatch',
            deviceId: 'pin-dev-local',
            seq: 4,
            generatedAt: pluralPinTs,
            upserts: [
              {
                ...basePinRows[1],
                pinned: true,
                pinnedAt: pluralPinTs,
                pinUpdatedAt: pluralPinTs
              }
            ],
            removedIds: [],
            removedKeys: []
          });
        }
        await waitPinCond(
          () => evalJs(`document.querySelector('#view-sessions [data-session-group="grp-alpha"] .group-pin-badge')?.textContent?.trim() === '2'`),
          'Collapsed grp-alpha plural rowPatch updated badge to 2'
        );
        const mobPluralCheck = await evalJs(`(() => {
          document.documentElement.setAttribute('data-theme', 'light');
          const mobBadge = document.querySelector('#view-sessions [data-session-group="grp-alpha"] .group-pin-badge');
          const mobTitle = document.querySelector('#view-sessions [data-session-group="grp-alpha"] .group-title');
          const mobBadgeW = mobBadge ? mobBadge.getBoundingClientRect().width : 0;
          const res = {
            mobText: mobBadge?.textContent?.trim() || '',
            mobTip: mobBadge?.dataset?.microTip || '',
            mobAria: mobBadge?.getAttribute('aria-label') || '',
            mobBadgeColor: mobBadge ? getComputedStyle(mobBadge).color : '',
            mobBadgeW,
            mobTitleTruncates: Boolean(mobTitle && mobTitle.scrollWidth > mobTitle.clientWidth),
            overflowX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
          };
          document.documentElement.setAttribute('data-theme', 'dark');
          return res;
        })()`);
        assert.strictEqual(mobPluralCheck.mobText, '2', 'Plural collapsed Mobile group must render badge "2"');
        assert.strictEqual(mobPluralCheck.mobTip, '2 pinned chats');
        assert.strictEqual(mobPluralCheck.mobAria, '2 pinned chats');
        assert.strictEqual(mobPluralCheck.mobBadgeColor, 'rgb(138, 92, 24)');
        assert.ok(mobPluralCheck.mobBadgeW > 0 && mobPluralCheck.mobTitleTruncates, 'Long group title must truncate cleanly beside Mobile badge');
        assert.strictEqual(mobPluralCheck.overflowX, 0, 'Long collapsed group title + plural pin badge must preserve 0px overflow at 390x844');

        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false }, sessionId);
        const idePluralCheck = await evalJs(`(() => {
          document.documentElement.setAttribute('data-theme', 'light');
          document.querySelector('[data-tab="chat"]')?.click();
          const ideBadge = document.querySelector('#ide-sidebar-tree [data-ide-group="grp-alpha"] .ide-group-pin-badge');
          const ideTitle = document.querySelector('#ide-sidebar-tree [data-ide-group="grp-alpha"] .ide-tree-group-name');
          const res = {
            ideText: ideBadge?.textContent?.trim() || '',
            ideTip: ideBadge?.dataset?.microTip || '',
            ideAria: ideBadge?.getAttribute('aria-label') || '',
            ideBadgeColor: ideBadge ? getComputedStyle(ideBadge).color : '',
            ideBadgeW: ideBadge ? ideBadge.getBoundingClientRect().width : 0,
            ideTitleTruncates: Boolean(ideTitle && ideTitle.scrollWidth > ideTitle.clientWidth)
          };
          document.documentElement.setAttribute('data-theme', 'dark');
          return res;
        })()`);
        assert.strictEqual(idePluralCheck.ideText, '2', 'Plural collapsed IDE group must render badge "2"');
        assert.strictEqual(idePluralCheck.ideTip, '2 pinned chats');
        assert.strictEqual(idePluralCheck.ideAria, '2 pinned chats');
        assert.strictEqual(idePluralCheck.ideBadgeColor, 'rgb(138, 92, 24)', 'Light theme .ide-group-pin-badge must use --brass-deep');
        assert.ok(idePluralCheck.ideBadgeW > 0 && idePluralCheck.ideTitleTruncates, 'Long group title must truncate cleanly beside IDE sidebar badge');
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sessionId);

        // Restore expanded grp-alpha baseline with original name before stream_delta test
        await evalJs(`document.querySelector('#ide-sidebar-tree [data-group-act="toggle"][data-group-id="grp-alpha"]')?.click()`);
        for (const s of pinSockets) {
          sendPinWsJson(s, {
            type: 'state',
            deviceId: 'pin-dev-local',
            seq: 5,
            state: {
              generatedAt: pluralPinTs + 1000,
              device: { id: 'pin-dev-local', name: 'Pin Local PC' },
              groups: [{ id: 'grp-alpha', name: 'Alpha', color: 'blue', collapsed: false }],
              rows: basePinRows.map((r) => ({ ...r }))
            }
          });
        }
        await new Promise((r) => setTimeout(r, 80));

        // Live stream_delta on newer unpinned row must NOT demote pinned chat in Pulse Recent Sessions
        for (const s of pinSockets) {
          sendPinWsJson(s, {
            type: 'stream_delta',
            threadId: 'pin-grp-new-unpinned',
            provider: 'claude',
            status: 'working',
            text: 'Active stream chunk'
          });
        }
        await new Promise((r) => setTimeout(r, 80));
        const pulsePinOrder = await evalJs(`(() => {
          document.querySelector('[data-tab="pulse"]')?.click();
          return [...document.querySelectorAll('#pulse-recent-sessions .session-card[data-session-id]')].map((c) => c.dataset.sessionId);
        })()`);
        assert.ok(
          pulsePinOrder.indexOf('pin-grp-old-pinned') >= 0 &&
            pulsePinOrder.indexOf('pin-grp-old-pinned') < pulsePinOrder.indexOf('pin-grp-new-unpinned'),
          `Pulse #pulse-recent-sessions must keep pinned chat first after stream_delta: ${JSON.stringify(pulsePinOrder)}`
        );

        // Zero-groups boundary + v80->v81 upgrade check: with groups:[] and legacy collapsedSessionGroups.{pinned,ungrouped}:true, both Desktop and Mobile render a flat pinned-first list with zg-pinned visible and zero group or Pinned sections
        pinZeroGroupsMode = true;
        await evalJs(`(() => {
          window.__theoPreReload = 1;
          localStorage.setItem('theo_remote_cache_v3', '{}');
          localStorage.setItem('theo_remote_prefs_v1', JSON.stringify({ collapsedSessionGroups: { pinned: true, ungrouped: true } }));
          location.reload();
          return true;
        })()`);
        await waitPinCond(
          () => evalJs(`Boolean(!window.__theoPreReload && document.readyState === 'complete' && window.__theoTestWs)`),
          'Adversarial #23 zero-groups reload committed'
        );
        await evalJs(`(() => {
          window.__THEO_ALLOW_MOCK_WS = true;
          window.__THEO_MOCK_BRIDGE_TOKEN = 'test-token-hex';
          window.__theoLastQuarantinedCmd = null;
          window.__theoTestWs.connectLocalWs('http://127.0.0.1:${pinPort}', { wsPath: '/ws' });
          return true;
        })()`);
        await waitPinCond(
          () => evalJs(`Boolean(document.querySelector('#ide-sidebar-tree .ide-tree-row[data-ide-open-session="zg-pinned"]'))`),
          'Zero-groups state must render Desktop zg-pinned row'
        );
        const zeroGrpCheck = await evalJs(`(async () => {
          document.querySelector('[data-tab="sessions"]')?.click();
          await new Promise((r) => setTimeout(r, 60));
          return {
            idePinned: Boolean(document.querySelector('#ide-sidebar-tree [data-ide-group="pinned"]')),
            ideUngrouped: Boolean(document.querySelector('#ide-sidebar-tree [data-ide-group="ungrouped"]')),
            ideOrder: [...document.querySelectorAll('#ide-sidebar-tree .ide-tree-row[data-ide-open-session]')].map((el) => el.dataset.ideOpenSession),
            mobPinned: Boolean(document.querySelector('#view-sessions [data-session-group="pinned"]')),
            mobUngrouped: Boolean(document.querySelector('#view-sessions [data-session-group="ungrouped"]')),
            mobOrder: [...document.querySelectorAll('#view-sessions .session-card[data-session-id]')].map((el) => el.dataset.sessionId)
          };
        })()`);
        assert.strictEqual(zeroGrpCheck.idePinned, false, 'Zero-groups boundary must not render Desktop [data-ide-group="pinned"]');
        assert.strictEqual(zeroGrpCheck.ideUngrouped, false, 'Zero-groups boundary must not render Desktop [data-ide-group="ungrouped"]');
        assert.strictEqual(zeroGrpCheck.mobPinned, false, 'Zero-groups boundary must not render Mobile [data-session-group="pinned"]');
        assert.strictEqual(zeroGrpCheck.mobUngrouped, false, 'Zero-groups boundary must not render Mobile [data-session-group="ungrouped"]');
        assert.ok(
          zeroGrpCheck.ideOrder[0] === 'zg-pinned' && zeroGrpCheck.ideOrder.indexOf('zg-unpinned') > 0,
          `Zero-groups boundary must render Desktop flat pinned-first order: ${JSON.stringify(zeroGrpCheck.ideOrder.slice(0, 6))}`
        );
        assert.ok(
          zeroGrpCheck.mobOrder[0] === 'zg-pinned' && zeroGrpCheck.mobOrder.indexOf('zg-unpinned') > 0,
          `Zero-groups boundary must render Mobile flat pinned-first order: ${JSON.stringify(zeroGrpCheck.mobOrder.slice(0, 6))}`
        );

        console.log('[PASS] Adversarial #23: v77 Cross-Device Chat Pinning UI, flat search, 390x844 mobile 0px overflow, Ctrl+K, archive/unarchive auto-unpin & LWW rowPatch verified');
      } finally {
        try { await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false }, sessionId); } catch {}
        try { await evalJs("document.documentElement.setAttribute('data-theme', 'dark')"); } catch {}
        try { await evalJs('window.__theoTestWs?.disconnectAll?.()'); } catch {}
        for (const s of pinSockets) { try { s.destroy(); } catch {} }
        await new Promise((r) => pinWsServer.close(r));
      }
    }

    // Adversarial #24: v88 New Session active-group inheritance, Launchpad × Ungrouped chip, 0px overflow & stream-delta bind
    {
      const nodeCrypto24 = require('crypto');
      const now24 = Date.now();
      const grpSockets = new Set();
      const receivedSendCmds = [];
      const encodeGrpWsFrame = (obj) => {
        const payload = Buffer.from(JSON.stringify(obj), 'utf8');
        const len = payload.length;
        let header;
        if (len < 126) {
          header = Buffer.allocUnsafe(2);
          header[0] = 0x81;
          header[1] = len;
        } else if (len < 65536) {
          header = Buffer.allocUnsafe(4);
          header[0] = 0x81;
          header[1] = 126;
          header.writeUInt16BE(len, 2);
        } else {
          header = Buffer.allocUnsafe(10);
          header[0] = 0x81;
          header[1] = 127;
          header.writeBigUInt64BE(BigInt(len), 2);
        }
        return Buffer.concat([header, payload]);
      };
      const sendGrpWsJson = (sock, obj) => {
        if (!sock || sock.destroyed || !sock.writable) return false;
        sock.write(encodeGrpWsFrame(obj));
        return true;
      };
      const grpWsServer = http.createServer((_req, res) => {
        res.writeHead(404);
        res.end();
      });
      grpWsServer.on('upgrade', (req, socket) => {
        const key = req.headers['sec-websocket-key'];
        if (!key) {
          socket.destroy();
          return;
        }
        const accept = nodeCrypto24
          .createHash('sha1')
          .update(String(key).trim() + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
          .digest('base64');
        socket.write(
          ['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${accept}`, '', ''].join('\r\n')
        );
        grpSockets.add(socket);
        let buf = Buffer.alloc(0);
        socket.on('data', (chunk) => {
          buf = Buffer.concat([buf, chunk]);
          while (buf.length >= 2) {
            const opcode = buf[0] & 0x0f;
            const masked = (buf[1] & 0x80) !== 0;
            let len = buf[1] & 0x7f;
            let offset = 2;
            if (len === 126) {
              if (buf.length < 4) return;
              len = buf.readUInt16BE(2);
              offset = 4;
            } else if (len === 127) {
              if (buf.length < 10) return;
              len = Number(buf.readBigUInt64BE(2));
              offset = 10;
            }
            const totalNeeded = offset + (masked ? 4 : 0) + len;
            if (buf.length < totalNeeded) return;
            const maskKey = masked ? buf.subarray(offset, offset + 4) : null;
            const rawPayload = Buffer.from(buf.subarray(offset + (masked ? 4 : 0), totalNeeded));
            buf = buf.subarray(totalNeeded);
            if (masked && maskKey) for (let i = 0; i < rawPayload.length; i += 1) rawPayload[i] ^= maskKey[i % 4];
            if (opcode === 0x8) { try { socket.end(); } catch {} return; }
            if (opcode === 0x9) {
              if (!socket.destroyed && socket.writable) {
                socket.write(Buffer.concat([Buffer.from([0x8a, Math.min(125, rawPayload.length)]), rawPayload.subarray(0, 125)]));
              }
              continue;
            }
            if (opcode !== 0x1) continue;
            let m;
            try { m = JSON.parse(rawPayload.toString('utf8')); } catch { continue; }
            if (m && (m.type === 'auth' || m.type === 'auth_client')) {
              sendGrpWsJson(socket, {
                type: 'auth_ok',
                role: 'client',
                supportsRowPatch: true,
                seq: 1,
                device: { id: 'grp-dev-local', name: 'Grp Local PC', role: 'host' },
                devices: [{ id: 'grp-dev-local', name: 'Grp Local PC', online: true, local: true }],
                state: {
                  generatedAt: now24,
                  device: { id: 'grp-dev-local', name: 'Grp Local PC' },
                  providers: {
                    antigravity: { available: true, account: { available: true, email: 'agy@example.com' } },
                    claude: { available: true, account: { available: true, email: 'claude@example.com' } }
                  },
                  groups: [{ id: 'grp-alpha', name: 'Alpha Operations Group', color: 'blue', collapsed: false }],
                  rows: [
                    {
                      id: 'grp-sess-1',
                      key: 'grp-sess-1',
                      provider: 'antigravity',
                      title: 'Grouped Session One',
                      status: 'completed',
                      at: now24 - 1000,
                      pinned: false,
                      archived: false,
                      group: 'grp-alpha'
                    },
                    {
                      id: 'ug-sess-1',
                      key: 'ug-sess-1',
                      provider: 'claude',
                      title: 'Ungrouped Session One',
                      status: 'completed',
                      at: now24 - 2000,
                      pinned: false,
                      archived: false,
                      group: null
                    }
                  ]
                }
              });
            } else if (m && m.type === 'ping') {
              sendGrpWsJson(socket, { type: 'pong', echoTs: m.ts });
            }
          }
        });
        socket.on('close', () => grpSockets.delete(socket));
        socket.on('error', () => grpSockets.delete(socket));
      });

      await new Promise((resolve, reject) => {
        grpWsServer.listen(0, '127.0.0.1', resolve);
        grpWsServer.on('error', reject);
      });
      const grpPort = grpWsServer.address().port;

      try {
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 2, mobile: false }, sessionId);
        await evalJs(`(() => {
          localStorage.removeItem('theo_remote_prefs_v1');
          window.__THEO_ALLOW_MOCK_WS = true;
          window.__THEO_MOCK_BRIDGE_TOKEN = 'test-token-hex';
          window.__theoTestWs.connectLocalWs('http://127.0.0.1:${grpPort}', { wsPath: '/ws' });
          document.querySelector('[data-tab="chat"]')?.click();
          return true;
        })()`);

        // Wait for grp-sess-1
        for (let i = 0; i < 60; i += 1) {
          const ready = await evalJs(`Boolean((window.__theoTestWs.getState()?.rows || []).some((r) => r.id === 'grp-sess-1'))`);
          if (ready) break;
          await new Promise((r) => setTimeout(r, 40));
        }

        const grpInheritCheck = await evalJs(`(async () => {
          // Collapse grp-alpha first, then open grp-sess-1
          const p0 = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');
          p0.collapsedSessionGroups = { 'grp-alpha': true };
          localStorage.setItem('theo_remote_prefs_v1', JSON.stringify(p0));
          document.querySelector('#ide-sidebar-tree .ide-tree-row[data-ide-open-session="grp-sess-1"]')?.click();
          await new Promise((r) => setTimeout(r, 40));

          // 1. Click #rail-new-agy -> inherits grp-alpha and uncollapses it
          document.getElementById('rail-new-agy')?.click();
          await new Promise((r) => setTimeout(r, 40));
          const prefsAfterRail = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');
          const lpTitleText1 = document.querySelector('.new-session-launchpad .lp-title')?.textContent || '';
          const clearBtnTitleAttr = document.querySelector('.lp-group-clear-btn')?.getAttribute('title');
          const grpExpanded = !document.querySelector('#ide-sidebar-tree [data-ide-group="grp-alpha"]')?.classList.contains('collapsed');

          // 2. Switch provider on launchpad to Claude -> preserves grp-alpha
          document.querySelector('.new-session-launchpad [data-comp-mode="new-claude"]')?.click();
          await new Promise((r) => setTimeout(r, 30));
          const prefsAfterSwitch = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');

          // 3. Click .ide-tab-add-btn -> preserves grp-alpha
          document.querySelector('.ide-tab-add-btn')?.click();
          await new Promise((r) => setTimeout(r, 30));
          const prefsAfterTabAdd = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');

          // 4. Open grp-sess-1 (verified via command palette & rail instead of removed #chat-session-select)
          document.querySelector('#ide-sidebar-tree .ide-tree-row[data-ide-open-session="grp-sess-1"]')?.click();
          await new Promise((r) => setTimeout(r, 30));

          // 5. Open grp-sess-1, test Ctrl+K new-agy
          document.querySelector('#ide-sidebar-tree .ide-tree-row[data-ide-open-session="grp-sess-1"]')?.click();
          await new Promise((r) => setTimeout(r, 30));
          document.getElementById('open-cmd-palette')?.click();
          await new Promise((r) => setTimeout(r, 30));
          document.querySelector('#cmd-results [data-cmd-act="new-agy"]')?.click();
          await new Promise((r) => setTimeout(r, 30));
          const prefsAfterCmd = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');

          // 6. Click #btn-sess-new-agy from grp-sess-1
          document.querySelector('#ide-sidebar-tree .ide-tree-row[data-ide-open-session="grp-sess-1"]')?.click();
          await new Promise((r) => setTimeout(r, 30));
          document.getElementById('btn-sess-new-agy')?.click();
          await new Promise((r) => setTimeout(r, 30));
          const prefsAfterSessBtn = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');

          // 7. Click × Ungrouped chip -> clears group
          document.querySelector('.lp-group-clear-btn')?.click();
          await new Promise((r) => setTimeout(r, 30));
          const prefsAfterClearBtn = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');

          // 8. Select Ungrouped session, click #rail-new-agy -> stays Ungrouped
          document.querySelector('#ide-sidebar-tree .ide-tree-row[data-ide-open-session="ug-sess-1"]')?.click();
          await new Promise((r) => setTimeout(r, 30));
          document.getElementById('rail-new-agy')?.click();
          await new Promise((r) => setTimeout(r, 30));
          const prefsAfterUg = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');

          // 9. Re-open grp-sess-1 -> #rail-new-agy -> send prompt -> capture quarantined command
          document.querySelector('#ide-sidebar-tree .ide-tree-row[data-ide-open-session="grp-sess-1"]')?.click();
          await new Promise((r) => setTimeout(r, 30));
          document.getElementById('rail-new-agy')?.click();
          await new Promise((r) => setTimeout(r, 30));
          window.__theoLastQuarantinedCmd = null;
          const inp = document.getElementById('composer-input');
          if (inp) {
            inp.value = 'Check group bind';
            inp.dispatchEvent(new Event('input', { bubbles: true }));
          }
          document.getElementById('composer-send-btn')?.click();
          await new Promise((r) => setTimeout(r, 40));
          return {
            afterRail: prefsAfterRail.newSessionGroupId,
            lpTitleText1,
            clearBtnTitleAttr,
            grpExpanded,
            afterSwitch: prefsAfterSwitch.newSessionGroupId,
            afterTabAdd: prefsAfterTabAdd.newSessionGroupId,
            afterCmd: prefsAfterCmd.newSessionGroupId,
            afterSessBtn: prefsAfterSessBtn.newSessionGroupId,
            afterClearBtn: prefsAfterClearBtn.newSessionGroupId,
            afterUg: prefsAfterUg.newSessionGroupId,
            sentCmd: window.__theoLastQuarantinedCmd || null,
            overflow1280: document.documentElement.scrollWidth - window.innerWidth
          };
        })()`);

        assert.strictEqual(grpInheritCheck.afterRail, 'grp-alpha', '#rail-new-agy must inherit grp-alpha');
        assert.ok(grpInheritCheck.lpTitleText1.includes('Alpha Operations Group'), 'Launchpad title must display inherited group name');
        assert.strictEqual(grpInheritCheck.clearBtnTitleAttr, null, '.lp-group-clear-btn must have zero [title]');
        assert.strictEqual(grpInheritCheck.grpExpanded, true, 'Inherited collapsed group must expand in sidebar');
        assert.strictEqual(grpInheritCheck.afterSwitch, 'grp-alpha', 'Switching provider on Launchpad must preserve inherited group');
        assert.strictEqual(grpInheritCheck.afterTabAdd, 'grp-alpha', '.ide-tab-add-btn on Launchpad must preserve inherited group');
        assert.strictEqual(grpInheritCheck.afterCmd, 'grp-alpha', 'Command palette new session must inherit active group');
        assert.strictEqual(grpInheritCheck.afterSessBtn, 'grp-alpha', '#btn-sess-new-agy must inherit active group');
        assert.strictEqual(grpInheritCheck.afterClearBtn, '', 'Clicking × Ungrouped chip must clear inherited group');
        assert.strictEqual(grpInheritCheck.afterUg, '', 'New session from Ungrouped session must stay Ungrouped');
        assert.ok(grpInheritCheck.sentCmd && grpInheritCheck.sentCmd.type === 'send' && grpInheritCheck.sentCmd.newSession === true, 'Send command must be staged for new session');
        assert.strictEqual(grpInheritCheck.sentCmd.group, 'grp-alpha', 'Send command must include group=grp-alpha');
        assert.strictEqual(grpInheritCheck.sentCmd.groupName, 'Alpha Operations Group', 'Send command must include groupName');
        assert.ok(grpInheritCheck.overflow1280 <= 0, `1280px launchpad overflow <= 0 (got ${grpInheritCheck.overflow1280})`);

        for (const s of grpSockets) {
          sendGrpWsJson(s, {
            type: 'stream_delta',
            delta: {
              provider: 'antigravity',
              draftThreadId: grpInheritCheck.sentCmd.draftThreadId || '',
              realThreadId: 'stream-new-grp-1',
              status: 'working',
              prompt: grpInheritCheck.sentCmd.prompt || 'Check group bind',
              text: 'Working in group...',
              deviceId: 'grp-dev-local',
              deviceName: 'Grp Local PC'
            }
          });
        }
        await new Promise((r) => setTimeout(r, 120));
        const boundRowGroup = await evalJs(`(window.__theoTestWs.getState()?.rows || []).find((r) => r.id === 'stream-new-grp-1')?.group || ''`);
        assert.strictEqual(boundRowGroup, 'grp-alpha', 'stream_delta realThreadId must bind directly into inherited group');

        // Mobile & landscape Launchpad overflow checks (390x844 and 740x360) with long group name chip
        for (const vp of [{ width: 390, height: 844, mobile: true }, { width: 740, height: 360, mobile: true }]) {
          await cdp.send('Emulation.setDeviceMetricsOverride', { ...vp, deviceScaleFactor: 2 }, sessionId);
          await new Promise((r) => setTimeout(r, 60));
          const vpCheck = await evalJs(`(() => {
            document.querySelector('#ide-sidebar-tree .ide-tree-row[data-ide-open-session="grp-sess-1"]')?.click();
            document.getElementById('rail-new-agy')?.click();
            return {
              hasChip: Boolean(document.querySelector('.lp-group-clear-btn')),
              overflow: document.documentElement.scrollWidth - window.innerWidth
            };
          })()`);
          assert.strictEqual(vpCheck.hasChip, true, `Launchpad chip visible at ${vp.width}x${vp.height}`);
          assert.ok(vpCheck.overflow <= 0, `Launchpad 0px horizontal overflow at ${vp.width}x${vp.height} (got ${vpCheck.overflow})`);
        }
        console.log('[PASS] Adversarial #24: v88 New Session active-group inheritance, Launchpad × Ungrouped chip, 0px overflow & stream-delta bind verified');
      } finally {
        try { await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false }, sessionId); } catch {}
        try { await evalJs('window.__theoTestWs?.disconnectAll?.()'); } catch {}
        for (const s of grpSockets) { try { s.destroy(); } catch {} }
        await new Promise((r) => grpWsServer.close(r));
      }
    }

    // Zero-secret Memory Vault shortcut check (#rail-vault-btn, #mobile-vault-btn, Command Palette, PIN-lock guard & short desktop rail reachability)
    {
      const vaultCheck = await evalJs(`(async () => {
        const rail = document.getElementById('rail-vault-btn');
        const mob = document.getElementById('mobile-vault-btn');
        document.getElementById('open-cmd-palette')?.click();
        await new Promise((r) => setTimeout(r, 40));
        const cmdInput = document.getElementById('cmd-input');
        if (cmdInput) {
          cmdInput.value = 'Memory Vault';
          cmdInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        await new Promise((r) => setTimeout(r, 40));
        const cmdHasVault = Boolean(document.querySelector('#cmd-results [data-cmd-act="open-memory-vault"]'));
        document.getElementById('cmd-modal')?.setAttribute('hidden', '');

        return {
          railHref: rail?.getAttribute('href') || '',
          railTarget: rail?.getAttribute('target') || '',
          railRel: rail?.getAttribute('rel') || '',
          railTitle: rail?.getAttribute('title'),
          mobHref: mob?.getAttribute('href') || '',
          mobTarget: mob?.getAttribute('target') || '',
          mobRel: mob?.getAttribute('rel') || '',
          mobTitle: mob?.getAttribute('title'),
          cmdHasVault
        };
      })()`);
      assert.strictEqual(vaultCheck.railHref, 'https://memory.husseinbdeir.workers.dev/', 'Desktop #rail-vault-btn must link plainly to Vault with zero secrets');
      assert.strictEqual(vaultCheck.mobHref, 'https://memory.husseinbdeir.workers.dev/', 'Mobile #mobile-vault-btn must link plainly to Vault with zero secrets');
      assert.strictEqual(vaultCheck.railTarget, '_blank');
      assert.strictEqual(vaultCheck.mobTarget, '_blank');
      assert.ok(vaultCheck.railRel.includes('noopener') && vaultCheck.mobRel.includes('noopener') && vaultCheck.mobRel.includes('external'));
      assert.strictEqual(vaultCheck.railTitle, null, '#rail-vault-btn must have zero [title]');
      assert.strictEqual(vaultCheck.mobTitle, null, '#mobile-vault-btn must have zero [title]');
      assert.strictEqual(vaultCheck.cmdHasVault, true, 'Command Palette must list open-memory-vault');

      // Short desktop viewport (1280x500): #ide-explorer-sidebar scrolls cleanly so #ide-sidebar-footer (#btn-palette-picker) is reachable
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 500, deviceScaleFactor: 2, mobile: false }, sessionId);
      await new Promise((r) => setTimeout(r, 80));
      const shortRail = await evalJs(`(() => {
        const side = document.getElementById('ide-explorer-sidebar');
        const footBtn = document.getElementById('btn-palette-picker');
        if (!side || !footBtn) return { ok: false };
        const cs = getComputedStyle(side);
        footBtn.scrollIntoView({ block: 'end' });
        const rect = footBtn.getBoundingClientRect();
        return {
          ok: true,
          overflowY: cs.overflowY,
          bottomAfterScroll: Math.round(rect.bottom),
          vh: window.innerHeight
        };
      })()`);
      assert.strictEqual(shortRail.ok, true);
      assert.strictEqual(shortRail.overflowY, 'auto', 'Short desktop sidebar must allow vertical scroll');
      assert.ok(shortRail.bottomAfterScroll <= shortRail.vh + 2, `Bottom footer button must scroll into view at 1280x500 (${shortRail.bottomAfterScroll} <= ${shortRail.vh})`);

      // Live PIN-locked Vault click & Ctrl+K negative guard
      await evalJs(`localStorage.removeItem('theo_remote_pin_hash_v1'); localStorage.setItem('theo_remote_pin_v1', '2468');`);
      await cdp.send('Page.navigate', { url: `${baseUrl}/?nosse=1` }, sessionId);
      await new Promise((r) => setTimeout(r, 450));
      const lockedVault = await evalJs(`(async () => {
        const origOpen = window.open;
        let openCalls = 0;
        window.open = () => { openCalls++; return null; };
        try {
          const railEvt = new MouseEvent('click', { bubbles: true, cancelable: true });
          const mobEvt = new MouseEvent('click', { bubbles: true, cancelable: true });
          document.getElementById('rail-vault-btn')?.dispatchEvent(railEvt);
          document.getElementById('mobile-vault-btn')?.dispatchEvent(mobEvt);
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
          return {
            railPrevented: railEvt.defaultPrevented,
            mobPrevented: mobEvt.defaultPrevented,
            cmdHidden: document.getElementById('cmd-modal')?.hidden !== false,
            openCalls,
          };
        } finally {
          window.open = origOpen;
        }
      })()`);
      assert.strictEqual(lockedVault.railPrevented, true, 'Locked PIN must preventDefault on #rail-vault-btn click');
      assert.strictEqual(lockedVault.mobPrevented, true, 'Locked PIN must preventDefault on #mobile-vault-btn click');
      assert.strictEqual(lockedVault.cmdHidden, true, 'Locked PIN must block Ctrl+K Command Palette');
      assert.strictEqual(lockedVault.openCalls, 0, 'Locked PIN must not open Vault window');
      await evalJs(`localStorage.removeItem('theo_remote_pin_hash_v1'); localStorage.removeItem('theo_remote_pin_v1');`);
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false }, sessionId);
      await cdp.send('Page.navigate', { url: `${baseUrl}/?nosse=1` }, sessionId);
      await new Promise((r) => setTimeout(r, 350));
      console.log('[PASS] Zero-secret Memory Vault shortcut + PIN-lock guard + 1280x500 rail reachability verified');
    }

    // Adversarial #25: v89 First-class .html / .pdf / .pptx Deliverable Viewer, Wide/Full-Stage, Keyboard/Swipe & 0px Overflow
    {
      const dlvProbe = await evalJs(`(async () => {
        const swText = await fetch('./sw.js', { cache: 'no-store' }).then((r) => r.text());
        const mfJson = await fetch('./manifest.json', { cache: 'no-store' }).then((r) => r.json());
        const swMatch = swText.match(/CACHE_NAME = 'theo-remote-v(\\d+)'/);
        const swVer = swMatch ? Number(swMatch[1]) : 0;
        const mfAllMatched = Array.isArray(mfJson.icons) && mfJson.icons.every((ic) => String(ic.src || '').includes('?v=' + swVer));

        document.querySelector('[data-tab="analytics"]')?.click();
        await new Promise((r) => setTimeout(r, 25));
        const bridgeInp = document.getElementById('input-custom-bridge');
        if (bridgeInp) {
          bridgeInp.value = location.origin;
          document.getElementById('btn-save-bridge')?.click();
          await new Promise((r) => setTimeout(r, 40));
        }
        return { swVer, mfAllMatched };
      })()`);
      assert.ok(dlvProbe.swVer >= 89, `Expected sw.js >= v89 (got v${dlvProbe.swVer})`);
      assert.strictEqual(dlvProbe.mfAllMatched, true, 'manifest.json icons must match sw.js version');

      const chipProbe = await evalJs(`(async () => {
        const mockState = {
          rows: [{
            id: 'sess-dlv-89',
            title: 'Deliverables Demo',
            provider: 'antigravity',
            status: 'completed',
            folder: 'theo',
            updatedAt: Date.now()
          }],
          groups: [],
          workspaces: [{ id: 'theo', name: 'THEO Remote PWA', branch: 'main', dirtyCount: 0 }]
        };
        const stream = document.getElementById('chat-stream');
        // Open sess-v59 or inject test chips directly to verify bare + backtick deliverable rendering
        const firstSess = document.querySelector('#ide-sidebar-tree [data-ide-open-session]');
        if (firstSess) firstSess.click();
        await new Promise((r) => setTimeout(r, 40));

        // Inject synthetic deliverable chips matching formatTurnMarkdown output (on body so renderChatView does not detach them)
        const hostDiv = document.createElement('div');
        hostDiv.id = 'v89-dlv-test-chips';
        hostDiv.innerHTML =
          '<span class="md-file-chip is-clickable" data-preview-file="AEG-boxMind/aeg_clerk_assistant_prototype.html"><span class="md-chip-ico html">HTML</span><span>aeg_clerk_assistant_prototype.html</span></span>' +
          '<span class="md-file-chip is-clickable" data-preview-file="AEG-boxMind/aeg_clerk_assistant_prototype.html:42"><span class="md-chip-ico html">HTML</span><span>aeg_clerk_assistant_prototype.html:42</span></span>' +
          '<span class="md-file-chip is-clickable" data-preview-file="TransRep_AI_Assistant_Work_to_Date_2026-11-26.pptx"><span class="md-chip-ico ppt">PPT</span><span>TransRep_AI_Assistant_Work_to_Date_2026-11-26.pptx</span></span>' +
          '<span class="md-file-chip is-clickable" data-preview-file="TransRep_AI_Assistant_Work_to_Date_2026-11-26.pdf:2"><span class="md-chip-ico pdf">PDF</span><span>TransRep_AI_Assistant_Work_to_Date_2026-11-26.pdf:2</span></span>' +
          '<span class="md-file-chip is-clickable" data-preview-file="deck_err.pdf"><span class="md-chip-ico pdf">PDF</span><span>deck_err.pdf</span></span>';
        document.body.appendChild(hostDiv);

        // 1. Click HTML chip -> opens Preview mode + is-deliverable-wide + sandboxed iframe without allow-same-origin
        hostDiv.querySelector('[data-preview-file$=".html"]')?.click();
        await new Promise((r) => setTimeout(r, 110));
        const pane = document.getElementById('ide-inspector-pane');
        const htmlWide = Boolean(pane?.classList.contains('is-deliverable-wide'));
        const htmlFrame = document.querySelector('#ide-inspector-body iframe.insp-html-frame');
        const htmlSandbox = htmlFrame ? (htmlFrame.getAttribute('sandbox') || '') : '';
        const htmlSrcdocOk = Boolean(htmlFrame && String(htmlFrame.srcdoc || '').includes('Demo Prototype'));

        // Toggle Source & Full Stage
        document.querySelector('#ide-inspector-subbar [data-insp-full-stage="1"]')?.click();
        await new Promise((r) => setTimeout(r, 35));
        const fullStageOn = Boolean(pane?.classList.contains('is-full-stage'));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await new Promise((r) => setTimeout(r, 35));
        const fullStageOffOnEsc = Boolean(pane && !pane.hidden && !pane.classList.contains('is-full-stage'));

        document.querySelector('#ide-inspector-subbar [data-insp-view-mode="source"]')?.click();
        await new Promise((r) => setTimeout(r, 80));
        const sourceRowsVisible = document.querySelectorAll('#ide-inspector-body .insp-code-row').length > 0;

        // Re-click clean HTML chip while Source mode was active -> must stay in live Preview (no flip back to Source)
        hostDiv.querySelector('[data-preview-file$=".html"]')?.click();
        await new Promise((r) => setTimeout(r, 110));
        const htmlPreviewRestored =
          Boolean(document.querySelector('#ide-inspector-body iframe.insp-html-frame')) &&
          document.querySelectorAll('#ide-inspector-body .insp-code-row').length === 0;

        // Click HTML:42 chip -> strips :42 and opens Source at line
        hostDiv.querySelector('[data-preview-file$=".html:42"]')?.click();
        await new Promise((r) => setTimeout(r, 90));
        const htmlLineSourceOk = (document.querySelector('#ide-inspector-subbar .insp-sub-path-txt')?.textContent || '').includes('#L42');

        // 2. Click PDF:2 chip -> opens Preview Page 1 / 3 (verifies :line suffix strip + PDF forces Preview mode)
        hostDiv.querySelector('[data-preview-file$=".pdf:2"]')?.click();
        await new Promise((r) => setTimeout(r, 100));
        const pdfPageLabel = document.querySelector('#ide-inspector-body .insp-deliverable-label')?.textContent || '';

        // 3. Click PPTX chip -> opens Slide 1 / 3 + Next advances to Slide 2 / 3 + All Pages renders all 3 cards cleanly
        hostDiv.querySelector('[data-preview-file$=".pptx"]')?.click();
        await new Promise((r) => setTimeout(r, 100));
        const slide1Text = document.querySelector('#ide-inspector-body .insp-deliverable-label')?.textContent || '';
        document.querySelector('#ide-inspector-body [data-insp-dlv-page="2"]')?.click();
        await new Promise((r) => setTimeout(r, 100));
        const slide2Text = document.querySelector('#ide-inspector-body .insp-deliverable-label')?.textContent || '';

        document.querySelector('#ide-inspector-body [data-insp-dlv-deck-mode="all"]')?.click();
        let allSlideImgs = 0;
        let allStillRendering = true;
        for (let w = 0; w < 12; w++) {
          await new Promise((r) => setTimeout(r, 45));
          allSlideImgs = document.querySelectorAll('#ide-inspector-body .insp-page-card img').length;
          allStillRendering = (document.getElementById('ide-inspector-body')?.textContent || '').includes('Rendering');
          if (allSlideImgs === 3 && !allStillRendering) break;
        }
        document.querySelector('#ide-inspector-body [data-insp-dlv-deck-mode="single"]')?.click();
        await new Promise((r) => setTimeout(r, 40));

        // 4. Negative: All Pages partial page failure (deck_err.pdf page 2 = 500) must NOT loop or poison deliverablePreviewCache
        let errPage2Fetches = 0;
        const origFetchDlv = window.fetch;
        window.fetch = async (url, init) => {
          const s = String(url || '');
          if (s.includes('/api/deliverable-preview') && s.includes('deck_err') && s.includes('page=2')) {
            errPage2Fetches += 1;
          }
          return origFetchDlv(url, init);
        };
        let errStageImgs = 0;
        let errHasErrorMsg = false;
        let errStillRendering = true;
        let errPage2FetchesBeforeArrow = 0;
        let errLabelAfterArrow = '';
        try {
          hostDiv.querySelector('[data-preview-file="deck_err.pdf"]')?.click();
          await new Promise((r) => setTimeout(r, 100));
          document.querySelector('#ide-inspector-body [data-insp-dlv-deck-mode="all"]')?.click();
          await new Promise((r) => setTimeout(r, 260));
          errPage2FetchesBeforeArrow = errPage2Fetches;
          errStageImgs = document.querySelectorAll('#ide-inspector-body .insp-page-card img').length;
          const errBodyTxt = document.getElementById('ide-inspector-body')?.textContent || '';
          errHasErrorMsg = errBodyTxt.includes('Page 2 failed to rasterize');
          errStillRendering = errBodyTxt.includes('Rendering');
          document.querySelector('#ide-inspector-body [data-insp-dlv-deck-mode="single"]')?.click();
          await new Promise((r) => setTimeout(r, 40));
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
          await new Promise((r) => setTimeout(r, 50));
          errLabelAfterArrow = document.querySelector('#ide-inspector-body .insp-deliverable-label')?.textContent || '';
        } finally {
          window.fetch = origFetchDlv;
        }

        // Leave HTML deliverable open for mobile viewport + Full-Stage bbox checks
        hostDiv.querySelector('[data-preview-file$=".html"]')?.click();
        await new Promise((r) => setTimeout(r, 100));

        const desktopOverflow = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
        const titleCount = document.querySelectorAll('[title]').length;
        hostDiv.remove();
        return {
          htmlWide,
          htmlSandbox,
          htmlSrcdocOk,
          fullStageOn,
          fullStageOffOnEsc,
          sourceRowsVisible,
          htmlPreviewRestored,
          htmlLineSourceOk,
          pdfPageLabel,
          slide1Text,
          slide2Text,
          allSlideImgs,
          allStillRendering,
          errPage2FetchesBeforeArrow,
          errPage2Fetches,
          errStageImgs,
          errHasErrorMsg,
          errStillRendering,
          errLabelAfterArrow,
          desktopOverflow,
          titleCount
        };
      })()`);

      assert.strictEqual(chipProbe.htmlWide, true, 'HTML preview must apply .is-deliverable-wide');
      assert.strictEqual(chipProbe.htmlSandbox.includes('allow-same-origin'), false, 'HTML sandbox must NOT grant allow-same-origin');
      assert.strictEqual(chipProbe.htmlSrcdocOk, true, 'HTML iframe must render srcdoc');
      assert.strictEqual(chipProbe.fullStageOn, true, 'Full Stage toggle must add .is-full-stage');
      assert.strictEqual(chipProbe.fullStageOffOnEsc, true, 'First Escape must exit Full Stage cleanly');
      assert.strictEqual(chipProbe.sourceRowsVisible, true, 'Source toggle must show code rows');
      assert.strictEqual(chipProbe.htmlPreviewRestored, true, 'Clicking .html chip from Source mode must restore HTML Preview without flipping back');
      assert.strictEqual(chipProbe.htmlLineSourceOk, true, 'Clicking .html:42 chip must strip :42 into #L42 Source view');
      assert.ok(chipProbe.pdfPageLabel.includes('Page 1 / 3'), `Expected PDF chip .pdf:2 label, got ${chipProbe.pdfPageLabel}`);
      assert.ok(chipProbe.slide1Text.includes('Slide 1 / 3'), `Expected Slide 1 / 3, got ${chipProbe.slide1Text}`);
      assert.ok(chipProbe.slide2Text.includes('Slide 2 / 3'), `Expected Slide 2 / 3, got ${chipProbe.slide2Text}`);
      assert.strictEqual(chipProbe.allSlideImgs, 3, `All Pages mode must render all 3 slide images (got ${chipProbe.allSlideImgs})`);
      assert.strictEqual(chipProbe.allStillRendering, false, 'All Pages mode must settle without leftover Rendering placeholders');
      assert.strictEqual(chipProbe.errPage2FetchesBeforeArrow, 1, `Partial All Pages failure must fetch failed page 2 at most once before manual retry (got ${chipProbe.errPage2FetchesBeforeArrow})`);
      assert.ok(chipProbe.errPage2Fetches <= 2, `Total fetches including manual ArrowRight retry must remain bounded (got ${chipProbe.errPage2Fetches})`);
      assert.strictEqual(chipProbe.errStageImgs, 2, `Partial All Pages failure must render pages 1 & 3 (got ${chipProbe.errStageImgs})`);
      assert.strictEqual(chipProbe.errHasErrorMsg, true, 'Failed page 2 card must show server error message');
      assert.strictEqual(chipProbe.errStillRendering, false, 'Failed page 2 must NOT stay stuck on Rendering placeholder');
      assert.ok(chipProbe.errLabelAfterArrow.includes('Page 2 / 3'), `ArrowRight must retain unpoisoned 3-page metadata, got ${chipProbe.errLabelAfterArrow}`);
      assert.strictEqual(chipProbe.desktopOverflow, 0, `Desktop deliverable viewer overflow must be 0 (got ${chipProbe.desktopOverflow})`);
      assert.strictEqual(chipProbe.titleCount, 0, 'Deliverable viewer must have 0 native [title] attributes');

      // Mobile 390x844 & 844x390 bottom-sheet + Full-Stage bbox & 0px overflow checks while HTML deliverable is open
      for (const vp of [{ width: 390, height: 844, mobile: true }, { width: 844, height: 390, mobile: true }]) {
        await cdp.send('Emulation.setDeviceMetricsOverride', { ...vp, deviceScaleFactor: 2 }, sessionId);
        await new Promise((r) => setTimeout(r, 70));
        const mobSheet = await evalJs(`(() => {
          const ov = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
          const fr = document.querySelector('#ide-inspector-body iframe.insp-html-frame');
          const r = fr ? fr.getBoundingClientRect() : null;
          document.querySelector('#ide-inspector-subbar [data-insp-full-stage="1"]')?.click();
          const fsRect = fr ? fr.getBoundingClientRect() : null;
          const fsOv = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
          document.querySelector('#ide-inspector-subbar [data-insp-full-stage="1"]')?.click();
          return {
            ov,
            fsOv,
            w: r ? Math.round(r.width) : 0,
            h: r ? Math.round(r.height) : 0,
            rightOk: r ? r.right <= window.innerWidth + 1 : false,
            fsW: fsRect ? Math.round(fsRect.width) : 0,
            fsH: fsRect ? Math.round(fsRect.height) : 0,
            fsRightOk: fsRect ? fsRect.right <= window.innerWidth + 1 : false
          };
        })()`);
        assert.strictEqual(mobSheet.ov, 0, `Bottom-sheet overflow at ${vp.width}x${vp.height} must be 0 (got ${mobSheet.ov})`);
        assert.strictEqual(mobSheet.fsOv, 0, `Full-stage overflow at ${vp.width}x${vp.height} must be 0 (got ${mobSheet.fsOv})`);
        assert.ok(mobSheet.w > 200 && mobSheet.h > 150 && mobSheet.rightOk, `Mobile HTML iframe bbox invalid at ${vp.width}x${vp.height}: ${JSON.stringify(mobSheet)}`);
        assert.ok(mobSheet.fsW > 200 && mobSheet.fsH > 150 && mobSheet.fsRightOk, `Mobile Full-Stage HTML iframe bbox invalid at ${vp.width}x${vp.height}: ${JSON.stringify(mobSheet)}`);
      }
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false }, sessionId);
      await evalJs(`document.getElementById('btn-close-inspector')?.click()`);
      console.log('[PASS] Adversarial #25: v89 First-class .html/.pdf/.pptx Deliverable Viewer, Wide/Full-Stage & 0px overflow verified');
    }

    // --- Adversarial #26: v90 Live Model Catalog Replacement, 0-Effort Orchestrator, XHigh, modelUpdatedAt LWW, .session-neon-pill & isabi-app default ---
    {
      await evalJs(`(() => {
        const now = Date.now();
        const rawCache = JSON.parse(localStorage.getItem('theo_remote_cache_v3') || '{}');
        const snap = rawCache.snapshot || rawCache.state || {};
        snap.antigravityModelCatalog = {
          updatedAt: now,
          source: 'live-rpc',
          activeDefaultModelId: 'MODEL_PLACEHOLDER_M667',
          activeDefaultLabel: 'Orchestrator (Carbon)',
          orchestratorPlannerModelId: 'MODEL_PLACEHOLDER_M427',
          models: [
            { modelId: 'MODEL_PLACEHOLDER_M667', slugId: 'orchestrator-carbon', label: 'Orchestrator (Carbon)', baseLabel: 'Orchestrator (Carbon)', isOrchestrator: true, isFirstPartyGemini: true, supportsThinking: false, inClientPicker: true, sortOrder: 0, maxContextTokens: 512000 },
            { modelId: 'MODEL_PLACEHOLDER_M427', slugId: 'gemini-4-carbon-high', label: 'Gemini 4 Carbon (High)', baseLabel: 'Gemini 4 Carbon', isFirstPartyGemini: true, supportsThinking: true, effortTier: 'high', inClientPicker: true, sortOrder: 1, tagTitle: 'New', maxContextTokens: 512000 },
            { modelId: 'MODEL_PLACEHOLDER_M437', slugId: 'gemini-4-carbon-medium', label: 'Gemini 4 Carbon (Medium)', baseLabel: 'Gemini 4 Carbon', isFirstPartyGemini: true, supportsThinking: true, effortTier: 'medium', inClientPicker: true, sortOrder: 2, tagTitle: 'New', maxContextTokens: 512000 },
            { modelId: 'MODEL_PLACEHOLDER_M528', slugId: 'gemini-4-hydrogen-xhigh', label: 'Gemini 4 Hydrogen (XHigh)', baseLabel: 'Gemini 4 Hydrogen', isFirstPartyGemini: true, supportsThinking: true, effortTier: 'xhigh', inClientPicker: true, sortOrder: 3, maxContextTokens: 512000 },
            { modelId: 'MODEL_PLACEHOLDER_M525', slugId: 'gemini-4-hydrogen-high', label: 'Gemini 4 Hydrogen (High)', baseLabel: 'Gemini 4 Hydrogen', isFirstPartyGemini: true, supportsThinking: true, effortTier: 'high', inClientPicker: true, sortOrder: 4, maxContextTokens: 512000 },
            { modelId: 'MODEL_PLACEHOLDER_M417', slugId: 'gemini-4-argon-high', label: 'Gemini 4 Argon (High)', baseLabel: 'Gemini 4 Argon', isFirstPartyGemini: true, supportsThinking: true, effortTier: 'high', inClientPicker: true, sortOrder: 5, tagTitle: 'Leaving Soon', maxContextTokens: 512000 },
            { modelId: 'MODEL_PLACEHOLDER_M301', slugId: 'fast-lite-medium', label: 'Fast Lite (Medium)', baseLabel: 'Fast Lite (Medium)', isFirstPartyGemini: false, supportsThinking: false, inClientPicker: true, sortOrder: 6, maxContextTokens: 256000 },
            { modelId: 'MODEL_PLACEHOLDER_M532', slugId: 'gemini-4-neon-high', label: 'Gemini 4 Neon (High)', baseLabel: 'Gemini 4 Neon', isFirstPartyGemini: true, isNeon: true, supportsThinking: true, effortTier: 'high', inClientPicker: true, sortOrder: 7, maxContextTokens: 512000 }
          ]
        };
        snap.claudeModelCatalog = {
          updatedAt: now,
          sourceKind: 'vscode-extension',
          sourceVersion: '2.1.332',
          activeDefaultModelId: 'claude-opus-5-5',
          activeDefaultLabel: 'Claude Opus 5.5',
          models: [
            { modelId: 'claude-opus-5-5', slugId: 'claude-opus-5-5', family: 'opus', label: 'Claude Opus 5.5', displayName: 'Opus 5.5', defaultEffort: 'high', efforts: ['low', 'medium', 'high', 'xhigh'], supportsThinking: true, supportsXHigh: true, supports1m: true, contextLimit: 1000000, inClientPicker: true, isLatest: true, tagTitle: '1M' },
            { modelId: 'claude-fable-5-2', slugId: 'claude-fable-5-2', family: 'fable', label: 'Fable 5.2', displayName: 'Fable 5.2', defaultEffort: 'medium', efforts: ['low', 'medium', 'high', 'xhigh'], supportsThinking: true, supportsXHigh: true, supports1m: true, contextLimit: 1000000, inClientPicker: true, isLatest: true },
            { modelId: 'claude-sonnet-5-5', slugId: 'claude-sonnet-5-5', family: 'sonnet', label: 'Claude Sonnet 5.5', displayName: 'Sonnet 5.5', defaultEffort: 'medium', efforts: ['low', 'medium', 'high', 'xhigh'], supportsThinking: true, supportsXHigh: true, supports1m: true, contextLimit: 1000000, inClientPicker: true, isLatest: true },
            { modelId: 'claude-haiku-5-5', slugId: 'claude-haiku-5-5', family: 'haiku', label: 'Claude Haiku 5.5', displayName: 'Haiku 5.5', defaultEffort: 'medium', efforts: ['low', 'medium', 'high', 'xhigh'], supportsThinking: true, supportsXHigh: true, supports1m: true, contextLimit: 1000000, inClientPicker: true, isLatest: true }
          ]
        };
        snap.rows = Array.isArray(snap.rows) ? snap.rows.filter((r) => r && r.id !== 'sess-v90-neon' && r.id !== 'sess-v90-lww' && r.id !== 'sess-v90-claude') : [];
        snap.rows.unshift(
          {
            id: 'sess-v90-neon',
            key: 'sess-v90-neon',
            title: 'Neon Active Session',
            provider: 'antigravity',
            model: 'Gemini 4 Neon (High)',
            modelUpdatedAt: now - 1000,
            neonWarning: true,
            folder: 'isabi-app',
            status: 'completed',
            usedTokens: 120000,
            limitTokens: 512000,
            at: now - 500
          },
          {
            id: 'sess-v90-lww',
            key: 'sess-v90-lww',
            title: 'Server Newer Model Session',
            provider: 'antigravity',
            model: 'Gemini 4 Hydrogen (XHigh)',
            modelUpdatedAt: now + 60000,
            folder: 'isabi-app',
            status: 'completed',
            usedTokens: 90000,
            limitTokens: 512000,
            at: now - 600
          },
          {
            id: 'sess-v90-claude',
            key: 'sess-v90-claude',
            title: 'Claude Live Catalog Session',
            provider: 'claude',
            model: 'Claude Sonnet 5.5',
            modelUpdatedAt: now,
            folder: 'isabi-app',
            status: 'completed',
            usedTokens: 80000,
            limitTokens: 1000000,
            at: now - 700
          }
        );
        rawCache.snapshot = snap;
        rawCache.state = snap;
        rawCache.threads = rawCache.threads || {};
        rawCache.threads['sess-v90-lww'] = { id: 'sess-v90-lww', provider: 'antigravity', model: 'Gemini 4 Hydrogen (XHigh)', modelUpdatedAt: now + 60000, messages: [{ id: 'v90-1', role: 'user', text: 'Check LWW', createdAt: new Date(now - 600).toISOString() }] };
        rawCache.threads['sess-v90-neon'] = { id: 'sess-v90-neon', provider: 'antigravity', model: 'Gemini 4 Neon (High)', modelUpdatedAt: now - 1000, messages: [{ id: 'v90-2', role: 'user', text: 'Check Neon switch', createdAt: new Date(now - 500).toISOString() }] };
        rawCache.threads['sess-v90-claude'] = { id: 'sess-v90-claude', provider: 'claude', model: 'Claude Sonnet 5.5', modelUpdatedAt: now, messages: [{ id: 'v90-3', role: 'user', text: 'Check Claude 5.5', createdAt: new Date(now - 700).toISOString() }] };
        localStorage.setItem('theo_remote_cache_v3', JSON.stringify(rawCache));
        localStorage.removeItem('theo_remote_outbox_v1');
        try { sessionStorage.removeItem('theo_pinned_nav_v1'); } catch {}
        const prefs = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');
        delete prefs.selectedRepoId;
        prefs.customBridgeUrl = '';
        prefs.edgeRelayUrl = '';
        prefs.cloudUrl = '';
        prefs.activeTab = 'chat';
        prefs.sidebarFilter = 'all';
        prefs.collapsedSessionGroups = {};
        prefs.selectedThreadId = 'sess-v90-lww';
        prefs.composerMode = 'reply';
        prefs.threadModelConfig = {
          'sess-v90-lww': { modelId: 'gemini-4-argon', effort: 'low', provider: 'antigravity', updatedAt: now - 60000 }
        };
        localStorage.setItem('theo_remote_prefs_v1', JSON.stringify(prefs));
      })()`);
      await cdp.send('Page.navigate', { url: `${baseUrl}/?nosse=1` }, sessionId);
      await new Promise((r) => setTimeout(r, 650));

      const v90Probe = await evalJs(`(async () => {
        const bootPrefs = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');
        const lwwModelPill = document.getElementById('composer-model-label')?.textContent?.trim() || '';
        document.getElementById('composer-model-btn')?.click();
        await new Promise((r) => setTimeout(r, 30));
        const agyPickerHtml = document.getElementById('model-picker-body')?.innerHTML || '';
        const agyOrchButtons = document.querySelectorAll('#model-picker-body [data-select-ai-model="orchestrator-carbon"]').length;
        const hasLeavingSoonTag = Boolean(document.querySelector('#model-picker-body .vs-model-item-tag.tag-leaving'));
        const hasXHighOption = Boolean(document.querySelector('#model-picker-body [data-select-model-combo="gemini-4-hydrogen:xhigh"]'));
        // Click 0-effort Orchestrator (Carbon) and verify no fake effort bar / no (High) suffix
        document.querySelector('#model-picker-body [data-select-model-combo="orchestrator-carbon:"]')?.click();
        await new Promise((r) => setTimeout(r, 30));
        const orchSelectedPill = document.getElementById('composer-model-label')?.textContent?.trim() || '';
        document.getElementById('composer-model-btn')?.click();
        await new Promise((r) => setTimeout(r, 30));
        const effortBarHiddenOnZeroTier = document.querySelector('#model-picker-body .vs-model-effort-bar') === null;
        document.getElementById('composer-model-btn')?.click();

        // Verify 0-effort non-thinking single-tier model with (Medium) in label hides effort bar
        document.getElementById('composer-model-btn')?.click();
        await new Promise((r) => setTimeout(r, 30));
        const fastLiteButtons = document.querySelectorAll('#model-picker-body [data-select-ai-model="fast-lite"]').length;
        document.querySelector('#model-picker-body [data-select-model-combo="fast-lite:"]')?.click();
        await new Promise((r) => setTimeout(r, 30));
        document.getElementById('composer-model-btn')?.click();
        await new Promise((r) => setTimeout(r, 30));
        const effortBarHiddenOnNonThinkingSingle = document.querySelector('#model-picker-body .vs-model-effort-bar') === null;
        document.getElementById('composer-model-btn')?.click();

        // Check Claude session live catalog replacement
        document.querySelector('.ide-tree-row[data-ide-open-session="sess-v90-claude"]')?.click();
        await new Promise((r) => setTimeout(r, 40));
        document.getElementById('composer-model-btn')?.click();
        await new Promise((r) => setTimeout(r, 30));
        const claudePickerHtml = document.getElementById('model-picker-body')?.innerHTML || '';
        document.querySelector('#model-picker-body [data-select-model-combo="claude-fable-5-2:xhigh"]')?.click();
        await new Promise((r) => setTimeout(r, 30));
        const claudeSelectedPill = document.getElementById('composer-model-label')?.textContent?.trim() || '';

        // Check Neon pill in Sessions cards 1-tap switch + tree + chat header 1-tap switch to Carbon
        const treeNeonPillPresent = Boolean(document.querySelector('.ide-tree-row[data-ide-open-session="sess-v90-neon"] .session-neon-pill'));
        document.querySelector('[data-tab="sessions"]')?.click();
        await new Promise((r) => setTimeout(r, 50));
        const cardNeonBefore = Boolean(document.querySelector('.session-card[data-session-id="sess-v90-neon"] .session-neon-pill'));
        document.querySelector('.session-card[data-session-id="sess-v90-neon"] [data-switch-neon-carbon]')?.click();
        await new Promise((r) => setTimeout(r, 50));
        const cardNeonAfter = Boolean(document.querySelector('.session-card[data-session-id="sess-v90-neon"] .session-neon-pill'));
        document.querySelector('[data-tab="chat"]')?.click();
        await new Promise((r) => setTimeout(r, 40));
        // Switch back to chat header test with a second Neon click (restore Neon via picker first on sess-v90-lww, or verify chat header synced)
        document.querySelector('.ide-tree-row[data-ide-open-session="sess-v90-neon"]')?.click();
        await new Promise((r) => setTimeout(r, 40));
        const chatNeonPillHiddenAfter = document.getElementById('chat-neon-pill')?.hidden === true;
        const postNeonPillText = document.getElementById('composer-model-label')?.textContent?.trim() || '';
        const outboxAfter = JSON.parse(localStorage.getItem('theo_remote_outbox_v1') || '[]');
        const neonSwitchCmd =
          (window.__theoLastQuarantinedCmd &&
          window.__theoLastQuarantinedCmd.subAction === 'setModel' &&
          (window.__theoLastQuarantinedCmd.sessionId === 'sess-v90-neon' ||
            window.__theoLastQuarantinedCmd.threadId === 'sess-v90-neon')
            ? window.__theoLastQuarantinedCmd
            : null) ||
          [...outboxAfter].reverse().find((c) => c && c.subAction === 'setModel' && (c.sessionId === 'sess-v90-neon' || c.threadId === 'sess-v90-neon')) ||
          null;
        return {
          defaultRepoId: bootPrefs.selectedRepoId,
          lwwModelPill,
          agyOrchButtons,
          fastLiteButtons,
          effortBarHiddenOnNonThinkingSingle,
          hasLeavingSoonTag,
          hasXHighOption,
          hasGemini38FallbackInLiveAgy: agyPickerHtml.includes('Gemini 3.8 Flash'),
          orchSelectedPill,
          effortBarHiddenOnZeroTier,
          hasOpus55: claudePickerHtml.includes('Claude Opus 5.5'),
          hasFable52: claudePickerHtml.includes('Fable 5.2'),
          hasOpus47Fallback: claudePickerHtml.includes('Opus 4.7'),
          claudeSelectedPill,
          treeNeonPillPresent,
          cardNeonBefore,
          cardNeonAfter,
          chatNeonPillHiddenAfter,
          postNeonPillText,
          neonSwitchCmdModel: neonSwitchCmd?.model || '',
          titleCount: document.querySelectorAll('[title]').length,
          overflowX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
        };
      })()`);
      assert.strictEqual(v90Probe.defaultRepoId, 'isabi-app', 'Default selectedRepoId must be isabi-app');
      assert.strictEqual(v90Probe.lwwModelPill, 'Gemini 4 Hydrogen (XHigh)', 'Newer server modelUpdatedAt must beat stale prefs.threadModelConfig');
      assert.strictEqual(v90Probe.agyOrchButtons, 1, '0-effort Orchestrator (Carbon) must render exactly one single-tier item');
      assert.strictEqual(v90Probe.fastLiteButtons, 1, '0-effort non-thinking model must render one single-tier item');
      assert.strictEqual(v90Probe.effortBarHiddenOnNonThinkingSingle, true, 'Effort bar must hide for non-thinking model even when label has (Medium)');
      assert.strictEqual(v90Probe.hasLeavingSoonTag, true, 'Upstream tagTitle Leaving Soon badge must render');
      assert.strictEqual(v90Probe.hasXHighOption, true, 'XHigh effort tier must render for Hydrogen');
      assert.strictEqual(v90Probe.hasGemini38FallbackInLiveAgy, false, 'Live Antigravity catalog must completely replace static fallback list');
      assert.strictEqual(v90Probe.orchSelectedPill, 'Orchestrator (Carbon)', '0-effort Orchestrator must not get a fake (High) suffix');
      assert.strictEqual(v90Probe.effortBarHiddenOnZeroTier, true, 'Effort bar must hide for 0-effort single-tier models');
      assert.strictEqual(v90Probe.hasOpus55 && v90Probe.hasFable52, true, 'Live Claude catalog models must render in picker');
      assert.strictEqual(v90Probe.hasOpus47Fallback, false, 'Live Claude catalog must replace static fallback list');
      assert.strictEqual(v90Probe.claudeSelectedPill, 'Fable 5.2 (XHigh)', 'Claude Fable 5.2 XHigh must be selectable');
      assert.strictEqual(v90Probe.treeNeonPillPresent, true, 'Neon session must surface .session-neon-pill in tree');
      assert.strictEqual(v90Probe.cardNeonBefore, true, 'Sessions card must render .session-neon-pill before switch');
      assert.strictEqual(v90Probe.cardNeonAfter, false, 'Sessions card 1-tap Neon switch must immediately re-render card without Neon pill');
      assert.strictEqual(v90Probe.chatNeonPillHiddenAfter, true, '1-tap Neon switch to Carbon must hide #chat-neon-pill');
      assert.strictEqual(v90Probe.postNeonPillText, 'Gemini 4 Carbon (High)', '1-tap Neon switch must select Gemini 4 Carbon (High)');
      assert.strictEqual(v90Probe.neonSwitchCmdModel, 'MODEL_PLACEHOLDER_M427', '1-tap Neon switch must enqueue M427 Carbon setModel command');
      assert.strictEqual(v90Probe.titleCount, 0);
      assert.strictEqual(v90Probe.overflowX, 0);

      // Verify reload preserves dynamic XHigh choice on sess-v90-claude via cachedStore pre-sanitization hydration
      await cdp.send('Page.navigate', { url: `${baseUrl}/?nosse=1` }, sessionId);
      const navDeadline = Date.now() + 5000;
      while (Date.now() < navDeadline) {
        const ready = await evalJs(`Boolean(document.getElementById('view-chat')?.classList.contains('active') && document.getElementById('ctx-pill-label')?.textContent?.trim() && document.getElementById('ctx-pill-label').textContent.trim() !== '0 / 512k · 0%')`);
        if (ready) break;
        await new Promise((r) => setTimeout(r, 80));
      }
      await new Promise((r) => setTimeout(r, 60));
      const postReloadClaude = await evalJs(`(() => {
        document.querySelector('.ide-tree-row[data-ide-open-session="sess-v90-claude"]')?.click();
        return document.getElementById('composer-model-label')?.textContent?.trim() || '';
      })()`);
      assert.strictEqual(postReloadClaude, 'Fable 5.2 (XHigh)', 'Reload must preserve live dynamic Fable 5.2 (XHigh) selection');

      // Verify fresh browser WITHOUT initial prefs.selectedModelByProvider auto-aligns when live catalogs arrive
      await evalJs(`(() => {
        localStorage.removeItem('theo_remote_prefs_v1');
      })()`);
      await cdp.send('Page.navigate', { url: `${baseUrl}/?nosse=1` }, sessionId);
      await new Promise((r) => setTimeout(r, 550));
      const freshAutoAlign = await evalJs(`(() => {
        const p = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');
        return {
          agy: p.selectedModelByProvider?.antigravity || '',
          claude: p.selectedModelByProvider?.claude || ''
        };
      })()`);
      assert.strictEqual(freshAutoAlign.agy, 'orchestrator-carbon', 'Fresh browser must auto-align to live default Orchestrator (Carbon)');
      assert.strictEqual(freshAutoAlign.claude, 'claude-opus-5-5', 'Fresh browser must auto-align to live default Claude Opus 5.5');
      console.log('[PASS] Adversarial #26: v90 Live Model Catalog Replacement, 0-Effort Orchestrator, XHigh, LWW, Neon 1-tap Carbon & isabi-app default verified');
    }

    // --- Adversarial #27: Phase 2 (1:1 Sidebar Accounts, Quota Bars, Reconciler, Inline Rename, Host Health) + Ext #1 ---
    {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 1280,
        height: 820,
        deviceScaleFactor: 1,
        mobile: false
      }, sessionId);
      await evalJs(`(() => {
        const now = Date.now();
        const rawCache = JSON.parse(localStorage.getItem('theo_remote_cache_v3') || '{"threads":{}}');
        rawCache.threads = rawCache.threads || {};
        rawCache.threads['v91-s1'] = { id: 'v91-s1', provider: 'antigravity', model: 'Gemini 4 Carbon (High)', messages: [{ id: 'm1', role: 'user', text: 'Phase 2 check', createdAt: new Date(now - 5000).toISOString() }] };
        const snap = {
          generatedAt: now,
          hideClaudeDesktop: false,
          hideThirdPartyQuota: false,
          accountOrder: ['antigravity:p2-a@example.com', 'claude:p2-c@example.com'],
          groups: [{ id: 'v91-grp', name: 'Sprint V91', collapsed: false }],
          devices: [
            {
              id: 'p2-dev',
              name: 'StudioPC',
              online: true,
              local: true,
              sessionCount: 4,
              pwaReady: { ok: true, signIn: true, vscodeOpen: true },
              pcSetup: { ok: false, okCount: 6, totalCount: 8, pendingCount: 2, pendingTitles: ['Sync scripts', 'Bridge'] },
              hostHealth: {
                hotSwapHold: { held: true, stage: 'canary', file: 'extension.js', error: 'Hold check test' },
                autoReload: { pending: true, state: 'failed', reasons: ['Bundle updated'], failure: { firstAt: now } },
                skipMessage: 'Skipped 1 patch notice test'
              }
            }
          ],
          pcSetup: { ok: false, okCount: 6, totalCount: 8, pendingCount: 2, pendingTitles: ['Sync scripts', 'Bridge'] },
          hotSwapHold: { held: true, stage: 'canary', file: 'extension.js', error: 'Hold check test' },
          autoReload: { pending: true, state: 'failed', reasons: ['Bundle updated'], failure: { firstAt: now } },
          bridge: { active: true, skipMessage: 'Skipped 1 patch notice test' },
          pendingAccountLogin: { active: true, provider: 'claude', label: 'Team', message: 'Waiting for verification', awaitingVerification: true },
          antigravityModelCatalog: {
            source: 'live-rpc',
            updatedAt: now,
            activeDefaultModelId: 'MODEL_PLACEHOLDER_M427',
            activeDefaultLabel: 'Gemini 4 Carbon (High)',
            models: [
              { modelId: 'MODEL_PLACEHOLDER_M427', slugId: 'gemini-4-carbon-high', label: 'Gemini 4 Carbon (High)', baseLabel: 'Gemini 4 Carbon', isFirstPartyGemini: true, supportsThinking: true, effortTier: 'high', inClientPicker: true, sortOrder: 0, maxContextTokens: 512000, quotaRemainingFraction: 0.72 },
              { modelId: 'MODEL_PLACEHOLDER_M525', slugId: 'gemini-4-hydrogen-high', label: 'Gemini 4 Hydrogen (High)', baseLabel: 'Gemini 4 Hydrogen', isFirstPartyGemini: true, supportsThinking: true, effortTier: 'high', inClientPicker: true, sortOrder: 1, maxContextTokens: 512000, quotaRemainingFraction: 0.22 },
              { modelId: 'MODEL_PLACEHOLDER_M301', slugId: 'gemini-4-crit-low', label: 'Gemini 4 Critical', baseLabel: 'Gemini 4 Critical', isFirstPartyGemini: true, supportsThinking: false, inClientPicker: true, sortOrder: 2, maxContextTokens: 256000, quotaRemainingFraction: 0.08 }
            ]
          },
          providers: {
            antigravity: {
              signedIn: true,
              accounts: [
                {
                  id: 'antigravity:p2-a@example.com',
                  provider: 'antigravity',
                  active: true,
                  label: 'Antigravity',
                  account: { available: true, email: 'p2-a@example.com', plan: 'Google AI Ultra' },
                  usage: {
                    limits: [
                      { label: 'Gemini Pro Window', pct: 34, reset: now + 3 * 86400000 + 2 * 3600000 },
                      { label: 'Idle Pool', pct: 0, expired: true, reset: now - 10000 },
                      { label: 'Unknown Quota Pool', pct: 0, known: false }
                    ]
                  }
                }
              ]
            },
            claude: {
              signedIn: true,
              accounts: [
                {
                  id: 'claude:p2-c@example.com',
                  provider: 'claude',
                  active: true,
                  label: 'Claude Code',
                  account: { available: true, email: 'p2-c@example.com', plan: 'Claude Max' },
                  usage: { limits: [] }
                }
              ]
            }
          },
          rows: [
            { id: 'v91-s1', key: 'v91-s1', title: 'Alpha Stream', provider: 'antigravity', group: 'v91-grp', at: now - 1000, status: 'idle', deviceId: 'p2-dev' },
            { id: 'v91-s2', key: 'v91-s2', title: 'Beta Stream', provider: 'antigravity', group: 'v91-grp', at: now - 4000, status: 'idle', deviceId: 'p2-dev' },
            { id: 'v91-desk', key: 'v91-desk', title: 'Desktop Origin Row', provider: 'claude', claudeDesktop: true, origin: 'claude_desktop', at: now - 6000, status: 'idle', deviceId: 'p2-dev' },
            { id: 'v91-arc', key: 'v91-arc', title: 'Archived Item', provider: 'antigravity', archived: true, at: now - 9000, status: 'completed', deviceId: 'p2-dev' }
          ]
        };
        rawCache.snapshot = snap;
        rawCache.state = snap;
        localStorage.setItem('theo_remote_cache_v3', JSON.stringify(rawCache));
        localStorage.removeItem('theo_remote_outbox_v1');
        try { sessionStorage.removeItem('theo_pinned_nav_v1'); } catch {}
        localStorage.setItem('theo_remote_prefs_v1', JSON.stringify({
          customBridgeUrl: '',
          edgeRelayUrl: '',
          cloudUrl: '',
          activeTab: 'chat',
          sidebarFilter: 'all',
          selectedThreadId: 'v91-s1',
          composerMode: 'reply',
          collapsedSessionGroups: {}
        }));
        window.__theoPromptCalls = 0;
        window.prompt = () => { window.__theoPromptCalls++; return null; };
      })()`);
      await cdp.send('Page.navigate', { url: `${baseUrl}/?nosse=1` }, sessionId);
      await new Promise((r) => setTimeout(r, 700));

      const p2Probe = await evalJs(`(async () => {
        const swSrc = await fetch('./sw.js?t=' + Date.now()).then((r) => r.text());
        const swHasV92 = swSrc.includes("'theo-remote-v92'");
        const titleCount = document.querySelectorAll('[title]').length;
        const ctxPillIdle = document.getElementById('ctx-pill-label')?.textContent?.trim() || '';
        const ctxHas22019 = ctxPillIdle.includes('22019');

        // Extension #1: Quota bars inside #model-picker-body
        document.getElementById('composer-model-btn')?.click();
        await new Promise((r) => setTimeout(r, 60));
        const pickerEl = document.getElementById('model-picker-body');
        const quotaCount = pickerEl ? pickerEl.querySelectorAll('.vs-model-quota').length : 0;
        const hasLowCls = Boolean(pickerEl?.querySelector('.vs-model-quota.is-low'));
        const hasCritCls = Boolean(pickerEl?.querySelector('.vs-model-quota.is-crit'));
        const has72Pct = Boolean(pickerEl?.textContent?.includes('72%'));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        // Phase 2.1: Accounts & Quota
        const acctCards = Array.from(document.querySelectorAll('#ide-sidebar-accounts .ide-acct-card'));
        const roleTexts = Array.from(document.querySelectorAll('#ide-sidebar-accounts .ide-acct-role')).map((e) => e.textContent.trim());
        const hasDuplicateRole = roleTexts.includes('Antigravity') || roleTexts.includes('Claude Code');
        const acctHtml = document.getElementById('ide-sidebar-accounts')?.innerHTML || '';
        const hasResetsIn3d = acctHtml.includes('Resets in 3d 2h');
        const hasWindowIdle = acctHtml.includes('Window idle');
        const hasUnknownDash = Array.from(document.querySelectorAll('#ide-sidebar-accounts .ide-qmeta strong')).some((e) => e.textContent.trim() === '—');
        const resetSingleLine = Array.from(document.querySelectorAll('#ide-sidebar-accounts .ide-qrst')).every((e) => e.getClientRects().length <= 1);
        const claudeEmptyNoFake250 = !acctHtml.includes('Fable limit') && !acctHtml.includes('250M');
        const acctCountBadge = document.getElementById('ide-accounts-count')?.textContent?.trim() || '';
        const pendingLoginHtml = document.getElementById('ide-pending-login-slot')?.innerHTML || '';
        const pendingHasBanner = !document.getElementById('ide-pending-login-slot')?.hidden && pendingLoginHtml.includes('Claude Code');
        const pendingLeaksUrl = pendingLoginHtml.includes('https://');

        // Pending login Cancel -> sends accountSignInCancel (liveOnly + targetDeviceId) & hides banner
        window.__theoLastQuarantinedCmd = null;
        document.querySelector('[data-pending-login-act="cancel"]')?.click();
        await new Promise((r) => setTimeout(r, 40));
        const cancelLoginCmd = window.__theoLastQuarantinedCmd || null;
        const pendingHiddenAfterCancel = Boolean(document.getElementById('ide-pending-login-slot')?.hidden);

        // Inline + Add Tray & Details Modal (0 prompt calls)
        document.getElementById('ide-acct-add-btn')?.click();
        await new Promise((r) => setTimeout(r, 40));
        const addTrayOpen = !document.getElementById('ide-add-account-tray')?.hidden && Boolean(document.getElementById('ide-add-tray-label'));
        document.querySelector('[data-add-tray-cancel]')?.click();

        document.getElementById('ide-acct-details-btn')?.click();
        await new Promise((r) => setTimeout(r, 40));
        const detailsOpen = !document.getElementById('acct-details-modal')?.hidden;
        window.__theoLastQuarantinedCmd = null;
        document.querySelector('[data-acct-details-act="refresh"]')?.click();
        await new Promise((r) => setTimeout(r, 40));
        const refreshAcctCmd = window.__theoLastQuarantinedCmd || null;
        document.getElementById('acct-details-close')?.click();

        // Inline nickname edit + move down reorder
        document.querySelector('#ide-sidebar-accounts [data-account-label="antigravity:p2-a@example.com"]')?.click();
        await new Promise((r) => setTimeout(r, 40));
        const nickInp = document.querySelector('#ide-sidebar-accounts .ide-acct-inline-edit');
        if (nickInp) nickInp.value = 'Primary Work';
        document.querySelector('#ide-sidebar-accounts [data-acct-label-form]')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await new Promise((r) => setTimeout(r, 50));
        const savedRole = document.querySelector('#ide-sidebar-accounts .ide-acct-role')?.textContent?.trim() || '';
        const orderBeforeMove = Array.from(document.querySelectorAll('#ide-sidebar-accounts .ide-acct-card')).map((e) => e.dataset.quotaCardId);
        document.querySelector('#ide-sidebar-accounts [data-account-move="down"][data-account-id="antigravity:p2-a@example.com"]')?.click();
        await new Promise((r) => setTimeout(r, 50));
        const orderAfterMove = Array.from(document.querySelectorAll('#ide-sidebar-accounts .ide-acct-card')).map((e) => e.dataset.quotaCardId);

        // Host Health Stack (all 4 exception cards) + Dismiss AutoReload failure clears card across hostHealth
        const healthStack = document.getElementById('ide-host-health-stack');
        const healthCardCount = healthStack ? healthStack.querySelectorAll('.ide-health-card').length : 0;
        window.__theoLastQuarantinedCmd = null;
        document.querySelector('#ide-host-health-stack [data-host-act="dismissAutoReloadFailure"]')?.click();
        await new Promise((r) => setTimeout(r, 40));
        const dismissCmd = window.__theoLastQuarantinedCmd || null;
        const autoReloadFailGoneAfterDismiss = !document.querySelector('#ide-host-health-stack [data-host-act="dismissAutoReloadFailure"]');

        // Zero-flicker reconcileIdeTreeDOM + pointer freeze
        const treeEl = document.getElementById('ide-sidebar-tree');
        const rowBefore = treeEl?.querySelector('.ide-tree-row[data-ide-open-session="v91-s1"]') || null;
        treeEl?.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true, pointerType: 'mouse' }));
        const st = window.__theoTestWs.getState();
        const betaRow = st.rows.find((r) => r.id === 'v91-s2');
        if (betaRow) betaRow.at = Date.now() + 60000;
        window.__theoTestWs.renderSidebar?.();
        if (rowBefore) {
          // Negative rename guard: F2 + Escape reverts title without queuing rename
          rowBefore.focus();
          window.__theoLastQuarantinedCmd = null;
          rowBefore.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }));
          await new Promise((r) => setTimeout(r, 20));
          const escSpan = rowBefore.querySelector('.ide-tree-title');
          if (escSpan) {
            escSpan.textContent = 'Should Not Save';
            escSpan.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          }
          await new Promise((r) => setTimeout(r, 20));
          const titleAfterEscape = rowBefore.querySelector('.ide-tree-title')?.textContent?.trim() || '';
          const cmdAfterEscape = window.__theoLastQuarantinedCmd;

          // Negative rename guard: whitespace-only Enter reverts without queuing rename
          rowBefore.focus();
          window.__theoLastQuarantinedCmd = null;
          rowBefore.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }));
          await new Promise((r) => setTimeout(r, 20));
          if (escSpan) {
            escSpan.textContent = '   ';
            escSpan.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          }
          await new Promise((r) => setTimeout(r, 20));
          const titleAfterBlank = rowBefore.querySelector('.ide-tree-title')?.textContent?.trim() || '';
          const cmdAfterBlank = window.__theoLastQuarantinedCmd;

          // Positive title rename via F2 -> Enter
          rowBefore.focus();
          rowBefore.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }));
          await new Promise((r) => setTimeout(r, 30));
          const titleSpan = rowBefore.querySelector('.ide-tree-title');
          const renameEditable = titleSpan?.contentEditable === 'true';
          if (titleSpan) {
            titleSpan.textContent = 'Alpha Renamed V91';
            titleSpan.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          }
          window.__theoTestWs.renderSidebar?.();
          await new Promise((r) => setTimeout(r, 40));
          // Check row order frozen while pointer inside tree
          const idsWhileFrozen = Array.from(treeEl.querySelectorAll('.ide-tree-group[data-ide-group="v91-grp"] .ide-tree-row')).map((e) => e.dataset.ideOpenSession);
          treeEl.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true, pointerType: 'mouse' }));
          await new Promise((r) => setTimeout(r, 40));
          const rowAfter = treeEl.querySelector('.ide-tree-row[data-ide-open-session="v91-s1"]');
          const idsAfterUnfreeze = Array.from(treeEl.querySelectorAll('.ide-tree-group[data-ide-group="v91-grp"] .ide-tree-row')).map((e) => e.dataset.ideOpenSession);

          // Context menu outside-click must clear ideMenuPinFreeze so deferred order flushes cleanly
          const freezeTargetRow = treeEl.querySelector('.ide-tree-row[data-ide-open-session="v91-s1"]');
          freezeTargetRow?.querySelector('[data-sess-ctx-menu]')?.click();
          await new Promise((r) => setTimeout(r, 20));
          const alphaRow = st.rows.find((r) => r.id === 'v91-s1');
          if (alphaRow) alphaRow.at = Date.now() + 120000;
          window.__theoTestWs.renderSidebar?.();
          const idsFrozenDuringMenu = Array.from(treeEl.querySelectorAll('.ide-tree-group[data-ide-group="v91-grp"] .ide-tree-row')).map((e) => e.dataset.ideOpenSession);
          document.body.click();
          await new Promise((r) => setTimeout(r, 30));
          const idsAfterOutsideMenuClose = Array.from(treeEl.querySelectorAll('.ide-tree-group[data-ide-group="v91-grp"] .ide-tree-row')).map((e) => e.dataset.ideOpenSession);

          // Remove from group reversal via session context menu
          treeEl.querySelector('.ide-tree-row[data-ide-open-session="v91-s2"] [data-sess-ctx-menu]')?.click();
          await new Promise((r) => setTimeout(r, 20));
          window.__theoLastQuarantinedCmd = null;
          document.querySelector('#ide-context-menu [data-sess-act="group-remove"]')?.click();
          await new Promise((r) => setTimeout(r, 30));
          const groupRemoveCmd = window.__theoLastQuarantinedCmd || null;
          const s2NowUngrouped = Boolean(treeEl.querySelector('.ide-tree-group[data-ide-group="ungrouped"] .ide-tree-row[data-ide-open-session="v91-s2"]'));

          // Desktop pill & Hide Desktop toggle + Archived section + Unarchive all reversal
          const hasDesktopPill = Boolean(treeEl.querySelector('.ide-tree-row[data-ide-open-session="v91-desk"] .session-origin-pill'));
          const hasArchivedGroup = Boolean(treeEl.querySelector('.ide-tree-group[data-ide-group="archived"]'));
          document.getElementById('ide-hide-desktop-chip')?.click();
          await new Promise((r) => setTimeout(r, 40));
          const desktopRowHidden = !treeEl.querySelector('.ide-tree-row[data-ide-open-session="v91-desk"]');

          window.__theoLastQuarantinedCmd = null;
          document.querySelector('.ide-tree-group[data-ide-group="archived"] [data-group-act="unarchive-all"]')?.click();
          await new Promise((r) => setTimeout(r, 40));
          const unarchiveAllCmd = window.__theoLastQuarantinedCmd || null;
          const arcNowRestored = Boolean(treeEl.querySelector('.ide-tree-row[data-ide-open-session="v91-arc"]'));

          // Group context menu
          document.querySelector('[data-group-ctx-menu="v91-grp"]')?.click();
          await new Promise((r) => setTimeout(r, 30));
          const grpMenuHtml = document.getElementById('ide-context-menu')?.innerHTML || '';
          const hasGrpRenameMenu = !document.getElementById('ide-context-menu')?.hidden && grpMenuHtml.includes('Rename Group');
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

          return {
            swHasV92,
            titleCount,
            ctxHas22019,
            quotaCount,
            hasLowCls,
            hasCritCls,
            has72Pct,
            acctCount: acctCards.length,
            hasDuplicateRole,
            hasResetsIn3d,
            hasWindowIdle,
            hasUnknownDash,
            resetSingleLine,
            claudeEmptyNoFake250,
            acctCountBadge,
            pendingHasBanner,
            pendingLeaksUrl,
            cancelLoginCmd: cancelLoginCmd ? { subAction: cancelLoginCmd.subAction, liveOnly: cancelLoginCmd.liveOnly, targetDeviceId: cancelLoginCmd.targetDeviceId } : null,
            pendingHiddenAfterCancel,
            addTrayOpen,
            detailsOpen,
            refreshAcctCmd: refreshAcctCmd ? { subAction: refreshAcctCmd.subAction, targetDeviceId: refreshAcctCmd.targetDeviceId } : null,
            savedRole,
            orderChanged: JSON.stringify(orderBeforeMove) !== JSON.stringify(orderAfterMove),
            healthCardCount,
            dismissCmd: dismissCmd ? { subAction: dismissCmd.subAction, targetDeviceId: dismissCmd.targetDeviceId } : null,
            autoReloadFailGoneAfterDismiss,
            titleAfterEscape,
            cmdAfterEscape,
            titleAfterBlank,
            cmdAfterBlank,
            renameEditable,
            renamedTitle: treeEl.querySelector('.ide-tree-row[data-ide-open-session="v91-s1"] .ide-tree-title')?.textContent?.trim() || '',
            idsWhileFrozen,
            idsAfterUnfreeze,
            idsFrozenDuringMenu,
            idsAfterOutsideMenuClose,
            groupRemoveCmd: groupRemoveCmd ? { subAction: groupRemoveCmd.subAction, ids: groupRemoveCmd.ids || [] } : null,
            s2NowUngrouped,
            sameDomNode: rowBefore === rowAfter,
            hasDesktopPill,
            hasArchivedGroup,
            desktopRowHidden,
            unarchiveAllCmd: unarchiveAllCmd ? { subAction: unarchiveAllCmd.subAction, value: unarchiveAllCmd.value } : null,
            arcNowRestored,
            hasGrpRenameMenu,
            promptCalls: window.__theoPromptCalls || 0
          };
        }
        return { error: 'rowBefore missing' };
      })()`);

      assert.strictEqual(p2Probe.swHasV92, true, 'sw.js must advertise theo-remote-v92');
      assert.strictEqual(p2Probe.titleCount, 0, 'Zero native [title] tooltips allowed');
      assert.strictEqual(p2Probe.ctxHas22019, false, 'Context pill must never show hardcoded 22019 fallback');
      assert.ok(p2Probe.quotaCount >= 3, 'Model picker must render per-model quotaRemainingFraction bars');
      assert.strictEqual(p2Probe.hasLowCls && p2Probe.hasCritCls && p2Probe.has72Pct, true, 'Quota bars must show percentage and is-low/is-crit classes');
      assert.strictEqual(p2Probe.hasDuplicateRole, false, 'Sidebar accounts must never show duplicate Antigravity/Claude Code badge');
      assert.strictEqual(p2Probe.hasResetsIn3d && p2Probe.hasWindowIdle && p2Probe.hasUnknownDash, true, 'Reset lines must show full Resets in 3d 2h, Window idle, and em-dash for known:false');
      assert.strictEqual(p2Probe.resetSingleLine, true, 'Quota reset labels must remain single-line nowrap');
      assert.strictEqual(p2Probe.claudeEmptyNoFake250, true, 'Empty Claude limits must never fabricate 250M or Fable limit');
      assert.strictEqual(p2Probe.acctCountBadge, '2', 'Account section header count must reflect signed-in accounts');
      assert.strictEqual(p2Probe.pendingHasBanner && !p2Probe.pendingLeaksUrl, true, 'Pending login banner must show progress without leaking OAuth URLs');
      assert.deepStrictEqual(p2Probe.cancelLoginCmd, { subAction: 'accountSignInCancel', liveOnly: true, targetDeviceId: 'p2-dev' }, 'Pending login Cancel must send liveOnly accountSignInCancel with targetDeviceId');
      assert.strictEqual(p2Probe.pendingHiddenAfterCancel, true, 'Pending login Cancel must hide banner');
      assert.strictEqual(p2Probe.addTrayOpen, true, '+ Add tray must open inline without window.prompt');
      assert.strictEqual(p2Probe.detailsOpen, true, 'Details modal must open cleanly');
      assert.deepStrictEqual(p2Probe.refreshAcctCmd, { subAction: 'accountRefresh', targetDeviceId: 'p2-dev' }, 'Details Refresh Quotas must send accountRefresh with targetDeviceId');
      assert.strictEqual(p2Probe.savedRole, 'Primary Work', 'Inline account label edit must update role badge');
      assert.strictEqual(p2Probe.orderChanged, true, 'Account move down must reorder accounts');
      assert.strictEqual(p2Probe.healthCardCount, 4, 'Host health stack must surface setup, hold, reload, and patch skip cards when active');
      assert.deepStrictEqual(p2Probe.dismissCmd, { subAction: 'dismissAutoReloadFailure', targetDeviceId: 'p2-dev' });
      assert.strictEqual(p2Probe.autoReloadFailGoneAfterDismiss, true, 'Dismiss must clear auto-reload failure card optimistically across hostHealth');
      assert.strictEqual(p2Probe.titleAfterEscape, 'Alpha Stream', 'F2 Escape must revert inline session title');
      assert.strictEqual(p2Probe.cmdAfterEscape, null, 'F2 Escape must emit zero rename command');
      assert.strictEqual(p2Probe.titleAfterBlank, 'Alpha Stream', 'F2 blank submit must revert inline session title');
      assert.strictEqual(p2Probe.cmdAfterBlank, null, 'F2 blank submit must emit zero rename command');
      assert.strictEqual(p2Probe.renameEditable, true, 'F2 must enter inline contentEditable session rename');
      assert.strictEqual(p2Probe.renamedTitle, 'Alpha Renamed V91', 'Enter must commit inline session rename');
      assert.strictEqual(p2Probe.sameDomNode, true, 'reconcileIdeTreeDOM must preserve exact row DOM node identity across updates');
      assert.deepStrictEqual(p2Probe.idsWhileFrozen, ['v91-s1', 'v91-s2'], 'Pointer-hover freeze must keep row order while pointer is inside tree');
      assert.deepStrictEqual(p2Probe.idsAfterUnfreeze, ['v91-s2', 'v91-s1'], 'Order update must flush once pointer leaves tree');
      assert.deepStrictEqual(p2Probe.idsFrozenDuringMenu, ['v91-s2', 'v91-s1'], 'Context menu open must freeze row order');
      assert.deepStrictEqual(p2Probe.idsAfterOutsideMenuClose, ['v91-s1', 'v91-s2'], 'Outside-click menu close must unfreeze and flush deferred order');
      assert.deepStrictEqual(p2Probe.groupRemoveCmd, { subAction: 'groupRemove', ids: ['v91-s2'] });
      assert.strictEqual(p2Probe.s2NowUngrouped, true, 'Remove from Group must move session to Ungrouped');
      assert.strictEqual(p2Probe.hasDesktopPill && p2Probe.hasArchivedGroup && p2Probe.desktopRowHidden, true, 'Desktop pill, Hide Desktop filter, and collapsible Archived group must work');
      assert.deepStrictEqual(p2Probe.unarchiveAllCmd, { subAction: 'archive', value: false });
      assert.strictEqual(p2Probe.arcNowRestored, true, 'Unarchive all must restore archived session into tree');
      assert.strictEqual(p2Probe.hasGrpRenameMenu, true, 'Group context menu must open from group header actions');
      assert.strictEqual(p2Probe.promptCalls, 0, 'Account add and label edit must use inline/modal controls without window.prompt');

      // Mobile 390px iOS zoom guard: .ide-acct-inline-edit & .ide-add-tray-input >= 16px computed fontSize
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 2,
        mobile: true
      }, sessionId);
      const mobInputFonts = await evalJs(`(async () => {
        document.querySelector('[data-tab="pulse"]')?.click();
        await new Promise((r) => setTimeout(r, 40));
        document.querySelector('#pulse-quota-grid [data-account-label]')?.click();
        await new Promise((r) => setTimeout(r, 30));
        const inlineFont = parseFloat(getComputedStyle(document.querySelector('#pulse-quota-grid .ide-acct-inline-edit')).fontSize || '0');
        document.querySelector('#pulse-quota-grid [data-acct-label-cancel]')?.click();
        const probe = document.createElement('button');
        probe.dataset.accountAddRemote = 'antigravity';
        document.body.appendChild(probe);
        probe.click();
        probe.remove();
        await new Promise((r) => setTimeout(r, 30));
        const trayInp = document.querySelector('#acct-signin-body .ide-add-tray-input');
        const trayFont = trayInp ? parseFloat(getComputedStyle(trayInp).fontSize || '0') : 0;
        document.querySelector('[data-add-tray-cancel]')?.click();
        return { inlineFont, trayFont, overflowX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth) };
      })()`);
      assert.ok(mobInputFonts.inlineFont >= 16, `Mobile inline account edit must be >= 16px, got ${mobInputFonts.inlineFont}`);
      assert.ok(mobInputFonts.trayFont >= 16, `Mobile add-account tray input must be >= 16px, got ${mobInputFonts.trayFont}`);
      assert.strictEqual(mobInputFonts.overflowX, 0, '0px horizontal overflow on mobile account edit & tray');
      console.log('[PASS] Adversarial #27: Phase 2 (Accounts, Quota Bars, Reconcile DOM, Pointer Freeze, Inline Rename, Group Menu, Archived/Desktop, Host Health) + Ext #1 verified');
    }

    // Adversarial Check #28: Phase 3 (v92) Structural De-Clutter, Desktop Workbench Default Boot, Unified Sidebar, Single-Control Rule, Header Inline Rename & Copy Scrub
    {
      // 1. Desktop (1440x900) cold boot (no theo_remote_prefs_v1) MUST land in Workbench (chat) + set desktopWorkbenchBootV92
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false }, sessionId);
      await evalJs(`(() => {
        const now = Date.now();
        localStorage.removeItem('theo_remote_prefs_v1');
        const snap = {
          generatedAt: new Date(now).toISOString(),
          devices: [{ id: 'p3-dev', name: 'Main PC', online: true }],
          device: { id: 'p3-dev', name: 'Main PC', online: true },
          rows: [
            { id: 'v92-s1', key: 'v92-s1', title: 'Phase 3 Primary', provider: 'antigravity', model: 'Gemini 4 Carbon (High)', effort: 'high', at: now - 1000, status: 'idle', deviceId: 'p3-dev' },
            { id: 'v92-s2', key: 'v92-s2', title: 'Phase 3 Orchestrator', provider: 'antigravity', model: 'Orchestrator (Carbon)', effort: '', at: now - 3000, status: 'idle', deviceId: 'p3-dev' }
          ],
          groups: [{ id: 'v92-grp', name: 'Phase 3 Group', collapsed: false }],
          workspaces: [{ id: 'theo', name: 'theo', branch: 'main', dirtyCount: 0, path: 'C:/Users/hbdei/bhfirms/theo' }],
          antigravityModelCatalog: {
            updatedAt: now + 100000,
            source: 'live-rpc',
            activeDefaultModelId: 'MODEL_PLACEHOLDER_M427',
            activeDefaultLabel: 'Gemini 4 Carbon (High)',
            models: [
              { modelId: 'MODEL_PLACEHOLDER_M667', slugId: 'orchestrator-carbon', label: 'Orchestrator (Carbon)', baseLabel: 'Orchestrator (Carbon)', isOrchestrator: true, isFirstPartyGemini: true, supportsThinking: false, inClientPicker: true, sortOrder: 0, maxContextTokens: 512000 },
              { modelId: 'MODEL_PLACEHOLDER_M427', slugId: 'gemini-4-carbon-high', label: 'Gemini 4 Carbon (High)', baseLabel: 'Gemini 4 Carbon', isFirstPartyGemini: true, supportsThinking: true, effortTier: 'high', inClientPicker: true, sortOrder: 1, maxContextTokens: 512000 },
              { modelId: 'MODEL_PLACEHOLDER_M437', slugId: 'gemini-4-carbon-medium', label: 'Gemini 4 Carbon (Medium)', baseLabel: 'Gemini 4 Carbon', isFirstPartyGemini: true, supportsThinking: true, effortTier: 'medium', inClientPicker: true, sortOrder: 2, maxContextTokens: 512000 }
            ]
          },
          approvals: [],
          notifications: []
        };
        localStorage.setItem('theo_remote_cache_v3', JSON.stringify({
          state: snap,
          snapshot: snap,
          threads: {
            'v92-s1': { id: 'v92-s1', provider: 'antigravity', model: 'Gemini 4 Carbon (High)', effort: 'high', messages: [{ id: 'm1', role: 'user', text: 'Phase 3 check', createdAt: new Date(now - 2000).toISOString() }] },
            'v92-s2': { id: 'v92-s2', provider: 'antigravity', model: 'Orchestrator (Carbon)', effort: '', messages: [{ id: 'm2', role: 'user', text: 'Orch check', createdAt: new Date(now - 4000).toISOString() }] }
          },
          updatedAt: now
        }));
        return true;
      })()`);
      await cdp.send('Page.navigate', { url: `${baseUrl}/?nosse=1` }, sessionId);
      await new Promise((r) => setTimeout(r, 650));

      const desktopColdBoot = await evalJs(`(() => {
        const p = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}');
        return {
          chatActive: Boolean(document.getElementById('view-chat')?.classList.contains('active')),
          bootFlag: Boolean(p.desktopWorkbenchBootV92)
        };
      })()`);
      assert.strictEqual(desktopColdBoot.chatActive, true, 'Desktop (1440x900) cold boot must open directly into Workbench (#view-chat.active)');
      assert.strictEqual(desktopColdBoot.bootFlag, true, 'Desktop cold boot must persist desktopWorkbenchBootV92=true');

      // v91 -> v92 upgrade migration: activeTab:'pulse' without desktopWorkbenchBootV92 migrates once to chat; then user switch back to pulse persists across reload
      await evalJs(`(() => {
        localStorage.setItem('theo_remote_prefs_v1', JSON.stringify({
          theme: 'dark',
          themeUserSet: true,
          activeTab: 'pulse',
          selectedThreadId: 'v92-s1',
          edgeAccessKey: 'e'.repeat(64)
        }));
        return true;
      })()`);
      await cdp.send('Page.navigate', { url: `${baseUrl}/?nosse=1` }, sessionId);
      await new Promise((r) => setTimeout(r, 600));
      const upgradeBootChat = await evalJs(`Boolean(document.getElementById('view-chat')?.classList.contains('active'))`);
      assert.strictEqual(upgradeBootChat, true, 'v91->v92 upgrade from pulse on desktop must migrate once to chat');

      // Switch to Pulse via visible desktop control (#rail-fleet-btn -> #conn-modal-pulse-btn), then verify sticky Pulse across reload
      await evalJs(`(async () => {
        document.getElementById('rail-fleet-btn')?.click();
        await new Promise((r) => setTimeout(r, 30));
        document.getElementById('conn-modal-pulse-btn')?.click();
        return true;
      })()`);
      await new Promise((r) => setTimeout(r, 60));
      await cdp.send('Page.navigate', { url: `${baseUrl}/?nosse=1` }, sessionId);
      await new Promise((r) => setTimeout(r, 600));
      const stickyPulseAfterUserSwitch = await evalJs(`Boolean(document.getElementById('view-pulse')?.classList.contains('active'))`);
      assert.strictEqual(stickyPulseAfterUserSwitch, true, 'After user chooses Pulse via desktop control post-v92, reload must respect Pulse');

      // Verify desktop browser Back (popstate) from Workspaces after clean desktop boot returns to Workbench (chat), NOT Pulse
      await evalJs(`localStorage.removeItem('theo_remote_prefs_v1')`);
      await cdp.send('Page.navigate', { url: `${baseUrl}/?nosse=1` }, sessionId);
      await new Promise((r) => setTimeout(r, 600));
      const popstateCheck = await evalJs(`(async () => {
        const bootedInChat = Boolean(document.getElementById('view-chat')?.classList.contains('active'));
        document.getElementById('rail-workspaces-btn')?.click();
        await new Promise((r) => setTimeout(r, 40));
        const wentToWorkspaces = Boolean(document.getElementById('view-workspaces')?.classList.contains('active'));
        history.back();
        await new Promise((r) => setTimeout(r, 120));
        const returnedToChat = Boolean(document.getElementById('view-chat')?.classList.contains('active'));
        const leakedToPulse = Boolean(document.getElementById('view-pulse')?.classList.contains('active'));
        return { bootedInChat, wentToWorkspaces, returnedToChat, leakedToPulse };
      })()`);
      assert.strictEqual(popstateCheck.bootedInChat && popstateCheck.wentToWorkspaces && popstateCheck.returnedToChat && !popstateCheck.leakedToPulse, true, `Desktop popstate must return to Workbench (chat) rather than Pulse: ${JSON.stringify(popstateCheck)}`);

      // Verify desktop Command Palette (⌘K) exposes Pulse & Sessions routes on desktop
      const cmdViewRoutes = await evalJs(`(async () => {
        document.getElementById('open-cmd-palette')?.click();
        await new Promise((r) => setTimeout(r, 30));
        const hasPulseCmd = Boolean(document.querySelector('#cmd-results [data-cmd-act="tab-pulse"]'));
        const hasSessCmd = Boolean(document.querySelector('#cmd-results [data-cmd-act="tab-sessions"]'));
        document.querySelector('#cmd-results [data-cmd-act="tab-sessions"]')?.click();
        await new Promise((r) => setTimeout(r, 35));
        const switchedToSessions = Boolean(document.getElementById('view-sessions')?.classList.contains('active'));
        document.getElementById('btn-sidebar-brand')?.click();
        await new Promise((r) => setTimeout(r, 35));
        return { hasPulseCmd, hasSessCmd, switchedToSessions };
      })()`);
      assert.strictEqual(cmdViewRoutes.hasPulseCmd && cmdViewRoutes.hasSessCmd && cmdViewRoutes.switchedToSessions, true, `Desktop ⌘K must expose & route Pulse and Sessions: ${JSON.stringify(cmdViewRoutes)}`);

      // 2. Unified 1-Sidebar Shell + Single-Control Rule + Header Rename + Palette & Model Effort Dedup
      await evalJs(`document.getElementById('btn-sidebar-brand')?.click();`);
      await new Promise((r) => setTimeout(r, 80));

      const shellAndRename = await evalJs(`(async () => {
        const swSrc = await fetch('./sw.js?t=' + Date.now()).then((r) => r.text());
        const swHasV92 = swSrc.includes("'theo-remote-v92'");
        const actBarGone = document.querySelector('.ide-activity-bar') === null;
        const brandTxt = document.getElementById('btn-sidebar-brand')?.textContent?.trim() || '';
        const footerIds = ['rail-vault-btn', 'rail-workspaces-btn', 'rail-fleet-btn', 'rail-push-btn', 'open-cmd-palette', 'btn-palette-picker'];
        const footerVisibleCount = footerIds.filter((id) => {
          const el = document.getElementById(id);
          return el && !el.hidden && getComputedStyle(el).display !== 'none';
        }).length;

        // #rail-workspaces-btn toggles workspaces <-> chat
        document.getElementById('rail-workspaces-btn')?.click();
        await new Promise((r) => setTimeout(r, 40));
        const wsOpened = Boolean(document.getElementById('view-workspaces')?.classList.contains('active'));
        // Ctrl+B collapses sidebar cleanly on secondary view & shows .inline-view-expand
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }));
        await new Promise((r) => setTimeout(r, 40));
        const inlineExpandVisibleOnWs = (() => {
          const b = document.querySelector('#view-workspaces .inline-view-expand');
          return Boolean(b && getComputedStyle(b).display !== 'none');
        })();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }));
        await new Promise((r) => setTimeout(r, 40));
        document.getElementById('rail-workspaces-btn')?.click();
        await new Promise((r) => setTimeout(r, 40));
        const toggledBackToChat = Boolean(document.getElementById('view-chat')?.classList.contains('active'));

        // #rail-fleet-btn -> #conn-modal -> [data-goto-tab="analytics"] closes #conn-modal & opens analytics
        document.getElementById('rail-fleet-btn')?.click();
        await new Promise((r) => setTimeout(r, 40));
        const connOpened = document.getElementById('conn-modal')?.hidden === false;
        document.querySelector('#conn-modal [data-goto-tab="analytics"]')?.click();
        await new Promise((r) => setTimeout(r, 40));
        const connClosedAfterGoto = document.getElementById('conn-modal')?.hidden === true;
        const analyticsOpened = Boolean(document.getElementById('view-analytics')?.classList.contains('active'));
        document.getElementById('btn-sidebar-brand')?.click();
        await new Promise((r) => setTimeout(r, 40));

        // #btn-palette-picker opens clamped #theme-palette-popover with working theme & sound buttons
        const palBtn = document.getElementById('btn-palette-picker');
        const palPop = document.getElementById('theme-palette-popover');
        palBtn?.click();
        await new Promise((r) => setTimeout(r, 30));
        const palRect = palPop?.getBoundingClientRect();
        const palOpenAndClamped = Boolean(
          palPop && !palPop.hidden && palRect && palRect.left >= 0 && palRect.top >= 0 &&
          palRect.right <= window.innerWidth && palRect.bottom <= window.innerHeight
        );
        const soundBefore = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}').sound !== false;
        document.getElementById('btn-sound-toggle')?.click();
        const soundAfter = JSON.parse(localStorage.getItem('theo_remote_prefs_v1') || '{}').sound !== false;
        document.getElementById('btn-close-palette')?.click();

        // Single-Control header checks
        const selGone = document.getElementById('chat-session-select') === null;
        const hdrModelGone = document.getElementById('chat-model-picker-btn') === null;
        const metaRowGone = document.querySelector('.chat-meta-row') === null;
        document.getElementById('btn-chat-quick-switch')?.click();
        await new Promise((r) => setTimeout(r, 30));
        const quickSwitchOpenedCmd = document.getElementById('cmd-modal')?.hidden === false;
        document.getElementById('cmd-close')?.click();

        // Header inline rename (#btn-chat-rename-title & F2, Enter/Escape/whitespace + PIN lock guard)
        window.__theoLastQuarantinedCmd = null;
        const origTitle = document.getElementById('chat-session-title')?.textContent?.trim() || '';
        document.getElementById('btn-chat-rename-title')?.click();
        await new Promise((r) => setTimeout(r, 25));
        const titleEl = document.getElementById('chat-session-title');
        const editStartedBtn = Boolean(titleEl && titleEl.isContentEditable);
        if (titleEl) titleEl.textContent = 'Phase 3 Renamed Stream';
        titleEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await new Promise((r) => setTimeout(r, 35));
        const renamedHeaderTitle = document.getElementById('chat-session-title')?.textContent?.trim() || '';
        const renamedSidebarTitle = document.querySelector('.ide-tree-row[data-ide-open-session="v92-s1"] .ide-tree-title')?.textContent?.trim() || '';
        const renameCmd = window.__theoLastQuarantinedCmd || null;

        // F2 rename + Escape cancel
        document.activeElement?.blur?.();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true }));
        await new Promise((r) => setTimeout(r, 25));
        const editStartedF2 = Boolean(titleEl && titleEl.isContentEditable);
        if (titleEl) titleEl.textContent = 'Should Revert On Escape';
        titleEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await new Promise((r) => setTimeout(r, 25));
        const afterEscapeTitle = document.getElementById('chat-session-title')?.textContent?.trim() || '';

        // Whitespace-only rename rejects
        document.getElementById('btn-chat-rename-title')?.click();
        await new Promise((r) => setTimeout(r, 20));
        if (titleEl) titleEl.textContent = '   ';
        titleEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await new Promise((r) => setTimeout(r, 25));
        const afterWhitespaceTitle = document.getElementById('chat-session-title')?.textContent?.trim() || '';

        // Long session title ellipsis truncation on desktop (#chat-session-title scrollWidth > clientWidth, no overlap with rename/⌘K buttons)
        document.getElementById('btn-chat-rename-title')?.click();
        await new Promise((r) => setTimeout(r, 20));
        if (titleEl) titleEl.textContent = 'Very Long Phase 3 Session Title Used To Verify Desktop Header Ellipsis Truncation Without Overlap Across Viewport';
        titleEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await new Promise((r) => setTimeout(r, 30));
        const tRect = titleEl?.getBoundingClientRect();
        const rRect = document.getElementById('btn-chat-rename-title')?.getBoundingClientRect();
        const qRect = document.getElementById('btn-chat-quick-switch')?.getBoundingClientRect();
        const longTitleTruncated = Boolean(
          titleEl && tRect && rRect && qRect &&
          getComputedStyle(titleEl).overflow === 'hidden' &&
          getComputedStyle(titleEl).textOverflow === 'ellipsis' &&
          titleEl.scrollWidth > titleEl.clientWidth &&
          tRect.right <= rRect.left + 1 &&
          rRect.right <= qRect.left + 1
        );
        // Restore concise title for remaining assertions
        document.getElementById('btn-chat-rename-title')?.click();
        await new Promise((r) => setTimeout(r, 20));
        if (titleEl) titleEl.textContent = 'Phase 3 Renamed Stream';
        titleEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await new Promise((r) => setTimeout(r, 25));

        // PIN lock blocks rename button, dblclick, and F2
        const pinOv = document.getElementById('pin-overlay');
        if (pinOv) pinOv.hidden = false;
        document.getElementById('btn-chat-rename-title')?.click();
        const pinBlockedBtn = Boolean(titleEl && titleEl.isContentEditable);
        titleEl?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
        const pinBlockedDbl = Boolean(titleEl && titleEl.isContentEditable);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true }));
        const pinBlockedF2 = Boolean(titleEl && titleEl.isContentEditable);
        if (pinOv) pinOv.hidden = true;

        // Model picker Adjust effort deduplication
        document.getElementById('composer-model-btn')?.click();
        await new Promise((r) => setTimeout(r, 25));
        const effortHiddenInit = document.querySelector('#model-picker-body .vs-model-effort-bar') === null;
        const adjustBtnPresent = Boolean(document.querySelector('#model-picker-body [data-toggle-model-effort-bar="1"]'));
        document.querySelector('#model-picker-body [data-toggle-model-effort-bar="1"]')?.click();
        await new Promise((r) => setTimeout(r, 25));
        const effortVisibleAfterAdjust = document.querySelector('#model-picker-body .vs-model-effort-bar') !== null;
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await new Promise((r) => setTimeout(r, 20));
        document.getElementById('composer-model-btn')?.click();
        await new Promise((r) => setTimeout(r, 25));
        const effortResetAfterClose = document.querySelector('#model-picker-body .vs-model-effort-bar') === null;
        document.querySelector('#model-picker-body [data-select-model-combo="orchestrator-carbon:"]')?.click();
        await new Promise((r) => setTimeout(r, 25));
        document.getElementById('composer-model-btn')?.click();
        await new Promise((r) => setTimeout(r, 25));
        const zeroEffortClean =
          document.querySelector('#model-picker-body .vs-model-effort-bar') === null &&
          document.querySelector('#model-picker-body [data-toggle-model-effort-bar]') === null;
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        // Copy & zero-overflow check on desktop
        const bodyText = document.body.innerText || '';
        const hasBannedBrandCopy = /THEO\s*(STUDIO|REMOTE)/i.test(bodyText);
        const titleAttrCount = document.querySelectorAll('[title]').length;
        const overflowDesktop = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);

        return {
          swHasV92,
          actBarGone,
          brandTxt,
          footerVisibleCount,
          wsOpened,
          inlineExpandVisibleOnWs,
          toggledBackToChat,
          connOpened,
          connClosedAfterGoto,
          analyticsOpened,
          palOpenAndClamped,
          soundToggled: soundBefore !== soundAfter,
          selGone,
          hdrModelGone,
          metaRowGone,
          quickSwitchOpenedCmd,
          origTitle,
          editStartedBtn,
          renamedHeaderTitle,
          renamedSidebarTitle,
          renameCmdSubAction: renameCmd?.subAction || '',
          renameCmdName: renameCmd?.name || '',
          editStartedF2,
          afterEscapeTitle,
          afterWhitespaceTitle,
          longTitleTruncated,
          pinBlockedAny: pinBlockedBtn || pinBlockedDbl || pinBlockedF2,
          effortHiddenInit,
          adjustBtnPresent,
          effortVisibleAfterAdjust,
          effortResetAfterClose,
          zeroEffortClean,
          hasBannedBrandCopy,
          titleAttrCount,
          overflowDesktop
        };
      })()`);

      assert.strictEqual(shellAndRename.swHasV92, true, 'Phase 3 sw.js must serve theo-remote-v92');
      assert.strictEqual(shellAndRename.actBarGone, true, '.ide-activity-bar must not exist in Phase 3');
      assert.strictEqual(shellAndRename.brandTxt, 'THEO', 'Sidebar brand button must read "THEO"');
      assert.strictEqual(shellAndRename.footerVisibleCount, 6, 'Sidebar footer must display all 6 actions');
      assert.strictEqual(shellAndRename.wsOpened && shellAndRename.toggledBackToChat, true, '#rail-workspaces-btn must toggle Workspaces <-> Workbench');
      assert.strictEqual(shellAndRename.inlineExpandVisibleOnWs, true, 'Collapsing sidebar on Workspaces must reveal inline expand button');
      assert.strictEqual(shellAndRename.connOpened && shellAndRename.connClosedAfterGoto && shellAndRename.analyticsOpened, true, '#rail-fleet-btn -> #conn-modal -> [data-goto-tab="analytics"] must close modal and switch view');
      assert.strictEqual(shellAndRename.palOpenAndClamped, true, '#theme-palette-popover must open clamped inside viewport');
      assert.strictEqual(shellAndRename.soundToggled, true, '#btn-sound-toggle inside palette popover must toggle sound pref');
      assert.strictEqual(shellAndRename.selGone && shellAndRename.hdrModelGone && shellAndRename.metaRowGone, true, 'Duplicate header controls must be removed');
      assert.strictEqual(shellAndRename.quickSwitchOpenedCmd, true, '#btn-chat-quick-switch must open #cmd-modal');
      assert.strictEqual(shellAndRename.editStartedBtn, true, '#btn-chat-rename-title must start inline rename');
      assert.strictEqual(shellAndRename.renamedHeaderTitle, 'Phase 3 Renamed Stream');
      assert.strictEqual(shellAndRename.renamedSidebarTitle, 'Phase 3 Renamed Stream');
      assert.strictEqual(shellAndRename.renameCmdSubAction, 'rename');
      assert.strictEqual(shellAndRename.renameCmdName, 'Phase 3 Renamed Stream');
      assert.strictEqual(shellAndRename.editStartedF2, true, 'F2 must start inline rename on #chat-session-title');
      assert.strictEqual(shellAndRename.afterEscapeTitle, 'Phase 3 Renamed Stream', 'Escape must cancel inline rename');
      assert.strictEqual(shellAndRename.afterWhitespaceTitle, 'Phase 3 Renamed Stream', 'Whitespace-only title must cancel rename');
      assert.strictEqual(shellAndRename.longTitleTruncated, true, 'Long session title must truncate with ellipsis cleanly without overlapping rename or ⌘K buttons');
      assert.strictEqual(shellAndRename.pinBlockedAny, false, 'PIN lock must block rename button, dblclick, and F2');
      assert.strictEqual(shellAndRename.effortHiddenInit && shellAndRename.adjustBtnPresent && shellAndRename.effortVisibleAfterAdjust && shellAndRename.effortResetAfterClose, true, `Model picker effort bar must stay collapsed behind Adjust and reset on close: ${JSON.stringify({ init: shellAndRename.effortHiddenInit, adj: shellAndRename.adjustBtnPresent, vis: shellAndRename.effortVisibleAfterAdjust, rst: shellAndRename.effortResetAfterClose })}`);
      assert.strictEqual(shellAndRename.zeroEffortClean, true, '0-effort model must render neither effort bar nor Adjust button');
      assert.strictEqual(shellAndRename.hasBannedBrandCopy, false, 'Rendered UI must contain zero THEO STUDIO or THEO REMOTE copy');
      assert.strictEqual(shellAndRename.titleAttrCount, 0, 'Zero native [title] attributes allowed');
      assert.strictEqual(shellAndRename.overflowDesktop, 0, '0px horizontal overflow on desktop');

      // 3. Mobile (390x844) cold boot lands on Pulse + 5th dock tab labeled Settings + 0px overflow
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sessionId);
      await evalJs(`localStorage.removeItem('theo_remote_prefs_v1')`);
      await cdp.send('Page.navigate', { url: `${baseUrl}/?nosse=1` }, sessionId);
      await new Promise((r) => setTimeout(r, 600));
      const mobileColdBoot = await evalJs(`(() => {
        const dockAnalyticsLbl = document.querySelector('#mobile-bottom-dock [data-tab="analytics"]')?.textContent?.trim() || '';
        return {
          pulseActive: Boolean(document.getElementById('view-pulse')?.classList.contains('active')),
          dockAnalyticsLbl,
          overflowMobile: Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
        };
      })()`);
      assert.strictEqual(mobileColdBoot.pulseActive, true, 'Mobile (390x844) cold boot must open #view-pulse.active');
      assert.ok(mobileColdBoot.dockAnalyticsLbl.includes('Settings'), `5th mobile dock tab must read Settings, got "${mobileColdBoot.dockAnalyticsLbl}"`);
      assert.strictEqual(mobileColdBoot.overflowMobile, 0, '0px horizontal overflow on mobile cold boot');
      console.log('[PASS] Adversarial #28: Phase 3 (v92) Desktop Workbench Default, 1-Sidebar Shell, Single-Control Rule, Header Inline Rename & Copy Scrub verified');
    }

    // Final error & network quarantine assertions (#21)
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
