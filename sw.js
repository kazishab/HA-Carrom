// ===================== SERVICE WORKER — KILL SWITCH =====================
// A PREVIOUS version of this file cached the app shell (app JS/CSS/HTML)
// with a cache-first strategy. During active development that turned into
// a real bug: once a phone installed it, EVERY later code fix kept being
// masked by the old cached js/board.js, js/main.js etc — no matter how many
// times the site was redeployed, that phone kept running the very first
// snapshot forever (CACHE_NAME never changed, so the browser never even
// re-fetched the shell files).
//
// This replacement does the opposite: it wipes every cache this origin has,
// unregisters itself, and forces any open tab to reload — so every visitor
// gets back to normal (always-fresh, no offline caching) automatically,
// with no manual "clear site data" steps required on their end.
//
// Once you're confident every real visitor has picked this up (a couple of
// weeks of normal traffic), you can delete this file and the
// navigator.serviceWorker.register(...) call in js/main.js entirely.
// Proper offline/PWA caching can be reintroduced later, once the app is
// feature-stable, with a cache-busting strategy (e.g. bump CACHE_NAME on
// every release, or network-first for JS/CSS/HTML and cache-only for
// static images).

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.map((n) => caches.delete(n))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: "window" }))
      .then((clients) => clients.forEach((client) => client.navigate(client.url)))
  );
});
