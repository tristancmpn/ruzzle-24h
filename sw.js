// Cache hors-ligne. Incrementer VERSION a chaque mise en ligne.
const VERSION = "r24-v8";
const FILES = [
  "./", "index.html", "css/style.css", "js/app.js", "js/game.js", "js/sound.js", "js/online.js", "js/social.js", "words.txt",
  "manifest.webmanifest", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Reseau d'abord (mises a jour), cache si hors-ligne
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    // no-cache : revalide aupres du serveur (sinon le cache HTTP peut servir une vieille version)
    fetch(e.request.url, { cache: "no-cache", credentials: "same-origin" })
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
