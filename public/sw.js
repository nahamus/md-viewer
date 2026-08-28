// A small, hand-rolled service worker — no build step, no external tooling.
// It exists so md-viewer is installable and still usable offline once it's
// been opened at least once; it isn't trying to be a general-purpose cache
// for every possible response.
//
// Strategy: network-first, cache-as-fallback, for every same-origin GET.
// Vite's production build content-hashes its asset filenames, so a fetch
// against a new deploy naturally requests different URLs — there's no stale
// "cached forever" risk to guard against here, which is what lets this stay
// simple instead of needing a precache manifest or update-prompt flow.
const CACHE_NAME = "mdviewer-shell-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      } catch (err) {
        const cached = await cache.match(request, { ignoreSearch: true });
        if (cached) return cached;
        throw err;
      }
    })(),
  );
});
