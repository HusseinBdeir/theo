const PUBLIC_EXACT = new Set([
  '/index.html',
  '/reset.html',
  '/sw.js',
  '/manifest.json',
  '/favicon.ico',
  '/icon.svg',
  '/icon-180.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-512-maskable.png',
  '/theo-hub-bundle.zip',
  '/install.ps1',
  '/assets/Sync-Apple-Health.shortcut',
  '/command/index.html',
  '/planner/index.html',
]);

const PUBLIC_PREFIXES = ['/brand/', '/css/', '/js/'];

function isAllowedPath(pathname) {
  if (PUBLIC_EXACT.has(pathname)) return true;
  if (pathname.includes('..') || pathname.includes('//')) return false;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

function applySecurityHeaders(headers, pathname) {
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Frame-Options', 'DENY');
  if (
    pathname === '/index.html' ||
    pathname === '/reset.html' ||
    pathname === '/sw.js' ||
    pathname === '/manifest.json' ||
    pathname === '/command/index.html' ||
    pathname === '/planner/index.html' ||
    pathname === '/theo-hub-bundle.zip' ||
    pathname === '/install.ps1' ||
    pathname.endsWith('.shortcut')
  ) {
    headers.set('Cache-Control', 'no-cache');
  }
  if (pathname === '/assets/Sync-Apple-Health.shortcut') {
    headers.set('Content-Type', 'application/octet-stream');
    headers.set('Content-Disposition', 'attachment; filename="Sync-Apple-Health.shortcut"');
  }
  if (pathname === '/install.ps1') {
    headers.set('Content-Type', 'text/plain; charset=utf-8');
  }
  if (pathname === '/theo-hub-bundle.zip') {
    headers.set('Content-Type', 'application/zip');
  }
}

export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    const url = new URL(request.url);
    let rawPath;
    try {
      rawPath = decodeURIComponent(url.pathname);
    } catch {
      return new Response('Bad Request', { status: 400, headers: { 'X-Content-Type-Options': 'nosniff' } });
    }
    let pathname = rawPath;
    if (pathname === '/') pathname = '/index.html';
    else if (pathname === '/command' || pathname === '/command/') pathname = '/command/index.html';
    else if (pathname === '/planner' || pathname === '/planner/') pathname = '/planner/index.html';

    if (!isAllowedPath(pathname)) {
      return new Response('Not Found', {
        status: 404,
        headers: { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' },
      });
    }
    const targetUrl = new URL(pathname, url.origin);
    const assetReq = new Request(targetUrl.toString(), {
      method: request.method,
      headers: request.headers,
    });
    const assetRes = await env.ASSETS.fetch(assetReq);
    if (!assetRes || assetRes.status === 404) {
      return new Response('Not Found', {
        status: 404,
        headers: { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' },
      });
    }
    const headers = new Headers(assetRes.headers);
    applySecurityHeaders(headers, pathname);
    return new Response(assetRes.body, {
      status: assetRes.status,
      statusText: assetRes.statusText,
      headers,
    });
  },
};
