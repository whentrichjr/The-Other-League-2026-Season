/* The Other League — Service Worker v1.1
 * Strategy:
 *   - Static shell (fonts, icons, index.html): cache-first
 *   - version.json: never intercepted — always fetched live for update checks
 *   - GAS API calls (script.google.com): network-first, fall back to cache
 *   - Everything else: network-first
 */

const CACHE_NAME   = 'tol-v15';
const GAS_ORIGIN   = 'script.google.com';
const FONT_ORIGIN  = 'fonts.googleapis.com';
const GSTATIC      = 'fonts.gstatic.com';

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.svg',
  './icon-512.svg',
  // version.json intentionally NOT precached — always fetched live
];

/* ── Install: precache static shell ── */
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

/* ── Activate: clean up old caches ── */
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

/* ── Fetch: route by origin ── */
self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);

  // Skip non-GET and cross-origin that aren't fonts or GAS
  if (e.request.method !== 'GET') return;

  // version.json: never intercept — let browser fetch directly so update
  // checks always hit the live server regardless of cache state
  if (url.pathname.endsWith('/version.json')) return;

  // Fonts: cache-first (long-lived, never change)
  if (url.hostname === GSTATIC || url.hostname === FONT_ORIGIN) {
    e.respondWith(cacheFirst(e.request));
    return;
  }

  // GAS app calls: network-first (live data matters)
  if (url.hostname === GAS_ORIGIN) {
    e.respondWith(networkFirst(e.request));
    return;
  }

  // Static shell assets (same-origin): cache-first
  if (url.origin === self.location.origin) {
    e.respondWith(cacheFirst(e.request));
    return;
  }

  // Everything else: network-first
  e.respondWith(networkFirst(e.request));
});

/* ── Strategies ── */

function cacheFirst(req) {
  return caches.match(req).then(function(cached) {
    if (cached) return cached;
    return fetchAndCache(req);
  });
}

function networkFirst(req) {
  return fetch(req.clone()).then(function(res) {
    if (res && res.ok) {
      caches.open(CACHE_NAME).then(function(cache) {
        // Only cache GAS responses if they look like full pages (HTML)
        var ct = res.headers.get('content-type') || '';
        if (ct.includes('text/html') || ct.includes('application/json')) {
          cache.put(req, res.clone());
        }
      });
    }
    return res;
  }).catch(function() {
    return caches.match(req).then(function(cached) {
      return cached || offlineFallback();
    });
  });
}

function fetchAndCache(req) {
  return fetch(req.clone()).then(function(res) {
    if (res && res.ok) {
      caches.open(CACHE_NAME).then(function(cache) {
        cache.put(req, res.clone());
      });
    }
    return res;
  }).catch(function() {
    return caches.match(req).then(function(c) { return c || offlineFallback(); });
  });
}

function offlineFallback() {
  return new Response(
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>The Other League — Offline</title>' +
    '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#050914;color:#e8eefc;display:flex;align-items:center;justify-content:center;min-height:100dvh;text-align:center;padding:24px}' +
    '.card{background:#0d1628;border:1px solid #1e2d4a;border-radius:16px;padding:40px 32px;max-width:400px}h1{font-size:24px;font-weight:900;margin-bottom:16px;color:#7dffa7}' +
    'p{color:rgba(232,238,252,0.7);font-size:16px;line-height:1.6;margin-bottom:24px}' +
    '.btn{display:inline-block;padding:14px 28px;background:#0f7a3a;color:#fff;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px}</style></head>' +
    '<body><div class="card"><h1>⛳ You\'re Offline</h1>' +
    '<p>The Other League needs a connection to load live scores. Connect to Wi-Fi or cellular to continue.</p>' +
    '<a class="btn" href="./">Try Again</a></div></body></html>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
