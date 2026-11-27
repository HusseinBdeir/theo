import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..');

function parseArgValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && idx + 1 < process.argv.length) {
    return String(process.argv[idx + 1] || '').trim();
  }
  return '';
}

const rawRoot = parseArgValue('--root');
const rawDist = parseArgValue('--dist');
const REPO_ROOT = rawRoot ? path.resolve(rawRoot) : DEFAULT_REPO_ROOT;
const DIST_DIR = rawDist ? path.resolve(rawDist) : path.join(REPO_ROOT, '.cf-dist');
const IS_DRY = process.argv.includes('--dry');

const EXPECTED_JS_ORDER = [
  'endpoints.js',
  'models.js',
  'transport.js',
  'sidebar.js',
  'inspector.js',
  'chat.js',
  'views.js',
  'app.js',
];

const EXACT_FILES = [
  'index.html',
  'reset.html',
  'sw.js',
  'manifest.json',
  'favicon.ico',
  'icon.svg',
  'icon-180.png',
  'icon-192.png',
  'icon-512.png',
  'icon-512-maskable.png',
  'theo-hub-bundle.zip',
  'install.ps1',
  'assets/Sync-Apple-Health.shortcut',
  'command/index.html',
  'planner/index.html',
];

const ALLOW_DIRS = ['brand', 'css', 'js'];

function copyDirRecursive(relDir, copied) {
  const absDir = path.join(REPO_ROOT, relDir);
  if (!fs.existsSync(absDir)) return;
  for (const ent of fs.readdirSync(absDir, { withFileTypes: true })) {
    const rel = path.posix.join(relDir, ent.name);
    if (ent.isDirectory()) {
      copyDirRecursive(rel, copied);
    } else if (ent.isFile()) {
      const src = path.join(REPO_ROOT, rel);
      const dst = path.join(DIST_DIR, rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      copied.push(rel);
    }
  }
}

function buildDist() {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });
  const copied = [];
  for (const rel of EXACT_FILES) {
    const src = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(src)) {
      throw new Error(`Missing required public file: ${rel}`);
    }
    const dst = path.join(DIST_DIR, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    copied.push(rel);
  }
  for (const dir of ALLOW_DIRS) {
    copyDirRecursive(dir, copied);
  }
  return copied;
}

function extractArrayLiteralEntries(src, constName) {
  const re = new RegExp(`const\\s+${constName}\\s*=\\s*\\[([\\s\\S]*?)\\];`);
  const m = src.match(re);
  if (!m) {
    throw new Error(`sw.js missing ${constName} array`);
  }
  return [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
}

function verifyAtomicShellParity(repoRoot, distDir) {
  const indexSrc = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
  const swSrc = fs.readFileSync(path.join(repoRoot, 'sw.js'), 'utf8');
  const manifestSrc = fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8');
  const appJsSrc = fs.readFileSync(path.join(repoRoot, 'js', 'app.js'), 'utf8');

  const cacheMatch = swSrc.match(/CACHE_NAME\s*=\s*['"]theo-remote-v(\d+)['"]/);
  if (!cacheMatch) {
    throw new Error('sw.js must define CACHE_NAME = "theo-remote-v<N>"');
  }
  const expectedVer = cacheMatch[1];

  const versionChecks = [
    ['index.html', indexSrc, /\?v=(\d+)/g],
    ['sw.js', swSrc, /\?v=(\d+)/g],
    ['manifest.json', manifestSrc, /\?v=(\d+)/g],
    ['js/app.js registerServiceWorker', appJsSrc, /serviceWorker\s*\.register\(\s*['"]sw\.js\?v=(\d+)['"]/g],
  ];
  for (const [label, src, re] of versionChecks) {
    const matches = [...src.matchAll(re)];
    if (matches.length === 0) {
      throw new Error(`Missing ?v=${expectedVer} version tag in ${label}`);
    }
    for (const m of matches) {
      if (m[1] !== expectedVer) {
        throw new Error(`Atomic ?v= mismatch in ${label}: found v=${m[1]}, expected v=${expectedVer}`);
      }
    }
  }

  const manifestObj = JSON.parse(manifestSrc);
  const icons = Array.isArray(manifestObj.icons) ? manifestObj.icons : [];
  if (icons.length === 0) {
    throw new Error('manifest.json must declare icons');
  }
  for (const ic of icons) {
    if (!String(ic?.src || '').includes(`?v=${expectedVer}`)) {
      throw new Error(`manifest.json icon "${ic?.src}" missing ?v=${expectedVer}`);
    }
  }

  const jsDir = path.join(repoRoot, 'js');
  const diskJsFiles = fs.readdirSync(jsDir).filter((f) => f.endsWith('.js')).sort();
  for (const reqMod of EXPECTED_JS_ORDER) {
    if (!diskJsFiles.includes(reqMod)) {
      throw new Error(`Missing expected js module on disk: js/${reqMod}`);
    }
  }

  const htmlScriptMatches = [...indexSrc.matchAll(/<script\s+src="js\/([^"?]+)\?v=(\d+)"><\/script>/g)];
  const htmlJsOrder = htmlScriptMatches.map((m) => m[1]);
  for (const m of htmlScriptMatches) {
    if (m[2] !== expectedVer) {
      throw new Error(`index.html script js/${m[1]} has ?v=${m[2]}, expected ?v=${expectedVer}`);
    }
  }

  const coreShell = extractArrayLiteralEntries(swSrc, 'CORE_SHELL');
  const optionalShell = extractArrayLiteralEntries(swSrc, 'OPTIONAL_SHELL');
  const swCoreJsFiles = coreShell
    .map((entry) => {
      const m = entry.match(/^\.\/js\/([^"?]+)\?v=(\d+)$/);
      return m ? { file: m[1], ver: m[2] } : null;
    })
    .filter(Boolean);

  for (const entry of swCoreJsFiles) {
    if (entry.ver !== expectedVer) {
      throw new Error(`sw.js CORE_SHELL ./js/${entry.file} has ?v=${entry.ver}, expected ?v=${expectedVer}`);
    }
  }

  const htmlJsSet = new Set(htmlJsOrder);
  const swJsSet = new Set(swCoreJsFiles.map((e) => e.file));
  for (const f of diskJsFiles) {
    if (!htmlJsSet.has(f)) {
      throw new Error(`Unreferenced JS file on disk missing from index.html: js/${f}`);
    }
    if (!swJsSet.has(f)) {
      throw new Error(`Unreferenced JS file on disk missing from sw.js CORE_SHELL: js/${f}`);
    }
  }
  for (const f of htmlJsSet) {
    if (!diskJsFiles.includes(f)) {
      throw new Error(`index.html references missing file: js/${f}`);
    }
  }
  for (const f of swJsSet) {
    if (!diskJsFiles.includes(f)) {
      throw new Error(`sw.js CORE_SHELL references missing file: js/${f}`);
    }
  }

  if (
    htmlJsOrder.length !== EXPECTED_JS_ORDER.length ||
    EXPECTED_JS_ORDER.some((name, idx) => htmlJsOrder[idx] !== name)
  ) {
    throw new Error(
      `index.html JS load order must be [${EXPECTED_JS_ORDER.join(', ')}], got [${htmlJsOrder.join(', ')}]`
    );
  }

  for (const shellEntry of [...coreShell, ...optionalShell]) {
    let rel = shellEntry.replace(/^\.\//, '').split('?')[0];
    if (!rel) rel = 'index.html';
    const stagedPath = path.join(distDir, rel);
    if (!fs.existsSync(stagedPath) || !fs.statSync(stagedPath).isFile()) {
      throw new Error(`sw.js shell entry "${shellEntry}" missing in staged dist (${rel})`);
    }
  }

  const swStaged = fs.readFileSync(path.join(distDir, 'sw.js'), 'utf8');
  new vm.Script(swStaged, { filename: 'sw.js' });
  for (const f of diskJsFiles) {
    const jsStaged = fs.readFileSync(path.join(distDir, 'js', f), 'utf8');
    new vm.Script(jsStaged, { filename: `js/${f}` });
  }

  return { expectedVer, jsCount: diskJsFiles.length };
}

const copied = buildDist();
const parity = verifyAtomicShellParity(REPO_ROOT, DIST_DIR);
// Design-token gate: no raw font sizes, radii or colours reach live (exits non-zero on a failure).
execFileSync(process.execPath, [path.join(__dirname, 'verify_design_tokens.cjs'), '--root', REPO_ROOT], { stdio: 'inherit' });
// VS Code Hub parity gate: extension sidebar and PWA sidebar render without geometric, colour or control-icon drift.
if (!process.argv.includes('--skip-vscode-parity')) {
  const parityScript = path.join(__dirname, 'verify_vscode_parity.cjs');
  if (fs.existsSync(parityScript)) {
    execFileSync(process.execPath, [parityScript], { stdio: 'inherit' });
  }
}
console.log(
  `[deploy_cf:theo] Staged ${copied.length} allowlisted public files into ${path.relative(REPO_ROOT, DIST_DIR) || '.cf-dist'} (atomic parity PASS: v${parity.expectedVer}, ${parity.jsCount} JS modules):`
);
for (const f of copied) console.log(`  + ${f}`);

if (IS_DRY) {
  console.log('[deploy_cf:theo] --dry mode: skipping wrangler deploy.');
  process.exit(0);
}

const localWrangler = path.join(REPO_ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler');
const wranglerBin = fs.existsSync(localWrangler) ? localWrangler : 'wrangler';
execFileSync(wranglerBin, ['deploy'], {
  cwd: REPO_ROOT,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
