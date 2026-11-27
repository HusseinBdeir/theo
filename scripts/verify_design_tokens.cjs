'use strict';

// Static design-token gate (Phase 6). Keeps css/theo.css on one type scale, one radius scale,
// two font stacks and palette-token colours. Run by scripts/deploy_cf.mjs before every deploy.
//   node scripts/verify_design_tokens.cjs [--root <repo>]
// Every run also replays a set of planted violations and fails if any of them gets through.

const fs = require('fs');
const path = require('path');

const rootIdx = process.argv.indexOf('--root');
const REPO_ROOT = rootIdx >= 0 ? path.resolve(process.argv[rootIdx + 1]) : path.resolve(__dirname, '..');

const FS_TOKENS = { '2xs': '10px', xs: '11px', sm: '12px', md: '13px', lg: '14px', xl: '16px', '2xl': '20px' };
const RADIUS_TOKENS = { sm: '4px', md: '6px', lg: '10px', pill: '999px' };
const MIX_LADDER = new Set([4, 8, 14, 22, 36, 55, 78]);
const BODY_ANCHOR = '*, *::before, *::after {';
// Palette swatch previews show every palette's own colours whatever the active palette is.
const SWATCH_SELECTOR = /^\.sw-[a-z]+( [ib])?$/;
const HEADER_SELECTOR = /^(:root|html\[data-theme="(light|dark)"\](\[data-palette="[a-z]+"\])?)$/;
const COLOUR_PROPS = /^(color|background(-color|-image)?|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?|outline(-color)?|box-shadow|text-shadow|fill|stroke|caret-color|accent-color|text-decoration(-color)?|column-rule(-color)?|scrollbar-color|-webkit-text-fill-color|-webkit-text-stroke(-color)?)$/;
const NAMED_COLOURS = new Set(('white black red green blue yellow orange purple gray grey silver gold pink brown cyan magenta navy teal maroon olive lime aqua fuchsia indigo violet crimson coral salmon tomato khaki beige ivory tan orchid plum turquoise lavender slategray slategrey dimgray dimgrey darkgray darkgrey lightgray lightgrey whitesmoke gainsboro snow rebeccapurple').split(' '));
const RAW_COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(|(^|[^-a-z])color\(/;
const STRICT_MIX = /^color-mix\(\s*in srgb\s*,\s*var\(--[a-z0-9-]+\)\s+(\d+(?:\.\d+)?)%\s*,\s*(transparent|var\(--[a-z0-9-]+\))\s*\)/;
const WEB_FONT = /fonts\.googleapis\.com|fonts\.gstatic\.com|['"]Inter['"]|JetBrains|Archivo/;

function maskCss(text) {
  const masks = [];
  const mask = (m) => {
    masks.push(m);
    return `\u0000${masks.length - 1}\u0000`;
  };
  const masked = text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => mask(m) + '\n'.repeat((m.match(/\n/g) || []).length)) // keep line numbers true
    .replace(/url\((?:"[^"]*"|'[^']*'|[^)]*)\)|"[^"]*"|'[^']*'/g, mask);
  return { masked, masks };
}

// offset -> 1-based line number, by binary search over the newline positions
function lineIndex(text) {
  const nl = [];
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) nl.push(i);
  return (offset) => {
    let lo = 0, hi = nl.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (nl[mid] < offset) lo = mid + 1;
      else hi = mid;
    }
    return lo + 1;
  };
}

function* declarations({ masked, masks }) {
  for (const block of masked.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    // comments drop out of the selector; quoted attribute values come back
    const sel = block[1].replace(/\u0000(\d+)\u0000/g, (_, i) => (masks[+i].startsWith('/*') ? ' ' : masks[+i])).replace(/\s+/g, ' ').trim();
    const declStart = block.index + block[1].length + 1;
    for (const d of block[2].matchAll(/(^|;)((?:\s|\u0000\d+\u0000)*)([a-zA-Z0-9-]+)\s*:\s*([^;]*)/g)) {
      yield {
        sel,
        prop: d[3].toLowerCase(),
        value: d[4].trim().replace(/\s*!important$/, ''),
        offset: declStart + d.index + d[1].length + d[2].length,
      };
    }
  }
}

function checkColours(value, isSwatch, where, fail) {
  if (isSwatch) return;
  if (RAW_COLOUR.test(value)) fail(`${where}: raw colour; use a palette token`);
  const bare = value.replace(/var\(--[a-z0-9-]+\)/g, ' ');
  for (const word of bare.match(/[a-z]+/gi) || []) {
    if (NAMED_COLOURS.has(word.toLowerCase())) fail(`${where}: named colour "${word}"; use a palette token`);
  }
  let at = value.indexOf('color-mix(');
  while (at >= 0) {
    const m = value.slice(at).match(STRICT_MIX);
    if (!m) fail(`${where}: color-mix() must be "color-mix(in srgb, var(--token) N%, transparent | var(--token))"`);
    else if (!MIX_LADDER.has(Number(m[1]))) fail(`${where}: tint ${m[1]}% is off the ladder (${[...MIX_LADDER].join(' / ')})`);
    at = value.indexOf('color-mix(', at + 1);
  }
}

// files: { css, indexHtml, templates: { 'js/x.js': source } }  ->  { failures, declCount }
function check(files) {
  const failures = [];
  const fail = (msg) => failures.push(msg);
  const css = files.css;
  const anchorAt = css.indexOf(BODY_ANCHOR);
  if (anchorAt < 0) {
    fail(`css/theo.css: reset rule "${BODY_ANCHOR}" not found; cannot tell the token header from the rules`);
    return { failures, declCount: 0 };
  }
  const header = css.slice(0, anchorAt);
  const body = css.slice(anchorAt);
  const headerLines = header.split('\n').length - 1;

  // 1. The header defines exactly the agreed scales, and holds nothing but tokens.
  for (const [name, px] of Object.entries(FS_TOKENS)) {
    if (!new RegExp(`--fs-${name}:\\s*${px};`).test(header)) fail(`header must define --fs-${name}: ${px}`);
  }
  for (const [name, px] of Object.entries(RADIUS_TOKENS)) {
    if (!new RegExp(`--r-${name}:\\s*${px};`).test(header)) fail(`header must define --r-${name}: ${px}`);
  }
  for (const m of css.matchAll(/--fs-([a-z0-9]+)\s*:/g)) if (!(m[1] in FS_TOKENS)) fail(`unexpected type-scale token --fs-${m[1]} (the scale has ${Object.keys(FS_TOKENS).length} steps)`);
  for (const m of css.matchAll(/--r-([a-z0-9]+)\s*:/g)) if (!(m[1] in RADIUS_TOKENS)) fail(`unexpected radius token --r-${m[1]} (the scale has ${Object.keys(RADIUS_TOKENS).length} steps)`);
  if (!/--font-ui:\s*-apple-system, BlinkMacSystemFont, 'Segoe UI'/.test(header)) fail('header must define --font-ui as the system UI stack');
  if (!/--font-mono:\s*ui-monospace/.test(header)) fail('header must define --font-mono as the system monospace stack');
  if (WEB_FONT.test(css)) fail('css/theo.css must not name or load a web font');
  if (/@import\b|@font-face\b/.test(css)) fail('css/theo.css must not use @import or @font-face');

  const head = maskCss(header);
  const headLine = lineIndex(head.masked);
  for (const d of declarations(head)) {
    const where = `css/theo.css:${headLine(d.offset)} ${d.sel} { ${d.prop}: ${d.value} }`;
    if (!d.prop.startsWith('--')) fail(`${where}: the token header may only declare custom properties`);
    for (const one of d.sel.split(',').map((s) => s.trim())) {
      if (!HEADER_SELECTOR.test(one)) fail(`${where}: the token header may only use :root / html[data-theme] / html[data-palette] selectors`);
    }
    // header tints must sit on the ladder too
    let at = d.value.indexOf('color-mix(');
    while (at >= 0) {
      const m = d.value.slice(at).match(STRICT_MIX);
      if (!m) fail(`${where}: color-mix() must be "color-mix(in srgb, var(--token) N%, transparent | var(--token))"`);
      else if (!MIX_LADDER.has(Number(m[1]))) fail(`${where}: tint ${m[1]}% is off the ladder (${[...MIX_LADDER].join(' / ')})`);
      at = d.value.indexOf('color-mix(', at + 1);
    }
  }

  // 2. Every rule below the header uses the tokens.
  const main = maskCss(body);
  const bodyLine = lineIndex(main.masked);
  const lineOf = (offset) => headerLines + bodyLine(offset);
  let declCount = 0;
  for (const d of declarations(main)) {
    const { sel, prop, value } = d;
    const where = `css/theo.css:${lineOf(d.offset)} ${sel} { ${prop}: ${value} }`;
    const isSwatch = sel.split(',').every((s) => SWATCH_SELECTOR.test(s.trim()));
    declCount++;
    if (prop.startsWith('--')) {
      checkColours(value, isSwatch, where, fail);
      continue;
    }
    if (prop === 'font-size' && !/^(var\(--fs-(2xs|xs|sm|md|lg|xl|2xl)\)|inherit)$/.test(value)) {
      fail(`${where}: font-size must be a --fs-* token`);
    }
    if (prop === 'font' && value !== 'inherit') fail(`${where}: use font-size / font-family tokens, not the font shorthand`);
    if (/^(-webkit-|-moz-)?border(-[a-z]+)*-radius$/.test(prop)) {
      for (const part of value.split(/[\s/]+/)) {
        if (!/^(var\(--r-(sm|md|lg|pill)\)|0|50%|inherit)$/.test(part)) fail(`${where}: radius must be a --r-* token, 0 or 50%`);
      }
    }
    if (prop === 'font-family' && !/^(var\(--font-(ui|mono)\)|inherit)$/.test(value)) {
      fail(`${where}: font-family must be var(--font-ui), var(--font-mono) or inherit`);
    }
    if (prop !== 'content' && (COLOUR_PROPS.test(prop) || RAW_COLOUR.test(value) || value.includes('color-mix('))) {
      checkColours(value, isSwatch, where, fail);
    }
  }

  // 3. Aligned digits never switch the typeface.
  const tabularRule = body.match(/(^|\n)\.tabular\s*\{([^}]*)\}/);
  if (!tabularRule) fail('css/theo.css must keep a standalone .tabular rule');
  else if (/font-family/.test(tabularRule[2])) fail('.tabular must only set font-variant-numeric (numerals stay in the UI font)');

  // 4. Templates: no web-font download, no raw sizes in inline styles.
  const templates = { 'index.html': files.indexHtml, ...files.templates };
  for (const [rel, src] of Object.entries(templates)) {
    if (WEB_FONT.test(src)) fail(`${rel} must not name or load a web font (system font stacks only)`);
    src.split('\n').forEach((line, i) => {
      if (/font-size:\s*\d*\.?\d+px/.test(line)) fail(`${rel}:${i + 1}: inline font-size in px; use var(--fs-*)`);
      if (/border-radius:\s*\d*\.?\d+px/.test(line)) fail(`${rel}:${i + 1}: inline border-radius in px; use var(--r-*)`);
    });
  }
  return { failures, declCount };
}

function loadFiles(root) {
  const templates = {};
  for (const f of fs.readdirSync(path.join(root, 'js')).filter((n) => n.endsWith('.js')).sort()) {
    templates[`js/${f}`] = fs.readFileSync(path.join(root, 'js', f), 'utf8');
  }
  return {
    css: fs.readFileSync(path.join(root, 'css', 'theo.css'), 'utf8'),
    indexHtml: fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
    templates,
  };
}

// Planted violations: each must be caught, or the gate itself is broken.
function selfTest(files) {
  const appendCss = (rule) => ({ ...files, css: `${files.css}\n${rule}\n` });
  const prependCss = (rule) => ({ ...files, css: `${rule}\n${files.css}` });
  const cases = [
    ['raw px font-size', appendCss('.zz { font-size: 15px; }')],
    ['raw radius', appendCss('.zz { border-radius: 7px; }')],
    ['prefixed raw radius', appendCss('.zz { -webkit-border-radius: 3px; }')],
    ['raw hex colour', appendCss('.zz { color: #ff0000; }')],
    ['raw rgba colour', appendCss('.zz { border: 1px solid rgba(1, 2, 3, 0.5); }')],
    ['named colours', appendCss('.zz { color: white; background: black; }')],
    ['modern colour function', appendCss('.zz { color: oklch(70% 0.1 200); }')],
    ['off-ladder tint', appendCss('.zz { background: color-mix(in srgb, var(--brass) 37%, transparent); }')],
    ['off-ladder tint over a surface', appendCss('.zz { background: color-mix(in srgb, var(--brass) 37%, var(--bg-ink)); }')],
    ['off-ladder tint without spaces', appendCss('.zz { background: color-mix(in srgb,var(--brass) 37%,transparent); }')],
    ['raw colour in a local custom property', appendCss('.zz { --c2: #ff0000; }')],
    ['raw colour hiding behind a swatch selector', appendCss('.composer-send-btn, .sw-x { color: #ff0000; }')],
    ['web font family', appendCss(".zz { font-family: 'Inter', sans-serif; }")],
    ['font shorthand', appendCss('.zz { font: 12px/1.4 sans-serif; }')],
    ['@import of a web font', prependCss('@import url(https://fonts.googleapis.com/css2?family=Roboto);')],
    ['@font-face', appendCss('@font-face { font-family: X; src: url(x.woff2); }')],
    ['ordinary rule above the token header', prependCss('.zz-top { font-size: 15px; border-radius: 7px; color: #ff0000; }')],
    ['extra type-scale step', prependCss(':root { --fs-3xl: 28px; }')],
    ['.tabular switching typeface', { ...files, css: files.css.replace(/(\n\.tabular\s*\{)/, '$1\n  font-family: var(--font-mono);') }],
    ['web font link in index.html', { ...files, indexHtml: `${files.indexHtml}\n<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">` }],
    ['inline px font-size in a template', { ...files, templates: { ...files.templates, 'js/zz.js': 'const h = `<b style="font-size:11.5px">x</b>`;' } }],
    ['inline px radius in a template', { ...files, templates: { ...files.templates, 'js/zz.js': 'const h = `<b style="border-radius:8px">x</b>`;' } }],
  ];
  const missed = cases.filter(([, planted]) => check(planted).failures.length === 0).map(([name]) => name);
  return { total: cases.length, missed };
}

const files = loadFiles(REPO_ROOT);
const result = check(files);
if (result.failures.length) {
  console.error(`[FAIL] Design tokens: ${result.failures.length} problem(s)`);
  for (const f of result.failures.slice(0, 60)) console.error(`  - ${f}`);
  if (result.failures.length > 60) console.error(`  ... and ${result.failures.length - 60} more`);
  process.exit(1);
}
const self = selfTest(files);
if (self.missed.length) {
  console.error(`[FAIL] Design tokens gate self-test: ${self.missed.length} planted violation(s) were not caught: ${self.missed.join('; ')}`);
  process.exit(1);
}
console.log(`[PASS] Design tokens: ${result.declCount} declarations on ${Object.keys(FS_TOKENS).length} type sizes, ${Object.keys(RADIUS_TOKENS).length} radii, 2 font stacks, 0 raw colours outside the token header; templates clean; ${self.total}/${self.total} planted violations caught`);
