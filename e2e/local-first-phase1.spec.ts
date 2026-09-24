import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

const user = { id: "local-first-user", email: "local-first@example.com", displayName: "Local First" };
const settings = {
  userId: user.id,
  timezone: "Asia/Tokyo",
  weekStartsOn: 1,
  morningSummaryEnabled: true,
  morningSummaryTime: "09:00",
  eveningSummaryEnabled: true,
  eveningSummaryTime: "21:00",
  periodDefaultDeadlineTime: "21:00",
  lastUsedNotificationHome: { mode: "none", templateId: null, offsets: [] },
  lastUsedNotificationWork: { mode: "none", templateId: null, offsets: [] }
};

const money = { occurrences: [], summary: { expenseForecast: 0, incomeForecast: 0, remaining: 0 }, days: [] };

const installApiRoutes = async (page: import("@playwright/test").Page, kind: "calendar" | "daily", release: { promise: Promise<void>; resolve: () => void }) => {
  let dataRequests = 0;
  let settingsRequests = 0;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/me") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ user }) });
    if (url.pathname === "/api/settings") {
      settingsRequests += 1;
      if (settingsRequests > 1) await release.promise;
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ settings }) });
    }
    if (url.pathname === "/api/user-state") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ state: { migrationState: "active" } }) });
    if (kind === "calendar" && url.pathname === "/api/calendar") {
      dataRequests += 1;
      if (dataRequests > 1) await release.promise;
      const month = url.searchParams.get("month") ?? "2026-09";
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ month, range: { startDate: `${month}-01`, endDate: `${month}-28` }, events: [], money }) });
    }
    if (kind === "daily" && url.pathname === "/api/daily") {
      dataRequests += 1;
      if (dataRequests > 1) await release.promise;
      const date = url.searchParams.get("date") ?? "2026-09-24";
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ date, events: [], dailyNote: null, money }) });
    }
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({}) });
  });
  return () => dataRequests;
};

test("Calendar reuses IndexedDB snapshot before a reload refresh resolves", async ({ page }) => {
  let resolve!: () => void;
  const release = { promise: new Promise<void>((done) => { resolve = done; }), resolve };
  const requestCount = await installApiRoutes(page, "calendar", release);
  await page.goto("/calendar");
  await expect(page.locator(".calendar-grid")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".calendar-grid")).toHaveCount(1);
  await expect(page.getByText("読み込み中…")).toHaveCount(0);
  expect(requestCount()).toBeGreaterThanOrEqual(2);
  release.resolve();
});

test("Daily reuses IndexedDB snapshot before a reload refresh resolves", async ({ page }) => {
  let resolve!: () => void;
  const release = { promise: new Promise<void>((done) => { resolve = done; }), resolve };
  const requestCount = await installApiRoutes(page, "daily", release);
  await page.goto("/daily");
  await expect(page.getByRole("heading", { name: "デイリー" })).toBeVisible();
  await expect(page.getByText("読み込み中…")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "デイリー" })).toBeVisible();
  await expect(page.getByText("読み込み中…")).toHaveCount(0);
  expect(requestCount()).toBeGreaterThanOrEqual(2);
  release.resolve();
});
