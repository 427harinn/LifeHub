import { describe, expect, it, vi } from "vitest";
import swSource from "../public/sw.js?raw";

const ORIGIN = "https://lifehub.example";

type Listener = (event: unknown) => void;

class FakeCache {
  store = new Map<string, Response>();
  constructor(private fetchFn: (input: unknown) => Promise<Response>) {}
  keyOf(input: unknown): string {
    if (typeof input === "string") return new URL(input, ORIGIN).toString();
    const url = (input as { url: string }).url;
    return url;
  }
  match(input: unknown) {
    const found = this.store.get(this.keyOf(input));
    return Promise.resolve(found ? found.clone() : undefined);
  }
  put(input: unknown, response: Response) {
    this.store.set(this.keyOf(input), response.clone());
    return Promise.resolve();
  }
  async add(url: string) {
    const response = await this.fetchFn(new URL(url, ORIGIN).toString());
    if (!response.ok) throw new Error(`precache failed: ${url}`);
    await this.put(url, response);
  }
}

const loadServiceWorker = (fetchFn: (input: unknown) => Promise<Response>) => {
  const listeners = new Map<string, Listener>();
  const cache = new FakeCache(fetchFn);
  const caches = {
    open: vi.fn(() => Promise.resolve(cache)),
    keys: vi.fn(() => Promise.resolve(["lifehub-app-shell-v1"])),
    delete: vi.fn(() => Promise.resolve(true))
  };
  const self: Record<string, unknown> = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, listener: Listener) => { listeners.set(type, listener); },
    skipWaiting: vi.fn(() => Promise.resolve()),
    clients: { claim: vi.fn(() => Promise.resolve()), matchAll: vi.fn(() => Promise.resolve([])), openWindow: vi.fn() },
    registration: { showNotification: vi.fn(() => Promise.resolve()) }
  };
  // The Service Worker source is evaluated with mocked self/caches/fetch so
  // its handlers can be exercised outside a browser.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const evaluate = new Function("self", "caches", "fetch", "URL", "console", swSource);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  evaluate(self, caches, fetchFn, URL, console);
  return { listeners, cache, caches, self };
};

const dispatchFetch = (listeners: Map<string, Listener>, request: Record<string, unknown>) => {
  let responded: Promise<Response> | undefined;
  const waits: Promise<unknown>[] = [];
  const event = {
    request,
    respondWith: (promise: Promise<Response>) => { responded = promise; },
    waitUntil: (promise: Promise<unknown>) => { waits.push(promise); }
  };
  listeners.get("fetch")?.(event);
  return { responded, waits };
};

const navigateRequest = (url: string) => ({ method: "GET", mode: "navigate", destination: "document", url });

describe("service worker app shell cache", () => {
  it("precaches the shell on install and claims clients on activate", async () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response("<html>shell</html>", { status: 200 })));
    const { listeners, cache, self } = loadServiceWorker(fetchFn);
    let installed: Promise<unknown> | undefined;
    listeners.get("install")?.({ waitUntil: (promise: Promise<unknown>) => { installed = promise; } });
    await installed;
    expect(self.skipWaiting).toHaveBeenCalled();
    expect(cache.store.has(`${ORIGIN}/calendar`)).toBe(true);
    expect(cache.store.has(`${ORIGIN}/manifest.webmanifest`)).toBe(true);
  });

  it("serves a navigation from the network and caches the shell", async () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response("<html>fresh</html>", { status: 200 })));
    const { listeners, cache } = loadServiceWorker(fetchFn);
    const { responded } = dispatchFetch(listeners, navigateRequest(`${ORIGIN}/daily?date=2026-09-24`));
    const response = await responded!;
    expect(await response.text()).toBe("<html>fresh</html>");
    expect(cache.store.has(`${ORIGIN}/calendar`)).toBe(true);
  });

  it("falls back to the cached shell for a navigation when the network fails", async () => {
    const fetchFn = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    const { listeners, cache } = loadServiceWorker(fetchFn);
    await cache.put("/calendar", new Response("<html>cached</html>", { status: 200 }));
    const { responded } = dispatchFetch(listeners, navigateRequest(`${ORIGIN}/calendar`));
    const response = await responded!;
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<html>cached</html>");
  });

  it("rejects a navigation when the network fails and nothing is cached", async () => {
    const fetchFn = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    const { listeners } = loadServiceWorker(fetchFn);
    const { responded } = dispatchFetch(listeners, navigateRequest(`${ORIGIN}/calendar`));
    await expect(responded!).rejects.toThrow("Failed to fetch");
  });

  it("never intercepts API requests or non-GET requests", () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response("{}", { status: 200 })));
    const { listeners } = loadServiceWorker(fetchFn);
    expect(dispatchFetch(listeners, navigateRequest(`${ORIGIN}/api/calendar?month=2026-09`)).responded).toBeUndefined();
    expect(dispatchFetch(listeners, { method: "POST", mode: "cors", destination: "", url: `${ORIGIN}/api/events` }).responded).toBeUndefined();
    expect(dispatchFetch(listeners, { method: "GET", mode: "cors", destination: "script", url: "https://cdn.example/app.js" }).responded).toBeUndefined();
  });

  it("serves a cached asset immediately and revalidates it in the background", async () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response("fresh-js", { status: 200 })));
    const { listeners, cache } = loadServiceWorker(fetchFn);
    await cache.put(`${ORIGIN}/assets/app-abc.js`, new Response("cached-js", { status: 200 }));
    const { responded, waits } = dispatchFetch(listeners, { method: "GET", mode: "cors", destination: "script", url: `${ORIGIN}/assets/app-abc.js` });
    const response = await responded!;
    expect(await response.text()).toBe("cached-js");
    await Promise.all(waits);
    const updated = await cache.match(`${ORIGIN}/assets/app-abc.js`);
    expect(await updated!.text()).toBe("fresh-js");
  });
});
