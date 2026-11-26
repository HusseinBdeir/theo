'use strict';
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function findBrowser() {
  for (const p of [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ]) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('msedge.exe / chrome.exe not found');
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
    s.on('error', reject);
  });
}

function startStatic(root) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split('?')[0]);
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.join(root, rel);
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.handlers = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve);
      this.ws.addEventListener('error', reject);
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const h of this.handlers) h(msg);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  on(fn) {
    this.handlers.push(fn);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64u = (objOrStr) =>
  Buffer.from(typeof objOrStr === 'string' ? objOrStr : JSON.stringify(objOrStr), 'utf8').toString('base64url');

async function main() {
  // 1. Static checks: v87 lockstep, SW origin-aware workers.dev check, Cloudflare URLs, signed AEA1 shortcut
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const appJs = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  const installPs1 = fs.readFileSync(path.join(ROOT, 'install.ps1'), 'utf8');
  const cmdHtml = fs.readFileSync(path.join(ROOT, 'command', 'index.html'), 'utf8');
  const plnHtml = fs.readFileSync(path.join(ROOT, 'planner', 'index.html'), 'utf8');

  assert.equal(manifest.id, './', 'manifest.id must be ./');
  const swVerMatch = sw.match(/CACHE_NAME = 'theo-remote-v(\d+)'/);
  assert.ok(swVerMatch && Number(swVerMatch[1]) >= 88, 'sw.js must be >= v88');
  const swVer = swVerMatch[1];
  assert.ok(html.includes(`css/theo.css?v=${swVer}`) && html.includes(`js/app.js?v=${swVer}`), 'index.html must match sw.js version');
  assert.ok(manifest.icons.every((ic) => String(ic.src || '').includes(`?v=${swVer}`)), 'manifest.json icons must match sw.js version');
  assert.ok(appJs.includes(`register('sw.js?v=${swVer}'`), 'js/app.js SW registration must match sw.js version');
  assert.ok(sw.includes('url.origin !== self.location.origin && url.hostname.includes(\'workers.dev\')'), 'SW must cache same-origin theo.husseinbdeir.workers.dev assets');
  assert.ok(sw.includes("plannerRedirect = 'https://planner.husseinbdeir.workers.dev/'"), 'SW command redirect must point to Cloudflare Planner');
  assert.ok(!appJs.includes('https://husseinbdeir.github.io/'), 'no github.io URLs left in js/app.js (hostname check only)');
  assert.ok(!appJs.includes('https://raw.githubusercontent.com/HusseinBdeir/theo/main/install.ps1'), 'app.js install.ps1 URLs must use Cloudflare');
  assert.ok(installPs1.includes('https://theo.husseinbdeir.workers.dev/theo-hub-bundle.zip'), 'install.ps1 must fetch bundle from Cloudflare first');
  assert.ok(cmdHtml.includes('https://planner.husseinbdeir.workers.dev/') && plnHtml.includes('https://planner.husseinbdeir.workers.dev/'));
  const scBuf = fs.readFileSync(path.join(ROOT, 'assets', 'Sync-Apple-Health.shortcut'));
  assert.equal(scBuf.subarray(0, 4).toString('ascii'), 'AEA1', 'shortcut asset must be signed AEA1');

  // 2. Worker asset + quarantine tests
  const workerMod = await import(pathToFileURL(path.join(ROOT, 'cloudflare', 'worker.js')).href);
  const env = {
    ASSETS: {
      async fetch(req) {
        const u = new URL(req.url);
        return new Response(`asset:${u.pathname}`, { status: 200 });
      },
    },
  };
  for (const [p, expectedAsset] of [
    ['/', '/index.html'],
    ['/command', '/command/index.html'],
    ['/planner/', '/planner/index.html'],
    ['/theo-hub-bundle.zip', '/theo-hub-bundle.zip'],
    ['/install.ps1', '/install.ps1'],
  ]) {
    const r = await workerMod.default.fetch(new Request(`https://theo.husseinbdeir.workers.dev${p}`), env);
    assert.equal(r.status, 200, `expected 200 for ${p}`);
    assert.equal(await r.text(), `asset:${expectedAsset}`);
    assert.equal(r.headers.get('cache-control'), 'no-cache');
  }
  const rSc = await workerMod.default.fetch(new Request('https://theo.husseinbdeir.workers.dev/assets/Sync-Apple-Health.shortcut'), env);
  assert.equal(rSc.status, 200);
  assert.equal(rSc.headers.get('content-disposition'), 'attachment; filename="Sync-Apple-Health.shortcut"');
  assert.equal(rSc.headers.get('content-type'), 'application/octet-stream');

  for (const blocked of ['/README.md', '/scripts/verify_theo_pwa.cjs', '/cloudflare/worker.js', '/wrangler.toml', '/.git/HEAD', '/css/%2e%2e/wrangler.toml']) {
    const rb = await workerMod.default.fetch(new Request(`https://theo.husseinbdeir.workers.dev${blocked}`), env);
    assert.equal(rb.status, 404, `expected 404 for ${blocked}`);
  }
  const rBadPct = await workerMod.default.fetch(new Request('https://theo.husseinbdeir.workers.dev/%E0%A4%A'), env);
  assert.equal(rBadPct.status, 400);
  const rPost = await workerMod.default.fetch(new Request('https://theo.husseinbdeir.workers.dev/', { method: 'POST' }), env);
  assert.equal(rPost.status, 405);
  console.log('[PASS] THEO static & Cloudflare worker quarantine');

  // 3. CDP migration scenarios
  const browserExe = findBrowser();
  const cdpPort = await freePort();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'theo-mig-verify-'));
  const { srv, port } = await startStatic(ROOT);
  const base = `http://127.0.0.1:${port}`;
  const proc = spawn(
    browserExe,
    ['--headless=new', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${userDataDir}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--mute-audio', 'about:blank'],
    { stdio: 'ignore', windowsHide: true }
  );
  let cdp;
  const EDGE_A = 'a'.repeat(64);
  const EDGE_B = 'b'.repeat(64);

  try {
    let version = null;
    for (let i = 0; i < 60 && !version; i++) {
      await sleep(250);
      try { version = await (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).json(); } catch {}
    }
    assert.ok(version, 'CDP did not come up');
    cdp = new Cdp(version.webSocketDebuggerUrl);
    await cdp.ready;

    async function runCdpScenario(name, { url = '', preScript = '', storeGetStatus = 200, patchStatus = 200, mobile = false }, fn) {
      const { browserContextId } = await cdp.send('Target.createBrowserContext');
      const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId });
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
      const S = (m, p) => cdp.send(m, p, sessionId);
      const relayCalls = [];
      const exceptions = [];
      cdp.on(async (msg) => {
        if (msg.sessionId !== sessionId) return;
        if (msg.method === 'Runtime.exceptionThrown') {
          exceptions.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
          return;
        }
        if (msg.method !== 'Fetch.requestPaused') return;
        const req = msg.params.request;
        const u = new URL(req.url);
        if (u.hostname !== 'theo-edge-relay.husseinbdeir.workers.dev') {
          await S('Fetch.failRequest', { requestId: msg.params.requestId, errorReason: 'BlockedByClient' }).catch(() => {});
          return;
        }
        const body = (() => { try { return JSON.parse(req.postData || 'null'); } catch { return null; } })();
        relayCalls.push({ path: u.pathname, op: body?.op, body });
        let status = 200;
        let resp = { ok: true, docs: {} };
        if (body?.op === 'get' || body?.op === 'get_theo') {
          status = storeGetStatus;
          resp = storeGetStatus >= 400
            ? { ok: false }
            : {
                ok: true,
                docs: {
                  push_registry: {
                    items: [
                      { id: 'theo_dev_old_gh', app: 'theo', endpoint: 'https://push/old' },
                      { id: 'theo_dev_keep', app: 'theo', endpoint: 'https://push/keep' },
                    ],
                  },
                },
              };
        } else if (body?.op === 'patch') {
          status = patchStatus;
          resp = patchStatus >= 400 ? { ok: false } : { ok: true };
        }
        await S('Fetch.fulfillRequest', {
          requestId: msg.params.requestId,
          responseCode: status,
          responseHeaders: [
            { name: 'Content-Type', value: 'application/json' },
            { name: 'Access-Control-Allow-Origin', value: req.headers.Origin || req.headers.origin || base },
          ],
          body: Buffer.from(JSON.stringify(resp)).toString('base64'),
        }).catch(() => {});
      });
      await S('Runtime.enable');
      await S('Page.enable');
      await S('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] });
      if (mobile) {
        await S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
      }
      await S('Page.addScriptToEvaluateOnNewDocument', {
        source: `window.__THEO_ALLOW_PROBE_MOCK_FETCH = true; ${preScript}`,
      });
      await S('Page.navigate', { url: `${base}/${url}` });
      const ev = async (expr) => {
        const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
        return r.result.value;
      };
      const waitFor = async (expr) => {
        const t0 = Date.now();
        while (Date.now() - t0 < 10000) {
          try { if (await ev(expr)) return; } catch {}
          await sleep(100);
        }
        throw new Error(`${name}: timeout`);
      };
      await waitFor('document.readyState === "complete"');
      await sleep(1200);
      try {
        assert.deepEqual(exceptions, [], `${name}: uncaught exceptions`);
        await fn({ ev, waitFor, relayCalls });
        console.log(`[PASS] ${name}`);
      } finally {
        await cdp.send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
      }
    }

    // Scenario A: Happy-path migration on 390x844 strips hash, sanitizes unsafe HTTP relay URLs, imports valid key & PIN hash, retires oldPushDeviceId
    const tokenA = b64u({
      v: 1,
      app: 'theo',
      oldPushDeviceId: 'theo_dev_old_gh',
      ts: Date.now(),
      kv: {
        theo_remote_prefs_v1: {
          edgeAccessKey: EDGE_A,
          edgeRelayUrl: 'ws://insecure.evil.example/ws', // MUST be stripped by isSafeEdgeEndpointUrl
          cloudUrl: 'http://insecure.evil.example/store', // MUST be stripped by isSafeCloudEndpointUrl
          theme: 'light',
          themeUserSet: true,
        },
        theo_remote_checked_notifs_v1: ['n_old_1'],
        evil_foreign_key: 'blocked',
      },
    });
    await runCdpScenario('THEO CDP #migrate=: strips hash, sanitizes URLs, fits 390px, retires oldPushDeviceId', { url: `#migrate=${tokenA}`, mobile: true }, async ({ ev, relayCalls }) => {
      assert.equal(await ev('location.hash'), '');
      assert.equal(await ev(`localStorage.getItem('evil_foreign_key')`), null);
      const prefs = JSON.parse(await ev(`localStorage.getItem('theo_remote_prefs_v1')`));
      assert.equal(prefs.edgeAccessKey, EDGE_A);
      assert.ok(!String(prefs.edgeRelayUrl || '').includes('insecure.evil.example'), 'unsafe ws:// URL rejected');
      assert.ok(!String(prefs.cloudUrl || '').includes('insecure.evil.example'), 'unsafe http:// cloud URL rejected');
      const scrollW = await ev('document.documentElement.scrollWidth');
      assert.ok(scrollW <= 390, `horizontal overflow on 390px: ${scrollW}`);
      const patch = relayCalls.find((c) => c.op === 'patch' && c.body?.patch?.push_registry);
      assert.ok(patch, 'push_registry patch sent');
      const ids = patch.body.patch.push_registry.items.map((x) => x.id);
      assert.ok(!ids.includes('theo_dev_old_gh'), 'oldPushDeviceId retired');
      assert.ok(ids.includes('theo_dev_keep'), 'other devices preserved');
      assert.equal(JSON.parse(await ev(`localStorage.getItem('theo_remote_migrated_from_v1')`)).pushRetired, true);
    });

    // Scenario B: PIN-locked target defers migration until PIN 1234 is entered, and refuses mismatched key even after unlock
    const pinHash1234 = crypto.createHash('sha256').update('theo-pin-v1:1234').digest('hex');
    const tokenMismatch = b64u({
      v: 1,
      app: 'theo',
      oldPushDeviceId: 'theo_dev_victim',
      ts: Date.now(),
      kv: { theo_remote_prefs_v1: { edgeAccessKey: EDGE_A, theme: 'light', themeUserSet: true } },
    });
    await runCdpScenario(
      'THEO CDP #migrate=: PIN-locked target defers migration and rejects key-mismatch after unlock',
      {
        url: `#migrate=${tokenMismatch}`,
        preScript: `try {
          if (!localStorage.getItem('theo_remote_pin_hash_v1')) localStorage.setItem('theo_remote_pin_hash_v1', '${pinHash1234}');
          if (!localStorage.getItem('theo_remote_prefs_v1')) localStorage.setItem('theo_remote_prefs_v1', JSON.stringify({ edgeAccessKey: '${EDGE_B}' }));
        } catch {}`,
      },
      async ({ ev }) => {
        assert.equal(await ev(`document.getElementById('pin-overlay').hidden`), false, 'PIN overlay must lock boot');
        assert.equal(await ev(`localStorage.getItem('theo_remote_migrated_from_v1')`), null, 'migration deferred while PIN locked');
        // Unlock PIN 1-2-3-4
        for (const d of ['1', '2', '3', '4']) {
          await ev(`document.querySelector('#pin-pad button[data-digit="${d}"]').click()`);
        }
        await sleep(300);
        assert.equal(await ev(`document.getElementById('pin-overlay').hidden`), true, 'PIN 1234 must unlock before testing key-mismatch');
        const prefsAfter = JSON.parse(await ev(`localStorage.getItem('theo_remote_prefs_v1')`));
        assert.equal(prefsAfter.edgeAccessKey, EDGE_B, 'existing edgeAccessKey must not be overwritten');
        assert.equal(await ev(`localStorage.getItem('theo_remote_migrated_from_v1')`), null, 'key mismatch after unlock must not write migration meta');
      }
    );

    // Scenario C: Failed patch (500) preserves pushRetired=false
    await runCdpScenario('THEO CDP #migrate=: failed patch preserves pushRetired=false', { url: `#migrate=${tokenA}`, patchStatus: 500 }, async ({ ev }) => {
      assert.equal(JSON.parse(await ev(`localStorage.getItem('theo_remote_migrated_from_v1')`)).pushRetired, false);
    });

    // Scenario D: Oversized, proto pollution, wrong app schema
    await runCdpScenario('THEO CDP #migrate=: oversized token stripped & rejected', { url: `#migrate=${'A'.repeat(262145)}` }, async ({ ev }) => {
      assert.equal(await ev('location.hash'), '');
      assert.equal(await ev(`localStorage.getItem('theo_remote_migrated_from_v1')`), null);
    });
    const badProto = b64u('{"v":1,"app":"theo","kv":{"__proto__":{"polluted":1}}}');
    await runCdpScenario('THEO CDP #migrate=: __proto__ key ignored', { url: `#migrate=${badProto}` }, async ({ ev }) => {
      assert.equal(await ev('({}).polluted'), undefined);
    });
    const wrongApp = b64u({ v: 1, app: 'planner', kv: { theo_remote_prefs_v1: { edgeAccessKey: EDGE_A } } });
    await runCdpScenario('THEO CDP #migrate=: wrong app schema rejected', { url: `#migrate=${wrongApp}` }, async ({ ev }) => {
      assert.equal(await ev(`localStorage.getItem('theo_remote_migrated_from_v1')`), null);
    });

    // Scenario E: End-to-end buildTheoMigrationUrl() round-trip preserves raw PIN hash and locks target
    let builtMigrateHash = '';
    await runCdpScenario(
      'THEO CDP #migrate= export: buildTheoMigrationUrl() preserves raw SHA-256 PIN hash',
      {
        url: '',
        preScript: `try {
          if (!localStorage.getItem('theo_remote_pin_hash_v1')) localStorage.setItem('theo_remote_pin_hash_v1', '${pinHash1234}');
          if (!localStorage.getItem('theo_remote_prefs_v1')) localStorage.setItem('theo_remote_prefs_v1', JSON.stringify({ edgeAccessKey: '${EDGE_A}', theme: 'light', themeUserSet: true }));
        } catch {}`,
      },
      async ({ ev }) => {
        const builtUrl = await ev('window.__theoTestWs.buildMigrationUrl()');
        assert.ok(String(builtUrl).startsWith('https://theo.husseinbdeir.workers.dev/#migrate='), `unexpected export url: ${String(builtUrl).slice(0, 64)}`);
        builtMigrateHash = String(builtUrl).slice(String(builtUrl).indexOf('#migrate='));
      }
    );
    await runCdpScenario(
      'THEO CDP #migrate= import round-trip: restored PIN hash locks migrated target',
      { url: builtMigrateHash },
      async ({ ev }) => {
        assert.equal(await ev(`localStorage.getItem('theo_remote_pin_hash_v1')`), pinHash1234);
        assert.equal(await ev(`document.getElementById('pin-overlay').hidden`), false, 'imported PIN hash must lock boot');
        for (const d of ['1', '2', '3', '4']) {
          await ev(`document.querySelector('#pin-pad button[data-digit="${d}"]').click()`);
        }
        await sleep(300);
        assert.equal(await ev(`document.getElementById('pin-overlay').hidden`), true, 'imported PIN 1234 must unlock');
        const prefs = JSON.parse(await ev(`localStorage.getItem('theo_remote_prefs_v1')`));
        assert.equal(prefs.edgeAccessKey, EDGE_A);
      }
    );

    console.log('verify_theo_migration: ALL CDP & WORKER CHECKS PASS');
  } finally {
    try { cdp?.ws.close(); } catch {}
    proc.kill();
    srv.close();
    await sleep(400);
    fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
