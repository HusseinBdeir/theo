'use strict';

// Static design-token gate (Phase 6). Keeps css/theo.css on one type scale, one radius scale,
// two font stacks and palette-token colours. Run by scripts/deploy_cf.mjs before every deploy.
//   node scripts/verify_design_tokens.cjs [--root <repo>]

const fs = require('fs');
const path = require('path');

const rootIdx = process.argv.indexOf('--root');
const REPO_ROOT = rootIdx >= 0 ? path.resolve(process.argv[rootIdx + 1]) : path.resolve(__dirname, '..');

const FS_TOKENS = { '2xs': '10px', xs: '11px', sm: '12px', md: '13px', lg: '14px', xl: '16px', '2xl': '20px' };
const RADIUS_TOKENS = { sm: '4px', md: '6px', lg: '10px', pill: '999px' };
const MIX_LADDER = new Set([4, 8, 14, 22, 36, 55, 78]);
const BODY_ANCHOR = '*, *::before, *::after {';
// Palette swatch previews show every palette's own colours whatever the active palette is.
const LITERAL_COLOUR_SELECTORS = /(^|[\s,])\.sw-[a-z]+/;

const failures = [];
const fail = (msg) => failures.push(msg);

const css = fs.readFileSync(path.join(REPO_ROOT, 'css', 'theo.css'), 'utf8');
const anchorAt = css.indexOf(BODY_ANCHOR);
if (anchorAt < 0) {
  console.error(`[FAIL] css/theo.css: reset rule "${BODY_ANCHOR}" not found; cannot tell the token header from the rules`);
  process.exit(1);
}
const header = css.slice(0, anchorAt);
const body = css.slice(anchorAt);
const headerLines = header.split('\n').length - 1;

// 1. The header defines exactly the agreed scales.
for (const [name, px] of Object.entries(FS_TOKENS)) {
  if (!new RegExp(`--fs-${name}:\\s*${px};`).test(header)) fail(`header must define --fs-${name}: ${px}`);
}
for (const [name, px] of Object.entries(RADIUS_TOKENS)) {
  if (!new RegExp(`--r-${name}:\\s*${px};`).test(header)) fail(`header must define --r-${name}: ${px}`);
}
const fsDefined = [...header.matchAll(/--fs-([a-z0-9]+)\s*:/g)].map((m) => m[1]);
const rDefined = [...header.matchAll(/--r-([a-z0-9]+)\s*:/g)].map((m) => m[1]);
for (const n of fsDefined) if (!(n in FS_TOKENS)) fail(`unexpected type-scale token --fs-${n} (the scale has ${Object.keys(FS_TOKENS).length} steps)`);
for (const n of rDefined) if (!(n in RADIUS_TOKENS)) fail(`unexpected radius token --r-${n} (the scale has ${Object.keys(RADIUS_TOKENS).length} steps)`);
if (!/--font-ui:\s*-apple-system, BlinkMacSystemFont, 'Segoe UI'/.test(header)) fail('header must define --font-ui as the system UI stack');
if (!/--font-mono:\s*ui-monospace/.test(header)) fail('header must define --font-mono as the system monospace stack');
if (/['"]Inter['"]|JetBrains|Archivo/.test(css)) fail('css/theo.css must not name a web font (Inter, JetBrains Mono, Archivo)');

// 2. Every rule below the header uses the tokens.
const masks = [];
const mask = (m) => {
  masks.push(m);
  return `\u0000${masks.length - 1}\u0000`;
};
const lineOf = (offset) => headerLines + masked.slice(0, offset).split('\n').length;
const masked = body
  .replace(/\/\*[\s\S]*?\*\//g, (m) => mask(m) + '\n'.repeat((m.match(/\n/g) || []).length)) // keep line numbers true
  .replace(/url\((?:"[^"]*"|'[^']*'|[^)]*)\)|"[^"]*"|'[^']*'/g, mask);

let declCount = 0;
for (const block of masked.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
  const sel = block[1].replace(/\u0000\d+\u0000/g, ' ').replace(/\s+/g, ' ').trim();
  const declStart = block.index + block[1].length + 1;
  for (const d of block[2].matchAll(/(^|;)((?:\s|\u0000\d+\u0000)*)([a-zA-Z-]+)\s*:\s*([^;]*)/g)) {
    const prop = d[3].toLowerCase();
    const value = d[4].trim().replace(/\s*!important$/, '');
    const where = `css/theo.css:${lineOf(declStart + d.index + d[1].length + d[2].length)} ${sel} { ${prop}: ${value} }`;
    declCount++;
    if (prop === 'font-size' && !/^(var\(--fs-(2xs|xs|sm|md|lg|xl|2xl)\)|inherit)$/.test(value)) {
      fail(`${where}: font-size must be a --fs-* token`);
    }
    if (prop === 'font' && value !== 'inherit') fail(`${where}: use font-size / font-family tokens, not the font shorthand`);
    if (/^border(-[a-z]+)*-radius$/.test(prop)) {
      for (const part of value.split(/\s+/)) {
        if (!/^(var\(--r-(sm|md|lg|pill)\)|0|50%|inherit)$/.test(part)) fail(`${where}: radius must be a --r-* token, 0 or 50%`);
      }
    }
    if (prop === 'font-family' && !/^(var\(--font-(ui|mono)\)|inherit)$/.test(value)) {
      fail(`${where}: font-family must be var(--font-ui), var(--font-mono) or inherit`);
    }
    if (prop !== 'content' && !LITERAL_COLOUR_SELECTORS.test(sel)) {
      if (/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?)\(/.test(value)) fail(`${where}: raw colour; use a palette token`);
      for (const m of value.matchAll(/color-mix\(in srgb, var\(--[a-z0-9-]+\) (\d+(?:\.\d+)?)%, transparent\)/g)) {
        if (!MIX_LADDER.has(Number(m[1]))) fail(`${where}: tint ${m[1]}% is off the ladder (${[...MIX_LADDER].join(' / ')})`);
      }
    }
  }
}

// 3. Aligned digits never switch the typeface.
const tabularRule = body.match(/(^|\n)\.tabular\s*\{([^}]*)\}/);
if (!tabularRule) fail('css/theo.css must keep a standalone .tabular rule');
else if (/font-family/.test(tabularRule[2])) fail('.tabular must only set font-variant-numeric (numerals stay in the UI font)');

// 4. Templates: no web-font download, no raw sizes in inline styles.
const indexHtml = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
if (/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(indexHtml)) fail('index.html must not load web fonts (system font stacks only)');
const templateFiles = ['index.html', ...fs.readdirSync(path.join(REPO_ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`)];
for (const rel of templateFiles) {
  const src = rel === 'index.html' ? indexHtml : fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    if (/font-size:\s*\d*\.?\d+px/.test(line)) fail(`${rel}:${i + 1}: inline font-size in px; use var(--fs-*)`);
    if (/border-radius:\s*\d*\.?\d+px/.test(line)) fail(`${rel}:${i + 1}: inline border-radius in px; use var(--r-*)`);
  });
}

if (failures.length) {
  console.error(`[FAIL] Design tokens: ${failures.length} problem(s)`);
  for (const f of failures.slice(0, 60)) console.error(`  - ${f}`);
  if (failures.length > 60) console.error(`  ... and ${failures.length - 60} more`);
  process.exit(1);
}
console.log(`[PASS] Design tokens: ${declCount} declarations on ${Object.keys(FS_TOKENS).length} type sizes, ${Object.keys(RADIUS_TOKENS).length} radii, 2 font stacks, 0 raw colours outside the token header; templates clean`);
