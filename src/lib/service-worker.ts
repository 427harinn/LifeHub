export async function getLifeHubServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) {
    try {
      await existing.update();
    } catch {
      // Keep the active registration usable when the network is degraded.
    }
    return existing;
  }
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}
