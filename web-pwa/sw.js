const CACHE_NAME = "sonicstream-v13";
// Precache the whole app shell so it LOADS OFFLINE. The pinned entry point is
// mobile.html (index.html redirects to it), and it pulls in manifest_fallback.js
// + config.js + settings.json — all of which must be cached or the offline
// document fetch fails and nothing loads. addAll() is all-or-nothing, so keep
// this list to files that always exist.
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./mobile.html",
  "./desktop.html",
  "./style.css",
  "./app.js",
  "./config.js",
  "./settings.json",
  "./manifest.json",
  "./manifest_fallback.js",
  "./icon.svg",
  "./favicon-mobile.svg",
  "./favicon-desktop.svg"
];

// Install Event - Cache Core Assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Add each asset individually so a single missing/renamed file can't fail
      // the whole precache (which would silently break offline loading).
      return Promise.all(STATIC_ASSETS.map((url) =>
        cache.add(url).catch((err) => console.warn("[SW] precache skip:", url, err))
      ));
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean Up Old Caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Cache-First for static, Network-First with Cache Fallback for audio/API
self.addEventListener("fetch", (event) => {
  const request = event.request;
  
  // Skip non-GET requests or browser extension requests
  if (request.method !== "GET" || !request.url.startsWith("http")) return;

  // Static Assets Cache-First Strategy
  if (request.destination === "style" || request.destination === "script" || request.destination === "document") {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Update cache in background
          fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
            }
          }).catch(() => {});
          return cachedResponse;
        }
        return fetch(request);
      })
    );
    return;
  }

  // Audio / Media Request - Network with Cache Fallback
  if (request.destination === "audio" || request.url.includes(".mp3") || request.url.includes("graph.microsoft.com")) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Default Network-First Strategy
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
