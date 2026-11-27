'use strict';

/**
 * Automated VS Code Extension (theo-hub) vs THEO PWA Side-by-Side Parity Gate
 *
 * Launches a local static server serving:
 *   1. `/hub`      — theo-hub/resources/hub.html + hub.css + hub.js with VS Code Graphite CSS vars & acquireVsCodeApi shim
 *   2. `/...`      — THEO PWA static shell + mock /api/ping, /api/state, /api/thread
 *   3. `/compare`  — Side-by-side 1740x900 harness (Extension 300px | PWA 1440px)
 *
 * Verifies geometric, colour, state, control-icon, and markdown parity between the extension and PWA,
 * runs an in-page planted-regression self-test, and optionally saves a visual screenshot (--screenshot <path>).
 */

const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const THEO_ROOT = path.resolve(__dirname, '..');
const HUB_RESOURCES = path.resolve(THEO_ROOT, '..', 'theo-hub', 'resources');

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
  throw new Error('Could not find msedge.exe or chrome.exe for VS Code parity verification');
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

function buildParityFixture(now = Date.now()) {
  const mkLimitsAgy = (p1, p2) => [
    { label: 'Gemini 4 Carbon', usedPercent: p1, pct: p1, reset: now + 3600000, known: true },
    { label: 'Claude Opus 4.7', usedPercent: p2, pct: p2, reset: now + 7200000, known: true }
  ];
  const mkLimitsClaude = (p1, p2) => [
    { label: 'Session (5hr)', usedPercent: p1, pct: p1, reset: now + 3600000, known: true },
    { label: 'Weekly (7 day)', usedPercent: p2, pct: p2, reset: now + 86400000, known: true }
  ];

  const providers = {
    antigravity: {
      active: true,
      usage: { limits: mkLimitsAgy(24, 38) },
      account: { available: true, email: 'hussein@example.com', plan: 'Google AI Ultra' },
      accounts: [
        {
          id: 'antigravity:hussein@example.com',
          provider: 'antigravity',
          active: true,
          nickname: 'Work',
          collapsed: false,
          account: { available: true, email: 'hussein@example.com', plan: 'Google AI Ultra' },
          usage: { limits: mkLimitsAgy(24, 38) }
        },
        {
          id: 'antigravity:personal@example.com',
          provider: 'antigravity',
          active: false,
          nickname: 'Personal',
          collapsed: true,
          account: { available: true, email: 'personal@example.com', plan: 'Google AI Pro' },
          usage: { limits: mkLimitsAgy(62, 19) }
        }
      ]
    },
    claude: {
      active: true,
      usage: { limits: mkLimitsClaude(18, 44) },
      account: { available: true, email: 'claude-work@example.com', plan: 'Claude Max' },
      accounts: [
        {
          id: 'claude:claude-work@example.com',
          provider: 'claude',
          active: true,
          nickname: 'Primary',
          collapsed: false,
          account: { available: true, email: 'claude-work@example.com', plan: 'Claude Max' },
          usage: { limits: mkLimitsClaude(18, 44) }
        },
        {
          id: 'claude:claude-alt@example.com',
          provider: 'claude',
          active: false,
          nickname: 'Backup',
          collapsed: true,
          account: { available: true, email: 'claude-alt@example.com', plan: 'Claude Pro' },
          usage: { limits: mkLimitsClaude(5, 12) }
        }
      ]
    }
  };

  const groups = [
    { id: 'grp-later', name: 'Later', collapsed: true },
    { id: 'grp-boxmind', name: 'BoxMind', collapsed: false }
  ];

  const bgTasksActive = [
    { id: 'task-run-1', fullId: 'task-run-1', kind: 'command', state: 'running', summary: 'npm run verify:parity', startedAt: now - 15000 },
    { id: 'agent-run-1', fullId: 'agent-run-1', kind: 'subagent', state: 'running', subagentRole: 'Codebase Auditor', startedAt: now - 42000 }
  ];

  const rows = [
    {
      id: 'sess-run',
      key: 'antigravity:sess-run',
      provider: 'antigravity',
      title: 'VS Code Parity Audit & UI Polish',
      status: 'working',
      category: 'working',
      active: true,
      dot: 'running',
      open: true,
      _serverOpen: true,
      pinned: true,
      pinnedAt: now - 1000,
      at: now - 2000,
      lastWorkedAt: now - 2000,
      timeLabel: 'now',
      folder: 'theo',
      branch: 'main',
      model: 'Gemini 4 Argon',
      bgTask: { state: 'running', count: 2 },
      bgTasks: bgTasksActive
    },
    {
      id: 'sess-wait',
      key: 'claude:sess-wait',
      provider: 'claude',
      title: 'Account Switch & Fleet Sync',
      status: 'waiting',
      category: 'needs_input',
      dot: 'waiting',
      open: true,
      _serverOpen: true,
      unread: false,
      at: now - 120000,
      lastWorkedAt: now - 120000,
      timeLabel: '2m',
      folder: 'isabi-app',
      branch: 'main',
      model: 'Claude Opus 4.7',
      pendingQuestion: {
        questions: [{ id: 'q1', header: 'Deploy', question: 'Ship v101 now?', options: [{ label: 'Yes' }, { label: 'Hold' }] }]
      }
    },
    {
      id: 'sess-unread',
      key: 'antigravity:sess-unread',
      provider: 'antigravity',
      title: 'Fix Sidebar Header Spacing',
      status: 'idle',
      category: 'completed',
      dot: 'unread',
      open: false,
      unread: true,
      at: now - 300000,
      lastWorkedAt: now - 300000,
      timeLabel: '5m',
      folder: 'theo-hub',
      branch: 'main',
      model: 'Gemini 4 Carbon'
    },
    {
      id: 'sess-closed',
      key: 'claude:sess-closed',
      provider: 'claude',
      title: 'Closed Idle History Entry',
      status: 'idle',
      category: 'completed',
      dot: 'closed',
      open: false,
      unread: false,
      at: now - 900000,
      lastWorkedAt: now - 900000,
      timeLabel: '15m',
      folder: 'memory',
      branch: 'main'
    },
    {
      id: 'sess-boxmind',
      key: 'claude:sess-boxmind',
      provider: 'claude',
      title: 'Quarterly Ledger Reconciliation',
      status: 'idle',
      category: 'completed',
      dot: 'unread',
      open: true,
      unread: true,
      group: 'grp-boxmind',
      pinned: true,
      pinnedAt: now - 600000,
      at: now - 600000,
      lastWorkedAt: now - 600000,
      timeLabel: '10m',
      folder: 'boxmind',
      branch: 'main'
    },
    {
      id: 'sess-later',
      key: 'antigravity:sess-later',
      provider: 'antigravity',
      title: 'Hospitality Inventory Sync',
      status: 'idle',
      category: 'completed',
      dot: 'idle',
      group: 'grp-later',
      at: now - 1800000,
      lastWorkedAt: now - 1800000,
      timeLabel: '30m',
      folder: 'isabi-app'
    },
    {
      id: 'sess-desktop',
      key: 'claude:sess-desktop',
      provider: 'claude',
      title: 'Desktop Claude Planning Thread',
      status: 'idle',
      category: 'completed',
      dot: 'closed',
      claudeDesktop: true,
      origin: 'desktop',
      claudeOrigin: 'desktop',
      at: now - 2400000,
      lastWorkedAt: now - 2400000,
      timeLabel: '40m'
    },
    {
      id: 'sess-arc',
      key: 'antigravity:sess-arc',
      provider: 'antigravity',
      title: 'Archived Old Session',
      status: 'idle',
      category: 'completed',
      dot: 'closed',
      archived: true,
      at: now - 7200000,
      lastWorkedAt: now - 7200000,
      timeLabel: '2h'
    }
  ];

  const statePayload = {
    generatedAt: now,
    bridge: { active: true, attachFailed: false, reload: false, message: '', skipMessage: '' },
    device: { id: 'parity-host', name: 'Workstation', role: 'primary' },
    connection: { hostname: 'WORKSTATION', localPort: 4318, edgeConnected: true },
    devices: [
      { id: 'parity-host', name: 'Workstation', online: true, lastSeenAt: now, sessionCount: rows.length }
    ],
    providers,
    accountOrder: [
      'antigravity:hussein@example.com',
      'antigravity:personal@example.com',
      'claude:claude-work@example.com',
      'claude:claude-alt@example.com'
    ],
    groups,
    rows,
    total: rows.length,
    summary: { running: 1, waiting: 1, unread: 2, open: 3 },
    summaryByProvider: {
      antigravity: { count: 4 },
      claude: { count: 4 }
    },
    filter: { statuses: [], tabStates: [], activeOnly: false },
    collapsed: {
      accounts: {
        'antigravity:personal@example.com': true,
        'claude:claude-alt@example.com': true
      }
    }
  };

  const threadMessages = [
    {
      id: 'm1',
      role: 'user',
      ts: now - 60000,
      text: 'Make sure THEO PWA matches the VS Code extension pixel for pixel.'
    },
    {
      id: 'm2',
      role: 'assistant',
      ts: now - 10000,
      text: [
        '## Visual & Structural Alignment',
        '',
        'Updated `js/sidebar.js`, `css/theo.css`, and `index.html` for 1:1 Graphite parity.',
        '',
        '### Key Checks',
        '- Stacked vertical account reorder arrows (`up`/`down`) inside 15px column',
        '- Inline code pills and borderless tables (`#121314` reading area, `#191A1B` sidebar)',
        '',
        '#### Verification Matrix',
        '| Surface | Extension | PWA |',
        '|---|---|---|',
        '| Sidebar | `#191A1B` | `#191A1B` |',
        '| Session row | `28px` | `28px` |'
      ].join('\n')
    }
  ];

  return { statePayload, threadMessages };
}

function buildHubHtmlShim() {
  const rawHtml = fs.readFileSync(path.join(HUB_RESOURCES, 'hub.html'), 'utf8');
  const cssVars = `<style>
    :root {
      --vscode-foreground: #CCCCCC;
      --vscode-descriptionForeground: #9D9D9D;
      --vscode-sideBar-background: #191A1B;
      --vscode-sideBarSectionHeader-border: rgba(255, 255, 255, 0.075);
      --vscode-widget-border: rgba(255, 255, 255, 0.075);
      --vscode-list-hoverBackground: rgba(255, 255, 255, 0.08);
      --vscode-toolbar-hoverBackground: rgba(255, 255, 255, 0.14);
      --vscode-list-activeSelectionBackground: rgba(255, 255, 255, 0.14);
      --vscode-list-activeSelectionForeground: #EDEDED;
      --vscode-badge-background: #3B82F6;
      --vscode-badge-foreground: #111114;
      --vscode-input-background: #1F2021;
      --vscode-input-foreground: #CCCCCC;
      --vscode-input-border: rgba(255, 255, 255, 0.075);
      --vscode-menu-background: #1F2021;
      --vscode-menu-foreground: #CCCCCC;
      --vscode-menu-border: #303134;
      --vscode-menu-selectionBackground: #3B82F6;
      --vscode-menu-selectionForeground: #111114;
      --vscode-progressBar-background: #3B82F6;
      --vscode-textLink-foreground: #4DAAFC;
      --vscode-errorForeground: #F85149;
      --vscode-focusBorder: #3B82F6;
      --vscode-chat-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, Roboto, sans-serif;
      --vscode-chat-font-size: 13px;
    }
  </style>
  <script>
    window.acquireVsCodeApi = () => ({
      getState: () => window.__hubVscodeState || {},
      setState: (s) => { window.__hubVscodeState = s; },
      postMessage: (m) => {
        (window.__hubSentMessages ||= []).push(m);
        if (m && m.action === 'ready') window.__hubReady = true;
      }
    });
  </script>`;
  return rawHtml
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\s*/i, '')
    .replace('href="{{css}}"', 'href="/hub.css"')
    .replace('nonce="{{nonce}}" src="{{js}}"', 'src="/hub.js"')
    .replace('<body>', '<body class="vscode-dark">')
    .replace('</head>', `${cssVars}</head>`);
}

function buildCompareHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>THEO Extension vs PWA Parity</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #0c0d0e; overflow: hidden; display: flex; }
    .pane-hub { width: 300px; height: 100%; border-right: 1px solid #2b2d30; flex: 0 0 300px; display: flex; flex-direction: column; }
    .pane-pwa { flex: 1 1 0; height: 100%; min-width: 0; display: flex; flex-direction: column; }
    iframe { width: 100%; height: 100%; border: none; display: block; background: #191A1B; }
  </style>
</head>
<body>
  <div class="pane-hub"><iframe id="frame-hub" src="/hub"></iframe></div>
  <div class="pane-pwa"><iframe id="frame-pwa" src="/?nosse=1&tab=chat"></iframe></div>
</body>
</html>`;
}

function startParityServer() {
  const fixture = buildParityFixture();
  const hubHtml = buildHubHtmlShim();
  const compareHtml = buildCompareHtml();

  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        const u = new URL(req.url, 'http://127.0.0.1');
        if (u.pathname === '/compare') {
          res.writeHead(200, { 'Content-Type': MIME_TYPES['.html'], 'Cache-Control': 'no-store' });
          res.end(compareHtml);
          return;
        }
        if (u.pathname === '/hub') {
          res.writeHead(200, { 'Content-Type': MIME_TYPES['.html'], 'Cache-Control': 'no-store' });
          res.end(hubHtml);
          return;
        }
        if (u.pathname === '/hub.css' || u.pathname === '/hub.js') {
          const fp = path.join(HUB_RESOURCES, u.pathname.slice(1));
          const ext = path.extname(fp);
          res.writeHead(200, { 'Content-Type': MIME_TYPES[ext], 'Cache-Control': 'no-store' });
          fs.createReadStream(fp).pipe(res);
          return;
        }
        if (u.pathname === '/api/ping') {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ ok: true, service: 'theo-parity-mock', authRequired: false }));
          return;
        }
        if (u.pathname === '/api/state') {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ ok: true, state: fixture.statePayload }));
          return;
        }
        if (u.pathname === '/api/thread') {
          const tid = String(u.searchParams.get('id') || 'sess-run');
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(
            JSON.stringify({
              ok: true,
              thread: {
                id: tid,
                title: 'VS Code Parity Audit & UI Polish',
                provider: 'antigravity',
                messages: fixture.threadMessages
              }
            })
          );
          return;
        }
        let rel = decodeURIComponent(u.pathname);
        if (rel === '/' || rel === '') rel = '/index.html';
        const fp = path.resolve(THEO_ROOT, '.' + rel);
        if (!fp.startsWith(THEO_ROOT) || !fs.existsSync(fp) || !fs.statSync(fp).isFile()) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const ext = path.extname(fp).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        fs.createReadStream(fp).pipe(res);
      } catch (err) {
        res.writeHead(500);
        res.end(String(err));
      }
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port, fixture }));
    srv.on('error', reject);
  });
}

async function runParity() {
  if (!fs.existsSync(path.join(HUB_RESOURCES, 'hub.html'))) {
    throw new Error(`Extension resources missing at ${HUB_RESOURCES}`);
  }
  const args = process.argv.slice(2);
  const ssIdx = args.indexOf('--screenshot');
  const screenshotPath = ssIdx >= 0 && args[ssIdx + 1] ? path.resolve(args[ssIdx + 1]) : '';

  const { srv, port, fixture } = await startParityServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  const os = require('os');
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'theo-parity-edge-'));

  const { srv: cdpProbeSrv, port: reservedPort } = await new Promise((resolve, reject) => {
    const net = require('net');
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve({ srv: null, port: p }));
    });
    s.on('error', reject);
  });
  void cdpProbeSrv;

  const edgeProc = spawn(
    findEdgeBinary(),
    [
      '--headless=new',
      `--remote-debugging-port=${reservedPort}`,
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
    const versionInfo = await waitForJson(`http://127.0.0.1:${reservedPort}/json/version`);
    cdp = new CdpSession(versionInfo.webSocketDebuggerUrl);
    await cdp.connect();

    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const pageErrors = [];
    cdp.ws.addEventListener('message', (ev) => {
      const m = JSON.parse(String(ev.data));
      if (m.method === 'Runtime.exceptionThrown') {
        pageErrors.push(m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text || 'err');
      }
    });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1740, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);

    const cachePayload = {
      updatedAt: Date.now(),
      state: fixture.statePayload,
      threads: {
        'sess-run': { id: 'sess-run', title: 'VS Code Parity Audit & UI Polish', provider: 'antigravity', messages: fixture.threadMessages }
      }
    };
    const seedPrefs = {
      theme: 'dark',
      themeUserSet: true,
      palette: 'graphite',
      lastDarkPalette: 'graphite',
      sidebarCollapsed: false,
      sidebarFilter: 'all',
      sidebarProvider: 'all',
      openEditorTabs: ['sess-run', 'sess-wait', 'sess-boxmind'],
      selectedThreadId: 'sess-run',
      composerMode: 'reply',
      desktopWorkbenchBootV92: true,
      customBridgeUrl: baseUrl,
      activeTab: 'chat',
      sound: false
    };

    await cdp.send(
      'Page.addScriptToEvaluateOnNewDocument',
      {
        source: `
          window.__THEO_HEADLESS_TEST = true;
          try {
            if (location.pathname !== '/hub' && location.pathname !== '/compare') {
              localStorage.setItem('theo_remote_cache_v3', ${JSON.stringify(JSON.stringify(cachePayload))});
              localStorage.setItem('theo_remote_prefs_v1', ${JSON.stringify(JSON.stringify(seedPrefs))});
            }
          } catch {}
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
        throw new Error(`Parity eval error: ${res.exceptionDetails.exception?.description || res.exceptionDetails.text}`);
      }
      return res.result?.value;
    };

    await cdp.send('Page.navigate', { url: `${baseUrl}/compare` }, sessionId);

    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) {
      await new Promise((r) => setTimeout(r, 120));
      ready = await evalJs(`(() => {
        const fh = document.getElementById('frame-hub');
        const fp = document.getElementById('frame-pwa');
        if (!fh?.contentDocument?.body || !fp?.contentDocument?.body) return false;
        const pwaReady = fp.contentDocument.querySelectorAll('#ide-sidebar-tree .ide-tree-row').length >= 4 &&
          fp.contentDocument.querySelectorAll('#ide-sidebar-accounts .ide-acct-card').length === 4;
        const hubReady = Boolean(fh.contentWindow.__hubReady && fh.contentDocument.getElementById('account-cards-list'));
        return pwaReady && hubReady;
      })()`).catch(() => false);
    }
    assert.strictEqual(ready, true, 'Both Hub and PWA iframes must finish rendering');

    await evalJs(`((payload) => {
      const fh = document.getElementById('frame-hub');
      fh.contentWindow.postMessage({ type: 'state', seq: 1, ...payload }, '*');
      return true;
    })(${JSON.stringify(fixture.statePayload)})`);

    let hubHydrated = false;
    for (let i = 0; i < 30 && !hubHydrated; i++) {
      await new Promise((r) => setTimeout(r, 80));
      hubHydrated = await evalJs(`(() => {
        const hd = document.getElementById('frame-hub').contentDocument;
        return hd.querySelectorAll('.provider-card').length === 4 && hd.querySelectorAll('.session-item').length >= 4;
      })()`);
    }
    if (!hubHydrated) {
      const diag = await evalJs(`(() => {
        const hd = document.getElementById('frame-hub').contentDocument;
        const hw = document.getElementById('frame-hub').contentWindow;
        return {
          cards: hd.querySelectorAll('.provider-card').length,
          rows: hd.querySelectorAll('.session-item').length,
          sent: hw.__hubSentMessages,
          bodyLen: hd.body.innerHTML.length,
          listHtml: hd.getElementById('list')?.innerHTML?.slice(0, 300) || ''
        };
      })()`);
      throw new Error(`Hub hydration diag: ${JSON.stringify(diag)} | errors: ${JSON.stringify(pageErrors)}`);
    }
    await new Promise((r) => setTimeout(r, 180));

    if (screenshotPath) {
      fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
      fs.writeFileSync(screenshotPath, Buffer.from(shot.data, 'base64'));
      await evalJs(`(() => {
        const hd = document.getElementById('frame-hub').contentDocument;
        const pd = document.getElementById('frame-pwa').contentDocument;
        hd.documentElement.scrollTop = 420;
        const side = pd.getElementById('ide-explorer-sidebar');
        if (side) side.scrollTop = 420;
        return true;
      })()`);
      await new Promise((r) => setTimeout(r, 80));
      const sessPath = screenshotPath.replace(/\.png$/i, '.sessions.png');
      const shotSess = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
      fs.writeFileSync(sessPath, Buffer.from(shotSess.data, 'base64'));
      await evalJs(`(() => {
        const hd = document.getElementById('frame-hub').contentDocument;
        const pd = document.getElementById('frame-pwa').contentDocument;
        hd.documentElement.scrollTop = 0;
        const side = pd.getElementById('ide-explorer-sidebar');
        if (side) side.scrollTop = 0;
        return true;
      })()`);
      await new Promise((r) => setTimeout(r, 60));
      console.log(`[SCREENSHOT] Saved side-by-side renders to ${screenshotPath} & ${sessPath}`);
    }

    const report = await evalJs(`(() => {
      const hd = document.getElementById('frame-hub').contentDocument;
      const hw = document.getElementById('frame-hub').contentWindow;
      const pd = document.getElementById('frame-pwa').contentDocument;
      const pw = document.getElementById('frame-pwa').contentWindow;
      const rgbNums = (c) => (String(c).match(/-?\\d*\\.?\\d+/g) || []).slice(0, 3).map(Number);
      const maxRgbDiff = (a, b) => {
        const va = rgbNums(a), vb = rgbNums(b);
        return (va.length === 3 && vb.length === 3) ? Math.max(...va.map((v, i) => Math.abs(v - vb[i]))) : 999;
      };
      const isShown = (el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const cs = el.ownerDocument.defaultView.getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
      };

      const hubSidebarBg = hw.getComputedStyle(hd.body).backgroundColor;
      const pwaSideEl = pd.getElementById('ide-explorer-sidebar');
      const pwaSidebarBg = pw.getComputedStyle(pwaSideEl).backgroundColor;
      const pwaObsBg = pw.getComputedStyle(pd.querySelector('.main-stage')).backgroundColor;

      const hubRow = hd.querySelector('.session-item');
      const pwaRow = pd.querySelector('#ide-sidebar-tree .ide-tree-row');
      const hubGrp = hd.querySelector('.group-header');
      const pwaGrp = pd.querySelector('#ide-sidebar-tree .ide-tree-group-hdr');
      const hubTask = hd.querySelector('.bg-task-row');
      const pwaTask = pd.querySelector('#ide-sidebar-bgtasks .ide-bg-row');
      const hubProvTab = hd.querySelector('#provider-bar .provider-tab');
      const pwaProvBar = pd.getElementById('ide-provider-bar');
      const pwaProvTabs = [...pd.querySelectorAll('#ide-provider-bar .ide-provider-tab')];

      const hubRunDot = hd.querySelector('.status-dot.running');
      const pwaRunDot = pd.querySelector('#ide-sidebar-tree .ide-dot.working');
      const hubWaitDot = hd.querySelector('.status-dot.waiting');
      const pwaWaitDot = pd.querySelector('#ide-sidebar-tree .ide-dot.waiting');
      const hubUnreadDot = hd.querySelector('.status-dot.unread');
      const pwaUnreadDot = pd.querySelector('#ide-sidebar-tree .ide-dot.unread');
      const pwaClosedDot = pd.querySelector('#ide-sidebar-tree .ide-dot.closed');

      const pwaGroupPills = [...pd.querySelectorAll('#ide-sidebar-tree .ide-tree-group-hdr')].map((hdr) => {
        const p = hdr.querySelector('.ide-group-pill');
        return p ? Math.round(hdr.getBoundingClientRect().right - p.getBoundingClientRect().right) : 999;
      });
      const pwaIdleCards = [...pd.querySelectorAll('#ide-sidebar-accounts .ide-acct-card:not(.is-active)')];
      const pwaIdleCollapsedCount = pwaIdleCards.filter((c) => c.classList.contains('collapsed')).length;

      const moveDual = pd.querySelector('#ide-sidebar-accounts .ide-acct-move-group.dual');
      const moveBtns = moveDual ? [...moveDual.querySelectorAll('button')] : [];
      const moveDualBox = moveDual ? moveDual.getBoundingClientRect() : null;
      const moveBtnRects = moveBtns.map((b) => {
        const origDisp = b.style.display;
        b.style.display = 'inline-flex';
        const rr = b.getBoundingClientRect();
        b.style.display = origDisp;
        return { top: rr.top, bottom: rr.bottom, height: rr.height };
      });

      const filterStripEl = pd.getElementById('ide-sidebar-filters');
      const filterStripRect = filterStripEl ? filterStripEl.getBoundingClientRect() : null;
      const filterChips = [...pd.querySelectorAll('#ide-sidebar-filters .ide-fchip')].filter(isShown).map((c) => ({
        text: c.textContent.trim(),
        top: Math.round(c.getBoundingClientRect().top),
        right: Math.round(c.getBoundingClientRect().right),
        bottom: Math.round(c.getBoundingClientRect().bottom)
      }));
      const hideDesktopEl = pd.getElementById('ide-hide-desktop-chip');

      const footBtns = [...pd.querySelectorAll('#ide-sidebar-footer .ide-foot-btn')].map((b) => {
        const lbl = b.querySelector('.ide-foot-lbl');
        const svg = b.querySelector('svg');
        return {
          label: lbl ? lbl.textContent.trim() : '',
          lblVisible: isShown(lbl),
          hasSvg: Boolean(svg && isShown(svg)),
          lblBelowSvg: Boolean(svg && lbl && lbl.getBoundingClientRect().top >= svg.getBoundingClientRect().bottom - 2)
        };
      });

      const bannedGlyphs = ['⋯', '⇄', '■', '↑', '↓', '×', '✎', '↩', '✕', '●', '◈', '▪'];
      const glyphViolations = [];
      const checkBtnScope = [
        ...pd.querySelectorAll('#ide-explorer-sidebar button, #ide-editor-tabs button, #btn-chat-more, #btn-toggle-composer-route, #ide-bgtasks-stop-all, #btn-close-inspector')
      ];
      for (const btn of checkBtnScope) {
        if (btn.id === 'btn-composer-mention' || btn.id === 'btn-composer-slash') continue;
        const txt = String(btn.textContent || '');
        for (const g of bannedGlyphs) {
          if (txt.includes(g)) glyphViolations.push({ id: btn.id || btn.className, glyph: g, txt: txt.trim() });
        }
      }

      const activeTab = pd.querySelector('#ide-editor-tabs .ide-editor-tab.active');
      const h2 = pd.querySelector('#chat-stream .md-h2');
      const h3 = pd.querySelector('#chat-stream .md-h3');
      const h4 = pd.querySelector('#chat-stream .md-h4');
      const tableWrap = pd.querySelector('#chat-stream .md-table-wrap');
      const inlineCode = pd.querySelector('#chat-stream .turn-text code:not(pre code)');
      const qSubmitBtn = pd.querySelector('#ide-sidebar-questions .sb-q-btn.primary');
      const activeTabCs = activeTab ? pw.getComputedStyle(activeTab) : null;
      const codeCs = inlineCode ? pw.getComputedStyle(inlineCode) : null;
      const codeRgb = codeCs ? rgbNums(codeCs.color) : [];
      const codeSpread = codeRgb.length === 3 ? Math.max(...codeRgb) - Math.min(...codeRgb) : 999;

      return {
        hubSidebarBg,
        pwaSidebarBg,
        sidebarBgDiff: maxRgbDiff(hubSidebarBg, pwaSidebarBg),
        pwaObsBg,
        pwaSideWidth: Math.round(pwaSideEl.getBoundingClientRect().width),
        hubScrollX: hd.documentElement.scrollWidth > hd.documentElement.clientWidth,
        pwaScrollX: pwaSideEl.scrollWidth > pwaSideEl.clientWidth,
        hubRowH: hubRow ? Math.round(hubRow.getBoundingClientRect().height) : 0,
        pwaRowH: pwaRow ? Math.round(pwaRow.getBoundingClientRect().height) : 0,
        hubGrpH: hubGrp ? Math.round(hubGrp.getBoundingClientRect().height) : 0,
        pwaGrpH: pwaGrp ? Math.round(pwaGrp.getBoundingClientRect().height) : 0,
        hubTaskH: hubTask ? Math.round(hubTask.getBoundingClientRect().height) : 0,
        pwaTaskH: pwaTask ? Math.round(pwaTask.getBoundingClientRect().height) : 0,
        pwaProvBarVisible: isShown(pwaProvBar),
        pwaProvTabsCount: pwaProvTabs.filter(isShown).length,
        hubProvTabH: hubProvTab ? Math.round(hubProvTab.getBoundingClientRect().height) : 0,
        pwaProvTabH: pwaProvTabs[0] ? Math.round(pwaProvTabs[0].getBoundingClientRect().height) : 0,
        runDotMatch: maxRgbDiff(hw.getComputedStyle(hubRunDot).backgroundColor, pw.getComputedStyle(pwaRunDot).backgroundColor),
        waitDotMatch: maxRgbDiff(hw.getComputedStyle(hubWaitDot).backgroundColor, pw.getComputedStyle(pwaWaitDot).backgroundColor),
        unreadDotMatch: maxRgbDiff(hw.getComputedStyle(hubUnreadDot).backgroundColor, pw.getComputedStyle(pwaUnreadDot).backgroundColor),
        unreadDotShown: isShown(pwaUnreadDot),
        closedDotHidden: Boolean(pwaClosedDot && pw.getComputedStyle(pwaClosedDot).display === 'none'),
        pwaGroupPills,
        pwaIdleCardCount: pwaIdleCards.length,
        pwaIdleCollapsedCount,
        moveDualCount: moveBtns.length,
        moveDualWidth: moveDualBox ? Math.round(moveDualBox.width) : 0,
        moveBtnRects,
        filterChips,
        filterStripScrollX: Boolean(filterStripEl && filterStripEl.scrollWidth > filterStripEl.clientWidth),
        filterStripRight: filterStripRect ? Math.round(filterStripRect.right) : 0,
        hideDesktopShown: isShown(hideDesktopEl),
        hideDesktopParentClass: hideDesktopEl ? hideDesktopEl.parentElement.className : '',
        hideDesktopInFilters: Boolean(hideDesktopEl && pd.getElementById('ide-sidebar-filters').contains(hideDesktopEl)),
        footBtns,
        glyphViolations,
        activeTabTopWidth: activeTabCs ? activeTabCs.borderTopWidth : '',
        activeTabTopColor: activeTabCs ? activeTabCs.borderTopColor : '',
        h2Size: h2 ? parseFloat(pw.getComputedStyle(h2).fontSize) : 0,
        h3Size: h3 ? parseFloat(pw.getComputedStyle(h3).fontSize) : 0,
        h4Size: h4 ? parseFloat(pw.getComputedStyle(h4).fontSize) : 0,
        tableBorder: tableWrap ? pw.getComputedStyle(tableWrap).borderTopStyle : '',
        codeBorder: codeCs ? codeCs.borderTopStyle : '',
        codeSpread,
        qSubmitBg: qSubmitBtn ? pw.getComputedStyle(qSubmitBtn).backgroundColor : ''
      };
    })()`);

    function validateParity(r) {
      assert.strictEqual(r.pwaSideWidth, 300, `PWA sidebar width must be 300px (got ${r.pwaSideWidth})`);
      assert.ok(r.sidebarBgDiff <= 3, `Sidebar bg drift vs Hub: ${r.hubSidebarBg} vs ${r.pwaSidebarBg}`);
      assert.strictEqual(r.hubScrollX, false, 'Hub sidebar must not scroll horizontally');
      assert.strictEqual(r.pwaScrollX, false, 'PWA sidebar must not scroll horizontally');
      assert.strictEqual(r.hubRowH, 28, `Hub session row must be 28px (got ${r.hubRowH})`);
      assert.strictEqual(r.pwaRowH, 28, `PWA session row must be 28px (got ${r.pwaRowH})`);
      assert.strictEqual(r.hubGrpH, 26, `Hub group header must be 26px (got ${r.hubGrpH})`);
      assert.strictEqual(r.pwaGrpH, 26, `PWA group header must be 26px (got ${r.pwaGrpH})`);
      assert.strictEqual(r.hubTaskH, 26, `Hub side-task row must be 26px (got ${r.hubTaskH})`);
      assert.strictEqual(r.pwaTaskH, 26, `PWA side-task row must be 26px (got ${r.pwaTaskH})`);
      assert.strictEqual(r.pwaProvBarVisible, true, 'Provider bar must be visible when both providers have sessions');
      assert.strictEqual(r.pwaProvTabsCount, 3, 'Provider bar must show 3 tabs (All, Antigravity, Claude)');
      assert.strictEqual(r.pwaProvTabH, r.hubProvTabH, `PWA provider tab height must match Hub (${r.pwaProvTabH} vs ${r.hubProvTabH})`);
      assert.strictEqual(r.pwaProvTabH, 24, `PWA provider tab must be 24px tall (got ${r.pwaProvTabH})`);
      assert.ok(r.runDotMatch <= 2, `Running dot colour mismatch vs Hub (diff ${r.runDotMatch})`);
      assert.ok(r.waitDotMatch <= 2, `Waiting dot colour mismatch vs Hub (diff ${r.waitDotMatch})`);
      assert.ok(r.unreadDotMatch <= 2, `Unread dot colour mismatch vs Hub (diff ${r.unreadDotMatch})`);
      assert.strictEqual(r.unreadDotShown, true, 'Unread session dot must be visible');
      assert.strictEqual(r.closedDotHidden, true, 'Closed idle read session dot must be hidden');
      for (const pillInset of r.pwaGroupPills) {
        assert.ok(pillInset >= 0 && pillInset <= 12, `Group count pill must sit flush right inside header (inset=${pillInset}px)`);
      }
      assert.strictEqual(r.pwaIdleCardCount, 2, 'Fixture has 2 idle accounts across multi-account providers');
      assert.strictEqual(r.pwaIdleCollapsedCount, 2, `Idle accounts of multi-account providers must start collapsed (got ${r.pwaIdleCollapsedCount}/2)`);
      assert.strictEqual(r.moveDualCount, 2, 'Middle multi-account card must have 2 vertical reorder buttons');
      assert.ok(r.moveBtnRects[1].top >= r.moveBtnRects[0].bottom - 1, 'Dual account reorder arrows must stack vertically');
      assert.strictEqual(r.filterChips.length, 6, `Filter strip must have 6 visible chips (got ${r.filterChips.length})`);
      const chipTops = r.filterChips.map((c) => c.top);
      assert.ok(Math.max(...chipTops) - Math.min(...chipTops) <= 2, `Filter chips wrapped onto multiple rows: tops=${JSON.stringify(chipTops)}`);
      assert.strictEqual(r.filterStripScrollX, false, 'Filter strip must not clip or scroll horizontally');
      for (const chip of r.filterChips) {
        assert.ok(chip.right <= r.filterStripRight + 1, `Filter chip "${chip.text}" clipped horizontally (${chip.right} > ${r.filterStripRight})`);
      }
      assert.strictEqual(r.hideDesktopShown, true, 'Hide Desktop chip must be visible when desktop sessions exist');
      assert.strictEqual(r.hideDesktopInFilters, false, 'Hide Desktop chip must be in SESSIONS header, not #ide-sidebar-filters');
      assert.strictEqual(r.footBtns.length, 6, 'Sidebar footer must have 6 quick-action buttons');
      for (const fb of r.footBtns) {
        assert.strictEqual(fb.lblVisible, true, `Footer label "${fb.label}" must be visible on desktop`);
        assert.strictEqual(fb.hasSvg, true, `Footer button "${fb.label}" must show SVG icon`);
        assert.strictEqual(fb.lblBelowSvg, true, `Footer label "${fb.label}" must sit below icon`);
      }
      assert.deepStrictEqual(r.glyphViolations, [], `Raw text glyphs found in buttons: ${JSON.stringify(r.glyphViolations)}`);
      assert.strictEqual(r.activeTabTopWidth, '1px', `Active Graphite tab must use 1px top border (got ${r.activeTabTopWidth})`);
      assert.strictEqual(r.activeTabTopColor, 'rgb(59, 130, 246)', `Active Graphite tab border must be --steel (got ${r.activeTabTopColor})`);
      assert.ok(r.h2Size > r.h3Size && r.h3Size > r.h4Size, `Markdown heading hierarchy h2>h3>h4 broken (${r.h2Size}, ${r.h3Size}, ${r.h4Size})`);
      assert.strictEqual(r.tableBorder, 'none', `Graphite markdown tables must be borderless (got ${r.tableBorder})`);
      assert.strictEqual(r.codeBorder, 'none', `Inline code must be borderless (got ${r.codeBorder})`);
      assert.ok(r.codeSpread <= 3, `Graphite inline code colour must be neutral white/grey (spread=${r.codeSpread})`);
      assert.strictEqual(r.qSubmitBg, 'rgb(59, 130, 246)', `Graphite question submit button must use --steel (got ${r.qSubmitBg})`);
    }

    validateParity(report);

    // Verify first-click expansion AND second-click collapse reversal of a default-collapsed idle account card
    const firstClickExpand = await evalJs(`(async () => {
      const pd = document.getElementById('frame-pwa').contentDocument;
      const idleBtn = pd.querySelector('#ide-sidebar-accounts .ide-acct-card.collapsed [data-quota-collapse]');
      if (!idleBtn) return { found: false };
      const key = idleBtn.dataset.quotaCollapse;
      const beforeExp = idleBtn.getAttribute('aria-expanded');
      idleBtn.click();
      await new Promise((r) => setTimeout(r, 80));
      const afterBtn = pd.querySelector('#ide-sidebar-accounts [data-quota-collapse="' + key + '"]');
      const afterExp = afterBtn ? afterBtn.getAttribute('aria-expanded') : null;
      const stillCollapsed = Boolean(afterBtn?.closest('.ide-acct-card')?.classList.contains('collapsed'));
      afterBtn?.click();
      await new Promise((r) => setTimeout(r, 80));
      const revBtn = pd.querySelector('#ide-sidebar-accounts [data-quota-collapse="' + key + '"]');
      return {
        found: true,
        beforeExp,
        afterExp,
        stillCollapsed,
        revExp: revBtn ? revBtn.getAttribute('aria-expanded') : null,
        revCollapsed: Boolean(revBtn?.closest('.ide-acct-card')?.classList.contains('collapsed'))
      };
    })()`);
    assert.strictEqual(firstClickExpand.found, true, 'Collapsed idle card toggle button must exist');
    assert.strictEqual(firstClickExpand.beforeExp, 'false', 'Collapsed idle card must start aria-expanded="false"');
    assert.strictEqual(firstClickExpand.afterExp, 'true', 'One click on collapsed idle card must expand it immediately');
    assert.strictEqual(firstClickExpand.stillCollapsed, false, 'Card must no longer carry .collapsed after first click');
    assert.strictEqual(firstClickExpand.revExp, 'false', 'Second click must set aria-expanded="false"');
    assert.strictEqual(firstClickExpand.revCollapsed, true, 'Second click must restore .collapsed class');

    // Negative planted-regression self-tests (ensuring parity checks cannot silently pass on broken DOM)
    const plantedChecks = [
      ['wrapped filter chips', { ...report, filterChips: [...report.filterChips.slice(0, 5), { text: 'Archived', top: report.filterChips[0].top + 26, right: report.filterChips[5].right, bottom: report.filterChips[0].top + 48 }] }],
      ['horizontally clipped filter chip', { ...report, filterStripScrollX: true }],
      ['missing footer label', { ...report, footBtns: report.footBtns.map((f, i) => (i === 0 ? { ...f, lblVisible: false } : f)) }],
      ['text glyph button', { ...report, glyphViolations: [{ id: 'btn-chat-more', glyph: '⋯', txt: '⋯' }] }],
      ['unhidden closed dot', { ...report, closedDotHidden: false }],
      ['idle cards all open by default', { ...report, pwaIdleCollapsedCount: 0 }],
      ['non-stacked reorder arrows', { ...report, moveBtnRects: [{ top: 10, bottom: 20, height: 10 }, { top: 10, bottom: 20, height: 10 }] }]
    ];
    let caughtCount = 0;
    for (const [label, mutated] of plantedChecks) {
      let threw = false;
      try {
        validateParity(mutated);
      } catch {
        threw = true;
      }
      assert.strictEqual(threw, true, `Planted parity regression "${label}" was not caught`);
      caughtCount++;
    }

    console.log(
      `[PASS] VS Code Extension vs PWA Parity Gate: 300px #191A1B sidebar, 28px rows, 26px groups/tasks, flush counts, 24px provider bar, 1-row filters, 6 labeled footer icons, 1.3px SVGs (0 raw glyphs), default-collapsed idle accounts (1-click expand), Graphite 1px tab + typography/tables; ${caughtCount}/${caughtCount} planted regressions caught`
    );
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
    }, 300);
  }
}

runParity().catch((err) => {
  console.error(err);
  process.exit(1);
});
