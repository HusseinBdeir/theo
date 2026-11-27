'use strict';

// Static design-token gate (Phase 6 + shared tokens.json gate). Keeps css/theo.css on one type scale,
// one radius scale, two font stacks, palette-token colours, and synced with theo-hub/tokens.json when present.
// Run by scripts/deploy_cf.mjs before every deploy:
//   node scripts/verify_design_tokens.cjs [--root <repo>] [--hub-root <theo-hub>]
// Every run also replays a set of planted violations and fails if any of them gets through.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rootIdx = process.argv.indexOf('--root');
const REPO_ROOT = rootIdx >= 0 ? path.resolve(process.argv[rootIdx + 1]) : path.resolve(__dirname, '..');

const hubIdx = process.argv.indexOf('--hub-root');
const RAW_HUB_ARG = hubIdx >= 0 ? String(process.argv[hubIdx + 1] || '') : (process.env.THEO_HUB_ROOT || '');
const HUB_EXPLICIT = Boolean(RAW_HUB_ARG && RAW_HUB_ARG !== '__none__');
const HUB_ROOT = RAW_HUB_ARG === '__none__'
  ? ''
  : path.resolve(RAW_HUB_ARG || path.join(REPO_ROOT, '..', 'theo-hub'));

const BEGIN_MARKER = '/* BEGIN GENERATED DESIGN TOKENS (source: theo-hub/tokens.json; do not edit by hand) */';
const END_MARKER = '/* END GENERATED DESIGN TOKENS */';
const HASH_PREFIX = '/* @tokens-sha256: ';

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

function sha256Hex(str) {
  return crypto.createHash('sha256').update(String(str).replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

function verifyGeneratedHeaderBlock(header, fail) {
  const lfHeader = String(header).replace(/\r\n/g, '\n');
  if (!lfHeader.startsWith(`${BEGIN_MARKER}\n`)) {
    fail(`css/theo.css: token header must start with ${BEGIN_MARKER}`);
    return null;
  }
  const beginCount = lfHeader.split(BEGIN_MARKER).length - 1;
  const endCount = lfHeader.split(END_MARKER).length - 1;
  if (beginCount !== 1 || endCount !== 1) {
    fail(`css/theo.css: expected exactly 1 BEGIN/END GENERATED marker pair in token header (begin=${beginCount}, end=${endCount})`);
    return null;
  }
  if (!lfHeader.endsWith(`${END_MARKER}\n\n`)) {
    fail(`css/theo.css: nothing may appear between ${END_MARKER} and "${BODY_ANCHOR}"`);
    return null;
  }
  const beginAt = 0;
  const endAt = lfHeader.indexOf(END_MARKER);
  const block = lfHeader.slice(beginAt, endAt + END_MARKER.length);
  const contentWithHash = lfHeader.slice(BEGIN_MARKER.length + 1, endAt);
  if (!contentWithHash.endsWith('\n')) {
    fail('css/theo.css: expected newline before END GENERATED marker');
    return null;
  }
  const withoutTrailingNl = contentWithHash.slice(0, -1);
  const lastNl = withoutTrailingNl.lastIndexOf('\n');
  if (lastNl < 0) {
    fail('css/theo.css: missing @tokens-sha256 integrity stamp inside generated block');
    return null;
  }
  const innerBody = withoutTrailingNl.slice(0, lastNl);
  const hashLine = withoutTrailingNl.slice(lastNl + 1);
  const m = hashLine.match(/^\/\* @tokens-sha256: ([0-9a-f]{64}) \*\/$/);
  if (!m) {
    fail(`css/theo.css: missing or malformed @tokens-sha256 stamp ("${hashLine}")`);
    return null;
  }
  const actualSha = sha256Hex(innerBody);
  if (m[1] !== actualSha) {
    fail(`css/theo.css: generated token block was edited by hand (expected @tokens-sha256 ${actualSha}, got ${m[1]})`);
    return null;
  }
  return block;
}

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
function check(files, opts = {}) {
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

  // 0. Verify generated-block markers, integrity stamp, and sibling tokens.json parity (when present).
  const generatedBlock = verifyGeneratedHeaderBlock(header, fail);
  if (body.includes(BEGIN_MARKER) || body.includes(END_MARKER)) {
    fail('css/theo.css: BEGIN/END GENERATED markers must appear only in the token header');
  }
  if (generatedBlock && opts.expectedTheoBlock && generatedBlock !== opts.expectedTheoBlock.replace(/\r\n/g, '\n')) {
    fail('css/theo.css: generated token header differs from theo-hub/tokens.json (run node ../theo-hub/scripts/generate_design_tokens.cjs)');
  }

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

  // 3b. Swatch previews outside the token header must stay aligned with their matching header tokens.
  const extractBlockToken = (selectorText, prop) => {
    const idx = header.indexOf(`${selectorText} {`);
    if (idx < 0) return '';
    const end = header.indexOf('}', idx);
    if (end < 0) return '';
    const m = header.slice(idx, end).match(new RegExp(`${prop}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
    return m ? m[1].toUpperCase() : '';
  };
  const swatchPairs = [
    ['.sw-graphite', 'html[data-theme="dark"]', '--bg-obsidian'],
    ['.sw-graphite b', 'html[data-theme="dark"]', '--brass'],
    ['.sw-velvet', 'html[data-theme="dark"][data-palette="velvet"]', '--bg-obsidian'],
    ['.sw-velvet b', 'html[data-theme="dark"][data-palette="velvet"]', '--steel'],
    ['.sw-espresso', 'html[data-theme="dark"][data-palette="espresso"]', '--bg-card'],
    ['.sw-espresso i', 'html[data-theme="dark"][data-palette="espresso"]', '--bg-plate'],
    ['.sw-espresso b', 'html[data-theme="dark"][data-palette="espresso"]', '--brass'],
    ['.sw-daylight', ':root,\nhtml[data-theme="light"]', '--bg-obsidian'],
    ['.sw-daylight i', ':root,\nhtml[data-theme="light"]', '--bg-activity'],
    ['.sw-daylight b', ':root,\nhtml[data-theme="light"]', '--brass'],
  ];
  for (const [swSel, palSel, tokName] of swatchPairs) {
    const swRe = new RegExp(`${swSel.replace('.', '\\.')}\\s*\\{[^}]*background:\\s*(#[0-9a-fA-F]{6})\\s*;`);
    const swMatch = body.match(swRe);
    const tokVal = extractBlockToken(palSel, tokName);
    if (swMatch && tokVal && swMatch[1].toUpperCase() !== tokVal) {
      fail(`${swSel} background (${swMatch[1].toUpperCase()}) drifted from ${palSel.replace(/\n/g, ' ')} ${tokName} (${tokVal})`);
    }
  }

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

function loadExpectedFromSiblingHub(hubRoot, explicit = false) {
  if (!hubRoot) return { present: false, explicitDisabled: true, dirExists: false, expectedTheoBlock: null, errors: [] };
  const dirExists = fs.existsSync(hubRoot);
  const tokensPath = path.join(hubRoot, 'tokens.json');
  if (!fs.existsSync(tokensPath)) {
    if (explicit) {
      return {
        present: false,
        explicitDisabled: false,
        dirExists,
        expectedTheoBlock: null,
        errors: [`Explicit --hub-root / THEO_HUB_ROOT missing tokens.json: ${tokensPath}`]
      };
    }
    return { present: false, explicitDisabled: false, dirExists, expectedTheoBlock: null, errors: [] };
  }
  const genPath = path.join(hubRoot, 'scripts', 'generate_design_tokens.cjs');
  if (!fs.existsSync(genPath)) {
    return { present: true, expectedTheoBlock: null, errors: [`Missing generator script beside tokens.json: ${genPath}`] };
  }
  try {
    const gen = require(genPath);
    const tokens = gen.loadTokens(hubRoot);
    const errors = [];
    const expectedTheoBlock = gen.renderTheoHeaderBlock(tokens);
    const scales = tokens.theo.scales;
    for (const [name, px] of Object.entries(FS_TOKENS)) {
      if (scales.fontSizes[`--fs-${name}`] !== px) errors.push(`tokens.json --fs-${name} disagrees with verify_design_tokens.cjs (${scales.fontSizes[`--fs-${name}`]} vs ${px})`);
    }
    for (const [name, px] of Object.entries(RADIUS_TOKENS)) {
      if (scales.radii[`--r-${name}`] !== px) errors.push(`tokens.json --r-${name} disagrees with verify_design_tokens.cjs (${scales.radii[`--r-${name}`]} vs ${px})`);
    }
    const ladderSet = new Set(scales.mixLadder.map(Number));
    if (ladderSet.size !== MIX_LADDER.size || [...MIX_LADDER].some((x) => !ladderSet.has(x))) {
      errors.push('tokens.json mixLadder disagrees with verify_design_tokens.cjs');
    }
    return { present: true, expectedTheoBlock, errors };
  } catch (err) {
    return { present: true, expectedTheoBlock: null, errors: [`Sibling tokens.json load failed: ${err && err.message ? err.message : err}`] };
  }
}

function restampGeneratedBlock(css, mutator) {
  const lf = css.replace(/\r\n/g, '\n');
  const endAt = lf.indexOf(END_MARKER);
  const contentWithHash = lf.slice(BEGIN_MARKER.length + 1, endAt);
  const withoutTrailingNl = contentWithHash.slice(0, -1);
  const lastNl = withoutTrailingNl.lastIndexOf('\n');
  const innerBody = withoutTrailingNl.slice(0, lastNl);
  const mutatedInner = mutator(innerBody);
  const newSha = sha256Hex(mutatedInner);
  return `${BEGIN_MARKER}\n${mutatedInner}\n${HASH_PREFIX}${newSha} */\n${END_MARKER}${lf.slice(endAt + END_MARKER.length)}`;
}

// Planted violations: each must be caught, or the gate itself is broken.
function selfTest(files, expectedTheoBlock = null) {
  const appendCss = (rule) => ({ ...files, css: `${files.css}\n${rule}\n` });
  const prependCss = (rule) => ({ ...files, css: `${rule}\n${files.css}` });
  const cases = [
    ['raw px font-size', appendCss('.zz { font-size: 15px; }'), null],
    ['raw radius', appendCss('.zz { border-radius: 7px; }'), null],
    ['prefixed raw radius', appendCss('.zz { -webkit-border-radius: 3px; }'), null],
    ['raw hex colour', appendCss('.zz { color: #ff0000; }'), null],
    ['raw rgba colour', appendCss('.zz { border: 1px solid rgba(1, 2, 3, 0.5); }'), null],
    ['named colours', appendCss('.zz { color: white; background: black; }'), null],
    ['modern colour function', appendCss('.zz { color: oklch(70% 0.1 200); }'), null],
    ['off-ladder tint', appendCss('.zz { background: color-mix(in srgb, var(--brass) 37%, transparent); }'), null],
    ['off-ladder tint over a surface', appendCss('.zz { background: color-mix(in srgb, var(--brass) 37%, var(--bg-ink)); }'), null],
    ['off-ladder tint without spaces', appendCss('.zz { background: color-mix(in srgb,var(--brass) 37%,transparent); }'), null],
    ['raw colour in a local custom property', appendCss('.zz { --c2: #ff0000; }'), null],
    ['raw colour hiding behind a swatch selector', appendCss('.composer-send-btn, .sw-x { color: #ff0000; }'), null],
    ['web font family', appendCss(".zz { font-family: 'Inter', sans-serif; }"), null],
    ['font shorthand', appendCss('.zz { font: 12px/1.4 sans-serif; }'), null],
    ['@import of a web font', prependCss('@import url(https://fonts.googleapis.com/css2?family=Roboto);'), null],
    ['@font-face', appendCss('@font-face { font-family: X; src: url(x.woff2); }'), null],
    ['ordinary rule above the token header', prependCss('.zz-top { font-size: 15px; border-radius: 7px; color: #ff0000; }'), null],
    ['extra type-scale step (restamped)', { ...files, css: restampGeneratedBlock(files.css, (inner) => `${inner}\n:root { --fs-3xl: 28px; }`) }, null],
    ['.tabular switching typeface', { ...files, css: files.css.replace(/(\n\.tabular\s*\{)/, '$1\n  font-family: var(--font-mono);') }, null],
    ['web font link in index.html', { ...files, indexHtml: `${files.indexHtml}\n<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">` }, null],
    ['inline px font-size in a template', { ...files, templates: { ...files.templates, 'js/zz.js': 'const h = `<b style="font-size:11.5px">x</b>`;' } }, null],
    ['inline px radius in a template', { ...files, templates: { ...files.templates, 'js/zz.js': 'const h = `<b style="border-radius:8px">x</b>`;' } }, null],
    ['hand edit to token value inside generated block', { ...files, css: files.css.replace(/(--agy:\s*)#[0-9a-fA-F]{6};/, '$1#010203;') }, null],
    ['hand edit to comment/whitespace inside generated block', { ...files, css: files.css.replace('Preset 2:', 'Preset  2:') }, null],
    ['missing BEGIN/END GENERATED markers', { ...files, css: files.css.replace(`${BEGIN_MARKER}\n`, '').replace(`${END_MARKER}\n`, '') }, null],
    ['corrupted @tokens-sha256 stamp', { ...files, css: files.css.replace(/(\/\* @tokens-sha256: )([0-9a-f]{64})( \*\/)/, (_, a, h, b) => `${a}${h[0] === '0' ? '1' : '0'}${h.slice(1)}${b}`) }, null],
    ['palette swatch out of step with header token', { ...files, css: files.css.replace(/(\.sw-velvet\s*\{\s*background:\s*)#[0-9a-fA-F]{6}(\s*;\s*\})/, '$1#010203$2') }, null],
  ];
  if (expectedTheoBlock) {
    cases.push([
      'forged @tokens-sha256 vs sibling tokens.json',
      { ...files, css: restampGeneratedBlock(files.css, (inner) => inner.replace(/(--agy:\s*)#[0-9a-fA-F]{6};/, '$1#010203;')) },
      expectedTheoBlock
    ]);
  }
  const missed = cases.filter(([, planted, exp]) => check(planted, { expectedTheoBlock: exp }).failures.length === 0).map(([name]) => name);
  const standaloneClean = check(files, { expectedTheoBlock: null });
  if (standaloneClean.failures.length > 0) {
    missed.push(`standalone clean mode failed: ${standaloneClean.failures[0]}`);
  }
  return { total: cases.length, missed };
}

const files = loadFiles(REPO_ROOT);
const hubCheck = loadExpectedFromSiblingHub(HUB_ROOT, HUB_EXPLICIT);
if (hubCheck.errors.length) {
  console.error(`[FAIL] Design tokens sibling check: ${hubCheck.errors.join('; ')}`);
  process.exit(1);
}
const result = check(files, { expectedTheoBlock: hubCheck.expectedTheoBlock });
if (result.failures.length) {
  console.error(`[FAIL] Design tokens: ${result.failures.length} problem(s)`);
  for (const f of result.failures.slice(0, 60)) console.error(`  - ${f}`);
  if (result.failures.length > 60) console.error(`  ... and ${result.failures.length - 60} more`);
  process.exit(1);
}
const self = selfTest(files, hubCheck.expectedTheoBlock);
if (self.missed.length) {
  console.error(`[FAIL] Design tokens gate self-test: ${self.missed.length} planted violation(s) were not caught: ${self.missed.join('; ')}`);
  process.exit(1);
}
const hubMode = hubCheck.present
  ? 'synced with theo-hub/tokens.json'
  : hubCheck.explicitDisabled
    ? 'standalone (--hub-root __none__)'
    : hubCheck.dirExists
      ? 'standalone (sibling theo-hub has no tokens.json)'
      : 'standalone (no sibling theo-hub)';
console.log(`[PASS] Design tokens (${hubMode}): ${result.declCount} declarations on ${Object.keys(FS_TOKENS).length} type sizes, ${Object.keys(RADIUS_TOKENS).length} radii, 2 font stacks, 0 raw colours outside the token header; templates clean; ${self.total}/${self.total} planted violations caught`);
