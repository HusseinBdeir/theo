import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(REPO_ROOT, '.cf-dist');
const IS_DRY = process.argv.includes('--dry');

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

const copied = buildDist();
console.log(`[deploy_cf:theo] Staged ${copied.length} allowlisted public files into .cf-dist:`);
for (const f of copied) console.log(`  + ${f}`);

if (IS_DRY) {
  console.log('[deploy_cf:theo] --dry mode: skipping wrangler deploy.');
  process.exit(0);
}

execFileSync('npx', ['--no-install', 'wrangler', 'deploy'], {
  cwd: REPO_ROOT,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
