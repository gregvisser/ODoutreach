/*
 * ODoutreach PWA service worker — deliberately minimal and auth-safe.
 *
 * This is an authenticated, multi-tenant app, so the worker MUST NOT cache
 * navigations, API responses, or any authenticated content (that would risk
 * serving stale or another user's data). It only caches immutable, hashed
 * static assets (/_next/static/) and the PWA icons. Everything else — every
 * navigation, every API call, every cross-origin request (e.g. the Microsoft
 * Entra sign-in redirect) — passes straight through to the network untouched.
 *
 * Its job is simply to make the app installable (a registered fetch handler)
 * while staying completely out of the way of auth and data.
 */
const CACHE = "odoutreach-static-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch cross-origin (auth, CDNs)

  const isImmutableAsset =
    url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
  if (!isImmutableAsset) return; // navigations, API, everything else → straight to network

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    }),
  );
});
