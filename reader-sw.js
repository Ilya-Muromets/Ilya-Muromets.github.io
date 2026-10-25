// Offline support for the graded readers at /chinese/ and /german/.
//
// Each reader registers this file for its own folder:
//   navigator.serviceWorker.register("/reader-sw.js?app=german", { scope: "/german/" })
// so the two keep separate caches. Everything a reader needs (page, styles,
// every deck) is cached on the first visit. After that, site files are
// fetched network-first so edits still arrive, falling back to the cache when
// offline or when the network is slow.

const APP = new URL(self.location).searchParams.get("app");
const CACHE = "reader-" + APP + "-v1";
const PAGE = "/" + APP + "/";
const DATA = "/data/" + APP + "/";
const NETWORK_WAIT_MS = 4000;

const CORE = [
  PAGE,
  "/stylesheet.css",
  DATA + "manifest.json",
  PAGE + "manifest.webmanifest",
  PAGE + "icon-180.png",
  PAGE + "icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);
    // Decks are listed in the manifest; cache them all up front so any
    // passage opens offline, not just the ones already visited.
    const manifest = await (await cache.match(DATA + "manifest.json")).json();
    await Promise.all(manifest.decks.map((deck) =>
      cache.add("/" + deck.file).catch(() => { /* fetched again on next visit */ })
    ));
    // The first visit loads its web fonts before this worker is running, so
    // fetch them again here; otherwise offline text falls back to a system face.
    await cacheFonts(await (await cache.match(PAGE)).text()).catch(() => {});
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith("reader-" + APP + "-") && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

async function cacheFonts(html) {
  const cache = await caches.open(CACHE);
  const sheets = html.match(/https:\/\/fonts\.googleapis\.com\/css2\?[^"']+/g) || [];
  for (const raw of sheets) {
    const href = raw.replace(/&amp;/g, "&");
    const response = await fetch(href);
    if (!response.ok) continue;
    await cache.put(href, response.clone());
    const files = (await response.text()).match(/https:\/\/fonts\.gstatic\.com\/[^)'"]+/g) || [];
    await Promise.all(files.map((file) => cache.add(file).catch(() => {})));
  }
}

function networkFirst(request, key) {
  return caches.open(CACHE).then((cache) => {
    const cached = () => cache.match(key, { ignoreSearch: true });
    const network = fetch(request).then((response) => {
      if (response.ok) cache.put(key, response.clone());
      return response;
    });
    // Slow connections (station Wi-Fi) shouldn't hold the page hostage when a
    // cached copy exists.
    const timeout = new Promise((resolve) => {
      setTimeout(() => cached().then((hit) => { if (hit) resolve(hit); }), NETWORK_WAIT_MS);
    });
    return Promise.race([
      network.catch(() => cached().then((hit) => hit || Response.error())),
      timeout,
    ]);
  });
}

function cacheFirst(request) {
  return caches.open(CACHE).then((cache) =>
    cache.match(request).then((hit) => hit || fetch(request).then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    }))
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    // /german/, /german/index.html and /german/#deck/passage are one page.
    const key = request.mode === "navigate" ? PAGE : url.pathname;
    event.respondWith(networkFirst(request, key));
  } else if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(cacheFirst(request));
  }
});
