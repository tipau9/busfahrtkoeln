// Offline-Speicher: App, Karte und Route funktionieren auch im Funkloch (z. B. im Gotthardtunnel).
const CACHE = "bus-koeln-v3";
const TILES = "bus-koeln-tiles";
const APP = [
  "./", "./index.html", "./style.css", "./app.js", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png"
];
const LIBS = [
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(APP);
    await Promise.all(LIBS.map(u => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE && k !== TILES).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function trimTiles(max) {
  const c = await caches.open(TILES);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Kartenkacheln: erst Speicher, dann Netz
  if (url.hostname.endsWith("tile.openstreetmap.org")) {
    e.respondWith((async () => {
      const c = await caches.open(TILES);
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        c.put(req, res.clone()).then(() => trimTiles(3000)).catch(() => {});
        return res;
      } catch (err) {
        return new Response("", { status: 504 });
      }
    })());
    return;
  }

  // Wetter und Routenserver: nur Netz (App merkt sich die Route selbst)
  if (url.hostname.includes("open-meteo.com") || url.hostname.includes("project-osrm.org")) return;

  // App-Dateien, Schriften, Leaflet: erst Netz (für Updates), im Funkloch aus dem Speicher
  e.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === "navigate" ? caches.match("./index.html") : undefined)))
  );
});
