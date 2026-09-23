// Service worker for the installable web app. The build (vite.config.ts) replaces __VERSION__ and __ASSETS__.
// Game files are cached on install so the game plays offline; the page itself is fetched fresh when online, so a new
// deploy arrives on the next launch.
const VERSION = "__VERSION__",
  CACHE = `pj-${VERSION}`,
  ASSETS = __ASSETS__;
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("pj-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  if (req.mode === "navigate") {
    // Network first for the page (fresh deploys), falling back to the cached copy offline.
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./", copy));
          return res;
        })
        .catch(() => caches.match("./", { ignoreSearch: true }).then((hit) => hit || caches.match("./index.html"))),
    );
    return;
  }
  // Everything else is content-hashed or static: cache first.
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
