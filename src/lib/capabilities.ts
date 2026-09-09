export type NotificationPermissionState = NotificationPermission | "unsupported";
export type BrowserCapabilities = { serviceWorkerSupported: boolean; pushManagerSupported: boolean; notificationSupported: boolean; notificationPermission: NotificationPermissionState; standalone: boolean; homeScreenInstallRequired: boolean };

export function getBrowserCapabilities(): BrowserCapabilities {
  const browserWindow = typeof window === "undefined" ? undefined : window;
  const browserNavigator = typeof navigator === "undefined" ? undefined : navigator;
  const notificationSupported = typeof Notification !== "undefined";
  const standalone = Boolean(browserWindow?.matchMedia?.("(display-mode: standalone)").matches || Reflect.get(browserNavigator ?? {}, "standalone"));
  const appleStandaloneProperty = Boolean(browserNavigator && "standalone" in browserNavigator);
  return { serviceWorkerSupported: Boolean(browserNavigator?.serviceWorker), pushManagerSupported: Boolean(browserWindow?.PushManager), notificationSupported, notificationPermission: notificationSupported ? Notification.permission : "unsupported", standalone, homeScreenInstallRequired: appleStandaloneProperty && !standalone };
}
