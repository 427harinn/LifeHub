import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

const user = { id: "calendar-prefetch-user", email: "calendar-prefetch@example.com", displayName: "Calendar Prefetch" };
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
const responseFor = (month: string) => ({ month, range: { startDate: `${month}-01`, endDate: `${month}-28` }, events: [], money });

test("prefetches neighboring Calendar months and uses their snapshots on 390x844", async ({ page }) => {
  const requests = new Map<string, number>();
  const pending = new Map<string, Array<() => void>>();
  const holdNextRefresh = (month: string) => month === "2026-10" && (requests.get(month) ?? 0) > 1;
  const release = (month: string) => pending.get(month)?.splice(0).forEach((resolve) => resolve());

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/me") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ user }) });
    if (url.pathname === "/api/settings") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ settings }) });
    if (url.pathname === "/api/user-state") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ state: { migrationState: "active" } }) });
    if (url.pathname !== "/api/calendar") return route.fulfill({ contentType: "application/json", body: "{}" });
    const month = url.searchParams.get("month") ?? "";
    requests.set(month, (requests.get(month) ?? 0) + 1);
    if (holdNextRefresh(month)) {
      await new Promise<void>((resolve) => pending.set(month, [...(pending.get(month) ?? []), resolve]));
    }
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(responseFor(month)) });
  });

  await page.goto("/calendar");
  await expect(page.locator(".calendar-month h2")).toHaveText("2026年9月");
  await expect.poll(() => requests.get("2026-08")).toBe(1);
  await expect.poll(() => requests.get("2026-10")).toBe(1);
  await page.waitForTimeout(100);
  expect(requests.get("2026-08")).toBe(1);
  expect(requests.get("2026-10")).toBe(1);

  await page.getByRole("button", { name: "次の月" }).click();
  await expect(page.locator(".calendar-month h2")).toHaveText("2026年10月");
  await expect(page.getByText("読み込み中…")).toHaveCount(0);
  await expect.poll(() => requests.get("2026-10")).toBe(2);
  release("2026-10");

  await page.getByRole("button", { name: "前の月" }).click();
  await page.getByRole("button", { name: "前の月" }).click();
  await expect(page.locator(".calendar-month h2")).toHaveText("2026年8月");
  await expect(page.getByText("読み込み中…")).toHaveCount(0);
  expect(requests.get("2026-08")).toBe(2);
});
