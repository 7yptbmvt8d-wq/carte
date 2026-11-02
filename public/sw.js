// Service worker : app utilisable hors connexion (collection + dernières données téléchargées).
const V = "dbcol-v9";
const SHELL = ["./", "index.html", "style.css?v=9", "app.js?v=9", "manifest.webmanifest", "icons/icon.svg", "icons/icon-180.png"];

self.addEventListener("install", (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))))); self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V && k !== "dbcol-img").map((k) => caches.delete(k)))));
  self.clients.claim();
});

// Réseau d'abord, en forçant la revalidation (ignore le cache HTTP de 10 min de GitHub Pages)
const networkFirst = async (req, cache = V) => {
  const c = await caches.open(cache);
  try { const r = await fetch(req.url, { cache: "no-cache", credentials: "same-origin" }); if (r.ok) c.put(req, r.clone()); return r; }
  catch { return (await c.match(req, { ignoreSearch: req.mode === "navigate" })) || (await c.match("./")) || Response.error(); }
};
const cacheFirst = async (req, cache) => {
  const c = await caches.open(cache), hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req); if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r;
};

self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (u.hostname === "tcgplayer-cdn.tcgplayer.com") return e.respondWith(cacheFirst(e.request, "dbcol-img"));
  if (u.pathname.includes("/data/history/") && !u.pathname.endsWith("index.json")) return e.respondWith(cacheFirst(e.request, V));
  if (u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com") return e.respondWith(cacheFirst(e.request, V));
  if (u.origin === location.origin) return e.respondWith(networkFirst(e.request));
});
