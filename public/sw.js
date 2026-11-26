const fallbackUrl = "/calendar";
function safeUrl(value) { if (typeof value !== "string" || !value || value.startsWith("//")) return fallbackUrl; try { decodeURI(value); const url = new URL(value, self.location.origin); if (url.origin !== self.location.origin || !["http:", "https:"].includes(url.protocol)) return fallbackUrl; return `${url.pathname}${url.search}${url.hash}`; } catch { return fallbackUrl; } }
function safeAssetUrl(value) { if (typeof value !== "string" || !value || value.startsWith("//")) return undefined; try { const url = new URL(value, self.location.origin); return url.origin === self.location.origin && ["http:", "https:"].includes(url.protocol) ? url.href : undefined; } catch { return undefined; } }
function safeNotificationData(data) { const result = { url: safeUrl(data && data.url) }; if (!data || typeof data !== "object" || Array.isArray(data)) return result; if (data.kind === "summary" && (data.period === "morning" || data.period === "evening") && typeof data.localDate === "string") return { ...result, kind: "summary", period: data.period, localDate: data.localDate }; if (data.kind === "event" && typeof data.eventId === "string" && data.eventId.length > 0 && data.eventId.length <= 128 && typeof data.date === "string") return { ...result, kind: "event", eventId: data.eventId, date: data.date, ...(typeof data.occurrenceKey === "string" ? { occurrenceKey: data.occurrenceKey } : {}) }; return result; }

// --- App shell cache (offline read-only) ---
// Only the application shell and static assets are cached here. API responses
// are never cached by the Service Worker: the read model for offline viewing
// is the server-confirmed IndexedDB snapshot owned by the app itself.
const APP_SHELL_CACHE = "lifehub-app-shell-v1";
const APP_SHELL_CACHE_PREFIX = "lifehub-app-shell-";
const APP_SHELL_PRECACHE_URLS = ["/", "/calendar", "/manifest.webmanifest", "/icons/app/lifehub.svg"];
const CACHEABLE_DESTINATIONS = new Set(["script", "style", "image", "font", "manifest"]);
const CACHEABLE_EXTENSIONS = [".js", ".css", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".ico", ".webmanifest", ".woff", ".woff2"];

function isCacheableAsset(request, url) {
  if (CACHEABLE_DESTINATIONS.has(request.destination)) return true;
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) return true;
  return CACHEABLE_EXTENSIONS.some((extension) => url.pathname.endsWith(extension));
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(APP_SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(fallbackUrl, response.clone());
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = (await cache.match(request, { ignoreSearch: true })) ?? (await cache.match(fallbackUrl, { ignoreSearch: true }));
    if (cached) return cached;
    throw error;
  }
}

async function staleWhileRevalidateAsset(request, event) {
  const cache = await caches.open(APP_SHELL_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request)
    .then(async (response) => {
      if (response && response.ok) await cache.put(request, response.clone());
      return response;
    })
    .catch((error) => {
      if (cached) return cached;
      throw error;
    });
  if (cached) {
    event.waitUntil(network.catch(() => undefined));
    return cached;
  }
  return network;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) => Promise.allSettled(APP_SHELL_PRECACHE_URLS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(APP_SHELL_CACHE_PREFIX) && key !== APP_SHELL_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
);
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }
  if (isCacheableAsset(request, url)) event.respondWith(staleWhileRevalidateAsset(request, event));
});
self.addEventListener("push", (event) => { if (!event.data) return; let payload; try { payload = event.data.json(); } catch { return; } if (!payload || typeof payload !== "object" || Array.isArray(payload)) return; const options = {}; if (typeof payload.body === "string") options.body = payload.body; const icon = safeAssetUrl(payload.icon) ?? safeAssetUrl("/icons/app/lifehub.svg"); const badge = safeAssetUrl(payload.badge); if (icon) options.icon = icon; if (badge) options.badge = badge; options.data = safeNotificationData(payload.data); event.waitUntil(self.registration.showNotification(typeof payload.title === "string" ? payload.title : "LifeHub", options)); });
self.addEventListener("notificationclick", (event) => { event.notification.close(); const targetUrl = safeUrl(event.notification.data && event.notification.data.url); event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => { const client = clients.find((candidate) => new URL(candidate.url).origin === self.location.origin); if (client) { const current = new URL(client.url); const currentTarget = `${current.pathname}${current.search}${current.hash}`; return "navigate" in client && currentTarget !== targetUrl ? client.navigate(targetUrl).then(() => client.focus()) : client.focus(); } return self.clients.openWindow(targetUrl); })); });
