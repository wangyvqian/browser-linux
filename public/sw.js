// Cache-first for the guest's own bytes. GitHub Pages sends max-age=600, so
// without this every visit after ten minutes re-downloads the disk over
// thousands of small requests. __BUILD__ is replaced per deploy so a rebuilt
// guest cannot be served from the previous cache.
const CACHE = `browser-linux-${"__BUILD__"}`;
const CACHED_PATHS = ["/images/", "/bios/"];

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("browser-linux-") && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || !CACHED_PATHS.some((p) => url.pathname.includes(p))) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(event.request);
    if (hit) return hit;
    const response = await fetch(event.request);
    if (response.ok) cache.put(event.request, response.clone());
    return response;
  })().catch(() => fetch(event.request)));
});
