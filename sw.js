// ============================================================
// Gharana — Service Worker
// Strategy: stale-while-revalidate for everything same-origin.
// Every request is served from cache instantly if available (fast,
// feels native), while a fresh copy is fetched in the background and
// saved for next time — so it's fast today and self-corrects within
// one extra load after any update, instead of getting stuck on old
// cached code indefinitely.
// ============================================================

const CACHE_NAME = "gharana-cache-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle same-origin GET requests — never touch Firebase/Firestore
  // calls or cross-origin font/CDN requests; those must always hit the network.
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req);
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached); // offline — fall back to whatever's cached, if anything

      return cached || networkFetch;
    })
  );
});
